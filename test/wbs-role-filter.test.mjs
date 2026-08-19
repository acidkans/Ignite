// Test filtra widoczności liści WBS po roli (getUnifiedTree / getTree / saveTree).
// Uruchamia PRAWDZIWY WbsNodesService z dist/ na atrapach PrismaService i ClsService.
//   node test/wbs-role-filter.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { WbsNodesService } = require('../apps/backend/dist/wbs-nodes/wbs-nodes.service.js');

// ── Atrapa drzewa ────────────────────────────────────────────────────────────
// grupa „Montaż" → [praca, materiał], grupa „Dostawa" → [sprzęt],
// grupa „Ekipa" → [nocleg, paliwo] (po filtrze zostaje pusta grupa),
// „Usługa z dziećmi" → [materiał] (zamknięty typ, ale trzyma widoczne dziecko)
const NODES = [
    { id: 'g1', parentId: null, type: '',        name: 'Montaż',           unitCost: 0,   totalPrice: 0 },
    { id: 'l1', parentId: 'g1', type: 'work',    name: 'Robocizna',        unitCost: 120, totalPrice: 4800 },
    { id: 'l2', parentId: 'g1', type: 'material',name: 'Kabel YDY',        unitCost: 4,   totalPrice: 400 },
    { id: 'g2', parentId: null, type: 'group',   name: 'Dostawa',          unitCost: 0,   totalPrice: 0 },
    { id: 'l3', parentId: 'g2', type: 'equipment',name: 'Switch',          unitCost: 900, totalPrice: 900 },
    { id: 'g3', parentId: null, type: '',        name: 'Ekipa',            unitCost: 0,   totalPrice: 0 },
    { id: 'l4', parentId: 'g3', type: 'lodging', name: 'Hotel',            unitCost: 200, totalPrice: 600 },
    { id: 'l5', parentId: 'g3', type: 'fuel',    name: 'Paliwo',           unitCost: 7,   totalPrice: 350 },
    { id: 's1', parentId: null, type: 'service', name: 'Usługa z dziećmi', unitCost: 500, totalPrice: 500 },
    { id: 'l6', parentId: 's1', type: 'material',name: 'Wkręty',           unitCost: 1,   totalPrice: 50 },
];

const deleted = [];
const prismaStub = {
    wbsNode: {
        findMany: async ({ where }) => {
            if (where?.versionId === undefined && where?.nodeId == null) return [];
            return NODES.map(n => ({ ...n, nodeId: 'ORDER', versionId: null, quantity: 1, margin: 0,
                discount: 0, unitPrice: n.unitCost, totalCost: n.totalPrice, tags: null, qa: null,
                status: '', owner: '', resources: '', cost: '', unit: 'szt', comment: null,
                strategy: null, phase: null, budgetType: null, sortOrder: 0 }));
        },
        deleteMany: async ({ where }) => { deleted.push(...where.id.in); return { count: where.id.in.length }; },
        update: async () => ({}),
        upsert: async () => ({}),
    },
    wbsNodeMaterial: { findMany: async () => [] },
    processNode: { findUnique: async () => ({ id: 'ORDER', type: 'order', parentId: null }) },
    projectVersion: { findFirst: async () => null },
    $transaction: async (fn) => fn(prismaStub),
};

const makeService = (roles) => new WbsNodesService(
    prismaStub,
    { notifyIfEnteringExtraOrder: async () => {} },
    { get: (key) => (key === 'user.roles' ? roles : undefined) },
);

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed++;
};

// ── 1. getUnifiedTree ────────────────────────────────────────────────────────
const idsFor = async (roles) => {
    const res = await makeService(roles).getUnifiedTree('ORDER');
    return res.items.map(i => i.id).sort();
};

const mgr = await idsFor(['MANAGER']);
check('manager widzi wszystkie 10 węzłów', mgr.length === 10, mgr.join(','));

