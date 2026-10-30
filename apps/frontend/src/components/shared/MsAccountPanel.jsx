import { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { CheckCircle, AlertCircle, Loader2, Unlink, RefreshCw, ExternalLink, Link2 } from 'lucide-react';

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}` });

// @anchor ms-account-panel
// Konto Microsoft zalogowanego użytkownika: z jakim kontem jest połączony (To Do, kalendarz Outlook,
// OneDrive), ostatnia synchronizacja, połącz / rozłącz / wymuś sync. `oauthResult` = wynik powrotu
// z logowania Microsoft (?ms=connected|error), przekazany przez MainLayout.
export default function MsAccountPanel({ oauthResult = null }) {
  const [msStatus, setMsStatus] = useState(null); // null = ładowanie
  const [msAction, setMsAction] = useState(null); // 'connecting' | 'disconnecting' | 'resyncing'
  const [msResyncMsg, setMsResyncMsg] = useState(null); // 'ok' | 'error' | null
  // @anchor ms-account-confirm-disconnect — własne TAK/NIE zamiast window.confirm
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [msDisconnectError, setMsDisconnectError] = useState(null); // komunikat 403 — konto wspólne odłącza tylko admin

  const fetchMsStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/ms-todo/status`, { headers: authHeaders() });
      setMsStatus(res.ok ? await res.json() : { connected: false });
    } catch {
      setMsStatus({ connected: false });
    }
  };

  useEffect(() => { fetchMsStatus(); }, []);

  const handleMsConnect = async () => {
    setMsAction('connecting');
    try {
      const res = await fetch(`${API_URL}/onedrive/auth`, { headers: authHeaders() });
      if (res.ok) { const { url } = await res.json(); window.location.href = url; }
    } finally { setMsAction(null); }
  };

  const handleMsDisconnect = async () => {
    setConfirmDisconnect(false);
    setMsAction('disconnecting');
    setMsDisconnectError(null);
    const res = await fetch(`${API_URL}/ms-todo/disconnect`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setMsDisconnectError(body?.message || 'Nie udało się rozłączyć konta.');
    }
    await fetchMsStatus();
    setMsAction(null);
  };

  const handleMsResync = async () => {
    setMsAction('resyncing');
    setMsResyncMsg(null);
    try {
      const res = await fetch(`${API_URL}/ms-todo/resync`, { method: 'POST', headers: authHeaders() });
      setMsResyncMsg(res.ok ? 'ok' : 'error');
    } catch {
      setMsResyncMsg('error');
    } finally {
      setMsAction(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-blue-400" />
        <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Konto Microsoft</h4>
      </div>
      <p className="text-[11px] text-gray-500 -mt-2">MS To Do, kalendarz Outlook (zadania z godziną), OneDrive</p>

      {oauthResult === 'connected' && (
        <div className="flex items-center gap-2 text-[11px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          <CheckCircle size={13} className="shrink-0" />
          <span>Połączono z Microsoft. Synchronizacja zadań zostanie uruchomiona przez cron w ciągu kilku minut.</span>
        </div>
      )}
      {oauthResult === 'error' && (
        <div className="flex items-center gap-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="shrink-0" />
          <span>Błąd autoryzacji Microsoft. Spróbuj ponownie lub skontaktuj się z administratorem.</span>
        </div>
      )}

      {msStatus === null ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 size={14} className="animate-spin" /> Ładowanie…
        </div>
      ) : msStatus.connected ? (
        <>
          {msStatus.needsReauth ? (
            <div className="flex items-start gap-2 text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>
                Połączono jako <strong className="text-white">{msStatus.msAccountEmail || '(brak email)'}</strong>, ale wymagana jest ponowna autoryzacja.
                Synchronizacja jest wstrzymana do czasu ponownego połączenia.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle size={14} className="shrink-0" />
              <span className="min-w-0 break-all">Połączone jako <strong className="text-white">{msStatus.msAccountEmail || '(brak email)'}</strong></span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400">
            <span>Ostatnia sync:</span>
            <span className="text-gray-300">{msStatus.lastSyncAt ? new Date(msStatus.lastSyncAt).toLocaleString('pl-PL') : '—'}</span>
            {msStatus.lastSyncError && (
              <>
                <span className="text-red-400">Błąd sync:</span>
                <span className="text-red-300 truncate" title={msStatus.lastSyncError}>{msStatus.lastSyncError}</span>
              </>
            )}
          </div>

          <div className="flex gap-2 flex-wrap items-center pt-1">
            {msStatus.needsReauth ? (
              <button
                onClick={handleMsConnect}
                disabled={!!msAction}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600/80 hover:bg-blue-500/80 text-white text-[11px] font-bold rounded-lg transition-all disabled:opacity-50"
              >
                <ExternalLink size={12} /> Połącz ponownie
              </button>
            ) : (
              <button
                onClick={handleMsResync}
                disabled={!!msAction}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-gray-300 text-[11px] rounded-lg transition-all disabled:opacity-50"
              >
                {msAction === 'resyncing' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Wymuś sync
              </button>
            )}
            {confirmDisconnect ? (
              <span className="flex items-center gap-2 text-[11px] text-gray-300 ml-auto">
                Rozłączyć konto?
                <button onClick={handleMsDisconnect} className="px-2.5 py-1 rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold">TAK</button>
                <button onClick={() => setConfirmDisconnect(false)} className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/10 text-gray-300">NIE</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDisconnect(true)}
                disabled={!!msAction}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[11px] rounded-lg transition-all disabled:opacity-50 ml-auto"
              >
                {msAction === 'disconnecting' ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                Rozłącz konto
              </button>
            )}
          </div>
          {msResyncMsg && (
            <span className={`text-[11px] ${msResyncMsg === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
              {msResyncMsg === 'ok' ? 'Zlecono — pojawi się po najbliższym cyklu (do 5 min).' : 'Błąd zlecenia synchronizacji.'}
            </span>
          )}
          {msDisconnectError && <span className="text-[11px] text-red-300">{msDisconnectError}</span>}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-400">
            Połącz konto Microsoft, aby zadania trafiały do MS To Do, a zadania z godziną do kalendarza Outlook.
          </p>
          <button
            onClick={handleMsConnect}
            disabled={!!msAction}
            className="self-start flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow transition-all disabled:opacity-50"
          >
            {msAction === 'connecting' ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            Połącz konto Microsoft
          </button>
        </div>
      )}
    </section>
  );
}
