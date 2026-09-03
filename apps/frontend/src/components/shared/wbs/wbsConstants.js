/**
 * Shared WBS constants and formatters
 */

import { Clock } from 'lucide-react';

// @anchor task-categories
export const TASK_CATEGORIES = [
    { key: 'terminowe',     label: 'Terminowe',     icon: Clock, iconColor: 'text-orange-400', color: 'orange' },
    { key: 'instalacyjne',  label: 'Instalacyjne',  icon: Clock, iconColor: 'text-blue-400',   color: 'blue' },
    { key: 'organizacyjne', label: 'Organizacyjne', icon: Clock, iconColor: 'text-purple-400', color: 'purple' },
    { key: 'jakosciowe',    label: 'Jakościowe',    icon: Clock, iconColor: 'text-green-400',  color: 'green' },
    { key: 'techniczne',    label: 'Techniczne',    icon: Clock, iconColor: 'text-cyan-400',   color: 'cyan' },
    { key: 'finansowe',     label: 'Finansowe',     icon: Clock, iconColor: 'text-yellow-400', color: 'yellow' },
    { key: 'sla',           label: 'SLA',           icon: Clock, iconColor: 'text-indigo-400', color: 'indigo' },
    { key: 'gwarancyjne',   label: 'Gwarancyjne',   icon: Clock, iconColor: 'text-rose-400',   color: 'rose' },
];

// @anchor modules
export const MODULES = [
  'ClientSideRowModelModule',
  'TextEditorModule',
  'NumberEditorModule',
  'SelectEditorModule',
  'TextFilterModule',
  'NumberFilterModule',
  'ValidationModule',
];

// @anchor dark-theme
export const darkTheme = {
  accentColor: '#4f9ef5',
  backgroundColor: '#1a1d23',
  borderColor: 'rgba(255,255,255,0.06)',
  cellHorizontalPaddingScale: 0.6,
  fontSize: 13,
  headerFontSize: 12,
  rowHeight: 32,
  headerHeight: 34,
};

// Type labels
// @anchor type-labels
export const TYPE_LABELS = {
  group: 'Grupujący',
  work: 'Praca',
  material: 'Materiał',
  equipment: 'Sprzęt',
  service: 'Usługa',
  lodging: 'Nocleg',
  fuel: 'Paliwo',
  product: 'Produkt',
};

// @anchor type-options
export const TYPE_OPTIONS = ['', 'group', 'work', 'material', 'equipment', 'service', 'lodging', 'fuel'];

// @anchor wbs-type-from-any
// Normalizuje dowolny typ pozycji do kanonicznego typu z drzewa WBS.
// Obsługuje legacy enum wymagań (DEVICE/MATERIAL/CABLE/SOFTWARE/SERVICE) oraz typy WBS.
// Pusty string gdy typ nieznany. Mapowanie MUSI być spójne z migracją backendu.
const LEGACY_REQ_TYPE_MAP = {
  device: 'equipment',
  material: 'material',
  cable: 'material',
  software: 'service',
  service: 'service',
};
export const wbsTypeFromAny = (type) => {
  const t = String(type || '').toLowerCase().trim();
  if (!t) return '';
  const mapped = LEGACY_REQ_TYPE_MAP[t] || t;
  return TYPE_OPTIONS.includes(mapped) ? mapped : '';
};

// @anchor budget-type-labels
export const BUDGET_TYPE_LABELS = {
  WORK: 'Praca',
  MATERIAL: 'Materiał',
  EXTERNAL_SERVICE: 'Usługa Obca',
};

// @anchor unit-options
export const UNIT_OPTIONS = [
  'sztuki',
  'kilometry',
  'metry',
  'dni',
  'godziny',
  'tygodnie',
  'miesiące',
  'l',
  'kg',
  't',
  'm2',
  'm3',
  'kpl',
  'rbh',
  'kurs',
  'usługa',
  'pakiet',
];

// @anchor cable-unit-keywords-regex
// Rozpoznaje kable/światłowody/korytka kablowe/dukty kablowe w nazwie pozycji WBS.
export const CABLE_UNIT_KEYWORDS_REGEX = /kabe?l|światłow/i;

// @anchor suggest-default-unit
// Proponuje domyślną jednostkę dla nowo tworzonej pozycji WBS na podstawie nazwy i typu.
// Priorytet: nazwa kablowa/światłowodowa > typ "praca"/"usługa". Zwraca null gdy brak
// dopasowania — wołający NIE powinien wtedy nadpisywać istniejącej jednostki.
export function suggestDefaultUnit(name, type) {
  if (CABLE_UNIT_KEYWORDS_REGEX.test(name || '')) return 'metry';
  if (type === 'work') return 'dni';
  if (type === 'service') return 'pakiet';
  return null;
}

// @anchor sanitize-qty-input
// Ilość: dopuszcza tylko cyfry + jeden separator dziesiętny (',' lub '.').
// Znaki spoza tego zbioru oraz kolejne separatory są odrzucane — UI pokazuje
// ostrzeżenie "tylko cyfry", a wartość nigdy nie jest podmieniana na domyślną.
export function sanitizeQtyInput(raw) {
  const s = String(raw);
  if (s.startsWith('=')) {
    // formuła — przepuść znaki matematyczne, zapobiegnij injectionowi
    return '=' + s.slice(1).replace(/[^0-9+\-*/.(), ]/g, '');
  }
  let seenSep = false;
  let out = '';
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') { out += ch; continue; }
    if ((ch === '.' || ch === ',') && !seenSep) { seenSep = true; out += ch; }
  }
  return out;
}

// @anchor eval-qty-formula
export function evalQtyFormula(raw) {
  const s = String(raw).trim();
  if (!s.startsWith('=')) return null;
  const expr = s.slice(1).replace(/,/g, '.').replace(/[^0-9+\-*/.() ]/g, '');
  if (!expr.trim()) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')();
    if (typeof result !== 'number' || !Number.isFinite(result)) return null;
    return parseFloat(result.toFixed(10).replace(/\.?0+$/, ''));
  } catch {
    return null;
  }
}

// @anchor parse-price-input — jedna droga zamiany tego, co wpisano w pole ceny lub ilości,
// na liczbę: najpierw działanie („=1200*1.23"), potem zwykła liczba z przecinkiem lub kropką.
// Pusty i nieczytelny wpis dają `null` — wołający decyduje, czy to znaczy „brak wartości",
// czy „zostaw jak było". Zero NIE jest zamieniane na `null`: zero to cena, nie brak ceny.
export function parsePriceInput(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  const evaluated = evalQtyFormula(s);
  const n = evaluated !== null ? evaluated : parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// @anchor default-unit-for-type
export function defaultUnitForType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'work' || t === 'praca') return 'dni';
  if (t === 'fuel' || t === 'paliwo') return 'kilometry';
  return 'sztuki';
}

