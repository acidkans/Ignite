import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { useNetwork } from '../../hooks/useNetwork';
import { getStuckAttachments, resetRetries, WARN_AFTER_RETRIES } from '../../services/repos/outboxRepo';
import { syncOutbox } from '../../services/sync/syncOutbox';

/**
 * Ostrzeżenie „zdjęcia nie wysyłają się na serwer".
 *
 * Powód istnienia: zdjecie, ktore nie przechodzi, wygladalo dotad DOKLADNIE tak
 * samo jak zdjecie czekajace na zasieg — ⏳ przy miniaturze i cisza. Blad z
 * lipca zyl przez miesiac wlasnie dlatego, ze nic nie odroznialo jednego od
 * drugiego. Teraz kazda nieudana proba zwieksza `retries` w wpisie kolejki, a po
 * WARN_AFTER_RETRIES nieudanych probach mowimy o tym wprost.
 *
 * Offline NIE jest bledem — wtedy pokazujemy spokojna informacje, ze pliki czekaja
 * na zasieg, zamiast straszyc czerwonym alertem w terenie bez sieci.
 *
 * @anchor sync-warning-banner
 */
export default function SyncWarningBanner({ className = '' }) {
    const { isOnline } = useNetwork();
    const [stuck, setStuck] = useState([]);
    const [retrying, setRetrying] = useState(false);

    const refresh = useCallback(async () => {
        try { setStuck(await getStuckAttachments()); } catch (_) { /* IDB niedostępne — nie blokuj widoku */ }
    }, []);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 10000);
        window.addEventListener('outbox-sync-failed', refresh);
        window.addEventListener('attachment-synced', refresh);
        window.addEventListener('attachment-orphaned', refresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener('outbox-sync-failed', refresh);
            window.removeEventListener('attachment-synced', refresh);
            window.removeEventListener('attachment-orphaned', refresh);
        };
    }, [refresh]);

    // @anchor sync-warning-retry-now
    const retryNow = async () => {
        setRetrying(true);
        try {
            await resetRetries();
            const token = sessionStorage.getItem('token');
            if (token) await syncOutbox(token);
        } catch (_) { /* blad i tak wroci przez outbox-sync-failed */ }
        finally {
            await refresh();
            setRetrying(false);
        }
    };

    if (stuck.length === 0) return null;

    const lastError = stuck.map(s => s.lastError).filter(Boolean).pop();
    const maxRetries = Math.max(...stuck.map(s => s.retries || 0));

    // Bez sieci to nie jest awaria — pliki czekaja i pojda same.
    if (!isOnline) {
        return (
            <div className={`flex items-center gap-3 px-4 py-3 bg-gray-800/60 border-y border-white/5 ${className}`}>
                <WifiOff size={16} className="text-gray-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold text-gray-300">
                        {stuck.length} {stuck.length === 1 ? 'zdjęcie czeka' : 'zdjęć czeka'} na zasięg
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Wyślą się same, gdy wróci sieć. Nic nie ginie.</div>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex items-start gap-3 px-4 py-3 bg-red-950/50 border-y border-red-500/30 ${className}`}>
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
                <div className="text-[12px] font-black text-red-300 uppercase tracking-wider">
                    Zdjęcia nie wysyłają się na serwer
                </div>
                <div className="text-[11px] text-red-200/80 mt-1 leading-relaxed">
                    {stuck.length} {stuck.length === 1 ? 'plik' : 'plików'} nie przeszło po {maxRetries} próbach.
                    Pliki są bezpieczne na telefonie — nie kasuj aplikacji ani danych.
                </div>
                {lastError && (
                    <div className="text-[10px] text-red-400/70 font-mono mt-1 truncate">Ostatni błąd: {lastError}</div>
                )}
            </div>
            <button
                onClick={retryNow}
                disabled={retrying}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-[10px] font-black uppercase tracking-widest flex-shrink-0 active:scale-95 transition-transform disabled:opacity-40"
            >
                <RefreshCw size={12} className={retrying ? 'animate-spin' : ''} />
                {retrying ? '…' : 'Ponów'}
            </button>
        </div>
    );
}
