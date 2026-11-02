// Wspólne helpery nowego UI realizacji (MVP): krótkie nazwy, wątek pozycji, sygnały gałęzi.
// Plan: docs/REALIZACJA-MVP-PLAN.md. Dane biorą się WYŁĄCZNIE z istniejących obiektów —
// MVP nie dodaje tabel (Comment, WbsNode.qa, LeafActual, UserTask, AcceptanceProtocolItem).
import { wbsRootOf, entryStatusOf, ENTRY_STATUS_META, fmtZl } from '../wbs/realizationShared';

// @anchor krotka-nazwa — skrócenie pełnej nazwy przedmiarowej, gdy pozycja nie ma `shortName`.
// Ucina na pierwszym separatorze opisu („ — ”, „, ”, „ (”, „: ”), jeśli zostaje sensowny rdzeń,
// a potem na granicy słowa. Pełna nazwa zostaje w podpowiedzi i w dokumentach.
export function krotkaNazwa(name, max = 32) {
    const full = String(name || '').trim().replace(/\s+/g, ' ');
    if (full.length <= max) return full;
    let core = full;
    for (const sep of [' — ', ' – ', ' - ', ', ', ' (', ': ']) {
        const i = core.indexOf(sep);
        if (i >= 8) core = core.slice(0, i);
    }
    if (core.length <= max) return core;
    const cut = core.slice(0, max - 1);
    const sp = cut.lastIndexOf(' ');
    return (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '') + '…';
}

// @anchor nazwa-wyswietlana — nazwa do drzewa i tabel: `shortName` → skrót → pełna (gdy `full`).
export const nazwaWyswietlana = (node, full = false) =>
    full ? (node?.name || '') : (node?.shortName || krotkaNazwa(node?.name));

// @anchor watek-rodzaje — rodzaje wpisów wątku pozycji: znak w kafelku, etykieta filtra, kolor.
export const WATEK_RODZAJE = {
    chat:  { znak: 'CZ', label: 'Czat',    cls: 'bg-sky-500/15 text-sky-300' },
    block: { znak: '!',  label: 'Blokery', cls: 'bg-red-500/15 text-red-300' },
    qa:    { znak: 'Q',  label: 'Q&A',     cls: 'bg-amber-500/15 text-amber-300' },
    buy:   { znak: 'ZK', label: 'Zakupy',  cls: 'bg-emerald-500/15 text-emerald-300' },
    task:  { znak: 'ZD', label: 'Zadania', cls: 'bg-white/10 text-gray-200' },
    proto: { znak: 'PO', label: 'Odbiory', cls: 'bg-lime-500/15 text-lime-300' },
};

