// @anchor leave-companies-front
// Firmy, dla których dostępny jest moduł Urlopy — lustro back-stala LEAVE_COMPANIES
// z apps/backend/src/leaves/leaves.service.ts. Zmiana tu wymaga zmiany tam.
export const LEAVE_COMPANIES = ['Airtel Services', 'Airtel Systems', 'LinkedTeam'];

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
