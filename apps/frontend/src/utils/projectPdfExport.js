// Shared full-project PDF export.
// Used by NodeInfoTab and UnifiedWbsPanel ("PDF wszystkie sekcje").
// Includes: Informacje o projekcie + Strategia + WBS + Materiały. NO budget.

import { API_URL } from '../config';

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
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

const buildTreeRows = (nodes, parentId, depth) => {
    const children = nodes
        .filter((n) => (n.parentId || null) === (parentId || null))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return children.map((n) => {
        const indent = depth * 18;
        const nameStyle = depth === 0 ? 'font-weight:bold' : 'color:#374151';
        return `<tr>
            <td style="padding-left:${8 + indent}px;${nameStyle}">${depth > 0 ? '└ ' : ''}${esc(n.name || '')}</td>
            <td>${esc(TYPE_LABELS[n.type] || n.type || '')}</td>
            <td>${esc(n.status || '')}</td>
            <td>${esc(n.owner || '')}</td>
        </tr>${buildTreeRows(nodes, n.id, depth + 1)}`;
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

export async function exportProjectPdf({ nodeId, versionId, projectName }) {
    if (!nodeId) { alert('Brak nodeId — nie można wygenerować PDF.'); return; }
    const token = sessionStorage.getItem('token');
    if (!token) { alert('Brak sesji — zaloguj się ponownie.'); return; }

    // Open the window IMMEDIATELY (synchronously) so popup blockers don't trip.
    const win = window.open('', '_blank');
    if (!win) { alert('Zezwól na otwieranie pop-upów aby eksportować PDF'); return; }
    win.document.write('<html><body style="font-family:sans-serif;padding:40px;color:#444">Generowanie PDF…</body></html>');

    const date = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });
    const versionQuery = versionId ? `?versionId=${versionId}` : '';

    const [info, orderReq, wbsResp, matsResp] = await Promise.all([
        fetchJson(`${API_URL}/process-tree/${nodeId}/info`, token),
        fetchJson(`${API_URL}/order-requirements/${nodeId}${versionQuery}`, token),
        fetchJson(`${API_URL}/wbs-nodes/unified/${nodeId}${versionQuery}`, token),
        fetchJson(`${API_URL}/material-requirements/node/${nodeId}${versionQuery}`, token),
    ]);

    const wbsNodes = Array.isArray(wbsResp?.items) ? wbsResp.items : [];
    const materials = Array.isArray(matsResp) ? matsResp : (Array.isArray(matsResp?.items) ? matsResp.items : []);

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
    const strategyText = orderReq?.wbsDescription || '';
    const strategyHtml = `
        <div class="section">
            <div class="section-header">Jak to chcemy zrobić</div>
            <div class="strategy-text"><p>${renderStrategyHtml(strategyText || 'Brak treści strategii')}</p></div>
        </div>`;

    // === Section: WBS ===
    const wbsHtml = `
        <div class="section">
            <div class="section-header">Struktura zadań projektu (WBS)</div>
            <table>
                <thead><tr><th>Nazwa</th><th>Typ</th><th>Status</th><th>Osoba</th></tr></thead>
                <tbody>${wbsNodes.length ? buildTreeRows(wbsNodes, null, 0) : '<tr><td colspan="4">Brak danych WBS</td></tr>'}</tbody>
            </table>
        </div>`;

    // === Section: Materiały ===
    const matRows = (materials || []).filter((r) => r && r.id);
    const materialsHtml = `
        <div class="section">
            <div class="section-header">Materiały</div>
            ${matRows.length ? `
            <table>
                <thead><tr><th>Nazwa</th><th>Typ</th><th>Ilość</th><th>Jedn.</th><th>Status</th><th>Specyfikacja</th></tr></thead>
                <tbody>
                    ${matRows.map((r) => `<tr>
                        <td>${esc(r.name || r.productName || '—')}</td>
                        <td>${esc(MAT_TYPE[String(r.type || '').toUpperCase()] || r.type || '—')}</td>
                        <td class="num">${esc(r.quantity != null ? r.quantity : '—')}</td>
                        <td>${esc(r.unit || '')}</td>
                        <td>${esc(MAT_STATUS[r.status] || r.status || '—')}</td>
                        <td style="font-size:9px;color:#6b7280">${esc(String(r.technicalSpec || '').slice(0, 140))}</td>
                    </tr>`).join('')}
                </tbody>
            </table>` : '<div class="empty">Brak materiałów.</div>'}
        </div>`;

    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>${esc(projectName || info?.name || 'Projekt')} — ${date}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 0 32px 28px 32px; }
  .doc-header { border-bottom: 3px solid #1a1a2e; padding: 18px 0 10px 0; margin: 0 0 18px 0; break-after: avoid; page-break-after: avoid; }
  .doc-header h1 { font-size: 20px; margin: 0 0 2px 0; }
  .doc-header .sub { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #6b7280; }
  .doc-header .meta { font-size: 10px; color: #9ca3af; margin-top: 4px; }
  .section { margin-bottom: 22px; }
  .section + .section { margin-top: 0; }
  .section-header { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.12em; background: #1a1a2e; color: #fff; padding: 7px 12px; break-after: avoid; page-break-after: avoid; }
  .strategy-text { padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; line-height: 1.7; }
  .strategy-text p { margin: 0 0 10px 0; }
  .strategy-text h3 { font-size: 12px; margin: 14px 0 4px 0; }
  .strategy-text h4 { font-size: 11px; margin: 10px 0 3px 0; color: #374151; }
  .md-h2 { font-size: 13px; margin: 16px 0 5px 0; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #f3f4f6; color: #374151; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #d1d5db; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  td.num { text-align: right; font-family: monospace; font-size: 10px; }
  tr:nth-child(even) td { background: #f9fafb; }
  table.kv th { width: 28%; background: #f9fafb; text-transform: none; font-size: 10px; color: #4b5563; }
  table.kv td { font-size: 11px; color: #111; }
  .empty { padding: 10px 12px; font-size: 10px; color: #6b7280; background: #f9fafb; border: 1px solid #e5e7eb; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  @page { margin: 12mm 12mm 14mm 12mm; }
  @media print {
    body { padding: 0 12mm; }
    .doc-header { padding-top: 8px; }
  }
</style>
</head>
<body>
<div class="doc-header">
  <h1>${esc(projectName || info?.name || 'Projekt')}</h1>
  <div class="sub">Informacje o projekcie i planowanie</div>
  <div class="meta">Wygenerowano: ${date}</div>
</div>
${requirementsHtml}
${infoHtml}
${strategyHtml}
${wbsHtml}
${materialsHtml}
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch (e) { /* user can print manually */ } }, 500);
}
