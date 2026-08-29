// @anchor leave-companies-front
// Firmy, dla których dostępny jest moduł Urlopy — lustro back-stala LEAVE_COMPANIES
// z apps/backend/src/leaves/leaves.service.ts. Zmiana tu wymaga zmiany tam.
export const LEAVE_COMPANIES = ['Airtel Services', 'Airtel Systems', 'LinkedTeam'];

// @anchor calculate-work-experience-months-front
// Staz pracy w miesiacach — lustro back-funkcja calculateWorkExperienceMonths
// z apps/backend/src/leaves/leaves.service.ts. Brak miesiaca => styczen.
export function calculateWorkExperienceMonths(workStartYear, workStartMonth) {
    if (workStartYear === null || workStartYear === undefined || workStartYear === '') return null;
    const year = Number(workStartYear);
    if (!Number.isInteger(year)) return null;
    const rawMonth = Number(workStartMonth);
    const month = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : 1;
    const now = new Date();
    const diff = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
    return diff < 0 ? 0 : diff;
}

// @anchor calculate-work-experience-years-front
// Staz pracy w latach z dokladnoscia do miesiaca — lustro back-funkcja
// calculateWorkExperienceYears. Brak roku => fallback na recznie wpisany staz.
export function calculateWorkExperienceYears(workStartYear, workStartMonth, fallbackYears = null) {
    const months = calculateWorkExperienceMonths(workStartYear, workStartMonth);
    if (months === null) return fallbackYears ?? null;
    return Math.round((months / 12) * 100) / 100;
}

// @anchor format-work-experience-front
// Staz w formie „11 lat 4 mies." — z miesiecy, zeby UI nie pokazywal ulamkow lat.
export function formatWorkExperience(months) {
    if (months === null || months === undefined) return null;
    const years = Math.floor(months / 12);
    const rest = months % 12;
    if (years === 0) return `${rest} mies.`;
    return rest === 0 ? `${years} lat` : `${years} lat ${rest} mies.`;
}

// @anchor leave-entitlement-front
// Wymiar urlopu wypoczynkowego wg Kodeksu pracy art. 154 §1 — lustro back-funkcja
// calculateLeaveEntitlement z apps/backend/src/leaves/leaves.service.ts.
// Zwraca null gdy staz nieznany. Nie uwzglednia proporcji dla niepelnego etatu.
export function calculateLeaveEntitlement(years) {
    if (years === null || years === undefined || years === '') return null;
    const value = Number(String(years).replace(',', '.'));
    if (!isFinite(value) || value < 0) return null;
    return value >= 10 ? 26 : 20;
}
