import { useState, useEffect, useMemo } from 'react';
import { X, LayoutList, Search, Clock, ListTodo, Check, CheckCircle2, RotateCcw } from 'lucide-react';
import { API_URL } from '../../../config';

// Pełna lista wszystkich ustawionych zadań projektu — dwa typy w jednym widoku:
// Subtaski (harmonogram) + UserTaski (zadania węzłów). Format wzorowany na
// QaTreeView „Q&A — całe drzewo": grupowane sekcje ze sticky nagłówkami, pasek
// szukania + filtry (tu po dacie). UserTaski trzymają id ProcessNode projektu
// (przycisk „Dodaj zadanie" nie zapisuje wiersza WBS), więc nie da się ich
// rozbić na gałęzie WBS — grupujemy je w jednej sekcji.

// Kubełek pilności wg daty terminu
function dateBucket(dateStr) {
    if (!dateStr) return 'nodate';
    const d = new Date(dateStr);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);
    if (day < todayStart) return 'overdue';
    if (day.getTime() === todayStart.getTime()) return 'today';
    if (day < weekEnd) return 'week';
    return 'later';
}

const BUCKET_META = {
    overdue: { label: 'Przeterminowane', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/25' },
    today: { label: 'Dziś', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/25' },
    week: { label: 'Ten tydzień', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/25' },
    later: { label: 'Później', color: 'text-gray-400', bg: 'bg-white/[0.04] border-white/[0.10]' },
    nodate: { label: 'Bez terminu', color: 'text-gray-500', bg: 'bg-white/[0.03] border-white/[0.06]' },
};

// Statusy Subtaska (harmonogram) — etykieta PL + kolor chipa
const SUBTASK_STATUS_META = {
    NEW: { label: 'Nowy', cls: 'bg-white/[0.06] border-white/15 text-gray-300' },
    PLANNED: { label: 'Zaplanowany', cls: 'bg-sky-500/10 border-sky-500/25 text-sky-300' },
    STARTED: { label: 'W trakcie', cls: 'bg-amber-500/10 border-amber-500/25 text-amber-300' },
    FINISHED: { label: 'Zakończony', cls: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' },
    ON_HOLD: { label: 'Wstrzymany', cls: 'bg-orange-500/10 border-orange-500/25 text-orange-300' },
    CANCELLED: { label: 'Anulowany', cls: 'bg-red-500/10 border-red-500/25 text-red-300' },
};

// Dwie stałe grupy — kolejność wyświetlania
const GROUPS = [
    { id: 'users', name: 'Zadania węzłów', path: '📋' },
    { id: 'subtasks', name: 'Harmonogram — podzadania', path: '⏱' },
];

const FILTERS = [
    ['all', 'Wszystkie'],
    ['overdue', 'Przeterminowane'],
    ['today', 'Dziś'],
    ['week', 'Ten tydzień'],
    ['later', 'Później'],
    ['done', 'Wykonane'],
];

// @anchor all-tasks-modal
// Samowystarczalny — pobiera własne dane po nodeId/versionId (order + wersja).
// onChanged: powiadamia rodzica (np. kalendarz) po oznaczeniu/przywróceniu zadania.
export default function AllTasksModal({ nodeId, versionId, onChanged, onClose }) {
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [doneIds, setDoneIds] = useState(() => new Set());
    // Otwarte zadania (dane własne modala)
    const [subtasks, setSubtasks] = useState([]);
    const [userTasks, setUserTasks] = useState([]);
    // Wykonane UserTaski dociągane leniwie z API (backend domyślnie zwraca tylko OPEN)
    const [doneUserTasks, setDoneUserTasks] = useState([]);
    const [doneLoaded, setDoneLoaded] = useState(false);

    const showDone = filter === 'done';
    const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // @anchor all-tasks-fetch-open — pobranie otwartych subtasków (order+wersja) i UserTasków
    const fetchOpen = () => {
        if (!nodeId) return;
        const url = versionId ? `${API_URL}/subtasks/node/${nodeId}?versionId=${versionId}` : `${API_URL}/subtasks/node/${nodeId}`;
        fetch(url, { headers: { Authorization: `Bearer ${token()}` } })
            .then(r => r.ok ? r.json() : [])
            .then(d => setSubtasks(Array.isArray(d) ? d : []))
            .catch(() => {});
        fetch(`${API_URL}/my-tasks`, { headers: { Authorization: `Bearer ${token()}` } })
            .then(r => r.ok ? r.json() : [])
            .then(d => setUserTasks(Array.isArray(d) ? d : []))
            .catch(() => {});
    };
    useEffect(() => { fetchOpen(); }, [nodeId, versionId]);

    // @anchor all-tasks-fetch-done — pobranie wykonanych UserTasków przy pierwszym wejściu w filtr „Wykonane"
    useEffect(() => {
        if (!showDone || doneLoaded) return;
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        fetch(`${API_URL}/my-tasks?status=DONE`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then(data => { setDoneUserTasks(Array.isArray(data) ? data : []); setDoneLoaded(true); })
            .catch(() => setDoneLoaded(true));
    }, [showDone, doneLoaded]);

    // Ujednolicone pozycje obu typów; w trybie „Wykonane" pokazujemy wykonane Subtaski + wykonane UserTaski
    const items = useMemo(() => {
        const out = [];
        const subs = showDone ? subtasks.filter(s => s.status === 'FINISHED') : subtasks.filter(s => s.status !== 'FINISHED');
        for (const s of subs) {
            const ref = s.plannedEnd || s.plannedStart;
            out.push({
                key: `s_${s.id}`, group: 'subtasks', kind: 'subtask', id: s.id, name: s.name || '(bez nazwy)',
                dateStr: ref, bucket: dateBucket(ref), category: s.category, status: s.status,
                assignedToId: s.assignedToId, done: showDone,
            });
        }
        const uts = showDone ? doneUserTasks : userTasks.filter(t => !doneIds.has(t.id));
        for (const t of uts) {
            const ref = t.plannedEnd || t.plannedStart;
            out.push({
                key: `u_${t.id}`, group: 'users', kind: 'user', id: t.id, name: t.title || '(bez nazwy)',
                dateStr: ref, bucket: dateBucket(ref), done: showDone,
            });
        }
        return out;
    }, [subtasks, userTasks, doneUserTasks, doneIds, showDone]);

    const q = search.trim().toLowerCase();
    const groups = useMemo(() => {
        const visible = items.filter(it => {
            if (!showDone && filter !== 'all' && it.bucket !== filter) return false;
            if (q && !`${it.name} ${it.category || ''}`.toLowerCase().includes(q)) return false;
            return true;
        });
        return GROUPS
            .map(g => ({ ...g, rows: visible.filter(it => it.group === g.id) }))
            .filter(g => g.rows.length > 0);
    }, [items, filter, q, showDone]);

    const total = items.length;

    const handleDone = async (id) => {
        setDoneIds(prev => new Set(prev).add(id));
        setUserTasks(prev => prev.filter(t => t.id !== id));
        setDoneLoaded(false); // odśwież listę wykonanych przy następnym wejściu w filtr
        try {
            await fetch(`${API_URL}/my-tasks/${id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'DONE' }),
            });
        } catch {}
        onChanged && onChanged();
    };

    // @anchor all-tasks-restore — przywrócenie wykonanego UserTaska do statusu „zaplanowane" (OPEN)
    const handleRestore = async (id) => {
        setDoneUserTasks(prev => prev.filter(t => t.id !== id));
        try {
            await fetch(`${API_URL}/my-tasks/${id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'OPEN' }),
            });
        } catch {}
        fetchOpen(); // przywrócone zadanie wraca do otwartych
        onChanged && onChanged();
    };

    // @anchor all-tasks-subtask-status — zmiana statusu subtaska (harmonogram): odznaczenie → FINISHED, przywrócenie → NEW
    const setSubtaskStatus = async (id, status) => {
        setSubtasks(prev => prev.map(s => s.id === id ? { ...s, status } : s));
        try {
            await fetch(`${API_URL}/subtasks/${id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
        } catch {}
        onChanged && onChanged();
    };

    // Dispatch akcji „odznacz"/„przywróć" wg typu pozycji
    const onDoneRow = (row) => row.kind === 'user' ? handleDone(row.id) : setSubtaskStatus(row.id, 'FINISHED');
    const onRestoreRow = (row) => row.kind === 'user' ? handleRestore(row.id) : setSubtaskStatus(row.id, 'NEW');

    return (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className={`relative bg-[#0f172a] flex flex-col overflow-hidden ${isMobile ? 'w-full h-[100dvh]' : 'w-3/4 max-w-5xl h-[85vh] border border-white/10 rounded-2xl shadow-2xl'}`}>

                {/* Nagłówek */}
                <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10 flex-shrink-0">
                    <div className="p-2 bg-blue-500/20 rounded-xl flex-shrink-0">
                        <LayoutList size={16} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-black text-sm text-white truncate">Wszystkie zadania</h3>
                        <p className="text-[10px] text-gray-500">{total} zadań · harmonogram + zadania węzłów</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all flex-shrink-0">
                        <X size={18} />
                    </button>
                </div>

                {/* Pasek: szukaj + filtry daty */}
                <div className={`px-4 py-2.5 flex gap-2 border-b border-white/5 flex-shrink-0 ${isMobile ? 'flex-col' : 'items-center'}`}>
                    <div className="relative flex-1 min-w-0">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj w nazwach, kategoriach…"
                            className="w-full bg-[#1e293b]/60 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50" />
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
                        {FILTERS.map(([key, label]) => (
                            <button key={key} onClick={() => setFilter(key)}
                                className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${filter === key ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300' : 'bg-white/5 border border-white/10 text-gray-500 active:scale-95'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Treść */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-5">
                    {groups.length === 0 && (
                        <p className="text-sm text-gray-600 py-8 text-center">
                            {showDone ? 'Brak wykonanych zadań.' : filter === 'all' ? 'Brak ustawionych zadań.' : 'Brak zadań w tym przedziale.'}
                        </p>
                    )}
                    {groups.map(g => (
                        <div key={g.id} className="space-y-2">
                            <div className="flex items-center gap-2 sticky top-0 bg-[#0f172a] py-1.5 z-10">
                                <span className="font-mono text-[11px] text-gray-600">{g.path}</span>
                                <span className="text-xs font-black text-blue-300 uppercase tracking-wide truncate">{g.name}</span>
                                <span className="text-[10px] text-gray-600 font-mono">{g.rows.length}</span>
                                <div className="flex-1 h-px bg-white/10" />
                            </div>
                            {g.rows.map(row => {
                                const bm = BUCKET_META[row.bucket];
                                return (
                                    <div key={row.key} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
                                        {row.kind === 'user'
                                            ? <ListTodo size={13} className="text-amber-400 flex-shrink-0" />
                                            : <Clock size={13} className="text-blue-400 flex-shrink-0" />}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium truncate ${row.done ? 'text-gray-400 line-through' : 'text-gray-200'}`}>{row.name}</p>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                {row.done ? (
                                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-medium bg-emerald-500/10 border-emerald-500/25 text-emerald-400">
                                                        <CheckCircle2 size={9} /> Wykonane{row.dateStr ? ` · ${new Date(row.dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}` : ''}
                                                    </span>
                                                ) : (
                                                    <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-medium ${bm.bg} ${bm.color}`}>
                                                        {bm.label}{row.dateStr ? ` · ${new Date(row.dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}` : ''}
                                                    </span>
                                                )}
                                                {row.category && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[9px] text-gray-400">{row.category}</span>
                                                )}
                                                {row.kind === 'subtask' && !row.done && SUBTASK_STATUS_META[row.status] && (
                                                    <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-medium ${SUBTASK_STATUS_META[row.status].cls}`}>{SUBTASK_STATUS_META[row.status].label}</span>
                                                )}
                                            </div>
                                        </div>
                                        {!row.done && (
                                            <button
                                                onClick={() => onDoneRow(row)}
                                                className="flex-shrink-0 w-6 h-6 rounded-full border border-white/15 hover:border-emerald-400 hover:bg-emerald-400/10 flex items-center justify-center transition-all group/done"
                                                title="Oznacz jako wykonane"
                                            >
                                                <Check size={12} className="text-white/25 group-hover/done:text-emerald-400 transition-colors" />
                                            </button>
                                        )}
                                        {row.done && (
                                            <button
                                                onClick={() => onRestoreRow(row)}
                                                className="flex-shrink-0 flex items-center gap-1 px-2 h-6 rounded-lg border border-white/15 hover:border-blue-400 hover:bg-blue-400/10 text-[10px] font-bold text-gray-400 hover:text-blue-300 transition-all"
                                                title="Przywróć do zaplanowanych"
                                            >
                                                <RotateCcw size={11} /> Zaplanuj
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
