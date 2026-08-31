import { API_URL } from '../../../config';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import LeaveRequestModal from './LeaveRequestModal';
import DependentsSection from './DependentsSection';
import { fetchLeaveUsage } from './leaveUsage';
import { leavesGridTheme, leavesDefaultColDef, warsawDayKey } from './leavesTheme';
import useAutoRefresh from '../../../hooks/useAutoRefresh';

// @anchor my-leaves-section
/// Podpanel wewnatrz karty „Przeglad" — wyglada jak osobna karta, ale nie jest przeciagalny.
/// Wszystkie sekcje w rzedzie maja te sama wysokosc (h-full na siatce items-stretch).
const Section = ({ title, subtitle, accent, children }) => (
    <div className="h-full flex flex-col bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <div
            className="px-4 py-2.5 border-b border-white/5 shrink-0"
            style={{ background: `linear-gradient(90deg, ${accent}22, transparent)` }}
        >
            <p className="text-xs font-bold uppercase tracking-widest text-gray-300 truncate">{title}</p>
            {subtitle && <p className="text-[10px] text-gray-500 truncate">{subtitle}</p>}
        </div>
        <div className="p-4 flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
);

// @anchor my-leaves-tab
// Zakładka „Moje dane" — WYŁĄCZNIE dane zalogowanego użytkownika.
// Karta „Przegląd urlopowy" skupia dane osobowe, saldo, wykorzystanie i święta w jednym rzędzie sekcji;
// tabela „Moje urlopy" leży pod nią. Obie karty są przeciągalne.
export default function MyLeavesTab({ leaveTypes, employees, currentUserId }) {
    // @anchor my-leaves-request-modal-state
    const [modalRequest, setModalRequest] = useState(null);
    const [summary, setSummary] = useState(null);
    const [dependentsCount, setDependentsCount] = useState(0);
    // @anchor my-leaves-history-year
    const [historyYear, setHistoryYear] = useState('all');
    // @anchor my-leaves-holidays-state
    const [holidays, setHolidays] = useState(null);
    // @anchor my-leaves-usage-rows
    const [usageRows, setUsageRows] = useState(null);
    const [error, setError] = useState(null);

    // @anchor my-leaves-self
    const me = employees.find(u => u.id === currentUserId) || null;
    const meOnly = me ? [me] : [];

    // @anchor fetch-my-summary
    /// Saldo dni i dane pracownika — ten sam endpoint, z którego korzysta Dashboard.
    const fetchSummary = useCallback(async () => {
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-requests/dashboard`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setSummary(await res.json());
        } catch { /* brak podsumowania nie blokuje reszty zakładki */ }
    }, []);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);

    // @anchor load-my-usage
    /// Karta „Wykorzystane dni" — liczby dla bieżącego roku plus wpisy do tabeli historii.
    const loadUsage = useCallback(async () => {
        if (!leaveTypes.length || !currentUserId) return;
        try {
            setUsageRows(await fetchLeaveUsage(leaveTypes, currentUserId));
        } catch { /* brak zestawienia nie blokuje reszty zakładki */ }
    }, [leaveTypes, currentUserId]);

    useEffect(() => { loadUsage(); }, [loadUsage]);

    // @anchor fetch-my-holidays
    /// Dni wolne za święta wypadające w sobotę — lista na bieżący rok wraz ze stanem decyzji.
    const loadHolidays = useCallback(async () => {
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leaves/holidays?year=${new Date().getFullYear()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setHolidays(await res.json());
        } catch { /* brak listy świąt nie blokuje reszty zakładki */ }
    }, []);

    useEffect(() => { loadHolidays(); }, [loadHolidays]);

    // @anchor my-leaves-auto-refresh
    // Saldo, wykorzystane dni i lista swiat odswiezaja sie same co 5 minut —
    // zadna z tych funkcji nie ustawia spinnera, wiec widok nie miga.
    useAutoRefresh(() => { fetchSummary(); loadUsage(); loadHolidays(); });

    const year = new Date().getFullYear();

    // @anchor my-leaves-history-items
    /// Wszystkie wpisy urlopowe użytkownika, spłaszczone z podziału na rodzaje.
    const historyItems = useMemo(
        () => (usageRows || []).flatMap(r => r.items || []).sort((a, b) => (a.dateFrom < b.dateFrom ? 1 : -1)),
        [usageRows]
    );

    // @anchor my-leaves-history-years
    const historyYears = useMemo(
        () => [...new Set(historyItems.map(i => i.year))].sort((a, b) => b - a),
        [historyItems]
    );

    const historyRows = useMemo(
        () => (historyYear === 'all' ? historyItems : historyItems.filter(i => i.year === Number(historyYear))),
        [historyItems, historyYear]
    );

    // @anchor my-leaves-history-col-defs
    const historyColDefs = useMemo(() => [
        {
            headerName: 'Rodzaj', field: 'typeName', flex: 2,
            cellRenderer: (p) => (
                <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.data.color }} />
                    {p.value}
                </span>
            ),
        },
        { headerName: 'Rok', field: 'year', width: 100 },
        { headerName: 'Od', field: 'dateFrom', valueGetter: p => warsawDayKey(p.data.dateFrom), flex: 1 },
        { headerName: 'Do', field: 'dateTo', valueGetter: p => warsawDayKey(p.data.dateTo), flex: 1 },
        { headerName: 'Dni', field: 'daysCount', width: 100 },
        // @anchor my-leaves-history-comment-column
        // Komentarz z wniosku — przy zatwierdzeniu przepisywany do Leave.note.
        {
            headerName: 'Komentarz',
            field: 'note',
            flex: 2,
            valueGetter: p => p.data.note || '—',
            tooltipValueGetter: p => p.data.note || '',
            wrapText: true,
            autoHeight: true,
        },
    ], []);

    const balance = summary?.balance;
    // @anchor my-leaves-balance-years
    // Lata z backendu, od najnowszego — nazwy kolumn liczą się względem roku bieżącego.
    const balanceRows = [...(balance?.years || [])].reverse();
    const balanceTotal = balance?.totalRemaining ?? 0;

    const Field = ({ label, value, strong }) => (
        <div className="py-1.5 border-b border-white/5 last:border-b-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
            <p className={strong ? 'text-xl font-bold text-blue-300' : 'text-base text-gray-100'}>{value ?? '—'}</p>
        </div>
    );

    return (
        <div className="flex flex-col">
            {error && <div className="mb-3 p-3 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-sm">{error}</div>}

            {/* KARTA PRZEGLAD — cztery sekcje w rzedzie plus tabela urlopow pod nimi, bez naglowka */}
            {/* @anchor card-overview */}
            <div className="bg-gray-900/95 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.15fr_0.9fr_1fr_1.05fr] gap-4 items-stretch">
                        {/* SEKCJA 1 — dane osobowe */}
                        {/* @anchor card-personal-data */}
                        <Section
                            title={me ? `${me.firstName} ${me.lastName}` : 'Moje dane'}
                            subtitle={me?.email}
                            accent="#3b82f6"
                        >
                            {/* @anchor card-new-request-button */}
                            <div className="mb-3">
                                <button onClick={() => setModalRequest({})}
                                    className="w-full bg-blue-600/70 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm transition-all">
                                    Nowy wniosek
                                </button>
                            </div>

                            <Field label="imię i nazwisko" value={me ? `${me.firstName} ${me.lastName}` : null} />
                            <Field label="email logowania" value={me?.email} />
                            <Field label="firma" value={me?.company} />
                            <Field label="przełożony" value={summary?.subject?.supervisorName} />
                            <Field label="uprawnienia" value={(summary?.subject?.roles || []).join(', ') || null} />
                            <Field label="podopieczni" value={dependentsCount} />
                            <Field label={`wybrany w tym roku (${summary?.currentYear?.year ?? year})`} value={summary?.currentYear?.totalDays ?? 0} strong />

                            {/* @anchor card-personal-dependents-section */}
                            <div className="mt-4 pt-3 border-t border-white/10">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">podopieczni — urlop opiekuńczy</p>
                                <DependentsSection
                                    currentUserId={currentUserId}
                                    onCountChange={setDependentsCount}
                                />
                            </div>
                        </Section>

                        {/* SEKCJA 2 — saldo dni na lata */}
                        {/* @anchor card-balance */}
                        <Section
                            title="Urlop wypoczynkowy do wybrania"
                            subtitle={balance ? `źródło: ${balance.source}` : undefined}
                            accent="#22c55e"
                        >
                            {balance ? (
                                <>
                                    <div className="mb-3 pb-3 border-b border-white/10">
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">pozostało mi do wybrania</p>
                                        <p className="text-3xl font-bold text-green-300">{balanceTotal}</p>
                                    </div>
                                    {balanceRows.map(y => (
                                        <div key={y.year} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0">
                                            <span className="text-sm text-gray-400" title={`przysługuje ${y.entitlementDays}, wykorzystano ${y.usedDays}`}>
                                                urlop z {y.year}
                                            </span>
                                            <span className={`text-lg font-semibold ${y.remainingDays > 0 ? 'text-green-300' : 'text-gray-600'}`}>
                                                {y.remainingDays}
                                            </span>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <p className="text-sm text-gray-500">Brak danych o puli dni — ustawia ją administrator.</p>
                            )}
                        </Section>

                        {/* SEKCJA 3 — wykorzystane dni wg rodzaju urlopu */}
                        {/* @anchor card-usage */}
                        <Section
                            title="Wykorzystane dni"
                            subtitle={`rok ${year} — licznik zeruje się 1 stycznia`}
                            accent="#a855f7"
                        >
                            {usageRows ? (
                                <>
                                    {usageRows.map(r => (
                                        <div key={r.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0">
                                            <span className="inline-flex items-center gap-2 text-sm text-gray-300">
                                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                                                {r.name}
                                            </span>
                                            {/* @anchor card-usage-limit */}
                                            <span className="text-right whitespace-nowrap">
                                                <span className={`text-lg font-semibold ${r.currentYearDays > 0 ? 'text-purple-300' : 'text-gray-600'}`}>
                                                    {r.currentYearDays}
                                                </span>
                                                {r.maxDaysPerYear ? (
                                                    <span className="text-xs text-gray-500" title={`Limit ustawowy: ${r.maxDaysPerYear} dni w roku`}>
                                                        {' / '}{r.maxDaysPerYear}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <p className="text-sm text-gray-500">Liczenie dni...</p>
                            )}
                        </Section>

                        {/* SEKCJA 4 — dni wolne za święta w sobotę */}
                        {/* @anchor card-holidays */}
                        <Section
                            title="Święta przypadające w sobotę"
                            subtitle={`rok ${year}`}
                            accent="#eab308"
                        >
                            {holidays ? (
                                holidays.items?.length ? (
                                    <>
                                        <div className="mb-2 pb-2 border-b border-white/10 flex items-baseline gap-2">
                                            <span className="text-2xl font-bold text-yellow-300">{holidays.approvedDays}</span>
                                            <span className="text-[11px] text-gray-500">dni zatwierdzonych do odebrania</span>
                                        </div>
                                        {/* @anchor my-leaves-holidays-table */}
                                        <table className="w-full text-sm">
                                            <tbody>
                                                {holidays.items.map(h => (
                                                    <tr key={h.date} className="border-b border-white/5 last:border-b-0">
                                                        <td className="py-1.5 text-gray-300 whitespace-nowrap align-top">{h.date}</td>
                                                        <td className="py-1.5 text-gray-400 text-xs">{h.name}</td>
                                                        <td className={`py-1.5 text-right text-[11px] whitespace-nowrap align-top ${h.approved ? 'text-green-400' : 'text-gray-600'}`}>
                                                            {h.approved ? '✓ zatwierdzony' : 'propozycja'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </>
                                ) : (
                                    <p className="text-sm text-gray-500">W {year} roku żadne święto nie wypada w sobotę.</p>
                                )
                            ) : (
                                <p className="text-sm text-gray-500">Ładowanie...</p>
                            )}
                        </Section>
                    </div>

                    {/* SEKCJA 5 — wszystkie wpisy urlopowe, pelna szerokosc pod siatka sekcji */}
                    {/* @anchor card-history */}
                    <div className="mt-4">
                        <Section
                            title="Moje urlopy"
                            subtitle="wszystkie wpisy urlopowe (nie wnioski), filtr po roku"
                            accent="#3b82f6"
                        >
                            {/* @anchor my-leaves-history-filter */}
                            <div className="flex items-center gap-2 bg-white/5 rounded-t-lg p-2 border border-b-0 border-white/10">
                                <label className="text-[11px] text-gray-500 uppercase tracking-wider">rok</label>
                                <select
                                    value={historyYear}
                                    onChange={e => setHistoryYear(e.target.value)}
                                    className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500/50"
                                >
                                    <option value="all">wszystkie lata</option>
                                    {historyYears.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <span className="ml-auto text-[11px] text-gray-500">{historyRows.length} wpisów</span>
                            </div>

                            <div className="h-[clamp(320px,50vh,520px)] w-full rounded-b-lg overflow-hidden shadow-2xl border border-white/10">
                                <AgGridReact
                                    rowData={historyRows}
                                    columnDefs={historyColDefs}
                                    defaultColDef={leavesDefaultColDef}
                                    animateRows={true}
                                    pagination={true}
                                    paginationPageSize={20}
                                    theme={leavesGridTheme}
                                />
                            </div>
                        </Section>
                    </div>
                </div>
            </div>

            {/* @anchor my-leaves-request-modal */}
            {modalRequest && (
                <LeaveRequestModal
                    request={null}
                    leaveTypes={leaveTypes}
                    employees={meOnly}
                    currentUserId={currentUserId}
                    canPickEmployee={false}
                    onClose={() => setModalRequest(null)}
                    onSuccess={() => { fetchSummary(); loadUsage(); }}
                />
            )}


        </div>
    );
}
