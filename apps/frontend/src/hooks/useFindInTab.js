import { useCallback, useEffect, useRef, useState } from 'react';

// Litera → jedna litera: mała, bez ogonków. Długość tekstu się nie zmienia, więc pozycja
// trafienia w znormalizowanym tekście = pozycja w węźle DOM (Range może ją wskazać wprost).
const normChar = (ch) => {
    const lo = ch.toLowerCase();
    if (lo === 'ł') return 'l';
    const base = lo.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return base.length === 1 ? base : lo;
};
const norm = (s) => { let out = ''; for (let i = 0; i < s.length; i++) out += normChar(s[i]); return out; };

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'tel', 'url', 'number']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'SELECT', 'OPTION']);
const visible = (el) => !!el && el.getClientRects().length > 0;

// Trafienia w kolejności dokumentu: tekst strony (Range) oraz wartości pól (element).
function collectHits(root, q) {
    const hits = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.currentNode;
    while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            const value = tag === 'TEXTAREA' || (tag === 'INPUT' && TEXT_INPUT_TYPES.has((node.getAttribute('type') || '').toLowerCase()))
                ? node.value
                : tag === 'SELECT' ? node.selectedOptions?.[0]?.text : null;
            if (value && norm(value).includes(q) && visible(node)) hits.push({ el: node });
            if (SKIP_TAGS.has(tag)) { node = walker.nextSibling() || nextOutside(walker); continue; }
        } else if (node.nodeValue.trim() && visible(node.parentElement)) {
            const txt = norm(node.nodeValue);
            for (let at = txt.indexOf(q); at !== -1; at = txt.indexOf(q, at + q.length)) {
                const range = document.createRange();
                range.setStart(node, at);
                range.setEnd(node, at + q.length);
                hits.push({ range });
            }
        }
        node = walker.nextNode();
    }
    return hits;
}
// Przeskok za poddrzewo pominiętego elementu (np. <select> — jego <option> to nie widoczny tekst).
function nextOutside(walker) {
    while (walker.parentNode()) { const sib = walker.nextSibling(); if (sib) return sib; }
    return null;
}

const hasHighlights = () => typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined';

// @anchor use-find-in-tab — wyszukiwarka nagłówka w trybie „znajdź na stronie" dla zakładek bez
// własnego filtra (Informacje o zamówieniu / lokalizacji). Podświetla trafienia w tekście (CSS Custom
// Highlight API — bez ruszania DOM Reacta) i w wartościach pól (`data-tab-find`), przewija do
// bieżącego; `next`/`prev` = Enter / Shift+Enter. Treść doładowana później (fetch, edycja) przelicza się sama.
export function useFindInTab(rootRef, query, rootKey) {
    const q = norm((query || '').trim());
    const [state, setState] = useState({ count: 0, index: 0 });
    const hitsRef = useRef([]);
    const indexRef = useRef(0);
    const markedRef = useRef(new Set());

    const clear = useCallback(() => {
        if (hasHighlights()) { CSS.highlights.delete('tab-find'); CSS.highlights.delete('tab-find-current'); }
        markedRef.current.forEach(el => el.removeAttribute('data-tab-find'));
        markedRef.current.clear();
    }, []);

    const paint = useCallback((scroll) => {
        clear();
        const hits = hitsRef.current;
        const idx = indexRef.current;
        if (hasHighlights() && hits.length) {
            const ranges = hits.filter(h => h.range).map(h => h.range);
            if (ranges.length) CSS.highlights.set('tab-find', new Highlight(...ranges));
            if (hits[idx]?.range) {
                const cur = new Highlight(hits[idx].range);
                cur.priority = 1;
                CSS.highlights.set('tab-find-current', cur);
            }
        }
        hits.forEach((h, i) => {
            if (!h.el) return;
            h.el.setAttribute('data-tab-find', i === idx ? 'current' : 'hit');
            markedRef.current.add(h.el);
        });
        // ten sam stan → bez rerenderu (inaczej rerender → mutacja DOM → przeliczenie → pętla)
        setState(prev => (prev.count === hits.length && prev.index === idx ? prev : { count: hits.length, index: idx }));
        if (scroll && hits[idx]) {
            const target = hits[idx].el || hits[idx].range.startContainer.parentElement;
            target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, [clear]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root || !q) { hitsRef.current = []; indexRef.current = 0; clear(); setState(prev => (prev.count || prev.index ? { count: 0, index: 0 } : prev)); return undefined; }

        const run = (scroll) => {
            hitsRef.current = collectHits(root, q);
            if (scroll) indexRef.current = 0;
            else indexRef.current = Math.min(indexRef.current, Math.max(hitsRef.current.length - 1, 0));
            paint(scroll);
        };
        const first = setTimeout(() => run(true), 150);
        let later = null;
        const rerun = () => { clearTimeout(later); later = setTimeout(() => run(false), 250); };
        // Bez `attributes` — własne `data-tab-find` wywołałoby pętlę.
        const mo = new MutationObserver(rerun);
        mo.observe(root, { childList: true, subtree: true, characterData: true });
        root.addEventListener('input', rerun);
        return () => {
            clearTimeout(first); clearTimeout(later);
            mo.disconnect();
            root.removeEventListener('input', rerun);
            clear();
        };
    }, [rootRef, q, rootKey, paint, clear]);

    const step = useCallback((d) => {
        const n = hitsRef.current.length;
        if (!n) return;
        indexRef.current = (indexRef.current + d + n) % n;
        paint(true);
    }, [paint]);

    return { ...state, next: () => step(1), prev: () => step(-1) };
}
