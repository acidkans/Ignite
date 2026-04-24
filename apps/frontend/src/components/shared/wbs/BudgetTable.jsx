import { useState, useEffect, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { fmtPLN, fmtPLNFull, fmtQty, fmtPct, fmtPctFull, TYPE_OPTIONS, TYPE_LABELS, UNIT_OPTIONS, parseLocaleNumber } from './wbsConstants';

const TH = 'text-left px-3 py-2.5 text-lg font-bold uppercase tracking-widest text-white whitespace-nowrap select-none';
const TD = 'px-2 py-1.5 align-middle';
const INPUT = 'bg-transparent text-white text-sm w-full outline-none focus:bg-white/5 rounded px-1 py-0.5 min-w-0';
const SELECT = 'bg-[#0b0f17] text-white text-sm w-full outline-none rounded px-1 py-0.5 cursor-pointer border border-white/5 hover:border-white/10 focus:border-blue-500/40 transition-colors';
const FILTER = 'w-full bg-black/30 border border-white/10 rounded px-2 py-0.5 text-xs text-white placeholder-gray-700 outline-none focus:border-blue-500/40';

function calcDerived(r) {
    const q = Math.max(0, parseLocaleNumber(String(r.quantity ?? '')) ?? 1);
    const uc = Math.max(0, parseLocaleNumber(String(r.unitCost ?? '')) ?? 0);
    const marginRaw = r.margin != null && r.margin !== '' ? parseLocaleNumber(String(r.margin)) : null;
    const d = Math.max(0, parseLocaleNumber(String(r.discount ?? '')) ?? 0);
    const totalCost = uc * q;
    // cena ofertowa tylko gdy marża jest wpisana i różna od zera
    let offerPrice = (marginRaw !== null && marginRaw !== 0) ? totalCost * (1 + marginRaw / 100) : 0;
    if (offerPrice > 0 && d > 0) offerPrice = Math.max(0, offerPrice * (1 - d / 100));
    return { ...r, totalCost, offerPrice };
}

export default function BudgetTable({
    rows,
    onFieldChange,
    onDeleteRow,
    discountPercent,
    discountAmount,
    onDiscountPercentChange,
    onDiscountAmountChange,
}) {
    const [localRows, setLocalRows] = useState(() => rows.map(calcDerived));
    const [syncVersion, setSyncVersion] = useState(0);
    const [colFilters, setColFilters] = useState({});

    // Sync from parent when row IDs change (project switch / server push)
    useEffect(() => {
        setLocalRows(rows.map(calcDerived));
        setSyncVersion(v => v + 1);
    }, [rows]);

    const handleChange = (rowId, field, rawValue) => {
        setLocalRows(prev => prev.map(r => {
            if (r.id !== rowId) return r;
            return calcDerived({ ...r, [field]: rawValue });
        }));
    };

    const displayedRows = useMemo(() => {
        const keys = Object.keys(colFilters).filter(k => String(colFilters[k] ?? '').trim() !== '');
        if (keys.length === 0) return localRows;
        const match = (val, q) => String(val ?? '').toLowerCase().includes(q);
        return localRows.filter(r => keys.every(k => {
            const q = String(colFilters[k]).toLowerCase().trim();
            switch (k) {
                case 'subjectName': return match(r.subjectName, q);
                case 'name':        return match(r.name, q);
                case 'type':        return match(TYPE_LABELS[r.type] || r.type, q);
                case 'unitCost':    return match(r.unitCost, q);
                case 'quantity':    return match(r.quantity, q);
                case 'unit':        return match(r.unit, q);
                case 'totalCost':   return match(r.totalCost, q);
                case 'margin':      return match(r.margin, q);
                case 'discount':    return match(r.discount, q);
                case 'offerPrice':  return match(r.offerPrice, q);
                case 'comment':     return match(r.comment, q);
                default: return true;
            }
        }));
    }, [localRows, colFilters]);

    const summary = useMemo(() => {
        let totalCost = 0, rawRevenue = 0;
        for (const r of localRows) {
            totalCost += parseFloat(r.totalCost) || 0;
            rawRevenue += parseFloat(r.offerPrice) || 0;
        }
        const parsedPct = Number(String(discountPercent ?? '').replace(',', '.'));
        const parsedAmt = Number(String(discountAmount ?? '').replace(',', '.'));
        const discFromPct = Number.isFinite(parsedPct) ? Math.max(0, parsedPct) / 100 * rawRevenue : 0;
        const discFromAmt = Number.isFinite(parsedAmt) ? Math.max(0, parsedAmt) : 0;
        const totalRevenue = Math.max(0, rawRevenue - discFromPct - discFromAmt);
        const profit = totalRevenue - totalCost;
        const marginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
        return { totalCost, totalRevenue, rawRevenue, profit, marginPct, rows: localRows.length };
    }, [localRows, discountPercent, discountAmount]);

    return (
        <div className="flex flex-col gap-3 h-full">
            {/* Karty summary */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-2.5">
                <div className="grid grid-cols-2 xl:grid-cols-6 gap-2">
                    <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-red-300/90 font-bold">Koszt</div>
                        <div className="text-sm font-black text-red-200">{fmtPLNFull(summary.totalCost)} PLN</div>
                    </div>
                    <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-green-300/90 font-bold">Przychód</div>
                        <div className="text-sm font-black text-green-200">{fmtPLNFull(summary.totalRevenue)} PLN</div>
                    </div>
                    <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-green-300/90 font-bold">Zysk</div>
                        <div className="text-sm font-black text-green-200">{fmtPLNFull(summary.profit)} PLN</div>
                    </div>
                    <div className="rounded-xl border border-green-500/25 bg-green-500/10 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-green-300/90 font-bold">Marża</div>
                        <div className="text-sm font-black text-green-200">{fmtPctFull(summary.marginPct)}</div>
                        <div className="text-[10px] text-green-200/70 mt-0.5">{summary.rows} wierszy</div>
                    </div>
                    <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-orange-300/90 font-bold">Rabat — %</div>
                        <div className="relative mt-1">
                            <input
                                type="number" min="0" max="100" step="0.01"
                                value={discountPercent ?? ''}
                                onChange={e => onDiscountPercentChange?.(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                className="w-full rounded-lg border border-orange-400/25 bg-black/30 px-2 py-1.5 pr-8 text-sm font-black text-orange-100 focus:outline-none focus:border-orange-400"
                                placeholder="0,00"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-black text-orange-200/80">%</span>
                        </div>
                        {discountPercent !== '' && discountPercent != null && (
                            <div className="text-[10px] text-orange-200/70 mt-0.5">
                                = {fmtPLNFull(Number.isFinite(Number(String(discountPercent).replace(',', '.'))) ? summary.rawRevenue * Math.max(0, Number(String(discountPercent).replace(',', '.'))) / 100 : 0)} PLN
                            </div>
                        )}
                    </div>
                    <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-orange-300/90 font-bold">Rabat — zł</div>
                        <input
                            type="number" min="0" step="0.01"
                            value={discountAmount ?? ''}
                            onChange={e => onDiscountAmountChange?.(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="mt-1 w-full rounded-lg border border-orange-400/25 bg-black/30 px-2 py-1.5 text-sm font-black text-orange-100 focus:outline-none focus:border-orange-400"
                            placeholder="0,00"
                        />
                        {discountAmount !== '' && discountAmount != null && (
                            <div className="text-[10px] text-orange-200/70 mt-0.5">
                                = {fmtPctFull(summary.rawRevenue > 0 ? Math.max(0, Number(String(discountAmount).replace(',', '.'))) / summary.rawRevenue * 100 : 0)}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabela */}
            <div className="flex-1 overflow-auto bg-slate-800/30">
                <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#0b0f17]">
                        <tr className="border-b border-white/15">
                            <th className={`${TH} w-8 text-center`}>#</th>
                            <th className={`${TH} min-w-[100px]`}>Przedmiot</th>
                            <th className={`${TH} min-w-[150px]`}>Nazwa</th>
                            <th className={`${TH} w-24`}>Typ</th>
                            <th className={`${TH} w-28 text-center`}>Koszt jedn.</th>
                            <th className={`${TH} w-20 text-center`}>Ilość</th>
                            <th className={`${TH} w-24 text-center`}>Jednostki</th>
                            <th className={`${TH} w-28 text-center`}>Koszt całk.</th>
                            <th className={`${TH} w-20 text-center`}>Narzut %</th>
                            <th className={`${TH} w-20 text-center`}>Rabat %</th>
                            <th className={`${TH} w-28 text-center`}>Cena ofert.</th>
                            <th className={`${TH} min-w-[180px]`}>Komentarz</th>
                            <th className="w-8" />
                        </tr>
                        {/* Filter row — jak w materials */}
                        <tr className="border-b border-white/10 bg-[#0b0f17]">
                            <th />
                            {['subjectName','name','type','unitCost','quantity','unit','totalCost','margin','discount','offerPrice','comment'].map(k => (
                                <th key={k} className="px-2 py-1">
                                    <input
                                        value={colFilters[k] || ''}
                                        onChange={e => setColFilters(p => ({ ...p, [k]: e.target.value }))}
                                        placeholder="filtruj..."
                                        className={FILTER}
                                    />
                                </th>
                            ))}
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {displayedRows.map((row, idx) => (
                            <tr key={row.id} className="border-b border-white/10 group hover:bg-white/[0.03] transition-colors">
                                <td className={`${TD} text-center text-sm text-white tabular-nums`}>{idx + 1}</td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-subjectName-${syncVersion}`}
                                        defaultValue={row.subjectName || ''}
                                        onBlur={e => { if (e.target.value !== (row.subjectName || '')) onFieldChange(row, 'subjectName', e.target.value); }}
                                        className={INPUT}
                                    />
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-name-${syncVersion}`}
                                        defaultValue={row.name || ''}
                                        onBlur={e => { if (e.target.value !== (row.name || '')) onFieldChange(row, 'name', e.target.value); }}
                                        className={INPUT}
                                    />
                                </td>

                                <td className={TD}>
                                    <select
                                        value={row.type || ''}
                                        onChange={e => { handleChange(row.id, 'type', e.target.value); onFieldChange(row, 'type', e.target.value); }}
                                        className={SELECT}
                                    >
                                        <option value="">—</option>
                                        {TYPE_OPTIONS.map(o => <option key={o} value={o}>{TYPE_LABELS[o] || o}</option>)}
                                    </select>
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-unitCost-${syncVersion}`}
                                        defaultValue={row.unitCost != null && row.unitCost !== 0 ? Number(row.unitCost).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                                        onChange={e => handleChange(row.id, 'unitCost', e.target.value)}
                                        onBlur={e => {
                                            const n = parseLocaleNumber(e.target.value);
                                            if (n != null) e.target.value = n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                            onFieldChange(row, 'unitCost', e.target.value);
                                        }}
                                        className={`${INPUT} text-center tabular-nums font-mono ${row.inheritedFromMaterials ? 'text-amber-300' : 'text-red-400'}`}
                                    />
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-quantity-${syncVersion}`}
                                        defaultValue={row.quantity != null && row.quantity !== 0 ? Number(row.quantity).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                                        onChange={e => handleChange(row.id, 'quantity', e.target.value)}
                                        onBlur={e => {
                                            const n = parseLocaleNumber(e.target.value);
                                            if (n != null) e.target.value = n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                            onFieldChange(row, 'quantity', e.target.value);
                                        }}
                                        className={`${INPUT} text-center tabular-nums`}
                                    />
                                </td>

                                <td className={TD}>
                                    <select
                                        value={row.unit || ''}
                                        onChange={e => { handleChange(row.id, 'unit', e.target.value); onFieldChange(row, 'unit', e.target.value); }}
                                        className={SELECT}
                                    >
                                        <option value="">—</option>
                                        {UNIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </td>

                                <td className={`${TD} text-center text-sm tabular-nums font-mono rounded bg-white/[0.03] ${row.totalCost > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                                    {row.totalCost > 0 ? `${fmtPLN(row.totalCost)} zł` : '—'}
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-margin-${syncVersion}`}
                                        defaultValue={row.margin != null && row.margin !== 0 ? String(row.margin).replace('.', ',') : ''}
                                        onChange={e => handleChange(row.id, 'margin', e.target.value)}
                                        onBlur={e => onFieldChange(row, 'margin', e.target.value)}
                                        className={`${INPUT} text-center tabular-nums text-green-300`}
                                    />
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-discount-${syncVersion}`}
                                        defaultValue={row.discount != null && row.discount !== 0 ? String(row.discount).replace('.', ',') : ''}
                                        onChange={e => handleChange(row.id, 'discount', e.target.value)}
                                        onBlur={e => onFieldChange(row, 'discount', e.target.value)}
                                        className={`${INPUT} text-center tabular-nums text-orange-300`}
                                    />
                                </td>

                                <td className={`${TD} text-center text-sm tabular-nums font-mono font-semibold rounded bg-white/[0.03] ${row.offerPrice > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                                    {row.offerPrice > 0 ? `${fmtPLN(row.offerPrice)} zł` : '—'}
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-comment-${syncVersion}`}
                                        defaultValue={row.comment || ''}
                                        onBlur={e => { if (e.target.value !== (row.comment || '')) onFieldChange(row, 'comment', e.target.value); }}
                                        className={`${INPUT} text-gray-400`}
                                    />
                                </td>

                                <td className={`${TD} w-8`}>
                                    <button
                                        onClick={() => onDeleteRow(row.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-red-400/50 hover:text-red-400 transition-all"
                                        title="Usuń pozycję"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {displayedRows.length === 0 && (
                            <tr>
                                <td colSpan={13} className="text-center py-10 text-gray-600 text-sm">
                                    {localRows.length === 0 ? 'Brak pozycji budżetowych' : 'Brak pozycji dla filtrów'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
