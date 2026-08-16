// Test renderu karty produktu po zdjęciu splitu Wycena/Zakup (v836).
// Sprawdza to, czego `vite build` nie łapie: czy `ProductCard` renderuje się jako jedyna
// karta pozycji, czy niesie wyszukiwarkę AI i czy blokada baseline (`offerLocked`) faktycznie
// zamyka pole „Koszt jedn.". Dodatkowo bundluje `WBSHybridTable` — jeśli import karty
// (dawniej `BaselineSplitCard`) nie miałby dopasowanego eksportu, esbuild przerwie build.
//
//   node test/test-product-card-render.mjs
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const front = path.join(root, 'apps/frontend');
const outDir = path.join(root, 'test/.product-card-tmp');
fs.mkdirSync(outDir, { recursive: true });

let failed = 0;
const check = (label, cond, detail = '') => {
    console.log(`${cond ? '  OK  ' : ' BŁĄD '} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!cond) failed += 1;
};

const p = (rel) => path.join(front, rel).replace(/\\/g, '/');
const entry = path.join(outDir, 'entry.jsx');
fs.writeFileSync(entry, `
import React from 'react';
import { renderToString } from 'react-dom/server.browser';
import { ProductCard, PurchasesBar } from '${p('src/components/shared/wbs/WbsMaterialsPanel.jsx')}';
// Import wyłącznie po to, żeby bundle przeszedł przez plik, który osadza kartę w drzewie WBS.
import WBSHybridTable from '${p('src/components/shared/wbs/WBSHybridTable.jsx')}';
export const hybridLoaded = typeof WBSHybridTable === 'function';
export function runCard(props) { return renderToString(React.createElement(ProductCard, props)); }
// Pasek żyje jako wiersz tabeli — bez opakowania React sypie ostrzeżeniami o strukturze.
export function runBar(props) {
    return renderToString(React.createElement('table', null, React.createElement('tbody', null,
        React.createElement(PurchasesBar, props))));
}
`);

const stub = path.join(outDir, 'stub.js');
fs.writeFileSync(stub, 'export default {}; export const Workbook = class {};\n');

const bundle = path.join(outDir, 'bundle.mjs');
console.log('\n=== Render karty produktu (SSR) ===\n');

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
    nodePaths: [path.join(front, 'node_modules')],
    alias: { exceljs: stub },
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
    outfile: bundle,
});
check('bundle zbudowany (import karty w WBSHybridTable ma dopasowany eksport)', fs.existsSync(bundle));

const store = { getItem: () => 'test-token', setItem: () => {}, removeItem: () => {} };
globalThis.sessionStorage = store;
globalThis.localStorage = store;
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}, location: { pathname: '/' } };
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

const { runCard, runBar, hybridLoaded } = await import(pathToFileURL(bundle).href);
check('WBSHybridTable ładuje się z podmienioną kartą', hybridLoaded);

const realError = console.error;
console.error = (...a) => { if (!String(a[0] ?? '').includes('useLayoutEffect does nothing on the server')) realError(...a); };

const card = {
    id: 'req-1',
    name: 'Szafa RACK 42U',
    manufacturer: 'DELTA',
    model: 'RACK-42U',
    productName: 'Szafa stojąca 42U 800x1000',
    technicalSpec: 'wysokość 42U\nnośność 800 kg',
    priceNetto: 4800,
    availability: '7 dni',
    productUrl: 'https://example.test/rack',
    quantity: 2,
    supplierId: 'sup-1',
    proposals: [
        { id: 'p1', manufacturer: 'DELTA', model: 'RACK-42U', productName: 'Szafa 42U', priceNetto: 4800, isSelected: true, isOffer: true, isPurchase: false, supplierId: 'sup-1' },
        { id: 'p2', manufacturer: 'BETA', model: 'B-42', productName: 'Szafa 42U tańsza', priceNetto: 4390, isSelected: false, isOffer: false, isPurchase: false, supplierId: null },
    ],
};
const wbsNode = { id: 'n1', name: 'Szafa RACK 42U', quantity: 2 };
const base = { card, wbsNode, token: 'test-token', materialDb: [], offers: [], onRefresh: () => {}, onPatch: () => {} };

let html = '';
try {
    html = runCard(base);
    check('ProductCard renderuje się bez wyjątku', true, `${html.length} znaków HTML`);
} catch (e) {
    check('ProductCard renderuje się bez wyjątku', false, `${e.name}: ${e.message}`);
}

// ─ karta niesie to, co miała nieść: pola pozycji + wyszukiwarkę AI ─
check('sekcja propozycji jest w karcie', html.includes('Propozycje produktów'));
check('przycisk „Szukaj AI" jest w karcie', html.includes('Szukaj AI'));
check('można dodać propozycję ręcznie', html.includes('Dodaj ręcznie'));
check('propozycje z wymagania renderują się', html.includes('Szafa 42U tańsza'));
check('okno wymagań technicznych', html.includes('Wymagania techniczne'));
check('pole „Koszt jedn."', html.includes('Koszt jedn.'));
check('pola pomocnicze pozycji', html.includes('Dostępność') && html.includes('Adres www'));
check('kafel zdjęcia produktu', html.includes('wybrać zdjęcie'));

// ─ „Oferent produktu": KTO ZAOFERTOWAŁ, niezależnie od tego, u kogo kupimy ─
// Jest w dwóch miejscach naraz: na pozycji (MaterialRequirement.supplierId, obok produktu
// wiodącego) i na każdej propozycji z osobna (ProductProposal.supplierId) — kilka firm może
// zaofertować różne modele. SSR renderuje pusty trigger, bo lista dostawców dociąga się
// dopiero w efekcie; sprawdzamy więc etykietę i placeholder, nie nazwę firmy.
check('karta ma pole „Oferent produktu"', html.includes('Oferent produktu'));
check('pole oferenta pozycji zaprasza tekstem', html.includes('Kto zaofertował…'));
check('każda propozycja ma własnego oferenta', (html.match(/Oferent produktu…/g) || []).length >= 2);
// Kolejność kolumn niesie sens odczytu wiersza: produkt → od kogo → za ile.
const iName = html.indexOf('Nazwa handlowa');
const iSupplier = html.indexOf('Oferent produktu');
const iPrice = html.indexOf('Koszt jedn.');
check('oferent stoi między nazwą handlową a kosztem jedn.', iName > 0 && iSupplier > iName && iPrice > iSupplier);

// ─ po splicie nie ma śladu: żadnych stron ani paska „karta produktu" ─
check('brak nagłówka strony „Zakup"', !/>Zakup</.test(html));
check('brak paska zwijania „karta produktu"', !html.includes('karta produktu'));
check('brak podsumowania Wycena/Zakup/Δ', !html.includes('Δ ') || !html.includes('Wycena:'));

// ─ blokada baseline: pole ceny zamknięte, karta dalej widoczna ─
let locked = '';
try {
    locked = runCard({ ...base, offerLocked: true });
    check('ProductCard renderuje się z offerLocked', true, `${locked.length} znaków HTML`);
} catch (e) {
    check('ProductCard renderuje się z offerLocked', false, `${e.name}: ${e.message}`);
}
check('zablokowana cena ma readonly', /readonly/i.test(locked));
check('zablokowana cena ma podpowiedź o baseline', locked.includes('zablokowana akceptacją baseline'));
check('zablokowana cena wyróżniona bursztynem', locked.includes('border-amber-500/30'));
check('wymagania techniczne zostają edytowalne mimo blokady', locked.includes('Wymagania techniczne'));
check('bez blokady pole ceny nie jest readonly', !/name="priceNetto"[^>]*readonly/i.test(html) && !html.includes('zablokowana akceptacją baseline'));

// ─ podgląd (readOnly): karta bez wyszukiwarki ─
let ro = '';
try {
    ro = runCard({ ...base, readOnly: true });
    check('ProductCard renderuje się w trybie podglądu', true, `${ro.length} znaków HTML`);
} catch (e) {
    check('ProductCard renderuje się w trybie podglądu', false, `${e.name}: ${e.message}`);
}
check('podgląd nie pokazuje wyszukiwarki AI', !ro.includes('Szukaj AI'));
// Oferent zostaje widoczny w podglądzie (to dana rozliczeniowa), ale trigger jest wyłączony.
check('podgląd pokazuje oferenta bez możliwości zmiany', ro.includes('Oferent produktu') && /disabled/.test(ro));

// ─ pasek „Zakupy / wykonanie" — sekcja wpisów zwijana POD kartą produktu ─
const node = { id: 'n1', name: 'Szafa RACK 42U', unit: 'szt', quantity: 10, realizationClosed: false };
const realization = {
    entries: [{ id: 'a1', qty: 4, unitCost: 4700 }, { id: 'a2', qty: 2, unitCost: 4650 }],
    qty: 6, plan: 10, value: 28100, pct: 60, state: 'part', avg: 4683.33, mixedPrices: true,
};
let bar = '';
try {
    bar = runBar({ node, realization, colSpan: 12, open: false, onToggle: () => {} });
    check('PurchasesBar renderuje się bez wyjątku', true, `${bar.length} znaków HTML`);
} catch (e) {
    check('PurchasesBar renderuje się bez wyjątku', false, `${e.name}: ${e.message}`);
}
check('pasek podpisany „zakupy / wykonanie"', bar.includes('zakupy / wykonanie'));
check('pasek pokazuje Σ wpisów wobec planu', bar.includes('>6<') && bar.includes('10') && bar.includes('szt'));
check('pasek liczy wpisy po polsku', bar.includes('2 wpisy'));
// fmtZl formatuje po pl-PL (separator tysięcy = twarda spacja U+00A0), a SSR rozdziela sąsiednie
// węzły tekstowe komentarzem <!-- --> — normalizujemy jedno i drugie przed porównaniem.
const flat = (s) => s.replace(/ /g, ' ').replace(/<!-- -->/g, '');
check('pasek pokazuje wartość zakupu', flat(bar).includes('28 100,00 zł'));
check('zwinięty pasek ma strzałkę w bok', bar.includes('-rotate-90'));
check('zwinięty pasek zaprasza do rozwinięcia', bar.includes('Rozwiń wpisy zakupu'));

const barOpen = runBar({ node, realization, colSpan: 12, open: true, onToggle: () => {} });
check('rozwinięty pasek ma strzałkę w dół', !barOpen.includes('-rotate-90'));
check('rozwinięty pasek proponuje zwinięcie', barOpen.includes('Zwiń wpisy zakupu'));

const barEmpty = runBar({ node: { ...node, realizationClosed: true }, realization: { entries: [], qty: 0, plan: 10, value: 0, pct: 0, state: 'closed' }, colSpan: 12, open: false, onToggle: () => {} });
check('pasek bez wpisów mówi „0 wpisów"', barEmpty.includes('0 wpisów'));
check('pasek bez wpisów nie pokazuje wartości', !barEmpty.includes('wartość'));
check('pozycja rozliczona podpisana na pasku', /Rozliczone|rozliczone/.test(barEmpty));

// ─ „Rozlicz" przeniesiony z wiersza dopisywania na pasek: w Materiałach nie ma już innego
//   miejsca, z którego dałoby się oznaczyć pozycję jako rozliczoną ─
check('pasek niesie przycisk „Rozlicz"', bar.includes('>Rozlicz<') && bar.includes('Rozlicz pozycję mimo niedowykonania'));
check('rozliczona pozycja proponuje wznowienie', barEmpty.includes('kliknij, aby wznowić'));
const barRo = runBar({ node: { ...node, realizationClosed: true }, realization, colSpan: 12, open: false, onToggle: () => {}, readOnly: true });
check('podgląd pokazuje sam znacznik, bez przycisku', !barRo.includes('Rozlicz pozycję mimo') && barRo.includes('rozliczone'));
check('przycisk rozliczenia nie jest zagnieżdżony w przycisku zwijania', !/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/.test(bar));

const barOne = runBar({ node, realization: { ...realization, entries: [realization.entries[0]] }, colSpan: 12, open: false, onToggle: () => {} });
check('jeden wpis odmieniony w liczbie pojedynczej', barOne.includes('1 wpis<') || barOne.includes('>1 wpis'));

// ─ kolejność bloków w rozwiniętym wierszu: karta → pasek → wpisy ─
const panelSrc = fs.readFileSync(path.join(front, 'src/components/shared/wbs/WbsMaterialsPanel.jsx'), 'utf8');
const iCard = panelSrc.indexOf('@anchor wbs-materials-product-card');
const iBar = panelSrc.indexOf('<PurchasesBar');
const iRows = panelSrc.indexOf('@anchor realization-entry-rows');
check('karta produktu renderuje się PRZED paskiem zakupów', iCard > 0 && iBar > iCard);
check('wiersze wpisów renderują się PO pasku', iRows > iBar);
check('wpisy schowane za stanem sekcji', /purchasesShown && realization\.entries\.map/.test(panelSrc));
// Materiały pokazują wyłącznie ZAPISANE wpisy — pusty wiersz formularza czytał się jak druga,
// niedokończona dostawa. Dopisywanie zdarzeń zostało w zakładce Realizacja.
check('panel nie ma wiersza dopisywania', !panelSrc.includes('RealizationAddRow'));
check('panel nie woła POST /leaf-actuals', !panelSrc.includes('addActual') && !/leaf-actuals`,\s*\{\s*\n?\s*method: 'POST'/.test(panelSrc));
check('każdy liść dostaje pasek, także bez karty', /const purchasesShown = purchasesOpen/.test(panelSrc));

// ─ wiersz propozycji nadąża za zmianami z karty (`proposal-row-sync`) ─
// SSR nie odpala efektów, więc pilnujemy tego na źródle: zasiew stanu WYŁĄCZNIE po `[p.id]`
// zostawiał wiersz z pustym kosztem jedn., choć karta i baza miały już 5000.
check('wiersz propozycji ma resync po wartościach, nie tylko po id', panelSrc.includes('@anchor proposal-row-sync'));
check('resync patrzy na wartości propozycji', /useEffect\([\s\S]{0,900}lastIncoming\.current/.test(panelSrc));
check('resync nie kasuje pola w trakcie pisania', /if \(incoming\[k\] !== lastIncoming\.current\[k\]\)/.test(panelSrc));

// ─ oferent karty i oferent propozycji to jedno pole w dwóch oknach (backend je łączy) ─
const svcSrc = fs.readFileSync(path.join(root, 'apps/backend/src/material-requirements/material-requirements.service.ts'), 'utf8');
check('karta → propozycja: oferent schodzi na produkt karty', svcSrc.includes('@anchor mat-req-supplier-sync'));
check('sync celuje w isOffer, potem isSelected', /OR: \[\{ isOffer: true \}, \{ isSelected: true \}\][\s\S]{0,200}orderBy: \[\{ isOffer: 'desc' \}, \{ isSelected: 'desc' \}/.test(svcSrc));
check('propozycja → karta: wybór produktu przenosi oferenta', /proposal\.supplierId \? \{ supplierId: proposal\.supplierId \}/.test(svcSrc));
check('edycja oferenta na propozycji karty wchodzi na pozycję', /dto\.supplierId !== undefined && \(updated\.isOffer \|\| updated\.isSelected\)/.test(svcSrc));
check('klon wersji niesie oferenta pozycji', fs.readFileSync(path.join(root, 'apps/backend/src/ai/versioning.service.ts'), 'utf8').includes('supplierId: (mr as any).supplierId'));

console.error = realError;
fs.rmSync(outDir, { recursive: true, force: true });
console.log(failed === 0 ? '\n✅ Wszystkie testy przeszły' : `\n❌ Nieudanych sprawdzeń: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
