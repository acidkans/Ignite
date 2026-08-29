import { useEffect, useRef } from 'react';

// @anchor auto-refresh-interval-ms
// Co ile odświeżamy dane w tle — 5 minut. Tyle, żeby pracownik zobaczył decyzję
// przełożonego bez wciskania F5, i na tyle rzadko, żeby nie zalewać backendu.
export const AUTO_REFRESH_MS = 5 * 60 * 1000;

// @anchor use-auto-refresh
// Cykliczne wywołanie `callback` w tle. Dwie zasady:
// 1. gdy karta jest schowana, nie odpytujemy — nikt na to nie patrzy,
// 2. po powrocie do karty odświeżamy od razu, jeśli od ostatniego razu minął cały interwał.
// Callback trzymamy w ref, więc zmiana jego tożsamości nie restartuje timera.
export default function useAutoRefresh(callback, { intervalMs = AUTO_REFRESH_MS, enabled = true } = {}) {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;
    const lastRunRef = useRef(Date.now());

    useEffect(() => {
        if (!enabled) return undefined;

        const run = () => {
            lastRunRef.current = Date.now();
            callbackRef.current?.();
        };

        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') run();
        }, intervalMs);

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastRunRef.current >= intervalMs) run();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [enabled, intervalMs]);
}
