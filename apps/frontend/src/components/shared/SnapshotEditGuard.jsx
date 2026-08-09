import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';

// Guard edycji nieaktywnego snapszota (ProjectVersion.isActive === false).
// Aktywny snapszot edytuje się bez ostrzeżenia; przy próbie edycji nieaktywnego
// pokazuje popup potwierdzenia — po potwierdzeniu edycja jest przepuszczana.
// Pola (input/textarea/select/contenteditable) są łapane globalnie w fazie capture
// na kontenerze treści; mutacje przyciskowe (dodaj/usuń/przypisz/import) wołają
// `guardSnapshotEdit()` na początku handlera.

// Moduł-store — pozwala handlerom przyciskowym sięgnąć po ten sam modal bez propsów.
// @anchor snapshot-guard-state
const _state = { inactive: false, label: '' };
// @anchor snapshot-guard-confirm-fn
let _confirmFn = null;

// @anchor set-snapshot-guard-state
export function setSnapshotGuardState(inactive, label) {
    _state.inactive = !!inactive;
    _state.label = label || '';
}

// Wołane na początku handlerów mutacji przyciskowych. Zwraca true gdy wolno edytować
// (snapszot aktywny albo user potwierdził), false gdy user anulował.
// @anchor guard-snapshot-edit
export async function guardSnapshotEdit() {
    if (!_state.inactive) return true;
    if (!_confirmFn) return true;
    return _confirmFn(_state.label);
}

// @anchor is-editable-target
function isEditableTarget(t) {
    if (!t || t.nodeType !== 1) return false;
    if (t.closest('[data-guard-ignore]')) return false;
    if (t.disabled || t.readOnly) return false;
    const tag = t.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
        const type = (t.getAttribute('type') || 'text').toLowerCase();
        if (['search', 'submit', 'button', 'reset', 'file', 'range', 'color', 'hidden'].includes(type)) return false;
        return true;
    }
    if (t.isContentEditable) return true;
    return false;
}

// @anchor snapshot-edit-guard
export default function SnapshotEditGuard({ inactive, versionLabel, containerRef }) {
    const [modal, setModal] = useState(null); // { resolve } | null
    const bypassRef = useRef(null);
    const inactiveRef = useRef(inactive);
    inactiveRef.current = inactive;

    // @anchor snapshot-guard-request-confirm
    const requestConfirm = useCallback(() => new Promise((resolve) => {
        setModal({ resolve });
    }), []);

    // Rejestruj stan i confirm w module-store (dla guardSnapshotEdit z handlerów).
    useEffect(() => {
        setSnapshotGuardState(inactive, versionLabel);
    }, [inactive, versionLabel]);

    useEffect(() => {
        _confirmFn = () => requestConfirm();
        return () => { _confirmFn = null; };
    }, [requestConfirm]);

    // Capture-guard pól edytowalnych na kontenerze treści.
    useEffect(() => {
        const el = containerRef?.current;
        if (!el) return;

        const onFocusIn = (e) => {
            if (!inactiveRef.current) return;
            const t = e.target;
            if (!isEditableTarget(t)) return;
            const type = t.tagName === 'INPUT' ? (t.getAttribute('type') || 'text').toLowerCase() : '';
            if (type === 'checkbox' || type === 'radio') return; // toggle łapany w onClick
            if (bypassRef.current === t) { bypassRef.current = null; return; }
            t.blur();
            requestConfirm().then((ok) => {
                if (ok) { bypassRef.current = t; setTimeout(() => t.focus(), 0); }
            });
        };

        const onClick = (e) => {
            if (!inactiveRef.current) return;
            const t = e.target;
            if (!isEditableTarget(t)) return;
            const type = t.tagName === 'INPUT' ? (t.getAttribute('type') || 'text').toLowerCase() : '';
            if (type !== 'checkbox' && type !== 'radio') return;
            if (bypassRef.current === t) { bypassRef.current = null; return; }
            e.preventDefault();
            e.stopPropagation();
            requestConfirm().then((ok) => {
                if (ok) { bypassRef.current = t; t.click(); }
            });
        };

        el.addEventListener('focusin', onFocusIn, true);
        el.addEventListener('click', onClick, true);
        return () => {
            el.removeEventListener('focusin', onFocusIn, true);
            el.removeEventListener('click', onClick, true);
        };
    }, [containerRef, requestConfirm]);

    // @anchor snapshot-guard-resolve
    const resolve = (val) => {
        if (modal) modal.resolve(val);
        setModal(null);
    };

    if (!modal) return null;

    return (
        <div
            data-guard-ignore
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => resolve(false)}
        >
            <div
                className="w-[420px] max-w-[90vw] rounded-2xl border border-amber-500/30 bg-[#0b0f17] shadow-2xl p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex-shrink-0">
                        <AlertTriangle size={18} className="text-amber-400" />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                        <h3 className="text-sm font-bold text-white">Edycja nieaktywnego snapszotu</h3>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            Edytujesz snapszot <span className="text-amber-300 font-semibold">„{_state.label || 'bez nazwy'}"</span>,
                            który <span className="text-amber-300">nie jest aktywny</span>. Zmiany zapiszą się do tej wersji, nie do aktywnej.
                            Kontynuować?
                        </p>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-5">
                    <button
                        onClick={() => resolve(false)}
                        className="px-4 py-2 text-xs font-semibold rounded-lg text-gray-300 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={() => resolve(true)}
                        className="px-4 py-2 text-xs font-bold rounded-lg text-amber-950 bg-amber-400 hover:bg-amber-300 transition-colors"
                    >
                        Edytuj mimo to
                    </button>
                </div>
            </div>
        </div>
    );
}
