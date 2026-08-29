import { API_URL } from '../../../config';
import { useCallback, useEffect, useState } from 'react';

// @anchor dependents-section
// Kompaktowa lista podopiecznych — formularz rozwija się dopiero po kliknięciu „+ Dodaj".
export default function DependentsSection({ currentUserId, onCountChange }) {
    const [dependents, setDependents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [formOpen, setFormOpen] = useState(false);
    const [draft, setDraft] = useState({ firstName: '', lastName: '', birthDate: '' });
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);

    // @anchor fetch-dependents-section
    const fetchDependents = useCallback(async () => {
        if (!currentUserId) return;
        setLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/dependents?userId=${currentUserId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || 'Nie udało się pobrać podopiecznych — odśwież stronę.');
            }
            const list = await res.json();
            setDependents(list);
            onCountChange?.(list.length);
            setError(null);
        } catch (err) {
            setError(err.message);
            setDependents([]);
        } finally {
            setLoading(false);
        }
    }, [currentUserId, onCountChange]);

    useEffect(() => { fetchDependents(); }, [fetchDependents]);

    const resetDraft = () => {
        setDraft({ firstName: '', lastName: '', birthDate: '' });
        setEditingId(null);
        setFormOpen(false);
    };

    // @anchor save-dependent
    const handleSave = async () => {
        if (!draft.firstName.trim() || !draft.lastName.trim() || !draft.birthDate) {
            setError('Podaj imię, nazwisko i datę urodzenia.');
            return;
        }
        setSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/dependents${editingId ? `/${editingId}` : ''}`, {
                method: editingId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    userId: currentUserId,
                    firstName: draft.firstName.trim(),
                    lastName: draft.lastName.trim(),
                    birthDate: draft.birthDate,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || 'Nie udało się zapisać podopiecznego — spróbuj jeszcze raz.');
            }
            resetDraft();
            setError(null);
            fetchDependents();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (d) => {
        setEditingId(d.id);
        setFormOpen(true);
        setDraft({ firstName: d.firstName, lastName: d.lastName, birthDate: String(d.birthDate).slice(0, 10) });
    };

    const handleDelete = async (d) => {
        if (!window.confirm(`Usunąć podopiecznego ${d.firstName} ${d.lastName}?`)) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/dependents/${d.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Nie udało się usunąć podopiecznego — spróbuj jeszcze raz.');
            }
            if (editingId === d.id) resetDraft();
            fetchDependents();
        } catch (err) {
            alert(err.message);
        }
    };

    const formatDate = (v) => {
        const d = new Date(v);
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pl-PL');
    };

    const inputCls = 'w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-teal-500/50';

    return (
        <div className="flex flex-col gap-2">
            {error && <div className="p-2 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-xs">{error}</div>}

            {loading ? (
                <p className="text-sm text-gray-500">Ładowanie...</p>
            ) : dependents.length === 0 ? (
                <p className="text-sm text-gray-600 italic">Brak podopiecznych</p>
            ) : (
                <div className="flex flex-col gap-1">
                    {dependents.map(d => (
                        <div key={d.id} className="group flex items-center justify-between gap-2 bg-black/20 rounded px-2.5 py-1.5">
                            <span className="text-sm text-gray-200 truncate">
                                {d.firstName} {d.lastName}
                                <span className="text-[11px] text-gray-500 ml-2">ur. {formatDate(d.birthDate)}</span>
                            </span>
                            <span className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button onClick={() => handleEdit(d)} title="Edytuj"
                                    className="text-blue-400 hover:bg-blue-500/20 rounded px-1.5 text-xs">✎</button>
                                <button onClick={() => handleDelete(d)} title="Usuń"
                                    className="text-red-400 hover:bg-red-500/20 rounded px-1.5 text-xs">✕</button>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* @anchor dependent-draft-form */}
            {formOpen ? (
                <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                    <div className="grid grid-cols-2 gap-2">
                        <input placeholder="Imię" value={draft.firstName}
                            onChange={e => setDraft(d => ({ ...d, firstName: e.target.value }))} className={inputCls} />
                        <input placeholder="Nazwisko" value={draft.lastName}
                            onChange={e => setDraft(d => ({ ...d, lastName: e.target.value }))} className={inputCls} />
                    </div>
                    <input type="date" value={draft.birthDate}
                        onChange={e => setDraft(d => ({ ...d, birthDate: e.target.value }))} className={inputCls} />
                    <div className="flex gap-2">
                        <button onClick={handleSave} disabled={saving}
                            className="flex-1 bg-teal-600/80 hover:bg-teal-500 text-white px-3 py-1.5 rounded text-sm transition-all disabled:opacity-60">
                            {saving ? 'Zapisywanie...' : editingId ? 'Zapisz' : 'Dodaj'}
                        </button>
                        <button onClick={resetDraft}
                            className="px-3 py-1.5 rounded text-sm text-gray-400 hover:bg-white/5 transition-all">Anuluj</button>
                    </div>
                </div>
            ) : (
                <button onClick={() => setFormOpen(true)}
                    className="self-start text-xs text-teal-400 hover:text-teal-300 transition-colors">
                    + Dodaj podopiecznego
                </button>
            )}
        </div>
    );
}
