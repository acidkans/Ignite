import { themeQuartz } from 'ag-grid-community';

// @anchor leaves-grid-theme
// Wspólny ciemny motyw AG Grid dla zakładek modułu Urlopy.
export const leavesGridTheme = themeQuartz.withParams({
    backgroundColor: 'rgba(0, 0, 0, 0)',
    foregroundColor: '#EEE',
    headerBackgroundColor: 'rgba(30, 30, 30, 0.3)',
    rowHoverColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
});

// @anchor leaves-default-col-def
export const leavesDefaultColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    floatingFilter: true,
};

// @anchor format-leave-datetime
/// Data z godziną zawsze w strefie Europe/Warsaw — niezależnie od ustawień przeglądarki.
export const formatDateTime = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' });
};

// @anchor warsaw-day-key-front
// Dzień kalendarzowy wg strefy Europe/Warsaw ('YYYY-MM-DD') — lustro back-funkcja warsawDayKey.
// Daty z API są w UTC (11.08 00:00 lokalnie = 10.08 22:00Z), więc `slice(0, 10)` na surowym
// ISO gubi dobę i wywala filtrowanie po dacie.
export const warsawDayKey = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Warsaw',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
};

// @anchor leave-request-statuses
// Etykiety i kolory statusu wniosku — lustro back-enum LeaveRequestStatus.
export const LEAVE_REQUEST_STATUSES = {
    PENDING: { label: 'Oczekuje', color: 'text-amber-400' },
    APPROVED: { label: 'Zatwierdzony', color: 'text-green-400' },
    REJECTED: { label: 'Odrzucony', color: 'text-red-400' },
};

// @anchor leave-request-status-meta
// Status wniosku z fallbackiem na approvedAt (wnioski sprzed wprowadzenia pola status).
export const statusMeta = (row) => {
    const code = row?.status || (row?.approvedAt ? 'APPROVED' : 'PENDING');
    return { code, ...(LEAVE_REQUEST_STATUSES[code] || LEAVE_REQUEST_STATUSES.PENDING) };
};

// @anchor care-leave-code-front
// Kod rodzaju urlopu wymagajacego podopiecznego — lustro back-stala CARE_LEAVE_CODE.
export const CARE_LEAVE_CODE = 'OPIEKA';
