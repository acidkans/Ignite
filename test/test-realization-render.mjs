// Test renderu zakładki „Realizacja" — łapie błędy, których `vite build` nie widzi:
// martwa strefa `const` (użycie stałej w tablicy zależności hooka przed jej deklaracją),
// brakujące importy komponentów, wyjątki w ciele komponentu. Dokładnie ta klasa błędów
// daje w przeglądarce pustą białą stronę przy przechodzącym buildzie.
//
// Komponent renderujemy `renderToString` (react-dom/server) po zbundlowaniu esbuildem.
// SSR nie odpala `useEffect`, więc żadne `fetch` nie leci — sprawdzamy samo ciało
// komponentu i pierwszy render drzewa.
//
//   node test/test-realization-render.mjs
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const front = path.join(root, 'apps/frontend');
const outDir = path.join(root, 'test/.render-tmp');
fs.mkdirSync(outDir, { recursive: true });

let failed = 0;
const check = (label, cond, detail = '') => {
    console.log(`${cond ? '  OK  ' : ' BŁĄD '} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!cond) failed += 1;
};

// Stuby przeglądarki, których komponent dotyka JESZCZE PRZED useEffect.
const p = (rel) => path.join(front, rel).replace(/\\/g, '/');
const entry = path.join(outDir, 'entry.jsx');
fs.writeFileSync(entry, `
import React from 'react';
import { renderToString } from 'react-dom/server.browser';
import RealizationTab, { COL_DEFS, RealizationRow, RealizationEntryLine, RealizationEntryForm, RealizationExpandPanel }
    from '${p('src/components/shared/RealizationTab.jsx')}';
import WbsMaterialsPanel from '${p('src/components/shared/wbs/WbsMaterialsPanel.jsx')}';
export { COL_DEFS };
export function run(props) { return renderToString(React.createElement(RealizationTab, props)); }
export function runMaterials(props) { return renderToString(React.createElement(WbsMaterialsPanel, props)); }
// Wiersze żyją tylko wewnątrz <table>; bez opakowania React sypie ostrzeżeniami o strukturze.
const inTable = (el) => React.createElement('table', null, React.createElement('tbody', null, el));
export function runRow(props) { return renderToString(inTable(React.createElement(RealizationRow, props))); }
export function runEntryLine(props) { return renderToString(inTable(React.createElement(RealizationEntryLine, props))); }
export function runEntryForm(props) { return renderToString(inTable(React.createElement(RealizationEntryForm, props))); }
export function runExpandPanel(props) { return renderToString(React.createElement(RealizationExpandPanel, props)); }
`);

// ExcelJS wchodzi tranzytywnie przez `WbsMaterialsPanel` (eksport XLSX) i ciągnie moduły
// node-owe, których render w ogóle nie dotyka. Podmieniamy go na pustą atrapę — testujemy
// render zakładki, nie eksport arkusza.
const stub = path.join(outDir, 'stub.js');
fs.writeFileSync(stub, 'export default {}; export const Workbook = class {};\n');

const bundle = path.join(outDir, 'bundle.mjs');
console.log('\n=== Render zakładki Realizacja (SSR) ===\n');

// API esbuilda, nie `.bin/esbuild.cmd` — Node ≥ 22 nie pozwala odpalać `.cmd` przez spawn.
const require = createRequire(path.join(front, 'package.json'));
const esbuild = require('esbuild');
await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.jsx': 'jsx' },
    logLevel: 'error',
    absWorkingDir: front,
    // Entry leży w /test (tam trzymamy skrypty testowe), więc `react` trzeba wskazać
    // wprost — inaczej esbuild szuka node_modules obok entry, a nie w apps/frontend.
    nodePaths: [path.join(front, 'node_modules')],
    alias: { exceljs: stub },
    // Bundle jest ESM, a część zależności woła `require` — dajemy im prawdziwy.
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
    outfile: bundle,
});
check('bundle zbudowany', fs.existsSync(bundle));

// Minimalne stuby — komponent czyta je synchronicznie w ciele.
const store = { getItem: () => 'test-token', setItem: () => {}, removeItem: () => {} };
globalThis.sessionStorage = store;
globalThis.localStorage = store;
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}, location: { pathname: '/' } };
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

const { run, runMaterials, runRow, runEntryLine, runEntryForm, runExpandPanel, COL_DEFS } =
    await import(pathToFileURL(bundle).href);

// `useLayoutEffect` nie działa w SSR i React o tym ostrzega przy każdej `AutoResizeTextarea`.
// To oczekiwane — w przeglądarce ten hook działa normalnie. Wyciszamy, żeby nie zasypywało wyniku.
const realError = console.error;
console.error = (...a) => { if (!String(a[0] ?? '').includes('useLayoutEffect does nothing on the server')) realError(...a); };

// 1. Pierwszy render: `loading=true`, samo ciało komponentu i wszystkie hooki.
let html = '';
try {
    html = run({ nodeId: 'test-node', userRoles: ['ADMIN'], orderName: 'Test', searchQuery: '' });
    check('komponent renderuje się bez wyjątku (manager)', true, `${html.length} znaków HTML`);
} catch (e) {
    check('komponent renderuje się bez wyjątku (manager)', false, `${e.name}: ${e.message}`);
    if (/before initialization/.test(e.message)) {
        console.log('        ↑ martwa strefa `const` — stała użyta w tablicy zależności hooka przed deklaracją');
    }
}

// 2. Te same hooki dla roli bez uprawnień (inna gałąź `visibleTypes` / `readOnly`).
for (const roles of [['LOGISTYK'], ['USER'], []]) {
    try {
        run({ nodeId: 'test-node', userRoles: roles, orderName: 'Test', searchQuery: '' });
        check(`renderuje się dla roli [${roles.join(',') || 'brak'}]`, true);
    } catch (e) {
        check(`renderuje się dla roli [${roles.join(',') || 'brak'}]`, false, `${e.name}: ${e.message}`);
    }
}

check('render zwraca treść, nie pustą stronę', html.length > 0 && html !== '<div></div>');

// 3. Panel Materiały z gotowymi węzłami — `externalWbsNodes` omija stan ładowania, więc
// renderuje się PRAWDZIWA tabela z wierszami. To jedyny sposób, żeby bez DOM-u sprawdzić,
// czy wyniesienie `TYPE_META`, `realizationOf`, `getParentPath` i formaterów do
// `realizationShared.js` nie rozwaliło panelu, który z nich korzysta.
const nodes = [
    { id: 'n1', parentId: null, name: 'Szafa RACK 42U', type: 'equipment', path: 'Serwerownia › Szafa RACK 42U', quantity: 2, unit: 'szt', unitCost: 4800, comment: 'z montażem', sourceWbsNodeId: null, realizationClosed: false, tags: [] },
    { id: 'n2', parentId: null, name: 'Montaż szafy', type: 'work', path: 'Serwerownia › Montaż szafy', quantity: 8, unit: 'h', unitCost: 120, comment: '', sourceWbsNodeId: null, realizationClosed: true, tags: [] },
    { id: 'n3', parentId: null, name: 'Patchcord 3m', type: 'material', path: 'Serwerownia › Okablowanie › Patchcord 3m', quantity: 40, unit: 'szt', unitCost: 12.5, comment: '', sourceWbsNodeId: null, realizationClosed: false, tags: [] },
];
let matHtml = '';
try {
    matHtml = runMaterials({ nodeId: 'test-node', externalWbsNodes: nodes, accepted: true, projectName: 'P', orderName: 'O' });
    check('panel Materiały renderuje tabelę po refaktorze', true, `${matHtml.length} znaków HTML`);
} catch (e) {
    check('panel Materiały renderuje tabelę po refaktorze', false, `${e.name}: ${e.message}`);
}
check('wiersze pozycji trafiły do tabeli', matHtml.includes('Szafa RACK 42U') && matHtml.includes('Patchcord 3m'));
check('ścieżka rodzica z getParentPath', matHtml.includes('Serwerownia / Okablowanie'), 'dla zagnieżdżonego liścia');
check('kolumny realizacji widoczne przy accepted', matHtml.includes('Zakup / wykonanie') && matHtml.includes('Δ warto'));
check('pozycja rozliczona ma podpis „rozliczone"', matHtml.includes('rozliczone'), 'REAL_STATE.closed z realizationShared');
check('kwoty sformatowane przez fmtZl', matHtml.includes('4800,00') || matHtml.includes('4 800,00'), 'separator dziesiętny pl-PL');

// 4. Podkomponenty zakładki — renderują się dopiero po rozwinięciu pozycji albo po otwarciu
// formularza, więc SSR samej zakładki nigdy do nich nie dociera. To W NICH siedziały oba błędy,
// które dały pusty ekran (martwa strefa `saveComment`, nieistniejący `commentRef`), więc każdy
// dostaje własny render z danymi.
const leaf = { id: 'n1', name: 'Szafa RACK 42U', type: 'equipment', path: 'Serwerownia › Szafa RACK 42U', quantity: 2, unit: 'szt', unitCost: 4800, comment: 'z montażem', sourceWbsNodeId: null, realizationClosed: false };
const workLeaf = { ...leaf, id: 'n2', name: 'Montaż', type: 'work', comment: '' };
const card = {
    id: 'c1', technicalSpec: '42U, 800×1000', manufacturer: 'Legrand', model: 'LCS3',
    proposals: [{ id: 'p1', isOffer: true, manufacturer: 'Legrand', model: 'LCS3', productName: 'Szafa', priceNetto: 4800, supplier: { id: 's1', name: 'Dostawca sp. z o.o.' } }],
};
const entries = [
    { id: 'e1', wbsRootId: 'n1', entryDate: '2026-08-01T00:00:00.000Z', qty: 1, unitCost: 4700, comment: 'pierwsza dostawa', docNumber: 'FV 12/2026', manufacturer: 'Legrand', model: 'LCS3', supplier: { id: 's1', name: 'Dostawca sp. z o.o.' }, author: { firstName: 'Jan', lastName: 'Kowalski' } },
];
const realization = { entries, qty: 1, value: 4700, plan: 2, pct: 50, state: 'part', avg: 4700, mixedPrices: false };
const noop = () => {};

// Pozycja BEZ ani jednego wpisu — stan, w którym zostaje liść po usunięciu ostatniego zakupu.
const pusta = { entries: [], qty: 0, value: 0, plan: 2, pct: 0, state: 'none', avg: null, mixedPrices: false };

// Dwie dostawy od RÓŻNYCH dostawców — kolumna „Dostawca" ma wymienić obu, nie skrócić do „+1".
const dwochDostawcow = {
    ...realization,
    entries: [
        entries[0],
        { ...entries[0], id: 'e3', docNumber: 'FV 15/2026', supplier: { id: 's2', name: 'IT-Planet' } },
    ],
};

const cases = [
    ['wiersz pozycji (RealizationRow)', () => runRow({ node: leaf, card, realization, isExpanded: false, onToggle: noop, onAddClick: noop, onSaveComment: noop, readOnly: false })],
    ['wiersz pozycji bez wpisów', () => runRow({ node: leaf, card, realization: pusta, isExpanded: false, onToggle: noop, onAddClick: noop, onSaveComment: noop, readOnly: false })],
    ['wiersz pozycji rozliczonej bez wpisów', () => runRow({ node: { ...leaf, realizationClosed: true }, card, realization: { ...pusta, state: 'closed' }, isExpanded: false, onToggle: noop, onAddClick: noop, onSaveComment: noop, readOnly: false })],
    ['wiersz pozycji — tylko podgląd', () => runRow({ node: leaf, card, realization, isExpanded: true, onToggle: noop, onAddClick: noop, onSaveComment: noop, readOnly: true })],
    ['wiersz pozycji — dwóch dostawców', () => runRow({ node: leaf, card, realization: dwochDostawcow, isExpanded: false, onToggle: noop, onAddClick: noop, onSaveComment: noop, readOnly: false })],
    ['wiersz wpisu (RealizationEntryLine)', () => runEntryLine({ entry: entries[0], cols: COL_DEFS, hasCard: true, readOnly: false, onSave: noop, onDelete: noop })],
    ['wiersz wpisu na pracy (zakres zamiast produktu)', () => runEntryLine({ entry: { ...entries[0], id: 'e2', manufacturer: null, model: null, scope: 'demontaż starej szafy' }, cols: COL_DEFS, hasCard: false, readOnly: false, onSave: noop, onDelete: noop })],
    ['formularz wpisu — zakup z produktem z wyceny', () => runEntryForm({ node: leaf, cols: COL_DEFS, hasCard: true, defaultQty: 1, seedProduct: { manufacturer: 'Legrand', model: 'LCS3', supplierId: 's1' }, onAdd: noop, onClose: noop })],
    ['formularz wpisu — wykonanie bez produktu', () => runEntryForm({ node: workLeaf, cols: COL_DEFS, hasCard: false, defaultQty: 2, seedProduct: null, onAdd: noop, onClose: noop })],
    ['rozwinięcie pozycji (RealizationExpandPanel)', () => runExpandPanel({ node: leaf, card, realization, token: 't', readOnly: false, onToggleClosed: noop, onSaveTechSpec: noop, onRefreshCard: noop })],
    ['rozwinięcie pozycji bez karty (praca)', () => runExpandPanel({ node: workLeaf, card: null, realization, token: 't', readOnly: false, onToggleClosed: noop, onSaveTechSpec: noop, onRefreshCard: noop })],
];
const out = {};
for (const [label, fn] of cases) {
    try { out[label] = fn(); check(label, true, `${out[label].length} znaków`); }
    catch (e) { check(label, false, `${e.name}: ${e.message}`); }
}

// Zachowania, o które prosił użytkownik — sprawdzane na wyrenderowanym HTML-u.
// `renderToString` wstawia `<!-- -->` między sąsiadujące węzły tekstowe (`nowy {entryNoun(...)}`
// wychodzi jako `nowy <!-- -->zakup`), więc przed dopasowaniem tekstu je usuwamy.
const plain = (h) => (h || '').replace(/<!--\s*-->/g, '');
const form = plain(out['formularz wpisu — zakup z produktem z wyceny']);
const line = plain(out['wiersz wpisu (RealizationEntryLine)']);
const fields = (form.match(/data-entry-field/g) || []).length;
check('okna wiersza mają `data-entry-field` (trasa Entera)', fields >= 5, `${fields} okien w formularzu`);
check('koszt jedn. w nowym wpisie jest PUSTY', !/aria-label="Koszt jednostkowy"[^>]*value="[^"]/.test(form), 'cena wpisywana świadomie');
check('produkt z wyceny wypełniony po potwierdzeniu', form.includes('Legrand') && form.includes('LCS3'));
// Wielkość liter bez znaczenia — nagłówek jest wersalikowany CSS-em (`uppercase`),
// więc w HTML-u zostaje tak, jak zwraca `newEntryLabel`.
check('formularz podpisany „Nowy zakup"', /nowy zakup/i.test(form));
check('formularz pracy podpisany „Nowe wykonanie"', /nowe wykonanie/i.test(plain(out['formularz wpisu — wykonanie bez produktu'])),
    'rodzaj gramatyczny: wykonanie jest nijakie, nie „nowy wykonanie"');
// Przycisk zapisu nazywa czynność, a nie sposób jej wywołania („dopisz").
// „Zapisz", nie „Dodaj": zapis zamyka formularz i nie podstawia kolejnego pustego wiersza,
// więc przycisk kończy czynność, zamiast zapowiadać następną.
check('przycisk zapisu to „Zapisz zakup"', /zapisz zakup/i.test(form));
check('przycisk zapisu nad pracą też „Zapisz zakup"', /zapisz zakup/i.test(plain(out['formularz wpisu — wykonanie bez produktu'])),
    'jedna etykieta dla wszystkich typów liści');
check('wiersz wpisu pokazuje autora', line.includes('Jan Kowalski'));
check('wiersz wpisu ma nr dokumentu', line.includes('FV 12/2026'));

// Kolumna „Produkt / zakres" — para producent + model tylko tam, gdzie jest karta produktowa;
// praca, usługa, nocleg i paliwo dostają jedno pole `LeafActual.scope`.
const linePraca = plain(out['wiersz wpisu na pracy (zakres zamiast produktu)']);
const formPraca = plain(out['formularz wpisu — wykonanie bez produktu']);
check('wpis na pracy ma pole „Zakres"', /aria-label="Zakres"/.test(linePraca));
check('wpis na pracy nie ma producenta ani modelu', !/aria-label="Producent"/.test(linePraca) && !/aria-label="Model"/.test(linePraca));
// Pola tekstowe wpisu są textareami rosnącymi z treścią (`realization-entry-growing-fields`),
// więc wpisany tekst renderuje się jako ZAWARTOŚĆ elementu, a nie jako atrybut `value`.
check('zakres wpisu wchodzi do pola', /aria-label="Zakres"[^>]*>demontaż starej szafy</.test(linePraca));
check('pola tekstowe wpisu rosną z treścią (textarea, nie input)',
    /<textarea[^>]*aria-label="Komentarz wpisu"/.test(line) && /<textarea[^>]*aria-label="Zakres"/.test(linePraca));
check('data i liczby zostają jednolinijkowe',
    /<input[^>]*aria-label="Data zdarzenia"/.test(line) && /<input[^>]*aria-label="Ilość wpisu"/.test(line) && /<input[^>]*aria-label="Koszt jednostkowy"/.test(line));
check('formularz nad pracą też prosi o zakres', /aria-label="Zakres"/.test(formPraca));
check('wpis na materiale zostaje przy producencie i modelu', /aria-label="Producent"/.test(line) && !/aria-label="Zakres"/.test(line));

// Producent siedzi w kolumnie „Nazwa", model i EAN pod „Produktem" — para w jednej komórce
// robiła z niej najwęższe miejsce w wierszu, a kolumna „Nazwa" stała w wpisach pusta.
// Test patrzy na PODZIAŁ komórek, nie na kolejność pól: liczy się, że to osobne `<td>`.
const komorkaZ = (html, aria) => (html.split('<td').find(td => td.includes(`aria-label="${aria}"`)) || '');
for (const [nazwa, html] of [['formularz', form], ['wiersz wpisu', line]]) {
    const tdProducent = komorkaZ(html, 'Producent');
    check(`${nazwa}: producent w innej komórce niż model`,
        !!tdProducent && !tdProducent.includes('aria-label="Model"'),
        'kolumna „Nazwa" była w wpisach pusta, „Produkt" — przeładowana');
    check(`${nazwa}: model i EAN w tej samej komórce`, komorkaZ(html, 'Model').includes('aria-label="Kod EAN"'));
}
check('formularz ma pole kodu EAN', /aria-label="Kod EAN"/.test(form));
// Zapis sprawdza cenę, producenta i model; kursor skacze do pierwszego brakującego pola,
// a namierza je po `data-entry-key`. Bez tego atrybutu walidacja podświetli pole, ale
// nie postawi w nim kursora.
for (const klucz of ['unitCost', 'manufacturer', 'model', 'qty']) {
    check(`pole „${klucz}" ma data-entry-key (skok kursora przy walidacji)`, form.includes(`data-entry-key="${klucz}"`));
}
check('formularz nad pracą waliduje zakres, nie producenta', formPraca.includes('data-entry-key="scope"') && !formPraca.includes('data-entry-key="manufacturer"'));
check('wpis na pracy nie ma pola EAN', !/aria-label="Kod EAN"/.test(linePraca), 'robocizna nie ma kodu towarowego');
check('EAN w nowym wpisie jest PUSTY', !/aria-label="Kod EAN"[^>]*value="[^"]/.test(form), 'wycena nie niesie EAN-u');

