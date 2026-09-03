// Weryfikacja na DANYCH DEV: kafle Budżetu (KOSZT / PRZYCHÓD / ZYSK) po wykluczeniu pozycji
// odrzuconych. Liczy TĄ SAMĄ ścieżką co aplikacja: `stripRejectedNodes` z `wbsConstants.js`
// (prawdziwy moduł frontu) + formuła `calcDerived` z `BudgetTable.jsx`.
//
// Zamówienie „Okablowanie CZR" ma pozycję „materiał odrzucony" (REJECTED, 1 000 000 zł),
// którą było widać w kaflach — to ona jest przedmiotem tego testu.
//
// Uruchomienie: node test/budzet-bez-odrzuconych.test.mjs
import { execFileSync } from 'node:child_process';
import { stripRejectedNodes } from '../apps/frontend/src/components/shared/wbs/wbsConstants.js';

const NODE = process.env.NODE_ID || '4bcac250-5ad5-4b8a-b377-d2d5de66c21b';
const VER = process.env.VERSION_ID || 'c5e3f4d6-bc1a-43b8-a242-40d733a28783';

let failed = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const zl = (v) => v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sql = `select coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (
  select id, "parentId", name, type, status, "unitCost", quantity, margin, discount
  from wbs_nodes where "nodeId" = '${NODE}' and "versionId" = '${VER}') t;`;
const raw = execFileSync('docker', ['exec', 'erp-db', 'psql', '-U', 'postgres', '-d', 'erp_db', '-t', '-A', '-c', sql],
    { encoding: 'utf8', maxBuffer: 1e8 });
const rows = JSON.parse(raw.trim());

// Formuła 1:1 z `calcDerived` (BudgetTable.jsx): brak narzutu ⇒ cena ofertowa 0, potem rabat.
const derived = (r) => {
    const q = Math.max(0, parseFloat(r.quantity) || 0);
    const uc = Math.max(0, parseFloat(r.unitCost) || 0);
    const m = (r.margin != null && String(r.margin) !== '') ? parseFloat(r.margin) : null;
    const d = Math.max(0, parseFloat(r.discount) || 0);
    const totalCost = uc * q;
    let offerPrice = (m !== null && m !== 0) ? totalCost * (1 + m / 100) : 0;
    if (offerPrice > 0 && d > 0) offerPrice = Math.max(0, offerPrice * (1 - d / 100));
    return { totalCost, offerPrice };
};
// Wiersz Budżetu = ten sam filtr co `buildRows(VIEWS.BUDGET)`.
const positionsOf = (list) => list.filter((r) => r.parentId != null && String(r.type || '').toLowerCase() !== 'group');
const sums = (list) => positionsOf(list).reduce((acc, r) => {
    const { totalCost, offerPrice } = derived(r);
    return { cost: acc.cost + totalCost, revenue: acc.revenue + offerPrice, count: acc.count + 1 };
}, { cost: 0, revenue: 0, count: 0 });

const przed = sums(rows);
const po = sums(stripRejectedNodes(rows));
const odrzucone = rows.filter((r) => String(r.status || '').toUpperCase() === 'REJECTED');

console.log(`Zamówienie ${NODE}, wersja ${VER}\n`);
console.log(`PRZED: ${przed.count} poz., koszt ${zl(przed.cost)} zł, przychód ${zl(przed.revenue)} zł`);
console.log(`PO:    ${po.count} poz., koszt ${zl(po.cost)} zł, przychód ${zl(po.revenue)} zł`);
console.log(`Odrzucone: ${odrzucone.map((r) => `${r.name.trim()} (${zl(derived(r).totalCost)} zł)`).join(', ') || '—'}\n`);

check('są pozycje odrzucone do wykluczenia', odrzucone.length > 0, `${odrzucone.length}`);
check('kafel KOSZT spada o wartość odrzuconych',
    Math.abs((przed.cost - po.cost) - odrzucone.reduce((s, r) => s + derived(r).totalCost, 0)) < 0.02,
    `Δ = ${zl(przed.cost - po.cost)} zł`);
check('liczba wierszy Budżetu spada o liczbę odrzuconych', przed.count - po.count === odrzucone.length,
    `${przed.count} → ${po.count}, odrzuconych ${odrzucone.length}`);
check('żadna pozycja odrzucona nie zostaje w wierszach Budżetu',
    positionsOf(stripRejectedNodes(rows)).every((r) => String(r.status || '').toUpperCase() !== 'REJECTED'));
check('kafel KOSZT po zmianie < kafel przed zmianą', po.cost < przed.cost, `${zl(po.cost)} < ${zl(przed.cost)}`);

console.log(failed === 0 ? '\nWSZYSTKO OK' : `\n${failed} BŁĘDÓW`);
process.exit(failed === 0 ? 0 : 1);
