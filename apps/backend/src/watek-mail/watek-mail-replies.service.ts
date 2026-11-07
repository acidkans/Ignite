import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { decryptSecret } from '../common/secret-crypto.util';
import { WATEK_KEY_RE, tematBezKlucza } from './watek-mail.service';
import { bezPodpisu } from '../common/mail-podpis.util';
import { ZAL_MAX_BYTES, czyZakazany, zapiszBufor } from './zalaczniki.storage';

// mailparser nie ma typów — tylko simpleParser.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { simpleParser } = require('mailparser');

const stripId = (s: any) => String(s || '').trim().replace(/^<|>$/g, '');
const headerIds = (v: string) => (String(v || '').match(/<[^<>\s]+>/g) || []).map(stripId);
const ACTIVE_DAYS = 120;
const MAX_TEXT = 30000;

// @anchor watek-mail-bez-cytatu
// Treść odpowiedzi do wątku: ucina cytowany oryginał (linie „>”, „W dniu … napisał”, „On … wrote:”,
// blok „Od:/From:”, „-----Original Message-----”, kreska Outlooka). Pusty wynik → cała treść.
export const bezCytatu = (t: string) => {
  const lines = String(t || '').replace(/\r/g, '').split('\n');
  const stop = /^(>|-{2,}\s*(original message|wiadomość oryginalna|oryginalna wiadomość)|_{10,}|(od|from|wysłano|sent)\s*:|w dniu .+napisał|dnia .+napisał|on .+wrote:?$)/i;
  const out: string[] = [];
  for (const l of lines) {
    if (stop.test(l.trim())) break;
    out.push(l);
  }
  const s = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return s || String(t || '').trim();
};

