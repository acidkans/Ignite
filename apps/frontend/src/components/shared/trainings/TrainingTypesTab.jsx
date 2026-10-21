import { useMemo, useState } from 'react';
import { fuzzyMatch, todayIso, trainingStatus } from './trainingsShared';
import { OrderChip, INPUT } from './TrainingsUi';

// @anchor training-types-tab — karty typów: okres ważności, ile osób ma szkolenie (ważne /
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
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                {lista.map(({ t }) => {
                    const uts = users.flatMap(u => u.trainings.filter(x => x.trainingTypeId === t.id));
                    const ile = (st) => uts.filter(ut => trainingStatus(ut, today) === st).length;
                    return (
                        <div key={t.id} className="rounded-lg border border-white/[.07] bg-[#0a1120] p-3.5">
                            <div className="flex items-baseline gap-2">
                                <h3 className="text-sm font-bold text-gray-100">{t.name}</h3>
                                <span className="text-[11px] text-gray-500">{t.code}</span>
                                <button onClick={() => onEdit(t)} className="ml-auto px-1 py-1 text-[12px] text-teal-300 hover:underline">Edytuj</button>
                                <button onClick={() => onDelete(t, uts.length)} className="px-1 py-1 text-[12px] text-red-400 hover:underline">Usuń</button>
                            </div>
                            <div className="mb-2 text-[11px] text-gray-500">Ważność: {t.validityMonths ? `${t.validityMonths} mies.` : 'bezterminowe'}</div>
                            {t.description && <div className="mb-2 text-xs text-gray-400">{t.description}</div>}
                            <div className="flex flex-wrap gap-2 text-[11px]">
                                <span className="text-gray-300">{uts.length} os.</span>
                                {ile('ok') > 0 && <span className="rounded bg-emerald-500/10 px-1.5 text-emerald-300">{ile('ok')} ważne</span>}
                                {ile('uwaga') > 0 && <span className="rounded bg-amber-500/10 px-1.5 text-amber-300">{ile('uwaga')} wygasa</span>}
                                {ile('zle') > 0 && <span className="rounded bg-red-500/10 px-1.5 text-red-300">{ile('zle')} wygasło</span>}
                            </div>
                            <div className="mb-1 mt-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">Wymagane w zamówieniach ({t.orderIds.length})</div>
                            {t.orderIds.length
                                ? <div className="flex flex-wrap gap-1">{t.orderIds.map(id => <OrderChip key={id} order={ordersById[id]} />)}</div>
                                : <span className="text-[11px] text-gray-500">ogólne — bez przypisanych zamówień</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
