import { useRef, useLayoutEffect, useCallback } from 'react';
import AutoResizeTextarea from './AutoResizeTextarea';
import { findNameSuggestion } from './wbsNameSuggest';

// @anchor wbs-name-autocomplete
// Pole nazwy węzła WBS z autouzupełnianiem w stylu Excela: po wpisaniu prefiksu,
// który pasuje do nazwy już istniejącej w drzewie, pole dopisuje resztę nazwy
// i ZAZNACZA ją. Dalsze pisanie nadpisuje zaznaczenie (podpowiedź znika sama),
// Backspace/Delete ją kasuje, Escape wraca do wpisanego prefiksu, a Enter/Tab/
// wyjście z pola po prostu ją zatwierdza — bo dopisany tekst jest już wartością pola.
//
// Podpowiadamy TYLKO gdy kursor stoi na końcu tekstu i użytkownik dopisuje (nie kasuje) —
// inaczej edycja w środku istniejącej nazwy skakałaby po polu.
export default function WbsNameAutocomplete({ value, pool, excludeId, onValueChange, onValueBlur, ...rest }) {
    const elRef = useRef(null);
    // Zaznaczenie do nałożenia po przerysowaniu: wartość idzie do stanu rodzica,
    // więc selectionRange można ustawić dopiero gdy DOM ma już pełną podpowiedź.
    const pendingRef = useRef(null);
    const deletingRef = useRef(false);

    useLayoutEffect(() => {
        const p = pendingRef.current;
        pendingRef.current = null;
        const el = elRef.current;
        if (!p || !el) return;
        if (el.value !== p.full) return; // rodzic odrzucił/zmienił wartość — nie ruszaj kursora
        el.setSelectionRange(p.start, p.full.length);
    });

    const handleKeyDown = useCallback((e) => {
        deletingRef.current = e.key === 'Backspace' || e.key === 'Delete';
        const el = elRef.current;
        // Escape cofa podpowiedź do tego, co faktycznie wpisano (reszta jest zaznaczona).
        if (e.key === 'Escape' && el && el.selectionEnd > el.selectionStart && el.selectionEnd === el.value.length) {
            e.preventDefault();
            e.stopPropagation();
            const typed = el.value.slice(0, el.selectionStart);
            pendingRef.current = null;
            onValueChange(typed);
            return;
        }
        // Strzałka w prawo / End przy zaznaczonej podpowiedzi = zatwierdź ją (jak w Excelu),
        // a NIE przeskocz do kolumny Typ — nawigacja siatki widzi kursor na końcu tekstu
        // i bez tego wyjęłaby fokus z pola przy pierwszym naciśnięciu.
        if ((e.key === 'ArrowRight' || e.key === 'End') && el && el.selectionEnd > el.selectionStart && el.selectionEnd === el.value.length) {
            e.preventDefault();
            el.setSelectionRange(el.value.length, el.value.length);
            return;
        }
        rest.onKeyDown?.(e);
    }, [onValueChange, rest]);

    const handleChange = useCallback((e) => {
        const el = e.target;
        const typed = el.value;
        const caretAtEnd = el.selectionStart === typed.length;
        const wasDeleting = deletingRef.current;
        deletingRef.current = false; // flaga zużywa się na jedną zmianę
        onValueChange(typed);
        if (wasDeleting || !caretAtEnd) return;
        const full = findNameSuggestion(pool, typed, excludeId);
        if (!full) return;
        // Zaznaczenie nakładamy OD RAZU na DOM, nie tylko po przerysowaniu: gdy podpowiedź
        // jest równa dotychczasowej wartości pola, React nie ma czego przerysować (ta sama
        // wartość stanu), useLayoutEffect nie odpala i ogon zostałby niezaznaczony.
        el.value = full;
        el.setSelectionRange(typed.length, full.length);
        pendingRef.current = { start: typed.length, full };
        onValueChange(full);
    }, [pool, excludeId, onValueChange]);

    return (
        <AutoResizeTextarea
            {...rest}
            inputRef={elRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={e => onValueBlur?.(e.target.value)}
        />
    );
}
