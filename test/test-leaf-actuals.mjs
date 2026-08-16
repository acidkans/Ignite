// Test end-to-end wpisów realizacji (LeafActual) na lokalnym backendzie (domyślnie 3001).
// Odpala się na kopii bazy produkcyjnej w lokalnym Dockerze — sprząta po sobie
// (kasuje wpisy, które sam założył, i przywraca flagę realizationClosed).
//
//   node test/test-leaf-actuals.mjs
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const jwt = require('../apps/backend/node_modules/jsonwebtoken');

// Domyślnie backend dev na 3001 (npm run start:dev). Backend w Dockerze słucha na 3005 —
// wtedy: API_BASE=http://localhost:3005/api node test/test-leaf-actuals.mjs
const API = process.env.API_BASE || 'http://localhost:3001/api';
const ORDER_ID = '219f64a5-515e-45a3-b1c0-0ded85e2a85d'; // CMC- Serwerownia ZDC1-K9_2026 (ma baseline)
const ADMIN_ID = '23a44372-c974-444c-a997-0b6bb3ead1a4';

const env = fs.readFileSync(new URL('../apps/backend/.env', import.meta.url), 'utf8');
const SECRET = env.match(/^JWT_SECRET=(.*)$/m)[1].trim();
const token = jwt.sign({ sub: ADMIN_ID }, SECRET, { expiresIn: '15m' });

const call = async (path, opts = {}) => {
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${JSON.stringify(body)}`);
    return body;
};

const zl = (v) => v == null ? '—' : Number(v).toFixed(2);
let failed = 0;
const check = (label, cond, detail = '') => {
    console.log(`${cond ? '  OK  ' : ' BŁĄD '} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!cond) failed += 1;
};

const created = [];

try {
    // ── 1. Stan wyjściowy ────────────────────────────────────────────────────
    const before = await call(`/orders/${ORDER_ID}/comparison`);
    check('porównanie zwraca accepted:true', before.accepted === true);
    console.log(`       wierszy: ${before.rows.length}, pokrycie ${before.kpi.coveragePriced}/${before.kpi.coverageTotal}, Δ ${zl(before.kpi.deltaSum)} zł`);

    const typy = before.rows.reduce((acc, r) => { acc[r.type || '(bez typu)'] = (acc[r.type || '(bez typu)'] || 0) + 1; return acc; }, {});
    console.log('       typy liści w porównaniu:', JSON.stringify(typy));
    check('porównanie obejmuje więcej niż materiały', Object.keys(typy).length > 1, Object.keys(typy).join(', '));

    // Wiersz testowy: liść z planem > 0, bez dotychczasowych wpisów
    const target = before.rows.find(r => r.baseline?.qty > 0 && (r.entries || []).length === 0 && r.wbsNodeId);
    if (!target) throw new Error('Brak liścia nadającego się do testu (plan > 0, zero wpisów)');
    console.log(`\n       liść testowy: „${target.name}" (${target.type || 'bez typu'}), plan ${target.baseline.qty} ${target.unit || ''}`);

    // ── 2. Dwa wpisy realizacji ──────────────────────────────────────────────
    const e1 = await call('/leaf-actuals', {
        method: 'POST',
        body: JSON.stringify({ wbsNodeId: target.wbsNodeId, qty: 1, unitCost: 100, comment: 'TEST etap 1' }),
    });
    created.push(e1.id);
    const e2 = await call('/leaf-actuals', {
        method: 'POST',
        body: JSON.stringify({ wbsNodeId: target.wbsNodeId, qty: 2, unitCost: 130, comment: 'TEST etap 2', docNumber: 'FV TEST/1' }),
    });
    created.push(e2.id);

    const list = await call(`/leaf-actuals/order/${ORDER_ID}`);
    const mine = list.filter(a => created.includes(a.id));
    check('oba wpisy zapisane i widoczne w liście zamówienia', mine.length === 2);
    check('wpis niesie autora', !!mine[0].author?.email, mine[0].author?.email || 'brak');
    check('wpis niesie nr dokumentu', mine.some(a => a.docNumber === 'FV TEST/1'));

    // ── 3. Porównanie po dopisaniu ───────────────────────────────────────────
    const after = await call(`/orders/${ORDER_ID}/comparison`);
    const row = after.rows.find(r => r.key === target.key);
    check('strona ZAKUP powstała z wpisów', row?.current?.qty === 3, `qty=${row?.current?.qty}`);
    check('wartość = Σ ilość × koszt jedn. wpisu', Math.abs((row?.current?.value ?? 0) - 360) < 0.005, `${zl(row?.current?.value)} zł (oczekiwane 360,00)`);
    check('cena to średnia ważona wpisów', Math.abs((row?.current?.price ?? 0) - 120) < 0.005, `${zl(row?.current?.price)} (oczekiwane 120,00)`);
    check('wiersz niesie swoje wpisy', (row?.entries || []).length === 2);
    check('pokrycie urosło o jedną pozycję', after.kpi.coveragePriced === before.kpi.coveragePriced + 1,
        `${before.kpi.coveragePriced} → ${after.kpi.coveragePriced}`);

    const nadmiarOczekiwany = 3 > target.baseline.qty;
    check(`odchylenie NADMIAR ${nadmiarOczekiwany ? 'wykryte' : 'nie zgłoszone (3 ≤ plan)'}`,
        (row?.deviations || []).includes('NADMIAR') === nadmiarOczekiwany,
        (row?.deviations || []).join(', ') || 'brak');

    // ── 4. Rozliczenie pozycji ───────────────────────────────────────────────
    await call(`/leaf-actuals/close/${target.wbsNodeId}`, { method: 'PATCH', body: JSON.stringify({ closed: true }) });
    const closed = await call(`/orders/${ORDER_ID}/comparison`);
    check('rozliczenie oznacza wiersz jako zamknięty', closed.rows.find(r => r.key === target.key)?.closed === true);
    await call(`/leaf-actuals/close/${target.wbsNodeId}`, { method: 'PATCH', body: JSON.stringify({ closed: false }) });

    // ── 5. Edycja i walidacja ────────────────────────────────────────────────
    const patched = await call(`/leaf-actuals/${e1.id}`, { method: 'PATCH', body: JSON.stringify({ qty: 5 }) });
    check('PATCH zmienia ilość wpisu', patched.qty === 5, `qty=${patched.qty}`);

    let rejected = false;
    try { await call('/leaf-actuals', { method: 'POST', body: JSON.stringify({ wbsNodeId: target.wbsNodeId, qty: 0, unitCost: 10 }) }); }
    catch { rejected = true; }
    check('ilość 0 odrzucona przez backend', rejected);
} catch (e) {
    console.error('\n  PRZERWANE:', e.message);
    failed += 1;
} finally {
    // ── Sprzątanie ───────────────────────────────────────────────────────────
    for (const id of created) {
        try { await call(`/leaf-actuals/${id}`, { method: 'DELETE' }); } catch (e) { console.error('  sprzątanie:', e.message); }
    }
    const rest = await call(`/leaf-actuals/order/${ORDER_ID}`).catch(() => []);
    check('baza posprzątana (zero wpisów testowych)', !rest.some(a => created.includes(a.id)));
    console.log(failed === 0 ? '\nWSZYSTKO PRZESZŁO' : `\nNIEPOWODZENIA: ${failed}`);
    process.exit(failed === 0 ? 0 : 1);
}
