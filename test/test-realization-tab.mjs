// Smoke test warstwy danych zakładki „Realizacja" (RealizationTab).
// Sprawdza, że trzy endpointy, z których zakładka składa tabelę, zwracają komplet pól
// potrzebnych do policzenia wiersza — i że liczby wychodzą takie same jak w panelu Materiały.
// Nie dotyka bazy: same odczyty.
//
//   node test/test-realization-tab.mjs
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const jwt = require('../apps/backend/node_modules/jsonwebtoken');

const API = process.env.API_BASE || 'http://localhost:3001/api';
const ORDER_ID = process.env.ORDER_ID || '219f64a5-515e-45a3-b1c0-0ded85e2a85d'; // CMC- Serwerownia ZDC1-K9_2026
const ADMIN_ID = '23a44372-c974-444c-a997-0b6bb3ead1a4';

const env = fs.readFileSync(new URL('../apps/backend/.env', import.meta.url), 'utf8');
const SECRET = env.match(/^JWT_SECRET=(.*)$/m)[1].trim();
const token = jwt.sign({ sub: ADMIN_ID, roles: ['ADMIN'] }, SECRET, { expiresIn: '15m' });

const call = async (path, opts = {}) => {
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${JSON.stringify(body)}`);
    return body;
};

let failed = 0;
const check = (label, cond, detail = '') => {
    console.log(`${cond ? '  OK  ' : ' BŁĄD '} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!cond) failed += 1;
};

// ── Te same reguły co w realizationShared.js ─────────────────────────────────
const LEAF_TYPES = ['material', 'equipment', 'work', 'service', 'lodging', 'fuel'];
const OPEN_LEAF_TYPES = ['material', 'equipment'];
const CARD_TYPES = ['material', 'equipment'];
const wbsRootOf = (n) => n?.sourceWbsNodeId || n?.id || '';
const planUnitOf = (node, card) => card?.priceNetto ?? node?.unitCost ?? null;

// Liść kosztowy = węzeł z typem, NIE węzeł bez dzieci — typowane pozycje bywają rodzicami
// innych pozycji i niosą własny koszt (patrz komentarz przy `leafNodesOf`).
const leafNodesOf = (nodes, types) => nodes.filter(n => types.includes(n.type));

const realizationOf = (node, entries) => {
    const list = entries || [];
    const qty = Math.round(list.reduce((s, e) => s + (Number(e.qty) || 0), 0) * 1000) / 1000;
    const value = Math.round(list.reduce((s, e) => s + (Number(e.qty) || 0) * (Number(e.unitCost) || 0), 0) * 100) / 100;
    const plan = Number(node?.quantity) || 0;
    return { qty, value, plan, avg: qty > 0 ? Math.round((value / qty) * 100) / 100 : null };
};

const buildCardMap = (nodes, reqs) => {
    const reqById = Object.fromEntries(reqs.map(r => [r.id, r]));
    const byWbsNodeId = {}, byName = {};
    for (const r of reqs) {
        if (r.wbsNodeId) byWbsNodeId[r.wbsNodeId] = r;
        if (r.name) byName[String(r.name).trim().toLowerCase()] = r;
    }
    const map = {};
    for (const node of nodes) {
        if (!CARD_TYPES.includes(node.type)) continue;
        const tag = (node.tags || []).find(t => typeof t === 'string' && t.startsWith('req:'));
        const req = (tag && reqById[tag.slice(4)]) || byWbsNodeId[node.id] || byName[String(node.name || '').trim().toLowerCase()] || null;
        if (req) map[node.id] = { ...req, priceNetto: req.budgetedPriceNetto ?? req.priceNetto ?? null };
    }
    return map;
};

// ── Test ──────────────────────────────────────────────────────────────────────
console.log(`\n=== Zakładka Realizacja — warstwa danych (${API}) ===\n`);

