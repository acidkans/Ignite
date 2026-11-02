import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { PrismaService } from '../prisma/prisma.service';
import { VectorService } from '../ai/vector.service';
import { decryptSecret } from '../common/secret-crypto.util';
import { buildQaIndexFromRows, resolveStrategyTokens } from '../common/strategy-tokens.util';
import { cleanQaPair } from '../wbs-nodes/wbs-nodes.service';

// mailparser nie ma typów — tylko simpleParser.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { simpleParser } = require('mailparser');

const parseJson = (s: any, fallback: any) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const stripId = (s: any) => String(s || '').trim().replace(/^<|>$/g, '');
// Wszystkie Message-ID z nagłówka In-Reply-To / References („<a@x> <b@y>”).
const headerIds = (v: string) => (String(v || '').match(/<[^<>\s]+>/g) || []).map(stripId);
// @anchor qa-mail-reply-key-re — „Ref number [IGN-7KQ2MX]” w temacie (alfabet jak `newQaMailKey`).
const KEY_RE = /IGN-[2-9A-HJ-NP-Z]{6}/;
// Skrzynki z mailami z ostatnich tylu dni są przeglądane przez cron.
const ACTIVE_DAYS = 120;
const MAX_TEXT = 30000;

// @anchor qa-mail-replies-service
// Odbiór odpowiedzi klientów na maile z pytaniami (`QaMail`). Czyta INBOX skrzynki nadawcy przez
// IMAP (tylko do odczytu — nic nie oznacza jako przeczytane), od `UserMailbox.imapLastUid`.
// Dopasowanie: najpierw In-Reply-To/References = `QaMail.messageId`, potem klucz z tematu.
// Każda odpowiedź dostaje propozycje AI (`proposals`) — do zatwierdzenia w oknie odpowiedzi.
@Injectable()
export class QaMailRepliesService {
  private readonly logger = new Logger(QaMailRepliesService.name);
  private readonly busy = new Set<string>();

  constructor(private readonly prisma: PrismaService, private readonly vector: VectorService) {}

  // @anchor qa-mail-replies-poll-active
  // Cron: wszystkie skrzynki, z których w ostatnich ACTIVE_DAYS wysłano pytania.
  async pollActive() {
    const since = new Date(Date.now() - ACTIVE_DAYS * 86_400_000);
    const rows = await this.prisma.qaMail.findMany({ where: { sentAt: { gte: since }, mailboxId: { not: null } }, select: { mailboxId: true }, distinct: ['mailboxId'] });
    let found = 0;
    for (const r of rows) {
      try { found += (await this.pollMailbox(r.mailboxId!)).found; }
      catch (e: any) { this.logger.warn(`Odbiór odpowiedzi (${r.mailboxId}): ${e?.message || e}`); }
    }
    return found;
  }

  // @anchor qa-mail-replies-check-order
  // „Sprawdź pocztę” w oknie odpowiedzi: skrzynki, z których poszły pytania tego zamówienia.
  async checkOrder(processNodeId: string) {
    const rows = await this.prisma.qaMail.findMany({ where: { processNodeId, mailboxId: { not: null } }, select: { mailboxId: true }, distinct: ['mailboxId'] });
    if (!rows.length) throw new BadRequestException('Z tego zamówienia nie wysłano jeszcze pytań mailem.');
    let found = 0;
    const errors: string[] = [];
    for (const r of rows) {
      try { found += (await this.pollMailbox(r.mailboxId!)).found; }
      catch (e: any) { errors.push(e?.message || String(e)); }
    }
    return { found, errors };
  }

