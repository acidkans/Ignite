import { useState, useEffect } from 'react';
import { X, ListTodo, Calendar, Trash2, Loader2, Check } from 'lucide-react';
import { API_URL } from '../../../config';

const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');
const personName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.email || '—';
// Natywna lista <select> w Chrome/Windows ma jasne tło — opcje dostają ciemne jawnie.
const OPTION_STYLE = { backgroundColor: '#0f1520', color: '#e5e7eb' };
const toDateInput = (d) => {
    if (!d) return '';
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// @anchor user-task-edit-modal
// Edycja zadania (UserTask) klikniętego w kalendarzu: tytuł, termin, odpowiedzialny (zespół
// zamówienia), wykonane, usunięcie. Edytować może odpowiedzialny albo zlecający — backend
// sprawdza to samo (findEditable); pozostali widzą zadanie tylko do odczytu.
export default function UserTaskEditModal({ task, processNodeId, onClose, onSaved }) {
    const currentUserId = (() => { try { return JSON.parse(atob(token().split('.')[1])).sub; } catch { return null; } })();
    const canEdit = task.userId === currentUserId || task.createdById === currentUserId;
    const [title, setTitle] = useState(task.title || '');
    const [plannedEnd, setPlannedEnd] = useState(toDateInput(task.plannedEnd || task.plannedStart));
    const [assigneeId, setAssigneeId] = useState(task.userId || '');
    const [done, setDone] = useState(task.status === 'DONE');
    const [team, setTeam] = useState([]);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!processNodeId) return;
        fetch(`${API_URL}/my-tasks/project-team/${processNodeId}`, { headers: { Authorization: `Bearer ${token()}` } })
            .then(r => r.ok ? r.json() : [])
            .then(d => setTeam(Array.isArray(d) ? d : []))
            .catch(() => setTeam([]));
    }, [processNodeId]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Odpowiedzialny spoza zespołu (np. zdjęty z zespołu) dalej musi być na liście.
    const people = (() => {
        const map = new Map(team.map(u => [u.id, u]));
        if (task.user?.id && !map.has(task.user.id)) map.set(task.user.id, task.user);
        return [...map.values()].sort((a, b) => personName(a).localeCompare(personName(b), 'pl'));
    })();

    const save = async () => {
        if (!title.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const body = {
                title: title.trim(),
                status: done ? 'DONE' : 'OPEN',
                // Termin bez godziny = południe, jak przy przeciąganiu w kalendarzu (bez przeskoku dnia przez strefę).
                plannedEnd: plannedEnd ? new Date(`${plannedEnd}T12:00:00`).toISOString() : null,
            };
            if (assigneeId && assigneeId !== task.userId) body.assigneeUserId = assigneeId;
            const res = await fetch(`${API_URL}/my-tasks/${task.id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Nie udało się zapisać zadania');
            const r = await res.json().catch(() => ({}));
            if (r && r.count === 0) throw new Error('Brak uprawnień do edycji tego zadania');
            onSaved?.();
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

    return (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md rounded-2xl border-2 border-emerald-400/60 bg-[#05130d] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-emerald-400/20">
                    <div className="min-w-0">
                        <p className="text-[12px] uppercase tracking-widest text-emerald-300 font-bold flex items-center gap-1.5"><ListTodo size={13} /> Zadanie</p>
                        <p className="text-[12px] text-gray-500 truncate mt-0.5">
                            {(task.wbsPath?.length ? task.wbsPath.map(n => n.name).join(' › ') : task.wbsNode?.name) || task.node?.name || 'Cały projekt'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white" title="Zamknij (Esc)"><X size={14} /></button>
                </div>

                <div className="flex flex-col gap-3 px-5 py-4">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] text-gray-400 font-medium">Tytuł</span>
                        <input autoFocus={canEdit} value={title} onChange={e => setTitle(e.target.value)} disabled={!canEdit} className={field} />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[11px] text-gray-400 font-medium flex items-center gap-1"><Calendar size={10} /> Termin</span>
                            <input type="date" value={plannedEnd} onChange={e => setPlannedEnd(e.target.value)} disabled={!canEdit} className={field} />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[11px] text-gray-400 font-medium">Odpowiedzialny</span>
                            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} disabled={!canEdit} className={field} title="Zadanie trafia do MS To Do odpowiedzialnego">
                                {people.map(u => <option key={u.id} value={u.id} style={OPTION_STYLE}>{personName(u)}{u.id === currentUserId ? ' (ja)' : ''}</option>)}
                            </select>
                        </label>
                    </div>
                    <label className={`flex items-center gap-2 text-sm ${canEdit ? 'text-gray-200 cursor-pointer' : 'text-gray-500'}`}>
                        <span className={`w-4 h-4 rounded border flex items-center justify-center ${done ? 'bg-emerald-500/30 border-emerald-400/60 text-emerald-300' : 'border-white/20'}`}>{done && <Check size={11} />}</span>
                        <input type="checkbox" className="sr-only" checked={done} onChange={e => setDone(e.target.checked)} disabled={!canEdit} />
                        Wykonane
                    </label>
                    {task.createdBy && task.createdById !== task.userId && (
                        <p className="text-[12px] text-gray-500">Zlecił: {personName(task.createdBy)}</p>
                    )}
                    {!canEdit && (
                        <p className="text-[12px] text-gray-500">Zadanie innej osoby — zmienić może odpowiedzialny ({personName(task.user)}) lub zlecający.</p>
                    )}
                    {error && <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                </div>

                <div className="flex items-center gap-2 px-5 py-4 border-t border-emerald-400/20">
                    {canEdit && (confirmDelete ? (
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
                            <button onClick={save} disabled={saving || !title.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold">
                                {saving && <Loader2 size={13} className="animate-spin" />} Zapisz
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
