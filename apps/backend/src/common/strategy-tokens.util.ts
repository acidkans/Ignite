// Znaczniki pytań do klienta w strategii węzła WBS: `{{q:<id>}}` → para z `WbsNode.qa`.
// Lustrzane do frontendowego `strategyQuestions.js` — backend rozwiązuje je tam, gdzie
// strategia idzie do AI lub dokumentu (bez znaczników w treści dla człowieka).

const TOKEN_RE = /\{\{q:([\w-]+)\}\}/g;

// @anchor build-qa-index-from-rows
// Map id pary → { question, answer } z wierszy `WbsNode` (pole `qa` jako tekst JSON).
export function buildQaIndexFromRows(rows: Array<{ qa?: string | null }>) {
  const map = new Map<string, { question: string; answer: string }>();
  for (const r of rows || []) {
    if (!r?.qa) continue;
    try {
      const arr = JSON.parse(r.qa);
      if (!Array.isArray(arr)) continue;
      for (const p of arr) if (p?.id) map.set(String(p.id), { question: String(p.question ?? ''), answer: String(p.answer ?? '') });
    } catch { /* uszkodzony JSON — pomijamy */ }
  }
  return map;
}

// @anchor resolve-strategy-tokens
// Odpowiedź w miejscu znacznika albo „[wyjaśnić: …]”; znacznik usuniętego pytania znika.
export function resolveStrategyTokens(text: string | null | undefined, qa: Map<string, { question: string; answer: string }>) {
  if (!text) return text ?? null;
  return String(text).replace(TOKEN_RE, (_, id) => {
    const p = qa.get(id);
    if (!p) return '';
    return p.answer.trim() ? p.answer.trim() : `[wyjaśnić: ${p.question.trim()}]`;
  });
}
