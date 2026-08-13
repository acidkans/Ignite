import { API_URL } from '../../config';
import { useState } from 'react';

// @anchor leave-modal
// Modal dodawania / edycji wpisu urlopowego — styl spójny z EditUserModal.
export default function LeaveModal({ leave, leaveTypes, employees, defaultLeaveTypeId, defaultUserId, onClose, onSuccess }) {
    const isEdit = !!leave?.id;
    const [form, setForm] = useState({
        userId: leave?.userId || defaultUserId || '',
        leaveTypeId: leave?.leaveTypeId || defaultLeaveTypeId || leaveTypes[0]?.id || '',
        dateFrom: leave?.dateFrom ? leave.dateFrom.slice(0, 10) : '',
        dateTo: leave?.dateTo ? leave.dateTo.slice(0, 10) : '',
        daysCount: leave?.daysCount ?? '',
        note: leave?.note || '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const handleSave = async () => {
        setError(null);
        if (!form.userId) return setError('Wybierz pracownika.');
        if (!form.leaveTypeId) return setError('Wybierz rodzaj urlopu.');
        if (!form.dateFrom || !form.dateTo) return setError('Podaj daty od i do.');
        if (form.dateTo < form.dateFrom) return setError('Data „do" nie może być wcześniejsza niż „od".');

        const payload = {
            userId: form.userId,
            leaveTypeId: form.leaveTypeId,
            dateFrom: form.dateFrom,
            dateTo: form.dateTo,
            note: form.note || null,
        };
        if (form.daysCount !== '' && !isNaN(Number(form.daysCount))) payload.daysCount = Number(form.daysCount);

        setSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leaves${isEdit ? `/${leave.id}` : ''}`, {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Błąd zapisu');
            }
            onSuccess();
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onMouseDown={handleBackdrop}
        >
            <div className="relative bg-gray-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">{isEdit ? 'Edycja wpisu urlopowego' : 'Nowy wpis urlopowy'}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none">&times;</button>
                </div>

                {error && (
                    <div className="p-3 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-sm">{error}</div>
                )}

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-widest">Pracownik</label>
                    <select
                        value={form.userId}
                        onChange={e => set('userId', e.target.value)}
                        className="bg-gray-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                    >
                        <option value="">— wybierz —</option>
                        {employees.map(u => (
                            <option key={u.id} value={u.id}>{u.firstName} {u.lastName} {u.company ? `(${u.company})` : ''}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-widest">Rodzaj urlopu</label>
                    <div className="flex flex-wrap gap-2">
                        {leaveTypes.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => set('leaveTypeId', t.id)}
                                className={`px-3 py-1 rounded-full text-sm border transition-all ${
                                    form.leaveTypeId === t.id
                                        ? 'text-white'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                                }`}
                                style={form.leaveTypeId === t.id
                                    ? { backgroundColor: `${t.color}55`, borderColor: t.color }
                                    : undefined}
                            >
                                {t.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase tracking-widest">Od</label>
                        <input
                            type="date"
                            value={form.dateFrom}
                            onChange={e => set('dateFrom', e.target.value)}
                            className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase tracking-widest">Do</label>
                        <input
                            type="date"
                            value={form.dateTo}
                            onChange={e => set('dateTo', e.target.value)}
                            className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-400 uppercase tracking-widest">Dni</label>
                        <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={form.daysCount}
                            onChange={e => set('daysCount', e.target.value)}
                            placeholder="auto"
                            className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400 uppercase tracking-widest">Notatka</label>
                    <textarea
                        rows={3}
                        value={form.note}
                        onChange={e => set('note', e.target.value)}
                        placeholder="Opcjonalny komentarz"
                        className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded bg-white/5 hover:bg-white/10 text-gray-300 transition-all"
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all disabled:opacity-60"
                    >
                        {saving ? 'Zapisywanie...' : 'Zapisz'}
                    </button>
                </div>
            </div>
        </div>
    );
}
