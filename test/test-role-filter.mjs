// Egzekwowanie roli PO STRONIE BACKENDU dla danych realizacji. Zawężenie w komponencie
// (`visibleTypes` w zakładce Realizacja i w `ComparisonPanel`) zdejmuje się narzędziami
// deweloperskimi, więc te same reguły muszą trzymać dwa endpointy:
//   GET /orders/:nodeId/comparison      → wiersze i KPI
//   GET /leaf-actuals/order/:nodeId     → dziennik wpisów
// Zasada: manager i admin widzą wszystkie typy liści, każda inna rola wyłącznie materiał
// i sprzęt — praca, usługa, nocleg i paliwo to koszty własne firmy.
//
//   node test/test-role-filter.mjs
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const jwt = require('../apps/backend/node_modules/jsonwebtoken');

const API = process.env.API_BASE || 'http://localhost:3001/api';
const ORDER_ID = process.env.ORDER_ID || '219f64a5-515e-45a3-b1c0-0ded85e2a85d'; // CMC- Serwerownia ZDC1-K9_2026
const ADMIN_ID = '23a44372-c974-444c-a997-0b6bb3ead1a4';
const LOGISTYK_ID = process.env.LOGISTYK_ID || 'afd12b51-1104-43a1-9c23-3ab3462d0a7f'; // a.sadyn@linkedteam.com.pl

const env = fs.readFileSync(new URL('../apps/backend/.env', import.meta.url), 'utf8');
const SECRET = env.match(/^JWT_SECRET=(.*)$/m)[1].trim();
// Role i tak czyta `JwtStrategy` z bazy — token niesie wyłącznie `sub`.
const tokenFor = (sub) => jwt.sign({ sub }, SECRET, { expiresIn: '15m' });

const call = async (path, token) => {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(body)}`);
    return body;
};

let failed = 0;
const check = (label, cond, detail = '') => {
    console.log(`${cond ? '  OK  ' : ' BŁĄD '} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!cond) failed += 1;
};

const OPEN = ['material', 'equipment'];
const zl = (v) => (v ?? 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log(`\n=== Filtr po roli w backendzie (${API}) ===\n`);

const admin = tokenFor(ADMIN_ID);
const logistyk = tokenFor(LOGISTYK_ID);

// ── Porównanie wycena ↔ zakup ────────────────────────────────────────────────
const cmpAdmin = await call(`/orders/${ORDER_ID}/comparison`, admin);
const cmpLog = await call(`/orders/${ORDER_ID}/comparison`, logistyk);
check('porównanie dostępne dla obu ról', cmpAdmin.accepted === true && cmpLog.accepted === true);

const typyAdmin = [...new Set(cmpAdmin.rows.map(r => r.type))];
const typyLog = [...new Set(cmpLog.rows.map(r => r.type))];
check('manager widzi więcej niż materiał i sprzęt', typyAdmin.some(t => !OPEN.includes(t)), typyAdmin.join(', '));
check('logistyk dostaje WYŁĄCZNIE materiał i sprzęt', typyLog.every(t => OPEN.includes(t)), typyLog.join(', ') || 'brak wierszy');
check('logistyk ma mniej wierszy niż manager', cmpLog.rows.length < cmpAdmin.rows.length, `${cmpLog.rows.length} < ${cmpAdmin.rows.length}`);

// KPI muszą pochodzić z wierszy, które rola faktycznie dostała — inaczej suma zdradza
// koszty własne, których w tabeli nie ma.
const sumaWyceny = (rows) => Math.round(rows.reduce((s, r) => s + (r.baseline?.value ?? 0), 0) * 100) / 100;
check('KPI managera liczone z jego wierszy', Math.abs(cmpAdmin.kpi.baselineSum - sumaWyceny(cmpAdmin.rows)) < 0.05, `${zl(cmpAdmin.kpi.baselineSum)} zł`);
check('KPI logistyka liczone z jego wierszy', Math.abs(cmpLog.kpi.baselineSum - sumaWyceny(cmpLog.rows)) < 0.05, `${zl(cmpLog.kpi.baselineSum)} zł`);
check('suma wyceny logistyka niższa od managerskiej', cmpLog.kpi.baselineSum < cmpAdmin.kpi.baselineSum,
    `${zl(cmpLog.kpi.baselineSum)} zł < ${zl(cmpAdmin.kpi.baselineSum)} zł`);
check('pokrycie logistyka liczone po zawężeniu', cmpLog.kpi.coverageTotal <= cmpAdmin.kpi.coverageTotal,
    `${cmpLog.kpi.coveragePriced}/${cmpLog.kpi.coverageTotal} wobec ${cmpAdmin.kpi.coveragePriced}/${cmpAdmin.kpi.coverageTotal}`);

// ── Dziennik wpisów ──────────────────────────────────────────────────────────
const actAdmin = await call(`/leaf-actuals/order/${ORDER_ID}`, admin);
const actLog = await call(`/leaf-actuals/order/${ORDER_ID}`, logistyk);
check('manager widzi wszystkie wpisy zamówienia', actAdmin.length >= actLog.length, `${actAdmin.length} wpisów`);

// Korzenie wpisów widzianych przez logistyka muszą należeć do liści materiał/sprzęt
// z wierszy porównania — to jedyne pozycje, które ta rola w ogóle dostaje.
const korzenieOtwarte = new Set(cmpAdmin.rows.filter(r => OPEN.includes(r.type)).flatMap(r => r.entries.map(e => e.id)));
const idOtwarte = new Set([...korzenieOtwarte]);
check('logistyk nie dostaje wpisów spoza materiału i sprzętu',
    actLog.every(a => idOtwarte.has(a.id)),
    `${actLog.length} wpisów logistyka`);
const ukryte = actAdmin.filter(a => !actLog.some(l => l.id === a.id));
check('wpisy kosztów własnych ukryte przed logistykiem', ukryte.every(a => !idOtwarte.has(a.id)),
    ukryte.length ? `${ukryte.length} ukrytych` : 'brak wpisów na pracy/usłudze w tym zamówieniu');

console.log(`\n${failed === 0 ? '✅ Wszystkie testy przeszły' : `❌ Nieudanych testów: ${failed}`}\n`);
process.exit(failed === 0 ? 0 : 1);
