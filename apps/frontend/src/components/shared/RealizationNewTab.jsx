// Zakładka „Realizacja_new" — ścieżka ODCZYTU nowego układu realizacji, przeniesiona
// z makiety `test/prototypy-realizacja/5-split-zakupy.html` na żywe dane z API.
//
// Czym się różni od `RealizationTab`:
//   • trzy panele zamiast jednej tabeli — lewo GDZIE (drzewo gałęzi), środek ILE I ZA CO
//     (13 kolumn + szuflada zakupów), prawo CO DOKŁADNIE (karta pozycji);
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
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, Loader2, Plus, Trash2, FileSpreadsheet, FileText } from 'lucide-react';
import { API_URL } from '../../config';
import SupplierPicker from './SupplierPicker';
import AutoResizeTextarea from './wbs/AutoResizeTextarea';
import FilterDropdown from './wbs/FilterDropdown';
import ProtokolOdbioruModal from './wbs/ProtokolOdbioruModal';
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
    AXIS_STATUS_ORDER, sanitizeQtyInput, parsePriceInput, DRAWER,
} from './wbs/wbsConstants';
import {
    TYPE_META, LEAF_TYPES, authHeaders, flattenWbsNodes, getParentPath, leafNodesOf, buildCardMap,
    wbsRootOf, purchaseUnitOf, REAL_STATE, realizationOf, planUnitOf, planValueOf, fmtQty, fmtZl, fmtDate,
} from './wbs/realizationShared';
import {
    ENTRY_INPUT, FORMULA_HINT, NUMERIC_ENTRY_FIELDS, growsWithText, resolveEntryNumber,
    selectAllOnFocus, focusNextInRow,
} from './wbs/entryFields';

// @anchor realization-new-synthetic-root — w bazie gałęzie najwyższego poziomu mają
// `parentId = NULL`, więc drzewo nie ma jednego wierzchołka. Lewy panel go potrzebuje,
// więc dokładamy syntetyczny korzeń. Nie jest zapisywany nigdzie — żyje tylko w widoku.
export const SYNTHETIC_ROOT = '__root__';

// @anchor realization-new-cols — 13 kolumn tabeli pozycji. Wobec `COL_DEFS` z `RealizationTab`
// wypadły trzy, każda z powodu sprawdzonego na prawdziwym zamówieniu:
//   „Przedmiot projektu" — gałąź wybiera się w lewym panelu, kolumna powtarzałaby wybór;
//   „Produkt / zakres"   — powtarzał „Nazwę" w 77 z 80 pozycji (29× identyczna nazwa karty,
//                          48 liści bez karty); tożsamość produktu niesie szuflada i karta;
//   „Dokument"           — 0 z 8 wpisów ma numer; został w szufladzie, bo faktura opisuje
//                          pojedynczy zakup, a nie pozycję.
//   „Wpisy"              — licznik powtarzał strzałkę rozwijania i nagłówek panelu.
// Doszła „Typ": pod nazwą dokładał każdemu wierszowi trzecią linię, jako kolumna daje się
// przebiec wzrokiem w pionie.
export const REALIZATION_NEW_COLS = [
    { key: 'name',           label: 'Nazwa',              w: 480 },
    { key: 'type',           label: 'Typ',                w: 150 },
    // „Oferent", nie „Dostawca": `LeafActual.supplierId` niesie tego, KTO DAŁ CENĘ. Dostawcą
    // stanie się dopiero wtedy, gdy przy wpisie pojawi się faktura albo WZ.
    { key: 'supplier',       label: 'Oferent',            w: 300 },
    { key: 'qty',            label: 'Ilość wyceny',       w: 185, right: true },
    { key: 'realization',    label: 'Zakup / wykonanie',  w: 255, right: true },
    { key: 'deltaQty',       label: 'Δ ilość',            w: 155, right: true },
    { key: 'price',          label: 'Koszt jedn. wyceny', w: 210, right: true },
    { key: 'purchasePrice',  label: 'Koszt jedn. zakupu', w: 230, right: true },
    { key: 'total',          label: 'Koszt całkowity',    w: 275, right: true },
    { key: 'status',         label: 'Status oferty',      w: 230 },
    { key: 'purchaseStatus', label: 'Status zakupu',      w: 255 },
    { key: 'execStatus',     label: 'Status wykonania',   w: 265 },
    { key: 'comment',        label: 'Komentarz',          w: 340 },
];

// Szerokości kolumn są PROPORCJAMI: `table-fixed` z pikselami rozciągałby tabelę do ich sumy
// (CSS 2.1 §17.5.2.1 — używana szerokość tabeli to max(zadana, suma kolumn)) i wracałby poziomy
// suwak mimo `w-full`. Przeliczone na procent skalują się razem z szerokością panelu.
export const COL_PCT = (() => {
    const suma = REALIZATION_NEW_COLS.reduce((a, c) => a + (c.w || 0), 0);
    return Object.fromEntries(REALIZATION_NEW_COLS.map(c => [c.key, `${(c.w / suma * 100).toFixed(3)}%`]));
})();

