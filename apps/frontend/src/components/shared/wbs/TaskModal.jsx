import { useState, useEffect, useMemo } from 'react';
import { X, ListTodo, Calendar, Trash2, Loader2, GitBranch } from 'lucide-react';
import { API_URL } from '../../../config';
import { TASK_CATEGORIES, TASK_STATUS_CODES, EXEC_STATUS_META } from './wbsConstants';
import TaskTimePicker, { DEFAULT_TASK_TIME, snapTaskTime } from './TaskTimePicker';
import AutoResizeTextarea from './AutoResizeTextarea';
import WbsNodeTreePicker from './WbsNodeTreePicker';

const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');
const authHeaders = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });
const personName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.email || '—';
// Natywna lista <select> w Chrome/Windows ma jasne tło — opcje dostają ciemne jawnie.
const OPTION_STYLE = { backgroundColor: '#0f1520', color: '#e5e7eb' };
const pad2 = (n) => String(n).padStart(2, '0');
const toDateInput = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
};

// @anchor task-visibility-options — jak dawne `Subtask.visibilityType`
export const TASK_VISIBILITY_OPTIONS = [
    ['ALL', 'Wszyscy'],
    ['MANAGER_ONLY', 'Tylko manager'],
    ['LOGISTYK_ONLY', 'Tylko logistyk'],
    ['MANAGER_LOGISTYK', 'Manager + logistyk'],
];