// @anchor material-status-labels
export const MATERIAL_STATUS_LABELS = {
  // @anchor status-new — stan startowy KAŻDEJ nowo utworzonej pozycji, także materiału
  // i sprzętu. Kod wspólny ze słownikiem niematerialnym (`WORK_STATUS_LABELS`), bo znaczy
  // dokładnie to samo: pozycja dopiero powstała. Etykieta idzie za rodzajem rzeczownika —
  // „Nowy materiał", „Nowy sprzęt" wobec „Nowe" nad pracą, usługą, noclegiem i paliwem.
  // „Oczekuje" NIE jest tym samym: znaczy „czeka na ofertę dostawcy", czyli ktoś już ruszył.
  NEW: 'Nowy',
  PENDING: 'Oczekuje',
  PROPOSAL: 'Propozycja',
  CONFIRMED: 'Potwierdzone',
  REJECTED: 'Odrzucone',
  ORDERED: 'Zamówione',
  EXTRA_ORDER: 'Dodatkowe zamówienie',
  IN_STOCK: 'Na magazynie',
  ISSUED: 'Wydane',
  DONE: 'Wykonane',
  INSTALLED: 'Zainstalowane',
};

// @anchor structure-status-meta
export const STRUCTURE_STATUS_META = {
  '': { label: 'Brak', color: 'text-gray-400' },
  NEW: { label: 'Nowy', color: 'text-slate-300' },
  PENDING: { label: 'Oczekuje', color: 'text-amber-400' },
  PROPOSAL: { label: 'Propozycja', color: 'text-blue-400' },
  CONFIRMED: { label: 'Potwierdzone', color: 'text-green-400' },
  REJECTED: { label: 'Odrzucone', color: 'text-red-400' },
  ORDERED: { label: 'Zamówione', color: 'text-violet-400' },
  // @anchor status-extra-order — pozycja domówiona POZA pierwotnym zamówieniem (brak w dostawie,
  // uszkodzenie, zmiana zakresu na budowie). Osobny kod, a nie ponowne `ORDERED`, bo inaczej nie
  // dałoby się odróżnić pozycji zamówionej raz od takiej, która pochłonęła drugi zakup.
  EXTRA_ORDER: { label: 'Dodatkowe zamówienie', color: 'text-fuchsia-400' },
  IN_STOCK: { label: 'Na magazynie', color: 'text-cyan-400' },
  ISSUED: { label: 'Wydane', color: 'text-emerald-400' },
  DONE: { label: 'Wykonane', color: 'text-teal-400' },
  INSTALLED: { label: 'Zainstalowane', color: 'text-lime-400' },
  MIXED: { label: 'Mieszany', color: 'text-sky-300' },
};

// @anchor material-status-label-to-code
export const MATERIAL_STATUS_LABEL_TO_CODE = Object.fromEntries(
  Object.entries(MATERIAL_STATUS_LABELS).map(([code, label]) => [String(label).toUpperCase(), code])
);

// @anchor structure-common-cell-class
export const STRUCTURE_COMMON_CELL_CLASS = 'text-sm leading-6';

// @anchor expand-drawer — jeden wygląd „szuflady" rozwiniętego wiersza we wszystkich trzech
// tabelach liści: Materiały (`WbsMaterialsPanel`), WBS (`WBSHybridTable`) i Realizacja
// (`RealizationTab`). Ta sama płaszczyzna, ten sam kręgosłup przy lewej krawędzi i ten sam
// nagłówek 10 px — wcześniej każda tabela miała własny (turkus, bursztyn, `bg-black/20`)
// i rozwinięcie wyglądało jak inny widok, choć niesie te same dane o tej samej pozycji.
// Akcent zostaje semantyczny i dlatego siedzi osobno w `accent`: niebieski to strona WYCENY,
// turkus strona ZAKUPU/REALIZACJI. Kształt kopiujemy, znaczenia koloru nie mieszamy.
//
// JEDNA PŁASZCZYZNA NA CAŁĄ SZUFLADĘ. `surface` obowiązuje od wiersza, który rozwinięto,
// przez kartę / panel, pasek zakupów, wpisy realizacji aż po formularz nowego wpisu.
// Wcześniej każdy z tych kawałków miał własne tło (`bg-blue-500/[0.12]`, `bg-black/20`,
// `bg-black/25`, `bg-teal-500/[0.06]`) i rozwinięcie czytało się jak cztery osobne bloki
// zamiast jednego. Hover w środku szuflady dokładamy bielą (`hoverRow`), nie czernią —
// czerń zmieniała odcień płaszczyzny, biel tylko ją rozjaśnia.
//
// `cap` domyka szufladę od spodu: pełna listwa w kolorze akcentu, nie cienka krawędź.
// Krawędź 1–2 px ginęła między wierszami tabeli i nie było widać, gdzie grupa się kończy.
export const DRAWER = {
  surface: 'bg-[#182236]',
  hoverRow: 'hover:bg-white/[0.03]',
  spine: 'border-l-[3px]',
  head: 'flex items-baseline gap-2 px-4 pt-2',
  label: 'text-[10px] font-bold uppercase tracking-widest',
  name: 'text-[10px] text-gray-500 truncate',
  cap: 'p-0 h-1',
  accent: {
    offer: { spine: 'border-l-blue-500', label: 'text-blue-300/80', cap: 'bg-blue-500/70' },
    real: { spine: 'border-l-teal-500', label: 'text-teal-300/80', cap: 'bg-teal-500/70' },
  },
};

// Formatter functions
// @anchor fmt-pln
export const fmtPLN = v =>
  v != null && v !== 0
    ? v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
    : '';

// @anchor fmt-qty
export const fmtQty = v =>
  v != null && v !== 0
    ? v.toLocaleString('pl-PL', { maximumFractionDigits: 2 })
    : '';

// @anchor fmt-pct
export const fmtPct = v =>
  v != null && v !== 0
    ? v.toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + '%'
    : '';

// @anchor fmt-pln-full
export const fmtPLNFull = v =>
  (Number(v) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });

// @anchor fmt-pct-full
export const fmtPctFull = v =>
  (Number(v) || 0).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + '%';

// Utility functions
// @anchor norm-key
export const normKey = value => String(value || '').trim().toLowerCase();

// @anchor make-material-lookup-key
export const makeMaterialLookupKey = (subjectName, itemName) =>
  `${normKey(subjectName)}::${normKey(itemName)}`;

