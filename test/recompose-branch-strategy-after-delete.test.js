// Test logiki recomposeBranchStrategyAfterDelete z WBSHybridTable.jsx.
// Odwzorowuje regułę: po usunięciu liścia przelicz złożenie strategii gałęzi top-level.
// Kluczowe przypadki: usunięcie jednego z wielu liści aktualizuje wpis; usunięcie
// ostatniego liścia strategii CZYŚCI top-level; usunięcie liścia bez strategii NIE
// nadpisuje starej ręcznej treści top-level.

function collectBranchStrategyEntries(node) {
    const entries = [];
    const walk = (n) => {
        for (const child of (n?.children || [])) {
            const s = (child.strategy || '').trim();
            if (s) entries.push({ id: child.id, name: (child.name || 'Element WBS').trim(), strategy: s });
            walk(child);
        }
    };
    walk(node);
    return entries;
}
const composeBranchStrategy = (node) =>
    collectBranchStrategyEntries(node).map(e => `${e.name}:\n${e.strategy}`).join('\n\n');

const deleteNode = (nodes, id) => nodes
    .filter(n => n.id !== id)
    .map(n => ({ ...n, children: deleteNode(n.children || [], id) }));
const findNode = (nodes, id) => {
    for (const n of nodes) {
        if (n.id === id) return n;
        const f = findNode(n.children || [], id);
        if (f) return f;
    }
    return null;
};
const subtreeContains = (node, id) => node.id === id || (node.children || []).some(c => subtreeContains(c, id));

// Symulacja: zwraca nową wartość strategy top-level (lub null gdy pominięto zapis).
function recompute(prevItems, deletedId) {
    const deletedNode = findNode(prevItems, deletedId);
    const nextItems = deleteNode(prevItems, deletedId);
    const root = prevItems.find(r => subtreeContains(r, deletedId));
    if (!root || root.id === deletedId) return { skipped: true };
    const newRoot = nextItems.find(r => r.id === root.id);
    if (!newRoot) return { skipped: true };
    let deletedHadStrategy = false;
    const walk = n => { if ((n?.strategy || '').trim()) deletedHadStrategy = true; (n?.children || []).forEach(walk); };
    walk(deletedNode);
    const composed = composeBranchStrategy(newRoot);
    if (composed === (newRoot.strategy || '')) return { skipped: true };
    if (!composed && !deletedHadStrategy) return { skipped: true };
    return { value: composed };
}

let pass = 0, fail = 0;
const eq = (name, got, exp) => {
    const g = JSON.stringify(got), e = JSON.stringify(exp);
    if (g === e) { pass++; console.log(`  OK  ${name}`); }
    else { fail++; console.log(`FAIL  ${name}\n   oczek: ${e}\n   otrzy: ${g}`); }
};

const tree = () => [{
    id: 'top', name: 'Gałąź', strategy: 'L1:\nA\n\nL2:\nB',
    children: [
        { id: 'l1', name: 'L1', strategy: 'A', children: [] },
        { id: 'l2', name: 'L2', strategy: 'B', children: [] },
    ],
}];

// 1. Usuń jeden z dwóch liści → top zaktualizowany bez usuniętego wpisu
eq('usun jeden z dwoch', recompute(tree(), 'l2'), { value: 'L1:\nA' });

// 2. Usuń ostatni liść strategii → top wyczyszczony na ''
const oneLeaf = [{ id: 'top', name: 'Gałąź', strategy: 'L1:\nA', children: [{ id: 'l1', name: 'L1', strategy: 'A', children: [] }] }];
eq('usun ostatni -> czysci', recompute(oneLeaf, 'l1'), { value: '' });

// 3. Usuń liść BEZ strategii przy ręcznej treści top-level → nie nadpisuj (ochrona)
const legacy = [{ id: 'top', name: 'Gałąź', strategy: 'reczna tresc', children: [{ id: 'l1', name: 'L1', strategy: '', children: [] }] }];
eq('lisc bez strategii -> pomija', recompute(legacy, 'l1'), { skipped: true });

// 4. Usunięcie samego top-level → pominięte (brak gałęzi do przeliczenia)
eq('usun top -> pomija', recompute(tree(), 'top'), { skipped: true });

console.log(`\n${fail === 0 ? 'WSZYSTKIE PRZESZŁY' : 'SĄ BŁĘDY'} — pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