const log = await idsFor(['LOGISTYK']);
check('logistyk nie widzi pracy (l1)',   !log.includes('l1'), log.join(','));
check('logistyk nie widzi noclegu (l4)', !log.includes('l4'));
check('logistyk nie widzi paliwa (l5)',  !log.includes('l5'));
check('logistyk widzi materiał i sprzęt', log.includes('l2') && log.includes('l3') && log.includes('l6'));
check('grupy zostają (g1,g2,g3)', ['g1','g2','g3'].every(id => log.includes(id)), log.join(','));
check('zamknięty typ z widocznym dzieckiem zostaje (s1)', log.includes('s1'),
    'inaczej materiał „Wkręty" osierociłby się i zniknął z drzewa');

const svcLog = makeService(['LOGISTYK']);
const itemsLog = (await svcLog.getUnifiedTree('ORDER')).items;
const s1Row = itemsLog.find(i => i.id === 's1');
check('zatrzymany zamknięty węzeł ma wyzerowane kwoty', s1Row.unitCost === 0 && s1Row.totalPrice === 0,
    `unitCost=${s1Row.unitCost} totalPrice=${s1Row.totalPrice}`);
const l2Row = itemsLog.find(i => i.id === 'l2');
check('materiał zachowuje swoje kwoty', l2Row.unitCost === 4 && l2Row.totalPrice === 400,
    `unitCost=${l2Row.unitCost} totalPrice=${l2Row.totalPrice}`);
const mgrS1 = (await makeService(['MANAGER']).getUnifiedTree('ORDER')).items.find(i => i.id === 's1');
check('manager widzi kwoty tego samego węzła', mgrS1.unitCost === 500 && mgrS1.totalPrice === 500);

const worker = await idsFor(['USER']);
check('pracownik ma ten sam zawężony widok co logistyk', worker.join(',') === log.join(','));

const noRole = await idsFor(undefined);
check('brak roli w CLS = widok zawężony (fail-closed)', !noRole.includes('l1'));

// ── 2. getTree (blob dla order-requirements) ─────────────────────────────────
const flat = (items, acc = []) => { for (const i of items) { acc.push(i.id); flat(i.children || [], acc); } return acc; };
const treeLog = flat((await makeService(['LOGISTYK']).getTree('ORDER')).items).sort();
check('getTree też zawęża (blob wbsTree)', !treeLog.includes('l1') && treeLog.includes('l2'), treeLog.join(','));

// ── 3. saveTree — ukryte liście nie giną przy zapisie nie-managera ───────────
// Drzewo odesłane przez logistyka: to, co widział (bez l1/l4/l5) minus skasowany l6.
const treeFromLogistyk = { items: [
    { id: 'g1', name: 'Montaż', type: '', children: [{ id: 'l2', name: 'Kabel YDY', type: 'material', children: [] }] },
    { id: 'g2', name: 'Dostawa', type: 'group', children: [{ id: 'l3', name: 'Switch', type: 'equipment', children: [] }] },
    { id: 'g3', name: 'Ekipa', type: '', children: [] },
    { id: 's1', name: 'Usługa z dziećmi', type: 'service', children: [] },
] };

deleted.length = 0;
await makeService(['LOGISTYK']).saveTree('ORDER', undefined, treeFromLogistyk);
check('zapis logistyka NIE kasuje ukrytych liści', !deleted.some(id => ['l1','l4','l5'].includes(id)),
    `usunięte: ${deleted.join(',') || '—'}`);
check('zapis logistyka kasuje to, co faktycznie usunął (l6)', deleted.includes('l6'),
    `usunięte: ${deleted.join(',') || '—'}`);

deleted.length = 0;
await makeService(['MANAGER']).saveTree('ORDER', undefined, treeFromLogistyk);
check('zapis managera kasuje wszystko spoza drzewa (l1,l4,l5,l6)',
    ['l1','l4','l5','l6'].every(id => deleted.includes(id)), `usunięte: ${deleted.join(',') || '—'}`);

console.log(failed === 0 ? '\nOK — wszystkie sprawdzenia przeszły' : `\n${failed} sprawdzeń nie przeszło`);
process.exit(failed === 0 ? 0 : 1);
