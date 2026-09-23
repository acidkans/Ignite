// Zakładka „Realizacja_new" — ścieżka ODCZYTU nowego układu realizacji, przeniesiona
// z makiety `test/prototypy-realizacja/5-split-zakupy.html` na żywe dane z API.
//
// Czym się różni od `RealizationTab`:
//   • trzy panele zamiast jednej tabeli — lewo GDZIE (drzewo gałęzi), środek ILE I ZA CO
//     (14 kolumn + szuflada zakupów), prawo CO DOKŁADNIE (karta pozycji);
//   • grupowanie po `branchId` (najbliższa gałąź w górę), a nie po `parentId` — w realnych
//     danych liść bywa podwieszony pod innym liściem („licencja ACC7" pod kamerą Avigilon)
//     i grupowanie po rodzicu wsadzało go pod nieistniejącą gałąź;
//   • kolumny przycięte z 16 do 13 na podstawie zawartości prawdziwego zamówienia
//     (uzasadnienia przy `REALIZATION_NEW_COLS`).
//
// Widok ZAPISUJE: osie realizacji (`WbsNode.purchaseStatus` / `execStatus`), komentarz pozycji,
// wpisy `LeafActual` (dodanie, poprawka w miejscu, usunięcie) i znacznik „rozliczone" — tymi
// samymi endpointami co `RealizationTab` i z tą samą regułą „cofnięcie zakupu cofa wykonanie".
// Poza zapisem zostają: status PLANU (decyduje o nim Struktura projektu, nie realizacja),
// filtry, sortowanie, eksport Excel i protokół odbioru.
import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronRight, Loader2, Plus, Trash2, FileSpreadsheet, FileText, ExternalLink } from 'lucide-react';
import { API_URL } from '../../config';
import { useDevice } from '../../hooks/useDevice';
import SupplierPicker from './SupplierPicker';
import AutoResizeTextarea from './wbs/AutoResizeTextarea';
import FilterDropdown from './wbs/FilterDropdown';
import ProtokolOdbioruModal from './wbs/ProtokolOdbioruModal';
// Kafel podglądu produktu jest TEN SAM, co w zakładce „Realizacja" i w karcie produktu —
// zdjęcie wisi na `MaterialRequirement.imageUrl`, więc druga implementacja pokazywałaby ten
// sam plik innym zachowaniem (wklejanie, lightbox, kasowanie).
import { RequirementImageBox } from './wbs/WbsMaterialsPanel';
// Eksport Excel i protokół odbioru są WSPÓLNE z zakładką „Realizacja" — ten sam arkusz i ten
// sam modal, tylko wywołane z innej tabeli. Kopia dałaby dwa pliki o tej samej nazwie
// i różnej zawartości.
import { eksportRealizacjiXlsx } from './RealizationTab';
// Bilans stanu wykonania liczy moduł wspólny z eksportem Excel — tabela na ekranie i arkusz
// „Podsumowanie" muszą pokazywać ten sam podział.
import { liczBilansWykonania, NIEROZPOCZETE_LABEL } from './wbs/realizationBilans';
import {
    PLAN_STATUS_META, planStatusFromAny, PURCHASE_STATUS_META, EXEC_STATUS_META, execStatusLabel,
    hasPurchaseAxis, hasExecAxis, DEFAULT_PURCHASE_STATUS, DEFAULT_EXEC_STATUS, axisGateOf,
    AXIS_STATUS_ORDER, sanitizeQtyInput, parsePriceInput, DRAWER, buildOwnerOptions,
} from './wbs/wbsConstants';
import {
    TYPE_META, LEAF_TYPES, OPEN_LEAF_TYPES, authHeaders, flattenWbsNodes, getParentPath, leafNodesOf, buildCardMap,
    wbsRootOf, purchaseUnitOf, REAL_STATE, realizationOf, planUnitOf, planValueOf, fmtQty, fmtZl, fmtDate,
    markOutOfBaseline, POZA_BASELINE_META,
} from './wbs/realizationShared';
import {
    ENTRY_INPUT, FORMULA_HINT, NUMERIC_ENTRY_FIELDS, growsWithText, resolveEntryNumber,
    selectAllOnFocus, focusNextInRow,
} from './wbs/entryFields';

// @anchor realization-new-synthetic-root — w bazie gałęzie najwyższego poziomu mają
// `parentId = NULL`, więc drzewo nie ma jednego wierzchołka. Lewy panel go potrzebuje,
// więc dokładamy syntetyczny korzeń. Nie jest zapisywany nigdzie — żyje tylko w widoku.
export const SYNTHETIC_ROOT = '__root__';

// @anchor realization-new-cols — 14 kolumn tabeli pozycji. Wobec `COL_DEFS` z `RealizationTab`
// wypadły trzy, każda z powodu sprawdzonego na prawdziwym zamówieniu:
//   „Przedmiot projektu" — gałąź wybiera się w lewym panelu, kolumna powtarzałaby wybór;
//   „Produkt / zakres"   — powtarzał „Nazwę" w 77 z 80 pozycji (29× identyczna nazwa karty,
//                          48 liści bez karty); tożsamość produktu niesie szuflada i karta;
//   „Dokument"           — 0 z 8 wpisów ma numer; został w szufladzie, bo faktura opisuje
//                          pojedynczy zakup, a nie pozycję.
//   „Wpisy"              — licznik powtarzał strzałkę rozwijania i nagłówek panelu.
// Doszły dwie: „Typ" — pod nazwą dokładał każdemu wierszowi trzecią linię, jako kolumna daje
// się przebiec wzrokiem w pionie; „Osoba odpowiedzialna" — przy zakupach pierwsze pytanie po
// „co i za ile" brzmi „kogo o to zapytać".
// `prio` — kolejność ustępowania przy wąskiej tabeli (patrz `realization-new-col-prio`).
// 1 = zdanie o pozycji, którego nie da się skrócić: co, ile w planie, ile kupione/zrobione,
//     za ile i na czym stoi zakup;
// 2 = kontekst kwotowy i wykonawczy — typ, oferent, ceny jednostkowe, oś wykonania;
// 3 = to, co i tak stoi w karcie pozycji po prawej — delta, status oferty, komentarz.
export const REALIZATION_NEW_COLS = [
    { key: 'name',           label: 'Nazwa',              w: 480, prio: 1 },
    { key: 'type',           label: 'Typ',                w: 150, prio: 2 },
    // `WbsNode.owner` — kto odpowiada za pozycję. EDYTOWALNA w miejscu (`realization-new-owner-cell`):
    // odpowiada na pytanie „kogo o to zapytać", które przy zakupach pada częściej niż jakiekolwiek
    // inne, a odpowiedź na nie zmienia się właśnie w trakcie zakupów — odsyłanie po każdą taką
    // zmianę do Struktury projektu znaczyło porzucenie listy zakupowej w pół drogi.
    // Lista wyboru jest WSPÓLNA ze Strukturą projektu (`build-owner-options`), bo `WbsNode.owner`
    // trzyma etykietę, nie klucz obcy.
    { key: 'owner',          label: 'Osoba odpowiedzialna', w: 260, prio: 2 },
    // „Oferent", nie „Dostawca": `LeafActual.supplierId` niesie tego, KTO DAŁ CENĘ. Dostawcą
    // stanie się dopiero wtedy, gdy przy wpisie pojawi się faktura albo WZ.
    { key: 'supplier',       label: 'Oferent',            w: 300, prio: 2 },
    { key: 'qty',            label: 'Ilość wyceny',       w: 185, prio: 1, right: true },
    { key: 'realization',    label: 'Zakup / wykonanie',  w: 255, prio: 1, right: true },
    { key: 'deltaQty',       label: 'Δ ilość',            w: 155, prio: 3, right: true },
    { key: 'price',          label: 'Koszt jedn. wyceny', w: 210, prio: 2, right: true },
    { key: 'purchasePrice',  label: 'Koszt jedn. zakupu', w: 230, prio: 2, right: true },
    { key: 'total',          label: 'Koszt całkowity',    w: 275, prio: 1, right: true },
    { key: 'status',         label: 'Status oferty',      w: 230, prio: 3 },
    { key: 'purchaseStatus', label: 'Status zakupu',      w: 255, prio: 1 },
    { key: 'execStatus',     label: 'Status wykonania',   w: 265, prio: 2 },
    { key: 'comment',        label: 'Komentarz',          w: 340, prio: 3 },
];

// @anchor realization-new-col-prio — ile kolumn mieści się w TEJ szerokości tabeli.
// Skalowanie czcionki (`realization-fluid-scale`) samo nie wystarcza: 13 kolumn na 540px
// daje ~40px na kolumnę i nagłówki wchodzą jeden na drugi niezależnie od rozmiaru pisma.
// Progi są w pikselach, bo mierzą to samo co problem — ile miejsca przypada na kolumnę.
// Mierzymy szerokość TABELI, nie okna: to samo okno daje inną szerokość przy karcie
// zadokowanej i schowanej (`realization-new-card-mode`).
export const COL_PRIO_LIMIT = (width) => (width <= 0 ? 3 : width < 900 ? 1 : width < 1300 ? 2 : 3);

// Kolumna z NAŁOŻONYM filtrem nie znika nigdy — inaczej filtr dalej by zawężał tabelę,
// a nie dałoby się go ani zobaczyć, ani cofnąć.
export function visibleCols(width, filters = {}) {
    const limit = COL_PRIO_LIMIT(width);
    return REALIZATION_NEW_COLS.filter(c => (c.prio || 1) <= limit || hasColFilter(filters[c.key]));
}

// Szerokości kolumn są PROPORCJAMI: `table-fixed` z pikselami rozciągałby tabelę do ich sumy
// (CSS 2.1 §17.5.2.1 — używana szerokość tabeli to max(zadana, suma kolumn)) i wracałby poziomy
// suwak mimo `w-full`. Przeliczone na procent skalują się razem z szerokością panelu.
// Liczone z WIDOCZNEGO podzbioru, więc po ukryciu kolumn udziały nadal sumują się do 100%.
export const colPctOf = (cols) => {
    const suma = cols.reduce((a, c) => a + (c.w || 0), 0) || 1;
    return Object.fromEntries(cols.map(c => [c.key, `${(c.w / suma * 100).toFixed(3)}%`]));
};

// @anchor realization-new-col-filters — filtry w nagłówku tabeli pozycji. Podział ten sam
// co w „Realizacji" (`realization-col-filter-apply`): kolumna SŁOWNIKOWA (skończony zbiór
// wartości) dostaje wielowybór dopasowujący WARTOŚĆ, nie podciąg — „Zamówione" nie może
// łapać się na „Nie zamówione"; kolumna wolnotekstowa dzieli wpis na frazy po `;` na OR.
// Kolumny liczbowe zostają przy zwykłym podciągu — szuka się w nich konkretnej kwoty.
export const NEW_DROPDOWN_FILTER_COLS = new Set(['type', 'owner', 'supplier', 'status', 'purchaseStatus', 'execStatus']);
export const NEW_TEXT_FILTER_COLS = new Set(['name', 'comment']);
export const hasColFilter = (v) => (Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== '');

// @anchor realization-new-brak-wlasciciela — etykieta pozycji bez osoby odpowiedzialnej.
// Filtr słownikowy dopasowuje WARTOŚĆ, więc pusty napis wypadłby z listy opcji i nie dałoby
// się wybrać „pokaż niczyje". To ta sama etykieta, którą pokazuje komórka.
export const BRAK_WLASCICIELA = '(brak)';

// Wartości słownikowe pozycji — dokładnie te napisy, które widać w komórce. Filtr ma
// operować na tym, co użytkownik czyta, a nie na kodzie z bazy: `DONE` nad materiałem
// pokazuje się jako „Zainstalowane", a nad pracą jako „Wykonane".
// @anchor realization-new-offer-status-meta — co pokazuje kolumna „Status oferty": pozycja
// dodana po akceptacji dostaje „Poza ofertą" zamiast statusu planu. Jedno źródło dla komórki,
// karty, filtra i wyszukiwarki — inaczej filtr „Poza ofertą" nie znalazłby tego, co widać.
export const offerStatusMetaOf = (node) => (node?._outOfBaseline
    ? POZA_BASELINE_META
    : PLAN_STATUS_META[planStatusFromAny(node?.status)]);

export function filterValuesOf(node, entries) {
    return {
        type: TYPE_META[node.type]?.label || node.type || '',
        // Pusta osoba odpowiedzialna dostaje własną wartość, a nie ''. Bez niej nie dałoby się
        // wyfiltrować pozycji NICZYICH, a to one wymagają działania.
        owner: String(node.owner || '').trim() || BRAK_WLASCICIELA,
        status: offerStatusMetaOf(node)?.label || '',
        purchaseStatus: axisDisplay(node, 'purchase')?.label || '',
        execStatus: axisDisplay(node, 'exec')?.label || '',
        supplier: [...new Set(entries.map(e => e.supplier?.name).filter(Boolean))],
    };
}

// Tekst kolumny do filtra wolnotekstowego — to samo, co niesie komórka.
export function filterTextOf(key, node, card, r, entries) {
    const v = {
        name: `${node.name || ''} ${getParentPath(node.path) || ''}`,
        type: TYPE_META[node.type]?.label || node.type || '',
        owner: node.owner || '',
        supplier: entries.map(e => e.supplier?.name || '').join(' '),
        qty: String(node.quantity ?? ''),
        realization: `${r.qty} / ${r.plan}`,
        deltaQty: String(Math.round((r.qty - r.plan) * 1000) / 1000),
        price: String(planUnitOf(node, card) ?? ''),
        purchasePrice: String(r.avg ?? purchaseUnitOf(card) ?? ''),
        total: `${Math.round(planValueOf(node, card) * 100) / 100} ${r.value}`,
        status: offerStatusMetaOf(node)?.label || '',
        purchaseStatus: axisDisplay(node, 'purchase')?.label || '',
        execStatus: axisDisplay(node, 'exec')?.label || '',
        comment: node.comment || '',
    }[key];
    return String(v ?? '').toLowerCase();
}

// @anchor realization-new-branch-index — indeks drzewa liczony NA FRONCIE, bo `branchId`
// nie jest kolumną w bazie. Zwraca: mapę węzłów, listę gałęzi (z syntetycznym korzeniem),
// listę liści kosztowych oraz `branchIdOf` — najbliższą gałąź w górę dla każdego liścia.
// Bez tego liść podwieszony pod innym liściem wypada z drzewa razem ze swoimi zakupami.
//
// `visibleTypes` zawęża WYNIK (`leaves`), a nie rozpoznawanie gałęzi: `isLeaf` musi dalej
// widzieć WSZYSTKIE typy kosztowe, inaczej odfiltrowana praca zaczęłaby udawać gałąź i materiał
// pod nią zawisłby na węźle, którego nie ma w drzewie (patrz `realization-new-visible-types`).
export function buildBranchIndex(flatNodes, rootName, visibleTypes = LEAF_TYPES) {
    const isLeaf = (n) => LEAF_TYPES.includes(n?.type);
    const byId = Object.fromEntries((flatNodes || []).map(n => [n.id, n]));

    const nearestBranch = (node) => {
        let w = node?.parentId ? byId[node.parentId] : null;
        while (w && isLeaf(w)) w = w.parentId ? byId[w.parentId] : null;
        return w ? w.id : SYNTHETIC_ROOT;
    };

    const root = { id: SYNTHETIC_ROOT, parentId: null, name: rootName || 'Zamówienie', type: '' };
    const branches = [root, ...(flatNodes || []).filter(n => !isLeaf(n)).map(n => ({
        ...n, parentId: n.parentId || SYNTHETIC_ROOT,
    }))];
    const leaves = leafNodesOf(flatNodes, visibleTypes).map(n => ({ ...n, branchId: nearestBranch(n) }));

    const nodeById = Object.fromEntries([...branches, ...leaves].map(n => [n.id, n]));
    const childrenOf = {};
    for (const b of branches) {
        if (b.id === SYNTHETIC_ROOT) continue;
        (childrenOf[b.parentId] || (childrenOf[b.parentId] = [])).push(b);
    }

    // Liście CAŁEGO poddrzewa gałęzi — po `branchId`, nie po `parentId`.
    const subtreeIds = (id) => {
        const out = [id];
        for (const d of (childrenOf[id] || [])) out.push(...subtreeIds(d.id));
        return out;
    };
    const leavesOfSubtree = (id) => {
        const set = new Set(subtreeIds(id));
        return leaves.filter(l => set.has(l.branchId));
    };

    return { branches, leaves, nodeById, childrenOf, subtreeIds, leavesOfSubtree };
}

// ─── Analiza zamówienia ───────────────────────────────────────────────────────

// @anchor realization-new-stages — cztery UPORZĄDKOWANE stany pozycji na osi realizacji.
// `null` = oś nie dotyczy tego typu liścia (praca nie ma zakupu, paliwo nie ma wykonania)
// i taka pozycja wypada z rozliczenia osi, zamiast wchodzić do niego jako „czeka".
//
// Była tu rampa jasny→ciemny w jednym niebieskim: na pasku wysokim na 8px cztery odcienie tego
// samego koloru zlewały się w jedną plamę i nie dało się powiedzieć, gdzie kończy się „zrobione".
// Teraz kolor niesie ZNACZENIE i jest wzięty z tego, co aplikacja już mówi kolorami gdzie indziej:
// turkus = zrobione (tak samo jak pasek pokrycia kwotowego), bursztyn = w trakcie (jak stan
// częściowej realizacji), błękit = otwarte, CZERWIEŃ = zablokowane bramką etapu. Czerwień, bo
// to jedyny stan, którego nie da się ruszyć bez cofnięcia się o etap — akceptacji oferty albo
// dostawy towaru — i ma się rzucać w oczy, a nie chować w szarości.
// Klucz `czeka` zostaje: siedzi w rozkładach osi i w porównaniach, etykieta jest tylko napisem.
// Kolejność w tablicy nadal wyznacza kolejność segmentów na pasku.
export const STAGE_META = [
    { key: 'zrobione', label: 'Zrobione', color: '#2dd4bf' },
    { key: 'wtoku',    label: 'W toku',   color: '#fbbf24' },
    { key: 'otwarte',  label: 'Otwarte',  color: '#60a5fa' },
    { key: 'czeka',    label: 'Zablokowane', color: '#ef4444' },
];
const STAGE_DONE = { purchase: ['DELIVERED', 'ISSUED', 'INVOICED'], exec: ['DONE', 'HANDED_OVER'] };

// Grosze zbierane z kilkudziesięciu pozycji potrafią dać w sumie 1 gr różnicy wobec kolumny
// „Wycena" w tym samym wierszu — zaokrąglamy raz, na gotowym rozkładzie.
const zaokraglijRozklad = (d) => ({
    ...d,
    kwota: round2(d.kwota),
    ...Object.fromEntries(STAGE_META.map(s => [s.key, round2(d[s.key])])),
});

// @anchor realization-new-axis-stage — stan jednej pozycji na jednej osi.
export function axisStageOf(node, axis) {
    const applies = axis === 'purchase' ? hasPurchaseAxis(node?.type) : hasExecAxis(node?.type);
    if (!applies) return null;
    if (axisGateOf(node, axis)) return 'czeka';
    const code = axis === 'purchase' ? node?.purchaseStatus : node?.execStatus;
    if (!code) return 'otwarte';
    return STAGE_DONE[axis].includes(code) ? 'zrobione' : 'wtoku';
}

