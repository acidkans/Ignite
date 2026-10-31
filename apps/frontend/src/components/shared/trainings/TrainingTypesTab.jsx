import { useMemo, useState } from 'react';
import { fuzzyMatch, todayIso, trainingStatus } from './trainingsShared';
import { OrderChip, INPUT } from './TrainingsUi';

// @anchor training-types-tab — tabela typów (wiersz = typ): okres ważności, ile osób ma szkolenie (ważne /
// wygasa / wygasło) i zamówienia, które go wymagają. Wyszukiwanie fuzzy po nazwie, kodzie
// i zamówieniach.
export default function TrainingTypesTab({ data, onEdit, onDelete }) {
    const { users, types, orders } = data;
    const [q, setQ] = useState('');
    const today = todayIso();
    const ordersById = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders]);

    const lista = useMemo(() => types.map(t => {
        if (!q.trim()) return { t, s: 0 };
        const m = fuzzyMatch(q, `${t.code || ''} ${t.name} ${t.orderIds.map(id => ordersById[id]?.name).join(' ')}`);
        return m ? { t, s: m.score } : null;
    }).filter(Boolean).sort((a, b) => b.s - a.s), [types, q, ordersById]);

    return (
        <div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Szukaj typu lub zamówienia…" className={`${INPUT} mb-3 w-full sm:w-72`} />
            {!types.length && <div className="text-sm text-gray-500">Nie ma jeszcze żadnego typu szkolenia — dodaj pierwszy przyciskiem „Nowy typ szkolenia”.</div>}
            {types.length > 0 && (
                <div className="overflow-auto rounded-lg border border-white/[.07]">
                    <table className="w-full border-collapse text-[12px]">
                        <thead>
                            <tr className="bg-[#0b1220] text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                <th className="min-w-[220px] px-3 py-2.5">Szkolenie</th>
                                <th className="px-3 py-2.5">Kod</th>
                                <th className="whitespace-nowrap px-3 py-2.5">Ważność</th>
                                <th className="min-w-[170px] px-3 py-2.5">Pracownicy</th>
                                <th className="w-full px-3 py-2.5">Wymagane w zamówieniach</th>
                                <th className="px-3 py-2.5" />
                            </tr>
                        </thead>
                        <tbody>
                            {!lista.length && (
                                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">Brak typów pasujących do wyszukiwania</td></tr>
                            )}
                            {lista.map(({ t }) => {
                                const uts = users.flatMap(u => u.trainings.filter(x => x.trainingTypeId === t.id));
                                const ile = (st) => uts.filter(ut => trainingStatus(ut, today) === st).length;
                                return (
                                    <tr key={t.id} className="border-t border-white/[.06] align-top hover:bg-white/[.025]">
                                        <td className="px-3 py-2">
                                            <div className="font-bold text-gray-100">{t.name}</div>
                                            {t.description && <div className="mt-0.5 text-[11px] text-gray-400">{t.description}</div>}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-gray-500">{t.code}</td>
                                        <td className="whitespace-nowrap px-3 py-2 text-gray-400">{t.validityMonths ? `${t.validityMonths} mies.` : 'bezterminowe'}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                                                <span className="tabular-nums text-gray-300">{uts.length} os.</span>
                                                {ile('ok') > 0 && <span className="rounded bg-emerald-500/10 px-1.5 text-emerald-300">{ile('ok')} ważne</span>}
                                                {ile('uwaga') > 0 && <span className="rounded bg-amber-500/10 px-1.5 text-amber-300">{ile('uwaga')} wygasa</span>}
                                                {ile('zle') > 0 && <span className="rounded bg-red-500/10 px-1.5 text-red-300">{ile('zle')} wygasło</span>}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            {t.orderIds.length
                                                ? <div className="flex flex-wrap gap-1">{t.orderIds.map(id => <OrderChip key={id} order={ordersById[id]} />)}</div>
                                                : <span className="text-[11px] text-gray-500">ogólne — bez przypisanych zamówień</span>}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-right">
                                            <button onClick={() => onEdit(t)} className="px-1 py-1 text-[12px] text-teal-300 hover:underline">Edytuj</button>
                                            <button onClick={() => onDelete(t, uts.length)} className="px-1 py-1 text-[12px] text-red-400 hover:underline">Usuń</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