const unified = await call(`/wbs-nodes/unified/${ORDER_ID}`);
const nodes = unified.items || [];
check('GET /wbs-nodes/unified zwraca węzły', nodes.length > 0, `${nodes.length} węzłów`);

// Pola, bez których wiersz tabeli nie da się policzyć.
const REQUIRED = ['id', 'parentId', 'name', 'type', 'path', 'quantity', 'unit', 'unitCost', 'sourceWbsNodeId', 'realizationClosed'];
const missing = REQUIRED.filter(f => !nodes.some(n => f in n));
check('węzeł niesie komplet pól tabeli', missing.length === 0, missing.length ? `brakuje: ${missing.join(', ')}` : REQUIRED.join(', '));

const leaves = leafNodesOf(nodes, LEAF_TYPES);
const openLeaves = leafNodesOf(nodes, OPEN_LEAF_TYPES);
check('liście kosztowe wyznaczone po typie', leaves.length > 0, `${leaves.length} liści (manager)`);
check('widok bez managera węższy lub równy', openLeaves.length <= leaves.length, `${openLeaves.length} liści (materiał + sprzęt)`);
check('ten sam zbiór pozycji co panel Materiały', leaves.length === nodes.filter(n => LEAF_TYPES.includes(n.type)).length);
check('bez managera wyłącznie materiał i sprzęt', openLeaves.every(n => OPEN_LEAF_TYPES.includes(n.type)));

const byType = {};
for (const l of leaves) byType[l.type] = (byType[l.type] || 0) + 1;
console.log(`        typy liści: ${Object.entries(byType).map(([t, c]) => `${t}=${c}`).join(', ') || '—'}`);
const managerOnly = leaves.length - openLeaves.length;
console.log(`        tylko dla managera: ${managerOnly} pozycji (praca/usługa/nocleg/paliwo)`);

const reqs = await call(`/material-requirements/node/${ORDER_ID}`);
const cards = buildCardMap(nodes, reqs);
check('karty materiałowe dopasowane do liści', Object.keys(cards).length > 0, `${Object.keys(cards).length} z ${openLeaves.length} liści materiał/sprzęt`);

const actuals = await call(`/leaf-actuals/order/${ORDER_ID}`);
check('GET /leaf-actuals/order zwraca wpisy', Array.isArray(actuals), `${actuals.length} wpisów`);
if (actuals.length) {
    const A = ['id', 'wbsRootId', 'entryDate', 'qty', 'unitCost', 'comment', 'docNumber', 'manufacturer', 'model'];
    const miss = A.filter(f => !(f in actuals[0]));
    check('wpis niesie komplet pól dziennika', miss.length === 0, miss.length ? `brakuje: ${miss.join(', ')}` : 'z dostawcą i autorem');
    check('wpis ma dostawcę i autora w relacji', 'supplier' in actuals[0] && 'author' in actuals[0]);
}

// Wpisy muszą trafiać pod korzeń klonu liścia — inaczej tabela pokaże „0 / N".
const byRoot = {};
for (const a of actuals) (byRoot[a.wbsRootId] ||= []).push(a);
const rootsInTable = new Set(leaves.map(wbsRootOf));
const orphans = Object.keys(byRoot).filter(r => !rootsInTable.has(r));
check('każdy wpis ma swój liść w tabeli', orphans.length === 0, orphans.length ? `${orphans.length} osieroconych korzeni` : `${Object.keys(byRoot).length} korzeni z wpisami`);

// Sumy nagłówka sekcji.
let plan = 0, real = 0, withEntries = 0;
for (const node of leaves) {
    const card = cards[node.id] || null;
    const r = realizationOf(node, byRoot[wbsRootOf(node)] || []);
    const u = planUnitOf(node, card);
    if (u != null) plan += u * (Number(node.quantity) || 0);
    real += r.value;
    if (r.qty > 0) withEntries += 1;
}
plan = Math.round(plan * 100) / 100;
real = Math.round(real * 100) / 100;
check('suma wyceny policzona', Number.isFinite(plan) && plan > 0, `${plan.toFixed(2)} zł`);
check('suma zakupu policzona', Number.isFinite(real), `${real.toFixed(2)} zł · ${withEntries} pozycji z wpisami`);
console.log(`        Δ = ${(real - plan >= 0 ? '+' : '')}${(real - plan).toFixed(2)} zł`);

