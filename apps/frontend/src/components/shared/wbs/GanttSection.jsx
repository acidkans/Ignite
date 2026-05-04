import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Gantt, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';

const DAY_MS = 24 * 60 * 60 * 1000;

const easterDate = (year) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const L = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * L) / 451);
    const month = Math.floor((h + L - 7 * m + 114) / 31);
    const day = ((h + L - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
};

const _holidaysCache = {};
const polishHolidaysSet = (year) => {
    if (_holidaysCache[year]) return _holidaysCache[year];
    const easter = easterDate(year);
    const easterMon = new Date(easter); easterMon.setDate(easter.getDate() + 1);
    const corpusChristi = new Date(easter); corpusChristi.setDate(easter.getDate() + 60);
    const days = [
        new Date(year, 0, 1), new Date(year, 0, 6),
        easter, easterMon,
        new Date(year, 4, 1), new Date(year, 4, 3),
        corpusChristi,
        new Date(year, 7, 15),
        new Date(year, 10, 1), new Date(year, 10, 11),
        new Date(year, 11, 25), new Date(year, 11, 26),
    ];
    const set = new Set(days.map(d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`));
    _holidaysCache[year] = set;
    return set;
};

const isPolishHoliday = (date) => {
    const set = polishHolidaysSet(date.getFullYear());
    return set.has(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
};

const isWorkType = (t) => {
    const s = String(t || '').toLowerCase();
    return s === 'work' || s === 'praca';
};
const isMaterialType = (t) => {
    const s = String(t || '').toLowerCase();
    return s === 'material' || s === 'materiał' || s === 'materiał';
};
const isServiceType = (t) => {
    const s = String(t || '').toLowerCase();
    return s === 'service' || s === 'usługa' || s === 'usluga' || s === 'pakiet';
};

const nodeDurationDays = (node) => {
    if (isWorkType(node.type)) {
        const u = String(node.unit || '').toLowerCase().trim();
        const isDni = u === 'dni' || u === 'dzień' || u === 'dzien' || u === 'd' || u === '';
        const qty = Number(String(node.quantity ?? '').replace(',', '.')) || 0;
        if (isDni && qty > 0) return Math.max(1, Math.round(qty));
    }
    return 0;
};

const colorForType = (type) => {
    if (isWorkType(type)) return { bg: '#10b981', sel: '#059669', prog: '#34d399' };
    if (isMaterialType(type)) return { bg: '#f59e0b', sel: '#d97706', prog: '#fbbf24' };
    if (isServiceType(type)) return { bg: '#8b5cf6', sel: '#7c3aed', prog: '#a78bfa' };
    return { bg: '#3b82f6', sel: '#2563eb', prog: '#60a5fa' };
};

const isNonWorkingDay = (date) => {
    const dow = date.getDay();
    return dow === 0 || dow === 6 || isPolishHoliday(date);
};

const advanceToWorkingDay = (date) => {
    const d = new Date(date);
    while (isNonWorkingDay(d)) d.setDate(d.getDate() + 1);
    return d;
};

const addWorkingDays = (start, dur) => {
    const d = new Date(start);
    let remaining = dur;
    while (remaining > 0) {
        d.setDate(d.getDate() + 1);
        if (!isNonWorkingDay(new Date(d.getTime() - DAY_MS))) {
            remaining -= 1;
        }
    }
    return d;
};

// branchWorkOnHolidays: { [nodeId]: boolean } – per-branch setting for depth-0 nodes
const buildTasksFromTree = (items, projectStart, projectName, overrides, branchWorkOnHolidays) => {
    const tasks = [];
    const taskBranchMap = {};
    let cursor = new Date(projectStart);
    cursor.setHours(0, 0, 0, 0);
    let rootMaxEnd = new Date(cursor);

    const hasNonMaterialLeaf = (node) => {
        if (Array.isArray(node.children) && node.children.length > 0) {
            return node.children.some(hasNonMaterialLeaf);
        }
        return !isMaterialType(node.type);
    };

    const walk = (nodes, parentId, depth, branchWow, currentBranchId) => {
        let groupStart = null;
        let groupEnd = null;

        for (const node of nodes) {
            if (isMaterialType(node.type) && !(Array.isArray(node.children) && node.children.length > 0)) continue;
            const hasChildren = Array.isArray(node.children) && node.children.length > 0;
            if (hasChildren && !hasNonMaterialLeaf(node)) continue;

            const colors = colorForType(node.type);
            const niceName = String(node.name || '').trim() || '(bez nazwy)';

            const wow = depth === 0 ? (branchWorkOnHolidays[node.id] ?? false) : branchWow;
            const thisBranchId = depth === 0 ? node.id : currentBranchId;

            if (depth === 0 && hasChildren) {
                if (!wow) cursor = advanceToWorkingDay(cursor);
                walk(node.children, parentId, depth + 1, wow, thisBranchId);
                continue;
            }

            if (hasChildren) {
                taskBranchMap[node.id] = thisBranchId;
                const placeholderIdx = tasks.length;
                tasks.push(null);
                const beforeCursor = new Date(cursor);
                walk(node.children, node.id, depth + 1, wow, thisBranchId);
                const afterCursor = new Date(cursor);
                const start = beforeCursor;
                const end = afterCursor.getTime() === beforeCursor.getTime()
                    ? new Date(beforeCursor.getTime() + DAY_MS)
                    : afterCursor;
                const grpColors = colorForType('group');
                tasks[placeholderIdx] = {
                    id: node.id,
                    type: 'project',
                    name: niceName,
                    start,
                    end,
                    progress: 0,
                    hideChildren: false,
                    project: parentId || undefined,
                    styles: {
                        backgroundColor: grpColors.bg,
                        backgroundSelectedColor: grpColors.sel,
                        progressColor: grpColors.prog,
                        progressSelectedColor: grpColors.sel,
                    },
                };
                if (!groupStart || start < groupStart) groupStart = start;
                if (!groupEnd || end > groupEnd) groupEnd = end;
            } else {
                taskBranchMap[node.id] = thisBranchId;
                if (depth === 0 && !wow) cursor = advanceToWorkingDay(cursor);

                // Per-task WoH override — jeśli zadanie ma własne ustawienie, nadpisuje gałąź
                const effectiveWow = Object.prototype.hasOwnProperty.call(branchWorkOnHolidays, node.id)
                    ? branchWorkOnHolidays[node.id]
                    : wow;
                const dur = nodeDurationDays(node);
                const ovr = overrides?.[node.id];
                let start, end, type;
                const alwaysMilestone = isServiceType(node.type);
                if (ovr?.start && ovr?.end) {
                    start = new Date(ovr.start);
                    end = alwaysMilestone ? new Date(start.getTime() + DAY_MS) : new Date(ovr.end);
                    type = alwaysMilestone ? 'milestone' : ((end - start) <= DAY_MS / 2 ? 'milestone' : 'task');
                } else if (dur > 0 && !alwaysMilestone) {
                    start = effectiveWow ? new Date(cursor) : advanceToWorkingDay(cursor);
                    end = effectiveWow
                        ? new Date(start.getTime() + dur * DAY_MS)
                        : addWorkingDays(start, dur);
                    type = 'task';
                } else {
                    start = effectiveWow ? new Date(cursor) : advanceToWorkingDay(cursor);
                    end = new Date(start.getTime() + DAY_MS);
                    type = 'milestone';
                }
                tasks.push({
                    id: node.id,
                    type,
                    name: niceName,
                    start,
                    end,
                    progress: 0,
                    project: parentId || undefined,
                    styles: {
                        backgroundColor: colors.bg,
                        backgroundSelectedColor: colors.sel,
                        progressColor: colors.prog,
                        progressSelectedColor: colors.sel,
                    },
                });
                cursor = new Date(end);
                if (!groupStart || start < groupStart) groupStart = start;
                if (!groupEnd || end > groupEnd) groupEnd = end;
            }
        }
        if (groupEnd && groupEnd > rootMaxEnd) rootMaxEnd = new Date(groupEnd);
    };

    walk(items, null, 0, false, null);
    return { tasks, taskBranchMap };
};

const VIEW_OPTS = [
    { v: ViewMode.Day, label: 'Dzień' },
    { v: ViewMode.Week, label: 'Tydzień' },
    { v: ViewMode.Month, label: 'Miesiąc' },
];

export default function GanttSection({ wbsTree, projectName, onNodeDurationChange }) {
    const items = wbsTree?.items || [];
    const [viewMode, setViewMode] = useState(ViewMode.Day);
    const [projectStart, setProjectStart] = useState(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.toISOString().slice(0, 10);
    });
    const [overrides, setOverrides] = useState({});
    const [branchWorkOnHolidays, setBranchWorkOnHolidays] = useState({});
    const [popup, setPopup] = useState(null); // { x, y, branchId } | null
    const wrapperRef = useRef(null);
    const popupRef = useRef(null);

    const toggleBranch = useCallback((branchId) => {
        setBranchWorkOnHolidays(prev => ({
            ...prev,
            [branchId]: !(prev[branchId] ?? false),
        }));
    }, []);

    const { tasks, taskBranchMap } = useMemo(
        () => buildTasksFromTree(items, new Date(projectStart), projectName, overrides, branchWorkOnHolidays),
        [items, projectStart, projectName, overrides, branchWorkOnHolidays]
    );

    // Mapa taskId → nazwa (wszystkie taski w harmonogramie)
    const branchInfoMap = useMemo(() => {
        const m = {};
        for (const task of tasks) {
            if (task) m[task.id] = task.name;
        }
        return m;
    }, [tasks]);

    const onDateChange = useCallback((task) => {
        if (task.type === 'milestone') return;

        let start = new Date(task.start); start.setHours(0, 0, 0, 0);
        let end   = new Date(task.end);   end.setHours(0, 0, 0, 0);
        if (end.getTime() <= start.getTime()) end.setDate(start.getDate() + 1);

        const branchId   = taskBranchMap[task.id];
        const effectiveWow = Object.prototype.hasOwnProperty.call(branchWorkOnHolidays, task.id)
            ? (branchWorkOnHolidays[task.id] ?? false)
            : (branchWorkOnHolidays[branchId] ?? false);

        let notifyDays;
        if (!effectiveWow) {
            // Zlicz dni robocze w przeciągniętym przedziale
            let workDays = 0;
            const cur = new Date(start);
            while (cur < end) {
                if (!isNonWorkingDay(cur)) workDays++;
                cur.setDate(cur.getDate() + 1);
            }
            workDays = Math.max(1, workDays);
            // Snap start na najbliższy dzień roboczy, przelicz end zachowując workDays
            start = advanceToWorkingDay(start);
            end   = addWorkingDays(start, workDays);
            notifyDays = workDays;
        } else {
            notifyDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
        }

        setOverrides(prev => {
            const next = { ...prev, [task.id]: { start: start.toISOString(), end: end.toISOString() } };
            // Zakotwicz pozostałe taski na ich bieżących pozycjach — zapobiega kaskadzie
            for (const t of tasks) {
                if (!t || next[t.id] || t.type === 'project') continue;
                const ts = new Date(t.start); ts.setHours(0, 0, 0, 0);
                const te = new Date(t.end);   te.setHours(0, 0, 0, 0);
                next[t.id] = { start: ts.toISOString(), end: te.toISOString() };
            }
            return next;
        });
        if (task.id !== '__root__' && task.type !== 'project') {
            onNodeDurationChange?.(task.id, notifyDays);
        }
    }, [onNodeDurationChange, branchWorkOnHolidays, taskBranchMap, tasks]);

    const resetOverrides = useCallback(() => setOverrides({}), []);

    // Hover na barach SVG w timeline → popup per gałąź (depth-0)
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper || !tasks.length) return;

        const apply = () => {
            // Bary SVG mają g[tabindex] — jeden per task, w kolejności tasks[]
            const barGroups = wrapper.querySelectorAll('svg g[tabindex]');
            if (!barGroups.length) return false;
            const removers = [];
            barGroups.forEach((g, i) => {
                const task = tasks[i];
                if (!task || !branchInfoMap[task.id]) return;
                const branchId = task.id;
                const onEnter = () => {
                    const rect = g.getBoundingClientRect();
                    const POPUP_H = 80;
                    const showAbove = rect.top > POPUP_H + 20;
                    setPopup({
                        x: Math.min(rect.left + 4, window.innerWidth - 230),
                        y: showAbove ? rect.top - POPUP_H - 4 : rect.bottom + 4,
                        branchId,
                    });
                };
                g.addEventListener('mouseenter', onEnter);
                removers.push(() => g.removeEventListener('mouseenter', onEnter));
            });
            return removers.length > 0 ? () => removers.forEach(fn => fn()) : false;
        };

        let cleanup = null;
        let cancelled = false;
        const tries = [100, 400, 900];
        const timers = tries.map(ms => setTimeout(() => {
            if (!cancelled) { const r = apply(); if (r) cleanup = r; }
        }, ms));
        return () => { cancelled = true; timers.forEach(clearTimeout); cleanup?.(); };
    }, [tasks, taskBranchMap, branchInfoMap]);

    // Zamknij popup po kliknięciu poza nim
    useEffect(() => {
        if (!popup) return;
        const handle = (e) => {
            if (!popupRef.current?.contains(e.target)) setPopup(null);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [popup]);

    // Nakładka weekend/święta — zawsze lekkie tło POD barami; hover otwiera popup gałęzi
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const cleanup = () => {
            wrapper.querySelectorAll('.ignite-weekend-band').forEach(el => el.remove());
            wrapper.querySelectorAll('.ignite-seg-g').forEach(el => el.remove());
            wrapper.querySelectorAll('[data-ignite-split]').forEach(el => {
                if (el.dataset.igniteOrigFill) el.setAttribute('fill', el.dataset.igniteOrigFill);
                el.style.opacity = '';
                delete el.dataset.igniteSplit;
                delete el.dataset.igniteOrigFill;
            });
        };

        if (viewMode !== ViewMode.Day || !tasks.length) {
            cleanup();
            return;
        }

        const COL = 50;
        const earliest = tasks.reduce((m, tk) => tk.start < m ? tk.start : m, tasks[0].start);
        const latest = tasks.reduce((m, tk) => tk.end > m ? tk.end : m, tasks[0].end);
        const firstDate = new Date(earliest);
        firstDate.setHours(0, 0, 0, 0);
        firstDate.setDate(firstDate.getDate() - 1);
        const lastDate = new Date(latest);
        lastDate.setHours(0, 0, 0, 0);
        lastDate.setDate(lastDate.getDate() + 2);
        const totalDays = Math.max(1, Math.round((lastDate - firstDate) / DAY_MS) + 1);

        const apply = () => {
            cleanup();
            const verticalContainer = wrapper.querySelector('[class*="CZjuD"], [class*="ganttVerticalContainer"]');
            if (!verticalContainer) return false;
            const horiz = verticalContainer.children[1];
            if (!horiz || !horiz.querySelector('svg')) return false;
            const innerSvg = horiz.querySelector('svg');
            const innerH = innerSvg.getBoundingClientRect().height || parseFloat(innerSvg.getAttribute('height') || '0');
            if (!innerH) return false;

            if (getComputedStyle(horiz).position === 'static') horiz.style.position = 'relative';

            const overlay = document.createElement('div');
            overlay.className = 'ignite-weekend-band';
            overlay.style.cssText = `position:absolute; top:0; left:0; height:${innerH}px; width:${totalDays * COL}px; pointer-events:none; z-index:3;`;

            for (let i = 0; i < totalDays; i++) {
                const date = new Date(firstDate);
                date.setDate(firstDate.getDate() + i);
                const dow = date.getDay();
                const holiday = isPolishHoliday(date);
                if (dow !== 0 && dow !== 6 && !holiday) continue;

                const band = document.createElement('div');
                band.style.cssText = `position:absolute; top:0; height:100%; left:${i * COL}px; width:${COL}px; background:repeating-linear-gradient(45deg,rgba(248,113,113,0.18) 0px,rgba(248,113,113,0.18) 3px,rgba(8,12,22,0.55) 3px,rgba(8,12,22,0.55) 8px); pointer-events:none;`;
                overlay.appendChild(band);
            }

            horiz.appendChild(overlay);

            // --- Rozbijanie barów na segmenty: podmiana rectów ---
            const NS = 'http://www.w3.org/2000/svg';
            const barGroups = innerSvg.querySelectorAll('g[tabindex]');

            barGroups.forEach((g, i) => {
                const task = tasks[i];
                if (!task || task.type !== 'task') return;

                const branchId = taskBranchMap[task.id];
                const effectiveWow = Object.prototype.hasOwnProperty.call(branchWorkOnHolidays, task.id)
                    ? (branchWorkOnHolidays[task.id] ?? false)
                    : (branchWorkOnHolidays[branchId] ?? false);
                if (effectiveWow) return;

                const taskStart = new Date(task.start); taskStart.setHours(0, 0, 0, 0);
                const taskEnd   = new Date(task.end);   taskEnd.setHours(0, 0, 0, 0);
                const totalDays = Math.round((taskEnd - taskStart) / DAY_MS);
                if (totalDays <= 0) return;

                // Segmenty ciągłych dni roboczych (jako offsety od task.start)
                const segs = [];
                let inSeg = false, segS = 0;
                for (let d = 0; d < totalDays; d++) {
                    const nw = isNonWorkingDay(new Date(taskStart.getTime() + d * DAY_MS));
                    if (!nw && !inSeg) { inSeg = true; segS = d; }
                    else if (nw && inSeg) { inSeg = false; segs.push([segS, d]); }
                }
                if (inSeg) segs.push([segS, totalDays]);
                if (segs.length <= 1) return;

                const barInner = g.children[0];
                if (!barInner) return;
                const bgRect = barInner.querySelector('rect');
                if (!bgRect || bgRect.dataset.igniteSplit) return;

                const labelG = g.children[1];
                const origText = labelG?.querySelector('text');

                const bx   = parseFloat(bgRect.getAttribute('x')      || '0');
                const by   = parseFloat(bgRect.getAttribute('y')      || '0');
                const bh   = parseFloat(bgRect.getAttribute('height') || '0');
                const brx  = Math.min(parseFloat(bgRect.getAttribute('rx') || '4'), 4);
                const fill = bgRect.getAttribute('fill') || '#10b981';
                const textFill = origText?.getAttribute('fill') || '#fff';
                const fontSize = origText?.getAttribute('font-size') || '12';

                bgRect.dataset.igniteSplit    = '1';
                bgRect.dataset.igniteOrigFill = fill;
                bgRect.style.opacity = '0';
                if (origText) { origText.dataset.igniteSplit = '1'; origText.style.opacity = '0'; }

                const segG = document.createElementNS(NS, 'g');
                segG.classList.add('ignite-seg-g');

                for (const [s, e] of segs) {
                    const sx = bx + s * COL;
                    const sw = (e - s) * COL;

                    const r = document.createElementNS(NS, 'rect');
                    r.setAttribute('x', String(sx));
                    r.setAttribute('y', String(by));
                    r.setAttribute('width', String(sw));
                    r.setAttribute('height', String(bh));
                    r.setAttribute('rx', String(brx));
                    r.setAttribute('fill', fill);
                    r.setAttribute('pointer-events', 'none');
                    segG.appendChild(r);

                    const txt = document.createElementNS(NS, 'text');
                    txt.setAttribute('x', String(sx + sw / 2));
                    txt.setAttribute('y', String(by + bh / 2 + 1));
                    txt.setAttribute('text-anchor', 'middle');
                    txt.setAttribute('dominant-baseline', 'middle');
                    txt.setAttribute('fill', textFill);
                    txt.setAttribute('font-size', fontSize);
                    txt.setAttribute('font-family', 'Inter, system-ui, sans-serif');
                    txt.setAttribute('pointer-events', 'none');
                    txt.textContent = task.name;
                    segG.appendChild(txt);
                }

                g.appendChild(segG);
            });

            return true;
        };

        let cancelled = false;
        const tries = [50, 200, 600, 1200];
        const timers = tries.map(ms => setTimeout(() => { if (!cancelled) apply(); }, ms));
        return () => { cancelled = true; timers.forEach(clearTimeout); cleanup(); };
    }, [tasks, viewMode, taskBranchMap, branchWorkOnHolidays]);

    const exportPdf = useCallback(() => {
        const node = wrapperRef.current?.querySelector('.ignite-gantt-print');
        if (!node) return;
        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
            .map(s => s.outerHTML)
            .join('\n');
        const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Gantt – ${projectName || 'Projekt'}</title>
${styles}
<style>
@page { size: A3 landscape; margin: 8mm; }
html, body { background:#fff; color:#0b0f17; margin:0; padding:0; font-family: Inter, system-ui, sans-serif; }
h1 { font-size: 18px; margin: 0 0 12px 0; }
.meta { font-size: 11px; color:#475569; margin-bottom:14px; }
.wrap { background:#fff; }
.wrap ._WuQ0f { background:#fff !important; }
.wrap text { fill:#0b0f17 !important; }
</style>
</head><body>
<h1>${(projectName || 'Projekt').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c])}</h1>
<div class="meta">Harmonogram – wygenerowano ${new Date().toLocaleString('pl-PL')}</div>
<div class="wrap">${node.outerHTML}</div>
<script>setTimeout(()=>{window.print();}, 400);</script>
</body></html>`;
        const win = window.open('', '_blank', 'width=1400,height=900');
        if (!win) { alert('Wyłącz blokadę pop-upów aby wyeksportować PDF.'); return; }
        win.document.open();
        win.document.write(html);
        win.document.close();
    }, [projectName]);

    if (!items.length) {
        return (
            <div className="p-6 text-center text-gray-500 text-sm">
                Brak danych w strukturze WBS – dodaj produkty / pozycje pracy żeby zobaczyć harmonogram.
            </div>
        );
    }

    const hasOverrides = Object.keys(overrides).length > 0;
    const activeBranches = Object.values(branchWorkOnHolidays).filter(Boolean).length;
    const popupBranchId = popup?.branchId;

    return (
        <div ref={wrapperRef} className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-white/[0.02] text-xs flex-wrap">
                <label className="flex items-center gap-2 text-gray-300">
                    Start projektu:
                    <input
                        type="date"
                        value={projectStart}
                        onChange={(e) => setProjectStart(e.target.value)}
                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs"
                    />
                </label>
                <div className="flex items-center gap-1">
                    {VIEW_OPTS.map(o => (
                        <button
                            key={o.v}
                            onClick={() => setViewMode(o.v)}
                            className={`px-2 py-1 rounded border text-[10px] uppercase tracking-widest ${viewMode === o.v ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}`}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
                {hasOverrides && (
                    <button
                        onClick={resetOverrides}
                        className="px-2 py-1 rounded border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 text-[10px] uppercase tracking-widest"
                    >
                        Reset zmian ({Object.keys(overrides).length})
                    </button>
                )}
                {activeBranches > 0 && (
                    <span className="text-[10px] text-cyan-400/70">
                        {activeBranches} {activeBranches === 1 ? 'grupa' : 'grupy'} pracuje w dni wolne
                    </span>
                )}
                <div className="ml-auto flex items-center gap-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#10b981' }} />praca</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#8b5cf6' }} />usługa/pakiet</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: 'rgba(248,113,113,0.4)' }} />dzień wolny</span>
                    <button
                        onClick={exportPdf}
                        className="ml-2 flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-red-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                        Eksport PDF
                    </button>
                </div>
            </div>

            <div className="ignite-gantt-print flex-1 min-h-0 overflow-auto custom-scrollbar bg-white/[0.02]">
                <Gantt
                    tasks={tasks}
                    viewMode={viewMode}
                    locale="pl"
                    listCellWidth="220px"
                    columnWidth={viewMode === ViewMode.Day ? 50 : viewMode === ViewMode.Week ? 90 : 220}
                    rowHeight={32}
                    barCornerRadius={4}
                    fontSize="12px"
                    fontFamily="Inter, system-ui, sans-serif"
                    onDateChange={onDateChange}
                    timeStep={DAY_MS}
                    todayColor="rgba(34,211,238,0.18)"
                    TooltipContent={() => null}
                />
            </div>

            {popup && popupBranchId && branchInfoMap[popupBranchId] && (
                <div
                    ref={popupRef}
                    style={{
                        position: 'fixed',
                        left: Math.min(popup.x, window.innerWidth - 220),
                        top: Math.min(popup.y, window.innerHeight - 90),
                        zIndex: 9999,
                    }}
                    className="bg-[#0d1520]/96 border border-white/15 rounded-lg px-3 py-2.5 shadow-2xl backdrop-blur-sm"
                >
                    <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-1.5 font-bold select-none">
                        Praca w dni wolne
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs hover:text-white text-gray-200 transition-colors">
                        <input
                            type="checkbox"
                            checked={branchWorkOnHolidays[popupBranchId] ?? false}
                            onChange={() => toggleBranch(popupBranchId)}
                            className="accent-cyan-400 cursor-pointer"
                        />
                        <span className="truncate max-w-[180px] font-medium">
                            {branchInfoMap[popupBranchId]}
                        </span>
                    </label>
                </div>
            )}
        </div>
    );
}
