import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

// @anchor smtp-singleton-id
// Singleton — całe API operuje na jednym wierszu o stałym id (wzór jak Company).
const SINGLETON_ID = 'singleton';

@Injectable()
export class SmtpService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // @anchor smtp-service-get-raw
  // Zwraca surowy wiersz (z hasłem) — tylko do użytku wewnętrznego (buildTransport).
  private async getRaw() {
    const existing = await this.prisma.smtpSettings.findUnique({ where: { id: SINGLETON_ID } });
    if (existing) return existing;
    return this.prisma.smtpSettings.create({ data: { id: SINGLETON_ID } });
  }

  // @anchor smtp-service-get
  // Publiczny odczyt dla panelu — NIGDY nie zwraca hasła, tylko flagę hasPassword.
  async get() {
    const { password, ...rest } = await this.getRaw();
    return { ...rest, hasPassword: !!password };
  }

  // @anchor smtp-service-update
  // Upsert; gdy password puste/nieobecne — zachowuje istniejące (pole write-only).
  async update(dto: any) {
    const { id: _ignored, hasPassword: _hp, updatedAt: _ua, ...data } = dto || {};
    if (data.password === '' || data.password == null) delete data.password;
    if (data.port != null && data.port !== '') data.port = parseInt(String(data.port), 10) || null;
    else if ('port' in data) data.port = null;
    if (typeof data.secure === 'string') data.secure = data.secure === 'true';
    await this.prisma.smtpSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });
    return this.get();
  }

  // @anchor smtp-build-transport
  // Buduje transport nodemailer z ustawień DB (panel = źródło prawdy); fallback do env SMTP_*.
  async buildTransport() {
    const s = await this.getRaw();
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
  async sendMail(opts: {
    to: string | string[];
    cc?: string | string[];
    subject: string;
    html?: string;
    text?: string;
    attachments?: any[];
  }) {
    const { transport, from, replyTo } = await this.buildTransport();
    return transport.sendMail({ from, replyTo, ...opts });
  }

  // @anchor smtp-send-test
  async sendTest(to: string) {
    if (!to || !to.includes('@')) throw new BadRequestException('Podaj poprawny adres odbiorcy testu.');
    await this.sendMail({
      to,
      subject: 'Test SMTP — GIGATEL ERP',
      html: `<p>To jest testowa wiadomość z konfiguracji SMTP w panelu ERP.</p><p>Jeśli ją widzisz — wysyłka działa ✅</p>`,
    });
    return { ok: true };
  }
}
