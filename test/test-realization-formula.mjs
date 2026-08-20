// Test pola liczbowego wpisu realizacji („karta zakupu") — koszt jedn. i ilość przyjmują
// DZIAŁANIE: „=4,3*220" ma się zapisać jako 946, a nie jako tekst.
// Pilnuje dwóch rzeczy naraz:
//   1. parser (`parsePriceInput` z wbsConstants) liczy to, co użytkownik faktycznie wpisuje,
//   2. RealizationTab NIE wysyła surowego zapisu działania do backendu — serwer czyta cenę
//      `parseFloat`em i z „=4,3*220" zrobiłby ciche 0 zł.
//
//   node test/test-realization-formula.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tabPath = path.join(root, 'apps/frontend/src/components/shared/RealizationTab.jsx');
const { parsePriceInput } = await import(
    pathToFileURL(path.join(root, 'apps/frontend/src/components/shared/wbs/wbsConstants.js')).href
);

let failed = 0;
const check = (label, cond, detail = '') => {
    console.log(`${cond ? '  OK  ' : ' BŁĄD '} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!cond) failed += 1;
};

// ── Parser działań ───────────────────────────────────────────────────────────
check('„=4.3* 220" (zrzut ze zgłoszenia) → 946', parsePriceInput('=4.3* 220') === 946, String(parsePriceInput('=4.3* 220')));
check('przecinek dziesiętny w działaniu → 946', parsePriceInput('=4,3*220') === 946, String(parsePriceInput('=4,3*220')));
check('nawiasy i dodawanie', parsePriceInput('=(120+80)*2') === 400, String(parsePriceInput('=(120+80)*2')));
check('dzielenie na sztuki', parsePriceInput('=1200/8') === 150, String(parsePriceInput('=1200/8')));
check('zwykła liczba z przecinkiem dalej działa', parsePriceInput('12,50') === 12.5, String(parsePriceInput('12,50')));
check('zero to cena, nie brak ceny', parsePriceInput('0') === 0, String(parsePriceInput('0')));
check('puste pole → null', parsePriceInput('') === null);
check('niedokończone działanie → null (wołający ma nie zapisywać)', parsePriceInput('=4,3*') === null, String(parsePriceInput('=4,3*')));

// ── Droga wartości w RealizationTab ──────────────────────────────────────────
const src = fs.readFileSync(tabPath, 'utf8');
check('pola liczbowe wpisu wymienione w jednym miejscu',
    /const NUMERIC_ENTRY_FIELDS = new Set\(\['qty', 'unitCost'\]\)/.test(src));
check('edycja zapisanego wpisu liczy działanie przed zapisem',
    /const next = NUMERIC_ENTRY_FIELDS\.has\(k\) \? resolveEntryNumber\(get\(k\)\) : get\(k\);/.test(src));
check('niedokończone działanie nie idzie do zapisu (zostaje w polu)',
    /if \(next === null\) return;/.test(src));
check('nowy wpis wysyła WYNIK działania, nie jego zapis',
    /onAdd\(\{ \.\.\.draft, qty: resolveEntryNumber\(draft\.qty\), unitCost: resolveEntryNumber\(draft\.unitCost\) \}\)/.test(src));
check('surowy draft nie trafia już prosto do onAdd', !/await onAdd\(draft\)/.test(src));
check('walidacja formularza przepuszcza działanie (nie parseFloat na surowym tekście)',
    /const qty = parsePriceInput\(draft\.qty\);/.test(src) && !/parseFloat\(String\(draft\.qty\)/.test(src));
check('podgląd „Wartość" liczy się z działania',
    /const wartosc = \(parsePriceInput\(draft\.qty\) \|\| 0\) \* \(parsePriceInput\(draft\.unitCost\) \|\| 0\);/.test(src));
check('pole liczbowe niesie podpowiedź o działaniu', /title=\{props\.sanitize \? FORMULA_HINT : undefined\}/.test(src));

console.log(failed ? `\n❌ Nieudanych testów: ${failed}` : '\n✅ Wszystkie testy przeszły');
process.exit(failed ? 1 : 0);
