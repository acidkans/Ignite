// Pola WPISU REALIZACJI (`LeafActual`) — zachowanie inputów wspólne dla obu zakładek
// realizacji: „Realizacja" (`RealizationTab`) i „Realizacja_new" (`RealizationNewTab`).
// Mieszkały w ciele `RealizationTab`, dopóki edytował je jeden widok. Odkąd wpisy dodaje się
// i poprawia także w nowym układzie, reguły muszą być JEDNE: „=4,3*220" ma znaczyć to samo
// w obu tabelach, tak samo Enter ma przeskakiwać do następnego pola, a wejście w pole
// zaznaczać całą treść. Druga kopia rozjechałaby się przy pierwszej poprawce.

import { parsePriceInput } from './wbsConstants';

// @anchor entry-input-class — jednolity wygląd pola wpisu w obu zakładkach.
export const ENTRY_INPUT = 'w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white outline-none focus:border-teal-500/50 placeholder-gray-700';

// @anchor realization-enter-next-field — Enter przechodzi do KOLEJNEGO okna w wierszu zakupu,
// zamiast kończyć edycję. Wiersz wypełnia się od lewej do prawej jednym ciągiem, bez sięgania
// po mysz ani Tab (Tab wychodzi poza wiersz, na przyciski i nagłówki tabeli).
// Kolejność bierzemy z DOM-u, więc idzie dokładnie za kolejnością kolumn — nie ma osobnej
// listy do utrzymania przy dodawaniu kolumny. Pola pickera dostawcy są poza tą listą
// (nie mają `data-entry-field`), bo jego lista rozwija się własną obsługą klawiatury.
// Na ostatnim polu Enter oddaje sterowanie wołającemu: formularz zapisuje wpis, wiersz
// istniejącego wpisu robi blur, czyli commit pola.
export function focusNextInRow(e, onLast) {
    const row = e.currentTarget.closest('tr');
    const fields = row ? [...row.querySelectorAll('[data-entry-field]:not([disabled])')] : [];
    const i = fields.indexOf(e.currentTarget);
    if (i >= 0 && i < fields.length - 1) {
        const next = fields[i + 1];
        next.focus();
        next.select?.();
        return;
    }
    onLast?.();
}

// @anchor realization-select-all-on-focus — wejście w pole zaznacza CAŁĄ jego treść, tak samo
// myszą jak Enterem z pola obok. Wpisy realizacji poprawia się przez nadpisanie („było 3, jest 5"),
// a nie dopisanie znaku w środku — bez tego klik stawiał kursor w miejscu trafienia i trzeba było
// najpierw ręcznie kasować starą wartość. `requestAnimationFrame`, bo klik myszą po `focus`
// ustawia własne zaznaczenie (kursor pod kursorem myszy) i skasowałby `select()` zrobiony od razu.
export const selectAllOnFocus = (e) => {
    const el = e.currentTarget;
    requestAnimationFrame(() => el.select?.());
};

// @anchor realization-entry-numeric-fields — pola wpisu niosące LICZBĘ, a nie tekst: tylko one
// liczą działania i tylko one przechodzą przez `sanitizeQtyInput`. Jedna lista dla wiersza
// zapisanego wpisu i dla formularza nowego, żeby oba traktowały „=" tak samo.
export const NUMERIC_ENTRY_FIELDS = new Set(['qty', 'unitCost']);

// @anchor realization-entry-formula — pole liczbowe wpisu przyjmuje DZIAŁANIE: „=4,3*220"
// zapisuje się jako 946. Liczy je `parsePriceInput`, czyli ta sama droga co w Budżecie
// i w panelu Materiały — ten sam wpis znaczy w całej aplikacji to samo.
// Zwracamy TEKST, bo dalej idzie tą samą trasą co zwykły wpis (porównanie ze stanem
// poprzednim, JSON do backendu). `null` = działanie jest niedokończone („=4,3*") i wołający
// ma wtedy NIE zapisywać: serwer czyta liczby `parseFloat`em, więc zapisałby ciche 0 zł.
export function resolveEntryNumber(raw) {
    const s = String(raw ?? '');
    if (!s.trimStart().startsWith('=')) return s;
    const n = parsePriceInput(s);
    return n === null ? null : String(n);
}

// @anchor realization-formula-hint — podpowiedź w dymku pola liczbowego. Bez niej nikt nie
// zgadnie, że pole liczy działania: kolumna jest wąska, a podpowiedź w placeholderze
// zasłaniałaby to, co się właśnie wpisuje.
export const FORMULA_HINT = 'Można wpisać działanie, np. =4,3*220 — zapisze się wynik';

// @anchor realization-entry-growing-fields — pole TEKSTOWE wpisu rośnie razem z treścią
// (`AutoResizeTextarea`), więc cały komentarz, producent, model, EAN, numer dokumentu i zakres
// są widoczne naraz. Kolumny są wąskie, a jednolinijkowy `input` chowa nadmiar za krawędzią:
// treść trzeba było przewijać kursorem wewnątrz pola, żeby przeczytać, co się samemu wpisało.
// Jednolinijkowe zostają wyłącznie pola o z góry znanej długości — data i liczby (ilość,
// koszt jedn.): tam nie ma czego pokazywać, a złamanie liczby na dwie linie psuje kolumnę.
export const growsWithText = (k) => k !== 'entryDate' && !NUMERIC_ENTRY_FIELDS.has(k);

