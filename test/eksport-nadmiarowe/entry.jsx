import fs from 'fs';
import ExcelJS from 'exceljs';
(async () => {
let captured = null;
globalThis.Blob = class { constructor(parts) { captured = parts[0]; } };
globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.URL.revokeObjectURL = () => {};
globalThis.document = { createElement: () => ({ click() {}, remove() {}, setAttribute() {}, style: {} }), addEventListener() {}, documentElement: { style: {} }, body: { appendChild() {}, removeChild() {} } };
globalThis.window = globalThis; globalThis.sessionStorage = { getItem: () => null }; globalThis.localStorage = globalThis.sessionStorage;
const { eksportRealizacjiXlsx } = await import('../../apps/frontend/src/components/shared/RealizationTab.jsx');
const { realizationOf } = await import('../../apps/frontend/src/components/shared/wbs/realizationShared.js');
const node = { id: 'n1', createdAt: '2026-08-01', name: 'Easy Rack', type: 'material', quantity: 3, unit: 'sztuki', unitCost: 12618.5, path: 'Serwerownia › Easy Rack' };
const sup = { id: 's', name: 'IT-Planet' };
const entries = [
  { id: 'a', wbsRootId: 'n1', entryDate: '2026-08-10', qty: 3, unitCost: 8410.81, model: 'ER8222', manufacturer: 'APC', supplier: sup, isSurplus: false, comment: 'koszt ER8222' },
  { id: 'b', wbsRootId: 'n1', entryDate: '2026-09-23', qty: 3, unitCost: 5289, model: 'ER6212', manufacturer: 'APC', supplier: sup, isSurplus: true, comment: 'szafy ER6212' },
];
const orphan = [{ id: 'c', wbsRootId: 'gone', entryDate: '2026-09-01', qty: 1, unitCost: 3100, model: 'SMT1500', supplier: sup, leafName: 'UPS', leafType: 'equipment' }];
const nodeNew = { id: 'n2', name: 'kabel 3x2,5', type: 'material', quantity: 40, unit: 'm', unitCost: 0, path: 'Serwerownia › kabel', _outOfBaseline: true };
const eNew = [{ id: 'd', wbsRootId: 'n2', entryDate: '2026-09-02', qty: 40, unitCost: 4.5, supplier: sup }];
await eksportRealizacjiXlsx({ rows: [{ node, card: null, realization: realizationOf(node, entries) }, { node: nodeNew, card: null, realization: realizationOf(nodeNew, eNew) }], visibleTypes: ['material','equipment'], orderName: 'test', orphanEntries: orphan });
fs.writeFileSync('wynik.xlsx', Buffer.from(captured));
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile('wynik.xlsx');
for (const name of ['Zakupy', 'Analiza zakupów']) {
  const ws = wb.getWorksheet(name); console.log('==', name);
  ws.eachRow((r) => console.log(r.values.slice(1).map(v => v && typeof v === 'object' && 'formula' in v ? `${v.result ?? '∅'}{${v.formula}}` : v).join(' | ')));
}
console.log('AF:', JSON.stringify(wb.getWorksheet('Zakupy').autoFilter)); console.log('CF:', JSON.stringify(wb.getWorksheet('Zakupy').conditionalFormattings?.map(c => c.ref)));

})().catch(e => { console.error(e); process.exit(1); });
