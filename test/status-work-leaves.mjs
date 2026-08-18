/**
 * Statusy liści niematerialnych (praca / usługa / nocleg / paliwo).
 *
 * Sprawdza SŁOWNIK — czyli to, co widzą wszystkie widoki i eksporty, bo od commita
 * rozdzielającego listy każdy z nich pyta `wbsConstants` o mapę właściwą dla typu liścia
 * zamiast trzymać własną kopię. Test celowo nie rusza bazy ani DOM-u: rozjazd, który
 * poprzednio kazał drukować surowe `EXTRA_ORDER`, zaczynał się właśnie tutaj.
 *
 * Uruchomienie (bez backendu, bez dev-serwera):
 *   node test/status-work-leaves.mjs
 */

import {
    WORK_STATUS_LABELS,
    WORK_STATUS_META,
    WORK_STATUS_LEAF_TYPES,
    STRUCTURE_STATUS_META,
    MATERIAL_STATUS_LABELS,
    usesWorkStatuses,
    defaultStatusForType,
    resolveStatusCode,
    statusLabelForType,
    statusMetaForType,
    statusOptionsForType,
    normalizeStatusCode,
    DEFAULT_STATUS_NEW,
} from '../apps/frontend/src/components/shared/wbs/wbsConstants.js';

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};
const eq = (label, got, want) => check(label, got === want, got === want ? '' : `dostałem ${JSON.stringify(got)}, chciałem ${JSON.stringify(want)}`);

// ── 1. Słownik ma dokładnie te statusy, o które chodziło ─────────────────────
console.log('1) Lista statusów');
const WANT = [
    ['NEW', 'Nowe'],
    ['STARTED', 'Rozpoczęte'],
    ['ON_HOLD', 'Wstrzymane'],
    ['COMPLETED', 'Zakończone'],
    ['UNFINISHED', 'Nieskończone'],
    ['CANCELLED', 'Odwołane'],
];
eq('sześć statusów, ani jednego więcej', Object.keys(WORK_STATUS_LABELS).length, WANT.length);
for (const [code, label] of WANT) eq(`${code} → „${label}"`, WORK_STATUS_LABELS[code], label);
check('kolejność opcji zaczyna się od „Nowe"', Object.keys(WORK_STATUS_META)[0] === 'NEW');
check('etykiety META zgodne z LABELS',
    Object.entries(WORK_STATUS_LABELS).every(([c, l]) => WORK_STATUS_META[c]?.label === l));
check('każdy status ma kolor', Object.values(WORK_STATUS_META).every(m => !!m.color));

// ── 2. Styk obu słowników ────────────────────────────────────────────────────
// `WbsNode.status` to jedna kolumna typu String bez enuma. Wspólny może być DOKŁADNIE
// jeden kod — `NEW`, bo „dopiero powstała" znaczy to samo nad switchem i nad dniem pracy.
// Każdy inny powtórzony kod znaczyłby dwie różne rzeczy zależnie od typu wiersza
// i nie dałby się odczytać z samej bazy.
console.log('\n2) Styk z listą materiałową');
const shared = Object.keys(WORK_STATUS_LABELS).filter(c => c in MATERIAL_STATUS_LABELS);
eq('jedyny wspólny kod', shared.join(','), 'NEW');
check('NEW jest w obu mapach META',
    !!STRUCTURE_STATUS_META.NEW && !!WORK_STATUS_META.NEW);
// Etykiety NEW celowo się różnią — idą za rodzajem rzeczownika, który opisują.
eq('materiał / sprzęt', MATERIAL_STATUS_LABELS.NEW, 'Nowy');
eq('materiał / sprzęt (META)', STRUCTURE_STATUS_META.NEW.label, 'Nowy');
eq('praca / usługa / nocleg / paliwo', WORK_STATUS_LABELS.NEW, 'Nowe');
const labelCollision = Object.entries(WORK_STATUS_LABELS)
    .filter(([c, l]) => c !== 'NEW' && Object.values(MATERIAL_STATUS_LABELS).includes(l));
check('poza NEW żadna etykieta nie koliduje', labelCollision.length === 0, labelCollision.map(([c]) => c).join(', '));

// ── 3. Które typy liści dostają nowy słownik ─────────────────────────────────
console.log('\n3) Typy liści');
eq('objęte typy', WORK_STATUS_LEAF_TYPES.join(','), 'work,service,lodging,fuel');
for (const t of ['work', 'service', 'lodging', 'fuel']) check(`${t} → własny słownik`, usesWorkStatuses(t));
for (const t of ['material', 'equipment', 'group', '', null, undefined]) check(`${String(t)} → słownik materiałowy`, !usesWorkStatuses(t));
check('typ z wielkiej litery też łapie', usesWorkStatuses('WORK') && usesWorkStatuses(' Fuel '));

