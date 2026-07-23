// Test jednostkowy logiki composeBranchStrategy z WBSHybridTable.jsx.
// Kopia funkcji (frontend nie eksportuje jej samodzielnie) — sprawdza format złożenia:
// `nazwa: strategia` na każdy wypełniony potomek, węzeł top-level pomija sam siebie.

function composeBranchStrategy(node) {
    const parts = [];
    const walk = (n) => {
        for (const child of (n?.children || [])) {
            const s = (child.strategy || '').trim();
            if (s) parts.push(`${(child.name || 'Element WBS').trim()}: ${s}`);
            walk(child);
        }
    };
    walk(node);
    return parts.join('\n');
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
}), 'Liść 1: montaż\nLiść 2: kalibracja');

// 2. Węzeł pośredni wypełniony + liść pod nim → oba w złożeniu (każda wypełniona komórka)
eq('posredni + lisc', composeBranchStrategy({
    name: 'Gałąź B', strategy: '',
    children: [
        { name: 'Podgałąź', strategy: 'etapami', children: [
            { name: 'Liść X', strategy: 'spawanie', children: [] },
        ] },
    ],
}), 'Podgałąź: etapami\nLiść X: spawanie');

// 3. Puste strategie pomijane, brak pustych linii
eq('pomija puste', composeBranchStrategy({
    name: 'Gałąź C', strategy: '',
    children: [
        { name: 'Liść pusty', strategy: '   ', children: [] },
        { name: 'Liść pełny', strategy: 'ok', children: [] },
    ],
}), 'Liść pełny: ok');

// 4. Nic wypełnione → pusty string (grid pokaże "—" lub starą wartość top-level)
eq('nic wypelnione', composeBranchStrategy({
    name: 'Gałąź D', strategy: 'stara tresc',
    children: [{ name: 'Liść', strategy: '', children: [] }],
}), '');

// 5. Fallback nazwy gdy brak name
eq('fallback nazwy', composeBranchStrategy({
    name: 'Gałąź E', children: [{ strategy: 'bez nazwy', children: [] }],
}), 'Element WBS: bez nazwy');

console.log(`\n${fail === 0 ? 'WSZYSTKIE PRZESZŁY' : 'SĄ BŁĘDY'} — pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
