// Zakładka „Realizacja" — nowy UI (MVP, docs/REALIZACJA-MVP-PLAN.md, mockup w artefakcie
// „Ignite Realizacja"). Środek ma dwa widoki na całą szerokość: KOKPIT gałęzi i MACIERZ pozycji.
// Drzewo gałęzi NIE siedzi tutaj — panel publikuje je przez `setBranchNav` do lewego panelu
// aplikacji (`SidebarBranchTree` pod aktywnym zamówieniem). Klik w gałąź tam = zoom tutaj.
//
// Zapisuje tylko: osie realizacji (`saveAxis`, te same reguły co „Realizacja (tabela)"),
// krótką nazwę pozycji (`WbsNode.shortName`) i wpisy czatu pozycji (z flagą „pilne" = bloker).
// Wpisy zakupów (`LeafActual`) i protokoły zostają w zakładce „Realizacja (tabela)".
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader2, ChevronRight, Send, AlertTriangle, Check } from 'lucide-react';
import { API_URL } from '../../../config';
import { useRealizationData } from '../wbs/useRealizationData';
import { buildBranchIndex, SYNTHETIC_ROOT } from '../RealizationNewTab';
import {
    LEAF_TYPES, OPEN_LEAF_TYPES, TYPE_META, fmtZl, entryStatusOf,
} from '../wbs/realizationShared';
import {
    PURCHASE_STATUS_META, EXEC_STATUS_META, execStatusLabel, hasPurchaseAxis, hasExecAxis, axisGateOf,
    DEFAULT_PURCHASE_STATUS, DEFAULT_EXEC_STATUS,
} from '../wbs/wbsConstants';
import { useWatekRealizacji } from './useWatekRealizacji';
import {
    nazwaWyswietlana, WATEK_RODZAJE, zbudujWatek, sygnalyWezlow, sumaSygnalow, kiedyTekst,
} from './realizacjaShared';

const FOCUS_KEY = (nodeId) => `realizacja-focus-${nodeId}`;
const WIDOK_KEY = 'realizacja-widok';
const PELNE_KEY = 'realizacja-pelne-nazwy';
const czytaj = (k, d) => { try { return sessionStorage.getItem(k) ?? d; } catch { return d; } };
const zapisz = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* tryb prywatny */ } };

