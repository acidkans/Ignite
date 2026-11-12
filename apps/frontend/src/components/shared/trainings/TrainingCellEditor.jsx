import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addMonthsIso, fmtDay, fullName, todayIso, trainingsApi } from './trainingsShared';
import { BTN, BTN_PRIMARY, INPUT, LABEL } from './TrainingsUi';

// @anchor training-cell-editor — edycja inline jednej pary pracownik × typ szkolenia: popover pod
// klikniętą komórką (macierz, szuflada, widok Tabela). Pusta komórka = nowe szkolenie z dzisiejszą
// datą. „Ważne do" liczy się z okresu ważności typu, dopóki ktoś go nie nadpisze ręcznie.
// Enter = zapis, Esc = anuluj, klik obok = zapis tylko gdy coś zmieniono (przypadkowe otwarcie
// pustej komórki niczego nie tworzy).
export default function TrainingCellEditor({ user, type, anchor, onClose, onSaved, onError, onDelete }) {
    const ut = user.trainings.find(x => x.trainingTypeId === type.id) || null;
    const months = type.validityMonths || 0;
    const [completedAt, setCompletedAt] = useState(ut?.completedAt || todayIso());
    // null = „Ważne do" z okresu ważności typu; string = nadpisane ręcznie ('' = bezterminowe)
    const [validOverride, setValidOverride] = useState(() => {
        if (!ut) return null;
        const auto = months ? addMonthsIso(ut.completedAt, months) : null;
        return (ut.validUntil || null) === auto ? null : (ut.validUntil || '');
    });
    const [certificateNo, setCertificateNo] = useState(ut?.certificateNo || '');
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [pos, setPos] = useState({ left: 0, top: 0 });
    const boxRef = useRef(null);
    const firstRef = useRef(null);
    const validRef = useRef(null);
    const mountedRef = useRef(true);
    useEffect(() => () => { mountedRef.current = false; }, []);

    const wyliczone = months && completedAt ? addMonthsIso(completedAt, months) : '';
    const validUntil = validOverride ?? wyliczone;

    const zapisz = useCallback(async () => {
        if (busy) return;
        if (!completedAt) { setError('Podaj datę ukończenia.'); return; }
        if (validUntil && validUntil < completedAt) { setError('„Ważne do" nie może być wcześniej niż ukończenie.'); return; }
        if (!dirty && ut) { onClose(); return; }
        setBusy(true);
        setError('');
        try {
            const body = { userId: user.id, trainingTypeId: type.id, completedAt, certificateNo };
            if (validOverride !== null) body.validUntil = validOverride || null;
            await trainingsApi('/user-trainings', { method: 'PUT', body });
            onSaved(`${fullName(user)} · ${type.code || type.name}: ${ut ? 'zapisano' : 'dodano'}${validUntil ? `, ważne do ${fmtDay(validUntil)}` : ', bezterminowe'}`);
        } catch (e) {
            // klik w inną komórkę mógł już zamknąć ten popover — wtedy błąd idzie do toasta
            if (mountedRef.current) { setError(e.message); setBusy(false); } else onError?.(`Nie zapisano szkolenia: ${e.message}`);
        }
    }, [busy, completedAt, validUntil, validOverride, certificateNo, dirty, ut, user, type, onClose, onSaved, onError]);

    // klik obok: zapis tylko po zmianie, inaczej zwykłe zamknięcie
    const zapiszRef = useRef(zapisz);
    zapiszRef.current = zapisz;
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;

    const ustawPozycje = useCallback(() => {
        const r = anchor?.getBoundingClientRect();
        const box = boxRef.current;
        if (!r || !box) return;
        const w = box.offsetWidth, h = box.offsetHeight;
        const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
        const top = r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
        setPos({ left, top });
    }, [anchor]);

    useLayoutEffect(() => { ustawPozycje(); }, [ustawPozycje, error]);

    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    useEffect(() => { firstRef.current?.focus(); }, []);

    useEffect(() => {
        const onDown = (e) => {
            if (boxRef.current?.contains(e.target)) return;
            if (dirtyRef.current) zapiszRef.current(); else onCloseRef.current();
        };
        // Esc także gdy fokus wypadł z popovera (np. zniknął kliknięty przycisk)
        const onEsc = (e) => { if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); } };
        // przewijanie macierzy w bok / strony — popover jedzie za komórką zamiast znikać
        const onMove = () => ustawPozycje();
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onEsc);
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onEsc);
            window.removeEventListener('scroll', onMove, true);
            window.removeEventListener('resize', onMove);
        };
    }, [ustawPozycje]);

    const onKey = (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); zapisz(); }
    };
    const zmien = (setter) => (e) => { setter(e.target.value); setDirty(true); setError(''); };

    return createPortal(
        <div ref={boxRef} style={{ left: pos.left, top: pos.top }} onKeyDown={onKey}
            className="fixed z-[60] w-[min(340px,calc(100vw-16px))] rounded-lg border border-white/15 bg-[#0d1526] shadow-2xl"
            role="dialog" aria-label={`Szkolenie ${type.name} — ${fullName(user)}`}>
            <div className="border-b border-white/[.07] px-3 py-2">
                <div className="truncate text-[12px] font-bold text-gray-100" title={type.name}>{type.name}{type.code ? <span className="ml-1.5 font-normal text-gray-500">{type.code}</span> : null}</div>
                <div className="truncate text-[10.5px] text-gray-500">{fullName(user)} · {months ? `ważność ${months} mies.` : 'bezterminowe'}{!ut && <span className="ml-1 text-teal-300">· nowe</span>}</div>
            </div>
            <div className="grid gap-2.5 px-3 py-2.5">
                <div className="grid grid-cols-2 gap-2">
                    <label className={LABEL}>Ukończone
                        <input ref={firstRef} type="date" value={completedAt} onChange={zmien(setCompletedAt)} className={`${INPUT} px-2 text-[13px]`} />
                    </label>
                    <label className={LABEL}>Ważne do
                        <input ref={validRef} type="date" value={validUntil} onChange={zmien(setValidOverride)} className={`${INPUT} px-2 text-[13px]`} />
                    </label>
                </div>
                <div className="-mt-1 text-[10.5px] text-gray-500">
                    {validOverride !== null ? (<>
                        {validOverride ? 'nadpisane ręcznie' : 'puste = bezterminowe'}
                        <button type="button" onClick={() => { setValidOverride(null); setDirty(true); setError(''); validRef.current?.focus(); }} className="ml-1.5 text-teal-300 hover:underline">
                            {months ? `licz z okresu (${months} mies.)` : 'przywróć'}
                        </button>
                    </>) : months ? `liczone z okresu ważności — ${months} mies. od ukończenia` : 'typ bezterminowy — zostaw puste'}
                </div>
                <label className={LABEL}>Nr zaświadczenia
                    <input value={certificateNo} onChange={zmien(setCertificateNo)} placeholder="opcjonalnie" className={`${INPUT} text-[13px]`} />
                </label>
                {error && <div className="text-[11px] text-red-400">{error}</div>}
            </div>
            <div className="flex items-center gap-2 border-t border-white/[.07] px-3 py-2">
                {ut && <button type="button" onClick={() => onDelete(user, ut, type)} className="px-1 py-2 text-[11px] text-red-400 hover:underline">Usuń</button>}
                <button type="button" onClick={onClose} className={`${BTN} ml-auto`}>Anuluj</button>
                <button type="button" onClick={zapisz} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Zapisuję…' : ut ? 'Zapisz' : 'Dodaj'}</button>
            </div>
        </div>,
        document.body,
    );
}