// @anchor watek-mail-replies-service
// Odbiór odpowiedzi na maile wątków (`WatekMail`) z INBOX skrzynki nadawcy — tylko do odczytu, osobny kursor
// `UserMailbox.watekImapLastUid` (niezależny od Q&A). Dopasowanie: In-Reply-To/References = Message-ID, potem
// klucz `[IGW-…]` z tematu. Każda nowa odpowiedź od razu trafia do wątku (`Comment` MAIL_IN) + powiadomienie zespołu.
@Injectable()
export class WatekMailRepliesService {
  private readonly logger = new Logger(WatekMailRepliesService.name);
  private readonly busy = new Set<string>();

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService, private readonly push: PushService) {}

  // @anchor watek-mail-replies-poll-active
  // Cron: skrzynki, z których w ostatnich ACTIVE_DAYS wysłano maile wątków.
  async pollActive() {
    const since = new Date(Date.now() - ACTIVE_DAYS * 86_400_000);
    const rows = await this.prisma.watekMail.findMany({ where: { sentAt: { gte: since }, mailboxId: { not: null } }, select: { mailboxId: true }, distinct: ['mailboxId'] });
    let found = 0;
    for (const r of rows) {
      try { found += (await this.pollMailbox(r.mailboxId!)).found; }
      catch (e: any) { this.logger.warn(`Odbiór odpowiedzi wątków (${r.mailboxId}): ${e?.message || e}`); }
    }
    return found;
  }

  // @anchor watek-mail-replies-check-order
  // „Sprawdź pocztę” w wątku: skrzynki, z których szły maile wątków zamówienia.
  async checkOrder(processNodeId: string) {
    const rows = await this.prisma.watekMail.findMany({ where: { processNodeId, mailboxId: { not: null } }, select: { mailboxId: true }, distinct: ['mailboxId'] });
    let found = 0;
    const errors: string[] = [];
    for (const r of rows) {
      try { found += (await this.pollMailbox(r.mailboxId!)).found; }
      catch (e: any) { errors.push(e?.message || String(e)); }
    }
    return { found, errors };
  }

  // @anchor watek-mail-replies-poll-mailbox
  // Jeden przebieg po skrzynce. Pierwszy raz (albo po zmianie UIDVALIDITY) szuka od dnia przed najstarszym
  // wysłanym mailem wątku; później tylko UID większe niż zapamiętany w `watekImapLastUid`.
  async pollMailbox(mailboxId: string): Promise<{ found: number }> {
    if (this.busy.has(mailboxId)) return { found: 0 };
    this.busy.add(mailboxId);
    try {
      const m = await this.prisma.userMailbox.findUnique({ where: { id: mailboxId }, include: { domain: true } });
      if (!m) return { found: 0 };
      if (!m.password || !m.domain.imapHost) throw new BadRequestException(`Skrzynka ${m.email} nie ma hasła albo domena serwera IMAP.`);
      const sent = await this.prisma.watekMail.findMany({ where: { mailboxId }, select: { id: true, key: true, messageId: true, processNodeId: true, wbsNodeId: true, sentById: true, sentAt: true } });
      if (!sent.length) return { found: 0 };
      const byMsgId = new Map(sent.map(s => [s.messageId, s]));
      const byKey = new Map(sent.map(s => [s.key, s]));
      const oldest = new Date(Math.min(...sent.map(s => s.sentAt.getTime())) - 86_400_000);

      const client = new ImapFlow({
        host: m.domain.imapHost, port: m.domain.imapPort || 993, secure: m.domain.imapSecure,
        auth: { user: m.username || m.email, pass: decryptSecret(m.password) }, logger: false, socketTimeout: 30000,
      });
      const candidates: { uid: number; mail: typeof sent[number]; matchedBy: string }[] = [];
      let maxUid = m.watekImapLastUid || 0;
      let validity = '';
      let stored = 0;
      await client.connect();
      try {
        const lock = await client.getMailboxLock('INBOX', { readOnly: true });
        try {
          const box: any = client.mailbox;
          validity = String(box?.uidValidity ?? '');
          const fresh = !m.watekImapLastUid || m.watekImapUidValidity !== validity;
          if (fresh) maxUid = 0;
          const range: any = fresh ? await client.search({ since: oldest }, { uid: true }) : `${m.watekImapLastUid! + 1}:*`;
          if (!Array.isArray(range) || range.length) {
            for await (const msg of client.fetch(range, { uid: true, envelope: true, headers: ['in-reply-to', 'references'] }, { uid: true })) {
              if (!fresh && msg.uid <= m.watekImapLastUid!) continue; // „N:*” zwraca ostatni mail, gdy nowszych nie ma
              maxUid = Math.max(maxUid, msg.uid);
              if (byMsgId.has(stripId(msg.envelope?.messageId))) continue; // sam wysłany oryginał (np. kopia w DW)
              // Ostatni pasujący Message-ID z References = najnowszy nasz mail w łańcuchu.
              const ids = headerIds(msg.headers?.toString() || '');
              const byHeader = [...ids].reverse().map(id => byMsgId.get(id)).find(Boolean);
              const key = String(msg.envelope?.subject || '').match(WATEK_KEY_RE)?.[0];
              const mail = byHeader || (key ? byKey.get(key) : undefined);
              if (mail) candidates.push({ uid: msg.uid, mail, matchedBy: byHeader ? 'header' : 'subject' });
            }
          }
          // Źródła pobierane PO pętli fetch — w trakcie iteracji ImapFlow nie przyjmie drugiej komendy.
          for (const c of candidates) {
            const one: any = await client.fetchOne(String(c.uid), { source: true }, { uid: true });
            if (one?.source && await this.store(c.mail, c.matchedBy, one.source as Buffer)) stored++;
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout().catch(() => client.close());
      }
      await this.prisma.userMailbox.update({ where: { id: mailboxId }, data: { watekImapLastUid: maxUid || null, watekImapUidValidity: validity || null } });
      if (stored) this.logger.log(`Odpowiedzi na maile wątków (${m.email}): ${stored}`);
      return { found: stored };
    } finally {
      this.busy.delete(mailboxId);
    }
  }

  // @anchor watek-mail-replies-store
  // Zapis odpowiedzi (raz na Message-ID) i import do wątku: `Comment` MAIL_IN na węźle maila. Autorem wpisu
  // w bazie jest nadawca oryginału (kolumna wymagana) — front pokazuje nadawcę maila z `WatekMailReply`.
  private async store(mail: { id: string; processNodeId: string; wbsNodeId: string; sentById: string | null }, matchedBy: string, source: Buffer): Promise<boolean> {
    const parsed = await simpleParser(source);
    const messageId = stripId(parsed.messageId) || `${mail.id}.${parsed.date?.getTime() || Date.now()}@no-message-id`;
    if (await this.prisma.watekMailReply.findUnique({ where: { messageId } })) return false;
    const from = parsed.from?.value?.[0] || {};
    const text = String(parsed.text || '').slice(0, MAX_TEXT);
    const fromName: string | null = from.name || null;
    const fromEmail = String(from.address || '').toLowerCase();
    const zal = this.zapiszZalaczniki(parsed.attachments || []);
    const reply = await this.prisma.watekMailReply.create({
      data: {
        watekMailId: mail.id, processNodeId: mail.processNodeId, wbsNodeId: mail.wbsNodeId, messageId, matchedBy,
        fromEmail, fromName, subject: String(parsed.subject || ''), text, receivedAt: parsed.date || new Date(),
        attachments: zal.length ? JSON.stringify(zal) : null,
      },
    });
    const author = mail.sentById ? await this.prisma.user.findUnique({ where: { id: mail.sentById }, select: { id: true } }) : null;
    if (!author) return true;
    const kto = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
    const tresc = bezPodpisu(bezCytatu(text)); // do wątku sama treść — bez cytatu i podpisu
    const comment = await this.prisma.comment.create({
      data: {
        orderId: mail.processNodeId, userId: author.id, wbsNodeId: mail.wbsNodeId, type: 'MAIL_IN',
        text: `📨 Odpowiedź mailem od: ${kto}\nTemat: ${tematBezKlucza(reply.subject)}\n\n${tresc}${zal.length ? `\n\n📎 ${zal.map(z => z.name).join(', ')}` : ''}`,
        createdAt: reply.receivedAt,
      },
    });
    await this.prisma.watekMailReply.update({ where: { id: reply.id }, data: { commentId: comment.id } });
    await this.powiadom(mail, fromName || fromEmail, tresc).catch((e: any) => this.logger.warn(`Powiadomienie o odpowiedzi ${reply.id}: ${e?.message || e}`));
    return true;
  }

  // @anchor watek-mail-replies-zalaczniki
  // Załączniki odpowiedzi → uploads/watek-mail. Pomijane: obrazki osadzone w treści mniejsze niż 20 KB (logo,
  // ikonki ze stopki), pliki ponad limit, pliki wykonywalne. Zrzut ekranu wklejony w treść waży więcej, więc zostaje.
  private zapiszZalaczniki(atts: any[]): { fileName: string; name: string; mime: string; size: number }[] {
    const out: { fileName: string; name: string; mime: string; size: number }[] = [];
    let n = 0;
    for (const a of atts) {
      const buf: Buffer | undefined = a?.content;
      if (!buf?.length || buf.length > ZAL_MAX_BYTES) continue;
      const mime = String(a.contentType || '');
      const inline = a.related || a.contentDisposition === 'inline' || !!a.cid;
      if (/^image\//i.test(mime) && inline && buf.length < 20 * 1024) continue;
      const name = String(a.filename || `obrazek-${++n}.${(mime.split('/')[1] || 'bin').replace('jpeg', 'jpg')}`).slice(0, 200);
      if (czyZakazany(name)) continue;
      try { out.push({ fileName: zapiszBufor(buf, name, mime), name, mime, size: buf.length }); }
      catch (e: any) { this.logger.warn(`Zapis załącznika ${name}: ${e?.message || e}`); }
    }
    return out;
  }

  // @anchor watek-mail-replies-powiadom
  // Zespół zamówienia + nadawca oryginału dostają powiadomienie i push, jak przy czacie gałęzi.
  private async powiadom(mail: { processNodeId: string; wbsNodeId: string; sentById: string | null }, kto: string, tresc: string) {
    const [order, node, team] = await Promise.all([
      this.prisma.processNode.findUnique({ where: { id: mail.processNodeId }, select: { name: true } }),
      this.prisma.wbsNode.findUnique({ where: { id: mail.wbsNodeId }, select: { name: true } }),
      this.prisma.user.findMany({ where: { isActive: true, teams: { some: { orderNodeId: mail.processNodeId } } }, select: { id: true } }),
    ]);
    const ids = [...new Set([...team.map(u => u.id), ...(mail.sentById ? [mail.sentById] : [])])];
    const title = `📨 ${kto} — odpowiedź mailem „${node?.name || 'gałąź'}” w ${order?.name || 'zamówieniu'}`;
    const body = tresc.length > 120 ? `${tresc.slice(0, 120)}…` : tresc;
    for (const id of ids) {
      await this.notifications.create(id, 'NEW_COMMENT', title, body, mail.processNodeId);
      await this.push.sendToUser(id, title, body, mail.processNodeId);
    }
  }
}
