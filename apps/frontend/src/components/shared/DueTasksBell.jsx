import { useState, useRef, useEffect } from 'react';
import { Bell, Check, Clock, ChevronRight } from 'lucide-react';
import { API_URL } from '../../config';

// Trwały dzwonek „wypadających" zadań w górnej belce — uzupełnienie ulotnych
// toastów (TaskReminderToast). Badge = liczba due; dropdown listuje wszystkie
// due z akcjami: wykonane (PATCH /my-tasks/:id status DONE) i drzemka 1h.

// @anchor due-tasks-bell
export default function DueTasksBell({ reminders = [], onHandled, onOpenAll }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const count = reminders.length;

    useEffect(() => {
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const token = () => sessionStorage.getItem('token');

    // @anchor due-tasks-bell-done — oznacz zadanie jako wykonane (znika też z due po stronie serwera)
    const markDone = async (rem) => {
        onHandled && onHandled(rem.id);
        try {
            await fetch(`${API_URL}/my-tasks/${rem.userTask.id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'DONE' }),
            });
        } catch {}
    };

    // @anchor due-tasks-bell-snooze — drzemka przypomnienia o 60 min
    const snooze = async (rem) => {
        onHandled && onHandled(rem.id);
        try {
            await fetch(`${API_URL}/my-tasks/reminders/${rem.id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'snooze', minutes: 60 }),
            });
        } catch {}
    };

    return (
        <div className="relative flex-shrink-0" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                title="Wypadające zadania"
                className={`relative flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${count > 0 ? 'bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/20' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07]'}`}
            >
                <Bell size={15} className={count > 0 ? 'text-amber-400' : 'text-gray-400'} />
                {count > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-[9px] font-black text-black flex items-center justify-center shadow">
                        {count > 9 ? '9+' : count}
                    </span>
                )}
            </button>

            {open && (
                <div
                    className="absolute left-0 top-full mt-2 w-80 max-h-[70vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-50"
                    style={{ background: 'rgba(15,15,20,0.96)', backdropFilter: 'blur(24px)' }}
                >
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
                        <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                            <Bell size={12} className="text-amber-400" />
                        </div>
                        <span className="text-sm font-semibold text-white flex-1">Wypadające zadania</span>
                        {count > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">{count}</span>}
                    </div>

                    <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5">
                        {count === 0 && (
                            <div className="flex flex-col items-center justify-center py-10 gap-2">
                                <Check size={26} className="text-emerald-500/40" />
                                <p className="text-sm text-gray-500">Nic nie wypada</p>
                            </div>
                        )}
                        {reminders.map(rem => (
                            <div key={rem.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-100 font-medium leading-snug truncate">{rem.userTask?.title || 'Zadanie'}</p>
                                    {rem.userTask?.plannedEnd && (
                                        <p className="flex items-center gap-1 mt-1 text-[10px] text-gray-500">
                                            <Clock size={9} />
                                            {new Date(rem.userTask.plannedEnd).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => snooze(rem)}
                                    title="Drzemka 1 godz"
                                    className="flex-shrink-0 w-6 h-6 rounded-lg bg-white/[0.05] hover:bg-amber-500/15 border border-white/[0.07] hover:border-amber-500/30 flex items-center justify-center transition-all"
                                >
                                    <Clock size={11} className="text-gray-400" />
                                </button>
                                <button
                                    onClick={() => markDone(rem)}
                                    title="Oznacz jako wykonane"
                                    className="flex-shrink-0 w-6 h-6 rounded-lg bg-white/[0.05] hover:bg-emerald-500/15 border border-white/[0.07] hover:border-emerald-500/30 flex items-center justify-center transition-all group/d"
                                >
                                    <Check size={11} className="text-gray-400 group-hover/d:text-emerald-400 transition-colors" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {onOpenAll && (
                        <button
                            onClick={() => { setOpen(false); onOpenAll(); }}
                            className="flex items-center justify-center gap-1.5 px-4 py-3 border-t border-white/[0.07] text-[11px] font-bold text-gray-400 hover:text-white hover:bg-white/[0.04] transition-all flex-shrink-0"
                        >
                            Moje zadania <ChevronRight size={13} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
