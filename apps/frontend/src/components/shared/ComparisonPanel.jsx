import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import ExcelJS from 'exceljs';
import { Scale, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { API_URL } from '../../config';

// @anchor comparison-dev-styles
const DEV_STYLES = {
    CENOWE:       { label: 'cenowe',   cls: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
    ILOSCIOWE:    { label: 'ilościowe', cls: 'text-blue-300 bg-blue-500/10 border-blue-500/25' },
    ZAKRES_PLUS:  { label: 'zakres+',  cls: 'text-teal-300 bg-teal-500/10 border-teal-500/25' },
    ZAKRES_MINUS: { label: 'zakres−',  cls: 'text-red-300 bg-red-500/10 border-red-500/25' },
};

// @anchor comparison-side-styles — kolory stron splitu: Wycena pomarańczowa, Zakup czerwony
const OFFER_CLS = 'text-orange-300';
const PURCHASE_CLS = 'text-red-300';

const zl = (v) => v != null ? v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

// @anchor comparison-fit-font — tabela ma 11 kolumn i musi się zmieścić w szerokości
// panelu bez poziomego suwaka, a panel bywa osadzony w różnie szerokich miejscach
// (modal 72vw, rozwinięcie w Logistyce). Czcionka jest więc dobierana pomiarem:
// startujemy od MAX i schodzimy proporcją `dostępna szerokość / szerokość treści`.
// Kilka przebiegów, bo zawijanie tekstu nie skaluje się liniowo z rozmiarem fontu.
// Rozmiary wewnątrz tabeli są w `em`, więc schodzą razem z bazą.
const FONT_MAX = 16;
const FONT_MIN = 9;
const fitTableFont = (wrap, table) => {
    if (!wrap || !table) return;
    let size = FONT_MAX;
    table.style.fontSize = `${size}px`;
    for (let pass = 0; pass < 5; pass++) {
        const available = wrap.clientWidth;
        const needed = table.scrollWidth;
        if (!available || needed <= available) break;
        const next = Math.max(FONT_MIN, Math.floor(size * (available / needed) * 20) / 20);
        if (next >= size) break; // proporcja niczego już nie zmienia — dalej tylko pętla
        size = next;
        table.style.fontSize = `${size}px`;
        if (size <= FONT_MIN) break;
    }
};

// @anchor comparison-panel
// Panel porównawczy Wycena↔Zakup (F5) — jeden endpoint
// GET /orders/:nodeId/comparison, wiele osadzeń: rozwinięcie wyceny BASELINE
// w Logistyce, widok per zamówienie (modal z chipa w sekcji Materiały).
// Lewa strona = produkt `isOffer` z zaakceptowanego snapshotu (zamrożona),
// prawa = produkt `isPurchase` z wersji aktywnej. Pozycja bez produktu zakupu
// nie dostaje żadnej prognozy — wprost „jeszcze nie zakupiony".
export default function ComparisonPanel({ nodeId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    // @anchor comparison-fetch
    const fetchComparison = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/orders/${nodeId}/comparison`, {
                headers: { Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}` },
            });
            setData(res.ok ? await res.json() : null);
        } catch { setData(null); }
        finally { setLoading(false); }
    }, [nodeId]);

    useEffect(() => { fetchComparison(); }, [fetchComparison]);

    const wrapRef = useRef(null);
    const tableRef = useRef(null);
    // Dopasowanie po każdym renderze danych i przy każdej zmianie szerokości panelu.
    useLayoutEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const run = () => fitTableFont(wrapRef.current, tableRef.current);
        run();
        const ro = new ResizeObserver(run);
        ro.observe(wrap);
        return () => ro.disconnect();
    }, [data]);

    // @anchor comparison-export-excel — eksport: wycena jako wartości stałe,
    // wartości zakupu i kolumny Δ jako ŻYWE formuły (zasada eksportów Excel).
    const exportExcel = async () => {
        if (!data?.accepted) return;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Porównanie');
        ws.columns = [
            { header: 'Pozycja', key: 'name', width: 40 },
            { header: 'Jedn.', key: 'unit', width: 8 },
            { header: 'Wycena ilość', key: 'bQty', width: 12 },
            { header: 'Wycena cena', key: 'bPrice', width: 14 },
            { header: 'Wycena wartość', key: 'bValue', width: 16 },
            { header: 'Zakup ilość', key: 'cQty', width: 12 },
            { header: 'Zakup cena', key: 'cPrice', width: 14 },
            { header: 'Zakup wartość', key: 'cValue', width: 16 },
            { header: 'Δ wartość', key: 'delta', width: 14 },
            { header: 'Δ %', key: 'deltaPct', width: 10 },
            { header: 'Produkt wyceny', key: 'bProduct', width: 28 },
            { header: 'Dostawca wyceny', key: 'bSupplier', width: 24 },
            { header: 'Produkt zakupu', key: 'cProduct', width: 28 },
            { header: 'Dostawca zakupu', key: 'cSupplier', width: 24 },
            { header: 'Odchylenia', key: 'devs', width: 24 },
        ];
        ws.getRow(1).font = { bold: true };
        data.rows.forEach((r, i) => {
            const n = i + 2;
            ws.addRow({
                name: r.name || '—',
                unit: r.unit || '',
                bQty: r.baseline?.qty ?? null,
                bPrice: r.baseline?.price ?? null,
                bValue: r.baseline?.value ?? null, // wycena: wartości stałe (zamrożony snapshot)
                cQty: r.current?.qty ?? null,
                cPrice: r.current?.price ?? null,
                cValue: r.current?.price != null
                    ? { formula: `F${n}*G${n}`, result: r.current?.value ?? 0 }
                    : null,
                delta: r.current?.value != null && r.baseline?.value != null
                    ? { formula: `H${n}-E${n}`, result: r.delta ?? 0 }
                    : (r.delta ?? null),
                deltaPct: r.current?.value != null && r.baseline?.value != null && r.baseline.value !== 0
                    ? { formula: `(H${n}-E${n})/E${n}`, result: r.delta != null ? r.delta / r.baseline.value : 0 }
                    : null,
                bProduct: r.baseline?.product || '',
                bSupplier: r.baseline?.supplier || '',
                cProduct: r.current?.product || '',
                cSupplier: r.current?.supplier || r.qqSupplier?.name || '',
                devs: r.current ? r.deviations.map(d => DEV_STYLES[d]?.label || d).join(', ') : 'jeszcze nie zakupiony',
            });
        });
        const totalN = data.rows.length + 2;
        const totals = ws.addRow({
            name: 'Razem',
            bValue: data.kpi.baselineSum,
            cValue: { formula: `SUM(H2:H${totalN - 1})`, result: data.kpi.currentSum },
            delta: { formula: `SUM(I2:I${totalN - 1})`, result: data.kpi.deltaSum },
        });
        totals.font = { bold: true };
        ws.getColumn('deltaPct').numFmt = '0.0%';
        ['bPrice', 'bValue', 'cPrice', 'cValue', 'delta'].forEach(k => { ws.getColumn(k).numFmt = '#,##0.00'; });

        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${(data.nodeName || 'zamowienie').replace(/[^\w\d-]+/g, '_')}_porownanie.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    if (loading) return <div className="flex items-center justify-center py-6 text-gray-500 text-base">Ładowanie porównania…</div>;
    if (!data) return <div className="py-4 text-center text-base text-red-400">Nie udało się pobrać porównania</div>;
    if (!data.accepted) return (
        <div className="py-6 text-center text-base text-gray-500">
            Brak zaakceptowanej wersji (baseline) — porównanie dostępne po akceptacji snapshotu kciukiem managera.
        </div>
    );

    const k = data.kpi;
    const deltaCls = k.deltaSum > 0 ? 'text-red-300' : k.deltaSum < 0 ? 'text-teal-300' : 'text-gray-300';
    // @anchor comparison-delta-summary — podsumowanie Δ siedzi w nagłówku kolumny Δ
    // (zamiast samej litery), żeby suma stała nad kolumną, którą sumuje.
    const deltaSummary = `${k.deltaSum >= 0 ? '+' : ''}${zl(k.deltaSum)} zł${k.deltaPct != null ? ` (${k.deltaPct >= 0 ? '+' : ''}${k.deltaPct.toFixed(1).replace('.', ',')}%)` : ''}`;

    return (
        <div className="flex flex-col">
            {/* KPI */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 flex-wrap">
                <Scale size={17} className="text-teal-400 shrink-0" />
                <span className="text-[14px] text-gray-500 uppercase tracking-widest font-bold">
                    Baseline „{data.versionLabel}"
                </span>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <div className="text-[14px] text-gray-400" title="Ile pozycji ma już produkt zakupu">zakupione <span className="font-mono text-gray-200">{k.coveragePriced}/{k.coverageTotal}</span></div>
                    {Object.entries(k.deviations).filter(([, n]) => n > 0).map(([key, n]) => {
                        const map = { cenowe: 'CENOWE', ilosciowe: 'ILOSCIOWE', zakresPlus: 'ZAKRES_PLUS', zakresMinus: 'ZAKRES_MINUS' };
                        const st = DEV_STYLES[map[key]];
                        return <span key={key} className={`text-[13px] font-bold px-1.5 py-0.5 rounded-full border ${st.cls}`}>{st.label}: {n}</span>;
                    })}
                    <button onClick={fetchComparison} title="Odśwież" className="p-1 text-gray-500 hover:text-white"><RefreshCw size={15} /></button>
                    <button onClick={exportExcel} title="Eksport Excel (Δ jako żywe formuły)"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[14px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25">
                        <FileSpreadsheet size={14} />Excel
                    </button>
                </div>
            </div>

            {/* Tabela */}
            <div ref={wrapRef} className="overflow-x-auto max-h-[78vh] overflow-y-auto">
                <table ref={tableRef} className="w-full">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-900 border-b border-white/5">
                            <th rowSpan={2} className="text-left px-[0.75em] py-2 text-gray-500 font-semibold uppercase tracking-wider align-bottom">Pozycja</th>
                            {/* @anchor comparison-side-sums — z nagłówka grupy została sama kwota,
                                postawiona wprost nad kolumną „Wartość", którą sumuje. Opis grupy
                                („Wycena (ilość · cena …)") powielał wiersz niżej, więc zniknął —
                                strony rozróżnia kolor: pomarańcz = Wycena, czerwień = Zakup. */}
                            <th colSpan={2} />
                            <th className={`text-right px-[0.5em] py-1 font-mono font-bold whitespace-nowrap ${OFFER_CLS}`}
                                title="Σ wyceny: produkty isOffer z zaakceptowanego snapshotu">
                                {zl(k.baselineSum)} zł
                            </th>
                            <th />
                            <th colSpan={2} />
                            <th className={`text-right px-[0.5em] py-1 font-mono font-bold whitespace-nowrap ${PURCHASE_CLS}`}
                                title="Σ zakupu: wyłącznie pozycje, które mają już produkt isPurchase">
                                {zl(k.currentSum)} zł
                            </th>
                            <th />
                            <th rowSpan={2} className={`text-right px-[0.75em] py-2 font-mono font-bold whitespace-nowrap align-bottom ${deltaCls}`}
                                title="Δ liczona na pozycjach, które mają już zakup — wobec ich wyceny">
                                {deltaSummary}
                            </th>
                            <th rowSpan={2} className="text-left px-[0.5em] py-2 text-gray-500 font-semibold uppercase tracking-wider align-bottom">Odchylenia</th>
                        </tr>
                        <tr className="bg-gray-900 border-b border-white/5">
                            <th className={`text-right px-[0.5em] py-1.5 font-medium normal-case ${OFFER_CLS}`} title="Wycena — ilość z zaakceptowanego snapshotu">Ilość</th>
                            <th className={`text-right px-[0.5em] py-1.5 font-medium normal-case ${OFFER_CLS}`}>Cena</th>
                            <th className={`text-right px-[0.5em] py-1.5 font-medium normal-case ${OFFER_CLS}`}>Wartość</th>
                            <th className={`text-left px-[0.5em] py-1.5 font-medium normal-case ${OFFER_CLS}`}>Dostawca</th>
                            <th className={`text-right px-[0.5em] py-1.5 font-medium normal-case ${PURCHASE_CLS}`} title="Zakup — ilość z wersji aktywnej">Ilość</th>
                            <th className={`text-right px-[0.5em] py-1.5 font-medium normal-case ${PURCHASE_CLS}`}>Cena</th>
                            <th className={`text-right px-[0.5em] py-1.5 font-medium normal-case ${PURCHASE_CLS}`}>Wartość</th>
                            <th className={`text-left px-[0.5em] py-1.5 font-medium normal-case ${PURCHASE_CLS}`}>Dostawca</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((r) => (
                            <tr key={r.key} className={`border-b border-white/5 hover:bg-white/[0.02] ${r.deviations.includes('ZAKRES_MINUS') ? 'opacity-50' : ''}`}>
                                <td className="px-[0.75em] py-2 text-gray-200 max-w-[20em]">
                                    <span className={`line-clamp-2 ${r.deviations.includes('ZAKRES_MINUS') ? 'line-through' : ''}`}>{r.name || '—'}</span>
                                    <span className="text-[0.8em] text-gray-600">{r.unit || ''}</span>
                                </td>
                                <td className="px-[0.5em] py-2 text-right text-gray-400 font-mono">{r.baseline?.qty ?? '—'}</td>
                                <td className={`px-[0.5em] py-2 text-right font-mono ${OFFER_CLS}`}>{zl(r.baseline?.price)}</td>
                                <td className={`px-[0.5em] py-2 text-right font-mono ${OFFER_CLS}`}>{zl(r.baseline?.value)}</td>
                                <td className="px-[0.5em] py-2 text-gray-400 truncate max-w-[10.5em]" title={r.baseline?.product || ''}>{r.baseline?.supplier || '—'}</td>
                                {/* @anchor comparison-not-purchased — brak produktu isPurchase: żadnej
                                    prognozy, wprost „jeszcze nie zakupiony" na całej stronie Zakupu */}
                                {r.current ? (
                                    <>
                                        <td className="px-[0.5em] py-2 text-right text-gray-400 font-mono">{r.current.qty ?? '—'}</td>
                                        <td className={`px-[0.5em] py-2 text-right font-mono ${PURCHASE_CLS}`}>{zl(r.current.price)}</td>
                                        <td className={`px-[0.5em] py-2 text-right font-mono ${PURCHASE_CLS}`}>{zl(r.current.value)}</td>
                                        <td className="px-[0.5em] py-2 text-gray-400 truncate max-w-[10.5em]" title={r.current.product || ''}>{r.current.supplier || r.qqSupplier?.name || '—'}</td>
                                    </>
                                ) : (
                                    <td colSpan={4} className="px-[0.5em] py-2 text-center text-gray-600 italic">jeszcze nie zakupiony</td>
                                )}
                                <td className={`px-[0.75em] py-2 text-right font-mono font-semibold ${r.delta > 0 ? 'text-red-300' : r.delta < 0 ? 'text-teal-300' : 'text-gray-500'}`}>
                                    {r.delta != null ? `${r.delta >= 0 ? '+' : ''}${zl(r.delta)}` : '—'}
                                </td>
                                <td className="px-[0.5em] py-2">
                                    <div className="flex flex-wrap gap-1">
                                        {r.deviations.map((d) => (
                                            <span key={d} className={`text-[0.75em] font-bold px-[0.4em] py-0.5 rounded-full border ${DEV_STYLES[d]?.cls}`}>{DEV_STYLES[d]?.label || d}</span>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {data.rows.length === 0 && (
                            <tr><td colSpan={11} className="px-[0.75em] py-4 text-center text-gray-600">Brak wymagań do porównania</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
