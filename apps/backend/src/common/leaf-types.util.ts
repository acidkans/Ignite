// @anchor open-leaf-types — typy liści kosztowych, które wolno oglądać KAŻDEJ roli.
// Praca, usługa, nocleg i paliwo to koszty własne firmy: logistyk i pracownik nie mają się
// z czego dowiadywać, ile kosztuje ich robocizna. Ta sama lista co `OPEN_LEAF_TYPES`
// w `realizationShared.js` na froncie — obie muszą mówić to samo, bo front zawęża widok,
// a backend go egzekwuje.
export const OPEN_LEAF_TYPES = ['material', 'equipment'];

// @anchor is-open-leaf-type — typ liścia porównujemy po małych literach: w danych bywa
// „Material" z importu, a filtr uprawnień nie może się o to potykać.
export const isOpenLeafType = (type: unknown) => OPEN_LEAF_TYPES.includes(String(type || '').toLowerCase());

// @anchor is-manager-roles — manager i admin widzą komplet kosztów; reszta ról tylko materiał
// i sprzęt. Trzymamy to w jednym miejscu, żeby dwa endpointy realizacji nie rozjechały się
// listą ról.
export const isManagerRoles = (roles?: string[] | null) =>
    !!roles?.some((r) => ['ADMIN', 'MANAGER'].includes(r));
