import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../common/secret-crypto.util';

// @anchor normalize-mail-domain
// „@Airtel.PL ” → „airtel.pl”.
export const normalizeMailDomain = (v: any) => String(v || '').trim().toLowerCase().replace(/^@+/, '');

const toPort = (v: any) => (v === '' || v == null ? null : parseInt(String(v), 10) || null);
const toBool = (v: any) => v === true || v === 'true';

// @anchor clean-mail-signature
// Podpis z edytora: bez skryptów, ramek i handlerów on*; obrazki zostają jako data:URI (wklejone
// z schowka). Pusty edytor („<br>”, same spacje) = brak podpisu.
export const cleanMailSignature = (v: any) => {
  let html = String(v || '')
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
    .trim();
  if (!html.replace(/<br\s*\/?>|&nbsp;|<\/?(div|p|span)[^>]*>/gi, '').trim() && !/<img\b/i.test(html)) html = '';
  if (html.length > 3_000_000) throw new BadRequestException('Podpis jest za duży (obrazki łącznie do ~2 MB).');
  return html || null;
};

// @anchor mailboxes-service
// Domeny pocztowe (ADMIN) i skrzynki użytkowników w tych domenach. Hasła tylko w jedną stronę:
// zapis szyfruje, odczyt zwraca flagę hasPassword. Test łączy się z SMTP i IMAP i wykrywa „Wysłane”.
@Injectable()
export class MailboxesService {
  private readonly logger = new Logger(MailboxesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Domeny ────────────────────────────────────────────────────────────────

  // @anchor mailboxes-list-domains
  async listDomains(includeInactive = false) {
    const rows = await this.prisma.mailDomain.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { domain: 'asc' },
      include: { _count: { select: { mailboxes: true } } },
    });
    return rows.map(({ _count, ...d }) => ({ ...d, mailboxCount: _count.mailboxes }));
  }

  private domainData(dto: any) {
    const data: any = {};
    if ('domain' in dto) data.domain = normalizeMailDomain(dto.domain);
    if ('label' in dto) data.label = String(dto.label || '').trim() || null;
    if ('smtpHost' in dto) data.smtpHost = String(dto.smtpHost || '').trim() || null;
    if ('smtpPort' in dto) data.smtpPort = toPort(dto.smtpPort);
    if ('smtpSecure' in dto) data.smtpSecure = toBool(dto.smtpSecure);
    if ('imapHost' in dto) data.imapHost = String(dto.imapHost || '').trim() || null;
    if ('imapPort' in dto) data.imapPort = toPort(dto.imapPort);
    if ('imapSecure' in dto) data.imapSecure = toBool(dto.imapSecure);
    if ('isActive' in dto) data.isActive = toBool(dto.isActive);
    if ('domain' in data && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(data.domain)) {
      throw new BadRequestException('Podaj poprawną domenę, np. airtel.pl.');
    }
    return data;
  }

  // @anchor mailboxes-create-domain
  async createDomain(dto: any) {
    const data = this.domainData(dto || {});
    if (!data.domain) throw new BadRequestException('Podaj domenę, np. airtel.pl.');
    const exists = await this.prisma.mailDomain.findUnique({ where: { domain: data.domain } });
    if (exists) throw new BadRequestException(`Domena ${data.domain} już istnieje.`);
    return this.prisma.mailDomain.create({ data });
  }

  // @anchor mailboxes-update-domain
  // Zmiana nazwy domeny jest zablokowana, gdy są w niej skrzynki — ich adresy przestałyby pasować.
  async updateDomain(id: string, dto: any) {
    const current = await this.prisma.mailDomain.findUnique({
      where: { id },
      include: { _count: { select: { mailboxes: true } } },
    });
    if (!current) throw new NotFoundException('Nie ma takiej domeny.');
    const data = this.domainData(dto || {});
    if (data.domain && data.domain !== current.domain && current._count.mailboxes > 0) {
      throw new BadRequestException('Nie można zmienić nazwy domeny, w której są skrzynki użytkowników.');
    }
    return this.prisma.mailDomain.update({ where: { id }, data });
  }

  // @anchor mailboxes-delete-domain
  // Kasuje też skrzynki tej domeny (cascade), a zamówieniom zeruje domenę (SetNull).
  async deleteDomain(id: string) {
    await this.prisma.mailDomain.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Nie ma takiej domeny.');
    });
    return { ok: true };
  }

  // ── Skrzynki użytkownika ────────────────────────────────────────────────────

  private publicMailbox(m: any) {
    const { password, imapLastUid: _u, imapUidValidity: _v, ...rest } = m;
    return { ...rest, hasPassword: !!password };
  }

  // @anchor mailboxes-list-mine
  async listMine(userId: string) {
    const rows = await this.prisma.userMailbox.findMany({
      where: { userId },
      include: { domain: { select: { id: true, domain: true, label: true, isActive: true } } },
      orderBy: { email: 'asc' },
    });
    return rows.map((m) => this.publicMailbox(m));
  }

  private async getOwned(userId: string, id: string) {
    const m = await this.prisma.userMailbox.findUnique({ where: { id }, include: { domain: true } });
    if (!m) throw new NotFoundException('Nie ma takiej skrzynki.');
    if (m.userId !== userId) throw new ForbiddenException('To nie jest Twoja skrzynka.');
    return m;
  }

  // @anchor mailboxes-create-mine
  async createMine(userId: string, dto: any) {
    const domain = await this.prisma.mailDomain.findUnique({ where: { id: String(dto?.domainId || '') } });
    if (!domain || !domain.isActive) throw new BadRequestException('Wybierz domenę z listy.');
    const email = this.checkEmail(dto?.email, domain.domain);
    const taken = await this.prisma.userMailbox.findUnique({ where: { userId_domainId: { userId, domainId: domain.id } } });
    if (taken) throw new BadRequestException(`Masz już skrzynkę w domenie ${domain.domain} (${taken.email}).`);
    const created = await this.prisma.userMailbox.create({
      data: {
        userId,
        domainId: domain.id,
        email,
        displayName: String(dto?.displayName || '').trim() || null,
        username: String(dto?.username || '').trim() || null,
        password: dto?.password ? encryptSecret(String(dto.password)) : null,
        signatureHtml: cleanMailSignature(dto?.signatureHtml),
      },
      include: { domain: { select: { id: true, domain: true, label: true, isActive: true } } },
    });
    return this.publicMailbox(created);
  }

  // @anchor mailboxes-update-mine
  // Puste hasło = bez zmiany (pole write-only, jak w SmtpService). Zmiana danych logowania
  // unieważnia ostatni test — trzeba przetestować ponownie.
  async updateMine(userId: string, id: string, dto: any) {
    const m = await this.getOwned(userId, id);
    const data: any = {};
    if ('email' in (dto || {})) data.email = this.checkEmail(dto.email, m.domain.domain);
    if ('displayName' in (dto || {})) data.displayName = String(dto.displayName || '').trim() || null;
    if ('username' in (dto || {})) data.username = String(dto.username || '').trim() || null;
    if (dto?.password) data.password = encryptSecret(String(dto.password));
    if ('signatureHtml' in (dto || {})) data.signatureHtml = cleanMailSignature(dto.signatureHtml);
    if (data.email !== undefined || data.username !== undefined || data.password) {
      Object.assign(data, { verifiedAt: null, lastError: null, sentFolder: null, imapLastUid: null, imapUidValidity: null });
    }
    const updated = await this.prisma.userMailbox.update({
      where: { id },
      data,
      include: { domain: { select: { id: true, domain: true, label: true, isActive: true } } },
    });
    return this.publicMailbox(updated);
  }

  // @anchor mailboxes-delete-mine
  async deleteMine(userId: string, id: string) {
    await this.getOwned(userId, id);
    await this.prisma.userMailbox.delete({ where: { id } });
    return { ok: true };
  }

  private checkEmail(value: any, domain: string) {
    const email = String(value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new BadRequestException('Podaj poprawny adres e-mail.');
    if (!email.endsWith('@' + domain)) throw new BadRequestException(`Adres musi być w domenie @${domain}.`);
    return email;
  }

  // @anchor mailboxes-list-order-domains
  // Tabela w „Poczcie SMTP”: zamówienia z ich domeną (wiersz baseline) i zespołem. `domainIds` członka
  // zespołu pozwala pokazać brakujące skrzynki od razu po zmianie domeny, bez ponownego pobierania.
  async listOrderDomains() {
    const [orders, mailboxes] = await Promise.all([
      this.prisma.processNode.findMany({
        where: { type: 'order' },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          parent: { select: { name: true } },
          orderRequirements: { where: { versionId: null }, select: { mailDomainId: true } },
          orderTeam: { select: { users: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        },
      }),
      this.prisma.userMailbox.findMany({ select: { userId: true, domainId: true } }),
    ]);
    const domainsOf = new Map<string, string[]>();
    for (const m of mailboxes) domainsOf.set(m.userId, [...(domainsOf.get(m.userId) || []), m.domainId]);
    return orders.map((o) => ({
      id: o.id,
      name: o.name,
      parentName: o.parent?.name || null,
      mailDomainId: o.orderRequirements[0]?.mailDomainId || null,
      team: (o.orderTeam?.users || []).map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
        domainIds: domainsOf.get(u.id) || [],
      })),
    }));
  }

  // @anchor mailboxes-set-order-domain
  // Domena zamówienia żyje w wierszu baseline (`versionId = null`); pusta wartość czyści przypisanie.
  async setOrderDomain(orderId: string, value: unknown) {
    const mailDomainId = String(value || '').trim() || null;
    const order = await this.prisma.processNode.findFirst({ where: { id: orderId, type: 'order' }, select: { id: true } });
    if (!order) throw new BadRequestException('Nie ma takiego zamówienia.');
    if (mailDomainId && !(await this.prisma.mailDomain.findUnique({ where: { id: mailDomainId }, select: { id: true } }))) {
      throw new BadRequestException('Nie ma takiej domeny.');
    }
    const existing = await this.prisma.orderRequirements.findFirst({ where: { nodeId: orderId, versionId: null }, select: { id: true } });
    if (existing) await this.prisma.orderRequirements.update({ where: { id: existing.id }, data: { mailDomainId } });
    else await this.prisma.orderRequirements.create({ data: { nodeId: orderId, mailDomainId } });
    return { id: orderId, mailDomainId };
  }

  // ── Test połączenia ─────────────────────────────────────────────────────────

  // @anchor mailboxes-test-mine
  // SMTP: verify() (logowanie, bez wysyłki). IMAP: logowanie + wykrycie folderu „Wysłane”
  // po fladze \Sent, a gdy serwer jej nie podaje — po typowych nazwach. Wynik zapisuje się w skrzynce.
  async testMine(userId: string, id: string) {
    const m = await this.getOwned(userId, id);
    const d = m.domain;
    if (!m.password) throw new BadRequestException('Najpierw wpisz hasło do skrzynki.');
    const user = m.username || m.email;
    const pass = decryptSecret(m.password);

    const smtp = { ok: false, error: null as string | null };
    if (!d.smtpHost) smtp.error = 'Domena nie ma ustawionego serwera SMTP (uzupełnia administrator).';
    else {
      try {
        const transport = nodemailer.createTransport({
          host: d.smtpHost, port: d.smtpPort || 587, secure: d.smtpSecure, auth: { user, pass },
          connectionTimeout: 15000, greetingTimeout: 15000,
        });
        await transport.verify();
        smtp.ok = true;
      } catch (e: any) {
        smtp.error = e?.message || String(e);
      }
    }

    const imap = { ok: false, error: null as string | null, sentFolder: null as string | null };
    if (!d.imapHost) imap.error = 'Domena nie ma ustawionego serwera IMAP (uzupełnia administrator).';
    else {
      const client = new ImapFlow({
        host: d.imapHost, port: d.imapPort || 993, secure: d.imapSecure,
        auth: { user, pass }, logger: false, socketTimeout: 20000,
      });
      try {
        await client.connect();
        const boxes = await client.list();
        const bySpecial = boxes.find((b: any) => b.specialUse === '\\Sent');
        const byName = boxes.find((b: any) => /^(inbox[./])?(sent|sent items|sent messages|wys[łl]ane|elementy wys[łl]ane)$/i.test(b.path));
        imap.sentFolder = (bySpecial || byName)?.path || null;
        imap.ok = true;
        if (!imap.sentFolder) imap.error = 'Zalogowano, ale nie znaleziono folderu „Wysłane”.';
      } catch (e: any) {
        imap.error = e?.responseText || e?.message || String(e);
      } finally {
        await client.logout().catch(() => client.close());
      }
    }

    const ok = smtp.ok && imap.ok && !!imap.sentFolder;
    const lastError = ok ? null : [smtp.error && `SMTP: ${smtp.error}`, imap.error && `IMAP: ${imap.error}`].filter(Boolean).join(' · ');
    const updated = await this.prisma.userMailbox.update({
      where: { id },
      data: {
        verifiedAt: ok ? new Date() : null,
        lastError,
        ...(imap.sentFolder ? { sentFolder: imap.sentFolder } : {}),
      },
      include: { domain: { select: { id: true, domain: true, label: true, isActive: true } } },
    });
    if (!ok) this.logger.warn(`Test skrzynki ${m.email} nieudany: ${lastError}`);
    return { ok, smtp, imap, mailbox: this.publicMailbox(updated) };
  }

  // @anchor mailboxes-send-test-mine
  // Mail testowy ze skrzynki na jej własny adres — podgląd podpisu tak, jak zobaczy go odbiorca.
  // attachDataUrls: obrazki data:URI z podpisu idą jako załączniki CID (Outlook/Gmail nie pokazują data:).
  async sendTestMine(userId: string, id: string) {
    const m = await this.getOwned(userId, id);
    const d = m.domain;
    if (!m.password) throw new BadRequestException('Najpierw wpisz hasło do skrzynki.');
    if (!d.smtpHost) throw new BadRequestException('Domena nie ma ustawionego serwera SMTP (uzupełnia administrator).');
    const name = await this.senderName(m);
    const transport = this.smtpTransport(m);
    const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">`
      + `<p>Dzień dobry,</p><p>to jest wiadomość testowa z Ignite wysłana ze skrzynki ${m.email}. `
      + `Poniżej podpis w takiej postaci, w jakiej zobaczy go odbiorca.</p><p>Pozdrawiam</p></div>`
      + (m.signatureHtml
        ? `<br><div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${m.signatureHtml}</div>`
        : '<p style="color:#888">(skrzynka nie ma jeszcze podpisu)</p>');
    try {
      await transport.sendMail({
        from: { name, address: m.email }, to: m.email,
        subject: 'Ignite — test podpisu', html, attachDataUrls: true,
      });
    } catch (e: any) {
      throw new BadRequestException(`Nie udało się wysłać: ${e?.message || e}`);
    }
    return { ok: true, to: m.email };
  }

  // ── Wysyłka z kodu (pytania do klienta) ─────────────────────────────────────

  // @anchor mailboxes-sender-for
  // Skrzynka użytkownika w domenie zamówienia — z niej idą maile zamówienia. Bez skrzynki,
  // hasła albo SMTP domeny rzuca czytelny błąd do pokazania w UI.
  async senderFor(userId: string, domainId: string) {
    const m = await this.prisma.userMailbox.findUnique({
      where: { userId_domainId: { userId, domainId } },
      include: { domain: true },
    });
    if (!m) throw new BadRequestException('Nie masz skrzynki w domenie tego zamówienia — dodaj ją w „Moim koncie”.');
    if (!m.domain.isActive) throw new BadRequestException(`Domena ${m.domain.domain} jest wyłączona.`);
    if (!m.password) throw new BadRequestException('Twoja skrzynka nie ma hasła — uzupełnij je w „Moim koncie”.');
    if (!m.domain.smtpHost) throw new BadRequestException('Domena nie ma ustawionego serwera SMTP (uzupełnia administrator).');
    return m;
  }

  // @anchor mailboxes-order-info
  // Zamówienie (ProcessNode type='order') nad podanym węzłem i jego „Informacje o zamówieniu”
  // z domeną poczty. Węzeł spoza drzewa procesów (np. lokalizacja) → null.
  async orderInfo(nodeId: string) {
    let id: string | null = nodeId;
    let orderId: string | null = null;
    let name = '';
    for (let i = 0; i < 20 && id; i++) {
      const n = await this.prisma.processNode.findUnique({ where: { id }, select: { id: true, name: true, type: true, parentId: true } });
      if (!n) break;
      if (!orderId) { orderId = n.id; name = n.name; } // bez węzła 'order' wyżej zostaje sam podany węzeł
      if (String(n.type || '').toLowerCase() === 'order') { orderId = n.id; name = n.name; break; }
      id = n.parentId;
    }
    if (!orderId) return null;
    const req = await this.prisma.orderRequirements.findFirst({ where: { nodeId: orderId, versionId: null }, include: { mailDomain: true } })
      || await this.prisma.orderRequirements.findFirst({ where: { nodeId: orderId }, orderBy: { updatedAt: 'desc' }, include: { mailDomain: true } });
    return { orderId, orderName: name, req };
  }

  // @anchor mailboxes-order-sender
  // Zasada wysyłki z konta firmowego: zamówienie z domeną poczty → mail idzie ze skrzynki
  // użytkownika w tej domenie (podpis, kopia w „Wysłanych”). Bez skrzynki = błąd do pokazania,
  // nie cicha wysyłka z systemu. Zamówienie bez domeny (albo węzeł spoza zamówienia) → `domain: null`,
  // a wołający decyduje, czy wolno wysłać z konta systemowego.
  async orderSender(userId: string, nodeId: string | null | undefined) {
    const info = nodeId ? await this.orderInfo(nodeId).catch(() => null) : null;
    const domain = info?.req?.mailDomain || null;
    if (!domain) return { info, domain: null, mailbox: null, sender: null, senderError: null as string | null };
    try {
      const m = await this.senderFor(userId, domain.id);
      const sender = { email: m.email, name: await this.senderName(m), verified: !!m.verifiedAt, sentFolder: m.sentFolder, hasSignature: !!m.signatureHtml };
      return { info, domain, mailbox: m, sender, senderError: null as string | null };
    } catch (e: any) {
      return { info, domain, mailbox: null, sender: null, senderError: (e?.message || String(e)) as string | null };
    }
  }

  // @anchor mailboxes-send-from-mailbox
  // Wysyłka ze skrzynki firmowej: MIME budowany raz (obrazki podpisu jako CID), SMTP skrzynki,
  // ten sam MIME do „Wysłane”. `html` to treść BEZ podpisu — podpis dokleja się tutaj.
  // `inReplyTo` / `references` (z <>) — odpowiedź w tym samym wątku poczty klienta.
  async sendFromMailbox(m: any, mail: { to: string[]; cc?: string[]; subject: string; html: string; text?: string; attachments?: any[]; messageId?: string; inReplyTo?: string; references?: string }) {
    const font = 'font-family:Calibri,Arial,sans-serif;font-size:11pt';
    const html = mail.html + (m.signatureHtml ? `<br><div style="${font}">${m.signatureHtml}</div>` : '');
    const built = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail({
      from: { name: await this.senderName(m), address: m.email },
      to: mail.to, cc: mail.cc?.length ? mail.cc : undefined,
      subject: mail.subject, html, text: mail.text,
      attachments: mail.attachments, messageId: mail.messageId, attachDataUrls: true,
      inReplyTo: mail.inReplyTo, references: mail.references,
    });
    const raw = built.message as Buffer;
    try {
      await this.smtpTransport(m).sendMail({ envelope: { from: m.email, to: [...mail.to, ...(mail.cc || [])] }, raw });
    } catch (e: any) {
      throw new BadRequestException(`Nie udało się wysłać ze skrzynki ${m.email}: ${e?.message || e}`);
    }
    const sentCopyError = await this.appendToSent(m, raw);
    return { raw, sentCopyError };
  }

  // @anchor mailboxes-sender-name
  // Nazwa w „Od:”: nazwa skrzynki, inaczej imię i nazwisko właściciela, inaczej adres.
  async senderName(m: { userId: string; email: string; displayName: string | null }) {
    if (m.displayName) return m.displayName;
    const user = await this.prisma.user.findUnique({ where: { id: m.userId }, select: { firstName: true, lastName: true } });
    return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || m.email;
  }

  // @anchor mailboxes-smtp-transport
  smtpTransport(m: any) {
    const d = m.domain;
    return nodemailer.createTransport({
      host: d.smtpHost, port: d.smtpPort || 587, secure: d.smtpSecure,
      auth: { user: m.username || m.email, pass: decryptSecret(m.password) },
      connectionTimeout: 15000, greetingTimeout: 15000,
    });
  }

  // @anchor mailboxes-append-to-sent
  // Kopia wysłanego maila (surowy MIME) w folderze „Wysłane” skrzynki — klient poczty pokaże go
  // jak wysłany ręcznie. Zwraca tekst błędu albo null; błąd nie cofa wysyłki.
  async appendToSent(m: any, raw: Buffer): Promise<string | null> {
    const d = m.domain;
    if (!d.imapHost) return 'Domena nie ma ustawionego serwera IMAP.';
    if (!m.sentFolder) return 'Nie znam folderu „Wysłane” — przetestuj skrzynkę w „Moim koncie”.';
    const client = new ImapFlow({
      host: d.imapHost, port: d.imapPort || 993, secure: d.imapSecure,
      auth: { user: m.username || m.email, pass: decryptSecret(m.password) }, logger: false, socketTimeout: 20000,
    });
    try {
      await client.connect();
      await client.append(m.sentFolder, raw, ['\\Seen']);
      return null;
    } catch (e: any) {
      const err = e?.responseText || e?.message || String(e);
      this.logger.warn(`Kopia do „Wysłane” (${m.email}) nieudana: ${err}`);
      return err;
    } finally {
      await client.logout().catch(() => client.close());
    }
  }
}
