import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../services/db';
import { getAllSubtasksWithNodes } from '../services/repos/subtasksRepo';
import { prefetchMobileData } from '../services/sync/prefetch';
import { useNetwork } from './useNetwork';

/**
 * Cache-first hook do listy subtasków przypisanych do bieżącego usera.
 *
 *  - Live read z IDB przez Dexie `liveQuery` — UI reaguje natychmiast po
 *    bulk-replace z prefetch.
 *  - W tle, gdy `isOnline === true`, odpala prefetch (idempotentny —
 *    inflight guard w `prefetch.js`). Stałe periodyczne odświeżanie
 *    zostawiamy do Etapu 3 (sync engine).
 *  - Pierwsze wczytanie nigdy nie blokuje renderu — stan `loading` jest true
 *    tylko gdy IDB jest puste i nie mamy jeszcze odpowiedzi z sieci.
 */
export function useCachedSubtasks(token) {
    const [subtasks, setSubtasks] = useState([]);
    const [hasReadOnce, setHasReadOnce] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const { isOnline } = useNetwork();

    // Live read z IDB
    useEffect(() => {
        const sub = liveQuery(() => getAllSubtasksWithNodes()).subscribe({
            next: (data) => {
                setSubtasks(data);
                setHasReadOnce(true);
            },
            error: (err) => {
                console.error('[useCachedSubtasks] liveQuery error:', err);
                setHasReadOnce(true);
            },
        });
        return () => sub.unsubscribe();
    }, []);

    // Prefetch z sieci (cicho, w tle)
    useEffect(() => {
        if (!token || !isOnline) return;
        let cancelled = false;
        setSyncing(true);
        prefetchMobileData(token).finally(() => {
            if (!cancelled) setSyncing(false);
        });
        return () => { cancelled = true; };
    }, [token, isOnline]);

    // Manual refresh (dla pull-to-refresh w przyszłości)
    const refresh = async () => {
        if (!token) return;
        setSyncing(true);
        try {
            await prefetchMobileData(token);
        } finally {
            setSyncing(false);
        }
    };

    const loading = !hasReadOnce;
    return { subtasks, loading, syncing, refresh };
}

// Drobna pomoc dla DevTools — żeby można było ręcznie sprawdzić ile jest w IDB.
if (typeof window !== 'undefined') {
    window.__erpDebugDb = db;
}
