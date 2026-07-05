/**
 * Testuje logikę "Porównanie per typ" z UnifiedWbsPanel.jsx (dropdowny + SUMIFS + Δ nowszy-starszy)
 * na syntetycznych danych, bez potrzeby logowania/DB. Kod skopiowany 1:1 z handleExportBudgetExcel.
 */
const path = require('path');
const ExcelJS = require(require.resolve('exceljs', { paths: [path.join(__dirname, '..', 'apps', 'frontend', 'node_modules')] }));

// 3 snapszoty (najnowszy pierwszy, jak z /ai/versions — createdAt desc), 3 typy, 3 liście.
const validSums = [
    { label: 'v3 (najnowszy)', createdAt: '2026-07-05T10:00:00.000Z', byType: {
        'Praca': { cost: 3200, revenue: 5850 },
        'Usługa': { cost: 3000, revenue: 3300 },
        'Materiał': { cost: 2206.8, revenue: 2647.32 },
    }, leafByPath: {
        'Projekt / Sekcja A / Fundamenty': { cost: 1000, revenue: 1800 },
        'Projekt / Sekcja A / Konstrukcja stalowa': { cost: 2200, revenue: 4050 },
        'Projekt / Sekcja B / Instalacja elektryczna': { cost: 1800, revenue: 2400 },
        'Projekt / Sekcja B / Wykończenie': { cost: 900, revenue: 1400 },
        'Projekt / Sekcja D / Ogrodzenie': { cost: 300, revenue: 500 },
    } },
    { label: 'v2', createdAt: '2026-06-01T10:00:00.000Z', byType: {
        'Praca': { cost: 2800, revenue: 5000 },
        'Usługa': { cost: 2500, revenue: 2800 },
        'Paliwo': { cost: 140, revenue: 154 }, // typ nieobecny w v3 -> musi wyjść 0 w SUMIFS
    }, leafByPath: {
        'Projekt / Sekcja A / Fundamenty': { cost: 900, revenue: 1600 },
        'Projekt / Sekcja A / Konstrukcja stalowa': { cost: 2800, revenue: 5000 },
        'Projekt / Sekcja C / Paliwo do agregatu': { cost: 140, revenue: 154 }, // liść nieobecny w v3 -> 0 w SUMIFS
    } },
    { label: 'v1 (najstarszy)', createdAt: '2026-05-01T10:00:00.000Z', byType: {
        'Praca': { cost: 2000, revenue: 4000 },
    }, leafByPath: {
        'Projekt / Sekcja A / Fundamenty': { cost: 800, revenue: 1500 },
    } },
];

const workbook = new ExcelJS.Workbook();
const compSheet = workbook.addWorksheet('Porównanie');
compSheet.columns = [{ width: 28 }, ...validSums.map(() => ({ width: 20 }))];
const hdrRow = compSheet.addRow(['Wskaźnik', ...validSums.map(s => s.label)]);
compSheet.addRow(['Koszt całkowity', ...validSums.map(s => Object.values(s.byType).reduce((a, b) => a + b.cost, 0))]);