  // @anchor qa-mail-replies-poll-mailbox
  // Jeden przebieg po skrzynce. Pierwszy raz (albo po zmianie UIDVALIDITY) szuka od dnia przed
  // najstarszym wysłanym mailem; później tylko UID większe niż zapamiętany.
  async pollMailbox(mailboxId: string): Promise<{ found: number }> {
    if (this.busy.has(mailboxId)) return { found: 0 };
    this.busy.add(mailboxId);
    try {
      const m = await this.prisma.userMailbox.findUnique({ where: { id: mailboxId }, include: { domain: true } });
      if (!m) return { found: 0 };
      if (!m.password || !m.domain.imapHost) throw new BadRequestException(`Skrzynka ${m.email} nie ma hasła albo domena serwera IMAP.`);
      const sent = await this.prisma.qaMail.findMany({ where: { mailboxId }, select: { id: true, key: true, messageId: true, processNodeId: true, sentAt: true } });
      if (!sent.length) return { found: 0 };
      const byMsgId = new Map(sent.map(s => [s.messageId, s]));
      const byKey = new Map(sent.map(s => [s.key, s]));
      const oldest = new Date(Math.min(...sent.map(s => s.sentAt.getTime())) - 86_400_000);

      const client = new ImapFlow({
        host: m.domain.imapHost, port: m.domain.imapPort || 993, secure: m.domain.imapSecure,
        auth: { user: m.username || m.email, pass: decryptSecret(m.password) }, logger: false, socketTimeout: 30000,
      });
      const candidates: { uid: number; qaMail: typeof sent[number]; matchedBy: string }[] = [];
      let maxUid = m.imapLastUid || 0;
      let validity = '';
      await client.connect();
      try {
        const lock = await client.getMailboxLock('INBOX', { readOnly: true });
        try {
          const box: any = client.mailbox;
          validity = String(box?.uidValidity ?? '');
          const fresh = !m.imapLastUid || m.imapUidValidity !== validity;
          if (fresh) maxUid = 0;
          const range: any = fresh
            ? await client.search({ since: oldest }, { uid: true })
            : `${m.imapLastUid! + 1}:*`;
          if (!Array.isArray(range) || range.length) {
            for await (const msg of client.fetch(range, { uid: true, envelope: true, headers: ['in-reply-to', 'references'] }, { uid: true })) {
              if (!fresh && msg.uid <= m.imapLastUid!) continue; // „N:*” zwraca ostatni mail, gdy nowszych nie ma
              maxUid = Math.max(maxUid, msg.uid);
              // Pomijamy tylko sam wysłany oryginał (np. kopia do siebie w DW) — odpowiedź z tego
              // samego adresu (test, kolega na wspólnej skrzynce) też jest odpowiedzią.
              if (byMsgId.has(stripId(msg.envelope?.messageId))) continue;
              const ids = headerIds(msg.headers?.toString() || '');
              const byHeader = ids.map(id => byMsgId.get(id)).find(Boolean);
              const key = String(msg.envelope?.subject || '').match(KEY_RE)?.[0];
              const qaMail = byHeader || (key ? byKey.get(key) : undefined);
              if (qaMail) candidates.push({ uid: msg.uid, qaMail, matchedBy: byHeader ? 'header' : 'subject' });
            }
          }
          // Źródła pobierane PO pętli fetch — w trakcie iteracji ImapFlow nie przyjmie drugiej komendy.
          for (const c of candidates) {
            const one: any = await client.fetchOne(String(c.uid), { source: true }, { uid: true });
            if (one?.source) await this.store(c.qaMail, c.matchedBy, one.source as Buffer);
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout().catch(() => client.close());
      }
      await this.prisma.userMailbox.update({ where: { id: mailboxId }, data: { imapLastUid: maxUid || null, imapUidValidity: validity || null } });
      if (candidates.length) this.logger.log(`Odpowiedzi na pytania (${m.email}): ${candidates.length}`);
      return { found: candidates.length };
    } finally {
      this.busy.delete(mailboxId);
    }
  }

  // Zapis odpowiedzi (raz na Message-ID) i propozycje AI.
  private async store(qaMail: { id: string; processNodeId: string }, matchedBy: string, source: Buffer) {
    const parsed = await simpleParser(source);
    const messageId = stripId(parsed.messageId) || `${qaMail.id}.${parsed.date?.getTime() || Date.now()}@no-message-id`;
    if (await this.prisma.qaMailReply.findUnique({ where: { messageId } })) return;
    const from = parsed.from?.value?.[0] || {};
    const reply = await this.prisma.qaMailReply.create({
      data: {
        qaMailId: qaMail.id, processNodeId: qaMail.processNodeId, messageId, matchedBy,
        fromEmail: String(from.address || '').toLowerCase(), fromName: from.name || null,
        subject: String(parsed.subject || ''),
        text: String(parsed.text || '').slice(0, MAX_TEXT),
        receivedAt: parsed.date || new Date(),
      },
    });
    await this.analyze(reply.id).catch(() => {});
    await this.autoApply(reply.id).catch((e: any) => this.logger.warn(`Auto-wpis odpowiedzi ${reply.id}: ${e?.message || e}`));
  }

  // @anchor qa-mail-replies-auto-apply
  // Automat po analizie AI nowego maila: propozycje z odpowiedzią trafiają od razu do Q&A węzłów — tylko
  // do pytań jeszcze bez odpowiedzi (ręcznie wpisanej nie nadpisuje). Zamyka zadania „Wyjaśnić czy…” i
  // przelicza złożenie strategii gałęzi z `{{q:id}}`. Wpisane propozycje dostają `applied: true`, a mail
  // status AUTO — front pokazuje popup „Dodano odpowiedzi z maila”; jego zamknięcie ustawia DONE.
  async autoApply(replyId: string): Promise<number> {
    const reply = await this.prisma.qaMailReply.findUnique({ where: { id: replyId } });
    if (!reply || reply.status !== 'NEW') return 0;
    const proposals: any[] = parseJson(reply.proposals, []);
    const norm = (t: any) => String(t || '').trim().toLowerCase();
    const byNode = new Map<string, any[]>();
    proposals.filter(p => p?.wbsNodeId && String(p?.answer || '').trim())
      .forEach(p => byNode.set(p.wbsNodeId, [...(byNode.get(p.wbsNodeId) || []), p]));
    if (!byNode.size) return 0;

    const nodes = await this.prisma.wbsNode.findMany({ where: { id: { in: [...byNode.keys()] } }, select: { id: true, qa: true, nodeId: true, versionId: true } });
    let applied = 0;
    const taskIds: string[] = [];
    const touched: typeof nodes = [];
    for (const n of nodes) {
      const qa: any[] = parseJson(n.qa, []);
      if (!Array.isArray(qa)) continue;
      let changed = false;
      for (const p of byNode.get(n.id)!) {
        let idx = qa.findIndex(x => x?.id && x.id === p.qaId);
        if (idx < 0) idx = qa.findIndex(x => norm(x?.question) === norm(p.question));
        if (idx < 0 || String(qa[idx]?.answer || '').trim()) continue;
        qa[idx] = {
          ...qa[idx],
          answer: String(p.answer).trim().toLocaleLowerCase('pl-PL'),
          answerSource: 'mail', mailReplyId: reply.id, mailReplyAt: reply.receivedAt.toISOString(),
        };
        if (qa[idx].taskId) taskIds.push(String(qa[idx].taskId));
        p.applied = true;
        applied++;
        changed = true;
      }
      if (!changed) continue;
      await this.prisma.wbsNode.update({ where: { id: n.id }, data: { qa: JSON.stringify(qa.map(cleanQaPair)) } });
      touched.push(n);
    }
    if (!applied) return 0;
    if (taskIds.length) await this.prisma.userTask.updateMany({ where: { id: { in: taskIds }, status: { not: 'DONE' } }, data: { status: 'DONE' } });
    for (const n of touched) await this.recomposeBranchFor(n.id, n.nodeId, n.versionId).catch(() => {});
    await this.prisma.qaMailReply.update({ where: { id: reply.id }, data: { status: 'AUTO', handledAt: new Date(), proposals: JSON.stringify(proposals) } });
    this.logger.log(`Auto-wpis odpowiedzi z maila ${reply.id}: ${applied}`);
    return applied;
  }

  // @anchor qa-mail-replies-recompose-branch
  // Złożenie strategii gałęzi (pole `strategy` węzła top-level) po zmianie odpowiedzi — lustro frontowego
  // `composeBranchStrategy`: „nazwa:\nstrategia” potomków w kolejności drzewa, rozdzielone pustą linią.
  // Tylko gdy któraś strategia w gałęzi ma znaczniki `{{q:id}}` (inaczej złożenie jest ręczne).
  private async recomposeBranchFor(wbsNodeId: string, nodeId: string, versionId: string | null) {
    const all = await this.prisma.wbsNode.findMany({
      where: { nodeId, versionId }, orderBy: { sortOrder: 'asc' },
      select: { id: true, parentId: true, name: true, strategy: true, qa: true },
    });
    const byId = new Map(all.map(n => [n.id, n]));
    let root = byId.get(wbsNodeId);
    while (root?.parentId && byId.has(root.parentId)) root = byId.get(root.parentId);
    if (!root) return;
    const kids = new Map<string, typeof all>();
    all.forEach(n => { if (n.parentId) kids.set(n.parentId, [...(kids.get(n.parentId) || []), n]); });
    const branch: typeof all = [];
    const walk = (id: string) => (kids.get(id) || []).forEach(c => { branch.push(c); walk(c.id); });
    walk(root.id);
    if (!branch.some(n => /\{\{q:[\w-]+\}\}/.test(n.strategy || ''))) return;
    const qaIndex = buildQaIndexFromRows([root, ...branch]);
    const composed = branch
      .filter(n => (n.strategy || '').trim())
      .map(n => `${(n.name || 'Element WBS').trim()}:\n${resolveStrategyTokens((n.strategy || '').trim(), qaIndex)}`)
      .join('\n\n');
    if (composed && composed !== (root.strategy || '')) await this.prisma.wbsNode.update({ where: { id: root.id }, data: { strategy: composed } });
  }

  // @anchor qa-mail-replies-analyze
  // AI dopasowuje fragmenty odpowiedzi do wysłanych pytań. Bez AI (dev bez kluczy, błąd modelu)
  // propozycje mają puste odpowiedzi, a powód trafia do `aiError` — wpisuje się je ręcznie.
  async analyze(replyId: string) {
    const reply = await this.prisma.qaMailReply.findUnique({ where: { id: replyId }, include: { qaMail: true } });
    if (!reply) throw new NotFoundException('Nie ma takiej odpowiedzi.');
    const items: { wbsNodeId: string; qaId: string; question: string; nodeName?: string }[] = parseJson(reply.qaMail.items, []);
    let answers = new Map<string, string>();
    let aiError: string | null = null;
    try {
      const prompt = `Klient odpowiedział mailem na pytania wysłane przez firmę instalacyjną. Dopasuj odpowiedzi klienta do pytań.
Zasady:
- Bierz tylko to, co napisał klient. Pomiń cytowany oryginał (linie z „>”, blok „From:/Od:/Wysłano:” i niżej) i stopkę/podpis.
- Odpowiedź przepisz zwięźle, w języku klienta, bez dopisywania własnych wniosków.
- Gdy klient nie odpowiedział na pytanie, pomiń je.
Zwróć WYŁĄCZNIE JSON: {"answers":[{"ref":"Q1","answer":"..."}]}

=== PYTANIA ===
${items.map((it, i) => `Q${i + 1}: ${it.question}`).join('\n')}

=== MAIL KLIENTA ===
Temat: ${reply.subject}
${reply.text.slice(0, 15000)}`;
      const raw = await this.vector.generateRaw(prompt);
      const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '');
      answers = new Map((Array.isArray(json?.answers) ? json.answers : [])
        .map((a: any) => [String(a?.ref || ''), String(a?.answer || '').trim()] as [string, string])
        .filter(([r, a]: [string, string]) => r && a));
    } catch (e: any) {
      aiError = e?.message || String(e);
      this.logger.warn(`AI odpowiedzi ${reply.id}: ${aiError}`);
    }
    const proposals = items.map((it, i) => ({ ...it, answer: answers.get(`Q${i + 1}`) || '' }));
    return this.prisma.qaMailReply.update({ where: { id: reply.id }, data: { proposals: JSON.stringify(proposals), aiError } });
  }

  // @anchor qa-mail-replies-list
  // Odpowiedzi zamówienia: oczekujące (NEW) i ostatnie obsłużone.
  async list(processNodeId: string) {
    const rows = await this.prisma.qaMailReply.findMany({
      where: { processNodeId },
      orderBy: { receivedAt: 'desc' }, take: 50,
      include: { qaMail: { select: { key: true, subject: true, sentAt: true, fromEmail: true } } },
    });
    return rows.map(r => ({ ...r, proposals: parseJson(r.proposals, []) }));
  }

  // @anchor qa-mail-replies-resolve
  // DONE = odpowiedzi wpisane do Q&A (zapis par robi front, jak przy czacie), IGNORED = pominięta.
  async resolve(userId: string, replyId: string, status: string) {
    if (!['DONE', 'IGNORED', 'NEW'].includes(status)) throw new BadRequestException('Nieznany status.');
    const reply = await this.prisma.qaMailReply.findUnique({ where: { id: replyId } });
    if (!reply) throw new NotFoundException('Nie ma takiej odpowiedzi.');
    return this.prisma.qaMailReply.update({
      where: { id: replyId },
      data: status === 'NEW' ? { status, handledById: null, handledAt: null } : { status, handledById: userId, handledAt: new Date() },
    });
  }
}