// ── 4. Status startowy ───────────────────────────────────────────────────────
// Snapshot bez baseline = pozycje dopiero co utworzone; „Oczekuje" znaczyłoby tam
// „czeka na ofertę dostawcy", czyli że ktoś już ruszył — nieprawda przez pierwsze
// tygodnie życia KAŻDEJ pozycji, materiału i sprzętu tak samo jak pracy.
console.log('\n4) Status startowy nowego liścia');
eq('stała', DEFAULT_STATUS_NEW, 'NEW');
for (const t of ['work', 'service', 'lodging', 'fuel', 'material', 'equipment', 'group', '', null, undefined]) {
    eq(`${t || '(bez typu)'} rodzi się jako`, defaultStatusForType(t), 'NEW');
}

// ── 5. Dane sprzed rozdzielenia list ─────────────────────────────────────────
// Bazy NIE migrujemy: liść pracy z materiałowym `ORDERED` ma się POKAZAĆ jako „Nowe",
// a dopiero ręczna zmiana utrwala kod z nowego słownika.
console.log('\n5) Obcy kod na liściu niematerialnym');
for (const legacy of ['PENDING', 'ORDERED', 'IN_STOCK', 'INSTALLED', 'EXTRA_ORDER', 'MIXED', '', null, 'CO_TO_JEST']) {
    eq(`work + ${JSON.stringify(legacy)}`, resolveStatusCode('work', legacy), 'NEW');
}
eq('fuel + ORDERED → etykieta', statusLabelForType('fuel', 'ORDERED'), 'Nowe');
for (const code of Object.keys(WORK_STATUS_LABELS)) eq(`work + ${code} zostaje`, resolveStatusCode('work', code), code);
eq('material + PENDING zostaje', resolveStatusCode('material', 'PENDING'), 'PENDING');
eq('material + ORDERED zostaje', resolveStatusCode('material', 'ORDERED'), 'ORDERED');
eq('material + NEW zostaje', resolveStatusCode('material', 'NEW'), 'NEW');
eq('material + pusty zostaje pusty', resolveStatusCode('material', ''), '');
eq('material + NEW → etykieta', statusLabelForType('material', 'NEW'), 'Nowy');
eq('equipment + NEW → etykieta', statusLabelForType('equipment', 'NEW'), 'Nowy');
eq('work + NEW → etykieta', statusLabelForType('work', 'NEW'), 'Nowe');

// ── 6. Lista opcji w dropdownie ──────────────────────────────────────────────
console.log('\n6) Opcje dropdownu');
eq('praca — dokładnie sześć opcji', statusOptionsForType('work').join(','), WANT.map(([c]) => c).join(','));
check('praca — bez pustego „Brak"', !statusOptionsForType('work').includes(''));
check('praca — bez MIXED', !statusOptionsForType('work').includes('MIXED'));
check('materiał — z pustym „Brak"', statusOptionsForType('material').includes(''));
check('materiał — bez MIXED', !statusOptionsForType('material').includes('MIXED'));
check('materiał — NEW na liście', statusOptionsForType('material').includes('NEW'));
eq('materiał — NEW zaraz po „Brak"', statusOptionsForType('material').slice(0, 3).join(','), ',NEW,PENDING');
check('mapa dla pracy to WORK_STATUS_META', statusMetaForType('work') === WORK_STATUS_META);
check('mapa dla materiału to STRUCTURE_STATUS_META', statusMetaForType('material') === STRUCTURE_STATUS_META);

// ── 7. Etykieta → kod (import z arkusza) ─────────────────────────────────────
console.log('\n7) normalizeStatusCode czyta etykiety obu słowników');
for (const [code, label] of WANT) eq(`„${label}" → ${code}`, normalizeStatusCode(label), code);
eq('„Nowy" (materiał) też → NEW', normalizeStatusCode('Nowy'), 'NEW');
eq('„Zamówione" nadal → ORDERED', normalizeStatusCode('Zamówione'), 'ORDERED');
eq('„Dodatkowe zamówienie" nadal → EXTRA_ORDER', normalizeStatusCode('Dodatkowe zamówienie'), 'EXTRA_ORDER');

console.log(failures ? `\n${failures} FAIL` : '\nWszystkie testy przeszły');
process.exit(failures ? 1 : 0);
