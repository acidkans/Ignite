// Scenariusz zgłoszony przy zakładce „Realizacja": pozycję rozliczam, a potem kasuję jej wpis.
// Zostawała pozycja bez ani jednego zdarzenia, ale ze znacznikiem `realizationClosed` — pasek
// pokazywał pełne wykonanie, a kolumna „Δ ilość" MINUS CAŁY PLAN. Test przechodzi tę drogę
// po API i sprawdza stan po każdym kroku, łącznie z regułą, którą stosuje frontend
// (`realization-reopen-on-empty`): usunięcie OSTATNIEGO wpisu zdejmuje znacznik rozliczenia.
//
// Sprząta po sobie: kasuje własny wpis i przywraca `realizationClosed` sprzed testu.
//
//   node test/test-realization-close-delete.mjs
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

// Te same reguły co w `realizationShared.js` / `RealizationRow` — liczone tu ręcznie, żeby test
// nie ciągnął modułów frontendu (lucide-react, JSX).
const wbsRootOf = (n) => n.sourceWbsNodeId || n.id;
const sumQty = (entries) => Math.round(entries.reduce((s, e) => s + (Number(e.qty) || 0), 0) * 1000) / 1000;
// @anchor realization-delta-qty-rule — to, co widać w kolumnie „Δ ilość": „—" gdy nie ma o czym
// mówić (zero różnicy albo zero wpisów na pozycji nierozliczonej), inaczej liczba ze znakiem.
const deltaCell = (node, entries) => {
    const qty = sumQty(entries);
    const plan = Number(node.quantity) || 0;
    const d = Math.round((qty - plan) * 1000) / 1000;
    if (Math.abs(d) < 1e-9 || (qty === 0 && !node.realizationClosed)) return '—';
    return `${d > 0 ? '+' : ''}${d} ${node.unit || 'szt'}`;
};

const nodesOf = async () => (await call(`/wbs-nodes/unified/${ORDER_ID}`)).items || [];
const actualsOf = async () => call(`/leaf-actuals/order/${ORDER_ID}`);

console.log(`\n=== Rozliczenie → usunięcie wpisu (${API}) ===\n`);

let target = null;
let closedBefore = false;
let createdId = null;

try {
    // ── 1. Pozycja startowa: liść kosztowy BEZ wpisów ────────────────────────
    const nodes = await nodesOf();
    const actuals0 = await actualsOf();
    const zajete = new Set(actuals0.map(a => a.wbsRootId));
    target = nodes.find(n => ['material', 'equipment'].includes(n.type) && (Number(n.quantity) || 0) > 0 && !zajete.has(wbsRootOf(n)));
    check('jest liść kosztowy bez wpisów do testu', !!target, target ? `„${target.name}" plan ${target.quantity} ${target.unit || 'szt'}` : 'brak');
    if (!target) throw new Error('brak pozycji do testu');
    closedBefore = !!target.realizationClosed;
    check('Δ ilość pustej pozycji to „—"', deltaCell(target, []) === '—', deltaCell(target, []));

    // ── 2. Wpis realizacji ───────────────────────────────────────────────────
    const created = await call('/leaf-actuals', {
        method: 'POST',
        body: JSON.stringify({ wbsNodeId: target.id, qty: 1, unitCost: 99, comment: 'TEST rozliczenie+usunięcie', docNumber: 'TEST/CLOSE', scope: 'TEST zakres wykonania' }),
    });
    createdId = created.id;
    const poWpisie = (await actualsOf()).filter(a => a.wbsRootId === wbsRootOf(target));
    check('wpis zapisany na pozycji', poWpisie.length === 1, `qty=${poWpisie[0]?.qty} × ${poWpisie[0]?.unitCost} zł`);
    // `scope` — jedno pole „zakres" dla liści bez karty produktowej; API musi je zapisać i oddać
    // w liście zamówienia, bo z niej korzysta i zakładka, i wyszukiwarka.
    check('pole `scope` zapisane i zwrócone przez API', poWpisie[0]?.scope === 'TEST zakres wykonania', String(poWpisie[0]?.scope));
    const poEdycji = await call(`/leaf-actuals/${createdId}`, { method: 'PATCH', body: JSON.stringify({ scope: 'TEST zakres po zmianie' }) });
    check('PATCH zmienia `scope`', poEdycji.scope === 'TEST zakres po zmianie', String(poEdycji.scope));
    check('koszt całkowity zakupu = ilość × koszt jedn.', Math.abs(poWpisie[0].qty * poWpisie[0].unitCost - 99) < 0.005, '99,00 zł');

    // ── 3. „Rozlicz" mimo niedowykonania planu ───────────────────────────────
    await call(`/leaf-actuals/close/${target.id}`, { method: 'PATCH', body: JSON.stringify({ closed: true }) });
    const poRozliczeniu = (await nodesOf()).find(n => n.id === target.id);
    check('pozycja oznaczona jako rozliczona', poRozliczeniu.realizationClosed === true);

    // ── 4. Usunięcie JEDYNEGO wpisu — moment, w którym pojawiał się błąd ─────
    await call(`/leaf-actuals/${createdId}`, { method: 'DELETE' });
    createdId = null;
    const poUsunieciu = (await actualsOf()).filter(a => a.wbsRootId === wbsRootOf(target));
    check('wpis usunięty', poUsunieciu.length === 0);
    check('BEZ zdjęcia znacznika Δ ilość byłaby ujemna', deltaCell({ ...target, realizationClosed: true }, []) === `-${target.quantity} ${target.unit || 'szt'}`,
        deltaCell({ ...target, realizationClosed: true }, []));

    // ── 5. Reguła frontendu: ostatni wpis znika → znacznik rozliczenia znika ─
    for (const n of (await nodesOf()).filter(n => n.realizationClosed && wbsRootOf(n) === wbsRootOf(target))) {
        await call(`/leaf-actuals/close/${n.id}`, { method: 'PATCH', body: JSON.stringify({ closed: false }) });
    }
    const poWznowieniu = (await nodesOf()).find(n => n.id === target.id);
    check('znacznik „rozliczone" zdjęty', poWznowieniu.realizationClosed === false);
    check('Δ ilość wraca do „—", nie pokazuje wartości ujemnej', deltaCell(poWznowieniu, []) === '—', deltaCell(poWznowieniu, []));
} catch (e) {
    check('przebieg testu bez wyjątku', false, e.message);
} finally {
    // ── Sprzątanie ───────────────────────────────────────────────────────────
    if (createdId) { try { await call(`/leaf-actuals/${createdId}`, { method: 'DELETE' }); } catch (e) { console.error('  sprzątanie wpisu:', e.message); } }
    if (target) {
        try {
            const teraz = (await nodesOf()).find(n => n.id === target.id);
            if (teraz && !!teraz.realizationClosed !== closedBefore) {
                await call(`/leaf-actuals/close/${target.id}`, { method: 'PATCH', body: JSON.stringify({ closed: closedBefore }) });
            }
            const rest = (await actualsOf()).filter(a => a.docNumber === 'TEST/CLOSE');
            check('baza posprzątana (zero wpisów testowych)', rest.length === 0);
        } catch (e) { console.error('  sprzątanie pozycji:', e.message); }
    }
}

console.log(`\n${failed === 0 ? '✅ Wszystkie testy przeszły' : `❌ Nieudanych testów: ${failed}`}\n`);
process.exit(failed === 0 ? 0 : 1);
