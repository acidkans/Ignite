import { Injectable, BadRequestException } from '@nestjs/common';
import { SmtpService, SMTP_PROFILES } from '../smtp/smtp.service';
import { PrismaService } from '../prisma/prisma.service';

const COMPANY_SINGLETON_ID = 'singleton';
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const escapeHtml = (v: any) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fullName = (u: { firstName?: string | null; lastName?: string | null; email?: string | null }) =>
  [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || u?.email || '';

// @anchor format-leave-mail-date
// Data w mailach urlopowych — format wzorcowy „22.04.2025 00:00:00", strefa Europe/Warsaw.
const formatLeaveDate = (d: Date) =>
  new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);

const parseList = (v: any): string[] => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[;,]/);
  return arr.map((s) => String(s).trim()).filter((s) => s.includes('@'));
};

@Injectable()
export class MailService {
  constructor(
    private smtpService: SmtpService,
    private prisma: PrismaService,
  ) {}

  // @anchor mail-send-user-confirmation
  async sendUserConfirmation(user: any, token: string) {
    const url = `http://localhost:81/auth/confirm?token=${token}`; // TODO: ConfigService dla FRONTEND_URL
    await this.smtpService.sendMail({
      to: user.email,
      subject: 'Witaj w GIGATEL ERP! Potwierdź swój email',
      html: `
        <h1>Witaj ${escapeHtml(user.firstName || '')}!</h1>
        <p>Dziękujemy za rejestrację w systemie ERP.</p>
        <p><a href="${url}">Kliknij tutaj, aby potwierdzić konto</a></p>
        <br/>
        <small>Jeśli to nie Ty, zignoruj ten email.</small>
      `,
    });
  }

