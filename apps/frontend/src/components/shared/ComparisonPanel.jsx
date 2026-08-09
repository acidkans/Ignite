import { useState, useEffect, useCallback } from 'react';
import ExcelJS from 'exceljs';
import { Scale, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { API_URL } from '../../config';

// @anchor comparison-dev-styles
const DEV_STYLES = {
    CENOWE:       { label: 'cenowe',   cls: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
    ILOSCIOWE:    { label: 'ilościowe', cls: 'text-blue-300 bg-blue-500/10 border-blue-500/25' },
    ZAKRES_PLUS:  { label: 'zakres+',  cls: 'text-teal-300 bg-teal-500/10 border-teal-500/25' },
    ZAKRES_MINUS: { label: 'zakres−',  cls: 'text-red-300 bg-red-500/10 border-red-500/25' },
    KURSOWE:      { label: 'kursowe',  cls: 'text-purple-300 bg-purple-500/10 border-purple-500/25' },
};

// @anchor comparison-source-styles — źródło ceny aktualnej: FO (finalna z oferty) / QQ / MAN
const SOURCE_STYLES = {
    FO:  'text-teal-300 bg-teal-500/10 border-teal-500/25',
    QQ:  'text-amber-300 bg-amber-500/10 border-amber-500/25',
    MAN: 'text-gray-300 bg-white/5 border-white/10',
};

const zl = (v) => v != null ? v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

// @anchor comparison-panel
// Panel porównawczy baseline vs żywe dane (F5) — jeden endpoint
// GET /orders/:nodeId/comparison, wiele osadzeń: rozwinięcie wyceny BASELINE
// w Logistyce, widok per zamówienie (modal z chipa w nagłówku).
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

    // @anchor comparison-export-excel — eksport: baseline jako wartości stałe,
    // wartości aktualne i kolumny Δ jako ŻYWE formuły (zasada eksportów Excel).
    const exportExcel = async () => {
        if (!data?.accepted) return;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Porównanie');
        ws.columns = [
            { header: 'Pozycja', key: 'name', width: 40 },
            { header: 'Jedn.', key: 'unit', width: 8 },
            { header: 'Baseline ilość', key: 'bQty', width: 12 },
            { header: 'Baseline cena', key: 'bPrice', width: 14 },
            { header: 'Baseline wartość', key: 'bValue', width: 16 },
            { header: 'Aktualna ilość', key: 'cQty', width: 12 },
            { header: 'Aktualna cena', key: 'cPrice', width: 14 },
            { header: 'Aktualna wartość', key: 'cValue', width: 16 },
            { header: 'Δ wartość', key: 'delta', width: 14 },
            { header: 'Δ %', key: 'deltaPct', width: 10 },
            { header: 'Źródło', key: 'source', width: 8 },
            { header: 'Dostawca', key: 'supplier', width: 24 },
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
                bValue: r.baseline?.value ?? null, // baseline: wartości stałe (zamrożony snapshot)
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
                source: r.current?.priceSource || '',
                supplier: r.current?.supplier || r.qqSupplier?.name || '',
                devs: r.deviations.map(d => DEV_STYLES[d]?.label || d).join(', '),
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

    if (loading) return <div className="flex items-center justify-center py-6 text-gray-500 text-xs">Ładowanie porównania…</div>;
    if (!data) return <div className="py-4 text-center text-xs text-red-400">Nie udało się pobrać porównania</div>;
    if (!data.accepted) return (
        <div className="py-6 text-center text-xs text-gray-500">
            Brak zaakceptowanej wersji (baseline) — porównanie dostępne po akceptacji snapshotu kciukiem managera.
        </div>
    );

    const k = data.kpi;
    const deltaCls = k.deltaSum > 0 ? 'text-red-300' : k.deltaSum < 0 ? 'text-teal-300' : 'text-gray-300';

    return (
        <div className="flex flex-col">
            {/* KPI */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 flex-wrap">
                <Scale size={13} className="text-teal-400 shrink-0" />
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                    Baseline „{data.versionLabel}"
                </span>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <div className="text-[10px] text-gray-400">Baseline: <span className="font-mono text-gray-200">{zl(k.baselineSum)} zł</span></div>
                    <div className="text-[10px] text-gray-400">Prognoza: <span className="font-mono text-gray-200">{zl(k.forecastSum)} zł</span></div>
                    <div className={`text-[10px] font-bold font-mono ${deltaCls}`}>
                        Δ {k.deltaSum >= 0 ? '+' : ''}{zl(k.deltaSum)} zł{k.deltaPct != null ? ` (${k.deltaPct >= 0 ? '+' : ''}${k.deltaPct.toFixed(1)}%)` : ''}
                    </div>
                    <div className="text-[10px] text-gray-400">pokrycie <span className="font-mono text-gray-200">{k.coveragePriced}/{k.coverageTotal}</span></div>
                    {Object.entries(k.deviations).filter(([, n]) => n > 0).map(([key, n]) => {
                        const map = { cenowe: 'CENOWE', ilosciowe: 'ILOSCIOWE', zakresPlus: 'ZAKRES_PLUS', zakresMinus: 'ZAKRES_MINUS', kursowe: 'KURSOWE' };
                        const st = DEV_STYLES[map[key]];
                        return <span key={key} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${st.cls}`}>{st.label}: {n}</span>;
                    })}
                    <button onClick={fetchComparison} title="Odśwież" className="p-1 text-gray-500 hover:text-white"><RefreshCw size={11} /></button>
                    <button onClick={exportExcel} title="Eksport Excel (Δ jako żywe formuły)"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25">
                        <FileSpreadsheet size={10} />Excel
                    </button>
                </div>
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-900 border-b border-white/5">
                            <th rowSpan={2} className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider align-bottom">Pozycja</th>
                            <th className="text-right px-2 py-1 text-gray-500 font-semibold uppercase tracking-wider" colSpan={3}>Baseline (ilość · cena · wartość)</th>
                            <th className="text-right px-2 py-1 text-gray-500 font-semibold uppercase tracking-wider" colSpan={3}>Aktualnie (ilość · cena · wartość)</th>
                            <th rowSpan={2} className="text-left px-2 py-2 text-gray-500 font-semibold uppercase tracking-wider align-bottom">Dostawca</th>
                            <th rowSpan={2} className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider align-bottom">Δ</th>
                            <th rowSpan={2} className="text-left px-2 py-2 text-gray-500 font-semibold uppercase tracking-wider align-bottom">Odchylenia</th>
                        </tr>
                        <tr className="bg-gray-900 border-b border-white/5">
                            <th className="text-right px-2 py-1.5 text-gray-600 font-medium normal-case" title="Ilość materiału w wersji zaakceptowanej jako baseline">Ilość</th>
                            <th className="text-right px-2 py-1.5 text-gray-600 font-medium normal-case">Cena</th>
                            <th className="text-right px-2 py-1.5 text-gray-600 font-medium normal-case">Wartość</th>
                            <th className="text-right px-2 py-1.5 text-gray-600 font-medium normal-case" title="Aktualna ilość materiału w żywych danych">Ilość</th>
                            <th className="text-right px-2 py-1.5 text-gray-600 font-medium normal-case">Cena</th>
                            <th className="text-right px-2 py-1.5 text-gray-600 font-medium normal-case">Wartość</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((r) => (
                            <tr key={r.key} className={`border-b border-white/5 hover:bg-white/[0.02] ${r.deviations.includes('ZAKRES_MINUS') ? 'opacity-50' : ''}`}>
                                <td className="px-3 py-2 text-gray-200 max-w-[240px]">
                                    <span className={`line-clamp-2 ${r.deviations.includes('ZAKRES_MINUS') ? 'line-through' : ''}`}>{r.name || '—'}</span>
                                    <span className="text-[9px] text-gray-600">{r.unit || ''}</span>
                                </td>
                                <td className="px-2 py-2 text-right text-gray-400 font-mono">{r.baseline?.qty ?? '—'}</td>
                                <td className="px-2 py-2 text-right text-gray-400 font-mono">{zl(r.baseline?.price)}</td>
                                <td className="px-2 py-2 text-right text-gray-300 font-mono">{zl(r.baseline?.value)}</td>
                                <td className="px-2 py-2 text-right text-gray-400 font-mono">{r.current?.qty ?? '—'}</td>
                                <td className="px-2 py-2 text-right font-mono">
                                    <span className="text-gray-300">{zl(r.current?.price)}</span>
                                    {r.current?.priceSource && (
                                        <span className={`ml-1 text-[8px] font-bold px-1 py-0.5 rounded border ${SOURCE_STYLES[r.current.priceSource] || SOURCE_STYLES.MAN}`}>{r.current.priceSource}</span>
                                    )}
                                </td>
                                <td className="px-2 py-2 text-right text-gray-300 font-mono">{zl(r.current?.value)}</td>
                                <td className="px-2 py-2 text-gray-400 truncate max-w-[140px]">{r.current?.supplier || r.qqSupplier?.name || '—'}</td>
                                <td className={`px-3 py-2 text-right font-mono font-semibold ${r.delta > 0 ? 'text-red-300' : r.delta < 0 ? 'text-teal-300' : 'text-gray-500'}`}>
                                    {r.delta != null ? `${r.delta >= 0 ? '+' : ''}${zl(r.delta)}` : '—'}
                                </td>
                                <td className="px-2 py-2">
                                    <div className="flex flex-wrap gap-1">
                                        {r.deviations.map((d) => (
                                            <span key={d} className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${DEV_STYLES[d]?.cls}`}>{DEV_STYLES[d]?.label || d}</span>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {data.rows.length === 0 && (
                            <tr><td colSpan={10} className="px-3 py-4 text-center text-gray-600">Brak wymagań do porównania</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
