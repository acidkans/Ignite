import { Trash2 } from 'lucide-react';
import { fmtPLN, fmtQty, fmtPct, TYPE_OPTIONS, TYPE_LABELS, UNIT_OPTIONS } from './wbsConstants';

const TH = 'text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 whitespace-nowrap select-none';
const TD = 'px-2 py-1.5 align-middle';
const INPUT = 'bg-transparent text-white text-xs w-full outline-none focus:bg-white/5 rounded px-1 py-0.5 min-w-0 placeholder-gray-700';
const SELECT = 'bg-[#0b0f17] text-white text-xs w-full outline-none rounded px-1 py-0.5 cursor-pointer border border-white/5 hover:border-white/10 focus:border-blue-500/40 transition-colors';

function NumInput({ row, field, onFieldChange, cls = '' }) {
    const raw = row[field];
    const display = raw != null && raw !== '' && raw !== 0
        ? String(raw).replace('.', ',')
        : '';
    return (
        <input
            key={`${row.id}-${field}-${raw}`}
            defaultValue={display}
            onBlur={e => onFieldChange(row, field, e.target.value)}
            className={`${INPUT} text-right tabular-nums ${cls}`}
        />
    );
}

function TextInput({ row, field, onFieldChange, cls = '' }) {
    return (
        <input
            key={`${row.id}-${field}-${row[field]}`}
            defaultValue={row[field] || ''}
            onBlur={e => { if (e.target.value !== (row[field] || '')) onFieldChange(row, field, e.target.value); }}
            className={`${INPUT} ${cls}`}
        />
    );
}

export default function BudgetTable({ rows, onFieldChange, onDeleteRow }) {
    return (
        <div className="w-full overflow-x-auto">
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
                    {rows.map((row, idx) => (
                        <tr
                            key={row.id}
                            className="border-b border-white/5 group hover:bg-white/[0.02] transition-colors"
                        >
                            <td className={`${TD} text-center text-[10px] text-gray-600 tabular-nums`}>{idx + 1}</td>

                            <td className={TD}>
                                <TextInput row={row} field="subjectName" onFieldChange={onFieldChange} />
                            </td>

                            <td className={TD}>
                                <TextInput row={row} field="name" onFieldChange={onFieldChange} />
                            </td>

                            <td className={TD}>
                                <select
                                    value={row.type || ''}
                                    onChange={e => onFieldChange(row, 'type', e.target.value)}
                                    className={SELECT}
                                >
                                    <option value="">—</option>
                                    {TYPE_OPTIONS.map(o => (
                                        <option key={o} value={o}>{TYPE_LABELS[o] || o}</option>
                                    ))}
                                </select>
                            </td>

                            <td className={TD}>
                                <NumInput
                                    row={row}
                                    field="unitCost"
                                    onFieldChange={onFieldChange}
                                    cls={row.inheritedFromMaterials ? 'text-amber-300' : ''}
                                />
                                {row.inheritedFromMaterials && (
                                    <div className="text-[9px] text-amber-600/70 px-1 leading-none mt-0.5">z Materiałów</div>
                                )}
                            </td>

                            <td className={TD}>
                                <NumInput row={row} field="quantity" onFieldChange={onFieldChange} />
                            </td>

                            <td className={TD}>
                                <select
                                    value={row.unit || ''}
                                    onChange={e => onFieldChange(row, 'unit', e.target.value)}
                                    className={SELECT}
                                >
                                    <option value="">—</option>
                                    {UNIT_OPTIONS.map(o => (
                                        <option key={o} value={o}>{o}</option>
                                    ))}
                                </select>
                            </td>

                            <td className={`${TD} text-right text-xs text-gray-300 tabular-nums font-mono`}>
                                {fmtPLN(row.totalCost)}
                            </td>

                            <td className={TD}>
                                <NumInput row={row} field="margin" onFieldChange={onFieldChange} cls="text-green-300" />
                            </td>

                            <td className={TD}>
                                <NumInput row={row} field="discount" onFieldChange={onFieldChange} cls="text-orange-300" />
                            </td>

                            <td className={`${TD} text-right text-xs text-white tabular-nums font-mono font-semibold`}>
                                {fmtPLN(row.offerPrice)}
                            </td>

                            <td className={TD}>
                                <TextInput row={row} field="comment" onFieldChange={onFieldChange} cls="text-gray-400" />
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
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={13} className="text-center py-10 text-gray-600 text-xs">
                                Brak pozycji budżetowych
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
