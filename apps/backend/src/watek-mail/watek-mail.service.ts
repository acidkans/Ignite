import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { normalizeMailList } from '../qa-mail/qa-mail.service';

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const parseJson = (s: any, fallback: any) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

// @anchor watek-mail-key-re
// „Ref number [IGW-7KQ2MX]” w temacie; prefiks inny niż Q&A (IGN-), więc odbiorniki obu modułów
// nie łapią sobie nawzajem odpowiedzi.
const KEY_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const WATEK_KEY_RE = /IGW-[2-9A-HJ-NP-Z]{6}/;
const newWatekMailKey = () => 'IGW-' + Array.from(randomBytes(6), b => KEY_CHARS[b % KEY_CHARS.length]).join('');

// @anchor temat-bez-klucza
// Temat bez doklejonego klucza (do „Re:” i do wpisu w wątku).
export const tematBezKlucza = (s: string) => String(s || '').replace(/\s*Ref number \[IGW-[A-Z0-9]{6}\]\s*/g, ' ').trim();

// @anchor watek-mail-service
// Maile z wątku gałęzi / pozycji Realizacji — osobny twór obok pytań Q&A (`QaMailService`), ta sama zasada
// wysyłki: skrzynka firmowa użytkownika w domenie zamówienia (`MailboxesService.senderFor`), kopia w „Wysłanych”.
// Każdy wysłany mail = `WatekMail` + wpis czatu wątku (`Comment` typu MAIL_OUT, `wbsNodeId` = węzeł wątku).
@Injectable()
export class WatekMailService {
  private readonly logger = new Logger(WatekMailService.name);

  constructor(private readonly prisma: PrismaService, private readonly mailboxes: MailboxesService) {}

  private async orderInfo(processNodeId: string) {
    const info = await this.mailboxes.orderInfo(processNodeId);
    if (!info) throw new NotFoundException('Nie ma takiego zamówienia.');
    return info;
  }

  private async nodeName(wbsNodeId: string) {
    const n = await this.prisma.wbsNode.findUnique({ where: { id: wbsNodeId }, select: { name: true, shortName: true } });
    return String(n?.shortName || n?.name || '').trim();
  }

  // @anchor watek-mail-context
  // Okno wysyłki: nadawca (albo powód, czemu go nie ma), adresaci do zaznaczenia — kontakty klienta
  // i PM z „Informacji o zamówieniu” oraz zespół zamówienia — domyślny temat i adresaci ostatniego maila wątku.
  async context(userId: string, processNodeId: string, wbsNodeId: string) {
    const { orderId, orderName, req } = await this.orderInfo(processNodeId);
    const { domain, sender, senderError: err } = await this.mailboxes.orderSender(userId, orderId);
    const senderError = domain ? err : 'Zamówienie nie ma ustawionej domeny poczty — wybierz ją w „Informacjach o zamówieniu” (Kontakty).';
    const recipients: { name: string; email: string; company?: string; role?: string; group: 'klient' | 'zespol' }[] = [];
    const push = (r: any, group: 'klient' | 'zespol') => {
      const email = String(r?.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email) || recipients.some(x => x.email === email)) return;
      recipients.push({ name: String(r?.name || '').trim(), email, company: String(r?.company || '').trim() || undefined, role: String(r?.role || '').trim() || undefined, group });
    };
    if (req?.clientProjectManagerEmail) push({ name: req.clientProjectManager, email: req.clientProjectManagerEmail, company: req.clientProjectManagerCompany, role: 'kierownik projektu' }, 'klient');
    for (const c of parseJson(req?.clientContacts, [])) push(c, 'klient');
    const team = await this.prisma.user.findMany({
      where: { isActive: true, id: { not: userId }, teams: { some: { orderNodeId: orderId } } },
      select: { firstName: true, lastName: true, email: true }, orderBy: { firstName: 'asc' },
    });
    for (const u of team) push({ name: [u.firstName, u.lastName].filter(Boolean).join(' '), email: u.email }, 'zespol');