// Nagłówki nad polami — tylko w formularzu. Nagłówki tabeli są przyklejone u góry, a formularz
// otwiera się w środku listy; nad zapisanymi wpisami powtarzałyby się w każdym wierszu.
for (const naglowek of ['Producent', 'Model', 'Kod EAN', 'Dostawca', 'Dokument', 'Ilość', 'Koszt jedn.']) {
    check(`formularz ma nagłówek „${naglowek}"`, form.includes(`>${naglowek}</span>`));
}
check('zapisany wpis BEZ nagłówków pól', !line.includes('>Kod EAN</span>') && !line.includes('>Producent</span>'));

// Kilku dostawców wymieniamy w osobnych wierszach tej samej komórki. Skrót „IT-Planet +1"
// ukrywał, u kogo się kupowało — a to jest dana rozliczeniowa, nie szczegół.
const wiersz2Dost = plain(out['wiersz pozycji — dwóch dostawców']);
const komorkaDostawcow = wiersz2Dost.split('<td').find(td => td.includes('IT-Planet')) || '';
check('oba nazwiska dostawców w JEDNEJ komórce', komorkaDostawcow.includes('Dostawca sp. z o.o.') && komorkaDostawcow.includes('IT-Planet'));
check('bez skrótu „+1" w kolumnie dostawcy', !/\+1</.test(komorkaDostawcow), 'lista zamiast licznika');

