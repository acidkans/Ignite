import { useState, useEffect, useMemo } from 'react';
import { X, LayoutList, Search, ListTodo, Check, CheckCircle2, RotateCcw } from 'lucide-react';
import { API_URL } from '../../../config';
import { EXEC_STATUS_META } from './wbsConstants';

// Pełna lista wszystkich zadań (UserTask) zamówienia. Format wzorowany na
// QaTreeView „Q&A — całe drzewo": grupowane sekcje ze sticky nagłówkami, pasek
// szukania + filtry (tu po dacie). Zadania wszystkich osób w projekcie grupowane
// po gałęzi top-level WBS (`wbsPath[0]` z GET /my-tasks/project/:id);
// zadania bez węzła WBS — sekcja „Bez gałęzi”.

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

// Sekcja zadań bez gałęzi WBS — zawsze na końcu
const NO_BRANCH_GROUP = { id: 'nobranch', name: 'Bez gałęzi — cały projekt', path: '📋' };
const personName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.email || '';

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
    const [userTasks, setUserTasks] = useState([]);
    // Wykonane UserTaski dociągane leniwie z API (backend domyślnie zwraca tylko OPEN)
    const [doneUserTasks, setDoneUserTasks] = useState([]);
    const [doneLoaded, setDoneLoaded] = useState(false);
    // @anchor all-tasks-title-edit — inline edycja nazwy wiersza (klucz edytowanego wiersza + bufor)
    const [editKey, setEditKey] = useState(null);
    const [editDraft, setEditDraft] = useState('');

    const showDone = filter === 'done';
    const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');
    const currentUserId = (() => { try { return JSON.parse(atob(token().split('.')[1])).sub; } catch { return null; } })();

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // @anchor all-tasks-fetch-open — pobranie otwartych UserTasków zamówienia
    const fetchOpen = () => {
        if (!nodeId) return;
        fetch(`${API_URL}/my-tasks/project/${nodeId}`, { headers: { Authorization: `Bearer ${token()}` } })
            .then(r => r.ok ? r.json() : [])
            .then(d => setUserTasks(Array.isArray(d) ? d : []))
            .catch(() => {});
    };
    useEffect(() => { fetchOpen(); }, [nodeId, versionId]);

    // @anchor all-tasks-fetch-done — pobranie wykonanych UserTasków przy pierwszym wejściu w filtr „Wykonane"
    useEffect(() => {
        if (!showDone || doneLoaded) return;
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        fetch(`${API_URL}/my-tasks/project/${nodeId}?status=DONE`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then(data => { setDoneUserTasks(Array.isArray(data) ? data : []); setDoneLoaded(true); })
            .catch(() => setDoneLoaded(true));
    }, [showDone, doneLoaded, nodeId]);

    // Pozycje listy; w trybie „Wykonane" — zadania zamknięte (wykonane i odwołane)
    const items = useMemo(() => {
        const out = [];
        const uts = showDone ? doneUserTasks : userTasks.filter(t => !doneIds.has(t.id));
        for (const t of uts) {
            const ref = t.plannedEnd || t.plannedStart;
            const path = Array.isArray(t.wbsPath) ? t.wbsPath : [];
            out.push({
                key: `u_${t.id}`, group: path[0] ? `b_${path[0].id}` : NO_BRANCH_GROUP.id, groupName: path[0]?.name,
                id: t.id, name: t.title || '(bez nazwy)',
                dateStr: ref, bucket: dateBucket(ref), done: showDone, status: t.status, category: t.category,
                // Ścieżka pod gałęzią top-level (np. „Koszty ogólne › Zarządzanie projektem”)
                subPath: path.slice(1).map(n => n.name).join(' › '),
                who: personName(t.user),
                readOnly: t.userId !== currentUserId && t.createdById !== currentUserId,
            });
        }
        return out;
    }, [userTasks, doneUserTasks, doneIds, showDone]);

    const q = search.trim().toLowerCase();
    const groups = useMemo(() => {
        const visible = items.filter(it => {
            if (!showDone && filter !== 'all' && it.bucket !== filter) return false;
            if (q && !`${it.name} ${it.category || ''} ${it.groupName || ''} ${it.subPath || ''} ${it.who || ''}`.toLowerCase().includes(q)) return false;
            return true;
        });
        // @anchor all-tasks-branch-groups — sekcja per gałąź top-level (alfabetycznie), potem bez gałęzi
        const branches = new Map();
        for (const it of visible) {
            if (it.group === NO_BRANCH_GROUP.id) continue;
            if (!branches.has(it.group)) branches.set(it.group, { id: it.group, name: it.groupName || 'Gałąź', path: '🌿' });
        }
        const ordered = [...branches.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
        return [...ordered, NO_BRANCH_GROUP]
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

    // @anchor all-tasks-restore — przywrócenie zamkniętego zadania do statusu „Do wykonania" (TO_DO)
    // Zadanie odhaczone w tym samym otwarciu modala siedzi w `doneIds`, które ukrywa je na liście
    // otwartych — bez zdjęcia go stamtąd przywrócone zadanie nie wracało do „Wszystkie” aż do
    // ponownego otwarcia widoku. Wiersz wraca też od razu lokalnie, zanim dojdzie odświeżenie.
    const handleRestore = async (id) => {
        const restored = doneUserTasks.find(t => t.id === id);
        setDoneIds(prev => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
        if (restored) setUserTasks(prev => prev.some(t => t.id === id) ? prev : [...prev, { ...restored, status: 'TO_DO' }]);
        setDoneUserTasks(prev => prev.filter(t => t.id !== id));
        try {
            await fetch(`${API_URL}/my-tasks/${id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'TO_DO' }),
            });
        } catch {}
        fetchOpen(); // przywrócone zadanie wraca do otwartych
        onChanged && onChanged();
    };

    // @anchor all-tasks-rename — zmiana nazwy wiersza: PATCH /my-tasks {title}
    const renameRow = async (row, newName) => {
        const v = (newName || '').trim();
        setEditKey(null);
        if (!v || v === row.name) return;
        setUserTasks(prev => prev.map(t => t.id === row.id ? { ...t, title: v } : t));
        setDoneUserTasks(prev => prev.map(t => t.id === row.id ? { ...t, title: v } : t));
        try {
            await fetch(`${API_URL}/my-tasks/${row.id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: v }),
            });
        } catch {}
        onChanged && onChanged();
    };

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
                        <p className="text-[10px] text-gray-500">{total} zadań · wszyscy w projekcie, pogrupowane po gałęziach WBS</p>
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
                                        <ListTodo size={13} className="text-amber-400 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            {editKey === row.key ? (
                                                <input
                                                    autoFocus
                                                    value={editDraft}
                                                    onChange={e => setEditDraft(e.target.value)}
                                                    onBlur={() => renameRow(row, editDraft)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') { e.preventDefault(); renameRow(row, editDraft); }
                                                        if (e.key === 'Escape') { setEditKey(null); }
                                                    }}
                                                    className="w-full text-sm bg-white/[0.06] border border-blue-500/40 rounded-md px-1.5 py-0.5 text-white focus:outline-none focus:border-blue-500/70"
                                                />
                                            ) : (
                                                <p
                                                    onClick={() => { if (row.readOnly) return; setEditKey(row.key); setEditDraft(row.name); }}
                                                    title={row.readOnly ? 'Zadanie innej osoby' : 'Kliknij, aby edytować nazwę'}
                                                    className={`text-sm font-medium truncate transition-colors ${row.readOnly ? '' : 'cursor-text hover:text-white'} ${row.done ? 'text-gray-400 line-through' : 'text-gray-200'}`}
                                                >
                                                    {row.name}
                                                </p>
                                            )}
                                            {row.subPath && <p className="text-[11px] text-gray-500 truncate mt-0.5" title={row.subPath}>{row.subPath}</p>}
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
                                                {row.who && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[9px] text-gray-300">{row.who}</span>
                                                )}
                                                {row.category && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[9px] text-gray-400">{row.category}</span>
                                                )}
                                                {row.status && row.status !== 'TO_DO' && EXEC_STATUS_META[row.status] && (
                                                    <span className={`px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[9px] font-medium ${EXEC_STATUS_META[row.status].color}`}>{EXEC_STATUS_META[row.status].label}</span>
                                                )}
                                            </div>
                                        </div>
                                        {!row.done && !row.readOnly && (
                                            <button
                                                onClick={() => handleDone(row.id)}
                                                className="flex-shrink-0 w-6 h-6 rounded-full border border-white/15 hover:border-emerald-400 hover:bg-emerald-400/10 flex items-center justify-center transition-all group/done"
                                                title="Oznacz jako wykonane"
                                            >
                                                <Check size={12} className="text-white/25 group-hover/done:text-emerald-400 transition-colors" />
                                            </button>
                                        )}
                                        {row.done && !row.readOnly && (
                                            <button
                                                onClick={() => handleRestore(row.id)}
                                                className="flex-shrink-0 flex items-center gap-1 px-2 h-6 rounded-lg border border-white/15 hover:border-blue-400 hover:bg-blue-400/10 text-[10px] font-bold text-gray-400 hover:text-blue-300 transition-all"
                                                title="Przywróć do wykonania"
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
