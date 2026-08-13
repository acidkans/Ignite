// Test puli dni urlopowych + statusu wniosku:
// - blokada skladania wniosku bez dostepnych dni
// - zatwierdzenie odejmuje od NAJSTARSZEGO rocznika
// - odrzucenie / cofniecie decyzji oddaje dni
// Uruchomienie: node test/test-leave-balances-status.js <adminId> <managerId> <workerId>
const jwt = require('../apps/backend/node_modules/jsonwebtoken');
const fs = require('fs'), path = require('path');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', 'apps', 'backend', '.env'), 'utf8')
  .split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const API = process.env.API || 'http://127.0.0.1:3001/api', SECRET = env.JWT_SECRET || 'supersecretkey';
const tok = (sub, roles) => jwt.sign({ sub, email: 'test@dev', roles }, SECRET, { expiresIn: '10m' });
const call = async (u, m, url, b, roles) => {
  const r = await fetch(API + url, {
    method: m,
    headers: { Authorization: `Bearer ${tok(u, roles)}`, 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  });
  let d = null; try { d = await r.json(); } catch { }
  return { status: r.status, data: d };
};
const show = (years) => years.map(y => `${y.year}:${y.remainingDays}/${y.entitlementDays}`).join('  ');

(async () => {
  const [admin, manager, worker] = process.argv.slice(2);
  const year = new Date().getUTCFullYear();
  const types = (await call(admin, 'GET', '/leaves/types')).data;
  const wypoczynkowy = types.find(t => t.code === 'WYPOCZYNKOWY');
  console.log('rodzaj urlopu:', wypoczynkowy?.name, '| konsumuje pule:', wypoczynkowy?.consumesBalance);

  console.log('\n0) zerowanie puli pracownika');
  for (let y = year - 4; y <= year; y++) {
    await call(admin, 'PUT', '/leave-balances/entitlement', { userId: worker, year: y, entitlementDays: 0 });
  }
  let bal = (await call(worker, 'GET', '/leave-balances')).data;
  console.log('   saldo:', show(bal.years), '| razem:', bal.totalRemaining);

  console.log('\n1) wniosek bez dostepnych dni — oczekiwane 400');
  const blocked = await call(worker, 'POST', '/leave-requests', {
    leaveTypeId: wypoczynkowy.id, daysCount: 2,
    dateStart: `${year}-09-01T00:00:00.000Z`, dateEnd: `${year}-09-02T23:59:59.000Z`,
  });
  console.log('   status', blocked.status, '|', blocked.data?.message);

  console.log('\n2) admin ustawia pule: rok-2 = 3 dni, rok biezacy = 10 dni');
  await call(admin, 'PUT', '/leave-balances/entitlement', { userId: worker, year: year - 2, entitlementDays: 3 });
  await call(admin, 'PUT', '/leave-balances/entitlement', { userId: worker, year, entitlementDays: 10 });
  bal = (await call(worker, 'GET', '/leave-balances')).data;
  console.log('   saldo:', show(bal.years), '| razem:', bal.totalRemaining);

  console.log('\n3) wniosek na 20 dni ponad pule — oczekiwane 400');
  const tooMuch = await call(worker, 'POST', '/leave-requests', {
    leaveTypeId: wypoczynkowy.id, daysCount: 20,
    dateStart: `${year}-09-01T00:00:00.000Z`, dateEnd: `${year}-09-28T23:59:59.000Z`,
  });
  console.log('   status', tooMuch.status, '|', tooMuch.data?.message);

  console.log('\n4) wniosek na 5 dni — powinien przejsc, status PENDING');
  const created = await call(worker, 'POST', '/leave-requests', {
    leaveTypeId: wypoczynkowy.id, daysCount: 5,
    dateStart: `${year}-09-07T00:00:00.000Z`, dateEnd: `${year}-09-11T23:59:59.000Z`,
    comment: 'wyjazd zagraniczny',
  });
  const id = created.data?.id;
  console.log('   status', created.status, '| status wniosku:', created.data?.status,
    '| migawka salda:', created.data?.remainingY2, '/', created.data?.remainingCurrentYear);

  console.log('\n5) pracownik probuje zatwierdzic sam sobie — oczekiwane 403');
  const selfOk = await call(worker, 'PATCH', `/leave-requests/${id}/decision`, { status: 'APPROVED' });
  console.log('   status', selfOk.status, '|', selfOk.data?.message);

  console.log('\n6) przelozony zatwierdza — 3 dni z roku', year - 2, 'i 2 dni z', year);
  const approved = await call(manager, 'PATCH', `/leave-requests/${id}/decision`, { status: 'APPROVED' });
  console.log('   status', approved.status, '| status wniosku:', approved.data?.status, '| approvedAt:', !!approved.data?.approvedAt);
  bal = (await call(worker, 'GET', '/leave-balances')).data;
  console.log('   saldo:', show(bal.years), '| razem:', bal.totalRemaining);

  console.log('\n7) przelozony odrzuca zatwierdzony wniosek — dni wracaja');
  const rejected = await call(manager, 'PATCH', `/leave-requests/${id}/decision`, { status: 'REJECTED', decisionComment: 'brak obsady' });
  console.log('   status', rejected.status, '| status wniosku:', rejected.data?.status, '| powod:', rejected.data?.decisionComment);
  bal = (await call(worker, 'GET', '/leave-balances')).data;
  console.log('   saldo:', show(bal.years), '| razem:', bal.totalRemaining);

  console.log('\n8) dashboard przelozonego dla podwladnego — lata + flaga akceptacji');
  const dash = await call(manager, 'GET', `/leave-requests/dashboard?userId=${worker}`);
  console.log('   status', dash.status, '| lata:', (dash.data?.balance?.years || []).map(y => y.year).join(','),
    '| razem:', dash.data?.balance?.totalRemaining, '| canDecideSubject:', dash.data?.canDecideSubject);

  console.log('\n9) pracownik nie moze ustawic sobie puli — oczekiwane 403');
  const hack = await call(worker, 'PUT', '/leave-balances/entitlement', { userId: worker, year, entitlementDays: 99 });
  console.log('   status', hack.status, '|', hack.data?.message);

  console.log('\n10) sprzatanie');
  console.log('   usuniecie wniosku:', (await call(admin, 'DELETE', `/leave-requests/${id}`)).status);
})();
