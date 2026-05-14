import { useEffect, useMemo, useRef, useState, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Gantt, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { pl } from 'date-fns/locale/pl';
registerLocale('pl', pl);

const DpPortal = ({ children }) => createPortal(<div className="ignite-dp">{children}</div>, document.body);

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
    return s === 'service' || s === 'usługa' || s === 'usluga' || s === 'pakiet' || s === 'komplet';
};
// Packet types: show as resizable bars (not milestones), duration = quantity days
const isPacketType = (t) => {
    const s = String(t || '').toLowerCase();
    return s === 'pakiet' || s === 'komplet';
};
const isDayUnit = (u) => { const s = String(u || '').toLowerCase().trim(); return s === 'dni' || s === 'dzień' || s === 'dzien' || s === 'd' || s === ''; };
const isPacketUnit = (u) => { const s = String(u || '').toLowerCase().trim(); return s === 'pakiet' || s === 'komplet'; };

const nodeDurationDays = (node) => {
    const u = String(node.unit || '').toLowerCase().trim();
    const qty = Number(String(node.quantity ?? '').replace(',', '.')) || 0;
    if (isWorkType(node.type)) {
        if (isDayUnit(u) && qty > 0) return Math.max(1, Math.round(qty));
    }
    // Packet types (type=pakiet/komplet) or work with packet units → use qty as gantt days, min 1
    if (isPacketType(node.type) || (isWorkType(node.type) && isPacketUnit(u))) {
        return qty > 0 ? Math.max(1, Math.round(qty)) : 1;
    }
    return 0;
};

const TASK_COLOR = { bg: '#1d4ed8', sel: '#1e40af', prog: '#3b82f6', text: '#93c5fd' };

const colorForNode = (_id) => TASK_COLOR;

const colorForType = (type) => colorForNode(type || 'default');

const isNonWorkingDay = (date) => {
    const dow = date.getDay();
    return dow === 0 || dow === 6 || isPolishHoliday(date);
};

const advanceToWorkingDay = (date) => {
    const d = new Date(date);
    while (isNonWorkingDay(d)) d.setDate(d.getDate() + 1);
    return d;
};

