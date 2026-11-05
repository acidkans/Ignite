// Harmonogram — jeden widok planowania robót zamiast Gantta (Planowanie) i Lookahead (Realizacja).
// Zbudowany na bazie Lookahead: wiersz = pozycja z paskiem robót (`planOd`..`planDo`, `planDo` =
// ostatni dzień), pogrupowana w gałęzie. Zakres osi: 14 dni / miesiąc / całość. Warstwy: dni wolne
// (weekendy + polskie święta), dostawy (romby z wpisów FORECAST), gotowość (MAT/PYT/BLK), kolizje,
// start/koniec projektu, dziś. Zapis tylko przez `savePlanDates` → `WbsNode.ganttStart/ganttEnd`.
// Przesunięcie paska zachowuje liczbę dni roboczych (jak dawny Gantt), chyba że gałąź pracuje
// w dni wolne. `onDurationChange` (tylko Planowanie) dostaje nową liczbę dni roboczych po
// rozciągnięciu paska pracy liczonej w dniach — tam zmienia się ilość pozycji.
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    DAY_MS, isNonWorkingDay, isPolishHoliday, advanceToWorkingDay, retreatToWorkingDay, addWorkingDays,
    buildExcelTimeline, toExcelUtcDate, isMilestoneType,
    pierwszyDozwolonyDzien, zalezniMilestone, przesunZaleznych, roznicaDniRoboczych,
} from './harmonogramCzas';
import './harmonogram.css';

const DNI_TYG = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const MIES_KR = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const LABEL_W = 280;
const ROW_H = 44;
const GRP_H = 28;
const HEAD_H = 42;

