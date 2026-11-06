// Wspólne helpery nowego UI realizacji (MVP): krótkie nazwy, wątek pozycji, sygnały gałęzi.
// Plan: docs/REALIZACJA-MVP-PLAN.md. Źródła: Comment, WbsNode.qa, LeafActual, UserTask,
// AcceptanceProtocolItem i (etap 2) rejestr blokerów `Constraint`.
import { wbsRootOf, entryStatusOf, ENTRY_STATUS_META, fmtZl } from '../wbs/realizationShared';
import { hasPurchaseAxis, hasExecAxis } from '../wbs/wbsConstants';

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

// @anchor watek-rodzaje — rodzaje wpisów wątku pozycji: znak w kafelku, etykieta filtra, klasa koloru (realizacja.css).
export const WATEK_RODZAJE = {
    chat:  { znak: 'CZ', label: 'Czat',    cls: 'k-chat' },
    block: { znak: '!',  label: 'Blokery', cls: 'k-block' },
    qa:    { znak: 'Q',  label: 'Q&A',     cls: 'k-qa' },
    buy:   { znak: 'ZK', label: 'Zakupy',  cls: 'k-buy' },
    task:  { znak: 'ZD', label: 'Zadania', cls: 'k-task' },
    proto: { znak: 'PO', label: 'Odbiory', cls: 'k-proto' },
};

// @anchor rodzaje-blokera — `Constraint.kind`: etykieta i znak do listy blokerów.
export const RODZAJE_BLOKERA = {
    MATERIAL: { label: 'Materiał', znak: 'MAT' },
    PERMIT:   { label: 'Pozwolenie / uzgodnienie', znak: 'POZ' },
    ACCESS:   { label: 'Dostęp do obiektu', znak: 'DOS' },
    CLIENT:   { label: 'Decyzja klienta', znak: 'KLI' },
    CREW:     { label: 'Ekipa', znak: 'EKI' },
    TECH:     { label: 'Techniczny', znak: 'TEC' },
    OTHER:    { label: 'Inny', znak: '!' },
};

