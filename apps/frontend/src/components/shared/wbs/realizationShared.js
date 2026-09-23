// Wspólne definicje dla widoków porównujących wycenę z realizacją: panelu „Materiały"
// (`WbsMaterialsPanel`) i zakładki „Realizacja" (`RealizationTab`). Oba liczą te same
// liczby z tych samych wpisów `LeafActual` — gdyby każdy miał własną kopię `realizationOf`,
// jeden ekran pokazywałby inne pokrycie niż drugi.

import {
    Package, Wrench, Hammer, ClipboardCheck, Warehouse, Truck,
    Clock, Star, CheckCircle, XCircle, ShoppingCart, LogOut, PackagePlus, Sparkles,
} from 'lucide-react';

// @anchor wbs-materials-type-meta — typy liści widoczne w panelu. Materiał i sprzęt mają
// kartę produktową (`MaterialRequirement`), praca i usługa nie — wchodzą tu wyłącznie po to,
// żeby dało się na nich prowadzić wpisy realizacji na tych samych zasadach.
export const TYPE_META = {
    material:  { label: 'Materiał', icon: Wrench,         color: 'text-amber-300',  reqType: 'material',  hasCard: true },
    equipment: { label: 'Sprzęt',   icon: Package,        color: 'text-blue-300',   reqType: 'equipment', hasCard: true },
    work:      { label: 'Praca',    icon: Hammer,         color: 'text-violet-300', reqType: null,        hasCard: false },
    service:   { label: 'Usługa',   icon: ClipboardCheck, color: 'text-teal-300',   reqType: null,        hasCard: false },
    lodging:   { label: 'Nocleg',   icon: Warehouse,      color: 'text-sky-300',    reqType: null,        hasCard: false },
    fuel:      { label: 'Paliwo',   icon: Truck,          color: 'text-orange-300', reqType: null,        hasCard: false },
};

// @anchor wbs-materials-leaf-types — wszystkie kosztowe typy liści z `TYPE_OPTIONS` poza
// `group`; liście bez typu zostają poza panelem, bo nie wiadomo, czym są. Nocleg i paliwo
// wchodzą, bo w porównaniu i tak się liczą — bez nich nie dałoby się im dopisać realizacji.
export const LEAF_TYPES = ['material', 'equipment', 'work', 'service', 'lodging', 'fuel'];

// @anchor realization-open-types — typy liści widoczne dla KAŻDEJ roli. Reszta (praca,
// usługa, nocleg, paliwo) to koszty własne firmy — pokazujemy je wyłącznie managerowi,
// bo logistyk i pracownik nie mają się z czego dowiadywać, ile kosztuje ich robocizna.
export const OPEN_LEAF_TYPES = ['material', 'equipment'];

export const STATUS_META = {
    // Stan startowy karty materiałowej — ten sam kod co w `STRUCTURE_STATUS_META`
    // i `STRUCT_STATUS_META`; „Oczekuje" znaczy „czeka na ofertę", a nie „dopiero powstała".
    NEW:       { label: 'Nowy',         icon: Sparkles,     color: 'text-slate-300' },
    PENDING:   { label: 'Oczekuje',     icon: Clock,        color: 'text-amber-400' },
    PROPOSAL:  { label: 'Propozycja',   icon: Star,         color: 'text-blue-400' },
    CONFIRMED: { label: 'Potwierdzone', icon: CheckCircle,  color: 'text-green-400' },
    REJECTED:  { label: 'Odrzucone',    icon: XCircle,      color: 'text-red-400' },
    ORDERED:   { label: 'Zamówione',    icon: ShoppingCart, color: 'text-purple-400' },
    // Ten sam kod co w `STRUCTURE_STATUS_META` (wbsConstants) i `STRUCT_STATUS_META`
    // (WBSHybridTable) — status jedzie między widokami jako goły string, więc rozjazd kodu
    // pokazałby w drugim widoku surowe `EXTRA_ORDER` zamiast etykiety.
    EXTRA_ORDER: { label: 'Dodatkowe zamówienie', icon: PackagePlus, color: 'text-fuchsia-400' },
    IN_STOCK:  { label: 'Na magazynie', icon: Warehouse,    color: 'text-cyan-400' },
    ISSUED:    { label: 'Wydane',       icon: LogOut,       color: 'text-emerald-400' },
};