const retreatToWorkingDay = (date) => {
    const d = new Date(date);
    while (isNonWorkingDay(d)) d.setDate(d.getDate() - 1);
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

    const hasWorkOrServiceLeaf = (node) => {
        if (Array.isArray(node.children) && node.children.length > 0) {
            return node.children.some(hasWorkOrServiceLeaf);
        }
        return isWorkType(node.type) || isServiceType(node.type);
    };

    const walk = (nodes, parentId, depth, branchWow, currentBranchId) => {
        let groupStart = null;
        let groupEnd = null;

        for (const node of nodes) {
            const hasChildren = Array.isArray(node.children) && node.children.length > 0;
            if (!hasChildren && !isWorkType(node.type) && !isServiceType(node.type)) continue;
            if (hasChildren && !hasWorkOrServiceLeaf(node)) continue;

            const colors = colorForNode(node.id);
            const niceName = String(node.name || '').trim() || '(bez nazwy)';

            const wow = depth === 0 ? (branchWorkOnHolidays[node.id] ?? false) : branchWow;
            const thisBranchId = depth === 0 ? node.id : currentBranchId;

            if (hasChildren) {
                if (depth === 0 && !wow) cursor = advanceToWorkingDay(cursor);
                walk(node.children, parentId, depth + 1, wow, thisBranchId);
                continue;
            }

            {
                taskBranchMap[node.id] = thisBranchId;
                if (depth === 0 && !wow) cursor = advanceToWorkingDay(cursor);

                // Per-task WoH override — jeśli zadanie ma własne ustawienie, nadpisuje gałąź
                const effectiveWow = Object.prototype.hasOwnProperty.call(branchWorkOnHolidays, node.id)
                    ? branchWorkOnHolidays[node.id]
                    : wow;
                const dur = nodeDurationDays(node);
                const ovr = overrides?.[node.id];
                let start, end, type;
                // pureService (usługa/service, nie pakiet/komplet): 1-dniowy bar, tylko przesuwany
                const pureService = isServiceType(node.type) && !isPacketType(node.type);
                // tylko praca z jednostką dni może aktualizować ilość przez timeline
                const canUpdateDuration = isWorkType(node.type) && isDayUnit(node.unit);
                const defaultStart = effectiveWow ? new Date(projectStart) : advanceToWorkingDay(new Date(projectStart));
                if (ovr?.start && ovr?.end) {
                    start = new Date(ovr.start);
                    end = pureService ? new Date(start.getTime() + DAY_MS) : new Date(ovr.end);
                    type = pureService ? 'task' : ((end - start) <= DAY_MS / 2 ? 'milestone' : 'task');
                } else if (dur > 0 && !pureService) {
                    start = defaultStart;
                    end = effectiveWow
                        ? new Date(start.getTime() + dur * DAY_MS)
                        : addWorkingDays(start, dur);
                    type = 'task';
                } else {
                    start = defaultStart;
                    end = new Date(start.getTime() + DAY_MS);
                    type = pureService ? 'task' : 'milestone';
                }
                tasks.push({
                    id: node.id,
                    type,
                    name: niceName,
                    start,
                    end,
                    progress: 0,
                    project: parentId || undefined,
                    _color: colors.bg,
                    _textColor: colors.text,
                    _pureService: pureService,
                    _canUpdateDuration: canUpdateDuration,
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

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const toInputDate = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';

const GanttTableContext = createContext(null);

const COL_DATE = 95;
const COL_DAYS = 52;

const hdrCell = (label, width, extra = {}) => ({
    width, padding: '0 6px', display: 'flex', alignItems: 'flex-end', paddingBottom: 6,
    color: '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', justifyContent: 'center', ...extra,
});

const taskDays = (task, branchWorkOnHolidays = {}, taskBranchMap = {}) => {
    if (task.type === 'milestone') return 0;
    const start = new Date(task.start); start.setHours(0, 0, 0, 0);
    const end   = new Date(task.end);   end.setHours(0, 0, 0, 0);
    const branchId = taskBranchMap[task.id];
    const wow = Object.prototype.hasOwnProperty.call(branchWorkOnHolidays, task.id)
        ? branchWorkOnHolidays[task.id]
        : (branchWorkOnHolidays[branchId] ?? false);
    if (wow) return Math.max(0, Math.round((end - start) / DAY_MS));
    let count = 0;
    const cur = new Date(start);
    while (cur < end) { if (!isNonWorkingDay(cur)) count++; cur.setDate(cur.getDate() + 1); }
    return count;
};


const GanttTaskListHeader = ({ headerHeight, rowWidth, fontFamily }) => {
    return (
        <div style={{ display: 'flex', height: headerHeight, fontFamily, borderBottom: '1px solid rgba(255,255,255,0.1)', background: '#0b0f17', boxSizing: 'border-box', width: rowWidth, flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ flex: '1 1 0', padding: '0 8px', display: 'flex', alignItems: 'flex-end', paddingBottom: 6, color: '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Zadanie
            </div>
            <div style={hdrCell('Od', COL_DATE)}>Od</div>
            <div style={hdrCell('Do', COL_DATE)}>Do</div>
            <div style={hdrCell('Dni', COL_DAYS)}>Dni</div>
        </div>
    );
};

const DateCell = ({ taskId, field, date, disabled }) => {
    const { editCell, setEditCell, handleTableDateChange } = useContext(GanttTableContext) || {};
    const isEditing = editCell?.taskId === taskId && editCell?.field === field;
    const dateObj = date ? new Date(date) : null;

    return (
        <div className="ignite-dp" style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div
                onClick={disabled ? undefined : () => setEditCell({ taskId, field })}
                style={{ color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: disabled ? 'default' : 'pointer', borderRadius: 3, padding: '1px 3px', transition: 'background 0.15s, color 0.15s', fontSize: 11 }}
                onMouseEnter={disabled ? undefined : (e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#67e8f9'; }}
                onMouseLeave={disabled ? undefined : (e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#64748b'; }}
                title={disabled ? '' : 'Kliknij aby edytować'}
            >
                {fmtDate(date)}
            </div>
            {isEditing && (
                <DatePicker
                    selected={dateObj}
                    onChange={(newDate) => {
                        if (newDate) {
                            const y = newDate.getFullYear();
                            const m = String(newDate.getMonth() + 1).padStart(2, '0');
                            const d = String(newDate.getDate()).padStart(2, '0');
                            handleTableDateChange(taskId, field, `${y}-${m}-${d}`);
                        } else setEditCell(null);
                    }}
                    onClickOutside={() => setEditCell(null)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditCell(null); }}
                    locale="pl"
                    dateFormat="dd.MM.yyyy"
                    open
                    popperPlacement="bottom-start"
                    popperContainer={DpPortal}
                    customInput={<span style={{ display: 'none' }} />}
                />
            )}
        </div>
    );
};

const GanttTaskListTable = ({ rowHeight, rowWidth, fontFamily, fontSize, tasks, selectedTaskId, setSelectedTask, onExpanderClick }) => {
    const { branchWorkOnHolidays = {}, taskBranchMap = {} } = useContext(GanttTableContext) || {};
    const totalDays = tasks.reduce((s, t) => s + taskDays(t, branchWorkOnHolidays, taskBranchMap), 0);
    return (
        <div style={{ fontFamily, fontSize, width: rowWidth, flexShrink: 0 }}>
            {tasks.map((task) => {
                const color = task._textColor || '#c7d2fe';
                const isGroup = task.type === 'project';
                const isMilestone = task.type === 'milestone';
                const days = taskDays(task, branchWorkOnHolidays, taskBranchMap);
                return (
                    <div
                        key={task.id}
                        title={task.name}
                        style={{ display: 'flex', height: rowHeight, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', background: task.id === selectedTaskId ? 'rgba(255,255,255,0.05)' : 'transparent', cursor: isGroup ? 'pointer' : 'default', boxSizing: 'border-box', width: rowWidth, overflow: 'hidden' }}
                        onClick={() => { setSelectedTask(task.id); if (isGroup) onExpanderClick(task); }}
                    >
                        <div style={{ flex: '1 1 0', paddingLeft: 8, paddingRight: 4, color, fontWeight: 400, wordBreak: 'break-word', lineHeight: 1.35, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 4, overflow: 'hidden' }}>
                            {task.name}
                        </div>
                        <div style={{ width: COL_DATE, padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <DateCell taskId={task.id} field="start" date={task.start} disabled={false} />
                        </div>
                        <div style={{ width: COL_DATE, padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <DateCell taskId={task.id} field="end" date={isMilestone ? task.start : task.end} disabled={isMilestone} />
                        </div>
                        <div style={{ width: COL_DAYS, padding: '0 6px', textAlign: 'center', color: isMilestone ? '#334155' : '#94a3b8', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                            {isMilestone ? '—' : days}
                        </div>
                    </div>
                );
            })}
            {/* Wiersz podsumowania */}
            <div style={{ display: 'flex', height: 32, alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', boxSizing: 'border-box', width: rowWidth }}>
                <div style={{ flex: '1 1 0', paddingLeft: 8, color: '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Razem roboczo dni</div>
                <div style={{ width: COL_DATE }} />
                <div style={{ width: COL_DATE }} />
                <div style={{ width: COL_DAYS, padding: '0 6px', textAlign: 'center', color: '#67e8f9', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {totalDays}
                </div>
            </div>
        </div>
    );
};

const VIEW_OPTS = [
    { v: ViewMode.Day, label: 'Dzień' },
    { v: ViewMode.Week, label: 'Tydzień' },
    { v: ViewMode.Month, label: 'Miesiąc' },
];

export default function GanttSection({ wbsTree, projectName, onNodeDurationChange, onExportReady, onGetHtmlReady, projectStartDate, projectEndDate }) {
    const items = wbsTree?.items || [];
    const [viewMode, setViewMode] = useState(ViewMode.Day);
    const [projectStart, setProjectStart] = useState(() => {
        if (projectStartDate) return projectStartDate.slice(0, 10);
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.toISOString().slice(0, 10);
    });
    const syncedStartRef = useRef(false);
    useEffect(() => {
        if (projectStartDate && !syncedStartRef.current) {
            setProjectStart(projectStartDate.slice(0, 10));
            syncedStartRef.current = true;
        }
    }, [projectStartDate]);
    const [projectEnd, setProjectEnd] = useState(() => projectEndDate ? projectEndDate.slice(0, 10) : '');
    const syncedEndRef = useRef(false);
    useEffect(() => {
        if (projectEndDate && !syncedEndRef.current) {
            setProjectEnd(projectEndDate.slice(0, 10));
            syncedEndRef.current = true;
        }
    }, [projectEndDate]);
    const [overrides, setOverrides] = useState({});
    const [editCell, setEditCell] = useState(null); // { taskId, field: 'start'|'end' } | null
    const [nonWorkingWarn, setNonWorkingWarn] = useState(null); // { taskId, field, dateStr } | null

    const [branchWorkOnHolidays, setBranchWorkOnHolidays] = useState({});
    const [popup, setPopup] = useState(null); // { x, y, branchId } | null
    const wrapperRef = useRef(null);
    const popupRef = useRef(null);
    const isDraggingRef = useRef(false);

    const toggleBranch = useCallback((branchId) => {
        setBranchWorkOnHolidays(prev => ({
            ...prev,
            [branchId]: !(prev[branchId] ?? false),
        }));
    }, []);

    const { tasks, taskBranchMap } = useMemo(() => {
        const result = buildTasksFromTree(items, new Date(projectStart), projectName, overrides, branchWorkOnHolidays);
        result.tasks.sort((a, b) => a.start - b.start);
        return result;
    }, [items, projectStart, projectName, overrides, branchWorkOnHolidays]);


    // Mapa taskId → nazwa (wszystkie taski w harmonogramie)
    const branchInfoMap = useMemo(() => {
        const m = {};
        for (const task of tasks) {
            if (task) m[task.id] = task.name;
        }
        return m;
    }, [tasks]);

    const applyDateChange = useCallback((taskId, field, dateStr) => {
        if (!dateStr) return;
        const task = tasks.find(t => t && t.id === taskId);
        if (!task) return;
        const newDate = new Date(dateStr);
        newDate.setHours(0, 0, 0, 0);
        let newStart = new Date(task.start); newStart.setHours(0, 0, 0, 0);
        let newEnd   = new Date(task.end);   newEnd.setHours(0, 0, 0, 0);
        if (field === 'start') {
            newStart = newDate;
            if (newStart >= newEnd) newEnd = new Date(newStart.getTime() + DAY_MS);
        } else {
            newEnd = newDate;
            if (newEnd <= newStart) newStart = new Date(newEnd.getTime() - DAY_MS);
        }
        const branchId = taskBranchMap[taskId];
        const wow = Object.prototype.hasOwnProperty.call(branchWorkOnHolidays, taskId)
            ? branchWorkOnHolidays[taskId]
            : (branchWorkOnHolidays[branchId] ?? false);
        let notifyDays;
        if (wow) {
            notifyDays = Math.max(1, Math.round((newEnd - newStart) / DAY_MS));
        } else {
            let count = 0; const cur = new Date(newStart);
            while (cur < newEnd) { if (!isNonWorkingDay(cur)) count++; cur.setDate(cur.getDate() + 1); }
            notifyDays = Math.max(1, count);
        }
        setOverrides(prev => {
            const next = { ...prev, [taskId]: { start: newStart.toISOString(), end: newEnd.toISOString() } };
            for (const t of tasks) {
                if (!t || next[t.id] || t.type === 'project') continue;
                const ts = new Date(t.start); ts.setHours(0, 0, 0, 0);
                const te = new Date(t.end);   te.setHours(0, 0, 0, 0);
                next[t.id] = { start: ts.toISOString(), end: te.toISOString() };
            }
            return next;
        });
        const origTask = tasks.find(t => t && t.id === taskId);
        if (task.type !== 'project' && origTask?._canUpdateDuration !== false) onNodeDurationChange?.(taskId, notifyDays);
    }, [tasks, taskBranchMap, branchWorkOnHolidays, onNodeDurationChange]);

    const handleTableDateChange = useCallback((taskId, field, dateStr) => {
        setEditCell(null);
        if (!dateStr) return;
        const picked = new Date(dateStr);
        picked.setHours(0, 0, 0, 0);
        const checkDate = field === 'start' ? picked : picked;
        if (isNonWorkingDay(checkDate)) {
            setNonWorkingWarn({ taskId, field, dateStr });
            return;
        }
        applyDateChange(taskId, field, dateStr);
    }, [applyDateChange]);

    const onDateChange = useCallback((task) => {
        if (task.type === 'milestone') return;

        let start = new Date(task.start); start.setHours(0, 0, 0, 0);
        let end   = new Date(task.end);   end.setHours(0, 0, 0, 0);
        if (end.getTime() <= start.getTime()) end.setDate(start.getDate() + 1);

        const origTask = tasks.find(t => t && t.id === task.id);
        const origStart = origTask ? new Date(origTask.start) : null;
        if (origStart) origStart.setHours(0, 0, 0, 0);

        // pureService: tylko przesunięcie, zawsze 1-dniowy bar, bez zmiany długości
        if (origTask?._pureService) {
            const goingLeft = origStart && start.getTime() < origStart.getTime();
            start = goingLeft ? retreatToWorkingDay(start) : advanceToWorkingDay(start);
            end = new Date(start.getTime() + DAY_MS);
            setOverrides(prev => {
                const next = { ...prev, [task.id]: { start: start.toISOString(), end: end.toISOString() } };
                for (const t of tasks) {
                    if (!t || next[t.id] || t.type === 'project') continue;
                    const ts = new Date(t.start); ts.setHours(0, 0, 0, 0);
                    const te = new Date(t.end);   te.setHours(0, 0, 0, 0);
                    next[t.id] = { start: ts.toISOString(), end: te.toISOString() };
                }
                return next;
            });
            return;
        }

        const branchId   = taskBranchMap[task.id];
        const effectiveWow = Object.prototype.hasOwnProperty.call(branchWorkOnHolidays, task.id)
            ? (branchWorkOnHolidays[task.id] ?? false)
            : (branchWorkOnHolidays[branchId] ?? false);

        let notifyDays;
        if (!effectiveWow) {
            const origEnd = origTask ? new Date(origTask.end) : null;
            if (origEnd) origEnd.setHours(0, 0, 0, 0);

            const startSame = origStart && Math.abs(start.getTime() - origStart.getTime()) < DAY_MS / 2;
            const endSame   = origEnd   && Math.abs(end.getTime()   - origEnd.getTime())   < DAY_MS / 2;
            // move = obie daty zmieniły się; resize = tylko jedna
            const isResize = startSame !== endSame;

            let workDays = 0;
            if (!isResize && origTask) {
                // MOVE — zachowaj oryginalną liczbę dni roboczych
                let d = 0; const c = new Date(origStart);
                while (c < origEnd) { if (!isNonWorkingDay(c)) d++; c.setDate(c.getDate() + 1); }
                workDays = Math.max(1, d);
            } else {
                // RESIZE — policz dni robocze w nowym zakresie
                const cur = new Date(start);
                while (cur < end) { if (!isNonWorkingDay(cur)) workDays++; cur.setDate(cur.getDate() + 1); }
                workDays = Math.max(1, workDays);
            }
            const goingLeft = origStart && start.getTime() < origStart.getTime();
            start = goingLeft ? retreatToWorkingDay(start) : advanceToWorkingDay(start);
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
        if (task.id !== '__root__' && task.type !== 'project' && origTask?._canUpdateDuration !== false) {
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
                    if (isDraggingRef.current) return;
                    const POPUP_W = 230;
                    const POPUP_H = 80;
                    const spaceRight = window.innerWidth - rect.right;
                    const x = spaceRight >= POPUP_W + 8 ? rect.right + 8 : rect.left - POPUP_W - 8;
                    const y = Math.min(rect.top, window.innerHeight - POPUP_H - 8);
                    setPopup({ x, y, branchId });
                };
                const onLeave = () => setPopup(null);
                g.addEventListener('mouseenter', onEnter);
                g.addEventListener('mouseleave', onLeave);
                removers.push(() => { g.removeEventListener('mouseenter', onEnter); g.removeEventListener('mouseleave', onLeave); });
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

    // Blokuj auto-scroll timeline podczas przeciągania tasków
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        let dragging = false;
        let scrollEl = null;

        const findScroll = () => {
            const svg = wrapper.querySelector('svg');
            if (!svg) return null;
            let el = svg.parentElement;
            while (el && el !== wrapper) {
                const s = getComputedStyle(el).overflowX;
                if (s === 'auto' || s === 'scroll') return el;
                el = el.parentElement;
            }
            return null;
        };

        const onDown = (e) => {
            if (!e.target.closest('svg')) return;
            dragging = true;
            isDraggingRef.current = true;
            setPopup(null);
            if (!scrollEl) {
                scrollEl = findScroll();
                if (scrollEl) {
                    const orig = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
                    Object.defineProperty(scrollEl, 'scrollLeft', {
                        get: () => orig.get.call(scrollEl),
                        set: (v) => { if (!dragging) orig.set.call(scrollEl, v); },
                        configurable: true,
                    });
                }
            }
        };
        const onUp = () => { dragging = false; isDraggingRef.current = false; };

        document.addEventListener('mousedown', onDown);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('mouseup', onUp);
            if (scrollEl) { try { delete scrollEl.scrollLeft; } catch (_) {} }
        };
    }, []);

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
            wrapper.querySelectorAll('.ignite-project-marker').forEach(el => el.remove());
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

            // Wyznacz offset SVG dla firstDate używając pierwszego paska jako referencji
            const NS = 'http://www.w3.org/2000/svg';
            const refTaskIndex = tasks.findIndex(t => t && t.type === 'task');
            const refTask = refTaskIndex >= 0 ? tasks[refTaskIndex] : null;
            const refBarGroups = innerSvg.querySelectorAll('g[tabindex]');
            const refBar = refTask && refBarGroups[refTaskIndex]
                ? refBarGroups[refTaskIndex].querySelector('rect')
                : null;
            let svgFirstDateX = 0;
            if (refBar && refTask) {
                const refBx = parseFloat(refBar.getAttribute('x') || '0');
                const refStart = new Date(refTask.start); refStart.setHours(0, 0, 0, 0);
                svgFirstDateX = refBx - Math.round((refStart - firstDate) / DAY_MS) * COL;
            }

            const bandG = document.createElementNS(NS, 'g');
            bandG.classList.add('ignite-weekend-band');

            for (let i = 0; i < totalDays; i++) {
                const date = new Date(firstDate);
                date.setDate(firstDate.getDate() + i);
                const dow = date.getDay();
                const holiday = isPolishHoliday(date);
                if (dow !== 0 && dow !== 6 && !holiday) continue;

                const rect = document.createElementNS(NS, 'rect');
                rect.setAttribute('x', String(svgFirstDateX + i * COL));
                rect.setAttribute('y', '0');
                rect.setAttribute('width', String(COL));
                rect.setAttribute('height', String(innerH));
                rect.setAttribute('fill', 'rgba(150,155,165,0.22)');
                rect.setAttribute('pointer-events', 'none');
                bandG.appendChild(rect);
            }

            innerSvg.insertBefore(bandG, innerSvg.firstChild);

            // --- Rozbijanie barów na segmenty: podmiana rectów ---
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

                if (g.dataset.igniteSplit) return;
                const bgRect = g.querySelector('rect');
                if (!bgRect) return;

                const bx   = parseFloat(bgRect.getAttribute('x')      || '0');
                const by   = parseFloat(bgRect.getAttribute('y')      || '0');
                const bh   = parseFloat(bgRect.getAttribute('height') || '0');
                const brx  = Math.min(parseFloat(bgRect.getAttribute('rx') || '4'), 4);
                const fill = bgRect.getAttribute('fill') || '#10b981';
                const origText = g.querySelector('text');
                const textFill = origText?.getAttribute('fill') || '#fff';
                const fontSize = origText?.getAttribute('font-size') || '12';

                // Chowamy całą grupę i wszystkie floating labels gantta poza grupą
                g.dataset.igniteSplit = '1';
                g.style.opacity = '0';
                innerSvg.querySelectorAll('text').forEach(t => {
                    if (t.textContent.trim() === task.name && !t.closest('.ignite-seg-g')) {
                        t.dataset.igniteSplit = '1';
                        t.style.opacity = '0';
                    }
                });

                const segG = document.createElementNS(NS, 'g');
                segG.classList.add('ignite-seg-g');

                // Wyznacz najszerszy segment i sprawdź czy nazwa się mieści
                const widestSeg = segs.reduce((b, s) => (s[1]-s[0]) > (b[1]-b[0]) ? s : b, segs[0]);
                const widestW = (widestSeg[1] - widestSeg[0]) * COL;
                const nameEstW = task.name.length * parseFloat(fontSize) * 0.62;
                const labelOutside = nameEstW > widestW;
                const lastSeg = segs[segs.length - 1];

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
                }

                // Dodajemy do innerSvg (nie do ukrytej grupy g)
                innerSvg.appendChild(segG);
            });

            // Ukryj wszystkie etykiety nazw na barach — opisy tylko w tabeli po lewej
            innerSvg.querySelectorAll('text').forEach(t => { t.style.display = 'none'; });

            return true;
        };

        let cancelled = false;
        const tries = [50, 200, 600, 1200];
        const timers = tries.map(ms => setTimeout(() => { if (!cancelled) apply(); }, ms));
        return () => { cancelled = true; timers.forEach(clearTimeout); cleanup(); };
    }, [tasks, viewMode, taskBranchMap, branchWorkOnHolidays]);

    // Markery start/koniec projektu — działa we wszystkich widokach
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper || !tasks.length) return;
        const cleanup = () => wrapper.querySelectorAll('.ignite-project-marker').forEach(el => el.remove());
        if (!projectStart && !projectEnd) { cleanup(); return; }

        const NS = 'http://www.w3.org/2000/svg';
        const apply = () => {
            cleanup();
            const vc = wrapper.querySelector('[class*="CZjuD"], [class*="ganttVerticalContainer"]');
            if (!vc) return false;
            const horiz = vc.children[1];
            if (!horiz?.querySelector('svg')) return false;
            const innerSvg = horiz.querySelector('svg');
            const innerH = innerSvg.getBoundingClientRect().height || parseFloat(innerSvg.getAttribute('height') || '0');
            if (!innerH) return false;

            // Oblicz pixelsPerDay z rzeczywistego paska (niezależnie od widoku)
            const refIdx = tasks.findIndex(t => t && t.type === 'task');
            const refTask = refIdx >= 0 ? tasks[refIdx] : null;
            const refGroups = innerSvg.querySelectorAll('g[tabindex]');
            const refBar = refTask && refGroups[refIdx] ? refGroups[refIdx].querySelector('rect') : null;
            if (!refBar || !refTask) return false;
            const refBx = parseFloat(refBar.getAttribute('x') || '0');
            const refW  = parseFloat(refBar.getAttribute('width') || '1');
            const refStart = new Date(refTask.start); refStart.setHours(0, 0, 0, 0);
            const refEnd   = new Date(refTask.end);   refEnd.setHours(0, 0, 0, 0);
            const refDays  = Math.max(1, Math.round((refEnd - refStart) / DAY_MS));
            const ppd = refW / refDays; // pixels per day

            const earliest = tasks.reduce((m, t) => t.start < m ? t.start : m, tasks[0].start);
            const firstDate = new Date(earliest); firstDate.setHours(0, 0, 0, 0);
            firstDate.setDate(firstDate.getDate() - 1);
            const svgX0 = refBx - Math.round((refStart - firstDate) / DAY_MS) * ppd;

            const markerG = document.createElementNS(NS, 'g');
            markerG.classList.add('ignite-project-marker');
            const draw = (dateStr, color) => {
                if (!dateStr) return;
                const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
                const x = svgX0 + Math.round((d - firstDate) / DAY_MS) * ppd + ppd / 2;
                const line = document.createElementNS(NS, 'line');
                line.setAttribute('x1', String(x)); line.setAttribute('y1', '0');
                line.setAttribute('x2', String(x)); line.setAttribute('y2', String(innerH));
                line.setAttribute('stroke', color); line.setAttribute('stroke-width', '1.5');
                line.setAttribute('stroke-dasharray', '5,3'); line.setAttribute('pointer-events', 'none');
                markerG.appendChild(line);
                const sz = 7;
                const poly = document.createElementNS(NS, 'polygon');
                poly.setAttribute('points', `${x},0 ${x+sz},${sz} ${x},${sz*2} ${x-sz},${sz}`);
                poly.setAttribute('fill', color); poly.setAttribute('pointer-events', 'none');
                markerG.appendChild(poly);
            };
            draw(projectStart, '#22c55e');
            draw(projectEnd, '#ef4444');
            innerSvg.appendChild(markerG);
            return true;
        };

        let cancelled = false;
        const timers = [50, 200, 600, 1200].map(ms => setTimeout(() => { if (!cancelled) apply(); }, ms));
        return () => { cancelled = true; timers.forEach(clearTimeout); cleanup(); };
    }, [tasks, viewMode, projectStart, projectEnd]);

    // Wycentruj etykiety tygodni w nagłówku — tylko widok tygodnia (miesiące są już centrowane przez bibliotekę)
    useEffect(() => {
        if (!tasks.length || viewMode !== ViewMode.Week) return;
        const center = () => {
            const wrapper = wrapperRef.current;
            if (!wrapper) return false;
            const vc = wrapper.querySelector('[class*="CZjuD"], [class*="ganttVerticalContainer"]');
            if (!vc) return false;
            const calSvg = Array.from(vc.children).find(el => el.tagName === 'svg');
            if (!calSvg) return false;
            const headerH = parseFloat(calSvg.getAttribute('height') || '0');
            if (!headerH) return false;
            const midY = headerH / 2;
            const weekTexts = Array.from(calSvg.querySelectorAll('text'))
                .filter(t => parseFloat(t.getAttribute('y') || '0') > midY && t.getAttribute('text-anchor') !== 'middle');
            if (!weekTexts.length) return false;
            weekTexts.sort((a, b) => parseFloat(a.getAttribute('x') || '0') - parseFloat(b.getAttribute('x') || '0'));
            const svgW = parseFloat(calSvg.getAttribute('width') || '0');
            weekTexts.forEach((t, i) => {
                const x = parseFloat(t.getAttribute('x') || '0');
                const nextX = i < weekTexts.length - 1
                    ? parseFloat(weekTexts[i + 1].getAttribute('x') || '0') : svgW;
                t.setAttribute('x', String(x + (nextX - x) / 2));
                t.setAttribute('text-anchor', 'middle');
            });
            return true;
        };
        const timers = [50, 200, 600, 1200].map(ms => setTimeout(center, ms));
        return () => timers.forEach(clearTimeout);
    }, [tasks, viewMode]);

    const exportPdf = useCallback(() => {
        const node = wrapperRef.current?.querySelector('.ignite-gantt-print');
        if (!node) return;

        const clone = node.cloneNode(true);
        const NS = 'http://www.w3.org/2000/svg';
        // Timeline SVG siedzi w pionowym kontenerze (children[1]) — taki sam selektor jak live app
        const liveVc = node.querySelector('[class*="CZjuD"], [class*="ganttVerticalContainer"]');
        const liveInnerSvg = liveVc?.children[1]?.querySelector('svg');
        const cloneVc = clone.querySelector('[class*="CZjuD"], [class*="ganttVerticalContainer"]');
        const innerSvg = cloneVc?.children[1]?.querySelector('svg');
        if (innerSvg && liveInnerSvg) {
            const svgW = liveInnerSvg.getBoundingClientRect().width || parseFloat(liveInnerSvg.getAttribute('width') || '2000');
            const rowH = 32;
            const rowLineG = document.createElementNS(NS, 'g');
            for (let r = 1; r <= tasks.length; r++) {
                const line = document.createElementNS(NS, 'line');
                line.setAttribute('x1', '0');
                line.setAttribute('x2', String(svgW));
                line.setAttribute('y1', String(r * rowH));
                line.setAttribute('y2', String(r * rowH));
                line.setAttribute('stroke', 'rgba(0,0,0,0.12)');
                line.setAttribute('stroke-width', '0.5');
                rowLineG.appendChild(line);
            }
            innerSvg.insertBefore(rowLineG, innerSvg.firstChild);
        }

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
.wrap * { scrollbar-width: none !important; }
.wrap *::-webkit-scrollbar { display: none !important; }
</style>
</head><body>
<h1>${(projectName || 'Projekt').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c])}</h1>
<div class="meta">Harmonogram – wygenerowano ${new Date().toLocaleString('pl-PL')}</div>
${(projectStart || projectEnd) ? `<div class="meta" style="display:flex;gap:18px;align-items:center;margin-bottom:10px;">
${projectStart ? `<span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:10px;height:10px;background:#22c55e;transform:rotate(45deg);"></span><b>Start:</b> ${new Date(projectStart).toLocaleDateString('pl-PL')}</span>` : ''}
${projectEnd   ? `<span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:10px;height:10px;background:#ef4444;transform:rotate(45deg);"></span><b>Koniec:</b> ${new Date(projectEnd).toLocaleDateString('pl-PL')}</span>` : ''}
</div>` : ''}
<div class="wrap">${clone.outerHTML}</div>
<script>setTimeout(()=>{window.print();}, 400);</script>
</body></html>`;
        const win = window.open('', '_blank', 'width=1400,height=900');
        if (!win) { alert('Wyłącz blokadę pop-upów aby wyeksportować PDF.'); return; }
        win.document.open();
        win.document.write(html);
        win.document.close();
    }, [projectName, projectStart, projectEnd, tasks.length]);

    useEffect(() => { onExportReady?.(exportPdf); }, [exportPdf, onExportReady]);

    const getGanttHtml = useCallback(() => {
        const node = wrapperRef.current?.querySelector('.ignite-gantt-print');
        if (!node) return null;
        // Zmierz pełną szerokość scrolla (timeline + lewa tabela)
        const contentWidth = node.scrollWidth || node.offsetWidth || 1200;
        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
            .map(s => s.outerHTML)
            .join('\n');
        return { html: node.outerHTML, styles, contentWidth };
    }, []);
    useEffect(() => { onGetHtmlReady?.(getGanttHtml); }, [getGanttHtml, onGetHtmlReady]);

    const ganttTableCtx = useMemo(
        () => ({ editCell, setEditCell, handleTableDateChange, branchWorkOnHolidays, taskBranchMap }),
        [editCell, handleTableDateChange, branchWorkOnHolidays, taskBranchMap]
    );

    // Dynamiczna wysokość wiersza — musi być przed early return (Rules of Hooks)
    const NAME_COL_W = 500 - COL_DATE * 2 - COL_DAYS - 12;
    const CHAR_W = 6.8;
    const rowHeight = useMemo(() => {
        const charsPerLine = Math.max(1, Math.floor(NAME_COL_W / CHAR_W));
        const countLines = (name) => {
            if (!name) return 1;
            const words = name.split(/\s+/);
            let lines = 1, lineLen = 0;
            for (const w of words) {
                // słowo dłuższe niż linia — zawijaj po znakach
                if (w.length >= charsPerLine) {
                    if (lineLen > 0) { lines++; lineLen = 0; }
                    lines += Math.ceil(w.length / charsPerLine) - 1;
                    lineLen = w.length % charsPerLine || charsPerLine;
                    continue;
                }
                if (lineLen === 0) { lineLen = w.length; continue; }
                if (lineLen + 1 + w.length > charsPerLine) { lines++; lineLen = w.length; }
                else { lineLen += 1 + w.length; }
            }
            return lines;
        };
        const MAX_LINES = 4;
        const maxLines = tasks.reduce((max, t) => Math.max(max, Math.min(countLines(t?.name), MAX_LINES)), 1);
        return Math.max(36, maxLines * 18 + 12);
    }, [tasks]);

    if (!items.length || !tasks.length) {
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
        <GanttTableContext.Provider value={ganttTableCtx}>
        <div ref={wrapperRef} className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-white/[0.02] text-xs flex-wrap">
                <label className="flex items-center gap-2 text-gray-300">
                    <span className="w-2 h-2 rotate-45 inline-block" style={{ background: '#22c55e' }} />
                    Start:
                    <input
                        type="date"
                        value={projectStart}
                        onChange={(e) => setProjectStart(e.target.value)}
                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs"
                    />
                </label>
                <label className="flex items-center gap-2 text-gray-300">
                    <span className="w-2 h-2 rotate-45 inline-block" style={{ background: '#ef4444' }} />
                    Koniec:
                    <input
                        type="date"
                        value={projectEnd}
                        onChange={(e) => setProjectEnd(e.target.value)}
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
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: 'linear-gradient(90deg,#1d4ed8,#0891b2)' }} />zadania</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: 'rgba(100,110,120,0.18)', border: '1px solid rgba(150,160,170,0.3)' }} />dzień wolny</span>
                </div>
            </div>

            <style>{`
.ignite-gantt-print svg g[tabindex] text { fill: #ffffff !important; }
.ignite-gantt-print ._3_ygE {
  position: sticky !important;
  top: 0 !important;
  z-index: 15 !important;
  background: #0b0f17 !important;
}
.ignite-gantt-print ._CZjuD {
  overflow: clip !important;
}
.ignite-gantt-print ._CZjuD > svg:first-child {
  position: sticky !important;
  top: 0 !important;
  z-index: 10 !important;
  background: #0b0f17 !important;
}
.ignite-gantt-print ._34SS0 {
  overflow: visible !important;
}
`}</style>
            <div className="ignite-gantt-print flex-1 min-h-0 overflow-auto custom-scrollbar bg-white/[0.02]">
                <Gantt
                    tasks={tasks}
                    viewMode={viewMode}
                    locale="pl"
                    listCellWidth="500px"
                    columnWidth={viewMode === ViewMode.Day ? 50 : viewMode === ViewMode.Week ? 90 : 220}
                    rowHeight={rowHeight}
                    barCornerRadius={4}
                    fontSize="12px"
                    fontFamily="Inter, system-ui, sans-serif"
                    onDateChange={onDateChange}
                    timeStep={DAY_MS}
                    todayColor="rgba(34,211,238,0.18)"
                    TooltipContent={() => null}
                    TaskListHeader={GanttTaskListHeader}
                    TaskListTable={GanttTaskListTable}
                />
            </div>

        </div>
        {popup && popupBranchId && branchInfoMap[popupBranchId] && (
                <div
                    ref={popupRef}
                    style={{
                        position: 'fixed',
                        left: Math.min(popup.x, window.innerWidth - 220),
                        top: Math.min(popup.y, window.innerHeight - 90),
                        zIndex: 10,
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
        {nonWorkingWarn && (() => {
            const d = new Date(nonWorkingWarn.dateStr);
            const dow = d.getDay();
            const reason = dow === 0 ? 'niedziela' : dow === 6 ? 'sobota' : 'święto';
            const label = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
            return (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}
                    onClick={() => setNonWorkingWarn(null)}>
                    <div onClick={e => e.stopPropagation()}
                        className="bg-[#0d1520] border border-amber-500/30 rounded-2xl px-6 py-5 shadow-2xl max-w-sm w-full mx-4">
                        <div className="text-[10px] text-amber-400 uppercase tracking-widest font-bold mb-2">Dzień wolny od pracy</div>
                        <p className="text-sm text-gray-200 mb-1">
                            Wybrana data (<span className="text-amber-300 font-semibold">{label}</span>) to <span className="text-amber-300">{reason}</span>.
                        </p>
                        <p className="text-xs text-gray-400 mb-5">Czy zadanie ma być zaplanowane w ten dzień?</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { applyDateChange(nonWorkingWarn.taskId, nonWorkingWarn.field, nonWorkingWarn.dateStr); setNonWorkingWarn(null); }}
                                className="flex-1 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-xl transition-all"
                            >Tak, zostaw</button>
                            <button
                                onClick={() => {
                                    const d2 = new Date(nonWorkingWarn.dateStr);
                                    d2.setHours(0, 0, 0, 0);
                                    const moved = nonWorkingWarn.field === 'start' ? advanceToWorkingDay(d2) : retreatToWorkingDay(d2);
                                    const my = moved.getFullYear(), mm = String(moved.getMonth() + 1).padStart(2, '0'), md = String(moved.getDate()).padStart(2, '0');
                                    applyDateChange(nonWorkingWarn.taskId, nonWorkingWarn.field, `${my}-${mm}-${md}`);
                                    setNonWorkingWarn(null);
                                }}
                                className="flex-1 px-4 py-2 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-all"
                            >Nie, przesuń na roboczy</button>
                        </div>
                    </div>
                </div>
            );
        })()}
        </GanttTableContext.Provider>
    );
}
