import { useState, useEffect, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { fmtPLN, fmtPLNFull, fmtQty, fmtPct, fmtPctFull, TYPE_OPTIONS, TYPE_LABELS, UNIT_OPTIONS, parseLocaleNumber } from './wbsConstants';

const TH = 'text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 whitespace-nowrap select-none';
const TD = 'px-2 py-1.5 align-middle';
const INPUT = 'bg-transparent text-white text-xs w-full outline-none focus:bg-white/5 rounded px-1 py-0.5 min-w-0';
const SELECT = 'bg-[#0b0f17] text-white text-xs w-full outline-none rounded px-1 py-0.5 cursor-pointer border border-white/5 hover:border-white/10 focus:border-blue-500/40 transition-colors';

function calcDerived(r) {
    const q = Math.max(0, parseLocaleNumber(String(r.quantity ?? '')) ?? 1);
    const uc = Math.max(0, parseLocaleNumber(String(r.unitCost ?? '')) ?? 0);
    const m = Math.max(0, parseFloat(r.margin) || 0);
    const d = Math.max(0, parseFloat(r.discount) || 0);
    const totalCost = uc * q;
    let offerPrice = m !== 0 ? totalCost * (1 + m / 100) : 0;
    if (d > 0) offerPrice = offerPrice * (1 - d / 100);
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

    // Sync from parent when row IDs change (project switch / server push)
    useEffect(() => {
        setLocalRows(rows.map(calcDerived));
    }, [rows]);

    const handleChange = (rowId, field, rawValue) => {
        setLocalRows(prev => prev.map(r => {
            if (r.id !== rowId) return r;
            return calcDerived({ ...r, [field]: rawValue });
        }));
    };

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
        const marginPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
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
            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#0b0f17]">
                        <tr className="border-b border-white/10">
                            <th className={`${TH} w-8 text-center`}>#</th>
                            <th className={`${TH} min-w-[100px]`}>Przedmiot</th>
                            <th className={`${TH} min-w-[150px]`}>Nazwa</th>
                            <th className={`${TH} w-24`}>Typ</th>
                            <th className={`${TH} w-28 text-right`}>Koszt jedn.</th>
                            <th className={`${TH} w-20 text-right`}>Ilość</th>
                            <th className={`${TH} w-24`}>Jednostki</th>
                            <th className={`${TH} w-28 text-right`}>Koszt całk.</th>
                            <th className={`${TH} w-20 text-right`}>Marża %</th>
                            <th className={`${TH} w-20 text-right`}>Rabat %</th>
                            <th className={`${TH} w-28 text-right`}>Cena ofert.</th>
                            <th className={`${TH} min-w-[180px]`}>Komentarz</th>
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {localRows.map((row, idx) => (
                            <tr key={row.id} className="border-b border-white/5 group hover:bg-white/[0.02] transition-colors">
                                <td className={`${TD} text-center text-[10px] text-gray-600 tabular-nums`}>{idx + 1}</td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-subjectName`}
                                        defaultValue={row.subjectName || ''}
                                        onBlur={e => { if (e.target.value !== (row.subjectName || '')) onFieldChange(row, 'subjectName', e.target.value); }}
                                        className={INPUT}
                                    />
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-name`}
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
                                        key={`${row.id}-unitCost`}
                                        defaultValue={row.unitCost != null && row.unitCost !== 0 ? String(row.unitCost).replace('.', ',') : ''}
                                        onChange={e => handleChange(row.id, 'unitCost', e.target.value)}
                                        onBlur={e => onFieldChange(row, 'unitCost', e.target.value)}
                                        className={`${INPUT} text-right tabular-nums ${row.inheritedFromMaterials ? 'text-amber-300' : ''}`}
                                    />
                                    {row.inheritedFromMaterials && (
                                        <div className="text-[9px] text-amber-600/70 px-1 leading-none mt-0.5">z Materiałów</div>
                                    )}
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-quantity`}
                                        defaultValue={row.quantity != null ? String(row.quantity).replace('.', ',') : ''}
                                        onChange={e => handleChange(row.id, 'quantity', e.target.value)}
                                        onBlur={e => onFieldChange(row, 'quantity', e.target.value)}
                                        className={`${INPUT} text-right tabular-nums`}
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

                                <td className={`${TD} text-right text-xs text-gray-300 tabular-nums font-mono`}>
                                    {fmtPLN(row.totalCost)}
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-margin`}
                                        defaultValue={row.margin != null && row.margin !== 0 ? String(row.margin).replace('.', ',') : ''}
                                        onChange={e => handleChange(row.id, 'margin', e.target.value)}
                                        onBlur={e => onFieldChange(row, 'margin', e.target.value)}
                                        className={`${INPUT} text-right tabular-nums text-green-300`}
                                    />
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-discount`}
                                        defaultValue={row.discount != null && row.discount !== 0 ? String(row.discount).replace('.', ',') : ''}
                                        onChange={e => handleChange(row.id, 'discount', e.target.value)}
                                        onBlur={e => onFieldChange(row, 'discount', e.target.value)}
                                        className={`${INPUT} text-right tabular-nums text-orange-300`}
                                    />
                                </td>

                                <td className={`${TD} text-right text-xs text-white tabular-nums font-mono font-semibold`}>
                                    {fmtPLN(row.offerPrice)}
                                </td>

                                <td className={TD}>
                                    <input
                                        key={`${row.id}-comment`}
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
                        {localRows.length === 0 && (
                            <tr>
                                <td colSpan={13} className="text-center py-10 text-gray-600 text-xs">
                                    Brak pozycji budżetowych
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
