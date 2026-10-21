import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileSpreadsheet } from 'lucide-react';
import { STATUS_STYLE, fmtDay, fullName, initials, normTxt, opisDni, todayIso, trainingStatus, trainingsApi } from './trainingsShared';
import { OrderChip, BTN, INPUT } from './TrainingsUi';
import OrdersMultiSelect from './OrdersMultiSelect';
import { exportTrainingsExcel } from '../../../utils/trainingsExcel';

const FILTRY = [
    { id: 'wszystkie', label: 'Wszystkie' },
    { id: 'uwaga', label: 'Wygasające ≤ 30 dni' },
    { id: 'zle', label: 'Wygasłe' },
];

// @anchor trainings-visible-rows — jedno źródło dla tabeli i eksportu Excel (ten sam filtr i kolejność).
// Pracownik bez żadnego szkolenia NIE trafia na listę. Najpilniejsi na górze.
export function visibleRows(users, types, { query, filtr }, today = todayIso()) {
    const q = normTxt(query).trim();
    const typeById = Object.fromEntries(types.map(t => [t.id, t]));
    return users
        .filter(u => u.trainings.length > 0)
        .map(u => ({
            u,
            najblizszy: u.trainings.filter(t => t.validUntil).sort((a, b) => a.validUntil.localeCompare(b.validUntil))[0] || null,
        }))
        .filter(({ u }) => {
            if (filtr !== 'wszystkie' && !u.trainings.some(ut => trainingStatus(ut, today) === filtr)) return false;
            if (!q) return true;
            const tekst = normTxt(`${fullName(u)} ${u.team} ${u.trainings.map(ut => `${typeById[ut.trainingTypeId]?.name} ${typeById[ut.trainingTypeId]?.code}`).join(' ')}`);
            return q.split(/\s+/).every(t => tekst.includes(t));
        })
        .sort((a, b) => (a.najblizszy?.validUntil || '9999').localeCompare(b.najblizszy?.validUntil || '9999')
            || (a.u.lastName || '').localeCompare(b.u.lastName || '', 'pl'));
}

