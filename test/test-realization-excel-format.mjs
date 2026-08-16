// Weryfikuje arkusz „Podsumowanie" z eksportu Realizacji: kolejność zakładek, format walutowy,
// dodatnie wartości w „Porównaniu globalnym", opis zakresu oraz narracyjną Analizę — w tym
// prognozę liczoną OSOBNO dla każdego rodzaju kosztów i polską odmianę liczebników.
// Odtwarza logikę z RealizationTab.jsx: @anchor realization-export-excel, @anchor realization-analysis.
import ExcelJS from '../apps/frontend/node_modules/exceljs/dist/es5/exceljs.nodejs.js';

const FMT_PLN = '#,##0.00\\ [$zł-415]';
const FMT_PLN_ODCZYT = '#,##0.00 [$zł-415]'; // ExcelJS przy odczycie rozwija escape `\ ` do spacji
const LEAF_TYPES = ['material', 'equipment', 'work', 'service', 'lodging', 'fuel'];
const TYPE_META = {
    material: { label: 'Materiał' }, equipment: { label: 'Sprzęt' }, work: { label: 'Praca' },
    service: { label: 'Usługa' }, lodging: { label: 'Nocleg' }, fuel: { label: 'Paliwo' },
};
const fmtZl = v => v == null ? '—' : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PROG_MIN_UDZIAL = 0.1; // @anchor realization-forecast-min-share

// ── kopia logiki z komponentu (@anchor realization-analysis) ─────────────────
const policzAnalize = (rows) => {
    let planR = 0, realR = 0, ruszone = 0, taniej = 0, drozej = 0, wPunkt = 0, oszczednosc = 0, przekroczenie = 0;
    const wgTypu = new Map();
    for (const { plan, real, closed, type } of rows) {
        const t = TYPE_META[type]?.label || type || '—';
        if (!wgTypu.has(t)) wgTypu.set(t, { typ: t, planCaly: 0, planRuszone: 0, realRuszone: 0 });
        const g = wgTypu.get(t);
        g.planCaly += plan;
        if (!(real > 0 || closed)) continue;
        const d = Math.round((real - plan) * 100) / 100;
        planR += plan; realR += real; ruszone += 1;
        g.planRuszone += plan; g.realRuszone += real;
        if (d < 0) { taniej += 1; oszczednosc -= d; }
        else if (d > 0) { drozej += 1; przekroczenie += d; }
        else wPunkt += 1;
    }
    const z2 = v => Math.round(v * 100) / 100;
    let prognoza = 0;
    for (const g of wgTypu.values()) {
        g.pelna = !(g.planCaly > 0 && g.planRuszone > 0 && g.realRuszone / g.planCaly >= PROG_MIN_UDZIAL);
        g.wsp = g.pelna ? 1 : g.realRuszone / g.planRuszone;
        prognoza += g.planCaly * g.wsp;
    }
    return {
        ruszone, taniej, drozej, wPunkt,
        planRuszone: z2(planR), realRuszone: z2(realR), deltaRuszone: z2(realR - planR),
        oszczednosc: z2(oszczednosc), przekroczenie: z2(przekroczenie),
        prognoza: z2(prognoza),
        typy: [...wgTypu.values()].map(g => ({ ...g, planCaly: z2(g.planCaly), planRuszone: z2(g.planRuszone), realRuszone: z2(g.realRuszone) })),
    };
};

