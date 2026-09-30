// Raport PDF „Analiza AI oferty" — HTML renderowany na serwerze (PdfService, Chromium).
// Szablon (nagłówek z logo, marginesy) odwzorowuje `buildPdfDocument` z frontu
// (apps/frontend/src/utils/wbsPdfExport.js), żeby raport wyglądał jak pozostałe dokumenty.

const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (v: any) => (Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// @anchor offer-ai-severity-labels
export const OFFER_AI_SEVERITY: Record<string, { label: string; color: string; bg: string }> = {
    error: { label: 'Błąd', color: '#b91c1c', bg: '#fef2f2' },
    warning: { label: 'Ostrzeżenie', color: '#b45309', bg: '#fffbeb' },
    info: { label: 'Do sprawdzenia', color: '#0369a1', bg: '#f0f9ff' },
};
// @anchor offer-ai-category-labels
export const OFFER_AI_CATEGORY: Record<string, string> = {
    brak_w_budzecie: 'Brak w budżecie',
    brak_w_tekscie: 'Pozycja bez opisu',
    niezgodnosc_wartosci: 'Niezgodność wartości',
    sprzecznosc: 'Sprzeczność',
    miedzy_pozycjami: 'Niespójność między pozycjami',
};
const SOURCE: Record<string, string> = { oferta: 'Oferta', strategia: 'Strategia', budzet: 'Budżet' };

// @anchor offer-ai-report-filename
// „Analiza AI oferty - <nazwa oferty>.pdf" — stała dla oferty, więc ponowna analiza
// nadpisuje dokument (processDocument aktualizuje węzeł o tej samej nazwie).
export const offerAiReportFilename = (offerName: string) => {
    const safe = String(offerName || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
    return safe ? `Analiza AI oferty - ${safe}.pdf` : 'Analiza AI oferty.pdf';
};

const CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
  @page { margin: 0; size: A4 portrait; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .outer-wrap { border-collapse: collapse; width: 100%; }
  .outer-wrap > thead > tr > td { padding: 14mm 14mm 0 14mm; }
  .outer-wrap > tbody > tr > td { padding: 0 14mm; }
  .outer-wrap > tfoot > tr > td { padding: 0; height: 12mm; }
  thead { display: table-header-group; }
  .doc-header { border-bottom: 3px solid #1a1a2e; padding: 10px 0 8px 0; margin: 0 0 18px 0; display: flex; align-items: flex-start; gap: 16px; }
  .doc-header-logo { height: 48px; width: auto; object-fit: contain; }
  .doc-header h1 { font-size: 20px; margin: 0 0 2px 0; }
  .doc-header .sub { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #6b7280; }
  .doc-header .meta { font-size: 10px; color: #9ca3af; margin-top: 4px; }
  .ai-meta { font-size: 9px; color: #6b7280; margin: 0 0 10px 0; }
  .ai-box { border: 1px solid #e5e7eb; background: #f9fafb; padding: 8px 10px; margin: 0 0 10px 0; break-inside: avoid; }
  .ai-box h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 4px 0; color: #1d4ed8; }
  .ai-box p { margin: 0; font-size: 11px; line-height: 1.5; white-space: pre-wrap; }
  .ai-counts { margin: 0 0 12px 0; font-size: 10px; }
  .ai-counts span { display: inline-block; margin-right: 10px; font-weight: bold; }
  .ai-finding { border: 1px solid #e5e7eb; border-left-width: 4px; padding: 7px 10px; margin: 0 0 8px 0; break-inside: avoid; page-break-inside: avoid; }
  .ai-head { font-size: 10px; margin-bottom: 4px; }
  .ai-sev { font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; }
  .ai-branch { color: #1d4ed8; }
  .ai-quote { border-left: 2px solid #9ca3af; padding-left: 8px; font-style: italic; color: #4b5563; font-size: 10.5px; margin: 4px 0; }
  .ai-desc { font-size: 11px; margin: 4px 0; }
  .ai-items { font-size: 10px; color: #374151; margin: 4px 0 4px 14px; padding: 0; }
  .ai-sugg { font-size: 10.5px; color: #047857; margin-top: 4px; }
`;

// @anchor build-offer-ai-report-html
export function buildOfferAiReportHtml(result: any, projectName: string, logoDataUrl = ''): string {
    const findings: any[] = result?.findings || [];
    const counts = findings.reduce((acc: Record<string, number>, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
    const box = (title: string, text: string) => text ? `<div class="ai-box"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>` : '';
    const items = findings.map((f, i) => {
        const sev = OFFER_AI_SEVERITY[f.severity] || OFFER_AI_SEVERITY.info;
        const budget = (f.budgetItems || []).map((b: any) =>
            `<li>${esc(b.path)} — ${esc(b.quantity)} ${esc(b.unit)}, koszt ${money(b.totalCost)} PLN, cena ofert. ${money(b.offerPrice)} PLN</li>`).join('');
        return `<div class="ai-finding" style="border-left-color:${sev.color};background:${sev.bg};">
            <div class="ai-head"><b>${i + 1}.</b> <span class="ai-sev" style="color:${sev.color}">${sev.label}</span> · <b>${esc(OFFER_AI_CATEGORY[f.category] || f.category)}</b>${f.branch ? ` · <span class="ai-branch">${esc(f.branch)}</span>` : ''}</div>
            ${f.quote ? `<div class="ai-quote">${SOURCE[f.source] ? `<b>${SOURCE[f.source]}:</b> ` : ''}„${esc(f.quote)}"</div>` : ''}
            <div class="ai-desc">${esc(f.description)}</div>
            ${budget ? `<ul class="ai-items">${budget}</ul>` : ''}
            ${f.suggestion ? `<div class="ai-sugg"><b>Sugestia:</b> ${esc(f.suggestion)}</div>` : ''}
        </div>`;
    }).join('');
    const created = new Date(result.createdAt);
    const body = `
        <div class="ai-meta">${esc(created.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }))} · ${esc(result.model)} · sprawdzono ${result.itemsChecked} pozycji budżetu i ${result.strategiesChecked} strategii. Wynik AI to lista kontrolna do przejrzenia — model może coś przeoczyć albo zgłosić fałszywie.</div>
        ${box('Jak agent rozumie projekt', result.projectUnderstanding)}
        ${box('Ocena', result.summary)}
        <div class="ai-counts">${Object.entries(OFFER_AI_SEVERITY).map(([k, v]) => `<span style="color:${v.color}">${v.label}: ${counts[k] || 0}</span>`).join('')}</div>
        ${items || '<p>Nie znaleziono rozbieżności.</p>'}`;
    return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><title></title><style>${CSS}</style></head>
<body>
<table class="outer-wrap">
  <thead><tr><td>
    <div class="doc-header">
      ${logoDataUrl ? `<img class="doc-header-logo" src="${logoDataUrl}" alt="Logo" />` : ''}
      <div>
        <h1>Analiza AI oferty</h1>
        <div class="sub">${esc(projectName)}</div>
        <div class="meta">Przygotowano: ${esc(created.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div>
      </div>
    </div>
  </td></tr></thead>
  <tbody><tr><td>${body}</td></tr></tbody>
  <tfoot><tr><td></td></tr></tfoot>
</table>
</body></html>`;
}
