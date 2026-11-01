import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { cleanQaPair } from '../wbs-nodes/wbs-nodes.service';

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const parseJson = (s: any, fallback: any) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

// @anchor normalize-mail-list
// „a@x.pl; B@Y.pl, a@x.pl” → ['a@x.pl', 'b@y.pl']. Błędny adres = BadRequest z tym adresem.
export const normalizeMailList = (v: any): string[] => {
  const raw = Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/);
  const out: string[] = [];
  for (const x of raw) {
    const e = String(x || '').trim().toLowerCase();
    if (!e) continue;
    if (!EMAIL_RE.test(e)) throw new BadRequestException(`Niepoprawny adres e-mail: ${e}`);
    if (!out.includes(e)) out.push(e);
  }
  return out;
};

// @anchor new-qa-mail-key
// Klucz w temacie: „IGN-” + 6 znaków bez mylących (0/O, 1/I/L).
const KEY_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const newQaMailKey = () => 'IGN-' + Array.from(randomBytes(6), b => KEY_CHARS[b % KEY_CHARS.length]).join('');

// @anchor qa-mail-texts
// Stałe teksty maila z pytaniami w dwóch językach (`dto.lang` = 'pl' | 'en').
const QA_MAIL_TEXTS = {
  pl: {
    subject: 'Pytania do zamówienia',
    greeting: 'Dzień dobry,',
    intro: (order: string) => `w związku z zamówieniem „${order}” prosimy o odpowiedź na poniższe pytania.`,
    closing: 'Prosimy o odpowiedź na tego maila — najlepiej pod każdym pytaniem, z zachowaniem numeracji.',
    regards: 'Pozdrawiam',
  },
  en: {
    subject: 'Questions regarding order',
    greeting: 'Hello,',
    intro: (order: string) => `With regard to the order "${order}", we kindly ask you to answer the questions below.`,
    closing: 'Please reply to this email — ideally below each question, keeping the numbering.',
    regards: 'Kind regards',
  },
};

// @anchor qa-mail-service
// Pytania z Q&A węzłów WBS wysłane mailem do klienta ze skrzynki firmowej użytkownika
// (domena zamówienia → `UserMailbox`). Kopia idzie do „Wysłane” skrzynki; pary Q&A dostają
// `mailId` / `mailSentAt` / `mailTo`. Klucz `[IGN-…]` i Message-ID posłużą do odbioru odpowiedzi.
@Injectable()
export class QaMailService {
  private readonly logger = new Logger(QaMailService.name);

  constructor(private readonly prisma: PrismaService, private readonly mailboxes: MailboxesService) {}

  // Zamówienie nad węzłem i jego „Informacje o zamówieniu” (wspólne z eksportami — MailboxesService).
  private async orderInfo(processNodeId: string) {
    const info = await this.mailboxes.orderInfo(processNodeId);
    if (!info) throw new NotFoundException('Nie ma takiego zamówienia.');
    return info;
  }

