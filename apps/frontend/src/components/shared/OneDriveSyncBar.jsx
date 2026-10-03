import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, CloudCog, AlertTriangle } from 'lucide-react';
import { API_URL } from '../../config';

const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');

// Wejście do zakładki synchronizuje folder, jeśli ostatnia synchronizacja jest starsza niż tyle.
const STALE_MS = 5 * 60 * 1000;

const STATUS_LABEL = {
  pending: 'w kolejce',
  discovered: 'w kolejce',
  indexed: 'zaindeksowane',
  downloaded: 'pobrane',
  skipped: 'pominięte',
  error: 'błędy',
};

// @anchor onedrive-sync-bar
// Synchronizacja folderu zamówienia z OneDrive: przycisk „Synchronizuj”, czas ostatniej synchronizacji
// i liczniki plików. Dopóki coś jest w kolejce, odpytuje status co 5 s i odświeża listę dokumentów (`onSynced`).
// Ukryty, gdy zamówienie nie ma powiązanego folderu.
export default function OneDriveSyncBar({ nodeId, onSynced }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const lastDone = useRef(null);
  const autoTried = useRef(null);

  const fetchStatus = useCallback(async () => {
    if (!nodeId) return null;
    try {
      const r = await fetch(`${API_URL}/onedrive/sync/${nodeId}/status`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) return null;
      const s = await r.json();
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  }, [nodeId]);

  useEffect(() => { setStatus(null); lastDone.current = null; fetchStatus(); }, [fetchStatus]);

  const queued = (status?.counts?.pending || 0) + (status?.counts?.discovered || 0);

  // Odpytywanie, dopóki kolejka nie opustoszeje; lista dokumentów odświeżana przy każdej zmianie liczby gotowych.
  useEffect(() => {
    if (!queued) return undefined;
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, [queued, fetchStatus]);

  useEffect(() => {
    if (!status) return;
    const done = (status.counts?.indexed || 0) + (status.counts?.downloaded || 0);
    if (lastDone.current !== null && done !== lastDone.current) onSynced?.();
    lastDone.current = done;
  }, [status, onSynced]);

  // @anchor onedrive-sync-run
  const runSync = async () => {
    setBusy(true); setError('');
    try {
      const r = await fetch(`${API_URL}/onedrive/sync/${nodeId}`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.message || `HTTP ${r.status}`);
      }
      await fetchStatus();
      onSynced?.();
    } catch (e) {
      setError(e?.message || 'Błąd synchronizacji');
    } finally {
      setBusy(false);
    }
  };

  // @anchor onedrive-sync-on-open — świeże pliki od razu po wejściu, bez czekania na cykl co 30 min.
  useEffect(() => {
    if (!status?.linked || status.blocked || status.syncing || autoTried.current === nodeId) return;
    autoTried.current = nodeId;
    const age = status.syncedAt ? Date.now() - new Date(status.syncedAt).getTime() : Infinity;
    if (age > STALE_MS) runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, nodeId]);

  if (!status?.linked) return null;

  const errors = (status.files || []).filter((f) => f.status === 'error');
  const syncedAt = status.syncedAt
    ? new Date(status.syncedAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'nigdy';
  const counts = Object.entries(status.counts || {})
    .filter(([k]) => k !== 'discovered')
    .map(([k, v]) => `${k === 'pending' ? v + (status.counts.discovered || 0) : v} ${STATUS_LABEL[k] || k}`);

  return (
    <div className="relative flex items-center gap-2 flex-shrink-0 text-[10px]">
      <button
        onClick={runSync}
        disabled={busy || status.syncing || !!status.blocked}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 font-bold transition-colors disabled:opacity-50"
        title={status.blocked || `Pobiera zmiany z folderu OneDrive „${status.folderName || ''}” i indeksuje nowe pliki dla AI`}
      >
        {busy || queued ? <RefreshCw size={12} className="animate-spin" /> : <CloudCog size={12} />}
        Synchronizuj OneDrive
      </button>
      <span className="text-gray-500" title={counts.join(' · ')}>
        {status.blocked ? status.blocked : <>{syncedAt}{counts.length ? ` · ${counts.join(' · ')}` : ''}</>}
      </span>
      {(errors.length > 0 || status.syncError || error) && (
        <button onClick={() => setShowErrors((v) => !v)} className="text-red-400 hover:text-red-300" title="Pokaż błędy">
          <AlertTriangle size={12} />
        </button>
      )}
      {showErrors && (
        <div className="absolute top-full left-0 mt-1 z-50 w-96 max-h-64 overflow-auto bg-gray-900 border border-red-500/30 rounded-lg shadow-xl p-2 space-y-1">
          {error && <div className="text-red-400">{error}</div>}
          {status.syncError && <div className="text-red-400">Synchronizacja: {status.syncError}</div>}
          {errors.map((f) => (
            <div key={f.id} className="text-gray-300">
              <span className="font-bold">{f.name}</span> <span className="text-gray-500">({f.folderPath})</span>
              <div className="text-red-400/80">{f.error}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