// @anchor realization-new-col-filters — filtry w nagłówku tabeli pozycji. Podział ten sam
// co w „Realizacji" (`realization-col-filter-apply`): kolumna SŁOWNIKOWA (skończony zbiór
// wartości) dostaje wielowybór dopasowujący WARTOŚĆ, nie podciąg — „Zamówione" nie może
// łapać się na „Nie zamówione"; kolumna wolnotekstowa dzieli wpis na frazy po `;` na OR.
// Kolumny liczbowe zostają przy zwykłym podciągu — szuka się w nich konkretnej kwoty.
export const NEW_DROPDOWN_FILTER_COLS = new Set(['type', 'supplier', 'status', 'purchaseStatus', 'execStatus']);
export const NEW_TEXT_FILTER_COLS = new Set(['name', 'comment']);
export const hasColFilter = (v) => (Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== '');

// Wartości słownikowe pozycji — dokładnie te napisy, które widać w komórce. Filtr ma
// operować na tym, co użytkownik czyta, a nie na kodzie z bazy: `DONE` nad materiałem
// pokazuje się jako „Zainstalowane", a nad pracą jako „Wykonane".
export function filterValuesOf(node, entries) {
    return {
        type: TYPE_META[node.type]?.label || node.type || '',
        status: PLAN_STATUS_META[planStatusFromAny(node.status)]?.label || '',
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
        supplier: entries.map(e => e.supplier?.name || '').join(' '),
        qty: String(node.quantity ?? ''),
        realization: `${r.qty} / ${r.plan}`,
        deltaQty: String(Math.round((r.qty - r.plan) * 1000) / 1000),
        price: String(planUnitOf(node, card) ?? ''),
        purchasePrice: String(r.avg ?? purchaseUnitOf(card) ?? ''),
        total: `${Math.round(planValueOf(node, card) * 100) / 100} ${r.value}`,
        status: PLAN_STATUS_META[planStatusFromAny(node.status)]?.label || '',
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
export function buildBranchIndex(flatNodes, rootName) {
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
    const leaves = leafNodesOf(flatNodes).map(n => ({ ...n, branchId: nearestBranch(n) }));

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

// @anchor realization-new-field-font — pola tej zakładki są o 8px większe niż w „Realizacji".
// Podmieniamy klasę rozmiaru wprost, zamiast dokładać drugą obok `text-sm` z `ENTRY_INPUT`:
// dwie klasy rozmiaru rozstrzygałaby kolejność w arkuszu Tailwinda, a nie zapis w kodzie.
const FIELD_FONT = 'text-[22px]';
// Jedna wysokość dla WSZYSTKICH kontrolek wiersza wpisu. `input`, rosnąca `textarea` i trigger
// `SupplierPicker` liczą wysokość trzema różnymi drogami (line-height, scrollHeight, padding
// klasy rozmiaru), więc bez wymuszenia każda wychodziła inna i wiersz falował. Picker nie
// przyjmuje wysokości propsem, więc sięgamy do jego triggera wariantem arbitralnym.
const FIELD_H = 42;
const PICKER_BOX = '[&>div>button]:h-[42px]';
const ENTRY_INPUT_LG = ENTRY_INPUT.replace('text-sm', FIELD_FONT);
const addEntryLabel = (type) => (type === 'work' || type === 'service' ? 'Dodaj wykonanie' : 'Dodaj zakup');

const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const fmtPct = (v) => v.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const round2 = (v) => Math.round(v * 100) / 100;

// ─── Drobne elementy ──────────────────────────────────────────────────────────

const Badge = ({ label, color, italic, title, size = 'text-sm' }) => label
    ? <span title={title} className={`inline-block ${size} font-semibold ${color} ${italic ? 'italic opacity-85' : ''}`}>{label}</span>
    : null;

// Pasek udziału pozycji w etapach osi. Legenda jest obowiązkowa — cztery odcienie same
// z siebie nie znaczą nic.
const StageBar = ({ dist, title }) => {
    if (!dist.dotyczy) return <span className="text-[20px] italic text-gray-600">oś nie dotyczy</span>;
    const opis = STAGE_META.filter(s => dist[s.key]).map(s => `${s.label}: ${dist[s.key]}`).join(' · ');
    return (
        <div className="flex h-2 w-full overflow-hidden rounded-sm bg-white/5" title={`${title} — ${opis} (z ${dist.dotyczy} pozycji)`}>
            {STAGE_META.filter(s => dist[s.key]).map(s => (
                <i key={s.key} style={{ width: `${dist[s.key] / dist.dotyczy * 100}%`, background: s.color }} />
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
            <span className={`w-20 text-right text-[20px] ${over ? 'text-[#d03b3b]' : 'text-gray-500'}`}>{p > 0 ? fmtPct(p) : '—'}</span>
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

const Tile = ({ label, value, color, note }) => (
    <div className="min-w-[190px] flex-1 rounded-md border border-white/[.07] bg-[#0a1120] px-3.5 py-2.5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</div>
        <div className={`mt-1 text-[22px] font-bold leading-tight tabular-nums ${color || 'text-gray-200'}`}>{value}</div>
        <div className="mt-0.5 text-xs text-gray-500">{note}</div>
    </div>
);

// ─── Komponent ────────────────────────────────────────────────────────────────

// @anchor realization-new-tab — patrz nagłówek pliku.
export default function RealizationNewTab({
    nodeId, versionId, orderName = '', userRoles = [], planLabel = '',
    accepted = false, oneDriveFolderName = null,
}) {
    const token = sessionStorage.getItem('token');
    const isManagerOrAdmin = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
    // Ta sama trójka ról co w `RealizationTab` — logistyk prowadzi zakupy, więc pisze,
    // ale analizy kwotowej (kafle, mierniki, bilanse) i tak nie widzi.
    const canEdit = userRoles.some(r => ['ADMIN', 'MANAGER', 'LOGISTYK'].includes(r));
    const readOnly = !canEdit;

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
            setWbsNodes(flat);
            setCards(reqRes.ok ? buildCardMap(flat, await reqRes.json()) : {});
            setActuals(actRes.ok ? await actRes.json() : []);
        } catch (e) {
            console.error('[RealizationNewTab] fetchAll error:', e);
        } finally {
            setLoading(false);
        }
    }, [nodeId, versionId, token]);

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
    const idx = useMemo(() => buildBranchIndex(wbsNodes, orderName), [wbsNodes, orderName]);

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
        const acc = { type: new Set(), supplier: new Set(), status: new Set(), purchaseStatus: new Set(), execStatus: new Set() };
        for (const n of idx.leavesOfSubtree(selectedBranch)) {
            const v = filterValuesOf(n, actualsOf(n));
            for (const k of ['type', 'status', 'purchaseStatus', 'execStatus']) if (v[k]) acc[k].add(v[k]);
            for (const nazwa of v.supplier) acc.supplier.add(nazwa);
        }
        const pos = (zbior) => [...zbior].sort((a, b) => a.localeCompare(b, 'pl'));
        return {
            type: pos(acc.type), supplier: pos(acc.supplier), status: pos(acc.status),
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

    // @anchor realization-new-export-rows — wiersze dla eksportu i protokołu w kształcie, którego
    // oczekują obie ścieżki: { node, card, realization }. To DOKŁADNIE to, co widać w tabeli —
    // po wyborze gałęzi, filtrach kolumn i przełączniku „Tylko niedomknięte". Odbiera się i
    // eksportuje to, na co się patrzy.
    const exportRows = useMemo(() => visibleLeaves.map(node => ({
        node,
        card: cardOf(node),
        realization: realizationOf(node, actualsOf(node)),
    })), [visibleLeaves, cardOf, actualsOf]);

    const exportExcel = async () => {
        if (exporting || !exportRows.length) return;
        setExporting(true);
        try {
            await eksportRealizacjiXlsx({
                rows: exportRows,
                visibleTypes: LEAF_TYPES,
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
            const dist = { purchase: { zrobione: 0, wtoku: 0, otwarte: 0, czeka: 0, dotyczy: 0 },
                           exec:     { zrobione: 0, wtoku: 0, otwarte: 0, czeka: 0, dotyczy: 0 } };
            for (const { node: n, card, realization: r } of wiersze) {
                plan += planValueOf(n, card);
                real += r.value;
                wpisow += r.entries.length;
                if (r.entries.length) zRealizacja++;
                if (isTimeUnit(n)) { dniPlan += r.plan; dniWyk += r.qty; }
                for (const axis of ['purchase', 'exec']) {
                    const s = axisStageOf(n, axis);
                    if (s) { dist[axis][s]++; dist[axis].dotyczy++; }
                }
            }
            return {
                plan: round2(plan), real: round2(real), wpisow, zRealizacja, pozycji: leaves.length,
                dniPlan: round2(dniPlan), dniWyk: round2(dniWyk),
                osZakupu: dist.purchase, osWykonania: dist.exec,
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

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 size={16} className="animate-spin" /> Wczytywanie realizacji…
            </div>
        );
    }

    const selectedNode = idx.leaves.find(n => n.id === selectedLeaf) || null;

    return (
        <div className="flex h-full flex-col bg-[#030712] text-gray-200">
            {/* ── Analiza zamówienia — ten sam warunek roli co LogistykaMaterialListsTab:70 ── */}
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
                {isManagerOrAdmin
                    ? <Analiza
                        a={analysis} orderName={orderName}
                        open={branchTableOpen} onToggle={() => setBranchTableOpen(v => !v)}
                        execOpen={execTableOpen} onToggleExec={() => setExecTableOpen(v => !v)} />
                    : (
                        <div className="rounded-md border border-white/[.07] bg-[#0a1120] px-3.5 py-2.5 text-xs text-gray-400">
                            <b className="text-gray-300">Analiza zamówienia — widok dla roli MANAGER i ADMIN.</b><br />
                            Pozycje i zakupy w tabeli poniżej są dostępne, ale sumy wyceny, odchylenia i rozbicie
                            na zakresy zostają ukryte.
                        </div>
                    )}
            </div>

            <div className={`min-h-0 flex-1 ${analitykaOtwarta ? 'hidden' : 'flex'}`}>
                {/* ── Panel 1 — gałęzie zamówienia ─────────────────────────────── */}
                <div className="flex w-[520px] shrink-0 flex-col border-r border-white/[.07]">
                    <PanelHeader
                        title="Gałęzie zamówienia"
                        meta={`${idx.branches.length - 1} gałęzi · ${idx.leaves.length} pozycji`}
                    />
                    <div className="min-h-0 flex-1 overflow-auto">
                        <div className="flex items-center gap-2 border-b border-white/[.07] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            <span className="flex-1">Gałąź</span>
                            <span className="w-9 text-right">Poz.</span>
                            <span className="w-24 text-right text-orange-400">Wycena</span>
                            <span className="w-24 text-right text-red-400">Zakup</span>
                        </div>
                        <BranchTree
                            idx={idx} rootId={SYNTHETIC_ROOT} level={0}
                            selected={selectedBranch}
                            onSelect={(id) => { setSelectedBranch(id); setSelectedLeaf(null); }}
                            cardOf={cardOf} actualsOf={actualsOf} isUnfinished={isUnfinished}
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
                            onAddActual={addActual} onUpdateActual={updateActual} onDeleteActual={deleteActual}
                        />
                    </div>
                </div>

                {/* ── Panel 3 — karta pozycji ──────────────────────────────────── */}
                <div className="flex w-[440px] shrink-0 flex-col border-l border-white/[.07]">
                    <PanelHeader
                        title="Karta pozycji"
                        meta={selectedNode ? `${actualsOf(selectedNode).length} zakupów w tabeli` : ''}
                    />
                    <div className="min-h-0 flex-1 overflow-auto p-3">
                        {selectedNode
                            ? <LeafCard node={selectedNode} {...rowOf(selectedNode)}
                                readOnly={readOnly} onToggleClosed={() => toggleClosed(selectedNode)} />
                            : <div className="pt-10 text-center text-sm text-gray-600">Wybierz pozycję w tabeli,<br />żeby zobaczyć jej kartę.</div>}
                    </div>
                </div>
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
function BranchTree({ idx, rootId, level, selected, onSelect, cardOf, actualsOf, isUnfinished }) {
    const node = idx.nodeById[rootId];
    if (!node) return null;
    const leaves = idx.leavesOfSubtree(rootId);
    const plan = leaves.reduce((s, n) => s + planValueOf(n, cardOf(n)), 0);
    const real = leaves.reduce((s, n) => s + realizationOf(n, actualsOf(n)).value, 0);
    const waiting = leaves.some(isUnfinished);
    const children = idx.childrenOf[rootId] || [];

    return (
        <>
            <div onClick={() => onSelect(rootId)}
                className={`flex cursor-pointer items-center gap-1.5 border-b border-white/[.04] px-2 py-1 text-xs hover:bg-white/[.03] ${
                    selected === rootId ? 'bg-teal-500/10' : ''} ${level <= 1 ? 'font-semibold text-gray-200' : 'text-gray-400'} ${
                    level === 1 ? 'border-t border-white/[.07]' : ''}`}>
                <span style={{ width: level * 13 }} className="shrink-0" />
                <ChevronRight size={11} className={`shrink-0 text-gray-600 ${children.length ? 'rotate-90' : 'invisible'}`} />
                <span className="min-w-0 flex-1 truncate" title={node.name}>{node.name}</span>
                {waiting && <span title="Są pozycje bez pełnego pokrycia zakupami" className="size-1.5 shrink-0 rounded-full bg-amber-400" />}
                <span className="w-9 shrink-0 text-right text-gray-500 tabular-nums">{leaves.length}</span>
                <span className="w-24 shrink-0 text-right text-orange-400 tabular-nums" title="Wycena gałęzi">{fmtZl(plan)}</span>
                <span className="w-24 shrink-0 text-right text-red-400 tabular-nums" title="Zakupy zrealizowane">{fmtZl(real)}</span>
            </div>
            {children.map(c => (
                <BranchTree key={c.id} idx={idx} rootId={c.id} level={level + 1}
                    selected={selected} onSelect={onSelect}
                    cardOf={cardOf} actualsOf={actualsOf} isUnfinished={isUnfinished} />
            ))}
        </>
    );
}

// @anchor realization-new-positions-table — 13 kolumn + szuflada zakupów jako wiersz potomny.
// Szuflada, a nie płaska lista zakupów: płaska gubiłaby pozycje bez ani jednego zakupu,
// a to właśnie one wymagają działania.
function PositionsTable({
    leaves, rowOf, actualsOf, expanded, onToggleExpanded, selected, onSelect,
    readOnly, filters = {}, filterOptions = {}, onFilterChange, onClearFilters,
    onSaveAxis, onSaveComment, onAddActual, onUpdateActual, onDeleteActual,
}) {
    let sumPlan = 0, sumReal = 0;
    const rows = leaves.map(node => {
        const data = rowOf(node);
        sumPlan += data.planValue;
        sumReal += data.r.value;
        return { node, ...data };
    });

    return (
        <table className="w-full table-fixed border-separate border-spacing-0 text-[22px]">
            <thead className="sticky top-0 z-10">
                <tr>
                    <th className="w-6 border-b border-white/[.14] bg-[#0a1120]" />
                    {REALIZATION_NEW_COLS.map(c => (
                        <th key={c.key} style={{ width: COL_PCT[c.key] }}
                            className={`border-b border-white/[.14] bg-[#0a1120] px-2 py-1.5 text-sm font-bold uppercase tracking-wider text-gray-500 ${
                                c.right ? 'text-right' : 'text-left'}`}>{c.label}</th>
                    ))}
                </tr>
                {/* @anchor realization-new-filter-row — drugi wiersz nagłówka: filtr na kolumnę.
                    Stoi w `<thead>`, więc zostaje na ekranie przy przewijaniu i przy pustym
                    wyniku — filtr da się cofnąć bez przeładowania widoku. */}
                <tr>
                    <th className="border-b border-white/[.07] bg-[#0a1120]" />
                    {REALIZATION_NEW_COLS.map(c => (
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
                        <td colSpan={REALIZATION_NEW_COLS.length + 1} className="px-4 py-12 text-center">
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
                                {REALIZATION_NEW_COLS.map((c, i) => (
                                    <td key={c.key}
                                        className={`px-2 py-1.5 ${tdOpen} ${c.right ? 'text-right tabular-nums' : ''} ${
                                            open && i === REALIZATION_NEW_COLS.length - 1 ? 'border-r border-r-teal-300/45' : ''}`}>
                                        <Cell colKey={c.key} node={node} card={card} r={r} planValue={planValue} deltaQty={deltaQty}
                                            readOnly={readOnly} onSaveAxis={onSaveAxis} onSaveComment={onSaveComment} />
                                    </td>
                                ))}
                            </tr>
                            {open && (
                                <tr>
                                    <td colSpan={REALIZATION_NEW_COLS.length + 1}
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
                    {REALIZATION_NEW_COLS.map(c => (
                        <td key={c.key} className={`border-t border-white/[.14] bg-[#0a1120] px-2 py-1.5 ${c.right ? 'text-right tabular-nums' : ''}`}>
                            {c.key === 'name' && <span className="text-[18px] font-semibold text-gray-400">Razem widoczne</span>}
                            {c.key === 'total' && (
                                <>
                                    <div className="font-semibold text-orange-400">{fmtZl(sumPlan)}</div>
                                    <div className="font-semibold text-red-400">{fmtZl(sumReal)}</div>
                                </>
                            )}
                        </td>
                    ))}
                </tr>
            </tfoot>
        </table>
    );
}

// @anchor realization-new-cell — jedna komórka wiersza pozycji.
function Cell({ colKey, node, card, r, planValue, deltaQty, readOnly, onSaveAxis, onSaveComment }) {
    const t = TYPE_META[node.type];
    const state = REAL_STATE[r.state];

    switch (colKey) {
        // Sama nazwa liścia — bez ścieżki i okruszków: gałąź stoi w lewym panelu, a nazwy
        // węzłów bywają 20-linijkowe. Trzy linie i pełna treść w dymku.
        case 'name':
            return <div className="line-clamp-3 leading-snug" title={getParentPath(node.path)}>{node.name}</div>;
        case 'type':
            return <span className={`text-[18px] font-semibold uppercase tracking-wide ${t?.color || 'text-gray-400'}`}>{t?.label || node.type}</span>;
        case 'supplier': {
            const names = [...new Set(r.entries.map(e => e.supplier?.name).filter(Boolean))];
            return <span className="text-[18px] text-gray-400">{names.length ? names.join(', ') : '—'}</span>;
        }
        case 'qty':
            return <>{fmtQty(node.quantity)} <span className="text-[18px] text-gray-500">{node.unit}</span></>;
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
                    {r.avg != null && r.mixedPrices && <span className="ml-1 text-[18px] text-gray-500" title="Średnia ważona z wpisów realizacji">śr.</span>}
                    {r.avg == null && <span className="ml-1 text-[18px] text-gray-500" title="Cena z propozycji isPurchase — brak wpisów">ofert.</span>}
                </>
            );
        }
        case 'total':
            return (
                <>
                    <div className="text-orange-400">{fmtZl(planValue)}</div>
                    <div className="text-red-400">{fmtZl(r.value)}</div>
                </>
            );
        case 'status': {
            const code = planStatusFromAny(node.status);
            return <Badge label={PLAN_STATUS_META[code]?.label} color={PLAN_STATUS_META[code]?.color} size={FIELD_FONT} />;
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
            className={`w-full border-none bg-transparent text-[20px] leading-snug text-gray-400 outline-none placeholder-gray-700 ${readOnly ? 'cursor-default' : ''}`}
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
    // Domyślna ilość nowego wpisu = ile brakuje do planu. Koszt jedn. zostaje PUSTY świadomie:
    // podpowiedziana cena zapisywała się kwotą, której nikt nie przeczytał, a to rozliczenie.
    const brakujaco = Math.round(Math.max(0, r.plan - r.qty) * 1000) / 1000;

    const BASE = withCard
        ? [['entryDate', 'Data', 160], ['docNumber', 'Dokument', 150], ['supplier', 'Oferent', 260],
           ['manufacturer', 'Producent', 200], ['model', 'Model', 200], ['ean', 'EAN', 190],
           ['qty', 'Ilość', 90, 1], ['unitCost', 'Koszt jedn.', 150, 1], ['wartosc', 'Wartość', 130, 1], ['comment', 'Komentarz', 420]]
        : [['entryDate', 'Data', 160], ['docNumber', 'Dokument', 150], ['supplier', 'Oferent', 260],
           ['scope', 'Zakres', 320],
           ['qty', 'Ilość', 90, 1], ['unitCost', 'Koszt jedn.', 150, 1], ['wartosc', 'Wartość', 130, 1], ['comment', 'Komentarz', 420]];
    const COLS = readOnly ? BASE : [...BASE, ['akcje', '', 100, 1]];
    // Szerokości szuflady liczone tak samo jak w tabeli pozycji — jako procent sumy, żeby
    // `table-fixed` nie rozepchnął jej do sumy pikseli i nie przywrócił poziomego suwaka.
    const SUMA_COLS = COLS.reduce((a, c) => a + (c[2] || 0), 0);
    const pctOf = (c) => `${((c[2] || 0) / SUMA_COLS * 100).toFixed(3)}%`;

    const head = (
        <div className={DRAWER.cardHead}>
            <span className={`${DRAWER.cardTitle} ${DRAWER.accent.real.title} text-[20px]`}>
                {withCard ? 'Zakupy zrealizowane' : 'Wykonanie zrealizowane'}
            </span>
            {!readOnly && (
                <button
                    onClick={(e) => { e.stopPropagation(); setAdding(v => !v); }}
                    className={`flex shrink-0 items-center gap-1.5 rounded border px-3 py-1 text-[22px] transition-colors ${
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
            <div className="px-3 pb-2.5 text-[24px] text-gray-400">
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
                <table className="w-full table-fixed border-separate border-spacing-0 text-[20px]">
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
                                <td className="border-t border-teal-300/35 px-2 py-1.5 text-gray-500">
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
        <tr className="group/entry hover:bg-white/[.02]">
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
function EntryForm({ node, cols, withCard, defaultQty, onAdd, onClose }) {
    const dzis = new Date().toISOString().slice(0, 10);
    const [draft, setDraft] = useState(() => ({
        entryDate: dzis,
        qty: defaultQty != null ? String(defaultQty) : '1',
        unitCost: '',
        comment: '', docNumber: '', supplierId: null,
        manufacturer: '', model: '', ean: '', scope: '',
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

// @anchor realization-new-leaf-card — prawy panel: co to dokładnie jest. Specyfikacja
// techniczna, propozycje `isOffer`/`isPurchase` z Δ na jednostce, trzy osie statusu
// i podsumowanie kwotowe.
function LeafCard({ node, card, r, planValue, readOnly, onToggleClosed }) {
    const t = TYPE_META[node.type];
    const delta = round2(r.value - planValue);
    const offer = card?.proposals?.find(p => p.isOffer) || null;
    const purchase = card?.proposals?.find(p => p.isPurchase) || null;
    const purchaseUnit = purchaseUnitOf(card);
    const dUnit = (offer && purchaseUnit != null) ? round2(purchaseUnit - offer.priceNetto) : null;
    const missing = Math.round((r.plan - r.qty) * 1000) / 1000;

    const Block = ({ children }) => <div className="mb-2.5 rounded-md border border-white/[.07] bg-[#0a1120] p-3">{children}</div>;
    const Label = ({ children }) => <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{children}</div>;

    const Side = ({ p, title, price, color }) => !p ? null : (
        <div className="min-w-0 flex-1">
            <div className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{title}</div>
            <div className="mt-0.5 text-base font-semibold tabular-nums">{fmtZl(price)} zł</div>
            <div className="mt-0.5 truncate text-xs text-gray-500">{[p.manufacturer, p.model].filter(Boolean).join(' ')}</div>
            <div className="truncate text-xs text-gray-500">{p.seller || '—'}{p.offerNumber ? ` · ${p.offerNumber}` : ''}</div>
            {p.availability && <div className="truncate text-xs text-gray-500">dostępność: {p.availability}</div>}
        </div>
    );

    return (
        <div>
            <Block>
                <div className="text-xs text-gray-500">{getParentPath(node.path)}</div>
                <h3 className="mt-1 text-sm font-semibold leading-snug text-gray-100">{node.name}</h3>
                <div className="mt-1">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${t?.color || 'text-gray-400'}`}>{t?.label || node.type}</span>
                    <span className="ml-2 text-xs text-gray-500">{node.unit} · właściciel: {node.owner || '—'}</span>
                </div>
            </Block>

            <Block>
                {card ? (
                    <>
                        <div className="text-sm font-semibold text-gray-200">{card.name}</div>
                        {card.technicalSpec
                            ? <div className="mt-1 whitespace-pre-line text-xs leading-relaxed text-gray-400">{card.technicalSpec}</div>
                            : <div className="mt-1 text-xs italic text-gray-600">Karta bez wymagań technicznych.</div>}
                        <div className="mt-1.5 text-[10px] text-gray-600">
                            z karty produktu · cena z wyceny {fmtZl(card.budgetedPriceNetto)} zł
                        </div>
                    </>
                ) : (
                    <div className="text-xs text-gray-400">
                        Liść bez karty produktowej — <span className="text-gray-500">
                            {(t?.label || node.type).toLowerCase()} rozlicza się wyłącznie zakupami w szufladzie,
                            a co obejmuje każdy z nich, mówi kolumna „Zakres".</span>
                    </div>
                )}
            </Block>

            {(offer || purchase) && (
                <Block>
                    <Label>Propozycje produktu</Label>
                    <div className="mt-2 flex gap-3.5">
                        <Side p={offer} title="Wycena · isOffer" price={offer?.priceNetto} color="text-orange-400" />
                        <Side p={purchase} title="Zakup · isPurchase" price={purchaseUnit} color="text-red-400" />
                    </div>
                    {dUnit != null && (
                        <div className="mt-2 text-xs text-gray-400">
                            Δ na jednostce: <b className={dUnit <= 0 ? 'text-emerald-300' : 'text-red-300'}>
                                {dUnit > 0 ? '+' : ''}{fmtZl(dUnit)} zł</b>
                        </div>
                    )}
                    <div className="mt-1 text-[10px] text-gray-600">
                        {offer && purchase && offer.id === purchase.id
                            ? 'jedna propozycja w obu rolach → purchasePriceNetto'
                            : 'dwie osobne propozycje → priceNetto każdej'}
                    </div>
                </Block>
            )}

            <Block>
                <div className="space-y-1.5">
                    <AxisRow label="Oferta"
                        badge={<Badge label={PLAN_STATUS_META[planStatusFromAny(node.status)]?.label}
                            color={PLAN_STATUS_META[planStatusFromAny(node.status)]?.color} />}
                        field="kolumna „Status oferty”" />
                    {hasPurchaseAxis(node.type) && <AxisRow label="Zakup" badge={<AxisBadge node={node} axis="purchase" />} field="kolumna „Status zakupu”" />}
                    {hasExecAxis(node.type) && <AxisRow label="Wykonanie" badge={<AxisBadge node={node} axis="exec" />} field="kolumna „Status wykonania”" />}
                </div>
            </Block>

            <Block>
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
                <Label>Rozliczenie</Label>
                <div className="mt-1 text-xs text-gray-400">
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
function Analiza({ a, orderName, open, onToggle, execOpen, onToggleExec }) {
    const c = a.calosc;
    const leftMoney = round2(c.plan - c.real);
    const leftDays = round2(c.dniPlan - c.dniWyk);
    const dTotal = round2(c.real - c.plan);
    const z = c.zamkniete;

    return (
        <>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-teal-300">
                Analiza zamówienia{orderName ? ` — ${orderName}` : ''}
            </div>
            <div className="mb-3 flex flex-wrap gap-2.5">
                <Tile label="Wycena zamówienia" value={`${fmtZl(c.plan)} zł`} color="text-orange-400" note={`${c.pozycji} pozycji kosztowych`} />
                <Tile label="Zakupy zrealizowane" value={`${fmtZl(c.real)} zł`} color="text-red-400" note={`${c.wpisow} wpisów na ${c.zRealizacja} pozycjach`} />
                <Tile label="Pozostaje do wydania" value={`${fmtZl(leftMoney)} zł`} note={`${fmtPct(pct(leftMoney, c.plan))} wyceny`} />
                <Tile label="Dni niezrealizowane" value={fmtQty(leftDays)} color="text-amber-400" note={`z ${fmtQty(c.dniPlan)} zaplanowanych`} />
                <Tile
                    label="Wykonane / zakupione / zamknięte"
                    value={`${fmtZl(z.lacznie.plan)} zł`}
                    color="text-emerald-400"
                    note={`${z.lacznie.pozycji} z ${c.pozycji} pozycji · zakup ${fmtZl(z.lacznie.real)} zł · ${fmtPct(pct(z.lacznie.plan, c.plan))} wyceny`} />
            </div>

            <div className="mb-3 flex flex-wrap gap-4">
                <Meter label="Pokrycie wyceny zakupami" done={c.real} plan={c.plan} left={`${fmtZl(c.real)} zł`} right={`${fmtZl(c.plan)} zł`} />
                <Meter label="Dni wykonane" done={c.dniWyk} plan={c.dniPlan} left={`${fmtQty(c.dniWyk)} dni wykonanych`} right={`${fmtQty(c.dniPlan)} dni w planie`} />
                <Meter label="Pozycje ruszone" done={c.zRealizacja} plan={c.pozycji} left={`${c.zRealizacja} pozycji z zakupami`} right={`${c.pozycji} pozycji`} />
            </div>

            <div className="flex flex-wrap gap-2">
                <button onClick={onToggle} className="rounded border border-white/[.14] px-2 py-0.5 text-[11px] text-gray-400 hover:text-gray-200">
                    {open ? 'Ukryj realizację zakresów' : `Realizacja ${a.galezie.length} zakresów głównych — plan wobec wykonania`}
                </button>
                <button onClick={onToggleExec} className="rounded border border-white/[.14] px-2 py-0.5 text-[11px] text-gray-400 hover:text-gray-200">
                    {execOpen
                        ? 'Ukryj bilans domkniętych'
                        : `Bilans domkniętych pozycji — ${z.lacznie.pozycji} poz. na ${fmtZl(z.lacznie.plan)} zł`}
                </button>
            </div>

            {open && (
                <div className="mt-2.5">
                    <div className="mb-2 flex flex-wrap items-center gap-3 text-base text-gray-500">
                        {STAGE_META.map(s => (
                            <span key={s.key} className="flex items-center gap-1.5">
                                <i className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
                            </span>
                        ))}
                        <span>— pasek pokazuje, ile POZYCJI jest w każdym stanie, a nie kwoty</span>
                    </div>

                    {!c.osWykonania.zrobione && !c.osWykonania.wtoku && (
                        <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/[.07] px-3 py-2 text-xs text-amber-200/90">
                            <b>Status wykonania nie jest w tym zamówieniu ustawiony na żadnej z {c.pozycji} pozycji.</b>{' '}
                            Dlatego „zrobione" wychodzi zero — nie dlatego, że nic nie zrobiono, tylko dlatego, że nikt tego
                            nie odnotował. Kolumna „Status wykonania" pokazuje na razie wyłącznie informację, na co pozycja czeka.
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full table-fixed border-separate border-spacing-0 text-[24px]">
                            <thead>
                                <tr className="text-[20px] uppercase tracking-wider text-gray-500">
                                    {/* Procenty, nie piksele: `table-fixed` z pikselami rozciąga tabelę do ich
                                        sumy i wypycha kolumny poza panel. Udziały trzymają proporcje i skalują
                                        się w dół razem z szerokością okna. */}
                                    <th style={{ width: '24%' }} className="border-b border-white/[.14] px-2 py-1 text-left">Zakres główny</th>
                                    <th style={{ width: '13%' }} className="border-b border-white/[.14] px-2 py-1 text-left">Pokrycie kwotowe</th>
                                    <th style={{ width: '12%' }} className="border-b border-white/[.14] px-2 py-1 text-left">Oś zakupu</th>
                                    <th style={{ width: '12%' }} className="border-b border-white/[.14] px-2 py-1 text-left">Oś wykonania</th>
                                    <th style={{ width: '6%' }} className="border-b border-white/[.14] px-2 py-1 text-right">Poz.</th>
                                    <th style={{ width: '11.5%' }} className="border-b border-white/[.14] px-2 py-1 text-right">Wycena</th>
                                    <th style={{ width: '11.5%' }} className="border-b border-white/[.14] px-2 py-1 text-right">Zakup</th>
                                    <th style={{ width: '10%' }} className="border-b border-white/[.14] px-2 py-1 text-right">Δ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {a.galezie.map(g => {
                                    const d = round2(g.real - g.plan);
                                    return (
                                        <tr key={g.id}>
                                            <td className="truncate border-b border-white/[.05] px-2 py-1" title={g.nazwa}>{g.nazwa}</td>
                                            <td className="border-b border-white/[.05] px-2 py-1"><CoverageBar real={g.real} plan={g.plan} /></td>
                                            <td className="border-b border-white/[.05] px-2 py-1"><StageBar dist={g.osZakupu} title={`Oś zakupu w zakresie „${g.nazwa}"`} /></td>
                                            <td className="border-b border-white/[.05] px-2 py-1"><StageBar dist={g.osWykonania} title={`Oś wykonania w zakresie „${g.nazwa}"`} /></td>
                                            <td className="border-b border-white/[.05] px-2 py-1 text-right tabular-nums">{g.pozycji}</td>
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
                                    <td className="border-t border-white/[.14] px-2 py-1"><StageBar dist={c.osZakupu} title="Oś zakupu — całe zamówienie" /></td>
                                    <td className="border-t border-white/[.14] px-2 py-1"><StageBar dist={c.osWykonania} title="Oś wykonania — całe zamówienie" /></td>
                                    <td className="border-t border-white/[.14] px-2 py-1 text-right tabular-nums">{c.pozycji}</td>
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
                „Pokrycie kwotowe" mówi, ile z wyceny danego wiersza już wydano; „Udział wyceny" — jaką część zamówienia ten wiersz stanowi.
            </div>
            <div className="overflow-x-auto">
                <table className="w-full table-fixed border-separate border-spacing-0 text-[24px]">
                    <thead>
                        <tr className="text-[20px] uppercase tracking-wider text-gray-500">
                            <Th w="w-[28%]">Przekrój</Th>
                            <Th w="w-[15%]">Pokrycie kwotowe</Th>
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