// @anchor parse-locale-number
export const parseLocaleNumber = value => {
  if (value == null) return null;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

// @anchor normalize-status-code
export const normalizeStatusCode = value => {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (MATERIAL_STATUS_LABEL_TO_CODE[upper]) {
    return MATERIAL_STATUS_LABEL_TO_CODE[upper];
  }
  // Etykiety statusów robocizny — import z arkusza podaje „Rozpoczęte", nie `STARTED`.
  if (WORK_STATUS_LABEL_TO_CODE[upper]) {
    return WORK_STATUS_LABEL_TO_CODE[upper];
  }
  return raw;
};

// ── Statusy liści niematerialnych (praca / usługa / nocleg / paliwo) ─────────
// Lista materiałowa (Oczekuje → Propozycja → Zamówione → Na magazynie → Wydane) opisuje
// drogę TOWARU przez zakup i magazyn. Robocizna, usługa obca, nocleg i paliwo żadnej
// z tych faz nie mają — nie da się „zamówić na magazyn" dnia pracy ekipy ani „wydać
// z magazynu" przejechanych kilometrów. Dlatego te cztery typy dostają własny słownik:
// pozycja żyje od utworzenia do rozliczenia, a nie od zapytania do instalacji.
//
// Oba słowniki dzielą DOKŁADNIE JEDEN kod — `NEW`. Stan „dopiero powstała" znaczy to samo
// niezależnie od tego, czy pozycja jest switchem, czy dniem pracy ekipy, więc rozdzielanie
// go na dwa kody kazałoby każdemu odczytowi pytać o typ, zanim odpowie „czy to nowe".
// Różni się tylko etykieta, bo różni się rodzaj rzeczownika: „Nowy" materiał i sprzęt,
// „Nowe" praca, usługa, nocleg i paliwo. Pozostałe kody pozostają rozłączne — i muszą,
// bo `WbsNode.status` to jedna kolumna String bez enuma i bez whitelisty w backendzie.
// Dzięki temu oba słowniki jadą tą samą kolumną BEZ migracji bazy.

// @anchor work-status-leaf-types
export const WORK_STATUS_LEAF_TYPES = ['work', 'service', 'lodging', 'fuel'];

// @anchor uses-work-statuses
export const usesWorkStatuses = type =>
  WORK_STATUS_LEAF_TYPES.includes(String(type || '').toLowerCase().trim());

// @anchor work-status-labels
export const WORK_STATUS_LABELS = {
  NEW:        'Nowe',
  STARTED:    'Rozpoczęte',
  ON_HOLD:    'Wstrzymane',
  COMPLETED:  'Zakończone',
  UNFINISHED: 'Nieskończone',
  CANCELLED:  'Odwołane',
};

// @anchor work-status-meta
// Kolejność kluczy = kolejność opcji w KAŻDYM dropdownie. „Nowe" pierwsze, bo to stan
// startowy. Trzy kody zamykają pozycję i celowo się nie sklejają: „Zakończone" = plan
// wykonany, „Nieskończone" = przerwane przed metą, „Odwołane" = nigdy nie ruszyło.
export const WORK_STATUS_META = {
  NEW:        { label: 'Nowe',         color: 'text-slate-300' },
  STARTED:    { label: 'Rozpoczęte',   color: 'text-blue-400' },
  ON_HOLD:    { label: 'Wstrzymane',   color: 'text-amber-400' },
  COMPLETED:  { label: 'Zakończone',   color: 'text-emerald-400' },
  UNFINISHED: { label: 'Nieskończone', color: 'text-orange-400' },
  CANCELLED:  { label: 'Odwołane',     color: 'text-red-400' },
};

// @anchor work-status-label-to-code
export const WORK_STATUS_LABEL_TO_CODE = Object.fromEntries(
  Object.entries(WORK_STATUS_LABELS).map(([code, label]) => [String(label).toUpperCase(), code])
);

// @anchor default-status-new — stan startowy KAŻDEJ nowo utworzonej pozycji, bez względu
// na typ. Dopóki zamówienie nie ma zaakceptowanego baseline, wszystko w nim dopiero
// powstało i nic o przebiegu nie wiadomo. Materiałowe „Oczekuje" mówiło co innego —
// „czeka na ofertę dostawcy", czyli ktoś już ruszył — i było nieprawdą przez pierwsze
// tygodnie życia każdej pozycji.
export const DEFAULT_STATUS_NEW = 'NEW';

// @anchor default-status-for-type — jeden status startowy dla wszystkich typów liści.
// Funkcja zostaje mimo stałego wyniku, bo to udokumentowane wejście: gdyby kiedyś któryś
// typ miał startować inaczej, zmiana ma się dziać TUTAJ, a nie w każdym miejscu tworzącym
// węzeł z osobna. Tak właśnie rozjechały się listy statusów poprzednim razem.
export const defaultStatusForType = _type => DEFAULT_STATUS_NEW;

// @anchor status-meta-for-type — słownik statusów właściwy dla typu liścia. Jedno wejście
// dla komórki, filtra, sortowania i eksportu; bez niego każdy widok wybierałby mapę sam
// i pierwszy przeoczony rozjazd pokazałby „Wydane" nad noclegiem.
export const statusMetaForType = type => (usesWorkStatuses(type) ? WORK_STATUS_META : STRUCTURE_STATUS_META);

// @anchor resolve-status-code — kod statusu do POKAZANIA dla danego typu liścia.
// Pozycje sprzed rozdzielenia słowników mają w bazie kod materiałowy (PENDING, ORDERED…)
// także na pracy i paliwie. Świadomie ich NIE migrujemy: dopóki nikt nie tknie pola, liść
// tych czterech typów pokazuje „Nowe", a pierwsza ręczna zmiana utrwala kod z nowego
// słownika. Dzięki temu żaden widok ani eksport nie wypluje surowego `ORDERED` nad robocizną.
export const resolveStatusCode = (type, status) => {
  const code = normalizeStatusCode(status);
  if (!usesWorkStatuses(type)) return code;
  return WORK_STATUS_META[code] ? code : DEFAULT_STATUS_NEW;
};

// @anchor status-label-for-type
export const statusLabelForType = (type, status, fallback = '') => {
  const code = resolveStatusCode(type, status);
  const meta = statusMetaForType(type)[code];
  if (meta) return meta.label;
  return fallback || String(status || '').trim() || 'Brak';
};

// @anchor status-options-for-type — kody do wyboru w dropdownie. `MIXED` wypada, bo to
// wartość WYLICZANA dla gałęzi o mieszanych dzieciach, a nie stan, który da się pozycji
// nadać. Słownik niematerialny nie ma pustego kodu — te liście są „Nowe", nigdy „Brak".
export const statusOptionsForType = type =>
  Object.keys(statusMetaForType(type)).filter(code => code !== 'MIXED');

// ── Statusy ETAPU PLANU ──────────────────────────────────────────────────────
// W planowaniu pozycja nie jest rzeczą ani robotą — jest WIERSZEM OFERTY. Może dopiero
// powstać, pójść do klienta, zostać przyjęta albo odrzucona i na tym etap się kończy.
// „Zamówione", „Na magazynie", „Wydane", „Rozpoczęte", „Zakończone" opisują świat, który
// zaczyna się PO akceptacji — w planie nie mają czego opisywać i dlatego ich tu nie ma.
//
// Ta sama lista dla KAŻDEGO typu liścia. Rozdział na słownik materiałowy i robociznowy
// (`STRUCTURE_STATUS_META` / `WORK_STATUS_META`) dotyczy wyłącznie REALIZACJI: tam materiał
// jedzie przez magazyn, a robocizna przez postęp prac. Na etapie planu switch i dzień pracy
// ekipy są tym samym — pozycją, którą klient przyjmie albo nie.

// @anchor plan-status-meta
export const PLAN_STATUS_META = {
  NEW:       { label: 'Nowe',            color: 'text-slate-300' },
  PROPOSAL:  { label: 'Zaproponowane',   color: 'text-blue-400' },
  CONFIRMED: { label: 'Zaakceptowane',   color: 'text-emerald-400' },
  REJECTED:  { label: 'Odrzucone',       color: 'text-red-400' },
};

// @anchor plan-status-codes — kolejność opcji w dropdownie planowania: droga pozycji od
// utworzenia do decyzji klienta.
export const PLAN_STATUS_CODES = Object.keys(PLAN_STATUS_META);

// @anchor plan-status-from-any — kod planistyczny do POKAZANIA dla pozycji, która w bazie
// ma cokolwiek innego. Kolumna `WbsNode.status` jest wspólna dla obu etapów, więc w danych
// siedzą też kody realizacyjne (`ORDERED`, `IN_STOCK`, `STARTED`…) i materiałowe `PENDING`.
// Reguły:
//   pusty / PENDING / NEW      → NEW        („Oczekuje" znaczyło „czeka na ofertę dostawcy",
//                                            czyli pozycja dopiero powstała — to jest NEW)
//   PROPOSAL                   → PROPOSAL
//   REJECTED                   → REJECTED
//   wszystko pozostałe         → CONFIRMED  (skoro pozycję zamówiono, wydano albo ekipa ją
//                                            zaczęła, to klient ją wcześniej przyjął)
// Nic tu NIE JEST zapisywane do bazy — to wyłącznie odczyt. Zapis idzie kodem z tej listy.
export const planStatusFromAny = (status) => {
  const code = normalizeStatusCode(status);
  if (!code || code === 'PENDING' || code === 'NEW') return 'NEW';
  if (code === 'PROPOSAL' || code === 'REJECTED') return code;
  return 'CONFIRMED';
};

// @anchor plan-status-label
export const planStatusLabel = (status) => PLAN_STATUS_META[planStatusFromAny(status)].label;

// ── Statusy ETAPU REALIZACJI ─────────────────────────────────────────────────
// Realizacja ma DWIE niezależne osie, bo pozycja przechodzi przez dwa różne światy:
//   ZAKUP     — droga towaru albo zlecenia: zamawiamy, przyjeżdża, wydajemy, fakturujemy
//   WYKONANIE — droga roboty: ekipa zaczyna, kończy, odbiór podpisuje protokół
// Materiał i sprzęt mają OBIE naraz — kupione to jeszcze nie zamontowane. Praca własna ma
// tylko wykonanie (nie ma czego zamawiać), nocleg i paliwo tylko zakup (nie ma czego wykonywać).
//
// Osie żyją we WŁASNYCH kolumnach (`WbsNode.purchaseStatus`, `WbsNode.execStatus`), więc
// zmiana w planowaniu nie kasuje już stanu realizacji — a to była cena za jedno wspólne pole.

// @anchor purchase-status-meta
export const PURCHASE_STATUS_META = {
  TO_ORDER:  { label: 'Do zamówienia',  color: 'text-slate-300' },
  ORDERED:   { label: 'Zamówione',      color: 'text-violet-400' },
  // `PARTIALLY_DELIVERED` opisuje towar W DRODZE: część dojechała, reszta nie. Bez tego kodu
  // pozycja z trzema dostawami na pięć zamówionych sztuk stała na „Zamówione" albo skakała
  // na „Dostarczone" — i w obu przypadkach kolumna kłamała. Kod rodzi się razem z etapem 5
  // (podpowiedzi z wpisów realizacji), więc w bazie nie ma ani jednego wiersza do migracji.
  PARTIALLY_DELIVERED: { label: 'Dostawa częściowa', color: 'text-amber-400' },
  DELIVERED: { label: 'Dostarczone',    color: 'text-cyan-400' },
  ISSUED:    { label: 'Wydane',         color: 'text-emerald-400' },
  INVOICED:  { label: 'Zafakturowane',  color: 'text-teal-400' },
  CANCELLED: { label: 'Anulowane',      color: 'text-red-400' },
};

// @anchor exec-status-meta — jeden zestaw kodów, dwa zestawy etykiet. Materiał i sprzęt się
// MONTUJE, pracę i usługę WYKONUJE; ten sam kod `DONE` znaczy w obu przypadkach „zrobione",
// więc rozdzielanie go na dwa kody kazałoby każdemu odczytowi pytać o typ, zanim odpowie.
export const EXEC_STATUS_META = {
  TO_DO:       { label: 'Do wykonania', montaz: 'Do montażu',      color: 'text-slate-300' },
  IN_PROGRESS: { label: 'W toku',       montaz: 'Montaż w toku',   color: 'text-blue-400' },
  ON_HOLD:     { label: 'Wstrzymane',   montaz: 'Wstrzymany',      color: 'text-amber-400' },
  DONE:        { label: 'Wykonane',     montaz: 'Zainstalowane',   color: 'text-emerald-400' },
  HANDED_OVER: { label: 'Odebrane',     montaz: 'Odebrane',        color: 'text-lime-400' },
  // Trzy kody ZAMYKAJĄ pozycję i celowo się nie sklejają: DONE = plan wykonany,
  // UNFINISHED = przerwane przed metą i rozliczone jak jest, CANCELLED = nigdy nie ruszyło.
  // `UNFINISHED` jest też jedynym miejscem, w które ma dokąd trafić stary robociznowy kod
  // o tej samej nazwie przy migracji danych (patrz test/migracja-statusy-realizacja.sql).
  UNFINISHED:  { label: 'Niedokończone', montaz: 'Montaż niedokończony', color: 'text-orange-400' },
  CANCELLED:   { label: 'Odwołane',     montaz: 'Montaż odwołany', color: 'text-red-400' },
};

// @anchor purchase-leaf-types — liście, które mają DROGĘ TOWARU: zamawia się je, przyjeżdżają,
// wydaje się je z magazynu i fakturuje. Wyłącznie materiał i sprzęt — bo tylko tam „kupione"
// jest innym stanem niż „zużyte" i po drodze jest co śledzić.
//
// Usługa, nocleg i paliwo TEŻ się kupuje i fakturuje, a mimo to osi zakupu nie mają. Powód
// jest taki, że nad nimi ta oś nie opisywałaby niczego, czego nie widać gdzie indziej:
//   usługa            — „dostarczona" i „wykonana" to ten sam akt, więc dwie osie mówiłyby
//                       to samo dwa razy; zostaje oś WYKONANIA, a fakt zlecenia podwykonawcy
//                       widnieje w dostawcy i dokumencie na wpisie realizacji;
//   nocleg i paliwo   — czysty koszt: nie ma cyklu „zamówione → dostarczone", nikt tego nie
//                       montuje. Rozliczają się wpisami realizacji (ilość, kwota, faktura)
//                       i to jest cała ich historia — obie kolumny statusowe zostają puste.
// Wcześniej cała piątka była na tej osi i nad każdą pozycją „Paliwo" wisiało „Do zamówienia",
// czego nikt nigdy nie przestawiał, bo nie ma czego zamawiać w tankowaniu.
export const PURCHASE_LEAF_TYPES = ['material', 'equipment'];

// @anchor exec-leaf-types — liście, przy których ktoś fizycznie coś ROBI: montuje materiał
// i sprzęt albo wykonuje pracę i usługę. Nocleg i paliwo się ponosi, a nie wykonuje — one
// jako jedyne nie mają ŻADNEJ osi realizacji (patrz `purchase-leaf-types`).
export const EXEC_LEAF_TYPES = ['material', 'equipment', 'work', 'service'];

// @anchor has-purchase-axis
export const hasPurchaseAxis = type => PURCHASE_LEAF_TYPES.includes(String(type || '').toLowerCase().trim());

// @anchor has-exec-axis
export const hasExecAxis = type => EXEC_LEAF_TYPES.includes(String(type || '').toLowerCase().trim());

// @anchor uses-montage-labels — materiał i sprzęt czyta się jako montaż, nie jako robotę.
export const usesMontageLabels = type => ['material', 'equipment'].includes(String(type || '').toLowerCase().trim());

// @anchor exec-status-label — etykieta osi wykonania właściwa dla typu liścia.
export const execStatusLabel = (type, code) => {
  const meta = EXEC_STATUS_META[code];
  if (!meta) return '';
  return usesMontageLabels(type) ? meta.montaz : meta.label;
};

// @anchor realization-open-status — czy pozycja weszła już do realizacji. Otwiera ją wyłącznie
// akceptacja w planie: dopóki klient nie przyjął pozycji, nie ma czego kupować ani wykonywać.
export const isRealizationOpen = planCode => planCode === 'CONFIRMED';

// @anchor default-purchase-status / @anchor default-exec-status — stan startowy każdej osi
// w chwili, gdy pozycja wchodzi do realizacji. Zapisywany dopiero przy pierwszej zmianie:
// NULL w bazie znaczy „jeszcze nikt tej pozycji nie ruszył", a to jest inna informacja niż
// „do zamówienia" i chcemy ją odróżniać w raportach.
export const DEFAULT_PURCHASE_STATUS = 'TO_ORDER';
export const DEFAULT_EXEC_STATUS = 'TO_DO';

// ── Status gałęzi — WYLICZANY, nigdy zapisywany ──────────────────────────────
// Gałąź grupująca i przedmiot projektu (depth 0) NIE mają własnego statusu: ich stan to
// suma stanów pozycji, które pod nimi wiszą. Wcześniej dało się im ustawić status ręcznie
// i gałąź „Kamery" pokazywała „Zamówione", gdy pod nią 12 z 20 pozycji było dopiero nowych.
// Taka wartość nie opisywała niczego, a mimo to szła do eksportu i do panelu Materiały.
//
// Pozycja KOSZTOWA z dziećmi (typ material / equipment / work / service / lodging / fuel)
// ZACHOWUJE własny status: niesie własny koszt i własny wiersz oferty, więc kosztowo jest
// liściem — ta sama reguła co `leafNodesOf()` w realizationShared.js, gdzie „Avigilon +
// licencje" (equipment z dzieckiem „licencja ACC7") liczy się jako pozycja, nie jako grupa.

// @anchor node-has-own-status — czy węzeł ma WŁASNY status (dropdown), czy wyliczany z dzieci.
// `depth` liczone jak w drzewie WBS: 0 = przedmiot projektu (korzeń), 1+ = kolejne poziomy.
// `hasChildren` podaje się tylko tam, gdzie dane są PŁASKIE i węzeł nie niesie `children`
// (widok Budżet, eksporty) — domyślne `null` czyta dzieci wprost z węzła drzewa.
export const nodeHasOwnStatus = (node, depth = 1, hasChildren = null) => {
  if (depth === 0) return false;
  const type = String(node?.type || '').toLowerCase().trim();
  if (LEAF_TYPE_OPTIONS.includes(type)) return true;
  const kids = hasChildren === null ? (node?.children || []).length > 0 : !!hasChildren;
  return !kids;
};

// ── Osoba odpowiedzialna (`WbsNode.owner`) ────────────────────────────────────
// Właściciela przypisuje się WYŁĄCZNIE do pozycji, nigdy do gałęzi porządkowej ani do
// przedmiotu projektu. Reguła jest ta sama co przy statusie (`nodeHasOwnStatus`) i z tego
// samego powodu: gałąź nie wykonuje niczego sama — robią to pozycje pod nią, a nazwisko
// na nagłówku podszywało się pod odpowiedzialność, której nikt nie brał. Stare wartości na
// gałęziach ZOSTAJĄ w bazie i dalej czyta je protokół odbioru (`buildBranchOwners`) — tu
// odcinamy tylko możliwość zapisania nowych.

// @anchor node-can-have-owner — czy węzeł może mieć WŁASNĄ osobę odpowiedzialną.
// Sygnatura i semantyka jak `nodeHasOwnStatus`: `depth` 0 = przedmiot projektu, `hasChildren`
// podaje się tylko dla danych PŁASKICH (Budżet, eksporty).
export const nodeCanHaveOwner = (node, depth = 1, hasChildren = null) =>
  nodeHasOwnStatus(node, depth, hasChildren);

// @anchor logistician-role-re — rozpoznanie logistyka po polu `role` kontaktu zamówienia.
// Pole jest WOLNYM tekstem („Logistyk", „logistyka AMP", „Logistyk Airtel"), więc dopasowujemy
// rdzeń słowa bez końcówki, bez wielkości liter. Lustro `LOGISTICIAN_ROLE_RE`
// z `default-logistician.util.ts` — rozjazd znaczyłby, że front podpowiada innego logistyka,
// niż backend wstawia domyślnie.
export const LOGISTICIAN_ROLE_RE = /logisty/i;

// @anchor contact-owner-label — etykieta osoby w kolumnie „Osoba odpowiedzialna".
// `WbsNode.owner` trzyma ETYKIETĘ, nie klucz obcy, więc TA funkcja jest jedynym miejscem, gdzie
// się ona składa: gdyby domyślny logistyk składał ją inaczej niż lista wyboru, `<select>` dostałby
// wartość spoza opcji i pokazał puste pole nad zapisanym w bazie nazwiskiem.
export const contactOwnerLabel = (c) => {
  const name = [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim() || String(c?.name || '').trim() || String(c?.email || '').trim();
  if (!name) return '';
  const company = String(c?.company || '').trim();
  return company ? `${company} - ${name}` : name;
};

// @anchor default-logistician-owner — domyślna osoba odpowiedzialna za materiał i sprzęt.
// Bierzemy PIERWSZY kontakt zamówienia z rolą logistyka: to on prowadzi zakupy, więc pozycja
// zakupowa startuje na nim, a nie pusta. Brak takiego kontaktu = pusto (żadnego zgadywania
// z listy użytkowników — właściciel ma być osobą wpisaną do zamówienia, nie kimkolwiek z rolą).
export const defaultLogisticianOwner = (contacts) => {
  const hit = (contacts || []).find((c) => LOGISTICIAN_ROLE_RE.test(String(c?.role || '')));
  return hit ? contactOwnerLabel(hit) : '';
};

// ── Trzy osie, jedna agregacja ────────────────────────────────────────────────
// Gałąź opisuje ten sam zbiór pozycji na każdej z trzech osi, więc sumowanie jest jedno,
// a różni je wyłącznie to, KTÓRY kod bierzemy z liścia i JAKIM słownikiem go nazywamy.
// Rozdzielenie tego na trzy komplety funkcji skończyłoby się trzema regułami rekurencji,
// które przy pierwszej zmianie zaczęłyby dawać różne wyniki dla tego samego drzewa.

// @anchor axis-status-meta — słownik etykiet właściwy dla osi. Oś wykonania bierze etykiety
// NEUTRALNE (`label`, nie `montaz`): pod gałęzią wisi materiał obok pracy, więc „Zainstalowane"
// opisywałoby połowę zbioru, a drugiej połowie kłamało.
export const AXIS_STATUS_META = {
  plan:     PLAN_STATUS_META,
  purchase: PURCHASE_STATUS_META,
  exec:     EXEC_STATUS_META,
};

// @anchor axis-status-order — porządek osi realizacji: o ile dalej dana wartość leży na
// drodze pozycji. Służy WYŁĄCZNIE podpowiedziom (`suggestAxisStatus`), żeby fakt z wpisów
// nie cofał statusu ustawionego ręcznie: pozycja „Zafakturowana" nie ma wracać na
// „Dostarczone" tylko dlatego, że ktoś dopisał brakujący wpis dostawy.
// Kody ZAMYKAJĄCE (anulowane, niedokończone) dostają `Infinity` — po nich nie podpowiadamy
// już nic, bo zamknięcia nie unieważnia żaden wpis w dzienniku.
export const AXIS_STATUS_ORDER = {
  purchase: { TO_ORDER: 0, ORDERED: 1, PARTIALLY_DELIVERED: 2, DELIVERED: 3, ISSUED: 4, INVOICED: 5, CANCELLED: Infinity },
  // `ON_HOLD` stoi na tej samej wysokości co `IN_PROGRESS`, więc podpowiedź „W toku" nie
  // odwiesza pozycji świadomie wstrzymanej — wznowienie jest decyzją, nie skutkiem wpisu.
  exec:     { TO_DO: 0, IN_PROGRESS: 1, ON_HOLD: 1, DONE: 2, HANDED_OVER: 3, UNFINISHED: Infinity, CANCELLED: Infinity },
};

// @anchor axis-gate-of — czy oś realizacji CZEKA jeszcze na poprzedni etap. Zwraca opis
// oczekiwania albo `null`, gdy oś jest otwarta. Łańcuch jest trzyczłonowy:
//   plan → zakup → montaż
// Dopóki klient nie przyjął pozycji, nie ma czego kupować ani wykonywać (`isRealizationOpen`);
// dopóki towar nie zaczął dojeżdżać, nie ma czego montować. Bez tego świeżo dopisana pozycja
// pokazywała „Do zamówienia" i „Do montażu" obok statusu oferty „Nowe" — trzy kolumny mówiły
// o trzech różnych światach i żadna nie zdradzała, że dwie z nich są jeszcze puste.
//
// DWA istotne ograniczenia zakresu:
//
// 1. Bramka blokuje WYŁĄCZNIE etap, który jeszcze nie ruszył (oś stoi na NULL). Oś z zapisaną
//    wartością pokazujemy zawsze, nawet gdy warunek nie jest spełniony — na produkcji siedzą
//    pozycje „Nowe" z zapisanym `ORDERED` po migracji, a schowanie ich za plakietką ukryłoby
//    dokładnie ten rozjazd, który trzeba naprawić. Bramka ma nie pozwolić ZACZĄĆ etapu poza
//    kolejnością, a nie przepisywać historii.
//
// 2. Bramka „czeka na dostawę" dotyczy wyłącznie liści, które mają OBIE osie — czyli materiału
//    i sprzętu (`hasPurchaseAxis`). Tylko tam kupno i montaż to dwa różne zdarzenia, więc jedno
//    może czekać na drugie. Praca i usługa mają samą oś wykonania i nie mają na co czekać.
export const axisGateOf = (node, axis) => {
  if (axis !== 'purchase' && axis !== 'exec') return null;
  if (axis === 'purchase' && !hasPurchaseAxis(node?.type)) return null;
  if (axis === 'exec' && !hasExecAxis(node?.type)) return null;

  // Etap, który już ruszył, nie wraca za bramkę — patrz ograniczenie 1 wyżej.
  if (axis === 'purchase' ? node?.purchaseStatus : node?.execStatus) return null;

  const plan = planStatusFromAny(node?.status);
  if (plan === 'REJECTED') return {
    label: 'Oferta odrzucona',
    title: 'Klient odrzucił tę pozycję — nie ma jej czego kupować ani wykonywać. '
         + 'Status planu zmienia się w Strukturze projektu.',
  };
  if (!isRealizationOpen(plan)) return {
    label: 'Czeka na akceptację',
    title: `Pozycja ma status oferty „${PLAN_STATUS_META[plan].label}". Realizacja otwiera się `
         + 'dopiero po akceptacji („Zaakceptowane") — status planu zmienia się w Strukturze projektu.',
  };

  if (axis === 'exec' && hasPurchaseAxis(node?.type)) {
    const zakup = node?.purchaseStatus || DEFAULT_PURCHASE_STATUS;
    if (zakup === 'CANCELLED') return {
      label: 'Zakup anulowany',
      title: 'Zakup tej pozycji został anulowany — nie ma czego montować.',
    };
    if ((AXIS_STATUS_ORDER.purchase[zakup] ?? 0) < AXIS_STATUS_ORDER.purchase.PARTIALLY_DELIVERED) return {
      label: 'Czeka na dostawę',
      title: `Zakup stoi na „${PURCHASE_STATUS_META[zakup].label}". Montaż otwiera się, gdy towar `
           + 'zacznie dojeżdżać („Dostawa częściowa" albo dalej).',
    };
  }
  return null;
};

// @anchor axis-status-code-of — kod, którym liść wchodzi do sumy gałęzi na danej osi.
// `null` = liść tej osi NIE MA (praca nie ma zakupu, paliwo nie ma wykonania) i wypada
// z sumy zamiast wchodzić do niej jako „Do zamówienia" — inaczej gałąź z samą robocizną
// pokazywałaby oś zakupu, której nikt na niej nie prowadzi.
export const axisStatusCodeOf = (node, axis = 'plan') => {
  // Oś ZA BRAMKĄ nie ma jeszcze kodu — do sumy gałęzi wchodzi tak samo jak oś, której liść
  // w ogóle nie ma: nie wchodzi. Inaczej gałąź świeżych pozycji meldowałaby „Do zamówienia 12"
  // nad zbiorem, w którym nikt niczego jeszcze nie może zamówić.
  if (axisGateOf(node, axis)) return null;
  if (axis === 'purchase') return hasPurchaseAxis(node?.type) ? (node?.purchaseStatus || DEFAULT_PURCHASE_STATUS) : null;
  if (axis === 'exec')     return hasExecAxis(node?.type)     ? (node?.execStatus     || DEFAULT_EXEC_STATUS)     : null;
  // Kody planu sprowadzamy do PLANISTYCZNYCH (`planStatusFromAny`), bo `WbsNode.status` niesie
  // w starych danych też kody realizacyjne. Bez tego plakietka mówiła „Nowe 34, Oczekuje 24" —
  // dwa słowa na jeden stan — albo wyświetlała nad gałęzią „Na magazynie" z jednej pozycji,
  // która zdążyła dojechać.
  return planStatusFromAny(node?.status);
};

// @anchor collect-own-status-codes — kody statusów pozycji, z których liczy się status gałęzi.
// Rekurencja ZATRZYMUJE SIĘ na pierwszym węźle z własnym statusem: pozycja kosztowa z dziećmi
// wchodzi do sumy sama, a jej podpozycje są jej sprawą, nie sprawą gałęzi wyżej.
export const collectOwnStatusCodes = (node, depth = 0, out = [], axis = 'plan') => {
  for (const kid of (node?.children || [])) {
    if (nodeHasOwnStatus(kid, depth + 1)) {
      const code = axisStatusCodeOf(kid, axis);
      if (code) out.push(code);
    } else {
      collectOwnStatusCodes(kid, depth + 1, out, axis);
    }
  }
  return out;
};

// @anchor aggregate-branch-status — status gałęzi z sumy statusów jej pozycji, liczony na
// DRZEWIE (węzeł niesie `children`). Wariant dla płaskiej listy: `buildAggregatedStatusMap`.
// `axis` wybiera oś: `plan` (domyślnie), `purchase`, `exec`.
export const aggregateBranchStatus = (node, depth = 0, axis = 'plan') =>
  summarizeStatusCodes(collectOwnStatusCodes(node, depth, [], axis), axis);

// @anchor build-aggregated-status-map — te same wyliczone statusy gałęzi, tylko liczone na
// PŁASKIEJ liście węzłów (`/wbs-nodes/unified/:nodeId` zwraca listę, nie drzewo). Mapa trzyma
// WYŁĄCZNIE węzły bez własnego statusu, więc obecność klucza znaczy „to gałąź".
// Jedno źródło dla widoku Budżet i eksportów: bez tego tabela pokazywała status wyliczony,
// a Excel obok — starą wartość z bazy, której w drzewie już nikt nie widział.
export const buildAggregatedStatusMap = (flatItems = [], axis = 'plan') => {
  const kidsByParent = new Map();
  for (const item of flatItems) {
    const p = item?.parentId || '__root__';
    if (!kidsByParent.has(p)) kidsByParent.set(p, []);
    kidsByParent.get(p).push(item);
  }
  const hasOwn = item =>
    nodeHasOwnStatus(item, item?.parentId ? 1 : 0, (kidsByParent.get(item?.id) || []).length > 0);

  const collect = (item, out = []) => {
    for (const kid of (kidsByParent.get(item?.id) || [])) {
      if (hasOwn(kid)) {
        const code = axisStatusCodeOf(kid, axis);
        if (code) out.push(code);
      } else collect(kid, out);
    }
    return out;
  };

  const map = new Map();
  for (const item of flatItems) {
    if (hasOwn(item)) continue;
    map.set(item.id, summarizeStatusCodes(collect(item), axis));
  }
  return map;
};

// @anchor summarize-status-codes — wspólne domknięcie obu wariantów agregacji (drzewo i lista):
// jeden wspólny kod → ten kod, więcej niż jeden → `MIXED`, brak pozycji → pusty kod („Brak").
// `breakdown` niesie rozbicie do tooltipa, żeby „Mieszany" dało się rozwinąć bez wchodzenia w drzewo.
//
// Etykiety bierzemy ze słownika WYBRANEJ OSI; `STRUCTURE_STATUS_META` zostaje jako awaryjne
// źródło dla kodów spoza słownika (stare dane) oraz dla `MIXED` i pustki.
export const summarizeStatusCodes = (codes = [], axis = 'plan') => {
  const meta = AXIS_STATUS_META[axis] || PLAN_STATUS_META;
  const label = code => meta[code]?.label || STRUCTURE_STATUS_META[code]?.label || code;
  const counts = new Map();
  for (const c of codes) counts.set(c, (counts.get(c) || 0) + 1);
  const breakdown = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, count, label: label(code) }));

  if (breakdown.length === 0) return { code: '', label: 'Brak', count: 0, breakdown };
  if (breakdown.length === 1) return { ...breakdown[0], count: codes.length, breakdown };
  return { code: 'MIXED', label: STRUCTURE_STATUS_META.MIXED.label, count: codes.length, breakdown };
};

