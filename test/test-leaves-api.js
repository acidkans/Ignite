// Test API modułu Urlopy — podpisuje lokalny token dev i sprawdza access/scope + CRUD.
// Uruchomienie: node test/test-leaves-api.js
const jwt = require('../apps/backend/node_modules/jsonwebtoken');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'apps', 'backend', '.env');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const API = 'http://127.0.0.1:3005/api';
const SECRET = env.JWT_SECRET || 'supersecretkey';
const token = (sub) => jwt.sign({ sub, email: 'test@dev' }, SECRET, { expiresIn: '10m' });

const call = async (userId, method, url, body) => {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token(userId)}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};

(async () => {
  const [adminId, managerId, userId] = process.argv.slice(2);

  console.log('--- ADMIN access ---');
  console.log(JSON.stringify((await call(adminId, 'GET', '/leaves/access')).data));

  console.log('--- typy urlopu ---');
  const types = (await call(adminId, 'GET', '/leaves/types')).data;
  console.log(types.map(t => `${t.code}=${t.name}`).join(' | '));

  console.log('--- MANAGER access ---');
  console.log(JSON.stringify((await call(managerId, 'GET', '/leaves/access')).data));
  console.log('--- USER access ---');
  console.log(JSON.stringify((await call(userId, 'GET', '/leaves/access')).data));

  console.log('--- ADMIN tworzy wpis dla USER ---');
  const created = await call(adminId, 'POST', '/leaves', {
    userId,
    leaveTypeId: types[0].id,
    dateFrom: '2026-08-17',
    dateTo: '2026-08-21',
    note: 'test automatyczny',
  });
  console.log(created.status, JSON.stringify(created.data).slice(0, 220));

  const leaveId = created.data?.id;

  console.log('--- USER widzi swój wpis ---');
  const asUser = await call(userId, 'GET', `/leaves?leaveTypeId=${types[0].id}`);
  console.log(asUser.status, 'wpisów:', Array.isArray(asUser.data) ? asUser.data.length : asUser.data);

  console.log('--- USER próbuje edytować (spodziewane 403) ---');
  const denied = await call(userId, 'PATCH', `/leaves/${leaveId}`, { note: 'hack' });
  console.log(denied.status, JSON.stringify(denied.data).slice(0, 140));

  console.log('--- ADMIN edytuje daysCount ---');
  const patched = await call(adminId, 'PATCH', `/leaves/${leaveId}`, { daysCount: 3 });
  console.log(patched.status, 'daysCount =', patched.data?.daysCount);

  console.log('--- sprzątanie ---');
  console.log((await call(adminId, 'DELETE', `/leaves/${leaveId}`)).status);
})();
