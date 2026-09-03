// @anchor open-leaf-types — typy liści kosztowych, które wolno oglądać KAŻDEJ roli.
// Praca, usługa, nocleg i paliwo to koszty własne firmy: logistyk i pracownik nie mają się
// z czego dowiadywać, ile kosztuje ich robocizna. Ta sama lista co `OPEN_LEAF_TYPES`
// w `realizationShared.js` na froncie — obie muszą mówić to samo, bo front zawęża widok,
// a backend go egzekwuje.
export const OPEN_LEAF_TYPES = ['material', 'equipment'];

// @anchor is-open-leaf-type — typ liścia porównujemy po małych literach: w danych bywa
// „Material" z importu, a filtr uprawnień nie może się o to potykać.
export const isOpenLeafType = (type: unknown) => OPEN_LEAF_TYPES.includes(String(type || '').toLowerCase());

// @anchor all-leaf-types — komplet kosztowych typów liści; lustro `LEAF_TYPES`
// z `realizationShared.js`. Służy wyłącznie do wyliczenia `CLOSED_LEAF_TYPES` —
// dopisanie typu TUTAJ, a nie do `OPEN_LEAF_TYPES`, domyka go dla nie-managera.
export const ALL_LEAF_TYPES = ['material', 'equipment', 'work', 'service', 'lodging', 'fuel'];

// @anchor closed-leaf-types — typy liści, których nie ogląda nikt poza ADMIN/MANAGER.
// Wyliczane z różnicy, nie wpisane ręcznie: nowy typ liścia jest domyślnie ZAMKNIĘTY,
// bo pominięcie go w `OPEN_LEAF_TYPES` musi znaczyć „nie pokazuj", a nie „pokaż wszystkim".
export const CLOSED_LEAF_TYPES = ALL_LEAF_TYPES.filter((t) => !OPEN_LEAF_TYPES.includes(t));

// @anchor is-closed-leaf-type — UWAGA: to NIE jest negacja `isOpenLeafType`. Węzeł grupujący
// ma `type` puste i nie jest ani otwartym liściem, ani zamkniętym — filtr widoczności musi go
// zostawić, inaczej z drzewa zniknęłyby gałęzie razem z materiałami pod nimi.
export const isClosedLeafType = (type: unknown) => CLOSED_LEAF_TYPES.includes(String(type || '').toLowerCase());

// @anchor legacy-req-type-map — stary enum wymagań i katalogu materiałów. Dane w
// `material_requirements` są już przemigrowane na typy WBS, ale `materials` (katalog) wciąż
// trzyma mieszankę: DEVICE obok equipment, MATERIAL obok material. Mapa jest jedynym miejscem,
// gdzie te dwa światy się spotykają — kod NIGDZIE nie zapisuje już kodu legacy, tylko go czyta.
//
// CABLE i SOFTWARE nie mają odpowiednika 1:1 w typach WBS: kabel to materiał, licencja to usługa.
// Mapowanie MUSI być identyczne z `LEGACY_REQ_TYPE_MAP` w `wbsConstants.js` — rozjazd oznaczałby,
// że ta sama pozycja jest materiałem na froncie, a sprzętem w bazie.
const LEGACY_REQ_TYPE_MAP: Record<string, string> = {
    device: 'equipment',
    material: 'material',
    cable: 'material',
    software: 'service',
    service: 'service',
};

// @anchor normalize-leaf-type — sprowadza dowolny typ (legacy enum, typ WBS, byle jaka wielkość
// liter z importu) do kanonicznego typu liścia WBS. Pusty string, gdy typu nie da się rozpoznać —
// wołający decyduje, czy podstawić domyślny.
//
// Odpowiednik `wbsTypeFromAny` z `wbsConstants.js` i daje ten sam wynik dla KAŻDEGO wejścia
// poza jednym: `group`. Front normalizuje typ WĘZŁA drzewa, gdzie gałąź grupująca jest
// pełnoprawnym typem; tutaj chodzi o typ POZYCJI KOSZTOWEJ (wymaganie, produkt katalogu),
// a tam grupa nie ma sensu — katalog nie sprzedaje „grupujących". Zgodności obu funkcji
// pilnuje `test/typy-lustro.test.mjs`.
export const normalizeLeafType = (type: unknown): string => {
    const t = String(type || '').toLowerCase().trim();
    if (!t) return '';
    const mapped = LEGACY_REQ_TYPE_MAP[t] || t;
    return ALL_LEAF_TYPES.includes(mapped) ? mapped : '';
};

// @anchor default-catalog-type — typ nadawany produktowi katalogu (`Material`) i pozycji
// wyciągniętej przez AI, gdy typu nie da się rozpoznać. `equipment`, bo dokładnie to znaczyło
// dawne `DEVICE`, którym te ścieżki stemplowały każdy nowy wpis — zmiana wartości przestawiłaby
// znaczenie 87 istniejących rekordów katalogu, nie tylko domyślną etykietę nowych.
export const DEFAULT_CATALOG_TYPE = 'equipment';

// @anchor is-cost-leaf-type — czy typ węzła oznacza POZYCJĘ kosztową (a nie gałąź porządkową).
// Lustro `LEAF_TYPE_OPTIONS` z `wbsConstants.js`. Pozycja kosztowa niesie własny koszt i własny
// wiersz oferty, więc kosztowo jest liściem także wtedy, gdy ma pod sobą podpozycje.
export const isCostLeafType = (type: unknown) => ALL_LEAF_TYPES.includes(String(type || '').toLowerCase());

// @anchor backend-node-has-own-status — czy węzeł WBS ma WŁASNY status, czy wyliczany z pozycji poddrzewa.
// Odpowiednik `nodeHasOwnStatus` z `wbsConstants.js` — obie strony muszą mówić to samo, bo front
// chowa dropdown, a backend odrzuca zapis. Statusu nie mają:
//   - przedmiot projektu (`parentId === null`) — korzeń jest kontenerem na pozycje,
//   - gałąź grupująca (typ pusty lub `group`), która ma dzieci.
// Pozycja kosztowa z dziećmi status ZACHOWUJE — patrz `isCostLeafType`.
export const nodeHasOwnStatus = (node: { parentId?: string | null; type?: string | null }, childCount: number) => {
    if (!node?.parentId) return false;
    if (isCostLeafType(node.type)) return true;
    return childCount === 0;
};

// @anchor is-manager-roles — manager i admin widzą komplet kosztów; reszta ról tylko materiał
// i sprzęt. Trzymamy to w jednym miejscu, żeby dwa endpointy realizacji nie rozjechały się
// listą ról.
export const isManagerRoles = (roles?: string[] | null) =>
    !!roles?.some((r) => ['ADMIN', 'MANAGER'].includes(r));