// ── Statusy realizacji z FAKTÓW ────────────────────────────────────────────
// Wpis realizacji (`LeafActual`) i podpisany protokół odbioru są zdarzeniami, które mówią coś
// o stanie pozycji. Etap 5 pozwala im ten stan PODPOWIADAĆ, ale nie przestawiać: wpis bywa
// zaliczką, a nie dostawą, i tylko człowiek wie, który to przypadek.

// @anchor suggest-axis-status — podpowiedź statusów realizacji z dziennika wpisów pozycji.
// Zwraca WYŁĄCZNIE osie, na których fakt mówi coś nowego; pusty obiekt = nie ma co podpowiadać.
// Reguły (z etapu 5):
//   0 < Σ ilości < plan   → zakup „Dostawa częściowa"
//   Σ ilości >= plan      → zakup „Dostarczone"
//   pierwszy wpis         → wykonanie „W toku"
// Podpowiedź nigdy nie COFA: porównanie przez `AXIS_STATUS_ORDER` odrzuca propozycję, która
// leży bliżej początku drogi niż wartość ustawiona ręcznie. Pozycja ROZLICZONA (`realizationClosed`)
// nie dostaje podpowiedzi w ogóle — to świadome „zamykam mimo niedowykonania", więc dopowiadanie
// jej „Dostawa częściowa" podważałoby decyzję, którą ktoś przed chwilą podjął.
// Oś ZA BRAMKĄ (`axisGateOf`) też nie dostaje podpowiedzi: łańcuch etapów jest ważniejszy niż
// fakt z dziennika. Wpis na pozycji, której klient jeszcze nie przyjął, jest sygnałem, że coś
// jest nie tak ze statusem oferty — a nie powodem, żeby po cichu otworzyć realizację.
export const suggestAxisStatus = (node, { qty = 0, plan = 0, entriesCount = 0 } = {}) => {
  const out = {};
  if (!node || node.realizationClosed) return out;

  const dalej = (axis, current, proposed) => {
    if (!proposed || proposed === current) return false;
    const order = AXIS_STATUS_ORDER[axis] || {};
    return (order[proposed] ?? 0) > (order[current] ?? 0);
  };

  if (hasPurchaseAxis(node.type) && !axisGateOf(node, 'purchase') && qty > 1e-9) {
    const current = node.purchaseStatus || DEFAULT_PURCHASE_STATUS;
    const proposed = (plan > 0 && qty >= plan - 1e-9) ? 'DELIVERED' : 'PARTIALLY_DELIVERED';
    if (dalej('purchase', current, proposed)) out.purchaseStatus = proposed;
  }

  if (hasExecAxis(node.type) && !axisGateOf(node, 'exec') && entriesCount > 0) {
    const current = node.execStatus || DEFAULT_EXEC_STATUS;
    if (dalej('exec', current, 'IN_PROGRESS')) out.execStatus = 'IN_PROGRESS';
  }

  return out;
};

