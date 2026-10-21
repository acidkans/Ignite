import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { fuzzyOrders, trainingsApi } from './trainingsShared';
import { Modal, Highlight, BTN, BTN_PRIMARY, INPUT, LABEL } from './TrainingsUi';

// @anchor training-type-modal — nowy / edycja typu szkolenia. Zamówienia, dla których szkolenie
// jest wymagane, wybiera się combo z fuzzy match: ↑ ↓, Enter dodaje, Backspace w pustym polu
// zdejmuje ostatnie. Zapis wysyła pełną listę zamówień (zastępuje poprzednią).
export default function TrainingTypeModal({ type, orders, onClose, onSaved }) {
    const [name, setName] = useState(type?.name || '');
    const [code, setCode] = useState(type?.code || '');
    const [months, setMonths] = useState(type?.validityMonths ?? '');
    const [description, setDescription] = useState(type?.description || '');
    const [orderIds, setOrderIds] = useState(type?.orderIds || []);
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [akt, setAkt] = useState(0);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const inputRef = useRef(null);

    const byId = useMemo(() => Object.fromEntries(orders.map(o => [o.id, o])), [orders]);
    const wyniki = useMemo(() => fuzzyOrders(orders.filter(o => !orderIds.includes(o.id)), q).slice(0, 12), [orders, orderIds, q]);

    const dodaj = (id) => { setOrderIds(ids => [...ids, id]); setQ(''); setAkt(0); inputRef.current?.focus(); };
    const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAkt(a => Math.min(a + 1, wyniki.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setAkt(a => Math.max(a - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (open && wyniki[akt]) dodaj(wyniki[akt].o.id); }
        else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } }
        else if (e.key === 'Backspace' && !q && orderIds.length) setOrderIds(ids => ids.slice(0, -1));
    };

    const zapisz = async () => {
        setError('');
        if (!name.trim()) { setError('Podaj nazwę szkolenia.'); return; }
        if (months !== '' && (!Number.isInteger(Number(months)) || Number(months) <= 0)) { setError('Okres ważności musi być dodatnią liczbą całkowitą miesięcy.'); return; }
        setBusy(true);
        try {
            const body = {
                name: name.trim(),
                // skrót z pierwszych liter słów — pomijamy słowa zaczynające się od znaku nieliterowego („—”)
                code: code.trim() || name.trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w[0])).map(w => w[0]).join('').toUpperCase().slice(0, 6),
                validityMonths: months === '' ? null : Number(months),
                description: description.trim(),
                orderIds,
            };
            await trainingsApi(type ? `/types/${type.id}` : '/types', { method: type ? 'PATCH' : 'POST', body });
            onSaved(type ? `Zapisano typ „${body.name}”` : `Dodano typ „${body.name}”`);
        } catch (e) { setError(e.message); setBusy(false); }
    };

    return (
        <Modal title={type ? 'Edycja typu szkolenia' : 'Nowy typ szkolenia'} onClose={onClose} footer={<>
            <button onClick={onClose} className={BTN}>Anuluj</button>
            <button onClick={zapisz} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Zapisuję…' : 'Zapisz typ'}</button>
        </>}>
            <label className={LABEL}>Nazwa szkolenia
                <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="np. Uprawnienia SEP E1 do 1 kV" className={INPUT} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className={LABEL}>Okres ważności (miesiące)
                    <input type="number" min="1" value={months} onChange={e => setMonths(e.target.value)} placeholder="np. 60" className={INPUT} />
                    <span className="font-normal text-gray-500">puste = bezterminowe</span>
                </label>
                <label className={LABEL}>Kod / skrót
                    <input value={code} onChange={e => setCode(e.target.value)} placeholder="np. SEP-E1" className={INPUT} />
                    <span className="font-normal text-gray-500">nagłówek kolumny w macierzy</span>
                </label>
            </div>
            <label className={LABEL}>Opis
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Zakres, kto prowadzi, wymagane dokumenty…" className={`${INPUT} resize-y`} />
            </label>
            <div className={LABEL}>
                Zamówienia, dla których szkolenie jest wymagane
                {orderIds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {orderIds.map(id => (
                            <span key={id} title={byId[id]?.area} className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 py-0.5 pl-2.5 pr-1 text-[11px] font-normal text-blue-200">
                                {byId[id]?.name || 'usunięte zamówienie'}
                                <button onClick={() => setOrderIds(ids => ids.filter(x => x !== id))} className="p-1 text-blue-300 hover:text-white" aria-label="Usuń"><X size={11} /></button>
                            </span>
                        ))}
                    </div>
                )}
                <div className="relative">
                    <input ref={inputRef} value={q} autoComplete="off" role="combobox" aria-expanded={open}
                        onChange={e => { setQ(e.target.value); setOpen(true); setAkt(0); }}
                        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKey}
                        placeholder="Wpisz fragment nazwy zamówienia lub obszaru…" className={INPUT} />
                    {open && (
                        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-white/15 bg-[#0d1526] py-1 shadow-2xl" role="listbox">
                            {!wyniki.length && <div className="px-3 py-2 text-xs italic font-normal text-gray-500">Brak zamówień pasujących do „{q}”</div>}
                            {wyniki.map((w, i) => (
                                <div key={w.o.id} role="option" aria-selected={i === akt}
                                    onMouseDown={e => { e.preventDefault(); dodaj(w.o.id); }}
                                    className={`flex min-h-[36px] cursor-pointer items-baseline gap-2 px-3 py-1.5 text-[13px] font-normal ${i === akt ? 'bg-teal-500/15' : 'hover:bg-white/5'}`}>
                                    <span className="min-w-0 flex-1 text-gray-100"><Highlight text={w.o.name} hits={w.hitsName} /></span>
                                    <small className="shrink-0 text-[10.5px] text-gray-500"><Highlight text={w.o.area} hits={w.hitsArea} /></small>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <span className="font-normal text-gray-500">↑ ↓ wybór, Enter dodaje, Backspace w pustym polu usuwa ostatnie. Litery nie muszą stać obok siebie: „serwzdc” znajdzie „Serwerownia ZDC”.</span>
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
        </Modal>
    );
}
