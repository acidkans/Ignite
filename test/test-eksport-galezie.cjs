// Smoke test przeniesionego eksportu: uruchamia CAŁE 400 linii na sztucznych danych.
// Wyłapuje każdy identyfikator, który po przeniesieniu z ciała komponentu został bez wartości
// (ReferenceError) — czego sam parser nie widzi.
const path = require('path');
const { createRequire } = require('module');

const FRONT = path.resolve(__dirname, '../apps/frontend');
// paczki siedzą w apps/frontend/node_modules, a ten plik leży w /test — własny `require`
// zakotwiczony w projekcie frontu, żeby nie kopiować zależności do korzenia repo.
const wymagaj = createRequire(path.join(FRONT, 'package.json'));
const esbuild = wymagaj('esbuild');
const ENTRY = path.join(FRONT, 'src/components/shared/RealizationTab.jsx');

(async () => {
    const out = await esbuild.build({
        entryPoints: [ENTRY],
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'node',
        loader: { '.js': 'jsx', '.jsx': 'jsx', '.css': 'empty', '.png': 'empty', '.svg': 'empty' },
        define: { 'import.meta.env.VITE_API_URL': '"http://localhost:3001"' },
        external: ['react', 'react-dom', 'lucide-react', 'exceljs', 'docx', 'file-saver'],
        logLevel: 'silent',
    });
    const kod = out.outputFiles[0].text;

    // minimalne DOM-owe zaślepki — eksport na końcu tworzy <a download> i klika
    let pobrano = null;
    global.document = { createElement: () => ({ click() { pobrano = this.download; }, set href(v) {}, get href() { return 'blob:x'; }, download: '' }) };
    let bufor = null;
    global.Blob = class { constructor(cz) { bufor = cz[0]; this.rozmiar = cz[0].length || cz[0].byteLength; } };
    global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
    global.alert = (m) => { throw new Error('alert(): ' + m); };
    global.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    global.sessionStorage = { getItem: () => 'token' };
    global.localStorage = { getItem: () => 'token' };

    const modul = { exports: {} };
    new Function('module', 'exports', 'require', kod)(modul, modul.exports, wymagaj);
    const { eksportRealizacjiXlsx } = modul.exports;
    if (typeof eksportRealizacjiXlsx !== 'function') throw new Error('brak eksportu eksportRealizacjiXlsx');

    const E = (id, qty, unitCost, d, isSurplus = false) => ({ id, qty, unitCost, entryDate: d, isSurplus, wbsRootId: 'er', supplier: { id: 's', name: 'X' }, manufacturer: 'APC', model: 'ER', author: {} });
    const entries = [E('a', 3, 5289, '2026-09-01'), E('b', 3, 8410.81, '2026-09-02'), E('c', 1, 274, '2026-09-03', true)];
    const node = { id: 'er', name: 'Easy Rack', type: 'material', quantity: 3, unit: 'szt', unitCost: 12618.5, path: 'Zamówienie › instalacje LAN › Szafy › Easy Rack', realizationClosed: false };
    const value = 3 * 5289 + 3 * 8410.81 + 274;
    const rows = [{ node, card: { id: 'c', priceNetto: 12618.5, budgetedPriceNetto: 12618.5, proposals: [] },
        realization: { entries, qty: 7, value, plan: 3, pct: 233, state: 'over', avg: value / 7 } },
        { node: { id: 'k', name: 'Kabel', type: 'material', quantity: 100, unit: 'm', unitCost: 2.5, path: 'Zamówienie › Alarm › Kabel' }, card: null,
          realization: { entries: [], qty: 0, value: 0, plan: 100, pct: 0, state: 'none', avg: null } }];
    await eksportRealizacjiXlsx({ rows, visibleTypes: ['material'], orderName: 'test' });
    const ExcelJS = wymagaj('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bufor));
    const v = (c) => (c && typeof c === 'object' && 'result' in c ? c.result : c);
    for (const nazwa of ['Realizacja', 'Zakupy', 'Analiza zakupów']) {
        const a = wb.getWorksheet(nazwa);
        console.log('== ' + nazwa + ' nagłówki:', a.getRow(1).values.slice(1).join(' | '));
        console.log('   wiersz 2:', a.getRow(2).values.slice(1).map(x => x && x.formula ? '=' + x.formula : x).join(' | '));
        console.log('   wiersz 3:', a.getRow(3).values.slice(1).map(x => x && x.formula ? '=' + x.formula : x).join(' | '));
    }
    console.log('autofiltr Zakupy:', JSON.stringify(wb.getWorksheet('Zakupy').autoFilter));
})().catch(e => { console.error('BŁĄD:', e); process.exit(1); });
