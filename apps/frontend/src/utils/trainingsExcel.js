import ExcelJS from 'exceljs';
import { daysTo, fmtDay, fullName, todayIso, trainingStatus } from '../components/shared/trainings/trainingsShared';

// @anchor trainings-excel-colors — tła komórek wg statusu ważności (jak kolory w macierzy).
const XL_KOLOR = { ok: 'FFD1FAE5', uwaga: 'FFFEF3C7', zle: 'FFFEE2E2', bez: 'FFF3F4F6' };
const XL_STATUS = { ok: 'ważne', uwaga: 'wygasa ≤ 30 dni', zle: 'wygasło', bez: 'bezterminowe' };
const xlData = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

// @anchor export-trainings-excel — eksport WIDOCZNYCH wierszy macierzy (po wyszukiwaniu i filtrze
// statusu, w tej samej kolejności). Dwa arkusze: „Szkolenia" (macierz jak na ekranie) i „Szczegóły"
// (jeden wiersz = pracownik × szkolenie, wygodny do sortowania i autofiltra).
export async function exportTrainingsExcel({ wiersze, types, ordersById, opisFiltra }) {
    const today = todayIso();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Ignite';
    wb.created = new Date();
    const naglowek = (r) => {
        r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        r.alignment = { vertical: 'middle', wrapText: true };
        r.eachCell(c => { c.fill = fill('FF0F766E'); });
        r.height = 30;
    };
    const nT = types.length;

    const ws = wb.addWorksheet('Szkolenia', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] });
    ws.addRow([`Szkolenia pracowników — stan na ${fmtDay(today)} (${opisFiltra})`]).font = { bold: true, size: 13 };
    ws.addRow([`Wierszy: ${wiersze.length}. Pracownicy bez szkoleń są pominięci.`]).font = { italic: true, color: { argb: 'FF6B7280' } };
    const hdr = ws.addRow(['Pracownik', 'Zespół', 'Zamówienia',
        ...types.map(t => `${t.name}\n(${t.validityMonths ? `${t.validityMonths} mies.` : 'bezterm.'})`),
        'Najbliższy termin', 'Szkolenie', 'Dni do terminu']);
    naglowek(hdr);
    // Pełne nazwy szkoleń zawijają się w kolumnie ~18 znaków — wysokość nagłówka wg najdłuższej.
    const linieNaglowka = Math.max(2, ...types.map(t => Math.ceil((t.name || '').length / 16) + 1));
    hdr.height = linieNaglowka * 15;
    hdr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    for (const { u, najblizszy } of wiersze) {
        const r = ws.addRow([
            fullName(u), u.team || '', u.orderIds.map(id => ordersById[id]?.name).filter(Boolean).join('\n'),
            ...types.map(t => {
                const ut = u.trainings.find(x => x.trainingTypeId === t.id);
                return !ut ? '' : ut.validUntil ? xlData(ut.validUntil) : 'bezterminowe';
            }),
            najblizszy ? xlData(najblizszy.validUntil) : '',
            najblizszy ? (types.find(t => t.id === najblizszy.trainingTypeId)?.name || '') : '',
            najblizszy ? daysTo(najblizszy.validUntil, today) : '',
        ]);
        r.alignment = { vertical: 'top', wrapText: true };
        types.forEach((t, i) => {
            const ut = u.trainings.find(x => x.trainingTypeId === t.id);
            if (!ut) return;
            const c = r.getCell(4 + i);
            c.fill = fill(XL_KOLOR[trainingStatus(ut, today)]);
            c.alignment = { horizontal: 'center', vertical: 'top' };
        });
        if (najblizszy) r.getCell(4 + nT).fill = fill(XL_KOLOR[trainingStatus(najblizszy, today)]);
    }
    const szer = [24, 16, 40, ...Array(nT).fill(18), 14, 30, 12];
    szer.forEach((w, i) => {
        const c = ws.getColumn(i + 1);
        c.width = w;
        if (i >= 3 && i <= 3 + nT) c.numFmt = 'dd.mm.yyyy';
    });
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: szer.length } };

    const ws2 = wb.addWorksheet('Szczegóły', { views: [{ state: 'frozen', ySplit: 1 }] });
    naglowek(ws2.addRow(['Pracownik', 'Zespół', 'Szkolenie', 'Kod', 'Ukończone', 'Ważne do', 'Dni do terminu', 'Status',
        'Nr zaświadczenia', 'Wymagane w zamówieniach', 'Pracownik przypisany do tych zamówień']));
    for (const { u } of wiersze) {
        for (const ut of u.trainings) {
            const t = types.find(x => x.id === ut.trainingTypeId);
            if (!t) continue;
            const st = trainingStatus(ut, today);
            const wymagane = t.orderIds.map(id => ordersById[id]).filter(Boolean);
            const r = ws2.addRow([
                fullName(u), u.team || '', t.name, t.code || '', xlData(ut.completedAt),
                ut.validUntil ? xlData(ut.validUntil) : 'bezterminowe', ut.validUntil ? daysTo(ut.validUntil, today) : '',
                XL_STATUS[st], ut.certificateNo || '', wymagane.map(o => o.name).join('\n'),
                wymagane.filter(o => u.orderIds.includes(o.id)).map(o => o.name).join('\n'),
            ]);
            r.alignment = { vertical: 'top', wrapText: true };
            r.getCell(8).fill = fill(XL_KOLOR[st]);
        }
    }
    [24, 16, 32, 10, 12, 13, 10, 16, 18, 40, 40].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });
    ws2.getColumn(5).numFmt = 'dd.mm.yyyy';
    ws2.getColumn(6).numFmt = 'dd.mm.yyyy';
    ws2.autoFilter = { from: 'A1', to: 'K1' };

    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `szkolenia_${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
