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

  // @anchor mailboxes-coverage
  // Kto z podanych użytkowników ma skrzynkę w domenie — do ostrzeżenia w „Informacjach o zamówieniu”.
  async coverage(domainId: string) {
    const rows = await this.prisma.userMailbox.findMany({
      where: { domainId },
      select: { userId: true, email: true, verifiedAt: true },
    });
    return rows;
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
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const name = m.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || m.email;
    const transport = nodemailer.createTransport({
      host: d.smtpHost, port: d.smtpPort || 587, secure: d.smtpSecure,
      auth: { user: m.username || m.email, pass: decryptSecret(m.password) },
      connectionTimeout: 15000, greetingTimeout: 15000,
    });
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
}