// @anchor task-modal-initial-when
// Od–Do zadania → { startDate, startTime, endDate, endTime }. Zadanie z godziną: Od = plannedStart (starsze bez
// niego — plannedEnd), Do = plannedEnd. Zadanie bez godziny (np. z MS To Do) albo nowe: Od = dzień 8:00,
// Do = ten sam dzień 9:00 — w tym modalu każde zadanie ma godziny.
const DEFAULT_LENGTH_MIN = 60;
const splitLocal = (d) => ({ date: toDateInput(d), time: snapTaskTime(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`) });
const joinLocal = (date, time) => new Date(`${date}T${time}:00`);
const initialWhen = (task, defaults) => {
    let start;
    let end;
    if (task?.durationMinutes && (task.plannedStart || task.plannedEnd)) {
        start = new Date(task.plannedStart || task.plannedEnd);
        end = task.plannedStart && task.plannedEnd ? new Date(task.plannedEnd) : new Date(start.getTime() + task.durationMinutes * 60000);
    } else {
        const day = task?.plannedEnd || task?.plannedStart || defaults?.date || new Date();
        start = joinLocal(toDateInput(day), DEFAULT_TASK_TIME);
        end = new Date(start.getTime() + DEFAULT_LENGTH_MIN * 60000);
    }
    const s = splitLocal(start);
    const e = splitLocal(end);
    return { startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time };
};

// @anchor task-modal
// JEDEN formularz zadania (UserTask) — tworzenie i edycja; używają go kalendarz zamówienia (klik w dzień,
// klik w kafelek) i WBS (węzeł → lista zadań → „Dodaj zadanie”). Zastępuje SubtaskModal, UserTaskEditModal
// i inline formularz szuflady WBS. Każde zadanie ma termin z godziną (domyślnie 8:00, co 30 min), status
// z kodów EXEC_STATUS_META, a zadanie z zamówieniem — węzeł WBS (wymagany przy zapisie).
// Edytować może odpowiedzialny albo zlecający — backend sprawdza to samo (findEditable).
// `defaults`: { date, wbsNodeId } dla nowego zadania; `lockNode` blokuje zmianę węzła (WBS).
export default function TaskModal({ task = null, processNodeId, defaults = {}, lockNode = false, onClose, onSaved }) {
    const isEdit = !!task?.id;
    const currentUserId = (() => { try { return JSON.parse(atob(token().split('.')[1])).sub; } catch { return null; } })();
    const canEdit = !isEdit || task.userId === currentUserId || task.createdById === currentUserId;
    const nodeId = task?.nodeId ?? processNodeId ?? null;
    const when = initialWhen(task, defaults);

    const [title, setTitle] = useState(task?.title || '');
    // @anchor task-modal-description — komentarz wieloliniowy; trafia do notatki MS To Do i treści wydarzenia Outlook
    const [description, setDescription] = useState(task?.description || '');
    // @anchor task-modal-wbs-node-id
    const [wbsNodeId, setWbsNodeId] = useState(task?.wbsNodeId || defaults.wbsNodeId || '');
    const [status, setStatus] = useState(task?.status === 'OPEN' || !task?.status ? 'TO_DO' : task.status);
    const [visibilityType, setVisibilityType] = useState(task?.visibilityType || 'ALL');
    // @anchor task-modal-start — Od: data + godzina (początek, wydarzenie w Outlooku, przypomnienie)
    const [startDate, setStartDate] = useState(when.startDate);
    const [startTime, setStartTime] = useState(when.startTime);
    // @anchor task-modal-end — Do: data + godzina (termin w MS To Do; inny dzień = zadanie kilkudniowe)
    const [endDate, setEndDate] = useState(when.endDate);
    const [endTime, setEndTime] = useState(when.endTime);
    const [assigneeId, setAssigneeId] = useState(task?.userId || currentUserId || '');
    const [category, setCategory] = useState(task?.category || '');
    const [phase, setPhase] = useState(task?.phase || '');
    // @anchor task-modal-save-as-template
    const [saveAsTemplate, setSaveAsTemplate] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [team, setTeam] = useState([]);
    const [wbsItems, setWbsItems] = useState([]);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const get = (url, set) => fetch(url, { headers: { Authorization: `Bearer ${token()}` } })
            .then(r => r.ok ? r.json() : null).then(d => set(d)).catch(() => set(null));
        if (nodeId) {
            get(`${API_URL}/my-tasks/project-team/${nodeId}`, d => setTeam(Array.isArray(d) ? d : []));
            get(`${API_URL}/wbs-nodes/unified/${nodeId}`, d => setWbsItems(Array.isArray(d?.items) ? d.items : []));
        }
        if (!isEdit) get(`${API_URL}/my-tasks/templates`, d => setTemplates(Array.isArray(d) ? d : []));
    }, [nodeId, isEdit]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // @anchor task-modal-people — odpowiedzialnym może być tylko ktoś z zespołu zamówienia (backend sprawdza to samo).
    // Zadanie bez zamówienia (osobiste) — tylko ja.
    const people = useMemo(() => {
        const list = nodeId ? team : (currentUserId ? [{ id: currentUserId, firstName: 'Ja' }] : []);
        return [...list].sort((a, b) => personName(a).localeCompare(personName(b), 'pl'));
    }, [team, nodeId, currentUserId]);
    // Dotychczasowy odpowiedzialny spoza zespołu (np. zdjęty z zespołu) — widoczny, ale nie do wybrania.
    const ownerOutsideTeam = isEdit && task.user?.id && !people.some(u => u.id === task.user.id) ? task.user : null;
    // Nowe zadanie: domyślnie ja, o ile jestem w zespole — inaczej trzeba wybrać.
    useEffect(() => {
        if (isEdit || !team.length) return;
        setAssigneeId(prev => (people.some(u => u.id === prev) ? prev : ''));
    }, [people, isEdit, team.length]);

    const nodeMissing = !!nodeId && !wbsNodeId;
    const assigneeMissing = !assigneeId || (assigneeId !== task?.userId && !people.some(u => u.id === assigneeId));
    const start = startDate && startTime ? joinLocal(startDate, startTime) : null;
    const end = endDate && endTime ? joinLocal(endDate, endTime) : null;
    const rangeInvalid = !start || !end || end <= start;
    const canSave = canEdit && title.trim() && !rangeInvalid && !nodeMissing && !assigneeMissing && !saving;

    // Przesunięcie Od przesuwa Do o tyle samo (długość zadania zostaje) — jak w kalendarzach.
    const moveStart = (date, time) => {
        const prevStart = start;
        const lengthMs = prevStart && end && end > prevStart ? end - prevStart : DEFAULT_LENGTH_MIN * 60000;
        setStartDate(date);
        setStartTime(time);
        if (date && time) {
            const e = splitLocal(new Date(joinLocal(date, time).getTime() + lengthMs));
            setEndDate(e.date);
            setEndTime(e.time);
        }
    };

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        setError(null);
        try {
            const body = {
                title: title.trim(),
                description: description.trim() || null,
                status,
                visibilityType,
                category: category || null,
                phase: phase.trim() || null,
                wbsNodeId: wbsNodeId || null,
                plannedStart: start.toISOString(),
                plannedEnd: end.toISOString(),
                durationMinutes: Math.round((end - start) / 60000),
            };
            let res;
            if (isEdit) {
                if (assigneeId && assigneeId !== task.userId) body.assigneeUserId = assigneeId;
                res = await fetch(`${API_URL}/my-tasks/${task.id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) });
            } else {
                if (nodeId) body.nodeId = nodeId;
                body.assigneeUserId = assigneeId;
                res = await fetch(`${API_URL}/my-tasks`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
            }
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || 'Nie udało się zapisać zadania');
            }
            const r = await res.json().catch(() => ({}));
            if (isEdit && r && r.count === 0) throw new Error('Brak uprawnień do edycji tego zadania');
            if (!isEdit && saveAsTemplate) {
                await fetch(`${API_URL}/my-tasks/templates`, {
                    method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: body.title, description: body.description }),
                }).catch(() => {});
            }
            onSaved?.(r);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/my-tasks/${task.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
            if (!res.ok) throw new Error('Nie udało się usunąć zadania');
            onSaved?.();
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    };

    const field = 'w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 disabled:opacity-60 [color-scheme:dark]';
    const label = 'text-[11px] text-gray-400 font-medium';
    const statusColor = EXEC_STATUS_META[status]?.color || 'text-gray-300';

    return (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center p-0 md:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full h-full md:h-auto md:max-w-lg md:max-h-[92vh] flex flex-col md:rounded-2xl border-0 md:border-2 border-emerald-400/60 bg-[#05130d] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-emerald-400/20 shrink-0">
                    <div className="min-w-0">
                        <p className="text-[12px] uppercase tracking-widest text-emerald-300 font-bold flex items-center gap-1.5">
                            <ListTodo size={13} /> {isEdit ? 'Zadanie' : 'Nowe zadanie'}
                        </p>
                        {task?.node?.name && <p className="text-[12px] text-gray-500 truncate mt-0.5">{task.node.name}</p>}
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white" title="Zamknij (Esc)"><X size={14} /></button>
                </div>

                <div className="flex flex-col gap-3 px-5 py-4 overflow-y-auto">
                    {!isEdit && templates.length > 0 && (
                        <label className="flex flex-col gap-1.5">
                            <span className={label}>Szablon</span>
                            <select
                                value=""
                                onChange={e => {
                                    const t = templates.find(x => x.id === e.target.value);
                                    if (t) { setTitle(t.name); if (t.description) setDescription(t.description); }
                                }}
                                className={field}
                            >
                                <option value="" style={OPTION_STYLE}>— wybierz, aby wypełnić tytuł i komentarz —</option>
                                {templates.map(t => <option key={t.id} value={t.id} style={OPTION_STYLE}>{t.name}</option>)}
                            </select>
                        </label>
                    )}
                    <label className="flex flex-col gap-1.5">
                        <span className={label}>Tytuł</span>
                        <input autoFocus={canEdit} value={title} onChange={e => setTitle(e.target.value)} disabled={!canEdit} className={field} />
                    </label>
                    {nodeId && (
                        <div className="flex flex-col gap-1.5">
                            <span className={`${label} flex items-center gap-1`}><GitBranch size={10} /> Węzeł WBS</span>
                            <WbsNodeTreePicker
                                items={wbsItems}
                                value={wbsNodeId}
                                onChange={setWbsNodeId}
                                disabled={!canEdit || lockNode}
                                invalid={nodeMissing && canEdit}
                                fallbackLabel={task?.wbsPath?.map(n => n.name).join(' › ') || task?.wbsNode?.name}
                            />
                            {nodeMissing && canEdit && <span className="text-[12px] text-amber-400">Wybierz węzeł, do którego należy zadanie.</span>}
                        </div>
                    )}
                    <label className="flex flex-col gap-1.5">
                        <span className={label}>Komentarz</span>
                        <AutoResizeTextarea value={description} onChange={e => setDescription(e.target.value)} disabled={!canEdit} rows={2} placeholder="Np. lista: - punkt (Enter = nowa linia)" className={`${field} resize-none`} />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1.5">
                            <span className={label}>Status</span>
                            <select value={status} onChange={e => setStatus(e.target.value)} disabled={!canEdit} className={`${field} ${statusColor}`}>
                                {TASK_STATUS_CODES.map(c => <option key={c} value={c} style={OPTION_STYLE}>{EXEC_STATUS_META[c]?.label || c}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className={label}>Odpowiedzialny</span>
                            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} disabled={!canEdit} className={`${field} ${assigneeMissing && canEdit ? 'border-amber-500/60' : ''}`} title="Zadanie trafia do MS To Do odpowiedzialnego — tylko osoby z zespołu zamówienia">
                                {!assigneeId && <option value="" style={OPTION_STYLE}>— wybierz z zespołu —</option>}
                                {ownerOutsideTeam && <option value={ownerOutsideTeam.id} disabled style={OPTION_STYLE}>{personName(ownerOutsideTeam)} (spoza zespołu)</option>}
                                {people.map(u => <option key={u.id} value={u.id} style={OPTION_STYLE}>{personName(u)}{u.id === currentUserId ? ' (ja)' : ''}</option>)}
                            </select>
                            {nodeId && team.length === 0 && canEdit && <span className="text-[12px] text-amber-400">Zespół zamówienia jest pusty — dodaj osoby w „Zespół zamówienia”.</span>}
                        </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <span className={`${label} flex items-center gap-1`}><Calendar size={10} /> Od</span>
                            <input type="date" value={startDate} onChange={e => moveStart(e.target.value, startTime)} disabled={!canEdit} className={field} />
                            <TaskTimePicker value={startTime} onChange={v => moveStart(startDate, v)} allowEmpty={false} disabled={!canEdit} className={`${field} flex-1`} optionStyle={OPTION_STYLE} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className={`${label} flex items-center gap-1`}><Calendar size={10} /> Do</span>
                            <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} disabled={!canEdit} className={`${field} ${rangeInvalid && canEdit ? 'border-amber-500/60' : ''}`} />
                            <TaskTimePicker value={endTime} onChange={setEndTime} allowEmpty={false} disabled={!canEdit} className={`${field} flex-1 ${rangeInvalid && canEdit ? 'border-amber-500/60' : ''}`} optionStyle={OPTION_STYLE} />
                        </div>
                    </div>
                    {rangeInvalid && canEdit && <p className="text-[12px] text-amber-400 -mt-1">Koniec musi być po początku.</p>}
                    <div className="grid grid-cols-3 gap-3">
                        <label className="flex flex-col gap-1.5">
                            <span className={label}>Widoczność</span>
                            <select value={visibilityType} onChange={e => setVisibilityType(e.target.value)} disabled={!canEdit} className={field}>
                                {TASK_VISIBILITY_OPTIONS.map(([v, l]) => <option key={v} value={v} style={OPTION_STYLE}>{l}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className={label}>Kategoria</span>
                            <select value={category} onChange={e => setCategory(e.target.value)} disabled={!canEdit} className={field}>
                                <option value="" style={OPTION_STYLE}>—</option>
                                {category && !TASK_CATEGORIES.some(c => c.label === category) && <option value={category} style={OPTION_STYLE}>{category}</option>}
                                {TASK_CATEGORIES.map(c => <option key={c.key} value={c.label} style={OPTION_STYLE}>{c.label}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className={label}>Faza</span>
                            <input value={phase} onChange={e => setPhase(e.target.value)} disabled={!canEdit} placeholder="np. INSTAL" className={field} />
                        </label>
                    </div>
                    <p className="text-[12px] text-gray-500 -mt-1">
                        {task?.msEventId ? 'W kalendarzu Outlook odpowiedzialnego' : 'Po zapisie trafi do kalendarza Outlook i MS To Do odpowiedzialnego (jeśli ma połączone konto Microsoft)'}
                    </p>
                    {!isEdit && (
                        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                            <input type="checkbox" checked={saveAsTemplate} onChange={e => setSaveAsTemplate(e.target.checked)} className="accent-emerald-500" />
                            Zapisz tytuł i komentarz jako szablon
                        </label>
                    )}
                    {task?.createdBy && task.createdById !== task.userId && (
                        <p className="text-[12px] text-gray-500">Zlecił: {personName(task.createdBy)}</p>
                    )}
                    {!canEdit && (
                        <p className="text-[12px] text-gray-500">Zadanie innej osoby — zmienić może odpowiedzialny ({personName(task.user)}) lub zlecający.</p>
                    )}
                    {error && <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                </div>

                <div className="flex items-center gap-2 px-5 py-4 border-t border-emerald-400/20 shrink-0">
                    {isEdit && canEdit && (confirmDelete ? (
                        <span className="flex items-center gap-2 text-[12px] text-gray-300">
                            Usunąć zadanie?
                            <button onClick={remove} disabled={saving} className="px-2.5 py-1 rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold">TAK</button>
                            <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/10 text-gray-300">NIE</button>
                        </span>
                    ) : (
                        <button onClick={() => setConfirmDelete(true)} className="p-2 rounded-lg text-gray-500 hover:text-red-300 hover:bg-red-500/10" title="Usuń zadanie"><Trash2 size={14} /></button>
                    ))}
                    <div className="ml-auto flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/[0.05] hover:bg-white/10 text-gray-300 text-sm">{canEdit ? 'Anuluj' : 'Zamknij'}</button>
                        {canEdit && (
                            <button onClick={save} disabled={!canSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold">
                                {saving && <Loader2 size={13} className="animate-spin" />} {isEdit ? 'Zapisz' : 'Dodaj zadanie'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
