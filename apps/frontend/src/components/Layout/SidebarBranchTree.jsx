import { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { nazwaWyswietlana } from '../shared/realizacja/realizacjaShared';

// @anchor sidebar-branch-tree — drzewo gałęzi WBS zamówienia w lewym panelu aplikacji, pod aktywnym
// zamówieniem. Publikuje je zakładka „Realizacja" (`realizacja-branch-nav`); poza nią go nie ma.
// Całe drzewo: gałęzie i pod nimi pozycje (`realizacja-nav-pozycje`). Klik w gałąź = zoom środka
// na gałąź, klik w pozycję = podgląd pozycji w środku, dwuklik w gałąź = krótka nazwa. Struktury się tu nie
// edytuje — po baseline jest zablokowana, a gałęzie dodaje się w Strukturze projektu.
// @anchor sidebar-branch-toggles — przełączniki drzewa (sygnały, pełne nazwy) w wierszu zamówienia.
export function SidebarBranchToggles({ nav }) {
    const stop = (e) => e.stopPropagation();
    return (
        <span className="flex shrink-0 items-center gap-2 text-[10px] font-normal text-gray-400" onClick={stop} onDoubleClick={stop}>
            <label title="Pokaż tylko gałęzie i pozycje z blokerami, kolizjami dostaw, pytaniami albo zadaniami po terminie" className="flex cursor-pointer items-center gap-1">
                <input type="checkbox" checked={!!nav.sygnaly} onChange={e => nav.onSygnaly(e.target.checked)} className="accent-fuchsia-500" /> sygnały
            </label>
            <label title="Pełne nazwy zamiast krótkich" className="flex cursor-pointer items-center gap-1">
                <input type="checkbox" checked={!!nav.pelne} onChange={e => nav.onPelne(e.target.checked)} className="accent-fuchsia-500" /> pełne
            </label>
        </span>
    );
}

export default function SidebarBranchTree({ nav, level = 0 }) {
    const tylkoSyg = !!nav.sygnaly;
    const [rozwiniete, setRozwiniete] = useState(() => new Set());
    const [zwiniete, setZwiniete] = useState(() => new Set());
    const [edycja, setEdycja] = useState(null); // { id, value }

    const { byId, dzieci, pozycjeOf } = useMemo(() => {
        const byId = Object.fromEntries(nav.galezie.map(g => [g.id, g]));
        const dzieci = {};
        for (const g of nav.galezie) (dzieci[g.parentId] || (dzieci[g.parentId] = [])).push(g);
        const pozycjeOf = {};
        for (const p of nav.pozycje || []) (pozycjeOf[p.parentId] || (pozycjeOf[p.parentId] = [])).push(p);
        return { byId, dzieci, pozycjeOf };
    }, [nav.galezie, nav.pozycje]);

    const focus = nav.focusId;
    const sciezka = useMemo(() => {
        const out = [];
        let id = focus;
        const seen = new Set();
        while (id && byId[id] && !seen.has(id)) { seen.add(id); out.unshift(byId[id]); id = byId[id].parentId; }
        return out;
    }, [byId, focus]);

    const maSyg = (g) => g.syg.blok > 0 || g.syg.pyt > 0 || g.syg.poTerminie > 0 || g.syg.kol > 0;
    const pad = (d) => ({ paddingLeft: `${(level + d) * 10 + 8}px` });
    const wybrany = nav.selectedId ?? nav.focusId;

    // @anchor sidebar-branch-tree-pozycja — wiersz pozycji (liścia): klik = podgląd w środku.
    const wierszPozycji = (p, d) => (
        <div key={p.id} onClick={() => nav.onPozycja?.(p.id)} title={`${p.name} · ${p.typ}`}
            className={`flex cursor-pointer items-center gap-1 rounded-md py-0.5 pr-1.5 text-[11.5px] transition-colors ${wybrany === p.id
                ? 'bg-sky-500/15 text-white ring-1 ring-inset ring-sky-500/30' : 'text-gray-500 hover:bg-white/5 hover:text-gray-200'}`}
            style={pad(d)}>
            <span className="flex size-4 shrink-0 items-center justify-center"><span className="size-1 rounded-full bg-gray-600" /></span>
            <span className={`min-w-0 flex-1 ${nav.pelne ? 'whitespace-normal leading-tight' : 'truncate'}`}>{nazwaWyswietlana(p, nav.pelne)}</span>
            {p.syg.blok > 0 && <span title="Otwarte blokery" className="shrink-0 rounded bg-red-500/20 px-1 font-mono text-[10px] text-red-300">{p.syg.blok}</span>}
            {p.syg.kol > 0 && <span title="Kolizja dostawy" className="shrink-0 rounded bg-orange-500/20 px-1 font-mono text-[10px] text-orange-300">{p.syg.kol}K</span>}
            {p.syg.pyt > 0 && <span title="Pytania bez odpowiedzi" className="shrink-0 rounded bg-amber-500/20 px-1 font-mono text-[10px] text-amber-300">{p.syg.pyt}?</span>}
            {p.syg.poTerminie > 0 && <span title="Zadania po terminie" className="size-1.5 shrink-0 rounded-full bg-red-400" />}
        </div>
    );

    const zapiszEdycje = () => {
        if (!edycja) return;
        const g = byId[edycja.id];
        if (g && (edycja.value.trim() || null) !== (g.shortName || null)) nav.onRename(edycja.id, edycja.value);
        setEdycja(null);
    };

    // Funkcja, nie komponent: komponent zdefiniowany w renderze przemontowywałby się przy każdym
    // naciśnięciu klawisza i pole krótkiej nazwy gubiłoby fokus.
    const wiersz = (g, d) => {
        const maDzieci = (dzieci[g.id] || []).length > 0 || (pozycjeOf[g.id] || []).length > 0;
        const otwarte = !zwiniete.has(g.id) && (rozwiniete.has(g.id) || sciezka.some(s => s.id === g.id));
        const wybrana = wybrany === g.id;
        return (
            <div key={g.id}>
                <div onClick={() => nav.onFocus(g.id)} title={g.name}
                    className={`group flex cursor-pointer items-center gap-1 rounded-md py-1 pr-1.5 text-[12px] transition-colors ${wybrana
                        ? 'bg-fuchsia-500/15 text-white ring-1 ring-inset ring-fuchsia-500/30' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                    style={pad(d)}>
                    <span onClick={(e) => {
                        e.stopPropagation();
                        const przelacz = (set, dodaj) => set(prev => { const n = new Set(prev); dodaj ? n.add(g.id) : n.delete(g.id); return n; });
                        przelacz(setRozwiniete, !otwarte);
                        przelacz(setZwiniete, otwarte);
                    }} className={`flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-white/10 ${maDzieci ? '' : 'invisible'}`}>
                        <ChevronRight size={10} className={otwarte ? 'rotate-90' : ''} />
                    </span>
                    {edycja?.id === g.id ? (
                        <input autoFocus value={edycja.value}
                            onChange={e => setEdycja({ id: g.id, value: e.target.value })}
                            onBlur={zapiszEdycje}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') zapiszEdycje(); if (e.key === 'Escape') setEdycja(null); }}
                            onClick={e => e.stopPropagation()}
                            placeholder={nazwaWyswietlana({ name: g.name })}
                            className="min-w-0 flex-1 rounded border border-fuchsia-500/50 bg-black/40 px-1 text-[12px] text-white focus:outline-none" />
                    ) : (
                        <span className={`min-w-0 flex-1 ${nav.pelne ? 'whitespace-normal leading-tight' : 'truncate'}`}
                            onDoubleClick={nav.canRename ? (e) => { e.stopPropagation(); setEdycja({ id: g.id, value: g.shortName || '' }); } : undefined}>
                            {nazwaWyswietlana(g, nav.pelne)}
                        </span>
                    )}
                    {g.syg.blok > 0 && <span title="Otwarte blokery (rejestr blokerów i pilne wpisy czatu)" className="shrink-0 rounded bg-red-500/20 px-1 font-mono text-[10px] text-red-300">{g.syg.blok}</span>}
                    {g.syg.kol > 0 && <span title="Kolizje dostaw: dostawa za blisko startu robót" className="shrink-0 rounded bg-orange-500/20 px-1 font-mono text-[10px] text-orange-300">{g.syg.kol}K</span>}
                    {g.syg.pyt > 0 && <span title="Pytania bez odpowiedzi" className="shrink-0 rounded bg-amber-500/20 px-1 font-mono text-[10px] text-amber-300">{g.syg.pyt}?</span>}
                    {g.syg.poTerminie > 0 && <span title="Zadania po terminie" className="size-1.5 shrink-0 rounded-full bg-red-400" />}
                </div>
                {maDzieci && otwarte && (dzieci[g.id] || [])
                    .filter(c => !tylkoSyg || maSyg(c))
                    .map(c => wiersz(c, d + 1))}
                {otwarte && (pozycjeOf[g.id] || [])
                    .filter(p => !tylkoSyg || maSyg(p))
                    .map(p => wierszPozycji(p, d + 1))}
            </div>
        );
    };

    // Zawsze całe drzewo od korzenia; ścieżka do wybranej gałęzi rozwija się sama (`sciezka`).
    const widok = dzieci[nav.rootId] || [];

    return (
        <div className="mt-0.5 mb-1 border-l border-fuchsia-500/20 ml-3">
            {focus && byId[focus] && (
                <div className="flex flex-wrap items-center gap-x-1 px-2 pb-1 text-[11px]">
                    <button onClick={() => nav.onFocus(nav.rootId)} className="text-sky-300/80 hover:text-sky-200">↑ całe zamówienie</button>
                    {sciezka.slice(0, -1).map(s => (
                        <span key={s.id} className="flex items-center gap-1">
                            <span className="text-gray-600">›</span>
                            <button onClick={() => nav.onFocus(s.id)} title={s.name} className="max-w-[120px] truncate text-sky-300/80 hover:text-sky-200">{nazwaWyswietlana(s)}</button>
                        </span>
                    ))}
                </div>
            )}
            {widok.filter(g => !tylkoSyg || maSyg(g) || sciezka.some(s => s.id === g.id)).map(g => wiersz(g, 0))}
            {(pozycjeOf[nav.rootId] || []).filter(p => !tylkoSyg || maSyg(p)).map(p => wierszPozycji(p, 0))}
            {!widok.length && !(pozycjeOf[nav.rootId] || []).length && <p className="px-3 py-1 text-[11px] italic text-gray-600">Zamówienie nie ma gałęzi.</p>}
        </div>
    );
}
