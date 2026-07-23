// Test jednostkowy logiki composeBranchStrategy z WBSHybridTable.jsx.
// Kopia funkcji (frontend nie eksportuje jej samodzielnie) — sprawdza format złożenia:
// `nazwa: strategia` na każdy wypełniony potomek, węzeł top-level pomija sam siebie.

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

function composeBranchStrategy(node) {
    return collectBranchStrategyEntries(node)
        .map(e => `${e.name}:\n${e.strategy}`)
        .join('\n\n');
}

let pass = 0, fail = 0;
const eq = (name, got, exp) => {
    if (got === exp) { pass++; console.log(`  OK  ${name}`); }
    else { fail++; console.log(`FAIL  ${name}\n   oczek: ${JSON.stringify(exp)}\n   otrzy: ${JSON.stringify(got)}`); }
};

// 1. Dwa liście pod top-level → dwie linie
eq('dwa liscie', composeBranchStrategy({
    name: 'Gałąź A', strategy: 'stara reczna tresc',
    children: [
        { name: 'Liść 1', strategy: 'montaż', children: [] },
        { name: 'Liść 2', strategy: 'kalibracja', children: [] },
    ],
}), 'Liść 1:\nmontaż\n\nLiść 2:\nkalibracja');

// 2. Węzeł pośredni wypełniony + liść pod nim → oba w złożeniu (każda wypełniona komórka)
eq('posredni + lisc', composeBranchStrategy({
    name: 'Gałąź B', strategy: '',
    children: [
        { name: 'Podgałąź', strategy: 'etapami', children: [
            { name: 'Liść X', strategy: 'spawanie', children: [] },
        ] },
    ],
}), 'Podgałąź:\netapami\n\nLiść X:\nspawanie');

// 3. Puste strategie pomijane, brak pustych linii
eq('pomija puste', composeBranchStrategy({
    name: 'Gałąź C', strategy: '',
    children: [
        { name: 'Liść pusty', strategy: '   ', children: [] },
        { name: 'Liść pełny', strategy: 'ok', children: [] },
    ],
}), 'Liść pełny:\nok');

// 4. Nic wypełnione → pusty string (grid pokaże "—" lub starą wartość top-level)
eq('nic wypelnione', composeBranchStrategy({
    name: 'Gałąź D', strategy: 'stara tresc',
    children: [{ name: 'Liść', strategy: '', children: [] }],
}), '');

// 5. Fallback nazwy gdy brak name
eq('fallback nazwy', composeBranchStrategy({
    name: 'Gałąź E', children: [{ strategy: 'bez nazwy', children: [] }],
}), 'Element WBS:\nbez nazwy');

console.log(`\n${fail === 0 ? 'WSZYSTKIE PRZESZŁY' : 'SĄ BŁĘDY'} — pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