const zbudujZdania = (totals, A) => {
    const zl = v => `${fmtZl(v)} zł`;
    const pct = (a, b) => `${(a / b * 100).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    const poz = n => n === 1 ? 'pozycja' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'pozycje' : 'pozycji';
    const zdania = [];

    if (!totals.plan) {
        zdania.push(`Pozycje w tym widoku nie mają kwot w wycenie, a na zakupy i wykonanie zadań poszło dotąd ${zl(totals.real)} — nie ma do czego porównać realizacji.`);
    } else if (totals.real > totals.plan) {
        zdania.push(`Wycena zamówienia to ${zl(totals.plan)}, a na zakupy i wykonanie zadań poszło dotąd ${zl(totals.real)} — budżet ofertowy jest wyczerpany i przekroczony o ${zl(totals.real - totals.plan)}, co daje ${pct(totals.real, totals.plan)} wyceny.`);
    } else {
        zdania.push(`Wycena zamówienia to ${zl(totals.plan)}, a na zakupy i wykonanie zadań poszło dotąd ${zl(totals.real)} — zrealizowano ${pct(totals.real, totals.plan)} budżetu ofertowego, do wykorzystania zostaje ${zl(totals.plan - totals.real)}.`);
    }

    if (!A.ruszone) {
        zdania.push(`Żadna z ${totals.count} pozycji w widoku nie ma jeszcze wpisu zakupu ani wykonania, więc nie da się jeszcze powiedzieć, czy kupujemy taniej, czy drożej niż zakładała wycena.`);
    } else {
        const udzial = totals.plan ? `, czyli ${pct(A.planRuszone, totals.plan)} całego budżetu` : '';
        zdania.push(`Realizacja ruszyła na ${A.ruszone} z ${totals.count} pozycji (${pct(A.ruszone, totals.count)}); w wycenie odpowiadały one za ${zl(A.planRuszone)}${udzial}.`);

        if (!A.planRuszone) zdania.push(`Ruszone pozycje nie miały w wycenie żadnej kwoty, więc całe ${zl(A.realRuszone)} to koszt ponad plan.`);
        else if (A.deltaRuszone < 0) zdania.push(`Na tych pozycjach wydano ${zl(A.realRuszone)} przy planie ${zl(A.planRuszone)} — jesteśmy do przodu o ${zl(-A.deltaRuszone)}, czyli kupujemy ${pct(-A.deltaRuszone, A.planRuszone)} poniżej wyceny.`);
        else if (A.deltaRuszone > 0) zdania.push(`Na tych pozycjach wydano ${zl(A.realRuszone)} przy planie ${zl(A.planRuszone)} — wydajemy o ${zl(A.deltaRuszone)} więcej, niż zakładano, czyli ${pct(A.deltaRuszone, A.planRuszone)} powyżej wyceny.`);
        else zdania.push(`Na tych pozycjach wydano dokładnie tyle, ile zakładała wycena — ${zl(A.realRuszone)}.`);

        zdania.push(`Poniżej wyceny: ${A.taniej} ${poz(A.taniej)} na łączną oszczędność ${zl(A.oszczednosc)}. Powyżej wyceny: ${A.drozej} ${poz(A.drozej)} na łączne przekroczenie ${zl(A.przekroczenie)}${A.wPunkt ? `. Dokładnie w planie: ${A.wPunkt} ${poz(A.wPunkt)}` : ''}.`);

        if (A.planRuszone > 0 && totals.plan && A.planRuszone / totals.plan < 0.2) {
            zdania.push(`Próba jest jednak mała: ruszone pozycje to dopiero ${pct(A.planRuszone, totals.plan)} wartości wyceny, więc prognozę traktuj orientacyjnie — o rzeczywistym wyniku zamówienia zdecydują pozycje jeszcze nietknięte.`);
        }
    }
    return zdania;
};

const zbudujArkusz = async (rows, visibleTypes) => {
    const totals = {
        plan: Math.round(rows.reduce((s, r) => s + r.plan, 0) * 100) / 100,
        real: Math.round(rows.reduce((s, r) => s + r.real, 0) * 100) / 100,
        count: rows.length,
    };
    const A = policzAnalize(rows);
    const wb = new ExcelJS.Workbook();
    const ps = wb.addWorksheet('Podsumowanie');
    wb.addWorksheet('Realizacja');
    ps.columns = [
        { header: '', key: 'a', width: 44 }, { header: '', key: 'b', width: 18 },
        { header: '', key: 'c', width: 18 }, { header: '', key: 'd', width: 18 },
        { header: '', key: 'e', width: 14 }, { header: '', key: 'f', width: 14 },
    ];
    const naglowek = t => { const r = ps.addRow({ a: t }); r.font = { bold: true }; return r; };
    const ZNAKI_A_F = 105, ZNAKI_B_F = 68;
    const wysokosc = (tekst, znaki) => Math.max(1, Math.ceil(String(tekst).length / znaki)) * 15 + 4;
    const wierszOpisowy = (label, tekst) => {
        const r = ps.addRow({ a: label, b: tekst });
        ps.mergeCells(`B${r.number}:F${r.number}`);
        r.getCell('b').alignment = { wrapText: true, vertical: 'top' };
        r.height = wysokosc(tekst, ZNAKI_B_F);
        return r;
    };

    naglowek('Realizacja — podsumowanie');
    const rodzaje = visibleTypes.map(t => TYPE_META[t]?.label || t);
    const zakresRow = wierszOpisowy('Zakres eksportu', visibleTypes.length === LEAF_TYPES.length
        ? 'cały zakres zamówienia'
        : `część zakresu — rodzaje kosztów: ${rodzaje.join(', ')}`);
    ps.addRow({});

    naglowek('Porównanie globalne');
    ps.addRow({ a: 'Koszt całkowity wyceny', b: totals.plan });
    ps.addRow({ a: 'Wartość zakupów / realizacji zadań', b: totals.real });
    const wRow = ps.rowCount - 1;
    ps.addRow({ a: 'Wartość niezrealizowanego budżetu ofertowego', b: { formula: `B${wRow}-B${wRow + 1}`, result: Math.round((totals.plan - totals.real) * 100) / 100 } });
    ps.addRow({ a: 'Procentowa realizacja budżetu', b: { formula: `IF(B${wRow}=0,"",B${wRow + 1}/B${wRow})`, result: totals.plan ? totals.real / totals.plan : '' } });
    ps.getCell(`B${ps.rowCount}`).numFmt = '0.0%';
    for (let r = wRow; r <= wRow + 2; r++) ps.getCell(`B${r}`).numFmt = FMT_PLN;
    ps.addRow({});

    let prognozaOd = 0, prognozaRazem = 0, notaProgu = '';
    if (A.ruszone) {
        naglowek('Prognoza wydatków');
        const glowka = ps.addRow({ a: 'Rodzaj kosztów', b: 'Wycena', c: 'Wykonanie', d: '% wykonania', e: 'Prognoza', f: 'Δ do oferty' });
        glowka.font = { bold: true };
        prognozaOd = ps.rowCount + 1;
        const typyP = A.typy.filter(g => g.planCaly > 0);
        for (const g of typyP) {
            const n = ps.rowCount + 1;
            const prog = Math.round(g.planCaly * g.wsp * 100) / 100;
            ps.addRow({
                a: g.typ, b: g.planCaly, c: g.realRuszone,
                d: { formula: `IF(B${n}=0,"",C${n}/B${n})`, result: g.planCaly ? g.realRuszone / g.planCaly : '' },
                e: prog,
                f: { formula: `B${n}-E${n}`, result: Math.round((g.planCaly - prog) * 100) / 100 },
            });
        }
        const doRow = ps.rowCount;
        const suma = ps.addRow({
            a: 'Razem',
            b: { formula: `SUM(B${prognozaOd}:B${doRow})`, result: totals.plan },
            c: { formula: `SUM(C${prognozaOd}:C${doRow})`, result: totals.real },
            d: { formula: `IF(B${ps.rowCount + 1}=0,"",C${ps.rowCount + 1}/B${ps.rowCount + 1})`, result: totals.plan ? totals.real / totals.plan : '' },
            e: { formula: `SUM(E${prognozaOd}:E${doRow})`, result: A.prognoza },
            f: { formula: `SUM(F${prognozaOd}:F${doRow})`, result: Math.round((totals.plan - A.prognoza) * 100) / 100 },
        });
        suma.font = { bold: true };
        for (let r = prognozaOd; r <= suma.number; r++) {
            for (const k of ['B', 'C', 'E', 'F']) ps.getCell(`${k}${r}`).numFmt = FMT_PLN;
            ps.getCell(`D${r}`).numFmt = '0.0%';
        }
        prognozaRazem = suma.number;
        const trzymane = typyP.filter(g => g.pelna && g.realRuszone > 0).map(g => g.typ);
        if (trzymane.length) {
            notaProgu = `Wykonanie poniżej ${Math.round(PROG_MIN_UDZIAL * 100)}% budżetu rodzaju — prognoza trzymana na 100% wyceny: ${trzymane.join(', ')}.`;
            const r = ps.addRow({ a: notaProgu });
            ps.mergeCells(`A${r.number}:F${r.number}`);
            r.getCell('a').alignment = { wrapText: true, vertical: 'top' };
            r.height = wysokosc(notaProgu, ZNAKI_A_F);
        }
        ps.addRow({});
    }

    const zdania = zbudujZdania(totals, A);
    naglowek('Analiza');
    const analizaOd = ps.rowCount + 1;
    for (const z of zdania) {
        const r = ps.addRow({ a: z });
        ps.mergeCells(`A${r.number}:F${r.number}`);
        r.getCell('a').alignment = { wrapText: true, vertical: 'top' };
        r.height = wysokosc(z, ZNAKI_A_F);
    }

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(await wb.xlsx.writeBuffer());
    return { wb: wb2, ps: wb2.getWorksheet('Podsumowanie'), wRow, analizaOd, prognozaOd, prognozaRazem, notaProgu, zakresRow: zakresRow.number, totals, A, zdania };
};

// ── asercje ──────────────────────────────────────────────────────────────────
const bledy = [];
const norm = t => String(t).replace(/[  ]/g, ' '); // pl-PL wstawia twarde spacje
const sprawdz = (opis, got, want) => {
    const ok = got === want;
    if (!ok) bledy.push(`${opis}\n   oczekiwano: ${JSON.stringify(want)}\n   jest:       ${JSON.stringify(got)}`);
    console.log(`${ok ? 'OK  ' : 'BŁĄD'} ${opis}`);
};
const zawiera = (opis, tekst, fragment) => {
    const ok = norm(tekst).includes(norm(fragment));
    if (!ok) bledy.push(`${opis}\n   brak fragmentu: ${JSON.stringify(fragment)}\n   w: ${JSON.stringify(norm(tekst))}`);
    console.log(`${ok ? 'OK  ' : 'BŁĄD'} ${opis}`);
};

// ── 1. mała realizacja, materiał tani, praca jeszcze nietknięta ──────────────
console.log('\n═══ przypadek A: 2% zaawansowania, materiał tańszy, praca bez wydatków ═══');
{
    const rows = [
        { type: 'material', plan: 5000, real: 4000, closed: true },       // taniej o 1000
        { type: 'material', plan: 3200, real: 2216, closed: true },       // taniej o 984
        { type: 'material', plan: 1000, real: 0, closed: false },
        { type: 'work', plan: 398129.68, real: 0, closed: false },        // praca: brak wydatków
    ];
    const { wb, ps, wRow, analizaOd, prognozaOd, prognozaRazem, zakresRow, zdania, A } = await zbudujArkusz(rows, LEAF_TYPES);
    zdania.forEach(z => console.log(`   » ${z}`));

    sprawdz('Podsumowanie jest PIERWSZĄ zakładką', wb.worksheets[0].name, 'Podsumowanie');
    sprawdz('Realizacja jest drugą zakładką', wb.worksheets[1].name, 'Realizacja');
    sprawdz('zakres = cały', ps.getCell(`B${zakresRow}`).value, 'cały zakres zamówienia');
    sprawdz('wartość zakresu scalona B:F', ps.getCell(`B${zakresRow}`).isMerged, true);
    sprawdz('wartość zakresu zawija tekst', ps.getCell(`B${zakresRow}`).alignment?.wrapText, true);
    sprawdz('wiersz zakresu ma jawną wysokość', ps.getRow(zakresRow).height > 0, true);
    sprawdz('niezrealizowany budżet DODATNI', ps.getCell(`B${wRow + 2}`).result, 401113.68);
    sprawdz('formuła niezrealizowanego = wycena − realizacja', ps.getCell(`B${wRow + 2}`).formula, `B${wRow}-B${wRow + 1}`);
    const pctCell = ps.getCell(`B${wRow + 3}`);
    sprawdz('realizacja % DODATNIA', Math.round(pctCell.result * 10000) / 10000, 0.0153);
    sprawdz('formuła % = realizacja ÷ wycena', pctCell.formula, `IF(B${wRow}=0,"",B${wRow + 1}/B${wRow})`);
    sprawdz('% ma format procentowy', pctCell.numFmt, '0.0%');
    sprawdz('kwoty mają walutę', ps.getCell(`B${wRow + 2}`).numFmt, FMT_PLN_ODCZYT);

    // Materiał: wsp. 6216/8200 = 0,75805; jego plan CAŁY = 9200 → 6974,05.
    // Praca: brak wydatków → wsp. 1 → 398 129,68. Razem 405 103,73.
    sprawdz('prognoza per typ (praca po 100%)', A.prognoza, 405103.73);
    sprawdz('prognoza NIE jest globalnym przeskalowaniem', A.prognoza === Math.round(407329.68 * (6216 / 8200) * 100) / 100, false);

    zawiera('zdanie 1: zrealizowany %', ps.getCell(`A${analizaOd}`).value, 'zrealizowano 1,5% budżetu ofertowego, do wykorzystania zostaje 401 113,68 zł');
    zawiera('zdanie 2: dopełniacz po „z"', ps.getCell(`A${analizaOd + 1}`).value, 'ruszyła na 2 z 4 pozycji (50,0%)');
    zawiera('zdanie 3: jesteśmy do przodu', ps.getCell(`A${analizaOd + 2}`).value, 'jesteśmy do przodu o 1984,00 zł, czyli kupujemy 24,2% poniżej wyceny');
    zawiera('zdanie 4: rozkład taniej/drożej', ps.getCell(`A${analizaOd + 3}`).value, 'Poniżej wyceny: 2 pozycje na łączną oszczędność 1984,00 zł. Powyżej wyceny: 0 pozycji');
    zawiera('zdanie 5: caveat małej próby', ps.getCell(`A${analizaOd + 4}`).value, 'Próba jest jednak mała');
    sprawdz('Analiza nie tłumaczy już metody liczenia', zdania.some(z => z.includes('przeniesione na resztę')), false);

    // ── tabela „Prognoza wydatków": wiersz na rodzaj kosztów + Razem ─────────
    sprawdz('nagłówek tabeli prognozy', ps.getCell(`A${prognozaOd - 1}`).value, 'Rodzaj kosztów');
    sprawdz('wiersz 1 = Materiał', ps.getCell(`A${prognozaOd}`).value, 'Materiał');
    sprawdz('Materiał — wycena całego rodzaju', ps.getCell(`B${prognozaOd}`).value, 9200);
    sprawdz('Materiał — wykonanie dotąd', ps.getCell(`C${prognozaOd}`).value, 6216);
    sprawdz('Materiał — % wydany z planowanego', Math.round(ps.getCell(`D${prognozaOd}`).result * 10000) / 10000, 0.6757);
    sprawdz('Materiał — % ma format procentowy', ps.getCell(`D${prognozaOd}`).numFmt, '0.0%');
    sprawdz('Materiał — prognoza (9200 × 0,75805)', ps.getCell(`E${prognozaOd}`).value, 6974.05);
    sprawdz('wiersz 2 = Praca', ps.getCell(`A${prognozaOd + 1}`).value, 'Praca');
    sprawdz('Praca bez wydatków → prognoza = wycena', ps.getCell(`E${prognozaOd + 1}`).value, 398129.68);
    sprawdz('ostatni wiersz to Razem', ps.getCell(`A${prognozaRazem}`).value, 'Razem');
    sprawdz('Razem — wycena', ps.getCell(`B${prognozaRazem}`).result, 407329.68);
    sprawdz('Razem — % wykonania całości', Math.round(ps.getCell(`D${prognozaRazem}`).result * 10000) / 10000, 0.0153);
    sprawdz('Razem — prognoza całego budżetu', ps.getCell(`E${prognozaRazem}`).result, 405103.73);
    sprawdz('Razem — Δ do oferty DODATNIA', ps.getCell(`F${prognozaRazem}`).result, 2225.95);
    sprawdz('Razem liczy się formułą SUM', ps.getCell(`E${prognozaRazem}`).formula, `SUM(E${prognozaOd}:E${prognozaRazem - 1})`);
    sprawdz('kwoty prognozy w walucie', ps.getCell(`E${prognozaOd}`).numFmt, FMT_PLN_ODCZYT);
    sprawdz('każde zdanie scalone A:F', ps.getCell(`A${analizaOd}`).isMerged, true);
    sprawdz('zawijanie tekstu włączone', ps.getCell(`A${analizaOd}`).alignment?.wrapText, true);
    sprawdz('brak slangu „liści" w arkuszu', JSON.stringify(ps.getSheetValues()).includes('liśc'), false);
    sprawdz('brak kwot ujemnych w zdaniach', /-\d/.test(zdania.join(' ')), false);
}

// ── 2. odchylenia rozjeżdżają się między rodzajami ───────────────────────────
console.log('\n═══ przypadek B: materiał taniej, praca drożej — prognozy nie wolno mieszać ═══');
{
    const rows = [
        { type: 'material', plan: 1000, real: 500, closed: true },   // materiał 50% wyceny
        { type: 'material', plan: 1000, real: 0, closed: false },    // reszta materiału → 50%
        { type: 'work', plan: 1000, real: 2000, closed: true },      // praca 200% wyceny
        { type: 'work', plan: 5000, real: 0, closed: false },        // reszta pracy → 200%
    ];
    const { ps, A, totals, zdania, prognozaOd, prognozaRazem } = await zbudujArkusz(rows, LEAF_TYPES);
    zdania.forEach(z => console.log(`   » ${z}`));
    // per typ: materiał 2000×0,5 = 1000; praca 6000×2 = 12 000 → 13 000
    sprawdz('prognoza per typ = 13 000', A.prognoza, 13000);
    sprawdz('osobny wiersz: Materiał', ps.getCell(`A${prognozaOd}`).value, 'Materiał');
    sprawdz('osobny wiersz: Praca', ps.getCell(`A${prognozaOd + 1}`).value, 'Praca');
    sprawdz('Materiał prognoza 1000', ps.getCell(`E${prognozaOd}`).value, 1000);
    sprawdz('Praca prognoza 12 000', ps.getCell(`E${prognozaOd + 1}`).value, 12000);
    sprawdz('Razem prognoza 13 000', ps.getCell(`E${prognozaRazem}`).result, 13000);
    sprawdz('Razem Δ do oferty UJEMNA gdy przekraczamy', ps.getCell(`F${prognozaRazem}`).result, -5000);
    // gdyby liczyć jednym globalnym współczynnikiem: 8000 × (2500/2000) = 10 000 — inny wynik,
    // bo tania reszta materiału i droga reszta pracy nie mają prawa się uśredniać
    sprawdz('globalny współczynnik dałby 10 000', Math.round(totals.plan * (A.realRuszone / A.planRuszone) * 100) / 100, 10000);
    sprawdz('materiał wsp. 0,5', A.typy.find(g => g.typ === 'Materiał').wsp, 0.5);
    sprawdz('praca wsp. 2,0', A.typy.find(g => g.typ === 'Praca').wsp, 2);
    sprawdz('Materiał — wykonanie w swoim wierszu', ps.getCell(`C${prognozaOd}`).value, 500);
    sprawdz('Praca — wykonanie w swoim wierszu', ps.getCell(`C${prognozaOd + 1}`).value, 2000);
}

// ── 3. przekroczenie na ruszonych + zawężony zakres ──────────────────────────
console.log('\n═══ przypadek C: wydajemy więcej, zakres zawężony ═══');
{
    const rows = [
        { type: 'material', plan: 1000, real: 1300, closed: true },  // drożej o 300
        { type: 'material', plan: 2000, real: 1900, closed: true },  // taniej o 100
        { type: 'equipment', plan: 500, real: 500, closed: true },   // w punkt
        { type: 'equipment', plan: 6500, real: 0, closed: false },
    ];
    const { ps, wRow, analizaOd, zakresRow, zdania } = await zbudujArkusz(rows, ['material', 'equipment']);
    zdania.forEach(z => console.log(`   » ${z}`));

    zawiera('zakres wymienia rodzaje kosztów', ps.getCell(`B${zakresRow}`).value, 'część zakresu — rodzaje kosztów: Materiał, Sprzęt');
    sprawdz('niezrealizowany budżet DODATNI', ps.getCell(`B${wRow + 2}`).result, 6300);
    zawiera('zdanie: wydajemy więcej', ps.getCell(`A${analizaOd + 2}`).value, 'wydajemy o 200,00 zł więcej, niż zakładano, czyli 5,7% powyżej wyceny');
    zawiera('zdanie: „w punkt" bez błędu zgody', ps.getCell(`A${analizaOd + 3}`).value, 'Dokładnie w planie: 1 pozycja.');
    sprawdz('brak kwot ujemnych w zdaniach', /-\d/.test(zdania.join(' ')), false);
}

// ── 4. nic nie ruszyło ───────────────────────────────────────────────────────
console.log('\n═══ przypadek D: zero realizacji ═══');
{
    const rows = [{ type: 'material', plan: 1000, real: 0, closed: false }];
    const { ps, analizaOd, zdania } = await zbudujArkusz(rows, LEAF_TYPES);
    zdania.forEach(z => console.log(`   » ${z}`));
    sprawdz('tylko 2 zdania (bez prognozy i rozkładu)', zdania.length, 2);
    zawiera('komunikat o braku realizacji (dopełniacz)', ps.getCell(`A${analizaOd + 1}`).value, 'Żadna z 1 pozycji w widoku nie ma jeszcze wpisu');
    sprawdz('brak NaN / Infinity', /NaN|Infinity/.test(zdania.join(' ')), false);
}

// ── 5. wycena zerowa ─────────────────────────────────────────────────────────
console.log('\n═══ przypadek E: wycena 0 zł ═══');
{
    const rows = [{ type: 'material', plan: 0, real: 250, closed: true }];
    const { zdania } = await zbudujArkusz(rows, LEAF_TYPES);
    zdania.forEach(z => console.log(`   » ${z}`));
    sprawdz('brak NaN / Infinity przy wycenie 0', /NaN|Infinity/.test(zdania.join(' ')), false);
    sprawdz('brak zaślepki „—" zamiast procentu', /czyli — |zrealizowano — /.test(zdania.join(' ')), false);
    sprawdz('brak kwot ujemnych w zdaniach', /-\d/.test(zdania.join(' ')), false);
}

// ── 6. budżet przekroczony globalnie ─────────────────────────────────────────
console.log('\n═══ przypadek F: budżet przekroczony globalnie ═══');
{
    const rows = [{ type: 'material', plan: 1000, real: 1500, closed: true }];
    const { zdania } = await zbudujArkusz(rows, LEAF_TYPES);
    zdania.forEach(z => console.log(`   » ${z}`));
    zawiera('zdanie 1 mówi o przekroczeniu, nie o „zostaje"', zdania[0], 'wyczerpany i przekroczony o 500,00 zł, co daje 150,0% wyceny');
    sprawdz('brak kwot ujemnych w zdaniach', /-\d/.test(zdania.join(' ')), false);
}

// ── 7. próg 10%: realny przypadek z CMC ──────────────────────────────────────
console.log('\n═══ przypadek G: praca 67 311 zł wyceny, 100 zł wydane — próg 10% ═══');
{
    const rows = [
        // Praca: jedna pozycja ruszona za grosze, reszta nietknięta. Bez progu współczynnik
        // wyszedłby z tej jednej pozycji i zjechał prognozę do ~3,4 tys. zł.
        { type: 'work', plan: 2000, real: 100, closed: true },
        { type: 'work', plan: 65311, real: 0, closed: false },
        // Materiał: wykonanie znacznie powyżej progu → prognoza idzie za odchyleniem
        { type: 'material', plan: 100000, real: 60000, closed: true },
        { type: 'material', plan: 22377, real: 0, closed: false },
    ];
    const { ps, A, prognozaOd, prognozaRazem, notaProgu } = await zbudujArkusz(rows, LEAF_TYPES);

    const praca = A.typy.find(g => g.typ === 'Praca');
    const material = A.typy.find(g => g.typ === 'Materiał');
    console.log(`   Praca:    wykonanie ${praca.realRuszone} / wycena ${praca.planCaly} = ${(praca.realRuszone / praca.planCaly * 100).toFixed(2)}% → wsp. ${praca.wsp}`);
    console.log(`   Materiał: wykonanie ${material.realRuszone} / wycena ${material.planCaly} = ${(material.realRuszone / material.planCaly * 100).toFixed(2)}% → wsp. ${material.wsp}`);
    console.log(`   nota: ${notaProgu}`);

    sprawdz('Praca poniżej progu → wsp. 1', praca.wsp, 1);
    sprawdz('Praca — prognoza = pełna wycena', ps.getCell(`E${prognozaOd}`).value, 67311);
    sprawdz('Praca — Δ do oferty = 0', ps.getCell(`F${prognozaOd}`).result, 0);
    sprawdz('bez progu prognoza pracy spadłaby do 3 365,55', Math.round(67311 * (100 / 2000) * 100) / 100, 3365.55);
    sprawdz('Materiał powyżej progu → wsp. z odchylenia', material.wsp, 0.6);
    sprawdz('Materiał — prognoza 122 377 × 0,6', ps.getCell(`E${prognozaOd + 1}`).value, 73426.2);
    sprawdz('Razem — prognoza', ps.getCell(`E${prognozaRazem}`).result, 140737.2);
    zawiera('nota wyjaśnia trzymanie na 100%', notaProgu, 'Wykonanie poniżej 10% budżetu rodzaju — prognoza trzymana na 100% wyceny: Praca.');
    sprawdz('nota NIE wymienia rodzaju powyżej progu', notaProgu.includes('Materiał'), false);
}

// ── 8. rodzaj dokładnie na progu — 10% ma WYSTARCZAĆ (>=) ────────────────────
console.log('\n═══ przypadek H: dokładnie 10% wystarcza, 9,9% już nie ═══');
{
    // Wykonanie 100 zł z wyceny rodzaju 1000 zł = równo 10%. Współczynnik z pozycji ruszonej
    // to 100/200 = 0,5, więc widać różnicę: przy `>` prognoza zostałaby na 1000 zł.
    const naProgu = [
        { type: 'material', plan: 200, real: 100, closed: true },
        { type: 'material', plan: 800, real: 0, closed: false },
    ];
    const { A: Ap } = await zbudujArkusz(naProgu, LEAF_TYPES);
    const g = Ap.typy.find(x => x.typ === 'Materiał');
    console.log(`   wykonanie ${g.realRuszone} / wycena ${g.planCaly} = ${(g.realRuszone / g.planCaly * 100).toFixed(1)}% → wsp. ${g.wsp}`);
    sprawdz('równo 10% osiąga próg → wsp. z odchylenia', g.wsp, 0.5);
    sprawdz('prognoza idzie za odchyleniem (1000 × 0,5)', Ap.prognoza, 500);

    // Tuż pod progiem: 99 zł z 1000 zł = 9,9% → prognoza trzymana na 100%.
    const podProgiem = [
        { type: 'material', plan: 200, real: 99, closed: true },
        { type: 'material', plan: 800, real: 0, closed: false },
    ];
    const { A: Ad, notaProgu } = await zbudujArkusz(podProgiem, LEAF_TYPES);
    const g2 = Ad.typy.find(x => x.typ === 'Materiał');
    console.log(`   wykonanie ${g2.realRuszone} / wycena ${g2.planCaly} = ${(g2.realRuszone / g2.planCaly * 100).toFixed(1)}% → wsp. ${g2.wsp}`);
    sprawdz('9,9% nie osiąga progu → wsp. 1', g2.wsp, 1);
    sprawdz('prognoza = pełna wycena', Ad.prognoza, 1000);
    zawiera('nota wyjaśnia trzymanie na 100%', notaProgu, 'prognoza trzymana na 100% wyceny: Materiał.');
}

console.log(bledy.length ? `\n✗ NIEPOWODZENIE (${bledy.length}):\n\n${bledy.join('\n\n')}` : '\n✓ Wszystko OK');
process.exit(bledy.length ? 1 : 0);
