import { API_URL } from '../../../config';

// @anchor trainings-api — wywołanie API modułu Szkoleń z tokenem; błąd backendu wraca jako Error
// z jego komunikatem, żeby modal mógł go pokazać zamiast „Błąd 400".
export async function trainingsApi(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API_URL}/trainings${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${sessionStorage.getItem('token')}`,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || `Błąd ${res.status}`);
    return data;
}

// @anchor trainings-today — dzisiejsza data w Polsce jako RRRR-MM-DD (porównania dat bez stref).
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());

const DAY_MS = 86_400_000;
export const daysTo = (iso, today = todayIso()) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
export const fmtDay = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

// @anchor trainings-warn-days — próg „wygasa wkrótce" w widoku. Alerty e-mail mają własny,
// edytowalny próg w ustawieniach powiadomień; ten jest tylko do kolorowania macierzy.
export const WARN_DAYS = 30;

// @anchor training-status — ok / uwaga (≤ 30 dni) / zle (po terminie) / bez (bezterminowe)
export function trainingStatus(ut, today = todayIso()) {
    if (!ut?.validUntil) return 'bez';
    const d = daysTo(ut.validUntil, today);
    return d < 0 ? 'zle' : d <= WARN_DAYS ? 'uwaga' : 'ok';
}

export function opisDni(ut, today = todayIso()) {
    if (!ut?.validUntil) return 'bezterminowe';
    const d = daysTo(ut.validUntil, today);
    if (d < 0) return `wygasło ${-d} dni temu`;
    if (d === 0) return 'wygasa dziś';
    return `za ${d} dni`;
}

// @anchor training-status-style — kolory statusu daty, wspólne dla macierzy, szuflady i kart.
export const STATUS_STYLE = {
    ok: 'text-emerald-300 bg-emerald-500/10',
    uwaga: 'text-amber-300 bg-amber-500/10',
    zle: 'text-red-300 bg-red-500/10 line-through decoration-red-400/60',
    bez: 'text-gray-400 bg-white/5',
};

// @anchor add-months-iso — RRRR-MM-DD + N miesięcy, ta sama arytmetyka co backend (`addMonthsUtc`).
export function addMonthsIso(iso, months) {
    if (!iso || !months) return '';
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + Number(months));
    return d.toISOString().slice(0, 10);
}

export const fullName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || u?.email || '';
export const initials = (u) => ((u?.firstName?.[0] || '') + (u?.lastName?.[0] || '')).toUpperCase() || (u?.email?.[0] || '?').toUpperCase();

// @anchor fuzzy-match — bez polskich znaków i wielkości liter. Każde słowo zapytania musi pasować:
// najwyżej ciągły fragment (premia za początek słowa), słabiej podciąg z przerwami — ale tylko
// dla słów od 4 znaków, bo krótkie („ups") łapały przypadkowe zamówienia. Zwraca
// { score, hits } (indeksy znaków do podświetlenia) albo null.
export const normTxt = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();
export function fuzzyMatch(query, text) {
    const t = normTxt(text);
    const tokens = normTxt(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return { score: 0, hits: [] };
    let score = 0;
    const hits = new Set();
    for (const tok of tokens) {
        const idx = t.indexOf(tok);
        if (idx >= 0) {
            const naPoczatku = idx === 0 || /[^a-z0-9]/.test(t[idx - 1]);
            score += 100 + tok.length * 10 + (naPoczatku ? 40 : 0);
            for (let i = 0; i < tok.length; i++) hits.add(idx + i);
            continue;
        }
        if (tok.length < 4) return null;
        let ti = 0, przerwy = 0, poprz = -1;
        const lokalne = [];
        for (const ch of tok) {
            while (ti < t.length && t[ti] !== ch) ti++;
            if (ti >= t.length) return null;
            if (poprz >= 0 && ti !== poprz + 1) przerwy++;
            lokalne.push(ti); poprz = ti; ti++;
        }
        score += Math.max(5, 60 + tok.length * 5 - przerwy * 12);
        lokalne.forEach(i => hits.add(i));
    }
    return { score, hits: [...hits] };
}

// @anchor fuzzy-orders — zamówienia dopasowane do frazy po nazwie i obszarze, posortowane wg
// trafności; podświetlenia rozdzielone z powrotem na oba pola.
export function fuzzyOrders(orders, query) {
    const q = String(query || '').trim();
    return orders.map(o => {
        if (!q) return { o, score: 0, hitsName: [], hitsArea: [] };
        const m = fuzzyMatch(q, `${o.name} ${o.area}`);
        if (!m) return null;
        const off = o.name.length + 1;
        return { o, score: m.score, hitsName: m.hits.filter(i => i < o.name.length), hitsArea: m.hits.filter(i => i >= off).map(i => i - off) };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
}

// @anchor order-stage-labels
export const ORDER_STAGE_LABEL = { WYCENA: 'Wycena', ZAAKCEPTOWANE: 'Zaakceptowane', REALIZACJA: 'Realizacja', ROZLICZONE: 'Rozliczone' };
