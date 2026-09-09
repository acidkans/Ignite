import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw, WifiOff, FileX, Trash2 } from 'lucide-react';
import { useNetwork } from '../../hooks/useNetwork';
import { getStuckAttachments, getBlockedAttachments, resetRetries, removeById, WARN_AFTER_RETRIES } from '../../services/repos/outboxRepo';
import { syncOutbox } from '../../services/sync/syncOutbox';
import { db } from '../../services/db';

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
 * Trzeci stan, dołożony po awarii z 09.09.2026: plik ODRZUCONY NA STAŁE. Proxy
 * Cloudflare ucina żądania powyżej 100 MB własnym 413, więc film z telefonu nie
 * ma jak przejść — ani teraz, ani za sto prób. Taki wpis dostaje własną sekcję z
 * powodem i jedynym działającym lekarstwem (zmniejsz plik), bo „Ponów" byłby tu
 * obietnicą bez pokrycia.
 *
 * @anchor sync-warning-banner
 */
export default function SyncWarningBanner({ className = '' }) {
    const { isOnline } = useNetwork();
    const [stuck, setStuck] = useState([]);
    // @anchor sync-warning-blocked
    const [blocked, setBlocked] = useState([]);
    const [retrying, setRetrying] = useState(false);
    // Kasowanie jest dwustopniowe (klik → „na pewno?" → klik) zamiast modala:
    // usuwamy tylko kopię z kolejki, oryginał zostaje w Galerii telefonu.
    const [confirmDropId, setConfirmDropId] = useState(null);

    const refresh = useCallback(async () => {
        try {
            setStuck(await getStuckAttachments());
            setBlocked(await getBlockedAttachments());
        } catch (_) { /* IDB niedostępne — nie blokuj widoku */ }
    }, []);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 10000);
        window.addEventListener('outbox-sync-failed', refresh);
        window.addEventListener('attachment-synced', refresh);
        window.addEventListener('attachment-orphaned', refresh);
        window.addEventListener('attachment-blocked', refresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener('outbox-sync-failed', refresh);
            window.removeEventListener('attachment-synced', refresh);
            window.removeEventListener('attachment-orphaned', refresh);
            window.removeEventListener('attachment-blocked', refresh);
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

    // Zdejmuje z kolejki plik, który nigdy nie przejdzie — razem z jego draftem,
    // żeby nie zostawiać w IndexedDB stumegabajtowego sieroty.
    // @anchor sync-warning-drop-blocked
    const dropBlocked = async (item) => {
        try {
            if (item.payload?.outboxId) {
                await db.attachmentDrafts.where('outboxId').equals(item.payload.outboxId).delete();
            }
            await removeById(item.id);
        } catch (_) { /* i tak odświeżamy listę niżej */ }
        finally {
            setConfirmDropId(null);
            await refresh();
        }
    };

    if (stuck.length === 0 && blocked.length === 0) return null;

    const BlockedEl = blocked.length > 0 ? (
        <div className={`px-4 py-3 bg-orange-950/50 border-y border-orange-500/30 ${className}`}>
            <div className="flex items-start gap-3">
                <FileX size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-black text-orange-300 uppercase tracking-wider">
                        {blocked.length === 1 ? 'Plik za duży — nie zostanie wysłany' : 'Pliki za duże — nie zostaną wysłane'}
                    </div>
                    <div className="text-[11px] text-orange-200/80 mt-1 leading-relaxed">
                        Skróć nagranie albo zmniejsz jakość i dodaj ponownie. Ponawianie nic nie da —
                        serwer odrzuca taki plik, zanim zdąży dojść.
                    </div>
                    <ul className="mt-2 space-y-1.5">
                        {blocked.map(item => (
                            <li key={item.id} className="flex items-center gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="text-[11px] text-orange-100 font-bold truncate">{item.payload?.fileName || 'plik bez nazwy'}</div>
                                    <div className="text-[10px] text-orange-400/70 font-mono truncate">{item.blockedReason}</div>
                                </div>
                                <button
                                    onClick={() => (confirmDropId === item.id ? dropBlocked(item) : setConfirmDropId(item.id))}
                                    onBlur={() => setConfirmDropId(null)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/40 text-orange-200 text-[10px] font-black uppercase tracking-wider flex-shrink-0 active:scale-95 transition-transform"
                                >
                                    <Trash2 size={11} />
                                    {confirmDropId === item.id ? 'Na pewno?' : 'Usuń'}
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="text-[10px] text-orange-400/60 mt-2">
                        Usunięcie zdejmuje plik tylko z kolejki — oryginał zostaje w Galerii telefonu.
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    if (stuck.length === 0) return BlockedEl;

    const lastError = stuck.map(s => s.lastError).filter(Boolean).pop();
    const maxRetries = Math.max(...stuck.map(s => s.retries || 0));

    // Bez sieci to nie jest awaria — pliki czekaja i pojda same.
    if (!isOnline) {
        return (
            <>
                {BlockedEl}
                <div className={`flex items-center gap-3 px-4 py-3 bg-gray-800/60 border-y border-white/5 ${className}`}>
                    <WifiOff size={16} className="text-gray-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-bold text-gray-300">
                            {stuck.length} {stuck.length === 1 ? 'zdjęcie czeka' : 'zdjęć czeka'} na zasięg
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">Wyślą się same, gdy wróci sieć. Nic nie ginie.</div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            {BlockedEl}
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
        </>
    );
}