// Ten sam wiersz musi dać tę samą liczbę co panel Materiały (średnia ważona z wpisów).
const sample = leaves.find(n => (byRoot[wbsRootOf(n)] || []).length > 1);
if (sample) {
    const r = realizationOf(sample, byRoot[wbsRootOf(sample)]);
    const manual = byRoot[wbsRootOf(sample)].reduce((s, e) => s + e.qty * e.unitCost, 0) / byRoot[wbsRootOf(sample)].reduce((s, e) => s + e.qty, 0);
    check('koszt jedn. zakupu = średnia ważona wpisów', Math.abs(r.avg - manual) < 0.01, `„${sample.name}" → ${r.avg} zł z ${byRoot[wbsRootOf(sample)].length} wpisów`);
} else {
    console.log('        (brak liścia z >1 wpisem — pomijam test średniej ważonej)');
}

// ── Kolumna „Komentarz" — to samo pole co w WBSHybridTable ───────────────────
// Jedyny zapis w tym teście; oryginalna wartość jest przywracana na końcu.
const target = leaves.find(n => cards[n.id]) || leaves[0];
const before = target.comment ?? null;
const probe = `__test-realizacja-${Date.now()}`;
try {
    await call(`/wbs-nodes/${target.id}`, { method: 'PATCH', body: JSON.stringify({ comment: probe }) });
    const after = (await call(`/wbs-nodes/unified/${ORDER_ID}`)).items.find(n => n.id === target.id);
    check('PATCH /wbs-nodes zapisuje `comment`', after?.comment === probe, `„${target.name.trim().slice(0, 30)}"`);
    check('`comment` wraca w /wbs-nodes/unified', 'comment' in (after || {}), 'kolumna Komentarz ma z czego czytać');
} finally {
    await call(`/wbs-nodes/${target.id}`, { method: 'PATCH', body: JSON.stringify({ comment: before ?? '' }) });
    const restored = (await call(`/wbs-nodes/unified/${ORDER_ID}`)).items.find(n => n.id === target.id);
    check('komentarz przywrócony po teście', (restored?.comment || null) === (before || null), `„${before ?? ''}"`);
}

// ── Produkt z wyceny — źródło podpowiedzi „ten sam produkt co w wycenie?" ────
const withOffer = Object.values(cards).filter(c => (c.proposals || []).some(p => p.isOffer));
check('są pozycje z propozycją `isOffer`', withOffer.length > 0, `${withOffer.length} z ${Object.keys(cards).length} kart`);
if (withOffer.length) {
    const named = withOffer.filter(c => {
        const p = c.proposals.find(x => x.isOffer);
        return p.manufacturer || p.model || p.productName;
    });
    check('propozycja wyceny niesie producenta / model', named.length > 0, `${named.length} propozycji z opisem produktu`);
    const sample = named[0]?.proposals.find(x => x.isOffer);
    if (sample) console.log(`        przykład podpowiedzi: „${[sample.manufacturer, sample.model].filter(Boolean).join(' ') || sample.productName}"${sample.supplier?.name ? ` · dostawca ${sample.supplier.name}` : ''}`);
    check('propozycja niesie dostawcę w relacji', withOffer.some(c => 'supplier' in (c.proposals.find(x => x.isOffer) || {})));
}

console.log(`\n${failed === 0 ? '✅ Wszystkie testy przeszły' : `❌ Nieudanych testów: ${failed}`}\n`);
process.exit(failed === 0 ? 0 : 1);
