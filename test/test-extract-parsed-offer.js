// Test jednostkowy logiki extractParsedOffer (material-requirements.service.ts)
// — kopia czystej funkcji; uruchom: node test/test-extract-parsed-offer.js

function extractParsedOffer(raw) {
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (objMatch) {
        try {
            const obj = JSON.parse(objMatch[0]);
            if (obj && Array.isArray(obj.positions)) {
                return { supplier: obj.supplier ?? null, positions: obj.positions };
            }
        } catch { /* spróbuj formatu tablicowego */ }
    }
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (arrMatch) {
        try {
            const arr = JSON.parse(arrMatch[0]);
            if (Array.isArray(arr)) return { supplier: null, positions: arr };
        } catch { /* nieparsowalna odpowiedź */ }
    }
    return { supplier: null, positions: [] };
}

const cases = [
    {
        name: 'nowy format obiektowy z supplier',
        raw: 'Oto wynik:\n{"supplier":{"name":"PROMITEL","nip":"5260250995","offerNumber":"OF/1"},"positions":[{"lp":1,"name":"Kamera"}]}',
        check: (r) => r.supplier?.name === 'PROMITEL' && r.positions.length === 1,
    },
    {
        name: 'nowy format z supplier: null',
        raw: '{"supplier":null,"positions":[{"lp":1,"name":"X"},{"lp":2,"name":"Y"}]}',
        check: (r) => r.supplier === null && r.positions.length === 2,
    },
    {
        name: 'stary format — sama tablica',
        raw: 'json:\n[{"lp":1,"name":"Kamera","priceNetto":100}]',
        check: (r) => r.supplier === null && r.positions.length === 1 && r.positions[0].priceNetto === 100,
    },
    {
        name: 'markdown fence wokół obiektu',
        raw: '```json\n{"supplier":{"name":"A"},"positions":[]}\n```',
        check: (r) => r.supplier?.name === 'A' && r.positions.length === 0,
    },
    {
        name: 'śmieciowa odpowiedź',
        raw: 'nie umiem tego sparsować, przykro mi',
        check: (r) => r.supplier === null && r.positions.length === 0,
    },
    {
        name: 'tablica obiektów bez wrappera (regex obiektowy łapie środek)',
        raw: '[{"lp":1,"name":"A"},{"lp":2,"name":"B"}]',
        check: (r) => r.supplier === null && r.positions.length === 2,
    },
];

let fail = 0;
for (const c of cases) {
    const r = extractParsedOffer(c.raw);
    const ok = c.check(r);
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${c.name}`);
    if (!ok) { fail++; console.log('   wynik:', JSON.stringify(r)); }
}
process.exit(fail ? 1 : 0);
