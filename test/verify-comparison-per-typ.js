/**
 * Testuje logikę "Porównanie per typ" + "Porównanie per pozycja" z UnifiedWbsPanel.jsx
 * (dropdowny + SUMIFS + Δ nowszy-starszy + kolumny współdzielone między obiema tabelami +
 * dopasowanie liścia przez hash zamiast tekstu) na syntetycznych danych, bez potrzeby
 * logowania/DB. Kod skopiowany 1:1 z handleExportBudgetExcel.
 */
const path = require('path');
const ExcelJS = require(require.resolve('exceljs', { paths: [path.join(__dirname, '..', 'apps', 'frontend', 'node_modules')] }));

// Regresja realnego buga: opisowa nazwa WĘZŁA (jeden poziom hierarchii, nie cała sklejona
// ścieżka) > 255 znaków (limit kryterium SUMIFS/COUNTIFS w Excelu). Pierwsza wersja poprawki
// (rozbicie ścieżki na kolumny per poziom) nadal padała, bo pojedynczy poziom sam w sobie
// bywa dłuższy niż limit — dlatego dopasowanie musi iść przez hash, nie przez tekst.
const longNodeName = 'Dostawa i uruchomienie urządzenia UPS Galaxy VS 120 kW 400V wraz z modułami akumulatorowymi pozwalającymi zapewnić czas podtrzymania zainstalowanych urządzeń w szafach rack min 1 godzina, wraz z pełną dokumentacją techniczną, protokołami odbioru oraz szkoleniem personelu obsługującego';
if (longNodeName.length <= 255) throw new Error('fixture błędu: longNodeName musi mieć > 255 znaków, ma ' + longNodeName.length);

// Klucz w leafByPath = parts.join(' / ') — jak w prawdziwym computeLeafByPath (parts = poziomy BEZ roota).
const leaf = (parts, cost, revenue) => [parts.join(' / '), { cost, revenue, parts }];

// 3 snapszoty (najnowszy pierwszy, jak z /ai/versions — createdAt desc), 3 typy, 7 liści.
// Liść "Sekcja E" ma DŁUGĄ nazwę węzła w środkowym poziomie (Gałąź 2), nie w nazwie liścia —
// dokładnie odtwarza zgłoszony bug (Gałąź 1 = "OPCJA1 DELTA-Dostawa i uruchomienie...").
const validSums = [
    { label: 'v3 (najnowszy)', createdAt: '2026-07-05T10:00:00.000Z', byType: {
        'Praca': { cost: 3200, revenue: 5850 },
        'Usługa': { cost: 3000, revenue: 3300 },
        'Materiał': { cost: 2206.8, revenue: 2647.32 },
    }, leafByPath: Object.fromEntries([
        leaf(['Sekcja A', 'Fundamenty'], 1000, 1800),
        leaf(['Sekcja A', 'Konstrukcja stalowa'], 2200, 4050),
        leaf(['Sekcja B', 'Instalacja elektryczna'], 1800, 2400),
        leaf(['Sekcja B', 'Wykończenie'], 900, 1400),
        leaf(['Sekcja D', 'Ogrodzenie'], 300, 500),
        leaf(['Sekcja E', longNodeName, 'kabel sygnalizacyjny UPS-Bypass 4x1mm'], 100, 125),
        // Podgrupa PRZEMIANOWANA między snapszotami (Gałąź 2 inna niż w v2) — musi się i tak
        // dopasować, bo Gałąź 1 + Pozycja jest ta sama i para jest jednoznaczna (brak kolizji).
        leaf(['Sekcja B', 'opis nowy podgrupy', 'Transport sprzętu'], 500, 700),
        // Kolizja celowa: dwie RÓŻNE pozycje o tej samej nazwie "kabel" w tej samej głównej
        // gałęzi "Sekcja B", ale w różnych podgrupach — nie mogą się zsumować po cichu.
        // Pierwsza ma DŁUGĄ nazwę podgrupy (>255 znaków) — po odpadnięciu do dopasowania po
        // pełnej ścieżce (fallback kolizji) resolvedKey sam w sobie jest > 255 znaków, więc to
        // też testuje że hash radzi sobie z długim kluczem W FALLBACKU, nie tylko w skrócie.
        leaf(['Sekcja B', longNodeName, 'kabel'], 200, 300),
        leaf(['Sekcja B', 'Bypass', 'kabel'], 150, 220),
    ]) },
    { label: 'v2', createdAt: '2026-06-01T10:00:00.000Z', byType: {
        'Praca': { cost: 2800, revenue: 5000 },
        'Usługa': { cost: 2500, revenue: 2800 },
        'Paliwo': { cost: 140, revenue: 154 }, // typ nieobecny w v3 -> musi wyjść 0 w SUMIFS
    }, leafByPath: Object.fromEntries([
        leaf(['Sekcja A', 'Fundamenty'], 900, 1600),
        leaf(['Sekcja A', 'Konstrukcja stalowa'], 2800, 5000),
        leaf(['Sekcja C', 'Paliwo do agregatu'], 140, 154), // liść nieobecny w v3 -> 0 w SUMIFS
        leaf(['Sekcja E', longNodeName, 'kabel sygnalizacyjny UPS-Bypass 4x1mm'], 80, 100), // ta sama głęboka ścieżka, inna wartość
        leaf(['Sekcja B', 'opis stary podgrupy', 'Transport sprzętu'], 450, 650), // ta sama pozycja co w v3, inna podgrupa (rename)
    ]) },
    { label: 'v1 (najstarszy)', createdAt: '2026-05-01T10:00:00.000Z', byType: {
        'Praca': { cost: 2000, revenue: 4000 },
    }, leafByPath: Object.fromEntries([
        leaf(['Sekcja A', 'Fundamenty'], 800, 1500),
    ]) },
];

