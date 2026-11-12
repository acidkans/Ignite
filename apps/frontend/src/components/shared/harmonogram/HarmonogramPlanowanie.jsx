// Harmonogram w Planowaniu (sekcja „Harmonogram" w UnifiedWbsPanel) — zastępuje dawny GanttSection.
// Buduje wiersze z drzewa WBS tą samą logiką dat co Realizacja (`buildTasksFromTree`: zapisane
// `ganttStart/End` albo start projektu + czas trwania z ilości/jednostki), grupuje je w gałęzie
// pierwszego poziomu i podaje do wspólnego komponentu `Harmonogram`. Pola Start/Koniec projektu
// rysują markery; zmiana Startu przesuwa wszystkie zapisane paski razem z nim (jak w Gantcie).
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Harmonogram from './Harmonogram';
import {
    DAY_MS, isValidGanttDate, buildTasksFromTree, inclusiveEnd, advanceToWorkingDay, addWorkingDays, isNonWorkingDay,
    zaleznyOdMilestone, splaszczDrzewo, miejsceMilestona,
} from './harmonogramCzas';
import '../realizacja/realizacja.css';

const dzisIso = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const nazwaPelna = (n) => String(n?.name || '').trim() || '(bez nazwy)';

// @anchor harmonogram-planowanie
export default function HarmonogramPlanowanie({
    wbsTree, projectName, projectStartDate, projectEndDate,
    onNodeDurationChange, onGanttDateChange, onGanttDatesBatch, onGetHtmlReady, onExcelDataReady, canEdit = true,
    onPrzestaw = null,
    // @anchor harmonogram-planowanie-widok — Set id poddrzewa gałęzi wybranej w drzewie (`planowanie-focus-widok`)
    // albo null. Zawęża WIERSZE; reguły milestone'ów (`msZaleznosc`, `msWezly`) liczą się na całym drzewie.
    // Eksport Excel/PDF Harmonogramu bierze to, co widać — jak przy zoomie w Realizacji.
    widokIds = null,
    // @anchor harmonogram-planowanie-dodaj-ms — `onDodajMilestone({ parentId, name, dzien, beforeId })` → { zaleznych };
    // miejsce w kolejności z dat widocznych na Harmonogramie (także domyślnych), `miejsce-milestona`.
    onDodajMilestone = null,
    // @anchor harmonogram-planowanie-node-id — zamówienie (ProcessNode) dla przycisku „Harmonogram zadań”.
    nodeId = null,
}) {
    const items = useMemo(() => wbsTree?.items || [], [wbsTree]);

    // @anchor harmonogram-planowanie-start — start/koniec projektu; surowe wartości pól osobno,
    // bo wpisywanie roku z klawiatury przechodzi przez niepoprawne daty.
    const [projectStart, setProjectStart] = useState(() => (projectStartDate ? projectStartDate.slice(0, 10) : dzisIso()));
    const [startInput, setStartInput] = useState(projectStart);
    const [projectEnd, setProjectEnd] = useState(() => (projectEndDate ? projectEndDate.slice(0, 10) : ''));
    const [endInput, setEndInput] = useState(projectEnd);
    const synced = useRef({ s: false, e: false });
    useEffect(() => {
        if (projectStartDate && !synced.current.s) { synced.current.s = true; setProjectStart(projectStartDate.slice(0, 10)); setStartInput(projectStartDate.slice(0, 10)); }
    }, [projectStartDate]);
    useEffect(() => {
        if (projectEndDate && !synced.current.e) { synced.current.e = true; setProjectEnd(projectEndDate.slice(0, 10)); setEndInput(projectEndDate.slice(0, 10)); }
    }, [projectEndDate]);

    // Zapisane daty pasków: z bazy + zmiany tej sesji (PATCH nie odświeża `wbsTree`).
    // @anchor harmonogram-planowanie-overrides
    const [overrides, setOverrides] = useState({});
    const prevTree = useRef(null);
    useEffect(() => {
        if (wbsTree === prevTree.current) return;
        prevTree.current = wbsTree;
        const z = {};
        const walk = (nodes) => { for (const n of nodes || []) { if (n.ganttStart && n.ganttEnd) z[n.id] = { start: n.ganttStart, end: n.ganttEnd }; walk(n.children); } };
        walk(items);
        setOverrides(prev => ({ ...z, ...prev }));
    }, [wbsTree, items]);

    // @anchor harmonogram-planowanie-ms — zależności od milestone'ów i daty wszystkich pasków dla reguł M3.
    const msZaleznosc = useMemo(() => zaleznyOdMilestone(splaszczDrzewo(items)), [items]);
    const { grupy, liczba, msWezly } = useMemo(() => {
        const start = new Date(`${projectStart}T00:00:00`);
        const { tasks, taskBranchMap } = buildTasksFromTree(items, isValidGanttDate(start) ? start : new Date(), projectName, overrides, {});
        const galezie = new Map();
        for (const n of items) galezie.set(n.id, { galaz: n, liscie: [] });
        const bez = { galaz: null, liscie: [] };
        const wezly = {};
        for (const t of tasks) {
            if (!t || !isValidGanttDate(t.start) || !isValidGanttDate(t.end)) continue;
            const ost = new Date(Math.max(+t.start, +inclusiveEnd(t.end)));
            const l = { ...t.node, id: t.id, planOd: new Date(t.start), planDo: ost, depth: t.depth, _canUpdateDuration: t._canUpdateDuration };
            wezly[t.id] = { type: t.node?.type, name: nazwaPelna(t.node), planOd: l.planOd, planDo: ost };
            (galezie.get(taskBranchMap[t.id]) || bez).liscie.push(l);
        }
        const out = [...galezie.values(), bez].filter(g => g.liscie.length);
        return { grupy: out, liczba: tasks.length, msWezly: wezly };
    }, [items, projectStart, projectName, overrides]);

    const savePlanDates = useCallback(async (id, od, ost) => {
        const s = new Date(od); s.setHours(0, 0, 0, 0);
        const e = new Date(ost); e.setHours(0, 0, 0, 0); e.setDate(e.getDate() + 1); // koniec wyłączny
        setOverrides(prev => ({ ...prev, [id]: { start: s.toISOString(), end: e.toISOString() } }));
        await onGanttDateChange?.(id, s.toISOString(), e.toISOString());
    }, [onGanttDateChange]);

    // @anchor harmonogram-planowanie-batch — zapis zbiorczy (milestone + zależni); błąd cofa podgląd.
    const savePlanDatesBatch = useCallback(async (lista) => {
        const zakres = lista.map(({ id, od, ost }) => {
            const s = new Date(od); s.setHours(0, 0, 0, 0);
            const e = new Date(ost); e.setHours(0, 0, 0, 0); e.setDate(e.getDate() + 1);
            return { id, ganttStart: s.toISOString(), ganttEnd: e.toISOString() };
        });
        let poprzednie = null;
        setOverrides(prev => { poprzednie = prev; const n = { ...prev }; for (const z of zakres) n[z.id] = { start: z.ganttStart, end: z.ganttEnd }; return n; });
        try {
            if (onGanttDatesBatch) await onGanttDatesBatch(zakres);
            else for (const z of zakres) await onGanttDateChange?.(z.id, z.ganttStart, z.ganttEnd);
        } catch (err) {
            if (poprzednie) setOverrides(poprzednie);
            throw err;
        }
    }, [onGanttDatesBatch, onGanttDateChange]);

    // @anchor harmonogram-planowanie-przesun-start — zmiana Startu przesuwa zapisane paski o tyle samo
    // (z zachowaniem dni roboczych); zapis do bazy z opóźnieniem, żeby nie PATCH-ować każdej cyfry.
    const pending = useRef({});
    const timer = useRef(null);
    const flush = useCallback(() => {
        clearTimeout(timer.current);
        const p = pending.current; pending.current = {};
        for (const [id, o] of Object.entries(p)) onGanttDateChange?.(id, o.start, o.end);
    }, [onGanttDateChange]);
    useEffect(() => () => flush(), [flush]);
    const zmienStart = useCallback((nowy) => {
        const stary = new Date(`${projectStart}T00:00:00`);
        const nd = new Date(`${nowy}T00:00:00`);
        setProjectStart(nowy);
        const ids = Object.keys(overrides);
        if (!ids.length) return;
        let kotwica = isValidGanttDate(stary) ? stary : null;
        for (const id of ids) { const st = new Date(overrides[id].start); st.setHours(0, 0, 0, 0); if (!kotwica || st < kotwica) kotwica = st; }
        const delta = Math.round((nd - kotwica) / DAY_MS);
        if (!delta) return;
        const next = {};
        for (const [id, o] of Object.entries(overrides)) {
            const os = new Date(o.start); os.setHours(0, 0, 0, 0);
            const oe = new Date(o.end); oe.setHours(0, 0, 0, 0);
            let wd = 0; for (const c = new Date(os); c < oe; c.setDate(c.getDate() + 1)) if (!isNonWorkingDay(c)) wd++;
            const ns = advanceToWorkingDay(new Date(os.getTime() + delta * DAY_MS));
            const ne = addWorkingDays(ns, Math.max(1, wd));
            next[id] = { start: ns.toISOString(), end: ne.toISOString() };
            pending.current[id] = next[id];
        }
        setOverrides(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, 800);
    }, [projectStart, overrides, flush]);

    const grupyWidoku = useMemo(() => (widokIds
        ? grupy.map(g => ({ ...g, liscie: g.liscie.filter(l => widokIds.has(l.id)) })).filter(g => g.liscie.length)
        : grupy), [grupy, widokIds]);

    const dodajMs = useMemo(() => (onDodajMilestone ? async (galazId, dzien, nazwa) => {
        const beforeId = miejsceMilestona(splaszczDrzewo(items), galazId, dzien, (id) => msWezly[id]?.planOd || null);
        return onDodajMilestone({ parentId: galazId, name: nazwa, dzien, beforeId });
    } : null), [onDodajMilestone, items, msWezly]);

    const onApi = useCallback(({ getExcelData, getHtml }) => {
        onExcelDataReady?.(getExcelData);
        onGetHtmlReady?.(getHtml);
    }, [onExcelDataReady, onGetHtmlReady]);

    if (!items.length || !liczba) {
        return <div className="p-6 text-center text-gray-500 text-sm">Brak danych w strukturze WBS – dodaj pozycje pracy lub usługi, żeby zobaczyć harmonogram.</div>;
    }

    return (
        <div className="rz hg-host" style={{ height: 'auto', padding: '12px 16px', background: 'transparent' }}>
            <div className="lahead" style={{ marginBottom: 6 }}>
                <div className="la-nav">
                    <label title="Start projektu — przesuwa wszystkie zapisane paski">
                        <span style={{ width: 8, height: 8, background: '#22c55e', transform: 'rotate(45deg)', display: 'inline-block' }} /> Start
                        <input type="date" value={startInput} className="hg-data"
                            onChange={e => { const v = e.target.value; setStartInput(v); if (v && isValidGanttDate(v)) zmienStart(v); }} />
                    </label>
                    <label title="Koniec projektu — marker na osi">
                        <span style={{ width: 8, height: 8, background: '#ef4444', transform: 'rotate(45deg)', display: 'inline-block' }} /> Koniec
                        <input type="date" value={endInput} className="hg-data"
                            onChange={e => { const v = e.target.value; setEndInput(v); if (!v || isValidGanttDate(v)) setProjectEnd(v); }} />
                    </label>
                </div>
            </div>
            {widokIds && !grupyWidoku.length && (<div className="p-4 text-center text-gray-500 text-sm">Ta gałąź nie ma pozycji z datami w harmonogramie.</div>)}
            <Harmonogram
                grupy={grupyWidoku} nazwa={nazwaPelna} canEdit={canEdit} savePlanDates={savePlanDates}
                msZaleznosc={msZaleznosc} msWezly={msWezly} savePlanDatesBatch={savePlanDatesBatch}
                onDurationChange={onNodeDurationChange} pokazWciecia
                domyslnyZakres="calosc" zakresKey="planowanie-harmonogram-zakres"
                projectStart={projectStart} projectEnd={projectEnd || null}
                nazwaProjektu={projectName} onApi={onApi} onPrzestaw={canEdit ? onPrzestaw : null}
                onDodajMs={canEdit ? dodajMs : null}
                processNodeId={nodeId} zakresIds={widokIds}
            />
        </div>
    );
}
