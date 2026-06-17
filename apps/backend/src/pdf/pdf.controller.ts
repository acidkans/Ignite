import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PdfService } from './pdf.service';

// @anchor pdf-controller
// POST /pdf/render — HTML → PDF (Chromium). Używany przez front zarówno do pobrania,
// jak i do wysyłki mailem raportów-wydruków (Oferta/Budżet/Wymagania/Materiały).
@Controller('pdf')
@UseGuards(JwtAuthGuard)
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Post('render')
  async render(@Body() body: { html: string; filename?: string }, @Res() res: Response) {
    const pdf = await this.pdfService.render(body?.html || '');
    const filename = (body?.filename || 'dokument.pdf').replace(/[^\w.\-]+/g, '_');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }
}
