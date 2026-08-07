import { useState, useEffect, useRef } from 'react';
import { Save, CheckCircle, FileDown, Clock, ListTodo, LayoutList } from 'lucide-react';
import { API_URL } from '../../../config';
import { TASK_CATEGORIES } from './wbsConstants';
import CalendarView from './CalendarView';
import SubtaskModal from '../SubtaskModal';
import AllTasksModal from './AllTasksModal';

const CATEGORIES = TASK_CATEGORIES;

// @anchor tasks-calendar-section
export default function TasksCalendarSection({ nodeId, versionId, nodeName, onWbsUpdate }) {
    const [subtasks, setSubtasks] = useState([]);
    const [logistykUsers, setLogistykUsers] = useState([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    // @anchor tasks-calendar-user-tasks — zadania węzłów (UserTask) nakładane na kalendarz
    const [userTasks, setUserTasks] = useState([]);
    // @anchor tasks-calendar-scope — 'project' = zadania tego projektu, 'all' = wszystkie moje
    const [taskScope, setTaskScope] = useState('project');
    // @anchor tasks-calendar-all-modal
    const [allTasksOpen, setAllTasksOpen] = useState(false);
    const latestSubtasksRef = useRef([]);
    const isSavingRef = useRef(false);
    const saveTimeoutRef = useRef(null);
    const activeVersionRef = useRef(versionId);

    useEffect(() => { latestSubtasksRef.current = subtasks; }, [subtasks]);
    useEffect(() => { activeVersionRef.current = versionId; }, [versionId]);

    const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');

    const fetchSubtasks = async () => {
        try {
            const url = versionId
                ? `${API_URL}/subtasks/node/${nodeId}?versionId=${versionId}`
                : `${API_URL}/subtasks/node/${nodeId}`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) {
                const data = await res.json();
                setSubtasks(data || []);
                latestSubtasksRef.current = data || [];
            }
        } catch {}
    };

    // @anchor tasks-calendar-fetch-user-tasks — wszystkie moje UserTaski (filtr zakresu po stronie klienta)
    const fetchUserTasks = async () => {
        try {
            const res = await fetch(`${API_URL}/my-tasks`, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) {
                const data = await res.json();
                setUserTasks(Array.isArray(data) ? data : []);
            }
        } catch {}
    };

    useEffect(() => {
        if (!nodeId) return;
        fetchSubtasks();
        fetchUserTasks();
        fetch(`${API_URL}/users/by-role/LOGISTYK`, { headers: { Authorization: `Bearer ${token()}` } })
            .then(r => r.ok ? r.json() : [])
            .then(setLogistykUsers)
            .catch(() => {});
    }, [nodeId, versionId]);

    // UserTaski widoczne w kalendarzu wg wybranego zakresu.
    // UserTask.nodeId to id ProcessNode (order) — przycisk „Dodaj zadanie" zawsze
    // zapisuje processNodeId projektu, tożsamy z `nodeId` tego panelu.
    const visibleUserTasks = taskScope === 'all'
        ? userTasks
        : userTasks.filter(t => t.nodeId === nodeId);

    // @anchor tasks-calendar-user-task-done — oznacz UserTask jako wykonane
    const markUserTaskDone = async (taskId) => {
        setUserTasks(prev => prev.filter(t => t.id !== taskId));
        try {
            await fetch(`${API_URL}/my-tasks/${taskId}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'DONE' }),
            });
        } catch { fetchUserTasks(); }
    };

    // @anchor tasks-calendar-user-task-reschedule — przełożenie UserTask przez drag na inny dzień
    const rescheduleUserTask = async (taskId, date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const endStr = `${y}-${m}-${d}T12:00:00`;
        setUserTasks(prev => prev.map(t => t.id === taskId ? { ...t, plannedEnd: endStr } : t));
        try {
            await fetch(`${API_URL}/my-tasks/${taskId}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ plannedEnd: new Date(endStr).toISOString() }),
            });
        } catch { fetchUserTasks(); }
    };

    const saveSubtasks = async (tasks, immediate = false) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        const saveVersionId = versionId;
        const perform = async () => {
            if (isSavingRef.current) { saveTimeoutRef.current = setTimeout(perform, 250); return; }
            isSavingRef.current = true;
            setSaving(true);
            try {
                const res = await fetch(`${API_URL}/subtasks/batch/${nodeId}?versionId=${versionId || ''}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        (Array.isArray(tasks) ? tasks : latestSubtasksRef.current).map(s => ({
                            ...s,
                            id: typeof s.id === 'string' && s.id.startsWith('temp_') ? null : s.id,
                            isApproved: true,
                        }))
                    ),
                });
                if (res.ok) {
                    const saved = await res.json();
                    if (saveVersionId === activeVersionRef.current) {
                        setSubtasks(saved || []);
                        latestSubtasksRef.current = saved || [];
                    }
                    setSaved(true);
                    onWbsUpdate?.();
                    setTimeout(() => setSaved(false), 2000);
                }
            } finally {
                isSavingRef.current = false;
                setSaving(false);
            }
        };
        if (immediate) perform();
        else saveTimeoutRef.current = setTimeout(perform, 400);
    };

    const handleDrop = (e, date) => {
        e.preventDefault();
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data._kind === 'user' && data.id) { rescheduleUserTask(data.id, date); return; }
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}T12:00:00`;
            setSubtasks(prev => {
                let next;
                if (data.isMove && data.id) {
                    const endStr = `${y}-${m}-${d}T23:59:59`;
                    next = prev.map(s => String(s.id) === String(data.id)
                        ? { ...s, plannedStart: dateStr, plannedEnd: endStr } : s);
                    latestSubtasksRef.current = next;
                    saveSubtasks(next, true);
                } else {
                    const newTask = {
                        id: `temp_${Date.now()}`,
                        requirementItemId: data.id,
                        name: data.name,
                        category: data.catLabel,
                        phase: 'INSTAL',
                        status: 'NEW',
                        plannedStart: dateStr,
                        plannedEnd: dateStr,
                        isAiGenerated: false,
                        isApproved: true,
                    };
                    next = [...prev, newTask];
                    latestSubtasksRef.current = next;
                    saveSubtasks(next);
                }
                return next;
            });
        } catch {}
    };

    const removeTask = (requirementItemId, phaseId, subtaskId = null) => {
        setSubtasks(prev => {
            const next = prev.filter(s => {
                if (subtaskId && String(s.id) === String(subtaskId)) return false;
                if (!subtaskId && s.requirementItemId === requirementItemId && s.phase === phaseId) return false;
                return true;
            });
            latestSubtasksRef.current = next;
            saveSubtasks(next, true);
            return next;
        });
    };

    const handleExportPDF = () => {
        const title = nodeName || 'Projekt';
        const rows = subtasks.map(s => `<tr>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb">${s.name || '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.category || '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.plannedStart ? new Date(s.plannedStart).toLocaleDateString('pl-PL') : '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.plannedEnd ? new Date(s.plannedEnd).toLocaleDateString('pl-PL') : '—'}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${s.status || '—'}</td>
        </tr>`).join('');
        const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>Harmonogram – ${title}</title>
<style>body{font-family:Arial,sans-serif;max-width:1000px;margin:40px auto;color:#1a1a1a;font-size:13px}h1{font-size:20px;border-bottom:2px solid #7c3aed;padding-bottom:8px;color:#1e3a5f;break-after:avoid;page-break-after:avoid;break-inside:avoid;page-break-inside:avoid}h2,h3,h4,h5,h6{break-after:avoid;page-break-after:avoid;break-inside:avoid;page-break-inside:avoid}p{orphans:3;widows:3}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#374151}tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}@page{margin:20mm 14mm}@media print{body{max-width:none;margin:0}}</style>
</head><body><h1>Harmonogram: ${title}</h1>
<table><thead><tr><th>Zadanie</th><th>Kategoria</th><th>Start</th><th>Koniec</th><th>Status</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>`;
        const w = window.open('', '_blank', 'width=1000,height=700');
        w.document.write(html); w.document.close(); w.onload = () => w.print();
    };

    return (
        <div className="flex flex-col gap-3 px-5 pb-5 flex-1 overflow-y-auto">
            {/* @anchor tasks-calendar-toolbar — zakres UserTasków, legenda typów, pełna lista */}
            <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                    <button
                        onClick={() => setTaskScope('project')}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${taskScope === 'project' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >Ten projekt</button>
                    <button
                        onClick={() => setTaskScope('all')}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${taskScope === 'all' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >Wszystkie moje</button>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500/40 border border-blue-500/50" /><Clock size={10} className="text-blue-400" /> Harmonogram</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-500/40 border border-amber-500/50" /><ListTodo size={10} className="text-amber-400" /> Zadania węzłów</span>
                </div>
                <button
                    onClick={() => setAllTasksOpen(true)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-lg text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                    <LayoutList size={12} /> Pełna lista
                </button>
            </div>
            <div className="flex-1 flex flex-col min-h-[420px]">
                <CalendarView
                    subtasks={subtasks}
                    userTasks={visibleUserTasks}
                    onUserTaskDone={markUserTaskDone}
                    onUserTaskReschedule={(task, date) => rescheduleUserTask(task.id, date)}
                    categories={CATEGORIES}
                    onDrop={handleDrop}
                    onDateClick={(date) => {
                        setSelectedTask({
                            name: '',
                            plannedStart: date.toISOString(),
                            plannedEnd: date.toISOString(),
                            status: 'NEW',
                        });
                        setIsModalOpen(true);
                    }}
                    onTaskClick={(task) => {
                        setSelectedTask(task);
                        setIsModalOpen(true);
                    }}
                    onRemoveTask={removeTask}
                    onUpdateTask={(updatedTask) => {
                        setSubtasks(prev => {
                            const next = prev.map(s => s.id === updatedTask.id ? updatedTask : s);
                            setTimeout(() => saveSubtasks(next), 0);
                            return next;
                        });
                    }}
                />
            </div>
            {isModalOpen && (
                <SubtaskModal
                    nodeId={nodeId}
                    versionId={versionId}
                    subtask={selectedTask}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => { setIsModalOpen(false); fetchSubtasks(); }}
                />
            )}
            {allTasksOpen && (
                <AllTasksModal
                    nodeId={nodeId}
                    versionId={versionId}
                    onChanged={() => { fetchUserTasks(); fetchSubtasks(); }}
                    onClose={() => setAllTasksOpen(false)}
                />
            )}
        </div>
    );
}
