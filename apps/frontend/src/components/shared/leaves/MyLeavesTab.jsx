import { API_URL } from '../../../config';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import LeaveRequestModal from './LeaveRequestModal';
import DependentsSection from './DependentsSection';
import HolidayAdminPanel from './HolidayAdminPanel';
import { fetchLeaveUsage } from './leaveUsage';
import DraggableCard from './DraggableCard';
import { resolveCardOverlaps } from './cardsLayout';
import { leavesGridTheme, leavesDefaultColDef, warsawDayKey } from './leavesTheme';

// @anchor my-leaves-default-layout
/// Domyslne rozmieszczenie kart — punkt wyjscia, gdy uzytkownik nie zapisal wlasnego ukladu.
const DEFAULT_LAYOUT = {
    'dane-osobowe': { x: 0, y: 0 },
    'saldo': { x: 440, y: 0 },
    'podopieczni': { x: 800, y: 0 },
    'wykorzystane': { x: 800, y: 300 },
    'swieta': { x: 440, y: 400 },
    'swieta-admin': { x: 880, y: 730 },
    'tabela': { x: 0, y: 620, w: 1120, h: 520 },
    'historia': { x: 0, y: 1180, w: 900, h: 420 },
};

// @anchor my-leaves-card-ids
const CARD_IDS = Object.keys(DEFAULT_LAYOUT);

