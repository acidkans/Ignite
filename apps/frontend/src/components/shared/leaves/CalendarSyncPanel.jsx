import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../../../config';

// @anchor format-sync-date
/// „31.08.2026, 15:41" — krotki zapis daty ostatniego przebiegu automatu.
const formatSyncDate = (iso) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString('pl-PL', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
};

// @anchor rollout-step
/// Jeden krok listy „czego brakuje": zielony = zrobione, bursztynowy = do zrobienia,
/// szary = poza aplikacja (nie umiemy tego sprawdzic z kodu, wie o tym czlowiek).
const RolloutStep = ({ stan, children }) => {
    const ikona = { zrobione: '✓', czeka: '○', reczne: '•' }[stan];
    const kolor = { zrobione: 'text-emerald-400', czeka: 'text-amber-300', reczne: 'text-gray-500' }[stan];
    return (
        <li className={`flex gap-2 ${stan === 'zrobione' ? 'text-gray-500' : 'text-gray-300'}`}>
            <span className={`${kolor} shrink-0`}>{ikona}</span>
            <span>{children}</span>
        </li>
    );
};

// @anchor calendar-sync-panel
/// Panel administratora: przelacznik cogodzinnej synchronizacji wspolnego kalendarza Google
/// i przycisk jednorazowego przebiegu. Wlaczac dopiero po odcieciu AppSheet od kalendarza —
/// dopoki oba systemy pisza te same urlopy, automat bedzie mnozyl wpisy.
export default function CalendarSyncPanel({ className = '', titleClassName = '' }) {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [wynik, setWynik] = useState(null);

    // @anchor fetch-calendar-sync-status
    const fetchStatus = useCallback(async () => {
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-requests/calendar/sync`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Nie udało się odczytać ustawień kalendarza.');
            setStatus(await res.json());
            setError(null);
        } catch (e) {
            setError(e.message);
        }
    }, []);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    // @anchor toggle-calendar-sync
    const toggleSync = async () => {
        setBusy(true);
        setWynik(null);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-requests/calendar/sync`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !status?.syncEnabled }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'Nie udało się przełączyć synchronizacji.');
            setStatus(data);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    // @anchor run-calendar-sync-now
    /// Jednorazowy przebieg niezalezny od przelacznika — do sprawdzenia stanu przed wlaczeniem
    /// automatu albo do natychmiastowego odtworzenia recznie skasowanego wydarzenia.
    const runNow = async () => {
        setBusy(true);
        setWynik(null);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/leave-requests/calendar/resync`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'Synchronizacja nie powiodła się.');
            setWynik(data);
            setError(null);
            fetchStatus();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const wlaczona = !!status?.syncEnabled;
    const skonfigurowana = !!status?.configured;

    return (
        <div className={className}>
            <p className={titleClassName}>Kalendarz Google — synchronizacja</p>

            {error && (
                <div className="mb-3 p-2 bg-red-600/20 border border-red-500/40 rounded text-red-300 text-xs">{error}</div>
            )}

            {!status ? (
                <p className="text-sm text-gray-500">Ładowanie...</p>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm text-white">
                                Automat co godzinę:{' '}
                                <span className={wlaczona ? 'text-emerald-300 font-semibold' : 'text-gray-400 font-semibold'}>
                                    {wlaczona ? 'włączony' : 'wyłączony'}
                                </span>
                            </p>
                            <p className="text-[11px] text-gray-500 break-all">{status.calendarId || 'brak adresu kalendarza'}</p>
                        </div>
                        {/* @anchor calendar-sync-toggle-button */}
                        <button
                            type="button"
                            onClick={toggleSync}
                            disabled={busy || (!skonfigurowana && !wlaczona)}
                            title={
                                skonfigurowana
                                    ? 'Włącz dopiero po wyłączeniu zapisu z AppSheet — inaczej wpisy się zdublują'
                                    : 'Brak konfiguracji konta serwisowego Google (zmienne GOOGLE_* w .env backendu)'
                            }
                            className={`shrink-0 px-3 py-2 rounded-lg text-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                wlaczona
                                    ? 'bg-red-500/15 hover:bg-red-500/30 text-red-200 border-red-500/30'
                                    : 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 border-emerald-500/30'
                            }`}
                        >
                            {wlaczona ? 'Wyłącz synchronizację' : 'Włącz synchronizację'}
                        </button>
                    </div>

                    {!skonfigurowana && (
                        <p className="text-[11px] text-amber-300/80">
                            Backend nie ma zmiennych <code>GOOGLE_*</code> — synchronizacji nie da się włączyć.
                        </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* @anchor calendar-sync-run-now-button */}
                        <button
                            type="button"
                            onClick={runNow}
                            disabled={busy || !skonfigurowana}
                            className="px-3 py-2 rounded-lg text-sm bg-blue-500/15 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {busy ? 'Pracuję…' : 'Synchronizuj teraz'}
                        </button>
                        {status.lastRunAt && (
                            <span className="text-[11px] text-gray-500">
                                ostatnio: {formatSyncDate(status.lastRunAt)}
                            </span>
                        )}
                    </div>

                    {status.lastRunSummary && !wynik && (
                        <p className="text-[11px] text-gray-500">{status.lastRunSummary}</p>
                    )}

                    {wynik && (
                        <div className="text-xs text-gray-300 bg-white/[0.03] border border-white/10 rounded p-2">
                            <p>
                                Sprawdzone: {wynik.sprawdzone}, poprawione: {wynik.poprawione}, błędy: {wynik.bledy}
                            </p>
                            {wynik.szczegoly?.slice(0, 5).map((s, i) => (
                                <p key={i} className="text-[11px] text-gray-500 mt-1">• {s}</p>
                            ))}
                        </div>
                    )}

                    {/* @anchor calendar-rollout-checklist */}
                    {/* Czego brakuje do pelnego uruchomienia. Widoczne tylko dla administratora,
                        bo caly panel renderuje sie wylacznie przy `access.canEdit`. */}
                    <div className="border-t border-white/5 pt-3">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                            Zanim automat ruszy — stan przygotowań
                        </p>
                        <ul className="flex flex-col gap-1.5 text-[11px] leading-snug">
                            <RolloutStep stan="zrobione">
                                Kod synchronizacji wdrożony — zatwierdzony wniosek umie założyć wydarzenia,
                                a zmiana terminu i cofnięcie decyzji je poprawiają.
                            </RolloutStep>
                            <RolloutStep stan={skonfigurowana ? 'zrobione' : 'czeka'}>
                                Konto serwisowe w zmiennych <code>GOOGLE_*</code> backendu.
                                {!skonfigurowana && ' Brak — do wgrania po odcięciu AppSheet (sam restart kontenera nie wystarczy, potrzebne przeładowanie z env_file).'}
                            </RolloutStep>
                            <RolloutStep stan="reczne">
                                Wyłączenie zapisu do tego kalendarza po stronie AppSheet — dopóki oba systemy piszą,
                                wpisy się dublują. Tego aplikacja nie sprawdzi za Ciebie.
                            </RolloutStep>
                            <RolloutStep stan="czeka">
                                Import wydarzeń już stojących w kalendarzu (dopięcie ich do wniosków, żeby automat
                                ich nie zdublował). Skrypt jeszcze nie powstał.
                            </RolloutStep>
                            <RolloutStep stan="czeka">
                                Osobny kalendarz testowy dla środowiska deweloperskiego — dziś dev pisze pod ten sam
                                adres, więc testowy wniosek ląduje w firmowym widoku.
                            </RolloutStep>
                            <RolloutStep stan={wlaczona ? 'zrobione' : 'czeka'}>
                                Włączenie automatu — ostatni krok, po sprawdzeniu wyniku „Synchronizuj teraz".
                            </RolloutStep>
                        </ul>
                    </div>

                    <p className="text-[11px] text-gray-600 leading-snug">
                        Baza jest źródłem prawdy: automat odtwarza w kalendarzu wpisy skasowane ręcznie i nie dotyka
                        wydarzeń spoza modułu Urlopy. Włączaj dopiero po odcięciu AppSheet od tego kalendarza.
                    </p>
                </div>
            )}
        </div>
    );
}
