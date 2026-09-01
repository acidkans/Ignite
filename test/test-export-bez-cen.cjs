// Bundle pomocniczy generuj przed uruchomieniem:
//   npx esbuild apps/frontend/src/utils/exportWithoutPrices.js --bundle --format=cjs --outfile=test/.exportWithoutPrices.cjs
// Test sanitizera eksportu „bez cen" (stripPricesFromWorkbook).
// Buduje arkusz o układzie identycznym z appendBudgetSheet i sprawdza, że po
// czyszczeniu nie zostaje żadna wartość ani formuła, a Lp./Ilość/teksty zostają.
const ExcelJS = require('../apps/frontend/node_modules/exceljs');
const { stripPricesFromWorkbook, noPricesFilename } = require('./.exportWithoutPrices.cjs');

(async () => {
  const wb = new ExcelJS.Workbook();
  const sh = wb.addWorksheet('Budżet');
  sh.columns = [
    { key: 'index', width: 6 }, { key: 'name', width: 20 }, { key: 'quantity', width: 8 },
    { key: 'unitCost', width: 10 }, { key: 'totalCost', width: 10 }, { key: 'margin', width: 8 },
    { key: 'offerPrice', width: 12 }, { key: 'status', width: 10 },
  ];
  sh.addRow(['Rabat całościowy', 1000, '', 'Cena ofertowa po rabacie całościowym', 5000]);
  sh.addRow({ name: 'Razem', totalCost: { formula: '=SUBTOTAL(9,E4:E5)', result: 300 }, offerPrice: { formula: '=SUBTOTAL(9,G4:G5)', result: 360 } });
  sh.addRow(['Lp.', 'Pozycja', 'Ilość', 'Koszt jednostkowy', 'Koszt całościowy', 'Narzut (%)', 'ofertowa cena całość.', 'Status']);
  sh.addRow({ index: 1, name: 'Koszty ogólne', quantity: 4, unitCost: 50, totalCost: { formula: '=D4*C4', result: 200 }, margin: 0.2, offerPrice: { formula: '=E4*1.2', result: 240 }, status: 'W toku' });
  sh.addRow({ index: 2, name: 'Montaż szafy', quantity: 2, unitCost: 50, totalCost: { formula: '=D5*C5', result: 100 }, margin: 0.2, offerPrice: { formula: '=E5*1.2', result: 120 }, status: 'Nowy' });

  const cleared = stripPricesFromWorkbook(wb);
  const at = (r, c) => sh.getRow(r).getCell(c).value;
  const checks = [
    ['rabat (wiersz etykieta→wartość) wyczyszczony', at(1, 2) == null && at(1, 5) == null],
    ['Razem — koszt wyczyszczony', at(2, 5) == null],
    ['Razem — cena wyczyszczona', at(2, 7) == null],
    ['nagłówki zostają', at(3, 4) === 'Koszt jednostkowy'],
    ['koszt jedn. wyczyszczony', at(4, 4) == null],
    ['koszt całk. (formuła) wyczyszczony', at(4, 5) == null],
    ['narzut wyczyszczony', at(4, 6) == null],
    ['cena ofertowa wyczyszczona', at(4, 7) == null],
    ['Lp. zostaje mimo nazwy "Koszty ogólne"', at(4, 1) === 1],
    ['Ilość zostaje mimo nazwy "Koszty ogólne"', at(4, 3) === 4],
    ['nazwa pozycji zostaje', at(5, 2) === 'Montaż szafy'],
    ['status zostaje', at(5, 8) === 'Nowy'],
    ['nazwa pliku ze znacznikiem', noPricesFilename('projekt_budzet.xlsx') === 'projekt_budzet_BEZ-CEN.xlsx'],
  ];
  let fail = 0;
  for (const [label, ok] of checks) { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`); }
  console.log(`\nwyczyszczonych komórek: ${cleared}; błędów: ${fail}`);
  process.exit(fail ? 1 : 0);
})();
