import ExcelJS from 'exceljs';

// @anchor month-label-pl
// „2026-07" → „lipiec 2026". Nagłówki miesięcy czyta DAK, nie maszyna.
const MONTH_NAMES_PL = [
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];

export function monthLabelPl(key) {
    const [year, month] = String(key || '').split('-').map(Number);
    if (!year || !month) return key || '';
    return `${MONTH_NAMES_PL[month - 1]} ${year}`;
}

// @anchor build-leave-monthly-workbook
// Arkusz „Rozkład urlopów": jeden wiersz na urlop, kolumny miesięcy z liczbą dni,
// wiersz RAZEM na dole. Sumy w kolumnach miesięcy to ŻYWE formuły ExcelJS —
// DAK poprawia pojedynczą komórkę i suma przelicza się sama.
export async function buildLeaveMonthlyWorkbook(report) {
    const months = report?.months || [];
    const rows = report?.rows || [];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Ignite ERP';
    wb.created = new Date();
    const ws = wb.addWorksheet('Rozkład urlopów');

    const baseColumns = [
        { key: 'employee', header: 'Pracownik', width: 26 },
        { key: 'company', header: 'Firma', width: 18 },
        { key: 'typeName', header: 'Rodzaj urlopu', width: 24 },
        { key: 'dateFrom', header: 'Od', width: 12 },
        { key: 'dateTo', header: 'Do', width: 12 },
        { key: 'daysCount', header: 'Dni razem', width: 11 },
    ];
    const tailColumns = [
        { key: 'note', header: 'Komentarz', width: 30 },
        { key: 'flag', header: 'Uwagi', width: 30 },
    ];

    ws.columns = [
        ...baseColumns,
        ...months.map(m => ({ key: m, header: monthLabelPl(m), width: 14 })),
        ...tailColumns,
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', wrapText: true };
    headerRow.height = 28;
    headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF9AA5B1' } } };
    });

    rows.forEach(r => {
        const record = {
            employee: `${r.firstName} ${r.lastName}`,
            company: r.company || '—',
            typeName: r.typeName,
            dateFrom: r.dateFrom,
            dateTo: r.dateTo,
            daysCount: r.daysCount,
            note: r.note || '',
            // rozbieżność zapisanego wymiaru z dniami roboczymi to sygnał do ręcznej weryfikacji,
            // nie błąd — urlop godzinowy i wpis ręczny mają prawo się różnić
            flag: r.mismatch ? `zapisano ${r.daysCount} dni, dni roboczych w zakresie: ${r.workingDays}` : '',
        };
        months.forEach(m => { record[m] = r.months?.[m] ?? null; });
        const row = ws.addRow(record);
        if (r.mismatch) {
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CE' } };
            });
        }
    });

    // @anchor leave-monthly-total-row
    const firstDataRow = 2;
    const lastDataRow = ws.rowCount;
    const totalRow = ws.addRow({ employee: 'RAZEM' });
    totalRow.font = { bold: true };
    if (rows.length) {
        const daysCol = ws.getColumn('daysCount').letter;
        totalRow.getCell('daysCount').value = { formula: `SUM(${daysCol}${firstDataRow}:${daysCol}${lastDataRow})` };
        months.forEach(m => {
            const letter = ws.getColumn(m).letter;
            totalRow.getCell(m).value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` };
        });
    }
    totalRow.eachCell(cell => {
        cell.border = { top: { style: 'thin', color: { argb: 'FF9AA5B1' } } };
    });

    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

    return wb;
}

// @anchor download-leave-monthly-excel
export async function downloadLeaveMonthlyExcel(report) {
    const wb = await buildLeaveMonthlyWorkbook(report);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const suffix = report?.from === report?.to ? report?.from : `${report?.from}_${report?.to}`;
    a.href = url;
    a.download = `rozklad-urlopow-${suffix || 'raport'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
