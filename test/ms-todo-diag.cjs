// Diagnostyka (tylko GET) synchronizacji MS To Do — uruchamiać w kontenerze erp-backend
const { PrismaClient } = require('@prisma/client');
const { createDecipheriv } = require('crypto');
const axios = require('axios');
(async () => {
  const p = new PrismaClient();
  const rec = await p.userMsToken.findFirst({ where: { userId: process.argv[2] } });
  if (rec.expiresAt < new Date()) { console.log('token wygasł — przerwano'); process.exit(0); }
  const key = Buffer.from((process.env.MS_TOKEN_ENCRYPTION_KEY || '').padEnd(32, '0').slice(0, 32));
  const [iv, enc] = rec.accessToken.split(':');
  const d = createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
  const token = Buffer.concat([d.update(Buffer.from(enc, 'hex')), d.final()]).toString();
  const H = { headers: { Authorization: `Bearer ${token}` } };
  const lists = (await axios.get('https://graph.microsoft.com/v1.0/me/todo/lists', { ...H, params: { $top: 200 } })).data.value;
  for (const l of lists) {
    for (const params of [{ $top: 200 }, undefined]) {
      try {
        const r = await axios.get(`https://graph.microsoft.com/v1.0/me/todo/lists/${l.id}/tasks/delta`, { ...H, params });
        console.log('OK ', l.displayName, l.wellknownListName, JSON.stringify(params), r.data.value.length, !!r.data['@odata.nextLink']);
      } catch (e) {
        console.log('ERR', l.displayName, l.wellknownListName, JSON.stringify(params), e.response?.status, JSON.stringify(e.response?.data?.error));
      }
    }
  }
  await p.$disconnect();
})();