// @anchor realization-new-axis-display — etykieta osi DO POKAZANIA: bramka etapu albo status
// (z domyślnym, gdy NULL). Bramka jest wyszarzona i kursywą — to nie jest stan pozycji, tylko
// informacja, że etap się jeszcze nie otworzył. W tym zamówieniu 74 z 80 pozycji ma
// `purchaseStatus = NULL`, więc bez bramek kolumna kłamałaby, że wszystko czeka na dostawę.
export function axisDisplay(node, axis) {
    const applies = axis === 'purchase' ? hasPurchaseAxis(node?.type) : hasExecAxis(node?.type);
    if (!applies) return null;
    const gate = axisGateOf(node, axis);
    if (gate) return { label: gate.label, color: 'text-gray-500', gate: true, title: gate.title };
    if (axis === 'purchase') {
        const code = node?.purchaseStatus || DEFAULT_PURCHASE_STATUS;
        return { label: PURCHASE_STATUS_META[code]?.label || code, color: PURCHASE_STATUS_META[code]?.color || 'text-gray-300', gate: false };
    }
    const code = node?.execStatus || DEFAULT_EXEC_STATUS;
    return { label: execStatusLabel(node?.type, code), color: EXEC_STATUS_META[code]?.color || 'text-gray-300', gate: false };
}

// „Dni" to pozycje wyceniane w JEDNOSTCE CZASU (`WbsNode.unit`), a nie daty z harmonogramu —
// `ganttStart`/`ganttEnd` bywają puste na całym zamówieniu.
const isTimeUnit = (n) => /^dni|^dzie/i.test(String(n?.unit || '').trim());

// Rodzaj gramatyczny się różni — zakup jest męski, wykonanie nijakie — więc etykieta ma
// osobny helper. To samo rozróżnienie co w `RealizationTab`, żeby nad pozycją typu praca
// nie stanęło „nowy wykonanie".
const entryNoun = (type) => (type === 'work' || type === 'service' ? 'wykonanie' : 'zakup');

// @anchor realization-new-field-font — pola tej zakładki są większe niż w „Realizacji".
// Podmieniamy klasę rozmiaru wprost, zamiast dokładać drugą obok `text-sm` z `ENTRY_INPUT`:
// dwie klasy rozmiaru rozstrzygałaby kolejność w arkuszu Tailwinda, a nie zapis w kodzie.
// Stały rozmiar (22px) zastąpił token `--rn-xl` z `realization-fluid-scale` w `index.css` —
// 22px zostaje na ≥3440px, na mniejszych ekranach schodzi proporcjonalnie do 13px.
const FIELD_FONT = 'text-[length:var(--rn-xl)]';
// Jedna wysokość dla WSZYSTKICH kontrolek wiersza wpisu. `input`, rosnąca `textarea` i trigger
// `SupplierPicker` liczą wysokość trzema różnymi drogami (line-height, scrollHeight, padding
// klasy rozmiaru), więc bez wymuszenia każda wychodziła inna i wiersz falował. Picker nie
// przyjmuje wysokości propsem, więc sięgamy do jego triggera wariantem arbitralnym.
// Wysokość jedzie na tym samym pokrętle co czcionka — inaczej na 13px tekście zostałaby
// czterdziestopikselowa ramka z tekstem pływającym w środku.
const FIELD_H = 'var(--rn-field-h)';
const PICKER_BOX = '[&>div>button]:h-[var(--rn-field-h)]';
const ENTRY_INPUT_LG = ENTRY_INPUT.replace('text-sm', FIELD_FONT);
const addEntryLabel = (type) => (type === 'work' || type === 'service' ? 'Dodaj wykonanie' : 'Dodaj zakup');

const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const fmtPct = (v) => v.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const round2 = (v) => Math.round(v * 100) / 100;

// ─── Drobne elementy ──────────────────────────────────────────────────────────

const Badge = ({ label, color, italic, title, size = 'text-sm' }) => label
    ? <span title={title} className={`inline-block ${size} font-semibold ${color} ${italic ? 'italic opacity-85' : ''}`}>{label}</span>
    : null;

// Pasek udziału KWOT wyceny w etapach osi. Legenda jest obowiązkowa — cztery odcienie same
// z siebie nie znaczą nic. Segment = udział złotówek w danym stanie, nie liczba pozycji;
// tooltip podaje jedno i drugie, bo „30% kwoty na 2 pozycjach" znaczy co innego niż
// „30% kwoty na 20 pozycjach".
const StageBar = ({ dist, title }) => {
    if (!dist.dotyczy) return <span className="text-[length:var(--rn-lg)] italic text-gray-600">oś nie dotyczy</span>;
    if (!dist.kwota) return <span className="text-[length:var(--rn-lg)] italic text-gray-600" title={`${title} — ${dist.dotyczy} pozycji, wszystkie z zerową wyceną`}>brak kwot</span>;
    const opis = STAGE_META.filter(s => dist[s.key]).map(s =>
        `${s.label}: ${fmtZl(dist[s.key])} zł (${fmtPct(pct(dist[s.key], dist.kwota))}, ${dist.n?.[s.key] ?? 0} poz.)`).join(' · ');
    return (
        <div className="flex h-2 w-full overflow-hidden rounded-sm bg-white/5" title={`${title} — ${opis} · razem ${fmtZl(dist.kwota)} zł na ${dist.dotyczy} pozycjach`}>
            {STAGE_META.filter(s => dist[s.key]).map(s => (
                <i key={s.key} style={{ width: `${pct(dist[s.key], dist.kwota)}%`, background: s.color }} />
            ))}
        </div>
    );
};

// Pasek pokrycia kwotowego, z osobnym stanem dla przekroczenia planu.
const CoverageBar = ({ real, plan }) => {
    const p = pct(real, plan);
    const over = p > 100.0001;
    return (
        <div className="flex items-center gap-2">
            <div className="h-2 min-w-[90px] flex-1 overflow-hidden rounded-sm bg-white/5"
                title={`${fmtPct(p)} wyceny${over ? ' — PONAD PLAN' : ''}`}>
                <i className="block h-full rounded-sm" style={{ width: `${Math.min(100, p)}%`, background: over ? '#d03b3b' : '#2dd4bf' }} />
            </div>
            <span className={`w-20 text-right text-[length:var(--rn-lg)] ${over ? 'text-[#d03b3b]' : 'text-gray-500'}`}>{p > 0 ? fmtPct(p) : '—'}</span>
        </div>
    );
};

