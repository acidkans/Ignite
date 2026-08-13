import { useRef, useEffect, useLayoutEffect, useCallback } from 'react';

// Textarea rosnąca do wysokości treści — wspólna dla kolumn tekstowych WBS
// (Komentarz / Strategia w `WBSHybridTable` i Komentarz w `WbsMaterialsPanel`).
// @anchor auto-resize-textarea
export default function AutoResizeTextarea({ value, onChange, onBlur, onKeyDown, placeholder, className, style, ...rest }) {
    const ref = useRef(null);
    const adjust = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // Element niewidoczny (parent collapsed/display:none) → scrollHeight=0;
        // nie ustawiaj 0px, bo po rozwinięciu textarea ma height:0 i tekst wygląda jak „przekreślony".
        if (el.offsetParent === null && el.getClientRects().length === 0) return;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }, []);
    useLayoutEffect(() => { adjust(); }, [value, adjust]);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        // Gdy parent się rozwinie i textarea staje się widoczny, RO odpala się i wymusza przeliczenie.
        const ro = new ResizeObserver(() => adjust());
        ro.observe(el);
        return () => ro.disconnect();
    }, [adjust]);
    return (
        <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={e => { onChange(e); adjust(); }}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            onFocus={adjust}
            placeholder={placeholder}
            className={className}
            style={{ overflow: 'hidden', minHeight: '1.4em', resize: 'none', ...(style || {}) }}
            {...rest}
        />
    );
}
