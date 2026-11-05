// Zakładka „Realizacja" — nowy UI (docs/REALIZACJA-MVP-PLAN.md, mockup w artefakcie
// „Ignite Realizacja"; wygląd 1:1 z mockupu, style w `realizacja.css` pod `.rz`). Środek ma cztery
// widoki na całą szerokość: KOKPIT gałęzi, MACIERZ pozycji, TABLICA statusów i HARMONOGRAM (wspólny z Planowaniem).
// Drzewo gałęzi NIE siedzi tutaj — panel publikuje je przez `setBranchNav` do lewego panelu
// aplikacji (`SidebarBranchTree` pod aktywnym zamówieniem). Klik w gałąź tam = zoom tutaj.
//
// Zapisuje tylko: osie realizacji (`saveAxis`, te same reguły co „Realizacja (tabela)"),
// krótką nazwę pozycji (`WbsNode.shortName`), wpisy czatu pozycji i blokery (`Constraint`).
// Wpisy zakupów (`LeafActual`) i protokoły zostają w zakładce „Realizacja (tabela)".
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { API_URL } from '../../../config';
import { useRealizationData } from '../wbs/useRealizationData';
import { buildBranchIndex, SYNTHETIC_ROOT, PurchaseDrawer } from '../RealizationNewTab';
import {
    LEAF_TYPES, OPEN_LEAF_TYPES, TYPE_META, fmtZl, entryStatusOf, offerPriceOf,
} from '../wbs/realizationShared';
import {
    PURCHASE_STATUS_META, EXEC_STATUS_META, execStatusLabel, hasPurchaseAxis, hasExecAxis, axisGateOf,
    DEFAULT_PURCHASE_STATUS, DEFAULT_EXEC_STATUS, PLAN_STATUS_META, planStatusFromAny,
} from '../wbs/wbsConstants';
import { useWatekRealizacji } from './useWatekRealizacji';
import {
    nazwaWyswietlana, WATEK_RODZAJE, RODZAJE_BLOKERA, zbudujWatek, sygnalyWezlow, sumaSygnalow, kiedyTekst,
    dniOkna, indeksDnia, gotowoscPozycji, wykryjKolizje, BUFOR_DOSTAWY_DNI,
} from './realizacjaShared';
import Harmonogram from '../harmonogram/Harmonogram';
import { zaleznyOdMilestone } from '../harmonogram/harmonogramCzas';
import './realizacja.css';

const FOCUS_KEY = (nodeId) => `realizacja-focus-${nodeId}`;
const WIDOK_KEY = 'realizacja-widok';
const PELNE_KEY = 'realizacja-pelne-nazwy';
const SYGNALY_KEY = 'realizacja-tylko-sygnaly';
const czytaj = (k, d) => { try { return sessionStorage.getItem(k) ?? d; } catch { return d; } };
const zapisz = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* tryb prywatny */ } };

// @anchor realizacja-widoki — przełącznik widoków w nagłówku zoomu.
const WIDOKI = [['kokpit', 'Kokpit'], ['macierz', 'Macierz'], ['tablica', 'Tablica'], ['harmonogram', 'Harmonogram']];
const OS_KEY = 'realizacja-tablica-os';
const LOOKAHEAD_DNI = 14;
// @anchor realizacja-opis-paska — kolor i podpis paska robót w Harmonogramie wg osi wykonania;
// pozycje wykonane nie dają się przesuwać (plan po fakcie się nie zmienia).
const ZROBIONE_EXEC = ['DONE', 'HANDED_OVER', 'INVOICED'];
const opisPaskaRobot = (l) => {
    const wstrzymane = l.execStatus === 'ON_HOLD';
    const zrobione = ZROBIONE_EXEC.includes(l.execStatus);
    const status = execStatusLabel(l.type, l.execStatus || DEFAULT_EXEC_STATUS);
    return { klasa: wstrzymane ? 'b-hold' : zrobione ? 'b-done' : 'b-work', tekst: wstrzymane ? 'wstrzymane' : String(status || '').toLowerCase(), zablokowany: zrobione };
};
const maPasekRobot = (l) => hasExecAxis(l.type);
// @anchor realizacja-nieruchome-exec — pozycje, których przesunięcie milestone'a nie rusza (kolizja na czerwono).
const NIERUCHOME_EXEC = ['IN_PROGRESS', 'DONE', 'HANDED_OVER', 'INVOICED'];
// Dostawa = prognozowany wpis zakupu (FORECAST) pozycji z osią zakupu.
const czyDostawa = (l, e) => hasPurchaseAxis(l.type) && entryStatusOf(e) === 'FORECAST';
const DNI_TYG = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
const dzienMies = (d) => `${new Date(d).getDate()}.${String(new Date(d).getMonth() + 1).padStart(2, '0')}`;

// @anchor realizacja-droga — „droga pozycji": kolejne etapy od zamówienia do odbioru.
// Materiał i sprzęt idą przez zakup i montaż, praca i usługa — tylko przez wykonanie.
const PURCHASE_KROK = { ORDERED: 1, PARTIALLY_DELIVERED: 1, DELIVERED: 2, ISSUED: 2, INVOICED: 2 };
function drogaPozycji(node) {
    const zakup = hasPurchaseAxis(node?.type);
    const roboty = hasExecAxis(node?.type);
    const etapy = zakup
        ? ['Zamówione', 'Dostarczone', roboty ? 'Zamontowane' : null, roboty ? 'Odebrane' : null].filter(Boolean)
        : ['W toku', 'Wykonane', 'Odebrane'];
    let pelne = 0;
    let wToku = -1;
    let stop = -1;
    if (zakup) pelne = PURCHASE_KROK[node.purchaseStatus] || 0;
    if (roboty) {
        const baza = zakup ? 2 : 0;
        const e = node.execStatus;
        if (e === 'IN_PROGRESS') { if (zakup) wToku = baza; else wToku = 0; }
        if (e === 'ON_HOLD') stop = zakup ? baza : 0;
        if (e === 'DONE' || e === 'UNFINISHED') pelne = Math.max(pelne, baza + (zakup ? 1 : 2));
        if (e === 'HANDED_OVER' || e === 'INVOICED') pelne = Math.max(pelne, etapy.length);
        if (!zakup && e === 'IN_PROGRESS') pelne = Math.max(pelne, 1);
    }
    if (node.purchaseStatus === 'CANCELLED' || node.execStatus === 'CANCELLED') stop = pelne;
    return { etapy, pelne, wToku, stop };
}

// @anchor realizacja-os-etykieta — etykieta osi do podpisu pod drogą (bramka etapu albo status).
function osEtykieta(node, axis) {
    const applies = axis === 'purchase' ? hasPurchaseAxis(node?.type) : hasExecAxis(node?.type);
    if (!applies) return null;
    const gate = axisGateOf(node, axis);
    if (gate) return gate.label;
    if (axis === 'purchase') return PURCHASE_STATUS_META[node.purchaseStatus || DEFAULT_PURCHASE_STATUS]?.label;
    return execStatusLabel(node?.type, node.execStatus || DEFAULT_EXEC_STATUS);
}

