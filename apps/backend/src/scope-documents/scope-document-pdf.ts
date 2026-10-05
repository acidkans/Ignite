// „Opis zakresu prac" — załącznik do oferty renderowany na serwerze (PdfService, Chromium).
// Struktura stała (docs/PLAN-opis-zakresu-oferty.md): nagłówek z metryczką, 9 sekcji, podpisy.
// Wzór wizualny: test/5G-Agencja-opis-zakresu-WZOR.pdf.

const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const fmtQty = (v: number) => (Math.round(v * 100) / 100).toLocaleString('pl-PL');

// @anchor scope-md-to-html
// Minimalny markdown edytora (MarkdownEditor): # ## ###, listy - i 1., **pogrubienie**, akapity.
export function scopeMdToHtml(text: string): string {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    let html = '';
    let list: 'ul' | 'ol' | null = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of lines) {
        const line = raw.trimEnd();
        const h = line.match(/^(#{1,3}) (.+)/);
        const ul = line.match(/^\s*[-*] (.*)/);
        const ol = line.match(/^\s*\d+\. (.*)/);
        if (h) { close(); html += `<h4>${inline(h[2])}</h4>`; }
        else if (ul) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(ul[1])}</li>`; }
        else if (ol) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(ol[1])}</li>`; }
        else if (!line.trim()) { close(); }
        else { close(); html += `<p>${inline(line)}</p>`; }
    }
    close();
    return html;
}

// @anchor scope-document-model-type
export type ScopeDocumentModel = {
    logoDataUrl: string;
    companyName: string;
    title: string;
    subject: string;
    investor: string;
    client: { name: string; address: string; nip: string; logoDataUrl: string };
    clientContact: string;
    airtelContact: string;
    offerNumber: string;
    revisionLabel: string;
    versionLabel: string;
    date: string;
    validityDays: number;
    warrantyMonths: number;
    term: string;
    workDuration: string;
    locations: string[];
    packages: string[];
    matrix: boolean[][]; // [pakiet][lokalizacja]
    quantities: { name: string; unit: string; perLocation: number[]; total: number }[];
    sections: Record<string, any>;
};

const CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10.5px; color: #111; line-height: 1.45; }
  @page { margin: 0; size: A4 portrait; }
  .outer-wrap { border-collapse: collapse; width: 100%; }
  .outer-wrap > thead > tr > td { padding: 12mm 16mm 0 16mm; }
  .outer-wrap > tbody > tr > td { padding: 0 16mm; }
  .outer-wrap > tfoot > tr > td { padding: 0; height: 12mm; }
  thead { display: table-header-group; }
  .run-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #d1d5db; padding-bottom: 5px; margin-bottom: 14px; font-size: 8.5px; color: #6b7280; }
  .run-head img { height: 22px; }
  .cover { display: flex; justify-content: space-between; align-items: flex-start; margin: 4px 0 14px 0; }
  .cover img { max-height: 54px; max-width: 200px; object-fit: contain; }
  .doc-kind { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b7280; margin: 0 0 4px 0; }
  h1 { font-size: 22px; margin: 0 0 4px 0; color: #1a1a2e; line-height: 1.2; }
  .lead { font-size: 11px; color: #374151; margin: 0 0 14px 0; }
  table.meta { width: 100%; border-collapse: collapse; margin: 0 0 8px 0; }
  table.meta td { border: 1px solid #e5e7eb; padding: 5px 8px; vertical-align: top; }
  table.meta td.k { width: 32%; background: #f3f4f6; font-size: 8.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; }
  .note { font-size: 9.5px; color: #6b7280; font-style: italic; margin: 6px 0 0 0; }
  h2 { font-size: 13px; color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 3px; margin: 18px 0 8px 0; break-after: avoid; }
  h3 { font-size: 11.5px; margin: 12px 0 4px 0; color: #1d4ed8; break-after: avoid; }
  h4 { font-size: 11px; margin: 8px 0 3px 0; }
  p { margin: 0 0 5px 0; }
  ul, ol { margin: 2px 0 6px 0; padding-left: 18px; }
  li { margin: 1px 0; }
  table.grid { width: 100%; border-collapse: collapse; margin: 6px 0 4px 0; break-inside: auto; }
  table.grid th, table.grid td { border: 1px solid #d1d5db; padding: 4px 6px; }
  table.grid th { background: #1a1a2e; color: #fff; font-size: 9px; text-align: center; }
  table.grid td.c { text-align: center; }
  table.grid td.n { text-align: right; white-space: nowrap; }
  table.grid tr { break-inside: avoid; }
  table.grid td.sum, table.grid th.sum { font-weight: bold; background: #f3f4f6; color: #111; }
  .dot { color: #1d4ed8; font-size: 12px; }
  .dash { color: #9ca3af; }
  .sign { display: flex; gap: 40px; margin-top: 46px; break-inside: avoid; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; font-size: 9.5px; text-align: center; }
  .section { break-inside: auto; }
  .empty { color: #9ca3af; }
`;

// @anchor build-scope-document-html
export function buildScopeDocumentHtml(m: ScopeDocumentModel): string {
    const s = m.sections || {};
    const hasLoc = m.locations.length > 0;
    // Metryczka też stała: brak danych = „—", wiersz zostaje (wyjątek: Lokalizacje bez podziału).
    const metaRow = (k: string, v: string) => `<tr><td class="k">${esc(k)}</td><td>${v || '<span class="empty">—</span>'}</td></tr>`;
    const clientCell = [esc(m.client.name), esc(m.client.address), m.client.nip ? `NIP ${esc(m.client.nip)}` : ''].filter(Boolean).join('<br>');

    // Struktura stała: zawsze 9 sekcji w tej samej kolejności i numeracji — pusta sekcja pokazuje „—".
    const sec = (no: number, title: string, body: string) =>
        `<div class="section"><h2>${no}. ${esc(title)}</h2>${body || '<p class="empty">—</p>'}</div>`;

    // 3. Struktura zakresu
    let structure = '';
    if (m.packages.length) {
        if (hasLoc) {
            structure = `<p>Zakres w każdej lokalizacji składa się z poniższych pakietów prac. Tabela pokazuje, które pakiety występują w danym obiekcie.</p>
            <table class="grid"><thead><tr><th style="text-align:left">Pakiet prac</th>${m.locations.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>
            ${m.packages.map((p, i) => `<tr><td>${esc(p)}</td>${m.locations.map((_, j) => `<td class="c">${m.matrix[i]?.[j] ? '<span class="dot">●</span>' : '<span class="dash">—</span>'}</td>`).join('')}</tr>`).join('')}
            </tbody></table>`;
        } else {
            structure = `<p>Zakres obejmuje następujące pakiety prac:</p><ol>${m.packages.map(p => `<li>${esc(p)}</li>`).join('')}</ol>`;
        }
    }

    // 4. Opis pakietów
    const pkgTexts = s.packages || {};
    const packagesBody = m.packages.map((p, i) => {
        const t = String(pkgTexts[p] || '').trim();
        return `<h3>4.${i + 1} ${esc(p)}</h3>${t ? scopeMdToHtml(t) : '<p class="empty">—</p>'}`;
    }).join('');

    // 5. Zakres ilościowy
    let qty = '';
    if (m.quantities.length) {
        qty = hasLoc
            ? `<table class="grid"><thead><tr><th style="text-align:left">Element</th><th>j.m.</th>${m.locations.map(l => `<th>${esc(l)}</th>`).join('')}<th class="sum">Razem</th></tr></thead><tbody>
               ${m.quantities.map(q => `<tr><td>${esc(q.name)}</td><td class="c">${esc(q.unit)}</td>${q.perLocation.map(v => `<td class="n">${v ? fmtQty(v) : '<span class="dash">—</span>'}</td>`).join('')}<td class="n sum">${fmtQty(q.total)}</td></tr>`).join('')}
               </tbody></table>`
            : `<table class="grid"><thead><tr><th style="text-align:left">Element</th><th>Ilość</th><th>j.m.</th></tr></thead><tbody>
               ${m.quantities.map(q => `<tr><td>${esc(q.name)}</td><td class="n">${fmtQty(q.total)}</td><td class="c">${esc(q.unit)}</td></tr>`).join('')}
               </tbody></table>`;
    }

    const organization = scopeMdToHtml(s.organization || '') + (m.workDuration ? `<p>Szacowany czas prac: <strong>${esc(m.workDuration)}</strong>.</p>` : '');
    const acceptance = scopeMdToHtml(s.acceptance || '') + (m.warrantyMonths ? `<ul><li>Gwarancja ${m.warrantyMonths} miesięcy.</li></ul>` : '');

    const body = `
      ${m.client.logoDataUrl || m.logoDataUrl ? `<div class="cover">
        <div>${m.client.logoDataUrl ? `<img src="${m.client.logoDataUrl}" alt="">` : ''}</div>
        <div>${m.logoDataUrl ? `<img src="${m.logoDataUrl}" alt="">` : ''}</div>
      </div>` : ''}
      <div class="doc-kind">Opis zakresu prac</div>
      <h1>${esc(m.title)}</h1>
      <div class="lead">Załącznik do oferty${hasLoc ? ` — ${m.locations.length} lokalizacj${m.locations.length === 1 ? 'a' : (m.locations.length < 5 ? 'e' : 'i')}: ${esc(m.locations.join(', '))}` : ''}</div>
      <table class="meta">
        ${metaRow('Zamawiający', clientCell)}
        ${metaRow('Inwestor / odbiorca końcowy', esc(m.investor))}
        ${metaRow('Przedmiot', esc(m.subject))}
        ${hasLoc ? metaRow('Lokalizacje', `${m.locations.length}: ${esc(m.locations.join(', '))}`) : ''}
        ${metaRow('Nr oferty', esc(m.offerNumber || '— nadawany przy zapisie —'))}
        ${metaRow('Wersja dokumentu', `${esc(m.revisionLabel)}${m.versionLabel ? ` · podstawa: wycena „${esc(m.versionLabel)}”` : ''}`)}
        ${metaRow('Data', esc(m.date))}
        ${metaRow('Ważność oferty', `${m.validityDays} dni`)}
        ${metaRow('Planowany termin realizacji', esc(m.term))}
        ${metaRow('Kontakt — Zamawiający', esc(m.clientContact))}
        ${metaRow(`Kontakt — ${m.companyName || 'Wykonawca'}`, esc(m.airtelContact))}
      </table>
      <div class="note">Dokument opisuje zakres rzeczowy objęty ofertą. Warunki handlowe i ceny — w ofercie cenowej.</div>
      ${sec(1, 'Przedmiot i cel projektu', scopeMdToHtml(s.goal || ''))}
      ${sec(2, 'Sytuacja wyjściowa i założenia', scopeMdToHtml(s.assumptions || ''))}
      ${sec(3, 'Struktura zakresu', structure)}
      ${sec(4, 'Opis pakietów prac', packagesBody)}
      ${sec(5, hasLoc ? 'Zakres ilościowy w lokalizacjach' : 'Zakres ilościowy', qty)}
      ${sec(6, `Dostawy po stronie ${m.companyName || 'Wykonawcy'}`, scopeMdToHtml(s.supplies || ''))}
      ${sec(7, 'Poza zakresem / po stronie Zamawiającego', scopeMdToHtml(s.exclusions || ''))}
      ${sec(8, 'Organizacja realizacji', organization)}
      ${sec(9, 'Dokumentacja i odbiór', acceptance)}
      <div class="sign"><div>Zamawiający — data i podpis</div><div>${esc(m.companyName || 'Wykonawca')} — data i podpis</div></div>`;

    return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><title>Opis zakresu prac</title><style>${CSS}</style></head>
<body>
<table class="outer-wrap">
  <thead><tr><td><div class="run-head"><span>Opis zakresu prac${m.offerNumber ? ` · oferta ${esc(m.offerNumber)}` : ''} · wersja ${esc(m.revisionLabel)}</span>${m.logoDataUrl ? `<img src="${m.logoDataUrl}" alt="">` : ''}</div></td></tr></thead>
  <tbody><tr><td>${body}</td></tr></tbody>
  <tfoot><tr><td></td></tr></tfoot>
</table>
</body></html>`;
}
