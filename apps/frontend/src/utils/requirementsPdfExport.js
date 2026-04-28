// Standalone PDF export for RequirementsTab ("Informacje o zamówieniu").
// Uses local form state (no API calls needed).

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderGoalHtml = (text) => (text || '')
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

export function exportRequirementsPdf({ form, countdown, workingDays, orderName }) {
    if (!form) { alert('Brak danych formularza.'); return; }

    const win = window.open('', '_blank');
    if (!win) { alert('Zezwól na otwieranie pop-upów aby eksportować PDF'); return; }
    win.document.write('<html><body style="font-family:sans-serif;padding:40px;color:#444">Generowanie PDF...</body></html>');

    const date = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });
    const STATUS_LABELS = { accepted: 'Zaakceptowana', rejected: 'Odrzucona' };

    // Deadline section
    const dlRows = [
        form.offerDeadlineDate && ['Data terminu', form.offerDeadlineDate + (form.offerDeadlineTime ? ` ${form.offerDeadlineTime}` : '')],
        form.offerStatus && ['Status oferty', STATUS_LABELS[form.offerStatus] || form.offerStatus],
        form.offerStatusComment && ['Komentarz', form.offerStatusComment],
        countdown && !countdown.expired && ['Pozostalo', `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m`],
        countdown?.expired && ['Termin', 'Minol!'],
    ].filter(Boolean);

    // Schedule section
    const schedRows = [
        form.projectStart && ['Poczatek projektu', form.projectStart],
        form.projectEnd && ['Koniec projektu', form.projectEnd],
        workingDays != null && ['Dni robocze', `${workingDays}`],
    ].filter(Boolean);

    // Contacts
    const pmName = [form.pmName, form.pmSurname].filter(Boolean).join(' ');
    const contactRows = [
        pmName && ['Project Manager', pmName],
        form.clientProjectManagerPhone && ['Telefon PM', form.clientProjectManagerPhone],
        form.clientProjectManagerEmail && ['E-mail PM', form.clientProjectManagerEmail],
    ].filter(Boolean);

    let extraContactsHtml = '';
    if (form.clientContacts && form.clientContacts.length > 0) {
        extraContactsHtml = `
        <div class="section">
            <div class="section-header">Dodatkowe kontakty</div>
            <table>
                <thead><tr><th>Rola</th><th>Imie</th><th>Nazwisko</th><th>Telefon</th><th>E-mail</th></tr></thead>
                <tbody>${form.clientContacts.map(c => `<tr>
                    <td>${esc(c.role || '')}</td>
                    <td>${esc(c.name || '')}</td>
                    <td>${esc(c.surname || '')}</td>
                    <td>${esc(c.phone || '')}</td>
                    <td>${esc(c.email || '')}</td>
                </tr>`).join('')}</tbody>
            </table>
        </div>`;
    }

    const goalHtml = form.projectGoal ? `
        <div class="section">
            <div class="section-header">Cel projektu</div>
            <div class="strategy-text"><p>${renderGoalHtml(form.projectGoal)}</p></div>
        </div>` : '';

    const kvSection = (title, rows) => rows.length === 0 ? '' : `
        <div class="section">
            <div class="section-header">${esc(title)}</div>
            <table class="kv"><tbody>
                ${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
            </tbody></table>
        </div>`;

    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>Informacje o zamowieniu - ${date}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 0; }
  .doc-header { border-bottom: 3px solid #1a1a2e; padding: 18px 0 10px 0; margin: 0 0 18px 0; break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
  .doc-header h1 { font-size: 20px; margin: 0 0 2px 0; }
  .doc-header .sub { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #6b7280; }
  .doc-header .meta { font-size: 10px; color: #9ca3af; margin-top: 4px; }
  .section { margin-bottom: 22px; }
  .section-header { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.12em; background: #1a1a2e; color: #fff; padding: 7px 12px; break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
  h1, h2, h3, h4, h5, h6, .section-header, .md-bold,
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
  th { background: #f3f4f6; color: #374151; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #d1d5db; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.kv th { width: 28%; background: #f9fafb; text-transform: none; font-size: 10px; color: #4b5563; }
  table.kv td { font-size: 11px; color: #111; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  @page { margin: 20mm 14mm; }
</style>
</head>
<body>
<div class="doc-header">
  <h1>${esc(orderName || 'Zamówienie')}</h1>
  <div class="sub">Informacje o zamówieniu</div>
  <div class="meta">Wygenerowano: ${date}</div>
</div>
${kvSection('Termin zlozenia oferty', dlRows)}
${kvSection('Harmonogram projektu', schedRows)}
${goalHtml}
${kvSection('Kontakty', contactRows)}
${extraContactsHtml}
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch (_) {} }, 500);
}
