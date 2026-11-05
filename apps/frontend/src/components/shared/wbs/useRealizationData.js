// @anchor use-realization-data — dane i zapisy realizacji jednego zamówienia: drzewo WBS wersji planu,
// karty produktowe, wpisy `LeafActual`, lista osób odpowiedzialnych i wszystkie mutacje (osie,
// komentarz, osoba, wpisy, „rozliczone"). Wspólne dla zakładki „Realizacja" (`RealizationNewTab`)
// i szuflady realizacji w WBS (`WbsRealizationDrawer`) — reguła „cofnięcie zakupu cofa wykonanie"
// i liczby pozycji nie mogą żyć w dwóch kopiach.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { API_URL } from '../../../config';
import { AXIS_STATUS_ORDER, hasPurchaseAxis, hasExecAxis, buildOwnerOptions, applyGroupMultipliers, buildHierarchy } from './wbsConstants';
import { ganttDatesByNode } from '../harmonogram/harmonogramCzas';
import {
    authHeaders, flattenWbsNodes, buildCardMap, wbsRootOf, realizationOf, planValueOf, markOutOfBaseline, ENTRY_STATUS,
} from './realizationShared';
import { NEW_TEXT_FILTER_COLS, filterValuesOf, filterTextOf, hasColFilter } from '../RealizationNewTab';

// Rodzaj gramatyczny się różni — zakup jest męski, wykonanie nijakie — więc etykieta ma
// osobny helper. To samo rozróżnienie co w `RealizationTab`, żeby nad pozycją typu praca
// nie stanęło „nowy wykonanie".
const entryNoun = (type) => (type === 'work' || type === 'service' ? 'wykonanie' : 'zakup');

