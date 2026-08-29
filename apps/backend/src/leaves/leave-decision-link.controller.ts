import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { LeaveRequestsService } from './leave-requests.service';

// @anchor escape-decision-page-html
const esc = (v: string) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// @anchor leave-decision-link-controller
/// Przyciski „Zatwierdz" / „Odrzuc" z maila — kontroler CELOWO bez JwtAuthGuard,
/// bo przelozony klika z klienta pocztowego, gdzie nie ma sesji aplikacji.
/// Tozsamosc i akcja pochodza z podpisanego tokenu, nie z parametrow URL.
@Controller('leave-requests')
export class LeaveDecisionLinkController {
  constructor(
    private readonly requests: LeaveRequestsService,
    private readonly config: ConfigService,
  ) {}

  // @anchor leave-withdrawal-link-endpoint
  /// Przycisk „Wycofaj zatwierdzony urlop …" z maila — osobny endpoint i osobny rodzaj
  /// tokenu, zeby podpis decyzji o wniosku nie dzialal na wycofanie i odwrotnie.
  @Get('withdrawal-link')
  async withdrawalLink(@Query('token') token: string, @Res() res: Response) {
    return this.renderResult(await this.requests.withdrawByToken(token), res);
  }

  // @anchor leave-decision-link-endpoint
  @Get('decision-link')
  async decisionLink(@Query('token') token: string, @Res() res: Response) {
    return this.renderResult(await this.requests.decideByToken(token), res);
  }

  // @anchor render-decision-result-page
  /// Wspolna strona wyniku dla obu przyciskow z maila.
  private renderResult(
    result: { ok: boolean; title: string; message: string; applicantName?: string; period?: string },
    res: Response,
  ) {
    const appUrl = `${this.config.get('FRONTEND_URL') || 'http://localhost:5174'}/urlopy`;
    const accent = result.ok ? '#2e7d32' : '#c62828';

    res.status(result.ok ? 200 : 400).type('html').send(`<!doctype html>
<html lang="pl"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>${esc(result.title)}</title></head>
<body style="margin:0;background:#0f172a;font-family:Arial,sans-serif;color:#e2e8f0">
  <div style="max-width:520px;margin:64px auto;padding:32px;background:#1e293b;border-radius:12px">
    <p style="margin:0 0 16px;color:#94a3b8;letter-spacing:.1em;font-size:12px">WNIOSKI URLOPOWE</p>
    <h1 style="margin:0 0 12px;font-size:22px;color:${accent}">${esc(result.title)}</h1>
    ${result.applicantName ? `<p style="margin:0 0 4px;font-size:15px">${esc(result.applicantName)}</p>` : ''}
    ${result.period ? `<p style="margin:0 0 16px;color:#94a3b8;font-size:14px">${esc(result.period)}</p>` : ''}
    <p style="margin:0 0 24px;line-height:1.5">${esc(result.message)}</p>
    <a href="${esc(appUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;
       padding:12px 24px;border-radius:6px">Otwórz moduł Urlopy</a>
  </div>
</body></html>`);
  }
}
