import { useCallback, useSyncExternalStore } from 'react';

// @anchor use-branch-focus — wybrana gałąź zamówienia WSPÓLNA dla zakładek (Planowanie, Realizacja).
// Trzyma KLUCZ gałęzi, nie id wiersza: `wbsRootOf(węzeł)` = `sourceWbsNodeId ?? id`, czyli ten sam
// klucz w każdej wersji zamówienia. Planowanie stoi na wersji roboczej, Realizacja na baseline —
// każda zakładka tłumaczy klucz na id węzła we własnej wersji (`idGaleziPoKluczu`).
// Pamięć w module (działa bez sessionStorage, np. w trybie prywatnym) + sessionStorage, żeby wybór
// przeżył odświeżenie strony. `SYNTHETIC_ROOT` ('__root__') = całe zamówienie.
const KLUCZ = (orderId) => `branch-focus-${orderId}`;
// Dawny klucz Realizacji (trzymał id wiersza z baseline) — czytany raz, przy pierwszym wejściu.
const STARY_KLUCZ = (orderId) => `realizacja-focus-${orderId}`;

const pamiec = new Map();
const sluchacze = new Set();

function czytaj(orderId) {
    if (!orderId) return null;
    if (pamiec.has(orderId)) return pamiec.get(orderId);
    let v = null;
    try { v = sessionStorage.getItem(KLUCZ(orderId)) ?? sessionStorage.getItem(STARY_KLUCZ(orderId)); } catch { /* tryb prywatny */ }
    pamiec.set(orderId, v);
    return v;
}

export function setBranchFocus(orderId, klucz) {
    if (!orderId) return;
    pamiec.set(orderId, klucz ?? null);
    try {
        if (klucz) sessionStorage.setItem(KLUCZ(orderId), klucz); else sessionStorage.removeItem(KLUCZ(orderId));
        sessionStorage.removeItem(STARY_KLUCZ(orderId));
    } catch { /* tryb prywatny — zostaje pamięć modułu */ }
    sluchacze.forEach(f => f());
}

const subskrybuj = (f) => { sluchacze.add(f); return () => sluchacze.delete(f); };

// Zwraca [klucz | null, ustaw(klucz)].
export function useBranchFocus(orderId) {
    const klucz = useSyncExternalStore(subskrybuj, () => czytaj(orderId));
    const ustaw = useCallback((k) => setBranchFocus(orderId, k), [orderId]);
    return [klucz, ustaw];
}

// @anchor id-galezi-po-kluczu — mapa klucz gałęzi → id węzła w TEJ wersji. Przyjmuje zarówno
// klucz (`wbsRootOf`), jak i samo id wiersza (dawne zapisy i węzły bez klonu).
export function idGaleziPoKluczu(galezie, wbsRootOf) {
    const m = new Map();
    for (const g of galezie || []) m.set(g.id, g.id);
    for (const g of galezie || []) {
        const k = wbsRootOf(g);
        if (k && !m.has(k)) m.set(k, g.id);
    }
    return m;
}
