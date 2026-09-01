// Eksport „bez cen" — awaryjna ścieżka eksportu oferty/budżetu, gdy pozycje mają
// braki (koszt jednostkowy = 0 lub narzut = 0). Zamiast blokować eksport,
// wypuszczamy dokument z ZAKRESEM, ale bez jakichkolwiek wartości: żadna cena,
// koszt, narzut, rabat ani suma nie trafia do pliku — dzięki temu nie da się
// wysłać niepełnej oferty z „policzoną" (błędną) wartością.
//
// Czyszczenie jest POST-PROCESSINGIEM na gotowym artefakcie (workbook ExcelJS /
// HTML PDF-a), a nie warunkiem w każdym miejscu budowania arkuszy — jeden punkt
// prawdy zamiast dziesiątek ifów rozsianych po UnifiedWbsPanel.jsx.

// @anchor money-header-re
// Nagłówek/etykieta niosąca wartość pieniężną lub narzut/rabat.
export const MONEY_HEADER_RE = /(cena|ceny|cenow|koszt|narzut|marż|marz|rabat|wartoś|wartos|zysk|przychod|przychód|kwota|budżet|budzet|\bPLN\b|netto|brutto|cash\s*flow)/i;

// Etykieta wiersza sumującego (bez słowa „cena/koszt", a i tak niosącego wartość).
const TOTAL_LABEL_RE = /(razem|suma|łącznie|lacznie|ogółem|ogolem)/i;

// Komórka „liczbowa" w HTML: same cyfry/separatory/procent/minus, min. jedna cyfra.
const NUMERIC_TEXT_RE = /^[\s \d.,%+\-–—()]*(PLN|zł|EUR|USD)?\s*$/i;

// Wiersz etykieta→wartość (podsumowania, pola rabatu) ma niewiele komórek; szeroki
// wiersz danych nie jest czyszczony po etykiecie, tylko po kolumnie.
const LABEL_ROW_MAX_CELLS = 6;
const HEADER_SCAN_ROWS = 8;

// @anchor no-prices-note
export const NO_PRICES_NOTE = 'EKSPORT BEZ WYCENY — pozycje mają braki (koszt jednostkowy lub narzut = 0), więc wartości zostały pominięte. Dokument NIE jest ofertą handlową.';

// @anchor no-prices-filename
// Dokłada znacznik do nazwy pliku, żeby plik bez wyceny był rozpoznawalny na dysku.
export const noPricesFilename = (filename) =>
    String(filename || '').replace(/(\.[a-z0-9]+)$/i, '_BEZ-CEN$1') || 'eksport_BEZ-CEN';

const cellText = (value) => {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map(t => t.text || '').join('');
    if (typeof value === 'object' && typeof value.text === 'string') return value.text;
    return '';
};

const isNumericCell = (value) => {
    if (typeof value === 'number') return true;
    if (value && typeof value === 'object' && (value.formula || value.sharedFormula)) return true;
    return false;
};

// @anchor strip-prices-from-workbook
// Zeruje (opróżnia — NIE zeruje do 0) wszystkie komórki niosące wartość w całym
// skoroszycie: kolumny z pieniężnym nagłówkiem oraz wiersze etykieta→wartość.
// Formuły też znikają, więc Excel nie przeliczy niczego po otwarciu pliku.
export function stripPricesFromWorkbook(workbook) {
    let cleared = 0;
    workbook.eachSheet((sheet) => {
        const moneyCols = new Set();
        const headerRows = new Set();
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber > HEADER_SCAN_ROWS) return;
            let strings = 0;
            let others = 0;
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (cellText(cell.value).trim()) strings++;
                else if (cell.value != null && cell.value !== '') others++;
            });
            // Wiersz nagłówka = same teksty, min. 2 kolumny. Wiersz z liczbami
            // (np. „Rabat całościowy | 1234") nagłówkiem nie jest — inaczej kolumna
            // „Lp." zostałaby uznana za pieniężną i wyczyszczona.
            if (strings >= 2 && others === 0) {
                headerRows.add(rowNumber);
                row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                    if (MONEY_HEADER_RE.test(cellText(cell.value))) moneyCols.add(colNumber);
                });
            }
        });

        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (headerRows.has(rowNumber)) return;
            let nonEmpty = 0;
            let labelled = false;
            row.eachCell({ includeEmpty: false }, (cell) => {
                const txt = cellText(cell.value).trim();
                if (txt || cell.value != null) nonEmpty++;
                if (txt && (MONEY_HEADER_RE.test(txt) || TOTAL_LABEL_RE.test(txt))) labelled = true;
            });
            const clearByLabel = labelled && nonEmpty <= LABEL_ROW_MAX_CELLS;
            row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                if (!isNumericCell(cell.value)) return;
                if (moneyCols.has(colNumber) || clearByLabel) {
                    cell.value = null;
                    cleared++;
                }
            });
        });
    });
    return cleared;
}

// @anchor strip-prices-from-html
// To samo dla HTML-a PDF-a: opróżnia komórki w kolumnach z pieniężnym nagłówkiem
// oraz liczbowe komórki w wierszach sum/etykiet. Przyjmuje pełny dokument HTML
// albo fragment.
export function stripPricesFromHtml(html, placeholder = '—') {
    const src = String(html || '');
    if (!src.trim()) return src;
    const doc = new DOMParser().parseFromString(src, 'text/html');

    doc.querySelectorAll('table').forEach((table) => {
        const rows = Array.from(table.rows || []);
        const moneyCols = new Set();
        rows.forEach((tr) => {
            let idx = 0;
            Array.from(tr.cells).forEach((cell) => {
                const span = parseInt(cell.getAttribute('colspan') || '1', 10) || 1;
                if (cell.tagName === 'TH' && MONEY_HEADER_RE.test(cell.textContent || '')) {
                    for (let i = 0; i < span; i++) moneyCols.add(idx + i);
                }
                idx += span;
            });
        });
        rows.forEach((tr) => {
            const cells = Array.from(tr.cells);
            // Wiersz „Razem" / etykieta pieniężna (tabele klucz→wartość).
            // Wiersz klucz→wartość z pieniężną etykietą (np. „Wartość oferty | 12 340 PLN")
            // czyścimy w całości; wiersz „Razem" — tylko komórki liczbowe.
            const moneyLabelled = cells.some(c => c.tagName === 'TH' && MONEY_HEADER_RE.test(c.textContent || ''));
            const totalLabelled = cells.some(c => TOTAL_LABEL_RE.test(c.textContent || ''));
            let idx = 0;
            cells.forEach((cell) => {
                const span = parseInt(cell.getAttribute('colspan') || '1', 10) || 1;
                let inMoneyCol = false;
                for (let i = 0; i < span; i++) if (moneyCols.has(idx + i)) inMoneyCol = true;
                idx += span;
                if (cell.tagName !== 'TD') return;
                const txt = (cell.textContent || '').trim();
                const numeric = NUMERIC_TEXT_RE.test(txt) && /\d/.test(txt);
                if (inMoneyCol || moneyLabelled || (totalLabelled && numeric)) cell.textContent = placeholder;
            });
        });
    });

    if (/<html[\s>]/i.test(src)) return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
    return doc.body.innerHTML;
}

// @anchor no-prices-banner-html
// Czerwony pasek na górze PDF-a — czytelnik musi widzieć, że to nie jest wycena.
export const noPricesBannerHtml = () =>
    `<div style="border:2px solid #b91c1c;background:#fef2f2;color:#7f1d1d;padding:8px 12px;margin:0 0 14px 0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;">${NO_PRICES_NOTE}</div>`;
