// Harmonogram — jeden widok planowania robót zamiast Gantta (Planowanie) i Lookahead (Realizacja).
// Zbudowany na bazie Lookahead: wiersz = pozycja z paskiem robót (`planOd`..`planDo`, `planDo` =
// ostatni dzień), pogrupowana w gałęzie. Zakres osi: 14 dni / miesiąc / całość. Warstwy: dni wolne
// (weekendy + polskie święta), gotowość (MAT/PYT/BLK), kolizje z milestone'ami,
// start/koniec projektu, dziś. Zapis tylko przez `savePlanDates` → `WbsNode.ganttStart/ganttEnd`.
// Przesunięcie paska zachowuje liczbę dni pracy (jak dawny Gantt); gałąź może pracować w soboty
// i osobno w niedziele/święta — takie dni liczone są osobno („17 d. + 3 sob. + 1 nd.”).
// `onDurationChange` (tylko Planowanie) dostaje nową łączną liczbę dni pracy po
// rozciągnięciu paska pracy liczonej w dniach — tam zmienia się ilość pozycji.
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    DAY_MS, isNonWorkingDay, isPolishHoliday, advanceToWorkingDay, retreatToWorkingDay, addWorkingDays,
    buildExcelTimeline, toExcelUtcDate, isMilestoneType,
    pierwszyDozwolonyDzien, zalezniMilestone, przesunZaleznych, roznicaDniRoboczych,
    czyWolnyDla, liczDniPracy, normPw, rodzajDnia, prognozaZaleznego,
} from './harmonogramCzas';
import { useZadaniaHarmonogramu, grupujZadania, mojeId, mozePrzesunac, przesunZadanie, zapiszDatyZadania } from './harmonogramZadania';
import TaskModal from '../wbs/TaskModal';
import { EXEC_STATUS_META, TASK_STATUS_CODES, isTaskClosed } from '../wbs/wbsConstants';
import './harmonogram.css';

const DNI_TYG = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const MIES_KR = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const LABEL_W = 280;
const ROW_H = 44;
// @anchor harmonogram-wys-ms — wiersz milestone'a wyższy: nazwa + „milestone data” nie mieszczą się w 44 px.
const ROW_H_MS = 52;
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

// @anchor harmonogram-dni-robocze — łączna liczba dni pracy w zakresie od..ost (oba włącznie);
// `pw` = { sob, nd } gałęzi — soboty / niedziele i święta wliczane tylko, gdy gałąź w nie pracuje.
export const dniRobocze = (od, ost, pw = null) => liczDniPracy(od, ost, pw).razem;

const odmiana = (n, [jeden, kilka, wiele]) => {
    if (n === 1) return jeden;
    const j = n % 10, d = n % 100;
    return j >= 2 && j <= 4 && (d < 12 || d > 14) ? kilka : wiele;
};
// @anchor harmonogram-opis-dni — dni pracy pozycji osobno: pn–pt, soboty, niedziele/święta.
// Krótko („17 d. + 3 sob. + 1 nd.”) przy nazwie i na pasku, długo w podpowiedzi.
export const opisDni = (x) => [`${x.rob} d.`, x.sob ? `${x.sob} sob.` : null, x.nd ? `${x.nd} nd.` : null].filter(Boolean).join(' + ');
const opisDniDlugi = (x) => {
    const czesci = [`${x.rob} ${odmiana(x.rob, ['dzień roboczy', 'dni robocze', 'dni roboczych'])}`];
    if (x.sob) czesci.push(`${x.sob} ${odmiana(x.sob, ['sobota', 'soboty', 'sobót'])}`);
    if (x.nd) czesci.push(`${x.nd} ${odmiana(x.nd, ['niedziela/święto', 'niedziele/święta', 'niedziel/świąt'])}`);
    return czesci.length > 1 ? `${czesci.join(' + ')} = ${x.razem} dni pracy` : czesci[0];
};

// @anchor harmonogram-przesun — nowe daty paska po przeciągnięciu o `delta` dni.
// move: zachowuje liczbę dni pracy (start ląduje na dniu pracy gałęzi w stronę ruchu); l/r: zmienia jedną krawędź.
// `pw` = { sob, nd } gałęzi; gałąź pracująca we wszystkie dni przesuwa się kalendarzowo.
export function przesunPasek(l, tryb, delta, pw) {
    let od = dzien0(l.planOd), ost = dzien0(l.planDo);
    if (tryb === 'move') {
        const ile = Math.max(1, dniRobocze(od, ost, pw));
        let ns = dodajDni(od, delta);
        ns = delta < 0 ? retreatToWorkingDay(ns, pw) : advanceToWorkingDay(ns, pw);
        return { od: ns, ost: dodajDni(addWorkingDays(ns, ile, pw), -1) };
    }
    if (tryb === 'l') {
        od = dodajDni(od, delta);
        od = delta < 0 ? retreatToWorkingDay(od, pw) : advanceToWorkingDay(od, pw);
        if (od > ost) od = ost;
    } else {
        ost = dodajDni(ost, delta);
        ost = delta < 0 ? retreatToWorkingDay(ost, pw) : advanceToWorkingDay(ost, pw);
        if (ost < od) ost = od;
    }
    return { od, ost };
}

// @anchor harmonogram-przesun-milestone — przesunięcie milestone'a (romb albo okno): okno jedzie
// w dniach kalendarzowych (termin to termin), 1-dniowy romb ląduje na dniu roboczym w stronę ruchu.
// Rozciąganie (l/r) tylko dla okna — 1-dniowy romb nie ma krawędzi.
export function przesunMilestone(l, tryb, delta, pw) {
    let od = dzien0(l.planOd), ost = dzien0(l.planDo);
    const dl = Math.max(0, roznicaDni(ost, od));
    if (tryb === 'move') {
        od = dodajDni(od, delta);
        if (dl === 0) od = delta < 0 ? retreatToWorkingDay(od, pw) : advanceToWorkingDay(od, pw);
        return { od, ost: dodajDni(od, dl) };
    }
    if (tryb === 'l') { od = dodajDni(od, delta); if (od > ost) od = ost; }
    else { ost = dodajDni(ost, delta); if (ost < od) ost = od; }
    return { od, ost };
}
const jestMs = (l) => isMilestoneType(l?.type);
const przesunWg = (l, tryb, delta, pw) => (jestMs(l) ? przesunMilestone(l, tryb, delta, pw) : przesunPasek(l, tryb, delta, pw));

const ZAKRESY = [['14', '14 dni'], ['miesiac', 'Miesiąc'], ['calosc', 'Całość']];
// @anchor harmonogram-rodzaje-wolnych — przełączniki pracy w dni wolne: [klucz, skrót, „pracuje w …”].
const RODZAJE_WOLNYCH = [['sob', 'sob.', 'soboty'], ['nd', 'nd.', 'niedziele i święta']];
const czytaj = (k, d) => { try { return (k && sessionStorage.getItem(k)) || d; } catch { return d; } };
const zapiszSS = (k, v) => { try { if (k) sessionStorage.setItem(k, v); } catch { /* tryb prywatny */ } };

const domyslnyOpis = () => ({ klasa: 'b-work', tekst: '' });