// @anchor realization-auth-headers
export function authHeaders() {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// @anchor realization-flatten-wbs-nodes — `/wbs-nodes/unified/:nodeId` zwraca listę płaską,
// ale starsze wywołania podają drzewo; obsługujemy oba kształty.
export function flattenWbsNodes(items, result = []) {
    for (const n of (items || [])) {
        result.push(n);
        if (n.children?.length) flattenWbsNodes(n.children, result);
    }
    return result;
}

// @anchor realization-get-parent-path — ścieżka bez ostatniego segmentu, czyli „gdzie ten
// liść siedzi"; sam liść jest już w kolumnie „Nazwa".
export function getParentPath(nodePath) {
    const segs = nodePath ? nodePath.split(' › ') : [];
    if (segs.length <= 1) return segs[0] || '—';
    return segs.slice(0, -1).join(' / ');
}

// @anchor realization-leaf-nodes-of — „liść kosztowy" = węzeł z typem z `LEAF_TYPES`,
// NIE węzeł bez dzieci. To rozróżnienie jest istotne: w realnych danych typowane pozycje
// bywają rodzicami innych pozycji (np. „Avigilon … + licencje" typ=equipment, unitCost=4800,
// z dzieckiem „licencja ACC7" typ=equipment, unitCost=1092) i niosą własny koszt, a nie sumę
// dzieci. Filtrowanie po bezdzietności wycięłoby je z tabeli razem z ich zakupami — jeden taki
// węzeł ma już wpis na 4355 zł. Ta sama reguła co w `WbsMaterialsPanel`, dzięki czemu oba
// widoki pokazują ten sam zbiór pozycji i ten sam dziennik wpisów.
export function leafNodesOf(nodes, types = LEAF_TYPES) {
    return (nodes || []).filter(n => types.includes(n.type));
}

// Spłaszcza zagnieżdżony obiekt material na wymaganie — po migracji katalog jest w relacji,
// ale reszta frontendu nadal czyta card.manufacturer / card.priceNetto (stary schemat).
export function flattenReq(r) {
    const selected = r.proposals?.find(p => p.isSelected) || null;
    return {
        ...r,
        manufacturer: r.material?.manufacturer || r.manufacturer || '',
        model:        r.material?.model        || r.model        || '',
        productName:  r.material?.productName  || r.productName  || '',
        priceNetto:   r.budgetedPriceNetto ?? r.priceNetto ?? null,
        productUrl:   r.material?.productUrl   || r.productUrl   || '',
        seller:       r.material?.seller       || r.seller       || '',
        availability: selected?.availability   || r.availability || '',
        dataSheetUrl:  r.material?.dataSheetUrl  || r.dataSheetUrl  || null,
        dataSheetName: r.material?.dataSheetName || r.dataSheetName || null,
        complianceUrl: r.material?.complianceUrl || r.complianceUrl || null,
        imageUrl:      r.material?.imageUrl      || r.imageUrl      || null,
    };
}

// @anchor realization-card-tag-owned — czy karta wskazana tagiem `req:<id>` NALEŻY do tego
// liścia. Tag bywa nieaktualny: kopiowanie pozycji i automatyczne zakładanie kart
// (`auto-requirement`) zostawiają na węźle wskaźnik do karty INNEGO węzła o tej samej nazwie.
// Karta jest „własna", gdy nie jest przypisana do żadnego węzła, albo gdy wskazuje na ten
// (bezpośrednio lub przez `sourceWbsNodeId`, bo w wersji liść ma sklonowane ID).
const cardOwnedByNode = (req, node) =>
    !!req && (!req.wbsNodeId || req.wbsNodeId === node.id || req.wbsNodeId === node.sourceWbsNodeId);

// @anchor realization-resolve-card — dopasowanie liść↔wymaganie materiałowe. Ta sama
// kolejność co w `WbsMaterialsPanel.fetchCards` i `MaterialReqExpandPanel`: 1) tag `req:<id>`,
// 2) `wbsNodeId`, 3) fallback po nazwie (węzły snapshot mają sklonowane ID). Bez wspólnej
// kolejności dwa widoki pokazywały różne materiały dla tego samego liścia.
//
// Tag `req:` ustępuje karcie, która JAWNIE należy do tego liścia (`wbsNodeId === node.id`).
// Powód jest z danych: w zamówieniu „CMC- Serwerownia ZDC1-K9_2026" 12 z 18 liści z takim
// tagiem wskazywało kartę innego węzła. Na jedenastu ceny akurat się zgadzały i nic nie było
// widać, ale liść „Bypass" brał przez tag cenę 2,00 zł zamiast własnych 8000,00 zł i cała
// zakładka Realizacja pokazywała wycenę o 7998,00 zł niższą niż Budżet — dwa ekrany, dwie
// liczby, żadnego ostrzeżenia. Gdy NIC nie przypisuje się do liścia wprost, tag nadal wygrywa:
// dla snapszotów bywa jedynym wiązaniem, jakie zostało.
export function buildCardMap(nodes, reqs) {
    const reqById = Object.fromEntries((reqs || []).map(r => [r.id, r]));
    const reqByWbsNodeId = {};
    const reqByName = {};
    for (const r of reqs || []) {
        if (r.wbsNodeId) reqByWbsNodeId[r.wbsNodeId] = r;
        if (r.name) reqByName[String(r.name).trim().toLowerCase()] = r;
    }
    const map = {};
    for (const node of nodes || []) {
        if (!TYPE_META[node.type]?.hasCard) continue;
        const reqTag = (node.tags || []).find(t => typeof t === 'string' && t.startsWith('req:'));
        const tagged = reqTag ? reqById[reqTag.slice(4)] : null;
        const own = reqByWbsNodeId[node.id] || reqByWbsNodeId[node.sourceWbsNodeId] || null;
        const req =
            (cardOwnedByNode(tagged, node) ? tagged : null) ||
            own ||
            tagged ||
            reqByName[String(node.name || '').trim().toLowerCase()] ||
            null;
        if (req) map[node.id] = flattenReq(req);
    }
    return map;
}

// @anchor wbs-root-of — korzeń klonu liścia: po nim wiszą wpisy realizacji, więc przetrwają
// utworzenie nowej wersji. Wiersze sprzed migracji nie mają pola i są własnym korzeniem.
export const wbsRootOf = (node) => node?.sourceWbsNodeId || node?.id || '';

// @anchor purchase-unit-of — koszt jedn. zakupu z propozycji isPurchase (purchasePriceNetto gdy
// ta sama propozycja pełni obie role, inaczej priceNetto). null = brak realnego kosztu zakupu.
export function purchaseUnitOf(card) {
    const p = card?.proposals?.find(x => x.isPurchase);
    if (!p) return null;
    return (p.isOffer && p.isPurchase) ? (p.purchasePriceNetto ?? p.priceNetto ?? null) : (p.priceNetto ?? null);
}

// @anchor realization-state-styles — kolor niesie stan realizacji: bursztyn w trakcie,
// zieleń na planie, czerwień ponad plan, teal dla pozycji rozliczonej ręcznie.
export const REAL_STATE = {
    none:   { text: 'text-gray-500',   bar: 'bg-white/15' },
    part:   { text: 'text-amber-300',  bar: 'bg-amber-400' },
    full:   { text: 'text-emerald-300', bar: 'bg-emerald-400' },
    over:   { text: 'text-red-300',    bar: 'bg-emerald-400' },
    closed: { text: 'text-teal-300',   bar: 'bg-teal-400' },
};

export const fmtQty = (v) => {
    const n = Number(v) || 0;
    return Number.isInteger(n) ? String(n) : n.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
};
export const fmtZl = (v) => v == null ? '—' : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate = (d) => { try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; } };