// @anchor realizacja-droga — „droga pozycji": kolejne etapy od zamówienia do odbioru.
// Materiał i sprzęt idą przez zakup i montaż, praca i usługa — tylko przez wykonanie.
const PURCHASE_KROK = { ORDERED: 1, PARTIALLY_DELIVERED: 1, DELIVERED: 2, ISSUED: 2, INVOICED: 2 };
const EXEC_KROK = { IN_PROGRESS: 0, ON_HOLD: 0, DONE: 1, UNFINISHED: 1, HANDED_OVER: 2, INVOICED: 2 };
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

    const { loading, wbsNodes, actuals, saveAxis, actualsOf, rowOf } =
        useRealizationData({ nodeId, versionId, acceptedAt, isManagerOrAdmin });
    const { comments, tasks, protocols, wyslij, zamknijBloker } = useWatekRealizacji(nodeId);

    // @anchor realizacja-short-overrides — krótkie nazwy zapisane w tej sesji (bez przeładowania drzewa).
    const [shortOverrides, setShortOverrides] = useState({});
    const nodes = useMemo(() => (Object.keys(shortOverrides).length
        ? wbsNodes.map(n => (n.id in shortOverrides ? { ...n, shortName: shortOverrides[n.id] } : n))
        : wbsNodes), [wbsNodes, shortOverrides]);

    const idx = useMemo(() => buildBranchIndex(nodes, orderName, visibleTypes), [nodes, orderName, visibleTypes]);

    const [focus, setFocusState] = useState(() => czytaj(FOCUS_KEY(nodeId), SYNTHETIC_ROOT));
    const setFocus = useCallback((id) => { setFocusState(id); zapisz(FOCUS_KEY(nodeId), id); }, [nodeId]);
    // Zapamiętana gałąź mogła zniknąć w nowej wersji — wtedy wracamy do całego zamówienia.
    const focusId = idx.nodeById[focus] && !LEAF_TYPES.includes(idx.nodeById[focus]?.type) ? focus : SYNTHETIC_ROOT;

    const [widok, setWidokState] = useState(() => czytaj(WIDOK_KEY, 'macierz'));
    const setWidok = (v) => { setWidokState(v); zapisz(WIDOK_KEY, v); };
    const [pelne, setPelneState] = useState(() => czytaj(PELNE_KEY, '0') === '1');
    const setPelne = useCallback((v) => { setPelneState(v); zapisz(PELNE_KEY, v ? '1' : '0'); }, []);
    const [otwarta, setOtwarta] = useState(null);
    const [filtr, setFiltr] = useState('all');

    const wpisy = useMemo(() => zbudujWatek({ wbsNodes: nodes, comments, tasks, actuals, protocols }),
        [nodes, comments, tasks, actuals, protocols]);
    const sygnaly = useMemo(() => sygnalyWezlow(wpisy), [wpisy]);

    // Węzły poddrzewa gałęzi (gałęzie + liście) — do sumowania sygnałów i filtrowania wątku.
    const idsPoddrzewa = useCallback((id) => {
        const galezie = idx.subtreeIds(id);
        return new Set([...galezie, ...idx.leavesOfSubtree(id).map(l => l.id)]);
    }, [idx]);

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
    const navRef = useRef({});
    navRef.current = { setFocus, zapiszShort, setPelne };
    useEffect(() => {
        if (!setBranchNav) return;
        setBranchNav({
            orderId: nodeId,
            rootId: SYNTHETIC_ROOT,
            galezie: navGalezie,
            focusId,
            pelne,
            canRename: canEdit,
            onFocus: (id) => navRef.current.setFocus(id),
            onRename: (id, v) => navRef.current.zapiszShort(id, v),
            onPelne: (v) => navRef.current.setPelne(v),
        });
    }, [setBranchNav, nodeId, navGalezie, focusId, pelne, canEdit]);
    useEffect(() => () => { if (setBranchNav) setBranchNav(null); }, [setBranchNav]);

    // ── Pozycje w zoomie ─────────────────────────────────────────────────────
    const fraza = String(searchQuery || '').trim().toLowerCase();
    const liscie = useMemo(() => {
        let list = idx.leavesOfSubtree(focusId);
        if (fraza) list = list.filter(n => [n.name, n.shortName, n.owner].some(t => String(t || '').toLowerCase().includes(fraza)));
        return list;
    }, [idx, focusId, fraza]);

    // Grupy = bezpośrednie podgałęzie zoomu (+ pozycje wiszące wprost pod nim).
    const grupy = useMemo(() => {
        const dzieci = idx.childrenOf[focusId] || [];
        const out = [];
        const wprost = liscie.filter(l => l.branchId === focusId);
        if (wprost.length) out.push({ galaz: null, liscie: wprost });
        for (const d of dzieci) {
            const ids = new Set(idx.subtreeIds(d.id));
            const ls = liscie.filter(l => ids.has(l.branchId));
            if (ls.length) out.push({ galaz: d, liscie: ls });
        }
        return out;
    }, [idx, focusId, liscie]);

    const sciezka = useMemo(() => {
        const out = [];
        let id = focusId;
        const seen = new Set();
        while (id && !seen.has(id)) { seen.add(id); out.unshift(idx.nodeById[id]); id = idx.nodeById[id]?.parentId; }
        return out.filter(Boolean);
    }, [idx, focusId]);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 size={16} className="animate-spin" /> Wczytywanie realizacji…
            </div>
        );
    }

    const fokus = idx.nodeById[focusId];
    const sygFokus = sumaSygnalow(idsPoddrzewa(focusId), sygnaly);

    return (
        <div className="flex h-full flex-col bg-[#030712] text-gray-200">
            {/* ── Nagłówek zoomu ── */}
            <div className="shrink-0 border-b border-white/[.07] bg-[#0a1120] px-4 py-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
                    {sciezka.slice(0, -1).map(n => (
                        <React.Fragment key={n.id}>
                            <button onClick={() => setFocus(n.id)} title={n.name} className="max-w-[220px] truncate text-sky-300/80 hover:text-sky-200">
                                {n.id === SYNTHETIC_ROOT ? (orderName || 'Zamówienie') : nazwaWyswietlana(n, pelne)}
                            </button>
                            <ChevronRight size={11} className="shrink-0 text-gray-600" />
                        </React.Fragment>
                    ))}
                    {sciezka.length <= 1 && <span>Całe zamówienie</span>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <span title={fokus?.name} className="max-w-[46ch] truncate text-lg font-bold text-white">
                        {focusId === SYNTHETIC_ROOT ? (orderName || 'Zamówienie') : nazwaWyswietlana(fokus, pelne)}
                    </span>
                    {stage === 'REALIZACJA'
                        ? <span className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Realizacja</span>
                        : <span title="Realizację uruchamia się przyciskiem w nagłówku zamówienia, po akceptacji baseline." className="cursor-help rounded border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Realizacja nie uruchomiona</span>}
                    {planLabel && <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">{planLabel}</span>}
                    {sygFokus.blok > 0 && <span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">{sygFokus.blok} bloker{sygFokus.blok > 1 ? 'y' : ''}</span>}
                    {sygFokus.pyt > 0 && <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">{sygFokus.pyt} pytań otwartych</span>}
                    <div className="ml-auto flex items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-400">
                            <input type="checkbox" checked={pelne} onChange={e => setPelne(e.target.checked)} className="accent-teal-500" />
                            pełne nazwy
                        </label>
                        <div className="flex overflow-hidden rounded-md border border-white/10">
                            {[['kokpit', 'Kokpit'], ['macierz', 'Macierz']].map(([k, l]) => (
                                <button key={k} onClick={() => setWidok(k)}
                                    className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${widok === k ? 'bg-teal-500/20 text-teal-200' : 'text-gray-500 hover:text-gray-300'}`}>
                                    {l}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                {widok === 'kokpit' ? (
                    <Kokpit
                        liscie={idx.leavesOfSubtree(focusId)} rowOf={rowOf} actualsOf={actualsOf}
                        wpisy={wpisy.filter(w => idsPoddrzewa(focusId).has(w.nodeId))}
                        protocols={protocols} sygFokus={sygFokus} canSeeMoney={canSeeMoney}
                        nodeById={idx.nodeById} pelne={pelne} filtr={filtr} setFiltr={setFiltr}
                        onOtworz={(id) => {
                            // Wpis gałęzi (czat gałęzi) = zoom na nią; wpis pozycji = rozwinięty wiersz w Macierzy.
                            if (LEAF_TYPES.includes(idx.nodeById[id]?.type)) { setOtwarta(id); setWidok('macierz'); }
                            else if (idx.nodeById[id]) setFocus(id);
                        }}
                        onZamknijBloker={zamknijBloker}
                    />
                ) : (
                    <Macierz
                        grupy={grupy} rowOf={rowOf} actualsOf={actualsOf} wpisy={wpisy} sygnaly={sygnaly}
                        pelne={pelne} canEdit={canEdit} canSeeMoney={canSeeMoney}
                        otwarta={otwarta} setOtwarta={setOtwarta} onZoom={setFocus}
                        saveAxis={saveAxis} zapiszShort={zapiszShort}
                        wyslij={wyslij} zamknijBloker={zamknijBloker}
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
            <div className="flex w-36 gap-0.5">
                {etapy.map((e, i) => (
                    <i key={e} className={`h-2 flex-1 rounded-sm ${i < pelne ? 'bg-teal-400'
                        : i === stop ? 'bg-red-500'
                            : i === wToku ? 'bg-amber-400' : 'bg-white/10'}`} />
                ))}
            </div>
            <div className="mt-1 text-[10.5px] text-gray-500">{podpis}</div>
        </div>
    );
}

// @anchor realizacja-sygnaly-cell — liczniki sygnałów pozycji.
function SygnalyCell({ s }) {
    if (!s) return <span className="text-gray-700">—</span>;
    return (
        <div className="flex flex-wrap gap-1 font-mono text-[10.5px]">
            {s.blok > 0 && <span className="rounded bg-red-500/15 px-1 text-red-300">{s.blok} bloker</span>}
            {s.pyt > 0 && <span className="rounded bg-amber-500/15 px-1 text-amber-300">{s.pyt} pyt.</span>}
            {s.czat > 0 && <span className="rounded bg-sky-500/15 px-1 text-sky-300">{s.czat} czat</span>}
            {s.zad > 0 && <span className={`rounded px-1 ${s.poTerminie ? 'bg-red-500/15 text-red-300' : 'bg-white/10 text-gray-300'}`}>{s.zad} zad.{s.poTerminie ? ' !' : ''}</span>}
        </div>
    );
}

// @anchor realizacja-wpis — jeden wpis wątku.
function Wpis({ w, nazwaPozycji, onPozycja, onZamknijBloker }) {
    const r = WATEK_RODZAJE[w.rodzaj];
    return (
        <div className="grid grid-cols-[24px_1fr] gap-2 border-b border-white/[.05] px-3 py-2 text-[13px] last:border-b-0">
            <span className={`grid size-6 place-items-center rounded font-mono text-[10px] font-bold ${r.cls}`}>{r.znak}</span>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                    {w.kto && <b className="font-semibold text-gray-300">{w.kto}</b>}
                    <span>{kiedyTekst(w.kiedy)}</span>
                    {nazwaPozycji && <button onClick={onPozycja} className="max-w-[220px] truncate text-sky-300/80 hover:text-sky-200">{nazwaPozycji}</button>}
                    {w.mail && <span className="text-amber-300/70">{w.mail}</span>}
                    {w.prognoza && <span className="text-violet-300/80">prognoza</span>}
                    {w.otwarte && (w.rodzaj === 'block' || w.rodzaj === 'qa') && <span className="rounded-full border border-red-400/40 px-1.5 text-[10px] text-red-300">otwarte</span>}
                    {w.zamkniety && <span className="text-emerald-400/70">zamknięty</span>}
                    {w.rodzaj === 'block' && w.otwarte && onZamknijBloker && (
                        <button onClick={() => onZamknijBloker(w.commentId)} title="Oznacz jako rozwiązane — czerwony licznik zgaśnie"
                            className="ml-auto flex items-center gap-1 rounded border border-emerald-500/30 px-1.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10">
                            <Check size={10} /> rozwiązane
                        </button>
                    )}
                </div>
                <div className="whitespace-pre-wrap break-words text-gray-200">{w.tekst}</div>
                {w.odpowiedz && <div className="mt-1 rounded-r border-l-2 border-emerald-400 bg-emerald-500/10 px-2 py-1 text-gray-200">{w.odpowiedz}</div>}
            </div>
        </div>
    );
}

// @anchor realizacja-filtry-watku — chipy rodzajów nad wątkiem.
function FiltryWatku({ wpisy, filtr, setFiltr }) {
    const klucze = ['all', ...Object.keys(WATEK_RODZAJE)];
    return (
        <div className="flex flex-wrap gap-1 border-b border-white/[.07] px-3 py-2">
            {klucze.map(k => {
                const n = k === 'all' ? wpisy.length : wpisy.filter(w => w.rodzaj === k).length;
                return (
                    <button key={k} onClick={() => setFiltr(k)}
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${filtr === k ? 'border-teal-400/50 bg-teal-500/15 text-teal-200' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}>
                        {k === 'all' ? 'Wszystko' : WATEK_RODZAJE[k].label} <span className="font-mono">{n}</span>
                    </button>
                );
            })}
        </div>
    );
}

const Karta = ({ tytul, prawa, children, className = '' }) => (
    <div className={`flex min-w-0 flex-col rounded-lg border border-white/[.08] bg-[#0a1120] ${className}`}>
        <div className="flex items-center gap-2 border-b border-white/[.07] px-3 py-2 text-[12px] font-bold uppercase tracking-wider text-teal-300">
            {tytul}{prawa && <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-gray-500">{prawa}</span>}
        </div>
        {children}
    </div>
);

// ─── Macierz ─────────────────────────────────────────────────────────────────

// @anchor realizacja-macierz — wiersz = pozycja; klik rozwija wątek, osie i powiązania.
function Macierz({ grupy, rowOf, actualsOf, wpisy, sygnaly, pelne, canEdit, canSeeMoney, otwarta, setOtwarta, onZoom, saveAxis, zapiszShort, wyslij, zamknijBloker }) {
    const kolumn = canSeeMoney ? 8 : 5;
    if (!grupy.length) return <div className="pt-16 text-center text-sm text-gray-600">Brak pozycji w tej gałęzi.</div>;
    return (
        <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-[#030712]">
                <tr className="border-b border-white/10 text-left font-mono text-[10.5px] uppercase tracking-wider text-gray-500">
                    <th className="px-2 py-2 font-medium">Pozycja</th>
                    <th className="px-2 py-2 font-medium">Droga pozycji</th>
                    {canSeeMoney && <th className="px-2 py-2 text-right font-medium">Plan</th>}
                    {canSeeMoney && <th className="px-2 py-2 text-right font-medium">Poniesione</th>}
                    {canSeeMoney && <th className="px-2 py-2 text-right font-medium">Różnica</th>}
                    <th className="px-2 py-2 font-medium">Terminy</th>
                    <th className="px-2 py-2 font-medium">Sygnały</th>
                    <th className="w-6 px-2 py-2" />
                </tr>
            </thead>
            <tbody>
                {grupy.map(({ galaz, liscie }) => (
                    <React.Fragment key={galaz?.id || '_wprost'}>
                        {galaz && (
                            <tr className="border-b border-white/[.07] bg-white/[.02]">
                                <td colSpan={kolumn} className="px-2 py-1.5 text-[12px] font-semibold text-gray-400">
                                    <button onClick={() => onZoom(galaz.id)} title={`${galaz.name} — pokaż tylko tę gałąź`} className="hover:text-sky-200">
                                        {nazwaWyswietlana(galaz, pelne)}
                                    </button>
                                    <span className="ml-2 font-mono font-normal text-gray-600">· {liscie.length} poz.{canSeeMoney ? ` · ${fmtZl(liscie.reduce((s, l) => s + rowOf(l).planValue, 0))} zł` : ''}</span>
                                </td>
                            </tr>
                        )}
                        {liscie.map(l => {
                            const { r, planValue } = rowOf(l);
                            const roznica = r.value ? r.value - planValue : 0;
                            const prognozy = actualsOf(l).filter(e => entryStatusOf(e) === 'FORECAST' && e.entryDate).map(e => new Date(e.entryDate)).sort((a, b) => a - b);
                            const otw = otwarta === l.id;
                            return (
                                <React.Fragment key={l.id}>
                                    <tr onClick={() => setOtwarta(otw ? null : l.id)}
                                        className={`cursor-pointer border-b border-white/[.05] ${otw ? 'bg-sky-500/10' : 'hover:bg-white/[.03]'}`}>
                                        <td className="max-w-[320px] px-2 py-2">
                                            <span title={l.name} className={`block font-medium text-gray-100 ${pelne ? 'whitespace-normal' : 'truncate'}`}>{nazwaWyswietlana(l, pelne)}</span>
                                            <span className="font-mono text-[10px] uppercase text-gray-500">{TYPE_META[l.type]?.label || l.type}{l.owner ? ` · ${l.owner}` : ''}</span>
                                        </td>
                                        <td className="px-2 py-2"><DrogaPasek node={l} /></td>
                                        {canSeeMoney && <td className="px-2 py-2 text-right font-mono tabular-nums">{fmtZl(planValue)}</td>}
                                        {canSeeMoney && <td className="px-2 py-2 text-right font-mono tabular-nums">{r.value ? fmtZl(r.value) : '—'}</td>}
                                        {canSeeMoney && <td className={`px-2 py-2 text-right font-mono text-[12px] tabular-nums ${roznica > 0.005 ? 'text-red-400' : roznica < -0.005 ? 'text-emerald-400' : 'text-gray-600'}`}>
                                            {r.value ? `${roznica > 0 ? '+' : ''}${fmtZl(roznica)}` : '—'}
                                        </td>}
                                        <td className="px-2 py-2 font-mono text-[11.5px] text-gray-400">
                                            {prognozy[0] && <div title="Data z wpisu prognozowanego (FORECAST)">dost. {kiedyTekst(prognozy[0])}</div>}
                                            {l.ganttStart && <div>rob. {kiedyTekst(l.ganttStart)}</div>}
                                        </td>
                                        <td className="px-2 py-2"><SygnalyCell s={sygnaly[l.id]} /></td>
                                        <td className="px-2 py-2 text-gray-600">{otw ? '▴' : '▾'}</td>
                                    </tr>
                                    {otw && (
                                        <tr className="border-b border-white/[.07] bg-black/30">
                                            <td colSpan={kolumn} className="p-3">
                                                <RozwinietaPozycja
                                                    node={l} r={r} planValue={planValue} canEdit={canEdit} canSeeMoney={canSeeMoney}
                                                    wpisy={wpisy.filter(w => w.nodeId === l.id)}
                                                    saveAxis={saveAxis} zapiszShort={zapiszShort}
                                                    wyslij={wyslij} zamknijBloker={zamknijBloker}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </React.Fragment>
                ))}
            </tbody>
        </table>
    );
}

// @anchor realizacja-rozwinieta-pozycja — trzy karty pod wierszem: wątek · zakup i realizacja · powiązania.
function RozwinietaPozycja({ node, r, planValue, canEdit, canSeeMoney, wpisy, saveAxis, zapiszShort, wyslij, zamknijBloker }) {
    const [tekst, setTekst] = useState('');
    const [pilne, setPilne] = useState(false);
    const [wysylam, setWysylam] = useState(false);
    const [short, setShort] = useState(node.shortName || '');
    const zadania = wpisy.filter(w => w.rodzaj === 'task');
    const pytania = wpisy.filter(w => w.rodzaj === 'qa');

    const wyslijWpis = async () => {
        if (!tekst.trim() || wysylam) return;
        setWysylam(true);
        try { await wyslij(node.id, tekst.trim(), pilne); setTekst(''); setPilne(false); }
        catch { alert('Nie udało się wysłać wpisu'); }
        finally { setWysylam(false); }
    };

    return (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_1fr_1fr]">
            <Karta tytul="Wątek pozycji" prawa={`${wpisy.length} wpisów`}>
                <div className="max-h-80 overflow-auto">
                    {wpisy.length ? wpisy.map(w => <Wpis key={w.id} w={w} onZamknijBloker={canEdit ? zamknijBloker : null} />)
                        : <div className="px-3 py-4 text-[12px] text-gray-600">Brak wpisów — pierwszy dodasz poniżej.</div>}
                </div>
                <div className="flex items-center gap-2 border-t border-white/[.07] px-3 py-2">
                    <input value={tekst} onChange={e => setTekst(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') wyslijWpis(); }}
                        placeholder="Napisz do czatu pozycji…" className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-[12.5px] text-gray-200 placeholder-gray-600 focus:border-teal-500/50 focus:outline-none" />
                    <label title="Pilny wpis = bloker: czerwony licznik w drzewie, dopóki ktoś nie oznaczy go jako rozwiązany"
                        className={`flex cursor-pointer items-center gap-1 text-[11px] ${pilne ? 'text-red-300' : 'text-gray-500'}`}>
                        <input type="checkbox" checked={pilne} onChange={e => setPilne(e.target.checked)} className="accent-red-500" />
                        <AlertTriangle size={11} /> bloker
                    </label>
                    <button onClick={wyslijWpis} disabled={!tekst.trim() || wysylam}
                        className="rounded border border-teal-500/40 bg-teal-500/10 p-1.5 text-teal-300 hover:bg-teal-500/20 disabled:opacity-40"><Send size={12} /></button>
                </div>
            </Karta>

            <Karta tytul="Zakup i realizacja">
                <div className="flex flex-col gap-2 p-3 text-[12.5px]">
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
                    <p className="text-[11px] text-gray-600">Wpisy zakupów i protokoły odbioru prowadzisz w zakładce „Realizacja (tabela)”.</p>
                </div>
            </Karta>

            <Karta tytul="Powiązania">
                <div className="flex flex-col gap-2 p-3 text-[12.5px]">
                    <Wiersz l="Zadania otwarte" v={zadania.filter(z => z.otwarte).length + (zadania.some(z => z.poTerminie) ? ' · po terminie' : '')} />
                    <Wiersz l="Pytania bez odpowiedzi" v={pytania.filter(p => p.otwarte).length} />
                    <Wiersz l="Odpowiedzialny" v={node.owner || '—'} />
                    <div>
                        <div className="mb-1 text-[11px] text-gray-500">Krótka nazwa</div>
                        <input value={short} onChange={e => setShort(e.target.value)} disabled={!canEdit}
                            onBlur={() => { if ((short.trim() || null) !== (node.shortName || null)) zapiszShort(node.id, short); }}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            placeholder={nazwaWyswietlana({ name: node.name })}
                            className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-[12.5px] text-gray-200 placeholder-gray-600 focus:border-teal-500/50 focus:outline-none disabled:opacity-60" />
                    </div>
                    <div>
                        <div className="mb-1 text-[11px] text-gray-500">Pełna nazwa (oferta, protokoły)</div>
                        <div className="text-[12px] text-gray-400">{node.name}</div>
                    </div>
                </div>
            </Karta>
        </div>
    );
}

const Wiersz = ({ l, v }) => (
    <div className="flex justify-between gap-3"><span className="text-gray-500">{l}</span><span className="text-right font-mono tabular-nums text-gray-200">{v}</span></div>
);

// @anchor realizacja-os-wybor — oś realizacji jako lista; bramka etapu = tylko podpis.
function OsWybor({ node, axis, readOnly, saveAxis }) {
    const pole = axis === 'purchase' ? 'purchaseStatus' : 'execStatus';
    const meta = axis === 'purchase' ? PURCHASE_STATUS_META : EXEC_STATUS_META;
    const gate = axisGateOf(node, axis);
    const wartosc = node[pole] || (axis === 'purchase' ? DEFAULT_PURCHASE_STATUS : DEFAULT_EXEC_STATUS);
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">{axis === 'purchase' ? 'Zakup' : (hasPurchaseAxis(node.type) ? 'Montaż' : 'Wykonanie')}</span>
            {gate ? <span title={gate.title} className="italic text-gray-500">{gate.label}</span> : (
                <select value={wartosc} disabled={readOnly}
                    onChange={e => saveAxis(node, pole, e.target.value)}
                    className={`rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[12px] focus:border-teal-500/50 focus:outline-none ${meta[wartosc]?.color || 'text-gray-200'}`}>
                    {Object.entries(meta).filter(([k]) => axis === 'purchase' || k !== 'HANDED_OVER' || wartosc === 'HANDED_OVER').map(([k, m]) => (
                        <option key={k} value={k}>{axis === 'exec' ? execStatusLabel(node.type, k) : m.label}</option>
                    ))}
                </select>
            )}
        </div>
    );
}

// ─── Kokpit ──────────────────────────────────────────────────────────────────

// @anchor realizacja-kokpit — KPI gałęzi, blokery i decyzje, najbliższe 14 dni, wątek gałęzi.
function Kokpit({ liscie, rowOf, actualsOf, wpisy, protocols, sygFokus, canSeeMoney, nodeById, pelne, filtr, setFiltr, onOtworz, onZamknijBloker }) {
    const k = useMemo(() => {
        let plan = 0, real = 0, prognoza = 0, wykonane = 0;
        const roots = new Set();
        for (const l of liscie) {
            const { r, planValue } = rowOf(l);
            plan += planValue; real += r.value; prognoza += r.byStatus.FORECAST;
            roots.add(l.sourceWbsNodeId || l.id);
            // Zaawansowanie wartościowe: wykonane/odebrane = 100 %, w toku = 50 %.
            if (['DONE', 'HANDED_OVER', 'INVOICED', 'UNFINISHED'].includes(l.execStatus)) wykonane += planValue;
            else if (l.execStatus === 'IN_PROGRESS') wykonane += planValue / 2;
            else if (!hasExecAxis(l.type) && ['DELIVERED', 'ISSUED', 'INVOICED'].includes(l.purchaseStatus)) wykonane += planValue;
        }
        let odebrano = 0;
        for (const p of protocols) for (const it of p.items || []) if (roots.has(it.wbsRootId)) odebrano += Number(it.wartosc) || 0;
        return { plan, real, prognoza, odebrano, pct: plan > 0 ? Math.round(wykonane / plan * 100) : 0 };
    }, [liscie, rowOf, protocols]);

    const nazwa = (id) => nodeById[id] ? nazwaWyswietlana(nodeById[id], pelne) : '';
    const decyzje = wpisy.filter(w => w.otwarte && (w.rodzaj === 'block' || w.rodzaj === 'qa'))
        .sort((a, b) => (a.rodzaj === 'block' ? 0 : 1) - (b.rodzaj === 'block' ? 0 : 1));
    const teraz = new Date(); teraz.setHours(0, 0, 0, 0);
    const koniec = new Date(teraz); koniec.setDate(koniec.getDate() + 14);
    const wOknie = (d) => d && new Date(d) >= teraz && new Date(d) < koniec;
    const najblizsze = liscie.map(l => {
        const dost = actualsOf(l).filter(e => entryStatusOf(e) === 'FORECAST' && wOknie(e.entryDate)).map(e => e.entryDate).sort()[0] || null;
        const rob = wOknie(l.ganttStart) ? l.ganttStart : null;
        return { l, dost, rob, kiedy: [dost, rob].filter(Boolean).sort()[0] };
    }).filter(x => x.kiedy).sort((a, b) => new Date(a.kiedy) - new Date(b.kiedy));
    const widoczne = wpisy.filter(w => filtr === 'all' || w.rodzaj === filtr);

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[.08] bg-white/[.08] md:grid-cols-3 xl:grid-cols-6">
                {canSeeMoney && <Kafel l="Plan (baseline)" v={`${fmtZl(k.plan)} zł`} s={`${liscie.length} pozycji`} />}
                {canSeeMoney && <Kafel l="Poniesione" v={`${fmtZl(k.real)} zł`} s={`w tym prognoza ${fmtZl(k.prognoza)} zł`} />}
                <Kafel l="Zaawansowanie" v={`${k.pct}%`} s="wartościowo, z osi robót" />
                {canSeeMoney && <Kafel l="Odebrano" v={`${fmtZl(k.odebrano)} zł`} s="protokołami" />}
                <Kafel l="Blokery" v={sygFokus.blok} s={`${sygFokus.pyt} pytań otwartych`} alarm={sygFokus.blok > 0} />
                <Kafel l="Zadania otwarte" v={sygFokus.zad} s={`${sygFokus.poTerminie} po terminie`} alarm={sygFokus.poTerminie > 0} />
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className="flex min-w-0 flex-col gap-4">
                    <Karta tytul="Blokery i decyzje" prawa="pilne wpisy czatu i pytania bez odpowiedzi">
                        {decyzje.length ? decyzje.map(w => (
                            <Wpis key={w.id} w={w} nazwaPozycji={nazwa(w.nodeId)} onPozycja={() => onOtworz(w.nodeId)} onZamknijBloker={onZamknijBloker} />
                        )) : <div className="px-3 py-4 text-[12px] text-gray-600">Nic nie blokuje tej gałęzi.</div>}
                    </Karta>
                    <Karta tytul="Najbliższe 14 dni" prawa="dostawy z prognoz, start robót z harmonogramu">
                        {najblizsze.length ? (
                            <table className="w-full text-[12.5px]">
                                <tbody>
                                    {najblizsze.map(({ l, dost, rob }) => (
                                        <tr key={l.id} onClick={() => onOtworz(l.id)} className="cursor-pointer border-b border-white/[.05] last:border-b-0 hover:bg-white/[.03]">
                                            <td className="max-w-[260px] truncate px-3 py-1.5" title={l.name}>{nazwaWyswietlana(l, pelne)}</td>
                                            <td className="px-3 py-1.5 font-mono text-gray-400">{dost && `dost. ${kiedyTekst(dost)}`}</td>
                                            <td className="px-3 py-1.5 font-mono text-gray-400">{rob && `rob. ${kiedyTekst(rob)}`}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <div className="px-3 py-4 text-[12px] text-gray-600">Brak dostaw i startów robót w najbliższych 14 dniach.</div>}
                    </Karta>
                </div>
                <Karta tytul="Wątek gałęzi" prawa={`${liscie.length} pozycji`}>
                    <FiltryWatku wpisy={wpisy} filtr={filtr} setFiltr={setFiltr} />
                    <div className="max-h-[560px] overflow-auto">
                        {widoczne.length ? widoczne.map(w => (
                            <Wpis key={w.id} w={w} nazwaPozycji={nazwa(w.nodeId)} onPozycja={() => onOtworz(w.nodeId)} onZamknijBloker={onZamknijBloker} />
                        )) : <div className="px-3 py-4 text-[12px] text-gray-600">Brak wpisów tego rodzaju.</div>}
                    </div>
                </Karta>
            </div>
        </div>
    );
}

const Kafel = ({ l, v, s, alarm }) => (
    <div className="flex flex-col gap-0.5 bg-[#0a1120] px-3 py-2.5">
        <span className="text-[10.5px] uppercase tracking-wider text-gray-500">{l}</span>
        <span className={`font-mono text-lg tabular-nums ${alarm ? 'text-red-300' : 'text-gray-100'}`}>{v}</span>
        <span className="text-[11px] text-gray-500">{s}</span>
    </div>
);
