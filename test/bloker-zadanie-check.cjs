// Weryfikacja na DEV: bloker tworzy zadanie, zamknięcie zadania zamyka bloker, usunięcie blokera zabiera zadanie.
// node test/bloker-zadanie-check.cjs <processNodeId> <wbsNodeId>
const API = 'http://localhost:3005/api';
const [order, wbs] = process.argv.slice(2);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  let token;
  for (let i = 0; i < 40 && !token; i++) {
    try {
      const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'claude-test@ignite.test', password: 'BEyE-uNo7p5x' }) });
      if (r.ok) token = (await r.json()).access_token;
    } catch { /* backend jeszcze wstaje */ }
    if (!token) await sleep(3000);
  }
  if (!token) throw new Error('brak logowania');
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const j = async (m, u, b) => { const r = await fetch(API + u, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${u} ${r.status} ${t}`); return t ? JSON.parse(t) : null; };
  const zadanie = async (cid) => (await j('GET', `/my-tasks/project/${order}?status=ALL`)).find(t => t.constraintId === cid);

  const c = await j('POST', `/constraints/order/${order}`, { wbsNodeId: wbs, title: 'TEST bloker→zadanie', kind: 'TECH', dueAt: '2026-11-20' });
  let t = await zadanie(c.id);
  console.log('1. zadanie po utworzeniu blokera:', t ? `${t.title} / ${t.status} / ${t.plannedEnd}` : 'BRAK');

  await j('PATCH', `/my-tasks/${t.id}`, { status: 'DONE' });
  let k = (await j('GET', `/constraints/order/${order}`)).find(x => x.id === c.id);
  console.log('2. bloker po zamknięciu zadania:', k.status);

  await j('PATCH', `/constraints/${c.id}`, { status: 'OPEN', title: 'TEST bloker→zadanie (zmiana)' });
  t = await zadanie(c.id);
  console.log('3. zadanie po ponownym otwarciu blokera:', t.status, '|', t.title);

  await j('PATCH', `/constraints/${c.id}`, { status: 'CLOSED' });
  t = await zadanie(c.id);
  console.log('4. zadanie po zamknięciu blokera:', t.status);

  await j('DELETE', `/constraints/${c.id}`);
  t = await zadanie(c.id);
  console.log('5. zadanie po usunięciu blokera:', t ? 'NADAL JEST' : 'usunięte');
})().catch(e => { console.error('BŁĄD', e.message); process.exit(1); });