// @anchor realization-plan-unit-of — koszt jedn. PLANU, czyli ta sama liczba, którą pokazuje
// Budżet i którą dostał klient w ofercie. Źródłem jest `WbsNode.unitCost`; karta materiałowa
// (`budgetedPriceNetto`) wchodzi wyłącznie jako zapchajdziura, gdy węzeł nie ma własnej ceny.
//
// Kolejność była kiedyś odwrotna (karta przed węzłem) i to CICHO rozjeżdżało dwa ekrany: karta
// i węzeł są edytowalne osobno, więc Budżet pokazywał 8000 zł, a Realizacja 13000 zł za tę samą
// pozycję. Sprawdzone na pełnym zrzucie produkcji (1248 liści, 36 zamówień): 5 zamówień miało
// taki rozjazd na łącznie 72 922,40 zł, najgorszy przypadek to „Głośniki" z kartą wycenioną na
// 0 zł przy węźle 4836 zł/szt — plan pokazywał 0 zamiast 38 688 zł, bo `??` nie przepuszcza zera.
// W drugą stronę ryzyka nie ma: z 174 liści z `unitCost = 0` ANI JEDEN nie ma karty z ceną,
// więc odwrócenie kolejności nie gubi żadnej wartości.
// Pozycja „poza baseline" nie ma ceny w ofercie z definicji — plan 0, cały zakup to odchylenie.
export const planUnitOf = (node, card) => (node?._outOfBaseline ? 0 : (node?.unitCost ?? card?.priceNetto ?? null));

// @anchor realization-plan-value — wartość pozycji po stronie WYCENY: koszt jedn. planu razy
// ilość z wyceny. Mieszkała w obu zakładkach realizacji osobno; odkąd eksport Excel liczy ją
// dla obu, musi być jedna — inaczej ten sam arkusz pokazywałby inną kwotę zależnie od tego,
// z której tabeli go wywołano.
export const planValueOf = (node, card) => {
    const u = planUnitOf(node, card);
    return u != null ? u * (Number(node?.quantity) || 0) : 0;
};