const workbook = new ExcelJS.Workbook();
const compSheet = workbook.addWorksheet('Porównanie');
compSheet.columns = [{ width: 28 }, ...validSums.map(() => ({ width: 20 }))];
const hdrRow = compSheet.addRow(['Wskaźnik', ...validSums.map(s => s.label)]);
compSheet.addRow(['Koszt całkowity', ...validSums.map(s => Object.values(s.byType).reduce((a, b) => a + b.cost, 0))]);

// ---- BEGIN: kod 1:1 z UnifiedWbsPanel.jsx (sekcja "Porównanie per typ" + "per pozycja") ----
if (validSums.length >= 2) {
    const generalTableRange = compSheet.rowCount > 1 ? { from: { row: 1, column: 1 }, to: { row: compSheet.rowCount, column: compSheet.columnCount } } : null;

    const allTypeCosts = {};
    for (const s of validSums) {
        for (const [t, v] of Object.entries(s.byType || {})) {
            allTypeCosts[t] = (allTypeCosts[t] || 0) + v.cost;
        }
    }
    const allTypeLabels = Object.keys(allTypeCosts).sort((a, b) => allTypeCosts[b] - allTypeCosts[a]);
    const nSnaps = validSums.length;
    const nTypes = allTypeLabels.length;

    // Liście (dla "per pozycja") liczone TERAZ, żeby znać głębokość PRZED ułożeniem kolumn —
    // obie tabele mają wspólny układ (Gałąź 1..N → Typ/Pozycja → 12 kolumn metryk).
    //
    // Dopasowanie domyślnie po Gałąź 1 + Pozycja (odporne na rename/przenoszenie w poziomach
    // pośrednich). Kolizja = w JEDNYM snapszocie dwie różne pełne ścieżki dają ten sam short key
    // (naprawdę różne, jednocześnie istniejące pozycje) — wtedy fallback do pełnej ścieżki + flaga.
    const mainBranchOf = (parts) => (parts.length > 1 ? parts[0] : '(brak gałęzi)');
    const leafNameOf = (parts) => parts[parts.length - 1];
    const shortKeyOf = (parts) => `${mainBranchOf(parts)} :: ${leafNameOf(parts)}`;

    const collidingShortKeys = new Set();
    for (const s of validSums) {
        const seenInSnapshot = {};
        for (const [fullKey, v] of Object.entries(s.leafByPath || {})) {
            const sk = shortKeyOf(v.parts);
            if (seenInSnapshot[sk] !== undefined && seenInSnapshot[sk] !== fullKey) {
                collidingShortKeys.add(sk);
            }
            seenInSnapshot[sk] = fullKey;
        }
    }
    const resolvedKeyOf = (parts) => {
        const sk = shortKeyOf(parts);
        return collidingShortKeys.has(sk) ? parts.join(' / ') : sk;
    };
    for (const s of validSums) {
        const remapped = {};
        for (const v of Object.values(s.leafByPath || {})) {
            const rk = resolvedKeyOf(v.parts);
            if (!remapped[rk]) remapped[rk] = { cost: 0, revenue: 0, parts: v.parts, isCollision: collidingShortKeys.has(shortKeyOf(v.parts)) };
            remapped[rk].cost += v.cost;
            remapped[rk].revenue += v.revenue;
        }
        s.leafByResolvedKey = remapped;
    }

    const allLeafCosts = {};
    const leafParts = {};
    const leafIsCollision = {};
    for (const s of validSums) {
        for (const [rk, v] of Object.entries(s.leafByResolvedKey || {})) {
            allLeafCosts[rk] = (allLeafCosts[rk] || 0) + v.cost;
            if (!leafParts[rk]) leafParts[rk] = v.parts;
            if (v.isCollision) leafIsCollision[rk] = true;
        }
    }
    const allLeafPaths = Object.keys(allLeafCosts).sort((a, b) => allLeafCosts[b] - allLeafCosts[a]);
    const nLeaves = allLeafPaths.length;
    const maxDepth = allLeafPaths.reduce((m, p) => Math.max(m, leafParts[p].length), 0);
    const nBranchCols = Math.max(0, maxDepth - 1);
    const L = (idx) => compSheet.getColumn(idx).letter;
    const hashKey = (s) => {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
        return 'k' + (h >>> 0).toString(36);
    };

    const posIdx = nBranchCols + 1;
    const kAIdx = posIdx + 1, kBIdx = posIdx + 2, dKIdx = posIdx + 3;
    const rAIdx = posIdx + 4, rBIdx = posIdx + 5, dRIdx = posIdx + 6;
    const zAIdx = posIdx + 7, zBIdx = posIdx + 8, dZIdx = posIdx + 9;
    const mAIdx = posIdx + 10, mBIdx = posIdx + 11, dMIdx = posIdx + 12;
    const uwagaIdx = dMIdx + 1;
    const hashIdx = uwagaIdx + 1;

    for (let c = 1; c <= nBranchCols; c++) {
        const col = compSheet.getColumn(c);
        if (!col.width || col.width < 22) col.width = 22;
    }
    compSheet.getColumn(posIdx).width = Math.max(compSheet.getColumn(posIdx).width || 0, 45);
    for (let c = kAIdx; c <= dMIdx; c++) {
        const col = compSheet.getColumn(c);
        if (!col.width || col.width < 16) col.width = 16;
    }
    const colKA = L(kAIdx), colKB = L(kBIdx), colDK = L(dKIdx);
    const colRA = L(rAIdx), colRB = L(rBIdx), colDR = L(dRIdx);
    const colZA = L(zAIdx), colZB = L(zBIdx), colDZ = L(dZIdx);
    const colMA = L(mAIdx), colMB = L(mBIdx), colDM = L(dMIdx);
    const colPos = L(posIdx);

    const styleMetricGroups = (headerRowN, dataStartRowN, dataEndRowN) => {
        for (let r = headerRowN; r <= dataEndRowN; r++) {
            for (const col of [colKA, colRA, colZA, colMA]) {
                const cell = compSheet.getCell(`${col}${r}`);
                cell.border = { ...(cell.border || {}), left: { style: 'thick' } };
            }
        }
        for (let r = dataStartRowN; r <= dataEndRowN; r++) {
            for (const col of [colKA, colKB, colDK]) {
                const cell = compSheet.getCell(`${col}${r}`);
                cell.font = { ...(cell.font || {}), color: { argb: 'FFDC2626' } };
            }
            for (const col of [colRA, colRB]) {
                const cell = compSheet.getCell(`${col}${r}`);
                cell.font = { ...(cell.font || {}), bold: true };
            }
        }
    };

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
    compSheet.mergeCells(legendRowNum, 1, legendRowNum, dMIdx);

    const snapHeader = (pickerRowNum, snap, suffix) => ({ formula: `$B$${pickerRowNum}&"_${suffix}"`, result: `${snap.label}_${suffix}` });
    const headerRow = setRow(headerRowNum, [
        ...Array(nBranchCols).fill(undefined),
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
            ...Array(nBranchCols).fill(undefined),
            t,
            { formula: `SUMIFS(${rawCostCol},${rawSnapCol},$B$${pickerARowNum},${rawTypeCol},$${colPos}${rn})`, result: costA },
            { formula: `SUMIFS(${rawCostCol},${rawSnapCol},$B$${pickerBRowNum},${rawTypeCol},$${colPos}${rn})`, result: costB },
            { formula: `${orderFlagRef}*(${colKA}${rn}-${colKB}${rn})`, result: orderFlagDefault * (costA - costB) },
            { formula: `SUMIFS(${rawRevCol},${rawSnapCol},$B$${pickerARowNum},${rawTypeCol},$${colPos}${rn})`, result: revA },
            { formula: `SUMIFS(${rawRevCol},${rawSnapCol},$B$${pickerBRowNum},${rawTypeCol},$${colPos}${rn})`, result: revB },
            { formula: `${orderFlagRef}*(${colRA}${rn}-${colRB}${rn})`, result: orderFlagDefault * (revA - revB) },
            { formula: `${colRA}${rn}-${colKA}${rn}`, result: profitA },
            { formula: `${colRB}${rn}-${colKB}${rn}`, result: profitB },
            { formula: `${orderFlagRef}*(${colZA}${rn}-${colZB}${rn})`, result: orderFlagDefault * (profitA - profitB) },
            { formula: `IF(${colRA}${rn}=0,0,${colZA}${rn}/${colRA}${rn})`, result: marginA },
            { formula: `IF(${colRB}${rn}=0,0,${colZB}${rn}/${colRB}${rn})`, result: marginB },
            { formula: `${orderFlagRef}*(${colMA}${rn}-${colMB}${rn})`, result: orderFlagDefault * (marginA - marginB) },
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
        ...Array(nBranchCols).fill(undefined),
        'Razem',
        { formula: `SUM(${colKA}${dataFirstRow}:${colKA}${dataLastRow})`, result: razemCostA },
        { formula: `SUM(${colKB}${dataFirstRow}:${colKB}${dataLastRow})`, result: razemCostB },
        { formula: `SUM(${colDK}${dataFirstRow}:${colDK}${dataLastRow})`, result: orderFlagDefault * (razemCostA - razemCostB) },
        { formula: `SUM(${colRA}${dataFirstRow}:${colRA}${dataLastRow})`, result: razemRevA },
        { formula: `SUM(${colRB}${dataFirstRow}:${colRB}${dataLastRow})`, result: razemRevB },
        { formula: `SUM(${colDR}${dataFirstRow}:${colDR}${dataLastRow})`, result: orderFlagDefault * (razemRevA - razemRevB) },
        { formula: `${colRA}${razemRowNum}-${colKA}${razemRowNum}`, result: razemProfitA },
        { formula: `${colRB}${razemRowNum}-${colKB}${razemRowNum}`, result: razemProfitB },
        { formula: `${orderFlagRef}*(${colZA}${razemRowNum}-${colZB}${razemRowNum})`, result: orderFlagDefault * (razemProfitA - razemProfitB) },
        { formula: `IF(${colRA}${razemRowNum}=0,0,${colZA}${razemRowNum}/${colRA}${razemRowNum})`, result: razemMarginA },
        { formula: `IF(${colRB}${razemRowNum}=0,0,${colZB}${razemRowNum}/${colRB}${razemRowNum})`, result: razemMarginB },
        { formula: `${orderFlagRef}*(${colMA}${razemRowNum}-${colMB}${razemRowNum})`, result: orderFlagDefault * (razemMarginA - razemMarginB) },
    ]);
    razemRow.font = { bold: true };
    razemRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

    const moneyColsTyp = [colKA, colKB, colDK, colRA, colRB, colDR, colZA, colZB, colDZ];
    const pctColsTyp = [colMA, colMB, colDM];
    for (let r = dataFirstRow; r <= razemRowNum; r++) {
        for (const col of moneyColsTyp) compSheet.getCell(`${col}${r}`).numFmt = '#,##0.00';
        for (const col of pctColsTyp) compSheet.getCell(`${col}${r}`).numFmt = '0.00%';
        if (r > dataFirstRow && r < razemRowNum && (r - dataFirstRow) % 2 === 1) {
            compSheet.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        }
    }
    styleMetricGroups(headerRowNum, dataFirstRow, razemRowNum);

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

    // ---- Porównanie per pozycja (liście budżetu) — hash-based dopasowanie ----
    let leafHeaderRowNum, leafDataLastRow, leafTableWidth, leafDataFirstRow, leafRazemRowNum;
    if (nLeaves > 0) {
        leafTableWidth = uwagaIdx;
        compSheet.getColumn(hashIdx).hidden = true;
        compSheet.getColumn(uwagaIdx).width = Math.max(compSheet.getColumn(uwagaIdx).width || 0, 55);

        const leafTitleRowNum = rawLastRow + 2;
        leafHeaderRowNum = rawLastRow + 3;
        leafDataFirstRow = leafHeaderRowNum + 1;
        leafDataLastRow = leafDataFirstRow + nLeaves - 1;
        leafRazemRowNum = leafDataLastRow + 1;
        const leafRawTitleRowNum = leafRazemRowNum + 2;
        const leafRawHeaderRowNum = leafRawTitleRowNum + 1;
        const leafRawFirstRow = leafRawHeaderRowNum + 1;
        const leafRawLastRow = leafRawFirstRow + nLeaves * nSnaps - 1;

        const leafRawHashIdx = 2, leafRawCostIdx = 4, leafRawRevIdx = 5, leafRawProfitIdx = 6, leafRawMarginIdx = 7;

        const leafTitleRow = setRow(leafTitleRowNum, ['Porównanie per pozycja (liście budżetu)']);
        leafTitleRow.font = { bold: true, size: 12 };

        const branchHeaders = Array.from({ length: nBranchCols }, (_, i) => `Gałąź ${i + 1}`);
        const leafHeaderRow = setRow(leafHeaderRowNum, [
            ...branchHeaders,
            'Pozycja',
            snapHeader(pickerARowNum, sA, 'koszt'), snapHeader(pickerBRowNum, sB, 'koszt'), 'Δ Koszt',
            snapHeader(pickerARowNum, sA, 'przychód'), snapHeader(pickerBRowNum, sB, 'przychód'), 'Δ Przychód',
            snapHeader(pickerARowNum, sA, 'zysk'), snapHeader(pickerBRowNum, sB, 'zysk'), 'Δ Zysk',
            snapHeader(pickerARowNum, sA, 'marża'), snapHeader(pickerBRowNum, sB, 'marża'), 'Δ Marża',
            'Uwaga',
        ]);
        leafHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        leafHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

        const rawRangeCol2 = (idx) => `$${L(idx)}$${leafRawFirstRow}:$${L(idx)}$${leafRawLastRow}`;
        const leafRawSnapRange = rawRangeCol2(1);
        const leafRawHashRange = rawRangeCol2(leafRawHashIdx);
        const leafRawCostRange = rawRangeCol2(leafRawCostIdx);
        const leafRawRevRange = rawRangeCol2(leafRawRevIdx);
        const leafSumifs = (valueRange, pickerRowNum, rn) =>
            `SUMIFS(${valueRange},${leafRawSnapRange},$B$${pickerRowNum},${leafRawHashRange},$${L(hashIdx)}${rn})`;

        allLeafPaths.forEach((p, i) => {
            const rn = leafDataFirstRow + i;
            const parts = leafParts[p];
            const branchVals = parts.slice(0, -1);
            const leafName = parts[parts.length - 1];
            const costA = sA.leafByResolvedKey[p]?.cost || 0, costB = sB.leafByResolvedKey[p]?.cost || 0;
            const revA = sA.leafByResolvedKey[p]?.revenue || 0, revB = sB.leafByResolvedKey[p]?.revenue || 0;
            const profitA = revA - costA, profitB = revB - costB;
            const marginA = revA > 0 ? profitA / revA : 0, marginB = revB > 0 ? profitB / revB : 0;
            setRow(rn, [
                ...Array.from({ length: nBranchCols }, (_, j) => branchVals[j]),
                leafName,
                { formula: leafSumifs(leafRawCostRange, pickerARowNum, rn), result: costA },
                { formula: leafSumifs(leafRawCostRange, pickerBRowNum, rn), result: costB },
                { formula: `${orderFlagRef}*(${colKA}${rn}-${colKB}${rn})`, result: orderFlagDefault * (costA - costB) },
                { formula: leafSumifs(leafRawRevRange, pickerARowNum, rn), result: revA },
                { formula: leafSumifs(leafRawRevRange, pickerBRowNum, rn), result: revB },
                { formula: `${orderFlagRef}*(${colRA}${rn}-${colRB}${rn})`, result: orderFlagDefault * (revA - revB) },
                { formula: `${colRA}${rn}-${colKA}${rn}`, result: profitA },
                { formula: `${colRB}${rn}-${colKB}${rn}`, result: profitB },
                { formula: `${orderFlagRef}*(${colZA}${rn}-${colZB}${rn})`, result: orderFlagDefault * (profitA - profitB) },
                { formula: `IF(${colRA}${rn}=0,0,${colZA}${rn}/${colRA}${rn})`, result: marginA },
                { formula: `IF(${colRB}${rn}=0,0,${colZB}${rn}/${colRB}${rn})`, result: marginB },
                { formula: `${orderFlagRef}*(${colMA}${rn}-${colMB}${rn})`, result: orderFlagDefault * (marginA - marginB) },
                leafIsCollision[p] ? '⚠ Kilka pozycji o tej nazwie w tej gałęzi — dopasowano po pełnej ścieżce, sprawdź ręcznie' : undefined,
            ]);
            compSheet.getRow(rn).getCell(hashIdx).value = hashKey(p);
            if (leafIsCollision[p]) {
                compSheet.getRow(rn).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
            }
        });

        const leafRazemCostA = allLeafPaths.reduce((s, p) => s + (sA.leafByResolvedKey[p]?.cost || 0), 0);
        const leafRazemCostB = allLeafPaths.reduce((s, p) => s + (sB.leafByResolvedKey[p]?.cost || 0), 0);
        const leafRazemRevA = allLeafPaths.reduce((s, p) => s + (sA.leafByResolvedKey[p]?.revenue || 0), 0);
        const leafRazemRevB = allLeafPaths.reduce((s, p) => s + (sB.leafByResolvedKey[p]?.revenue || 0), 0);
        const leafRazemProfitA = leafRazemRevA - leafRazemCostA, leafRazemProfitB = leafRazemRevB - leafRazemCostB;
        const leafRazemMarginA = leafRazemRevA > 0 ? leafRazemProfitA / leafRazemRevA : 0;
        const leafRazemMarginB = leafRazemRevB > 0 ? leafRazemProfitB / leafRazemRevB : 0;
        const leafRazemRow = setRow(leafRazemRowNum, [
            ...Array(nBranchCols).fill(undefined),
            'Razem',
            { formula: `SUM(${colKA}${leafDataFirstRow}:${colKA}${leafDataLastRow})`, result: leafRazemCostA },
            { formula: `SUM(${colKB}${leafDataFirstRow}:${colKB}${leafDataLastRow})`, result: leafRazemCostB },
            { formula: `SUM(${colDK}${leafDataFirstRow}:${colDK}${leafDataLastRow})`, result: orderFlagDefault * (leafRazemCostA - leafRazemCostB) },
            { formula: `SUM(${colRA}${leafDataFirstRow}:${colRA}${leafDataLastRow})`, result: leafRazemRevA },
            { formula: `SUM(${colRB}${leafDataFirstRow}:${colRB}${leafDataLastRow})`, result: leafRazemRevB },
            { formula: `SUM(${colDR}${leafDataFirstRow}:${colDR}${leafDataLastRow})`, result: orderFlagDefault * (leafRazemRevA - leafRazemRevB) },
            { formula: `${colRA}${leafRazemRowNum}-${colKA}${leafRazemRowNum}`, result: leafRazemProfitA },
            { formula: `${colRB}${leafRazemRowNum}-${colKB}${leafRazemRowNum}`, result: leafRazemProfitB },
            { formula: `${orderFlagRef}*(${colZA}${leafRazemRowNum}-${colZB}${leafRazemRowNum})`, result: orderFlagDefault * (leafRazemProfitA - leafRazemProfitB) },
            { formula: `IF(${colRA}${leafRazemRowNum}=0,0,${colZA}${leafRazemRowNum}/${colRA}${leafRazemRowNum})`, result: leafRazemMarginA },
            { formula: `IF(${colRB}${leafRazemRowNum}=0,0,${colZB}${leafRazemRowNum}/${colRB}${leafRazemRowNum})`, result: leafRazemMarginB },
            { formula: `${orderFlagRef}*(${colMA}${leafRazemRowNum}-${colMB}${leafRazemRowNum})`, result: orderFlagDefault * (leafRazemMarginA - leafRazemMarginB) },
        ]);
        leafRazemRow.font = { bold: true };
        leafRazemRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

        const moneyCols = [colKA, colKB, colDK, colRA, colRB, colDR, colZA, colZB, colDZ];
        const pctCols = [colMA, colMB, colDM];
        for (let r = leafDataFirstRow; r <= leafRazemRowNum; r++) {
            for (const col of moneyCols) compSheet.getCell(`${col}${r}`).numFmt = '#,##0.00';
            for (const col of pctCols) compSheet.getCell(`${col}${r}`).numFmt = '0.00%';
            const isCollisionRow = leafIsCollision[allLeafPaths[r - leafDataFirstRow]];
            if (!isCollisionRow && r > leafDataFirstRow && r < leafRazemRowNum && (r - leafDataFirstRow) % 2 === 1) {
                compSheet.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
            }
        }
        styleMetricGroups(leafHeaderRowNum, leafDataFirstRow, leafRazemRowNum);

        const leafRawTitleRow = setRow(leafRawTitleRowNum, ['Dane źródłowe (pomocnicze, generowane automatycznie — nie edytuj)']);
        leafRawTitleRow.font = { italic: true, size: 10, color: { argb: 'FF9CA3AF' } };
        leafRawTitleRow.hidden = true;
        const leafRawHeaderRow = setRow(leafRawHeaderRowNum, [
            'Snapshot', 'Hash', 'Pozycja (informacyjnie, pełna ścieżka)', 'Koszt', 'Przychód', 'Zysk', 'Marża%',
        ]);
        leafRawHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        leafRawHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
        leafRawHeaderRow.hidden = true;

        allLeafPaths.forEach((p, pi) => {
            const key = hashKey(p);
            validSums.forEach((s, si) => {
                const rn = leafRawFirstRow + pi * nSnaps + si;
                const cost = s.leafByResolvedKey[p]?.cost || 0;
                const revenue = s.leafByResolvedKey[p]?.revenue || 0;
                const profit = revenue - cost;
                const margin = revenue > 0 ? profit / revenue : 0;
                const row = setRow(rn, [
                    s.label,
                    key,
                    p,
                    cost,
                    revenue,
                    { formula: `E${rn}-D${rn}`, result: profit },
                    { formula: `IF(E${rn}=0,0,F${rn}/E${rn})`, result: margin },
                ]);
                row.getCell(leafRawCostIdx).numFmt = '#,##0.00';
                row.getCell(leafRawRevIdx).numFmt = '#,##0.00';
                row.getCell(leafRawProfitIdx).numFmt = '#,##0.00';
                row.getCell(leafRawMarginIdx).numFmt = '0.00%';
                row.hidden = true;
            });
        });
    }

    const perTypeRange = { from: { row: headerRowNum, column: 1 }, to: { row: dataLastRow, column: dMIdx } };
    const leafRange = nLeaves > 0 ? { from: { row: leafHeaderRowNum, column: 1 }, to: { row: leafDataLastRow, column: leafTableWidth } } : null;
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

    assert(orderFlagDefault === 1, 'orderFlagDefault = 1 (A jest nowszy niż B — najnowszy zawsze z lewej)');

    // Praca: A=v3(cost3200,rev5850), B=v2(cost2800,rev5000). Δ = nowszy(A)-starszy(B) = 400
    const pracaRowNum = dataFirstRow + allTypeLabels.indexOf('Praca');
    const pracaKA = res(compSheet.getCell(`${colKA}${pracaRowNum}`));
    assert(pracaKA === 3200, `Koszt A (v3) Praca = 3200, got ${pracaKA}`);
    const pracaDK = res(compSheet.getCell(`${colDK}${pracaRowNum}`));
    assert(pracaDK === 400, `Δ Koszt Praca = 400 (nowszy-starszy), got ${pracaDK}`);

    // Paliwo: B=v2 ma Paliwo(cost140), A=v3 nie ma -> costA=0, Δ=1*(0-140)=-140
    const paliwoRowNum = dataFirstRow + allTypeLabels.indexOf('Paliwo');
    assert(res(compSheet.getCell(`${colKA}${paliwoRowNum}`)) === 0, 'Koszt A (v3, najnowszy) dla Paliwo = 0 (typ nieobecny)');
    assert(res(compSheet.getCell(`${colDK}${paliwoRowNum}`)) === -140, 'Δ Koszt Paliwo = -140 (nowszy 0 minus starszy 140)');

    let sumDelta = 0;
    for (let r = dataFirstRow; r <= dataLastRow; r++) sumDelta += res(compSheet.getCell(`${colDK}${r}`));
    const razemDelta = res(compSheet.getCell(`${colDK}${razemRowNum}`));
    assert(Math.abs(sumDelta - razemDelta) < 1e-9, `Razem Δ Koszt (${razemDelta}) = suma Δ per typ (${sumDelta})`);

    const marzaARazem = res(compSheet.getCell(`${colMA}${razemRowNum}`));
    const expectedMarzaA = razemRevA > 0 ? (razemRevA - razemCostA) / razemRevA : 0;
    assert(Math.abs(marzaARazem - expectedMarzaA) < 1e-9, `Marża% A Razem liczona z sum (${marzaARazem}) = zysk_total/przychod_total (${expectedMarzaA})`);

    assert(pickerARow.getCell(2).dataValidation?.formulae[0] === dropdownRange, 'dropdown A ma poprawną walidację listy');
    assert(dropdownLastRow - dropdownFirstRow + 1 === nSnaps, `zakres dropdown obejmuje dokładnie ${nSnaps} snapszoty`);

    // ---- asercje: WSPÓLNY układ kolumn obu tabel (koszt pod kosztem, przychód pod przychodem) ----
    assert(nBranchCols === 2, `nBranchCols = 2 (najgłębszy liść ma 3 poziomy bez roota), got ${nBranchCols}`);
    const typHeaderVal = compSheet.getCell(`${colPos}${headerRowNum}`).value;
    assert(typHeaderVal === 'Typ', `nagłówek "Typ" tabeli per typ jest w tej samej kolumnie (${colPos}) co "Pozycja" tabeli per pozycja`);
    const pozycjaHeaderVal = compSheet.getCell(`${colPos}${leafHeaderRowNum}`).value;
    assert(pozycjaHeaderVal === 'Pozycja', `nagłówek "Pozycja" w tej samej kolumnie ${colPos} co "Typ" wyżej`);
    // Koszt A obu tabel w TEJ SAMEJ kolumnie (colKA) -> "koszt pod kosztem"
    assert(compSheet.getCell(`${colKA}${headerRowNum}`).value.result.endsWith('_koszt'), 'nagłówek Koszt A tabeli per typ w kolumnie colKA');
    assert(compSheet.getCell(`${colKA}${leafHeaderRowNum}`).value.result.endsWith('_koszt'), 'nagłówek Koszt A tabeli per pozycja w TEJ SAMEJ kolumnie colKA co per typ');
    // Kolumny 1..nBranchCols muszą być puste dla tabeli per typ (Typ nie ma gałęzi)
    for (let c = 1; c <= nBranchCols; c++) {
        assert(compSheet.getCell(`${L(c)}${headerRowNum}`).value == null, `kolumna ${L(c)} (Gałąź) pusta w nagłówku tabeli per typ`);
        assert(compSheet.getCell(`${L(c)}${dataFirstRow}`).value == null, `kolumna ${L(c)} (Gałąź) pusta w wierszach danych tabeli per typ`);
    }

    // ---- asercje: Porównanie per pozycja (liście) ----
    assert(nLeaves === 10, `union pozycji = 10 (8 dopasowanych po Gałąź1+Pozycja + 2 kolidujące po pełnej ścieżce), got ${nLeaves}`);
    assert(allLeafPaths[0] === 'Sekcja A :: Konstrukcja stalowa', 'najdroższa pozycja (suma 5000) jest pierwsza');
    assert(!allLeafPaths[0].includes('Projekt'), 'root NIE jest częścią klucza dopasowania (wymaganie "bez roota")');

    const paliwoLeafRowNum = leafDataFirstRow + allLeafPaths.indexOf('Sekcja C :: Paliwo do agregatu');
    assert(res(compSheet.getCell(`${colKA}${paliwoLeafRowNum}`)) === 0, 'Koszt A (v3) dla pozycji obecnej tylko w v2 = 0');
    assert(res(compSheet.getCell(`${colDK}${paliwoLeafRowNum}`)) === -140, 'Δ Koszt pozycji obecnej tylko w v2 = -140 (nowszy 0 - starszy 140)');

    // ---- Rename gałęzi pośredniej MIĘDZY snapszotami -> ma się MERGE'OWAĆ (nie kolizja) ----
    const transportRowNum = leafDataFirstRow + allLeafPaths.indexOf('Sekcja B :: Transport sprzętu');
    assert(transportRowNum >= leafDataFirstRow, '"Sekcja B :: Transport sprzętu" istnieje jako JEDEN wiersz mimo zmiany Gałąź 2 między snapszotami');
    assert(res(compSheet.getCell(`${colKA}${transportRowNum}`)) === 500, `Koszt A (v3) Transport sprzętu = 500 mimo innej Gałąź 2 niż w v2, got ${res(compSheet.getCell(`${colKA}${transportRowNum}`))}`);
    assert(res(compSheet.getCell(`${colKB}${transportRowNum}`)) === 450, `Koszt B (v2) Transport sprzętu = 450, got ${res(compSheet.getCell(`${colKB}${transportRowNum}`))}`);
    assert(res(compSheet.getCell(`${colDK}${transportRowNum}`)) === 50, `Δ Koszt Transport sprzętu = 50 (500-450), got ${res(compSheet.getCell(`${colDK}${transportRowNum}`))}`);
    assert(compSheet.getCell(`${L(uwagaIdx)}${transportRowNum}`).value == null, 'brak Uwagi dla renamowanej-ale-jednoznacznej pozycji (nie jest kolizją)');

    // ---- Kolizja PRAWDZIWA: dwie różne pozycje "kabel" w tej samej Sekcji B, różne podgrupy ----
    // Jedna z nich ma DODATKOWO bardzo długą nazwę podgrupy (>255 znaków) — testuje że fallback
    // do pełnej ścieżki (przy kolizji) też działa poprawnie przez hash, nie tylko krótki klucz.
    const collisionKey1 = ['Sekcja B', longNodeName, 'kabel'].join(' / ');
    const collisionKey2 = ['Sekcja B', 'Bypass', 'kabel'].join(' / ');
    assert(collisionKey1.length > 255, 'klucz kolidującej pozycji z długą nazwą podgrupy ma > 255 znaków');
    const collRow1 = leafDataFirstRow + allLeafPaths.indexOf(collisionKey1);
    const collRow2 = leafDataFirstRow + allLeafPaths.indexOf(collisionKey2);
    assert(collRow1 >= leafDataFirstRow && collRow2 >= leafDataFirstRow && collRow1 !== collRow2, 'obie kolidujące pozycje "kabel" istnieją jako OSOBNE wiersze (nie zsumowane po cichu)');
    assert(res(compSheet.getCell(`${colKA}${collRow1}`)) === 200, `Koszt A pierwszej kolidującej pozycji "kabel" = 200 (nie 350), got ${res(compSheet.getCell(`${colKA}${collRow1}`))}`);
    assert(res(compSheet.getCell(`${colKA}${collRow2}`)) === 150, `Koszt A drugiej kolidującej pozycji "kabel" = 150 (nie 350), got ${res(compSheet.getCell(`${colKA}${collRow2}`))}`);
    const uwaga1 = compSheet.getCell(`${L(uwagaIdx)}${collRow1}`).value;
    const uwaga2 = compSheet.getCell(`${L(uwagaIdx)}${collRow2}`).value;
    assert(typeof uwaga1 === 'string' && uwaga1.includes('Kilka pozycji'), 'pierwsza kolidująca pozycja ma widoczne ostrzeżenie "Uwaga"');
    assert(typeof uwaga2 === 'string' && uwaga2.includes('Kilka pozycji'), 'druga kolidująca pozycja ma widoczne ostrzeżenie "Uwaga"');
    assert(compSheet.getRow(collRow1).fill?.fgColor?.argb === 'FFFDE68A', 'kolidujący wiersz ma żółte podświetlenie (nie zwykłe paskowanie)');

    let leafSumDelta = 0;
    for (let r = leafDataFirstRow; r < leafRazemRowNum; r++) leafSumDelta += res(compSheet.getCell(`${colDK}${r}`));
    assert(Math.abs(leafSumDelta - res(compSheet.getCell(`${colDK}${leafRazemRowNum}`))) < 1e-9, 'Razem Δ Koszt (liście) = suma Δ per pozycja');

    const leafHeaderKA = compSheet.getCell(`${colKA}${leafHeaderRowNum}`).value;
    assert(leafHeaderKA.result === `${sA.label}_koszt`, `nagłówek Koszt A tabeli liści = "${sA.label}_koszt" (dynamiczny)`);

    // ---- asercje: bloki danych źródłowych są ukryte, tabele widoczne nie ----
    assert(compSheet.getRow(rawTitleRowNum).hidden === true, 'wiersz tytułowy bloku źródłowego (per typ) jest ukryty');
    assert(compSheet.getRow(rawFirstRow).hidden === true, 'pierwszy wiersz danych bloku źródłowego (per typ) jest ukryty');
    assert(compSheet.getRow(razemRowNum).hidden !== true, 'wiersz Razem tabeli per typ (widoczny) NIE jest ukryty');
    assert(compSheet.getRow(leafDataFirstRow).hidden !== true, 'pierwszy wiersz tabeli per pozycja (widoczny) NIE jest ukryty');
    assert(compSheet.getColumn(hashIdx).hidden === true, 'kolumna hash (dopasowanie liścia) jest ukryta');

    assert(compSheet.autoFilter && compSheet.autoFilter.from.row === leafHeaderRowNum, 'autoFilter trafia na tabelę per pozycja (najwięcej wierszy)');

    const legendText = res(compSheet.getCell(`A${legendRowNum}`));
    assert(legendText.includes(`${newerLabelDefault} (nowszy)`) && legendText.includes(`${olderLabelDefault} (starszy)`), `legenda opisuje kierunek Δ: "${legendText}"`);

    // ---- asercje: stylowanie grup metryk (czerwony koszt, pogrubiona cena ofertowa, grube krawędzie) ----
    assert(compSheet.getCell(`${colKA}${pracaRowNum}`).font.color.argb === 'FFDC2626', 'Koszt A (per typ) ma czerwony font');
    assert(compSheet.getCell(`${colKB}${pracaRowNum}`).font.color.argb === 'FFDC2626', 'Koszt B (per typ) ma czerwony font');
    assert(compSheet.getCell(`${colDK}${pracaRowNum}`).font.color.argb === 'FFDC2626', 'Δ Koszt (per typ) ma czerwony font');
    assert(compSheet.getCell(`${colRA}${pracaRowNum}`).font.bold === true, 'Przychód A (cena ofertowa, per typ) jest pogrubiony');
    assert(compSheet.getCell(`${colRB}${pracaRowNum}`).font.bold === true, 'Przychód B (cena ofertowa, per typ) jest pogrubiony');
    assert(compSheet.getCell(`${colZA}${pracaRowNum}`).font?.color?.argb !== 'FFDC2626', 'Zysk NIE jest czerwony (tylko koszt)');
    assert(compSheet.getCell(`${colKA}${headerRowNum}`).border?.left?.style === 'thick', 'gruba krawędź między Typ/Pozycja a grupą Koszt (nagłówek per typ)');
    assert(compSheet.getCell(`${colRA}${headerRowNum}`).border?.left?.style === 'thick', 'gruba krawędź między Koszt a Przychód (nagłówek per typ)');
    assert(compSheet.getCell(`${colZA}${headerRowNum}`).border?.left?.style === 'thick', 'gruba krawędź między Przychód a Zysk (nagłówek per typ)');
    assert(compSheet.getCell(`${colMA}${headerRowNum}`).border?.left?.style === 'thick', 'gruba krawędź między Zysk a Marża (nagłówek per typ)');
    assert(compSheet.getCell(`${colKA}${razemRowNum}`).font.color.argb === 'FFDC2626', 'Razem wiersz też ma czerwony Koszt A');

    // to samo w tabeli per pozycja
    assert(compSheet.getCell(`${colKA}${transportRowNum}`).font.color.argb === 'FFDC2626', 'Koszt A (per pozycja) ma czerwony font');
    assert(compSheet.getCell(`${colRA}${transportRowNum}`).font.bold === true, 'Przychód A (per pozycja) jest pogrubiony');
    assert(compSheet.getCell(`${colRA}${leafHeaderRowNum}`).border?.left?.style === 'thick', 'gruba krawędź między Koszt a Przychód (nagłówek per pozycja)');

    console.log('\nWszystkie asercje przeszły. Zapisuję plik testowy...');
}
// ---- END kodu z UnifiedWbsPanel.jsx ----

(async () => {
    const outPath = path.join(__dirname, '_scratch_comparison_per_typ.xlsx');
    await workbook.xlsx.writeFile(outPath);
    console.log('Zapisano:', outPath);
})();