// @anchor realizacja-panel — patrz nagłówek pliku.
export default function RealizacjaPanel({
    nodeId, versionId, orderName = '', userRoles = [], planLabel = '', acceptedAt = null,
    stage = null, searchQuery = '', setBranchNav,
}) {
    const isManagerOrAdmin = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
    const canEdit = userRoles.some(r => ['ADMIN', 'MANAGER', 'LOGISTYK'].includes(r));
    const canSeeMoney = canEdit;
    // Ta sama reguła co w „Realizacji (tabela)" (`realization-new-visible-types`).
    const visibleTypes = isManagerOrAdmin ? LEAF_TYPES : OPEN_LEAF_TYPES;

    const { loading, wbsNodes, actuals, saveAxis, savePlanDates, savePlanDatesBatch, actualsOf, rowOf, ownerUsers, addActual, updateActual, deleteActual } =
        useRealizationData({ nodeId, versionId, acceptedAt, isManagerOrAdmin });
    // @anchor realizacja-zakupy-api — dodawanie/edycja/usuwanie wpisów zakupu (`LeafActual`), te same
    // funkcje co szuflada w „Realizacja (tabela)" (`realization-new-purchase-drawer`).
    const zakupyApi = useMemo(() => ({ add: addActual, update: updateActual, remove: deleteActual }), [addActual, updateActual, deleteActual]);
    const { comments, tasks, protocols, constraints, wyslij, zamknijBloker, dodajBloker, zmienBloker } = useWatekRealizacji(nodeId);

    // @anchor realizacja-short-overrides — krótkie nazwy zapisane w tej sesji (bez przeładowania drzewa).
    const [shortOverrides, setShortOverrides] = useState({});
    const nodes = useMemo(() => (Object.keys(shortOverrides).length
        ? wbsNodes.map(n => (n.id in shortOverrides ? { ...n, shortName: shortOverrides[n.id] } : n))
        : wbsNodes), [wbsNodes, shortOverrides]);

    const idx = useMemo(() => buildBranchIndex(nodes, orderName, visibleTypes), [nodes, orderName, visibleTypes]);
    // @anchor realizacja-milestony — milestone'y po id (nie są ani gałęzią, ani pozycją `idx.nodeById`)
    // i nazwy wszystkiego, do czego może się odnosić wpis wątku.
    const msById = useMemo(() => Object.fromEntries(idx.milestones.map(m => [m.id, m])), [idx]);
    const nazwyWezlow = useMemo(() => ({ ...idx.nodeById, ...msById }), [idx, msById]);
    // @anchor realizacja-ms-reguly — reguły milestone'ów (M3) na CAŁYM zamówieniu, nie tylko w zoomie:
    // kto od kogo zależy i daty wszystkich pozycji; rozpoczęte, wykonane i odebrane roboty się nie ruszają.
    const msZaleznosc = useMemo(() => zaleznyOdMilestone(nodes), [nodes]);
    const msWezly = useMemo(() => Object.fromEntries(nodes.filter(n => n.planOd && n.planDo).map(n => [n.id, {
        type: n.type, name: nazwaWyswietlana(n, true), planOd: n.planOd, planDo: n.planDo,
        nieruchomy: NIERUCHOME_EXEC.includes(n.execStatus),
    }])), [nodes]);
    // Milestone'y poddrzewa gałęzi — po `branchId`, jak pozycje.
    const milestonyPoddrzewa = useCallback((id, tylkoWprost = false) => {
        if (tylkoWprost) return idx.milestones.filter(m => m.branchId === id);
        const set = new Set(idx.subtreeIds(id));
        return idx.milestones.filter(m => set.has(m.branchId));
    }, [idx]);

    const [focus, setFocusState] = useState(() => czytaj(FOCUS_KEY(nodeId), SYNTHETIC_ROOT));
    const setFocus = useCallback((id) => { setFocusState(id); zapisz(FOCUS_KEY(nodeId), id); }, [nodeId]);
    // Zapamiętana gałąź mogła zniknąć w nowej wersji — wtedy wracamy do całego zamówienia.
    const focusId = idx.nodeById[focus] && !LEAF_TYPES.includes(idx.nodeById[focus]?.type) ? focus : SYNTHETIC_ROOT;

    const [widok, setWidokState] = useState(() => {
        let v = czytaj(WIDOK_KEY, 'macierz');
        if (v === 'lookahead') v = 'harmonogram'; // dawny widok Lookahead = Harmonogram
        return WIDOKI.some(([k]) => k === v) ? v : 'macierz';
    });
    const setWidok = (v) => { setWidokState(v); zapisz(WIDOK_KEY, v); setPodglad(null); };
    const [pelne, setPelneState] = useState(() => czytaj(PELNE_KEY, '0') === '1');
    const nazwaPel = useCallback((n) => nazwaWyswietlana(n, pelne), [pelne]);
    // @anchor realizacja-tylko-sygnaly — filtr drzewa w sidebarze: tylko węzły z sygnałami.
    const [tylkoSygnaly, setTylkoSygnaly] = useState(() => czytaj(SYGNALY_KEY, '0') === '1');
    const setSygnaly = useCallback((v) => { setTylkoSygnaly(v); zapisz(SYGNALY_KEY, v ? '1' : '0'); }, []);
    const setPelne = useCallback((v) => { setPelneState(v); zapisz(PELNE_KEY, v ? '1' : '0'); }, []);
    // @anchor realizacja-podglad — pozycja wybrana w drzewie sidebaru; środek pokazuje wtedy jej podgląd
    // zamiast widoku gałęzi. Klik w gałąź albo w przełącznik widoku czyści podgląd.
    const [podglad, setPodglad] = useState(null);
    const [filtr, setFiltr] = useState('all');

    const wpisy = useMemo(() => zbudujWatek({ wbsNodes: nodes, comments, tasks, actuals, protocols, constraints }),
        [nodes, comments, tasks, actuals, protocols, constraints]);
    // @anchor realizacja-kolizje — kolizje dostaw całego zamówienia (zoom tylko filtruje).
    const kolizje = useMemo(() => wykryjKolizje({ liscie: idx.leavesOfSubtree(SYNTHETIC_ROOT), actualsOf, constraints }),
        [idx, actualsOf, constraints]);
    const sygnaly = useMemo(() => sygnalyWezlow(wpisy, kolizje), [wpisy, kolizje]);

    // Węzły poddrzewa gałęzi (gałęzie + liście) — do sumowania sygnałów i filtrowania wątku.
    const idsPoddrzewa = useCallback((id) => {
        const galezie = idx.subtreeIds(id);
        return new Set([...galezie, ...idx.leavesOfSubtree(id).map(l => l.id), ...milestonyPoddrzewa(id).map(m => m.id)]);
    }, [idx, milestonyPoddrzewa]);

    // @anchor realizacja-zapisz-short — `WbsNode.shortName`; pusty tekst = powrót do skracania.
    const zapiszShort = useCallback(async (id, wartosc) => {
        const v = String(wartosc || '').trim() || null;
        setShortOverrides(prev => ({ ...prev, [id]: v }));
        try {
            const res = await fetch(`${API_URL}/wbs-nodes/${id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ shortName: v ?? '' }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            console.error('[RealizacjaPanel] shortName:', e);
            alert('Nie udało się zapisać krótkiej nazwy');
        }
    }, []);

    // @anchor realizacja-akcje-blokera — zamknięcie blokera (Constraint albo dawny pilny wpis czatu)
    // i zamiana otwartego pytania Q&A w bloker „decyzja klienta".
    const akcje = useMemo(() => {
        const bezpiecznie = (fn, komunikat) => async (...a) => {
            try { await fn(...a); } catch (e) { console.error('[RealizacjaPanel]', e); alert(komunikat); }
        };
        return {
            zamknij: bezpiecznie((w) => (w.constraintId ? zmienBloker(w.constraintId, { status: 'CLOSED' }) : zamknijBloker(w.commentId)),
                'Nie udało się zamknąć blokera'),
            otworz: bezpiecznie((w) => zmienBloker(w.constraintId, { status: 'OPEN' }), 'Nie udało się otworzyć blokera'),
            zPytania: bezpiecznie((w) => dodajBloker({
                wbsNodeId: w.nodeId, title: w.tekst, kind: 'CLIENT', sourceType: 'QA', sourceId: w.qaId,
            }), 'Nie udało się utworzyć blokera'),
            // Kolizja dostawy → bloker materiałowy na pozycji materiału; termin = start robót,
            // wpływ = o ile dni roboty przesuną się, żeby zachować bufor dostawy.
            zKolizji: bezpiecznie((k) => dodajBloker({
                wbsNodeId: k.materialId, kind: 'MATERIAL', sourceType: 'COLLISION', sourceId: k.id,
                title: `Dostawa ${dzienMies(k.dostawa)} za późno na roboty „${nazwaWyswietlana(k.robota)}” od ${dzienMies(k.startRobot)}`,
                dueAt: k.startRobot.toISOString(), impactDays: Math.max(1, BUFOR_DOSTAWY_DNI - k.zapasDni),
            }), 'Nie udało się utworzyć blokera'),
        };
    }, [zmienBloker, zamknijBloker, dodajBloker]);

    // ── Drzewo do lewego panelu ──────────────────────────────────────────────
    // @anchor realizacja-branch-nav — gałęzie z sygnałami poddrzewa dla `SidebarBranchTree`.
    const navGalezie = useMemo(() => idx.branches.filter(b => b.id !== SYNTHETIC_ROOT).map(b => ({
        id: b.id,
        parentId: b.parentId,
        name: b.name,
        shortName: b.shortName || null,
        pozycji: idx.leavesOfSubtree(b.id).length,
        syg: sumaSygnalow(idsPoddrzewa(b.id), sygnaly),
    })), [idx, idsPoddrzewa, sygnaly]);
    // @anchor realizacja-nav-pozycje — pozycje (liście) do drzewa w sidebarze, przypięte do gałęzi.
    const navPozycje = useMemo(() => idx.leavesOfSubtree(SYNTHETIC_ROOT).map(l => ({
        id: l.id,
        parentId: l.branchId || SYNTHETIC_ROOT,
        name: l.name,
        shortName: l.shortName || null,
        typ: TYPE_META[l.type]?.label || l.type,
        syg: sumaSygnalow([l.id], sygnaly),
    })), [idx, sygnaly]);
    const navRef = useRef({});
    navRef.current = { setFocus, zapiszShort, setPelne, setSygnaly, setPodglad, idx };
    useEffect(() => {
        if (!setBranchNav) return;
        setBranchNav({
            orderId: nodeId,
            rootId: SYNTHETIC_ROOT,
            galezie: navGalezie,
            pozycje: navPozycje,
            focusId,
            selectedId: podglad || focusId,
            pelne,
            canRename: canEdit,
            onFocus: (id) => { navRef.current.setPodglad(null); navRef.current.setFocus(id); },
            onPozycja: (id) => {
                const l = navRef.current.idx.nodeById[id];
                navRef.current.setPodglad(id);
                if (l) navRef.current.setFocus(l.branchId || SYNTHETIC_ROOT);
            },
            onRename: (id, v) => navRef.current.zapiszShort(id, v),
            onPelne: (v) => navRef.current.setPelne(v),
            sygnaly: tylkoSygnaly,
            onSygnaly: (v) => navRef.current.setSygnaly(v),
        });
    }, [setBranchNav, nodeId, navGalezie, navPozycje, focusId, podglad, pelne, tylkoSygnaly, canEdit]);
    useEffect(() => () => { if (setBranchNav) setBranchNav(null); }, [setBranchNav]);

    // ── Pozycje w zoomie ─────────────────────────────────────────────────────
    const fraza = String(searchQuery || '').trim().toLowerCase();
    const liscie = useMemo(() => {
        let list = idx.leavesOfSubtree(focusId);
        if (fraza) list = list.filter(n => [n.name, n.shortName, n.owner].some(t => String(t || '').toLowerCase().includes(fraza)));
        return list;
    }, [idx, focusId, fraza]);

    // Grupy = bezpośrednie podgałęzie zoomu (+ pozycje wiszące wprost pod nim).
    // `milestony` = milestone'y gałęzi (wprost: te, które stoją bezpośrednio w gałęzi zoomu).
    const grupy = useMemo(() => {
        const dzieci = idx.childrenOf[focusId] || [];
        const out = [];
        const wprost = liscie.filter(l => l.branchId === focusId);
        const msWprost = milestonyPoddrzewa(focusId, true);
        if (wprost.length || msWprost.length) out.push({ galaz: null, liscie: wprost, milestony: msWprost });
        for (const d of dzieci) {
            const ids = new Set(idx.subtreeIds(d.id));
            const ls = liscie.filter(l => ids.has(l.branchId));
            const ms = milestonyPoddrzewa(d.id);
            if (ls.length || ms.length) out.push({ galaz: d, liscie: ls, milestony: ms });
        }
        return out;
    }, [idx, focusId, liscie, milestonyPoddrzewa]);

    // @anchor realizacja-gotowosc — gotowość każdej pozycji: materiał (sama pozycja z osią zakupu
    // albo materiał z tej samej gałęzi), otwarte pytania i blokery pozycji oraz jej gałęzi.
    const gotowosc = useCallback((l) => {
        const rodzenstwo = idx.leavesOfSubtree(l.branchId || SYNTHETIC_ROOT).filter(x => x.branchId === l.branchId);
        const material = hasPurchaseAxis(l.type) ? [l] : rodzenstwo.filter(x => hasPurchaseAxis(x.type));
        const sL = sygnaly[l.id] || {};
        const sG = sygnaly[l.branchId] || {};
        return gotowoscPozycji({
            material,
            pytOtwarte: (sL.pyt || 0) + (sG.pyt || 0),
            blokOtwarte: (sL.blok || 0) + (sG.blok || 0),
        });
    }, [idx, sygnaly]);

    const sciezka = useMemo(() => {
        const out = [];
        let id = focusId;
        const seen = new Set();
        while (id && !seen.has(id)) { seen.add(id); out.unshift(idx.nodeById[id]); id = idx.nodeById[id]?.parentId; }
        return out.filter(Boolean);
    }, [idx, focusId]);

    if (loading) {
        return (
            <div className="rz">
                <div className="empty" style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                    <Loader2 size={16} className="animate-spin" /> Wczytywanie realizacji…
                </div>
            </div>
        );
    }

    const fokus = idx.nodeById[focusId];
    const pozPodgladu = podglad && LEAF_TYPES.includes(idx.nodeById[podglad]?.type) ? idx.nodeById[podglad] : null;
    const msPodgladu = podglad && !pozPodgladu ? msById[podglad] || null : null;
    const wPodgladzie = pozPodgladu || msPodgladu;
    const sygFokus = sumaSygnalow(idsPoddrzewa(focusId), sygnaly);
    const otworzPozycje = (id) => {
        // Wpis gałęzi (czat gałęzi) = zoom na nią; pozycja = jej szczegóły w środku (`realizacja-podglad`).
        const n = idx.nodeById[id];
        if (msById[id]) { setPodglad(id); return; }
        if (LEAF_TYPES.includes(n?.type)) { setPodglad(id); setFocus(n.branchId || SYNTHETIC_ROOT); }
        else if (n) { setPodglad(null); setFocus(id); }
    };

    return (
        <div className={`rz${pelne ? ' full' : ''}`}>
            {/* ── Nagłówek zoomu ── */}
            <div className="mhead">
                <div className="crumbs">
                    {sciezka.length > 1 ? sciezka.slice(0, -1).map(n => (
                        <React.Fragment key={n.id}>
                            <button onClick={() => setFocus(n.id)} title={n.name}>
                                {n.id === SYNTHETIC_ROOT ? (orderName || 'Zamówienie') : nazwaWyswietlana(n, pelne)}
                            </button>
                            <span className="sep">›</span>
                        </React.Fragment>
                    )) : !wPodgladzie && <span>Całe zamówienie</span>}
                    {wPodgladzie && <><button onClick={() => setPodglad(null)} title="Wróć do widoku gałęzi">{focusId === SYNTHETIC_ROOT ? (orderName || 'Zamówienie') : nazwaWyswietlana(fokus, pelne)}</button><span className="sep">›</span></>}
                    {sciezka.length > 1 && <span>tu jesteś</span>}
                </div>
                <div className="mrow">
                    <span className="ttl" title={(wPodgladzie || fokus)?.name}>
                        {msPodgladu ? `◆ ${nazwaWyswietlana(msPodgladu, pelne)}` : pozPodgladu ? nazwaWyswietlana(pozPodgladu, pelne) : focusId === SYNTHETIC_ROOT ? (orderName || 'Zamówienie') : nazwaWyswietlana(fokus, pelne)}
                    </span>
                    {stage === 'REALIZACJA'
                        ? <span className="pill p-acc">REALIZACJA{planLabel ? ` · ${planLabel}` : ''}</span>
                        : <span className="pill p-mut" title="Realizację uruchamia się przyciskiem w nagłówku zamówienia, po akceptacji baseline.">realizacja nie uruchomiona</span>}
                    {stage !== 'REALIZACJA' && planLabel && <span className="pill p-ok">{planLabel}</span>}
                    {sygFokus.blok > 0 && <span className="pill p-bad">{sygFokus.blok} bloker{sygFokus.blok > 1 ? 'y' : ''}</span>}
                    {sygFokus.pyt > 0 && <span className="pill p-warn">{sygFokus.pyt} pytań otwartych</span>}
                    {sygFokus.kol > 0 && <span className="pill p-bad" title="Dostawy za blisko startu robót, bez blokera">{sygFokus.kol} kolizj{sygFokus.kol > 1 ? 'e' : 'a'} dostaw</span>}
                    <div className="mtools">
                        <label><input type="checkbox" checked={pelne} onChange={e => setPelne(e.target.checked)} /> pełne nazwy</label>
                        <span className="seg">
                            {/* @anchor realizacja-segment-pozycja — gdy otwarte są szczegóły pozycji, przełącznik pokazuje
                                aktywny segment „Pozycja”; klik w widok (np. Harmonogram) wraca do niego. */}
                            {WIDOKI.map(([k, l]) => (
                                <button key={k} onClick={() => setWidok(k)} className={!wPodgladzie && widok === k ? 'on' : ''}
                                    title={wPodgladzie && widok === k ? `Wróć do: ${l}` : undefined}>{l}</button>
                            ))}
                            {pozPodgladu && <button className="on" title="Szczegóły pozycji">Pozycja</button>}
                            {msPodgladu && <button className="on" title="Szczegóły milestone'a">Milestone</button>}
                        </span>
                    </div>
                </div>
            </div>

            <div className="mbody">
                {pozPodgladu && (() => {
                    const { r, planValue, card } = rowOf(pozPodgladu);
                    return (
                        <div className="podglad">
                            <div className="podglad-head">
                                <button className="wroc" onClick={() => setPodglad(null)} title="Wróć do poprzedniego widoku">
                                    ‹ {WIDOKI.find(([k]) => k === widok)?.[1] || 'Wróć'}
                                </button>
                                <span className="t" title={pozPodgladu.name}>{nazwaWyswietlana(pozPodgladu, pelne)}</span>
                                <span className="typ">{TYPE_META[pozPodgladu.type]?.label || pozPodgladu.type}{pozPodgladu.owner ? ` · ${pozPodgladu.owner}` : ''}</span>
                                <DrogaPasek node={pozPodgladu} />
                            </div>
                            <RozwinietaPozycja
                                key={pozPodgladu.id}
                                node={pozPodgladu} r={r} planValue={planValue} card={card} zakupyApi={zakupyApi} canEdit={canEdit} canSeeMoney={canSeeMoney}
                                wpisy={wpisy.filter(w => w.nodeId === pozPodgladu.id)}
                                saveAxis={saveAxis} zapiszShort={zapiszShort}
                                wyslij={wyslij} dodajBloker={dodajBloker} akcje={canEdit ? akcje : null}
                                ownerUsers={ownerUsers} gotowosc={gotowosc(pozPodgladu)}
                            />
                        </div>
                    );
                })()}
                {msPodgladu && (
                    <div className="podglad">
                        <div className="podglad-head">
                            <button className="wroc" onClick={() => setPodglad(null)} title="Wróć do poprzedniego widoku">
                                ‹ {WIDOKI.find(([k]) => k === widok)?.[1] || 'Wróć'}
                            </button>
                            <span className="t ms-n" title={msPodgladu.name}>◆ {nazwaWyswietlana(msPodgladu, pelne)}</span>
                            <span className="typ">Milestone · {msPodgladu.branchId === SYNTHETIC_ROOT ? (orderName || 'zamówienie') : nazwaWyswietlana(idx.nodeById[msPodgladu.branchId] || {}, pelne)}</span>
                        </div>
                        <SzczegolyMilestone
                            key={msPodgladu.id} node={msPodgladu} canEdit={canEdit}
                            wpisy={wpisy.filter(w => w.nodeId === msPodgladu.id)}
                            wyslij={wyslij} dodajBloker={dodajBloker} akcje={canEdit ? akcje : null} ownerUsers={ownerUsers}
                        />
                    </div>
                )}
                {!wPodgladzie && widok === 'kokpit' && (
                    <Kokpit
                        liscie={idx.leavesOfSubtree(focusId)} rowOf={rowOf} actualsOf={actualsOf}
                        wpisy={wpisy.filter(w => idsPoddrzewa(focusId).has(w.nodeId))}
                        protocols={protocols} sygFokus={sygFokus} canSeeMoney={canSeeMoney} canEdit={canEdit}
                        nodeById={nazwyWezlow} pelne={pelne} filtr={filtr} setFiltr={setFiltr}
                        onOtworz={otworzPozycje} akcje={akcje} gotowosc={gotowosc}
                        kolizje={kolizje.filter(k => idsPoddrzewa(focusId).has(k.materialId))}
                    />
                )}
                {!wPodgladzie && widok === 'macierz' && (
                    <Macierz
                        grupy={grupy} rowOf={rowOf} actualsOf={actualsOf} sygnaly={sygnaly}
                        pelne={pelne} canSeeMoney={canSeeMoney}
                        onOtworz={otworzPozycje} onZoom={setFocus}
                    />
                )}
                {!wPodgladzie && widok === 'tablica' && (
                    <Tablica
                        grupy={grupy} actualsOf={actualsOf} sygnaly={sygnaly} pelne={pelne} canEdit={canEdit}
                        saveAxis={saveAxis} onZoom={setFocus} onOtworz={otworzPozycje}
                    />
                )}
                {!wPodgladzie && widok === 'harmonogram' && (
                    <Harmonogram
                        grupy={grupy} nazwa={nazwaPel} maPasek={maPasekRobot} opisPaska={opisPaskaRobot}
                        actualsOf={actualsOf} czyDostawa={czyDostawa} gotowosc={gotowosc} GotowoscChipy={GotowoscChipy}
                        kolizje={kolizje} canEdit={canEdit} savePlanDates={savePlanDates}
                        msZaleznosc={msZaleznosc} msWezly={msWezly} savePlanDatesBatch={savePlanDatesBatch}
                        onZoom={setFocus} onOtworz={otworzPozycje}
                        domyslnyZakres="14" zakresKey="realizacja-harmonogram-zakres"
                    />
                )}
            </div>
        </div>
    );
}

// ─── Wspólne ─────────────────────────────────────────────────────────────────

// @anchor realizacja-droga-pasek — pasek drogi pozycji + podpis osi.
function DrogaPasek({ node }) {
    const { etapy, pelne, wToku, stop } = drogaPozycji(node);
    const podpis = [osEtykieta(node, 'purchase'), osEtykieta(node, 'exec')].filter(Boolean).join(' · ');
    return (
        <div title={etapy.map((e, i) => `${i < pelne ? '✓' : '·'} ${e}`).join('\n')}>
            <div className="pipe">
                {etapy.map((e, i) => (
                    <i key={e} className={i < pelne ? 'f' : i === stop ? 'x' : i === wToku ? 'h' : ''} />
                ))}
            </div>
            <div className="pipe-l">{podpis}</div>
        </div>
    );
}

// @anchor realizacja-sygnaly-cell — liczniki sygnałów pozycji.
function SygnalyCell({ s }) {
    if (!s) return <span className="muted">—</span>;
    return (
        <div className="sigcell">
            {s.blok > 0 && <span className="cnt c-bad">{s.blok} bloker</span>}
            {s.kol > 0 && <span className="cnt c-bad" title="Dostawa za blisko startu robót w gałęzi">kolizja</span>}
            {s.pyt > 0 && <span className="cnt c-warn">{s.pyt} pyt.</span>}
            {s.czat > 0 && <span className="cnt c-info">{s.czat} czat</span>}
            {s.zad > 0 && <span className={`cnt ${s.poTerminie ? 'c-bad' : 'c-info'}`}>{s.zad} zad.{s.poTerminie ? ' !' : ''}</span>}
        </div>
    );
}

// @anchor realizacja-gotowosc-chipy — chipy MAT / PYT / BLK (zielone = gotowe, żółte = czeka, czerwone = brak).
const GOT_KLASA = { ok: 'r-ok', q: 'r-q', no: 'r-no', na: 'r-na' };
const GOT_OPIS = { ok: 'gotowe', q: 'czeka', no: 'brak', na: 'nie dotyczy' };
function GotowoscChipy({ g }) {
    if (!g) return <span className="muted">—</span>;
    return (
        <span className="ready">
            <span className={GOT_KLASA[g.mat]} title={`Materiał: ${GOT_OPIS[g.mat]}`}>MAT</span>
            <span className={GOT_KLASA[g.pyt]} title={`Pytania: ${g.pyt === 'ok' ? 'brak otwartych' : 'są otwarte'}`}>PYT</span>
            <span className={GOT_KLASA[g.blk]} title={`Blokery: ${g.blk === 'ok' ? 'brak' : 'są otwarte'}`}>BLK</span>
        </span>
    );
}

// @anchor realizacja-wpis — jeden wpis wątku (czat, bloker, pytanie, zakup, zadanie, odbiór).
function Wpis({ w, nazwaPozycji, onPozycja, akcje }) {
    const r = WATEK_RODZAJE[w.rodzaj];
    const blokerKonstr = w.rodzaj === 'block' && w.constraintId;
    return (
        <div className="ev">
            <span className={`ik ${r.cls}`}>{r.znak}</span>
            <div style={{ minWidth: 0 }}>
                <div className="who">
                    {w.kto && <b>{w.kto}</b>}
                    {w.kiedy && <span>{kiedyTekst(w.kiedy)}</span>}
                    {nazwaPozycji && <button className="lnk" onClick={onPozycja}>{nazwaPozycji}</button>}
                    {blokerKonstr && <span className="cnt c-mut">{RODZAJE_BLOKERA[w.rodzajBlokera]?.label || w.rodzajBlokera}</span>}
                    {blokerKonstr && w.termin && <span className={w.poTerminie ? 'dpos' : ''}>termin {dzienMies(w.termin)}{w.poTerminie ? ' — minął' : ''}</span>}
                    {blokerKonstr && w.wplywDni ? <span>wpływ +{w.wplywDni} dni</span> : null}
                    {w.mail && <span className="mono">{w.mail}</span>}
                    {w.prognoza && <span className="p-info">prognoza</span>}
                    {w.otwarte && (w.rodzaj === 'block' || w.rodzaj === 'qa') && <span className={`pill ${w.rodzaj === 'qa' ? 'p-org' : 'p-bad'}`} style={{ padding: '0 6px' }}>otwarte</span>}
                    {w.zamkniety && <span className="p-ok">zamknięty</span>}
                    {w.blokerem && <span className="cnt c-bad">bloker</span>}
                    {akcje && (
                        <span className="act">
                            {w.rodzaj === 'block' && w.otwarte && (
                                <button className="mini-btn ok" onClick={() => akcje.zamknij(w)} title="Przeszkoda usunięta — czerwony licznik zgaśnie">rozwiązane</button>
                            )}
                            {blokerKonstr && !w.otwarte && (
                                <button className="mini-btn" onClick={() => akcje.otworz(w)}>otwórz ponownie</button>
                            )}
                            {w.rodzaj === 'qa' && w.otwarte && !w.blokerem && w.qaId && (
                                <button className="mini-btn bad" onClick={() => akcje.zPytania(w)} title="Bez odpowiedzi nie ruszymy — pytanie staje się blokerem „decyzja klienta”">Ustaw bloker</button>
                            )}
                        </span>
                    )}
                </div>
                <div className="txt">{w.tekst}</div>
                {w.notatka && <div className="muted" style={{ fontSize: 12 }}>{w.notatka}</div>}
                {w.odpowiedz && <div className="ans">{w.odpowiedz}</div>}
            </div>
        </div>
    );
}

// @anchor realizacja-filtry-watku — chipy rodzajów nad wątkiem.
function FiltryWatku({ wpisy, filtr, setFiltr }) {
    const klucze = ['all', ...Object.keys(WATEK_RODZAJE)];
    return (
        <div className="chips">
            {klucze.map(k => {
                const n = k === 'all' ? wpisy.length : wpisy.filter(w => w.rodzaj === k).length;
                return (
                    <button key={k} onClick={() => setFiltr(k)} className={`chip${filtr === k ? ' on' : ''}`}>
                        {k === 'all' ? 'Wszystko' : WATEK_RODZAJE[k].label} <span className="mono">{n}</span>
                    </button>
                );
            })}
        </div>
    );
}

const Karta = ({ tytul, prawa, children, style }) => (
    <div className="card" style={style}>
        <header>{tytul}{prawa && <span className="r">{prawa}</span>}</header>
        {children}
    </div>
);

// @anchor realizacja-szerokosci-kolumn — szerokości trzech kart szczegółów pozycji (wątek · zakupy ·
// blokery) w procentach; przeciągane uchwytem między kartami, zapamiętane w localStorage przeglądarki.
const KOLUMNY_KEY = 'realizacja-szczegoly-kolumny';
const KOLUMNY_DOMYSLNE = [28, 47, 25];
const KOLUMNA_MIN = 12;
function useSzerokosciKolumn() {
    const [k, setK] = useState(() => {
        try {
            const v = JSON.parse(localStorage.getItem(KOLUMNY_KEY));
            if (Array.isArray(v) && v.length === 3 && v.every(x => Number.isFinite(x) && x >= KOLUMNA_MIN)) return v;
        } catch { /* brak albo zepsuty wpis */ }
        return KOLUMNY_DOMYSLNE;
    });
    const kRef = useRef(k);
    kRef.current = k;
    // i = uchwyt między kolumną i a i+1; przesuwa granicę, suma zostaje 100.
    const zacznij = useCallback((e, i, kontener) => {
        if (e.button !== 0 || !kontener) return;
        e.preventDefault();
        const szer = kontener.getBoundingClientRect().width || 1;
        const x0 = e.clientX;
        const start = kRef.current;
        const ruch = (ev) => {
            const d = (ev.clientX - x0) / szer * 100;
            const para = start[i] + start[i + 1];
            const a = Math.min(para - KOLUMNA_MIN, Math.max(KOLUMNA_MIN, start[i] + d));
            const n = [...start];
            n[i] = Math.round(a * 10) / 10;
            n[i + 1] = Math.round((para - a) * 10) / 10;
            setK(n);
        };
        const pusc = () => {
            window.removeEventListener('pointermove', ruch);
            window.removeEventListener('pointerup', pusc);
            try { localStorage.setItem(KOLUMNY_KEY, JSON.stringify(kRef.current)); } catch { /* tryb prywatny */ }
        };
        window.addEventListener('pointermove', ruch);
        window.addEventListener('pointerup', pusc);
    }, []);
    const resetuj = useCallback(() => {
        setK(KOLUMNY_DOMYSLNE);
        try { localStorage.removeItem(KOLUMNY_KEY); } catch { /* tryb prywatny */ }
    }, []);
    return { k, zacznij, resetuj };
}

// @anchor realizacja-trzy-kolumny — stały układ szczegółów gałęzi i pozycji: wątek (lewa) · środek ·
// blokery (prawa). Te same zapamiętane szerokości w Kokpicie i w szczegółach pozycji.
function TrzyKolumny({ lewa, srodek, prawa }) {
    const { k, zacznij, resetuj } = useSzerokosciKolumn();
    const ref = useRef(null);
    const uchwyt = (i) => (
        <div className="kol-uchwyt" title="Przeciągnij, by zmienić szerokość · dwuklik = domyślne"
            onPointerDown={e => zacznij(e, i, ref.current)} onDoubleClick={resetuj} />
    );
    return (
        <div className="expin rs" ref={ref}
            style={{ gridTemplateColumns: `minmax(0, ${k[0]}fr) 8px minmax(0, ${k[1]}fr) 8px minmax(0, ${k[2]}fr)` }}>
            <div className="stack">{lewa}</div>
            {uchwyt(0)}
            <div className="stack">{srodek}</div>
            {uchwyt(1)}
            <div className="stack">{prawa}</div>
        </div>
    );
}

// @anchor realizacja-pole-czatu — pole odpowiedzi w wątku z oznaczaniem osób przez „@": lista
// członków zespołu zamówienia (`ownerUsers`), strzałki + Enter/Tab wybierają, Esc zamyka.
// Do wysyłki idą tylko osoby, których „@Imię Nazwisko" nadal stoi w tekście.
const nazwaOsoby = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '';
function PoleCzatu({ uzytkownicy = [], onWyslij, placeholder }) {
    const [tekst, setTekst] = useState('');
    const [wysylam, setWysylam] = useState(false);
    const [oznaczeni, setOznaczeni] = useState([]);
    const [fraza, setFraza] = useState(null);
    const [kotwica, setKotwica] = useState(0);
    const [idx, setIdx] = useState(0);
    const ref = useRef(null);

    const podpowiedzi = fraza === null ? [] : uzytkownicy
        .filter(u => nazwaOsoby(u).toLowerCase().includes(fraza.toLowerCase()) && !oznaczeni.some(o => o.id === u.id))
        .slice(0, 8);

    const zmiana = (e) => {
        const v = e.target.value;
        setTekst(v);
        const przed = v.slice(0, e.target.selectionStart);
        const m = przed.match(/(?:^|\s)@([\p{L}\d_.-]*)$/u);
        if (m) { setFraza(m[1]); setKotwica(przed.lastIndexOf('@')); setIdx(0); } else setFraza(null);
    };
    const wstaw = (u) => {
        const nazwa = nazwaOsoby(u);
        const przed = tekst.slice(0, kotwica);
        const po = tekst.slice(kotwica + 1 + (fraza?.length || 0));
        const nowy = `${przed}@${nazwa} ${po.replace(/^\s+/, '')}`;
        setTekst(nowy);
        setOznaczeni(prev => [...prev, { id: u.id, nazwa }]);
        setFraza(null);
        setTimeout(() => { const p = przed.length + nazwa.length + 2; ref.current?.focus(); ref.current?.setSelectionRange(p, p); }, 0);
    };
    const wyslij = async () => {
        const t = tekst.trim();
        if (!t || wysylam) return;
        setWysylam(true);
        try {
            await onWyslij(t, oznaczeni.filter(o => t.includes(`@${o.nazwa}`)).map(o => o.id));
            setTekst(''); setOznaczeni([]); setFraza(null);
        } catch { alert('Nie udało się wysłać wpisu'); }
        finally { setWysylam(false); }
    };
    const klawisz = (e) => {
        if (podpowiedzi.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, podpowiedzi.length - 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); wstaw(podpowiedzi[idx]); return; }
        }
        if (e.key === 'Escape') { setFraza(null); return; }
        if (e.key === 'Enter') wyslij();
    };
    return (
        <div className="reply" style={{ position: 'relative' }}>
            {podpowiedzi.length > 0 && (
                <div className="mention-menu">
                    {podpowiedzi.map((u, i) => (
                        <button key={u.id} className={i === idx ? 'on' : ''} onMouseDown={e => { e.preventDefault(); wstaw(u); }}>
                            <b>{nazwaOsoby(u)}</b>{u.email && nazwaOsoby(u) !== u.email ? <span className="muted"> {u.email}</span> : null}
                        </button>
                    ))}
                </div>
            )}
            <input ref={ref} className="in" value={tekst} onChange={zmiana} onKeyDown={klawisz}
                onBlur={() => setTimeout(() => setFraza(null), 150)} placeholder={placeholder} />
            <button className="btn" onClick={wyslij} disabled={!tekst.trim() || wysylam}>Wyślij</button>
        </div>
    );
}

const Pusto = ({ children }) => <div className="ev"><span /><div className="muted">{children}</div></div>;

// @anchor realizacja-bloker-form — nowy bloker na pozycji: opis, rodzaj, termin usunięcia,
// wpływ w dniach i właściciel (konto z zespołu zamówienia).
function BlokerForm({ wbsNodeId, dodajBloker, ownerUsers = [] }) {
    const pusty = { title: '', kind: 'MATERIAL', dueAt: '', impactDays: '', ownerId: '' };
    const [f, setF] = useState(pusty);
    const [zapis, setZapis] = useState(false);
    const ustaw = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));
    const dodaj = async () => {
        if (!f.title.trim() || zapis) return;
        setZapis(true);
        try {
            await dodajBloker({
                wbsNodeId, title: f.title.trim(), kind: f.kind, dueAt: f.dueAt || null,
                impactDays: f.impactDays === '' ? null : Number(f.impactDays), ownerId: f.ownerId || null,
            });
            setF(pusty);
        } catch { alert('Nie udało się dodać blokera'); }
        finally { setZapis(false); }
    };
    return (
        <div className="blkform">
            <input className="in full" value={f.title} onChange={ustaw('title')} placeholder="Co blokuje? np. brak zgody ZDM na zajęcie pasa"
                onKeyDown={e => { if (e.key === 'Enter') dodaj(); }} />
            <select className="in" value={f.kind} onChange={ustaw('kind')} title="Rodzaj blokera">
                {Object.entries(RODZAJE_BLOKERA).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <input className="in" type="date" value={f.dueAt} onChange={ustaw('dueAt')} title="Termin usunięcia" />
            <div className="row2">
                <select className="in" value={f.ownerId} onChange={ustaw('ownerId')} title="Kto usuwa przeszkodę" style={{ flex: 1 }}>
                    <option value="">właściciel —</option>
                    {ownerUsers.map(u => <option key={u.id} value={u.id}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}</option>)}
                </select>
                <input className="in" type="number" min="0" value={f.impactDays} onChange={ustaw('impactDays')} placeholder="wpływ, dni" title="O ile dni przesunie roboty" style={{ width: 96, flex: 'none' }} />
                <button className="btn acc" onClick={dodaj} disabled={!f.title.trim() || zapis}>Dodaj bloker</button>
            </div>
        </div>
    );
}

// ─── Milestone'y ─────────────────────────────────────────────────────────────

const zakresMs = (m) => {
    if (!m?.planOd) return 'bez daty';
    const od = new Date(m.planOd), ost = new Date(m.planDo || m.planOd);
    return od.toDateString() === ost.toDateString() ? dzienMies(od) : `${dzienMies(od)}–${dzienMies(ost)}`;
};

// @anchor realizacja-milestony-chipy — milestone'y gałęzi w jej wierszu (Macierz); klik = szczegóły.
function MilestonyChipy({ milestony = [], pelne, onOtworz }) {
    if (!milestony.length) return null;
    return (
        <span className="ms-chipy">
            {milestony.map(m => (
                <button key={m.id} className="ms-chip" onClick={e => { e.stopPropagation(); onOtworz(m.id); }} title={`${m.name} — szczegóły milestone'a`}>
                    ◆ {nazwaWyswietlana(m, pelne)} <span className="mono">{zakresMs(m)}</span>
                </button>
            ))}
        </span>
    );
}

