import { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { nazwaWyswietlana } from '../shared/realizacja/realizacjaShared';
import { dataIsoLokalna } from '../shared/wbs/milestoneApi';

// @anchor sidebar-branch-tree — drzewo gałęzi WBS zamówienia w lewym panelu aplikacji, pod aktywnym
// zamówieniem. Publikuje je zakładka „Realizacja" (`realizacja-branch-nav`) albo „Planowanie"
// (`planowanie-branch-nav`) — soczewka w `nav.lens`; na innych zakładkach go nie ma.
// Całe drzewo: gałęzie i pod nimi pozycje (`realizacja-nav-pozycje`). Klik w gałąź = zoom środka
// na gałąź, klik w pozycję = podgląd pozycji w środku, dwuklik w gałąź = krótka nazwa. Struktury się tu nie
// edytuje — po baseline jest zablokowana, a gałęzie dodaje się w Strukturze projektu.
// @anchor nav-z-indeksu — dane drzewa (gałęzie + pozycje) z indeksu `buildBranchIndex`, wspólne dla
// Planowania i Realizacji. Każda zakładka dokłada swoje pola: Realizacja `syg` (sygnały poddrzewa),
// Planowanie `koszt` (koszt planu poddrzewa). `syg` zawsze jest obiektem — drzewo czyta jego pola.
export function navZIndeksu(idx, rootId, { typLabel = (t) => t, galaz = () => ({}), pozycja = () => ({}) } = {}) {
    const galezie = idx.branches.filter(b => b.id !== rootId).map(b => ({
        id: b.id,
        parentId: b.parentId,
        name: b.name,
        shortName: b.shortName || null,
        pozycji: idx.leavesOfSubtree(b.id).length,
        // Klucz gałęzi wspólny dla wersji (`sourceWbsNodeId ?? id`) — zwinięcie w drzewie przeżywa zmianę zakładki.
        klucz: b.sourceWbsNodeId || b.id,
        syg: {},
        ...galaz(b),
    }));
    // @anchor nav-z-indeksu-milestony — milestone'y gałęzi (`idx.milestones`) też są wierszami drzewa (◆, `ms: true`),
    // ustawione między pozycjami wg kolejności rodzeństwa w gałęzi (`sortOrder` przodka będącego dzieckiem gałęzi),
    // bo ta kolejność wyznacza zależnych. Pozycje zagnieżdżone pod pozycją zostają za swoim rodzicem.
    const kluczKolejnosci = (n) => {
        let cur = n;
        const seen = new Set();
        while (cur && cur.parentId && cur.parentId !== (n.branchId || rootId) && idx.nodeById[cur.parentId] && !seen.has(cur.id)) {
            seen.add(cur.id);
            cur = idx.nodeById[cur.parentId];
        }
        return Number(cur?.sortOrder) || 0;
    };
    const wpis = (l, ms) => ({
        id: l.id,
        parentId: l.branchId || rootId,
        name: l.name,
        shortName: l.shortName || null,
        typ: ms ? 'Milestone' : typLabel(l.type),
        ms,
        syg: {},
        ...pozycja(l),
    });
    const pozycje = [...idx.leavesOfSubtree(rootId).map(l => [l, false]), ...(idx.milestones || []).map(m => [m, true])]
        .map(([n, ms], i) => ({ w: wpis(n, ms), k: kluczKolejnosci(n), i }))
        .sort((a, b) => a.k - b.k || a.i - b.i)
        .map(x => x.w);
    return { galezie, pozycje };
}

// @anchor sidebar-branch-lens — soczewka drzewa: `real` (Realizacja: sygnały, fuksja) albo `plan`
// (Planowanie: koszt planu gałęzi, zieleń). Ta sama gałąź, inny kąt.
const LENS = {
    real: { wybrana: 'bg-fuchsia-500/15 text-white ring-1 ring-inset ring-fuchsia-500/30', ramka: 'border-fuchsia-500/20', check: 'accent-fuchsia-500', pole: 'border-fuchsia-500/50' },
    plan: { wybrana: 'bg-emerald-500/15 text-white ring-1 ring-inset ring-emerald-500/30', ramka: 'border-emerald-500/20', check: 'accent-emerald-500', pole: 'border-emerald-500/50' },
};
const lensOf = (nav) => LENS[nav?.lens] || LENS.real;

// Koszt w znaczku: krótko (tys. / mln), pełna kwota w dymku.
const kosztKrotko = (v) => {
    const n = Number(v) || 0;
    if (n >= 1e6) return `${(n / 1e6).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} mln`;
    if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString('pl-PL')} tys.`;
    return Math.round(n).toLocaleString('pl-PL');
};

// @anchor sidebar-branch-toggles — przełączniki drzewa (sygnały, pełne nazwy) w wierszu zamówienia.
// „Sygnały” tylko w soczewce Realizacji — Planowanie ich nie liczy.
export function SidebarBranchToggles({ nav }) {
    const stop = (e) => e.stopPropagation();
    const l = lensOf(nav);
    return (
        <span className="flex shrink-0 items-center gap-2 text-[10px] font-normal text-gray-400" onClick={stop} onDoubleClick={stop}>
            {nav.lens !== 'plan' && (
                <label title="Pokaż tylko gałęzie i pozycje z blokerami, kolizjami dostaw, zagrożonymi milestone'ami, pytaniami albo zadaniami po terminie" className="flex cursor-pointer items-center gap-1">
                    <input type="checkbox" checked={!!nav.sygnaly} onChange={e => nav.onSygnaly(e.target.checked)} className={l.check} /> sygnały
                </label>
            )}
            <label title="Pełne nazwy zamiast krótkich" className="flex cursor-pointer items-center gap-1">
                <input type="checkbox" checked={!!nav.pelne} onChange={e => nav.onPelne(e.target.checked)} className={l.check} /> pełne
            </label>
        </span>
    );
}

export default function SidebarBranchTree({ nav, level = 0 }) {
    const plan = nav.lens === 'plan';
    const l = lensOf(nav);
    const tylkoSyg = !plan && !!nav.sygnaly;
    // @anchor sidebar-branch-tree-rozwiniete — drzewo domyślnie ROZWINIĘTE do pozycji (liście widać bez klikania);
    // strzałka zwija gałąź ręcznie (`zwiniete`, po kluczu gałęzi `g.klucz` — ten sam w Planowaniu i Realizacji),
    // ponowny klik ją rozwija.
    const [zwiniete, setZwiniete] = useState(() => new Set());
    const [edycja, setEdycja] = useState(null); // { id, value }
    // @anchor sidebar-branch-tree-nowy-ms — „+◆” przy gałęzi: nazwa + data, Enter zapisuje (`nav.onDodajMs`), Esc anuluje.
    const [nowyMs, setNowyMs] = useState(null); // { id, nazwa, data, blad, zapis }
    const [komunikat, setKomunikat] = useState(null); // { id, tekst }

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

    const maSyg = (g) => g.syg.blok > 0 || g.syg.pyt > 0 || g.syg.poTerminie > 0 || g.syg.kol > 0 || g.syg.ms > 0 || g.syg.kms > 0;
    const pad = (d) => ({ paddingLeft: `${(level + d) * 10 + 8}px` });
    const wybrany = nav.selectedId ?? nav.focusId;

    // @anchor sidebar-branch-tree-pozycja — wiersz pozycji (liścia): klik = podgląd w środku.
    const wierszPozycji = (p, d) => (
        <div key={p.id} onClick={() => nav.onPozycja?.(p.id)} title={`${p.name} · ${p.typ}`}
            className={`flex cursor-pointer items-center gap-1 rounded-md py-0.5 pr-1.5 text-[11.5px] transition-colors ${wybrany === p.id
                ? 'bg-sky-500/15 text-white ring-1 ring-inset ring-sky-500/30' : 'text-gray-500 hover:bg-white/5 hover:text-gray-200'}`}
            style={pad(d)}>
            <span className="flex size-4 shrink-0 items-center justify-center">{p.ms ? <span className="text-[10px] text-violet-300">◆</span> : <span className="size-1 rounded-full bg-gray-600" />}</span>
            <span className={`min-w-0 flex-1 ${nav.pelne ? 'whitespace-normal leading-tight' : 'truncate'}`}>{nazwaWyswietlana(p, nav.pelne)}</span>
            {p.syg.blok > 0 && <span title="Otwarte blokery" className="shrink-0 rounded bg-red-500/20 px-1 font-mono text-[10px] text-red-300">{p.syg.blok}</span>}
            {p.syg.kol > 0 && <span title="Kolizja dostawy" className="shrink-0 rounded bg-orange-500/20 px-1 font-mono text-[10px] text-orange-300">{p.syg.kol}K</span>}
            {p.syg.kms > 0 && <span title="Kolizja z milestone'em: start przed końcem milestone'a" className="shrink-0 rounded bg-violet-500/20 px-1 font-mono text-[10px] text-violet-300">◆K</span>}
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

    const otworzNowyMs = (g) => {
        setKomunikat(null);
        setNowyMs({ id: g.id, nazwa: '', data: nav.domyslnaDataMs?.(g.id) || dataIsoLokalna(new Date()), blad: '', zapis: false });
    };
    const zapiszNowyMs = async () => {
        if (!nowyMs || nowyMs.zapis) return;
        const nazwa = nowyMs.nazwa.trim();
        if (!nazwa) { setNowyMs(v => ({ ...v, blad: "Wpisz nazwę milestone'a" })); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nowyMs.data || '')) { setNowyMs(v => ({ ...v, blad: 'Wybierz datę' })); return; }
        const id = nowyMs.id;
        setNowyMs(v => ({ ...v, zapis: true, blad: '' }));
        try {
            const r = await nav.onDodajMs(id, nazwa, nowyMs.data);
            setNowyMs(null);
            setKomunikat({ id, tekst: `Dodano ◆ „${nazwa}” · zależnych pozycji: ${r?.zaleznych ?? 0}` });
            setTimeout(() => setKomunikat(k => (k?.id === id ? null : k)), 6000);
        } catch (e) {
            setNowyMs(v => (v ? { ...v, zapis: false, blad: e?.message || 'Nie udało się zapisać' } : v));
        }
    };
    const klawiszNowyMs = (e) => { e.stopPropagation(); if (e.key === 'Enter') zapiszNowyMs(); if (e.key === 'Escape') setNowyMs(null); };

    // Funkcja, nie komponent: komponent zdefiniowany w renderze przemontowywałby się przy każdym
    // naciśnięciu klawisza i pole krótkiej nazwy gubiłoby fokus.
    const wiersz = (g, d) => {
        const maDzieci = (dzieci[g.id] || []).length > 0 || (pozycjeOf[g.id] || []).length > 0;
        const kluczZw = g.klucz || g.id;
        const otwarte = !zwiniete.has(kluczZw);
        const wybrana = wybrany === g.id;
        return (
            <div key={g.id}>
                <div onClick={() => nav.onFocus(g.id)} title={g.name}
                    className={`group flex cursor-pointer items-center gap-1 rounded-md py-1 pr-1.5 text-[12px] transition-colors ${wybrana
                        ? l.wybrana : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                    style={pad(d)}>
                    <span onClick={(e) => {
                        e.stopPropagation();
                        setZwiniete(prev => { const n = new Set(prev); otwarte ? n.add(kluczZw) : n.delete(kluczZw); return n; });
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
                            className={`min-w-0 flex-1 rounded border ${l.pole} bg-black/40 px-1 text-[12px] text-white focus:outline-none`} />
                    ) : (
                        <span className={`min-w-0 flex-1 ${nav.pelne ? 'whitespace-normal leading-tight' : 'truncate'}`}
                            onDoubleClick={nav.canRename ? (e) => { e.stopPropagation(); setEdycja({ id: g.id, value: g.shortName || '' }); } : undefined}>
                            {nazwaWyswietlana(g, nav.pelne)}
                        </span>
                    )}
                    {/* @anchor sidebar-branch-tree-koszt — soczewka Planowania: koszt planu poddrzewa gałęzi */}
                    {plan && g.koszt != null && <span title={g.kosztTytul || undefined} className="shrink-0 font-mono text-[10px] text-gray-500">{kosztKrotko(g.koszt)}</span>}
                    {g.syg.blok > 0 && <span title="Otwarte blokery (rejestr blokerów i pilne wpisy czatu)" className="shrink-0 rounded bg-red-500/20 px-1 font-mono text-[10px] text-red-300">{g.syg.blok}</span>}
                    {g.syg.kol > 0 && <span title="Kolizje dostaw: dostawa za blisko startu robót" className="shrink-0 rounded bg-orange-500/20 px-1 font-mono text-[10px] text-orange-300">{g.syg.kol}K</span>}
                    {/* @anchor sidebar-branch-tree-ms — zagrożone milestone'y gałęzi (poślizg, prognoza z blokerów, kolizja) */}
                    {(g.syg.ms > 0 || g.syg.kms > 0) && <span title={`Zagrożone milestone'y: ${g.syg.ms}${g.syg.kms ? ` · pozycje w kolizji z milestone'em: ${g.syg.kms}` : ''}`} className="shrink-0 rounded bg-violet-500/20 px-1 font-mono text-[10px] text-violet-300">◆{g.syg.ms || ''}</span>}
                    {g.syg.pyt > 0 && <span title="Pytania bez odpowiedzi" className="shrink-0 rounded bg-amber-500/20 px-1 font-mono text-[10px] text-amber-300">{g.syg.pyt}?</span>}
                    {g.syg.poTerminie > 0 && <span title="Zadania po terminie" className="size-1.5 shrink-0 rounded-full bg-red-400" />}
                    {nav.onDodajMs && (
                        <button onClick={(e) => { e.stopPropagation(); otworzNowyMs(g); }} title="Dodaj milestone w tej gałęzi"
                            className={`shrink-0 rounded px-1 text-[10px] text-violet-300 hover:bg-violet-500/20 ${wybrana ? '' : 'hidden group-hover:inline'}`}>+◆</button>
                    )}
                </div>
                {nowyMs?.id === g.id && (
                    <div onClick={e => e.stopPropagation()} className="my-0.5 flex flex-col gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 p-1.5"
                        style={{ marginLeft: `${(level + d + 1) * 10 + 8}px`, marginRight: 6 }}>
                        <div className="flex items-center gap-1">
                            <span className="text-[11px] text-violet-300">◆</span>
                            <input autoFocus value={nowyMs.nazwa} placeholder="Nazwa milestone'a" disabled={nowyMs.zapis}
                                onChange={e => setNowyMs(v => ({ ...v, nazwa: e.target.value, blad: '' }))} onKeyDown={klawiszNowyMs}
                                className="min-w-0 flex-1 rounded border border-violet-500/40 bg-black/40 px-1 text-[12px] text-white focus:outline-none" />
                        </div>
                        <div className="flex items-center gap-1">
                            <input type="date" value={nowyMs.data} disabled={nowyMs.zapis}
                                onChange={e => setNowyMs(v => ({ ...v, data: e.target.value, blad: '' }))} onKeyDown={klawiszNowyMs}
                                className="min-w-0 flex-1 rounded border border-violet-500/40 bg-black/40 px-1 text-[11px] text-white [color-scheme:dark] focus:outline-none" />
                            <button onClick={zapiszNowyMs} disabled={nowyMs.zapis} className="rounded bg-violet-500/30 px-1.5 text-[11px] text-violet-100 hover:bg-violet-500/50">{nowyMs.zapis ? '…' : 'Dodaj'}</button>
                            <button onClick={() => setNowyMs(null)} title="Anuluj (Esc)" className="rounded px-1 text-[11px] text-gray-400 hover:bg-white/10 hover:text-white">✕</button>
                        </div>
                        {nowyMs.blad && <div className="text-[10px] text-red-300">{nowyMs.blad}</div>}
                    </div>
                )}
                {komunikat?.id === g.id && <div className="py-0.5 pr-1.5 text-[10.5px] text-emerald-300" style={pad(d + 1)}>{komunikat.tekst}</div>}
                {maDzieci && otwarte && (dzieci[g.id] || [])
                    .filter(c => !tylkoSyg || maSyg(c))
                    .map(c => wiersz(c, d + 1))}
                {otwarte && (pozycjeOf[g.id] || [])
                    .filter(p => !tylkoSyg || maSyg(p))
                    .map(p => wierszPozycji(p, d + 1))}
            </div>
        );
    };

    // Zawsze całe drzewo od korzenia, rozwinięte do pozycji (`sidebar-branch-tree-rozwiniete`).
    const widok = dzieci[nav.rootId] || [];

    return (
        <div className={`mt-0.5 mb-1 border-l ${l.ramka} ml-3`}>
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