const CLOSED_TASK = ['DONE', 'CANCELLED'];
const osoba = (u) => u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '' : '';
export const parseQa = (qa) => {
    if (Array.isArray(qa)) return qa;
    try { const v = JSON.parse(qa || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

// @anchor zbuduj-watek — wszystkie wpisy zamówienia w jednym kształcie, przypięte do węzła WBS.
// Czat i zadania wskazują `wbsNodeId` (id wiersza albo korzeń klonu), zakupy i odbiory
// `wbsRootId` — oba klucze rozwiązuje ta sama mapa, więc wpis z innej wersji nie ginie.
// Zwraca { wpisy, wezelWpisu } — `wezelWpisu` to id węzła z bieżącej wersji (albo null).
// Blokery (`Constraint`) wchodzą jako rodzaj „block” obok dawnych pilnych wpisów czatu (URGENT).
export function zbudujWatek({ wbsNodes, comments, tasks, actuals, protocols, constraints }) {
    const klucz = new Map();
    for (const n of wbsNodes || []) {
        klucz.set(n.id, n.id);
        if (n.sourceWbsNodeId && !klucz.has(n.sourceWbsNodeId)) klucz.set(n.sourceWbsNodeId, n.id);
        const root = wbsRootOf(n);
        if (root && !klucz.has(root)) klucz.set(root, n.id);
    }
    const teraz = Date.now();
    const wpisy = [];
    // Pary Q&A, z których zrobiono otwarty bloker — w wątku zamiast „Ustaw bloker” pokazują „bloker”.
    const qaZBlokerem = new Set((constraints || [])
        .filter(k => k.status === 'OPEN' && k.sourceType === 'QA' && k.sourceId).map(k => k.sourceId));

    // @anchor watek-zadanie-blokera — zadanie blokera (`UserTask.constraintId`) nie jest osobnym wpisem:
    // siedzi przy blokerze (`w.zadanie`), a w wątku i licznikach liczy się jak bloker.
    const zadanieBlokera = new Map((tasks || []).filter(t => t.constraintId).map(t => [t.constraintId, t]));
    for (const k of constraints || []) {
        const nodeId = klucz.get(k.wbsRootId);
        if (!nodeId) continue;
        const otwarte = k.status === 'OPEN';
        const termin = k.dueAt ? new Date(k.dueAt) : null;
        wpisy.push({
            id: `k-${k.id}`, constraintId: k.id, rodzaj: 'block', nodeId,
            kiedy: k.closedAt || k.createdAt, kto: osoba(k.owner) || '', tekst: k.title,
            notatka: k.note || null, rodzajBlokera: k.kind, termin: k.dueAt, wplywDni: k.impactDays,
            ownerId: k.ownerId, otwarte, zamkniety: !otwarte,
            poTerminie: otwarte && termin && termin.getTime() < teraz,
            zPytania: k.sourceType === 'QA',
            zadanie: zadanieBlokera.get(k.id) || null,
        });
    }

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
                id: `q-${n.id}-${q.id}`, qaId: q.id, rodzaj: 'qa', nodeId: n.id, blokerem: qaZBlokerem.has(q.id),
                kiedy: q.mailReplyAt || q.mailSentAt || null, kto: q.mailSentAt ? 'pytanie do klienta' : 'pytanie',
                tekst: q.question, odpowiedz: odp || null, otwarte: !odp,
                mail: q.mailSentAt ? (q.mailReplyAt ? 'odpowiedź z maila' : 'wysłane mailem') : null,
            });
        }
    }
    for (const t of tasks || []) {
        if (t.constraintId) continue; // zadanie blokera — przy blokerze
        const nodeId = t.wbsNodeId ? klucz.get(t.wbsNodeId) : null;
        if (!nodeId) continue;
        const otwarte = !CLOSED_TASK.includes(t.status);
        const poTerminie = otwarte && t.plannedEnd && new Date(t.plannedEnd).getTime() < teraz;
        wpisy.push({
            id: `t-${t.id}`, rodzaj: 'task', zadanie: t, nodeId, kiedy: t.plannedEnd || t.createdAt,
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
// `kolizje` (z `wykryjKolizje`) liczą się na pozycji materiałowej, której dostawa koliduje.
// `ms` = zagrożony milestone (poślizg, prognoza z blokerów albo kolizja), `kms` = pozycja w kolizji
// z milestone'em bez blokera — oba idą w górę drzewa jak pozostałe sygnały.
const pusteSygnaly = () => ({ blok: 0, pyt: 0, czat: 0, zad: 0, poTerminie: 0, kol: 0, ms: 0, kms: 0 });
// @anchor sygnaly-wezlow-ms — `kolizjeMs` = [{ id, msId, blokerId }], `zagrozone` = id zagrożonych milestone'ów.
export function sygnalyWezlow(wpisy, kolizje = [], kolizjeMs = [], zagrozone = []) {
    const out = {};
    for (const k of kolizje) {
        if (k.blokerId) continue;
        (out[k.materialId] || (out[k.materialId] = pusteSygnaly())).kol++;
    }
    for (const k of kolizjeMs) {
        if (k.blokerId) continue;
        (out[k.id] || (out[k.id] = pusteSygnaly())).kms++;
    }
    for (const id of zagrozone) (out[id] || (out[id] = pusteSygnaly())).ms++;
    for (const w of wpisy) {
        const s = out[w.nodeId] || (out[w.nodeId] = pusteSygnaly());
        if (w.rodzaj === 'block' && w.otwarte) s.blok++;
        if (w.rodzaj === 'qa' && w.otwarte) s.pyt++;
        if (w.rodzaj === 'chat' || w.rodzaj === 'block') s.czat++;
        if (w.rodzaj === 'task' && w.otwarte) { s.zad++; if (w.poTerminie) s.poTerminie++; }
    }
    return out;
}

// @anchor suma-sygnalow — sygnały zbioru węzłów (poddrzewo gałęzi).
export function sumaSygnalow(ids, sygnaly) {
    const s = pusteSygnaly();
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

// @anchor dni-okna — kolejne dni okna Lookahead od dziś (północ czasu lokalnego).
export function dniOkna(n = 14, od = new Date()) {
    const start = new Date(od); start.setHours(0, 0, 0, 0);
    return Array.from({ length: n }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
}

// @anchor indeks-dnia — numer dnia w oknie (0 = dziś; ujemny = przed oknem) dla daty.
export function indeksDnia(data, start) {
    if (!data) return null;
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return Math.round((d - start) / 86400000);
}

// @anchor gotowosc-pozycji — chipy gotowości do robót: materiał, pytania, blokery.
// 'ok' gotowe · 'q' czeka · 'no' brak · 'na' nie dotyczy. `material` = pozycje materiałowe,
// od których zależy robota (sama pozycja, gdy ma oś zakupu, albo rodzeństwo w gałęzi).
const DOSTARCZONE = ['DELIVERED', 'ISSUED', 'INVOICED'];
const W_DRODZE = ['ORDERED', 'PARTIALLY_DELIVERED'];
export function gotowoscPozycji({ material = [], pytOtwarte = 0, blokOtwarte = 0 }) {
    let mat = 'na';
    if (material.length) {
        if (material.every(m => DOSTARCZONE.includes(m.purchaseStatus))) mat = 'ok';
        else if (material.every(m => DOSTARCZONE.includes(m.purchaseStatus) || W_DRODZE.includes(m.purchaseStatus))) mat = 'q';
        else mat = 'no';
    }
    return { mat, pyt: pytOtwarte ? 'q' : 'ok', blk: blokOtwarte ? 'no' : 'ok' };
}

// @anchor bufor-dostawy-dni — ile dni przed startem robót materiał ma już być na budowie.
export const BUFOR_DOSTAWY_DNI = 2;
const ZROBIONE_ROBOTY = ['DONE', 'HANDED_OVER', 'INVOICED', 'CANCELLED'];
const dzien = (d) => { const t = new Date(d); t.setHours(0, 0, 0, 0); return t; };

// @anchor wykryj-kolizje — kolizje dostaw: prognozowana dostawa (`LeafActual` FORECAST) pozycji
// z osią zakupu, która jeszcze nie dotarła, wypada później niż `BUFOR_DOSTAWY_DNI` przed startem
// robót z Gantta w tej samej gałęzi (sama pozycja też, gdy ma montaż), a roboty w dniu dostawy
// jeszcze trwają. Zwraca kolizje posortowane od najmniejszego zapasu. `blokerId` — otwarty
// `Constraint` utworzony z tej kolizji (`sourceType COLLISION`, `sourceId` = id wpisu dostawy).
export function wykryjKolizje({ liscie, actualsOf, constraints = [] }) {
    const blokerZ = new Map(constraints
        .filter(k => k.status === 'OPEN' && k.sourceType === 'COLLISION' && k.sourceId)
        .map(k => [k.sourceId, k.id]));
    const roboty = {};
    for (const l of liscie) {
        if (!l.planOd || !hasExecAxis(l.type) || ZROBIONE_ROBOTY.includes(l.execStatus)) continue;
        (roboty[l.branchId] || (roboty[l.branchId] = [])).push(l);
    }
    const out = [];
    for (const m of liscie) {
        if (!hasPurchaseAxis(m.type) || DOSTARCZONE.includes(m.purchaseStatus) || m.purchaseStatus === 'CANCELLED') continue;
        for (const e of actualsOf(m)) {
            if (entryStatusOf(e) !== 'FORECAST' || !e.entryDate) continue;
            const dost = dzien(e.entryDate);
            let najgorsza = null;
            for (const w of roboty[m.branchId] || []) {
                const start = dzien(w.planOd);
                const koniec = dzien(w.planDo);
                const zapas = Math.round((start - dost) / 86400000);
                if (zapas >= BUFOR_DOSTAWY_DNI || koniec < dost) continue;
                if (!najgorsza || zapas < najgorsza.zapas) najgorsza = { robota: w, start, zapas };
            }
            if (!najgorsza) continue;
            out.push({
                id: e.id, materialId: m.id, material: m, dostawa: dost,
                robotaId: najgorsza.robota.id, robota: najgorsza.robota, startRobot: najgorsza.start,
                zapasDni: najgorsza.zapas, blokerId: blokerZ.get(e.id) || null,
            });
        }
    }
    return out.sort((a, b) => a.zapasDni - b.zapasDni);
}
