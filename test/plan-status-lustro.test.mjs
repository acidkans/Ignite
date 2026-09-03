// Test lustra statusów PLANU: front (`planStatusFromAny` z wbsConstants.js) i backend
// (`planStatusFromAny` z plan-status.util.ts) MUSZĄ dawać ten sam kod dla każdej wartości,
// jaka może siedzieć w `WbsNode.status` — kodu planistycznego, starego kodu realizacyjnego
// i etykiety z importu.
//
// Rozjazd nie jest kosmetyczny: to od tej funkcji zależy ZAKRES BASELINE. Pozycja czytana
// przez backend jako `CONFIRMED`, a przez front jako `REJECTED`, weszłaby do sumy akceptacji
// i do porównania wycena↔zakup, mimo że na ekranie jest przekreślona jako odrzucona.
//
// Uruchomienie: node test/plan-status-lustro.test.mjs
import { readFileSync } from 'node:fs';
import {
    planStatusFromAny, PLAN_STATUS_CODES, MATERIAL_STATUS_LABELS, WORK_STATUS_LABELS, stripRejectedNodes,
} from '../apps/frontend/src/components/shared/wbs/wbsConstants.js';

const util = readFileSync(new URL('../apps/backend/src/common/plan-status.util.ts', import.meta.url), 'utf8');

// Słowniki i lista kodów wyciągnięte WPROST z pliku backendu — test pilnuje źródła,
// nie kopii przepisanej do testu.
const dict = (name) => {
    const start = util.indexOf(`const ${name}`);
    if (start < 0) throw new Error(`Nie znaleziono ${name} w plan-status.util.ts`);
    const open = util.indexOf('{', start);
    const body = util.slice(open, util.indexOf('};', open));
    return Object.fromEntries([...body.matchAll(/(\w+)\s*:\s*'([^']+)'/g)].map(m => [m[1], m[2]]));
};
const backendMaterial = dict('MATERIAL_STATUS_LABELS');
const backendWork = dict('WORK_STATUS_LABELS');
const backendCodes = util.match(/PLAN_STATUS_CODES = \[([^\]]+)\]/)[1]
    .split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);

const backendLabelToCode = {};
for (const [code, label] of Object.entries(backendWork)) backendLabelToCode[label.toUpperCase()] = code;
for (const [code, label] of Object.entries(backendMaterial)) backendLabelToCode[label.toUpperCase()] = code;

const backendPlanStatus = (status) => {
    if (status == null) return 'NEW';
    const raw = String(status).trim();
    const code = raw ? (backendLabelToCode[raw.toUpperCase()] ?? raw) : '';
    if (!code || code === 'PENDING' || code === 'NEW') return 'NEW';
    if (code === 'PROPOSAL' || code === 'REJECTED') return code;
    return 'CONFIRMED';
};

let failed = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` — otrzymano ${JSON.stringify(got)}, oczekiwano ${JSON.stringify(want)}`}`);
};

eq('lista kodów planu front = backend', [...PLAN_STATUS_CODES].sort(), [...backendCodes].sort());
// Słowniki etykiet muszą być identyczne po obu stronach — to z nich powstaje mapa
// „etykieta z importu → kod", więc rozjazd tutaj przenosi się na KAŻDE wejście niżej.
eq('słownik materiałowy front = backend', MATERIAL_STATUS_LABELS, backendMaterial);
eq('słownik robociznowy front = backend', WORK_STATUS_LABELS, backendWork);

const WEJSCIA = [
    'NEW', 'PROPOSAL', 'CONFIRMED', 'REJECTED',              // kody planu
    'PENDING', 'ORDERED', 'IN_STOCK', 'ISSUED', 'STARTED',   // stare kody realizacyjne
    'DONE', 'INVOICED', 'DELIVERED',
    'Odrzucone', 'ODRZUCONE', ' odrzucone ',                 // etykiety z importu i różna wielkość liter
    'Zaakceptowane', 'Zaproponowane', 'Nowe', 'Oczekuje',
    '', '   ', null, undefined, 'jakiś-śmieć',               // wejścia bez odpowiednika
];
for (const w of WEJSCIA) {
    eq(`status "${String(w)}" — front = backend`, planStatusFromAny(w), backendPlanStatus(w));
}

// Reguła, na której stoi zakres baseline: ODRZUCONE musi zostać odrzucone po obu stronach,
// niezależnie od zapisu. Gdyby któraś strona sprowadziła to do `CONFIRMED` (bo „wszystko
// pozostałe → CONFIRMED"), odrzucona pozycja wróciłaby do sumy akceptacji.
for (const w of ['REJECTED', 'Odrzucone', ' ODRZUCONE ', 'odrzucone']) {
    eq(`"${w}" = REJECTED po obu stronach`, [planStatusFromAny(w), backendPlanStatus(w)], ['REJECTED', 'REJECTED']);
}

// Kod małymi literami NIE jest rozpoznawany po ŻADNEJ ze stron — i tak ma zostać.
// Dopasowanie bez wielkości liter dotyczy wyłącznie ETYKIET („odrzucone" z importu);
// kody zapisuje `<select>` i zawsze robi to wielkimi literami. Gdyby ktoś „naprawił"
// to po jednej stronie, ta sama pozycja byłaby odrzucona w bazie i zaakceptowana na ekranie.
eq('kod "rejected" nierozpoznany po obu stronach', [planStatusFromAny('rejected'), backendPlanStatus('rejected')],
    ['CONFIRMED', 'CONFIRMED']);

// ── Poddrzewa odrzuconych ────────────────────────────────────────────────────
// Front (`stripRejectedNodes`) i backend (`rejectedNodeIds`) muszą wykluczać ten sam zbiór:
// odrzuconą pozycję RAZEM z tym, co pod nią wisi. Backend kompilujemy w locie z prawdziwego
// źródła (esbuild z node_modules frontu), więc test nie ogląda kopii reguły.
const { createRequire } = await import('node:module');
const requireFront = createRequire(new URL('../apps/frontend/package.json', import.meta.url));
const { transformSync } = requireFront('esbuild');
const backendJs = transformSync(util, { loader: 'ts', format: 'esm' }).code;
const { rejectedNodeIds } = await import(
    'data:text/javascript;base64,' + Buffer.from(backendJs, 'utf8').toString('base64')
);

// Gałąź „Rack" → pozycja „kamera" (odrzucona) → podpozycja „licencja"; obok pozycja żywa.
const TREE = [
    { id: 'root', parentId: null, type: '', status: '' },
    { id: 'rack', parentId: 'root', type: 'group', status: '' },
    { id: 'kamera', parentId: 'rack', type: 'equipment', status: 'REJECTED' },
    { id: 'licencja', parentId: 'kamera', type: 'service', status: 'CONFIRMED' },
    { id: 'switch', parentId: 'rack', type: 'equipment', status: 'CONFIRMED' },
];
const frontKept = stripRejectedNodes(TREE).map(n => n.id).sort();
const backKept = TREE.filter(n => !rejectedNodeIds(TREE).has(n.id)).map(n => n.id).sort();
eq('poddrzewo odrzuconej pozycji wypada — front', frontKept, ['rack', 'root', 'switch']);
eq('poddrzewo odrzuconej pozycji wypada — front = backend', frontKept, backKept);
eq('bez odrzuconych lista zostaje nietknięta',
    stripRejectedNodes(TREE.filter(n => n.id !== 'kamera')).length, 4);

console.log(failed === 0 ? '\nWSZYSTKO OK' : `\n${failed} BŁĘDÓW`);
process.exit(failed === 0 ? 0 : 1);