// @anchor trainings-matrix-tab — macierz pracownik × typ szkolenia z datami ważności, kolumna
// „Zamówienia" (wielowybór) i szuflada ze szczegółami pracownika (najwyżej jedna otwarta).
export default function TrainingsMatrixTab({ data, onReload, toast, onAssign, onDelete }) {
    const { users, types, orders } = data;
    const [query, setQuery] = useState('');
    const [filtr, setFiltr] = useState('wszystkie');
    const [otwarty, setOtwarty] = useState(null);
    const [wybor, setWybor] = useState(null); // { userId, anchor }
    const [exporting, setExporting] = useState(false);
    // @anchor trainings-last-closed-select — popover zamyka się na `mousedown`; `click` na tej
    // samej komórce, który przychodzi zaraz potem, nie może go od razu otworzyć ponownie.
    const ostatnioZamkniety = useRef({ userId: null, t: 0 });
    const today = todayIso();

    const ordersById = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders]);
    const typeById = useMemo(() => Object.fromEntries(types.map(t => [t.id, t])), [types]);
    const wiersze = useMemo(() => visibleRows(users, types, { query, filtr }, today), [users, types, query, filtr, today]);
    const zeSzkoleniami = users.filter(u => u.trainings.length).length;

    // @anchor missing-trainings-for-order — kody szkoleń wymaganych przez zamówienie, których
    // pracownik nie ma albo które mu wygasły (⚠ przy zamówieniu).
    const brakujace = useCallback((u, orderId) => types
        .filter(t => t.orderIds.includes(orderId))
        .filter(t => { const ut = u.trainings.find(x => x.trainingTypeId === t.id); return !ut || trainingStatus(ut, today) === 'zle'; })
        .map(t => t.code || t.name).join(', '), [types, today]);

    const zamknijWybor = useCallback(async (ids) => {
        const w = wybor;
        setWybor(null);
        if (!w) return;
        ostatnioZamkniety.current = { userId: w.userId, t: Date.now() };
        const u = users.find(x => x.id === w.userId);
        if ([...ids].sort().join() === [...u.orderIds].sort().join()) return;
        try {
            await trainingsApi(`/users/${w.userId}/orders`, { method: 'PUT', body: { orderIds: ids } });
            toast(`${fullName(u)}: zamówień ${ids.length}`);
            onReload();
        } catch (e) { toast(`Nie zapisano zamówień: ${e.message}`, true); }
    }, [wybor, users, toast, onReload]);

    const eksport = async () => {
        setExporting(true);
        try {
            const opisFiltra = [filtr !== 'wszystkie' && `status: ${FILTRY.find(f => f.id === filtr).label.toLowerCase()}`, query.trim() && `szukaj: „${query.trim()}”`].filter(Boolean).join(' · ') || 'bez filtrów';
            await exportTrainingsExcel({ wiersze, types, ordersById, opisFiltra });
            toast(`Wyeksportowano ${wiersze.length} pracowników (${opisFiltra})`);
        } catch (e) { toast(`Eksport nieudany: ${e.message}`, true); }
        setExporting(false);
    };

    const kolumn = types.length + 3;
    // komórka przyklejona do lewej przy przewijaniu macierzy w bok (tablet)
    const sticky = 'sticky left-0 z-[1] bg-[#070c17] shadow-[1px_0_0_rgba(255,255,255,.08)]';

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Szukaj pracownika lub szkolenia…" className={`${INPUT} w-full sm:w-64`} />
                <div className="flex flex-wrap gap-1">
                    {FILTRY.map(f => (
                        <button key={f.id} onClick={() => setFiltr(f.id)}
                            className={`min-h-[36px] rounded-full border px-3 text-[11px] ${filtr === f.id ? 'border-teal-500 bg-teal-500/10 text-teal-300' : 'border-white/15 text-gray-400 hover:text-gray-200'}`}>
                            {f.label}
                        </button>
                    ))}
                </div>
                <button onClick={eksport} disabled={exporting || !wiersze.length} title="Eksport wierszy widocznych po filtrach" className={`${BTN} ml-auto flex items-center gap-1.5`}>
                    <FileSpreadsheet size={14} /> {exporting ? 'Eksportuję…' : 'Excel'}
                </button>
                <span className="w-full text-[11px] text-gray-500">
                    pokazano {wiersze.length} z {zeSzkoleniami} · ukryto {users.length - zeSzkoleniami} bez szkoleń
                </span>
            </div>
            <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-gray-400">
                <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400" />ważne</span>
                <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />wygasa w ciągu 30 dni</span>
                <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-400" />wygasło</span>
                <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-gray-500" />bezterminowe</span>
            </div>

            <div className="overflow-auto rounded-lg border border-white/[.07]">
                <table className="w-full border-collapse text-[12px]">
                    <thead>
                        <tr className="bg-[#0b1220] text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            <th className={`${sticky} z-[2] !bg-[#0b1220] min-w-[190px] px-3 py-2.5`}>Pracownik</th>
                            <th className="w-[240px] px-3 py-2.5">Zamówienia</th>
                            {types.map(t => (
                                <th key={t.id} title={t.name} className="min-w-[96px] px-2 py-2.5 text-center">
                                    {t.code || t.name}
                                    <div className="text-[10px] font-normal normal-case tracking-normal text-gray-600">{t.validityMonths ? `${t.validityMonths} mies.` : 'bezterm.'}</div>
                                </th>
                            ))}
                            <th className="w-full px-3 py-2.5">Najbliższy termin</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!wiersze.length && (
                            <tr><td colSpan={kolumn} className="px-3 py-8 text-center text-gray-500">
                                {users.some(u => u.trainings.length) ? 'Brak pracowników spełniających kryteria' : 'Nikt nie ma jeszcze przypisanego szkolenia — zacznij od „Przypisz szkolenie”.'}
                            </td></tr>
                        )}
                        {wiersze.map(({ u, najblizszy }) => {
                            const otw = otwarty === u.id;
                            const pokaz = u.orderIds.slice(0, 2);
                            const reszta = u.orderIds.length - pokaz.length;
                            return (
                                <Fragment key={u.id}>
                                    <tr onClick={() => setOtwarty(otw ? null : u.id)} className={`cursor-pointer border-t border-white/[.06] ${otw ? 'bg-[#0c1420]' : 'hover:bg-white/[.025]'}`}>
                                        <td className={`${sticky} ${otw ? '!bg-[#0c1420]' : ''} px-3 py-2`}>
                                            <div className="flex items-center gap-2">
                                                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-500/15 text-[10px] font-bold text-teal-300">{initials(u)}</span>
                                                <div className="min-w-0">
                                                    <div className="truncate font-semibold text-gray-100">{fullName(u)}</div>
                                                    <div className="truncate text-[10.5px] text-gray-500">{u.team || 'bez zespołu'} · {u.trainings.length} szkol.</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-2 py-1.5" onClick={e => {
                                            e.stopPropagation();
                                            const z = ostatnioZamkniety.current;
                                            if (z.userId === u.id && Date.now() - z.t < 400) return;
                                            setWybor({ userId: u.id, anchor: e.currentTarget });
                                        }}>
                                            <div className={`relative flex min-h-[34px] w-[230px] cursor-pointer flex-wrap items-center gap-1 rounded-md border py-1 pl-1 pr-6 ${wybor?.userId === u.id ? 'border-teal-500 bg-teal-500/5' : 'border-transparent hover:border-white/15'}`}>
                                                {!u.orderIds.length && <span className="pl-1 text-[11px] italic text-gray-600">wybierz zamówienia…</span>}
                                                {pokaz.map(id => <OrderChip key={id} compact order={ordersById[id]} warn={ordersById[id]?.closed ? '' : brakujace(u, id)} />)}
                                                {reszta > 0 && <span className="text-[10.5px] text-gray-500">+{reszta}</span>}
                                                <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500" />
                                            </div>
                                        </td>
                                        {types.map(t => {
                                            const ut = u.trainings.find(x => x.trainingTypeId === t.id);
                                            return (
                                                <td key={t.id} className="px-2 py-2 text-center tabular-nums">
                                                    {ut
                                                        ? <span title={`${t.name} · ${opisDni(ut, today)}`} className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[trainingStatus(ut, today)]}`}>{ut.validUntil ? fmtDay(ut.validUntil) : '∞'}</span>
                                                        : <span className="text-gray-700">—</span>}
                                                </td>
                                            );
                                        })}
                                        <td className="whitespace-nowrap px-3 py-2">
                                            {najblizszy ? (<>
                                                <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[trainingStatus(najblizszy, today)]}`}>{typeById[najblizszy.trainingTypeId]?.code || typeById[najblizszy.trainingTypeId]?.name} · {fmtDay(najblizszy.validUntil)}</span>
                                                <div className="mt-0.5 text-[10px] text-gray-500">{opisDni(najblizszy, today)}</div>
                                            </>) : <span className="text-[11px] text-gray-500">tylko bezterminowe</span>}
                                        </td>
                                    </tr>
                                    {otw && (
                                        <tr>
                                            <td colSpan={kolumn} className="bg-[#05080f] p-0">
                                                {/* szczegóły przyklejone do lewej i szerokości ekranu — nie uciekają przy przewijaniu macierzy */}
                                                <div className="sticky left-0 w-[calc(100vw-2rem)] max-w-full overflow-x-auto border-l-[3px] border-teal-500 px-4 pb-3 pt-2 md:w-auto">
                                                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-teal-300/80">Szkolenia — {fullName(u)}</div>
                                                    <table className="w-full min-w-[720px] text-[11.5px]">
                                                        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
                                                            <th className="py-1.5 pr-3">Szkolenie</th><th className="pr-3">Ukończone</th><th className="pr-3">Ważne do</th>
                                                            <th className="pr-3">Nr zaświadczenia</th><th className="pr-3">Wymagane w zamówieniach</th><th />
                                                        </tr></thead>
                                                        <tbody>
                                                            {[...u.trainings].sort((a, b) => (a.validUntil || '9999').localeCompare(b.validUntil || '9999')).map(ut => {
                                                                const t = typeById[ut.trainingTypeId];
                                                                return (
                                                                    <tr key={ut.id} className="border-t border-white/[.04] align-top">
                                                                        <td className="py-1.5 pr-3"><b className="text-gray-100">{t?.name}</b> <span className="text-gray-500">{t?.code}</span></td>
                                                                        <td className="pr-3 py-1.5">{fmtDay(ut.completedAt)}</td>
                                                                        <td className="pr-3 py-1.5 whitespace-nowrap">
                                                                            <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[trainingStatus(ut, today)]}`}>{ut.validUntil ? fmtDay(ut.validUntil) : '∞'}</span>
                                                                            <span className="ml-1.5 text-[10.5px] text-gray-500">{opisDni(ut, today)}</span>
                                                                        </td>
                                                                        <td className="pr-3 py-1.5">{ut.certificateNo || <span className="text-gray-700">—</span>}</td>
                                                                        <td className="pr-3 py-1.5">
                                                                            {t?.orderIds.length
                                                                                ? <div className="flex flex-wrap gap-1">{t.orderIds.map(id => <OrderChip key={id} order={ordersById[id]} />)}</div>
                                                                                : <span className="text-[10.5px] text-gray-500">ogólne — bez przypisanych zamówień</span>}
                                                                        </td>
                                                                        <td className="whitespace-nowrap py-1.5 text-right">
                                                                            <button onClick={() => onAssign(u.id, ut.trainingTypeId)} className="px-1.5 py-1.5 text-teal-300 hover:underline">Odnów</button>
                                                                            <span className="text-gray-700">·</span>
                                                                            <button onClick={() => onDelete(u, ut, t)} className="px-1.5 py-1.5 text-red-400 hover:underline">Usuń</button>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                    <button onClick={() => onAssign(u.id, '')} className="mt-2 py-1.5 text-[12px] text-teal-300 hover:underline">+ dodaj szkolenie</button>
                                                </div>
                                                <div className="h-1 bg-teal-500/70" />
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {wybor && (
                <OrdersMultiSelect
                    orders={orders}
                    selectedIds={users.find(x => x.id === wybor.userId)?.orderIds || []}
                    anchor={wybor.anchor}
                    onClose={zamknijWybor}
                    warnOf={id => (ordersById[id]?.closed ? '' : brakujace(users.find(x => x.id === wybor.userId), id))}
                />
            )}
        </div>
    );
}
