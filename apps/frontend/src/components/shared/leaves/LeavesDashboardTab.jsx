import { API_URL } from '../../../config';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { pl } from 'date-fns/locale/pl';
import { statusMeta, warsawDayKey } from './leavesTheme';
import useAutoRefresh from '../../../hooks/useAutoRefresh';

registerLocale('pl', pl);

// @anchor leaves-datepicker-portal
// Kalendarz renderowany w portalu z klasą `ignite-dp` — dzięki temu ma ciemny motyw
// (CSS w index.css) i nie jest przycinany przez `overflow` paneli dashboardu.
const DpPortal = ({ children }) => createPortal(<div className="ignite-dp">{children}</div>, document.body);

// @anchor leaves-filter-date-field
// Pole daty w filtrze: kalendarz react-datepicker + krzyżyk do szybkiego wyczyszczenia.
const FilterDateField = ({ label, value, onChange }) => (
    <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</label>
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    title="Wyczyść datę"
                    className="text-[10px] text-gray-500 hover:text-red-300 transition-colors leading-none"
                >
                    ✕ wyczyść
                </button>
            )}
        </div>
        <DatePicker
            selected={value ? new Date(`${value}T12:00:00`) : null}
            onChange={(d) => {
                if (!d) return onChange('');
                const pad = n => String(n).padStart(2, '0');
                onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
            }}
            locale="pl"
            dateFormat="dd.MM.yyyy"
            placeholderText="dd.mm.rrrr"
            isClearable
            showPopperArrow={false}
            popperPlacement="bottom-start"
            popperContainer={DpPortal}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
        />
    </div>
);

