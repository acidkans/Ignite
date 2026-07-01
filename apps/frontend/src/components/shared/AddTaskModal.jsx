import { useState } from 'react';
import { X, ListTodo, Calendar, Loader2, CheckCircle2 } from 'lucide-react';
import { API_URL } from '../../config';

// @anchor add-task-modal
export default function AddTaskModal({ open, onClose, nodeId, nodeName }) {
    const [title, setTitle] = useState('');
    const [plannedEnd, setPlannedEnd] = useState('');
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState(null);

    if (!open) return null;

    const handleClose = () => {
        setTitle('');
        setPlannedEnd('');
        setDone(false);
        setError(null);
        onClose();
    };

    // @anchor add-task-modal-submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const token = sessionStorage.getItem('token');
            const body = { title: title.trim(), nodeId: nodeId || null };
            if (plannedEnd) body.plannedEnd = new Date(plannedEnd).toISOString();
            const res = await fetch(`${API_URL}/my-tasks`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Błąd zapisu zadania');
            setDone(true);
            setTimeout(handleClose, 1400);
        } catch (err) {
            setError(err.message || 'Błąd zapisu');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}
            onClick={handleClose}
        >
            <div
                className="relative w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                style={{ background: 'rgba(15,15,20,0.95)', backdropFilter: 'blur(24px)' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
                            <ListTodo size={13} className="text-blue-400" />
                        </div>
                        <div>
                            <span className="text-sm font-semibold text-white">Dodaj zadanie</span>
                            {nodeName && (
                                <p className="text-[10px] text-gray-500 leading-tight truncate max-w-[200px]">{nodeName}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-6 h-6 rounded-lg bg-white/[0.04] hover:bg-white/[0.10] border border-white/[0.07] flex items-center justify-center transition-all"
                    >
                        <X size={12} className="text-gray-400" />
                    </button>
                </div>

                {done ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10">
                        <CheckCircle2 size={28} className="text-emerald-400" />
                        <p className="text-sm text-emerald-300 font-medium">Zadanie dodane</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] text-gray-400 font-medium">Tytuł zadania</label>
                            <input
                                autoFocus
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Np. Sprawdzić ofertę…"
                                className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] text-gray-400 font-medium flex items-center gap-1.5">
                                <Calendar size={10} /> Termin (opcjonalnie)
                            </label>
                            <input
                                type="datetime-local"
                                value={plannedEnd}
                                onChange={e => setPlannedEnd(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
                            />
                        </div>

                        {error && (
                            <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
                        )}

                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={handleClose}
                                className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-gray-400 text-[11px] transition-all"
                            >
                                Anuluj
                            </button>
                            <button
                                type="submit"
                                disabled={saving || !title.trim()}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600/80 hover:bg-blue-500/80 text-white text-[11px] font-bold transition-all disabled:opacity-50"
                            >
                                {saving ? <Loader2 size={11} className="animate-spin" /> : <ListTodo size={11} />}
                                Dodaj zadanie
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
