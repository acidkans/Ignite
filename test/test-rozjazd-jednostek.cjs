// Sprawdza regułę wykrywania rozjazdu jednostek/typów (validateMaterialConsistency)
// na prawdziwych danych z eksportu produkcyjnego: arkusz „Materiały" = po jednym
// wierszu na liść WBS typu Materiał/Sprzęt.
const ExcelJS = require('../apps/frontend/node_modules/exceljs');
const FILE = process.argv[2] || 'C:/Users/Cosinus/Downloads/Airtel_oferta_Rozbudowa systemu wizyjnego_BEZ-CEN.xlsx';

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sheet = wb.getWorksheet('Materiały');
  const nodes = [];
  sheet.eachRow((r, i) => {
    if (i < 2) return;
    const type = String(r.getCell(1).value || '');
    const name = String(r.getCell(4).value || '').trim();
    if (!name || type === 'Razem') return;
    nodes.push({ type: type === 'Sprzęt' ? 'equipment' : 'material', name, quantity: Number(r.getCell(5).value) || 0, unit: String(r.getCell(6).value || 'szt').trim().toLowerCase(), path: String(r.getCell(3).value || '') });
  });

  const byName = new Map();
  for (const n of nodes) {
    const key = n.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { name: n.name, entries: [] });
    byName.get(key).entries.push(n);
  }
  const conflicts = [];
  for (const g of byName.values()) {
    const units = new Set(g.entries.map(e => e.unit));
    const types = new Set(g.entries.map(e => e.type));
    if (units.size < 2 && types.size < 2) continue;
    conflicts.push({ name: g.name, mixedUnits: units.size > 1, mixedTypes: types.size > 1, entries: g.entries });
  }

  console.log(`pozycji materiałowych: ${nodes.length}; unikalnych nazw: ${byName.size}; konfliktów: ${conflicts.length}\n`);
  for (const c of conflicts) {
    console.log(`⚠ ${c.name} — ${[c.mixedUnits && 'różne jednostki', c.mixedTypes && 'różne typy'].filter(Boolean).join(' · ')}`);
    for (const e of c.entries) console.log(`   ${e.quantity} ${e.unit} · ${e.path}`);
  }
})();
