import { API_URL } from '../../../config';
import { useCallback, useEffect, useState } from 'react';
import { downloadLeaveMonthlyExcel, monthLabelPl } from '../../../utils/leaveMonthlyExcel';

// @anchor previous-month-key-ui
// Domyślne okno raportu: miesiąc poprzedni — wypłaty liczy się wstecz.
export function previousMonthKey(now = new Date()) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// @anchor leave-monthly-breakdown-modal
// Rozkład urlopów na miesiące — tabela dla DAK do podliczenia wypłat.
// Każdy urlop w osobnym wierszu, kolumny miesięcy mówią ile dni z tego urlopu
// przypada na który miesiąc. Eksport do Excela z żywymi sumami.
export default function LeaveMonthlyBreakdownModal({ onClose }) {
    const [from, setFrom] = useState(previousMonthKey);
    const [to, setTo] = useState(previousMonthKey);
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // @anchor load-monthly-breakdown
    const load = useCallback(async (fromMonth, toMonth) => {
        setLoading(true);
        setError(null);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(
                `${API_URL}/leaves/monthly-breakdown?from=${fromMonth}&to=${toMonth}`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.message || `Nie udało się pobrać rozkładu urlopów (${res.status}).`);
            }
            setReport(await res.json());
        } catch (err) {
            setError(err.message);
            setReport(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(from, to); }, [from, to, load]);

    const months = report?.months || [];
    const rows = report?.rows || [];
    const mismatchCount = rows.filter(r => r.mismatch).length;

    const cellCls = 'px-2 py-1.5 whitespace-nowrap';
    const headCls = 'px-2 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-semibold whitespace-nowrap';

    return (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-gray-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-[1600px] max-h-full flex flex-col">
                {/* @anchor monthly-modal-header */}
                <div className="flex items-start justify-between gap-4 px-5 py-3 border-b border-white/10">
                    <div>
                        <p className="text-sm font-bold uppercase tracking-widest text-gray-200">Rozkład urlopów na miesiące</p>
                        <p className="text-[11px] text-gray-500">
                            tabela dla DAK — ile dni z każdego urlopu przypada na który miesiąc
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        title="Zamknij"
                        className="text-gray-500 hover:text-gray-200 text-lg leading-none px-2"
                    >
                        ✕
                    </button>
                </div>

                {/* @anchor monthly-modal-filter */}
                <div className="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-white/5">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider">miesiąc od</label>
                        <input
                            type="month"
                            value={from}
                            onChange={e => {
                                const v = e.target.value;
                                setFrom(v);
                                // okno nie moze byc odwrocone — „do" idzie za „od"
                                if (v && to < v) setTo(v);
                            }}
                            className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500 uppercase tracking-wider">miesiąc do</label>
                        <input
                            type="month"
                            value={to}
                            min={from}
                            onChange={e => setTo(e.target.value)}
                            className="bg-gray-800 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <button
                        onClick={() => { const m = previousMonthKey(); setFrom(m); setTo(m); }}
                        title="Wróć do domyślnego okna — miesiąc poprzedni"
                        className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-colors"
                    >
                        ↺ Poprzedni miesiąc
                    </button>

                    <div className="ml-auto flex items-center gap-3">
                        <span className="text-[11px] text-gray-500">
                            {loading ? 'Liczenie...' : `${rows.length} urlopów`}
                        </span>
                        <button
                            onClick={() => downloadLeaveMonthlyExcel(report)}
                            disabled={!rows.length}
                            title="Pobierz arkusz .xlsx z żywymi sumami w kolumnach miesięcy"
                            className="text-[11px] px-3 py-1.5 rounded-lg bg-green-600/30 hover:bg-green-600/60 disabled:opacity-40 disabled:cursor-not-allowed text-green-200 border border-green-500/30 transition-colors"
                        >
                            ⬇ Eksport do Excela
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mx-5 mt-3 p-2 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-xs">{error}</div>
                )}

                {mismatchCount > 0 && (
                    <div className="mx-5 mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300 text-[11px]">
                        {mismatchCount} {mismatchCount === 1 ? 'urlop ma' : 'urlopów ma'} zapisany wymiar inny niż liczba dni roboczych w zakresie dat
                        (urlop godzinowy albo wpis ręczny). Rozbicie na miesiące trzyma się zapisanego wymiaru — wiersze podświetlone na żółto.
                    </div>
                )}

                {/* @anchor monthly-modal-table */}
                <div className="flex-1 min-h-0 overflow-auto px-5 py-3">
                    <table className="w-full text-xs border-collapse">
                        <thead className="sticky top-0 bg-gray-900 z-10">
                            <tr className="border-b border-white/10">
                                <th className={`${headCls} text-left`}>Pracownik</th>
                                <th className={`${headCls} text-left`}>Firma</th>
                                <th className={`${headCls} text-left`}>Rodzaj urlopu</th>
                                <th className={`${headCls} text-left`}>Od</th>
                                <th className={`${headCls} text-left`}>Do</th>
                                <th className={`${headCls} text-right`}>Dni razem</th>
                                {months.map(m => (
                                    <th key={m} className={`${headCls} text-right`}>{monthLabelPl(m)}</th>
                                ))}
                                <th className={`${headCls} text-left`}>Komentarz</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr
                                    key={r.leaveId}
                                    className={`border-b border-white/5 ${r.mismatch ? 'bg-amber-500/[0.07]' : ''}`}
                                    title={r.mismatch
                                        ? `Zapisano ${r.daysCount} dni, dni roboczych w zakresie: ${r.workingDays}`
                                        : undefined}
                                >
                                    <td className={`${cellCls} text-gray-200`}>{r.firstName} {r.lastName}</td>
                                    <td className={`${cellCls} text-gray-500`}>{r.company || '—'}</td>
                                    <td className={`${cellCls} text-gray-400`}>{r.typeName}</td>
                                    <td className={`${cellCls} text-gray-400`}>{r.dateFrom}</td>
                                    <td className={`${cellCls} text-gray-400`}>{r.dateTo}</td>
                                    <td className={`${cellCls} text-right font-semibold text-gray-200`}>{r.daysCount}</td>
                                    {months.map(m => (
                                        <td
                                            key={m}
                                            className={`${cellCls} text-right ${r.months?.[m] ? 'text-blue-300 font-semibold' : 'text-gray-700'}`}
                                        >
                                            {r.months?.[m] ?? '—'}
                                        </td>
                                    ))}
                                    <td className={`${cellCls} text-gray-500 max-w-[240px] truncate`} title={r.note || ''}>
                                        {r.note || '—'}
                                    </td>
                                </tr>
                            ))}
                            {!rows.length && !loading && (
                                <tr>
                                    <td colSpan={7 + months.length} className="py-6 text-center text-gray-600 italic">
                                        Brak urlopów w wybranym oknie
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {rows.length > 0 && (
                            <tfoot className="sticky bottom-0 bg-gray-900">
                                <tr className="border-t border-white/20">
                                    <td className={`${cellCls} text-[10px] uppercase tracking-widest text-gray-500`} colSpan={5}>Razem</td>
                                    <td className={`${cellCls} text-right font-bold text-gray-200`}>
                                        {Math.round(rows.reduce((s, r) => s + r.daysCount, 0) * 100) / 100}
                                    </td>
                                    {months.map(m => (
                                        <td key={m} className={`${cellCls} text-right font-bold text-blue-300`}>
                                            {report?.totals?.[m] ?? 0}
                                        </td>
                                    ))}
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
