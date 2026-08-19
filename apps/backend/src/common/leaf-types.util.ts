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

// @anchor is-manager-roles — manager i admin widzą komplet kosztów; reszta ról tylko materiał
// i sprzęt. Trzymamy to w jednym miejscu, żeby dwa endpointy realizacji nie rozjechały się
// listą ról.
export const isManagerRoles = (roles?: string[] | null) =>
    !!roles?.some((r) => ['ADMIN', 'MANAGER'].includes(r));
