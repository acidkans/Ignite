import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../../config';

// @anchor use-watek-realizacji — dane wątku pozycji, których nie niesie `useRealizationData`:
// czat zamówienia (z wpisami pilnymi), zadania (wszystkie statusy), protokoły odbioru i blokery (`Constraint`).
// Każde źródło jest opcjonalne — błąd jednego nie zeruje pozostałych.
export function useWatekRealizacji(nodeId) {
    const [comments, setComments] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [protocols, setProtocols] = useState([]);
    const [constraints, setConstraints] = useState([]);

    const pobierz = useCallback(async () => {
        if (!nodeId) return;
        const headers = { Authorization: `Bearer ${sessionStorage.getItem('token')}` };
        const json = async (url) => {
            try { const r = await fetch(url, { headers }); return r.ok ? await r.json() : null; } catch { return null; }
        };
        const [c, t, p, k] = await Promise.all([
            json(`${API_URL}/comments/order/${nodeId}`),
            json(`${API_URL}/user-tasks/project/${nodeId}?status=ALL`),
            json(`${API_URL}/acceptance-protocols/${nodeId}`),
            json(`${API_URL}/constraints/order/${nodeId}`),
        ]);
        setComments(Array.isArray(c) ? c : []);
        setTasks(Array.isArray(t) ? t : []);
        setProtocols(Array.isArray(p) ? p : []);
        setConstraints(Array.isArray(k) ? k : []);
    }, [nodeId]);

    useEffect(() => { pobierz(); }, [pobierz]);

    // @anchor watek-wyslij — odpowiedź z wątku idzie do czatu pozycji (`Comment.wbsNodeId`).
    // `pilne` = wpis typu URGENT, czyli bloker w MVP.
    const wyslij = useCallback(async (wbsNodeId, text, pilne = false) => {
        const res = await fetch(`${API_URL}/comments/order/${nodeId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, wbsNodeId, type: pilne ? 'URGENT' : 'NOTE' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await pobierz();
    }, [nodeId, pobierz]);

    // @anchor watek-zamknij-bloker — pilny wpis → RESOLVED; czerwony licznik gaśnie.
    const zamknijBloker = useCallback(async (commentId) => {
        const res = await fetch(`${API_URL}/comments/${commentId}/type`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'RESOLVED' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await pobierz();
    }, [pobierz]);

    // @anchor watek-dodaj-bloker — nowy `Constraint` na węźle bieżącej wersji (serwer liczy wbsRootId).
    // `dane`: { wbsNodeId, title, kind, dueAt, impactDays, ownerId, note, sourceType, sourceId }.
    const dodajBloker = useCallback(async (dane) => {
        const res = await fetch(`${API_URL}/constraints/order/${nodeId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(dane),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await pobierz();
    }, [nodeId, pobierz]);

    // @anchor watek-zmien-bloker — edycja / zamknięcie (`status: 'CLOSED'`) / ponowne otwarcie blokera.
    const zmienBloker = useCallback(async (id, zmiany) => {
        const res = await fetch(`${API_URL}/constraints/${id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(zmiany),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await pobierz();
    }, [pobierz]);

    return { comments, tasks, protocols, constraints, odswiez: pobierz, wyslij, zamknijBloker, dodajBloker, zmienBloker };
}
