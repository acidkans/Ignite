// Shared full-project PDF export.
// Used by NodeInfoTab and UnifiedWbsPanel ("PDF wszystkie sekcje").
// Includes: Informacje o projekcie + Strategia + WBS + Materiały. NO budget.

import { API_URL } from '../config';

const flattenWbsItems = (items) => {
    const result = [];
    const walk = (nodes) => { for (const n of nodes || []) { result.push(n); walk(n.children); } };
    walk(items);
    return result;
};

const TYPE_LABELS = {
    project: 'Projekt',
    region: 'Region',
    location: 'Lokalizacja',
    order: 'Zlecenie',
    product: 'Produkt',
    material: 'Materiał',
    equipment: 'Urządzenie',
    service: 'Usługa',
    task: 'Zadanie',
};

const MAT_STATUS = {
    PENDING: 'Oczekuje', PROPOSAL: 'Propozycja', CONFIRMED: 'Potwierdzone',
    REJECTED: 'Odrzucone', ORDERED: 'Zamówione', IN_STOCK: 'Na magazynie', ISSUED: 'Wydane',
};
const MAT_TYPE = {
    DEVICE: 'Urządzenie', MATERIAL: 'Materiał', CABLE: 'Kabel',
    SOFTWARE: 'Oprogramowanie', SERVICE: 'Usługa',
};

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderStrategyHtml = (text) => (text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^\*\*(.+?)\*\*$/gm, '<h3 class="md-bold">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(<h[2-4][^>]*>[^<]*<\/h[2-4]>)/g, '\n\n$1\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/<p>(<h[2-4][^>]*>)/g, '$1')
    .replace(/(<\/h[2-4]>)<\/p>/g, '$1')
    .replace(/<p><\/p>/g, '');

const fmtN = (v, d = 2) => Number.isFinite(parseFloat(v)) ? parseFloat(v).toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const fmtPct = (v) => v ? `${fmtN(v, 1)}%` : '—';

const buildBudgetRows = (nodes, parentId, depth) => {
    const children = nodes
        .filter((n) => (n.parentId || null) === (parentId || null))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return children.map((n) => {
        const indent = depth * 18;
        const nameStyle = depth === 0 ? 'font-weight:bold' : 'color:#374151';
        return `<tr>
            <td style="padding-left:${8 + indent}px;${nameStyle};text-align:left">${depth > 0 ? '└ ' : ''}${esc(n.name || '')}</td>
            <td class="num">${fmtN(n.unitCost)}</td>
            <td class="num">${fmtN(n.quantity, 0)}</td>
            <td>${esc(n.unit || '')}</td>
            <td class="num">${fmtPct(n.margin)}</td>
            <td class="num">${fmtN(n.totalCost)}</td>
            <td class="num">${fmtN(n.totalPrice)}</td>
        </tr>${buildBudgetRows(nodes, n.id, depth + 1)}`;
    }).join('');
};