// @anchor leaves-dashboard-tab
// Zakładka „Dashboard" — panel FILTR, szczegóły pracownika, saldo dni i jego wnioski.
export default function LeavesDashboardTab({ access, employees, currentUserId, onNewRequest }) {
    const [selectedUserId, setSelectedUserId] = useState(currentUserId || '');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [onlyPending, setOnlyPending] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    // @anchor dashboard-can-pick-employee
    // Wybór pracownika: przełożony i ADMIN (scope != SELF) oraz role podglądowe (DAK) z canViewAll.
    const canPick = !!access?.canViewAll || access?.scope !== 'SELF';

    // @anchor fetch-leaves-dashboard
    // `silent` = odswiezanie w tle (co 5 min) — bez spinnera, zeby karty nie migaly
    const fetchDashboard = useCallback(async (userId, silent = false) => {
        if (!silent) setLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const qs = userId && userId !== currentUserId ? `?userId=${userId}` : '';
            const res = await fetch(`${API_URL}/leave-requests/dashboard${qs}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || 'Nie udało się pobrać danych — odśwież stronę.');
            }
            setData(await res.json());
            setError(null);
        } catch (err) {
            // przy odswiezaniu w tle nie kasujemy tego, co uzytkownik juz widzi —
            // chwilowy blad sieci ma zniknac sam przy nastepnej probie
            if (!silent) { setError(err.message); setData(null); }
        } finally {
            setLoading(false);
        }
    }, [currentUserId]);

    useEffect(() => { fetchDashboard(selectedUserId); }, [selectedUserId, fetchDashboard]);

    // @anchor leaves-dashboard-auto-refresh
    useAutoRefresh(() => fetchDashboard(selectedUserId, true));

    // @anchor dashboard-filter-requests
    // Filtr dat działa na przecięciu zakresów: wniosek 11–12.08 wpada w filtr „od 11.08"
    // i w „do 12.08". Porównujemy dni wg Europe/Warsaw, bo API zwraca daty w UTC.
    const filteredRequests = useMemo(() => {
        let rows = data?.requests || [];
        if (dateFrom) rows = rows.filter(r => warsawDayKey(r.dateEnd) >= dateFrom);
        if (dateTo) rows = rows.filter(r => warsawDayKey(r.dateStart) <= dateTo);
        if (onlyPending) rows = rows.filter(r => statusMeta(r).code === 'PENDING');
        return rows;
    }, [data, dateFrom, dateTo, onlyPending]);

    // @anchor dashboard-balance-years
    // Lata przychodzą z backendu (rok bieżący i 4 wstecz) — front nic nie zaszywa na sztywno.
    const balanceYears = data?.balance?.years || [];
    const balanceTotal = data?.balance?.totalRemaining ?? 0;

    // @anchor dashboard-can-decide
    // Przycisk akceptacji w tabeli — gdy oglądany pracownik jest moim podwładnym (albo jestem adminem).
    const canDecide = !!data?.canDecideSubject;

    // @anchor dashboard-decide-request
    const setDecision = async (row, status) => {
        let decisionComment = null;
        if (status === 'REJECTED') {
            decisionComment = window.prompt('Napisz, dlaczego odrzucasz ten wniosek (możesz zostawić puste):', '');
            if (decisionComment === null) return;
        }
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-requests/${row.id}/decision`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status, decisionComment: decisionComment || null }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || 'Nie udało się zapisać decyzji — spróbuj jeszcze raz.');
            }
            fetchDashboard(selectedUserId);
        } catch (err) {
            alert(err.message);
        }
    };

    // @anchor dashboard-save-entitlement
    // ADMIN ustawia pulę dni za dany rok — bez tego nikt nie może złożyć wniosku urlopowego.
    const saveEntitlement = async (year, value) => {
        const days = Number(String(value).replace(',', '.'));
        if (!isFinite(days) || days < 0) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-balances/entitlement`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ userId: data?.subject?.id, year, entitlementDays: days }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || 'Nie udało się zapisać puli dni — spróbuj jeszcze raz.');
            }
            fetchDashboard(selectedUserId);
        } catch (err) {
            alert(err.message);
        }
    };

    const panelCls = 'bg-white/[0.03] border border-white/10 rounded-xl p-4 flex flex-col min-h-0';
    const panelTitleCls = 'text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 pb-2 border-b border-white/5';
    const fieldLabelCls = 'text-[10px] text-gray-500 uppercase tracking-wider';
    const fieldValueCls = 'text-sm text-gray-200';

    return (
        <div className="flex-1 min-h-0 overflow-auto">
            {error && <div className="mb-3 p-3 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-sm">{error}</div>}

            {/* Panel FILTR węższy o 1/3 od pozostałych — 2fr wobec 3fr */}
            <div className="grid grid-cols-1 xl:grid-cols-[2fr_3fr_3fr_3fr] gap-4 items-start">
                {/* PANEL 1 — FILTR */}
                {/* @anchor dashboard-filter-panel */}
                <div className={panelCls}>
                    <p className={panelTitleCls}>Filtr</p>
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                            <label className={fieldLabelCls}>Imię Nazwisko</label>
                            <select
                                value={selectedUserId}
                                onChange={e => setSelectedUserId(e.target.value)}
                                disabled={!canPick}
                                className={`bg-gray-800 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50 ${!canPick ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                {employees.map(u => (
                                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                                ))}
                            </select>
                        </div>
                        <FilterDateField label="Data od" value={dateFrom} onChange={setDateFrom} />
                        <FilterDateField label="Data do" value={dateTo} onChange={setDateTo} />
                        <div className="flex flex-col gap-1">
                            <label className={fieldLabelCls}>Tylko oczekujące</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setOnlyPending(false)}
                                    className={`flex-1 py-2 rounded text-sm transition-all ${!onlyPending ? 'bg-blue-600/60 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                                >
                                    Wszystkie
                                </button>
                                <button
                                    onClick={() => setOnlyPending(true)}
                                    className={`flex-1 py-2 rounded text-sm transition-all ${onlyPending ? 'bg-amber-600/60 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                                >
                                    Oczekujące
                                </button>
                            </div>
                        </div>
                        {(dateFrom || dateTo || onlyPending) && (
                            <button
                                onClick={() => { setDateFrom(''); setDateTo(''); setOnlyPending(false); }}
                                className="text-xs text-gray-500 hover:text-gray-300 transition-colors text-left"
                            >
                                Wyczyść filtry
                            </button>
                        )}
                    </div>
                </div>

                {/* PANEL 2 — szczegóły pracownika */}
                {/* @anchor dashboard-employee-panel */}
                <div className={panelCls}>
                    <p className={panelTitleCls}>Szczegóły pracownika</p>
                    {loading ? (
                        <p className="text-gray-500 text-sm">Ładowanie...</p>
                    ) : data?.subject ? (
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={onNewRequest}
                                className="self-start bg-green-600/80 hover:bg-green-500 text-white px-3 py-1.5 rounded-md text-xs transition-all"
                            >
                                + Nowy wniosek
                            </button>
                            <div>
                                <p className={fieldLabelCls}>imie_nazwisko</p>
                                <p className={fieldValueCls}>{data.subject.firstName} {data.subject.lastName}</p>
                            </div>
                            <div>
                                <p className={fieldLabelCls}>email logowania</p>
                                <p className={fieldValueCls}>{data.subject.email}</p>
                            </div>
                            <div>
                                <p className={fieldLabelCls}>firma</p>
                                <p className={fieldValueCls}>{data.subject.company || '—'}</p>
                            </div>
                            <div>
                                <p className={fieldLabelCls}>przełożony</p>
                                <p className={fieldValueCls}>{data.subject.supervisorName || '—'}</p>
                            </div>
                            <div>
                                <p className={fieldLabelCls}>uprawnienia</p>
                                <p className={fieldValueCls}>{(data.subject.roles || []).join(', ') || '—'}</p>
                            </div>
                            <div>
                                <p className={fieldLabelCls}>wybrany w tym roku ({data.currentYear.year})</p>
                                <p className="text-lg font-semibold text-blue-300">{data.currentYear.totalDays}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm">Brak danych</p>
                    )}
                </div>

                {/* PANEL 3 — saldo dni do wybrania */}
                {/* @anchor dashboard-balance-panel */}
                <div className={panelCls}>
                    <p className={panelTitleCls}>Dni jeszcze do wybrania</p>
                    {data ? (
                        <div className="flex flex-col gap-2">
                            {balanceYears.map(y => (
                                <div key={y.year} className="flex justify-between items-center py-1.5 border-b border-white/5">
                                    <span className="text-sm text-gray-400" title={`przysługuje ${y.entitlementDays}, wykorzystano ${y.usedDays}`}>
                                        urlop z {y.year}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        {access?.canEdit && (
                                            <input
                                                type="number" step="0.5" min="0"
                                                defaultValue={y.entitlementDays}
                                                key={`${y.year}-${y.entitlementDays}`}
                                                onBlur={e => {
                                                    if (Number(e.target.value) !== y.entitlementDays) saveEntitlement(y.year, e.target.value);
                                                }}
                                                title="Pula dni przysługujących za ten rok"
                                                className="w-16 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500/50"
                                            />
                                        )}
                                        <span className={`text-sm font-semibold ${y.remainingDays > 0 ? 'text-green-300' : 'text-gray-600'}`}>
                                            {y.remainingDays}
                                        </span>
                                    </span>
                                </div>
                            ))}
                            <div className="flex justify-between items-center pt-2">
                                <span className="text-xs uppercase tracking-widest text-gray-500">Razem</span>
                                <span className="text-xl font-bold text-blue-300">{balanceTotal}</span>
                            </div>
                            <p className="text-[10px] text-gray-600 mt-2">
                                Źródło: {data.balance.source}
                                {access?.canEdit ? ' — pole po lewej to pula przysługująca za dany rok' : ''}
                            </p>

                            <div className="mt-4 pt-3 border-t border-white/5 flex flex-col gap-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Moje wnioski oczekujące</span>
                                    <span className="text-amber-400 font-semibold">{data.pendingOwn}</span>
                                </div>
                                {access?.scope !== 'SELF' && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-400">Wnioski podwładnych</span>
                                        <span className="text-amber-400 font-semibold">{data.pendingSubordinates}</span>
                                    </div>
                                )}
                            </div>

                            {data.currentYear.byType.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-white/5">
                                    <p className={`${fieldLabelCls} mb-2`}>Wykorzystano w {data.currentYear.year} wg rodzaju</p>
                                    {data.currentYear.byType.map(t => (
                                        <div key={t.name} className="flex justify-between items-center py-1">
                                            <span className="text-xs text-gray-400 inline-flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                                                {t.name}
                                            </span>
                                            <span className="text-xs text-gray-300">{t.days} dni / {t.count} wpisów</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm">Brak danych</p>
                    )}
                </div>

                {/* PANEL 4 — wnioski wybranego pracownika */}
                {/* @anchor dashboard-requests-panel */}
                <div className={panelCls}>
                    <p className={panelTitleCls}>Wnioski wybranego pracownika</p>
                    <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-gray-500 uppercase tracking-wider">
                                    <th className="text-left font-medium py-2 px-1">dni</th>
                                    <th className="text-left font-medium py-2 px-1">data_od</th>
                                    <th className="text-left font-medium py-2 px-1">data_do</th>
                                    <th className="text-left font-medium py-2 px-1">rodzaj</th>
                                    <th className="text-left font-medium py-2 px-1">status</th>
                                    {canDecide && <th className="text-left font-medium py-2 px-1">akcje</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRequests.map(r => {
                                    const meta = statusMeta(r);
                                    return (
                                        <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                                            <td className="py-1.5 px-1 text-gray-300">{r.daysCount}</td>
                                            <td className="py-1.5 px-1 text-gray-400 whitespace-nowrap">{warsawDayKey(r.dateStart)}</td>
                                            <td className="py-1.5 px-1 text-gray-400 whitespace-nowrap">{warsawDayKey(r.dateEnd)}</td>
                                            <td className="py-1.5 px-1 text-gray-400">{r.leaveType?.name || '—'}</td>
                                            <td className="py-1.5 px-1">
                                                <span className={meta.color} title={r.decisionComment || undefined}>{meta.label.toLowerCase()}</span>
                                            </td>
                                            {/* @anchor dashboard-request-actions */}
                                            {canDecide && (
                                                <td className="py-1.5 px-1">
                                                    <span className="flex gap-1">
                                                        {meta.code !== 'APPROVED' && (
                                                            <button onClick={() => setDecision(r, 'APPROVED')} title="Zatwierdź wniosek"
                                                                className="bg-green-500/10 hover:bg-green-500/30 text-green-400 px-2 rounded transition-colors">✓</button>
                                                        )}
                                                        {meta.code !== 'REJECTED' && (
                                                            <button onClick={() => setDecision(r, 'REJECTED')} title="Odrzuć wniosek"
                                                                className="bg-red-500/10 hover:bg-red-500/30 text-red-400 px-2 rounded transition-colors">✕</button>
                                                        )}
                                                        {meta.code !== 'PENDING' && (
                                                            <button onClick={() => setDecision(r, 'PENDING')} title="Cofnij decyzję"
                                                                className="bg-amber-500/10 hover:bg-amber-500/30 text-amber-400 px-2 rounded transition-colors">↩</button>
                                                        )}
                                                    </span>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                                {filteredRequests.length === 0 && (
                                    <tr><td colSpan={canDecide ? 6 : 5} className="py-4 text-center text-gray-600 italic">Brak wniosków</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
