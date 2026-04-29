import { useEffect, useState, useRef, useCallback } from 'react';
import { API_URL } from '../config';

/**
 * Hook stanu sieci: łączy `navigator.onLine` z miękkim probe `/api/health`.
 *
 * Dlaczego nie tylko `navigator.onLine`?
 *   - Na Windowsie i w niektórych konfiguracjach VPN flaga zwraca `true` mimo że
 *     serwer jest nieosiągalny. KPricer (sąsiedni projekt) ma analogiczny ping
 *     do `/api/health` co 5s. My probujemy lepiej: 30s w tle, ale natychmiast
 *     po `online` evencie.
 *
 * Stany:
 *   - isOnline: boolean — `navigator.onLine && lastProbe === ok`
 *   - serverReachable: boolean | null — wynik ostatniego probe (null = nie próbowano)
 */

const PROBE_INTERVAL_MS = 30_000;
const PROBE_TIMEOUT_MS = 4_000;

async function probeServer(signal) {
    try {
        const res = await fetch(`${API_URL}/health`, {
            method: 'GET',
            cache: 'no-store',
            signal,
        });
        return res.ok;
    } catch {
        return false;
    }
}

export function useNetwork() {
    const [navigatorOnline, setNavigatorOnline] = useState(() =>
        typeof navigator === 'undefined' ? true : navigator.onLine,
    );
    const [serverReachable, setServerReachable] = useState(null);
    const probeTimerRef = useRef(null);
    const inflightRef = useRef(null);

    const runProbe = useCallback(async () => {
        if (inflightRef.current) inflightRef.current.abort();
        const ctrl = new AbortController();
        inflightRef.current = ctrl;
        const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
        const ok = await probeServer(ctrl.signal);
        clearTimeout(timeout);
        if (inflightRef.current === ctrl) {
            inflightRef.current = null;
            setServerReachable(ok);
        }
    }, []);

    useEffect(() => {
        const onOnline = () => {
            setNavigatorOnline(true);
            runProbe();
        };
        const onOffline = () => {
            setNavigatorOnline(false);
            setServerReachable(false);
        };
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        runProbe();
        probeTimerRef.current = setInterval(runProbe, PROBE_INTERVAL_MS);

        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            if (probeTimerRef.current) clearInterval(probeTimerRef.current);
            if (inflightRef.current) inflightRef.current.abort();
        };
    }, [runProbe]);

    const isOnline = navigatorOnline && serverReachable !== false;

    return { isOnline, navigatorOnline, serverReachable, recheck: runProbe };
}