export function useRealizationData({ nodeId, versionId, acceptedAt = null, isManagerOrAdmin = false }) {
    const token = sessionStorage.getItem('token');
    const [loading, setLoading] = useState(true);
    const [wbsNodes, setWbsNodes] = useState([]);
    const [cards, setCards] = useState({});
    const [actuals, setActuals] = useState([]);
    const [ownerUsers, setOwnerUsers] = useState([]);
    const [ownerContacts, setOwnerContacts] = useState([]);

    // @anchor realization-new-owner-options — dwa źródła listy osób, te same co w Strukturze
    // projektu: konta użytkowników (`/users` — dla nie-managera zwraca wyłącznie jego samego,
    // bez 403) i kontakty ZAMÓWIENIA (`/order-requirements/:nodeId`). Uprawnienia węzła
    // (`/process-tree/:id/permissions`) czyta tylko manager; logistykowi wracają stamtąd 403,
    // więc wynik jest opcjonalny i jego brak nie psuje listy — do wyboru zostają kontakty
    // zamówienia i osoby już przypisane na pozycjach.

    useEffect(() => {
        if (!nodeId) { setOwnerUsers([]); setOwnerContacts([]); return; }
        let anulowane = false;
        const headers = { Authorization: `Bearer ${token}` };
        const pobierz = async (url) => {
            try {
                const res = await fetch(url, { headers });
                return res.ok ? await res.json() : null;
            } catch { return null; }
        };
        (async () => {
            const [zespol, zamowienie] = await Promise.all([
                pobierz(`${API_URL}/process-tree/${nodeId}/team`),
                pobierz(`${API_URL}/order-requirements/${nodeId}`),
            ]);
            if (anulowane) return;
            // Właściciel pozycji = członek zespołu zamówienia (jedyne źródło widoczności zamówienia).
            setOwnerUsers(Array.isArray(zespol?.members) ? zespol.members : []);
            // `clientContacts` bywa stringiem JSON albo tablicą — ten sam rozbiór co w
            // `UnifiedWbsPanel.fetchStrategy`, bo obie listy muszą składać te same etykiety.
            let kontakty = [];
            try {
                const raw = typeof zamowienie?.clientContacts === 'string'
                    ? JSON.parse(zamowienie.clientContacts || '[]')
                    : (zamowienie?.clientContacts || []);
                kontakty = (Array.isArray(raw) ? raw : []).map((c, i) => ({
                    id: c?.id || `kontakt-${i}`,
                    firstName: String(c?.name || '').trim(),
                    lastName: '',
                    name: String(c?.name || '').trim(),
                    company: c?.company || '',
                    email: c?.email || '',
                    role: c?.role || '',
                })).filter(c => c.name || c.email);
            } catch { kontakty = []; }
            setOwnerContacts(kontakty);
        })();
        return () => { anulowane = true; };
    }, [nodeId, token, isManagerOrAdmin]);

    // ─ Pobieranie danych — te same trzy endpointy co `RealizationTab` ────────
    const fetchAll = useCallback(async () => {
        if (!nodeId) return;
        setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const q = versionId ? `?versionId=${versionId}` : '';
            const [wbsRes, reqRes, actRes, orderRes] = await Promise.all([
                fetch(`${API_URL}/wbs-nodes/unified/${nodeId}${q}`, { headers }),
                fetch(`${API_URL}/material-requirements/node/${nodeId}${q}`, { headers }),
                fetch(`${API_URL}/leaf-actuals/order/${nodeId}`, { headers }),
                fetch(`${API_URL}/order-requirements/${nodeId}${q}`, { headers }),
            ]);
            const items = wbsRes.ok ? ((await wbsRes.json()).items || []) : [];
            // @anchor realization-plan-od-do — `planOd`/`planDo` (do = ostatni dzień) liczone jak w Gantcie,
            // ze startem projektu tej samej wersji (`OrderRequirements.projectStart`).
            let projectStart = null;
            try { const t = orderRes.ok ? await orderRes.text() : ''; projectStart = t ? JSON.parse(t).projectStart : null; } catch { /* brak startu = dziś, jak Gantt */ }
            const daty = ganttDatesByNode(buildHierarchy(flattenWbsNodes(items)), projectStart);
            // Pakiety (gałęzie grupujące z ilością) rozwinięte: ilość planu = własna × pakiety.
            const flat = applyGroupMultipliers(flattenWbsNodes(items))
                .map(n => (daty[n.id] ? { ...n, planOd: daty[n.id].od, planDo: daty[n.id].do } : n));
            setWbsNodes(markOutOfBaseline(flat, acceptedAt));
            setCards(reqRes.ok ? buildCardMap(flat, await reqRes.json()) : {});
            setActuals(actRes.ok ? await actRes.json() : []);
        } catch (e) {
            console.error('[RealizationNewTab] fetchAll error:', e);
        } finally {
            setLoading(false);
        }
    }, [nodeId, versionId, token, acceptedAt]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ─ Mutacje ───────────────────────────────────────────────────────────────
    // Te same endpointy co w `RealizationTab`: `PATCH /wbs-nodes/:id`, `POST|PATCH|DELETE
    // /leaf-actuals`, `PATCH /leaf-actuals/close/:id`. Logika siedzi w ciele komponentu po obu
    // stronach, więc na razie istnieje w dwóch kopiach — gdy nowy układ zostanie przyjęty,
    // obie mają zejść do wspólnego hooka, żeby reguła cofania osi nie żyła w dwóch miejscach.

    // @anchor realization-new-fetch-actuals — przeładowanie SAMYCH wpisów po zapisie. Drzewo
    // WBS i karty się przy tym nie ruszają, więc rozwinięcia i wybór pozycji zostają na miejscu.
    const fetchActuals = useCallback(async () => {
        if (!nodeId) return;
        try {
            const res = await fetch(`${API_URL}/leaf-actuals/order/${nodeId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setActuals(await res.json());
        } catch (e) {
            console.error('[RealizationNewTab] fetchActuals error:', e);
        }
    }, [nodeId, token]);

    // @anchor realization-new-fetch-cards — przeładowanie SAMYCH kart produktowych. Woła je
    // kafel zdjęcia w karcie pozycji po wgraniu obrazka; drzewo WBS i wpisy zostają nietknięte,
    // więc rozwinięcia, wybór pozycji i pozycja przewijania nie skaczą.
    const fetchCards = useCallback(async () => {
        if (!nodeId) return;
        try {
            const q = versionId ? `?versionId=${versionId}` : '';
            const res = await fetch(`${API_URL}/material-requirements/node/${nodeId}${q}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setCards(buildCardMap(wbsNodes, await res.json()));
        } catch (e) {
            console.error('[RealizationNewTab] fetchCards error:', e);
        }
    }, [nodeId, versionId, token, wbsNodes]);

    // @anchor realization-save-plan-dates — przesunięcie paska robót z Lookahead: zapis do
    // `WbsNode.ganttStart/ganttEnd` (te same pola co Gantt, koniec wyłączny = dzień po ostatnim),
    // więc oba widoki planują na jednym źródle. Ilość pozycji się nie zmienia — plan po baseline.
    const savePlanDates = useCallback(async (wbsNodeId, od, doDnia) => {
        const start = new Date(od); start.setHours(0, 0, 0, 0);
        const ost = new Date(doDnia); ost.setHours(0, 0, 0, 0);
        if (ost < start) ost.setTime(start.getTime());
        const koniec = new Date(ost); koniec.setDate(koniec.getDate() + 1);
        let poprzednie = null;
        setWbsNodes(prev => prev.map(n => {
            if (n.id !== wbsNodeId) return n;
            poprzednie = n;
            return { ...n, planOd: start, planDo: ost, ganttStart: start.toISOString(), ganttEnd: koniec.toISOString() };
        }));
        try {
            const res = await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
                method: 'PATCH', headers: authHeaders(),
                body: JSON.stringify({ ganttStart: start.toISOString(), ganttEnd: koniec.toISOString() }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            if (poprzednie) setWbsNodes(prev => prev.map(n => (n.id === wbsNodeId ? poprzednie : n)));
            throw e;
        }
    }, []);

    // @anchor realization-new-save-comment — `WbsNode.comment` przez `PATCH /wbs-nodes/:id`,
    // plus rozgłoszenie `wbs-comment-changed`: ten sam komentarz czyta WBS, panel Materiały
    // i marker schematu, więc bez zdarzenia zostawałyby ze starą treścią do przeładowania.
    const saveComment = useCallback(async (wbsNodeId, comment) => {
        setWbsNodes(prev => prev.map(n => n.id === wbsNodeId ? { ...n, comment } : n));
        await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ comment }),
        });
        window.dispatchEvent(new CustomEvent('wbs-comment-changed', { detail: { wbsNodeIds: [wbsNodeId], comment } }));
    }, []);

    // Komentarz zmieniony gdzie indziej wjeżdża tu bez przeładowania tabeli.
    useEffect(() => {
        const handler = (e) => {
            const { wbsNodeIds, comment } = e.detail || {};
            if (!wbsNodeIds?.length) return;
            setWbsNodes(prev => prev.map(n => wbsNodeIds.includes(n.id) ? { ...n, comment: comment || '' } : n));
        };
        window.addEventListener('wbs-comment-changed', handler);
        return () => window.removeEventListener('wbs-comment-changed', handler);
    }, []);

    // @anchor realization-new-save-owner — `WbsNode.owner` przez `PATCH /wbs-nodes/:id`. Zapis
    // optymistyczny z cofnięciem: pole jest listą wyboru, więc nieudany zapis musi wrócić do
    // poprzedniego nazwiska, a nie zostawić na ekranie osoby, której nie ma w bazie.
    const saveOwner = useCallback(async (node, owner) => {
        const previous = node.owner ?? '';
        if (owner === previous) return;
        setWbsNodes(prev => prev.map(n => n.id === node.id ? { ...n, owner } : n));
        try {
            const res = await fetch(`${API_URL}/wbs-nodes/${node.id}`, {
                method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ owner }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            console.error('[RealizationNewTab] saveOwner error:', e);
            setWbsNodes(prev => prev.map(n => n.id === node.id ? { ...n, owner: previous } : n));
            alert('Nie udało się zapisać osoby odpowiedzialnej');
        }
    }, []);

    // @anchor realization-new-save-axis — zapis osi realizacji. COFNIĘCIE ZAKUPU COFA TEŻ
    // WYKONANIE: bramka `axisGateOf` trzyma montaż, dopóki oś wykonania stoi na NULL, ale
    // otwiera się na zawsze, gdy ktoś ją raz ustawi. Bez zerowania do NULL cofnięcie dostawy
    // zostawiało obok „Montaż w toku" — towar wraca do dostawcy, a kolumna twierdzi, że go
    // montujemy. Reguła przepisana z `realization-save-axis` i musi zostać identyczna.
    const saveAxis = useCallback(async (node, pole, wartosc) => {
        const previous = node[pole] ?? null;
        if (wartosc === previous) return;

        const cofaWykonanie = pole === 'purchaseStatus'
            && hasPurchaseAxis(node?.type) && hasExecAxis(node?.type)
            && (node?.execStatus ?? null) !== null
            && (wartosc === 'CANCELLED'
                || (AXIS_STATUS_ORDER.purchase[wartosc] ?? 0) < AXIS_STATUS_ORDER.purchase.PARTIALLY_DELIVERED);
        const previousExec = node?.execStatus ?? null;
        const patch = cofaWykonanie ? { [pole]: wartosc, execStatus: null } : { [pole]: wartosc };

        setWbsNodes(prev => prev.map(n => n.id === node.id ? { ...n, ...patch } : n));
        try {
            const res = await fetch(`${API_URL}/wbs-nodes/${node.id}`, {
                method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            console.error('[RealizationNewTab] saveAxis error:', e);
            setWbsNodes(prev => prev.map(n => n.id === node.id
                ? { ...n, [pole]: previous, ...(cofaWykonanie ? { execStatus: previousExec } : {}) }
                : n));
            alert(pole === 'purchaseStatus'
                ? 'Nie udało się zapisać statusu zakupu'
                : 'Nie udało się zapisać statusu wykonania');
        }
    }, []);

    // Komentarz NOWEGO wpisu dopisuje się do komentarza pozycji osobną linią „zakup: …".
    // Wyłącznie przy dodaniu — poprawka wpisu po fakcie nie przepisuje historii.
    const appendEntryComment = useCallback(async (node, text) => {
        const trimmed = (text || '').trim();
        if (!trimmed) return;
        const line = `${entryNoun(node.type)}: ${trimmed}`;
        const base = (node.comment || '').trim();
        await saveComment(node.id, base ? `${base}\n${line}` : line);
    }, [saveComment]);

    // @anchor realization-new-add-actual — nowy wpis `LeafActual` na pozycji.
    const addActual = useCallback(async (node, draft) => {
        const res = await fetch(`${API_URL}/leaf-actuals`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                wbsNodeId: node.id,
                entryDate: draft.entryDate || undefined,
                qty: draft.qty,
                unitCost: draft.unitCost,
                comment: draft.comment || null,
                docNumber: draft.docNumber || null,
                supplierId: draft.supplierId || null,
                manufacturer: draft.manufacturer || null,
                model: draft.model || null,
                ean: draft.ean || null,
                scope: draft.scope || null,
                status: draft.status || ENTRY_STATUS.PLANNED,
            }),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Nie udało się zapisać wpisu realizacji');
            return false;
        }
        await fetchActuals();
        await appendEntryComment(node, draft.comment);
        return true;
    }, [fetchActuals, appendEntryComment]);

    const updateActual = useCallback(async (id, patch) => {
        const res = await fetch(`${API_URL}/leaf-actuals/${id}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Nie udało się zapisać zmiany wpisu');
        }
        await fetchActuals();
    }, [fetchActuals]);

    // @anchor realization-new-set-closed — znacznik „rozliczone" na pozycji.
    const setClosed = useCallback(async (node, closed) => {
        const res = await fetch(`${API_URL}/leaf-actuals/close/${node.id}`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ closed }),
        });
        if (!res.ok) {
            alert('Nie udało się zmienić rozliczenia pozycji');
            return false;
        }
        setWbsNodes(prev => prev.map(n => n.id === node.id ? { ...n, realizationClosed: closed } : n));
        return true;
    }, []);

    // Usunięcie OSTATNIEGO wpisu zdejmuje z pozycji znacznik „rozliczone" — inaczej zostaje
    // pozycja bez ani jednego zdarzenia, z pełnym paskiem i Δ ilość równą minus całemu planowi.
    const deleteActual = useCallback(async (id) => {
        const gone = actuals.find(a => a.id === id) || null;
        const res = await fetch(`${API_URL}/leaf-actuals/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            alert(e.message || 'Nie udało się usunąć wpisu');
            return;
        }
        await fetchActuals();
        if (!gone) return;
        if (actuals.some(a => a.id !== id && a.wbsRootId === gone.wbsRootId)) return;
        for (const n of wbsNodes.filter(n => n.realizationClosed && wbsRootOf(n) === gone.wbsRootId)) {
            await setClosed(n, false);
        }
    }, [fetchActuals, actuals, wbsNodes, setClosed]);

    const toggleClosed = useCallback((node) => setClosed(node, !node.realizationClosed), [setClosed]);

    const actualsByRoot = useMemo(() => {
        const map = {};
        for (const a of actuals) (map[a.wbsRootId] || (map[a.wbsRootId] = [])).push(a);
        return map;
    }, [actuals]);

    const actualsOf = useCallback((node) => actualsByRoot[wbsRootOf(node)] || [], [actualsByRoot]);
    const cardOf = useCallback((node) => cards[node?.id] || null, [cards]);

    // @anchor realization-new-row-of — komplet liczb jednej pozycji: karta, realizacja,
    // wartość planu i Δ ilości. Liczone raz i podawane do komórek, szuflady i karty, żeby
    // trzy panele nie mogły pokazać trzech różnych wyników dla tej samej pozycji.
    const rowOf = useCallback((node) => {
        const card = cardOf(node);
        const r = realizationOf(node, actualsOf(node));
        return { card, r, planValue: planValueOf(node, card) };
    }, [cardOf, actualsOf]);

    // Osoby JUŻ przypisane na pozycjach tego zamówienia wchodzą do listy jako `extras`
    // (patrz `build-owner-options`): bez nich pozycja przypisana komuś spoza obu list —
    // człowiekowi zdjętemu z zespołu, kontaktowi usuniętemu z zamówienia — pokazywałaby
    // pusty dropdown nad niepustą bazą, a pierwsze kliknięcie skasowałoby nazwisko.
    const ownerOptions = useMemo(() => {
        const przypisani = [...new Set(wbsNodes.map(n => String(n.owner || '').trim()).filter(Boolean))];
        return buildOwnerOptions(ownerUsers, ownerContacts, przypisani);
    }, [ownerUsers, ownerContacts, wbsNodes]);

    return {
        loading, wbsNodes, cards, actuals,
        fetchAll, fetchActuals, fetchCards,
        saveComment, saveOwner, saveAxis, savePlanDates, addActual, updateActual, deleteActual, setClosed, toggleClosed,
        actualsOf, cardOf, rowOf, ownerOptions,
        // @anchor realization-owner-users — konta zespołu zamówienia (właściciel blokera = `User`)
        ownerUsers,
    };
}