// Kolor strony ZAKUP — koszt jedn. zakupu był czerwony od początku, koszt całkowity zakupu
// dołącza do niego. W jednej komórce stoją dwie liczby (wycena i zakup), więc kolor jest
// jedynym, co je rozróżnia bez czytania tooltipa.
const row = plain(out['wiersz pozycji (RealizationRow)']);
check('koszt całkowity ZAKUPU na czerwono', /text-red-400[^>]*title="Koszt całkowity zakupu/.test(row));
check('koszt całkowity WYCENY na czerwono, jaśniejszym odcieniem', /text-red-300[^>]*title="Koszt całkowity z wyceny/.test(row));
check('wartość wpisu w dzienniku też na czerwono', /text-red-400[^>]*>\s*4[\s ]?700,00 zł/.test(line));

// Scenariusz zgłoszony przez użytkownika: pozycja rozliczona, po czym kasujemy jej wpis.
// Frontend zdejmuje wtedy znacznik `realizationClosed` (`realization-reopen-on-empty`), więc
// wiersz wraca do stanu „nic się nie wydarzyło" — bez ujemnej Δ ilość i bez podpisu „rozliczone".
const rowPusta = plain(out['wiersz pozycji bez wpisów']);
const rowClosed = plain(out['wiersz pozycji rozliczonej bez wpisów']);
check('pozycja bez wpisów nie pokazuje ujemnej Δ ilość', !/-2 szt/.test(rowPusta), 'Δ = „—", nie „-2 szt"');
check('pozycja bez wpisów nie ma podpisu „rozliczone"', !/rozliczone/.test(rowPusta));
check('koszt całkowity zakupu bez wpisów pozostaje pusty', /text-gray-600[^>]*title="Koszt całkowity zakupu/.test(rowPusta));
check('ujemna Δ tylko przy ŚWIADOMYM rozliczeniu pustej pozycji', /-2 szt/.test(rowClosed),
    'to jest decyzja „nie kupujemy", a nie skutek usunięcia wpisu');

console.error = realError;
fs.rmSync(outDir, { recursive: true, force: true });
console.log(`\n${failed === 0 ? '✅ Wszystkie testy przeszły' : `❌ Nieudanych testów: ${failed}`}\n`);
process.exit(failed === 0 ? 0 : 1);
