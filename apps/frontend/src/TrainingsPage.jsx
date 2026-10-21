import { useCallback, useEffect, useRef, useState } from 'react';
import { trainingsApi } from './components/shared/trainings/trainingsShared';
import { BTN, BTN_PRIMARY, Confirm } from './components/shared/trainings/TrainingsUi';
import TrainingsMatrixTab from './components/shared/trainings/TrainingsMatrixTab';
import TrainingTypesTab from './components/shared/trainings/TrainingTypesTab';
import TrainingAlertsTab from './components/shared/trainings/TrainingAlertsTab';
import TrainingTypeModal from './components/shared/trainings/TrainingTypeModal';
import AssignTrainingModal from './components/shared/trainings/AssignTrainingModal';

// @anchor trainings-tab-meta — zakładki modułu Szkolenia, styl jak w module Urlopy.
const TRAINING_TABS = [
    { id: 'users', label: 'Pracownicy', activeColor: 'text-teal-400', bar: 'bg-teal-500', shadow: '20,184,166' },
    { id: 'types', label: 'Typy szkoleń', activeColor: 'text-blue-400', bar: 'bg-blue-500', shadow: '59,130,246' },
    { id: 'alerts', label: 'Powiadomienia e-mail', activeColor: 'text-amber-400', bar: 'bg-amber-500', shadow: '245,158,11' },
];

// @anchor trainings-page — System › Użytkownicy › Szkolenia (tylko ADMIN; backend pilnuje tego niezależnie).
export default function TrainingsPage() {
    const [tab, setTab] = useState(() => sessionStorage.getItem('erp_trainingsTab') || 'users');
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [typeModal, setTypeModal] = useState(null);     // { type } | { type: null }
    const [assignModal, setAssignModal] = useState(null); // { userId, typeId }
    const [confirm, setConfirm] = useState(null);         // { title, body, run }
    const [busy, setBusy] = useState(false);
    const [toastMsg, setToastMsg] = useState(null);
    const [alertsSignal, setAlertsSignal] = useState(0);
    const toastTimer = useRef(null);

    const toast = useCallback((text, isError = false) => {
        setToastMsg({ text, isError });
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(null), isError ? 5000 : 2500);
    }, []);

    // @anchor fetch-trainings-overview
    const load = useCallback(async () => {
        try { setData(await trainingsApi('/overview')); setError(''); }
        catch (e) { setError(e.message); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const changeTab = (id) => { setTab(id); sessionStorage.setItem('erp_trainingsTab', id); };
    const afterChange = (msg) => { if (msg) toast(msg); load(); setAlertsSignal(n => n + 1); };

    const runConfirm = async () => {
        setBusy(true);
        try { await confirm.run(); afterChange(confirm.done); }
        catch (e) { toast(e.message, true); }
        setBusy(false);
        setConfirm(null);
    };

    const deleteUserTraining = (u, ut, t) => setConfirm({
        title: 'Usunąć szkolenie?',
        body: <>Szkolenie <b>{t?.name}</b> pracownika <b>{[u.firstName, u.lastName].filter(Boolean).join(' ')}</b>.
            {u.trainings.length === 1 && <><br /><br />To jego jedyne szkolenie — po usunięciu zniknie z listy.</>}</>,
        run: () => trainingsApi(`/user-trainings/${ut.id}`, { method: 'DELETE' }),
        done: 'Usunięto szkolenie',
    });
    const deleteType = (t, count) => setConfirm({
        title: 'Usunąć typ szkolenia?',
        body: <>Typ <b>{t.name}</b>{count ? <> — razem z nim zniknie <b>{count}</b> {count === 1 ? 'szkolenie pracownika' : 'szkoleń pracowników'}.</> : '.'}</>,
        run: () => trainingsApi(`/types/${t.id}`, { method: 'DELETE' }),
        done: `Usunięto typ „${t.name}”`,
    });

    return (
        <div className="flex h-full min-h-0 w-full flex-col animate-fade-in">
            <div className="flex flex-wrap items-end gap-3 px-4 pb-3 pt-6 md:px-8">
                <div>
                    <div className="text-[11px] text-gray-500">System › Użytkownicy › Szkolenia</div>
                    <h2 className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-2xl font-bold text-transparent">Szkolenia</h2>
                    <p className="mt-1 text-xs text-gray-500">Daty ważności szkoleń pracowników, zamówienia, które ich wymagają, i alerty e-mail o wygasających szkoleniach.</p>
                </div>
                <div className="flex w-full flex-wrap gap-2">
                    <button onClick={() => setAssignModal({ userId: '', typeId: '' })} disabled={!data?.types.length} title={data?.types.length ? '' : 'Najpierw dodaj typ szkolenia'} className={BTN}>+ Przypisz szkolenie</button>
                    <button onClick={() => setTypeModal({ type: null })} disabled={!data} className={BTN_PRIMARY}>+ Nowy typ szkolenia</button>
                </div>
            </div>

            {/* @anchor trainings-tab-selector */}
            <div className="z-10 flex flex-shrink-0 overflow-x-auto border-b border-white/5 bg-white/[0.01] px-4 scrollbar-none">
                {TRAINING_TABS.map(t => {
                    const active = tab === t.id;
                    const ile = t.id === 'users' ? data?.users.filter(u => u.trainings.length).length : t.id === 'types' ? data?.types.length : null;
                    return (
                        <button key={t.id} onClick={() => changeTab(t.id)}
                            className={`relative whitespace-nowrap px-5 py-3 text-xs font-bold uppercase tracking-widest transition-all ${active ? t.activeColor : 'text-gray-500 hover:text-gray-300'}`}>
                            {t.label}{ile != null && <span className="ml-1.5 text-[10px] text-gray-500">{ile}</span>}
                            {active && <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${t.bar} shadow-[0_0_10px_rgba(${t.shadow},0.5)]`} />}
                        </button>
                    );
                })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                {error && <div className="text-sm text-red-400">{error}</div>}
                {!data && !error && <div className="text-sm text-gray-500">Ładowanie…</div>}
                {data && tab === 'users' && (
                    <TrainingsMatrixTab data={data} onReload={() => afterChange()} toast={toast}
                        onAssign={(userId, typeId) => setAssignModal({ userId, typeId })} onDelete={deleteUserTraining} />
                )}
                {data && tab === 'types' && <TrainingTypesTab data={data} onEdit={t => setTypeModal({ type: t })} onDelete={deleteType} />}
                {tab === 'alerts' && <TrainingAlertsTab toast={toast} reloadSignal={alertsSignal} />}
            </div>

            {typeModal && data && (
                <TrainingTypeModal type={typeModal.type} orders={data.orders} onClose={() => setTypeModal(null)}
                    onSaved={msg => { setTypeModal(null); afterChange(msg); }} />
            )}
            {assignModal && data && (
                <AssignTrainingModal users={data.users} types={data.types} initialUserId={assignModal.userId} initialTypeId={assignModal.typeId}
                    onClose={() => setAssignModal(null)} onSaved={msg => { setAssignModal(null); afterChange(msg); }} />
            )}
            {confirm && <Confirm title={confirm.title} onYes={runConfirm} onNo={() => setConfirm(null)} busy={busy}>{confirm.body}</Confirm>}

            {toastMsg && (
                <div className={`fixed bottom-5 right-5 z-[70] rounded-md border px-4 py-2 text-xs shadow-xl ${toastMsg.isError ? 'border-red-500/60 bg-red-950 text-red-200' : 'border-teal-500/60 bg-[#0f2a26] text-teal-200'}`}>
                    {toastMsg.text}
                </div>
            )}
        </div>
    );
}
