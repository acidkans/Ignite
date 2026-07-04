// Weryfikacja wzorców formuł ExcelJS wprowadzonych w UnifiedWbsPanel.jsx
// (appendBudgetSheet per-type/per-owner, WBS3 brutto/VAT, Materiały offerPerQty).
// Odtwarza dokładnie te same wywołania sheet.addRow(...) z obiektami {formula, result}.
const ExcelJS = require('../apps/frontend/node_modules/exceljs');

async function main() {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Test');
    sheet.columns = [{ width: 20 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];

    // Wzorzec: WBS3 brutto/VAT jako formuły referencujące własny wiersz
    const rowNum = sheet.rowCount + 1;
    sheet.addRow([
        'Pozycja A', 1000, 0.23,
        { formula: `=B${rowNum}*(1+C${rowNum})`, result: 1230 },
        { formula: `=B${rowNum}*C${rowNum}`, result: 230 },
    ]);

    // Wzorzec: Podsumowanie per-typ z SUBTOTAL + Zysk/Marża formułami
    const firstRow = sheet.rowCount + 1;
    sheet.addRow(['Typ 1', 500, 800, { formula: `=C${firstRow}-B${firstRow}`, result: 300 }, { formula: `=IF(C${firstRow}=0,0,D${firstRow}/C${firstRow})`, result: 0.375 }]);
    const secondRow = sheet.rowCount + 1;
    sheet.addRow(['Typ 2', 200, 400, { formula: `=C${secondRow}-B${secondRow}`, result: 200 }, { formula: `=IF(C${secondRow}=0,0,D${secondRow}/C${secondRow})`, result: 0.5 }]);
    const totalsRowNum = sheet.rowCount + 1;
    sheet.addRow([
        'Razem',
        { formula: `=SUBTOTAL(9,B${firstRow}:B${totalsRowNum - 1})`, result: 700 },
        { formula: `=SUBTOTAL(9,C${firstRow}:C${totalsRowNum - 1})`, result: 1200 },
        { formula: `=C${totalsRowNum}-B${totalsRowNum}`, result: 500 },
        { formula: `=IF(C${totalsRowNum}=0,0,D${totalsRowNum}/C${totalsRowNum})`, result: 500 / 1200 },
    ]);

    const buf = await wb.xlsx.writeBuffer();

    // Odczyt z powrotem — weryfikacja że formuły przetrwały zapis/odczyt.
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf);
    const s2 = wb2.getWorksheet('Test');
    let ok = true;
    for (let r = 1; r <= s2.rowCount; r++) {
        const row = s2.getRow(r);
        const cells = [];
        for (let c = 1; c <= 5; c++) {
            const v = row.getCell(c).value;
            const isFormula = v && typeof v === 'object' && 'formula' in v;
            cells.push(isFormula ? `=${v.formula} (cached=${v.result})` : JSON.stringify(v));
            if (c >= 2 && r >= 1 && !isFormula && typeof v !== 'number' && v !== null) ok = false;
        }
        console.log(`row ${r}: ${cells.join(' | ')}`);
    }
    // Zawartość formuł per wiersz musi zawierać referencje do własnego numeru wiersza (self-consistent).
    const rowHasSelfRef = (r) => {
        const row = s2.getRow(r);
        for (let c = 1; c <= 5; c++) {
            const v = row.getCell(c).value;
            if (v && typeof v === 'object' && 'formula' in v && v.formula.includes(String(r))) return true;
        }
        return false;
    };
    for (let r = 1; r <= s2.rowCount; r++) {
        const has = rowHasSelfRef(r);
        console.log(`${has ? 'OK  ' : 'FAIL'} row ${r} formulas reference own row number`);
        if (!has) ok = false;
    }

    console.log(ok ? '\nWSZYSTKIE FORMUŁY PRZETRWAŁY ZAPIS/ODCZYT XLSX I ODNOSZĄ SIĘ DO WŁAŚCIWYCH WIERSZY.' : '\nBŁĄD: część formuł nie przetrwała lub referencje są błędne.');
    process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