const CLOSED_TASK = ['DONE', 'CANCELLED'];
const osoba = (u) => u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '' : '';
const parseQa = (qa) => {
    if (Array.isArray(qa)) return qa;
    try { const v = JSON.parse(qa || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

// @anchor zbuduj-watek — wszystkie wpisy zamówienia w jednym kształcie, przypięte do węzła WBS.
// Czat i zadania wskazują `wbsNodeId` (id wiersza albo korzeń klonu), zakupy i odbiory
// `wbsRootId` — oba klucze rozwiązuje ta sama mapa, więc wpis z innej wersji nie ginie.
// Zwraca { wpisy, wezelWpisu } — `wezelWpisu` to id węzła z bieżącej wersji (albo null).
export function zbudujWatek({ wbsNodes, comments, tasks, actuals, protocols }) {
    const klucz = new Map();
    for (const n of wbsNodes || []) {
        klucz.set(n.id, n.id);
        if (n.sourceWbsNodeId && !klucz.has(n.sourceWbsNodeId)) klucz.set(n.sourceWbsNodeId, n.id);
        const root = wbsRootOf(n);
        if (root && !klucz.has(root)) klucz.set(root, n.id);
    }
    const teraz = Date.now();
    const wpisy = [];

    for (const c of comments || []) {
        const nodeId = c.wbsNodeId ? klucz.get(c.wbsNodeId) : null;
        if (!nodeId) continue;
        wpisy.push({
            id: `c-${c.id}`, commentId: c.id, rodzaj: c.type === 'URGENT' ? 'block' : 'chat', nodeId,
            kiedy: c.createdAt, kto: osoba(c.user), tekst: c.text,
            otwarte: c.type === 'URGENT', zamkniety: c.type === 'RESOLVED',
        });
    }
    for (const n of wbsNodes || []) {
        for (const q of parseQa(n.qa)) {
            if (!String(q.question || '').trim()) continue;
            const odp = String(q.answer || '').trim();
            wpisy.push({
                id: `q-${n.id}-${q.id}`, rodzaj: 'qa', nodeId: n.id,
                kiedy: q.mailReplyAt || q.mailSentAt || null, kto: q.mailSentAt ? 'pytanie do klienta' : 'pytanie',
                tekst: q.question, odpowiedz: odp || null, otwarte: !odp,
                mail: q.mailSentAt ? (q.mailReplyAt ? 'odpowiedź z maila' : 'wysłane mailem') : null,
            });
        }
    }
    for (const t of tasks || []) {
        const nodeId = t.wbsNodeId ? klucz.get(t.wbsNodeId) : null;
        if (!nodeId) continue;
        const otwarte = !CLOSED_TASK.includes(t.status);
        const poTerminie = otwarte && t.plannedEnd && new Date(t.plannedEnd).getTime() < teraz;
        wpisy.push({
            id: `t-${t.id}`, rodzaj: 'task', nodeId, kiedy: t.plannedEnd || t.createdAt,
            kto: osoba(t.user), tekst: t.title + (poTerminie ? ' — po terminie' : ''),
            otwarte, poTerminie,
        });
    }
    for (const e of actuals || []) {
        const nodeId = klucz.get(e.wbsRootId);
        if (!nodeId) continue;
        const st = ENTRY_STATUS_META[entryStatusOf(e)]?.label || '';
        const wartosc = (Number(e.qty) || 0) * (Number(e.unitCost) || 0);
        const opis = [e.manufacturer, e.model, e.scope].filter(Boolean).join(' ');
        wpisy.push({
            id: `a-${e.id}`, rodzaj: 'buy', nodeId, kiedy: e.entryDate, kto: osoba(e.author),
            tekst: `${st}: ${e.qty} × ${fmtZl(e.unitCost)} = ${fmtZl(wartosc)} zł`
                + (opis ? ` · ${opis}` : '') + (e.docNumber ? ` · ${e.docNumber}` : '')
                + (e.supplier?.name ? ` · ${e.supplier.name}` : '') + (e.comment ? ` · ${e.comment}` : ''),
            prognoza: entryStatusOf(e) === 'FORECAST',
        });
    }
    for (const p of protocols || []) {
        for (const it of p.items || []) {
            const nodeId = klucz.get(it.wbsRootId);
            if (!nodeId) continue;
            wpisy.push({
                id: `p-${it.id}`, rodzaj: 'proto', nodeId, kiedy: p.createdAt, kto: osoba(p.author),
                tekst: `Protokół ${p.numer} (${p.data}): ${fmtZl(it.wartosc)} zł${it.pelny ? ' — pozycja odebrana w całości' : ''}`,
            });
        }
    }
    // Najnowsze na górze; wpisy bez daty (pytania przed wysyłką) na końcu.
    wpisy.sort((a, b) => (b.kiedy ? new Date(b.kiedy).getTime() : 0) - (a.kiedy ? new Date(a.kiedy).getTime() : 0));
    return wpisy;
}

// @anchor sygnaly-wezlow — liczniki sygnałów per węzeł (bez sumowania w górę drzewa).
export function sygnalyWezlow(wpisy) {
    const out = {};
    for (const w of wpisy) {
        const s = out[w.nodeId] || (out[w.nodeId] = { blok: 0, pyt: 0, czat: 0, zad: 0, poTerminie: 0 });
        if (w.rodzaj === 'block' && w.otwarte) s.blok++;
        if (w.rodzaj === 'qa' && w.otwarte) s.pyt++;
        if (w.rodzaj === 'chat' || w.rodzaj === 'block') s.czat++;
        if (w.rodzaj === 'task' && w.otwarte) { s.zad++; if (w.poTerminie) s.poTerminie++; }
    }
    return out;
}

// @anchor suma-sygnalow — sygnały zbioru węzłów (poddrzewo gałęzi).
export function sumaSygnalow(ids, sygnaly) {
    const s = { blok: 0, pyt: 0, czat: 0, zad: 0, poTerminie: 0 };
    for (const id of ids) {
        const x = sygnaly[id];
        if (!x) continue;
        for (const k of Object.keys(s)) s[k] += x[k];
    }
    return s;
}

// @anchor kiedy-tekst — data wpisu po ludzku: „dziś 9:12”, „wczoraj”, „3 dni temu”, „12.11”.
export function kiedyTekst(d) {
    if (!d) return '';
    const t = new Date(d);
    if (Number.isNaN(t.getTime())) return '';
    const dzis = new Date(); dzis.setHours(0, 0, 0, 0);
    const dzien = new Date(t); dzien.setHours(0, 0, 0, 0);
    const roznica = Math.round((dzis - dzien) / 86400000);
    if (roznica === 0) return `dziś ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
    if (roznica === 1) return 'wczoraj';
    if (roznica > 1 && roznica < 7) return `${roznica} dni temu`;
    return `${t.getDate()}.${String(t.getMonth() + 1).padStart(2, '0')}${t.getFullYear() !== dzis.getFullYear() ? '.' + t.getFullYear() : ''}`;
}
