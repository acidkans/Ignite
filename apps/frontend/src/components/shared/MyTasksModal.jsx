import { useState, useEffect } from 'react';
import { X, Calendar, CheckCircle2, Clock, FolderOpen, Plus } from 'lucide-react';
import { API_URL } from '../../config';

// @anchor my-tasks-modal
function formatDeadline(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);
    const taskDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (taskDay < todayStart) return { label: 'Przeterminowane', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
    if (taskDay.getTime() === todayStart.getTime()) return { label: 'Dzisiaj', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' };
    if (taskDay.getTime() === tomorrowStart.getTime()) return { label: 'Jutro', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' };
    return {
        label: d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
        color: 'text-gray-400',
        bg: 'bg-white/[0.04] border-white/[0.08]',
    };
}

// @anchor my-tasks-task-card
function TaskCard({ task, onDone }) {
    const deadline = formatDeadline(task.plannedEnd);
    return (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] transition-all group">
            <button
                onClick={() => onDone(task.id)}
                className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border border-white/20 hover:border-green-400 hover:bg-green-400/10 transition-all flex items-center justify-center"
                title="Oznacz jako wykonane"
            >
                <CheckCircle2 size={12} className="text-white/20 group-hover:text-green-400 transition-colors" />
            </button>

            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-100 font-medium leading-snug truncate">{task.title}</p>

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {deadline && (
                        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${deadline.bg} ${deadline.color}`}>
                            <Clock size={9} />
                            {deadline.label}
                        </span>
                    )}
                    {task.node && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 font-medium truncate max-w-[140px]">
                            <FolderOpen size={9} />
                            {task.node.name}
                        </span>
                    )}
                    {task.msToDoId && (
                        <span className="w-2 h-2 rounded-full bg-blue-400/60 flex-shrink-0" title="Zsynchronizowane z MS To Do" />
                    )}
                </div>
            </div>
        </div>
    );
}

// @anchor my-tasks-modal-component
export default function MyTasksModal({ open, onClose }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);

    // @anchor my-tasks-fetch
    useEffect(() => {
        if (!open) return;
        setLoading(true);
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/my-tasks`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then(data => setTasks(Array.isArray(data) ? data : []))
            .catch(() => setTasks([]))
            .finally(() => setLoading(false));
    }, [open]);

    // @anchor my-tasks-mark-done
    const handleDone = async (taskId) => {
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/my-tasks/${taskId}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'DONE' }),
        });
        setTasks(prev => prev.filter(t => t.id !== taskId));
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                style={{ background: 'rgba(15,15,20,0.92)', backdropFilter: 'blur(24px)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
                            <Calendar size={13} className="text-blue-400" />
                        </div>
                        <span className="text-sm font-semibold text-white">Moje zadania</span>
                        {!loading && tasks.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                                {tasks.length}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="w-6 h-6 rounded-lg bg-white/[0.04] hover:bg-white/[0.10] border border-white/[0.07] flex items-center justify-center transition-all"
                    >
                        <X size={12} className="text-gray-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {loading && (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
                        </div>
                    )}
                    {!loading && tasks.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <CheckCircle2 size={32} className="text-green-500/40" />
                            <p className="text-sm text-gray-500">Brak otwartych zadań</p>
                        </div>
                    )}
                    {!loading && tasks.map(task => (
                        <TaskCard key={task.id} task={task} onDone={handleDone} />
                    ))}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-white/[0.07] flex-shrink-0">
                    <p className="text-[10px] text-gray-600 text-center">
                        Synchronizacja z MS To Do / Samsung Reminder
                    </p>
                </div>
            </div>
        </div>
    );
}
