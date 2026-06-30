import { Bell, X, Clock } from 'lucide-react';
import { API_URL } from '../../config';

const SNOOZE_OPTIONS = [
    { label: '10 min', minutes: 10 },
    { label: '30 min', minutes: 30 },
    { label: '1 godz', minutes: 60 },
];

// @anchor task-reminder-toast
export default function TaskReminderToast({ reminders, onDismissed }) {
    if (!reminders || reminders.length === 0) return null;

    const first = reminders[0];

    // @anchor task-reminder-toast-action
    const handleAction = async (action, minutes) => {
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/my-tasks/reminders/${first.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, minutes }),
        });
        onDismissed(first.id);
    };

    return (
        <div
            className="fixed z-50 flex flex-col gap-2 animate-fade-in"
            style={{ top: '4.5rem', left: '1rem', maxWidth: '280px' }}
        >
            <div
                className="rounded-xl border border-amber-500/25 shadow-xl overflow-hidden"
                style={{ background: 'rgba(15,15,20,0.94)', backdropFilter: 'blur(20px)' }}
            >
                {/* Header */}
                <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.06]">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center flex-shrink-0">
                        <Bell size={11} className="text-amber-400" />
                    </div>
                    <span className="text-[11px] font-semibold text-amber-300 flex-1">Przypomnienie</span>
                    {reminders.length > 1 && (
                        <span className="text-[9px] text-amber-400/60 font-mono">+{reminders.length - 1}</span>
                    )}
                    <button
                        onClick={() => handleAction('dismiss')}
                        className="w-5 h-5 rounded-md bg-white/[0.04] hover:bg-white/[0.10] flex items-center justify-center transition-all"
                    >
                        <X size={10} className="text-gray-500" />
                    </button>
                </div>

                {/* Task title */}
                <div className="px-3.5 py-2.5">
                    <p className="text-sm text-gray-100 font-medium leading-snug">{first.userTask.title}</p>
                    {first.userTask.plannedEnd && (
                        <p className="flex items-center gap-1 mt-1 text-[10px] text-gray-500">
                            <Clock size={9} />
                            {new Date(first.userTask.plannedEnd).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                        </p>
                    )}
                </div>

                {/* Snooze buttons */}
                <div className="flex items-center gap-1.5 px-3.5 pb-3">
                    {SNOOZE_OPTIONS.map(opt => (
                        <button
                            key={opt.minutes}
                            onClick={() => handleAction('snooze', opt.minutes)}
                            className="flex-1 py-1 rounded-lg bg-white/[0.05] hover:bg-amber-500/15 border border-white/[0.07] hover:border-amber-500/30 text-[10px] text-gray-400 hover:text-amber-300 transition-all font-medium"
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
