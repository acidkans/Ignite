import { useState, useEffect, useCallback, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { Lock, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { isRejectedPlanNode } from './wbsConstants';

const API_URL = '/api';

// @anchor budget-mode-source-styles — badge źródła ceny w trybie Wykonanie
const SOURCE_STYLES = {
    'FO':   { label: 'FO',  cls: 'text-teal-300 bg-teal-500/10 border-teal-500/25', title: 'Finalna cena z przypisanej oferty (read-only)' },
    'FO✎':  { label: 'FO✎', cls: 'text-teal-200 bg-teal-500/20 border-teal-400/40', title: 'Cena z oferty skorygowana ręcznie' },
    'QQ':   { label: 'QQ',  cls: 'text-amber-300 bg-amber-500/10 border-amber-500/25', title: 'Cena z zamrożonej szybkiej wyceny (edytowalna)' },
    'MAG':  { label: 'MAG', cls: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25', title: 'Wycena z magazynu (pozycja STOCK wyceny)' },
    'MAN':  { label: 'MAN', cls: 'text-gray-300 bg-white/5 border-white/10', title: 'Cena wpisana ręcznie' },
};

const DEV_LABELS = { CENOWE: 'cenowe', ILOSCIOWE: 'ilościowe', NADMIAR: 'nadmiar', ZAKRES_PLUS: 'zakres+', ZAKRES_MINUS: 'zakres−' };

const zl = (v) => v != null ? v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const parseSnap = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// Cena ofertowa wg formuły BudgetTable.calcDerived: brak narzutu ⇒ 0, potem rabat
const calcOffer = (n) => {
    if (!n) return 0;
    const uc = parseFloat(n.unitCost) || 0;
    const q = parseFloat(n.quantity) || 0;
    const m = parseFloat(n.margin) || 0;
    const d = parseFloat(n.discount) || 0;
    let offer = m !== 0 ? uc * q * (1 + m / 100) : 0;
    if (offer > 0 && d > 0) offer = offer * (1 - d / 100);
    return Math.round(offer * 100) / 100;
};

// @anchor budget-modes-panel
// Tryby zakładki Budżet po akceptacji (F7): baseline (read-only snapshot),
// Wykonanie (żywe ceny z badge FO/FO✎/QQ/MAG/MAN), Porównanie (pary kosztów + Δ
// + marża plan → efektywna z cen ofertowych zamrożonych w baseline).
// Liczby porównania wyłącznie z GET /orders/:id/comparison.
export default function BudgetModesPanel({ nodeId, mode, acceptance }) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    const [baselineWbs, setBaselineWbs] = useState([]);
    const [baselineReqs, setBaselineReqs] = useState([]);
    const [liveReqs, setLiveReqs] = useState([]);
    const [cmp, setCmp] = useState(null);
    const [loading, setLoading] = useState(true);

    // @anchor budget-modes-fetch
    const fetchAll = useCallback(async () => {
        if (!acceptance?.acceptedVersionId) return;
        setLoading(true);
        const auth = { Authorization: `Bearer ${token}` };
        try {
            const [wbsRes, bReqRes, lReqRes, cmpRes] = await Promise.all([
                fetch(`${API_URL}/wbs-nodes/unified/${nodeId}?versionId=${acceptance.acceptedVersionId}`, { headers: auth }),
                fetch(`${API_URL}/material-requirements/node/${nodeId}?versionId=${acceptance.acceptedVersionId}`, { headers: auth }),
                fetch(`${API_URL}/material-requirements/node/${nodeId}`, { headers: auth }),
                fetch(`${API_URL}/orders/${nodeId}/comparison`, { headers: auth }),
            ]);
            const wbs = wbsRes.ok ? await wbsRes.json() : [];
            setBaselineWbs(Array.isArray(wbs) ? wbs : (wbs?.nodes || []));
            const bReqs = bReqRes.ok ? await bReqRes.json() : [];
            setBaselineReqs((Array.isArray(bReqs) ? bReqs : []).filter(r => r.versionId === acceptance.acceptedVersionId));
            // Żywe wymagania = wiersze AKTYWNEJ wersji. Endpoint dokłada wiersze
            // `versionId=null` jako legacy sprzed wersjonowania — bierzemy je dopiero
            // gdy aktywna wersja nie ma własnych (ta sama zasada co w `comparison`).
            const lReqsRaw = lReqRes.ok ? await lReqRes.json() : [];
            const lAll = Array.isArray(lReqsRaw) ? lReqsRaw : [];
            const lVersioned = lAll.filter(r => r.versionId);
            setLiveReqs(lVersioned.length ? lVersioned : lAll.filter(r => !r.versionId));
            const c = cmpRes.ok ? await cmpRes.json() : null;
            setCmp(c?.accepted ? c : null);
        } catch { /* zostaje poprzedni stan */ }
        finally { setLoading(false); }
    }, [nodeId, acceptance?.acceptedVersionId, token]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // DFS baseline WBS w kolejności drzewa + mapy pomocnicze
    const { baselineRows, wbsById, subjectOf } = useMemo(() => {
        const byId = new Map(baselineWbs.map(n => [n.id, n]));
        const byParent = new Map();
        for (const n of baselineWbs) {
            const pid = n.parentId || '__root__';
            if (!byParent.has(pid)) byParent.set(pid, []);
            byParent.get(pid).push(n);
        }
        for (const arr of byParent.values()) arr.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const ordered = [];
        const walk = (pid) => { for (const c of byParent.get(pid) || []) { ordered.push(c); walk(c.id); } };
        walk('__root__');
        // subjectOf: najwyższy przodek pod korzeniem (jak getSubjectInfo w buildRows)
        const subjectOf = (id) => {
            let cur = byId.get(id);
            while (cur?.parentId && byId.get(cur.parentId)?.parentId) cur = byId.get(cur.parentId);
            return cur ? (byId.get(cur.parentId) ? cur : cur) : null;
        };
        // Pozycja odrzucona nie jest zakresem baseline — nie ma jej czego kupować ani rozliczać.
        // Ta sama reguła co w `orders.service` (podgląd akceptacji, porównanie wycena↔zakup).
        const baselineRows = ordered.filter(n => n.parentId != null
            && String(n.type || '').toLowerCase() !== 'group'
            && !isRejectedPlanNode(n));
        return { baselineRows, wbsById: byId, subjectOf };
    }, [baselineWbs]);

    const baselineReqById = useMemo(() => new Map(baselineReqs.map(r => [r.id, r])), [baselineReqs]);

    // @anchor budget-mode-source — źródło ceny żywego wymagania (Wykonanie/Porównanie)
    const sourceOf = useCallback((liveReq, cmpRow) => {
        const snap = parseSnap(liveReq?.offerPositionSnapshot);
        if (snap?.priceNetto != null) {
            const edited = liveReq.budgetedPriceNetto != null && liveReq.budgetedPriceNetto !== snap.priceNetto;
            return edited ? 'FO✎' : 'FO';
        }
        if (liveReq?.budgetedPriceNetto == null) return null;
        if (liveReq.budgetSource === 'QUICKQUOTE') return cmpRow?.qqSupplier?.source === 'STOCK' ? 'MAG' : 'QQ';
        return 'MAN';
    }, []);

    // @anchor budget-mode-price-edit — edycja ceny w Wykonaniu (poza FO); przechodzi
    // przez guard F4 (po akceptacji: manager + AuditLog)
    const savePrice = async (reqId, value) => {
        const price = value === '' ? null : Number(value);
        const res = await fetch(`${API_URL}/material-requirements/${reqId}`, {
            method: 'PATCH', headers, body: JSON.stringify({ priceNetto: price }),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Błąd zapisu ceny');
        }
        await fetchAll();
    };

    // Wiersze Porównania pogrupowane gałęziami baseline (kolejność drzewa)
    const comparisonGroups = useMemo(() => {
        if (!cmp) return [];
        const rowMeta = (r) => {
            // Wiersz porównania kluczuje się teraz liściem WBS (`baselineWbsNodeId`), nie
            // wymaganiem materiałowym — praca i usługi nie mają karty, a mają się grupować
            // tak samo. Fallback po karcie zostaje dla danych sprzed tej zmiany.
            const bReq = baselineReqById.get(r.key);
            const wbsNodeId = r.baselineWbsNodeId ?? bReq?.wbsNodeId ?? null;
            const wbsNode = wbsNodeId ? wbsById.get(wbsNodeId) : null;
            const subject = wbsNode ? subjectOf(wbsNode.id) : null;
            const offer = calcOffer(wbsNode);
            const marginPlan = wbsNode ? (parseFloat(wbsNode.margin) || 0) : null;
            const curCost = r.current?.value ?? null;
            const effMargin = offer > 0 && curCost > 0 ? Math.round(((offer - curCost) / curCost) * 1000) / 10 : null;
            return { ...r, subjectId: subject?.id ?? '__extra__', subjectName: subject?.name ?? 'Poza baseline', offer: offer || null, marginPlan, effMargin };
        };
        const metas = cmp.rows.map(rowMeta);
        // kolejność grup: wg pierwszego wystąpienia w kolejności wierszy baseline (createdAt), zakres+ na końcu
        const groups = new Map();
        for (const m of metas.filter(x => x.subjectId !== '__extra__')) {
            if (!groups.has(m.subjectId)) groups.set(m.subjectId, { name: m.subjectName, rows: [] });
            groups.get(m.subjectId).rows.push(m);
        }
        const extra = metas.filter(x => x.subjectId === '__extra__');
        if (extra.length) groups.set('__extra__', { name: 'Poza baseline (zakres+)', rows: extra });
        return [...groups.values()].map(g => ({
            ...g,
            baseSum: g.rows.reduce((s, r) => s + (r.baseline?.value ?? 0), 0),
            curSum: g.rows.reduce((s, r) => s + (r.current?.value ?? 0), 0),
        }));
    }, [cmp, baselineReqById, wbsById, subjectOf]);

    // @anchor budget-comparison-export — eksport Porównania: baseline stały,
    // koszt aktualny / Δ / marża efektywna jako żywe formuły
    const exportComparison = async () => {
        if (!cmp) return;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Budżet — porównanie');
        ws.columns = [
            { header: 'Gałąź', key: 'branch', width: 26 },
            { header: 'Pozycja', key: 'name', width: 38 },
            { header: 'Koszt baseline', key: 'bValue', width: 15 },
            { header: 'Ilość akt.', key: 'cQty', width: 10 },
            { header: 'Cena akt.', key: 'cPrice', width: 12 },
            { header: 'Koszt aktualny', key: 'cValue', width: 15 },
            { header: 'Δ', key: 'delta', width: 12 },
            { header: 'Cena ofert. (baseline)', key: 'offer', width: 18 },
            { header: 'Marża plan %', key: 'mPlan', width: 12 },
            { header: 'Marża efekt. %', key: 'mEff', width: 13 },
            { header: 'Źródło', key: 'source', width: 8 },
            { header: 'Odchylenia', key: 'devs', width: 22 },
        ];
        ws.getRow(1).font = { bold: true };
        let n = 1;
        for (const g of comparisonGroups) {
            n += 1;
            const gr = ws.addRow({ branch: g.name, bValue: g.baseSum, cValue: g.curSum });
            gr.font = { bold: true };
            const first = n + 1;
            for (const r of g.rows) {
                n += 1;
                const live = r.liveId ? liveReqs.find(x => x.id === r.liveId) : null;
                ws.addRow({
                    branch: '',
                    name: r.name || '—',
                    bValue: r.baseline?.value ?? null, // baseline: wartość stała
                    cQty: r.current?.qty ?? null,
                    cPrice: r.current?.price ?? null,
                    cValue: r.current?.price != null ? { formula: `D${n}*E${n}`, result: r.current?.value ?? 0 } : null,
                    delta: r.current?.value != null && r.baseline?.value != null ? { formula: `F${n}-C${n}`, result: r.delta ?? 0 } : (r.delta ?? null),
                    offer: r.offer,
                    mPlan: r.marginPlan != null ? r.marginPlan / 100 : null,
                    mEff: r.offer > 0 && r.current?.value != null ? { formula: `IF(F${n}=0,0,(H${n}-F${n})/F${n})`, result: (r.effMargin ?? 0) / 100 } : null,
                    source: live ? (sourceOf(live, r) || '') : '',
                    devs: r.deviations.map(d => DEV_LABELS[d] || d).join(', '),
                });
            }
            // sumy gałęzi jako formuły po dodaniu wierszy
            gr.getCell('C').value = { formula: `SUM(C${first}:C${n})`, result: g.baseSum };
            gr.getCell('F').value = { formula: `SUM(F${first}:F${n})`, result: g.curSum };
        }
        n += 1;
        const tot = ws.addRow({ branch: 'RAZEM', bValue: cmp.kpi.baselineSum, cValue: cmp.kpi.currentSum, delta: { formula: `SUM(G2:G${n - 1})`, result: cmp.kpi.deltaSum } });
        tot.font = { bold: true };
        ['bValue', 'cPrice', 'cValue', 'delta', 'offer'].forEach(k => { ws.getColumn(k).numFmt = '#,##0.00'; });
        ['mPlan', 'mEff'].forEach(k => { ws.getColumn(k).numFmt = '0.0%'; });

        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `budzet_porownanie.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    if (loading) return <div className="flex items-center justify-center py-8 text-gray-500 text-sm">Ładowanie danych baseline…</div>;

    // ─── TRYB: BUDŻET (BASELINE, read-only) ───────────────────────────────────
    if (mode === 'baseline') {
        const total = baselineRows.reduce((s, r) => s + ((parseFloat(r.unitCost) || 0) * (parseFloat(r.quantity) || 0)), 0);
        const totalOffer = baselineRows.reduce((s, r) => s + calcOffer(r), 0);
        return (
            <div>
                <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-teal-300/90 bg-teal-500/5 border-b border-teal-500/10">
                    <Lock size={11} /> Zamrożony budżet wersji „{acceptance.acceptedVersion?.label}" — tylko odczyt
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-white/[0.02] border-b border-white/5">
                                {['Nazwa', 'Typ', 'Koszt jedn.', 'Ilość', 'Jedn.', 'Koszt całk.', 'Narzut %', 'Rabat %', 'Cena ofert.'].map(h => (
                                    <th key={h} className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {baselineRows.map(r => (
                                <tr key={r.id} className="border-b border-white/5">
                                    <td className="px-3 py-1.5 text-gray-200">{r.name}</td>
                                    <td className="px-3 py-1.5 text-gray-500">{r.type || '—'}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{zl(parseFloat(r.unitCost) || null)}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-400">{r.quantity ?? '—'}</td>
                                    <td className="px-3 py-1.5 text-gray-500">{r.unit || '—'}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{zl((parseFloat(r.unitCost) || 0) * (parseFloat(r.quantity) || 0))}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-400">{r.margin ?? '—'}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-400">{r.discount ?? '—'}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{zl(calcOffer(r) || null)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-white/[0.02] font-bold">
                                <td colSpan={5} className="px-3 py-2 text-right text-gray-500 uppercase text-[10px] tracking-wider">Razem</td>
                                <td className="px-3 py-2 text-right font-mono text-teal-300">{zl(total)}</td>
                                <td colSpan={2} />
                                <td className="px-3 py-2 text-right font-mono text-teal-300">{zl(totalOffer)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    }

    // ─── TRYB: WYKONANIE (żywe ceny z badge źródła) ───────────────────────────
    if (mode === 'wykonanie') {
        const cmpByLive = new Map((cmp?.rows || []).filter(r => r.liveId).map(r => [r.liveId, r]));
        // Wykonanie pokazuje cenę SAMEGO wymagania (badge FO/QQ/MAN), nie cenę
        // strony Zakup z porównania — to osobny tryb i osobne źródło.
        const execPrice = (r) => r.budgetedPriceNetto ?? null;
        const execValue = (r) => (execPrice(r) != null ? Math.round(r.quantity * execPrice(r) * 100) / 100 : null);
        const total = liveReqs.reduce((s, r) => s + (execValue(r) ?? 0), 0);
        return (
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-white/[0.02] border-b border-white/5">
                            {['Pozycja', 'Ilość', 'Jedn.', 'Cena netto', 'Źródło', 'Wartość', 'Dostawca'].map(h => (
                                <th key={h} className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {liveReqs.map(r => {
                            const row = cmpByLive.get(r.id);
                            const src = sourceOf(r, row);
                            const st = src ? SOURCE_STYLES[src] : null;
                            const editable = src !== 'FO'; // FO read-only; FO✎/QQ/MAG/MAN edytowalne
                            const price = execPrice(r);
                            return (
                                <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                    <td className="px-3 py-1.5 text-gray-200 max-w-[260px]"><span className="line-clamp-2">{r.name || '—'}</span></td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-400">{r.quantity ?? '—'}</td>
                                    <td className="px-3 py-1.5 text-gray-500">{r.unit || '—'}</td>
                                    <td className="px-3 py-1.5 text-right">
                                        {editable ? (
                                            <input defaultValue={price ?? ''} type="number" min="0" step="0.01"
                                                onBlur={e => Number(e.target.value) !== price && savePrice(r.id, e.target.value)}
                                                className="w-24 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-right text-teal-300 font-mono focus:outline-none focus:border-teal-500" />
                                        ) : (
                                            <span className="font-mono text-gray-300">{zl(price)}</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-1.5">
                                        {st && <span title={st.title} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{zl(execValue(r))}</td>
                                    <td className="px-3 py-1.5 text-gray-400 truncate max-w-[160px]">{row?.current?.supplier || row?.qqSupplier?.name || '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="bg-white/[0.02] font-bold">
                            <td colSpan={5} className="px-3 py-2 text-right text-gray-500 uppercase text-[10px] tracking-wider">Razem netto</td>
                            <td className="px-3 py-2 text-right font-mono text-teal-300">{zl(total)}</td>
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>
        );
    }

    // ─── TRYB: PORÓWNANIE (pary kosztów + Δ + marża plan → efektywna) ─────────
    if (!cmp) return <div className="py-6 text-center text-xs text-gray-500">Brak danych porównania</div>;
    return (
        <div>
            <div className="flex items-center gap-3 px-3 py-2 border-b border-white/5">
                <span className="text-[10px] text-gray-500">Wycena <span className="font-mono text-orange-300">{zl(cmp.kpi.baselineSum)} zł</span></span>
                <span className="text-[10px] text-gray-500" title="Suma wyłącznie pozycji, które mają już produkt zakupu">Zakup <span className="font-mono text-red-300">{zl(cmp.kpi.currentSum)} zł</span></span>
                <span className={`text-[10px] font-bold font-mono ${cmp.kpi.deltaSum > 0 ? 'text-red-300' : 'text-teal-300'}`}>
                    Δ {cmp.kpi.deltaSum >= 0 ? '+' : ''}{zl(cmp.kpi.deltaSum)} zł{cmp.kpi.deltaPct != null ? ` (${cmp.kpi.deltaPct >= 0 ? '+' : ''}${cmp.kpi.deltaPct.toFixed(1)}%)` : ''}
                </span>
                <button onClick={fetchAll} title="Odśwież" className="ml-auto p-1 text-gray-500 hover:text-white"><RefreshCw size={11} /></button>
                <button onClick={exportComparison} title="Eksport Excel (żywe formuły)"
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/25">
                    <FileSpreadsheet size={10} />Excel
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-white/[0.02] border-b border-white/5">
                            {['Pozycja', 'Koszt wyceny', 'Koszt zakupu', 'Δ', 'Cena ofert. (baseline)', 'Marża plan → efekt.', 'Odchylenia'].map(h => (
                                <th key={h} className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {comparisonGroups.map((g, gi) => (
                            <FragmentGroup key={gi} g={g} liveReqs={liveReqs} sourceOf={sourceOf} />
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-white/[0.02] font-bold">
                            <td className="px-3 py-2 text-right text-gray-500 uppercase text-[10px] tracking-wider">Razem</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{zl(cmp.kpi.baselineSum)}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{zl(cmp.kpi.currentSum)}</td>
                            <td className={`px-3 py-2 text-right font-mono ${cmp.kpi.deltaSum > 0 ? 'text-red-300' : 'text-teal-300'}`}>{cmp.kpi.deltaSum >= 0 ? '+' : ''}{zl(cmp.kpi.deltaSum)}</td>
                            <td colSpan={3} />
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

// @anchor budget-comparison-group — gałąź baseline: wiersz nagłówka z sumami obu kolumn
function FragmentGroup({ g, liveReqs, sourceOf }) {
    return (
        <>
            <tr className="bg-white/[0.03] border-b border-white/10">
                <td className="px-3 py-1.5 font-bold text-gray-300">{g.name}</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold text-gray-300">{zl(g.baseSum)}</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold text-gray-300">{zl(g.curSum)}</td>
                <td className={`px-3 py-1.5 text-right font-mono font-bold ${g.curSum - g.baseSum > 0 ? 'text-red-300' : 'text-teal-300'}`}>
                    {g.curSum - g.baseSum >= 0 ? '+' : ''}{zl(g.curSum - g.baseSum)}
                </td>
                <td colSpan={3} />
            </tr>
            {g.rows.map(r => {
                const live = r.liveId ? liveReqs.find(x => x.id === r.liveId) : null;
                const src = live ? sourceOf(live, r) : null;
                const st = src ? SOURCE_STYLES[src] : null;
                const erosion = r.effMargin != null && r.marginPlan != null ? r.effMargin - r.marginPlan : null;
                return (
                    <tr key={r.key} className={`border-b border-white/5 hover:bg-white/[0.02] ${r.deviations.includes('ZAKRES_MINUS') ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-1.5 text-gray-200 pl-6 max-w-[240px]">
                            <span className={`line-clamp-2 ${r.deviations.includes('ZAKRES_MINUS') ? 'line-through' : ''}`}>{r.name || '—'}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-400">{zl(r.baseline?.value)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-300">
                            {zl(r.current?.value)}
                            {st && <span title={st.title} className={`ml-1 text-[8px] font-bold px-1 py-0.5 rounded border ${st.cls}`}>{st.label}</span>}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono ${r.delta > 0 ? 'text-red-300' : r.delta < 0 ? 'text-teal-300' : 'text-gray-500'}`}>
                            {r.delta != null ? `${r.delta >= 0 ? '+' : ''}${zl(r.delta)}` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-400">{zl(r.offer)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">
                            {r.marginPlan != null && r.effMargin != null ? (
                                <span title={`Erozja marży: ${erosion >= 0 ? '+' : ''}${erosion.toFixed(1)} p.p.`}>
                                    <span className="text-gray-400">{r.marginPlan.toFixed(1)}%</span>
                                    <span className="text-gray-600"> → </span>
                                    <span className={erosion < 0 ? 'text-red-300' : 'text-teal-300'}>{r.effMargin.toFixed(1)}%</span>
                                </span>
                            ) : '—'}
                        </td>
                        <td className="px-3 py-1.5">
                            <div className="flex flex-wrap gap-1">
                                {r.deviations.map(d => (
                                    <span key={d} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full border text-gray-400 bg-white/5 border-white/10">{DEV_LABELS[d] || d}</span>
                                ))}
                            </div>
                        </td>
                    </tr>
                );
            })}
        </>
    );
}