  // @anchor mail-send-leave-request
  // Powiadomienie przełożonego o złożonym wniosku urlopowym — układ jak w mailu wzorcowym:
  // nagłówek WNIOSKI URLOPOWE, kto i na jaki okres, komentarz, link do modułu Urlopy.
  async sendLeaveRequest(params: {
    to: string;
    applicantName: string;
    leaveTypeName?: string | null;
    dateStart: Date;
    dateEnd: Date;
    comment?: string | null;
    appUrl: string;
    // @anchor mail-leave-decision-buttons
    /// Linki z podpisanym tokenem — jedno klikniecie zapisuje decyzje bez logowania.
    approveUrl?: string;
    rejectUrl?: string;
  }) {
    const typeLabel = params.leaveTypeName ? ` ${params.leaveTypeName.toLowerCase()}` : '';
    const buttons =
      params.approveUrl && params.rejectUrl
        ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
            <tr>
              <td style="padding-right:12px">
                <a href="${escapeHtml(params.approveUrl)}"
                   style="display:inline-block;background:#2e7d32;color:#fff;text-decoration:none;
                          padding:12px 28px;border-radius:6px;font-weight:bold">Zatwierdź</a>
              </td>
              <td>
                <a href="${escapeHtml(params.rejectUrl)}"
                   style="display:inline-block;background:#c62828;color:#fff;text-decoration:none;
                          padding:12px 28px;border-radius:6px;font-weight:bold">Odrzuć</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 16px;color:#777;font-size:12px">
            Kliknięcie zapisuje decyzję od razu. Link działa 14 dni i tylko dopóki wniosek jest nierozpatrzony.
          </p>`
        : '';
    await this.smtpService.sendMail(
      {
        to: params.to,
        subject: `${params.applicantName} złożył/a wniosek o urlop${typeLabel}`,
        html: `
        <div style="font-family:Arial,sans-serif;color:#333">
          <p style="color:#8a6d3b;margin:0 0 16px">WNIOSKI URLOPOWE</p>
          <p style="margin:0">${escapeHtml(params.applicantName)}<br/>złożył/a wniosek urlopowy od:<br/>
            ${escapeHtml(formatLeaveDate(params.dateStart))} do ${escapeHtml(formatLeaveDate(params.dateEnd))}</p>
          ${params.comment ? `<p style="margin:16px 0">${escapeHtml(params.comment)}</p>` : ''}
          ${buttons}
          <p style="margin:24px 0 4px">Przejdź do aplikacji Urlopy</p>
          <p style="margin:0"><a href="${escapeHtml(params.appUrl)}">Link do aplikacji Urlopy</a></p>
        </div>
      `,
      },
      SMTP_PROFILES.LEAVES,
    );
  }

  // @anchor mail-send-leave-decision
  // Powiadomienie wnioskodawcy o decyzji przełożonego — ten sam układ co mail o złożeniu wniosku,
  // z rozstrzygnięciem i ewentualnym uzasadnieniem.
  async sendLeaveDecision(params: {
    to: string;
    applicantName: string;
    deciderName?: string | null;
    approved: boolean;
    leaveTypeName?: string | null;
    dateStart: Date;
    dateEnd: Date;
    decisionComment?: string | null;
    appUrl: string;
  }) {
    const verdict = params.approved ? 'zatwierdzony' : 'odrzucony';
    const color = params.approved ? '#2e7d32' : '#c62828';
    const typeLabel = params.leaveTypeName ? ` ${params.leaveTypeName.toLowerCase()}` : '';

    await this.smtpService.sendMail(
      {
        to: params.to,
        subject: `Twój wniosek o urlop${typeLabel} został ${verdict}`,
        html: `
        <div style="font-family:Arial,sans-serif;color:#333">
          <p style="color:#8a6d3b;margin:0 0 16px">WNIOSKI URLOPOWE</p>
          <p style="margin:0">${escapeHtml(params.applicantName)},<br/>
            Twój wniosek urlopowy od:<br/>
            ${escapeHtml(formatLeaveDate(params.dateStart))} do ${escapeHtml(formatLeaveDate(params.dateEnd))}<br/>
            został <strong style="color:${color}">${verdict}</strong>${params.deciderName ? ` przez: ${escapeHtml(params.deciderName)}` : ''}.</p>
          ${params.decisionComment ? `<p style="margin:16px 0">${escapeHtml(params.decisionComment)}</p>` : ''}
          <p style="margin:24px 0 4px">Przejdź do aplikacji Urlopy</p>
          <p style="margin:0"><a href="${escapeHtml(params.appUrl)}">Link do aplikacji Urlopy</a></p>
        </div>
      `,
      },
      SMTP_PROFILES.LEAVES,
    );
  }

  // @anchor mail-send-export
  // Wysyła DOKŁADNIE ten sam plik, który front pobiera lokalnie — jako załącznik.
  async sendExport(
    file: Express.Multer.File,
    body: { to?: any; cc?: any; subject?: string; message?: string; nodeId?: string },
  ) {
    if (!file) throw new BadRequestException('Brak pliku do wysłania.');
    const to = parseList(body?.to);
    if (!to.length) throw new BadRequestException('Podaj co najmniej jednego odbiorcę.');
    const cc = parseList(body?.cc);
    // multer dostarcza originalname w latin1 — przywróć UTF-8 dla polskich znaków
    const filename = Buffer.from(file.originalname || 'eksport', 'latin1').toString('utf8');
    const subject = (body?.subject || `Eksport: ${filename}`).slice(0, 250);
    const message = body?.message || '';
    await this.smtpService.sendMail({
      to,
      cc: cc.length ? cc : undefined,
      subject,
      html: message
        ? `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapeHtml(message)}</div>`
        : `<p style="font-family:Arial,sans-serif">W załączniku przesyłamy: <strong>${escapeHtml(filename)}</strong>.</p>`,
      attachments: [{ filename, content: file.buffer, contentType: file.mimetype }],
    });
    return { ok: true, sentTo: to, cc };
  }

  // @anchor mail-get-recipients
  // Agreguje sugerowane adresy dla danego węzła zamówienia: właściciel, uprawnieni
  // (użytkownicy + zespoły), kontakt klienta (OrderRequirements), kontakt lokalizacji
  // (Site), firma (Company) oraz cały aktywny zespół. Odduplikowane po adresie.
  async getRecipients(nodeId: string) {
    const out = new Map<string, { email: string; label: string; source: string }>();
    const add = (email: any, label: string, source: string) => {
      const e = String(email || '').trim().toLowerCase();
      if (!e || !e.includes('@')) return;
      if (!out.has(e)) out.set(e, { email: e, label: label || e, source });
    };

    if (nodeId) {
      const node = await this.prisma.processNode
        .findUnique({
          where: { id: nodeId },
          include: {
            owner: true,
            permissions: { include: { user: true, team: { include: { users: true } } } },
          },
        })
        .catch(() => null);
      if (node?.owner) add(node.owner.email, fullName(node.owner), 'Właściciel');
      for (const p of node?.permissions || []) {
        if (p.user) add(p.user.email, fullName(p.user), 'Uprawnienia');
        for (const u of p.team?.users || []) add(u.email, fullName(u), `Zespół: ${p.team?.name || ''}`);
      }

      const reqs = await this.prisma.orderRequirements.findMany({ where: { nodeId } }).catch(() => []);
      for (const r of reqs) {
        add(r.clientProjectManagerEmail, r.clientProjectManager || 'Kierownik projektu klienta', 'Kontakt klienta');
        for (const m of String(r.clientContacts || '').match(EMAIL_RE) || []) {
          add(m, 'Kontakt zamówienia', 'Kontakt zamówienia');
        }
      }

      const site = await this.prisma.site.findUnique({ where: { id: nodeId } }).catch(() => null);
      if (site) {
        add(
          site.contactEmail,
          [site.contactFirstName, site.contactLastName].filter(Boolean).join(' ') || 'Kontakt lokalizacji',
          'Lokalizacja',
        );
      }
    }

    const company = await this.prisma.company
      .findUnique({ where: { id: COMPANY_SINGLETON_ID } })
      .catch(() => null);
    if (company) {
      add(
        company.contactEmail,
        [company.contactFirstName, company.contactLastName].filter(Boolean).join(' ') || company.name || 'Moja firma',
        'Moja firma',
      );
    }

    const users = await this.prisma.user
      .findMany({ where: { isActive: true }, select: { email: true, firstName: true, lastName: true } })
      .catch(() => []);
    for (const u of users) add(u.email, fullName(u), 'Zespół');

    return [...out.values()];
  }
}
