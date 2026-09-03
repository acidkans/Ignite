// Lustro rozpoznania logistyka: front (`wbsConstants.js`) i backend (`default-logistician.util.ts`)
// muszą dawać IDENTYCZNĄ etykietę dla tego samego kontaktu — inaczej `<select>` w kolumnie
// „Osoba odpowiedzialna" dostaje wartość spoza opcji i pokazuje puste pole.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { defaultLogisticianOwner, contactOwnerLabel, nodeCanHaveOwner } from '../apps/frontend/src/components/shared/wbs/wbsConstants.js';

// Backend jest w TS — regułę czytamy z pliku i sprawdzamy, że mówi to samo.
const be = readFileSync('apps/backend/src/common/default-logistician.util.ts', 'utf8');
assert.ok(be.includes('/logisty/i'), 'backend musi mieć ten sam wzorzec roli co front');
assert.ok(be.includes('`${company} - ${name}`'), 'backend musi składać etykietę tym samym formatem');

const kontakty = [
    { id: '1', name: 'Anna Nowak', company: 'Airtel', role: 'Inżynier' },
    { id: '2', name: 'Jan Kowalski', company: 'Airtel', role: 'Logistyk' },
    { id: '3', name: 'Piotr Zielony', company: 'Airtel', role: 'logistyka AMP' },
];

assert.equal(defaultLogisticianOwner(kontakty), 'Airtel - Jan Kowalski', 'pierwszy logistyk wygrywa');
assert.equal(defaultLogisticianOwner([kontakty[0]]), '', 'brak logistyka = pusto');
assert.equal(defaultLogisticianOwner([]), '');
assert.equal(defaultLogisticianOwner(null), '');
assert.equal(defaultLogisticianOwner([{ name: 'Ewa Bez Firmy', role: 'LOGISTYK' }]), 'Ewa Bez Firmy', 'bez firmy = samo nazwisko');
assert.equal(contactOwnerLabel({ firstName: 'Jan', lastName: 'Kowalski', company: 'Gigatel' }), 'Gigatel - Jan Kowalski');
assert.equal(contactOwnerLabel({ email: 'x@y.pl' }), 'x@y.pl', 'bez nazwiska zostaje mail');
assert.equal(contactOwnerLabel({}), '');

// Właściciel tylko na pozycjach.
assert.equal(nodeCanHaveOwner({ type: '' }, 0), false, 'przedmiot projektu (depth 0) — nie');
assert.equal(nodeCanHaveOwner({ type: '', children: [{}] }, 1), false, 'gałąź porządkowa z dziećmi — nie');
assert.equal(nodeCanHaveOwner({ type: '', children: [] }, 1), true, 'puste bez dzieci — tak');
assert.equal(nodeCanHaveOwner({ type: 'material', children: [{}] }, 2), true, 'pozycja kosztowa z podpozycjami — tak');
assert.equal(nodeCanHaveOwner({ type: 'group', children: [{}] }, 1), false, 'grupa — nie');

console.log('OK — domyślny logistyk i zakres właściciela');
