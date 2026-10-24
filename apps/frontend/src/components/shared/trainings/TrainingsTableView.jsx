import { useMemo } from 'react';
import { STATUS_STYLE, fmtDay, fullName, opisDni, todayIso, trainingStatus } from './trainingsShared';
import { OrderChip } from './TrainingsUi';

// @anchor trainings-table-view — widok listy: jeden wiersz = pracownik × szkolenie, pełna nazwa
// szkolenia. Bierze te same wiersze co macierz (`visibleRows`); przy filtrze statusu zostają tylko
// szkolenia w tym statusie. Najpilniejsze terminy na górze.
export default function TrainingsTableView({ wiersze, typeById, ordersById, filtr, onAssign, onDelete, today = todayIso() }) {
    const pozycje = useMemo(() => wiersze
        .flatMap(({ u }) => u.trainings.map(ut => ({ u, ut, t: typeById[ut.trainingTypeId], st: trainingStatus(ut, today) })))
        .filter(p => p.t && (filtr === 'wszystkie' || p.st === filtr))
        .sort((a, b) => (a.ut.validUntil || '9999').localeCompare(b.ut.validUntil || '9999')
            || (a.u.lastName || '').localeCompare(b.u.lastName || '', 'pl')), [wiersze, typeById, filtr, today]);

    return (
        <div className="overflow-auto rounded-lg border border-white/[.07]">
            <table className="w-full min-w-[900px] border-collapse text-[12px]">
                <thead>
                    <tr className="bg-[#0b1220] text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        <th className="px-3 py-2.5">Pracownik</th>
                        <th className="px-3 py-2.5">Szkolenie</th>
                        <th className="px-3 py-2.5">Ukończone</th>
                        <th className="px-3 py-2.5">Ważne do</th>
                        <th className="px-3 py-2.5">Nr zaświadczenia</th>
                        <th className="px-3 py-2.5">Wymagane w zamówieniach</th>
                        <th className="px-3 py-2.5" />
                    </tr>
                </thead>
                <tbody>
                    {!pozycje.length && (
                        <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Brak szkoleń spełniających kryteria</td></tr>
                    )}
                    {pozycje.map(({ u, ut, t, st }) => (
                        <tr key={ut.id} className="border-t border-white/[.06] align-top hover:bg-white/[.025]">
                            <td className="px-3 py-2">
                                <div className="font-semibold text-gray-100">{fullName(u)}</div>
                                <div className="text-[10.5px] text-gray-500">{u.team || 'bez zespołu'}</div>
                            </td>
                            <td className="px-3 py-2">
                                <div className="text-gray-100">{t.name}</div>
                                <div className="text-[10.5px] text-gray-500">{[t.code, t.validityMonths ? `${t.validityMonths} mies.` : 'bezterminowe'].filter(Boolean).join(' · ')}</div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtDay(ut.completedAt)}</td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                                <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[st]}`}>{ut.validUntil ? fmtDay(ut.validUntil) : '∞'}</span>
                                <div className="mt-0.5 text-[10px] text-gray-500">{opisDni(ut, today)}</div>
                            </td>
                            <td className="px-3 py-2">{ut.certificateNo || <span className="text-gray-700">—</span>}</td>
                            <td className="px-3 py-2">
                                {t.orderIds.length
                                    ? <div className="flex flex-wrap gap-1">{t.orderIds.map(id => <OrderChip key={id} compact order={ordersById[id]} />)}</div>
                                    : <span className="text-[10.5px] text-gray-500">ogólne</span>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                                <button onClick={() => onAssign(u.id, ut.trainingTypeId)} className="px-1.5 py-1.5 text-teal-300 hover:underline">Odnów</button>
                                <span className="text-gray-700">·</span>
                                <button onClick={() => onDelete(u, ut, t)} className="px-1.5 py-1.5 text-red-400 hover:underline">Usuń</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
