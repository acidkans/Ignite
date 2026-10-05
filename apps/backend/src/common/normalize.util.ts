// @anchor normalize-manufacturer
/** Pierwszy wyraz, pierwsza litera wielka, reszta małe. Np. "CAMBIUM NETWORKS" → "Cambium" */
export function normalizeManufacturer(value: string | null | undefined): string | null {
    if (!value || !value.trim()) return value ?? null;
    const firstWord = value.trim().split(/\s+/)[0];
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

// @anchor normalize-wbs-name — nazwa węzła WBS bez śmieciowych białych znaków: spacje/taby/NBSP
// zwinięte do jednej spacji, każda linia przycięta, puste linie na krańcach usunięte, a seria
// pustych linii w środku zwinięta do jednej. Podziały linii ZOSTAJĄ — część pozycji to
// wieloliniowe opisy z oferty. Bez tego „Lisowice " (spacja na końcu) i „Lisowice" to dla
// SUMIF w eksporcie budżetu dwie różne gałęzie.
export function normalizeWbsName<T>(value: T): T {
    if (typeof value !== 'string') return value;
    return value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/[\s ]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim() as unknown as T;
}
