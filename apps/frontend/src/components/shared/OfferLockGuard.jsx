import { useCallback, useEffect, useReducer, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, AlertTriangle } from 'lucide-react';

// Blokada wartości OFERTOWYCH po akceptacji baseline (ProcessNode.acceptedVersionId).
// Zaakceptowana oferta jest zobowiązaniem wobec klienta — po akceptacji wolno pracować
// wyłącznie po stronie ZAKUPU (produkt/cena zakupu, dostawca, statusy). Zablokowane są
// wszystkie nośniki wartości ofertowej, niezależnie od typu liścia (material, equipment,
// work, service, fuel, lodging…): `WbsNode.unitCost`, `margin`, `discount`, `quantity`,
// „Koszt jedn. oferty" w Materiałach i strona „Wycena" splitu.
//
// Dodawanie nowych liści pozostaje dozwolone — blokada dotyczy edycji wartości, nie struktury.
//
// Manager/admin może odblokować edycję na czas sesji przez popup potwierdzenia; backend
// i tak zapisuje każdą taką zmianę w AuditLog (guard `assertOfferEditable`). Użytkownik bez
// uprawnień widzi komunikat informacyjny i nie przechodzi dalej.

// Moduł-store — handlery zapisu sięgają po ten sam modal bez przekazywania propsów.
// @anchor offer-lock-state
const _state = { accepted: false, label: '', canOverride: false, unlocked: false };
const _subs = new Set();
// @anchor offer-lock-request-fn
let _requestFn = null;

function emit() { for (const fn of _subs) fn(); }

// @anchor set-offer-lock-state
export function setOfferLockState({ accepted, label, canOverride }) {
    const next = !!accepted;
    // Zmiana zamówienia / cofnięcie akceptacji kasuje odblokowanie sesyjne — inaczej
    // zgoda wydana na jednym zamówieniu przechodziłaby po cichu na kolejne.
    if (next !== _state.accepted) _state.unlocked = false;
    _state.accepted = next;
    _state.label = label || '';
    _state.canOverride = !!canOverride;
    emit();
}

// @anchor use-offer-lock — stan blokady dla komponentów (re-render po odblokowaniu przez managera)
export function useOfferLock() {
    const [, force] = useReducer(x => x + 1, 0);
    useEffect(() => { _subs.add(force); return () => { _subs.delete(force); }; }, []);
    return {
        locked: _state.accepted && !_state.unlocked,
        accepted: _state.accepted,
        canOverride: _state.canOverride,
        versionLabel: _state.label,
    };
}

// @anchor guard-offer-edit — na początku KAŻDEGO handlera zapisującego wartość ofertową.
// true = wolno zapisać (brak akceptacji albo manager odblokował), false = anulowano/brak uprawnień.
export async function guardOfferEdit() {
    if (!_state.accepted || _state.unlocked) return true;
    if (!_requestFn) return false;   // brak zamontowanego guardu — blokuj, nie przepuszczaj
    const ok = await _requestFn();
    if (ok) { _state.unlocked = true; emit(); }
    return ok;
}

// @anchor request-offer-unlock — kliknięcie w zablokowane pole: pokaż modal, nie czekaj na wynik
export function requestOfferUnlock() { void guardOfferEdit(); }

// @anchor offer-lock-input-props — props wpinane w input niosący wartość ofertową.
// Pole zostaje widoczne i zaznaczalne, ale nie przyjmuje wpisu; kliknięcie otwiera modal.
export function offerLockInputProps(locked) {
    if (!locked) return {};
    return {
        readOnly: true,
        title: 'Wartość ofertowa zablokowana akceptacją baseline — kliknij, aby zobaczyć szczegóły',
        onMouseDown: (e) => { e.preventDefault(); requestOfferUnlock(); },
    };
}

// @anchor offer-lock-guard
export default function OfferLockGuard({ accepted, versionLabel, canOverride }) {
    const [modal, setModal] = useState(null); // { resolve } | null

    useEffect(() => {
        setOfferLockState({ accepted, label: versionLabel, canOverride });
    }, [accepted, versionLabel, canOverride]);

    // Odmontowanie panelu (wyjście z zamówienia) kasuje stan — inaczej blokada zostawałaby
    // aktywna bez modala, który mógłby ją zdjąć, i wywracała edycję w innych widokach.
    useEffect(() => () => setOfferLockState({ accepted: false, label: '', canOverride: false }), []);

    const request = useCallback(() => new Promise((resolve) => { setModal({ resolve }); }), []);
    useEffect(() => {
        _requestFn = request;
        return () => { _requestFn = null; };
    }, [request]);

    const resolve = (val) => {
        if (modal) modal.resolve(val);
        setModal(null);
    };

    if (!modal) return null;

    const label = _state.label || 'bez nazwy';

    return createPortal(
        <div
            data-guard-ignore
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => resolve(false)}
        >
            <div
                className="w-[460px] max-w-[90vw] rounded-2xl border border-amber-500/30 bg-[#0b0f17] shadow-2xl p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex-shrink-0">
                        {_state.canOverride ? <AlertTriangle size={18} className="text-amber-400" /> : <Lock size={18} className="text-amber-400" />}
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                        <h3 className="text-sm font-bold text-white">Wartości ofertowe zablokowane</h3>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            Zamówienie ma zaakceptowany baseline <span className="text-amber-300 font-semibold">„{label}"</span>.
                            Koszt jednostkowy, narzut, rabat, ilość i strona „Wycena" są zamrożone —
                            zmiany prowadź po stronie <span className="text-teal-300">Zakupu</span>.
                            Nowe pozycje możesz dodawać normalnie.
                        </p>
                        {_state.canOverride ? (
                            <p className="text-xs text-gray-500 leading-relaxed mt-1">
                                Jako manager możesz odblokować edycję do końca tej sesji — każda zmiana
                                trafi do dziennika zmian (AuditLog). Trwałe odblokowanie to cofnięcie akceptacji.
                            </p>
                        ) : (
                            <p className="text-xs text-gray-500 leading-relaxed mt-1">
                                Zmiana wartości ofertowej wymaga uprawnień managera albo cofnięcia akceptacji.
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-5">
                    <button
                        onClick={() => resolve(false)}
                        className="px-4 py-2 text-xs font-semibold rounded-lg text-gray-300 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        {_state.canOverride ? 'Anuluj' : 'Rozumiem'}
                    </button>
                    {_state.canOverride && (
                        <button
                            onClick={() => resolve(true)}
                            className="px-4 py-2 text-xs font-bold rounded-lg text-amber-950 bg-amber-400 hover:bg-amber-300 transition-colors"
                        >
                            Odblokuj i edytuj
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