    const last = wbsNodeId ? await this.prisma.watekMail.findFirst({ where: { processNodeId: orderId, wbsNodeId }, orderBy: { sentAt: 'desc' } }) : null;
    const nazwa = wbsNodeId ? await this.nodeName(wbsNodeId) : '';
    return {
      orderId, orderName, nodeName: nazwa,
      domain: domain ? { id: domain.id, domain: domain.domain, label: domain.label } : null,
      sender, senderError, recipients,
      defaultSubject: [orderName, nazwa].filter(Boolean).join(' — '),
      lastTo: last ? parseJson(last.toEmails, []) : [],
      lastCc: last ? parseJson(last.ccEmails, []) : [],
    };
  }

  // @anchor watek-mail-list
  // Maile wątków zamówienia z odpowiedziami — front łączy je z wpisami czatu po `commentId`.
  async list(processNodeId: string) {
    const rows = await this.prisma.watekMail.findMany({
      where: { processNodeId }, orderBy: { sentAt: 'desc' }, take: 300,
      include: { replies: { orderBy: { receivedAt: 'asc' }, select: { id: true, commentId: true, fromEmail: true, fromName: true, subject: true, text: true, receivedAt: true, messageId: true } } },
    });
    // `replyToReplyId` — mail wysłany jako odpowiedź na odpowiedź klienta (`inReplyTo` = jej Message-ID):
    // front składa z tego rozmowę (pierwszy mail → odpowiedzi → kolejne maile) w jednym wpisie wątku.
    const replyByMsgId = new Map(rows.flatMap(m => m.replies.map(r => [r.messageId, r.id] as [string, string])));
    return rows.map(m => ({
      id: m.id, key: m.key, wbsNodeId: m.wbsNodeId, commentId: m.commentId, fromEmail: m.fromEmail, sentById: m.sentById,
      toEmails: parseJson(m.toEmails, []), ccEmails: parseJson(m.ccEmails, []),
      subject: m.subject, temat: tematBezKlucza(m.subject), body: m.body, sentAt: m.sentAt, sentCopyError: m.sentCopyError,
      replyToReplyId: m.inReplyTo ? replyByMsgId.get(m.inReplyTo) || null : null,
      replies: m.replies.map(({ messageId: _m, ...r }) => r),
    }));
  }

  // @anchor watek-mail-send
  // dto: { processNodeId, wbsNodeId, to, cc?, subject?, body, replyToReplyId? }. `replyToReplyId` = odpowiedź
  // na mail klienta: nagłówki In-Reply-To/References (klient widzi jeden wątek), domyślny temat „Re: …”.
  // Klucz `[IGW-…]` zawsze nowy — po nim i po Message-ID odbiornik dopasuje kolejną odpowiedź.
  async send(userId: string, dto: any) {
    const wbsNodeId = String(dto?.wbsNodeId || '');
    if (!wbsNodeId) throw new BadRequestException('Brak węzła wątku.');
    const { orderId, orderName, req } = await this.orderInfo(String(dto?.processNodeId || ''));
    if (!req?.mailDomainId) throw new BadRequestException('Zamówienie nie ma ustawionej domeny poczty — wybierz ją w „Informacjach o zamówieniu”.');
    const m = await this.mailboxes.senderFor(userId, req.mailDomainId);
    const to = normalizeMailList(dto?.to);
    const cc = normalizeMailList(dto?.cc).filter(e => !to.includes(e));
    if (!to.length) throw new BadRequestException('Zaznacz albo wpisz co najmniej jednego adresata.');
    const body = String(dto?.body || '').trim();
    if (!body) throw new BadRequestException('Mail nie ma treści.');

    let inReplyTo: string | null = null;
    let references: string | undefined;
    let tematDomyslny = [orderName, await this.nodeName(wbsNodeId)].filter(Boolean).join(' — ');
    if (dto?.replyToReplyId) {
      const r = await this.prisma.watekMailReply.findUnique({ where: { id: String(dto.replyToReplyId) }, include: { watekMail: true } });
      if (!r) throw new NotFoundException('Nie ma takiej odpowiedzi.');
      inReplyTo = r.messageId;
      references = `<${r.watekMail.messageId}> <${r.messageId}>`;
      const t = tematBezKlucza(r.subject || r.watekMail.subject);
      tematDomyslny = /^(re|odp|aw)\s*:/i.test(t) ? t : `Re: ${t}`;
    }
    const temat = tematBezKlucza(String(dto?.subject || '').trim()) || tematDomyslny;
    const key = newWatekMailKey();
    const messageId = `${key.toLowerCase()}.${Date.now().toString(36)}@${m.domain.domain}`;
    const subject = `${temat} Ref number [${key}]`;
    const font = 'font-family:Calibri,Arial,sans-serif;font-size:11pt';
    const html = `<div style="${font}">${body.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;

    const { sentCopyError } = await this.mailboxes.sendFromMailbox(m, {
      to, cc, subject, html, text: body, messageId: `<${messageId}>`,
      ...(inReplyTo ? { inReplyTo: `<${inReplyTo}>`, references } : {}),
    });

    const comment = await this.prisma.comment.create({
      data: {
        orderId, userId, wbsNodeId, type: 'MAIL_OUT',
        text: `✉️ Mail do: ${to.join(', ')}${cc.length ? ` (DW: ${cc.join(', ')})` : ''}\nTemat: ${temat}\n\n${body}`,
      },
    });
    const mail = await this.prisma.watekMail.create({
      data: {
        key, messageId, processNodeId: orderId, wbsNodeId, mailboxId: m.id, sentById: userId, fromEmail: m.email,
        toEmails: JSON.stringify(to), ccEmails: cc.length ? JSON.stringify(cc) : null,
        subject, body, commentId: comment.id, inReplyTo, sentCopyError,
      },
    });
    this.logger.log(`Mail wątku ${key} z ${m.email} do ${to.join(', ')}${sentCopyError ? ` — bez kopii w Wysłanych: ${sentCopyError}` : ''}`);
    return { mail: { id: mail.id, key, subject, temat, toEmails: to, ccEmails: cc, sentCopyError }, commentId: comment.id };
  }
}
