import ExcelJS from 'exceljs';
import { fullName } from '../components/shared/trainings/trainingsShared';

// @anchor build-workwear-excel — plik z WIDOCZNYCH wierszy tabeli (po wyszukiwaniu) dla ExportChoiceModal.
// Rozmiary numeryczne jako liczby, żeby Excel nie oznaczał ich jako „liczba zapisana jako tekst".
export async function buildWorkwearExcel({ rows, items, filename }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Ignite';
    wb.created = new Date();

    const ws = wb.addWorksheet('Ubrania robocze', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
    const header = ws.addRow(['Pracownik', ...items.map(i => i.label)]);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    header.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; });
    header.height = 24;

    for (const u of rows) {
        const row = ws.addRow([
            fullName(u),
            ...items.map(i => {
                const entry = u.workwear.find(w => w.item === i.key);
                if (!entry?.size) return '';
                return entry.sizeScale === 'NUMERIC' ? Number(entry.size) : entry.size;
            }),
        ]);
        items.forEach((_, idx) => { row.getCell(idx + 2).alignment = { horizontal: 'center' }; });
    }

    ws.getColumn(1).width = 30;
    items.forEach((_, idx) => { ws.getColumn(idx + 2).width = 12; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: items.length + 1 } };

    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return { blob, filename };
}
