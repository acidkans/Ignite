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

    const wpis = {
        id: 'a1', qty: 2, unitCost: 90, entryDate: '2026-01-15T00:00:00.000Z',
        supplier: { id: 's1', name: 'Dostawca sp. z o.o.' }, docNumber: 'FV/1/2026',
        manufacturer: 'Hikvision', model: 'DS-2CD', ean: '5901234', scope: '', comment: 'dostawa',
        author: { firstName: 'Jan', lastName: 'Kowalski' }, wbsRootId: 'n1',
    };
    const node = {
        id: 'n1', name: 'Kamera kopułkowa', type: 'material', quantity: 2, unit: 'szt.',
        unitCost: 100, status: 'CONFIRMED', purchaseStatus: 'DELIVERED', execStatus: 'DONE',
        path: 'Zamówienie / Instalacja CCTV / Kamery', comment: 'uwaga do pozycji', realizationClosed: false,
    };
    const praca = {
        id: 'n2', name: 'Montaż kamer', type: 'work', quantity: 8, unit: 'godz.',
        unitCost: 120, status: 'CONFIRMED', purchaseStatus: null, execStatus: 'IN_PROGRESS',
        path: 'Zamówienie / Instalacja CCTV', comment: '', realizationClosed: false,
    };
    const rows = [
        {
            node,
            card: { id: 'c1', manufacturer: 'Hikvision', model: 'DS-2CD', priceNetto: 100, budgetedPriceNetto: 100, proposals: [] },
            realization: { entries: [wpis], qty: 2, value: 180, plan: 2, pct: 100, state: 'full', avg: 90, mixedPrices: false },
        },
        {
            node: praca,
            card: null,
            realization: { entries: [], qty: 0, value: 0, plan: 8, pct: 0, state: 'none', avg: null, mixedPrices: false },
        },
    ];

    await eksportRealizacjiXlsx({
        rows,
        visibleTypes: ['material', 'equipment', 'work', 'service', 'lodging', 'fuel'],
        odbiorByRoot: {},
        orderName: 'CMC- Serwerownia ZDC1-K9_2026',
        searchQuery: 'kamera',
        colFilters: { type: ['Materiał'], name: 'kamera' },
        etykietyKolumn: { type: 'Typ', name: 'Nazwa' },
    });

    if (!pobrano) throw new Error('eksport nie doszedł do pobrania pliku');

    // Odczyt z powrotem: sprawdzamy sekcję „STAN WYKONANIA" w arkuszu „Podsumowanie".
    const ExcelJS = wymagaj('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bufor));
    const ps = wb.getWorksheet('Podsumowanie');
    if (!ps) throw new Error('brak arkusza Podsumowanie');
    let od = null;
    ps.eachRow((r, nr) => { if (String(r.getCell(1).value || '').startsWith('STAN WYKONANIA')) od = nr; });
    if (!od) throw new Error('brak sekcji STAN WYKONANIA w arkuszu Podsumowanie');
    console.log('Arkusz „Podsumowanie" — sekcja stanu wykonania:');
    const kwota = (c) => (c && typeof c === 'object' && 'result' in c ? c.result : c);
    for (let nr = od; nr <= od + 8; nr++) {
        const r = ps.getRow(nr);
        const kom = [1, 2, 3, 4, 5].map(i => kwota(r.getCell(i).value)).filter(v => v !== null && v !== undefined && v !== '');
        if (kom.length) console.log('  ' + kom.join(' | '));
    }
    // kontrola podziału: domknięte + w realizacji + nierozpoczęte = razem
    const wiersz = (etykieta) => { let out = null; ps.eachRow(r => { if (String(r.getCell(1).value || '').startsWith(etykieta)) out = r; }); return out; };
    const w = (e) => kwota(wiersz(e)?.getCell(3).value) || 0;
    const suma = w('Domknięte łącznie') + w('W realizacji') + w('Prace nierozpoczęte');
    const razem = w('Razem zamówienie');
    if (Math.abs(suma - razem) > 0.01) throw new Error(`podział nie sumuje się: ${suma} ≠ ${razem}`);
    console.log(`OK — eksport przeszedł, podział sumuje się do ${razem.toFixed(2)} zł, plik: ${pobrano}`);
})().catch(e => { console.error('BŁĄD:', e); process.exit(1); });