const dzien0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dodajDni = (d, n) => { const x = dzien0(d); x.setDate(x.getDate() + n); return x; };
const roznicaDni = (a, b) => Math.round((dzien0(a) - dzien0(b)) / DAY_MS);
// Rok dopisywany tylko poza bieżącym rokiem — długie projekty przechodzą przez kilka lat.
const dzienMies = (d) => {
    const x = new Date(d);
    const r = x.getFullYear() !== new Date().getFullYear() ? `.${String(x.getFullYear()).slice(2)}` : '';
    return `${x.getDate()}.${String(x.getMonth() + 1).padStart(2, '0')}${r}`;
};
const doInputu = (d) => { const x = dzien0(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const esc = (s) => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

// @anchor harmonogram-dni-robocze — liczba dni roboczych w zakresie od..ost (oba włącznie).
export const dniRobocze = (od, ost, wow = false) => {
    const a = dzien0(od), b = dzien0(ost);
    if (b < a) return 0;
    if (wow) return roznicaDni(b, a) + 1;
    let n = 0;
    for (const c = new Date(a); c <= b; c.setDate(c.getDate() + 1)) if (!isNonWorkingDay(c)) n++;
    return n;
};

// @anchor harmonogram-przesun — nowe daty paska po przeciągnięciu o `delta` dni.
// move: zachowuje dni robocze (start ląduje na dniu roboczym w stronę ruchu); l/r: zmienia jedną krawędź.
export function przesunPasek(l, tryb, delta, wow) {
    let od = dzien0(l.planOd), ost = dzien0(l.planDo);
    if (tryb === 'move') {
        if (wow) return { od: dodajDni(od, delta), ost: dodajDni(ost, delta) };
        const ile = Math.max(1, dniRobocze(od, ost));
        let ns = dodajDni(od, delta);
        ns = delta < 0 ? retreatToWorkingDay(ns) : advanceToWorkingDay(ns);
        return { od: ns, ost: dodajDni(addWorkingDays(ns, ile), -1) };
    }
    if (tryb === 'l') {
        od = dodajDni(od, delta);
        if (!wow) od = delta < 0 ? retreatToWorkingDay(od) : advanceToWorkingDay(od);
        if (od > ost) od = ost;
    } else {
        ost = dodajDni(ost, delta);
        if (!wow) ost = delta < 0 ? retreatToWorkingDay(ost) : advanceToWorkingDay(ost);
        if (ost < od) ost = od;
    }
    return { od, ost };
}

// @anchor harmonogram-przesun-milestone — przesunięcie milestone'a (romb albo okno): okno jedzie
// w dniach kalendarzowych (termin to termin), 1-dniowy romb ląduje na dniu roboczym w stronę ruchu.
// Rozciąganie (l/r) tylko dla okna — 1-dniowy romb nie ma krawędzi.
export function przesunMilestone(l, tryb, delta, wow) {
    let od = dzien0(l.planOd), ost = dzien0(l.planDo);
    const dl = Math.max(0, roznicaDni(ost, od));
    if (tryb === 'move') {
        od = dodajDni(od, delta);
        if (!wow && dl === 0) od = delta < 0 ? retreatToWorkingDay(od) : advanceToWorkingDay(od);
        return { od, ost: dodajDni(od, dl) };
    }
    if (tryb === 'l') { od = dodajDni(od, delta); if (od > ost) od = ost; }
    else { ost = dodajDni(ost, delta); if (ost < od) ost = od; }
    return { od, ost };
}
const jestMs = (l) => isMilestoneType(l?.type);
const przesunWg = (l, tryb, delta, wow) => (jestMs(l) ? przesunMilestone(l, tryb, delta, wow) : przesunPasek(l, tryb, delta, wow));

const ZAKRESY = [['14', '14 dni'], ['miesiac', 'Miesiąc'], ['calosc', 'Całość']];
const czytaj = (k, d) => { try { return (k && sessionStorage.getItem(k)) || d; } catch { return d; } };
const zapiszSS = (k, v) => { try { if (k) sessionStorage.setItem(k, v); } catch { /* tryb prywatny */ } };

const domyslnyOpis = () => ({ klasa: 'b-work', tekst: '' });

// @anchor harmonogram — komponent; props opisane w nagłówku pliku i przy `grupy`.
// `grupy`: [{ galaz: węzeł|null, liscie: [węzeł z planOd/planDo, type, name, shortName?, depth?, _canUpdateDuration?] }]
export default function Harmonogram({
    grupy = [], nazwa = (n) => n?.name || '', maPasek = (l) => !!l.planOd, opisPaska = domyslnyOpis,
    actualsOf = null, czyDostawa = null, gotowosc = null, GotowoscChipy = null, kolizje = [],
    canEdit = false, savePlanDates = null, onDurationChange = null,
    onZoom = null, onOtworz = null,
    domyslnyZakres = '14', zakresKey = null, projectStart = null, projectEnd = null,
    nazwaProjektu = '', onApi = null, pokazWciecia = false,
    // @anchor harmonogram-ms-propsy — reguły milestone'ów (M3): `msZaleznosc` = { [id]: msId }
    // (`zaleznyOdMilestone`), `msWezly` = { [id]: { type, name, planOd, planDo, nieruchomy } } dla WSZYSTKICH
    // pozycji z datami (także spoza zoomu), `savePlanDatesBatch([{ id, od, ost }])` = zapis zbiorczy.
    msZaleznosc = null, msWezly = null, savePlanDatesBatch = null,
}) {
    const [zakres, setZakresState] = useState(() => czytaj(zakresKey, domyslnyZakres));
    const setZakres = (z) => { setZakresState(z); zapiszSS(zakresKey, z); setPrzesun(0); };
    // @anchor harmonogram-przesun-okna — przesunięcie okna: dni (14 dni) albo miesiące (Miesiąc).
    const [przesun, setPrzesun] = useState(0);
    const [wszystkie, setWszystkie] = useState(true);
    const [pokazDostawy, setPokazDostawy] = useState(true);
    // @anchor harmonogram-praca-w-wolne — gałęzie pracujące w weekendy i święta (stan sesji, jak w dawnym Gantcie).
    const [wow, setWow] = useState({});
    const [edycjaDat, setEdycjaDat] = useState(null);
    const [info, setInfo] = useState(null);
    useEffect(() => { if (!info) return; const t = setTimeout(() => setInfo(null), 4500); return () => clearTimeout(t); }, [info]);

    const wowOf = useCallback((galazId) => !!wow[galazId], [wow]);
    const dzis = useMemo(() => dzien0(new Date()), []);

    // Wszystkie pozycje z datami — do zakresu „Całość" i eksportów.
    const wszystkiePozycje = useMemo(() => grupy.flatMap(g => g.liscie.map(l => ({ l, galazId: g.galaz?.id || null }))), [grupy]);

    const dostawyOf = useCallback((l) => {
        if (!actualsOf || !czyDostawa) return [];
        return actualsOf(l).filter(e => czyDostawa(l, e) && e.entryDate);
    }, [actualsOf, czyDostawa]);

    // @anchor harmonogram-szerokosc — dostępna szerokość osi; dzień rozciąga się do pełnej szerokości jak w Lookahead.
    const hgRef = useRef(null);
    const [szerOsi, setSzerOsi] = useState(1100);
    useEffect(() => {
        const el = hgRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([e]) => { const w = Math.floor(e.contentRect.width - LABEL_W - 18); if (w > 200) setSzerOsi(w); });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // @anchor harmonogram-okno — początek osi, liczba dni i szerokość dnia w px dla zakresu.
    const { start, ileDni, dzienPx } = useMemo(() => {
        if (zakres === 'miesiac') {
            const s = new Date(dzis.getFullYear(), dzis.getMonth() + przesun, 1);
            const n = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
            return { start: s, ileDni: n, dzienPx: Math.max(26, szerOsi / n) };
        }
        if (zakres === 'calosc') {
            let lo = null, hi = null;
            const wez = (d) => { if (!d) return; const x = dzien0(d); if (isNaN(x)) return; if (!lo || x < lo) lo = x; if (!hi || x > hi) hi = x; };
            for (const { l } of wszystkiePozycje) {
                if (maPasek(l)) { wez(l.planOd); wez(l.planDo); }
                for (const e of dostawyOf(l)) wez(e.entryDate);
            }
            for (const g of grupy) for (const m of g.milestony || []) { wez(m.planOd); wez(m.planDo); }
            wez(projectStart); wez(projectEnd);
            if (!lo) { lo = dzis; hi = dodajDni(dzis, 30); }
            const s = dodajDni(lo, -2);
            const n = Math.max(14, roznicaDni(hi, s) + 4);
            return { start: s, ileDni: n, dzienPx: Math.max(1.2, Math.min(28, szerOsi / n)) };
        }
        return { start: dodajDni(dzis, przesun), ileDni: 14, dzienPx: Math.max(44, szerOsi / 14) };
    }, [zakres, przesun, dzis, wszystkiePozycje, grupy, maPasek, dostawyOf, projectStart, projectEnd, szerOsi]);

    const dni = useMemo(() => Array.from({ length: ileDni }, (_, i) => dodajDni(start, i)), [start, ileDni]);
    const szer = ileDni * dzienPx;
    const idx = useCallback((d) => (d ? roznicaDni(d, start) : null), [start]);
    const pokazDzien = dzienPx >= 18;
    const pokazTydz = !pokazDzien && dzienPx * 7 >= 30;

    // ─── przeciąganie ───────────────────────────────────────────────────────
    // @anchor harmonogram-drag — { l, galazId, tryb: 'move'|'l'|'r', x0, delta } podczas ciągnięcia.
    const [drag, setDrag] = useState(null);
    const dragRef = useRef(null);
    dragRef.current = drag;
    // Klik po puszczeniu przeciągniętego rombu nie otwiera szczegółów.
    const poDragu = useRef(false);

    // @anchor harmonogram-zapisz — zapis dat z regułami milestone'ów: start zależnego nie wcześniej niż
    // pierwszy dzień roboczy po jego milestonie (dociągnięcie + komunikat), a przesunięcie milestone'a
    // przesuwa zależnych o tyle samo dni roboczych („zachowaj odstęp”) jednym zapisem zbiorczym.
    // @anchor harmonogram-min-od — pierwszy dozwolony start pozycji (null = nie zależy od milestone'a).
    const minOdOf = useCallback((l, galazId) => {
        const ms = msWezly?.[msZaleznosc?.[l.id]];
        return ms?.planDo ? pierwszyDozwolonyDzien(ms.planDo, wowOf(galazId)) : null;
    }, [msWezly, msZaleznosc, wowOf]);

    const zapisz = useCallback(async (l, galazId, od, ost, tryb) => {
        if (!savePlanDates) return;
        const w = wowOf(galazId);
        const komunikaty = [];
        const min = tryb !== 'r' ? minOdOf(l, galazId) : null;
        if (min && dzien0(od) < min) {
            if (tryb === 'l') od = min;
            else ({ od, ost } = przesunWg({ ...l, planOd: od, planDo: ost }, 'move', roznicaDni(min, od), w));
            if (dzien0(ost) < dzien0(od)) ost = od;
            const ms = msWezly?.[msZaleznosc?.[l.id]];
            komunikaty.push(<>Start <b>{nazwa(l)}</b> dociągnięty do <b>{dzienMies(od)}</b> — pierwszy dzień roboczy po milestonie „{ms?.name || 'milestone'}”.</>);
        }
        let zalezni = [];
        let stoja = 0;
        if (jestMs(l) && msZaleznosc && msWezly && tryb !== 'l') {
            const delta = roznicaDniRoboczych(l.planDo, ost);
            const ids = zalezniMilestone(msZaleznosc, l.id);
            zalezni = Object.entries(przesunZaleznych(msWezly, ids, delta)).map(([id, p]) => ({ id, od: p.od, ost: p.ost }));
            stoja = delta ? ids.filter(id => msWezly[id]?.nieruchomy && msWezly[id]?.planOd).length : 0;
            if (zalezni.length) komunikaty.push(<>Milestone <b>{nazwa(l)}</b>: {zalezni.length} zależn{zalezni.length === 1 ? 'a pozycja przesunięta' : 'ych przesuniętych'} o <b>{delta > 0 ? '+' : ''}{delta}</b> dni rob.</>);
            if (stoja) komunikaty.push(<span className="hg-info-bad">{stoja} rozpoczęt{stoja === 1 ? 'a pozycja zostaje' : 'ych zostaje'} na miejscu — kolizja z milestone'em (na czerwono).</span>);
        }
        try {
            // Milestone zawsze zbiorczo, nawet bez zależnych — wpis AuditLog odtwarza potem baseline.
            if ((zalezni.length || jestMs(l)) && savePlanDatesBatch) await savePlanDatesBatch([{ id: l.id, od, ost }, ...zalezni]);
            else {
                await savePlanDates(l.id, od, ost);
                for (const z of zalezni) await savePlanDates(z.id, z.od, z.ost);
            }
        } catch (e) {
            console.error('[Harmonogram] zapis dat:', e);
            alert('Nie udało się zapisać dat robót');
            return;
        }
        if (onDurationChange && l._canUpdateDuration && tryb !== 'move') {
            const w = wowOf(galazId);
            const stare = Math.max(1, dniRobocze(l.planOd, l.planDo, w));
            const nowe = Math.max(1, dniRobocze(od, ost, w));
            if (stare !== nowe) {
                onDurationChange(l.id, nowe);
                komunikaty.push(<><b>Zmieniono liczbę dni</b> {nazwa(l)}: {stare} → <b>{nowe}</b> {nowe === 1 ? 'dzień' : 'dni'} roboczych (ilość pozycji zaktualizowana).</>);
            }
        }
        if (komunikaty.length) setInfo(komunikaty);
    }, [savePlanDates, savePlanDatesBatch, onDurationChange, wowOf, nazwa, minOdOf, msZaleznosc, msWezly]);

    // @anchor harmonogram-podglad-zaleznych — podgląd na żywo: przesunięci zależni przeciąganego milestone'a.
    const podgladZal = useMemo(() => {
        if (!drag?.delta || !jestMs(drag.l) || drag.tryb === 'l' || !msZaleznosc || !msWezly) return null;
        const p = przesunMilestone(drag.l, drag.tryb, drag.delta, wowOf(drag.galazId));
        return przesunZaleznych(msWezly, zalezniMilestone(msZaleznosc, drag.l.id), roznicaDniRoboczych(drag.l.planDo, p.ost));
    }, [drag, msZaleznosc, msWezly, wowOf]);

    const ciagnie = !!drag;
    useEffect(() => {
        if (!ciagnie) return;
        const ruch = (e) => {
            const d = dragRef.current;
            if (!d) return;
            const delta = Math.round((e.clientX - d.x0) / dzienPx);
            if (delta !== d.delta) setDrag({ ...d, delta });
        };
        const pusc = () => {
            const d = dragRef.current;
            setDrag(null);
            if (!d?.delta) return;
            poDragu.current = true; setTimeout(() => { poDragu.current = false; }, 0);
            const { od, ost } = przesunWg(d.l, d.tryb, d.delta, wowOf(d.galazId));
            zapisz(d.l, d.galazId, od, ost, d.tryb);
        };
        window.addEventListener('pointermove', ruch);
        window.addEventListener('pointerup', pusc);
        return () => { window.removeEventListener('pointermove', ruch); window.removeEventListener('pointerup', pusc); };
    }, [ciagnie, zapisz, dzienPx, wowOf]);

    const zacznij = (e, l, galazId, tryb) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        setDrag({ l, galazId, tryb, x0: e.clientX, delta: 0 });
    };
    // Klik w pusty dzień toru = start robót tego dnia, dni robocze bez zmian.
    const klikToru = (e, l, galazId) => {
        if (drag || poDragu.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.floor((e.clientX - r.left) / dzienPx);
        const dzien = dodajDni(start, i);
        const delta = roznicaDni(dzien, l.planOd);
        if (!delta) return;
        const { od, ost } = przesunWg(l, 'move', delta, wowOf(galazId));
        zapisz(l, galazId, od, ost, 'move');
    };
    const zapiszZPola = (l, galazId, pole, v) => {
        setEdycjaDat(null);
        if (!v) return;
        const d = dzien0(v);
        if (isNaN(d)) return;
        let od = dzien0(l.planOd), ost = dzien0(l.planDo);
        if (pole === 'od') { od = d; if (ost < od) ost = od; } else { ost = d; if (ost < od) od = ost; }
        zapisz(l, galazId, od, ost, pole === 'od' ? 'l' : 'r');
    };

    // @anchor harmonogram-rysuj-milestone — romb (termin = ostatni dzień okna) i ewentualne okno
    // `planOd..planDo`; przeciąganie rombu przesuwa całość, krawędzie okna je zmieniają.
    const rysujMs = (l, galazId, edyt, wGrupie = false) => {
        const w = wowOf(galazId);
        const dd = drag?.l.id === l.id ? drag : null;
        let a = idx(l.planOd), b = idx(l.planDo);
        if (dd && dd.delta) { const p = przesunMilestone(l, dd.tryb, dd.delta, w); a = idx(p.od); b = idx(p.ost); }
        else if (podgladZal?.[l.id]) { a = idx(podgladZal[l.id].od); b = idx(podgladZal[l.id].ost); }
        if (a === null || b === null || b < 0 || a >= ileDni) return null;
        const minOd = minOdOf(l, galazId);
        const konflikt = !!minOd && dzien0(l.planOd) < minOd;
        const okno = b > a;
        const tytul = `◆ ${l.name}\nMilestone ${dzienMies(l.planOd)}${okno ? `–${dzienMies(l.planDo)}` : ''}${l._msOpis ? ` · ${l._msOpis}` : ''}${konflikt ? `\nKolizja: przed końcem poprzedniego milestone'a (najwcześniej ${dzienMies(minOd)})` : ''}${edyt ? '\nPrzeciągnij romb, by przesunąć' : ''}${onOtworz ? '\nKlik otwiera szczegóły' : ''}`;
        const a0 = Math.max(a, 0), b0 = Math.min(b, ileDni - 1);
        return (
            <React.Fragment key={l.id}>
                {okno && (
                    <div className={`ms-okno${wGrupie ? ' g' : ''}${dd ? ' ciagniety' : ''}`} style={{ left: a0 * dzienPx + 1, width: Math.max(4, (b0 - a0 + 1) * dzienPx - 2) }} title={tytul}
                        onClick={e => e.stopPropagation()}>
                        {edyt && a >= 0 && <span className="uchwyt l" onPointerDown={e => zacznij(e, l, galazId, 'l')} />}
                        {edyt && b < ileDni && <span className="uchwyt r" onPointerDown={e => zacznij(e, l, galazId, 'r')} />}
                    </div>
                )}
                {b < ileDni && (
                    <span className={`ms${wGrupie ? ' g' : ''}${edyt ? ' drag' : ''}${dd ? ' ciagniety' : ''}${l._msKonflikt || konflikt ? ' late' : ''}${podgladZal?.[l.id] ? ' podglad' : ''}`}
                        style={{ left: b * dzienPx + dzienPx / 2 - 7 }} title={tytul}
                        onPointerDown={edyt ? e => zacznij(e, l, galazId, 'move') : undefined}
                        onClick={e => { e.stopPropagation(); if (!poDragu.current && onOtworz) onOtworz(l.id); }} />
                )}
                {/* @anchor harmonogram-cien-prognozy — prognoza z blokerów (`_prognoza`, `_prognozaDni`): przerywany romb +N dni */}
                {l._prognoza && (() => {
                    const p = idx(l._prognoza);
                    if (p === null || p <= b || b >= ileDni || p < 0) return null;
                    const pk = Math.min(p, ileDni - 1);
                    return (
                        <>
                            <span className={`ms-cien-l${wGrupie ? ' g' : ''}`} style={{ left: b * dzienPx + dzienPx / 2, width: (pk - b) * dzienPx }} />
                            {p < ileDni && <span className={`ms-cien${wGrupie ? ' g' : ''}`} style={{ left: p * dzienPx + dzienPx / 2 - 7 }}
                                title={`Prognoza ${dzienMies(l._prognoza)} (+${l._prognozaDni} dni rob. z blokerów)`} />}
                        </>
                    );
                })()}
                {wGrupie && b < ileDni && <span className="ms-tx" style={{ left: (l._prognoza && idx(l._prognoza) > b && idx(l._prognoza) < ileDni ? idx(l._prognoza) : b) * dzienPx + dzienPx / 2 + 10 }}>{nazwa(l)}{l._prognozaDni ? ` · prognoza +${l._prognozaDni} d.` : ''}</span>}
            </React.Fragment>
        );
    };

    // ─── wiersze ────────────────────────────────────────────────────────────
    const wiersze = useMemo(() => {
        const kolidujace = new Set((kolizje || []).map(k => k.id));
        return grupy.map(({ galaz, liscie, milestony: ms = [] }) => {
            const pozycje = liscie.map(l => {
                const pasek = maPasek(l) && !!l.planOd && !!l.planDo;
                const d0 = pasek ? idx(l.planOd) : null;
                const d1 = pasek ? idx(l.planDo) : null;
                const dostawy = new Map();
                if (pokazDostawy) {
                    for (const e of dostawyOf(l)) {
                        const i = idx(e.entryDate);
                        if (i === null || i < 0 || i >= ileDni) continue;
                        dostawy.set(i, (dostawy.get(i) || false) || kolidujace.has(e.id));
                    }
                }
                return { l, pasek, d0, d1, dostawy: [...dostawy.entries()] };
            }).filter(p => (p.pasek && p.d1 >= 0 && p.d0 < ileDni) || p.dostawy.length || (wszystkie && p.pasek));
            // @anchor harmonogram-milestony-galezi — milestone'y gałęzi (Realizacja) w wierszu gałęzi.
            const milestony = ms.filter(m => m.planOd && m.planDo);
            return { galaz, pozycje, milestony };
        }).filter(g => g.pozycje.length || g.milestony.length);
    }, [grupy, maPasek, idx, ileDni, kolizje, wszystkie, pokazDostawy, dostawyOf]);

    // Dni wolne i miesiące osi (nagłówek + tło).
    const wolne = useMemo(() => dni.map((d, i) => (isNonWorkingDay(d) ? i : -1)).filter(i => i >= 0), [dni]);
    const miesiace = useMemo(() => {
        const out = [];
        dni.forEach((d, i) => {
            const k = `${d.getFullYear()}-${d.getMonth()}`;
            if (!out.length || out[out.length - 1].k !== k) out.push({ k, i, n: 1, d });
            else out[out.length - 1].n++;
        });
        return out;
    }, [dni]);
    const tygodnie = useMemo(() => dni.map((d, i) => (d.getDay() === 1 ? i : -1)).filter(i => i >= 0), [dni]);
    const dzisIdx = idx(dzis);
    const psIdx = projectStart ? idx(projectStart) : null;
    const peIdx = projectEnd ? idx(projectEnd) : null;

    // ─── eksporty (Planowanie) ──────────────────────────────────────────────
    // @anchor harmonogram-excel-data — ten sam kształt co dawne `getExcelData` Gantta (arkusz „Harmonogram").
    const getExcelData = useCallback(() => {
        const zadania = wszystkiePozycje.filter(({ l }) => maPasek(l) && l.planOd && l.planDo)
            .map(({ l, galazId }) => ({ id: l.id, type: jestMs(l) ? 'milestone' : 'task', name: `${jestMs(l) ? '◆ ' : ''}${nazwa(l)}`, start: dzien0(l.planOd), end: dodajDni(l.planDo, 1), galazId }));
        const mapaGalezi = Object.fromEntries(zadania.map(t => [t.id, t.galazId]));
        const rows = zadania.map(t => {
            const w = wowOf(t.galazId);
            return {
                id: t.id, name: t.name, start: toExcelUtcDate(t.start), end: toExcelUtcDate(dodajDni(t.end, -1)),
                days: t.type === 'milestone' ? 0 : dniRobocze(t.start, dodajDni(t.end, -1), w), milestone: t.type === 'milestone', wow: w,
            };
        });
        let span = 0;
        if (zadania.length) span = roznicaDni(zadania.reduce((m, t) => (t.end > m ? t.end : m), zadania[0].end), zadania.reduce((m, t) => (t.start < m ? t.start : m), zadania[0].start));
        const mode = span <= 92 ? 'Day' : span <= 400 ? 'Week' : 'Month';
        const timeline = buildExcelTimeline(zadania, mode, wow, mapaGalezi, projectStart, projectEnd);
        return { rows, totalDays: rows.reduce((s, r) => s + r.days, 0), projectName: nazwaProjektu, projectStart, projectEnd, timeline };
    }, [wszystkiePozycje, maPasek, nazwa, wowOf, wow, projectStart, projectEnd, nazwaProjektu]);

    // @anchor harmonogram-html — statyczny HTML całego harmonogramu do PDF (jasny, style inline).
    const getHtml = useCallback(() => {
        const zadania = wszystkiePozycje.filter(({ l }) => maPasek(l) && l.planOd && l.planDo);
        if (!zadania.length) return null;
        let lo = dzien0(zadania[0].l.planOd), hi = dzien0(zadania[0].l.planDo);
        for (const { l } of zadania) { if (dzien0(l.planOd) < lo) lo = dzien0(l.planOd); if (dzien0(l.planDo) > hi) hi = dzien0(l.planDo); }
        if (projectStart && dzien0(projectStart) < lo) lo = dzien0(projectStart);
        if (projectEnd && dzien0(projectEnd) > hi) hi = dzien0(projectEnd);
        const s = dodajDni(lo, -1);
        const n = roznicaDni(hi, s) + 2;
        const px = Math.max(3, Math.min(22, Math.floor(900 / n)));
        const W = n * px;
        const lewa = 440;
        const ms = [];
        for (let i = 0; i < n; i++) {
            const d = dodajDni(s, i);
            const k = `${d.getFullYear()}-${d.getMonth()}`;
            if (!ms.length || ms[ms.length - 1].k !== k) ms.push({ k, i, n: 1, d }); else ms[ms.length - 1].n++;
        }
        const tlo = [];
        for (let i = 0; i < n; i++) if (isNonWorkingDay(dodajDni(s, i))) tlo.push(`<div style="position:absolute;top:0;bottom:0;left:${i * px}px;width:${px}px;background:#eef1f5"></div>`);
        const marker = (d, kolor) => (d ? `<div style="position:absolute;top:0;bottom:0;left:${roznicaDni(d, s) * px + px / 2}px;border-left:1.5px dashed ${kolor}"></div>` : '');
        const naglowek = ms.map(m => `<div style="position:absolute;left:${m.i * px}px;width:${m.n * px}px;top:0;height:20px;border-left:1px solid #cbd5e1;font-size:9px;padding:3px 4px;overflow:hidden;white-space:nowrap">${MIES_KR[m.d.getMonth()]} ${m.d.getFullYear()}</div>`).join('');
        const wiersz = (tekst, od, ost, dniR, pasekHtml, grp) => `<div style="display:flex;height:${grp ? 22 : 24}px;border-bottom:1px solid #e2e8f0;${grp ? 'background:#f1f5f9;font-weight:700;' : ''}">
<div style="width:${lewa}px;flex:none;display:flex;font-size:10px;align-items:center">
<div style="flex:1;padding:0 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${tekst}</div>
<div style="width:62px;text-align:center">${od}</div><div style="width:62px;text-align:center">${ost}</div><div style="width:40px;text-align:center">${dniR}</div></div>
<div style="position:relative;width:${W}px;flex:none">${pasekHtml}</div></div>`;
        let body = '';
        for (const g of grupy) {
            const poz = g.liscie.filter(l => maPasek(l) && l.planOd && l.planDo);
            if (!poz.length) continue;
            if (g.galaz) body += wiersz(esc(nazwa(g.galaz)), '', '', '', '', true);
            const w = wowOf(g.galaz?.id);
            for (const l of poz) {
                const a = roznicaDni(l.planOd, s), b = roznicaDni(l.planDo, s);
                if (jestMs(l)) {
                    // Romb na ostatnim dniu okna + jasne okno, gdy milestone trwa kilka dni.
                    const okno = b > a ? `<div style="position:absolute;top:8px;height:8px;left:${a * px}px;width:${(b - a + 1) * px}px;background:#ede9fe;border:1px dashed #7c3aed;border-radius:2px"></div>` : '';
                    const romb = `<div style="position:absolute;top:7px;width:10px;height:10px;left:${b * px + px / 2 - 5}px;background:#7c3aed;transform:rotate(45deg)"></div>`;
                    body += wiersz(`&#9670; ${esc(nazwa(l))}`, dzienMies(l.planOd), dzienMies(l.planDo), '—', okno + romb, false);
                    continue;
                }
                const bar = `<div style="position:absolute;top:6px;height:12px;left:${a * px}px;width:${Math.max(px, (b - a + 1) * px)}px;background:#1d4ed8;border-radius:2px"></div>`;
                body += wiersz(esc(nazwa(l)), dzienMies(l.planOd), dzienMies(l.planDo), dniRobocze(l.planOd, l.planDo, w), bar, false);
            }
        }
        const html = `<div style="font-family:Inter,system-ui,sans-serif;color:#0b0f17;background:#fff;width:${lewa + W}px">
<div style="display:flex;height:20px;border-bottom:1px solid #94a3b8;font-size:9px;font-weight:700;color:#475569">
<div style="width:${lewa}px;flex:none;display:flex;align-items:center"><div style="flex:1;padding:0 6px">Pozycja</div><div style="width:62px;text-align:center">Od</div><div style="width:62px;text-align:center">Do</div><div style="width:40px;text-align:center">Dni</div></div>
<div style="position:relative;width:${W}px;flex:none">${naglowek}</div></div>
<div style="position:relative">
<div style="position:absolute;top:0;bottom:0;left:${lewa}px;width:${W}px">${tlo.join('')}${marker(projectStart, '#22c55e')}${marker(projectEnd, '#ef4444')}</div>
<div style="position:relative">${body}</div></div></div>`;
        return { html, styles: '', contentWidth: lewa + W };
    }, [wszystkiePozycje, grupy, maPasek, nazwa, wowOf, projectStart, projectEnd]);

    useEffect(() => { onApi?.({ getExcelData, getHtml }); }, [onApi, getExcelData, getHtml]);

    // ─── render ─────────────────────────────────────────────────────────────
    const navKrok = zakres === 'miesiac' ? 1 : 7;
    const opisOkna = zakres === 'miesiac'
        ? `${MIESIACE[start.getMonth()]} ${start.getFullYear()}`
        : `${dzienMies(dni[0])}–${dzienMies(dni[ileDni - 1])}`;
    const maDostawy = !!(actualsOf && czyDostawa);

    return (
        <div className="hg" ref={hgRef}>
            <div className="lahead">
                <div className="la-nav">
                    {zakres !== 'calosc' && <>
                        <button onClick={() => setPrzesun(p => p - navKrok)} title={zakres === 'miesiac' ? 'Miesiąc wcześniej' : 'Tydzień wcześniej'}>‹ {zakres === 'miesiac' ? 'mies.' : 'tydz.'}</button>
                        <button onClick={() => setPrzesun(0)} className={przesun === 0 ? 'on' : ''}>Dziś</button>
                        <button onClick={() => setPrzesun(p => p + navKrok)} title={zakres === 'miesiac' ? 'Miesiąc później' : 'Tydzień później'}>{zakres === 'miesiac' ? 'mies.' : 'tydz.'} ›</button>
                    </>}
                    {ZAKRESY.map(([k, t]) => <button key={k} className={zakres === k ? 'on' : ''} onClick={() => setZakres(k)} title="Zakres osi czasu">{t}</button>)}
                    {zakres !== 'calosc' && <label><input type="checkbox" checked={wszystkie} onChange={e => setWszystkie(e.target.checked)} /> wszystkie roboty</label>}
                    {maDostawy && <label><input type="checkbox" checked={pokazDostawy} onChange={e => setPokazDostawy(e.target.checked)} /> dostawy</label>}
                </div>
                <span>{zakres === 'calosc' ? 'Cały harmonogram' : `Okno ${opisOkna}`}. Jedno źródło dat dla Planowania i Realizacji{canEdit && savePlanDates ? ' — przeciągnij pasek, rozciągnij za krawędź, kliknij dzień, by przenieść start, albo kliknij daty przy nazwie' : ''}{onOtworz ? '. Klik w nazwę otwiera pozycję' : ''}.</span>
            </div>

            {!wiersze.length ? <div className="empty">Brak robót{maDostawy ? ' i dostaw' : ''} w tym zakresie.</div> : (
                <div className={`hg-scroll${drag ? ' ciagnie' : ''}`}>
                    <div className="hg-grid" style={{ gridTemplateColumns: `${LABEL_W}px ${szer}px` }}>
                        {/* lewa kolumna: nazwy */}
                        <div className="hg-lewa">
                            <div className="hg-head-l" style={{ height: HEAD_H }}>Pozycja{gotowosc ? ' · gotowość' : ''}</div>
                            {wiersze.map(({ galaz, pozycje, milestony }) => (
                                <React.Fragment key={galaz?.id || '_wprost'}>
                                    {!galaz && milestony.length > 0 && (
                                        <div className="hg-grp" style={{ height: GRP_H }}>
                                            <span className="n">Ta gałąź</span>
                                            <span className="mono ms-l"> · ◆ {milestony.length}</span>
                                        </div>
                                    )}
                                    {galaz && (
                                        <div className="hg-grp" style={{ height: GRP_H }} title={galaz.name}>
                                            {onZoom ? <button className="n" onClick={() => onZoom(galaz.id)}>{nazwa(galaz)}</button> : <span className="n">{nazwa(galaz)}</span>}
                                            <span className="mono"> · {pozycje.length}</span>
                                            {milestony.length > 0 && <span className="mono ms-l" title={milestony.map(m => `◆ ${m.name} ${dzienMies(m.planOd)}`).join('\n')}> · ◆ {milestony.length}</span>}
                                            {canEdit && savePlanDates && (
                                                <button className={`wow${wow[galaz.id] ? ' on' : ''}`} onClick={() => setWow(p => ({ ...p, [galaz.id]: !p[galaz.id] }))}
                                                    title="Czy ta gałąź pracuje w weekendy i święta (wpływa na przesuwanie pasków i liczbę dni roboczych)">
                                                    {wow[galaz.id] ? 'pracuje w dni wolne' : 'bez dni wolnych'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {pozycje.map(({ l, pasek }) => {
                                        const w = wowOf(galaz?.id);
                                        const edyt = canEdit && !!savePlanDates && pasek && !opisPaska(l).zablokowany;
                                        const ed = edycjaDat === l.id;
                                        return (
                                            <div key={l.id} className="hg-lbl" style={{ height: ROW_H, paddingLeft: 8 + (pokazWciecia ? Math.max(0, (l.depth || 0) - 1) * 10 : 0) }}>
                                                <span className={`t${onOtworz ? ' klik' : ''}${jestMs(l) ? ' ms-n' : ''}`} title={l.name} onClick={onOtworz ? () => onOtworz(l.id) : undefined}>{jestMs(l) ? '◆ ' : ''}{nazwa(l)}</span>
                                                <span className="m">
                                                    {pasek && !ed && (
                                                        <span className={`daty${edyt ? ' ed' : ''}`} onClick={edyt ? () => setEdycjaDat(l.id) : undefined} title={edyt ? 'Zmień daty' : undefined}>
                                                            {jestMs(l)
                                                                ? `milestone ${dzienMies(l.planOd)}${+dzien0(l.planDo) !== +dzien0(l.planOd) ? `–${dzienMies(l.planDo)}` : ''}`
                                                                : `${dzienMies(l.planOd)}–${dzienMies(l.planDo)} · ${dniRobocze(l.planOd, l.planDo, w)} d.`}
                                                        </span>
                                                    )}
                                                    {pasek && ed && (
                                                        <span className="daty-in">
                                                            <input type="date" defaultValue={doInputu(l.planOd)} onBlur={e => zapiszZPola(l, galaz?.id, 'od', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEdycjaDat(null); }} autoFocus />
                                                            <input type="date" defaultValue={doInputu(l.planDo)} onBlur={e => zapiszZPola(l, galaz?.id, 'do', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEdycjaDat(null); }} />
                                                        </span>
                                                    )}
                                                    {gotowosc && GotowoscChipy && <GotowoscChipy g={gotowosc(l)} />}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>

                        {/* prawa kolumna: oś czasu */}
                        <div className="hg-prawa" style={{ width: szer }}>
                            <div className="hg-head" style={{ height: HEAD_H }}>
                                {miesiace.map(m => (
                                    <div key={m.k} className="mies" style={{ left: m.i * dzienPx, width: m.n * dzienPx }}>
                                        {m.n * dzienPx > 60 ? `${MIESIACE[m.d.getMonth()]} ${m.d.getFullYear()}` : MIES_KR[m.d.getMonth()]}
                                    </div>
                                ))}
                                {pokazDzien
                                    ? dni.map((d, i) => (
                                        <div key={i} className={`dz${isNonWorkingDay(d) ? ' we' : ''}${i === dzisIdx ? ' today' : ''}`} style={{ left: i * dzienPx, width: dzienPx }}
                                            title={isPolishHoliday(d) ? 'Święto' : undefined}>
                                            {dzienPx >= 40 ? `${DNI_TYG[d.getDay()]} ${d.getDate()}` : d.getDate()}
                                        </div>
                                    ))
                                    : pokazTydz && tygodnie.map(i => (
                                        <div key={i} className="dz tyg" style={{ left: i * dzienPx, width: 7 * dzienPx }}>{dzienMies(dni[i])}</div>
                                    ))}
                            </div>
                            <div className="hg-cialo">
                                <div className="hg-tlo">
                                    {dzienPx >= 3 && wolne.map(i => <div key={i} className="wolny" style={{ left: i * dzienPx, width: dzienPx }} />)}
                                    {(pokazDzien ? dni.map((_, i) => i) : pokazTydz ? tygodnie : miesiace.map(m => m.i)).map(i => <div key={`t${i}`} className="tydz" style={{ left: i * dzienPx }} />)}
                                    {dzisIdx !== null && dzisIdx >= 0 && dzisIdx < ileDni && <div className="dzis" style={{ left: dzisIdx * dzienPx + dzienPx / 2 }} title="Dziś" />}
                                    {psIdx !== null && psIdx >= 0 && psIdx < ileDni && <div className="mark ps" style={{ left: psIdx * dzienPx + dzienPx / 2 }} title={`Start projektu ${dzienMies(projectStart)}`} />}
                                    {peIdx !== null && peIdx >= 0 && peIdx < ileDni && <div className="mark pe" style={{ left: peIdx * dzienPx + dzienPx / 2 }} title={`Koniec projektu ${dzienMies(projectEnd)}`} />}
                                </div>
                                {wiersze.map(({ galaz, pozycje, milestony }) => (
                                    <React.Fragment key={galaz?.id || '_wprost'}>
                                        {(galaz || milestony.length > 0) && (
                                            <div className="hg-grp-t" style={{ height: GRP_H }}>
                                                {milestony.map(m => rysujMs(m, galaz?.id || null, canEdit && !!savePlanDates && !opisPaska(m).zablokowany, true))}
                                            </div>
                                        )}
                                        {pozycje.map(({ l, pasek, d0: r0, d1: r1, dostawy }) => {
                                            const galazId = galaz?.id || null;
                                            const w = wowOf(galazId);
                                            const opis = opisPaska(l);
                                            const edyt = canEdit && !!savePlanDates && pasek && !opis.zablokowany;
                                            // Podgląd ciągnięcia: przeliczone daty, zanim wróci zapis.
                                            const dd = drag?.l.id === l.id ? drag : null;
                                            let d0 = r0, d1 = r1;
                                            if (dd && dd.delta) {
                                                const p = przesunWg(l, dd.tryb, dd.delta, w);
                                                d0 = idx(p.od); d1 = idx(p.ost);
                                            } else if (podgladZal?.[l.id]) {
                                                d0 = idx(podgladZal[l.id].od); d1 = idx(podgladZal[l.id].ost);
                                            }
                                            const minOd = pasek ? minOdOf(l, galazId) : null;
                                            const konflikt = !!minOd && dzien0(l.planOd) < minOd;
                                            const widoczny = pasek && d1 >= 0 && d0 < ileDni;
                                            const od = widoczny ? Math.max(d0, 0) : -1;
                                            const dl = widoczny ? Math.min(d1, ileDni - 1) - od + 1 : 0;
                                            // Przerwy na dni wolne wewnątrz paska (gałąź bez pracy w dni wolne).
                                            const przerwy = widoczny && !w && dzienPx >= 8
                                                ? wolne.filter(i => i >= od && i <= od + dl - 1).map(i => i - od) : [];
                                            const poza = pasek && !widoczny ? (d1 < 0 ? 'l' : 'r') : null;
                                            return (
                                                <div key={l.id} className={`hg-tor${edyt ? ' plan' : ''}`} style={{ height: ROW_H }}
                                                    onClick={edyt ? (e) => klikToru(e, l, galazId) : undefined}>
                                                    {jestMs(l) && pasek && rysujMs(l, galazId, edyt)}
                                                    {widoczny && !jestMs(l) && (
                                                        <div className={`bar ${opis.klasa}${d0 < 0 ? ' cut-l' : ''}${d1 >= ileDni ? ' cut-r' : ''}${edyt ? ' drag' : ''}${dd ? ' ciagniety' : ''}${konflikt ? ' konflikt' : ''}${podgladZal?.[l.id] ? ' podglad' : ''}`}
                                                            style={{ left: od * dzienPx + 2, width: Math.max(6, dl * dzienPx - 4) }}
                                                            onPointerDown={edyt ? e => zacznij(e, l, galazId, 'move') : undefined}
                                                            onClick={e => e.stopPropagation()}
                                                            title={`${l.name}\nRoboty ${dzienMies(l.planOd)}–${dzienMies(l.planDo)} · ${dniRobocze(l.planOd, l.planDo, w)} dni roboczych${opis.tekst ? ` · ${opis.tekst}` : ''}${konflikt ? `\nKolizja z milestone'em „${msWezly?.[msZaleznosc?.[l.id]]?.name || ''}” — najwcześniej ${dzienMies(minOd)}` : ''}`}>
                                                            {przerwy.map(i => <i key={i} className="przerwa" style={{ left: i * dzienPx - 2, width: dzienPx }} />)}
                                                            {edyt && d0 >= 0 && <span className="uchwyt l" onPointerDown={e => zacznij(e, l, galazId, 'l')} />}
                                                            {dl * dzienPx > 50 && <span className="tx">{opis.tekst || `${dniRobocze(l.planOd, l.planDo, w)} d.`}</span>}
                                                            {edyt && d1 < ileDni && <span className="uchwyt r" onPointerDown={e => zacznij(e, l, galazId, 'r')} />}
                                                        </div>
                                                    )}
                                                    {poza && (!jestMs(l) || !widoczny) && (
                                                        <span className={`poza ${poza}`} title={`Roboty ${dzienMies(l.planOd)}–${dzienMies(l.planDo)} — poza oknem`}>
                                                            {poza === 'l' ? `‹ ${dzienMies(l.planDo)}` : `${dzienMies(l.planOd)} ›`}
                                                        </span>
                                                    )}
                                                    {dostawy.map(([i, late]) => (
                                                        <span key={i} className={`diam${late ? ' late' : ''}`} style={{ left: i * dzienPx + dzienPx / 2 - 7 }}
                                                            title={`Dostawa ${dzienMies(dodajDni(start, i))}${late ? ' — za blisko startu robót w gałęzi' : ''}`} />
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="legend">
                <span><i className="bar b-work" />roboty</span>
                {opisPaska !== domyslnyOpis && <><span><i className="bar b-done" />wykonane</span><span><i className="bar b-hold" />wstrzymane</span></>}
                <span><i className="ms" />milestone</span>
                <span><i className="ms-okno" />okno milestone'a</span>
                {msZaleznosc && <span><i className="bar b-work konflikt" />kolizja z milestone'em</span>}
                {grupy.some(g => (g.milestony || []).some(m => m._prognoza)) && <span><i className="ms-cien" />prognoza milestone'a (blokery)</span>}
                <span><i className="sw-wolny" />dzień wolny</span>
                {maDostawy && <><span><i className="diam" />dostawa</span><span><i className="diam late" />dostawa za blisko robót</span></>}
                {(projectStart || projectEnd) && <><span><i className="sw-mark ps" />start projektu</span><span><i className="sw-mark pe" />koniec</span></>}
                {gotowosc && <span className="ready"><span className="r-ok">MAT</span><span className="r-q">PYT</span><span className="r-no">BLK</span> gotowość: materiał, pytania, blokery</span>}
            </div>

            {info && (
                <div className="hg-info" onClick={() => setInfo(null)}>
                    {info.map((t, i) => <div key={i}>{t}</div>)}
                </div>
            )}
        </div>
    );
}
