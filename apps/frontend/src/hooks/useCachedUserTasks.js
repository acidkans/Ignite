import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../services/db';
import { getAllUserTasks } from '../services/repos/userTasksRepo';
import { prefetchMobileData } from '../services/sync/prefetch';
import { useNetwork } from './useNetwork';

/**
 * Cache-first hook do listy zadań (UserTask) zalogowanego — widok mobilny.
 *
 *  - Live read z IDB przez Dexie `liveQuery` — UI reaguje natychmiast po
 *    bulk-replace z prefetch i po zmianie statusu.
 *  - W tle, gdy `isOnline === true`, odpala prefetch (idempotentny —
 *    inflight guard w `prefetch.js`) przy montowaniu i co 60 s.
 *  - Pierwsze wczytanie nigdy nie blokuje renderu — stan `loading` jest true
 *    tylko do pierwszego odczytu z IDB.
 */
// @anchor use-cached-user-tasks
export function useCachedUserTasks(token) {
    const [tasks, setTasks] = useState([]);
    const [hasReadOnce, setHasReadOnce] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const { isOnline } = useNetwork();

    useEffect(() => {
        const sub = liveQuery(() => getAllUserTasks()).subscribe({
            next: (data) => {
                setTasks(data);
                setHasReadOnce(true);
            },
            error: (err) => {
                console.error('[useCachedUserTasks] liveQuery error:', err);
                setHasReadOnce(true);
            },
        });
        return () => sub.unsubscribe();
    }, []);

    useEffect(() => {
        if (!token || !isOnline) return;
        let cancelled = false;
        const run = () => {
            setSyncing(true);
            prefetchMobileData(token).finally(() => {
                if (!cancelled) setSyncing(false);
            });
        };
        run();
        const id = setInterval(run, 60_000);
        return () => { cancelled = true; clearInterval(id); };
    }, [token, isOnline]);

    const refresh = async () => {
        if (!token) return;
        setSyncing(true);
        try {
            await prefetchMobileData(token);
        } finally {
            setSyncing(false);
        }
    };

    return { tasks, loading: !hasReadOnce, syncing, refresh };
}

// Drobna pomoc dla DevTools — żeby można było ręcznie sprawdzić ile jest w IDB.
if (typeof window !== 'undefined') {
    window.__erpDebugDb = db;
}