// @anchor my-leaves-tab
// Zakładka „Moje dane" — WYŁĄCZNIE dane zalogowanego użytkownika.
// Karty (dane osobowe, saldo, podopieczni) są przeciągalne, tabela urlopów leży pod nimi.
export default function MyLeavesTab({ access, leaveTypes, employees, currentUserId }) {
    const canApproveHolidays = !!access?.canEdit;
    const [activeTypeId, setActiveTypeId] = useState(leaveTypes[0]?.id || null);
    const [leaves, setLeaves] = useState([]);
    // @anchor my-leaves-request-modal-state
    const [modalRequest, setModalRequest] = useState(null);
    const [summary, setSummary] = useState(null);
    const [dependentsCount, setDependentsCount] = useState(0);
    // @anchor my-leaves-history-open
    /// Karta „Urlopy z lat poprzednich" — pokazywana na życzenie, nie zajmuje miejsca domyślnie.
    const [historyOpen, setHistoryOpen] = useState(false);
    // @anchor my-leaves-history-year
    const [historyYear, setHistoryYear] = useState('all');
    // @anchor my-leaves-holidays-state
    const [holidays, setHolidays] = useState(null);
    // @anchor my-leaves-usage-rows
    const [usageRows, setUsageRows] = useState(null);
    const [error, setError] = useState(null);
    // @anchor my-leaves-layout-state
    const [layout, setLayout] = useState(DEFAULT_LAYOUT);
    // @anchor my-leaves-layout-dirty
    const [layoutDirty, setLayoutDirty] = useState(false);
    const [layoutSaving, setLayoutSaving] = useState(false);
    const [layoutSavedAt, setLayoutSavedAt] = useState(null);
    // rozmiary mierzone w DOM — potrzebne tylko do wykrywania kolizji
    const sizesRef = useRef({});
    const layerRef = useRef(null);

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

    // @anchor fetch-my-leaves
    const fetchLeaves = useCallback(async (typeId) => {
        if (!typeId) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leaves?leaveTypeId=${typeId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Błąd pobierania urlopów');
            setLeaves(await res.json());
        } catch (err) {
            setError(err.message);
        }
    }, []);

    useEffect(() => { fetchLeaves(activeTypeId); }, [activeTypeId, fetchLeaves]);
    useEffect(() => { fetchSummary(); }, [fetchSummary]);

    // @anchor load-my-usage
    /// Karta „Wykorzystane dni" — liczby dla bieżącego roku plus wpisy do tabeli historii.
    const loadUsage = useCallback(async () => {
        if (!leaveTypes.length || !currentUserId) return;
        try {
            setUsageRows(await fetchLeaveUsage(leaveTypes, currentUserId));
        } catch { /* brak zestawienia nie blokuje reszty zakładki */ }
    }, [leaveTypes, currentUserId]);

    useEffect(() => { loadUsage(); }, [loadUsage, leaves]);

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

    // @anchor my-leaves-visible
    const visibleLeaves = useMemo(
        () => leaves.filter(l => l.userId === currentUserId),
        [leaves, currentUserId]
    );

    // @anchor my-leaves-col-defs
    /// Widok własny: przyznane urlopy tylko do odczytu — bez usuwania, notatek i edycji dni.
    const colDefs = useMemo(() => [
        { headerName: 'Od', field: 'dateFrom', valueGetter: p => warsawDayKey(p.data.dateFrom), editable: false, flex: 1 },
        { headerName: 'Do', field: 'dateTo', valueGetter: p => warsawDayKey(p.data.dateTo), editable: false, flex: 1 },
        { headerName: 'Dni', field: 'daysCount', editable: false, width: 110 },
    ], []);

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
    ], []);

    const balance = summary?.balance;
    // @anchor my-leaves-balance-years
    // Lata z backendu, od najnowszego — nazwy kolumn liczą się względem roku bieżącego.
    const balanceRows = [...(balance?.years || [])].reverse();
    const balanceTotal = balance?.totalRemaining ?? 0;

    // @anchor fetch-my-layout
    /// Uklad kart zapisany per uzytkownik — ten sam na kazdym komputerze.
    useEffect(() => {
        (async () => {
            try {
                const token = sessionStorage.getItem('token');
                const res = await fetch(`${API_URL}/leaves/layout`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const saved = await res.json();
                if (saved && typeof saved === 'object') {
                    setLayout(prev => {
                        const merged = { ...prev };
                        for (const id of CARD_IDS) {
                            const s = saved[id];
                            if (s && typeof s.x === 'number' && typeof s.y === 'number') merged[id] = s;
                        }
                        return merged;
                    });
                }
            } catch { /* brak zapisanego ukladu — zostaja pozycje domyslne */ }
        })();
    }, []);

    // @anchor my-leaves-measure-card
    const handleMeasure = useCallback((id, w, h) => {
        sizesRef.current[id] = { w, h };
    }, []);

    // @anchor my-leaves-drag-end
    /// Po puszczeniu karty przesuwamy spod niej te, ktore zostalyby przykryte.
    const handleDragEnd = useCallback((id, pos) => {
        setLayout(prev => {
            const containerWidth = layerRef.current?.clientWidth || 1200;
            const moved = { ...prev, [id]: { ...prev[id], ...pos } };
            return resolveCardOverlaps(moved, sizesRef.current, id, containerWidth);
        });
        setLayoutDirty(true);
        setLayoutSavedAt(null);
    }, []);

    // @anchor my-leaves-save-layout
    const handleSaveLayout = async () => {
        setLayoutSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            // rozmiar karty z uchwytem resize tez wedruje na serwer
            const payload = { ...layout };
            const tableSize = sizesRef.current['tabela'];
            if (tableSize) payload['tabela'] = { ...payload['tabela'], w: tableSize.w, h: tableSize.h };

            const res = await fetch(`${API_URL}/leaves/layout`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`Nie udało się zapisać układu (${res.status})`);
            setLayout(payload);
            setLayoutDirty(false);
            setLayoutSavedAt(new Date());
        } catch (err) {
            setError(err.message);
        } finally {
            setLayoutSaving(false);
        }
    };

    // @anchor my-leaves-reset-layout
    const handleResetLayout = () => {
        setLayout(DEFAULT_LAYOUT);
        setLayoutDirty(true);
        setLayoutSavedAt(null);
    };

    const Field = ({ label, value, strong }) => (
        <div className="py-1.5 border-b border-white/5 last:border-b-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
            <p className={strong ? 'text-xl font-bold text-blue-300' : 'text-base text-gray-100'}>{value ?? '—'}</p>
        </div>
    );

    return (
        <div className="flex flex-col">
            {error && <div className="mb-3 p-3 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-sm">{error}</div>}

            {/* @anchor my-leaves-layout-toolbar */}
            <div className="flex justify-end items-center gap-3 mb-2">
                {layoutSavedAt && !layoutDirty && (
                    <span className="text-[11px] text-green-400">układ zapisany</span>
                )}
                {layoutDirty && (
                    <span className="text-[11px] text-amber-400">niezapisane zmiany układu</span>
                )}
                <button onClick={handleResetLayout}
                    className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
                    title="Przywróć domyślne rozmieszczenie kart">
                    ⤢ Ułóż karty od nowa
                </button>
                {/* @anchor my-leaves-save-layout-button */}
                <button onClick={handleSaveLayout}
                    disabled={layoutSaving}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-blue-600/60 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
                    title="Zapisz rozmieszczenie kart na swoim koncie">
                    {layoutSaving ? 'Zapisywanie...' : '💾 Zapisz położenie kart'}
                </button>
            </div>

            {/* Warstwa kart przeciągalnych */}
            {/* @anchor my-leaves-cards-layer */}
            <div ref={layerRef} className="relative" style={{ minHeight: historyOpen ? 1680 : 1200 }}>
                {/* KARTA 1 — dane osobowe */}
                {/* @anchor card-personal-data */}
                <DraggableCard
                    id="dane-osobowe"
                    title={me ? `${me.firstName} ${me.lastName}` : 'Moje dane'}
                    subtitle={me?.email}
                    position={layout['dane-osobowe']}
                    onDragEnd={handleDragEnd}
                    onMeasure={handleMeasure}
                    width={420}
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
                </DraggableCard>

                {/* KARTA 2 — saldo dni na lata */}
                {/* @anchor card-balance */}
                <DraggableCard
                    id="saldo"
                    title="Urlop wypoczynkowy do wybrania"
                    subtitle={balance ? `źródło: ${balance.source}` : undefined}
                    position={layout['saldo']}
                    onDragEnd={handleDragEnd}
                    onMeasure={handleMeasure}
                    width={340}
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
                </DraggableCard>

                {/* KARTA 3 — podopieczni */}
                {/* @anchor card-dependents */}
                <DraggableCard
                    id="podopieczni"
                    title="Podopieczni"
                    subtitle="urlop opiekuńczy"
                    position={layout['podopieczni']}
                    onDragEnd={handleDragEnd}
                    onMeasure={handleMeasure}
                    width={320}
                    accent="#14b8a6"
                >
                    <DependentsSection
                        currentUserId={currentUserId}
                        onCountChange={setDependentsCount}
                    />
                </DraggableCard>

                {/* KARTA 4 — wykorzystane dni wg rodzaju urlopu */}
                {/* @anchor card-usage */}
                <DraggableCard
                    id="wykorzystane"
                    title="Wykorzystane dni"
                    subtitle={`rok ${year} — licznik zeruje się 1 stycznia`}
                    position={layout['wykorzystane']}
                    onDragEnd={handleDragEnd}
                    onMeasure={handleMeasure}
                    width={420}
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
                            {/* @anchor card-usage-details-button */}
                            <button
                                onClick={() => setHistoryOpen(o => !o)}
                                title="Tabela wszystkich wpisów urlopowych z filtrem lat"
                                className="mt-3 w-full bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 px-3 py-2 rounded-lg text-sm transition-colors"
                            >
                                {historyOpen ? 'Ukryj urlopy z lat poprzednich' : 'Pokaż urlopy z lat poprzednich'}
                            </button>
                        </>
                    ) : (
                        <p className="text-sm text-gray-500">Liczenie dni...</p>
                    )}
                </DraggableCard>

                {/* KARTA 4b — dni wolne za święta w sobotę */}
                {/* @anchor card-holidays */}
                <DraggableCard
                    id="swieta"
                    title="Dni wolne za święta"
                    subtitle={`święta w sobotę — rok ${year}`}
                    position={layout['swieta']}
                    onDragEnd={handleDragEnd}
                    onMeasure={handleMeasure}
                    width={420}
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
                                                <td className="py-1.5 text-gray-300 whitespace-nowrap">{h.date}</td>
                                                <td className="py-1.5 text-gray-400 text-xs">{h.name}</td>
                                                <td className={`py-1.5 text-right text-[11px] whitespace-nowrap ${h.approved ? 'text-green-400' : 'text-gray-600'}`}>
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

                </DraggableCard>

                {/* KARTA 4c — zarządzanie dniami wolnymi, tylko ADMIN */}
                {/* @anchor card-holidays-admin */}
                {canApproveHolidays && (
                    <DraggableCard
                        id="swieta-admin"
                        title="Dni wolne — zarządzanie"
                        subtitle="tylko administrator"
                        position={layout['swieta-admin']}
                        onDragEnd={handleDragEnd}
                        onMeasure={handleMeasure}
                        width={520}
                        accent="#f97316"
                    >
                        <HolidayAdminPanel onChanged={loadHolidays} />
                    </DraggableCard>
                )}

                {/* KARTA 5 — tabela moich urlopów, przeciągalna i skalowalna */}
                {/* @anchor my-leaves-table */}
                <DraggableCard
                    id="tabela"
                    title="Moje urlopy"
                    subtitle="wpisy urlopowe (nie wnioski)"
                    position={layout['tabela']}
                    size={layout['tabela']?.w ? { w: layout['tabela'].w, h: layout['tabela'].h } : undefined}
                    onDragEnd={handleDragEnd}
                    onMeasure={handleMeasure}
                    width={1120}
                    height={520}
                    resizable
                    accent="#3b82f6"
                >
                    {/* filtr rodzajów przyklejony do tabeli */}
                    {/* @anchor my-leaves-type-filter */}
                    <div className="flex flex-wrap gap-1 bg-white/5 rounded-t-lg p-1 border border-b-0 border-white/10">
                        {leaveTypes.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setActiveTypeId(t.id)}
                                className={`px-4 py-2 rounded-md transition-all text-sm ${activeTypeId === t.id ? 'text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                style={activeTypeId === t.id ? { backgroundColor: `${t.color}66` } : undefined}
                            >
                                <span className="inline-flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                                    {t.name}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 min-h-0 w-full rounded-b-lg overflow-hidden shadow-2xl border border-white/10">
                        <AgGridReact
                            rowData={visibleLeaves}
                            columnDefs={colDefs}
                            defaultColDef={leavesDefaultColDef}
                            animateRows={true}
                            pagination={true}
                            paginationPageSize={20}
                            theme={leavesGridTheme}
                        />
                    </div>
                </DraggableCard>

                {/* KARTA 6 — historia urlopów z filtrem lat (na życzenie) */}
                {/* @anchor card-history */}
                {historyOpen && (
                    <DraggableCard
                        id="historia"
                        title="Urlopy z lat poprzednich"
                        subtitle="wszystkie wpisy, filtr po roku"
                        position={layout['historia']}
                        size={layout['historia']?.w ? { w: layout['historia'].w, h: layout['historia'].h } : undefined}
                        onDragEnd={handleDragEnd}
                        onMeasure={handleMeasure}
                        width={900}
                        height={420}
                        resizable
                        accent="#a855f7"
                    >
                        {/* @anchor my-leaves-history-filter */}
                        <div className="flex items-center gap-2 bg-white/5 rounded-t-lg p-2 border border-b-0 border-white/10">
                            <label className="text-[11px] text-gray-500 uppercase tracking-wider">rok</label>
                            <select
                                value={historyYear}
                                onChange={e => setHistoryYear(e.target.value)}
                                className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-500/50"
                            >
                                <option value="all">wszystkie lata</option>
                                {historyYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <span className="ml-auto text-[11px] text-gray-500">{historyRows.length} wpisów</span>
                            <button
                                onClick={() => setHistoryOpen(false)}
                                className="text-gray-500 hover:text-gray-300 text-sm leading-none px-1"
                                title="Ukryj kartę"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 w-full rounded-b-lg overflow-hidden shadow-2xl border border-white/10">
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
                    </DraggableCard>
                )}
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
                    onSuccess={fetchSummary}
                />
            )}


        </div>
    );
}
