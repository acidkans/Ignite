import { useMemo, useState } from 'react';
import { addMonthsIso, fullName, fuzzyMatch, todayIso, trainingsApi } from './trainingsShared';
import { Modal, Highlight, BTN, BTN_PRIMARY, INPUT, LABEL } from './TrainingsUi';

// @anchor assign-check-list — lista z wyszukiwaniem fuzzy i checkboxami. Zaznaczone stoją na górze
// (kolejność z chwili otwarcia, żeby odhaczenie nie przeskakiwało wiersza). „Zaznacz widoczne"
// bierze wiersze po filtrze — szybkie „cały zespół Montaż".
function CheckList({ title, items, selected, onChange, placeholder }) {
    const [q, setQ] = useState('');
    const [startowe] = useState(selected);
    const lista = useMemo(() => items.map(it => {
        if (!q.trim()) return { it, score: 0, hits: [] };
        const m = fuzzyMatch(q, `${it.label} ${it.sub || ''}`);
        if (!m) return null;
        return { it, score: m.score, hits: m.hits.filter(i => i < it.label.length) };
    }).filter(Boolean).sort((a, b) => (q.trim() ? b.score - a.score : (startowe.includes(b.it.id) - startowe.includes(a.it.id)))), [items, q, startowe]);
    // aktualizacje funkcyjne — dwa szybkie kliknięcia nie nadpisują się nieaktualnym `selected`
    const przelacz = (id) => onChange(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    const widoczne = lista.map(w => w.it.id);

    return (
        <div className="grid min-w-0 content-start gap-1.5">
            <div className="flex items-baseline gap-2 text-[11px] font-semibold text-gray-400">
                {title}
                <span className="font-normal text-gray-500">wybrano {selected.length}</span>
                <button type="button" onClick={() => onChange(prev => [...new Set([...prev, ...widoczne])])} className="ml-auto py-1 font-normal text-teal-300 hover:underline">zaznacz widoczne</button>
                <button type="button" onClick={() => onChange([])} className="py-1 font-normal text-gray-400 hover:underline">wyczyść</button>
            </div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} className={INPUT} />
            <div className="h-56 overflow-y-auto rounded-md border border-white/10 bg-[#070c17] py-1" role="listbox" aria-multiselectable="true">
                {!lista.length && <div className="px-3 py-2 text-xs italic text-gray-500">Brak wyników dla „{q}”</div>}
                {lista.map(({ it, hits }) => {
                    const zazn = selected.includes(it.id);
                    return (
                        <div key={it.id} role="option" aria-selected={zazn} onClick={() => przelacz(it.id)}
                            className={`flex min-h-[36px] cursor-pointer items-center gap-2 px-3 py-1 text-[13px] ${zazn ? 'bg-teal-500/10' : 'hover:bg-white/5'}`}>
                            <input type="checkbox" readOnly checked={zazn} tabIndex={-1} className="pointer-events-none accent-teal-500" />
                            <span className="min-w-0 flex-1 truncate text-gray-100"><Highlight text={it.label} hits={hits} /></span>
                            {it.sub && <small className="shrink-0 text-[10.5px] text-gray-500">{it.sub}</small>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// @anchor assign-training-modal — przypisanie / odnowienie szkoleń w JEDNYM podejściu: wielu
// pracowników × wiele typów, wspólna data ukończenia. „Ważne do" liczy się osobno z okresu
// ważności każdego typu; ręczne nadpisanie (i nr zaświadczenia) tylko przy jednym typie.
// Para, która już istnieje, zostaje odnowiona (jeden wpis na pracownika × typ).
export default function AssignTrainingModal({ users, types, initialUserId = '', initialTypeId = '', onClose, onSaved }) {
    const [userIds, setUserIds] = useState(initialUserId ? [initialUserId] : []);
    const [typeIds, setTypeIds] = useState(initialTypeId ? [initialTypeId] : []);
    const [completedAt, setCompletedAt] = useState(todayIso());
    const [validOverride, setValidOverride] = useState(null); // null = z okresu ważności typu
    const [certificateNo, setCertificateNo] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const userItems = useMemo(() => [...users]
        .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'pl'))
        .map(u => ({ id: u.id, label: [u.lastName, u.firstName].filter(Boolean).join(' ') || u.email, sub: [u.team, u.trainings.length ? '' : 'brak szkoleń'].filter(Boolean).join(' · ') })), [users]);
    const typeItems = useMemo(() => types.map(t => ({ id: t.id, label: t.name, sub: [t.code, t.validityMonths ? `${t.validityMonths} mies.` : 'bezterm.'].filter(Boolean).join(' · ') })), [types]);

    const jedenTyp = typeIds.length === 1 ? types.find(t => t.id === typeIds[0]) : null;
    const jedenNaJeden = userIds.length === 1 && typeIds.length === 1;
    const wyliczoneDo = jedenTyp?.validityMonths && completedAt ? addMonthsIso(completedAt, jedenTyp.validityMonths) : '';
    const validUntil = validOverride ?? wyliczoneDo;
    const par = userIds.length * typeIds.length;
    const odnowien = useMemo(() => users.filter(u => userIds.includes(u.id))
        .reduce((s, u) => s + u.trainings.filter(t => typeIds.includes(t.trainingTypeId)).length, 0), [users, userIds, typeIds]);

    const zapisz = async () => {
        setError('');
        if (!userIds.length || !typeIds.length || !completedAt) { setError('Wybierz pracowników, typy szkoleń i datę ukończenia.'); return; }
        if (jedenTyp && validUntil && validUntil < completedAt) { setError('Data ważności nie może być wcześniejsza niż data ukończenia.'); return; }
        setBusy(true);
        try {
            const body = { userIds, trainingTypeIds: typeIds, completedAt };
            if (jedenTyp && validOverride !== null) body.validUntil = validOverride || null;
            if (jedenNaJeden) body.certificateNo = certificateNo;
            const r = await trainingsApi('/user-trainings/bulk', { method: 'PUT', body });
            const kto = userIds.length === 1 ? fullName(users.find(u => u.id === userIds[0])) : `${userIds.length} pracowników`;
            onSaved(`${kto}: ${r.created ? `przypisano ${r.created}` : ''}${r.created && r.renewed ? ', ' : ''}${r.renewed ? `odnowiono ${r.renewed}` : ''}`);
        } catch (e) { setError(e.message); setBusy(false); }
    };

    return (
        <Modal title="Przypisz szkolenia" width="max-w-3xl" onClose={onClose} footer={<>
            <span className="mr-auto self-center text-[11px] text-gray-400">
                {par ? <>{par} {par === 1 ? 'szkolenie' : 'szkoleń'}{odnowien ? <> · <span className="text-amber-300">{odnowien} do odnowienia</span></> : ''}</> : 'nic nie wybrano'}
            </span>
            <button onClick={onClose} className={BTN}>Anuluj</button>
            <button onClick={zapisz} disabled={busy || !par} className={BTN_PRIMARY}>{busy ? 'Zapisuję…' : par > 1 ? `Przypisz ${par}` : odnowien ? 'Odnów' : 'Przypisz'}</button>
        </>}>
            <div className="grid gap-4 md:grid-cols-2">
                <CheckList title="Pracownicy" items={userItems} selected={userIds} onChange={setUserIds} placeholder="Szukaj pracownika lub zespołu…" />
                <CheckList title="Typy szkoleń" items={typeItems} selected={typeIds} onChange={ids => { setTypeIds(ids); setValidOverride(null); }} placeholder="Szukaj szkolenia lub kodu…" />
            </div>
            {odnowien > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    {odnowien === 1 ? 'Jedno z wybranych szkoleń' : `${odnowien} z wybranych szkoleń`} pracownicy już mają — zapis je odnowi (nowa data ukończenia i ważności).
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>Data ukończenia
                    <input type="date" value={completedAt} onChange={e => setCompletedAt(e.target.value)} className={INPUT} />
                </label>
                {jedenTyp ? (
                    <label className={LABEL}>Ważne do
                        <input type="date" value={validUntil} onChange={e => setValidOverride(e.target.value)} className={INPUT} />
                        <span className="font-normal text-gray-500">{!jedenTyp.validityMonths ? 'typ bezterminowy — zostaw puste' : validOverride !== null ? 'nadpisane ręcznie' : 'z okresu ważności typu — można nadpisać'}</span>
                    </label>
                ) : (
                    <div className={LABEL}>Ważne do
                        <div className="flex min-h-[38px] items-center rounded-md border border-white/10 px-3 text-xs font-normal text-gray-400">
                            {typeIds.length ? 'liczone osobno z okresu ważności każdego typu' : '—'}
                        </div>
                    </div>
                )}
            </div>
            {jedenNaJeden && (
                <label className={LABEL}>Nr zaświadczenia / certyfikatu
                    <input value={certificateNo} onChange={e => setCertificateNo(e.target.value)} placeholder="opcjonalnie" className={INPUT} />
                </label>
            )}
            {error && <div className="text-xs text-red-400">{error}</div>}
        </Modal>
    );
}