  // @anchor qa-mail-context
  // Dane do okna wysyłki: nadawca (skrzynka w domenie zamówienia albo powód, czemu jej nie ma),
  // podpowiedzi odbiorców (kontakty klienta + PM z „Informacji o zamówieniu”) i dotychczasowe maile.
  async context(userId: string, processNodeId: string) {
    const { orderId, orderName, req } = await this.orderInfo(processNodeId);
    const { domain, sender, senderError: err } = await this.mailboxes.orderSender(userId, orderId);
    const senderError = domain ? err : 'Zamówienie nie ma ustawionej domeny poczty — wybierz ją w „Informacjach o zamówieniu” (Kontakty).';
    const recipients: { name: string; email: string; company?: string; role?: string }[] = [];
    const push = (r: any) => {
      const email = String(r?.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email) || recipients.some(x => x.email === email)) return;
      recipients.push({ name: String(r?.name || '').trim(), email, company: String(r?.company || '').trim() || undefined, role: String(r?.role || '').trim() || undefined });
    };
    if (req?.clientProjectManagerEmail) push({ name: req.clientProjectManager, email: req.clientProjectManagerEmail, company: req.clientProjectManagerCompany, role: 'kierownik projektu' });
    for (const c of parseJson(req?.clientContacts, [])) push(c);
    const mails = await this.prisma.qaMail.findMany({ where: { processNodeId: orderId }, orderBy: { sentAt: 'desc' }, take: 50 });
    return {
      orderId, orderName,
      domain: domain ? { id: domain.id, domain: domain.domain, label: domain.label } : null,
      sender, senderError, recipients,
      mails: mails.map(m => this.publicMail(m)),
    };
  }

  private publicMail(m: any) {
    return { ...m, toEmails: parseJson(m.toEmails, []), ccEmails: parseJson(m.ccEmails, []), items: parseJson(m.items, []) };
  }

  // @anchor qa-mail-send
  // dto: { processNodeId, to, cc?, intro?, lang? ('pl' | 'en'), questions: [{ wbsNodeId, qaId, question }] }. Pytania czytane
  // z bazy (nie z body) — wysyła się to, co zapisane. Starsze pary nie mają w bazie `id` (cleanQaPair
  // nadaje je losowo przy każdym odczycie), więc gdy id się nie zgadza, para szukana jest po treści pytania;
  // przy zapisie znacznika mailowego taka para dostaje w bazie stałe id. Raw MIME budowany raz (streamTransport, obrazki podpisu
  // jako CID), wysłany przez SMTP i ten sam dołożony do „Wysłane”.
  async send(userId: string, dto: any) {
    const { orderId, orderName, req } = await this.orderInfo(String(dto?.processNodeId || ''));
    if (!req?.mailDomainId) throw new BadRequestException('Zamówienie nie ma ustawionej domeny poczty — wybierz ją w „Informacjach o zamówieniu”.');
    const m = await this.mailboxes.senderFor(userId, req.mailDomainId);
    const to = normalizeMailList(dto?.to);
    const cc = normalizeMailList(dto?.cc).filter(e => !to.includes(e));
    if (!to.length) throw new BadRequestException('Podaj co najmniej jednego odbiorcę.');

    const wanted: { wbsNodeId: string; qaId: string; question: string }[] = (Array.isArray(dto?.questions) ? dto.questions : [])
      .map((q: any) => ({ wbsNodeId: String(q?.wbsNodeId || ''), qaId: String(q?.qaId || ''), question: String(q?.question || '') }))
      .filter((q: any) => q.wbsNodeId && q.qaId);
    if (!wanted.length) throw new BadRequestException('Zaznacz co najmniej jedno pytanie.');
    const nodeIds = [...new Set(wanted.map(q => q.wbsNodeId))];
    const nodes = await this.prisma.wbsNode.findMany({ where: { id: { in: nodeIds } }, select: { id: true, name: true, qa: true } });
    const byId = new Map(nodes.map(n => [n.id, { ...n, qaList: (parseJson(n.qa, []) as any[]).map(cleanQaPair) }]));
    const norm = (t: any) => String(t || '').trim().toLowerCase();
    const items: { wbsNodeId: string; qaId: string; question: string; nodeName: string; clientQaId: string }[] = [];
    for (const w of wanted) {
      const n = byId.get(w.wbsNodeId);
      const p = n?.qaList.find((x: any) => x.id === w.qaId)
        || n?.qaList.find((x: any) => norm(x.question) && norm(x.question) === norm(w.question) && !items.some(i => i.wbsNodeId === n.id && i.qaId === x.id));
      if (!n || !p || !p.question.trim()) continue;
      items.push({ wbsNodeId: n.id, qaId: p.id!, question: p.question.trim(), nodeName: (n.name || '').trim(), clientQaId: w.qaId });
    }
    if (!items.length) throw new BadRequestException('Zaznaczonych pytań nie ma już w Q&A — odśwież widok.');

    const key = newQaMailKey();
    const messageId = `${key.toLowerCase()}.${Date.now().toString(36)}@${m.domain.domain}`;
    const multiNode = new Set(items.map(i => i.wbsNodeId)).size > 1;
    const short = (t: string) => (t.length > 60 ? t.slice(0, 57).trimEnd() + '…' : t);
    const topic = multiNode || !items[0].nodeName ? '' : ` — ${short(items[0].nodeName)}`;
    // Język stałych tekstów maila (temat, powitanie, zamknięcie). Pytania idą tak, jak je wpisano.
    const t = QA_MAIL_TEXTS[dto?.lang === 'en' ? 'en' : 'pl'];
    const subject = `${t.subject} ${orderName}${topic} Ref number [${key}]`;
    const intro = String(dto?.intro ?? '').trim() || t.intro(orderName);
    const label = (it: typeof items[number]) => (multiNode && it.nodeName ? it.nodeName + ': ' : '');

    const font = 'font-family:Calibri,Arial,sans-serif;font-size:11pt';
    const html = `<div style="${font}"><p>${t.greeting}</p><p>${esc(intro).replace(/\n/g, '<br>')}</p>`
      + `<ol>${items.map(it => `<li style="margin-bottom:6px">${label(it) ? `<b>${esc(label(it))}</b>` : ''}${esc(it.question)}</li>`).join('')}</ol>`
      + `<p>${t.closing}</p><p>${t.regards}</p></div>`;
    const text = `${t.greeting}\n\n${intro}\n\n`
      + items.map((it, i) => `${i + 1}. ${label(it)}${it.question}`).join('\n')
      + `\n\n${t.closing}\n\n${t.regards}`;

    const { sentCopyError } = await this.mailboxes.sendFromMailbox(m, { to, cc, subject, html, text, messageId: `<${messageId}>` });

    const mail = await this.prisma.qaMail.create({
      data: {
        key, messageId, processNodeId: orderId, mailboxId: m.id, sentById: userId, fromEmail: m.email,
        toEmails: JSON.stringify(to), ccEmails: cc.length ? JSON.stringify(cc) : null,
        subject, items: JSON.stringify(items.map(({ clientQaId: _c, ...it }) => it)), sentCopyError,
      },
    });

    // Znacznik „wysłane mailem” na parach — zapis od razu w bazie, odpowiedź zwraca zaktualizowane listy.
    const sentAt = mail.sentAt.toISOString();
    const mailTo = to.join(', ');
    const updatedNodes: { id: string; qa: any[] }[] = [];
    // Pary bez stałego id w bazie: dopasowanie po treści i zapis z id, które wysłano w mailu.
    for (const nodeId of new Set(items.map(i => i.wbsNodeId))) {
      const fresh = await this.prisma.wbsNode.findUnique({ where: { id: nodeId }, select: { qa: true } });
      const raw = parseJson(fresh?.qa, []) as any[];
      const mine = items.filter(i => i.wbsNodeId === nodeId);
      const used = new Set<string>();
      const qa = raw.map((r: any) => {
        const hit = mine.find(i => !used.has(i.qaId) && (r?.id ? r.id === i.qaId : norm(r?.question) === norm(i.question)));
        if (!hit) return cleanQaPair(r);
        used.add(hit.qaId);
        return { ...cleanQaPair({ ...r, id: hit.qaId }), mailId: mail.id, mailSentAt: sentAt, mailTo };
      });
      await this.prisma.wbsNode.update({ where: { id: nodeId }, data: { qa: JSON.stringify(qa) } });
      // clientQaId — id pary w stanie frontu (mogło być nadane losowo przy odczycie).
      updatedNodes.push({ id: nodeId, qa, sent: mine.map(i => ({ clientQaId: i.clientQaId, qaId: i.qaId })) } as any);
    }
    this.logger.log(`Pytania ${key} (${items.length}) wysłane z ${m.email} do ${mailTo}${sentCopyError ? ` — bez kopii w Wysłanych: ${sentCopyError}` : ''}`);
    return { mail: this.publicMail(mail), nodes: updatedNodes };
  }
}