const Meter = ({ label, done, plan, left, right }) => {
    const p = pct(done, plan);
    const over = p > 100.0001;
    return (
        <div className="min-w-[300px] flex-1">
            <div className="mb-1 flex items-baseline gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
                <span className={`ml-auto text-sm font-bold tabular-nums ${over ? 'text-[#d03b3b]' : 'text-gray-200'}`}>{fmtPct(p)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-md bg-white/5" title={`${label}: ${left} z ${right}${over ? ' — PONAD PLAN' : ''}`}>
                <i className="block h-full rounded-md" style={{ width: `${Math.min(100, p)}%`, background: over ? '#d03b3b' : '#2dd4bf' }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500"><span>{left}</span><span>z {right}</span></div>
        </div>
    );
};

// Kolor kwoty niesie ZNACZENIE i jest ten sam w całej zakładce: pomarańcz = strona OFERTY
// (to, co wyceniliśmy klientowi), czerwień = strona WYDATKÓW (to, co realnie poszło na
// zakupy i wykonanie). Kafel, który pokazuje obie strony naraz, stawia je jedna pod drugą
// w tych właśnie kolorach — `children` mieści drugą kwotę i deltę.
const Tile = ({ label, value, color, note, children }) => (
    <div className="min-w-[190px] flex-1 rounded-md border border-white/[.07] bg-[#0a1120] px-3.5 py-2.5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</div>
        <div className={`mt-1 text-[length:var(--rn-xl)] font-bold leading-tight tabular-nums ${color || 'text-gray-200'}`}>{value}</div>
        {note && <div className="mt-0.5 text-xs text-gray-500">{note}</div>}
        {children}
    </div>
);

// @anchor realization-new-card-mode — karta pozycji ma trzy zachowania, nie dwa.
// Zadokowana trzecia kolumna ma sens dopiero wtedy, gdy po jej odjęciu środkowa tabela wciąż
// mieści komplet kolumn — na 3440px tak, na 1500px zabierała tabeli ostatnie 440px i to ona
// była powodem zlepionych nagłówków. Poniżej progu karta otwiera się jako SZUFLADA nad
// tabelą (`position: absolute`), więc tabela nie traci ani piksela, a karta jest pełnej
// szerokości. Wybór użytkownika (pokazana / schowana) przebija automat i zostaje w
// `localStorage` — automat decyduje tylko przy pierwszym wejściu na danej przeglądarce.
const KARTA_KEY = 'realizacja-new:karta';
const KARTA_DOK_MIN = 2200;

// ─── Komponent ────────────────────────────────────────────────────────────────

// @anchor realization-new-tab — patrz nagłówek pliku.
export default function RealizationNewTab({
    nodeId, versionId, orderName = '', userRoles = [], planLabel = '',
    accepted = false, acceptedAt = null, oneDriveFolderName = null,
}) {
    const token = sessionStorage.getItem('token');
    const isManagerOrAdmin = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
    // Ta sama trójka ról co w `RealizationTab` — logistyk prowadzi zakupy, więc pisze,
    // ale analizy kwotowej (kafle, mierniki, bilanse) i tak nie widzi.
    const canEdit = userRoles.some(r => ['ADMIN', 'MANAGER', 'LOGISTYK'].includes(r));
    const readOnly = !canEdit;

    // @anchor realization-new-visible-types — praca, usługa, nocleg i paliwo to koszty WŁASNE
    // firmy; poza managerem i adminem nikt ich tu nie ogląda. Reguła i lista są te same, co w
    // zakładce „Realizacja" (`realization-visible-types`) — ta sama osoba nie może zobaczyć
    // robocizny w jednym układzie i nie zobaczyć jej w drugim. Filtr działa na etapie budowania
    // indeksu, więc odfiltrowane pozycje nie wchodzą ani do drzewa gałęzi, ani do sum, ani do
    // analizy, ani do eksportu — nigdzie, gdzie dałoby się je policzyć z różnicy.
    const visibleTypes = isManagerOrAdmin ? LEAF_TYPES : OPEN_LEAF_TYPES;

    // @anchor realization-new-can-see-money — kto widzi ANALIZĘ KWOTOWĄ zamówienia: kafle,
    // mierniki, bilanse i kwoty w drzewie gałęzi. Logistyk je WIDZI: po odfiltrowaniu kosztów
    // własnych (`realization-new-visible-types`) zostaje mu materiał i sprzęt, czyli dokładnie
    // to, co sam kupuje i czego ceny negocjuje — a bez sum nie da się prowadzić zakupów wobec
    // budżetu. Pracownik nie widzi ich dalej: dla niego to rozliczenie cudzych zakupów.
    // Jeden warunek na wszystkie te miejsca, bo rozjazd znaczyłby, że tę samą kwotę da się
    // odczytać z drzewa, a nie da się z kafla nad nim.
    const canSeeMoney = userRoles.some(r => ['ADMIN', 'MANAGER', 'LOGISTYK'].includes(r));

    const [loading, setLoading] = useState(true);
    const [wbsNodes, setWbsNodes] = useState([]);
    const [cards, setCards] = useState({});
    const [actuals, setActuals] = useState([]);

    const [selectedBranch, setSelectedBranch] = useState(SYNTHETIC_ROOT);
    const [selectedLeaf, setSelectedLeaf] = useState(null);
    const [expanded, setExpanded] = useState(() => new Set());
    const [onlyOpen, setOnlyOpen] = useState(false);
    const [colFilters, setColFilters] = useState({});
    const [exporting, setExporting] = useState(false);
    const [protokolOtwarty, setProtokolOtwarty] = useState(false);
    const [branchTableOpen, setBranchTableOpen] = useState(false);
    const [execTableOpen, setExecTableOpen] = useState(false);
    // @anchor realization-new-kpi-open — kafle i mierniki startują ZWINIĘTE, tak samo jak dwie
    // tabele analityczne pod nimi. Rozwinięte zabierały ~180px u góry przy każdym wejściu
    // w zakładkę, a na mniejszym ekranie tabela pozycji zaczynała się poniżej krawędzi okna.
    const [kpiOpen, setKpiOpen] = useState(false);
    const { width: deviceWidth } = useDevice();
    const [kartaWidoczna, setKartaWidoczna] = useState(() => {
        const zapis = localStorage.getItem(KARTA_KEY);
        if (zapis === '1') return true;
        if (zapis === '0') return false;
        return window.innerWidth >= KARTA_DOK_MIN;
    });
    // Kolumny schowane przez `realization-new-col-prio` — nazwy idą do podpisu w nagłówku
    // panelu, żeby zniknięcie „Komentarza" nie wyglądało na utratę danych.
    const [ukryteKolumny, setUkryteKolumny] = useState([]);

    // @anchor realization-new-owner-options — dwa źródła listy osób, te same co w Strukturze
    // projektu: konta użytkowników (`/users` — dla nie-managera zwraca wyłącznie jego samego,
    // bez 403) i kontakty ZAMÓWIENIA (`/order-requirements/:nodeId`). Uprawnienia węzła
    // (`/process-tree/:id/permissions`) czyta tylko manager; logistykowi wracają stamtąd 403,
    // więc wynik jest opcjonalny i jego brak nie psuje listy — do wyboru zostają kontakty
    // zamówienia i osoby już przypisane na pozycjach.
    const [ownerUsers, setOwnerUsers] = useState([]);
    const [ownerContacts, setOwnerContacts] = useState([]);

    useEffect(() => {
        if (!nodeId) { setOwnerUsers([]); setOwnerContacts([]); return; }
        let anulowane = false;
        const headers = { Authorization: `Bearer ${token}` };
        const pobierz = async (url) => {
            try {
                const res = await fetch(url, { headers });
                return res.ok ? await res.json() : null;
            } catch { return null; }
        };
        (async () => {
            const [users, perms, zamowienie] = await Promise.all([
                pobierz(`${API_URL}/users`),
                isManagerOrAdmin ? pobierz(`${API_URL}/process-tree/${nodeId}/permissions`) : Promise.resolve(null),
                pobierz(`${API_URL}/order-requirements/${nodeId}`),
            ]);
            if (anulowane) return;
            // Konta z uprawnieniami do węzła (kontakty dodane w zakładce Informacje) dochodzą
            // do listy z `/users`; duplikaty po id odsiewamy tutaj, resztę robi `buildOwnerOptions`.
            const zWezla = (perms?.permissions || []).filter(p => p.user && !p.teamId).map(p => p.user);
            const wszyscy = [...(Array.isArray(users) ? users : []), ...zWezla];
            const widziane = new Set();
            setOwnerUsers(wszyscy.filter(u => u?.id && !widziane.has(u.id) && widziane.add(u.id)));
            // `clientContacts` bywa stringiem JSON albo tablicą — ten sam rozbiór co w
            // `UnifiedWbsPanel.fetchStrategy`, bo obie listy muszą składać te same etykiety.
            let kontakty = [];
            try {
                const raw = typeof zamowienie?.clientContacts === 'string'
                    ? JSON.parse(zamowienie.clientContacts || '[]')
                    : (zamowienie?.clientContacts || []);
                kontakty = (Array.isArray(raw) ? raw : []).map((c, i) => ({
                    id: c?.id || `kontakt-${i}`,
                    firstName: String(c?.name || '').trim(),
                    lastName: '',
                    name: String(c?.name || '').trim(),
                    company: c?.company || '',
                    email: c?.email || '',
                    role: c?.role || '',
                })).filter(c => c.name || c.email);
            } catch { kontakty = []; }
            setOwnerContacts(kontakty);
        })();
        return () => { anulowane = true; };
    }, [nodeId, token, isManagerOrAdmin]);

    // ─ Pobieranie danych — te same trzy endpointy co `RealizationTab` ────────
    const fetchAll = useCallback(async () => {
        if (!nodeId) return;
        setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const q = versionId ? `?versionId=${versionId}` : '';
            const [wbsRes, reqRes, actRes] = await Promise.all([
                fetch(`${API_URL}/wbs-nodes/unified/${nodeId}${q}`, { headers }),
                fetch(`${API_URL}/material-requirements/node/${nodeId}${q}`, { headers }),
                fetch(`${API_URL}/leaf-actuals/order/${nodeId}`, { headers }),
            ]);
            const flat = wbsRes.ok ? flattenWbsNodes((await wbsRes.json()).items || []) : [];
            setWbsNodes(markOutOfBaseline(flat, acceptedAt));
            setCards(reqRes.ok ? buildCardMap(flat, await reqRes.json()) : {});
            setActuals(actRes.ok ? await actRes.json() : []);
        } catch (e) {
            console.error('[RealizationNewTab] fetchAll error:', e);
        } finally {
            setLoading(false);
        }
    }, [nodeId, versionId, token, acceptedAt]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ─ Mutacje ───────────────────────────────────────────────────────────────
    // Te same endpointy co w `RealizationTab`: `PATCH /wbs-nodes/:id`, `POST|PATCH|DELETE
    // /leaf-actuals`, `PATCH /leaf-actuals/close/:id`. Logika siedzi w ciele komponentu po obu
    // stronach, więc na razie istnieje w dwóch kopiach — gdy nowy układ zostanie przyjęty,
    // obie mają zejść do wspólnego hooka, żeby reguła cofania osi nie żyła w dwóch miejscach.

    // @anchor realization-new-fetch-actuals — przeładowanie SAMYCH wpisów po zapisie. Drzewo
    // WBS i karty się przy tym nie ruszają, więc rozwinięcia i wybór pozycji zostają na miejscu.
    const fetchActuals = useCallback(async () => {
        if (!nodeId) return;
        try {
            const res = await fetch(`${API_URL}/leaf-actuals/order/${nodeId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setActuals(await res.json());
        } catch (e) {
            console.error('[RealizationNewTab] fetchActuals error:', e);
        }
    }, [nodeId, token]);

    // @anchor realization-new-fetch-cards — przeładowanie SAMYCH kart produktowych. Woła je
    // kafel zdjęcia w karcie pozycji po wgraniu obrazka; drzewo WBS i wpisy zostają nietknięte,
    // więc rozwinięcia, wybór pozycji i pozycja przewijania nie skaczą.
    const fetchCards = useCallback(async () => {
        if (!nodeId) return;
        try {
            const q = versionId ? `?versionId=${versionId}` : '';
            const res = await fetch(`${API_URL}/material-requirements/node/${nodeId}${q}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setCards(buildCardMap(wbsNodes, await res.json()));
        } catch (e) {
            console.error('[RealizationNewTab] fetchCards error:', e);
        }
    }, [nodeId, versionId, token, wbsNodes]);

    // @anchor realization-new-save-comment — `WbsNode.comment` przez `PATCH /wbs-nodes/:id`,
    // plus rozgłoszenie `wbs-comment-changed`: ten sam komentarz czyta WBS, panel Materiały
    // i marker schematu, więc bez zdarzenia zostawałyby ze starą treścią do przeładowania.
    const saveComment = useCallback(async (wbsNodeId, comment) => {
        setWbsNodes(prev => prev.map(n => n.id === wbsNodeId ? { ...n, comment } : n));
        await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ comment }),
        });
        window.dispatchEvent(new CustomEvent('wbs-comment-changed', { detail: { wbsNodeIds: [wbsNodeId], comment } }));
    }, []);

    // Komentarz zmieniony gdzie indziej wjeżdża tu bez przeładowania tabeli.
    useEffect(() => {
        const handler = (e) => {
            const { wbsNodeIds, comment } = e.detail || {};
            if (!wbsNodeIds?.length) return;
            setWbsNodes(prev => prev.map(n => wbsNodeIds.includes(n.id) ? { ...n, comment: comment || '' } : n));
        };
        window.addEventListener('wbs-comment-changed', handler);
        return () => window.removeEventListener('wbs-comment-changed', handler);
    }, []);

    // @anchor realization-new-save-owner — `WbsNode.owner` przez `PATCH /wbs-nodes/:id`. Zapis
    // optymistyczny z cofnięciem: pole jest listą wyboru, więc nieudany zapis musi wrócić do
    // poprzedniego nazwiska, a nie zostawić na ekranie osoby, której nie ma w bazie.
    const saveOwner = useCallback(async (node, owner) => {
        const previous = node.owner ?? '';
        if (owner === previous) return;
        setWbsNodes(prev => prev.map(n => n.id === node.id ? { ...n, owner } : n));
        try {
            const res = await fetch(`${API_URL}/wbs-nodes/${node.id}`, {
                method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ owner }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            console.error('[RealizationNewTab] saveOwner error:', e);
            setWbsNodes(prev => prev.map(n => n.id === node.id ? { ...n, owner: previous } : n));
            alert('Nie udało się zapisać osoby odpowiedzialnej');
        }
    }, []);

    // @anchor realization-new-save-axis — zapis osi realizacji. COFNIĘCIE ZAKUPU COFA TEŻ
    // WYKONANIE: bramka `axisGateOf` trzyma montaż, dopóki oś wykonania stoi na NULL, ale
    // otwiera się na zawsze, gdy ktoś ją raz ustawi. Bez zerowania do NULL cofnięcie dostawy
    // zostawiało obok „Montaż w toku" — towar wraca do dostawcy, a kolumna twierdzi, że go
    // montujemy. Reguła przepisana z `realization-save-axis` i musi zostać identyczna.
    const saveAxis = useCallback(async (node, pole, wartosc) => {
        const previous = node[pole] ?? null;
        if (wartosc === previous) return;

        const cofaWykonanie = pole === 'purchaseStatus'
            && hasPurchaseAxis(node?.type) && hasExecAxis(node?.type)
            && (node?.execStatus ?? null) !== null
            && (wartosc === 'CANCELLED'
                || (AXIS_STATUS_ORDER.purchase[wartosc] ?? 0) < AXIS_STATUS_ORDER.purchase.PARTIALLY_DELIVERED);
        const previousExec = node?.execStatus ?? null;
        const patch = cofaWykonanie ? { [pole]: wartosc, execStatus: null } : { [pole]: wartosc };

        setWbsNodes(prev => prev.map(n => n.id === node.id ? { ...n, ...patch } : n));
        try {
            const res = await fetch(`${API_URL}/wbs-nodes/${node.id}`, {
                method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            console.error('[RealizationNewTab] saveAxis error:', e);
            setWbsNodes(prev => prev.map(n => n.id === node.id
                ? { ...n, [pole]: previous, ...(cofaWykonanie ? { execStatus: previousExec } : {}) }
                : n));
            alert(pole === 'purchaseStatus'
                ? 'Nie udało się zapisać statusu zakupu'
                : 'Nie udało się zapisać statusu wykonania');
        }
    }, []);

    // Komentarz NOWEGO wpisu dopisuje się do komentarza pozycji osobną linią „zakup: …".
    // Wyłącznie przy dodaniu — poprawka wpisu po fakcie nie przepisuje historii.
    const appendEntryComment = useCallback(async (node, text) => {
        const trimmed = (text || '').trim();
        if (!trimmed) return;
        const line = `${entryNoun(node.type)}: ${trimmed}`;
        const base = (node.comment || '').trim();
        await saveComment(node.id, base ? `${base}\n${line}` : line);
    }, [saveComment]);

    // @anchor realization-new-add-actual — nowy wpis `LeafActual` na pozycji.
    const addActual = useCallback(async (node, draft) => {
        const res = await fetch(`${API_URL}/leaf-actuals`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                wbsNodeId: node.id,
                entryDate: draft.entryDate || undefined,
                qty: draft.qty,
                unitCost: draft.unitCost,
                comment: draft.comment || null,
                docNumber: draft.docNumber || null,
                supplierId: draft.supplierId || null,
                manufacturer: draft.manufacturer || null,
                model: draft.model || null,
                ean: draft.ean || null,
                scope: draft.scope || null,
                isSurplus: !!draft.isSurplus,
            }),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Nie udało się zapisać wpisu realizacji');
            return false;
        }
        await fetchActuals();
        await appendEntryComment(node, draft.comment);
        return true;
    }, [fetchActuals, appendEntryComment]);

    const updateActual = useCallback(async (id, patch) => {
        const res = await fetch(`${API_URL}/leaf-actuals/${id}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Nie udało się zapisać zmiany wpisu');
        }
        await fetchActuals();
    }, [fetchActuals]);

    // @anchor realization-new-set-closed — znacznik „rozliczone" na pozycji.
    const setClosed = useCallback(async (node, closed) => {
        const res = await fetch(`${API_URL}/leaf-actuals/close/${node.id}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ closed }),
        });
        if (!res.ok) {
            alert('Nie udało się zmienić rozliczenia pozycji');
            return false;
        }
        setWbsNodes(prev => prev.map(n => n.id === node.id ? { ...n, realizationClosed: closed } : n));
        return true;
    }, []);

    // Usunięcie OSTATNIEGO wpisu zdejmuje z pozycji znacznik „rozliczone" — inaczej zostaje
    // pozycja bez ani jednego zdarzenia, z pełnym paskiem i Δ ilość równą minus całemu planowi.
    const deleteActual = useCallback(async (id) => {
        const gone = actuals.find(a => a.id === id) || null;
        const res = await fetch(`${API_URL}/leaf-actuals/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Nie udało się usunąć wpisu');
            return;
        }
        await fetchActuals();
        if (!gone) return;
        if (actuals.some(a => a.id !== id && a.wbsRootId === gone.wbsRootId)) return;
        for (const n of wbsNodes.filter(n => n.realizationClosed && wbsRootOf(n) === gone.wbsRootId)) {
            await setClosed(n, false);
        }
    }, [fetchActuals, actuals, wbsNodes, setClosed]);

    const toggleClosed = useCallback((node) => setClosed(node, !node.realizationClosed), [setClosed]);

    // ─ Model widoku ──────────────────────────────────────────────────────────
    const idx = useMemo(() => buildBranchIndex(wbsNodes, orderName, visibleTypes), [wbsNodes, orderName, visibleTypes]);

    const actualsByRoot = useMemo(() => {
        const map = {};
        for (const a of actuals) (map[a.wbsRootId] || (map[a.wbsRootId] = [])).push(a);
        return map;
    }, [actuals]);

    const actualsOf = useCallback((node) => actualsByRoot[wbsRootOf(node)] || [], [actualsByRoot]);
    const cardOf = useCallback((node) => cards[node?.id] || null, [cards]);

    // @anchor realization-new-row-of — komplet liczb jednej pozycji: karta, realizacja,
    // wartość planu i Δ ilości. Liczone raz i podawane do komórek, szuflady i karty, żeby
    // trzy panele nie mogły pokazać trzech różnych wyników dla tej samej pozycji.
    const rowOf = useCallback((node) => {
        const card = cardOf(node);
        const r = realizationOf(node, actualsOf(node));
        return { card, r, planValue: planValueOf(node, card), deltaQty: Math.round((r.qty - r.plan) * 1000) / 1000 };
    }, [cardOf, actualsOf]);

    // Osoby JUŻ przypisane na pozycjach tego zamówienia wchodzą do listy jako `extras`
    // (patrz `build-owner-options`): bez nich pozycja przypisana komuś spoza obu list —
    // człowiekowi zdjętemu z zespołu, kontaktowi usuniętemu z zamówienia — pokazywałaby
    // pusty dropdown nad niepustą bazą, a pierwsze kliknięcie skasowałoby nazwisko.
    const ownerOptions = useMemo(() => {
        const przypisani = [...new Set(wbsNodes.map(n => String(n.owner || '').trim()).filter(Boolean))];
        return buildOwnerOptions(ownerUsers, ownerContacts, przypisani);
    }, [ownerUsers, ownerContacts, wbsNodes]);

    const isUnfinished = useCallback((n) => {
        const r = realizationOf(n, actualsOf(n));
        return !n.realizationClosed && r.qty < r.plan - 1e-9;
    }, [actualsOf]);

    // Punkt startowy liczy się Z ZAWARTOŚCI, nigdy z zaszytego id: dane pochodzą z bazy
    // i identyfikatory zmieniają się przy każdej nowej wersji zamówienia.
    useEffect(() => {
        if (!idx.leaves.length) return;
        const richest = idx.leaves
            .map(n => ({ id: n.id, ile: actualsOf(n).length }))
            .sort((a, b) => b.ile - a.ile)[0];
        if (richest?.ile) setExpanded(new Set([richest.id]));
    }, [idx.leaves, actualsOf]);

    // Opcje filtrów liczą się z pozycji WYBRANEJ GAŁĘZI przed filtrowaniem — gdyby liczyły
    // się z wyniku, po zaznaczeniu jednego statusu zniknęłyby z listy pozostałe i nie dałoby
    // się dobrać drugiego.
    const filterOptions = useMemo(() => {
        const acc = { type: new Set(), owner: new Set(), supplier: new Set(), status: new Set(), purchaseStatus: new Set(), execStatus: new Set() };
        for (const n of idx.leavesOfSubtree(selectedBranch)) {
            const v = filterValuesOf(n, actualsOf(n));
            for (const k of ['type', 'owner', 'status', 'purchaseStatus', 'execStatus']) if (v[k]) acc[k].add(v[k]);
            for (const nazwa of v.supplier) acc.supplier.add(nazwa);
        }
        const pos = (zbior) => [...zbior].sort((a, b) => a.localeCompare(b, 'pl'));
        return {
            type: pos(acc.type), owner: pos(acc.owner), supplier: pos(acc.supplier), status: pos(acc.status),
            purchaseStatus: pos(acc.purchaseStatus), execStatus: pos(acc.execStatus),
        };
    }, [idx, selectedBranch, actualsOf]);

    const matchesFilters = useCallback((node) => {
        const wpisy = actualsOf(node);
        let slownik = null, r = null;
        for (const [key, val] of Object.entries(colFilters)) {
            if (!hasColFilter(val)) continue;
            if (Array.isArray(val)) {
                slownik = slownik || filterValuesOf(node, wpisy);
                const chce = new Set(val);
                const ok = key === 'supplier'
                    ? slownik.supplier.some(nazwa => chce.has(nazwa))
                    : chce.has(slownik[key]);
                if (!ok) return false;
                continue;
            }
            const q = String(val).toLowerCase().trim();
            const frazy = NEW_TEXT_FILTER_COLS.has(key)
                ? q.split(';').map(t => t.trim()).filter(Boolean)
                : [q];
            if (!frazy.length) continue;
            r = r || realizationOf(node, wpisy);
            const tekst = filterTextOf(key, node, cardOf(node), r, wpisy);
            if (!frazy.some(t => tekst.includes(t))) return false;
        }
        return true;
    }, [colFilters, actualsOf, cardOf]);

    const filtryAktywne = Object.values(colFilters).some(hasColFilter);

    const visibleLeaves = useMemo(() => {
        let list = idx.leavesOfSubtree(selectedBranch);
        if (onlyOpen) list = list.filter(isUnfinished);
        return filtryAktywne ? list.filter(matchesFilters) : list;
    }, [idx, selectedBranch, onlyOpen, isUnfinished, filtryAktywne, matchesFilters]);

    // @anchor realization-new-leaf-branch-path — ŚCIEŻKA gałęzi wybranej pozycji: od jej
    // najbliższej gałęzi w górę aż po korzeń. Tabela pokazuje PŁASKĄ listę całego poddrzewa,
    // a nazwy gałęzi nie ma w żadnej kolumnie (celowo — patrz `REALIZATION_NEW_COLS`), więc po
    // kliknięciu w liść nie dało się powiedzieć, skąd on jest. Podświetlenie CELOWO nie rusza
    // `selectedBranch`: zmiana wyboru gałęzi przefiltrowałaby tabelę i wyrzuciła z niej resztę
    // pozycji, czyli kliknięcie w wiersz zmieniałoby to, na co się patrzy.
    const leafBranchPath = useMemo(() => {
        const leaf = idx.leaves.find(n => n.id === selectedLeaf);
        if (!leaf) return { branchId: null, path: new Set() };
        const path = new Set();
        // Zabezpieczenie przed cyklem: `parentId` przychodzi z bazy, a pętla w drzewie
        // zawiesiłaby cały widok zamiast pokazać niepełną ścieżkę.
        let id = leaf.branchId;
        while (id && !path.has(id)) {
            path.add(id);
            id = idx.nodeById[id]?.parentId || null;
        }
        return { branchId: leaf.branchId, path };
    }, [idx, selectedLeaf]);

    // @anchor realization-new-export-rows — wiersze dla eksportu i protokołu w kształcie, którego
    // oczekują obie ścieżki: { node, card, realization }. To DOKŁADNIE to, co widać w tabeli —
    // po wyborze gałęzi, filtrach kolumn i przełączniku „Tylko niedomknięte". Odbiera się i
    // eksportuje to, na co się patrzy.
    const exportRows = useMemo(() => visibleLeaves.map(node => ({
        node,
        card: cardOf(node),
        realization: realizationOf(node, actualsOf(node)),
    })), [visibleLeaves, cardOf, actualsOf]);

    // @anchor realization-new-orphan-entries — wpisy, których pozycji NIE MA w wersji planu
    // (pozycja dodana po akceptacji baselinu albo z niego usunięta). Tabela ich nie pokazuje,
    // bo buduje wiersze z wersji planu, ale eksport musi je rozliczyć jako „poza ofertą" (usunięta z wyceny).
    // Tylko przy pełnym widoku zamówienia — wpis sieroty nie należy do żadnej gałęzi ani filtra.
    const orphanEntries = useMemo(() => {
        if (selectedBranch !== SYNTHETIC_ROOT || onlyOpen || filtryAktywne) return [];
        const roots = new Set(wbsNodes.map(wbsRootOf));
        return actuals.filter(e => !roots.has(e.wbsRootId));
    }, [actuals, wbsNodes, selectedBranch, onlyOpen, filtryAktywne]);

    const exportExcel = async () => {
        if (exporting || !exportRows.length) return;
        setExporting(true);
        try {
            await eksportRealizacjiXlsx({
                rows: exportRows,
                orphanEntries,
                visibleTypes,
                orderName,
                accepted,
                colFilters,
                etykietyKolumn: Object.fromEntries(REALIZATION_NEW_COLS.map(c => [c.key, c.label])),
            });
        } catch (e) {
            console.error('[RealizationNewTab] eksport Excel:', e);
            alert('Nie udało się wygenerować pliku Excel');
        } finally {
            setExporting(false);
        }
    };

    // ─ Analiza ───────────────────────────────────────────────────────────────
    const analysis = useMemo(() => {
        const gather = (leaves) => {
            // Wiersze w kształcie { node, card, realization } — tym samym, którym posługuje się
            // eksport, protokół i bilans wykonania. Liczone RAZ i podawane dalej, żeby trzy
            // rachunki nie mogły rozejść się na tej samej pozycji.
            const wiersze = leaves.map(n => ({ node: n, card: cardOf(n), realization: realizationOf(n, actualsOf(n)) }));
            let plan = 0, real = 0, wpisow = 0, zRealizacja = 0, dniPlan = 0, dniWyk = 0;
            // @anchor realization-new-stage-dist — rozkład osi liczony w KWOTACH wyceny, nie
            // w sztukach pozycji. Sztuki zrównywały pozycję za 100 zł z pozycją za 100 000 zł,
            // więc pasek „w połowie zrobione" nie mówił nic o pieniądzach. Liczniki `n` zostają
            // obok kwot: bez nich nie da się odróżnić „oś nie dotyczy tego zakresu" od „dotyczy,
            // ale wszystkie jego pozycje mają zerową wycenę", a ostrzeżenie o nieuzupełnionym
            // statusie wykonania musi mówić o POZYCJACH, bo to ich nikt nie odnotował.
            const pustyRozklad = () => ({
                zrobione: 0, wtoku: 0, otwarte: 0, czeka: 0,
                kwota: 0, dotyczy: 0,
                n: { zrobione: 0, wtoku: 0, otwarte: 0, czeka: 0 },
            });
            const dist = { purchase: pustyRozklad(), exec: pustyRozklad() };
            for (const { node: n, card, realization: r } of wiersze) {
                plan += planValueOf(n, card);
                real += r.value;
                wpisow += r.entries.length;
                if (r.entries.length) zRealizacja++;
                if (isTimeUnit(n)) { dniPlan += r.plan; dniWyk += r.qty; }
                for (const axis of ['purchase', 'exec']) {
                    const stan = axisStageOf(n, axis);
                    if (!stan) continue;
                    const kwota = planValueOf(n, card);
                    dist[axis][stan] += kwota;
                    dist[axis].kwota += kwota;
                    dist[axis].n[stan]++;
                    dist[axis].dotyczy++;
                }
            }
            return {
                plan: round2(plan), real: round2(real), wpisow, zRealizacja, pozycji: leaves.length,
                dniPlan: round2(dniPlan), dniWyk: round2(dniWyk),
                osZakupu: zaokraglijRozklad(dist.purchase), osWykonania: zaokraglijRozklad(dist.exec),
                zamkniete: liczBilansWykonania(wiersze),
            };
        };
        const calosc = gather(idx.leaves);
        const galezie = (idx.childrenOf[SYNTHETIC_ROOT] || [])
            .map(g => ({ id: g.id, nazwa: g.name, ...gather(idx.leavesOfSubtree(g.id)) }))
            .sort((a, b) => b.plan - a.plan);
        return { calosc, galezie };
    }, [idx, actualsOf, cardOf]);

    const toggleExpanded = (id) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    // Rozwinięta tabela analityczna ZASTĘPUJE trzy panele realizacji, zamiast spychać je pod
    // ekran: obie rzeczy są szerokie na całą stronę, a przewijanie między nimi gubiło kontekst.
    // Zwinięcie analityki przywraca panele w stanie, w jakim były (wybór gałęzi, rozwinięcia).
    const analitykaOtwarta = branchTableOpen || execTableOpen;

    // Karta jest DOKOWANA tylko na szerokim ekranie; niżej ta sama karta wyjeżdża jako
    // szuflada — patrz `realization-new-card-mode`. `useDevice` odświeża `width` na resize,
    // więc przeciągnięcie okna przełącza tryb bez przeładowania widoku.
    const kartaDokowana = deviceWidth >= KARTA_DOK_MIN;
    const przelaczKarte = useCallback(() => setKartaWidoczna(v => {
        try { localStorage.setItem(KARTA_KEY, v ? '0' : '1'); } catch { /* tryb prywatny */ }
        return !v;
    }), []);
    // Esc zamyka WYŁĄCZNIE szufladę: zadokowana karta jest częścią układu, a nie warstwą
    // nad nim, więc nie ma czego „odwoływać". Przy otwartym protokole Esc należy do modala.
    useEffect(() => {
        if (!kartaWidoczna || kartaDokowana || protokolOtwarty) return;
        const onKey = (e) => { if (e.key === 'Escape') przelaczKarte(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [kartaWidoczna, kartaDokowana, protokolOtwarty, przelaczKarte]);
    // Referencja stabilna, bo `PositionsTable` woła ją z `useEffect`: nowa funkcja przy każdym
    // renderze rodzica odpalałaby efekt w kółko. Porównanie etykiet ucina zbędne renderowanie.
    const zglosUkryteKolumny = useCallback((widoczne) => {
        const brakujace = REALIZATION_NEW_COLS.filter(c => !widoczne.includes(c)).map(c => c.label);
        setUkryteKolumny(prev => (prev.join('|') === brakujace.join('|') ? prev : brakujace));
    }, []);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 size={16} className="animate-spin" /> Wczytywanie realizacji…
            </div>
        );
    }

    const selectedNode = idx.leaves.find(n => n.id === selectedLeaf) || null;

    return (
        // `rn-fluid` niesie skalę typografii (`index.css`, @anchor realization-fluid-scale) —
        // musi siedzieć na korzeniu zakładki, bo tokeny dziedziczą wszystkie trzy panele,
        // szuflada zakupów i modal protokołu.
        <div className="rn-fluid flex h-full flex-col bg-[#030712] text-gray-200">
            {/* ── Analiza zamówienia — warunek roli: `realization-new-can-see-money` ── */}
            <div className={`border-b border-white/[.07] px-4 py-3 ${
                analitykaOtwarta ? 'min-h-0 flex-1 overflow-auto' : 'shrink-0'}`}>
                {/* Źródło planu widzi KAŻDA rola — przełącznik wersji w belce górnej celowo nie
                    zmienia kosztów jedn. ani ilości, a bez podpisu wyglądałoby to na usterkę. */}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    {planLabel && (
                        <span
                            title="Realizacja rozlicza się wobec zakresu zaakceptowanego przez klienta, więc przełącznik wersji w belce górnej nie zmienia kosztów jedn. ani ilości planu."
                            className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                            {planLabel}
                        </span>
                    )}
                    {/* Eksport i protokół działają na TYM, co widać w tabeli — po wyborze gałęzi
                        i filtrach. Dlatego stoją przy analizie, a nie przy pojedynczej pozycji. */}
                    <button
                        onClick={exportExcel}
                        disabled={exporting || !exportRows.length}
                        title="Eksport do Excela — dokładnie te wiersze, które widać, plus arkusz podsumowania"
                        className="flex items-center gap-1.5 rounded border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-40">
                        <FileSpreadsheet size={12} />
                        {exporting ? 'eksportuję…' : 'Excel'}
                    </button>
                    <button
                        onClick={() => setProtokolOtwarty(true)}
                        disabled={!exportRows.length}
                        title="Protokół odbioru prac — wybór odbieranych pozycji, wartości z wyceny, wyjście w PDF i DOCX"
                        className="flex items-center gap-1.5 rounded border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-300 transition-colors hover:bg-violet-500/20 disabled:opacity-40">
                        <FileText size={12} />
                        Protokół
                    </button>
                    <span className="text-xs text-gray-500">
                        w eksporcie: <span className="font-mono text-gray-300">{exportRows.length}</span> z {idx.leaves.length} pozycji
                    </span>
                </div>
                {/* Analiza idzie za tym samym warunkiem co kwoty w drzewie (`realization-new-can-see-money`),
                    bo liczy się z DOKŁADNIE tych pozycji, które widać w tabeli: logistykowi zostaje po
                    filtrze `realization-new-visible-types` materiał i sprzęt, czyli jego własne zakupy.
                    Pracownik nadal dostaje w tym miejscu komunikat zamiast liczb. */}
                {canSeeMoney
                    ? <Analiza
                        a={analysis} orderName={orderName}
                        open={branchTableOpen} onToggle={() => setBranchTableOpen(v => !v)}
                        execOpen={execTableOpen} onToggleExec={() => setExecTableOpen(v => !v)}
                        kpiOpen={kpiOpen} onToggleKpi={() => setKpiOpen(v => !v)} />
                    : (
                        <div className="rounded-md border border-white/[.07] bg-[#0a1120] px-3.5 py-2.5 text-xs text-gray-400">
                            <b className="text-gray-300">Analiza zamówienia — widok dla ról ADMIN, MANAGER i LOGISTYK.</b><br />
                            Pozycje i zakupy w tabeli poniżej są dostępne, ale sumy wyceny, odchylenia i rozbicie
                            na zakresy zostają ukryte.
                        </div>
                    )}
            </div>

            {/* `relative` jest kotwicą szuflady karty pozycji (`realization-new-card-mode`) —
                szuflada kładzie się na tym rzędzie, a nie na całej zakładce, więc nie zasłania
                belki eksportu ani analizy. */}
            <div className={`relative min-h-0 flex-1 ${analitykaOtwarta ? 'hidden' : 'flex'}`}>
                {/* ── Panel 1 — gałęzie zamówienia ─────────────────────────────── */}
                {/* Szerokości paneli bocznych są PROPORCJĄ okna, nie stałą: 520/440px to
                    wartości dobrane na 3440px, a na 1500px zabierały środkowej tabeli tyle,
                    że na 13 kolumn zostawało ~540px. Górna granica clamp trzyma dotychczasowy
                    wygląd na dużym ekranie, dolna nie pozwala zwinąć drzewa poniżej czytelności. */}
                <div className="flex w-[clamp(240px,20vw,520px)] shrink-0 flex-col border-r border-white/[.07]">
                    <PanelHeader
                        title="Gałęzie zamówienia"
                        meta={`${idx.branches.length - 1} gałęzi · ${idx.leaves.length} pozycji`}
                    />
                    <div className="min-h-0 flex-1 overflow-auto">
                        {/* Kwoty gałęzi — ADMIN, MANAGER i LOGISTYK (`realization-new-branch-money`).
                            Pracownik dostaje drzewo z samą liczbą pozycji. */}
                        <div className="flex items-center gap-2 border-b border-white/[.07] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            <span className="flex-1">Gałąź</span>
                            <span className="w-9 text-right">Poz.</span>
                            {canSeeMoney && <span className="w-24 text-right text-orange-400">Wycena</span>}
                            {canSeeMoney && <span className="w-24 text-right text-red-400">Zakup</span>}
                        </div>
                        <BranchTree
                            idx={idx} rootId={SYNTHETIC_ROOT} level={0}
                            selected={selectedBranch}
                            onSelect={(id) => { setSelectedBranch(id); setSelectedLeaf(null); }}
                            cardOf={cardOf} actualsOf={actualsOf} isUnfinished={isUnfinished}
                            leafBranch={leafBranchPath.branchId} leafPath={leafBranchPath.path}
                            showMoney={canSeeMoney}
                        />
                    </div>
                </div>

                {/* ── Panel 2 — pozycje i zakupy ───────────────────────────────── */}
                <div className="flex min-w-0 flex-1 flex-col">
                    <PanelHeader
                        title={idx.nodeById[selectedBranch]?.name || 'Pozycje i zakupy'}
                        meta={`${visibleLeaves.length} pozycji · ${visibleLeaves.reduce((s, n) => s + actualsOf(n).length, 0)} zakupów`}
                        actions={
                            <>
                                <MiniBtn onClick={() => setExpanded(new Set(visibleLeaves.filter(n => actualsOf(n).length).map(n => n.id)))}>Rozwiń zakupy</MiniBtn>
                                <MiniBtn muted onClick={() => setExpanded(new Set())}>Zwiń</MiniBtn>
                                <MiniBtn muted={!onlyOpen} onClick={() => setOnlyOpen(v => !v)}>
                                    {onlyOpen ? 'Pokaż wszystkie' : 'Tylko niedomknięte'}
                                </MiniBtn>
                                {filtryAktywne && <MiniBtn onClick={() => setColFilters({})}>Wyczyść filtry</MiniBtn>}
                                {ukryteKolumny.length > 0 && (
                                    <span title={`Za wąski panel na komplet kolumn — schowane: ${ukryteKolumny.join(', ')}. Wszystkie te dane są w karcie pozycji i w eksporcie do Excela.`}
                                        className="cursor-help self-center text-[10px] uppercase tracking-wider text-amber-300/70">
                                        {ukryteKolumny.length} kol. ukryte
                                    </span>
                                )}
                                <MiniBtn muted={!kartaWidoczna} onClick={przelaczKarte}>
                                    {kartaWidoczna ? 'Ukryj kartę' : 'Karta pozycji'}
                                </MiniBtn>
                            </>
                        }
                    />
                    <div className="min-h-0 flex-1 overflow-auto">
                        <PositionsTable
                            leaves={visibleLeaves} rowOf={rowOf} actualsOf={actualsOf}
                            expanded={expanded} onToggleExpanded={toggleExpanded}
                            selected={selectedLeaf} onSelect={setSelectedLeaf}
                            readOnly={readOnly}
                            filters={colFilters} filterOptions={filterOptions}
                            onFilterChange={(key, val) => setColFilters(prev => ({ ...prev, [key]: val }))}
                            onClearFilters={() => setColFilters({})}
                            onSaveAxis={saveAxis} onSaveComment={saveComment}
                            onSaveOwner={saveOwner} ownerOptions={ownerOptions}
                            onAddActual={addActual} onUpdateActual={updateActual} onDeleteActual={deleteActual}
                            onColsChange={zglosUkryteKolumny}
                        />
                    </div>
                </div>

                {/* ── Panel 3 — karta pozycji: kolumna, szuflada albo szyna ────── */}
                {kartaWidoczna ? (
                    <div className={kartaDokowana
                        ? 'flex w-[clamp(300px,19vw,440px)] shrink-0 flex-col border-l border-white/[.07]'
                        : 'animate-slide-in-right absolute inset-y-0 right-0 z-30 flex w-[min(440px,90vw)] flex-col border-l border-white/[.07] bg-[#0a1120] shadow-2xl'}>
                        <PanelHeader
                            title="Karta pozycji"
                            meta={selectedNode ? `${actualsOf(selectedNode).length} zakupów w tabeli` : ''}
                            actions={<MiniBtn muted onClick={przelaczKarte}>
                                {kartaDokowana ? 'Ukryj' : 'Zamknij (Esc)'}
                            </MiniBtn>}
                        />
                        <div className="min-h-0 flex-1 overflow-auto p-3">
                            {selectedNode
                                ? <LeafCard node={selectedNode} {...rowOf(selectedNode)}
                                    readOnly={readOnly} token={token} onRefreshCard={fetchCards}
                                    onToggleClosed={() => toggleClosed(selectedNode)} />
                                : <div className="pt-10 text-center text-sm text-gray-600">Wybierz pozycję w tabeli,<br />żeby zobaczyć jej kartę.</div>}
                        </div>
                    </div>
                ) : (
                    /* Szyna zostaje w miejscu karty, żeby po jej schowaniu było widać, że
                       panel istnieje i gdzie go szukać. Sam przycisk w nagłówku tabeli byłby
                       jedynym śladem, a ten ginie wśród filtrów i rozwijania zakupów. */
                    <button onClick={przelaczKarte} title="Pokaż kartę wybranej pozycji"
                        className="flex w-6 shrink-0 items-center justify-center gap-2 border-l border-white/[.07] bg-[#0a1120] transition-colors hover:bg-white/[.04]">
                        <span style={{ writingMode: 'vertical-rl' }}
                            className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-teal-300/70">
                            Karta pozycji
                        </span>
                        {selectedNode && <span title="Pozycja wybrana w tabeli" className="size-1.5 rounded-full bg-teal-300/80" />}
                    </button>
                )}
            </div>

            <ProtokolOdbioruModal
                open={protokolOtwarty}
                onClose={() => setProtokolOtwarty(false)}
                rows={exportRows}
                wbsNodes={wbsNodes}
                nodeId={nodeId}
                orderName={orderName}
                planValueOf={planValueOf}
                oneDriveFolderName={oneDriveFolderName}
            />
        </div>
    );
}

// ─── Panele ───────────────────────────────────────────────────────────────────

const PanelHeader = ({ title, meta, actions }) => (
    <div className="flex shrink-0 items-center gap-3 border-b border-white/[.07] bg-[#0a1120] px-3 py-2">
        <span className="truncate text-[11px] font-bold uppercase tracking-widest text-teal-300">{title}</span>
        {meta && <span className="shrink-0 text-xs text-gray-500">{meta}</span>}
        {actions && <div className="ml-auto flex shrink-0 gap-1.5">{actions}</div>}
    </div>
);

const MiniBtn = ({ children, onClick, muted }) => (
    <button onClick={onClick}
        className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${muted
            ? 'border-white/[.14] text-gray-400 hover:text-gray-200'
            : 'border-teal-500/40 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20'}`}>
        {children}
    </button>
);

// @anchor realization-new-branch-tree — pełne drzewo gałęzi z dwiema kolumnami kwotowymi.
// Bursztynowa kropka = w poddrzewie są pozycje bez pełnego pokrycia zakupami.
// @anchor realization-new-branch-money — dwie kolumny kwotowe (wycena / zakup) widzi WYŁĄCZNIE
// ADMIN i MANAGER, tą samą regułą co analiza zamówienia nad tabelą. Logistyk prowadzi zakupy,
// więc pisze po osiach i wpisach, ale sum gałęzi nie ogląda — inaczej lewy panel obchodziłby
// ukrycie analizy, pokazując to samo w rozbiciu na zakresy.
// Seledynowy pasek przy lewej krawędzi rysuje ŚCIEŻKĘ do gałęzi wybranej w tabeli pozycji
// (`realization-new-leaf-branch-path`): pełny kolor na samej gałęzi, przygaszony na jej
// przodkach, więc linia prowadzi wzrok od korzenia w dół. To NIE jest wybór gałęzi — wybór
// dalej filtruje tabelę i ma własne tło.
function BranchTree({ idx, rootId, level, selected, onSelect, cardOf, actualsOf, isUnfinished, leafBranch, leafPath, showMoney }) {
    // Hooki stoją PRZED wyjściem na brakującym węźle — inaczej ten sam komponent raz
    // wywoływałby `useRef`/`useEffect`, a raz nie, i React zgłosiłby zmianę liczby hooków.
    const rowRef = useRef(null);
    const galazLiscia = leafBranch === rootId;
    // Gałąź wybranej pozycji bywa poza widokiem przewijanego drzewa — samo podświetlenie
    // niczego by wtedy nie powiedziało. `block: 'nearest'` nie rusza panelu, gdy wiersz już
    // widać, więc przewijanie nie skacze przy każdym kliknięciu w tabeli.
    useEffect(() => {
        if (galazLiscia) rowRef.current?.scrollIntoView({ block: 'nearest' });
    }, [galazLiscia]);

    const node = idx.nodeById[rootId];
    if (!node) return null;
    const naSciezce = leafPath?.has(rootId);
    const leaves = idx.leavesOfSubtree(rootId);
    // Sumy liczą się TYLKO wtedy, gdy jest je komu pokazać — przy zamkniętej analizie kwotowej
    // przebieg po wszystkich liściach każdej gałęzi byłby pracą na wynik, który i tak nie wychodzi
    // na ekran.
    const plan = showMoney ? leaves.reduce((s, n) => s + planValueOf(n, cardOf(n)), 0) : 0;
    const real = showMoney ? leaves.reduce((s, n) => s + realizationOf(n, actualsOf(n)).value, 0) : 0;
    const waiting = leaves.some(isUnfinished);
    const children = idx.childrenOf[rootId] || [];

    return (
        <>
            {/* Tytuł siedzi na CAŁYM wierszu, nie na samej nazwie: przy wąskim panelu nazwa
                ścina się do „i…" i zajmuje kilkanaście pikseli, więc dymek podpięty pod nią
                był nie do trafienia myszą. Kolumny liczbowe mają własne podpisy, więc i one
                niosą nazwę gałęzi — inaczej najechanie na kwotę gubiło kontekst wiersza. */}
            {/* Pasek ścieżki jedzie na `border-left`, a nie na osobnym elemencie: lewy padding
                zszedł o jego grubość, więc włączenie podświetlenia nie przesuwa treści wiersza
                i drzewo nie drga przy przeskakiwaniu między pozycjami. */}
            <div ref={rowRef} onClick={() => onSelect(rootId)}
                title={galazLiscia ? `${node.name} — tu leży pozycja wybrana w tabeli` : node.name}
                className={`flex cursor-pointer items-center gap-1.5 border-b border-white/[.04] border-l-2 py-1 pl-1.5 pr-2 text-xs hover:bg-white/[.03] ${
                    galazLiscia ? 'border-l-teal-300 bg-teal-400/[.14]'
                        : naSciezce ? 'border-l-teal-300/30' : 'border-l-transparent'} ${
                    !galazLiscia && selected === rootId ? 'bg-teal-500/10' : ''} ${
                    level <= 1 ? 'font-semibold text-gray-200' : 'text-gray-400'} ${
                    level === 1 ? 'border-t border-white/[.07]' : ''}`}>
                <span style={{ width: level * 13 }} className="shrink-0" />
                <ChevronRight size={11} className={`shrink-0 text-gray-600 ${children.length ? 'rotate-90' : 'invisible'}`} />
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                {waiting && <span title={`${node.name} — są pozycje bez pełnego pokrycia zakupami`} className="size-1.5 shrink-0 rounded-full bg-amber-400" />}
                <span className="w-9 shrink-0 text-right text-gray-500 tabular-nums" title={`${node.name} — ${leaves.length} pozycji kosztowych`}>{leaves.length}</span>
                {showMoney && <span className="w-24 shrink-0 text-right text-orange-400 tabular-nums" title={`${node.name} — wycena gałęzi`}>{fmtZl(plan)}</span>}
                {showMoney && <span className="w-24 shrink-0 text-right text-red-400 tabular-nums" title={`${node.name} — zakupy zrealizowane`}>{fmtZl(real)}</span>}
            </div>
            {children.map(c => (
                <BranchTree key={c.id} idx={idx} rootId={c.id} level={level + 1}
                    selected={selected} onSelect={onSelect}
                    cardOf={cardOf} actualsOf={actualsOf} isUnfinished={isUnfinished}
                    leafBranch={leafBranch} leafPath={leafPath} showMoney={showMoney} />
            ))}
        </>
    );
}

// @anchor realization-new-positions-table — 14 kolumn + szuflada zakupów jako wiersz potomny.
// Szuflada, a nie płaska lista zakupów: płaska gubiłaby pozycje bez ani jednego zakupu,
// a to właśnie one wymagają działania.
function PositionsTable({
    leaves, rowOf, actualsOf, expanded, onToggleExpanded, selected, onSelect,
    readOnly, filters = {}, filterOptions = {}, onFilterChange, onClearFilters,
    onSaveAxis, onSaveComment, onSaveOwner, ownerOptions = [], onAddActual, onUpdateActual, onDeleteActual, onColsChange,
}) {
    // Tabela ma `w-full`, więc jej własna szerokość JEST szerokością panelu — mierzymy ją
    // zamiast okna, bo ta sama szerokość okna daje inny panel przy karcie zadokowanej i
    // schowanej. Ukrycie kolumny nie zmienia szerokości tabeli, więc pomiar się nie zapętla.
    // DWA źródła pomiaru, bo żadne samo nie wystarcza:
    //   • odczyt `offsetWidth` po KAŻDYM renderze — łapie zmiany układu bez zdarzenia okna
    //     (schowanie karty) i działa też w karcie nieaktywnej, gdzie przeglądarka wstrzymuje
    //     `ResizeObserver` razem z całym rysowaniem;
    //   • `ResizeObserver` — łapie zmiany, po których nic się nie przerenderowuje (przeciąganie
    //     krawędzi okna, wysunięcie panelu bocznego aplikacji).
    const tableRef = useRef(null);
    const [tableW, setTableW] = useState(0);
    useLayoutEffect(() => {
        const el = tableRef.current;
        if (el && el.offsetWidth !== tableW) setTableW(el.offsetWidth);
    });
    useEffect(() => {
        const el = tableRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([e]) => setTableW(Math.round(e.contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const cols = useMemo(() => visibleCols(tableW, filters), [tableW, filters]);
    const colPct = useMemo(() => colPctOf(cols), [cols]);
    // Nagłówek panelu (rodzic) podpisuje, ILE kolumn zniknęło i jakich — stąd raport w górę.
    useEffect(() => { onColsChange?.(cols); }, [cols, onColsChange]);

    let sumPlan = 0, sumReal = 0;
    const rows = leaves.map(node => {
        const data = rowOf(node);
        sumPlan += data.planValue;
        sumReal += data.r.value;
        return { node, ...data };
    });

    return (
        <table ref={tableRef} className="w-full table-fixed border-separate border-spacing-0 text-[length:var(--rn-xl)]">
            <thead className="sticky top-0 z-10">
                <tr>
                    <th className="w-6 border-b border-white/[.14] bg-[#0a1120]" />
                    {cols.map(c => (
                        <th key={c.key} style={{ width: colPct[c.key] }}
                            className={`border-b border-white/[.14] bg-[#0a1120] px-2 py-1.5 text-sm font-bold uppercase tracking-wider text-gray-500 ${
                                c.right ? 'text-right' : 'text-left'}`}>{c.label}</th>
                    ))}
                </tr>
                {/* @anchor realization-new-filter-row — drugi wiersz nagłówka: filtr na kolumnę.
                    Stoi w `<thead>`, więc zostaje na ekranie przy przewijaniu i przy pustym
                    wyniku — filtr da się cofnąć bez przeładowania widoku. */}
                <tr>
                    <th className="border-b border-white/[.07] bg-[#0a1120]" />
                    {cols.map(c => (
                        <th key={c.key} className="border-b border-white/[.07] bg-[#0a1120] px-1.5 py-1">
                            {NEW_DROPDOWN_FILTER_COLS.has(c.key) ? (
                                <FilterDropdown
                                    accent="teal"
                                    options={filterOptions[c.key] || []}
                                    selected={Array.isArray(filters[c.key]) ? filters[c.key] : []}
                                    onChange={vals => onFilterChange(c.key, vals)}
                                />
                            ) : (
                                <input
                                    value={typeof filters[c.key] === 'string' ? filters[c.key] : ''}
                                    onChange={e => onFilterChange(c.key, e.target.value)}
                                    placeholder={NEW_TEXT_FILTER_COLS.has(c.key) ? 'szukaj; lub; wiele' : 'filtruj...'}
                                    className="w-full rounded border border-white/10 bg-black/30 px-2 py-0.5 text-xs text-white outline-none placeholder-gray-700 focus:border-teal-500/40"
                                />
                            )}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.length === 0 && (
                    <tr>
                        <td colSpan={cols.length + 1} className="px-4 py-12 text-center">
                            <div className="text-sm text-gray-500">Brak pozycji pasujących do filtra.</div>
                            <button onClick={onClearFilters}
                                className="mt-2 rounded border border-teal-500/25 bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-300 hover:bg-teal-500/20">
                                Wyczyść filtry kolumn
                            </button>
                        </td>
                    </tr>
                )}
                {rows.map(({ node, card, r, planValue, deltaQty }) => {
                    const open = expanded.has(node.id);
                    // Rozwinięta pozycja i jej szuflada tworzą JEDNĄ kartę: wiersz dostaje seledynową
                    // krawędź górną i boczne, traci dolną (łączy się z szufladą), a tło jest jaśniejsze
                    // niż wiersze zwinięte — inaczej nie było widać, do której pozycji należy szuflada.
                    const tdOpen = open ? `border-t ${DRAWER.accent.real.cell}` : 'border-b border-white/[.05]';
                    return (
                        <React.Fragment key={node.id}>
                            <tr onClick={() => onSelect(node.id)}
                                className={`cursor-pointer align-top ${open ? '' : 'hover:bg-white/[.03]'} ${selected === node.id && !open ? 'bg-teal-500/[.08]' : ''}`}>
                                <td className={`px-1 py-1.5 ${tdOpen} ${open ? 'border-l border-l-teal-300/45' : ''}`}>
                                    <ChevronRight size={24}
                                        onClick={(e) => { e.stopPropagation(); onToggleExpanded(node.id); }}
                                        className={`cursor-pointer transition-transform hover:text-teal-300 ${open ? 'rotate-90 text-teal-300' : 'text-gray-500'}`} />
                                </td>
                                {cols.map((c, i) => (
                                    <td key={c.key}
                                        className={`px-2 py-1.5 ${tdOpen} ${c.right ? 'text-right tabular-nums' : ''} ${
                                            open && i === cols.length - 1 ? 'border-r border-r-teal-300/45' : ''}`}>
                                        <Cell colKey={c.key} node={node} card={card} r={r} planValue={planValue} deltaQty={deltaQty}
                                            readOnly={readOnly} onSaveAxis={onSaveAxis} onSaveComment={onSaveComment}
                                            onSaveOwner={onSaveOwner} ownerOptions={ownerOptions} />
                                    </td>
                                ))}
                            </tr>
                            {open && (
                                <tr>
                                    <td colSpan={cols.length + 1}
                                        className={`${DRAWER.cardCell} ${DRAWER.accent.real.cell}`}>
                                        <PurchaseDrawer node={node} card={card} r={r} planValue={planValue}
                                            readOnly={readOnly}
                                            onAdd={draft => onAddActual(node, draft)}
                                            onUpdate={onUpdateActual} onDelete={onDeleteActual} />
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    );
                })}
            </tbody>
            <tfoot className="sticky bottom-0">
                <tr>
                    <td className="border-t border-white/[.14] bg-[#0a1120]" />
                    {cols.map(c => (
                        <td key={c.key} className={`border-t border-white/[.14] bg-[#0a1120] px-2 py-1.5 ${c.right ? 'text-right tabular-nums' : ''}`}>
                            {c.key === 'name' && <span className="text-[length:var(--rn-md)] font-semibold text-gray-400">Razem widoczne</span>}
                            {c.key === 'total' && (
                                <>
                                    <div className="font-semibold text-orange-400">{fmtZl(sumPlan)}</div>
                                    <div className="font-semibold text-red-400">{fmtZl(sumReal)}</div>
                                    <DeltaLine value={sumReal - sumPlan} />
                                </>
                            )}
                        </td>
                    ))}
                </tr>
            </tfoot>
        </table>
    );
}

// @anchor realization-new-delta-line — Δ (zakup − wycena) pod dwiema kwotami kolumny
// „Koszt całkowity", jak w zakładce „Realizacja": kolor wg znaku, bo niesie kierunek
// (oszczędność vs przekroczenie), a nie stronę. Pozycja bez zakupów Δ nie dostaje —
// minus cała wycena czytałby się jak oszczędność.
function DeltaLine({ value }) {
    const d = round2(value);
    return (
        <div className={`whitespace-nowrap font-bold ${d > 0.005 ? 'text-red-300' : d < -0.005 ? 'text-teal-300' : 'text-gray-500'}`}>
            Δ {d > 0 ? '+' : ''}{fmtZl(d)}
        </div>
    );
}

// @anchor realization-new-cell — jedna komórka wiersza pozycji.
function Cell({ colKey, node, card, r, planValue, deltaQty, readOnly, onSaveAxis, onSaveComment, onSaveOwner, ownerOptions = [] }) {
    const t = TYPE_META[node.type];
    const state = REAL_STATE[r.state];

    switch (colKey) {
        // Sama nazwa liścia — bez ścieżki i okruszków: gałąź stoi w lewym panelu, a nazwy
        // węzłów bywają 20-linijkowe. Trzy linie i pełna treść w dymku.
        case 'name':
            return <div className="line-clamp-3 leading-snug" title={getParentPath(node.path)}>{node.name}</div>;
        case 'type':
            return <span className={`text-[length:var(--rn-md)] font-semibold uppercase tracking-wide ${t?.color || 'text-gray-400'}`}>{t?.label || node.type}</span>;
        // Osoba odpowiedzialna jest ETYKIETĄ z listy wyboru („Firma - Imię Nazwisko"), nie
        // kluczem obcym — pokazujemy ją w całości, a dymek niesie pełną treść, gdy kolumna
        // przytnie długie nazwisko z firmą.
        case 'owner':
            return <OwnerCell node={node} readOnly={readOnly} options={ownerOptions} onSave={onSaveOwner} />;
        case 'supplier': {
            const names = [...new Set(r.entries.map(e => e.supplier?.name).filter(Boolean))];
            return <span className="text-[length:var(--rn-md)] text-gray-400">{names.length ? names.join(', ') : '—'}</span>;
        }
        case 'qty':
            return <>{fmtQty(node.quantity)} <span className="text-[length:var(--rn-md)] text-gray-500">{node.unit}</span></>;
        case 'realization':
            return (
                <>
                    <span className={state.text}>{fmtQty(r.qty)} / {fmtQty(r.plan)}</span>
                    <div className="mt-1 h-1 overflow-hidden rounded-sm bg-white/10">
                        <i className={`block h-full ${state.bar}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                    </div>
                </>
            );
        case 'deltaQty':
            return deltaQty === 0
                ? <span className="text-gray-600">—</span>
                : <span className={deltaQty < 0 ? 'text-amber-300' : 'text-red-300'}>{deltaQty > 0 ? '+' : ''}{fmtQty(deltaQty)}</span>;
        case 'price':
            return <>{fmtZl(planUnitOf(node, card))}</>;
        // Średnia ważona z wpisów, a przy ich braku cena z propozycji `isPurchase`. Bez tego
        // fallbacku pozycja zamówiona, ale jeszcze niedostarczona, udawałaby, że nie ma
        // uzgodnionej ceny zakupu.
        case 'purchasePrice': {
            const unit = r.avg ?? purchaseUnitOf(card);
            if (unit == null) return <span className="text-gray-600">—</span>;
            return (
                <>
                    {fmtZl(unit)}
                    {r.avg != null && r.mixedPrices && <span className="ml-1 text-[length:var(--rn-md)] text-gray-500" title="Średnia ważona z wpisów realizacji">śr.</span>}
                    {r.avg == null && <span className="ml-1 text-[length:var(--rn-md)] text-gray-500" title="Cena z propozycji isPurchase — brak wpisów">ofert.</span>}
                </>
            );
        }
        case 'total':
            return (
                <>
                    <div className="text-orange-400">{fmtZl(planValue)}</div>
                    <div className="text-red-400">{fmtZl(r.value)}</div>
                    {(r.qty > 0 || node.realizationClosed) && <DeltaLine value={r.value - planValue} />}
                </>
            );
        case 'status': {
            const meta = offerStatusMetaOf(node);
            return <Badge label={meta?.label} color={meta?.color} size={FIELD_FONT}
                title={node._outOfBaseline ? 'Pozycja dodana po akceptacji oferty — wycena 0, cały koszt to odchylenie' : undefined} />;
        }
        case 'purchaseStatus':
        case 'execStatus':
            return <AxisSelect node={node} axis={colKey === 'purchaseStatus' ? 'purchase' : 'exec'}
                readOnly={readOnly} onSave={onSaveAxis} />;
        case 'comment':
            return <CommentCell node={node} readOnly={readOnly} onSave={onSaveComment} />;
        default:
            return null;
    }
}

// @anchor realization-new-axis-select — oś realizacji jako dropdown, ten sam zestaw wartości
// co w `RealizationTab`. Bramka etapu ZOSTAJE plakietką, a nie wyszarzonym selectem: dopóki
// etap się nie otworzył, nie ma czego wybierać, a pusty dropdown zapraszałby do ustawienia
// stanu wbrew kolejności plan → zakup → montaż.
function AxisSelect({ node, axis, readOnly, onSave }) {
    const applies = axis === 'purchase' ? hasPurchaseAxis(node.type) : hasExecAxis(node.type);
    if (!applies) return <span className="text-gray-700">—</span>;
    const gate = axisGateOf(node, axis);
    if (gate) return <Badge label={gate.label} color="text-gray-500" italic title={gate.title} size={FIELD_FONT} />;

    const pole = axis === 'purchase' ? 'purchaseStatus' : 'execStatus';
    const meta = axis === 'purchase' ? PURCHASE_STATUS_META : EXEC_STATUS_META;
    const code = node[pole] || (axis === 'purchase' ? DEFAULT_PURCHASE_STATUS : DEFAULT_EXEC_STATUS);
    return (
        <select
            value={code}
            disabled={readOnly}
            onClick={e => e.stopPropagation()}
            onChange={e => onSave(node, pole, e.target.value)}
            title={axis === 'purchase' ? 'Status zakupu' : 'Status wykonania'}
            className={`w-full min-w-0 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 ${FIELD_FONT} font-medium outline-none transition-colors ${
                readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-white/5 focus:border-teal-500/50'} ${meta[code]?.color || 'text-gray-400'}`}
        >
            {Object.keys(meta).map(kod => (
                <option key={kod} value={kod} className="bg-gray-900 text-white">
                    {axis === 'exec' ? execStatusLabel(node.type, kod) : meta[kod].label}
                </option>
            ))}
        </select>
    );
}

// @anchor realization-new-owner-cell — `WbsNode.owner` jako lista wyboru w tabeli pozycji.
// Zapis natychmiastowy (to jeden klik, nie pisanie), bez stanu lokalnego: wartość idzie wprost
// z węzła, a `saveOwner` zmienia ją optymistycznie w tabeli.
//
// Dwie rzeczy celowo NIE są tu powtórzone ze Struktury projektu: reguła `nodeCanHaveOwner`
// (tabela pokazuje wyłącznie pozycje, gałęzi w niej nie ma) i budowanie listy opcji
// (`build-owner-options` jest wspólne). Pusty wybór zapisuje pusty string, czyli zdejmuje
// osobę — tak samo jak opcja „—" w Strukturze projektu.
function OwnerCell({ node, readOnly, options = [], onSave }) {
    const kto = String(node.owner || '').trim();
    if (readOnly || !onSave) {
        return kto
            ? <span className="line-clamp-2 text-[length:var(--rn-md)] leading-snug text-gray-300" title={kto}>{kto}</span>
            : <span className="text-[length:var(--rn-md)] text-gray-600" title="Pozycja bez osoby odpowiedzialnej">{BRAK_WLASCICIELA}</span>;
    }
    return (
        <select
            value={kto}
            onClick={e => e.stopPropagation()}
            onChange={e => onSave(node, e.target.value)}
            title={kto || 'Osoba odpowiedzialna za pozycję'}
            className={`w-full min-w-0 cursor-pointer rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[length:var(--rn-md)] leading-snug outline-none transition-colors hover:bg-white/5 focus:border-teal-500/50 ${
                kto ? 'text-gray-300' : 'text-gray-600'}`}
        >
            <option value="" className="bg-gray-900 text-white">{BRAK_WLASCICIELA}</option>
            {options.map((o, i) => (
                o.separator
                    ? <option key={`sep-${i}`} disabled className="bg-gray-900">──────────</option>
                    : <option key={o.value} value={o.value} className="bg-gray-900 text-white">{o.label}</option>
            ))}
        </select>
    );
}

// @anchor realization-new-comment-cell — `WbsNode.comment` edytowalny w miejscu, zapis na blur
// i tylko gdy treść faktycznie się zmieniła. Stan lokalny, żeby pisanie nie przechodziło przez
// zapis przy każdym znaku; `useEffect` przyjmuje zmianę, która przyszła z innego widoku.
function CommentCell({ node, readOnly, onSave }) {
    const [val, setVal] = useState(node.comment || '');
    useEffect(() => { setVal(node.comment || ''); }, [node.comment]);
    return (
        <AutoResizeTextarea
            value={val}
            readOnly={readOnly}
            placeholder={readOnly ? '' : 'komentarz'}
            onChange={e => setVal(e.target.value)}
            onClick={e => e.stopPropagation()}
            onBlur={() => { if ((node.comment || '') !== val) onSave(node.id, val); }}
            className={`w-full border-none bg-transparent text-[length:var(--rn-lg)] leading-snug text-gray-400 outline-none placeholder-gray-700 ${readOnly ? 'cursor-default' : ''}`}
        />
    );
}

// @anchor realization-new-purchase-drawer — szuflada zakupów: kolumny `LeafActual`, nie
// kolumny tabeli głównej. Materiał i sprzęt niosą producenta/model/EAN, reszta typów jedno
// pole `scope`. „ZREALIZOWANE" w etykiecie nie jest ozdobnikiem: karta obok też mówi „zakup"
// (propozycja `isPurchase`), a fakt i uzgodnienie czytają się jak sprzeczność, gdy pozycja
// ma cenę, ale nie ma dostaw.
// Wpisy są tu EDYTOWALNE w miejscu, a nowy dodaje się przyciskiem w nagłówku szuflady —
// dopisywanie jest świadomą czynnością, więc formularz otwiera się na żądanie, a nie stoi
// pustym wierszem pod każdą pozycją.
function PurchaseDrawer({ node, card, r, planValue, readOnly, onAdd, onUpdate, onDelete }) {
    const withCard = TYPE_META[node.type]?.hasCard;
    const [adding, setAdding] = useState(false);
    const delta = round2(r.value - planValue);
    // @anchor realization-new-surplus-split — podział wpisów na zakupy w ofercie i nadmiarowe
    // (`LeafActual.isSurplus`). Wycenę pokrywają WYŁĄCZNIE wpisy bez znacznika: ich ilość ponad
    // plan to sygnał, że któryś zakup trzeba oznaczyć jako nadmiarowy.
    const nadmiar = r.entries.filter(e => e.isSurplus);
    const qtyNadmiar = Math.round(nadmiar.reduce((s, e) => s + (Number(e.qty) || 0), 0) * 1000) / 1000;
    const valNadmiar = round2(nadmiar.reduce((s, e) => s + (Number(e.qty) || 0) * (Number(e.unitCost) || 0), 0));
    const qtyWOfercie = Math.round((r.qty - qtyNadmiar) * 1000) / 1000;
    const przekroczenie = Math.round((qtyWOfercie - r.plan) * 1000) / 1000;
    // Domyślna ilość nowego wpisu = ile brakuje do planu. Koszt jedn. zostaje PUSTY świadomie:
    // podpowiedziana cena zapisywała się kwotą, której nikt nie przeczytał, a to rozliczenie.
    const brakujaco = Math.round(Math.max(0, r.plan - qtyWOfercie) * 1000) / 1000;

    const BASE = withCard
        ? [['entryDate', 'Data', 160], ['docNumber', 'Dokument', 150], ['supplier', 'Oferent', 260],
           ['manufacturer', 'Producent', 200], ['model', 'Model', 200], ['ean', 'EAN', 190],
           ['qty', 'Ilość', 90, 1], ['unitCost', 'Koszt jedn.', 150, 1], ['wartosc', 'Wartość', 130, 1], ['surplus', 'Rozliczenie', 140], ['comment', 'Komentarz', 420]]
        : [['entryDate', 'Data', 160], ['docNumber', 'Dokument', 150], ['supplier', 'Oferent', 260],
           ['scope', 'Zakres', 320],
           ['qty', 'Ilość', 90, 1], ['unitCost', 'Koszt jedn.', 150, 1], ['wartosc', 'Wartość', 130, 1], ['surplus', 'Rozliczenie', 140], ['comment', 'Komentarz', 420]];
    const COLS = readOnly ? BASE : [...BASE, ['akcje', '', 100, 1]];
    // Szerokości szuflady liczone tak samo jak w tabeli pozycji — jako procent sumy, żeby
    // `table-fixed` nie rozepchnął jej do sumy pikseli i nie przywrócił poziomego suwaka.
    const SUMA_COLS = COLS.reduce((a, c) => a + (c[2] || 0), 0);
    const pctOf = (c) => `${((c[2] || 0) / SUMA_COLS * 100).toFixed(3)}%`;

    const head = (
        <div className={DRAWER.cardHead}>
            <span className={`${DRAWER.cardTitle} ${DRAWER.accent.real.title} text-[length:var(--rn-lg)]`}>
                {withCard ? 'Zakupy zrealizowane' : 'Wykonanie zrealizowane'}
            </span>
            {przekroczenie > 1e-9 && (
                <span className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[length:var(--rn-md)] text-amber-300"
                    title="Wpisy bez znacznika „nadmiarowy” przekraczają ilość z wyceny">
                    przekroczono wycenę o {fmtQty(przekroczenie)} {node.unit || 'szt'} — oznacz nadmiarowe
                </span>
            )}
            {qtyNadmiar > 0 && (
                <span className="rounded border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[length:var(--rn-md)] text-red-300"
                    title="Zakupy ponad ilość z wyceny — bez wartości ofertowej, w całości powiększają koszt">
                    nadmiarowe +{fmtQty(qtyNadmiar)} {node.unit || 'szt'} · +{fmtZl(valNadmiar)} zł
                </span>
            )}
            {!readOnly && (
                <button
                    onClick={(e) => { e.stopPropagation(); setAdding(v => !v); }}
                    className={`flex shrink-0 items-center gap-1.5 rounded border px-3 py-1 text-[length:var(--rn-xl)] transition-colors ${
                        adding ? 'border-white/[.14] text-gray-400 hover:text-gray-200'
                               : 'border-teal-500/30 text-teal-300 hover:bg-teal-500/10'}`}>
                    <Plus size={22} className={adding ? 'rotate-45 transition-transform' : 'transition-transform'} />
                    {adding ? 'Anuluj' : addEntryLabel(node.type)}
                </button>
            )}
        </div>
    );

    // Pusta szuflada mówi, co JUŻ WIADOMO: uzgodnioną cenę, dostawcę i termin z propozycji
    // `isPurchase`. Samo „brak zakupów" kazałoby szukać tego w karcie obok.
    const pusta = () => {
        const pr = card?.proposals?.find(x => x.isPurchase) || null;
        const agreed = purchaseUnitOf(card);
        return (
            <div className="px-3 pb-2.5 text-[length:var(--rn-2xl)] text-gray-400">
                Nic jeszcze nie dojechało. Pozycja wyceniona na <b className="text-gray-200">{fmtZl(planValue)} zł</b>.
                {pr && agreed != null && (
                    <>
                        <br /><span className="text-teal-300">Cena uzgodniona</span> {fmtZl(agreed)} zł/{node.unit}
                        {pr.seller ? ` u ${pr.seller}` : ''}
                        {pr.offerNumber ? ` (oferta ${pr.offerNumber})` : ''}
                        {pr.availability ? ` · dostępność ${pr.availability}` : ''}
                        {' '}— to <b className="text-gray-200">uzgodnienie</b>, nie zrealizowany zakup.
                    </>
                )}
            </div>
        );
    };

    // Szuflada CELOWO bez `overflow-hidden`: przycinał rozwiniętą listę `SupplierPicker`
    // na swojej dolnej krawędzi. Zaokrąglenie zostaje — róg tabeli wystaje o pół piksela.
    return (
        <div className={`${DRAWER.card} ${DRAWER.accent.real.card}`}
            onClick={e => e.stopPropagation()}>
            {head}
            {!r.entries.length && pusta()}
            {(r.entries.length > 0 || adding) && (
                <table className="w-full table-fixed border-separate border-spacing-0 text-[length:var(--rn-lg)]">
                    <thead>
                        <tr>
                            {COLS.map(c => (
                                <th key={c[0]} style={{ width: pctOf(c) }}
                                    className={`border-y border-white/[.07] px-2 py-1 text-sm font-bold uppercase tracking-wider text-gray-500 ${
                                        c[3] ? 'text-right' : 'text-left'}`}>{c[1]}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {r.entries.map(a => (
                            <EntryRow key={a.id} entry={a} cols={COLS}
                                readOnly={readOnly} onSave={onUpdate} onDelete={onDelete} />
                        ))}
                        {adding && (
                            <EntryForm node={node} cols={COLS} withCard={withCard} defaultQty={brakujaco || 1}
                                defaultSurplus={r.plan > 0 && brakujaco === 0}
                                onAdd={onAdd} onClose={() => setAdding(false)} />
                        )}
                    </tbody>
                    {r.entries.length > 0 && (
                        <tfoot className="bg-teal-500/[.07]">
                            <tr>
                                <td colSpan={withCard ? 6 : 4} className="border-t border-teal-300/35 px-2 py-1.5 text-gray-400">Razem zakupy tej pozycji</td>
                                <td className="border-t border-teal-300/35 px-2 py-1.5 text-right tabular-nums text-gray-200">{fmtQty(r.qty)}</td>
                                <td className="border-t border-teal-300/35 px-2 py-1.5 text-right tabular-nums text-gray-500">śr. {fmtZl(r.avg)}</td>
                                <td className="border-t border-teal-300/35 px-2 py-1.5 text-right font-semibold tabular-nums text-red-400">{fmtZl(r.value)}</td>
                                <td colSpan={2} className="border-t border-teal-300/35 px-2 py-1.5 text-gray-500">
                                    wycena {fmtZl(planValue)} zł · <span className={delta <= 0 ? 'text-emerald-300' : 'text-red-300'}>
                                        {delta > 0 ? '+' : ''}{fmtZl(delta)} zł</span>
                                </td>
                                {!readOnly && <td className="border-t border-teal-300/35" />}
                            </tr>
                        </tfoot>
                    )}
                </table>
            )}
        </div>
    );
}

// @anchor realization-new-entry-field — jedno pole wpisu `LeafActual`. Zachowanie (działanie
// po „=", Enter do następnego pola, zaznaczenie całej treści przy wejściu, rosnące pola
// tekstowe) pochodzi z `wbs/entryFields.js` i jest WSPÓLNE z zakładką „Realizacja" — ten sam
// wpis ma znaczyć w obu tabelach to samo.
function entryField({ k, value, onChange, onBlur, onKeyDown, disabled, extra = '', placeholder, label }) {
    const wspolne = {
        value, disabled, placeholder, onChange, onBlur, onKeyDown,
        'data-entry-field': true,
        'aria-label': label,
        onFocus: selectAllOnFocus,
        className: `${ENTRY_INPUT_LG} ${extra} disabled:opacity-60`,
    };
    if (growsWithText(k)) {
        return <AutoResizeTextarea {...wspolne} style={{ minHeight: FIELD_H }} className={`${wspolne.className} align-top`} />;
    }
    return <input {...wspolne} style={{ height: FIELD_H }} title={NUMERIC_ENTRY_FIELDS.has(k) ? FORMULA_HINT : undefined} />;
}

// @anchor realization-new-surplus-toggle — znacznik „nadmiarowy" wpisu (`LeafActual.isSurplus`).
// Przełącznik, nie checkbox w tle: czerwony stan ma być widoczny z daleka, bo taki wpis
// w całości powiększa koszt pozycji.
function SurplusToggle({ on, readOnly = false, onChange }) {
    if (readOnly) return on ? <span className="text-red-300">nadmiarowy</span> : <span className="text-gray-600">w ofercie</span>;
    return (
        <button type="button" onClick={e => { e.stopPropagation(); onChange(!on); }}
            title={on ? 'Zakup ponad ilość z wyceny — kliknij, aby wrócić do oferty' : 'Oznacz zakup jako nadmiarowy (ponad ilość z wyceny)'}
            style={{ height: FIELD_H }}
            className={`inline-flex items-center gap-1.5 rounded border px-2 text-[length:var(--rn-md)] transition-colors ${
                on ? 'border-red-400/50 bg-red-500/15 text-red-300' : 'border-white/10 text-gray-500 hover:text-gray-300'}`}>
            <span className={`inline-block h-3 w-3 rounded-sm border ${on ? 'border-red-300 bg-red-400' : 'border-gray-500'}`} />
            nadmiarowy
        </button>
    );
}

// @anchor realization-new-entry-row — zapisany wpis `LeafActual` jako wiersz szuflady,
// edytowalny w miejscu. Zapis idzie na blur i TYLKO dla pola, które faktycznie się zmieniło —
// jeden `PATCH` na jedną poprawioną wartość, bez przepisywania całego wpisu.
function EntryRow({ entry, cols, readOnly, onSave, onDelete }) {
    const [draft, setDraft] = useState({});
    const autor = [entry.author?.firstName, entry.author?.lastName].filter(Boolean).join(' ') || entry.author?.email || '';

    const orig = (k) => (k === 'entryDate' ? fmtDate(entry.entryDate) : (entry[k] ?? ''));
    const get = (k) => (draft[k] !== undefined ? draft[k] : String(orig(k)));
    const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
    const drop = (k) => setDraft(d => { const n = { ...d }; delete n[k]; return n; });
    const commit = (k) => {
        const next = NUMERIC_ENTRY_FIELDS.has(k) ? resolveEntryNumber(get(k)) : get(k);
        // Niedokończone działanie („=4,3*") zostaje w polu i czeka — bez zapisu i bez cofania.
        if (next === null) return;
        if (String(orig(k)) === String(next)) { drop(k); return; }
        onSave(entry.id, { [k]: next });
        drop(k);
    };
    const onKey = (e, k) => {
        if (e.key === 'Enter') { e.preventDefault(); focusNextInRow(e, () => e.currentTarget.blur()); }
        if (e.key === 'Escape') { drop(k); e.currentTarget.blur(); }
    };
    const pole = (k, extra = '', props = {}) => entryField({
        k, extra, value: get(k), disabled: readOnly,
        placeholder: props.placeholder, label: props.label,
        onChange: e => set(k, props.sanitize ? sanitizeQtyInput(e.target.value) : e.target.value),
        onBlur: () => commit(k),
        onKeyDown: e => onKey(e, k),
    });

    const wartosc = (parsePriceInput(get('qty')) || 0) * (parsePriceInput(get('unitCost')) || 0);

    const cellOf = (key) => {
        switch (key) {
            case 'entryDate':    return pole('entryDate', 'font-mono text-teal-300', { label: 'Data zdarzenia' });
            case 'docNumber':    return pole('docNumber', 'font-mono', { placeholder: 'FV / PZ', label: 'Numer dokumentu' });
            case 'supplier':     return readOnly
                ? <span className="text-gray-300">{entry.supplier?.name || 'zasoby własne'}</span>
                : <div className={PICKER_BOX}>
                    <SupplierPicker dark size="sm" textClass={FIELD_FONT} value={entry.supplier?.id ?? null} onChange={sup => onSave(entry.id, { supplierId: sup?.id ?? null })} />
                </div>;
            case 'manufacturer': return pole('manufacturer', '', { placeholder: 'producent', label: 'Producent' });
            case 'model':        return pole('model', '', { placeholder: 'model', label: 'Model' });
            case 'ean':          return pole('ean', 'font-mono', { placeholder: 'EAN', label: 'Kod EAN' });
            case 'scope':        return pole('scope', '', { placeholder: 'zakres — co obejmuje', label: 'Zakres' });
            case 'qty':          return pole('qty', 'text-right font-mono', { label: 'Ilość wpisu', sanitize: true });
            case 'unitCost':     return pole('unitCost', 'text-right font-mono', { label: 'Koszt jednostkowy', sanitize: true });
            case 'wartosc':      return <span className="text-red-400">{fmtZl(wartosc)}</span>;
            case 'surplus':      return <SurplusToggle on={!!entry.isSurplus} readOnly={readOnly}
                                     onChange={v => onSave(entry.id, { isSurplus: v })} />;
            case 'comment':      return (
                <>
                    {pole('comment', '', { placeholder: 'komentarz — co zrobione', label: 'Komentarz wpisu' })}
                    {autor && <div className="mt-0.5 truncate text-[10px] text-gray-600" title={autor}>· {autor}</div>}
                </>
            );
            case 'akcje':        return (
                <button onClick={() => onDelete(entry.id)} title="Usuń wpis realizacji"
                    className="text-gray-600 opacity-0 transition-all hover:text-red-400 group-hover/entry:opacity-100">
                    <Trash2 size={20} />
                </button>
            );
            default: return null;
        }
    };

    return (
        <tr className={`group/entry ${entry.isSurplus ? 'bg-red-500/[.07] hover:bg-red-500/[.1]' : 'hover:bg-white/[.02]'}`}>
            {cols.map(c => (
                <td key={c[0]} className={`border-b border-white/[.04] px-2 py-1 align-top ${c[3] ? 'text-right tabular-nums' : ''}`}>
                    {cellOf(c[0])}
                </td>
            ))}
        </tr>
    );
}

// @anchor realization-new-entry-form — formularz nowego wpisu jako ostatni wiersz szuflady.
// Wymagane pola są te same co w zakładce „Realizacja": ilość, koszt jedn. oraz producent
// i model (materiał, sprzęt) albo zakres (praca, usługa, nocleg, paliwo) — inaczej jedna
// tabela wpuszczałaby dane, których druga by nie przyjęła.
function EntryForm({ node, cols, withCard, defaultQty, defaultSurplus = false, onAdd, onClose }) {
    const dzis = new Date().toISOString().slice(0, 10);
    const [draft, setDraft] = useState(() => ({
        entryDate: dzis,
        qty: defaultQty != null ? String(defaultQty) : '1',
        unitCost: '',
        comment: '', docNumber: '', supplierId: null,
        manufacturer: '', model: '', ean: '', scope: '',
        // Plan już pokryty zakupami w ofercie — kolejny wpis z definicji idzie ponad wycenę.
        isSurplus: defaultSurplus,
    }));
    const [brak, setBrak] = useState([]);
    const [zapisuje, setZapisuje] = useState(false);

    const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

    const czegoBrak = () => {
        const b = [];
        const qty = parsePriceInput(draft.qty);
        if (!String(draft.qty).trim() || qty === null || qty <= 0) b.push('ilość');
        if (!String(draft.unitCost).trim() || parsePriceInput(draft.unitCost) === null) b.push('koszt jedn.');
        if (withCard) {
            if (!draft.manufacturer.trim()) b.push('producent');
            if (!draft.model.trim()) b.push('model');
        } else if (!draft.scope.trim()) b.push('zakres');
        return b;
    };

    const submit = async () => {
        const b = czegoBrak();
        setBrak(b);
        if (b.length || zapisuje) return;
        setZapisuje(true);
        const ok = await onAdd({
            ...draft,
            qty: resolveEntryNumber(draft.qty),
            unitCost: resolveEntryNumber(draft.unitCost),
        });
        setZapisuje(false);
        if (ok) onClose();
    };

    const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); focusNextInRow(e, submit); }
        if (e.key === 'Escape') onClose();
    };
    // Działanie rozwija się przy WYJŚCIU z pola, nie dopiero przy zapisie: „=3990/3" ma pokazać
    // 1330 od razu, tak samo jak w wierszu zapisanego wpisu. Niedokończone („=3990/") zostaje
    // w polu bez zmian i czeka na dokończenie.
    const pole = (k, extra = '', props = {}) => entryField({
        k, extra, value: draft[k], disabled: zapisuje,
        placeholder: props.placeholder, label: props.label,
        onChange: e => set(k, props.sanitize ? sanitizeQtyInput(e.target.value) : e.target.value),
        onBlur: () => {
            if (!NUMERIC_ENTRY_FIELDS.has(k)) return;
            const wynik = resolveEntryNumber(draft[k]);
            if (wynik !== null && wynik !== draft[k]) set(k, wynik);
        },
        onKeyDown: onKey,
    });

    const wartosc = (parsePriceInput(draft.qty) || 0) * (parsePriceInput(draft.unitCost) || 0);

    const cellOf = (key) => {
        switch (key) {
            case 'entryDate':    return pole('entryDate', 'font-mono text-teal-300', { label: 'Data zdarzenia' });
            case 'docNumber':    return pole('docNumber', 'font-mono', { placeholder: 'FV / PZ', label: 'Numer dokumentu' });
            case 'supplier':     return <div className={PICKER_BOX}>
                    <SupplierPicker dark size="sm" textClass={FIELD_FONT} value={draft.supplierId} onChange={sup => set('supplierId', sup?.id ?? null)} />
                </div>;
            case 'manufacturer': return pole('manufacturer', '', { placeholder: 'producent', label: 'Producent' });
            case 'model':        return pole('model', '', { placeholder: 'model', label: 'Model' });
            case 'ean':          return pole('ean', 'font-mono', { placeholder: 'EAN', label: 'Kod EAN' });
            case 'scope':        return pole('scope', '', { placeholder: 'zakres — co obejmuje', label: 'Zakres' });
            case 'qty':          return pole('qty', 'text-right font-mono', { label: 'Ilość wpisu', sanitize: true });
            case 'unitCost':     return pole('unitCost', 'text-right font-mono', { label: 'Koszt jednostkowy', sanitize: true });
            case 'wartosc':      return <span className="text-red-400">{fmtZl(wartosc)}</span>;
            case 'surplus':      return <SurplusToggle on={draft.isSurplus} onChange={v => set('isSurplus', v)} />;
            case 'comment':      return pole('comment', '', { placeholder: 'komentarz — co zrobione', label: 'Komentarz wpisu' });
            case 'akcje':        return (
                <button onClick={submit} disabled={zapisuje} title="Zapisz wpis realizacji"
                    style={{ height: FIELD_H }}
                    className="rounded border border-teal-500/40 px-2.5 text-base font-semibold text-teal-300 hover:bg-teal-500/10 disabled:opacity-50">
                    {zapisuje ? '…' : 'Zapisz'}
                </button>
            );
            default: return null;
        }
    };

    return (
        <>
            <tr className="bg-teal-500/[.06]">
                {cols.map(c => (
                    <td key={c[0]} className={`border-b border-white/[.04] px-2 py-1.5 align-top ${c[3] ? 'text-right tabular-nums' : ''}`}>
                        {cellOf(c[0])}
                    </td>
                ))}
            </tr>
            {brak.length > 0 && (
                <tr className="bg-teal-500/[.06]">
                    <td colSpan={cols.length} className="border-b border-white/[.04] px-2 pb-1.5 text-[11px] text-amber-300">
                        Uzupełnij lub popraw: {brak.join(', ')}.
                    </td>
                </tr>
            )}
        </>
    );
}

// @anchor realization-new-leaf-card — prawy panel: co to dokładnie jest. Karta pozycji niesie
// KOMPLET pól karty produktu z panelu Materiały (`product-card`): podgląd produktu, producenta,
// model, nazwę handlową, oferenta, koszt jedn., dostępność, adres www i wymagania techniczne,
// a pod nimi wszystkie propozycje z rolami `isOffer`/`isPurchase`, adresem strony i Δ na
// jednostce; dalej trzy osie statusu i podsumowanie kwotowe.
//
// Pola produktu są tu WYŁĄCZNIE DO ODCZYTU — wycenę ustawia się w Strukturze projektu, a
// realizacja z niej czyta (ta sama zasada, co „Karty produktowej tu nie ma" w `RealizationTab`).
// Jedyny wyjątek to zdjęcie: wklejenie zrzutu ze sklepu w trakcie zakupów nie zmienia wyceny,
// a bez niego nie widać, co ma przyjść.
function LeafCard({ node, card, r, planValue, readOnly, token, onRefreshCard, onToggleClosed }) {
    const t = TYPE_META[node.type];
    const delta = round2(r.value - planValue);
    const proposals = card?.proposals || [];
    const offer = proposals.find(p => p.isOffer) || null;
    const purchase = proposals.find(p => p.isPurchase) || null;
    const purchaseUnit = purchaseUnitOf(card);
    const dUnit = (offer && purchaseUnit != null) ? round2(purchaseUnit - offer.priceNetto) : null;
    const missing = Math.round((r.plan - r.qty) * 1000) / 1000;

    // Pozycja przypięta do pozycji oferty ma koszt jedn. ZE SNAPSHOTU, nie z `budgetedPriceNetto`
    // — dokładnie jak w karcie produktu (`product-card-offer-lock`). Bez tego ta sama pozycja
    // pokazywałaby w realizacji inną cenę jednostkową niż w Strukturze projektu.
    const offerSnap = useMemo(() => {
        try { return card?.offerPositionSnapshot ? JSON.parse(card.offerPositionSnapshot) : null; } catch { return null; }
    }, [card?.offerPositionSnapshot]);
    const unitCost = offerSnap?.priceNetto ?? card?.priceNetto ?? null;

    const Block = ({ children }) => <div className="mb-2.5 rounded-md border border-white/[.07] bg-[#0a1120] p-3">{children}</div>;
    const Label = ({ children }) => <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{children}</div>;

    return (
        <div>
            {/* Blok nagłówkowy (ścieżka, nazwa, typ, jednostka, właściciel) NIE wraca: powtarzał
                kolumny tabeli pozycji — „Typ", „Osoba odpowiedzialna", „Ilość wyceny" — a nazwę
                pozycji niesie już nagłówek karty produktu zaraz pod nim. Kartę zaczyna to,
                czego w tabeli nie ma. */}
            <Block>
                <SectionTitle>Karta produktu</SectionTitle>
                {card ? (
                    <>
                        <div className="text-sm font-semibold text-gray-200">{card.name}</div>
                        {/* Kafel zdjęcia pełnej szerokości panelu — w kolumnie 300–440 px podgląd
                            produktu jest pierwszą rzeczą, po której pozycję się rozpoznaje. */}
                        <RequirementImageBox
                            card={card} token={token} onRefresh={onRefreshCard}
                            readOnly={readOnly} boxClass="w-full h-[132px]" className="mt-2" />
                        <div className="mt-2 space-y-1">
                            <CardField label="Producent" value={card.manufacturer} />
                            <CardField label="Model" value={card.model} valueClass="font-mono" />
                            <CardField label="Nazwa handlowa" value={card.productName} />
                            <CardField label="Oferent" value={card.supplier?.name || card.seller} />
                            <CardField label="Koszt jedn." valueClass="tabular-nums text-orange-300"
                                value={unitCost != null ? `${fmtZl(unitCost)} zł` : null} />
                            <CardField label="Dostępność" value={card.availability} />
                            <CardField label="Adres www" value={card.productUrl ? <CardLink url={card.productUrl} /> : null} />
                        </div>
                        {offerSnap?.lp != null && (
                            <div className="mt-1 truncate text-[10px] text-amber-400/70" title={offerSnap.wbsPath || offerSnap.name}>
                                koszt jedn. z oferty — poz. {offerSnap.lp} · {offerSnap.name}
                            </div>
                        )}
                        <div className="mt-2 text-[10px] text-gray-600">
                            z karty produktu · cena z wyceny {fmtZl(card.budgetedPriceNetto)} zł
                        </div>
                    </>
                ) : (
                    <div className="text-xs text-gray-400">
                        <div className="mb-1 text-sm font-semibold text-gray-200">{node.name}</div>
                        Liść bez karty produktowej — <span className="text-gray-500">
                            {(t?.label || node.type).toLowerCase()} rozlicza się wyłącznie zakupami w szufladzie,
                            a co obejmuje każdy z nich, mówi kolumna „Zakres".</span>
                    </div>
                )}
            </Block>

            {/* Wymagania techniczne mają WŁASNĄ sekcję, nie dopisek pod polami karty: to jedyne
                miejsce w realizacji, gdzie stoi treść uzgodniona z klientem, a w środku bloku
                z producentem i ceną czytało się jak kolejne pole produktu. */}
            {card && (
                <Block>
                    <SectionTitle>Wymagania techniczne</SectionTitle>
                    {card.technicalSpec
                        ? <div className="whitespace-pre-line text-xs leading-relaxed text-gray-400">{card.technicalSpec}</div>
                        : <div className="text-xs italic text-gray-600">Karta bez wymagań technicznych.</div>}
                </Block>
            )}

            {proposals.length > 0 && (
                <Block>
                    <SectionTitle right={`${proposals.length} ${proposals.length === 1 ? 'propozycja' : 'szt.'}`}>
                        Propozycje produktu
                    </SectionTitle>
                    <div className="space-y-1.5">
                        {proposals.map(p => <ProposalLine key={p.id} p={p} />)}
                    </div>
                    {dUnit != null && (
                        <div className="mt-2 text-xs text-gray-400">
                            Δ na jednostce: <b className={dUnit <= 0 ? 'text-emerald-300' : 'text-red-300'}>
                                {dUnit > 0 ? '+' : ''}{fmtZl(dUnit)} zł</b>
                        </div>
                    )}
                    {/* Podpis mówi, SKĄD bierze się cena zakupu, więc ma sens dopiero gdy obie
                        role są obsadzone. Przy samej propozycji `isPurchase` twierdził „dwie
                        osobne propozycje", choć na ekranie stała jedna. */}
                    {offer && purchase && (
                        <div className="mt-1 text-[10px] text-gray-600">
                            {offer.id === purchase.id
                                ? 'jedna propozycja w obu rolach → purchasePriceNetto'
                                : 'dwie osobne propozycje → priceNetto każdej'}
                        </div>
                    )}
                </Block>
            )}

            {/* @anchor realization-new-card-purchases — trzecia sekcja karty: wpisy `LeafActual`
                tej pozycji. Ta sama treść co szuflada zakupów pod wierszem, tylko do odczytu
                i w jednej kolumnie — kartę czyta się wtedy, gdy szuflada jest zwinięta, a
                pytanie „co i za ile już dojechało" pada zaraz po „co to właściwie jest".
                Nazwa sekcji idzie za typem liścia, tak samo jak nagłówek szuflady: materiał
                i sprzęt się KUPUJE, pracę i usługę WYKONUJE. */}
            <Block>
                <SectionTitle right={`Σ ${fmtZl(r.value)} zł`}>
                    {TYPE_META[node.type]?.hasCard ? 'Zakupy' : 'Wykonanie'} ({r.entries.length})
                </SectionTitle>
                {r.entries.length === 0 ? (
                    <div className="text-xs italic text-gray-600">
                        Nic jeszcze nie dojechało — wpisy dodaje się w szufladzie pod wierszem pozycji.
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {r.entries.map(e => <PurchaseLine key={e.id} e={e} node={node} />)}
                    </div>
                )}
            </Block>

            <Block>
                <SectionTitle>Statusy</SectionTitle>
                <div className="space-y-1.5">
                    <AxisRow label="Oferta"
                        badge={<Badge label={offerStatusMetaOf(node)?.label} color={offerStatusMetaOf(node)?.color} />}
                        field="kolumna „Status oferty”" />
                    {hasPurchaseAxis(node.type) && <AxisRow label="Zakup" badge={<AxisBadge node={node} axis="purchase" />} field="kolumna „Status zakupu”" />}
                    {hasExecAxis(node.type) && <AxisRow label="Wykonanie" badge={<AxisBadge node={node} axis="exec" />} field="kolumna „Status wykonania”" />}
                </div>
            </Block>

            <Block>
                <SectionTitle>Podsumowanie</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                    <div><Label>Wycena</Label><div className="text-sm font-semibold tabular-nums text-orange-400">{fmtZl(planValue)} zł</div></div>
                    <div><Label>Zakup</Label><div className="text-sm font-semibold tabular-nums text-red-400">{fmtZl(r.value)} zł</div></div>
                    <div><Label>Ilość</Label><div className="text-sm font-semibold tabular-nums">{fmtQty(r.qty)} / {fmtQty(r.plan)} {node.unit}</div></div>
                    <div><Label>Odchylenie</Label>
                        <div className={`text-sm font-semibold tabular-nums ${delta <= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                            {delta > 0 ? '+' : ''}{fmtZl(delta)} zł</div></div>
                </div>
                {node.comment && (
                    <div className="mt-3">
                        <Label>Komentarz</Label>
                        <div className="mt-1 whitespace-pre-line text-xs text-gray-400">{node.comment}</div>
                        <div className="mt-1 text-[10px] text-gray-600">ten sam komentarz, co w kolumnie „Komentarz"</div>
                    </div>
                )}
            </Block>

            <Block>
                <SectionTitle>Rozliczenie</SectionTitle>
                <div className="text-xs text-gray-400">
                    {node.realizationClosed
                        ? 'Pozycja zamknięta mimo niedowykonania — różnica liczy się jako oszczędność.'
                        : missing > 1e-9
                            ? <>Brakuje <span className="text-amber-300">{fmtQty(missing)} {node.unit}</span> do planu.</>
                            : 'Plan pokryty w całości.'}
                </div>
                {/* „Rozlicz mimo niedowykonania" to świadoma decyzja — zamyka pozycję i różnicę
                    przenosi na oszczędność. Usunięcie ostatniego wpisu zdejmuje ten znacznik samo. */}
                <div className="mt-1.5 flex items-center gap-2">
                    <button
                        onClick={onToggleClosed}
                        disabled={readOnly}
                        className={`rounded border px-2 py-0.5 text-[11px] transition-colors disabled:cursor-default disabled:opacity-50 ${
                            node.realizationClosed
                                ? 'border-white/[.14] text-gray-400 hover:text-gray-200'
                                : 'border-teal-500/30 text-teal-300 hover:bg-teal-500/10'}`}>
                        {node.realizationClosed ? 'Cofnij rozliczenie' : 'Rozlicz pozycję'}
                    </button>
                    <span className="text-[10px] text-gray-600">zamyka pozycję mimo braku pełnego wykonania</span>
                </div>
            </Block>
        </div>
    );
}

// @anchor realization-new-section-title — nagłówek sekcji karty pozycji: 14 px zamiast
// 10 px etykiety pola i jasny turkus zamiast szarości, na kreskowanej podstawie. Przy sześciu
// blokach pod rząd mikro-etykieta w kolorze treści nie odróżniała nagłówka sekcji od podpisu
// pojedynczego pola i cała karta czytała się jak jedna lista bez podziałów.
// `right` — licznik albo suma sekcji; stoi po prawej, żeby nagłówek zaczynał się od nazwy.
const SectionTitle = ({ children, right }) => (
    <div className="mb-2 flex items-baseline gap-2 border-b border-white/[.10] pb-1">
        <span className="text-[14px] font-bold uppercase tracking-widest text-teal-200">{children}</span>
        {right && <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-500">{right}</span>}
    </div>
);

// @anchor realization-new-purchase-line — jeden wpis realizacji (`LeafActual`) w sekcji
// „Zakupy" karty pozycji. Do ODCZYTU: edycja, dopisywanie i kasowanie wpisów zostają
// w szufladzie pod wierszem (`realization-new-purchase-drawer`), gdzie jest miejsce na
// wszystkie kolumny naraz. Tutaj liczy się jedno zdanie: kiedy, od kogo, ile i za ile.
const PurchaseLine = ({ e, node }) => {
    const qty = Number(e.qty) || 0;
    const unit = Number(e.unitCost) || 0;
    // Producent, model i EAN wchodzą tylko wtedy, gdy pozycja je niesie (materiał i sprzęt);
    // praca, usługa, nocleg i paliwo mają zamiast nich jedno pole `scope`.
    const produkt = [e.manufacturer, e.model, e.ean].filter(Boolean).join(' · ');
    return (
        <div className="rounded border border-white/[.06] p-2">
            <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-teal-300">{fmtDate(e.entryDate)}</span>
                {e.docNumber && <span className="truncate font-mono text-[11px] text-gray-500">{e.docNumber}</span>}
                <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-red-300">
                    {fmtZl(round2(qty * unit))} zł
                </span>
            </div>
            <div className="text-[11px] tabular-nums text-gray-400">
                {fmtQty(qty)} {node.unit} × {fmtZl(unit)} zł
            </div>
            <div className="break-words text-[11px] text-gray-500">{e.supplier?.name || 'oferent nieznany'}</div>
            {produkt && <div className="break-words text-[11px] text-gray-500">{produkt}</div>}
            {e.scope && <div className="break-words text-[11px] text-gray-500">{e.scope}</div>}
            {e.comment && <div className="break-words text-[11px] text-gray-400">{e.comment}</div>}
        </div>
    );
};

// @anchor realization-new-card-field — wiersz „etykieta : wartość" karty pozycji. Etykieta
// stoi w stałej kolumnie, wartość łamie się w dowolnym miejscu: w panelu szerokości 300 px
// nazwy handlowe i adresy nie mieszczą się w jednej linii, a ucięcie ich w połowie znaczyłoby,
// że tej samej rzeczy trzeba i tak szukać w Strukturze projektu.
const CardField = ({ label, value, valueClass = '' }) => (
    <div className="flex gap-2">
        <span className="w-24 shrink-0 text-[10px] font-bold uppercase leading-5 tracking-widest text-gray-500">{label}</span>
        <span className={`min-w-0 flex-1 break-words text-xs leading-5 text-gray-300 ${valueClass}`}>
            {value || <span className="text-gray-600">—</span>}
        </span>
    </div>
);

// @anchor realization-new-card-link — adres produktu albo propozycji. Protokół i „www." lecą
// z WYŚWIETLANEGO tekstu, bo w wąskiej karcie zjadały połowę linii; pełny adres zostaje
// w dymku i w samym odnośniku. `noopener` — link idzie na stronę sklepu, poza aplikację.
const CardLink = ({ url }) => (
    <a href={url} target="_blank" rel="noopener noreferrer" title={url}
        className="flex min-w-0 items-center gap-1 text-blue-300 transition-colors hover:text-blue-200 hover:underline">
        <ExternalLink size={10} className="shrink-0" />
        <span className="truncate">{String(url).replace(/^https?:\/\//, '').replace(/^www\./, '')}</span>
    </a>
);

// @anchor realization-new-proposal-line — jedna propozycja produktu w karcie pozycji: role
// (wycena / zakup / wybrana / odrzucona), tożsamość produktu, oferent, cena, dostępność
// i ADRES STRONY, z której propozycja pochodzi. Wiersz jest wyłącznie do odczytu — propozycje
// dodaje się, wybiera i kasuje w karcie produktu (Struktura projektu).
const ProposalLine = ({ p }) => {
    // Cena zakupu tej samej propozycji siedzi w `purchasePriceNetto` (obie role naraz),
    // a osobnej propozycji zakupowej — w jej własnym `priceNetto`; ta sama reguła co
    // w `purchase-unit-of`. Druga kwota pokazuje się tylko wtedy, gdy różni się od wyceny.
    const cenaZakupu = !p.isPurchase ? null : (p.isOffer ? (p.purchasePriceNetto ?? p.priceNetto) : p.priceNetto);
    const Tag = ({ children, klasa }) => (
        <span className={`rounded border px-1 py-px text-[9px] font-bold uppercase tracking-widest ${klasa}`}>{children}</span>
    );
    return (
        <div className={`rounded border p-2 ${p.isOffer || p.isPurchase
            ? 'border-white/[.12] bg-white/[.03]'
            : 'border-white/[.06]'} ${p.isRejected ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center gap-1">
                {p.isOffer && <Tag klasa="border-orange-400/30 text-orange-300">Wycena</Tag>}
                {p.isPurchase && <Tag klasa="border-red-400/30 text-red-300">Zakup</Tag>}
                {p.isSelected && <Tag klasa="border-emerald-400/30 text-emerald-300">Wybrana</Tag>}
                {p.isRejected && <Tag klasa="border-white/10 text-gray-500">Odrzucona</Tag>}
                <span className="ml-auto text-xs font-semibold tabular-nums text-gray-200">
                    {p.priceNetto != null ? `${fmtZl(p.priceNetto)} zł` : '—'}
                </span>
            </div>
            <div className="mt-1 break-words text-xs text-gray-300">{p.productName || '—'}</div>
            <div className="break-words text-[11px] text-gray-500">
                {[p.manufacturer, p.model].filter(Boolean).join(' ') || '—'}
            </div>
            <div className="break-words text-[11px] text-gray-500">
                {p.supplier?.name || p.seller || 'oferent nieznany'}{p.offerNumber ? ` · ${p.offerNumber}` : ''}
            </div>
            {p.availability && <div className="break-words text-[11px] text-gray-500">dostępność: {p.availability}</div>}
            {cenaZakupu != null && cenaZakupu !== p.priceNetto && (
                <div className="text-[11px] tabular-nums text-red-300">cena zakupu: {fmtZl(cenaZakupu)} zł</div>
            )}
            {p.sourceUrl && <div className="mt-0.5 text-[11px]"><CardLink url={p.sourceUrl} /></div>}
        </div>
    );
};

const AxisRow = ({ label, badge, field }) => (
    <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
        {badge}
        <span className="ml-auto text-[10px] text-gray-600">{field}</span>
    </div>
);

const AxisBadge = ({ node, axis }) => {
    const os = axisDisplay(node, axis);
    return os ? <Badge label={os.label} color={os.color} italic={os.gate} title={os.title} /> : null;
};

// @anchor realization-new-analiza — kafle, mierniki i rozbicie na zakresy główne.
// Widok wyłącznie dla ADMIN i MANAGER — ten sam idiom co `LogistykaMaterialListsTab:70`.
// Wszystkie TRZY bloki analityczne (kafle+mierniki, zakresy główne, bilans domkniętych) chowają
// się za przyciskiem w jednym rzędzie. Kafle wisiały wcześniej na stałe u góry zakładki i na
// każdym ekranie poniżej 1440px spychały tabelę pozycji pod krawędź okna.
function Analiza({ a, orderName, open, onToggle, execOpen, onToggleExec, kpiOpen, onToggleKpi }) {
    const c = a.calosc;
    const leftMoney = round2(c.plan - c.real);
    const leftDays = round2(c.dniPlan - c.dniWyk);
    const dTotal = round2(c.real - c.plan);
    const z = c.zamkniete;
    // @anchor realization-new-delta-zamkniete — wynik na robocie, która jest już za nami:
    // koszty rzeczywiste minus koszty oferty na pozycjach wykonanych i odebranych. Ujemna
    // znaczy, że zeszliśmy poniżej wyceny — i tylko na tych pozycjach da się to policzyć
    // uczciwie, bo reszta zamówienia nie ma jeszcze kompletu wpisów.
    const deltaZamkniete = round2(z.lacznie.real - z.lacznie.plan);

    return (
        <>
            <div className="flex flex-wrap gap-2">
                {/* Etykieta zwiniętego przycisku niesie dwie liczby, po które najczęściej sięga się
                    do kafli — wycenę i pokrycie zakupami. Bez nich zwinięta analiza kazałaby
                    otwierać blok tylko po to, żeby zobaczyć, czy warto go otwierać. */}
                <button onClick={onToggleKpi} className="rounded border border-white/[.14] px-2 py-0.5 text-[11px] text-gray-400 hover:text-gray-200">
                    {kpiOpen
                        ? 'Ukryj analizę zamówienia'
                        : `Analiza zamówienia — ${fmtZl(c.plan)} zł wyceny · ${fmtPct(pct(c.real, c.plan))} pokrycia zakupami`}
                </button>
                <button onClick={onToggle} className="rounded border border-white/[.14] px-2 py-0.5 text-[11px] text-gray-400 hover:text-gray-200">
                    {open ? 'Ukryj realizację zakresów' : `Realizacja ${a.galezie.length} zakresów głównych (${c.pozycji} pozycji) — plan wobec wykonania`}
                </button>
                <button onClick={onToggleExec} className="rounded border border-white/[.14] px-2 py-0.5 text-[11px] text-gray-400 hover:text-gray-200">
                    {execOpen
                        ? 'Ukryj bilans domkniętych'
                        : `Bilans domkniętych pozycji — ${z.lacznie.pozycji} poz. na ${fmtZl(z.lacznie.plan)} zł`}
                </button>
            </div>

            {kpiOpen && (
                <div className="mt-2.5">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-teal-300">
                        Analiza zamówienia{orderName ? ` — ${orderName}` : ''}
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2.5">
                        <Tile label="Wycena zamówienia" value={`${fmtZl(c.plan)} zł`} color="text-orange-400" note={`${c.pozycji} pozycji kosztowych`} />
                        <Tile label="Zakupy zrealizowane" value={`${fmtZl(c.real)} zł`} color="text-red-400" note={`${c.wpisow} wpisów na ${c.zRealizacja} pozycjach`} />
                        <Tile label="Pozostaje do wydania" value={`${fmtZl(leftMoney)} zł`} note={`${fmtPct(pct(leftMoney, c.plan))} wyceny`} />
                        <Tile label="Dni niezrealizowane" value={fmtQty(leftDays)} color="text-amber-400" note={`z ${fmtQty(c.dniPlan)} zaplanowanych`} />
                        {/* Kafel pokazuje OBIE strony tej samej roboty: ile była warta w ofercie
                            i ile realnie kosztowała. Bez drugiej kwoty „mamy za sobą 159 tys."
                            czytało się jak wydatek, a to jest wycena. Delta jest zielona, gdy
                            zeszliśmy poniżej oferty, i czerwona, gdy ją przebiliśmy. */}
                        <Tile
                            label="Wykonane / odebrane"
                            value={<>{fmtZl(z.lacznie.plan)} zł <span className="text-xs font-medium text-gray-500">— koszty oferty</span></>}
                            color="text-orange-400"
                            note={`${z.lacznie.pozycji} z ${c.pozycji} pozycji · ${fmtPct(pct(z.lacznie.plan, c.plan))} wyceny zamówienia`}>
                            <div className="mt-1 text-[length:var(--rn-lg)] font-bold leading-tight tabular-nums text-red-400">
                                {fmtZl(z.lacznie.real)} zł <span className="text-xs font-medium text-gray-500">— koszty rzeczywiste</span>
                            </div>
                            <div
                                className={`mt-1.5 border-t border-white/[.07] pt-1.5 text-xs font-bold tabular-nums ${deltaZamkniete > 0 ? 'text-red-400' : 'text-emerald-400'}`}
                                title="Δ = koszty rzeczywiste − koszty oferty na pozycjach wykonanych i odebranych">
                                Δ {deltaZamkniete > 0 ? '+' : ''}{fmtZl(deltaZamkniete)} zł ({deltaZamkniete > 0 ? '+' : ''}{fmtPct(pct(deltaZamkniete, z.lacznie.plan))}) <span className="font-medium text-gray-500">— {deltaZamkniete > 0 ? 'wydaliśmy więcej niż planowaliśmy' : 'wydaliśmy mniej niż planowaliśmy'}</span>
                            </div>
                        </Tile>
                    </div>

                    <div className="flex flex-wrap gap-4">
                        <Meter label="Pokrycie wyceny zakupami" done={c.real} plan={c.plan} left={`${fmtZl(c.real)} zł`} right={`${fmtZl(c.plan)} zł`} />
                        <Meter label="Dni wykonane" done={c.dniWyk} plan={c.dniPlan} left={`${fmtQty(c.dniWyk)} dni wykonanych`} right={`${fmtQty(c.dniPlan)} dni w planie`} />
                        <Meter label="Pozycje ruszone" done={c.zRealizacja} plan={c.pozycji} left={`${c.zRealizacja} pozycji z zakupami`} right={`${c.pozycji} pozycji`} />
                    </div>
                </div>
            )}

            {open && (
                <div className="mt-2.5">
                    <div className="mb-2 flex flex-wrap items-center gap-3 text-base text-gray-500">
                        {STAGE_META.map(s => (
                            <span key={s.key} className="flex items-center gap-1.5">
                                <i className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
                            </span>
                        ))}
                        <span>— pasek pokazuje, jaka CZĘŚĆ KWOTY wyceny stoi w każdym stanie, a nie ile pozycji</span>
                    </div>

                    {/* Ostrzeżenie liczy POZYCJE, nie kwoty: chodzi o to, że nikt nie odnotował
                        statusu, a nie o to, ile te pozycje są warte. */}
                    {!c.osWykonania.n.zrobione && !c.osWykonania.n.wtoku && (
                        <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/[.07] px-3 py-2 text-xs text-amber-200/90">
                            <b>Status wykonania nie jest w tym zamówieniu ustawiony na żadnej z {c.pozycji} pozycji.</b>{' '}
                            Dlatego „zrobione" wychodzi zero — nie dlatego, że nic nie zrobiono, tylko dlatego, że nikt tego
                            nie odnotował. Kolumna „Status wykonania" pokazuje na razie wyłącznie informację, na co pozycja czeka.
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full table-fixed border-separate border-spacing-0 text-[length:var(--rn-2xl)]">
                            <thead>
                                <tr className="text-[length:var(--rn-lg)] uppercase tracking-wider text-gray-500">
                                    {/* Procenty, nie piksele: `table-fixed` z pikselami rozciąga tabelę do ich
                                        sumy i wypycha kolumny poza panel. Udziały trzymają proporcje i skalują
                                        się w dół razem z szerokością okna. */}
                                    <th style={{ width: '26%' }} className="border-b border-white/[.14] px-2 py-1 text-left">Zakres główny</th>
                                    <th style={{ width: '14%' }} className="border-b border-white/[.14] px-2 py-1 text-left">Wydatki % do budżetu</th>
                                    <th style={{ width: '14%' }} className="border-b border-white/[.14] px-2 py-1 text-left">Zakup materiałów</th>
                                    <th style={{ width: '14%' }} className="border-b border-white/[.14] px-2 py-1 text-left">Stopień wykonania prac</th>
                                    <th style={{ width: '11.5%' }} className="border-b border-white/[.14] px-2 py-1 text-right">Wycena</th>
                                    <th style={{ width: '11.5%' }} className="border-b border-white/[.14] px-2 py-1 text-right">Zakup</th>
                                    <th style={{ width: '9%' }} className="border-b border-white/[.14] px-2 py-1 text-right">Δ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {a.galezie.map(g => {
                                    const d = round2(g.real - g.plan);
                                    return (
                                        <tr key={g.id}>
                                            <td className="truncate border-b border-white/[.05] px-2 py-1" title={g.nazwa}>{g.nazwa}</td>
                                            <td className="border-b border-white/[.05] px-2 py-1"><CoverageBar real={g.real} plan={g.plan} /></td>
                                            <td className="border-b border-white/[.05] px-2 py-1"><StageBar dist={g.osZakupu} title={`Zakup materiałów w zakresie „${g.nazwa}" — udział kwot wyceny`} /></td>
                                            <td className="border-b border-white/[.05] px-2 py-1"><StageBar dist={g.osWykonania} title={`Stopień wykonania prac w zakresie „${g.nazwa}" — udział kwot wyceny`} /></td>
                                            <td className="border-b border-white/[.05] px-2 py-1 text-right tabular-nums text-orange-400">{fmtZl(g.plan)}</td>
                                            <td className="border-b border-white/[.05] px-2 py-1 text-right tabular-nums text-red-400">
                                                {g.real ? fmtZl(g.real) : <span className="text-gray-600">—</span>}</td>
                                            <td className="border-b border-white/[.05] px-2 py-1 text-right tabular-nums">
                                                {g.real
                                                    ? <span className={d <= 0 ? 'text-emerald-300' : 'text-[#d03b3b]'}>{d > 0 ? '+' : ''}{fmtZl(d)}</span>
                                                    : <span className="text-gray-600">—</span>}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="font-semibold">
                                    <td className="border-t border-white/[.14] px-2 py-1">Razem</td>
                                    <td className="border-t border-white/[.14] px-2 py-1"><CoverageBar real={c.real} plan={c.plan} /></td>
                                    <td className="border-t border-white/[.14] px-2 py-1"><StageBar dist={c.osZakupu} title="Zakup materiałów — całe zamówienie, udział kwot wyceny" /></td>
                                    <td className="border-t border-white/[.14] px-2 py-1"><StageBar dist={c.osWykonania} title="Stopień wykonania prac — całe zamówienie, udział kwot wyceny" /></td>
                                    <td className="border-t border-white/[.14] px-2 py-1 text-right tabular-nums text-orange-400">{fmtZl(c.plan)}</td>
                                    <td className="border-t border-white/[.14] px-2 py-1 text-right tabular-nums text-red-400">{fmtZl(c.real)}</td>
                                    <td className={`border-t border-white/[.14] px-2 py-1 text-right tabular-nums ${dTotal <= 0 ? 'text-emerald-300' : 'text-[#d03b3b]'}`}>
                                        {dTotal > 0 ? '+' : ''}{fmtZl(dTotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {execOpen && <BilansZamkniete c={c} />}
        </>
    );
}

// @anchor realization-new-bilans-zamkniete — bilans kwotowy pozycji, które są już ZA NAMI:
// wykonane, zakupione albo domknięte ręcznie (`realization-zamkniete-cuts`). Kwoty to
// WYCENA i ZAKUP całej pozycji — nie wartość samej robocizny, bo `WbsNode.execStatus` wisi
// na pozycji razem z materiałem, który do niej wszedł.
function BilansZamkniete({ c }) {
    const z = c.zamkniete;
    const dLacznie = round2(z.lacznie.real - z.lacznie.plan);
    const dTotal = round2(c.real - c.plan);
    const nierozpoczete = z.nierozpoczete;
    const Th = ({ children, right, w }) => (
        <th className={`${w || ''} border-b border-white/[.14] px-2 py-1 ${right ? 'text-right' : 'text-left'}`}>{children}</th>
    );
    const Num = ({ children, klasa, top }) => (
        <td className={`${top ? 'border-t border-white/[.14]' : 'border-b border-white/[.05]'} px-2 py-1 text-right tabular-nums ${klasa || ''}`}>{children}</td>
    );

    return (
        <div className="mt-2.5">
            <div className="mb-2 text-base text-gray-500">
                Tabela dzieli zamówienie według <b className="text-gray-400">statusu wykonania</b> na trzy rozłączne części:
                co jest <b className="text-gray-400">zrobione</b> (wykonane i odebrane), co jest <b className="text-gray-400">w ruchu</b>
                (zaczęte, ale niedokończone) i co <b className="text-gray-400">czeka na wykonanie</b> — w tym materiał już kupiony,
                ale jeszcze niezamontowany. Razem dają całe zamówienie.
                <br />Kwoty to wycena i zakup CAŁYCH pozycji — status wykonania dotyczy pozycji razem z materiałem, który do niej wszedł.
                „Wydatki % do budżetu" mówią, ile z wyceny danego wiersza już wydano; „Udział wyceny" — jaką część zamówienia ten wiersz stanowi.
            </div>
            <div className="overflow-x-auto">
                <table className="w-full table-fixed border-separate border-spacing-0 text-[length:var(--rn-2xl)]">
                    <thead>
                        <tr className="text-[length:var(--rn-lg)] uppercase tracking-wider text-gray-500">
                            <Th w="w-[28%]">Przekrój</Th>
                            <Th w="w-[15%]">Wydatki % do budżetu</Th>
                            <Th w="w-[6%]" right>Poz.</Th>
                            <Th w="w-[13%]" right>Wycena</Th>
                            <Th w="w-[13%]" right>Zakup</Th>
                            <Th w="w-[12%]" right>Δ</Th>
                            <Th w="w-[13%]" right>Udział wyceny</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {z.przekroje.map(b => {
                            const d = round2(b.real - b.plan);
                            return (
                                <tr key={b.key} className={b.pozycji ? '' : 'opacity-45'}>
                                    <td className={`border-b border-white/[.05] px-2 py-1 ${b.color}`} title={b.opis}>{b.label}</td>
                                    <td className="border-b border-white/[.05] px-2 py-1"><CoverageBar real={b.real} plan={b.plan} /></td>
                                    <Num>{b.pozycji}</Num>
                                    <Num klasa="text-orange-400">{fmtZl(b.plan)}</Num>
                                    <Num klasa="text-red-400">{b.real ? fmtZl(b.real) : <span className="text-gray-600">—</span>}</Num>
                                    <Num>
                                        {b.real
                                            ? <span className={d <= 0 ? 'text-emerald-300' : 'text-[#d03b3b]'}>{d > 0 ? '+' : ''}{fmtZl(d)}</span>
                                            : <span className="text-gray-600">—</span>}
                                    </Num>
                                    <Num klasa="text-gray-400">{fmtPct(pct(b.plan, c.plan))}</Num>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="font-semibold">
                            <td className="border-t border-white/[.14] px-2 py-1"
                                title="Wykonane plus odebrane. Pozycja może być tylko w jednym z tych stanów, więc nic nie liczy się podwójnie.">
                                Domknięte łącznie</td>
                            <td className="border-t border-white/[.14] px-2 py-1"><CoverageBar real={z.lacznie.real} plan={z.lacznie.plan} /></td>
                            <Num top>{z.lacznie.pozycji}</Num>
                            <Num top klasa="text-orange-400">{fmtZl(z.lacznie.plan)}</Num>
                            <Num top klasa="text-red-400">{fmtZl(z.lacznie.real)}</Num>
                            <Num top klasa={dLacznie <= 0 ? 'text-emerald-300' : 'text-[#d03b3b]'}>
                                {dLacznie > 0 ? '+' : ''}{fmtZl(dLacznie)}</Num>
                            <Num top klasa="text-gray-400">{fmtPct(pct(z.lacznie.plan, c.plan))}</Num>
                        </tr>
                        <tr className="text-sky-300/80">
                            <td className="px-2 py-1"
                                title="Pozycje, przy których praca już się zaczęła, ale jeszcze się nie skończyła: w toku, wstrzymane i przerwane. Nie ma tu tego, czego nikt nie tknął, ani tego, co odwołano.">
                                W realizacji</td>
                            <td className="px-2 py-1"><CoverageBar real={z.wRealizacji.real} plan={z.wRealizacji.plan} /></td>
                            <td className="px-2 py-1 text-right tabular-nums">{z.wRealizacji.pozycji}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmtZl(z.wRealizacji.plan)}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmtZl(z.wRealizacji.real)}</td>
                            <td className="px-2 py-1 text-right tabular-nums">
                                {(() => { const d = round2(z.wRealizacji.real - z.wRealizacji.plan); return `${d > 0 ? '+' : ''}${fmtZl(d)}`; })()}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmtPct(pct(z.wRealizacji.plan, c.plan))}</td>
                        </tr>
                        <tr className="text-gray-500">
                            <td className="px-2 py-1"
                                title="Wszystko, przy czym nie ma jeszcze wykonania. Prace i usługi, których nikt nie zaczął, oraz materiał i sprzęt, które bywają już kupione i zapłacone, ale nie zamontowane — dlatego w kolumnie Zakup stoi tu kwota. Także pozycje czekające na akceptację oferty lub na dostawę, odwołane oraz noclegi i paliwo, przy których nie ma czego wykonywać.">
                                {NIEROZPOCZETE_LABEL}</td>
                            <td className="px-2 py-1" />
                            <td className="px-2 py-1 text-right tabular-nums">{nierozpoczete.pozycji}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmtZl(nierozpoczete.plan)}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmtZl(nierozpoczete.real)}</td>
                            <td className="px-2 py-1" />
                            <td className="px-2 py-1 text-right tabular-nums">{fmtPct(pct(nierozpoczete.plan, c.plan))}</td>
                        </tr>
                        <tr className="font-semibold text-gray-300">
                            <td className="border-t border-white/[.14] px-2 py-1.5"
                                title="Sprawdzenie: domknięte + w realizacji + nierozpoczęte daje całe zamówienie. Ta sama kwota, co w kafelku „Wycena zamówienia” nad tabelą.">
                                Razem zamówienie</td>
                            <td className="border-t border-white/[.14] px-2 py-1.5"><CoverageBar real={c.real} plan={c.plan} /></td>
                            <td className="border-t border-white/[.14] px-2 py-1.5 text-right tabular-nums">{c.pozycji}</td>
                            <td className="border-t border-white/[.14] px-2 py-1.5 text-right tabular-nums text-orange-400">{fmtZl(c.plan)}</td>
                            <td className="border-t border-white/[.14] px-2 py-1.5 text-right tabular-nums text-red-400">{fmtZl(c.real)}</td>
                            <td className={`border-t border-white/[.14] px-2 py-1.5 text-right tabular-nums ${dTotal <= 0 ? 'text-emerald-300' : 'text-[#d03b3b]'}`}>
                                {dTotal > 0 ? '+' : ''}{fmtZl(dTotal)}</td>
                            <td className="border-t border-white/[.14] px-2 py-1.5 text-right tabular-nums">100,0%</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
