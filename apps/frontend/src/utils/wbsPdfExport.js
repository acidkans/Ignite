import { fmtPLN } from '../components/shared/wbs/wbsConstants';

export const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const PDF_BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 0; }
  .doc-header { border-bottom: 3px solid #1a1a2e; padding: 10px 0 8px 0; margin: 0 0 18px 0; display: flex; align-items: flex-start; gap: 16px; }
  .doc-header-logo { height: 48px; width: auto; object-fit: contain; flex-shrink: 0; }
  .doc-header-text { flex: 0 0 auto; }
  .doc-header h1 { font-size: 20px; margin: 0 0 2px 0; }
  .doc-header .sub { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #6b7280; }
  .doc-header .meta { font-size: 10px; color: #9ca3af; margin-top: 4px; }
  .section { margin-bottom: 22px; }
  .section-header { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.12em; background: #1a1a2e; color: #fff; padding: 7px 12px; break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
  h1, h2, h3, h4, h5, h6, .section-header, .table-title, .md-bold,
  .strategy-text h1, .strategy-text h2, .strategy-text h3, .strategy-text h4 {
    break-after: avoid; page-break-after: avoid;
    break-inside: avoid; page-break-inside: avoid;
  }
  p { orphans: 3; widows: 3; }
  .strategy-text { padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; line-height: 1.6; font-size: 14px; }
  .offer-text { padding: 0; background: none; border: none; line-height: 1.6; font-size: 13px; }
  .strategy-text p, .offer-text p { margin: 0 0 4px 0; orphans: 3; widows: 3; }
  .strategy-text p:empty, .offer-text p:empty { display: none; margin: 0; }
  .strategy-text h1:first-child, .strategy-text h2:first-child, .strategy-text h3:first-child,
  .offer-text h1:first-child, .offer-text h2:first-child, .offer-text h3:first-child { margin-top: 0; }
  .strategy-text ul, .strategy-text ol, .offer-text ul, .offer-text ol { margin: 4px 0 8px 1.5em; padding-left: 1em; }
  .strategy-text li, .offer-text li { margin: 2px 0; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; text-align: left; font-weight: normal; }
  td.num { text-align: right; font-family: monospace; font-size: 10px; }
  table.mat-table { table-layout: fixed; width: 100%; font-size: 10px; }
  table.mat-table th { text-align: left; font-size: 9px; padding: 4px 6px; }
  td.mat-lp, th.mat-lp { text-align: center; color: #6b7280; font-size: 9px; padding: 4px 4px; }
  td.mat-img { text-align: center; padding: 3px; vertical-align: middle; }
  td.mat-name { text-align: left; padding-left: 20px; font-size: 10px; }
  td.mat-txt { text-align: left; font-size: 10px; }
  td.mat-num { text-align: right; font-family: monospace; font-size: 10px; }
  td.mat-spec { text-align: left; font-size: 9px; color: #6b7280; }
  tr:nth-child(even) td { background: #f9fafb; }
  .budget-table td { font-size: 12px; }
  .budget-table td.num { font-size: 11px; }
  table.kv th { width: 50%; background: #f9fafb; text-transform: none; font-size: 10px; color: #4b5563; text-align: left; border-bottom: 1px solid #e5e7eb; }
  table.kv td { font-size: 11px; color: #111; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1.6fr; gap: 16px; padding: 12px 0 0 0; }
  .summary-block { margin-bottom: 24px; break-inside: avoid; page-break-inside: avoid; }
  .table-title { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; color: #111; margin-bottom: 6px; padding: 5px 0; border-bottom: 2px solid #1a1a2e; }
  th { background: #f3f4f6; color: #374151; padding: 7px 8px; text-align: center; font-size: 12px; font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #d1d5db; }
  thead { display: table-header-group !important; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .outer-wrap { border-collapse: collapse; width: 100%; }
  .outer-wrap > thead > tr > td,
  .outer-wrap > tbody > tr > td { border: none; padding: 0; background: none; }
  .outer-wrap > tbody > tr { page-break-inside: auto; break-inside: auto; }
  .budget-table { table-layout: fixed; word-wrap: break-word; }
  @page { margin: 14mm; size: A4 portrait; }
  @media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .summary-grid { display: block; }
    .summary-block { margin-bottom: 16px; }
    .summary-section { page-break-before: always; }
  }
`;

/**
 * Otwiera okno przeglądarki z HTML i wywołuje drukowanie.
 * @param {string} html - pełny dokument HTML
 */
export function openPdfBlob(html) {
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, '_blank');
    if (!win) { alert('Zezwól na otwieranie pop-upów aby eksportować PDF'); URL.revokeObjectURL(blobUrl); return; }
    win.focus();
    setTimeout(() => { win.print(); setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); }, 600);
}

/**
 * Zwraca pełny dokument HTML z nagłówkiem dokumentu powtarzanym na każdej stronie.
 * @param {{ logoDataUrl: string, title: string, subtitle: string, date: string, bodyHtml: string, extraCss?: string }} opts
 */
export function buildPdfDocument({ logoDataUrl, title, subtitle, date, bodyHtml, extraCss = '' }) {
    return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title></title>
<style>
${PDF_BASE_CSS}
${extraCss}
</style>
</head>
<body>
<table class="outer-wrap">
  <thead>
    <tr><td>
      <div class="doc-header">
        ${logoDataUrl ? `<img class="doc-header-logo" src="${logoDataUrl}" alt="Logo" />` : ''}
        <div class="doc-header-text">
          <h1>${esc(title)}</h1>
          <div class="sub">${esc(subtitle)}</div>
          <div class="meta">Przygotowano: ${esc(date)}</div>
        </div>
      </div>
    </td></tr>
  </thead>
  <tbody>
    <tr><td>${bodyHtml}</td></tr>
  </tbody>
</table>
</body>
</html>`;
}

/**
 * Pobiera base64 logo z /airtel-logo-services.png.
 * Zwraca pusty string jeśli nie uda się pobrać.
 */
export async function fetchLogoDataUrl() {
    try {
        const res = await fetch(`${window.location.origin}/airtel-logo-services.png`);
        if (!res.ok) return '';
        const blob = await res.blob();
        return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    } catch { return ''; }
}

/**
 * Buduje tabelę WBS w HTML dla eksportu PDF.
 * depth=1 → 2 kolumny (Zakresy | Cena)
 * depth=2 → 3 kolumny (Zakresy | Składowe | Cena)
 * depth=3 → 4 kolumny (Zakresy | Składowe | Składowe | Cena)
 *
 * Wiersz "Razem" zawsze w <tbody> — nigdy w <tfoot>, bo <tfoot> powtarza się przy łamaniu strony w Chrome.
 *
 * @param {Array} wbsData - flat lista węzłów WBS
 * @param {1|2|3} depth
 * @returns {string} HTML tabeli
 */
export function buildWbsHtmlTable(wbsData, depth) {
    const localById = new Map(wbsData.map(n => [n.id, n]));
    // Cena ofertowa pozycji — formuła IDENTYCZNA z handleExportOfertaWbsExcel /
    // appendBudgetSheet: brak narzutu ⇒ cena ofertowa 0 (nie koszt); gałęzie
    // grupujące (type='group') mają cenę 0 — ich wartość to suma dzieci.
    const localPriceOf = (item) => {
        if (item.type === 'group') return 0;
        const q = Math.max(0, parseFloat(item.quantity) || 0);
        const uc = Math.max(0, parseFloat(item.unitCost) || 0);
        const tc = uc * q;
        const m = (item.margin != null && String(item.margin) !== '') ? parseFloat(item.margin) : null;
        const d = Math.max(0, parseFloat(item.discount) || 0);
        let p = (m !== null && m !== 0) ? tc * (1 + m / 100) : 0;
        if (p > 0 && d > 0) p = Math.max(0, p * (1 - d / 100));
        return p;
    };
    const localChain = (id) => {
        const chain = [];
        let cur = localById.get(id);
        while (cur) { chain.unshift(cur); cur = (cur.parentId && localById.has(cur.parentId)) ? localById.get(cur.parentId) : null; }
        return chain;
    };

    const tblStyle = 'border-collapse:collapse;width:100%;font-size:11px;margin:0;';
    const thS = 'background:#1e3a5f !important;color:#fff !important;font-weight:bold;padding:7px 16px;text-align:center;border:1px solid #16304d;white-space:nowrap;text-transform:none !important;font-size:11px !important;';
    const tdS = 'padding:5px 14px;border:1px solid #ccc;vertical-align:middle;font-weight:normal;';
    const tdR = 'padding:5px 14px;border:1px solid #ccc;text-align:right;vertical-align:middle;font-weight:normal;';
    const sumS = 'padding:6px 14px;border:1px solid #aaa;font-weight:bold;background:#eef2f7;';
    const sumR = 'padding:6px 14px;border:1px solid #aaa;font-weight:bold;background:#eef2f7;text-align:right;';

    if (depth === 1) {
        const groups = new Map();
        for (const item of wbsData) {
            if (!item.parentId) continue;
            const price = localPriceOf(item);
            if (price <= 0) continue;
            const chain = localChain(item.id);
            const d1 = chain[0];
            if (!d1) continue;
            if (!groups.has(d1.id)) groups.set(d1.id, { name: d1.name || '', total: 0 });
            groups.get(d1.id).total += price;
        }
        const entries = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
        if (!entries.length) return '';
        const total = entries.reduce((s, e) => s + e.total, 0);
        const thNarrow = thS + 'width:120px;';
        const tdRNarrow = tdR + 'width:120px;';
        const sumRNarrow = sumR + 'width:120px;';
        const rows = entries.map(e => `<tr><td style="${tdS}">${esc(e.name)}</td><td style="${tdRNarrow}">${fmtPLN(e.total)}</td></tr>`).join('');
        return `<div class="wbs-offer-table"><table style="${tblStyle}width:auto;"><thead><tr><th style="${thS}">Zakresy</th><th style="${thNarrow}">Cena ofertowa (PLN)</th></tr></thead><tbody>${rows}<tr><td style="${sumS}text-align:right;"><strong>Razem</strong></td><td style="${sumRNarrow}"><strong>${fmtPLN(total)}</strong></td></tr></tbody></table></div>`;
    }

    if (depth === 2) {
        const level1 = new Map();
        for (const item of wbsData) {
            if (!item.parentId) continue;
            const price = localPriceOf(item);
            if (price <= 0) continue;
            const chain = localChain(item.id);
            const d1 = chain[0], d2 = chain[Math.min(1, chain.length - 1)];
            if (!d1) continue;
            if (!level1.has(d1.id)) level1.set(d1.id, { name: d1.name || '', children: new Map() });
            const g1 = level1.get(d1.id);
            if (!g1.children.has(d2.id)) g1.children.set(d2.id, { name: d2.name || '', total: 0 });
            g1.children.get(d2.id).total += price;
        }
        if (!level1.size) return '';
        const total = [...level1.values()].reduce((s, g) => s + [...g.children.values()].reduce((s2, c) => s2 + c.total, 0), 0);
        let rows = '';
        for (const g1 of [...level1.values()].sort((a, b) => a.name.localeCompare(b.name))) {
            const children = [...g1.children.values()].sort((a, b) => a.name.localeCompare(b.name));
            for (let i = 0; i < children.length; i++) {
                rows += `<tr><td style="${tdS}">${esc(g1.name)}</td><td style="${tdS}">${esc(children[i].name)}</td><td style="${tdR}">${fmtPLN(children[i].total)}</td></tr>`;
            }
        }
        return `<div class="wbs-offer-table"><table style="${tblStyle}"><thead><tr><th style="${thS}">Zakresy</th><th style="${thS}">Składowe zakresów</th><th style="${thS}">Cena ofertowa (PLN)</th></tr></thead><tbody>${rows}<tr><td colspan="2" style="${sumS}text-align:right;"><strong>Razem</strong></td><td style="${sumR}"><strong>${fmtPLN(total)}</strong></td></tr></tbody></table></div>`;
    }

    if (depth === 3) {
        const level1 = new Map();
        for (const item of wbsData) {
            if (!item.parentId) continue;
            const price = localPriceOf(item);
            if (price <= 0) continue;
            const chain = localChain(item.id);
            const d1 = chain[0], d2 = chain[Math.min(1, chain.length - 1)], d3 = chain[Math.min(2, chain.length - 1)];
            if (!d1) continue;
            if (!level1.has(d1.id)) level1.set(d1.id, { name: d1.name || '', children: new Map() });
            const g1 = level1.get(d1.id);
            if (!g1.children.has(d2.id)) g1.children.set(d2.id, { name: d2.name || '', children: new Map() });
            const g2 = g1.children.get(d2.id);
            if (!g2.children.has(d3.id)) g2.children.set(d3.id, { name: d3.name || '', total: 0 });
            g2.children.get(d3.id).total += price;
        }
        if (!level1.size) return '';
        const total = [...level1.values()].reduce((s, g1) => s + [...g1.children.values()].reduce((s2, g2) => s2 + [...g2.children.values()].reduce((s3, c) => s3 + c.total, 0), 0), 0);
        let rows = '';
        for (const g1 of [...level1.values()].sort((a, b) => a.name.localeCompare(b.name))) {
            const d2list = [...g1.children.values()].sort((a, b) => a.name.localeCompare(b.name));
            let firstD1 = true;
            for (const g2 of d2list) {
                const d3list = [...g2.children.values()].sort((a, b) => a.name.localeCompare(b.name));
                let firstD2 = true;
                for (let i = 0; i < d3list.length; i++) {
                    rows += `<tr>`;
                    rows += `<td style="${tdS}">${esc(g1.name)}</td>`;
                    rows += `<td style="${tdS}">${esc(g2.name)}</td>`;
                    rows += `<td style="${tdS}">${esc(d3list[i].name)}</td><td style="${tdR}">${fmtPLN(d3list[i].total)}</td></tr>`;
                }
            }
        }
        return `<div class="wbs-offer-table"><table style="${tblStyle}"><thead><tr><th style="${thS}">Zakresy</th><th style="${thS}">Składowe zakresów</th><th style="${thS}">Pozycje</th><th style="${thS}">Cena ofertowa (PLN)</th></tr></thead><tbody>${rows}<tr><td colspan="3" style="${sumS}text-align:right;"><strong>Razem</strong></td><td style="${sumR}"><strong>${fmtPLN(total)}</strong></td></tr></tbody></table></div>`;
    }

    return '';
}
