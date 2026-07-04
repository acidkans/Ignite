// Weryfikacja parsera komórek walutowych w arkuszu "Założenia" (eksport oferty).
// Odtwarza dokładnie logikę parseCurrencyCell z UnifiedWbsPanel.jsx.
const ExcelJS = require('../apps/frontend/node_modules/exceljs');

// fmtPLN z wbsConstants.js — non-breaking space jako separator tysięcy, przecinek dziesiętny.
const fmtPLN = v => v != null && v !== 0
    ? v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

const plain = (t) => String(t || '').replace(/\*\*/g, '');

const parseCurrencyCell = (col) => {
    const isBold = /^\*\*[\s\S]*\*\*$/.test(col.trim());
    const plainCandidate = plain(col).trim();
    if (!/^[\d\s ]+,\d{2}$/.test(plainCandidate)) return null;
    const num = parseFloat(plainCandidate.replace(/[\s ]/g, '').replace(',', '.'));
    if (!Number.isFinite(num)) return null;
    return { num, isBold };
};

async function main() {
    const cases = [
        { label: 'małe (234.56)', raw: fmtPLN(234.56), expectNum: 234.56 },
        { label: 'z tysiącami (1234.5)', raw: fmtPLN(1234.5), expectNum: 1234.5 },
        { label: 'duże z separatorem (1234567.89)', raw: fmtPLN(1234567.89), expectNum: 1234567.89 },
        { label: 'pogrubiony Razem', raw: `**${fmtPLN(9999.99)}**`, expectNum: 9999.99, expectBold: true },
        { label: 'etykieta tekstowa (nie liczba)', raw: 'Instalacja światłowodu', expectNull: true },
        { label: 'nagłówek kolumny', raw: 'Cena ofertowa (PLN)', expectNull: true },
    ];

    let ok = true;
    console.log('--- Test parsera (bez zapisu do pliku) ---');
    for (const c of cases) {
        const result = parseCurrencyCell(c.raw);
        if (c.expectNull) {
            const pass = result === null;
            if (!pass) ok = false;
            console.log(`${pass ? 'OK  ' : 'FAIL'} "${c.label}" raw="${c.raw}" -> ${JSON.stringify(result)} (expected null)`);
        } else {
            const pass = result && Math.abs(result.num - c.expectNum) < 0.001 && (!c.expectBold || result.isBold === true);
            if (!pass) ok = false;
            console.log(`${pass ? 'OK  ' : 'FAIL'} "${c.label}" raw="${c.raw}" -> ${JSON.stringify(result)} (expected num=${c.expectNum}${c.expectBold ? ', bold' : ''})`);
        }
    }

    // Zapis/odczyt realnego pliku xlsx z numFmt walutowym.
    console.log('\n--- Test zapisu/odczytu xlsx z numFmt walutowym ---');
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Założenia');
    const row = sheet.addRow(['Instalacja', 1234.56]);
    row.getCell(2).numFmt = '#,##0.00" zł"';
    const buf = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf);
    const cell = wb2.getWorksheet('Założenia').getCell('B1');
    const numOk = cell.value === 1234.56 && cell.type === ExcelJS.ValueType.Number;
    const fmtOk = cell.numFmt === '#,##0.00" zł"';
    console.log(`${numOk ? 'OK  ' : 'FAIL'} wartość liczbowa po zapisie/odczycie: ${cell.value} (type=${cell.type})`);
    console.log(`${fmtOk ? 'OK  ' : 'FAIL'} numFmt po zapisie/odczycie: "${cell.numFmt}"`);
    if (!numOk || !fmtOk) ok = false;

    console.log(ok ? '\nWSZYSTKO OK.' : '\nBŁĄD.');
    process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
