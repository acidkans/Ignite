// Waluta pojedynczego ZAKUPU, gdy faktura przyszła w innej walucie niż waluta zamówienia
// („165 € transport" w zamówieniu w złotych). Kwotę wpisuje się w walucie faktury, a serwer
// przelicza ją kursem NBP z dnia roboczego przed datą zdarzenia i zapisuje oryginał obok
// (`LeafActual.currency`, `unitCostOriginal`, `exchangeRate`, `rateDate`) — nic nie ginie
// w komentarzu, a sumy realizacji liczą się dalej w walucie zamówienia.
import { useEffect, useRef, useState } from 'react';
import { PURCHASE_CURRENCIES, currencyCode, currencySymbol, fetchCrossRate, useOrderCurrency } from '../../../utils/currency';

const fmt2 = (v) => Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRate = (v) => Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 4 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');

// @anchor currency-pill — „fistaszek" waluty przy koszcie jednostkowym; inna niż waluta zamówienia
// świeci się na bursztynowo, żeby obca kwota nie umknęła przy przeglądaniu wpisów. Lista w ciemnym
// stylu systemowych dropdownów (jak `SupplierPicker dark`), nie natywny <select> z białymi opcjami.
export function CurrencyPill({ value, onChange, disabled }) {
    const orderCur = useOrderCurrency();
    const cur = value || orderCur;
    const obca = cur !== orderCur;
    const [open, setOpen] = useState(false);
    const boxRef = useRef(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);
    const wybierz = (c) => { setOpen(false); if (c !== cur) onChange(c); };
    return (
        <div ref={boxRef} className="relative shrink-0">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
                title={obca ? `Kwota w ${cur} — przeliczana na ${orderCur} kursem NBP` : 'Waluta zakupu — zmień, gdy faktura jest w innej walucie'}
                className={`rounded-full border px-1.5 text-[10px] font-bold leading-5 outline-none transition-colors ${obca
                    ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                    : 'border-white/10 bg-white/5 text-gray-500 hover:text-gray-300'} disabled:cursor-default`}
            >
                {cur}
            </button>
            {open && (
                <div className="absolute right-0 z-50 mt-1 min-w-[150px] overflow-hidden rounded-lg border border-white/10 bg-[#0f1117] shadow-lg">
                    {PURCHASE_CURRENCIES.map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => wybierz(c)}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-white/5 ${c === cur ? 'bg-teal-500/10' : ''}`}
                        >
                            <span className="w-8 font-bold">{c}</span>
                            <span className="text-gray-500">{currencySymbol(c)}</span>
                            {c === orderCur && <span className="ml-auto text-[10px] text-gray-500">zamówienie</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// @anchor use-rate-preview — kurs NBP do podglądu w formularzu (ten sam liczy potem serwer przy zapisie)
export function useRatePreview(cur, date) {
    const orderCur = useOrderCurrency();
    const [rate, setRate] = useState(null);
    useEffect(() => {
        if (!cur || cur === orderCur) { setRate(null); return; }
        let live = true;
        setRate(undefined);
        fetchCrossRate(cur, orderCur, date || undefined).then((r) => { if (live) setRate(r); });
        return () => { live = false; };
    }, [cur, orderCur, date]);
    return rate; // null = ta sama waluta / brak kursu, undefined = ładuje się
}

// Kurs zapisujemy jako „ile waluty zamówienia za 1 jednostkę waluty zakupu". Gdy wychodzi < 1
// (zakup w PLN, zamówienie w EUR: 0,2279), pokazujemy odwrotnie — „1 € = 4,3887 zł" czyta się od razu.
const kursTekst = (cur, rate) => (rate >= 1
    ? `1 ${currencySymbol(cur)} = ${fmtRate(rate)} ${currencySymbol()}`
    : `1 ${currencySymbol()} = ${fmtRate(1 / rate)} ${currencySymbol(cur)}`);

// @anchor converted-note — linijka pod kwotą obcą: ile to w walucie zamówienia i jakim kursem
export function ConvertedNote({ amount, cur, rate, rateDate, manual = false }) {
    if (!cur || cur === currencyCode()) return null;
    if (rate === undefined) return <div className="mt-0.5 text-[10px] text-gray-500">kurs NBP…</div>;
    if (!rate) return <div className="mt-0.5 text-[10px] text-red-300">brak kursu NBP {cur}</div>;
    const n = Number(amount);
    return (
        <div className="text-[11px] text-amber-300/80"
            title={manual ? 'Kurs wpisany ręcznie' : `Kurs średni NBP z ${fmtDay(rateDate)} (dzień roboczy przed datą zdarzenia)`}>
            {Number.isFinite(n) ? `= ${fmt2(n * rate)} ${currencySymbol()} · ` : ''}{kursTekst(cur, rate)}{manual ? ' (ręczny)' : rateDate ? ` (NBP ${fmtDay(rateDate)})` : ''}
        </div>
    );
}