// @anchor handed-over-from-protocol — „Odebrane" WYLICZONE z rejestru protokołów, nigdy
// zapisywane. `odbior` to wpis z `GET /acceptance-protocols/:nodeId/status` dla korzenia
// liścia (`wbsRootOf`); `domkniete` znaczy, że któryś protokół objął pozycję w całości.
//
// Warunek `DONE` jest tu istotny: odbiór nie może wyprzedzić wykonania. Protokół potrafi
// domknąć pozycję kwotowo, zanim ktokolwiek oznaczy ją jako zrobioną — i wtedy „Odebrane"
// nad pozycją „Do montażu" opisywałoby stan, którego nie ma.
//
// Wartość nie idzie do bazy świadomie: wycofanie protokołu (`acceptance-protocols-remove`)
// samo cofa etykietę, a zapisany `HANDED_OVER` zostałby na pozycji po skasowanym dokumencie.
export const handedOverFromProtocol = (node, odbior) =>
  hasExecAxis(node?.type) && node?.execStatus === 'DONE' && !!odbior?.domkniete;

// @anchor is-leaf-node
export const isLeafNode = node => !node || !node.children || node.children.length === 0;

// @anchor build-hierarchy
export const buildHierarchy = (flat = [], parentId = null) => {
  if (!Array.isArray(flat)) return [];
  return flat
    .filter(node => (node?.parentId ?? null) === parentId)
    .map(node => ({
      ...node,
      children: buildHierarchy(flat, node.id),
    }));
};

