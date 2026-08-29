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

// @anchor overlapping-absence
/// Wiersz sekcji „W tym samym czasie na urlopie" w mailu z wnioskiem.
export interface OverlappingAbsence {
  name: string;
  company?: string | null;
  leaveTypeName?: string | null;
  dateStart: Date;
  dateEnd: Date;
  /// true = wniosek jeszcze nierozpatrzony (kolizja moze, ale nie musi sie ziscic)
  pending: boolean;
  /// true = to nieobecnosc samego wnioskodawcy w tym samym terminie — kolizja
  /// wazniejsza niz cudza, bo oznacza dwa urlopy tej samej osoby naraz
  self?: boolean;
}

// @anchor format-leave-mail-day
/// Sama data, bez godziny — do zestawienia kolizji urlopowych.
const formatLeaveDay = (d: Date) =>
  new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

// @anchor mail-overlapping-absences-block
/// Zestawienie „kto jeszcze bedzie nieobecny w tym terminie" — przelozony ma widziec
/// obsade zanim kliknie Zatwierdz. Pusta lista tez sie renderuje, bo brak kolizji
/// jest informacja tak samo istotna jak kolizja.
const overlappingBlock = (rows: OverlappingAbsence[] | undefined) => {
  if (!rows) return '';
  if (!rows.length) {
    return `<p style="margin:16px 0;padding:10px 12px;background:#f1f8f1;border-left:3px solid #2e7d32">
      W tym terminie <strong>nikt inny nie jest nieobecny</strong>.</p>`;
  }
  const cell = 'padding:6px 10px;border-bottom:1px solid #e0e0e0;font-size:13px';
  const body = rows
    .map(
      r => `<tr${r.self ? ' style="background:#fdf3f3"' : ''}>
        <td style="${cell}">${escapeHtml(r.name)}${
          r.self ? ' <strong style="color:#c62828">— TEN SAM PRACOWNIK</strong>' : ''
        }</td>
        <td style="${cell};color:#666">${escapeHtml(r.company || '')}</td>
        <td style="${cell}">${escapeHtml(formatLeaveDay(r.dateStart))} – ${escapeHtml(formatLeaveDay(r.dateEnd))}</td>
        <td style="${cell};color:#666">${escapeHtml(r.leaveTypeName || '')}</td>
        <td style="${cell};color:${r.pending ? '#8a6d3b' : '#2e7d32'}">${r.pending ? 'wniosek nierozpatrzony' : 'zatwierdzony'}</td>
      </tr>`,
    )
    .join('');
  const selfClash = rows.filter(r => r.self).length;
  return `
    <p style="margin:20px 0 6px;font-weight:bold">W tym samym czasie nieobecni (${rows.length}):</p>
    ${
      selfClash
        ? `<p style="margin:0 0 8px;padding:10px 12px;background:#fdf3f3;border-left:3px solid #c62828">
             <strong>Uwaga:</strong> ten pracownik ma już ${selfClash === 1 ? 'inną nieobecność' : `${selfClash} inne nieobecności`}
             w tym terminie — dwa urlopy tej samej osoby naraz.</p>`
        : ''
    }
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
      <tr style="background:#fafafa">
        <th align="left" style="${cell};font-size:12px;color:#555">Pracownik</th>
        <th align="left" style="${cell};font-size:12px;color:#555">Firma</th>
        <th align="left" style="${cell};font-size:12px;color:#555">Okres</th>
        <th align="left" style="${cell};font-size:12px;color:#555">Rodzaj</th>
        <th align="left" style="${cell};font-size:12px;color:#555">Status</th>
      </tr>
      ${body}
    </table>`;
};

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
    // @anchor mail-leave-request-overlapping
    /// Kto jeszcze bedzie nieobecny w tym terminie. Pusta tablica = brak kolizji
    /// (mail to napisze wprost); undefined = sekcji nie pokazujemy w ogole.
    overlapping?: OverlappingAbsence[];
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
          ${overlappingBlock(params.overlapping)}
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

  // @anchor mail-send-leave-approval-broadcast
  /// Powiadomienie pozostalych managerow o zatwierdzonym urlopie osoby kluczowej
  /// (logistyk / manager). Jeden mail do calej grupy — adresaci widza sie nawzajem,
  /// bo to wewnetrzna informacja o obsadzie, nie korespondencja masowa.
  /// Do listy dolaczamy zestawienie innych nieobecnosci w tym samym terminie.
  async sendLeaveApprovalBroadcast(params: {
    recipients: string[];
    employeeName: string;
    employeeCompany?: string | null;
    employeeRoleLabel?: string | null;
    deciderName?: string | null;
    leaveTypeName?: string | null;
    dateStart: Date;
    dateEnd: Date;
    daysCount?: number | null;
    appUrl: string;
    overlapping?: OverlappingAbsence[];
  }) {
    const recipients = params.recipients.filter(e => e && e.includes('@'));
    if (!recipients.length) return;
    const typeLabel = params.leaveTypeName ? ` (${params.leaveTypeName})` : '';
    const who = [params.employeeRoleLabel, params.employeeCompany].filter(Boolean).join(', ');

    await this.smtpService.sendMail(
      {
        to: recipients,
        subject: `Zatwierdzony urlop: ${params.employeeName}${typeLabel}`,
        html: `
        <div style="font-family:Arial,sans-serif;color:#333">
          <p style="color:#8a6d3b;margin:0 0 16px">WNIOSKI URLOPOWE — INFORMACJA DLA MANAGERÓW</p>
          <p style="margin:0"><strong>${escapeHtml(params.employeeName)}</strong>${who ? ` (${escapeHtml(who)})` : ''}<br/>
            ma <strong style="color:#2e7d32">zatwierdzony urlop</strong> od:<br/>
            ${escapeHtml(formatLeaveDate(params.dateStart))} do ${escapeHtml(formatLeaveDate(params.dateEnd))}
            ${params.daysCount ? ` — ${escapeHtml(params.daysCount)} dni` : ''}</p>
          ${params.deciderName ? `<p style="margin:12px 0 0;color:#666">Decyzję podjął: ${escapeHtml(params.deciderName)}</p>` : ''}
          ${overlappingBlock(params.overlapping)}
          <p style="margin:24px 0 4px">Przejdź do aplikacji Urlopy</p>
          <p style="margin:0"><a href="${escapeHtml(params.appUrl)}">Link do aplikacji Urlopy</a></p>
        </div>
      `,
      },
      SMTP_PROFILES.LEAVES,
    );
  }

  // @anchor mail-send-leave-request-deleted
  /// Powiadomienie wnioskodawcy, ze jego wniosek zostal usuniety przez kogos innego.
  /// Usuniecie nie jest odrzuceniem — wniosek znika bez sladu w module, wiec bez maila
  /// pracownik nie ma jak sie o tym dowiedziec. Przy wniosku juz zatwierdzonym mowimy
  /// wprost, ze dni wrocily do puli, a wpis zniknal z kalendarza.
  async sendLeaveRequestDeleted(params: {
    to: string;
    applicantName: string;
    deletedByName?: string | null;
    leaveTypeName?: string | null;
    dateStart: Date;
    dateEnd: Date;
    wasApproved: boolean;
    appUrl: string;
  }) {
    const typeLabel = params.leaveTypeName ? ` ${params.leaveTypeName.toLowerCase()}` : '';
    await this.smtpService.sendMail(
      {
        to: params.to,
        subject: `Twój wniosek o urlop${typeLabel} został usunięty`,
        html: `
        <div style="font-family:Arial,sans-serif;color:#333">
          <p style="color:#8a6d3b;margin:0 0 16px">WNIOSKI URLOPOWE</p>
          <p style="margin:0">${escapeHtml(params.applicantName)},<br/>
            Twój wniosek urlopowy od:<br/>
            ${escapeHtml(formatLeaveDate(params.dateStart))} do ${escapeHtml(formatLeaveDate(params.dateEnd))}<br/>
            został <strong style="color:#c62828">usunięty</strong>${params.deletedByName ? ` przez: ${escapeHtml(params.deletedByName)}` : ''}.</p>
          ${
            params.wasApproved
              ? `<p style="margin:16px 0;padding:10px 12px;background:#f1f8f1;border-left:3px solid #2e7d32">
                   Wniosek był wcześniej zatwierdzony — dni wróciły do Twojej puli, a wpis zniknął z kalendarza urlopowego.</p>`
              : ''
          }
          <p style="margin:16px 0 0">Jeśli urlop jest Ci nadal potrzebny, złóż wniosek ponownie w aplikacji.</p>
          <p style="margin:24px 0 4px">Przejdź do aplikacji Urlopy</p>
          <p style="margin:0"><a href="${escapeHtml(params.appUrl)}">Link do aplikacji Urlopy</a></p>
        </div>
      `,
      },
      SMTP_PROFILES.LEAVES,
    );
  }

  // @anchor mail-send-leave-request-withdrawn
  /// Powiadomienie przelozonego, ze pracownik sam wycofal swoj wniosek.
  /// Przelozony ma w skrzynce maila z przyciskami Zatwierdz / Odrzuc — od tej chwili
  /// prowadza one do „Wniosek nie istnieje", wiec mail mowi o tym wprost.
  async sendLeaveRequestWithdrawn(params: {
    to: string;
    applicantName: string;
    leaveTypeName?: string | null;
    dateStart: Date;
    dateEnd: Date;
    wasApproved: boolean;
    appUrl: string;
  }) {
    const typeLabel = params.leaveTypeName ? ` ${params.leaveTypeName.toLowerCase()}` : '';
    await this.smtpService.sendMail(
      {
        to: params.to,
        subject: `${params.applicantName} wycofał/a wniosek o urlop${typeLabel}`,
        html: `
        <div style="font-family:Arial,sans-serif;color:#333">
          <p style="color:#8a6d3b;margin:0 0 16px">WNIOSKI URLOPOWE</p>
          <p style="margin:0"><strong>${escapeHtml(params.applicantName)}</strong><br/>
            wycofał/a swój wniosek urlopowy od:<br/>
            ${escapeHtml(formatLeaveDate(params.dateStart))} do ${escapeHtml(formatLeaveDate(params.dateEnd))}</p>
          <p style="margin:16px 0;padding:10px 12px;background:#fdf9ee;border-left:3px solid #8a6d3b">
            Nie musisz nic robić. Przyciski <strong>Zatwierdź</strong> i <strong>Odrzuć</strong> z wcześniejszej
            wiadomości o tym wniosku już nie działają${
              params.wasApproved
                ? ' — wniosek był zatwierdzony, więc dni wróciły do puli pracownika, a wpis zniknął z kalendarza urlopowego'
                : ''
            }.</p>
          <p style="margin:24px 0 4px">Przejdź do aplikacji Urlopy</p>
          <p style="margin:0"><a href="${escapeHtml(params.appUrl)}">Link do aplikacji Urlopy</a></p>
        </div>
      `,
      },
      SMTP_PROFILES.LEAVES,
    );
  }

  // @anchor mail-send-leave-withdrawal-request
  /// Prosba pracownika o wycofanie ZATWIERDZONEGO urlopu — mail do przelozonego.
  /// Glowny przycisk nazywa akcje wprost razem z nazwiskiem, bo przelozony moze miec
  /// w skrzynce kilka takich prosb naraz i musi widziec, czyj urlop wycofuje.
  async sendLeaveWithdrawalRequest(params: {
    to: string;
    applicantName: string;
    leaveTypeName?: string | null;
    dateStart: Date;
    dateEnd: Date;
    daysCount?: number | null;
    reason?: string | null;
    appUrl: string;
    confirmUrl?: string;
    rejectUrl?: string;
  }) {
    const typeLabel = params.leaveTypeName ? ` ${params.leaveTypeName.toLowerCase()}` : '';
    const buttons =
      params.confirmUrl && params.rejectUrl
        ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
            <tr>
              <td style="padding-right:12px">
                <a href="${escapeHtml(params.confirmUrl)}"
                   style="display:inline-block;background:#c62828;color:#fff;text-decoration:none;
                          padding:12px 28px;border-radius:6px;font-weight:bold">Wycofaj zatwierdzony urlop ${escapeHtml(params.applicantName)}</a>
              </td>
              <td>
                <a href="${escapeHtml(params.rejectUrl)}"
                   style="display:inline-block;background:#455a64;color:#fff;text-decoration:none;
                          padding:12px 28px;border-radius:6px;font-weight:bold">Zostaw urlop</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 16px;color:#777;font-size:12px">
            Kliknięcie zapisuje decyzję od razu. Link działa 14 dni i tylko dopóki urlop nie został wycofany.
          </p>`
        : '';

    await this.smtpService.sendMail(
      {
        to: params.to,
        subject: `${params.applicantName} prosi o wycofanie zatwierdzonego urlopu${typeLabel}`,
        html: `
        <div style="font-family:Arial,sans-serif;color:#333">
          <p style="color:#8a6d3b;margin:0 0 16px">WNIOSKI URLOPOWE</p>
          <p style="margin:0"><strong>${escapeHtml(params.applicantName)}</strong><br/>
            prosi o wycofanie ZATWIERDZONEGO urlopu od:<br/>
            ${escapeHtml(formatLeaveDate(params.dateStart))} do ${escapeHtml(formatLeaveDate(params.dateEnd))}
            ${params.daysCount ? ` — ${escapeHtml(params.daysCount)} dni` : ''}</p>
          ${params.reason ? `<p style="margin:16px 0">${escapeHtml(params.reason)}</p>` : ''}
          <p style="margin:16px 0;padding:10px 12px;background:#fdf9ee;border-left:3px solid #8a6d3b">
            Do czasu Twojej decyzji urlop <strong>nadal obowiązuje</strong>. Potwierdzenie odda dni do puli
            pracownika i skasuje wpis z kalendarza urlopowego.</p>
          ${buttons}
          <p style="margin:24px 0 4px">Przejdź do aplikacji Urlopy</p>
          <p style="margin:0"><a href="${escapeHtml(params.appUrl)}">Link do aplikacji Urlopy</a></p>
        </div>
      `,
      },
      SMTP_PROFILES.LEAVES,
    );
  }

  // @anchor mail-send-leave-withdrawal-decision
  /// Decyzja przelozonego o prosbie o wycofanie — mail do pracownika.
  async sendLeaveWithdrawalDecision(params: {
    to: string;
    applicantName: string;
    deciderName?: string | null;
    confirmed: boolean;
    leaveTypeName?: string | null;
    dateStart: Date;
    dateEnd: Date;
    appUrl: string;
  }) {
    const verdict = params.confirmed ? 'wycofany' : 'utrzymany w mocy';
    const color = params.confirmed ? '#c62828' : '#2e7d32';
    const typeLabel = params.leaveTypeName ? ` ${params.leaveTypeName.toLowerCase()}` : '';

    await this.smtpService.sendMail(
      {
        to: params.to,
        subject: params.confirmed
          ? `Twój urlop${typeLabel} został wycofany`
          : `Odmowa wycofania urlopu${typeLabel}`,
        html: `
        <div style="font-family:Arial,sans-serif;color:#333">
          <p style="color:#8a6d3b;margin:0 0 16px">WNIOSKI URLOPOWE</p>
          <p style="margin:0">${escapeHtml(params.applicantName)},<br/>
            Twój zatwierdzony urlop od:<br/>
            ${escapeHtml(formatLeaveDate(params.dateStart))} do ${escapeHtml(formatLeaveDate(params.dateEnd))}<br/>
            został <strong style="color:${color}">${verdict}</strong>${params.deciderName ? ` przez: ${escapeHtml(params.deciderName)}` : ''}.</p>
          <p style="margin:16px 0;padding:10px 12px;background:${params.confirmed ? '#f1f8f1' : '#fdf9ee'};border-left:3px solid ${params.confirmed ? '#2e7d32' : '#8a6d3b'}">
            ${
              params.confirmed
                ? 'Dni wróciły do Twojej puli, a wpis zniknął z kalendarza urlopowego.'
                : 'Urlop pozostaje w mocy — dni nie wróciły do puli, wpis zostaje w kalendarzu.'
            }</p>
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