const renderQaCell = (qa) => {
    const list = Array.isArray(qa) ? qa.filter((p) => (p?.question || '').trim() || (p?.answer || '').trim()) : [];
    if (list.length === 0) return '';
    const rows = list.map((p) => `
        <tr>
            <td style="padding:2px 4px;border:1px solid #e5e7eb;font-size:9px;text-align:left;vertical-align:top;color:#1f2937;background:#fff">${esc(p.question || '')}</td>
            <td style="padding:2px 4px;border:1px solid #e5e7eb;font-size:9px;text-align:left;vertical-align:top;color:#374151;background:#fff">${esc(p.answer || '')}</td>
        </tr>`).join('');
    return `<table style="width:100%;border-collapse:collapse;margin:0">
        <thead><tr>
            <th style="padding:2px 4px;border:1px solid #d1d5db;font-size:8px;text-transform:uppercase;letter-spacing:0.05em;background:#f3f4f6;color:#4b5563;text-align:left;width:50%">Pytanie</th>
            <th style="padding:2px 4px;border:1px solid #d1d5db;font-size:8px;text-transform:uppercase;letter-spacing:0.05em;background:#f3f4f6;color:#4b5563;text-align:left;width:50%">Odpowiedź</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
};

const buildTreeRows = (nodes, parentId, depth, markerSummaryFn) => {
    const children = nodes
        .filter((n) => (n.parentId || null) === (parentId || null))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return children.map((n) => {
        const indent = depth * 18;
        const nameStyle = depth === 0 ? 'font-weight:bold' : 'color:#374151';
        const markerCell = markerSummaryFn ? `<td>${markerSummaryFn(n.id)}</td>` : '';
        return `<tr>
            <td style="padding-left:${8 + indent}px;${nameStyle};text-align:left">${depth > 0 ? '└ ' : ''}${esc(n.name || '')}</td>
            <td>${esc(n.status || '')}</td>
            <td style="text-align:left;padding:4px">${renderQaCell(n.qa)}</td>
            ${markerCell}
        </tr>${buildTreeRows(nodes, n.id, depth + 1, markerSummaryFn)}`;
    }).join('');
};

const fetchJson = async (url, token) => {
    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    } catch (e) {
        console.error('PDF export fetch failed:', url, e);
        return null;
    }
};

export async function exportProjectPdf({ nodeId, versionId, projectName, orderName, ganttHtml = null }) {
    if (!nodeId) { alert('Brak nodeId — nie można wygenerować PDF.'); return; }
    const token = sessionStorage.getItem('token');
    if (!token) { alert('Brak sesji — zaloguj się ponownie.'); return; }

    // Open the window IMMEDIATELY (synchronously) so popup blockers don't trip.
    const win = window.open('', '_blank');
    if (!win) { alert('Zezwól na otwieranie pop-upów aby eksportować PDF'); return; }
    win.document.write('<html><body style="font-family:sans-serif;padding:40px;color:#444">Generowanie PDF…</body></html>');

    const date = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });
    const versionQuery = versionId ? `?versionId=${versionId}` : '';

    let logoDataUrl = '';
    try {
        const logoRes = await fetch(`${window.location.origin}/airtel-logo-services.png`);
        if (logoRes.ok) {
            const blob = await logoRes.blob();
            logoDataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        }
    } catch (_) {}

    const [info, orderReq, wbsResp, matsResp] = await Promise.all([
        fetchJson(`${API_URL}/process-tree/${nodeId}/info`, token),
        fetchJson(`${API_URL}/order-requirements/${nodeId}${versionQuery}`, token),
        fetchJson(`${API_URL}/wbs-nodes/unified/${nodeId}${versionQuery}`, token),
        fetchJson(`${API_URL}/material-requirements/node/${nodeId}${versionQuery}`, token),
    ]);

    const wbsNodes = Array.isArray(wbsResp?.items) ? wbsResp.items : [];
    const allMaterials = Array.isArray(matsResp) ? matsResp : (Array.isArray(matsResp?.items) ? matsResp.items : []);
    const allFlatWbs = flattenWbsItems(wbsNodes);
    const matWbsIds = new Set(allFlatWbs.filter(n => n.type === 'material' || n.type === 'equipment').map(n => n.id));
    // Uwzględnij tylko materiały których węzeł WBS istnieje w aktualnym drzewie
    const materials = allMaterials.filter(r => r.wbsNodeId && matWbsIds.has(r.wbsNodeId));

    // Fetch marker links for all WBS nodes in parallel
    const markerEntries = await Promise.all(
        wbsNodes.map(async (n) => {
            const data = await fetchJson(`${API_URL}/schematics/wbs-node-markers/${n.id}`, token);
            return [n.id, Array.isArray(data) ? data : []];
        })
    );
    const markerCache = Object.fromEntries(markerEntries);

    const markerSummary = (nodeId) => {
        const links = markerCache[nodeId] || [];
        const allAtts = links.flatMap((l) => (l.marker?.attachments || []));
        if (allAtts.length === 0) return '';
        const itemsHtml = allAtts.map((a) => {
            const url = `${API_URL}/schematics/file/${a.fileUrl || ''}`;
            const name = esc(a.fileName || 'plik');
            if (a.fileType === 'IMAGE' && a.fileUrl) {
                return `<div style="margin:4px 0 8px 0;text-align:left">
                    <div style="font-size:10px;color:#4b5563;margin-bottom:3px;">${name}</div>
                    <img src="${esc(url)}" alt="${name}" style="max-width:260px;width:100%;height:auto;object-fit:contain;border:1px solid #d1d5db;border-radius:4px;" />
                </div>`;
            }
            return `<div style="font-size:10px;color:#374151;margin:2px 0;text-align:left">📎 ${name}</div>`;
        }).join('');
        return `<div><div style="font-size:10px;color:#111827;font-weight:bold;margin-bottom:4px;">📎 ${allAtts.length}</div>${itemsHtml}</div>`;
    };

    // === Section: Informacje o zamówieniu (RequirementsTab) ===
    const reqData = orderReq || {};
    const offerDl = reqData.offerDeadline ? new Date(reqData.offerDeadline) : null;
    const STATUS_LABELS = { accepted: 'Zaakceptowana', rejected: 'Odrzucona' };
    const reqRows = [
        offerDl && ['Termin złożenia oferty', offerDl.toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' }) + (offerDl.getHours() ? ` ${String(offerDl.getHours()).padStart(2, '0')}:00` : '')],
        reqData.offerStatus && ['Status oferty', STATUS_LABELS[reqData.offerStatus] || reqData.offerStatus],
        reqData.offerStatusComment && ['Komentarz do statusu', reqData.offerStatusComment],
        reqData.projectStart && ['Początek projektu', new Date(reqData.projectStart).toLocaleDateString('pl-PL')],
        reqData.projectEnd && ['Koniec projektu', new Date(reqData.projectEnd).toLocaleDateString('pl-PL')],
        reqData.projectGoal && ['Cel projektu', null],
        reqData.clientProjectManager && ['Project Manager', reqData.clientProjectManager],
        reqData.clientProjectManagerPhone && ['Telefon PM', reqData.clientProjectManagerPhone],
        reqData.clientProjectManagerEmail && ['E-mail PM', reqData.clientProjectManagerEmail],
    ].filter(Boolean);

    let contactsHtml = '';
    try {
        const contacts = reqData.clientContacts ? JSON.parse(reqData.clientContacts) : [];
        if (contacts.length > 0) {
            contactsHtml = `<table style="margin-top:8px"><thead><tr><th>Rola</th><th>Imię</th><th>Nazwisko</th><th>Telefon</th><th>E-mail</th></tr></thead><tbody>${contacts.map(c => `<tr><td>${esc(c.role || '')}</td><td>${esc(c.name || '')}</td><td>${esc(c.surname || '')}</td><td>${esc(c.phone || '')}</td><td>${esc(c.email || '')}</td></tr>`).join('')}</tbody></table>`;
        }
    } catch (_) {}

    const requirementsHtml = reqRows.length > 0 ? `
        <div class="section">
            <div class="section-header">Informacje o zamówieniu</div>
            <table class="kv"><tbody>
                ${reqRows.map(([k, v]) => v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : `<tr><th colspan="2" style="padding-top:10px;font-weight:bold">${esc(k)}</th></tr><tr><td colspan="2"><div class="strategy-text"><p>${renderStrategyHtml(reqData.projectGoal)}</p></div></td></tr>`).join('')}
            </tbody></table>
            ${contactsHtml ? `<div style="margin-top:10px"><div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em;color:#4b5563;margin-bottom:4px">Dodatkowe kontakty</div>${contactsHtml}</div>` : ''}
        </div>` : '';

    // === Section: Informacje o projekcie ===
    const infoRows = info ? [
        ['Nazwa', info.name],
        ['Typ', info.customTypeLabel || info.type],
        ['Adres', info.address],
        ['NIP', info.nip],
        ['Region', info.region],
        ['Osoba kontaktowa', info.contactPerson],
    ].filter(([, v]) => v && String(v).trim()) : [];

    const infoHtml = `
        <div class="section">
            <div class="section-header">Informacje o projekcie</div>
            ${infoRows.length ? `
            <table class="kv">
                <tbody>
                    ${infoRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
                </tbody>
            </table>` : '<div class="empty">Brak danych podstawowych.</div>'}
        </div>`;

    // === Section: Jak to chcemy zrobić ===
    const strategyHtml = '';

    // === Section: WBS ===
    const wbsHtml = `
        <div class="section">
            <div class="section-header">Struktura zadań projektu (WBS)</div>
            <table>
                <thead><tr><th style="width:24%">Nazwa</th><th style="width:14%">Status</th><th style="width:42%">Q&amp;A</th><th style="width:20%">Załączniki</th></tr></thead>
                <tbody>${wbsNodes.length ? buildTreeRows(wbsNodes, null, 0, markerSummary) : '<tr><td colspan="4">Brak danych WBS</td></tr>'}</tbody>
            </table>
        </div>`;

    // === Section: Budżet ===
    const budgetItems = wbsNodes.filter((n) => n.parentId != null);
    const budgetTotalCost = budgetItems.reduce((s, n) => s + (parseFloat(n.totalCost) || 0), 0);
    const budgetTotalPrice = budgetItems.reduce((s, n) => s + (parseFloat(n.totalPrice) || 0), 0);
    const budgetHtml = `
        <div class="section">
            <div class="section-header">Budżet</div>
            ${wbsNodes.length ? `
            <table class="budget-table">
                <thead><tr><th>Nazwa</th><th>Koszt jedn.</th><th>Ilość</th><th>Jedn.</th><th>Marża%</th><th>Koszt całk.</th><th>Suma netto</th></tr></thead>
                <tbody>${buildBudgetRows(wbsNodes, null, 0)}</tbody>
                <tfoot><tr style="background:#1a1a2e;color:#fff;font-weight:bold">
                    <td colspan="5" style="text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;padding:6px 8px">Razem:</td>
                    <td class="num" style="color:#fff">${fmtN(budgetTotalCost)} PLN</td>
                    <td class="num" style="color:#fff">${fmtN(budgetTotalPrice)} PLN</td>
                </tr></tfoot>
            </table>` : '<div class="empty">Brak danych budżetowych.</div>'}
        </div>`;

    // === Section: Harmonogram (Gantt) ===
    const ganttData = ganttHtml && typeof ganttHtml === 'object' ? ganttHtml : null;
    const A4_LANDSCAPE_PX = 950; // A4 landscape content width at 96dpi minus margins
    const ganttZoom = ganttData?.contentWidth > A4_LANDSCAPE_PX
        ? (A4_LANDSCAPE_PX / ganttData.contentWidth).toFixed(4)
        : '1';
    const ganttSectionHtml = ganttData ? `
        <div class="section">
            <div class="section-header">Harmonogram (Gantt)</div>
            <div class="gantt-wrap"><div class="gantt-scale-inner" style="zoom:${ganttZoom};transform-origin:top left">${ganttData.html}</div></div>
        </div>` : '';

    // === Section: Materiały ===
    const wbsNodeById = Object.fromEntries(allFlatWbs.map(n => [n.id, n]));
    const getParentLabel = (wbsNodeId) => {
        const node = wbsNodeById[wbsNodeId];
        if (!node) return '—';
        const parent = wbsNodeById[node.parentId];
        return parent ? parent.name : (node.name || '—');
    };
    const matRows = (materials || []).filter((r) => r && r.id);
    // Grupuj po rodzicu WBS, zachowaj kolejność z drzewa (sortOrder)
    const matGroups = [];
    const groupIndex = {};
    for (const r of matRows) {
        const label = getParentLabel(r.wbsNodeId);
        if (!(label in groupIndex)) { groupIndex[label] = matGroups.length; matGroups.push({ label, rows: [] }); }
        matGroups[groupIndex[label]].rows.push(r);
    }
    const matTableRows = matGroups.flatMap(g => [
        `<tr><td colspan="6" style="background:#1a1a2e;color:#fff;font-size:9px;font-weight:bold;padding:4px 8px;text-align:left;letter-spacing:0.05em">${esc(g.label)}</td></tr>`,
        ...g.rows.map(r => `<tr>
            <td style="padding-left:16px">${esc(r.name || r.productName || '—')}</td>
            <td>${esc(MAT_TYPE[String(r.type || '').toUpperCase()] || r.type || '—')}</td>
            <td class="num">${esc(r.quantity != null ? r.quantity : '—')}</td>
            <td>${esc(r.unit || '')}</td>
            <td>${esc(MAT_STATUS[r.status] || r.status || '—')}</td>
            <td style="font-size:9px;color:#6b7280;text-align:left">${esc(String(r.technicalSpec || '').slice(0, 140))}</td>
        </tr>`)
    ]).join('');
    const materialsHtml = `
        <div class="section">
            <div class="section-header">Materiały</div>
            ${matRows.length ? `
            <table>
                <thead><tr><th>Nazwa</th><th>Typ</th><th>Ilość</th><th>Jedn.</th><th>Status</th><th>Specyfikacja</th></tr></thead>
                <tbody>${matTableRows}</tbody>
            </table>` : '<div class="empty">Brak materiałów.</div>'}
        </div>`;

    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>${esc((projectName || info?.name || 'Projekt').replace(/^Oferty/i, 'Oferta'))} — ${date}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 0; }
  .doc-header { border-bottom: 3px solid #1a1a2e; padding: 18px 0 10px 0; margin: 0 0 18px 0; break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; display: flex; align-items: flex-start; gap: 16px; }
  .doc-header-logo { height: 48px; width: auto; object-fit: contain; flex-shrink: 0; }
  .doc-header-text { flex: 1; }
  .doc-header h1 { font-size: 20px; margin: 0 0 2px 0; }
  .doc-header .sub { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #6b7280; }
  .doc-header .meta { font-size: 10px; color: #9ca3af; margin-top: 4px; }
  .section { margin-bottom: 0; page-break-before: always; break-before: page; }
  .doc-header + .section { page-break-before: avoid; break-before: avoid; }
  .section-header { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.12em; background: #1a1a2e; color: #fff; padding: 7px 12px; break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
  h1, h2, h3, h4, h5, h6, .section-header, .table-title, .md-bold,
  .strategy-text h2, .strategy-text h3, .strategy-text h4 {
    break-after: avoid; page-break-after: avoid;
    break-inside: avoid; page-break-inside: avoid;
  }
  p { orphans: 3; widows: 3; }
  .strategy-text { padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; line-height: 1.6; text-align: justify; }
  .strategy-text p { margin: 0 0 4px 0; text-align: justify; orphans: 3; widows: 3; }
  .strategy-text p:empty { display: none; margin: 0; }
  .strategy-text h2, .strategy-text h3, .strategy-text h4, .strategy-text .md-bold { font-size: 11px; font-weight: bold; margin: 16px 0 2px 0; text-align: left; }
  .strategy-text h3:first-child, .strategy-text h2:first-child, .strategy-text .md-bold:first-child { margin-top: 0; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #f3f4f6; color: #374151; padding: 6px 8px; text-align: center; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #d1d5db; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; text-align: center; }
  td.num { text-align: center; font-family: monospace; font-size: 10px; }
  tr:nth-child(even) td { background: #f9fafb; }
  .budget-table td { font-size: 12px; }
  .budget-table td.num { font-size: 11px; }
  table.kv th { width: 28%; background: #f9fafb; text-transform: none; font-size: 10px; color: #4b5563; }
  table.kv td { font-size: 11px; color: #111; }
  .empty { padding: 10px 12px; font-size: 10px; color: #6b7280; background: #f9fafb; border: 1px solid #e5e7eb; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .gantt-wrap { overflow: hidden; background: #fff; padding: 8px 0; }
  .gantt-wrap svg text { fill: #0b0f17 !important; }
  .gantt-wrap [class*="WuQ0f"] { background: #fff !important; }
  @page { margin: 20mm 14mm; size: A4 portrait; }
</style>
${ganttData ? ganttData.styles : ''}
<style>
  /* Gantt overrides po załadowaniu bibliotecznych styli */
  .gantt-wrap { background: #fff !important; overflow: hidden; }
  .gantt-wrap > * { background: #fff !important; }
  .gantt-wrap [class] { background: #fff !important; }
  .gantt-wrap svg text { fill: #0b0f17 !important; }
  .gantt-scale-inner { transform-origin: top left; }
</style>
</head>
<body>
<div class="doc-header">
  ${logoDataUrl ? `<img class="doc-header-logo" src="${logoDataUrl}" alt="Logo" />` : ''}
  <div class="doc-header-text">
    <h1>${esc(orderName || info?.name || 'Zamówienie')}</h1>
    <div class="sub">Informacje o projekcie i planowanie</div>
    <div class="meta">Wygenerowano: ${date}</div>
  </div>
</div>
${requirementsHtml}
${infoHtml}
${strategyHtml}
${wbsHtml}
${ganttSectionHtml}
${materialsHtml}
<script>
window.addEventListener('load', function() { setTimeout(function() { try { window.print(); } catch(e) {} }, 400); });
</script>
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
}