// @anchor realizacja-szczegoly-milestone — szczegóły milestone'a: wątek (czat z @wzmiankami) · termin,
// status i pytania Q&A · blokery z formularzem. Daty zmienia się na Harmonogramie.
function SzczegolyMilestone({ node, canEdit, wpisy, wyslij, dodajBloker, akcje, ownerUsers }) {
    const pytania = wpisy.filter(w => w.rodzaj === 'qa');
    const blokery = wpisy.filter(w => w.rodzaj === 'block' && w.otwarte);
    const watek = wpisy.filter(w => !(w.rodzaj === 'block' && w.constraintId) && w.rodzaj !== 'qa');
    const zadania = wpisy.filter(w => w.rodzaj === 'task');
    const status = PLAN_STATUS_META[planStatusFromAny(node.status)]?.label || '—';
    return (
        <TrzyKolumny
            lewa={
                <Karta tytul="Wątek milestone'a" prawa={`${watek.length} wpisów`}>
                    <div className="feed scroll" style={{ maxHeight: 320 }}>
                        {watek.length ? watek.map(w => <Wpis key={w.id} w={w} akcje={akcje} />)
                            : <Pusto>Brak wpisów — pierwszy dodasz poniżej.</Pusto>}
                    </div>
                    <PoleCzatu uzytkownicy={ownerUsers} placeholder="Napisz do czatu milestone'a… (@ oznacza osobę)"
                        onWyslij={(t, ids) => wyslij(node.id, t, false, ids)} />
                </Karta>
            }
            srodek={
                <Karta tytul="Milestone" prawa={zakresMs(node)}>
                    <div className="mini">
                        <Wiersz l="Termin" v={zakresMs(node)} />
                        <Wiersz l="Status" v={status} />
                        <Wiersz l="Zadania otwarte" v={zadania.filter(z => z.otwarte).length + (zadania.some(z => z.poTerminie) ? ' · po terminie' : '')} />
                        <Wiersz l="Odpowiedzialny" v={node.owner || '—'} />
                        <div className="muted" style={{ fontSize: 12 }}>Termin zmieniasz na Harmonogramie (przeciągnij romb) albo w strukturze WBS.</div>
                    </div>
                    <div className="feed" style={{ borderTop: '1px solid var(--line)' }}>
                        {pytania.length ? pytania.map(w => <Wpis key={w.id} w={w} akcje={akcje} />) : <Pusto>Brak pytań Q&A przy tym milestonie.</Pusto>}
                    </div>
                </Karta>
            }
            prawa={
                <Karta tytul="Blokery" prawa={blokery.length ? `${blokery.length} otwarte` : null}>
                    <div className="feed">
                        {blokery.length ? blokery.map(w => <Wpis key={w.id} w={w} akcje={akcje} />) : <Pusto>Nic nie blokuje tego milestone'a.</Pusto>}
                    </div>
                    {canEdit && <BlokerForm wbsNodeId={node.id} dodajBloker={dodajBloker} ownerUsers={ownerUsers} />}
                </Karta>
            }
        />
    );
}

// ─── Macierz ─────────────────────────────────────────────────────────────────

// @anchor realizacja-macierz — wiersz = pozycja; klik rozwija wątek, osie i powiązania.
// Gałąź = tylko dane sumaryczne; klik w wiersz otwiera szczegóły pozycji w środku (`realizacja-podglad`).
function Macierz({ grupy, rowOf, actualsOf, sygnaly, pelne, canSeeMoney, onOtworz, onZoom }) {
    const kolumn = canSeeMoney ? 8 : 5;
    if (!grupy.length) return <div className="empty">Brak pozycji w tej gałęzi.</div>;
    return (
        <table>
            <thead>
                <tr>
                    <th>Pozycja</th>
                    <th>Droga pozycji</th>
                    {canSeeMoney && <th className="num">Plan</th>}
                    {canSeeMoney && <th className="num">Real.</th>}
                    {canSeeMoney && <th className="num">Różn.</th>}
                    <th>Terminy</th>
                    <th>Sygnały</th>
                    <th />
                </tr>
            </thead>
            <tbody>
                {grupy.map(({ galaz, liscie, milestony = [] }) => (
                    <React.Fragment key={galaz?.id || '_wprost'}>
                        {!galaz && milestony.length > 0 && (
                            <tr className="grp">
                                <td colSpan={kolumn}>
                                    <span>Ta gałąź</span>
                                    <MilestonyChipy milestony={milestony} pelne={pelne} onOtworz={onOtworz} />
                                </td>
                            </tr>
                        )}
                        {galaz && (
                            <tr className="grp">
                                <td colSpan={kolumn} title={galaz.name}>
                                    <button onClick={() => onZoom(galaz.id)} title={`${galaz.name} — pokaż tylko tę gałąź`}>{nazwaWyswietlana(galaz, pelne)}</button>
                                    <span className="mono" style={{ fontWeight: 400 }}> · {liscie.length} poz.{canSeeMoney ? ` · ${fmtZl(liscie.reduce((s, l) => s + rowOf(l).planValue, 0))} zł` : ''}</span>
                                    <MilestonyChipy milestony={milestony} pelne={pelne} onOtworz={onOtworz} />
                                </td>
                            </tr>
                        )}
                        {liscie.map(l => {
                            const { r, planValue } = rowOf(l);
                            const roznica = r.value ? r.value - planValue : 0;
                            const prognozy = actualsOf(l).filter(e => entryStatusOf(e) === 'FORECAST' && e.entryDate).map(e => new Date(e.entryDate)).sort((a, b) => a - b);
                            return (
                                <React.Fragment key={l.id}>
                                    <tr onClick={() => onOtworz(l.id)} className="row" title="Pokaż szczegóły pozycji">
                                        <td className="nm-cell">
                                            <span className="t" title={l.name}>{nazwaWyswietlana(l, pelne)}</span>
                                            <span className="typ">{TYPE_META[l.type]?.label || l.type}{l.owner ? ` · ${l.owner}` : ''}</span>
                                        </td>
                                        <td><DrogaPasek node={l} /></td>
                                        {canSeeMoney && <td className="num">{fmtZl(planValue)}</td>}
                                        {canSeeMoney && <td className="num">{r.value ? fmtZl(r.value) : '—'}</td>}
                                        {canSeeMoney && <td className="num" style={{ fontSize: 12 }}>
                                            {r.value ? <span className={roznica > 0.005 ? 'dpos' : roznica < -0.005 ? 'dneg' : 'muted'}>{roznica > 0 ? '+' : ''}{fmtZl(roznica)}</span> : <span className="muted">—</span>}
                                        </td>}
                                        <td className="mono" style={{ fontSize: 12 }}>
                                            {prognozy[0] && (hasPurchaseAxis(l.type)
                                                ? <div title="Przewidywana dostawa — data z wpisu prognozowanego (FORECAST)">dost. {dzienMies(prognozy[0])}</div>
                                                : <div title="Data kosztu prognozowanego (FORECAST) — to nie dostawa materiału">progn. {dzienMies(prognozy[0])}</div>)}
                                            {l.planOd && <div title="Start z harmonogramu (Gantt)">rob. {dzienMies(l.planOd)}</div>}
                                        </td>
                                        <td><SygnalyCell s={sygnaly[l.id]} /></td>
                                        <td className="muted" style={{ fontSize: 12 }}>›</td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </React.Fragment>
                ))}
            </tbody>
        </table>
    );
}

// @anchor realizacja-rozwinieta-pozycja — trzy karty pod wierszem: wątek · zakup i realizacja · blokery i powiązania.
function RozwinietaPozycja({ node, r, planValue, card, zakupyApi, canEdit, canSeeMoney, wpisy, saveAxis, zapiszShort, wyslij, dodajBloker, akcje, ownerUsers, gotowosc }) {
    const [short, setShort] = useState(node.shortName || '');
    const zadania = wpisy.filter(w => w.rodzaj === 'task');
    const pytania = wpisy.filter(w => w.rodzaj === 'qa');
    const blokery = wpisy.filter(w => w.rodzaj === 'block' && w.otwarte);
    const watek = wpisy.filter(w => !(w.rodzaj === 'block' && w.constraintId));

    return (
        <TrzyKolumny
            lewa={
            <Karta tytul="Wątek pozycji" prawa={`${watek.length} wpisów`}>
                <div className="feed scroll" style={{ maxHeight: 320 }}>
                    {watek.length ? watek.map(w => <Wpis key={w.id} w={w} akcje={akcje} />)
                        : <Pusto>Brak wpisów — pierwszy dodasz poniżej.</Pusto>}
                </div>
                <PoleCzatu uzytkownicy={ownerUsers} placeholder="Napisz do czatu pozycji… (@ oznacza osobę)"
                    onWyslij={(t, ids) => wyslij(node.id, t, false, ids)} />
            </Karta>

            }
            srodek={
            <Karta tytul={hasPurchaseAxis(node.type) ? 'Zakupy' : 'Wykonanie'}>
                <div className="mini">
                    {hasPurchaseAxis(node.type) && <OsWybor node={node} axis="purchase" readOnly={!canEdit} saveAxis={saveAxis} />}
                    {hasExecAxis(node.type) && <OsWybor node={node} axis="exec" readOnly={!canEdit} saveAxis={saveAxis} />}
                    {canSeeMoney && (
                        <>
                            <Wiersz l="Plan" v={`${fmtZl(planValue)} zł`} />
                            <Wiersz l="Poniesione planowo" v={`${fmtZl(r.byStatus.PLANNED)} zł`} />
                            <Wiersz l="Pozaplanowo" v={`${fmtZl(r.byStatus.UNPLANNED)} zł`} />
                            <Wiersz l="Prognoza" v={`${fmtZl(r.byStatus.FORECAST)} zł`} />
                        </>
                    )}
                    <Wiersz l="Ilość" v={`${r.qty} z ${r.plan} ${node.unit || ''}`} />
                    <div className="r"><span>Gotowość do robót</span><GotowoscChipy g={gotowosc} /></div>
                    <div className="r"><span>Pełna nazwa</span></div>
                    <div className="muted" style={{ fontSize: 12 }}>{node.name}</div>
                </div>
                {/* @anchor realizacja-szuflada-zakupow — wpisy zakupu/wykonania pozycji: lista edytowalna
                    w miejscu + przycisk dodania, ten sam komponent co w „Realizacja (tabela)". */}
                {zakupyApi && (
                    <div className="rn-fluid zakupy-pozycji">
                        <PurchaseDrawer node={node} card={card} r={r} planValue={planValue} readOnly={!canEdit}
                            onAdd={draft => zakupyApi.add(node, draft)}
                            onUpdate={zakupyApi.update} onDelete={zakupyApi.remove} />
                    </div>
                )}
            </Karta>
            }
            prawa={

            <Karta tytul="Blokery i powiązania" prawa={blokery.length ? `${blokery.length} otwarte` : null}>
                <div className="feed">
                    {blokery.length ? blokery.map(w => <Wpis key={w.id} w={w} akcje={akcje} />) : <Pusto>Nic nie blokuje tej pozycji.</Pusto>}
                </div>
                {canEdit && <BlokerForm wbsNodeId={node.id} dodajBloker={dodajBloker} ownerUsers={ownerUsers} />}
                <div className="mini" style={{ borderTop: '1px solid var(--line)' }}>
                    <Wiersz l="Zadania otwarte" v={zadania.filter(z => z.otwarte).length + (zadania.some(z => z.poTerminie) ? ' · po terminie' : '')} />
                    <Wiersz l="Pytania bez odpowiedzi" v={pytania.filter(p => p.otwarte).length} />
                    <Wiersz l="Odpowiedzialny" v={node.owner || '—'} />
                    <div>
                        <div className="lab">Krótka nazwa</div>
                        <input className="in" style={{ width: '100%' }} value={short} onChange={e => setShort(e.target.value)} disabled={!canEdit}
                            onBlur={() => { if ((short.trim() || null) !== (node.shortName || null)) zapiszShort(node.id, short); }}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            placeholder={nazwaWyswietlana({ name: node.name })} />
                    </div>
                </div>
            </Karta>
            }
        />
    );
}

const Wiersz = ({ l, v }) => (
    <div className="r"><span>{l}</span><b className="mono" style={{ fontWeight: 500 }}>{v}</b></div>
);

// @anchor realizacja-os-wybor — oś realizacji jako lista; bramka etapu = tylko podpis.
function OsWybor({ node, axis, readOnly, saveAxis }) {
    const pole = axis === 'purchase' ? 'purchaseStatus' : 'execStatus';
    const meta = axis === 'purchase' ? PURCHASE_STATUS_META : EXEC_STATUS_META;
    const gate = axisGateOf(node, axis);
    const wartosc = node[pole] || (axis === 'purchase' ? DEFAULT_PURCHASE_STATUS : DEFAULT_EXEC_STATUS);
    return (
        <div className="r">
            <span>{axis === 'purchase' ? 'Status zakupu' : (hasPurchaseAxis(node.type) ? 'Montaż' : 'Status robót')}</span>
            {gate ? <span title={gate.title} className="muted" style={{ fontStyle: 'italic' }}>{gate.label}</span> : (
                <select className="in" value={wartosc} disabled={readOnly} onChange={e => saveAxis(node, pole, e.target.value)}>
                    {Object.entries(meta).filter(([k]) => axis === 'purchase' || k !== 'HANDED_OVER' || wartosc === 'HANDED_OVER').map(([k, m]) => (
                        <option key={k} value={k}>{axis === 'exec' ? execStatusLabel(node.type, k) : m.label}</option>
                    ))}
                </select>
            )}
        </div>
    );
}

// ─── Kokpit ──────────────────────────────────────────────────────────────────

// @anchor realizacja-kokpit — KPI gałęzi, blokery i decyzje, najbliższe 14 dni z gotowością, wątek gałęzi.
function Kokpit({ liscie, rowOf, actualsOf, wpisy, protocols, sygFokus, canSeeMoney, canEdit, nodeById, pelne, filtr, setFiltr, onOtworz, akcje, gotowosc, kolizje = [] }) {
    const k = useMemo(() => {
        // @anchor realizacja-kokpit-wynik — przychód z oferty (`offerPriceOf`, ta sama formuła co Budżet),
        // zysk planowany = przychód − koszt planowany; prognoza zysku liczy koszt każdej pozycji jako
        // większy z planu i poniesionego (z prognozą) — przekroczenie obniża wynik, oszczędność nie.
        let plan = 0, real = 0, prognoza = 0, wykonane = 0, przychod = 0, kosztOczek = 0;
        const roots = new Set();
        for (const l of liscie) {
            const { r, planValue } = rowOf(l);
            plan += planValue; real += r.value; prognoza += r.byStatus.FORECAST;
            przychod += offerPriceOf(l);
            kosztOczek += Math.max(planValue, r.value);
            roots.add(l.sourceWbsNodeId || l.id);
            // Zaawansowanie wartościowe: wykonane/odebrane = 100 %, w toku = 50 %.
            if (['DONE', 'HANDED_OVER', 'INVOICED', 'UNFINISHED'].includes(l.execStatus)) wykonane += planValue;
            else if (l.execStatus === 'IN_PROGRESS') wykonane += planValue / 2;
            else if (!hasExecAxis(l.type) && ['DELIVERED', 'ISSUED', 'INVOICED'].includes(l.purchaseStatus)) wykonane += planValue;
        }
        let odebrano = 0;
        for (const p of protocols) for (const it of p.items || []) if (roots.has(it.wbsRootId)) odebrano += Number(it.wartosc) || 0;
        const zysk = przychod - plan;
        return {
            plan, real, prognoza, odebrano, pct: plan > 0 ? Math.round(wykonane / plan * 100) : 0,
            przychod, zysk, marza: przychod > 0 ? Math.round(zysk / przychod * 1000) / 10 : null,
            zyskProg: przychod - kosztOczek,
        };
    }, [liscie, rowOf, protocols]);

    const nazwa = (id) => nodeById[id] ? nazwaWyswietlana(nodeById[id], pelne) : '';
    // @anchor realizacja-kolejnosc-blokerow — najpierw blokery po terminie, potem wg terminu i wpływu
    // w dniach (bez terminu na końcu), dalej pytania bez odpowiedzi.
    const decyzje = wpisy.filter(w => w.otwarte && (w.rodzaj === 'block' || w.rodzaj === 'qa')).sort((a, b) => {
        const ra = a.rodzaj === 'block' ? 0 : 1, rb = b.rodzaj === 'block' ? 0 : 1;
        if (ra !== rb) return ra - rb;
        if (!!a.poTerminie !== !!b.poTerminie) return a.poTerminie ? -1 : 1;
        const ta = a.termin ? new Date(a.termin).getTime() : Infinity, tb = b.termin ? new Date(b.termin).getTime() : Infinity;
        if (ta !== tb) return ta - tb;
        return (b.wplywDni || 0) - (a.wplywDni || 0);
    });
    const dni = dniOkna(LOOKAHEAD_DNI);
    const najblizsze = liscie.map(l => {
        const d0 = indeksDnia(l.planOd, dni[0]);
        const d1 = indeksDnia(l.planDo, dni[0]);
        // Dostawa = prognoza pozycji z osią zakupu; prognoza pracy czy usługi to tylko przyszły koszt.
        const dost = actualsOf(l).filter(e => hasPurchaseAxis(l.type) && entryStatusOf(e) === 'FORECAST').map(e => indeksDnia(e.entryDate, dni[0]))
            .filter(i => i !== null && i >= 0 && i < LOOKAHEAD_DNI).sort((a, b) => a - b)[0];
        const rob = d0 !== null && d1 >= 0 && d0 < LOOKAHEAD_DNI;
        return { l, d0, d1, dost, rob, klucz: Math.min(rob ? Math.max(d0, 0) : 99, dost ?? 99) };
    }).filter(x => x.rob || x.dost !== undefined).sort((a, b) => a.klucz - b.klucz);
    const widoczne = wpisy.filter(w => filtr === 'all' || w.rodzaj === filtr);

    return (
        <>
            <div className="kpis">
                {canSeeMoney && <Kafel l="Przychód (oferta)" v={`${fmtZl(k.przychod)} zł`} s="cena ofertowa pozycji" />}
                {canSeeMoney && <Kafel l="Plan (baseline)" v={`${fmtZl(k.plan)} zł`} s={`${liscie.length} pozycji`} />}
                {canSeeMoney && <Kafel l="Zysk planowany" v={`${fmtZl(k.zysk)} zł`}
                    s={`${k.marza != null ? `marża ${String(k.marza).replace('.', ',')}% · ` : ''}prognoza ${fmtZl(k.zyskProg)} zł`}
                    t="Zysk planowany = przychód − plan. Prognoza: koszt każdej pozycji = większy z planu i poniesionego (z prognozowanymi)."
                    alarm={k.zysk < 0} alarmS={k.zyskProg < k.zysk - 0.005} />}
                {canSeeMoney && <Kafel l="Poniesione" v={`${fmtZl(k.real)} zł`} s={`w tym prognoza ${fmtZl(k.prognoza)} zł`} />}
                <Kafel l="Zaawansowanie" v={`${k.pct}%`} s="wartościowo, z osi robót" />
                {canSeeMoney && <Kafel l="Odebrano" v={`${fmtZl(k.odebrano)} zł`} s="protokołami" />}
                <Kafel l="Blokery" v={sygFokus.blok} s={`${sygFokus.pyt} pytań otwartych${sygFokus.kol ? ` · ${sygFokus.kol} kolizji dostaw` : ''}`} alarm={sygFokus.blok > 0} alarmS={sygFokus.kol > 0} />
                <Kafel l="Zadania" v={sygFokus.zad} s={`${sygFokus.poTerminie} po terminie`} alarmS={sygFokus.poTerminie > 0} />
            </div>
            <div style={{ marginTop: 16 }}>
            <TrzyKolumny
                lewa={<>
                <Karta tytul="Wątek gałęzi" prawa={`wszystko z ${liscie.length} pozycji`}>
                    <FiltryWatku wpisy={wpisy} filtr={filtr} setFiltr={setFiltr} />
                    <div className="feed scroll" style={{ maxHeight: 560 }}>
                        {widoczne.length ? widoczne.map(w => (
                            <Wpis key={w.id} w={w} nazwaPozycji={nazwa(w.nodeId)} onPozycja={() => onOtworz(w.nodeId)} akcje={canEdit ? akcje : null} />
                        )) : <Pusto>Brak wpisów tego rodzaju.</Pusto>}
                    </div>
                </Karta>
                </>}
                srodek={<>
                    {kolizje.length > 0 && <KolizjeDostaw kolizje={kolizje} pelne={pelne} onOtworz={onOtworz} akcje={canEdit ? akcje : null} />}
                    <Karta tytul="Najbliższe 14 dni" prawa={`od ${dzienMies(dni[0])}`}>
                        <table>
                            <thead><tr><th>Pozycja</th><th>Kiedy</th><th>Gotowość</th></tr></thead>
                            <tbody>
                                {najblizsze.length ? najblizsze.map(({ l, d0, d1, dost, rob }) => (
                                    <tr key={l.id} className="row" onClick={() => onOtworz(l.id)}>
                                        <td className="nm-cell"><span className="t" title={l.name}>{nazwaWyswietlana(l, pelne)}</span></td>
                                        <td className="mono" style={{ fontSize: 12 }}>
                                            {rob && <div>rob. {dzienMies(dni[Math.max(d0, 0)])}{Math.min(d1, LOOKAHEAD_DNI - 1) !== Math.max(d0, 0) ? `–${dzienMies(dni[Math.min(d1, LOOKAHEAD_DNI - 1)])}` : ''}</div>}
                                            {dost !== undefined && <div>dost. {dzienMies(dni[dost])}</div>}
                                        </td>
                                        <td><GotowoscChipy g={gotowosc(l)} /></td>
                                    </tr>
                                )) : <tr><td colSpan={3} className="muted">Brak robót i dostaw w oknie.</td></tr>}
                            </tbody>
                        </table>
                    </Karta>
                </>}
                prawa={<>
                    <Karta tytul="Blokery i decyzje" prawa="po terminie i wpływie na roboty">
                        <div className="feed">
                            {decyzje.length ? decyzje.map(w => (
                                <Wpis key={w.id} w={w} nazwaPozycji={nazwa(w.nodeId)} onPozycja={() => onOtworz(w.nodeId)} akcje={canEdit ? akcje : null} />
                            )) : <Pusto>Nic nie blokuje tej gałęzi.</Pusto>}
                        </div>
                    </Karta>
                </>}
            />
            </div>
        </>
    );
}

// @anchor realizacja-kolizje-dostaw — karta Kokpitu: dostawy za blisko startu robót w gałęzi.
// Kolizja bez blokera ma przycisk „Ustaw bloker”; z blokerem — znacznik, a sam bloker jest wyżej.
function KolizjeDostaw({ kolizje, pelne, onOtworz, akcje }) {
    return (
        <Karta tytul="Kolizje dostaw" prawa={`bufor ${BUFOR_DOSTAWY_DNI} dni przed robotami`}>
            <table>
                <thead><tr><th>Materiał</th><th>Dostawa</th><th>Roboty w gałęzi</th><th className="num">Zapas</th><th /></tr></thead>
                <tbody>
                    {kolizje.map(k => (
                        <tr key={k.id} className="row" onClick={() => onOtworz(k.materialId)}>
                            <td className="nm-cell"><span className="t" title={k.material.name}>{nazwaWyswietlana(k.material, pelne)}</span></td>
                            <td className="mono" style={{ fontSize: 12 }}>{dzienMies(k.dostawa)}</td>
                            <td className="nm-cell"><span className="t" title={k.robota.name}>{nazwaWyswietlana(k.robota, pelne)} · od {dzienMies(k.startRobot)}</span></td>
                            <td className="num dpos">{k.zapasDni > 0 ? '+' : ''}{k.zapasDni} dni</td>
                            <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                                {k.blokerId ? <span className="cnt c-bad">bloker</span>
                                    : akcje && <button className="mini-btn bad" onClick={() => akcje.zKolizji(k)} title="Utwórz bloker materiałowy z terminem = start robót">Ustaw bloker</button>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Karta>
    );
}

const Kafel = ({ l, v, s, t, alarm, alarmS }) => (
    <div className="kpi" title={t}>
        <span className="l">{l}</span>
        <span className="v" style={alarm ? { color: 'var(--bad)' } : undefined}>{v}</span>
        <span className="s" style={alarmS ? { color: 'var(--bad)' } : undefined}>{s}</span>
    </div>
);

// ─── Tablica ─────────────────────────────────────────────────────────────────

// @anchor realizacja-tablica-kolumny — kolumny tablicy na każdej osi. Statusy zamykające
// „bokiem" (anulowane, niedokończone, zafakturowane) dostają kolumnę tylko, gdy coś w nich leży.
const TABLICA_KOLUMNY = {
    exec: { stale: ['TO_DO', 'IN_PROGRESS', 'ON_HOLD', 'DONE', 'HANDED_OVER'], opcjonalne: ['UNFINISHED', 'INVOICED', 'CANCELLED'] },
    purchase: { stale: ['TO_ORDER', 'ORDERED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'ISSUED', 'INVOICED'], opcjonalne: ['CANCELLED'] },
};
// „Odebrane protokołem" ustawia protokół odbioru — ręcznie nie wrzucamy tam karty i jej stamtąd nie wyjmujemy.
const TABLICA_TYLKO_PROTOKOL = 'HANDED_OVER';

// @anchor realizacja-tablica — tablica statusów do porannej odprawy: karty pozycji w kolumnach
// statusu wybranej osi (roboty / zakup), tory = bezpośrednie podgałęzie zoomu. Przeciągnięcie
// karty do innej kolumny w tym samym torze zapisuje status przez `saveAxis` (te same reguły co lista
// w Macierzy). Karta za bramką etapu (np. montaż czekający na dostawę) leży w pierwszej kolumnie
// z podpisem bramki i nie da się jej przeciągnąć. Czerwony brzeg = otwarty bloker albo kolizja dostawy.
function Tablica({ grupy, actualsOf, sygnaly, pelne, canEdit, saveAxis, onZoom, onOtworz }) {
    const [os, setOsState] = useState(() => (czytaj(OS_KEY, 'exec') === 'purchase' ? 'purchase' : 'exec'));
    const setOs = (v) => { setOsState(v); zapisz(OS_KEY, v); };
    const [ciagniete, setCiagniete] = useState(null);   // { id, tor, status }
    const [nad, setNad] = useState(null);               // `${tor}|${status}`

    const pole = os === 'purchase' ? 'purchaseStatus' : 'execStatus';
    const domyslny = os === 'purchase' ? DEFAULT_PURCHASE_STATUS : DEFAULT_EXEC_STATUS;
    const naOsi = os === 'purchase' ? hasPurchaseAxis : hasExecAxis;
    const etykieta = (node, k) => (os === 'exec' ? execStatusLabel(node?.type, k) : PURCHASE_STATUS_META[k]?.label) || k;

    const tory = useMemo(() => grupy.map(({ galaz, liscie }) => ({
        galaz,
        karty: liscie.filter(l => naOsi(l.type)).map(l => {
            const bramka = axisGateOf(l, os);
            return { l, bramka, status: bramka ? domyslny : (l[pole] || domyslny) };
        }),
    })).filter(t => t.karty.length), [grupy, os]); // eslint-disable-line react-hooks/exhaustive-deps

    const wszystkie = tory.flatMap(t => t.karty);
    const { stale, opcjonalne } = TABLICA_KOLUMNY[os];
    const kolumny = [...stale, ...opcjonalne.filter(k => wszystkie.some(c => c.status === k))];
    // Kolumna z kodem spoza słownika (stare dane) — nie gubimy karty, tylko dokładamy kolumnę.
    for (const c of wszystkie) if (!kolumny.includes(c.status)) kolumny.push(c.status);
    const siatka = { gridTemplateColumns: `repeat(${kolumny.length}, minmax(150px, 1fr))` };

    const mozeCiagnac = (c) => canEdit && !c.bramka && !(os === 'exec' && c.status === TABLICA_TYLKO_PROTOKOL);
    const mozeUpuscic = (tor, k) => ciagniete && ciagniete.tor === tor && ciagniete.status !== k
        && !(os === 'exec' && k === TABLICA_TYLKO_PROTOKOL);
    const upusc = (tor, k) => {
        const c = ciagniete;
        setCiagniete(null); setNad(null);
        if (!c || !mozeUpuscic(tor, k)) return;
        const karta = wszystkie.find(x => x.l.id === c.id);
        if (karta) saveAxis(karta.l, pole, k);
    };

    // Termin na karcie: oś robót = start z Gantta, oś zakupu = najbliższa przewidywana dostawa (FORECAST).
    const termin = (l) => {
        if (os === 'exec') return l.planOd ? `rob. ${dzienMies(l.planOd)}` : null;
        const d = actualsOf(l).filter(e => entryStatusOf(e) === 'FORECAST' && e.entryDate).map(e => new Date(e.entryDate)).sort((a, b) => a - b)[0];
        return d ? `dost. ${dzienMies(d)}` : null;
    };

    if (!tory.length) return <div className="empty">Brak pozycji z osią {os === 'exec' ? 'robót' : 'zakupu'} w tej gałęzi.</div>;
    return (
        <>
            <div className="lahead">
                <span className="seg">
                    <button className={os === 'exec' ? 'on' : ''} onClick={() => setOs('exec')}>Oś robót</button>
                    <button className={os === 'purchase' ? 'on' : ''} onClick={() => setOs('purchase')}>Oś zakupu</button>
                </span>
                <span>Tory = podgałęzie. {canEdit ? 'Przeciągnięcie karty zmienia status (oprócz „Odebrane protokołem”, które ustawia protokół).' : 'Podgląd — statusy zmieniają kierownik i logistyk.'} Klik w kartę otwiera ją w Macierzy.</span>
            </div>
            <div className="kb-wrap">
                <div className="kbh" style={siatka}>
                    {kolumny.map(k => (
                        <div key={k}><span>{etykieta(null, k)}</span><span>{wszystkie.filter(c => c.status === k).length}</span></div>
                    ))}
                </div>
                <div className="kb" style={siatka}>
                    {tory.map(({ galaz, karty }) => {
                        const tor = galaz?.id || '_wprost';
                        return (
                            <React.Fragment key={tor}>
                                {galaz
                                    ? <div className="lane" title={galaz.name}>
                                        <button onClick={() => onZoom(galaz.id)} title={`${galaz.name} — pokaż tylko tę gałąź`}>{nazwaWyswietlana(galaz, pelne)}</button>
                                        <span className="mono" style={{ fontWeight: 400 }}>· {karty.length} poz.</span>
                                    </div>
                                    : grupy.length > 1 && <div className="lane">Pozycje wprost w tej gałęzi</div>}
                                {kolumny.map(k => {
                                    const klucz = `${tor}|${k}`;
                                    const cel = mozeUpuscic(tor, k);
                                    return (
                                        <div key={k}
                                            className={`kcol${ciagniete ? (cel ? ' can-drop' : ' no-drop') : ''}${nad === klucz && cel ? ' over' : ''}`}
                                            onDragOver={e => { if (cel) { e.preventDefault(); if (nad !== klucz) setNad(klucz); } }}
                                            onDragLeave={() => { if (nad === klucz) setNad(null); }}
                                            onDrop={e => { e.preventDefault(); upusc(tor, k); }}>
                                            {karty.filter(c => c.status === k).map(c => {
                                                const s = sygnaly[c.l.id];
                                                const alarm = (s?.blok || 0) > 0 || (s?.kol || 0) > 0;
                                                const t = termin(c.l);
                                                const drag = mozeCiagnac(c);
                                                return (
                                                    <div key={c.l.id} className={`kc${alarm ? ' blk' : ''}${drag ? ' drag' : ''}${ciagniete?.id === c.l.id ? ' ghost' : ''}`}
                                                        draggable={drag} title={c.l.name}
                                                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.l.id); setCiagniete({ id: c.l.id, tor, status: c.status }); }}
                                                        onDragEnd={() => { setCiagniete(null); setNad(null); }}
                                                        onClick={() => onOtworz(c.l.id)}>
                                                        <span className="t">{nazwaWyswietlana(c.l, pelne)}</span>
                                                        <span className="m">
                                                            <span className="typ">{TYPE_META[c.l.type]?.label || c.l.type}</span>
                                                            {t && <span className="mono">{t}</span>}
                                                            {c.l.owner && <span>{c.l.owner}</span>}
                                                        </span>
                                                        {c.bramka && <span className="gate" title={c.bramka.title}>{c.bramka.label}</span>}
                                                        {s && (s.blok || s.kol || s.pyt || s.zad) ? <SygnalyCell s={{ ...s, czat: 0 }} /> : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
