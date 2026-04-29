import { useEffect } from 'react';
import { useNetwork } from './useNetwork';
import { syncOutbox } from '../services/sync/syncOutbox';

export function useSyncOutbox(token) {
    const { isOnline } = useNetwork();

    useEffect(() => {
        if (!token || !isOnline) return;
        syncOutbox(token).catch(console.warn);
    }, [token, isOnline]);
}
