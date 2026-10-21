import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fuzzyOrders } from './trainingsShared';
import { Highlight, BTN_PRIMARY, INPUT } from './TrainingsUi';

// @anchor orders-multi-select — popover pod komórką „Zamówienia": wyszukiwanie fuzzy, checkboxy,
// przypisane na górze. Zapis dopiero przy zamknięciu (Gotowe / Esc / klik obok) — jeden PUT
// zamiast zapisu po każdym kliknięciu. `warnOf(orderId)` zwraca kody brakujących szkoleń.
export default function OrdersMultiSelect({ orders, selectedIds, anchor, onClose, warnOf }) {
    const [wybrane, setWybrane] = useState(selectedIds || []);
    const [q, setQ] = useState('');
    const [akt, setAkt] = useState(0);
    const [pos, setPos] = useState({ left: 0, top: 0 });
    const boxRef = useRef(null);
    const inputRef = useRef(null);
    const wybraneRef = useRef(wybrane);
    wybraneRef.current = wybrane;

    const wyniki = useMemo(() => {
        const lista = fuzzyOrders(orders, q);
        if (q.trim()) return lista;
        // kolejność bez frazy liczymy od stanu przy OTWARCIU — odznaczenie nie przeskakuje wiersza
        const przyOtwarciu = selectedIds || [];
        return lista.sort((a, b) => (przyOtwarciu.includes(b.o.id) - przyOtwarciu.includes(a.o.id)) || a.o.name.localeCompare(b.o.name, 'pl'));
    }, [orders, q, selectedIds]);

    useLayoutEffect(() => {
        const r = anchor?.getBoundingClientRect();
        const box = boxRef.current;
        if (!r || !box) return;
        const w = box.offsetWidth, h = box.offsetHeight;
        const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
        const top = r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
        setPos({ left, top });
    }, [anchor]);

    useEffect(() => {
        inputRef.current?.focus();
        const zamknij = () => onClose(wybraneRef.current);
        // klik w samą komórkę też zamyka (i zapisuje) — tabela ignoruje następujący po nim `click`
        const onDown = (e) => { if (!boxRef.current?.contains(e.target)) zamknij(); };
        const onScroll = (e) => { if (!boxRef.current?.contains(e.target)) zamknij(); };
        document.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', zamknij);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', zamknij);
        };
    }, [anchor, onClose]);

    useEffect(() => { boxRef.current?.querySelector('[data-akt="1"]')?.scrollIntoView({ block: 'nearest' }); }, [akt]);

    const przelacz = (id) => setWybrane(w => (w.includes(id) ? w.filter(x => x !== id) : [...w, id]));
    const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setAkt(a => Math.min(a + 1, wyniki.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setAkt(a => Math.max(a - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (wyniki[akt]) przelacz(wyniki[akt].o.id); }
        else if (e.key === 'Escape') { e.preventDefault(); onClose(wybrane); }
    };

    let poprzZazn = null;
    return createPortal(
        <div ref={boxRef} style={{ left: pos.left, top: pos.top }}
            className="fixed z-[60] w-[min(400px,calc(100vw-16px))] rounded-lg border border-white/15 bg-[#0d1526] shadow-2xl"
            role="dialog" aria-label="Zamówienia pracownika">
            <div className="border-b border-white/[.07] p-2">
                <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setAkt(0); }} onKeyDown={onKey}
                    placeholder="Szukaj zamówienia lub obszaru…" className={INPUT} />
            </div>
            <div className="max-h-[280px] overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
                {!wyniki.length && <div className="px-3 py-2 text-xs italic text-gray-500">Brak zamówień pasujących do „{q}”</div>}
                {wyniki.map((w, i) => {
                    const zazn = wybrane.includes(w.o.id);
                    const sep = !q.trim() && poprzZazn !== (selectedIds || []).includes(w.o.id);
                    if (sep) poprzZazn = (selectedIds || []).includes(w.o.id);
                    const brak = warnOf?.(w.o.id);
                    return (
                        <div key={w.o.id}>
                            {sep && <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">{poprzZazn ? 'Przypisane' : 'Pozostałe'}</div>}
                            <div role="option" aria-selected={zazn} data-akt={i === akt ? '1' : '0'}
                                onMouseDown={e => { e.preventDefault(); setAkt(i); przelacz(w.o.id); }}
                                className={`flex min-h-[38px] cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] ${i === akt ? 'bg-teal-500/15' : 'hover:bg-white/5'}`}>
                                <input type="checkbox" readOnly checked={zazn} tabIndex={-1} className="pointer-events-none accent-teal-500" />
                                <span className={`min-w-0 flex-1 ${w.o.closed ? 'text-gray-500' : 'text-gray-100'}`}>
                                    <Highlight text={w.o.name} hits={w.hitsName} />
                                    {brak && <span className="ml-1 text-[10px] text-amber-300" title="wymaga szkolenia, którego pracownik nie ma ważnego">⚠ {brak}</span>}
                                    {w.o.closed && <span className="ml-1 text-[10px] text-gray-500">zamknięte</span>}
                                </span>
                                <small className="shrink-0 text-[10.5px] text-gray-500"><Highlight text={w.o.area} hits={w.hitsArea} /></small>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center gap-2 border-t border-white/[.07] px-3 py-2 text-[11px] text-gray-500">
                wybrano {wybrane.length} z {orders.length}
                <button onClick={() => setWybrane([])} className="ml-auto px-1 py-2 text-teal-300 hover:underline">Wyczyść</button>
                <button onClick={() => onClose(wybrane)} className={BTN_PRIMARY}>Gotowe</button>
            </div>
        </div>,
        document.body,
    );
}
