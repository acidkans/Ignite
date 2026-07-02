// @anchor use-before-unload
import { useEffect } from 'react';

export function useBeforeUnload(isDirty) {
    useEffect(() => {
        if (!isDirty) return;
        const handler = (e) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);
}
