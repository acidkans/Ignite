// Test logiki podpowiadania nazw liści WBS na PRAWDZIWYCH nazwach z bazy dev.
// Dane: test/wbs-names-sample.txt (id|nazwa, jeden projekt, 855 węzłów).
// Uruchomienie:  node test/test-name-autocomplete.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildNameSuggestionPool, findNameSuggestion, normalizeNameKey, MIN_PREFIX } from '../apps/frontend/src/components/shared/wbs/wbsNameSuggest.js';

const here = dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(join(here, 'wbs-names-sample.txt'), 'utf8')
    .split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => { const i = l.indexOf('|'); return { id: l.slice(0, i), name: l.slice(i + 1) }; });

const pool = buildNameSuggestionPool(rows);
let failed = 0;
const check = (label, got, want) => {
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
};

console.log(`Węzłów: ${rows.length}, unikalnych nazw w puli: ${pool.length}`);
console.log(`Najczęstsze: ${pool.slice(0, 5).map(p => `${p.name} (×${p.ids.length})`).join(', ')}\n`);

// 1. Prefiks trafia w istniejącą nazwę → dopisanie ogona.
const target = pool.find(p => p.name.length > 12 && p.ids.length > 1) || pool[0];
const prefix = target.name.slice(0, 6);
check('prefiks istniejącej nazwy dopisuje ogon', findNameSuggestion(pool, prefix), target.name);

// 2. Wielkość liter wpisanego prefiksu zostaje nietknięta, ogon bierze się ze wzorca.
const mixed = prefix.toUpperCase();
const s2 = findNameSuggestion(pool, mixed);
check('prefiks pisany inaczej nie jest nadpisywany', s2 && s2.slice(0, mixed.length), mixed);
check('...a ogon pochodzi ze wzorca', s2 && s2.slice(mixed.length), target.name.slice(prefix.length));

// 3. Poniżej progu nie podpowiadamy.
check(`prefiks krótszy niż ${MIN_PREFIX} znaków`, findNameSuggestion(pool, target.name.slice(0, MIN_PREFIX - 1)), null);

// 4. Pełna nazwa = nie ma czego dopisywać.
check('pełna nazwa nie generuje podpowiedzi', findNameSuggestion(pool, target.name), null);

// 5. Nazwa unikalna dla edytowanego węzła nie podpowiada sama sobie.
// Prefiks musi być na tyle długi, żeby nie trafiał w ŻADNĄ inną nazwę — inaczej
// (poprawnie) podpowie się ta druga i test mierzyłby co innego, niż deklaruje.
const solo = pool.find(p => p.ids.length === 1 && p.name.length > 10
    && !pool.some(o => o !== p && normalizeNameKey(o.name).startsWith(normalizeNameKey(p.name.slice(0, -2)))));
const soloPrefix = solo.name.slice(0, -2);
check('węzeł nie dostaje własnej nazwy', findNameSuggestion(pool, soloPrefix, solo.ids[0]), null);
check('...ale inny węzeł już tak', findNameSuggestion(pool, soloPrefix, 'inny-id'), solo.name);

// 6. Nadmiarowe spacje w środku nie psują dopasowania.
const spaced = target.name.slice(0, 6).replace(/ /g, '  ');
if (spaced !== target.name.slice(0, 6)) {
    check('podwójna spacja w prefiksie nadal trafia', typeof findNameSuggestion(pool, spaced), 'string');
}

// 7. Nieistniejący prefiks → null.
check('nieznany prefiks', findNameSuggestion(pool, 'zzzqqq nieistniejaca pozycja'), null);

// 8. Wydajność: 855 węzłów, 100 zapytań.
const t0 = Date.now();
for (let i = 0; i < 100; i++) findNameSuggestion(pool, rows[i % rows.length].name.slice(0, 5));
console.log(`\n100 lookupów: ${Date.now() - t0} ms`);

console.log(failed ? `\n${failed} TESTÓW NIE PRZESZŁO` : '\nWszystkie testy OK');
process.exit(failed ? 1 : 0);