// ---- BEGIN: kod 1:1 z UnifiedWbsPanel.jsx (sekcja "Porównanie per typ") ----
if (validSums.length >= 2) {
    const generalTableRange = compSheet.rowCount > 1 ? { from: { row: 1, column: 1 }, to: { row: compSheet.rowCount, column: compSheet.columnCount } } : null;
    for (let c = 2; c <= 13; c++) {
        const col = compSheet.getColumn(c);
        if (!col.width || col.width < 16) col.width = 16;
    }
    compSheet.getColumn(1).width = Math.max(compSheet.getColumn(1).width || 0, 24);

    const allTypeCosts = {};
    for (const s of validSums) {
        for (const [t, v] of Object.entries(s.byType || {})) {
            allTypeCosts[t] = (allTypeCosts[t] || 0) + v.cost;
        }
    }
    const allTypeLabels = Object.keys(allTypeCosts).sort((a, b) => allTypeCosts[b] - allTypeCosts[a]);
    const nSnaps = validSums.length;
    const nTypes = allTypeLabels.length;

    const baseRow = compSheet.rowCount;
    const pickerARowNum = baseRow + 3;
    const pickerBRowNum = baseRow + 4;
    const orderFlagRowNum = baseRow + 5;
    const legendRowNum = baseRow + 6;
    const headerRowNum = baseRow + 8;
    const dataFirstRow = headerRowNum + 1;
    const dataLastRow = dataFirstRow + nTypes - 1;
    const razemRowNum = dataLastRow + 1;
    const rawTitleRowNum = razemRowNum + 2;
    const rawHeaderRowNum = rawTitleRowNum + 1;
    const rawFirstRow = rawHeaderRowNum + 1;
    const rawLastRow = rawFirstRow + nTypes * nSnaps - 1;
    const dropdownFirstRow = rawFirstRow;
    const dropdownLastRow = rawFirstRow + nSnaps - 1;

    const defaultIdxA = 0, defaultIdxB = 1;
    const sA = validSums[defaultIdxA], sB = validSums[defaultIdxB];
    const orderFlagDefault = new Date(sA.createdAt) >= new Date(sB.createdAt) ? 1 : -1;

    const setRow = (rowNum, values) => {
        const row = compSheet.getRow(rowNum);
        values.forEach((v, i) => { if (v !== undefined) row.getCell(i + 1).value = v; });
        row.commit();
        return row;
    };

    const titleRow = setRow(baseRow + 2, ['Porównanie per typ']);
    titleRow.font = { bold: true, size: 12 };

    const dropdownRange = `$A$${dropdownFirstRow}:$A$${dropdownLastRow}`;
    const pickerARow = setRow(pickerARowNum, ['Snapshot A', sA.label]);
    pickerARow.getCell(1).font = { bold: true };
    pickerARow.getCell(2).dataValidation = { type: 'list', allowBlank: false, formulae: [dropdownRange] };
    const pickerBRow = setRow(pickerBRowNum, ['Snapshot B', sB.label]);
    pickerBRow.getCell(1).font = { bold: true };
    pickerBRow.getCell(2).dataValidation = { type: 'list', allowBlank: false, formulae: [dropdownRange] };

    const dateRange = `$B$${dropdownFirstRow}:$B$${dropdownLastRow}`;
    const orderFlagRow = setRow(orderFlagRowNum, [
        'Kolejność (automatyczne, nie edytuj)',
        {
            formula: `IF(INDEX(${dateRange},MATCH($B$${pickerARowNum},${dropdownRange},0))>=INDEX(${dateRange},MATCH($B$${pickerBRowNum},${dropdownRange},0)),1,-1)`,
            result: orderFlagDefault,
        },
    ]);
    orderFlagRow.getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' } };
    orderFlagRow.getCell(2).font = { italic: true, color: { argb: 'FF9CA3AF' } };
    const orderFlagRef = `$B$${orderFlagRowNum}`;

    const newerLabelDefault = orderFlagDefault === 1 ? sA.label : sB.label;
    const olderLabelDefault = orderFlagDefault === 1 ? sB.label : sA.label;
    const legendRow = setRow(legendRowNum, [
        {
            formula: `"Δ = " & IF(${orderFlagRef}=1,$B$${pickerARowNum},$B$${pickerBRowNum}) & " (nowszy) minus " & IF(${orderFlagRef}=1,$B$${pickerBRowNum},$B$${pickerARowNum}) & " (starszy) — dodatnia Δ = wzrost, ujemna = spadek. Dotyczy obu tabel niżej."`,
            result: `Δ = ${newerLabelDefault} (nowszy) minus ${olderLabelDefault} (starszy) — dodatnia Δ = wzrost, ujemna = spadek. Dotyczy obu tabel niżej.`,
        },
    ]);
    legendRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF9CA3AF' } };
    compSheet.mergeCells(legendRowNum, 1, legendRowNum, 13);

    const snapHeader = (pickerRowNum, snap, suffix) => ({ formula: `$B$${pickerRowNum}&"_${suffix}"`, result: `${snap.label}_${suffix}` });
    const headerRow = setRow(headerRowNum, [
        'Typ',
        snapHeader(pickerARowNum, sA, 'koszt'), snapHeader(pickerBRowNum, sB, 'koszt'), 'Δ Koszt',
        snapHeader(pickerARowNum, sA, 'przychód'), snapHeader(pickerBRowNum, sB, 'przychód'), 'Δ Przychód',
        snapHeader(pickerARowNum, sA, 'zysk'), snapHeader(pickerBRowNum, sB, 'zysk'), 'Δ Zysk',
        snapHeader(pickerARowNum, sA, 'marża'), snapHeader(pickerBRowNum, sB, 'marża'), 'Δ Marża',
    ]);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

    const rawTypeCol = `$C$${rawFirstRow}:$C$${rawLastRow}`;
    const rawSnapCol = `$A$${rawFirstRow}:$A$${rawLastRow}`;
    const rawCostCol = `$D$${rawFirstRow}:$D$${rawLastRow}`;
    const rawRevCol = `$E$${rawFirstRow}:$E$${rawLastRow}`;

    allTypeLabels.forEach((t, i) => {
        const rn = dataFirstRow + i;
        const costA = sA.byType[t]?.cost || 0, costB = sB.byType[t]?.cost || 0;
        const revA = sA.byType[t]?.revenue || 0, revB = sB.byType[t]?.revenue || 0;
        const profitA = revA - costA, profitB = revB - costB;
        const marginA = revA > 0 ? profitA / revA : 0, marginB = revB > 0 ? profitB / revB : 0;
        setRow(rn, [
            t,
            { formula: `SUMIFS(${rawCostCol},${rawSnapCol},$B$${pickerARowNum},${rawTypeCol},$A${rn})`, result: costA },
            { formula: `SUMIFS(${rawCostCol},${rawSnapCol},$B$${pickerBRowNum},${rawTypeCol},$A${rn})`, result: costB },
            { formula: `${orderFlagRef}*(B${rn}-C${rn})`, result: orderFlagDefault * (costA - costB) },
            { formula: `SUMIFS(${rawRevCol},${rawSnapCol},$B$${pickerARowNum},${rawTypeCol},$A${rn})`, result: revA },
            { formula: `SUMIFS(${rawRevCol},${rawSnapCol},$B$${pickerBRowNum},${rawTypeCol},$A${rn})`, result: revB },
            { formula: `${orderFlagRef}*(E${rn}-F${rn})`, result: orderFlagDefault * (revA - revB) },
            { formula: `E${rn}-B${rn}`, result: profitA },
            { formula: `F${rn}-C${rn}`, result: profitB },
            { formula: `${orderFlagRef}*(H${rn}-I${rn})`, result: orderFlagDefault * (profitA - profitB) },
            { formula: `IF(E${rn}=0,0,H${rn}/E${rn})`, result: marginA },
            { formula: `IF(F${rn}=0,0,I${rn}/F${rn})`, result: marginB },
            { formula: `${orderFlagRef}*(K${rn}-L${rn})`, result: orderFlagDefault * (marginA - marginB) },
        ]);
    });

    const razemCostA = allTypeLabels.reduce((s, t) => s + (sA.byType[t]?.cost || 0), 0);
    const razemCostB = allTypeLabels.reduce((s, t) => s + (sB.byType[t]?.cost || 0), 0);
    const razemRevA = allTypeLabels.reduce((s, t) => s + (sA.byType[t]?.revenue || 0), 0);
    const razemRevB = allTypeLabels.reduce((s, t) => s + (sB.byType[t]?.revenue || 0), 0);
    const razemProfitA = razemRevA - razemCostA, razemProfitB = razemRevB - razemCostB;
    const razemMarginA = razemRevA > 0 ? razemProfitA / razemRevA : 0;
    const razemMarginB = razemRevB > 0 ? razemProfitB / razemRevB : 0;
    const razemRow = setRow(razemRowNum, [
        'Razem',
        { formula: `SUM(B${dataFirstRow}:B${dataLastRow})`, result: razemCostA },
        { formula: `SUM(C${dataFirstRow}:C${dataLastRow})`, result: razemCostB },
        { formula: `SUM(D${dataFirstRow}:D${dataLastRow})`, result: orderFlagDefault * (razemCostA - razemCostB) },
        { formula: `SUM(E${dataFirstRow}:E${dataLastRow})`, result: razemRevA },
        { formula: `SUM(F${dataFirstRow}:F${dataLastRow})`, result: razemRevB },
        { formula: `SUM(G${dataFirstRow}:G${dataLastRow})`, result: orderFlagDefault * (razemRevA - razemRevB) },
        { formula: `E${razemRowNum}-B${razemRowNum}`, result: razemProfitA },
        { formula: `F${razemRowNum}-C${razemRowNum}`, result: razemProfitB },
        { formula: `${orderFlagRef}*(H${razemRowNum}-I${razemRowNum})`, result: orderFlagDefault * (razemProfitA - razemProfitB) },
        { formula: `IF(E${razemRowNum}=0,0,H${razemRowNum}/E${razemRowNum})`, result: razemMarginA },
        { formula: `IF(F${razemRowNum}=0,0,I${razemRowNum}/F${razemRowNum})`, result: razemMarginB },
        { formula: `${orderFlagRef}*(K${razemRowNum}-L${razemRowNum})`, result: orderFlagDefault * (razemMarginA - razemMarginB) },
    ]);
    razemRow.font = { bold: true };
    razemRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

    for (let r = dataFirstRow; r <= razemRowNum; r++) {
        for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) compSheet.getCell(`${col}${r}`).numFmt = '#,##0.00';
        for (const col of ['K', 'L', 'M']) compSheet.getCell(`${col}${r}`).numFmt = '0.00%';
        if (r > dataFirstRow && r < razemRowNum && (r - dataFirstRow) % 2 === 1) {
            compSheet.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        }
    }

    const rawTitleRow = setRow(rawTitleRowNum, ['Dane źródłowe (pomocnicze, generowane automatycznie — nie edytuj)']);
    rawTitleRow.font = { italic: true, size: 10, color: { argb: 'FF9CA3AF' } };
    rawTitleRow.hidden = true;
    const rawHeaderRow = setRow(rawHeaderRowNum, ['Snapshot', 'Data utworzenia', 'Typ', 'Koszt', 'Przychód', 'Zysk', 'Marża%']);
    rawHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    rawHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
    rawHeaderRow.hidden = true;

    allTypeLabels.forEach((t, ti) => {
        validSums.forEach((s, si) => {
            const rn = rawFirstRow + ti * nSnaps + si;
            const cost = s.byType[t]?.cost || 0;
            const revenue = s.byType[t]?.revenue || 0;
            const profit = revenue - cost;
            const margin = revenue > 0 ? profit / revenue : 0;
            const row = setRow(rn, [
                s.label,
                s.createdAt ? new Date(s.createdAt) : null,
                t,
                cost,
                revenue,
                { formula: `E${rn}-D${rn}`, result: profit },
                { formula: `IF(E${rn}=0,0,F${rn}/E${rn})`, result: margin },
            ]);
            row.getCell(2).numFmt = 'yyyy-mm-dd hh:mm';
            row.getCell(4).numFmt = '#,##0.00';
            row.getCell(5).numFmt = '#,##0.00';
            row.getCell(6).numFmt = '#,##0.00';
            row.getCell(7).numFmt = '0.00%';
            row.hidden = true;
        });
    });

    // ---- Porównanie per pozycja (liście budżetu) — kopia 1:1 z UnifiedWbsPanel.jsx ----
    const allLeafCosts = {};
    for (const s of validSums) {
        for (const [p, v] of Object.entries(s.leafByPath || {})) {
            allLeafCosts[p] = (allLeafCosts[p] || 0) + v.cost;
        }
    }
    const allLeafPaths = Object.keys(allLeafCosts).sort((a, b) => allLeafCosts[b] - allLeafCosts[a]);
    const nLeaves = allLeafPaths.length;

    let leafDataFirstRow, leafRazemRowNum, leafHeaderRowNum, leafDataLastRow;
    if (nLeaves > 0) {
        compSheet.getColumn(1).width = Math.max(compSheet.getColumn(1).width || 0, 50);

        const leafTitleRowNum = rawLastRow + 2;
        leafHeaderRowNum = rawLastRow + 3;
        leafDataFirstRow = leafHeaderRowNum + 1;
        leafDataLastRow = leafDataFirstRow + nLeaves - 1;
        leafRazemRowNum = leafDataLastRow + 1;
        const leafRawTitleRowNum = leafRazemRowNum + 2;
        const leafRawHeaderRowNum = leafRawTitleRowNum + 1;
        const leafRawFirstRow = leafRawHeaderRowNum + 1;
        const leafRawLastRow = leafRawFirstRow + nLeaves * nSnaps - 1;

        const leafTitleRow = setRow(leafTitleRowNum, ['Porównanie per pozycja (liście budżetu)']);
        leafTitleRow.font = { bold: true, size: 12 };

        const leafHeaderRow = setRow(leafHeaderRowNum, [
            'Pozycja (ścieżka)',
            snapHeader(pickerARowNum, sA, 'koszt'), snapHeader(pickerBRowNum, sB, 'koszt'), 'Δ Koszt',
            snapHeader(pickerARowNum, sA, 'przychód'), snapHeader(pickerBRowNum, sB, 'przychód'), 'Δ Przychód',
            snapHeader(pickerARowNum, sA, 'zysk'), snapHeader(pickerBRowNum, sB, 'zysk'), 'Δ Zysk',
            snapHeader(pickerARowNum, sA, 'marża'), snapHeader(pickerBRowNum, sB, 'marża'), 'Δ Marża',
        ]);
        leafHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        leafHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

        const leafRawPosCol = `$C$${leafRawFirstRow}:$C$${leafRawLastRow}`;
        const leafRawSnapCol = `$A$${leafRawFirstRow}:$A$${leafRawLastRow}`;
        const leafRawCostCol = `$D$${leafRawFirstRow}:$D$${leafRawLastRow}`;
        const leafRawRevCol = `$E$${leafRawFirstRow}:$E$${leafRawLastRow}`;

        allLeafPaths.forEach((p, i) => {
            const rn = leafDataFirstRow + i;
            const costA = sA.leafByPath[p]?.cost || 0, costB = sB.leafByPath[p]?.cost || 0;
            const revA = sA.leafByPath[p]?.revenue || 0, revB = sB.leafByPath[p]?.revenue || 0;
            const profitA = revA - costA, profitB = revB - costB;
            const marginA = revA > 0 ? profitA / revA : 0, marginB = revB > 0 ? profitB / revB : 0;
            setRow(rn, [
                p,
                { formula: `SUMIFS(${leafRawCostCol},${leafRawSnapCol},$B$${pickerARowNum},${leafRawPosCol},$A${rn})`, result: costA },
                { formula: `SUMIFS(${leafRawCostCol},${leafRawSnapCol},$B$${pickerBRowNum},${leafRawPosCol},$A${rn})`, result: costB },
                { formula: `${orderFlagRef}*(B${rn}-C${rn})`, result: orderFlagDefault * (costA - costB) },
                { formula: `SUMIFS(${leafRawRevCol},${leafRawSnapCol},$B$${pickerARowNum},${leafRawPosCol},$A${rn})`, result: revA },
                { formula: `SUMIFS(${leafRawRevCol},${leafRawSnapCol},$B$${pickerBRowNum},${leafRawPosCol},$A${rn})`, result: revB },
                { formula: `${orderFlagRef}*(E${rn}-F${rn})`, result: orderFlagDefault * (revA - revB) },
                { formula: `E${rn}-B${rn}`, result: profitA },
                { formula: `F${rn}-C${rn}`, result: profitB },
                { formula: `${orderFlagRef}*(H${rn}-I${rn})`, result: orderFlagDefault * (profitA - profitB) },
                { formula: `IF(E${rn}=0,0,H${rn}/E${rn})`, result: marginA },
                { formula: `IF(F${rn}=0,0,I${rn}/F${rn})`, result: marginB },
                { formula: `${orderFlagRef}*(K${rn}-L${rn})`, result: orderFlagDefault * (marginA - marginB) },
            ]);
        });

        const leafRazemCostA = allLeafPaths.reduce((s, p) => s + (sA.leafByPath[p]?.cost || 0), 0);
        const leafRazemCostB = allLeafPaths.reduce((s, p) => s + (sB.leafByPath[p]?.cost || 0), 0);
        const leafRazemRevA = allLeafPaths.reduce((s, p) => s + (sA.leafByPath[p]?.revenue || 0), 0);
        const leafRazemRevB = allLeafPaths.reduce((s, p) => s + (sB.leafByPath[p]?.revenue || 0), 0);
        const leafRazemProfitA = leafRazemRevA - leafRazemCostA, leafRazemProfitB = leafRazemRevB - leafRazemCostB;
        const leafRazemMarginA = leafRazemRevA > 0 ? leafRazemProfitA / leafRazemRevA : 0;
        const leafRazemMarginB = leafRazemRevB > 0 ? leafRazemProfitB / leafRazemRevB : 0;
        const leafRazemRow = setRow(leafRazemRowNum, [
            'Razem',
            { formula: `SUM(B${leafDataFirstRow}:B${leafDataLastRow})`, result: leafRazemCostA },
            { formula: `SUM(C${leafDataFirstRow}:C${leafDataLastRow})`, result: leafRazemCostB },
            { formula: `SUM(D${leafDataFirstRow}:D${leafDataLastRow})`, result: orderFlagDefault * (leafRazemCostA - leafRazemCostB) },
            { formula: `SUM(E${leafDataFirstRow}:E${leafDataLastRow})`, result: leafRazemRevA },
            { formula: `SUM(F${leafDataFirstRow}:F${leafDataLastRow})`, result: leafRazemRevB },
            { formula: `SUM(G${leafDataFirstRow}:G${leafDataLastRow})`, result: orderFlagDefault * (leafRazemRevA - leafRazemRevB) },
            { formula: `E${leafRazemRowNum}-B${leafRazemRowNum}`, result: leafRazemProfitA },
            { formula: `F${leafRazemRowNum}-C${leafRazemRowNum}`, result: leafRazemProfitB },
            { formula: `${orderFlagRef}*(H${leafRazemRowNum}-I${leafRazemRowNum})`, result: orderFlagDefault * (leafRazemProfitA - leafRazemProfitB) },
            { formula: `IF(E${leafRazemRowNum}=0,0,H${leafRazemRowNum}/E${leafRazemRowNum})`, result: leafRazemMarginA },
            { formula: `IF(F${leafRazemRowNum}=0,0,I${leafRazemRowNum}/F${leafRazemRowNum})`, result: leafRazemMarginB },
            { formula: `${orderFlagRef}*(K${leafRazemRowNum}-L${leafRazemRowNum})`, result: orderFlagDefault * (leafRazemMarginA - leafRazemMarginB) },
        ]);
        leafRazemRow.font = { bold: true };
        leafRazemRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

        for (let r = leafDataFirstRow; r <= leafRazemRowNum; r++) {
            for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) compSheet.getCell(`${col}${r}`).numFmt = '#,##0.00';
            for (const col of ['K', 'L', 'M']) compSheet.getCell(`${col}${r}`).numFmt = '0.00%';
        }

        const leafRawTitleRow = setRow(leafRawTitleRowNum, ['Dane źródłowe (pomocnicze, generowane automatycznie — nie edytuj)']);
        leafRawTitleRow.font = { italic: true, size: 10, color: { argb: 'FF9CA3AF' } };
        leafRawTitleRow.hidden = true;
        const leafRawHeaderRow = setRow(leafRawHeaderRowNum, ['Snapshot', 'Data utworzenia', 'Pozycja (ścieżka)', 'Koszt', 'Przychód', 'Zysk', 'Marża%']);
        leafRawHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        leafRawHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
        leafRawHeaderRow.hidden = true;

        allLeafPaths.forEach((p, pi) => {
            validSums.forEach((s, si) => {
                const rn = leafRawFirstRow + pi * nSnaps + si;
                const cost = s.leafByPath[p]?.cost || 0;
                const revenue = s.leafByPath[p]?.revenue || 0;
                const profit = revenue - cost;
                const margin = revenue > 0 ? profit / revenue : 0;
                const row = setRow(rn, [
                    s.label,
                    s.createdAt ? new Date(s.createdAt) : null,
                    p,
                    cost,
                    revenue,
                    { formula: `E${rn}-D${rn}`, result: profit },
                    { formula: `IF(E${rn}=0,0,F${rn}/E${rn})`, result: margin },
                ]);
                row.getCell(2).numFmt = 'yyyy-mm-dd hh:mm';
                row.getCell(4).numFmt = '#,##0.00';
                row.getCell(5).numFmt = '#,##0.00';
                row.getCell(6).numFmt = '#,##0.00';
                row.getCell(7).numFmt = '0.00%';
                row.hidden = true;
            });
        });
    }

    const perTypeRange = { from: { row: headerRowNum, column: 1 }, to: { row: dataLastRow, column: 13 } };
    const leafRange = nLeaves > 0 ? { from: { row: leafHeaderRowNum, column: 1 }, to: { row: leafDataLastRow, column: 13 } } : null;
    const rowsIn = (r) => r.to.row - r.from.row;
    let chosenRange = generalTableRange;
    if (perTypeRange && (!chosenRange || rowsIn(perTypeRange) > rowsIn(chosenRange))) chosenRange = perTypeRange;
    if (leafRange && (!chosenRange || rowsIn(leafRange) > rowsIn(chosenRange))) chosenRange = leafRange;
    if (chosenRange) compSheet.autoFilter = chosenRange;

    // ---- assercje ----
    const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); console.log('OK: ' + msg); };
    // ExcelJS quirk: cached `result: 0` na formule bywa wewnętrznie odrzucane (obiekt zostaje
    // {formula} bez result) — to nie wpływa na plik (Excel przelicza formuły przy otwarciu),
    // ale test musi to uwzględnić przy odczycie wartości.
    const res = (cell) => (cell.value && typeof cell.value === 'object' ? (cell.value.result ?? 0) : cell.value);

    assert(allTypeLabels.length === 4, 'union typów = 4 (Praca, Usługa, Materiał, Paliwo)');
    assert(allTypeLabels.includes('Paliwo'), 'Paliwo (obecne tylko w v2) trafia do listy typów');

    // Domyślnie A=v3(najnowszy, lewe kolumny), B=v2 (prawe kolumny) -> newest leftmost.
    // orderFlag: dataA(2026-07-05) >= dataB(2026-06-01) => 1
    assert(orderFlagDefault === 1, 'orderFlagDefault = 1 (A jest nowszy niż B — najnowszy zawsze z lewej)');

    // Praca: A=v3(cost3200,rev5850), B=v2(cost2800,rev5000). Δ musi być nowszy(A)-starszy(B) = 3200-2800=400
    const pracaRowNum = dataFirstRow + allTypeLabels.indexOf('Praca');
    const pracaCell = compSheet.getCell(`D${pracaRowNum}`);
    assert(res(pracaCell) === 400, `Δ Koszt Praca = 400 (nowszy-starszy), got ${res(pracaCell)}`);

    // Paliwo: B=v2 ma Paliwo(cost140), A=v3 nie ma Paliwo -> costA=0, Δ=orderFlag*(0-140)=1*(-140)=-140 => (nowszy-starszy)=0-140=-140 OK
    const paliwoRowNum = dataFirstRow + allTypeLabels.indexOf('Paliwo');
    const paliwoCostA = compSheet.getCell(`B${paliwoRowNum}`);
    assert(res(paliwoCostA) === 0, `Koszt A (v3, najnowszy) dla Paliwo = 0 (typ nieobecny), got ${res(paliwoCostA)}`);
    const paliwoDelta = compSheet.getCell(`D${paliwoRowNum}`);
    assert(res(paliwoDelta) === -140, `Δ Koszt Paliwo = -140 (nowszy 0 minus starszy 140), got ${res(paliwoDelta)}`);

    // Razem: suma Δ Koszt wierszy powinna równać się D razemRowNum
    let sumDelta = 0;
    for (let r = dataFirstRow; r <= dataLastRow; r++) sumDelta += res(compSheet.getCell(`D${r}`));
    const razemDelta = res(compSheet.getCell(`D${razemRowNum}`));
    assert(Math.abs(sumDelta - razemDelta) < 1e-9, `Razem Δ Koszt (${razemDelta}) = suma Δ per typ (${sumDelta})`);

    // Marża Razem NIE jest średnią wierszy tylko zysk_total/przychod_total
    const marzaARazem = res(compSheet.getCell(`K${razemRowNum}`));
    const expectedMarzaA = razemRevA > 0 ? (razemRevA - razemCostA) / razemRevA : 0;
    assert(Math.abs(marzaARazem - expectedMarzaA) < 1e-9, `Marża% A Razem liczona z sum (${marzaARazem}) = zysk_total/przychod_total (${expectedMarzaA})`);

    // dataValidation na dropdownach obecna i wskazuje na poprawny zakres (pierwsza grupa typu w bloku źródłowym)
    assert(pickerARow.getCell(2).dataValidation?.formulae[0] === dropdownRange, 'dropdown A ma poprawną walidację listy');
    assert(dropdownLastRow - dropdownFirstRow + 1 === nSnaps, `zakres dropdown obejmuje dokładnie ${nSnaps} snapszoty (po jednym na typ[0])`);

    // ---- asercje: Porównanie per pozycja (liście) ----
    assert(nLeaves === 6, `union liści = 6 (więcej niż nTypes=4, żeby test tabeli per pozycja wygrywał priorytet autoFilter), got ${nLeaves}`);
    assert(allLeafPaths[0] === 'Projekt / Sekcja A / Konstrukcja stalowa', 'najdroższy liść (suma 5000) jest pierwszy');

    const paliwoLeafRowNum = leafDataFirstRow + allLeafPaths.indexOf('Projekt / Sekcja C / Paliwo do agregatu');
    assert(res(compSheet.getCell(`B${paliwoLeafRowNum}`)) === 0, 'Koszt A (v3) dla liścia obecnego tylko w v2 = 0');
    assert(res(compSheet.getCell(`D${paliwoLeafRowNum}`)) === -140, 'Δ Koszt liścia obecnego tylko w v2 = -140 (nowszy 0 - starszy 140)');

    let leafSumDelta = 0;
    for (let r = leafDataFirstRow; r < leafRazemRowNum; r++) leafSumDelta += res(compSheet.getCell(`D${r}`));
    assert(Math.abs(leafSumDelta - res(compSheet.getCell(`D${leafRazemRowNum}`))) < 1e-9, 'Razem Δ Koszt (liście) = suma Δ per pozycja');

    const leafHeaderB = compSheet.getCell(`B${leafHeaderRowNum}`).value;
    assert(leafHeaderB.result === `${sA.label}_koszt`, `nagłówek kolumny B tabeli liści = "${sA.label}_koszt" (dynamiczny, ten sam dropdown co tabela per typ)`);

    // ---- asercje: bloki danych źródłowych są ukryte, tabele widoczne nie ----
    assert(compSheet.getRow(rawTitleRowNum).hidden === true, 'wiersz tytułowy bloku źródłowego (per typ) jest ukryty');
    assert(compSheet.getRow(rawFirstRow).hidden === true, 'pierwszy wiersz danych bloku źródłowego (per typ) jest ukryty');
    assert(compSheet.getRow(razemRowNum).hidden !== true, 'wiersz Razem tabeli per typ (widoczny) NIE jest ukryty');
    assert(compSheet.getRow(leafDataFirstRow).hidden !== true, 'pierwszy wiersz tabeli per pozycja (widoczny) NIE jest ukryty');

    assert(compSheet.autoFilter && compSheet.autoFilter.from.row === leafHeaderRowNum, 'autoFilter trafia na tabelę per pozycja (najwięcej wierszy)');

    const legendText = res(compSheet.getCell(`A${legendRowNum}`));
    assert(legendText.includes(`${newerLabelDefault} (nowszy)`) && legendText.includes(`${olderLabelDefault} (starszy)`), `legenda opisuje kierunek Δ: "${legendText}"`);

    console.log('\nWszystkie asercje przeszły. Zapisuję plik testowy...');
}
// ---- END kodu z UnifiedWbsPanel.jsx ----

(async () => {
    const outPath = path.join(__dirname, '_scratch_comparison_per_typ.xlsx');
    await workbook.xlsx.writeFile(outPath);
    console.log('Zapisano:', outPath);
})();