// @anchor flatten-hierarchy
export const flattenHierarchy = (root, depth = 0) => {
  if (!root) return [];
  const result = [{ ...root, depth }];
  if (Array.isArray(root.children)) {
    root.children.forEach(child => {
      result.push(...flattenHierarchy(child, depth + 1));
    });
  }
  return result;
};

// ── Domyślne wartości liści budżetowych ──────────────────────────────────────
// @anchor leaf-type-options
// Typy liści (bez grupującego i pustego) — kolejność = kolejność wierszy w modalu „Domyślne wartości".
export const LEAF_TYPE_OPTIONS = TYPE_OPTIONS.filter(t => t !== '' && t !== 'group');

// @anchor zero-leaf-defaults
// Wyzerowana baza wartości domyślnych każdego typu liścia. Stosowana dla NOWEGO zamówienia
// (brak wpisu w bazie) — wszystkie wartości liczbowe = 0, jednostka sensowna dla typu.
// Pola: unit, unitCost (zł), margin (%), quantity.
export const ZERO_LEAF_DEFAULTS = {
  work:      { unit: 'dni',       unitCost: 0, margin: 0, quantity: 0 },
  material:  { unit: 'sztuki',    unitCost: 0, margin: 0, quantity: 0 },
  equipment: { unit: 'sztuki',    unitCost: 0, margin: 0, quantity: 0 },
  service:   { unit: 'pakiet',    unitCost: 0, margin: 0, quantity: 0 },
  lodging:   { unit: 'sztuki',    unitCost: 0, margin: 0, quantity: 0 },
  fuel:      { unit: 'kilometry', unitCost: 0, margin: 0, quantity: 0 },
};

// @anchor merge-leaf-defaults
// Scala wartości domyślne pobrane z backendu (per zamówienie) z bazą wyzerowaną.
// Brak/uszkodzony wpis → sama baza (wyzerowana). Wynik zawsze ma komplet typów liści.
export function mergeLeafDefaults(stored) {
  const src = stored && typeof stored === 'object' ? stored : {};
  const merged = {};
  for (const t of LEAF_TYPE_OPTIONS) {
    merged[t] = { ...ZERO_LEAF_DEFAULTS[t], ...(src[t] || {}) };
  }
  return merged;
}

// @anchor get-leaf-default-from
// Wartości domyślne dla pojedynczego typu liścia z przekazanego kompletu (null gdy typ nie jest liściem).
export function getLeafDefaultFrom(defaults, type) {
  const t = String(type || '').toLowerCase();
  if (!defaults || typeof defaults !== 'object') return ZERO_LEAF_DEFAULTS[t] || null;
  return defaults[t] || ZERO_LEAF_DEFAULTS[t] || null;
}
