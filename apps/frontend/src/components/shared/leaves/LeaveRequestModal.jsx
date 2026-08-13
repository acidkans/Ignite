import { API_URL } from '../../../config';
import { useEffect, useMemo, useState } from 'react';
import { CARE_LEAVE_CODE } from './leavesTheme';

// @anchor leave-request-modal
// Modal „Nowy wniosek urlopowy" — układ wg formularza źródłowego:
// Imię Nazwisko, rodzaj_urlopu, data_od, data_do, komentarz, dni_urlopu.
// Sekcja rozwijana: obecność w biurze + saldo dni pozostałych do wybrania.
export default function LeaveRequestModal({ request, leaveTypes, employees, currentUserId, canPickEmployee, onClose, onSuccess }) {
    const isEdit = !!request?.id;

    // datetime-local: "YYYY-MM-DDTHH:mm"
    const toLocal = (v, fallback) => {
        if (!v) return fallback || '';
        const d = new Date(v);
        if (isNaN(d.getTime())) return fallback || '';
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const [form, setForm] = useState({
        userId: request?.userId || currentUserId || '',
        leaveTypeId: request?.leaveTypeId || '',
        dependentId: request?.dependentId || '',
        dateStart: toLocal(request?.dateStart, `${dayStr}T00:00`),
        dateEnd: toLocal(request?.dateEnd, `${dayStr}T23:59`),
        comment: request?.comment || '',
        daysCount: request?.daysCount ?? 1,
        officeFrom: toLocal(request?.officeFrom, ''),
        officeTo: toLocal(request?.officeTo, ''),
    });
    // @anchor days-touched
    // Dopóki użytkownik nie nadpisze pola ręcznie, liczba dni jest wyliczana z zakresu dat.
    const [daysTouched, setDaysTouched] = useState(!!request?.id);
    const [dependents, setDependents] = useState([]);
    const [loadingDependents, setLoadingDependents] = useState(false);
    // @anchor leave-request-modal-balance
    // Saldo puli dni wybranego pracownika — źródło kolumn „urlop z <rok>" i blokady wysyłki.
    const [balance, setBalance] = useState(null);
    // @anchor leave-request-modal-type-usage
    const [typeUsage, setTypeUsage] = useState(null);
    const [showExtra, setShowExtra] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    // @anchor is-care-leave
    const isCareLeave = useMemo(
        () => leaveTypes.find(t => t.id === form.leaveTypeId)?.code === CARE_LEAVE_CODE,
        [leaveTypes, form.leaveTypeId]
    );

    // @anchor fetch-dependents
    // Podopieczni sciagani dopiero gdy rodzaj = opieka — i zawsze dla wybranego pracownika.
    useEffect(() => {
        if (!isCareLeave || !form.userId) { setDependents([]); return; }
        let cancelled = false;
        setLoadingDependents(true);
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/dependents?userId=${form.userId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => (res.ok ? res.json() : []))
            .then(list => {
                if (cancelled) return;
                setDependents(list);
                // jeden podopieczny — wybierany automatycznie, bez dropdownu
                setForm(f => ({
                    ...f,
                    dependentId: list.length === 1
                        ? list[0].id
                        : (list.some(d => d.id === f.dependentId) ? f.dependentId : ''),
                }));
            })
            .catch(() => { if (!cancelled) setDependents([]); })
            .finally(() => { if (!cancelled) setLoadingDependents(false); });
        return () => { cancelled = true; };
    }, [isCareLeave, form.userId]);

    // @anchor fetch-leave-balance
    useEffect(() => {
        if (!form.userId) { setBalance(null); return; }
        let cancelled = false;
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/leave-balances?userId=${form.userId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (!cancelled) setBalance(data); })
            .catch(() => { if (!cancelled) setBalance(null); });
        return () => { cancelled = true; };
    }, [form.userId]);

    // @anchor fetch-type-usage
    /// Ile dni wybrano i ile zostało z każdego rodzaju urlopu — liczy backend,
    /// tymi samymi regułami, którymi blokuje wysyłkę wniosku.
    useEffect(() => {
        if (!form.userId) { setTypeUsage(null); return; }
        let cancelled = false;
        const token = sessionStorage.getItem('token');
        const year = Number((form.dateStart || '').slice(0, 4)) || new Date().getFullYear();
        fetch(`${API_URL}/leave-requests/type-usage?userId=${form.userId}&year=${year}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (!cancelled) setTypeUsage(data); })
            .catch(() => { if (!cancelled) setTypeUsage(null); });
        return () => { cancelled = true; };
    }, [form.userId, form.dateStart]);

    // @anchor selected-type-usage
    const selectedUsage = useMemo(
        () => (typeUsage?.items || []).find(i => i.leaveTypeId === form.leaveTypeId) || null,
        [typeUsage, form.leaveTypeId]
    );

    // @anchor selected-type-consumes-balance
    const consumesBalance = useMemo(
        () => !!leaveTypes.find(t => t.id === form.leaveTypeId)?.consumesBalance,
        [leaveTypes, form.leaveTypeId]
    );

    // @anchor working-days-between-front
    // Dni od poczatku do konca wlacznie, z pominieciem sobot i niedziel.
    // 11.08 00:00 → 12.08 23:59 to dwa dni; weekend w zakresie nie jest liczony.
    const workingDays = (startLocal, endLocal) => {
        if (!startLocal || !endLocal) return 0;
        const [ay, am, ad] = startLocal.slice(0, 10).split('-').map(Number);
        const [by, bm, bd] = endLocal.slice(0, 10).split('-').map(Number);
        const start = Date.UTC(ay, am - 1, ad);
        const end = Date.UTC(by, bm - 1, bd);
        if (isNaN(start) || isNaN(end) || end < start) return 0;
        let days = 0;
        for (let ms = start; ms <= end; ms += 86400000) {
            const dow = new Date(ms).getUTCDay();
            if (dow !== 0 && dow !== 6) days++;
        }
        return days;
    };

    // @anchor auto-days-count
    useEffect(() => {
        if (daysTouched) return;
        setForm(f => {
            const computed = workingDays(f.dateStart, f.dateEnd);
            return f.daysCount === computed ? f : { ...f, daysCount: computed };
        });
    }, [form.dateStart, form.dateEnd, daysTouched]);

    const selectedDependent = dependents.find(d => d.id === form.dependentId) || null;

    const formatBirthDate = (v) => {
        if (!v) return '—';
        const d = new Date(v);
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pl-PL');
    };

    const ageOf = (v) => {
        const d = new Date(v);
        if (isNaN(d.getTime())) return null;
        const now = new Date();
        let age = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
        return age;
    };

    // @anchor leave-request-balance-block
    // Wymaganie: bez dostępnych dni w puli nie da się złożyć wniosku o urlop konsumujący saldo.
    const totalRemaining = balance?.totalRemaining ?? 0;
    const requestedDays = Number(form.daysCount) || 0;
    const balanceBlock = !consumesBalance || !balance
        ? null
        : totalRemaining <= 0
            ? 'Brak dostępnych dni urlopu — wniosku nie można złożyć.'
            : requestedDays > totalRemaining
                ? `Wniosek na ${requestedDays} dni przekracza dostępne ${totalRemaining} dni.`
                : null;

    const handleSave = async () => {
        setError(null);
        if (!form.userId) return setError('Wybierz pracownika.');
        if (!form.leaveTypeId) return setError('Wybierz rodzaj urlopu.');
        if (!form.dateStart || !form.dateEnd) return setError('Podaj datę od i do.');
        if (form.dateEnd < form.dateStart) return setError('Data „do" nie może być wcześniejsza niż „od".');
        if (isCareLeave && !form.dependentId) return setError('Urlop opiekuńczy wymaga wskazania podopiecznego.');
        if (balanceBlock) return setError(balanceBlock);

        const payload = {
            userId: form.userId,
            leaveTypeId: form.leaveTypeId || null,
            dependentId: isCareLeave ? form.dependentId : null,
            dateStart: new Date(form.dateStart).toISOString(),
            dateEnd: new Date(form.dateEnd).toISOString(),
            timeStart: form.dateStart.slice(11, 16),
            timeEnd: form.dateEnd.slice(11, 16),
            comment: form.comment || null,
            daysCount: Number(form.daysCount) || 1,
            officeFrom: form.officeFrom ? new Date(form.officeFrom).toISOString() : null,
            officeTo: form.officeTo ? new Date(form.officeTo).toISOString() : null,
        };

        setSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-requests${isEdit ? `/${request.id}` : ''}`, {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

    const inputCls = 'bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50';
    const labelCls = 'text-xs text-gray-400 uppercase tracking-widest';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={handleBackdrop}>
            <div className="relative bg-gray-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">{isEdit ? 'Edycja wniosku urlopowego' : 'Nowy wniosek urlopowy'}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-xl leading-none">&times;</button>
                </div>

                {error && <div className="p-3 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-sm">{error}</div>}

                {/* @anchor leave-request-balance-banner */}
                {consumesBalance && balance && (
                    <div className={`p-2 rounded text-xs border ${balanceBlock ? 'bg-red-600/15 border-red-500/40 text-red-300' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                        Dostępne dni urlopu: <span className="font-semibold">{totalRemaining}</span>
                        {balanceBlock ? ` — ${balanceBlock}` : ''}
                    </div>
                )}

                {/* Imię Nazwisko */}
                <div className="flex flex-col gap-1">
                    <label className={labelCls}>Imię Nazwisko <span className="text-amber-500">*</span></label>
                    <select
                        value={form.userId}
                        onChange={e => set('userId', e.target.value)}
                        disabled={!canPickEmployee}
                        className={`bg-gray-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50 ${!canPickEmployee ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        <option value="">— wybierz —</option>
                        {employees.map(u => (
                            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                        ))}
                    </select>
                </div>

                {/* rodzaj_urlopu */}
                <div className="flex flex-col gap-1">
                    <label className={labelCls}>Rodzaj urlopu <span className="text-amber-500">*</span></label>
                    <select
                        value={form.leaveTypeId}
                        onChange={e => set('leaveTypeId', e.target.value)}
                        className="bg-gray-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50"
                    >
                        <option value="">— wybierz —</option>
                        {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>

                    {/* @anchor leave-request-type-usage-info */}
                    {selectedUsage && (
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs bg-white/5 border border-white/10 rounded px-3 py-2">
                            <span className="text-gray-500">
                                w {typeUsage?.year} roku wybrano:
                                <span className="ml-1 text-gray-200 font-semibold">{selectedUsage.used}</span> dni
                            </span>
                            {selectedUsage.pending > 0 && (
                                <span className="text-amber-400">w tym oczekuje: {selectedUsage.pending}</span>
                            )}
                            {selectedUsage.limit === null ? (
                                <span className="text-gray-500">bez limitu rocznego</span>
                            ) : (
                                <span className={selectedUsage.remaining > 0 ? 'text-green-400' : 'text-red-400'}>
                                    zostało: <span className="font-semibold">{selectedUsage.remaining}</span> z {selectedUsage.limit}
                                    {selectedUsage.source ? <span className="text-gray-600"> ({selectedUsage.source})</span> : null}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Podopieczny — tylko dla urlopu opiekuńczego */}
                {/* @anchor leave-request-dependent-section */}
                {isCareLeave && (
                    <div className="flex flex-col gap-2 border border-teal-500/30 bg-teal-500/[0.06] rounded-lg p-3">
                        <label className={labelCls}>Podopieczny <span className="text-amber-500">*</span></label>

                        {loadingDependents ? (
                            <p className="text-sm text-gray-500">Wczytywanie podopiecznych...</p>
                        ) : dependents.length === 0 ? (
                            <p className="text-sm text-amber-300">
                                Ten pracownik nie ma zapisanych podopiecznych. Dodaj ich w zakładce „Moje dane”,
                                sekcja Podopieczni.
                            </p>
                        ) : (
                            <>
                                {dependents.length > 1 && (
                                    <select
                                        value={form.dependentId}
                                        onChange={e => set('dependentId', e.target.value)}
                                        className="bg-gray-800 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-teal-500/50"
                                    >
                                        <option value="">— wybierz podopiecznego —</option>
                                        {dependents.map(d => (
                                            <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                                        ))}
                                    </select>
                                )}

                                {selectedDependent && (
                                    <div className="grid grid-cols-3 gap-3 pt-1">
                                        <div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Imię</p>
                                            <p className="text-sm text-gray-200">{selectedDependent.firstName}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Nazwisko</p>
                                            <p className="text-sm text-gray-200">{selectedDependent.lastName}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Data urodzenia</p>
                                            <p className="text-sm text-gray-200">
                                                {formatBirthDate(selectedDependent.birthDate)}
                                                {ageOf(selectedDependent.birthDate) !== null && (
                                                    <span className="text-gray-500"> ({ageOf(selectedDependent.birthDate)} l.)</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* data_od / data_do */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                        <label className={labelCls}>Data od <span className="text-amber-500">*</span></label>
                        <input type="datetime-local" value={form.dateStart} onChange={e => set('dateStart', e.target.value)} className={inputCls} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className={labelCls}>Data do <span className="text-amber-500">*</span></label>
                        <input type="datetime-local" value={form.dateEnd} onChange={e => set('dateEnd', e.target.value)} className={inputCls} />
                    </div>
                </div>

                {/* komentarz */}
                <div className="flex flex-col gap-1">
                    <label className={labelCls}>Komentarz</label>
                    <input type="text" value={form.comment} onChange={e => set('comment', e.target.value)} className={inputCls} />
                </div>

                {/* dni_urlopu */}
                {/* @anchor leave-request-days-field */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between">
                        <label className={labelCls}>Dni urlopu</label>
                        {daysTouched ? (
                            <button
                                type="button"
                                onClick={() => { setDaysTouched(false); set('daysCount', workingDays(form.dateStart, form.dateEnd)); }}
                                className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                przelicz z dat
                            </button>
                        ) : (
                            <span className="text-[10px] text-gray-500">wyliczane z dat, bez sobot i niedziel</span>
                        )}
                    </div>
                    <input
                        type="number" step="0.5" min="0"
                        value={form.daysCount}
                        onChange={e => { setDaysTouched(true); set('daysCount', e.target.value); }}
                        placeholder="1"
                        className={inputCls}
                    />
                </div>

                {/* Sekcja dodatkowa */}
                <button
                    type="button"
                    onClick={() => setShowExtra(v => !v)}
                    className="text-left text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                    {showExtra ? '▼' : '▶'} Obecność w biurze i saldo dni
                </button>

                {showExtra && (
                    <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className={labelCls}>W biurze od</label>
                                <input type="datetime-local" value={form.officeFrom} onChange={e => set('officeFrom', e.target.value)} className={inputCls} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className={labelCls}>W biurze do</label>
                                <input type="datetime-local" value={form.officeTo} onChange={e => set('officeTo', e.target.value)} className={inputCls} />
                            </div>
                        </div>

                        {/* @anchor leave-request-balance-grid */}
                        {/* Lata liczone dynamicznie z salda (rok bieżący i 4 wstecz) — wartości tylko do odczytu. */}
                        <div className="flex items-baseline justify-between">
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Dni jeszcze do wybrania</p>
                            <span className="text-[10px] text-gray-600">z puli urlopowej pracownika</span>
                        </div>
                        {balance?.years?.length ? (
                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${balance.years.length}, minmax(0, 1fr))` }}>
                                {balance.years.map(y => (
                                    <div key={y.year} className="flex flex-col gap-1">
                                        <span className="text-[10px] text-gray-500">{y.year}</span>
                                        <span className={`px-2 py-1.5 rounded border border-white/10 text-sm ${y.remainingDays > 0 ? 'text-green-300 bg-green-500/5' : 'text-gray-600 bg-white/5'}`}>
                                            {y.remainingDays}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">Brak ustawionej puli dni urlopowych.</p>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={onClose} className="px-4 py-2 rounded bg-white/5 hover:bg-white/10 text-gray-300 transition-all">Anuluj</button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !!balanceBlock}
                        title={balanceBlock || undefined}
                        className="px-5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Zapisywanie...' : isEdit ? 'Zapisz' : 'Złóż wniosek'}
                    </button>
                </div>
            </div>
        </div>
    );
}
