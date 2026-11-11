import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { API_URL } from '../../config';
import { buildBranchIndex, SYNTHETIC_ROOT } from '../shared/RealizationNewTab';
import { LEAF_TYPES, OPEN_LEAF_TYPES, TYPE_META, wbsRootOf } from '../shared/wbs/realizationShared';
import { applyGroupMultipliers, stripRejectedNodes, isCostNode } from '../shared/wbs/wbsConstants';
import { useBranchFocus, idGaleziPoKluczu } from '../../hooks/useBranchFocus';
import { fmtMoney } from '../../utils/currency';
import { navZIndeksu } from './SidebarBranchTree';
import { dodajMilestoneApi, dataIsoLokalna } from '../shared/wbs/milestoneApi';

const PELNE_KEY = 'realizacja-pelne-nazwy'; // wspólny z Realizacją przełącznik „pełne nazwy”

// @anchor use-drzewo-planu — drzewo gałęzi w lewym panelu w soczewce PLANU: gałęzie i pozycje z podanej
// wersji, koszt planu poddrzewa (tylko ADMIN/MANAGER), wybrana gałąź wspólna (`use-branch-focus`).
// Używa go Planowanie (na żywym `wbsData`) i `DrzewoPlanu` na pozostałych zakładkach zamówienia.
// Krótkich nazw tu nie edytujemy: zapis Struktury (`saveTree`) odsyła całe drzewo ze stanu i nadpisałby
// świeżo zmienioną nazwę. `gotowe = false` wstrzymuje publikację (np. w trakcie wczytywania).
// Zwraca { navIdx, navFocusId, setFocus } — `navFocusId` to id gałęzi w TEJ wersji albo `SYNTHETIC_ROOT`.
// `dodajMs({ parentId, name, dzien })` → { zaleznych } — szybki milestone z drzewa (`+◆`), tylko ADMIN/MANAGER.
export function useDrzewoPlanu({ nodeId, wbsData, orderName = '', isManagerOrAdmin = false, setBranchNav, gotowe = true, kosztoweWezly = null, dodajMs = null }) {
    const navIdx = useMemo(
        () => buildBranchIndex(wbsData || [], orderName, isManagerOrAdmin ? LEAF_TYPES : OPEN_LEAF_TYPES),
        [wbsData, orderName, isManagerOrAdmin],
    );
    const kosztowe = useMemo(() => kosztoweWezly || applyGroupMultipliers(stripRejectedNodes(wbsData || [])), [kosztoweWezly, wbsData]);
    const kosztPoId = useMemo(() => {
        const m = new Map();
        for (const n of kosztowe) {
            if (isCostNode(n)) m.set(n.id, Math.max(0, parseFloat(n.unitCost) || 0) * Math.max(0, parseFloat(n.quantity) || 0));
        }
        return m;
    }, [kosztowe]);
    const { galezie, pozycje } = useMemo(() => navZIndeksu(navIdx, SYNTHETIC_ROOT, {
        typLabel: (t) => TYPE_META[t]?.label || t,
        galaz: (b) => {
            if (!isManagerOrAdmin) return {};
            const koszt = navIdx.leavesOfSubtree(b.id).reduce((s, l) => s + (kosztPoId.get(l.id) || 0), 0);
            return { koszt, kosztTytul: `Koszt planu (wersja robocza): ${fmtMoney(koszt)}` };
        },
    }), [navIdx, kosztPoId, isManagerOrAdmin]);

    const [focusKlucz, setFocusKlucz] = useBranchFocus(nodeId);
    const idPoKluczu = useMemo(() => idGaleziPoKluczu(navIdx.branches, wbsRootOf), [navIdx]);
    const focus = idPoKluczu.get(focusKlucz) ?? SYNTHETIC_ROOT;
    const navFocusId = navIdx.nodeById[focus] && !LEAF_TYPES.includes(navIdx.nodeById[focus]?.type) ? focus : SYNTHETIC_ROOT;
    const setFocus = useCallback((id) => {
        const n = navIdx.nodeById[id];
        setFocusKlucz(!n || id === SYNTHETIC_ROOT ? SYNTHETIC_ROOT : wbsRootOf(n));
    }, [navIdx, setFocusKlucz]);

    // @anchor drzewo-planu-data-ms — domyślna data nowego milestone'a: ostatni dzień zapisanych dat poddrzewa
    // gałęzi (koniec robót), a gdy gałąź nie ma dat — dziś.
    const domyslnaDataMs = useCallback((id) => {
        const dzieci = new Map();
        for (const n of wbsData || []) { const k = n.parentId || ''; if (!dzieci.has(k)) dzieci.set(k, []); dzieci.get(k).push(n); }
        let max = null;
        const walk = (pid) => { for (const c of dzieci.get(pid) || []) { if (c.ganttEnd) { const t = new Date(c.ganttEnd).getTime(); if (!isNaN(t) && (max == null || t > max)) max = t; } walk(c.id); } };
        walk(id);
        return dataIsoLokalna(max != null ? max - 24 * 60 * 60 * 1000 : Date.now());
    }, [wbsData]);

    const [pozycja, setPozycja] = useState(null);
    const [pelne, setPelneState] = useState(() => { try { return sessionStorage.getItem(PELNE_KEY) === '1'; } catch { return false; } });
    const ref = useRef({});
    ref.current = {
        idx: navIdx,
        poId: { ...navIdx.nodeById, ...Object.fromEntries((navIdx.milestones || []).map(m => [m.id, m])) },
        setFocus,
        dodajMs,
        domyslnaDataMs,
        setPelne: (v) => { setPelneState(v); try { sessionStorage.setItem(PELNE_KEY, v ? '1' : '0'); } catch { /* tryb prywatny */ } },
    };

    useEffect(() => {
        if (!setBranchNav || !gotowe) return;
        setBranchNav({
            lens: 'plan',
            orderId: nodeId,
            rootId: SYNTHETIC_ROOT,
            galezie,
            pozycje,
            focusId: navFocusId,
            selectedId: (pozycja && ref.current.poId[pozycja]) ? pozycja : navFocusId,
            pelne,
            canRename: false,
            onFocus: (id) => { setPozycja(null); ref.current.setFocus(id); },
            onPozycja: (id) => {
                const l = ref.current.poId[id];
                setPozycja(id);
                if (l) ref.current.setFocus(l.branchId || SYNTHETIC_ROOT);
            },
            onRename: () => {},
            onDodajMs: isManagerOrAdmin && dodajMs ? (id, name, dzien) => ref.current.dodajMs({ parentId: id, name, dzien }) : null,
            domyslnaDataMs: (id) => ref.current.domyslnaDataMs(id),
            onPelne: (v) => ref.current.setPelne(v),
            sygnaly: false,
            onSygnaly: () => {},
        });
    }, [setBranchNav, gotowe, nodeId, galezie, pozycje, navFocusId, pozycja, pelne, navIdx, isManagerOrAdmin, !!dodajMs]); // eslint-disable-line react-hooks/exhaustive-deps
    // Bez czyszczenia przy odmontowaniu — następna zakładka nadpisze drzewo (`branch-nav-bez-czyszczenia`).

    return { navIdx, navFocusId, setFocus, domyslnaDataMs };
}

