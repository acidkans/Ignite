import { useEffect } from 'react';
import { useNetwork } from './useNetwork';
import { syncOutbox } from '../services/sync/syncOutbox';

// Cykliczny retry — pojedynczy nieudany sync (np. chwilowy błąd serwera)
// nie może zostawić outboxa wiszącego do następnej zmiany stanu sieci.
// @anchor outbox-retry-interval-ms
const OUTBOX_RETRY_INTERVAL_MS = 60_000;

export function useSyncOutbox(token) {
    const { isOnline } = useNetwork();

    useEffect(() => {
        if (!token || !isOnline) return;
        syncOutbox(token).catch(console.warn);
        const timer = setInterval(() => {
            syncOutbox(token).catch(console.warn);
        }, OUTBOX_RETRY_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [token, isOnline]);
}
