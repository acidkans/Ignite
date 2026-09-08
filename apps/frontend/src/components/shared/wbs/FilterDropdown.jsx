import { useState, useEffect, useRef } from 'react';

// @anchor filter-dropdown — filtr kolumny SŁOWNIKOWEJ: lista wartości obecnych w danych
// z polami wyboru, wiele naraz, warunek OR. Jeden komponent dla tabeli Budżet
// (`BudgetTable`) i zakładki Realizacja (`RealizationTab`) — filtr kolumny ma wyglądać
// i działać tak samo wszędzie tam, gdzie kolumna niesie wartość ze skończonego zbioru
// (typ, jednostka, status, dostawca, gałąź). Kolumny wolnotekstowe zostają przy polu
// tekstowym z frazami po `;`, bo tam zbiór wartości jest otwarty.
//
// `accent` niesie stronę widoku: niebieski to WYCENA (Budżet), turkus ZAKUP/REALIZACJA —
// ta sama semantyka koloru co w `DRAWER.accent`.
const ACCENT = {
    blue: { focus: 'focus:border-blue-500/40', box: 'accent-blue-500' },
    teal: { focus: 'focus:border-teal-500/40', box: 'accent-teal-500' },
};

export default function FilterDropdown({ options, selected, onChange, labelFor, accent = 'blue' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const a = ACCENT[accent] || ACCENT.blue;
    useEffect(() => {
        if (!open) return;
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [open]);
    const toggle = (val) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
    const summary = selected.length === 0 ? 'filtruj...' : `${selected.length} zazn.`;
    const base = `w-full bg-black/30 border border-white/10 rounded px-2 py-0.5 text-xs text-white placeholder-gray-700 outline-none ${a.focus}`;
    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`${base} text-left flex items-center justify-between ${selected.length ? 'text-white' : 'text-gray-700'}`}
            >
                <span className="truncate">{summary}</span>
                <span className="ml-1 text-gray-500 shrink-0">▾</span>
            </button>
            {open && (
                <div className="absolute left-0 top-full mt-1 z-30 min-w-full max-h-56 overflow-auto bg-[#0b0f17] border border-white/15 rounded shadow-xl py-1">
                    {selected.length > 0 && (
                        <button type="button" onClick={() => onChange([])} className="w-full text-left px-2 py-1 text-[11px] text-red-300/70 hover:bg-white/5">wyczyść</button>
                    )}
                    {options.length === 0 && <div className="px-2 py-1 text-[11px] text-gray-600">brak wartości</div>}
                    {options.map(opt => (
                        <label key={opt} className="flex items-center gap-2 px-2 py-1 text-xs text-white hover:bg-white/5 cursor-pointer">
                            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className={a.box} />
                            <span className="truncate">{labelFor ? labelFor(opt) : opt}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
