import { useState, useEffect, useCallback } from 'react';
import { Check, Clock, FolderOpen, ListTodo } from 'lucide-react';
import { API_URL } from '../../config';
import { getMeta, setMeta } from '../../services/db';

// @anchor mobile-user-tasks
// Zadania osobiste (UserTask — szuflada Zadania w WBS, „Moje zadania", kalendarz) w widoku mobilnym.
// Harmonogram (Subtask) pokazuje MobileDashboard niżej; to są dwa różne źródła i wcześniej mobile
// widział tylko harmonogram. Lista: otwarte zadania zalogowanego, po terminie; kopia w IndexedDB
// (`MOBILE_USER_TASKS_KEY`) — offline widać ostatni stan, odhaczanie wymaga sieci.
const MOBILE_USER_TASKS_KEY = 'mobile-user-tasks';
// Klucz kopii per użytkownik (sub z JWT) — na wspólnym telefonie nikt nie zobaczy cudzych zadań z cache.
const cacheKeyFor = (token) => {
    try { return `${MOBILE_USER_TASKS_KEY}:${JSON.parse(atob(token.split('.')[1])).sub}`; } catch { return null; }
};

const fmtDeadline = (d) => {
    if (!d) return null;
    const day = new Date(d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dd = new Date(day); dd.setHours(0, 0, 0, 0);
    if (dd < today) return { label: 'Przeterminowane', cls: 'text-red-400 bg-red-500/10 border-red-500/20' };
    if (dd.getTime() === today.getTime()) return { label: 'Dzisiaj', cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' };
    return { label: day.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }), cls: 'text-gray-400 bg-white/[0.04] border-white/[0.08]' };
};

// Data lokalna RRRR-MM-DD — termin zapisany jako północ czasu polskiego w UTC wypada dzień wcześniej,
// więc toISOString() przesunąłby zadanie na poprzedni dzień.
const localDay = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// @anchor mobile-user-task-on-day
// Czy zadanie pokazać w wybranym dniu (nawigacja po datach w MobileDashboard): od startu
// (plannedStart, a bez niego dnia utworzenia) do terminu włącznie. Bez terminu — tylko dziś.
// Przeterminowane otwarte zadania dochodzą do dzisiejszego dnia, żeby nie zniknęły z oczu.
export const isUserTaskOnDay = (task, day, today) => {
    if (!task.plannedEnd) return day === today;
    const end = localDay(task.plannedEnd);
    const start = localDay(task.plannedStart || task.createdAt || task.plannedEnd);
    if (day === today && end < today) return true;
    return day >= (start < end ? start : end) && day <= end;
};

export default function MobileUserTasks({ token, isOnline, refreshKey, selectedDate }) {
    const [tasks, setTasks] = useState(null);

    const load = useCallback(async () => {
        if (!isOnline) return;
        try {
            const res = await fetch(`${API_URL}/my-tasks`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            setTasks(list);
            if (cacheKeyFor(token)) setMeta(cacheKeyFor(token), list).catch(() => {});
        } catch { /* sieć — zostaje kopia z cache */ }
    }, [token, isOnline]);

    useEffect(() => {
        const key = cacheKeyFor(token);
        if (!key) return;
        getMeta(key).then(c => { if (Array.isArray(c)) setTasks(prev => prev ?? c); }).catch(() => {});
    }, [token]);
    useEffect(() => {
        load();
        const t = setInterval(load, 60000);
        return () => clearInterval(t);
    }, [load, refreshKey]);

    const markDone = async (task) => {
        if (!isOnline) return;
        setTasks(prev => prev.filter(t => t.id !== task.id));
        await fetch(`${API_URL}/my-tasks/${task.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'DONE' }),
        }).catch(() => {});
        load();
    };

    if (tasks === null) return null;
    const today = localDay(new Date());
    const visible = selectedDate ? tasks.filter(t => isUserTaskOnDay(t, selectedDate, today)) : tasks;

    return (
        <section className="space-y-2">
            <div className="flex items-center gap-2 px-1">
                <ListTodo size={14} className="text-emerald-400" />
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-300">Zadania</span>
                <span className="text-[10px] text-gray-600 font-bold">{visible.length}/{tasks.length}</span>
                <div className="flex-1 h-px bg-white/5" />
            </div>
            {visible.length === 0 ? (
                <p className="text-xs text-gray-600 px-1">{tasks.length === 0 ? 'Brak otwartych zadań.' : 'Brak zadań na ten dzień.'}</p>
            ) : visible.map(task => {
                const dl = fmtDeadline(task.plannedEnd);
                return (
                    <div key={task.id} className="flex items-start gap-3 bg-gray-900/60 border border-white/5 rounded-2xl p-3.5">
                        <button
                            onClick={() => markDone(task)}
                            disabled={!isOnline}
                            title={isOnline ? 'Oznacz jako wykonane' : 'Odhaczanie wymaga połączenia'}
                            className="mt-0.5 w-6 h-6 flex-shrink-0 rounded-lg border border-white/20 flex items-center justify-center active:scale-90 active:border-emerald-400 transition-all disabled:opacity-40"
                        >
                            <Check size={13} className="text-white/20" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-100 leading-snug break-words">{task.title}</p>
                            {task.description && <p className="text-xs text-gray-500 italic mt-0.5 break-words">{task.description}</p>}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                {dl && (
                                    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${dl.cls}`}>
                                        <Clock size={9} /> {dl.label}
                                    </span>
                                )}
                                {task.node && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 font-medium truncate max-w-[60%]">
                                        <FolderOpen size={9} /> {task.node.name}{task.wbsNode?.name ? ` › ${task.wbsNode.name}` : ''}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </section>
    );
}
