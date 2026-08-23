import { API_URL } from '../../../config';
import { warsawDayKey } from './leavesTheme';

// @anchor warsaw-year
/// Rok kalendarzowy wg strefy Europe/Warsaw — urlop z 1 stycznia nie moze wpasc do poprzedniego roku.
const warsawYear = (v) => Number(warsawDayKey(v).slice(0, 4));

// @anchor fetch-leave-usage
/// Ile dni pracownik wybral z kazdego rodzaju urlopu (wszystkie lata) — liczone z wpisow /leaves.
/// Wspolne zrodlo dla karty „Wykorzystane dni" i modala ze szczegolami.
export async function fetchLeaveUsage(leaveTypes, currentUserId) {
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    return Promise.all(
        leaveTypes.map(async (t) => {
            const res = await fetch(`${API_URL}/leaves?leaveTypeId=${t.id}`, { headers });
            if (!res.ok) throw new Error(`Błąd pobierania urlopów (${res.status})`);
            const leaves = await res.json();
            const mine = leaves.filter(l => l.userId === currentUserId);

            const byYear = new Map();
            for (const l of mine) {
                const y = warsawYear(l.dateFrom);
                byYear.set(y, (byYear.get(y) || 0) + (l.daysCount || 0));
            }

            const currentYear = warsawYear(new Date());

            return {
                id: t.id,
                name: t.name,
                color: t.color,
                // @anchor leave-usage-max-days
                /// Ustawowy limit dni w roku z LeaveType.maxDaysPerYear (NULL = brak limitu).
                maxDaysPerYear: t.maxDaysPerYear ?? null,
                entries: mine.length,
                days: mine.reduce((s, l) => s + (l.daysCount || 0), 0),
                // @anchor leave-usage-current-year-days
                /// Licznik zeruje sie 1 stycznia — bierzemy wylacznie wpisy z biezacego roku.
                currentYearDays: mine
                    .filter(l => warsawYear(l.dateFrom) === currentYear)
                    .reduce((s, l) => s + (l.daysCount || 0), 0),
                years: [...byYear.entries()].sort((a, b) => b[0] - a[0]),
                // @anchor leave-usage-items
                /// Pojedyncze wpisy — zrodlo dla tabeli „urlopy z lat poprzednich".
                items: mine.map(l => ({
                    id: l.id,
                    typeName: t.name,
                    color: t.color,
                    dateFrom: l.dateFrom,
                    dateTo: l.dateTo,
                    daysCount: l.daysCount || 0,
                    year: warsawYear(l.dateFrom),
                    // @anchor leave-usage-item-note
                    /// Komentarz z wniosku — przy zatwierdzeniu kopiowany do Leave.note.
                    note: l.note || '',
                })),
            };
        })
    );
}