// @anchor drzewo-planu — publikator drzewa gałęzi dla zakładek zamówienia, które same go nie publikują
// (Informacje o zamówieniu, Dokumentacja, Schemat, Baza materiałów…). Nic nie rysuje w środku — tylko
// wczytuje WBS wersji i wystawia drzewo do lewego panelu. Klik w gałąź zapamiętuje ją (wspólny wybór),
// więc po przejściu do Planowania albo Realizacji jesteś od razu na tej gałęzi.
export default function DrzewoPlanu({ nodeId, versionId = null, orderName = '', userRoles = [], setBranchNav }) {
    const isManagerOrAdmin = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
    const [wbsData, setWbsData] = useState(null);
    const [odswiez, setOdswiez] = useState(0);
    useEffect(() => {
        if (!nodeId) return undefined;
        let anulowane = false;
        (async () => {
            try {
                const res = await fetch(`${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, {
                    headers: { Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}` },
                });
                const d = res.ok ? await res.json() : null;
                if (!anulowane) setWbsData(d?.items || []);
            } catch { if (!anulowane) setWbsData([]); }
        })();
        return () => { anulowane = true; };
    }, [nodeId, versionId, odswiez]);
    const dodajMs = useCallback(async ({ parentId, name, dzien }) => {
        const r = await dodajMilestoneApi({ nodeId, versionId, parentId, name, dzien });
        setOdswiez(x => x + 1);
        return r;
    }, [nodeId, versionId]);
    useDrzewoPlanu({ nodeId, wbsData, orderName, isManagerOrAdmin, setBranchNav, gotowe: wbsData !== null, dodajMs });
    return null;
}
