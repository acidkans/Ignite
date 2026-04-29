import { WifiOff } from 'lucide-react';
import { useNetwork } from '../../hooks/useNetwork';

/**
 * Pasek informujący o trybie offline. Render tylko gdy faktycznie offline,
 * w innym wypadku zwraca null. Klik wymusza re-probe `/api/health`.
 */
export default function OfflineBanner() {
    const { isOnline, recheck } = useNetwork();

    if (isOnline) return null;

    return (
        <div
            role="status"
            onClick={recheck}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-[11px] font-bold tracking-wide cursor-pointer select-none"
        >
            <WifiOff size={13} className="flex-shrink-0" />
            <span className="flex-1 truncate">Tryb offline — zmiany zostaną zsynchronizowane po powrocie sieci.</span>
            <span className="text-[10px] opacity-70 hidden sm:inline">Sprawdź</span>
        </div>
    );
}
