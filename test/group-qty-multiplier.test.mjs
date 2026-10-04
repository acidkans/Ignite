import { applyGroupMultipliers, buildGroupMultiplierMap } from '../apps/frontend/src/components/shared/wbs/wbsConstants.js';
const nodes = [
  { id: 'root', parentId: null, type: '', quantity: 0 },
  { id: 'g', parentId: 'root', type: 'group', quantity: 3 },
  { id: 'g2', parentId: 'g', type: 'group', quantity: 2 },
  { id: 'a', parentId: 'g2', type: 'material', quantity: 5, unitCost: 10, totalCost: 50 },
  { id: 'b', parentId: 'g', type: 'work', quantity: 1, unitCost: 100, totalCost: 100 },
  { id: 'c', parentId: 'root', type: 'work', quantity: 4 },
  { id: 'e', parentId: 'root', type: 'group', quantity: 0 },
  { id: 'f', parentId: 'e', type: 'work', quantity: 7 },
];
const m = buildGroupMultiplierMap(nodes);
const out = Object.fromEntries(applyGroupMultipliers(nodes).map(n => [n.id, n]));
const eq = (a, b, l) => { if (a !== b) { console.error('FAIL', l, a, b); process.exitCode = 1; } else console.log('ok', l); };
eq(m.get('a'), 6, 'mult a'); eq(m.get('b'), 3, 'mult b'); eq(m.get('c'), 1, 'mult c'); eq(m.get('f'), 1, 'pusta ilość pakietu = 1');
eq(out.a.quantity, 30, 'qty a'); eq(out.a._ownQuantity, 5, 'own a'); eq(out.a.totalCost, 300, 'cost a');
eq(out.b.quantity, 3, 'qty b'); eq(out.g.quantity, 3, 'group bez zmian'); eq(out.c, nodes[5], 'poza pakietem ten sam obiekt');
