// Standalone PDF export for RequirementsTab ("Informacje o zamówieniu").
// Uses local form state (no API calls needed).

import { buildPdfDocument, openPdfBlob, fetchLogoDataUrl, esc } from './wbsPdfExport';

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

export async function exportRequirementsPdf({ form, countdown, workingDays, orderName }) {
    if (!form) { alert('Brak danych formularza.'); return; }

    const logoDataUrl = await fetchLogoDataUrl();
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

    const bodyHtml = `
        ${kvSection('Termin zlozenia oferty', dlRows)}
        ${kvSection('Harmonogram projektu', schedRows)}
        ${goalHtml}
        ${kvSection('Kontakty', contactRows)}
        ${extraContactsHtml}
    `;

    const html = buildPdfDocument({
        logoDataUrl,
        title: orderName || 'Zamówienie',
        subtitle: 'Informacje o zamówieniu',
        date,
        bodyHtml,
        extraCss: `
            table.kv th { width: 28%; }
            @page { margin: 20mm 14mm; }
        `,
    });

    openPdfBlob(html);
}
