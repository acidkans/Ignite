import { Injectable, Logger } from '@nestjs/common';

// puppeteer ładowany leniwie — Chromium startuje dopiero przy pierwszym renderze,
// żeby brak przeglądarki (np. dev bez instalacji) nie wywracał całego backendu na starcie.

@Injectable()
export class PdfService {
  private readonly logger = new Logger('PdfService');

  // @anchor pdf-render
  // Renderuje pełny dokument HTML do PDF tym samym silnikiem co druk przeglądarki
  // (Chromium) — dzięki temu plik jest IDENTYCZNY z „Zapisz jako PDF" z front-endu.
  // Świeża instancja na każdy render — prościej i pewniej niż współdzielona przy sporadycznych eksportach.
  // UWAGA: bez `--single-process` — ta flaga wywala `page.pdf()` (TargetCloseError: Target closed).
  async render(html: string): Promise<Buffer> {
    // puppeteer jest ESM-only; Node 18 (prod) nie wspiera require() ESM (ERR_REQUIRE_ESM).
    // Ładujemy przez natywny dynamiczny import(); `new Function` chroni go przed downlevelem
    // tsc do require() (tsconfig ma module: commonjs).
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    const mod = await dynamicImport('puppeteer');
    const puppeteer = mod.default || mod;
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html || '<html><body></body></html>', { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      return Buffer.from(pdf);
    } catch (e) {
      this.logger.error('Render PDF nieudany', e as any);
      throw e;
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
