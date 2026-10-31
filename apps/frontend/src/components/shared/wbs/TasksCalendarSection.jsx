import { useState, useEffect } from 'react';
import { LayoutList } from 'lucide-react';
import { API_URL } from '../../../config';
import { TASK_STATUS_CODES, EXEC_STATUS_META, isTaskClosed } from './wbsConstants';
import CalendarView, { TASK_TILE_STYLE } from './CalendarView';
import AllTasksModal from './AllTasksModal';
import TaskModal from './TaskModal';

// @anchor tasks-calendar-section
export default function TasksCalendarSection({ nodeId, versionId }) {
    // @anchor tasks-calendar-user-tasks — zadania węzłów (UserTask) nakładane na kalendarz
    const [userTasks, setUserTasks] = useState([]);
    // @anchor tasks-calendar-scope — 'project' = zadania wszystkich w tym projekcie, 'mine' = moje w tym projekcie, 'all' = wszystkie moje
    const [taskScope, setTaskScope] = useState('project');
    // @anchor tasks-calendar-project-tasks — otwarte UserTaski wszystkich osób w projekcie (GET /my-tasks/project/:id)
    const [projectTasks, setProjectTasks] = useState([]);
    // @anchor tasks-calendar-all-modal
    const [allTasksOpen, setAllTasksOpen] = useState(false);
    // @anchor tasks-calendar-edit-user-task — zadanie kliknięte w kalendarzu (modal edycji)
    const [editUserTask, setEditUserTask] = useState(null);
    // @anchor tasks-calendar-new-task-date — dzień kliknięty w kalendarzu → nowe zadanie (TaskModal) na ten dzień, 8:00
    const [newTaskDate, setNewTaskDate] = useState(null);

    const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');
    const currentUserId = (() => { try { return JSON.parse(atob(token().split('.')[1])).sub; } catch { return null; } })();

    // @anchor tasks-calendar-fetch-user-tasks — wszystkie moje UserTaski, także zamknięte (filtr zakresu po stronie klienta)
    const fetchUserTasks = async () => {
        try {
            const res = await fetch(`${API_URL}/my-tasks?status=ALL`, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) {
                const data = await res.json();
                setUserTasks(Array.isArray(data) ? data : []);
            }
        } catch {}
    };

    // @anchor tasks-calendar-fetch-project-tasks
    const fetchProjectTasks = async () => {
        try {
            const res = await fetch(`${API_URL}/my-tasks/project/${nodeId}?status=ALL`, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) {
                const data = await res.json();
                setProjectTasks(Array.isArray(data) ? data : []);
            }
        } catch {}
    };
    const refreshUserTasks = () => { fetchUserTasks(); fetchProjectTasks(); };
    // Przełączenie zakresu odświeża listę — zadania innych osób mogły się zmienić od otwarcia sekcji.
    useEffect(() => { if (nodeId) refreshUserTasks(); }, [taskScope]);

    useEffect(() => {
        if (!nodeId) return;
        fetchUserTasks();
        fetchProjectTasks();
    }, [nodeId, versionId]);

    // UserTaski widoczne w kalendarzu wg wybranego zakresu.
    // UserTask.nodeId to id ProcessNode (order) — przycisk „Dodaj zadanie" zawsze
    // zapisuje processNodeId projektu, tożsamy z `nodeId` tego panelu.
    const personName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.email || '';
    const visibleUserTasks = taskScope === 'all'
        ? userTasks
        : taskScope === 'mine'
            ? userTasks.filter(t => t.nodeId === nodeId)
            : projectTasks.map(t => ({
                ...t,
                _who: personName(t.user),
                _readOnly: t.userId !== currentUserId && t.createdById !== currentUserId,
            }));

    // @anchor tasks-calendar-user-task-done — checkbox na kafelku: otwarte → DONE, zamknięte → z powrotem TO_DO
    // (kalendarz pokazuje też zamknięte, więc odhaczenie musi dać się cofnąć).
    const markUserTaskDone = async (taskId) => {
        const task = [...userTasks, ...projectTasks].find(t => t.id === taskId);
        const status = isTaskClosed(task?.status) ? 'TO_DO' : 'DONE';
        setUserTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
        setProjectTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
        try {
            const res = await fetch(`${API_URL}/my-tasks/${taskId}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) refreshUserTasks();
        } catch { refreshUserTasks(); }
    };

    // @anchor tasks-calendar-user-task-reschedule — przełożenie UserTask przez drag na inny dzień.
    // Od i Do przesuwają się o tyle samo dni — godziny i długość zostają (inaczej wydarzenie w Outlooku
    // skakałoby na 12:00). Zadanie bez terminu dostaje termin w południe wybranego dnia.
    const rescheduleUserTask = async (taskId, date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const task = [...userTasks, ...projectTasks].find(t => t.id === taskId);
        let patch;
        if (task?.plannedEnd) {
            const start = new Date(task.plannedStart || task.plannedEnd);
            const newStart = new Date(start);
            newStart.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            const shift = newStart - start;
            patch = { plannedEnd: new Date(new Date(task.plannedEnd).getTime() + shift).toISOString() };
            if (task.plannedStart) patch.plannedStart = newStart.toISOString();
        } else {
            patch = { plannedEnd: new Date(`${y}-${m}-${d}T12:00:00`).toISOString() };
        }
        setUserTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
        setProjectTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
        try {
            await fetch(`${API_URL}/my-tasks/${taskId}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
        } catch { refreshUserTasks(); }
    };

    const handleDrop = (e, date) => {
        e.preventDefault();
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data._kind === 'user' && data.id) rescheduleUserTask(data.id, date);
        } catch {}
    };

    return (
        <div className="flex flex-col gap-3 px-5 pb-5 flex-1 overflow-y-auto">
            {/* @anchor tasks-calendar-toolbar — zakres UserTasków, legenda statusów, pełna lista */}
            <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                    <button
                        onClick={() => setTaskScope('project')}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${taskScope === 'project' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >Ten projekt — wszyscy</button>
                    <button
                        onClick={() => setTaskScope('mine')}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${taskScope === 'mine' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >Tylko moje</button>
                    <button
                        onClick={() => setTaskScope('all')}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${taskScope === 'all' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >Wszystkie moje</button>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
                    {TASK_STATUS_CODES.map(code => (
                        <span key={code} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded border ${TASK_TILE_STYLE[code].swatch}`} />{EXEC_STATUS_META[code].label}</span>
                    ))}
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
                    userTasks={visibleUserTasks}
                    onUserTaskDone={markUserTaskDone}
                    onUserTaskClick={(task) => setEditUserTask(task)}
                    onDrop={handleDrop}
                    onDateClick={(date) => setNewTaskDate(date)}
                />
            </div>
            {(editUserTask || newTaskDate) && (
                <TaskModal
                    task={editUserTask}
                    processNodeId={nodeId}
                    defaults={{ date: newTaskDate }}
                    onClose={() => { setEditUserTask(null); setNewTaskDate(null); }}
                    onSaved={() => { setEditUserTask(null); setNewTaskDate(null); refreshUserTasks(); }}
                />
            )}
            {allTasksOpen && (
                <AllTasksModal
                    nodeId={nodeId}
                    versionId={versionId}
                    onChanged={refreshUserTasks}
                    onClose={() => setAllTasksOpen(false)}
                />
            )}
        </div>
    );
}
