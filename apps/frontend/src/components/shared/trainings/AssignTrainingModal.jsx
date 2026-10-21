import { useMemo, useState } from 'react';
import { addMonthsIso, fullName, todayIso, trainingsApi } from './trainingsShared';
import { Modal, BTN, BTN_PRIMARY, INPUT, LABEL } from './TrainingsUi';

// @anchor assign-training-modal — przypisanie / odnowienie szkolenia. „Ważne do" liczy się z okresu
// ważności typu i można je nadpisać. Lista pracowników obejmuje też osoby bez szkoleń — po zapisie
// pojawiają się w macierzy. Para pracownik × typ ma jeden wpis, więc odnowienie go nadpisuje.
export default function AssignTrainingModal({ users, types, initialUserId = '', initialTypeId = '', onClose, onSaved }) {
    const [userId, setUserId] = useState(initialUserId);
    const [typeId, setTypeId] = useState(initialTypeId);
    const [completedAt, setCompletedAt] = useState(todayIso());
    const typ = types.find(t => t.id === typeId);
    const [validUntil, setValidUntil] = useState(() => (typ?.validityMonths ? addMonthsIso(todayIso(), typ.validityMonths) : ''));
    const [certificateNo, setCertificateNo] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const posortowani = useMemo(() => [...users].sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'pl')), [users]);
    const istniejace = users.find(u => u.id === userId)?.trainings.find(t => t.trainingTypeId === typeId);

    const przelicz = (tId, data) => {
        const t = types.find(x => x.id === tId);
        setValidUntil(t?.validityMonths && data ? addMonthsIso(data, t.validityMonths) : '');
    };

    const zapisz = async () => {
        setError('');
        if (!userId || !typeId || !completedAt) { setError('Wybierz pracownika, typ i datę ukończenia.'); return; }
        if (validUntil && validUntil < completedAt) { setError('Data ważności nie może być wcześniejsza niż data ukończenia.'); return; }
        setBusy(true);
        try {
            await trainingsApi('/user-trainings', { method: 'PUT', body: { userId, trainingTypeId: typeId, completedAt, validUntil: validUntil || null, certificateNo } });
            const u = users.find(x => x.id === userId);
            onSaved(`${istniejace ? 'Odnowiono' : 'Przypisano'}: ${typ?.code || typ?.name} → ${fullName(u)}`, userId);
        } catch (e) { setError(e.message); setBusy(false); }
    };

    return (
        <Modal title={istniejace ? 'Odnowienie szkolenia' : 'Przypisz szkolenie'} onClose={onClose} footer={<>
            <button onClick={onClose} className={BTN}>Anuluj</button>
            <button onClick={zapisz} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Zapisuję…' : istniejace ? 'Odnów' : 'Przypisz'}</button>
        </>}>
            <label className={LABEL}>Pracownik
                <select value={userId} onChange={e => setUserId(e.target.value)} className={INPUT}>
                    <option value="">— wybierz —</option>
                    {posortowani.map(u => (
                        <option key={u.id} value={u.id}>{[u.lastName, u.firstName].filter(Boolean).join(' ') || u.email}{u.trainings.length ? '' : '  (brak szkoleń)'}</option>
                    ))}
                </select>
            </label>
            <label className={LABEL}>Typ szkolenia
                <select value={typeId} onChange={e => { setTypeId(e.target.value); przelicz(e.target.value, completedAt); }} className={INPUT}>
                    <option value="">— wybierz —</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
            </label>
            {istniejace && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Pracownik ma już to szkolenie (ważne do {istniejace.validUntil || 'bezterminowo'}) — zapis je odnowi.</div>}
            <div className="grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>Data ukończenia
                    <input type="date" value={completedAt} onChange={e => { setCompletedAt(e.target.value); przelicz(typeId, e.target.value); }} className={INPUT} />
                </label>
                <label className={LABEL}>Ważne do
                    <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={INPUT} />
                    <span className="font-normal text-gray-500">{typ && !typ.validityMonths ? 'typ bezterminowy — zostaw puste' : 'z okresu ważności typu — można nadpisać'}</span>
                </label>
            </div>
            <label className={LABEL}>Nr zaświadczenia / certyfikatu
                <input value={certificateNo} onChange={e => setCertificateNo(e.target.value)} placeholder="opcjonalnie" className={INPUT} />
            </label>
            {error && <div className="text-xs text-red-400">{error}</div>}
        </Modal>
    );
}
