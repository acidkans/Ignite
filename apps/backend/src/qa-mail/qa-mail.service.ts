import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
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

// @anchor qa-mail-service
// Pytania z Q&A węzłów WBS wysłane mailem do klienta ze skrzynki firmowej użytkownika
// (domena zamówienia → `UserMailbox`). Kopia idzie do „Wysłane” skrzynki; pary Q&A dostają
// `mailId` / `mailSentAt` / `mailTo`. Klucz `[IGN-…]` i Message-ID posłużą do odbioru odpowiedzi.
@Injectable()
export class QaMailService {
  private readonly logger = new Logger(QaMailService.name);

  constructor(private readonly prisma: PrismaService, private readonly mailboxes: MailboxesService) {}

  // Węzeł procesu zamówienia (type = 'order') nad podanym — jak w OrderRequirementsService.
  private async orderNodeId(nodeId: string) {
    let id: string | null = nodeId;
    for (let i = 0; i < 20 && id; i++) {
      const n = await this.prisma.processNode.findUnique({ where: { id }, select: { id: true, type: true, parentId: true } });
      if (!n) break;
      if (String(n.type || '').toLowerCase() === 'order') return n.id;
      id = n.parentId;
    }
    return nodeId;
  }

  private async orderInfo(processNodeId: string) {
    const orderId = await this.orderNodeId(processNodeId);
    const node = await this.prisma.processNode.findUnique({ where: { id: orderId }, select: { id: true, name: true } });
    if (!node) throw new NotFoundException('Nie ma takiego zamówienia.');
    const req = await this.prisma.orderRequirements.findFirst({
      where: { nodeId: orderId, versionId: null },
      include: { mailDomain: true },
    }) || await this.prisma.orderRequirements.findFirst({
      where: { nodeId: orderId }, orderBy: { updatedAt: 'desc' }, include: { mailDomain: true },
    });
    return { orderId, orderName: node.name, req };
  }

  // @anchor qa-mail-context
  // Dane do okna wysyłki: nadawca (skrzynka w domenie zamówienia albo powód, czemu jej nie ma),
  // podpowiedzi odbiorców (kontakty klienta + PM z „Informacji o zamówieniu”) i dotychczasowe maile.
  async context(userId: string, processNodeId: string) {
    const { orderId, orderName, req } = await this.orderInfo(processNodeId);
    const domain = req?.mailDomain || null;
    let sender: any = null;
    let senderError: string | null = null;
    if (!domain) senderError = 'Zamówienie nie ma ustawionej domeny poczty — wybierz ją w „Informacjach o zamówieniu” (Kontakty).';
    else {
      try {
        const m = await this.mailboxes.senderFor(userId, domain.id);
        sender = { email: m.email, name: await this.mailboxes.senderName(m), verified: !!m.verifiedAt, sentFolder: m.sentFolder, hasSignature: !!m.signatureHtml };
      } catch (e: any) {
        senderError = e?.message || String(e);
      }
    }
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
  // dto: { processNodeId, to, cc?, intro?, questions: [{ wbsNodeId, qaId, question }] }. Pytania czytane
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
    const subject = `[${key}] Pytania do zamówienia ${orderName}${topic}`;
    const intro = String(dto?.intro ?? '').trim()
      || `w związku z zamówieniem „${orderName}” prosimy o odpowiedź na poniższe pytania.`;
    const label = (it: typeof items[number]) => (multiNode && it.nodeName ? it.nodeName + ': ' : '');

    const font = 'font-family:Calibri,Arial,sans-serif;font-size:11pt';
    const closing = 'Prosimy o odpowiedź na tego maila — najlepiej pod każdym pytaniem, z zachowaniem numeracji.';
    const html = `<div style="${font}"><p>Dzień dobry,</p><p>${esc(intro).replace(/\n/g, '<br>')}</p>`
      + `<ol>${items.map(it => `<li style="margin-bottom:6px">${label(it) ? `<b>${esc(label(it))}</b>` : ''}${esc(it.question)}</li>`).join('')}</ol>`
      + `<p>${closing}</p><p>Pozdrawiam</p></div>`
      + (m.signatureHtml ? `<br><div style="${font}">${m.signatureHtml}</div>` : '');
    const text = `Dzień dobry,\n\n${intro}\n\n`
      + items.map((it, i) => `${i + 1}. ${label(it)}${it.question}`).join('\n')
      + `\n\n${closing}\n\nPozdrawiam`;

    const name = await this.mailboxes.senderName(m);
    const built = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail({
      from: { name, address: m.email }, to, cc: cc.length ? cc : undefined,
      subject, html, text, messageId: `<${messageId}>`, attachDataUrls: true,
    });
    const raw = built.message as Buffer;
    try {
      await this.mailboxes.smtpTransport(m).sendMail({ envelope: { from: m.email, to: [...to, ...cc] }, raw });
    } catch (e: any) {
      throw new BadRequestException(`Nie udało się wysłać: ${e?.message || e}`);
    }
    const sentCopyError = await this.mailboxes.appendToSent(m, raw);

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
