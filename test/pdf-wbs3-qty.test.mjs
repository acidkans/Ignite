import { buildWbsHtmlTable } from './.tmp-pdf-bundle.mjs';
const d = [
  { id: 'r', parentId: null, name: 'Root' },
  { id: 'a', parentId: 'r', name: 'Koszty ogólne' },
  { id: 'b', parentId: 'a', name: 'Nocleg PM' },
  { id: 'c', parentId: 'b', name: 'Nocleg PM', quantity: 4, unit: 'noc', unitCost: 100, margin: 10 },
];
const h = buildWbsHtmlTable(d, 3);
console.log(h.replace(/ style="[^"]*"/g, '').match(/<tbody>.*<\/tbody>/)[0]);
