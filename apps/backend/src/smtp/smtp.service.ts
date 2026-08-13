import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

// @anchor smtp-singleton-id
// Profil globalny — domyślny wiersz konfiguracji, z którego korzysta cała aplikacja.
const SINGLETON_ID = 'singleton';

// @anchor smtp-profiles
// Profile konfiguracji SMTP = id wierszy w smtp_settings. Moduł Urlopy ma własny profil,
// żeby powiadomienia urlopowe szły z innej skrzynki niż eksporty i reszta aplikacji.
export const SMTP_PROFILES = {
  GLOBAL: SINGLETON_ID,
  LEAVES: 'leaves',
} as const;

export type SmtpProfile = (typeof SMTP_PROFILES)[keyof typeof SMTP_PROFILES];

// @anchor resolve-smtp-profile
// Nieznany profil traktujemy jak globalny — brak cichego tworzenia przypadkowych wierszy.
export const resolveSmtpProfile = (value?: string | null): SmtpProfile =>
  (Object.values(SMTP_PROFILES) as string[]).includes(String(value))
    ? (String(value) as SmtpProfile)
    : SMTP_PROFILES.GLOBAL;

@Injectable()
export class SmtpService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // @anchor smtp-service-get-raw
  // Zwraca surowy wiersz (z hasłem) — tylko do użytku wewnętrznego (buildTransport).
  private async getRaw(profile: SmtpProfile = SMTP_PROFILES.GLOBAL) {
    const existing = await this.prisma.smtpSettings.findUnique({ where: { id: profile } });
    if (existing) return existing;
    return this.prisma.smtpSettings.create({ data: { id: profile } });
  }

  // @anchor smtp-service-get
  // Publiczny odczyt dla panelu — NIGDY nie zwraca hasła, tylko flagę hasPassword.
  async get(profile: SmtpProfile = SMTP_PROFILES.GLOBAL) {
    const { password, ...rest } = await this.getRaw(profile);
    return { ...rest, hasPassword: !!password };
  }

  // @anchor smtp-service-update
  // Upsert; gdy password puste/nieobecne — zachowuje istniejące (pole write-only).
  async update(dto: any, profile: SmtpProfile = SMTP_PROFILES.GLOBAL) {
    const { id: _ignored, hasPassword: _hp, updatedAt: _ua, ...data } = dto || {};
    if (data.password === '' || data.password == null) delete data.password;
    if (data.port != null && data.port !== '') data.port = parseInt(String(data.port), 10) || null;
    else if ('port' in data) data.port = null;
    if (typeof data.secure === 'string') data.secure = data.secure === 'true';
    await this.prisma.smtpSettings.upsert({
      where: { id: profile },
      create: { id: profile, ...data },
      update: data,
    });
    return this.get(profile);
  }

  // @anchor smtp-build-transport
  // Buduje transport nodemailer z ustawień DB (panel = źródło prawdy); fallback do env SMTP_*.
  // Profil bez wypełnionego hosta cofa się do profilu globalnego — moduł ze swoją zakładką
  // SMTP działa więc od razu, zanim ktokolwiek uzupełni jego własne dane.
  async buildTransport(profile: SmtpProfile = SMTP_PROFILES.GLOBAL) {
    let s = await this.getRaw(profile);
    if (!s.host && profile !== SMTP_PROFILES.GLOBAL) s = await this.getRaw(SMTP_PROFILES.GLOBAL);
    const host = s.host || this.config.get('SMTP_HOST');
    const port = s.port || parseInt(this.config.get('SMTP_PORT') || '587', 10);
    const secure = s.host ? s.secure : this.config.get('SMTP_SECURE') === 'true';
    const user = s.username || this.config.get('SMTP_USER');
    const pass = s.password || this.config.get('SMTP_PASS');
    if (!host) {
      throw new BadRequestException('Brak konfiguracji SMTP — uzupełnij ustawienia w panelu „Poczta SMTP".');
    }
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    });
    const fromEmail = s.fromEmail || this.config.get('SMTP_FROM_EMAIL');
    const from = fromEmail
      ? `"${(s.fromName || this.config.get('SMTP_FROM_NAME') || fromEmail).replace(/"/g, '')}" <${fromEmail}>`
      : (this.config.get('SMTP_FROM') || '"GIGATEL ERP" <noreply@erp.gigatel.org>');
    return { transport, from, replyTo: s.replyTo || undefined };
  }

  // @anchor smtp-send-mail
  // Centralna wysyłka — wszystkie maile aplikacji idą tędy (jedno źródło konfiguracji).
  async sendMail(
    opts: {
      to: string | string[];
      cc?: string | string[];
      subject: string;
      html?: string;
      text?: string;
      attachments?: any[];
    },
    profile: SmtpProfile = SMTP_PROFILES.GLOBAL,
  ) {
    const { transport, from, replyTo } = await this.buildTransport(profile);
    return transport.sendMail({ from, replyTo, ...opts });
  }

  // @anchor smtp-send-test
  async sendTest(to: string, profile: SmtpProfile = SMTP_PROFILES.GLOBAL) {
    if (!to || !to.includes('@')) throw new BadRequestException('Podaj poprawny adres odbiorcy testu.');
    await this.sendMail(
      {
        to,
        subject: 'Test SMTP — GIGATEL ERP',
        html: `<p>To jest testowa wiadomość z konfiguracji SMTP w panelu ERP (profil: ${profile}).</p><p>Jeśli ją widzisz — wysyłka działa ✅</p>`,
      },
      profile,
    );
    return { ok: true };
  }
}
