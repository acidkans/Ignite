// Harmonogram zadań — tryb Harmonogramu, w którym wiersze to zadania (UserTask) zamówienia zamiast
// pozycji WBS. Dane z `GET /my-tasks/project/:processNodeId?status=ALL` (wszyscy w projekcie, każdy status,
// z `wbsPath`). Zadania grupowane są w te same gałęzie co pozycje WBS widoku, żeby przełączenie trybu
// nie zmieniało układu. Tylko podgląd — daty zadania zmienia formularz (synchronizacja Outlook / MS To Do).
import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../../config';

const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');
const dzien0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// @anchor use-zadania-harmonogramu — zadania zamówienia dla trybu zadań: pobiera dopiero po włączeniu
// trybu i odświeża po `user-tasks-changed`. `zadania` = null, dopóki pierwsza odpowiedź nie wróci.
export function useZadaniaHarmonogramu(processNodeId, aktywny) {
    const [zadania, setZadania] = useState(null);
    const [blad, setBlad] = useState(null);
    const wczytaj = useCallback(async () => {
        if (!processNodeId) return;
        try {
            const res = await fetch(`${API_URL}/my-tasks/project/${processNodeId}?status=ALL`, { headers: { Authorization: `Bearer ${token()}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setZadania(Array.isArray(data) ? data : []);
            setBlad(null);
        } catch (e) {
            console.error('[Harmonogram] zadania:', e);
            setBlad('Nie udało się wczytać zadań');
            setZadania(z => z || []);
        }
    }, [processNodeId]);
    useEffect(() => { if (aktywny) wczytaj(); }, [aktywny, wczytaj]);
    useEffect(() => {
        if (!aktywny) return undefined;
        const fn = () => wczytaj();
        window.addEventListener('user-tasks-changed', fn);
        return () => window.removeEventListener('user-tasks-changed', fn);
    }, [aktywny, wczytaj]);
    // Podmiana pól jednego zadania na liście (optymistyczny podgląd przesunięcia i jego cofnięcie).
    const podmien = useCallback((id, pola) => setZadania(z => (z ? z.map(t => (t.id === id ? { ...t, ...pola } : t)) : z)), []);
    return { zadania, blad, podmien };
}

// @anchor moje-id-zadan — id zalogowanego z tokenu (jak `TaskModal`).
export const mojeId = () => { try { return JSON.parse(atob(token().split('.')[1])).sub; } catch { return null; } };
// @anchor moze-przesunac-zadanie — daty zadania zmienia odpowiedzialny albo zlecający (backend: `findEditable`).
export const mozePrzesunac = (t, uid) => !!uid && (t.userId === uid || t.createdById === uid);

// @anchor przesun-zadanie — nowe `plannedStart` / `plannedEnd` po przeciągnięciu o `delta` dni kalendarzowych.
// move: Od i Do o tyle samo dni, godziny zostają (jak przełożenie w kalendarzu — wydarzenie Outlook nie skacze);
// 'l' / 'r': sama krawędź, nie dalej niż druga data. Zadanie z jedną datą tylko się przesuwa. null = bez zmian.
export function przesunZadanie(t, tryb, delta) {
    if (!delta) return null;
    const plus = (d) => { const x = new Date(d); x.setDate(x.getDate() + delta); return x; };
    const s = t.plannedStart ? new Date(t.plannedStart) : null;
    const e = t.plannedEnd ? new Date(t.plannedEnd) : null;
    if (tryb === 'move' || !s || !e) {
        const out = {};
        if (s) out.plannedStart = plus(s).toISOString();
        if (e) out.plannedEnd = plus(e).toISOString();
        return out;
    }
    if (tryb === 'l') {
        let ns = plus(s);
        if (ns > e) { ns = new Date(e); ns.setHours(s.getHours(), s.getMinutes(), 0, 0); if (ns > e) ns = new Date(e); }
        return +ns === +s ? null : { plannedStart: ns.toISOString() };
    }
    let ne = plus(e);
    if (ne < s) { ne = new Date(s); ne.setHours(e.getHours(), e.getMinutes(), 0, 0); if (ne < s) ne = new Date(s); }
    return +ne === +e ? null : { plannedEnd: ne.toISOString() };
}

// @anchor zapisz-daty-zadania — PATCH /my-tasks/:id z nowymi datami; `{ count: 0 }` = brak prawa edycji.
export async function zapiszDatyZadania(id, pola) {
    const res = await fetch(`${API_URL}/my-tasks/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pola),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json().catch(() => null);
    if (body && body.count === 0) throw new Error('Daty zadania zmienia tylko odpowiedzialny albo zlecający');
}

// @anchor zadanie-na-os — zadanie → wiersz osi: Od..Do po dniach (czas lokalny). Zadanie z jedną datą
// (samo Do albo samo Od) dostaje `_termin` = znacznik dnia zamiast paska. null = bez dat (poza osią).
export function zadanieNaOs(t) {
    const od = t.plannedStart ? dzien0(t.plannedStart) : null;
    const doo = t.plannedEnd ? dzien0(t.plannedEnd) : null;
    if (!od && !doo) return null;
    const a = od || doo;
    const b = doo || od;
    return { id: t.id, name: t.title, planOd: a, planDo: b < a ? a : b, _zadanie: t, _termin: !od || !doo };
}

// @anchor grupuj-zadania — zadania w gałęziach Harmonogramu WBS: grupa = najbliższy przodek węzła zadania
// (`wbsPath`) będący gałęzią którejś grupy. Bez trafienia: przy całym zamówieniu grupa z gałęzi najwyższego
// poziomu, a zadania bez pozycji WBS (i przy zoomie przypięte wprost do gałęzi zoomu) — grupa bez gałęzi na końcu.
// `zakresIds` (Set|null) zawęża do zadań przypiętych do węzłów zakresu; null = całe zamówienie.
// Zwraca { grupy: [{ galaz, liscie }], bezDat } — `bezDat` = zadania zakresu bez Od i Do.
export function grupujZadania(zadania, grupyWbs, zakresIds) {
    const galezie = new Map();
    const out = [];
    for (const g of grupyWbs || []) {
        if (!g.galaz || galezie.has(g.galaz.id)) continue;
        const gr = { galaz: g.galaz, liscie: [] };
        galezie.set(g.galaz.id, gr);
        out.push(gr);
    }
    const reszta = { galaz: null, liscie: [] };
    let bezDat = 0;
    for (const t of zadania || []) {
        if (zakresIds && !(t.wbsNodeId && zakresIds.has(t.wbsNodeId))) continue;
        const l = zadanieNaOs(t);
        if (!l) { bezDat++; continue; }
        const sciezka = (t.wbsPath || []).map(p => p.id).reverse();
        if (t.wbsNodeId && !sciezka.includes(t.wbsNodeId)) sciezka.unshift(t.wbsNodeId);
        let gr = sciezka.map(id => galezie.get(id)).find(Boolean);
        if (!gr && !zakresIds && t.wbsPath?.length) {
            const top = t.wbsPath[0];
            gr = { galaz: { id: top.id, name: top.name }, liscie: [] };
            galezie.set(top.id, gr);
            out.push(gr);
        }
        (gr || reszta).liscie.push(l);
    }
    const wgDat = (a, b) => (a.planOd - b.planOd) || (a.planDo - b.planDo) || String(a.name || '').localeCompare(String(b.name || ''), 'pl');
    for (const g of [...out, reszta]) g.liscie.sort(wgDat);
    return { grupy: [...out, reszta].filter(g => g.liscie.length), bezDat };
}
