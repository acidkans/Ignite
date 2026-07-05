/**
 * Testuje computeLeafByPath (a dokładniej jej wewnętrzną partsOf()) z UnifiedWbsPanel.jsx
 * na SYNTETYCZNYM `items`, w kształcie jaki naprawdę zwraca backend
 * (wbs-nodes.service.ts getUnifiedTree — WbsNode.parentId=null dla NAJWYŻSZEJ gałęzi,
 * bo projekt to osobny ProcessNode nigdy nieobecny w `items`).
 *
 * Regresja: wcześniejsza wersja robiła `chain.slice(1)` zakładając że trzeba obciąć
 * "zbędny root projektu" z listy — ale takiego elementu w `items` NIGDY nie ma, więc
 * slice(1) obcinał NAJWYŻSZĄ PRAWDZIWĄ GAŁĄŹ (np. "Instalacje elektryczne"), przez co
 * kolumna "Gałąź 1" wychodziła pusta / przesunięta o jeden poziom w dół.
 */

// ---- BEGIN: kod 1:1 z computeLeafByPath w UnifiedWbsPanel.jsx ----
const computeLeafByPath = (items) => {
    const byId = {};
    for (const it of (items || [])) byId[it.id] = it;
    const partsCache = {};
    const partsOf = (it) => {
        if (partsCache[it.id]) return partsCache[it.id];
        const chain = [];
        let cur = it, guard = 0;
        while (cur && guard++ < 50) {
            chain.unshift(cur);
            cur = cur.parentId ? byId[cur.parentId] : null;
        }
        const parts = chain.map(n => String(n.name || '(bez nazwy)').trim() || '(bez nazwy)');
        partsCache[it.id] = parts;
        return parts;
    };
    const leaves = (items || []).filter(it => {
        const t = String(it.type || '').toLowerCase();
        return it.parentId != null && t !== 'group';
    });
    const byPath = {};
    for (const it of leaves) {
        const q = Math.max(0, parseFloat(it.quantity) || 0);
        const uc = Math.max(0, parseFloat(it.unitCost) || 0);
        const tc = uc * q;
        const m = (it.margin != null && String(it.margin) !== '') ? parseFloat(it.margin) : null;
        const d = Math.max(0, parseFloat(it.discount) || 0);
        let op = (m !== null && m !== 0) ? tc * (1 + m / 100) : 0;
        if (op > 0 && d > 0) op = Math.max(0, op * (1 - d / 100));
        const parts = partsOf(it);
        const key = parts.join(' / ');
        if (!byPath[key]) byPath[key] = { cost: 0, revenue: 0, parts };
        byPath[key].cost += tc;
        byPath[key].revenue += op;
    }
    return byPath;
};
// ---- END kodu z UnifiedWbsPanel.jsx ----

// Kształt danych jak z prawdziwego backendu: WbsNode.parentId=null = najwyższa gałąź
// (np. "Instalacje elektryczne"), sam ProcessNode (projekt) nigdy nie jest w `items`.
const items = [
    { id: 'branch1', parentId: null, name: 'Instalacje elektryczne', type: 'group' },
    { id: 'sub1', parentId: 'branch1', name: 'Podgrupa X', type: 'group' },
    { id: 'leaf1', parentId: 'sub1', name: 'Kabel', type: 'material', quantity: 2, unitCost: 10, margin: 20, discount: 0 },
    // liść bezpośrednio pod najwyższą gałęzią, bez podgrupy pośredniej
    { id: 'leaf2', parentId: 'branch1', name: 'Bezpiecznik', type: 'material', quantity: 3, unitCost: 5, margin: 10, discount: 0 },
    // druga najwyższa gałąź
    { id: 'branch2', parentId: null, name: 'Instalacje PPOŻ', type: 'group' },
    { id: 'leaf3', parentId: 'branch2', name: 'Czujka dymu', type: 'material', quantity: 1, unitCost: 100, margin: 15, discount: 0 },
];

const byPath = computeLeafByPath(items);
const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); console.log('OK: ' + msg); };

const keys = Object.keys(byPath);
console.log('Klucze (ścieżki):', keys);

assert(keys.includes('Instalacje elektryczne / Podgrupa X / Kabel'), '"Kabel" ma pełną ścieżkę zaczynającą się od najwyższej gałęzi "Instalacje elektryczne" (nie obciętą)');
assert(byPath['Instalacje elektryczne / Podgrupa X / Kabel'].parts[0] === 'Instalacje elektryczne', 'parts[0] (Gałąź 1) = "Instalacje elektryczne", NIE "Podgrupa X" — regresja buga "brak kolumny z gałęzią"');
assert(byPath['Instalacje elektryczne / Podgrupa X / Kabel'].parts.length === 3, 'głębokość "Kabel" = 3 poziomy (gałąź, podgrupa, liść)');

assert(keys.includes('Instalacje elektryczne / Bezpiecznik'), '"Bezpiecznik" (bezpośrednio pod gałęzią, bez podgrupy) ma ścieżkę zaczynającą się od gałęzi');
assert(byPath['Instalacje elektryczne / Bezpiecznik'].parts.length === 2, 'głębokość "Bezpiecznik" = 2 poziomy (gałąź + liść), nie 1');

assert(keys.includes('Instalacje PPOŻ / Czujka dymu'), '"Czujka dymu" pod drugą najwyższą gałęzią "Instalacje PPOŻ" też ma gałąź w ścieżce');

console.log('\nWszystkie asercje przeszły.');
