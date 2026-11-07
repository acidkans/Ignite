// Symulacja załączników maili wątku (DEV, bez prawdziwej skrzynki). Uruchomienie:
//   docker cp test/watek-mail-zal-sim.cjs erp-backend:/tmp/ && docker cp <pliki> erp-backend:/tmp/zal/
//   docker exec -w /usr/src/app erp-backend node /tmp/watek-mail-zal-sim.cjs [cleanup]
// 1) wgrywa duży PNG i PDF przez POST /api/watek-mail/order/:id/zalaczniki (konto claude-test),
// 2) WatekMailService.send z atrapą skrzynki — MIME budowany nodemailerem, sprawdzamy CID obrazka i załącznik PDF,
// 3) odpowiedź klienta z dużym obrazkiem w treści, małym logo w stopce i PDF-em → store(); logo ma odpaść.
const fs = require('fs');
const { PrismaClient } = require('/usr/src/app/node_modules/@prisma/client');
const nodemailer = require('/usr/src/app/node_modules/nodemailer');
const { WatekMailService } = require('/usr/src/app/dist/watek-mail/watek-mail.service');
const { WatekMailRepliesService } = require('/usr/src/app/dist/watek-mail/watek-mail-replies.service');

const ORDER = 'b2f98d11-2d35-47db-ac3a-96803637973f';
const NODE = 'ce37ea79-dfdd-42b0-8a72-8d84532454ba';
const API = 'http://127.0.0.1:3000/api';
const prisma = new PrismaClient();
const mime = async (opts) => (await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(opts)).message;

(async () => {
  if (process.argv[2] === 'cleanup') {
    const ms = await prisma.watekMail.findMany({ where: { key: { startsWith: 'IGW-' }, body: { contains: '[SIM-ZAL]' } }, include: { replies: true } });
    const cids = ms.flatMap(m => [m.commentId, ...m.replies.map(r => r.commentId)]).filter(Boolean);
    await prisma.watekMail.deleteMany({ where: { id: { in: ms.map(m => m.id) } } });
    await prisma.comment.deleteMany({ where: { id: { in: cids } } });
    console.log('usunięto', ms.length, 'maili i', cids.length, 'wpisów');
    return;
  }
  const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'claude-test@ignite.test', password: 'BEyE-uNo7p5x' }) })).json();
  const token = login.access_token || login.accessToken || login.token;
  const up = async (file, name, type) => {
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(file)], { type }), name);
    const r = await fetch(`${API}/watek-mail/order/${ORDER}/zalaczniki`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    return r.json();
  };
  const png = await up('/tmp/zal/duzy.png', 'zrzut-ekranu.png', 'image/png');
  const pdf = await up('/tmp/zal/oferta.pdf', 'Oferta łóżka.pdf', 'application/pdf');
  const exe = await fetch(`${API}/watek-mail/order/${ORDER}/zalaczniki`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: (() => { const f = new FormData(); f.append('file', new Blob(['x']), 'wirus.exe'); return f; })() });
  console.log('upload', png, pdf, 'exe→', exe.status);
  const dl = await fetch(`${API}/watek-mail/zalaczniki/${pdf.fileName}?name=${encodeURIComponent(pdf.name)}`, { headers: { Authorization: `Bearer ${token}` } });
  console.log('download', dl.status, dl.headers.get('content-type'), dl.headers.get('content-disposition'));

  const user = await prisma.user.findUnique({ where: { email: 'claude-test@ignite.test' } });
  let raw = null;
  const fakeMailboxes = {
    orderInfo: async () => ({ orderId: ORDER, orderName: 'DURR', req: { mailDomainId: 'sim' } }),
    senderFor: async () => ({ id: null, email: 'claude-test@ignite.test', domain: { domain: 'gigatel.test' } }),
    sendFromMailbox: async (_m, mail) => { raw = await mime({ from: 'claude-test@ignite.test', ...mail }); return { sentCopyError: null }; },
  };
  const sent = await new WatekMailService(prisma, fakeMailboxes).send(user.id, {
    processNodeId: ORDER, wbsNodeId: NODE, to: 'klient@example.com', subject: 'Biurka — zdjęcie',
    body: 'Dzień dobry, w załączniku zrzut i oferta. [SIM-ZAL]', attachments: [png, pdf],
  });
  const { simpleParser } = require('/usr/src/app/node_modules/mailparser');
  const p = await simpleParser(raw);
  console.log('send', sent.mail.key, 'img w treści:', /<img src="cid:zal0@ignite"/.test(p.html || '') || /data:image\/png/.test(p.html || ''),
    'załączniki:', p.attachments.map(a => `${a.filename} [${a.contentDisposition}${a.cid ? ' cid=' + a.cid : ''}]`).join(', '));

  const mail = await prisma.watekMail.findUnique({ where: { id: sent.mail.id } });
  const reply = await mime({
    from: 'Jan Klient <klient@example.com>', to: 'claude-test@ignite.test', subject: `RE: ${mail.subject}`,
    messageId: `<sim-zal.${Date.now()}@example.com>`, inReplyTo: `<${mail.messageId}>`,
    text: 'Dzięki, odsyłam poprawiony rysunek.\n\nPozdrawiam\nJan Klient\ntel. 600 100 200',
    html: '<p>Dzięki, odsyłam poprawiony rysunek.</p><p><img src="cid:rys1"></p><p>Pozdrawiam<br>Jan Klient<br><img src="cid:logo"></p>',
    attachments: [
      { filename: 'image001.png', path: '/tmp/zal/duzy.png', cid: 'rys1' },
      { filename: 'image002.png', path: '/tmp/zal/logo.png', cid: 'logo' },
      { filename: 'Rysunek.pdf', path: '/tmp/zal/oferta.pdf' },
    ],
  });
  const fake = { create: async () => {}, sendToUser: async () => {} };
  const svc = new WatekMailRepliesService(prisma, fake, fake);
  await svc.store({ id: mail.id, processNodeId: ORDER, wbsNodeId: NODE, sentById: user.id }, 'header', reply);
  const r = await prisma.watekMailReply.findFirst({ where: { watekMailId: mail.id } });
  console.log('reply attachments', r.attachments);
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