// @anchor use-realization-filters — filtry kolumn tabeli pozycji: stan, opcje list i predykat.
// `baseLeaves` = pozycje PRZED filtrowaniem (wybrana gałąź) — patrz komentarz przy opcjach.
export function useRealizationFilters(baseLeaves, actualsOf, cardOf) {
    const [colFilters, setColFilters] = useState({});
    // Opcje filtrów liczą się z pozycji WYBRANEJ GAŁĘZI przed filtrowaniem — gdyby liczyły
    // się z wyniku, po zaznaczeniu jednego statusu zniknęłyby z listy pozostałe i nie dałoby
    // się dobrać drugiego.
    const filterOptions = useMemo(() => {
        const acc = { type: new Set(), owner: new Set(), supplier: new Set(), status: new Set(), purchaseStatus: new Set(), execStatus: new Set() };
        for (const n of baseLeaves) {
            const v = filterValuesOf(n, actualsOf(n));
            for (const k of ['type', 'owner', 'status', 'purchaseStatus', 'execStatus']) if (v[k]) acc[k].add(v[k]);
            for (const nazwa of v.supplier) acc.supplier.add(nazwa);
        }
        const pos = (zbior) => [...zbior].sort((a, b) => a.localeCompare(b, 'pl'));
        return {
            type: pos(acc.type), owner: pos(acc.owner), supplier: pos(acc.supplier), status: pos(acc.status),
            purchaseStatus: pos(acc.purchaseStatus), execStatus: pos(acc.execStatus),
        };
    }, [baseLeaves, actualsOf]);

    const matchesFilters = useCallback((node) => {
        const wpisy = actualsOf(node);
        let slownik = null, r = null;
        for (const [key, val] of Object.entries(colFilters)) {
            if (!hasColFilter(val)) continue;
            if (Array.isArray(val)) {
                slownik = slownik || filterValuesOf(node, wpisy);
                const chce = new Set(val);
                const ok = key === 'supplier'
                    ? slownik.supplier.some(nazwa => chce.has(nazwa))
                    : chce.has(slownik[key]);
                if (!ok) return false;
                continue;
            }
            const q = String(val).toLowerCase().trim();
            const frazy = NEW_TEXT_FILTER_COLS.has(key)
                ? q.split(';').map(t => t.trim()).filter(Boolean)
                : [q];
            if (!frazy.length) continue;
            r = r || realizationOf(node, wpisy);
            const tekst = filterTextOf(key, node, cardOf(node), r, wpisy);
            if (!frazy.some(t => tekst.includes(t))) return false;
        }
        return true;
    }, [colFilters, actualsOf, cardOf]);

    return { colFilters, setColFilters, filterOptions, matchesFilters };
}
