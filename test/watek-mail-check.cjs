// Test API maili wątków Realizacji (watek-mail) na DEV (backend Docker :3005) kontem claude-test.
// Nie wysyła prawdziwej poczty: claude-test nie ma skrzynki → send musi odpaść z 400.
const API = 'http://localhost:3005/api';
const j = async (method, path, token, body) => {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
(async () => {
  const login = await j('POST', '/auth/login', null, { email: 'claude-test@ignite.test', password: 'BEyE-uNo7p5x' });
  const token = login.body?.access_token || login.body?.accessToken || login.body?.token;
  if (!token) return console.log('login fail', login.status);
  const [orderId, wbsNodeId] = process.argv.slice(2);
  const ctx = await j('GET', `/watek-mail/order/${orderId}/context?wbsNodeId=${wbsNodeId}`, token);
  console.log('context', ctx.status, JSON.stringify({ ...ctx.body, recipients: ctx.body?.recipients?.map(r => `${r.group}:${r.email}`) }));
  const list = await j('GET', `/watek-mail/order/${orderId}`, token);
  console.log('list', list.status, Array.isArray(list.body) ? list.body.length : list.body);
  const noBody = await j('POST', '/watek-mail/send', token, { processNodeId: orderId, wbsNodeId, to: 'a@b.pl', body: '' });
  console.log('send bez skrzynki/treści', noBody.status, noBody.body?.message);
  const badMail = await j('POST', '/watek-mail/send', token, { processNodeId: orderId, wbsNodeId, to: 'zly adres', body: 'x' });
  console.log('send zły adres', badMail.status, badMail.body?.message);
  const check = await j('POST', '/watek-mail/check', token, { processNodeId: orderId });
  console.log('check', check.status, JSON.stringify(check.body));
})();
