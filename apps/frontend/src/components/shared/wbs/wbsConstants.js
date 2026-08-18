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