// @anchor realization-settlement — rozliczenie wpisu zakupu wobec wyceny: DWIE wartości, bo
// po nich się filtruje i sumuje. Tylko „w ofercie" ma wartość ofertową; „poza ofertą" to koszt
// ponad plan w całości. Dlaczego poza — mówi osobny powód (`POWOD_POZA_OFERTA`), żeby filtr
// nie rozsypywał się na cztery etykiety tego samego rozstrzygnięcia.
export const ROZLICZENIE = {
    OFERTA: 'w ofercie',
    POZA: 'poza ofertą',
};

// @anchor realization-settlement-reason — powód „poza ofertą":
//   nadmiarowy            — ręczny znacznik `LeafActual.isSurplus` (ilość ponad wycenę),
//   bez ceny w wycenie    — pozycja bez ceny albo bez ilości w wycenie,
//   dodana po akceptacji  — `_outOfBaseline`,
//   usunięta z wyceny     — wpis pozycji, której nie ma już w wersji planu.
export const POWOD_POZA_OFERTA = {
    NADMIAR: 'nadmiarowy',
    BEZ_CENY: 'bez ceny w wycenie',
    PO_AKCEPTACJI: 'dodana po akceptacji',
    USUNIETA: 'usunięta z wyceny',
};

// @anchor realization-out-of-baseline — pozycja dodana PO akceptacji oferty: `WbsNode.createdAt`
// późniejszy niż `ProcessNode.acceptedAt`. Po akceptacji manager dopisuje pozycje do TEJ SAMEJ
// wersji, która jest baseline'em, więc porównanie wersji niczego nie wykryje — rozstrzyga data.
// Wyliczane w widoku, nic nie trafia do bazy: cofnięcie i ponowna akceptacja przesuwa granicę
// i pozycja wraca „do oferty" bez żadnej migracji danych.
export function markOutOfBaseline(nodes, acceptedAt) {
    const granica = acceptedAt ? new Date(acceptedAt).getTime() : null;
    if (!granica) return nodes;
    return nodes.map(n => (n.createdAt && new Date(n.createdAt).getTime() > granica ? { ...n, _outOfBaseline: true } : n));
}

// @anchor realization-out-of-baseline-meta — plakietka w kolumnie „Status oferty". Zastępuje
// status planu, bo o pozycji spoza oferty status „Zaakceptowane" mówiłby nieprawdę.
export const POZA_BASELINE_META = { label: 'Poza ofertą', color: 'text-red-400' };

// @anchor realization-settlement-of — { rozl, powod } wpisu. Kolejność powodów ma znaczenie:
// brak ceny w wycenie wygrywa ze znacznikiem, bo „nadmiarowy" zakłada, że JEST jakaś ilość
// ofertowa, ponad którą się wyszło.
export function rozliczenieOf(node, card, entry) {
    const poza = (powod) => ({ rozl: ROZLICZENIE.POZA, powod });
    if (node?._outOfBaseline) return poza(POWOD_POZA_OFERTA.PO_AKCEPTACJI);
    if (!planUnitOf(node, card) || !(Number(node?.quantity) > 0)) return poza(POWOD_POZA_OFERTA.BEZ_CENY);
    if (entry?.isSurplus) return poza(POWOD_POZA_OFERTA.NADMIAR);
    return { rozl: ROZLICZENIE.OFERTA, powod: '' };
}

// @anchor realization-of — suma wpisów realizacji liścia wobec planu z wyceny.
// `avg` to średnia ważona (każdy wpis ma własny koszt jedn.), `state` steruje kolorem:
// none → nic nie zrobione, part → w trakcie, full → plan wykonany, over → ponad plan,
// closed → pozycja rozliczona ręcznie mimo niedowykonania.
export function realizationOf(node, entries) {
    const list = entries || [];
    const qty = Math.round(list.reduce((s, e) => s + (Number(e.qty) || 0), 0) * 1000) / 1000;
    const value = Math.round(list.reduce((s, e) => s + (Number(e.qty) || 0) * (Number(e.unitCost) || 0), 0) * 100) / 100;
    const plan = Number(node?.quantity) || 0;
    const pct = plan > 0 ? Math.round((qty / plan) * 100) : (qty > 0 ? 100 : 0);
    const state = node?.realizationClosed ? 'closed'
        : qty === 0 ? 'none'
        : qty > plan + 1e-9 ? 'over'
        : qty >= plan - 1e-9 ? 'full'
        : 'part';
    return {
        entries: list,
        qty,
        value,
        plan,
        pct,
        state,
        avg: qty > 0 ? Math.round((value / qty) * 100) / 100 : null,
        mixedPrices: list.length > 1 && list.some(e => Number(e.unitCost) !== Number(list[0].unitCost)),
    };
}
