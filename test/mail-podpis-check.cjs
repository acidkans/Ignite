// Test wycinania podpisu z odpowiedzi mailowych (bezPodpisu + bezCytatu) — uruchamiać w kontenerze erp-backend:
// docker exec -i erp-backend node - < test/mail-podpis-check.cjs  (przykład z prod w test/mail-podpis-przyklad.txt podawany przez env)
const { bezPodpisu } = require('./dist/common/mail-podpis.util');
const { bezCytatu } = require('./dist/watek-mail/watek-mail-replies.service');
const przyp = [
  process.env.PROD || '',
  'Dzień dobry,\nmontaż w czwartek OK.\n\nPozdrawiam\nJan Kowalski\nFirma X sp. z o.o.\ntel. 600 100 200',
  'Potwierdzam termin.\n\nZ poważaniem,\nAnna Nowak',
  'Ok, bierzemy wariant B.\n--\nJan\n+48 600 100 200',
  'Tak, zgoda.\n\nJan Kowalski\nTel. +48 600 100 200\nul. Długa 5, 00-001 Warszawa\nwww.firma.pl',
  'Dzięki za info, a jaki termin dostawy?\nCzekam na odpowiedź.',
  'Best regards',
  'Sounds good.\n\nSent from my iPhone',
];
for (const t of przyp) console.log(JSON.stringify(bezPodpisu(bezCytatu(t))));
