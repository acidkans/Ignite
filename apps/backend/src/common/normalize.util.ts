// @anchor normalize-manufacturer
/** Pierwszy wyraz, pierwsza litera wielka, reszta małe. Np. "CAMBIUM NETWORKS" → "Cambium" */
export function normalizeManufacturer(value: string | null | undefined): string | null {
    if (!value || !value.trim()) return value ?? null;
    const firstWord = value.trim().split(/\s+/)[0];
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}