// @anchor harmonogram — komponent; props opisane w nagłówku pliku i przy `grupy`.
// `grupy`: [{ galaz: węzeł|null, liscie: [węzeł z planOd/planDo, type, name, shortName?, depth?, _canUpdateDuration?] }]
export default function Harmonogram({
    grupy = [], nazwa = (n) => n?.name || '', maPasek = (l) => !!l.planOd, opisPaska = domyslnyOpis,
    gotowosc = null, GotowoscChipy = null,
    canEdit = false, savePlanDates = null, onDurationChange = null,
    onZoom = null, onOtworz = null,
    domyslnyZakres = '14', zakresKey = null, projectStart = null, projectEnd = null,
    nazwaProjektu = '', onApi = null, pokazWciecia = false,
    // @anchor harmonogram-ms-propsy — reguły milestone'ów (M3): `msZaleznosc` = { [id]: msId }
    // (`zaleznyOdMilestone`), `msWezly` = { [id]: { type, name, planOd, planDo, nieruchomy } } dla WSZYSTKICH
    // pozycji z datami (także spoza zoomu), `savePlanDatesBatch([{ id, od, ost }])` = zapis zbiorczy.
    msZaleznosc = null, msWezly = null, savePlanDatesBatch = null,
    // @anchor harmonogram-przestaw — przeciąganie wiersza za nazwę: `onPrzestaw(id, celId, 'przed'|'po')`
    // zmienia kolejność w WBS (`sortOrder`); błąd (np. inna gałąź WBS) wraca jako komunikat.
    onPrzestaw = null,
    // @anchor harmonogram-dodaj-ms — klik w dzień w wierszu gałęzi = nowy milestone w tej gałęzi:
    // `onDodajMs(galazId, dzien, nazwa)` → { zaleznych } (miejsce w kolejności liczy wołający, `miejsce-milestona`).
    // `galazWprostId` = gałąź dla wiersza „Ta gałąź” (pozycje wprost pod zoomem w Realizacji).
    onDodajMs = null, galazWprostId = null,
    // @anchor harmonogram-zadania-propsy — „Harmonogram zadań”: `processNodeId` (zamówienie) włącza przycisk,
    // `zakresIds` (Set|null) = węzły WBS widoku (zoom / gałąź z drzewa), `onOtworzZadanie(task, nowe)` = własny
    // formularz wołającego (np. Realizacja odświeża wątek): edycja `(task)`, nowe `(null, { wbsNodeId, date })`;
    // bez niego Harmonogram otwiera `TaskModal` sam.
    processNodeId = null, zakresIds = null, onOtworzZadanie = null,
}) {
    const przeciagany = useRef(null);
    const [cel, setCel] = useState(null); // { id, gdzie } — linia wstawienia pod kursorem
    const upusc = async (celId, gdzie) => {
        const id = przeciagany.current;
        przeciagany.current = null;
        setCel(null);
        if (!id || id === celId || !onPrzestaw) return;
        try { await onPrzestaw(id, celId, gdzie); } catch (e) { setInfo([e?.message || 'Nie udało się zmienić kolejności']); }
    };
    const [zakres, setZakresState] = useState(() => czytaj(zakresKey, domyslnyZakres));
    const setZakres = (z) => { setZakresState(z); zapiszSS(zakresKey, z); setPrzesun(0); };
    // @anchor harmonogram-przesun-okna — przesunięcie okna: dni (14 dni) albo miesiące (Miesiąc).
    const [przesun, setPrzesun] = useState(0);
    const [wszystkie, setWszystkie] = useState(true);
    // @anchor harmonogram-praca-w-wolne — gałęzie pracujące w dni wolne, osobno soboty i niedziele/święta:
    // { [galazId]: { sob, nd } } (stan sesji, jak w dawnym Gantcie).
    const [pracaWolne, setPracaWolne] = useState({});
    const przelaczWolne = (galazId, rodzaj) => setPracaWolne(p => ({ ...p, [galazId]: { ...p[galazId], [rodzaj]: !p[galazId]?.[rodzaj] } }));
    const [edycjaDat, setEdycjaDat] = useState(null);
    const [info, setInfo] = useState(null);
    const [nowyMs, setNowyMs] = useState(null); // { galazId, i, nazwa, blad, zapis }
    useEffect(() => { if (!info) return; const t = setTimeout(() => setInfo(null), 4500); return () => clearTimeout(t); }, [info]);

    const pwOf = useCallback((galazId) => normPw(pracaWolne[galazId]), [pracaWolne]);
    const dzis = useMemo(() => dzien0(new Date()), []);

    // @anchor harmonogram-tryb-zadan — przycisk „Harmonogram zadań” podmienia wiersze pozycji WBS na zadania
    // (UserTask) zamówienia: pasek Od–Do w kolorze statusu, samo Do = znacznik terminu, klik = formularz zadania.
    // Tylko podgląd. Tryb zapamiętany w sesji obok zakresu osi; eksporty Excel/PDF zostają przy pozycjach WBS.
    const trybKey = zakresKey ? `${zakresKey}-tryb` : null;
    const [trybZadanState, setTrybZadanState] = useState(() => czytaj(trybKey, 'wbs') === 'zadania');
    const trybZadan = !!processNodeId && trybZadanState;
    const setTrybZadan = (v) => { setTrybZadanState(v); zapiszSS(trybKey, v ? 'zadania' : 'wbs'); };
    const { zadania, blad: bladZadan, podmien: podmienZadanie } = useZadaniaHarmonogramu(processNodeId, trybZadan);
    const uid = useMemo(() => mojeId(), []);
    const [zadanieOtwarte, setZadanieOtwarte] = useState(null);
    const zad = useMemo(() => (trybZadan ? grupujZadania(zadania, grupy, zakresIds) : null), [trybZadan, zadania, grupy, zakresIds]);
    const grupyOsi = zad ? zad.grupy : grupy;

    // Wszystkie pozycje z datami — do eksportów (zawsze pozycje WBS).
    const wszystkiePozycje = useMemo(() => grupy.flatMap(g => g.liscie.map(l => ({ l, galazId: g.galaz?.id || null }))), [grupy]);

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
            for (const g of grupyOsi) {
                for (const l of g.liscie) if (zad || maPasek(l)) { wez(l.planOd); wez(l.planDo); }
                for (const m of g.milestony || []) { wez(m.planOd); wez(m.planDo); }
            }
            wez(projectStart); wez(projectEnd);
            if (!lo) { lo = dzis; hi = dodajDni(dzis, 30); }
            const s = dodajDni(lo, -2);
            const n = Math.max(14, roznicaDni(hi, s) + 4);
            return { start: s, ileDni: n, dzienPx: Math.max(1.2, Math.min(28, szerOsi / n)) };
        }
        return { start: dodajDni(dzis, przesun), ileDni: 14, dzienPx: Math.max(44, szerOsi / 14) };
    }, [zakres, przesun, dzis, grupyOsi, zad, maPasek, projectStart, projectEnd, szerOsi]);

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
        return ms?.planDo ? pierwszyDozwolonyDzien(ms.planDo, pwOf(galazId)) : null;
    }, [msWezly, msZaleznosc, pwOf]);
    // @anchor harmonogram-kolizja-ms — kolizja pozycji z milestone'em, od którego zależy: start przed pierwszym
    // dniem pracy po PROGNOZIE milestone'a (`msWezly[ms].prognoza` — Realizacja: blokery i poślizg łańcucha),
    // a bez prognozy po jego planie. Tylko ostrzeżenie (czerwień + cień przesunięcia) — dociąganie przy
    // zapisie zostaje przy planie (`minOdOf`), bo prognoza to nie plan. { minOd, ms, zPrognozy } albo null.
    const kolizjaMsOf = useCallback((l, galazId) => {
        const ms = msWezly?.[msZaleznosc?.[l.id]];
        if (!ms?.planDo || !l.planOd) return null;
        const pw = pwOf(galazId);
        const minOd = pierwszyDozwolonyDzien(ms.prognoza || ms.planDo, pw);
        if (dzien0(l.planOd) >= minOd) return null;
        return { minOd, ms, zPrognozy: !!ms.prognoza && dzien0(l.planOd) >= pierwszyDozwolonyDzien(ms.planDo, pw) };
    }, [msWezly, msZaleznosc, pwOf]);
    const opisKolizji = (kol) => (kol.zPrognozy
        ? `Kolizja z prognozą milestone'a „${kol.ms.name || ''}” (prognoza ${dzienMies(kol.ms.prognoza)}, plan ${dzienMies(kol.ms.planDo)}) — najwcześniej ${dzienMies(kol.minOd)}`
        : `Kolizja z milestone'em „${kol.ms.name || ''}” — najwcześniej ${dzienMies(kol.minOd)}`);

    const zapisz = useCallback(async (l, galazId, od, ost, tryb) => {
        if (!savePlanDates) return;
        const w = pwOf(galazId);
        const komunikaty = [];
        const min = tryb !== 'r' ? minOdOf(l, galazId) : null;
        if (min && dzien0(od) < min) {
            if (tryb === 'l' || tryb === 'oba') od = min;
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
            const w = pwOf(galazId);
            const stare = Math.max(1, dniRobocze(l.planOd, l.planDo, w));
            const nowe = Math.max(1, dniRobocze(od, ost, w));
            if (stare !== nowe) {
                onDurationChange(l.id, nowe);
                komunikaty.push(<><b>Zmieniono liczbę dni</b> {nazwa(l)}: {stare} → <b>{nowe}</b> {nowe === 1 ? 'dzień' : 'dni'} roboczych (ilość pozycji zaktualizowana).</>);
            }
        }
        if (komunikaty.length) setInfo(komunikaty);
    }, [savePlanDates, savePlanDatesBatch, onDurationChange, pwOf, nazwa, minOdOf, msZaleznosc, msWezly]);

    // @anchor harmonogram-zapisz-zadanie — puszczenie przeciąganego paska zadania: nowe daty od razu na osi,
    // zapis PATCH (synchronizacja Outlook / MS To Do po stronie backendu), błąd albo brak prawa cofa podgląd.
    const zapiszZadanie = useCallback(async (t, tryb, delta) => {
        const pola = przesunZadanie(t, tryb, delta);
        if (!pola) return;
        const stare = { plannedStart: t.plannedStart, plannedEnd: t.plannedEnd };
        const opis = (z) => {
            const a = z.plannedStart ? dzien0(z.plannedStart) : null, b = z.plannedEnd ? dzien0(z.plannedEnd) : null;
            if (!a || !b) return `${b ? 'do' : 'od'} ${dzienMies(a || b)}`;
            return +a === +b ? dzienMies(a) : `${dzienMies(a)}–${dzienMies(b)}`;
        };
        podmienZadanie(t.id, pola);
        try {
            await zapiszDatyZadania(t.id, pola);
            setInfo([<>Zadanie <b>{t.title}</b>: {opis(stare)} → <b>{opis({ ...stare, ...pola })}</b></>]);
            window.dispatchEvent(new CustomEvent('user-tasks-changed'));
        } catch (e) {
            podmienZadanie(t.id, stare);
            setInfo([<span className="hg-info-bad">Nie udało się zmienić dat zadania „{t.title}”: {e?.message || 'błąd zapisu'}</span>]);
        }
    }, [podmienZadanie]);

    // @anchor harmonogram-podglad-zaleznych — podgląd na żywo: przesunięci zależni przeciąganego milestone'a.
    const podgladZal = useMemo(() => {
        if (!drag?.delta || !jestMs(drag.l) || drag.tryb === 'l' || !msZaleznosc || !msWezly) return null;
        const p = przesunMilestone(drag.l, drag.tryb, drag.delta, pwOf(drag.galazId));
        return przesunZaleznych(msWezly, zalezniMilestone(msZaleznosc, drag.l.id), roznicaDniRoboczych(drag.l.planDo, p.ost));
    }, [drag, msZaleznosc, msWezly, pwOf]);

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
            if (d.l._zadanie) { zapiszZadanie(d.l._zadanie, d.tryb, d.delta); return; }
            const { od, ost } = przesunWg(d.l, d.tryb, d.delta, pwOf(d.galazId));
            zapisz(d.l, d.galazId, od, ost, d.tryb);
        };
        window.addEventListener('pointermove', ruch);
        window.addEventListener('pointerup', pusc);
        return () => { window.removeEventListener('pointermove', ruch); window.removeEventListener('pointerup', pusc); };
    }, [ciagnie, zapisz, zapiszZadanie, dzienPx, pwOf]);

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
        const { od, ost } = przesunWg(l, 'move', delta, pwOf(galazId));
        zapisz(l, galazId, od, ost, 'move');
    };
    // Wyjście fokusu z pary pól Od/Do: jeden zapis, tylko gdy data się zmieniła. Przejście między polami nie zamyka edycji.
    const zapiszZPol = (l, galazId, vOd, vDo) => {
        setEdycjaDat(null);
        if (!vOd || !vDo) return;
        let od = dzien0(vOd), ost = dzien0(vDo);
        if (isNaN(od) || isNaN(ost)) return;
        const zmOd = +od !== +dzien0(l.planOd), zmDo = +ost !== +dzien0(l.planDo);
        if (!zmOd && !zmDo) return;
        if (ost < od) { if (zmDo && !zmOd) od = ost; else ost = od; }
        zapisz(l, galazId, od, ost, zmOd && zmDo ? 'oba' : zmOd ? 'l' : 'r');
    };
    const klawiszDaty = (e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
            e.currentTarget.parentElement.querySelectorAll('input').forEach(i => { i.value = i.defaultValue; });
            e.currentTarget.blur();
        }
    };

    // @anchor harmonogram-rysuj-milestone — romb (termin = ostatni dzień okna) i ewentualne okno
    // `planOd..planDo`; przeciąganie rombu przesuwa całość, krawędzie okna je zmieniają.
    const rysujMs = (l, galazId, edyt, wGrupie = false) => {
        const w = pwOf(galazId);
        const dd = drag?.l.id === l.id ? drag : null;
        let a = idx(l.planOd), b = idx(l.planDo);
        if (dd && dd.delta) { const p = przesunMilestone(l, dd.tryb, dd.delta, w); a = idx(p.od); b = idx(p.ost); }
        else if (podgladZal?.[l.id]) { a = idx(podgladZal[l.id].od); b = idx(podgladZal[l.id].ost); }
        if (a === null || b === null || b < 0 || a >= ileDni) return null;
        const kol = kolizjaMsOf(l, galazId);
        const konflikt = !!kol;
        const okno = b > a;
        const tytul = `◆ ${l.name}\nMilestone ${dzienMies(l.planOd)}${okno ? `–${dzienMies(l.planDo)}` : ''}${l._msOpis ? ` · ${l._msOpis}` : ''}${kol ? `\n${opisKolizji(kol)}` : ''}${edyt ? '\nPrzeciągnij romb, by przesunąć' : ''}${onOtworz ? '\nKlik otwiera szczegóły' : ''}`;
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
                                title={`Prognoza ${dzienMies(l._prognoza)} (+${l._prognozaDni} dni rob. ${l._prognozaZLancucha ? "— poślizg poprzedniego milestone'a" : 'z blokerów'})`} />}
                        </>
                    );
                })()}
            </React.Fragment>
        );
    };

    // @anchor harmonogram-podpisy-milestonow — podpisy rombów w wierszu gałęzi: bliskie romby (podpis by
    // się nałożył) łączą się w jeden „nazwa +N”, a milestone'y spoza okna dostają znacznik „‹ data ◆” / „◆ data ›”
    // przy krawędzi (klik = szczegóły). Bez tego milestone poza oknem albo tuż obok innego znikał z widoku.
    const podpisyMs = (milestony) => {
        const lewe = [], prawe = [], w = [];
        for (const m of milestony) {
            const b = idx(m.planDo), a = idx(m.planOd);
            if (b === null) continue;
            if (b < 0) lewe.push(m); else if (a >= ileDni || b >= ileDni) { if (a >= ileDni) prawe.push(m); else w.push({ m, b: ileDni - 1 }); }
            else {
                const p = m._prognoza ? idx(m._prognoza) : null;
                w.push({ m, b: p !== null && p > b && p < ileDni ? p : b });
            }
        }
        w.sort((x, y) => x.b - y.b);
        const grupyP = [];
        let koniec = -Infinity;
        for (const x of w) {
            const left = x.b * dzienPx + dzienPx / 2 + 10;
            if (grupyP.length && left - 18 < koniec) { grupyP[grupyP.length - 1].reszta.push(x.m); continue; }
            const tekst = `${nazwa(x.m)}${x.m._prognozaDni ? ` · prognoza +${x.m._prognozaDni} d.` : ''}`;
            grupyP.push({ left, m: x.m, tekst, reszta: [] });
            koniec = left + tekst.length * 6.2 + 24;
        }
        const otworz = (id) => (e) => { e.stopPropagation(); onOtworz?.(id); };
        const opis = (lista) => lista.map(m => `◆ ${m.name} ${dzienMies(m.planOd)}${+dzien0(m.planDo) !== +dzien0(m.planOd) ? `–${dzienMies(m.planDo)}` : ''}`).join('\n');
        lewe.sort((x, y) => dzien0(y.planDo) - dzien0(x.planDo));
        prawe.sort((x, y) => dzien0(x.planOd) - dzien0(y.planOd));
        return (
            <>
                {grupyP.map(g => (
                    <span key={`tx-${g.m.id}`} className="ms-tx" style={{ left: g.left }} title={opis([g.m, ...g.reszta])}>
                        {g.tekst}{g.reszta.length ? <b> +{g.reszta.length}</b> : null}
                    </span>
                ))}
                {lewe.length > 0 && (
                    <span className={`ms-poza l${lewe.some(m => m._msKonflikt) ? ' late' : ''}`} title={`Poza oknem (wcześniej):\n${opis(lewe)}`} onClick={otworz(lewe[0].id)}>
                        ‹ {dzienMies(lewe[0].planDo)} ◆ {nazwa(lewe[0])}{lewe.length > 1 ? ` +${lewe.length - 1}` : ''}
                    </span>
                )}
                {prawe.length > 0 && (
                    <span className={`ms-poza r${prawe.some(m => m._msKonflikt) ? ' late' : ''}`} title={`Poza oknem (później):\n${opis(prawe)}`} onClick={otworz(prawe[0].id)}>
                        ◆ {nazwa(prawe[0])} {dzienMies(prawe[0].planOd)}{prawe.length > 1 ? ` +${prawe.length - 1}` : ''} ›
                    </span>
                )}
            </>
        );
    };

    // ─── wiersze ────────────────────────────────────────────────────────────
    const wiersze = useMemo(() => {
        return grupyOsi.map(({ galaz, liscie, milestony: ms = [] }) => {
            const pozycje = liscie.map(l => {
                const pasek = (zad || maPasek(l)) && !!l.planOd && !!l.planDo;
                const d0 = pasek ? idx(l.planOd) : null;
                const d1 = pasek ? idx(l.planDo) : null;
                return { l, pasek, d0, d1 };
            }).filter(p => (p.pasek && p.d1 >= 0 && p.d0 < ileDni) || (wszystkie && p.pasek));
            // @anchor harmonogram-milestony-galezi — milestone'y gałęzi (Realizacja) w wierszu gałęzi.
            const milestony = ms.filter(m => m.planOd && m.planDo);
            return { galaz, pozycje, milestony };
        }).filter(g => g.pozycje.length || g.milestony.length);
    }, [grupyOsi, zad, maPasek, idx, ileDni, wszystkie]);

    // @anchor harmonogram-wolne-galezi — ile różnych sobót i niedziel/świąt pracuje gałąź: suma zakresów jej
    // pozycji (bez milestone'ów), dzień wspólny dla kilku pozycji liczony raz. { [galazId]: { sob, nd } }
    const wolneGalezi = useMemo(() => {
        const out = {};
        for (const g of grupy) {
            const p = g.galaz && normPw(pracaWolne[g.galaz.id]);
            if (!p) continue;
            const zbior = { sob: new Set(), nd: new Set() };
            for (const l of g.liscie) {
                if (!maPasek(l) || !l.planOd || !l.planDo || jestMs(l)) continue;
                for (const c = dzien0(l.planOd), b = dzien0(l.planDo); c <= b; c.setDate(c.getDate() + 1)) {
                    const r = rodzajDnia(c);
                    if (r !== 'rob' && p[r]) zbior[r].add(+c);
                }
            }
            out[g.galaz.id] = { sob: zbior.sob.size, nd: zbior.nd.size };
        }
        return out;
    }, [grupy, pracaWolne, maPasek]);

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
    // @anchor harmonogram-excel-data — ten sam kształt co dawne `getExcelData` Gantta (arkusz „Harmonogram")
    // + dni osobno: `rob` (pn–pt), `sob`, `nd` (niedziele/święta), `days` = razem, `pw` = { sob, nd } | null gałęzi.
    const getExcelData = useCallback(() => {
        const zadania = wszystkiePozycje.filter(({ l }) => maPasek(l) && l.planOd && l.planDo)
            .map(({ l, galazId }) => ({ id: l.id, type: jestMs(l) ? 'milestone' : 'task', name: `${jestMs(l) ? '◆ ' : ''}${nazwa(l)}`, start: dzien0(l.planOd), end: dodajDni(l.planDo, 1), galazId }));
        const mapaGalezi = Object.fromEntries(zadania.map(t => [t.id, t.galazId]));
        const rows = zadania.map(t => {
            const w = pwOf(t.galazId);
            const ms = t.type === 'milestone';
            const x = ms ? { rob: 0, sob: 0, nd: 0, razem: 0 } : liczDniPracy(t.start, dodajDni(t.end, -1), w);
            return {
                id: t.id, name: t.name, start: toExcelUtcDate(t.start), end: toExcelUtcDate(dodajDni(t.end, -1)),
                days: x.razem, rob: x.rob, sob: x.sob, nd: x.nd, milestone: ms, pw: w,
            };
        });
        let span = 0;
        if (zadania.length) span = roznicaDni(zadania.reduce((m, t) => (t.end > m ? t.end : m), zadania[0].end), zadania.reduce((m, t) => (t.start < m ? t.start : m), zadania[0].start));
        const mode = span <= 92 ? 'Day' : span <= 400 ? 'Week' : 'Month';
        const timeline = buildExcelTimeline(zadania, mode, pracaWolne, mapaGalezi, projectStart, projectEnd);
        return { rows, totalDays: rows.reduce((s, r) => s + r.days, 0), projectName: nazwaProjektu, projectStart, projectEnd, timeline };
    }, [wszystkiePozycje, maPasek, nazwa, pwOf, pracaWolne, projectStart, projectEnd, nazwaProjektu]);

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
        // Kolumny „Sob.” i „Nd./św.” tylko gdy któraś pozycja faktycznie pracuje w takie dni.
        const liczby = new Map(zadania.filter(({ l }) => !jestMs(l)).map(({ l, galazId }) => [l.id, liczDniPracy(l.planOd, l.planDo, pwOf(galazId))]));
        const zWolnymi = [...liczby.values()].some(x => x.sob || x.nd);
        const lewa = 440 + (zWolnymi ? 76 : 0);
        const kolWolne = (sob, nd) => (zWolnymi ? `<div style="width:38px;text-align:center">${sob}</div><div style="width:38px;text-align:center">${nd}</div>` : '');
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
        const wiersz = (tekst, od, ost, dniR, pasekHtml, grp, sob = '', nd = '') => `<div style="display:flex;height:${grp ? 22 : 24}px;border-bottom:1px solid #e2e8f0;${grp ? 'background:#f1f5f9;font-weight:700;' : ''}">
<div style="width:${lewa}px;flex:none;display:flex;font-size:10px;align-items:center">
<div style="flex:1;padding:0 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${tekst}</div>
<div style="width:62px;text-align:center">${od}</div><div style="width:62px;text-align:center">${ost}</div><div style="width:40px;text-align:center">${dniR}</div>${kolWolne(sob, nd)}</div>
<div style="position:relative;width:${W}px;flex:none">${pasekHtml}</div></div>`;
        let body = '';
        for (const g of grupy) {
            const poz = g.liscie.filter(l => maPasek(l) && l.planOd && l.planDo);
            if (!poz.length) continue;
            if (g.galaz) {
                const p = pwOf(g.galaz.id);
                const praca = p ? ` <span style="font-weight:400;color:#b45309">· pracuje w ${[p.sob && 'soboty', p.nd && 'niedziele i święta'].filter(Boolean).join(' i ')}</span>` : '';
                body += wiersz(esc(nazwa(g.galaz)) + praca, '', '', '', '', true);
            }
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
                const x = liczby.get(l.id);
                body += wiersz(esc(nazwa(l)), dzienMies(l.planOd), dzienMies(l.planDo), zWolnymi ? x.rob : x.razem, bar, false, x.sob || '', x.nd || '');
            }
        }
        const html = `<div style="font-family:Inter,system-ui,sans-serif;color:#0b0f17;background:#fff;width:${lewa + W}px">
<div style="display:flex;height:20px;border-bottom:1px solid #94a3b8;font-size:9px;font-weight:700;color:#475569">
<div style="width:${lewa}px;flex:none;display:flex;align-items:center"><div style="flex:1;padding:0 6px">Pozycja</div><div style="width:62px;text-align:center">Od</div><div style="width:62px;text-align:center">Do</div><div style="width:40px;text-align:center">${zWolnymi ? 'Dni rob.' : 'Dni'}</div>${kolWolne('Sob.', 'Nd./św.')}</div>
<div style="position:relative;width:${W}px;flex:none">${naglowek}</div></div>
<div style="position:relative">
<div style="position:absolute;top:0;bottom:0;left:${lewa}px;width:${W}px">${tlo.join('')}${marker(projectStart, '#22c55e')}${marker(projectEnd, '#ef4444')}</div>
<div style="position:relative">${body}</div></div></div>`;
        return { html, styles: '', contentWidth: lewa + W };
    }, [wszystkiePozycje, grupy, maPasek, nazwa, pwOf, projectStart, projectEnd]);

    useEffect(() => { onApi?.({ getExcelData, getHtml }); }, [onApi, getExcelData, getHtml]);

    // ─── render ─────────────────────────────────────────────────────────────
    const navKrok = zakres === 'miesiac' ? 1 : 7;
    const opisOkna = zakres === 'miesiac'
        ? `${MIESIACE[start.getMonth()]} ${start.getFullYear()}`
        : `${dzienMies(dni[0])}–${dzienMies(dni[ileDni - 1])}`;

    // @anchor harmonogram-okno-nowego-ms — okienko nazwy nowego milestone'a przy klikniętym dniu wiersza gałęzi.
    const zapiszNowyMs = async () => {
        if (!nowyMs || nowyMs.zapis) return;
        const nazwaMs = nowyMs.nazwa.trim();
        if (!nazwaMs) { setNowyMs(v => ({ ...v, blad: "Wpisz nazwę milestone'a" })); return; }
        const dzien = dni[nowyMs.i];
        setNowyMs(v => ({ ...v, zapis: true, blad: '' }));
        try {
            const r = await onDodajMs(nowyMs.galazId, dzien, nazwaMs);
            setNowyMs(null);
            setInfo([<>Dodano <b>◆ {nazwaMs}</b> na <b>{dzienMies(dzien)}</b> · zależnych pozycji: <b>{r?.zaleznych ?? 0}</b></>]);
        } catch (e) {
            setNowyMs(v => (v ? { ...v, zapis: false, blad: e?.message || 'Nie udało się zapisać' } : v));
        }
    };
    const oknoNowegoMs = (st) => (
        <div className="hg-nowy-ms" style={{ left: Math.max(0, st.i * dzienPx - 4) }} onClick={e => e.stopPropagation()}>
            <div className="hg-nowy-ms-g">◆ {dzienMies(dni[st.i])}</div>
            <input autoFocus value={st.nazwa} placeholder="Nazwa milestone'a" disabled={st.zapis}
                onChange={e => setNowyMs(v => ({ ...v, nazwa: e.target.value, blad: '' }))}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') zapiszNowyMs(); if (e.key === 'Escape') setNowyMs(null); }} />
            <div className="hg-nowy-ms-p">{st.blad ? <span className="hg-info-bad">{st.blad}</span> : (st.zapis ? 'Zapisuję…' : 'Enter — dodaj · Esc — anuluj')}</div>
        </div>
    );

    // ─── tryb zadań ─────────────────────────────────────────────────────────
    // @anchor harmonogram-wiersz-zadania — etykieta: tytuł (klik = formularz), Od–Do albo „do X”, status,
    // odpowiedzialny; na osi pasek w kolorze statusu albo znacznik terminu. Otwarte po terminie — czerwona obwódka.
    const otworzZadanie = (t) => (onOtworzZadanie ? onOtworzZadanie(t) : setZadanieOtwarte(t));
    // @anchor harmonogram-nowe-zadanie — nowe zadanie z Harmonogramu: klik w dzień wiersza gałęzi (węzeł = gałąź,
    // Od = ten dzień) albo „+ Zadanie” (węzeł = gałąź zoomu, Od = dziś). Węzeł w formularzu można zmienić.
    const noweZadanie = (wbsNodeId, date) => (onOtworzZadanie
        ? onOtworzZadanie(null, { wbsNodeId: wbsNodeId || null, date })
        : setZadanieOtwarte({ _nowe: true, wbsNodeId: wbsNodeId || null, date }));
    const kto = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '' : '');
    const poTerminie = (l) => !isTaskClosed(l._zadanie.status) && l.planDo < dzis;
    const datyZadania = (l) => (l._termin
        ? `${l._zadanie.plannedEnd ? 'do' : 'od'} ${dzienMies(l.planOd)}`
        : +l.planOd === +l.planDo ? dzienMies(l.planOd) : `${dzienMies(l.planOd)}–${dzienMies(l.planDo)}`);
    const opisZadania = (l) => {
        const t = l._zadanie;
        return [t.title, `${datyZadania(l)}${poTerminie(l) ? ' · po terminie' : ''}`,
            `Status: ${EXEC_STATUS_META[t.status]?.label || t.status}`, t.user && `Odpowiedzialny: ${kto(t.user)}`,
            t.wbsNode?.name && `Pozycja WBS: ${t.wbsNode.name}`, 'Klik otwiera zadanie'].filter(Boolean).join('\n');
    };
    const lewaZadania = (l) => {
        const t = l._zadanie;
        return (
            <div key={l.id} className="hg-lbl hg-zad" style={{ height: ROW_H }} title={opisZadania(l)}>
                <span className={`t klik${isTaskClosed(t.status) ? ' zamk' : ''}`} onClick={() => otworzZadanie(t)}>{t.title}</span>
                <span className="m">
                    <span className={`daty${poTerminie(l) ? ' po' : ''}`}>{datyZadania(l)}</span>
                    <span className={`z-st s-${t.status}`}>{EXEC_STATUS_META[t.status]?.label || t.status}</span>
                    {t.user && <span className="z-kto">{kto(t.user)}</span>}
                </span>
            </div>
        );
    };
    // @anchor harmonogram-drag-zadania — przeciąganie paska zadania (move) i jego krawędzi (Od / Do), znacznik
    // terminu tylko przesuwa; wolno odpowiedzialnemu albo zlecającemu (`moze-przesunac-zadanie`). Krok = dzień kalendarzowy.
    const prawaZadania = (l, r0, r1) => {
        const t = l._zadanie;
        const edyt = mozePrzesunac(t, uid);
        const dd = drag?.l.id === l.id ? drag : null;
        let d0 = r0, d1 = r1;
        if (dd?.delta) {
            if (dd.tryb === 'move' || l._termin) { d0 += dd.delta; d1 += dd.delta; }
            else if (dd.tryb === 'l') d0 = Math.min(d0 + dd.delta, d1);
            else d1 = Math.max(d1 + dd.delta, d0);
        }
        const widoczny = d1 >= 0 && d0 < ileDni;
        const od = widoczny ? Math.max(d0, 0) : -1;
        const dl = widoczny ? Math.min(d1, ileDni - 1) - od + 1 : 0;
        const poza = widoczny ? null : (d1 < 0 ? 'l' : 'r');
        const klasa = `z-${t.status}${poTerminie(l) ? ' po' : ''}${edyt ? ' drag' : ''}${dd ? ' ciagniety' : ''}`;
        const klik = (e) => { e.stopPropagation(); if (!poDragu.current) otworzZadanie(t); };
        const tytul = `${opisZadania(l)}${edyt ? `\n${l._termin ? 'Przeciągnij, by przesunąć termin' : 'Przeciągnij, by przesunąć · krawędź zmienia Od / Do'}` : ''}`;
        return (
            <div key={l.id} className="hg-tor" style={{ height: ROW_H }}>
                {widoczny && l._termin && (
                    <span className={`z-termin ${klasa}`} style={{ left: d0 * dzienPx + dzienPx / 2 - 6 }} title={tytul} onClick={klik}
                        onPointerDown={edyt ? e => zacznij(e, l, null, 'move') : undefined} />
                )}
                {widoczny && !l._termin && (
                    <div className={`bar z-bar ${klasa}${d0 < 0 ? ' cut-l' : ''}${d1 >= ileDni ? ' cut-r' : ''}`}
                        style={{ left: od * dzienPx + 2, width: Math.max(6, dl * dzienPx - 4) }} title={tytul} onClick={klik}
                        onPointerDown={edyt ? e => zacznij(e, l, null, 'move') : undefined}>
                        {edyt && d0 >= 0 && <span className="uchwyt l" onPointerDown={e => zacznij(e, l, null, 'l')} />}
                        {dl * dzienPx > 50 && <span className="tx">{kto(t.user) || EXEC_STATUS_META[t.status]?.label || ''}</span>}
                        {edyt && d1 < ileDni && <span className="uchwyt r" onPointerDown={e => zacznij(e, l, null, 'r')} />}
                    </div>
                )}
                {poza && (
                    <span className={`poza ${poza}`} title={opisZadania(l)}>
                        {poza === 'l' ? `‹ ${dzienMies(l.planDo)}` : `${dzienMies(l.planOd)} ›`}
                    </span>
                )}
            </div>
        );
    };
    const nazwaBezGalezi = zakresIds ? 'Ta gałąź' : 'Bez pozycji WBS';

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
                    {processNodeId && (
                        <button className={`hg-tryb${trybZadan ? ' on' : ''}`} onClick={() => setTrybZadan(!trybZadan)}
                            title={trybZadan ? 'Klik — wróć do harmonogramu pozycji WBS' : 'Pokaż zadania zamówienia (Od–Do, status, odpowiedzialny) zamiast pozycji WBS'}>
                            Harmonogram zadań
                        </button>
                    )}
                    {zad && (
                        <button onClick={() => noweZadanie(galazWprostId, dzis)} title="Nowe zadanie od dziś — węzeł WBS wybierasz w formularzu">+ Zadanie</button>
                    )}
                    {zakres !== 'calosc' && <label><input type="checkbox" checked={wszystkie} onChange={e => setWszystkie(e.target.checked)} /> {zad ? 'wszystkie zadania' : 'wszystkie roboty'}</label>}
                </div>
                {zad
                    ? <span>{zakres === 'calosc' ? 'Wszystkie zadania' : `Okno ${opisOkna}`}. Zadania zamówienia wg dat Od–Do, kolor = status{zad.bezDat ? ` · ${zad.bezDat} bez dat (poza osią)` : ''}. Klik w zadanie otwiera formularz, przeciągnięcie paska przesuwa daty (krawędź — Od / Do), klik w dzień w wierszu gałęzi dodaje zadanie.</span>
                    : <span>{zakres === 'calosc' ? 'Cały harmonogram' : `Okno ${opisOkna}`}. Jedno źródło dat dla Planowania i Realizacji{canEdit && savePlanDates ? ' — przeciągnij pasek, rozciągnij za krawędź, kliknij dzień, by przenieść start, albo kliknij daty przy nazwie' : ''}{onOtworz ? '. Klik w nazwę otwiera pozycję' : ''}.</span>}
            </div>

            {!wiersze.length ? (
                <div className="empty">{zad ? (zadania === null ? 'Wczytywanie zadań…' : bladZadan || 'Brak zadań z datami w tym zakresie.') : 'Brak robót w tym zakresie.'}</div>
            ) : (
                <div className={`hg-scroll${drag ? ' ciagnie' : ''}`}>
                    <div className="hg-grid" style={{ gridTemplateColumns: `${LABEL_W}px ${szer}px` }}>
                        {/* lewa kolumna: nazwy */}
                        <div className="hg-lewa">
                            <div className="hg-head-l" style={{ height: HEAD_H }}>{zad ? 'Zadanie · status · odpowiedzialny' : `Pozycja${gotowosc ? ' · gotowość' : ''}`}</div>
                            {wiersze.map(({ galaz, pozycje, milestony }) => (
                                <React.Fragment key={galaz?.id || '_wprost'}>
                                    {!galaz && zad && (
                                        <div className="hg-grp" style={{ height: GRP_H }}>
                                            <span className="n">{nazwaBezGalezi}</span>
                                            <span className="mono"> · {pozycje.length}</span>
                                        </div>
                                    )}
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
                                            {canEdit && savePlanDates && !zad && (
                                                <span className="pw">
                                                    {RODZAJE_WOLNYCH.map(([k, kr, dl]) => {
                                                        const on = !!pracaWolne[galaz.id]?.[k];
                                                        const ile = wolneGalezi[galaz.id]?.[k] || 0;
                                                        return (
                                                            <button key={k} className={`wow ${k}${on ? ' on' : ''}`} onClick={() => przelaczWolne(galaz.id, k)}
                                                                title={on
                                                                    ? `Gałąź pracuje w ${dl}: ${ile} ${kr} w harmonogramie gałęzi, liczone osobno od dni roboczych.\nKlik — bez pracy w ${dl}.`
                                                                    : `Gałąź nie pracuje w ${dl}.\nKlik — pracuje w ${dl} (wpływa na przesuwanie pasków i liczbę dni pracy).`}>
                                                                {on ? `+${ile} ${kr}` : `bez ${kr}`}
                                                            </button>
                                                        );
                                                    })}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {pozycje.map(({ l, pasek }) => {
                                        if (zad) return lewaZadania(l);
                                        const w = pwOf(galaz?.id);
                                        const ileDniL = pasek && !jestMs(l) ? liczDniPracy(l.planOd, l.planDo, w) : null;
                                        const edyt = canEdit && !!savePlanDates && pasek && !opisPaska(l).zablokowany;
                                        const ed = edycjaDat === l.id;
                                        return (
                                            <div key={l.id} className={`hg-lbl${onPrzestaw ? ' przest' : ''}${cel?.id === l.id ? ` drop-${cel.gdzie}` : ''}`}
                                                style={{ height: jestMs(l) ? ROW_H_MS : ROW_H, paddingLeft: 8 + (pokazWciecia ? Math.max(0, (l.depth || 0) - 1) * 10 : 0) }}
                                                draggable={!!onPrzestaw && !ed}
                                                title={onPrzestaw ? 'Przeciągnij, by zmienić kolejność albo przenieść do gałęzi upuszczonego wiersza (zmienia też WBS)' : undefined}
                                                onDragStart={onPrzestaw ? (e) => { przeciagany.current = l.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id); } : undefined}
                                                onDragEnd={onPrzestaw ? () => { przeciagany.current = null; setCel(null); } : undefined}
                                                onDragOver={onPrzestaw ? (e) => {
                                                    if (!przeciagany.current || przeciagany.current === l.id) return;
                                                    e.preventDefault();
                                                    const r = e.currentTarget.getBoundingClientRect();
                                                    const gdzie = e.clientY - r.top < r.height / 2 ? 'przed' : 'po';
                                                    if (cel?.id !== l.id || cel?.gdzie !== gdzie) setCel({ id: l.id, gdzie });
                                                } : undefined}
                                                onDrop={onPrzestaw ? (e) => { e.preventDefault(); upusc(l.id, cel?.id === l.id ? cel.gdzie : 'po'); } : undefined}>
                                                <span className={`t${onOtworz ? ' klik' : ''}${jestMs(l) ? ' ms-n' : ''}`} title={l.name} onClick={onOtworz ? () => onOtworz(l.id) : undefined}>{jestMs(l) ? '◆ ' : ''}{nazwa(l)}</span>
                                                <span className="m">
                                                    {pasek && !ed && (
                                                        <span className={`daty${edyt ? ' ed' : ''}`} onClick={edyt ? () => setEdycjaDat(l.id) : undefined}
                                                            title={[ileDniL && opisDniDlugi(ileDniL), edyt && 'Klik — zmień daty'].filter(Boolean).join('\n') || undefined}>
                                                            {jestMs(l)
                                                                ? `milestone ${dzienMies(l.planOd)}${+dzien0(l.planDo) !== +dzien0(l.planOd) ? `–${dzienMies(l.planDo)}` : ''}`
                                                                : <>{dzienMies(l.planOd)}–{dzienMies(l.planDo)} · {ileDniL.rob} d.{ileDniL.sob > 0 && <b className="pw-l sob"> + {ileDniL.sob} sob.</b>}{ileDniL.nd > 0 && <b className="pw-l nd"> + {ileDniL.nd} nd.</b>}</>}
                                                        </span>
                                                    )}
                                                    {pasek && ed && (
                                                        <span className="daty-in" onBlur={e => {
                                                            if (e.currentTarget.contains(e.relatedTarget)) return;
                                                            const [od, ost] = e.currentTarget.querySelectorAll('input');
                                                            zapiszZPol(l, galaz?.id, od.value, ost.value);
                                                        }}>
                                                            <input type="date" defaultValue={doInputu(l.planOd)} onKeyDown={klawiszDaty} autoFocus />
                                                            <input type="date" defaultValue={doInputu(l.planDo)} onKeyDown={klawiszDaty} />
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
                                        {(galaz || milestony.length > 0 || zad) && (() => {
                                            const gId = galaz?.id || galazWprostId;
                                            if (zad) {
                                                return (
                                                    <div className="hg-grp-t ms-dodaj" style={{ height: GRP_H }} title="Klik w dzień — nowe zadanie w tej gałęzi od tego dnia"
                                                        onClick={(e) => {
                                                            const r = e.currentTarget.getBoundingClientRect();
                                                            const i = Math.floor((e.clientX - r.left) / dzienPx);
                                                            if (i >= 0 && i < ileDni) noweZadanie(gId, dni[i]);
                                                        }} />
                                                );
                                            }
                                            const mozna = !!onDodajMs && !!gId;
                                            const otwarty = mozna && nowyMs?.galazId === gId;
                                            return (
                                                <div className={`hg-grp-t${mozna ? ' ms-dodaj' : ''}`} style={{ height: GRP_H, ...(otwarty ? { zIndex: 30 } : {}) }}
                                                    title={mozna ? "Klik w dzień — nowy milestone w tej gałęzi" : undefined}
                                                    onClick={mozna ? (e) => {
                                                        if (drag || poDragu.current || e.target?.closest?.('.ms, .ms-okno, .ms-tx, .ms-poza, .hg-nowy-ms')) return;
                                                        const r = e.currentTarget.getBoundingClientRect();
                                                        const i = Math.floor((e.clientX - r.left) / dzienPx);
                                                        if (i < 0 || i >= ileDni) return;
                                                        setNowyMs({ galazId: gId, i, nazwa: '', blad: '', zapis: false });
                                                    } : undefined}>
                                                    {milestony.map(m => rysujMs(m, galaz?.id || null, canEdit && !!savePlanDates && !opisPaska(m).zablokowany, true))}
                                                    {podpisyMs(milestony)}
                                                    {otwarty && oknoNowegoMs(nowyMs)}
                                                </div>
                                            );
                                        })()}
                                        {pozycje.map(({ l, pasek, d0: r0, d1: r1 }) => {
                                            if (zad) return prawaZadania(l, r0, r1);
                                            const galazId = galaz?.id || null;
                                            const w = pwOf(galazId);
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
                                            const kol = pasek && !jestMs(l) ? kolizjaMsOf(l, galazId) : null;
                                            const konflikt = !!kol;
                                            // @anchor harmonogram-cien-kolizji — przy kolizji: gdzie pozycja najwcześniej wypadnie
                                            // (start po milestonie / jego prognozie, ta sama liczba dni pracy). Zapisane daty bez zmian.
                                            const cien = kol ? prognozaZaleznego(l.planOd, l.planDo, kol.minOd, w) : null;
                                            const cA = cien ? idx(cien.od) : null, cB = cien ? idx(cien.ost) : null;
                                            const cienWidoczny = !!cien && cB >= 0 && cA < ileDni;
                                            const widoczny = pasek && d1 >= 0 && d0 < ileDni;
                                            const od = widoczny ? Math.max(d0, 0) : -1;
                                            const dl = widoczny ? Math.min(d1, ileDni - 1) - od + 1 : 0;
                                            // Dni wolne wewnątrz paska: przerwa, gdy gałąź w ten dzień nie pracuje; znacznik
                                            // soboty / niedzieli-święta, gdy pracuje (liczone osobno od dni roboczych).
                                            const wolneWPasku = widoczny && dzienPx >= 8
                                                ? wolne.filter(i => i >= od && i <= od + dl - 1).map(i => ({ i: i - od, r: czyWolnyDla(dni[i], w) ? null : rodzajDnia(dni[i]) })) : [];
                                            const ileDniL = pasek && !jestMs(l) ? liczDniPracy(l.planOd, l.planDo, w) : null;
                                            const poza = pasek && !widoczny ? (d1 < 0 ? 'l' : 'r') : null;
                                            return (
                                                <div key={l.id} className={`hg-tor${edyt ? ' plan' : ''}${jestMs(l) ? ' ms-row' : ''}`} style={{ height: jestMs(l) ? ROW_H_MS : ROW_H }}
                                                    onClick={edyt ? (e) => klikToru(e, l, galazId) : undefined}>
                                                    {jestMs(l) && pasek && rysujMs(l, galazId, edyt)}
                                                    {cienWidoczny && (
                                                        <div className={`bar-cien${cA < 0 ? ' cut-l' : ''}${cB >= ileDni ? ' cut-r' : ''}`}
                                                            style={{ left: Math.max(cA, 0) * dzienPx + 2, width: Math.max(6, (Math.min(cB, ileDni - 1) - Math.max(cA, 0) + 1) * dzienPx - 4) }}
                                                            title={`${l.name}\nNajwcześniej ${dzienMies(cien.od)}–${dzienMies(cien.ost)} (+${roznicaDniRoboczych(l.planOd, cien.od)} dni rob.)\n${opisKolizji(kol)}`} />
                                                    )}
                                                    {widoczny && !jestMs(l) && (
                                                        <div className={`bar ${opis.klasa}${d0 < 0 ? ' cut-l' : ''}${d1 >= ileDni ? ' cut-r' : ''}${edyt ? ' drag' : ''}${dd ? ' ciagniety' : ''}${konflikt ? ' konflikt' : ''}${podgladZal?.[l.id] ? ' podglad' : ''}`}
                                                            style={{ left: od * dzienPx + 2, width: Math.max(6, dl * dzienPx - 4) }}
                                                            onPointerDown={edyt ? e => zacznij(e, l, galazId, 'move') : undefined}
                                                            onClick={e => e.stopPropagation()}
                                                            title={`${l.name}\nRoboty ${dzienMies(l.planOd)}–${dzienMies(l.planDo)} · ${opisDniDlugi(ileDniL)}${opis.tekst ? ` · ${opis.tekst}` : ''}${kol ? `\n${opisKolizji(kol)}` : ''}`}>
                                                            {wolneWPasku.map(({ i, r }) => <i key={i} className={r ? `pw-dzien ${r}` : 'przerwa'} style={{ left: i * dzienPx - 2, width: dzienPx }} />)}
                                                            {edyt && d0 >= 0 && <span className="uchwyt l" onPointerDown={e => zacznij(e, l, galazId, 'l')} />}
                                                            {dl * dzienPx > 50 && <span className="tx">{opis.tekst || opisDni(ileDniL)}</span>}
                                                            {edyt && d1 < ileDni && <span className="uchwyt r" onPointerDown={e => zacznij(e, l, galazId, 'r')} />}
                                                        </div>
                                                    )}
                                                    {poza && (!jestMs(l) || !widoczny) && (
                                                        <span className={`poza ${poza}`} title={`Roboty ${dzienMies(l.planOd)}–${dzienMies(l.planDo)} — poza oknem`}>
                                                            {poza === 'l' ? `‹ ${dzienMies(l.planDo)}` : `${dzienMies(l.planOd)} ›`}
                                                        </span>
                                                    )}
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

            {zad ? (
                <div className="legend">
                    {TASK_STATUS_CODES.map(s => <span key={s}><i className={`bar z-bar z-${s}`} />{EXEC_STATUS_META[s]?.label?.toLowerCase() || s}</span>)}
                    <span><i className="z-termin z-TO_DO" />sam termin (Do)</span>
                    <span><i className="bar z-bar z-TO_DO po" />po terminie</span>
                    <span><i className="sw-wolny" />dzień wolny</span>
                    {(projectStart || projectEnd) && <><span><i className="sw-mark ps" />start projektu</span><span><i className="sw-mark pe" />koniec</span></>}
                </div>
            ) : (
            <div className="legend">
                <span><i className="bar b-work" />roboty</span>
                {opisPaska !== domyslnyOpis && <><span><i className="bar b-done" />wykonane</span><span><i className="bar b-hold" />wstrzymane</span></>}
                <span><i className="ms" />milestone</span>
                <span><i className="ms-okno" />okno milestone'a</span>
                {msZaleznosc && <span><i className="bar b-work konflikt" />kolizja z milestone'em</span>}
                {msZaleznosc && <span><i className="sw-cien-kol" />gdzie wypadnie przy kolizji</span>}
                {grupy.some(g => (g.milestony || []).some(m => m._prognoza)) && <span><i className="ms-cien" />prognoza milestone'a (blokery)</span>}
                <span><i className="sw-wolny" />dzień wolny</span>
                {Object.values(pracaWolne).some(p => p?.sob) && <span><i className="sw-pw sob" />praca w sobotę</span>}
                {Object.values(pracaWolne).some(p => p?.nd) && <span><i className="sw-pw nd" />praca w niedzielę / święto</span>}
                {(projectStart || projectEnd) && <><span><i className="sw-mark ps" />start projektu</span><span><i className="sw-mark pe" />koniec</span></>}
                {gotowosc && <span className="ready"><span className="r-ok">MAT</span><span className="r-q">PYT</span><span className="r-no">BLK</span> gotowość: materiał, pytania, blokery</span>}
            </div>
            )}

            {zadanieOtwarte && (
                <TaskModal
                    task={zadanieOtwarte._nowe ? null : zadanieOtwarte} processNodeId={processNodeId}
                    defaults={zadanieOtwarte._nowe ? { wbsNodeId: zadanieOtwarte.wbsNodeId, date: zadanieOtwarte.date } : {}}
                    onClose={() => setZadanieOtwarte(null)}
                    onSaved={() => { setZadanieOtwarte(null); window.dispatchEvent(new CustomEvent('user-tasks-changed')); }}
                />
            )}

            {info && (
                <div className="hg-info" onClick={() => setInfo(null)}>
                    {info.map((t, i) => <div key={i}>{t}</div>)}
                </div>
            )}
        </div>
    );
}
