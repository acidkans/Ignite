// Pytania do klienta wstawiane w strategię węzła WBS.
// Strategia trzyma znacznik `{{q:<id>}}`, który wskazuje parę z `WbsNode.qa` (tego samego węzła).
// Bez odpowiedzi znacznik to „do ustalenia z klientem”, z odpowiedzią — sama treść odpowiedzi.
// Edycja zawsze na surowym tekście; eksporty i złożenie gałęzi dostają tekst rozwiązany.

// @anchor strategy-token-re
export const STRATEGY_TOKEN_RE = /\{\{q:([\w-]+)\}\}/g;

// @anchor new-qa-id
// Krótkie id pary Q&A — stabilne po zapisie, trafia do znacznika w strategii.
export const newQaId = () => 'q' + Math.random().toString(36).slice(2, 10);

// @anchor ensure-qa-ids
// Dopisuje id parom, które go nie mają (stare dane, import). Zwraca tę samą tablicę, gdy nic nie brakuje.
export function ensureQaIds(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.some(p => !p?.id) ? arr.map(p => (p?.id ? p : { ...p, id: newQaId() })) : arr;
}

// @anchor strategy-has-tokens
export const strategyHasTokens = (text) => /\{\{q:[\w-]+\}\}/.test(String(text || ''));

// @anchor strategy-token-ids
export const strategyTokenIds = (text) => [...String(text || '').matchAll(STRATEGY_TOKEN_RE)].map(m => m[1]);

// @anchor build-qa-index
// Map id pary → { ...para, nodeId } ze wszystkich węzłów (drzewo z `children` albo płaska lista).
export function buildQaIndex(nodes) {
    const map = new Map();
    const walk = (list) => {
        for (const n of (list || [])) {
            for (const p of (Array.isArray(n?.qa) ? n.qa : [])) if (p?.id) map.set(p.id, { ...p, nodeId: n.id });
            if (n?.children?.length) walk(n.children);
        }
    };
    walk(Array.isArray(nodes) ? nodes : [nodes]);
    return map;
}

const isAnswered = (p) => !!String(p?.answer || '').trim();

// @anchor resolve-strategy-text
// Tekst do eksportu / złożenia gałęzi: odpowiedź w miejscu znacznika albo „[do ustalenia z klientem: …]”.
// Znacznik usuniętego pytania znika.
export function resolveStrategyText(text, qaIndex) {
    return String(text || '').replace(STRATEGY_TOKEN_RE, (_, id) => {
        const p = qaIndex?.get(id);
        if (!p) return '';
        return isAnswered(p) ? String(p.answer).trim() : `[do ustalenia z klientem: ${String(p.question || '').trim()}]`;
    });
}

// @anchor pending-strategy-questions
// Pytania ze strategii, które czekają na odpowiedź (do odznaki „czeka na N odp.”).
export function pendingStrategyQuestions(text, qaIndex) {
    return strategyTokenIds(text).map(id => qaIndex?.get(id)).filter(p => p && !isAnswered(p));
}

// @anchor split-strategy-tokens
// Tekst pocięty na kawałki do renderu w UI: { text } albo { qa, id } (qa = null, gdy pytanie usunięto).
export function splitStrategyTokens(text, qaIndex) {
    const out = [];
    let last = 0;
    const s = String(text || '');
    for (const m of s.matchAll(STRATEGY_TOKEN_RE)) {
        if (m.index > last) out.push({ text: s.slice(last, m.index) });
        out.push({ id: m[1], qa: qaIndex?.get(m[1]) || null });
        last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ text: s.slice(last) });
    return out;
}
