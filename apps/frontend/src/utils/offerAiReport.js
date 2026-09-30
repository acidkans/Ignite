// Raport „Analiza AI: oferta i strategie vs budżet" jako PDF w dokumentacji projektu.
// PDF powstaje tą samą drogą co pozostałe raporty (buildPdfDocument → /pdf/render),
// a trafia do dokumentów projektu (kategoria standard), więc czyta się go w panelu
// bocznym Dokumentacji obok edytowanego budżetu.
import { API_URL } from '../config';
import { buildPdfDocument, fetchLogoDataUrl, esc } from './wbsPdfExport';
import { renderHtmlToPdf } from './exportMail';

// @anchor offer-ai-report-filename
// „Analiza AI oferty - <nazwa oferty>.pdf". Nazwa stała dla danej oferty: ponowna analiza
// nadpisuje dokument (processDocument aktualizuje węzeł o tej samej nazwie), więc w
// dokumentacji zawsze leży jedna, najnowsza wersja. Znaki niedozwolone w nazwach plików → „_".
export const offerAiReportFilename = (offerName) => {
    const safe = String(offerName || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
    return safe ? `Analiza AI oferty - ${safe}.pdf` : 'Analiza AI oferty.pdf';
};

const SEVERITY = {
    error: { label: 'Błąd', color: '#b91c1c', bg: '#fef2f2' },
    warning: { label: 'Ostrzeżenie', color: '#b45309', bg: '#fffbeb' },
    info: { label: 'Do sprawdzenia', color: '#0369a1', bg: '#f0f9ff' },
};
const CATEGORY = {
    brak_w_budzecie: 'Brak w budżecie',
    brak_w_tekscie: 'Pozycja bez opisu',
    niezgodnosc_wartosci: 'Niezgodność wartości',
    sprzecznosc: 'Sprzeczność',
};
const SOURCE = { oferta: 'Oferta', strategia: 'Strategia', budzet: 'Budżet' };

const REPORT_CSS = `
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

const money = (v) => (Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// @anchor build-offer-ai-report-html
export function buildOfferAiReportBody(result) {
    const findings = result?.findings || [];
    const counts = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
    const box = (title, text) => text ? `<div class="ai-box"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>` : '';
    const items = findings.map((f, i) => {
        const sev = SEVERITY[f.severity] || SEVERITY.info;
        const budget = (f.budgetItems || []).map(b =>
            `<li>${esc(b.path)} — ${esc(b.quantity)} ${esc(b.unit)}, koszt ${money(b.totalCost)} PLN, cena ofert. ${money(b.offerPrice)} PLN</li>`).join('');
        return `<div class="ai-finding" style="border-left-color:${sev.color};background:${sev.bg};">
            <div class="ai-head"><b>${i + 1}.</b> <span class="ai-sev" style="color:${sev.color}">${sev.label}</span> · <b>${esc(CATEGORY[f.category] || f.category)}</b>${f.branch ? ` · <span class="ai-branch">${esc(f.branch)}</span>` : ''}</div>
            ${f.quote ? `<div class="ai-quote">${SOURCE[f.source] ? `<b>${SOURCE[f.source]}:</b> ` : ''}„${esc(f.quote)}"</div>` : ''}
            <div class="ai-desc">${esc(f.description)}</div>
            ${budget ? `<ul class="ai-items">${budget}</ul>` : ''}
            ${f.suggestion ? `<div class="ai-sugg"><b>Sugestia:</b> ${esc(f.suggestion)}</div>` : ''}
        </div>`;
    }).join('');
    return `
        <div class="ai-meta">${esc(new Date(result.createdAt).toLocaleString('pl-PL'))} · ${esc(result.model)} · sprawdzono ${result.itemsChecked} pozycji budżetu i ${result.strategiesChecked} strategii. Wynik AI to lista kontrolna do przejrzenia — model może coś przeoczyć albo zgłosić fałszywie.</div>
        ${box('Jak agent rozumie projekt', result.projectUnderstanding)}
        ${box('Ocena', result.summary)}
        <div class="ai-counts">${Object.entries(SEVERITY).map(([k, v]) => `<span style="color:${v.color}">${v.label}: ${counts[k] || 0}</span>`).join('')}</div>
        ${items || '<p>Nie znaleziono rozbieżności.</p>'}`;
}

// @anchor save-offer-ai-report-to-docs
// Renderuje raport do PDF i wgrywa go do dokumentacji projektu. Zwraca nazwę pliku.
// Po zapisie wysyła zdarzenie `documents-changed`, żeby otwarty panel Dokumentacji
// odświeżył listę bez przeładowania.
export async function saveOfferAiReportToDocs({ result, nodeId, projectName }) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const html = buildPdfDocument({
        logoDataUrl: await fetchLogoDataUrl(),
        title: 'Analiza AI: oferta i strategie vs budżet',
        subtitle: projectName || '',
        date: new Date(result.createdAt).toLocaleDateString('pl-PL'),
        bodyHtml: buildOfferAiReportBody(result),
        extraCss: REPORT_CSS,
    });
    const filename = offerAiReportFilename(projectName);
    const pdf = await renderHtmlToPdf(html, filename);
    const form = new FormData();
    form.append('file', new File([pdf], filename, { type: 'application/pdf' }));
    form.append('nodeId', nodeId);
    form.append('category', 'standard');
    const res = await fetch(`${API_URL}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    if (!res.ok) throw new Error(`Zapis do dokumentacji nieudany (HTTP ${res.status})`);
    window.dispatchEvent(new CustomEvent('documents-changed', { detail: { nodeId } }));
    return filename;
}
