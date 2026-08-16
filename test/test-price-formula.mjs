// Działania matematyczne w polach ceny/ilości — `parsePriceInput` + `sanitizeQtyInput`.
// Pola, które z tego korzystają: koszt jedn. propozycji (`ProposalRow`), koszt jedn. karty
// produktu, kolumna „Koszt jedn. oferty" w tabeli Materiały, ilość i koszt jedn. wpisu zakupu.
// Uruchomienie: node test/test-price-formula.mjs
import { parsePriceInput, sanitizeQtyInput, evalQtyFormula } from '../apps/frontend/src/components/shared/wbs/wbsConstants.js';

let failed = 0;
const eq = (name, got, want) => {
    const ok = Object.is(got, want);
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (oczekiwano ${JSON.stringify(want)})`}`);
};

// ── wpisywanie: sanitizeQtyInput nie może wyciąć znaków działania ──────────────
eq('sanitize przepuszcza formułę', sanitizeQtyInput('=1200*1.23'), '=1200*1.23');
eq('sanitize przepuszcza nawiasy', sanitizeQtyInput('=(100+20)/2'), '=(100+20)/2');
eq('sanitize tnie litery w formule', sanitizeQtyInput('=12*alert(1)'), '=12*(1)');
eq('sanitize tnie litery w liczbie', sanitizeQtyInput('12abc,50'), '12,50');
eq('sanitize zostawia jeden separator', sanitizeQtyInput('12,5,7'), '12,57');

// ── zapis: parsePriceInput liczy działanie albo czyta liczbę ───────────────────
eq('formuła mnożenie', parsePriceInput('=1200*1.23'), 1476);
eq('formuła dodawanie', parsePriceInput('=1200+300'), 1500);
eq('formuła nawiasy', parsePriceInput('=(100+20)/2'), 60);
eq('formuła z przecinkiem', parsePriceInput('=1200*1,23'), 1476);
eq('liczba z kropką', parsePriceInput('4190.55'), 4190.55);
eq('liczba z przecinkiem', parsePriceInput('4190,55'), 4190.55);
eq('spacje po bokach', parsePriceInput('  310  '), 310);
eq('zero zostaje zerem', parsePriceInput('0'), 0);
eq('pusty wpis → null', parsePriceInput(''), null);
eq('sam znak = → null', parsePriceInput('='), null);
eq('bełkot → null', parsePriceInput('abc'), null);
eq('dzielenie przez zero → null', parsePriceInput('=10/0'), null);
eq('null na wejściu → null', parsePriceInput(null), null);

// ── kontrakt evalQtyFormula: bez „=" to nie jest formuła ──────────────────────
eq('bez = nie jest formułą', evalQtyFormula('1200*1.23'), null);

console.log(failed === 0 ? '\nWSZYSTKIE TESTY PRZESZŁY' : `\n${failed} TESTÓW NIE PRZESZŁO`);
process.exit(failed === 0 ? 0 : 1);
