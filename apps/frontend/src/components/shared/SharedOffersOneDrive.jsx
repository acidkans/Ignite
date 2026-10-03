import { useState, useEffect, useCallback, useRef } from 'react';
import { CloudCog, RefreshCw, FolderCog, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { API_URL } from '../../config';
import OneDriveFolderPicker from './OneDriveFolderPicker';
import SupplierPicker from './SupplierPicker';

const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');
const api = (path, opts = {}) => fetch(`${API_URL}${path}`, {
  ...opts,
  headers: { Authorization: `Bearer ${token()}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
});

const STATUS_LABEL = { pending: 'w kolejce', unmatched: 'czeka na przypisanie', indexed: 'zaindeksowane', downloaded: 'pobrane', skipped: 'pominięte', error: 'błędy' };

// @anchor shared-offers-onedrive
// Wspólny katalog ofert dostawców na OneDrive (Logistyka → Oferty):
// `<katalog>/<Dostawca>/plik` → oferta ogólna, `<katalog>/<Dostawca>/<Zamówienie>/plik` → oferta zamówienia.
// Wybór katalogu, synchronizacja, przypisanie katalogów nierozpoznanych automatycznie po nazwie.
export default function SharedOffersOneDrive({ onSynced }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [orders, setOrders] = useState([]);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await api('/onedrive/shared-offers');
      if (r.ok) setStatus(await r.json());
    } catch { /* brak połączenia — pasek zostaje bez danych */ }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const queued = status?.counts?.pending || 0;
  useEffect(() => {
    if (!queued) return undefined;
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, [queued, fetchStatus]);

  // Lista dokumentów odświeżana tylko, gdy przybyło przetworzonych plików — nie przy każdym odpytaniu.
  const lastDone = useRef(null);
  useEffect(() => {
    if (!status) return;
    const c = status.counts || {};
    const done = (c.indexed || 0) + (c.downloaded || 0) + (c.error || 0);
    if (lastDone.current !== null && done !== lastDone.current) onSynced?.();
    lastDone.current = done;
  }, [status, onSynced]);

  const unmatchedSuppliers = (status?.suppliers || []).filter((s) => !s.supplier);
  const unmatchedOrders = (status?.orders || []).filter((o) => !o.order);
  const needsAttention = unmatchedSuppliers.length + unmatchedOrders.length;

  useEffect(() => {
    if (!expanded || orders.length) return;
    api('/onedrive/shared-offers/orders').then((r) => (r.ok ? r.json() : [])).then(setOrders).catch(() => {});
  }, [expanded, orders.length]);

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); await fetchStatus(); } catch (e) { setError(e?.message || 'Błąd'); } finally { setBusy(false); }
  };

  // @anchor shared-offers-sync-run
  const runSync = () => run(async () => {
    const r = await api('/onedrive/shared-offers/sync', { method: 'POST' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || `HTTP ${r.status}`);
  });

  const pickFolder = (f) => run(async () => {
    setPickerOpen(false);
    const r = await api('/onedrive/shared-offers', { method: 'PUT', body: JSON.stringify({ folderId: f.id, driveId: f.driveId, folderName: f.name }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const s = await api('/onedrive/shared-offers/sync', { method: 'POST' });
    if (!s.ok) throw new Error((await s.json().catch(() => ({})))?.message || `HTTP ${s.status}`);
  });

  // @anchor shared-offers-match
  const match = (folderItemId, target) => run(async () => {
    const r = await api('/onedrive/shared-offers/match', { method: 'POST', body: JSON.stringify({ folderItemId, ...target }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });

  if (!status) return null;

  const syncedAt = status.syncedAt
    ? new Date(status.syncedAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'nigdy';
  const counts = Object.entries(status.counts || {}).map(([k, v]) => `${v} ${STATUS_LABEL[k] || k}`).join(' · ');

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[11px] text-gray-300">
      <div className="flex flex-wrap items-center gap-2">
        <CloudCog size={14} className="text-sky-400 shrink-0" />
        <span className="font-bold text-sky-200">Wspólny katalog ofert OneDrive:</span>
        <span className="text-gray-200">{status.folderName || 'nie wybrano'}</span>
        <button onClick={() => setPickerOpen(true)} disabled={busy} className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-50">
          <FolderCog size={12} /> {status.folderId ? 'Zmień' : 'Wybierz katalog'}
        </button>
        {status.folderId && (
          <>
            <button onClick={runSync} disabled={busy || status.syncing} className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 font-bold disabled:opacity-50">
              <RefreshCw size={12} className={busy || queued ? 'animate-spin' : ''} /> Synchronizuj
            </button>
            <span className="text-gray-500">{syncedAt}{counts ? ` · ${counts}` : ''}</span>
            <button onClick={() => setExpanded((v) => !v)} className={`flex items-center gap-1 ml-auto ${needsAttention ? 'text-amber-300 font-bold' : 'text-gray-400'} hover:text-white`}>
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Katalogi{needsAttention ? ` · ${needsAttention} do przypisania` : ''}
            </button>
          </>
        )}
      </div>

      {(error || status.syncError) && (
        <p className="mt-1 text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> {error || status.syncError}</p>
      )}

      {expanded && status.folderId && (
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Dostawcy (katalogi 1. poziomu)</div>
            {(status.suppliers || []).length === 0 && <p className="text-gray-500">Brak katalogów dostawców</p>}
            {(status.suppliers || []).map((s) => (
              <div key={s.folderItemId} className="flex items-center gap-2 py-1">
                <span className={`w-40 truncate ${s.supplier ? 'text-gray-300' : 'text-amber-300'}`} title={s.name}>📁 {s.name}</span>
                <div className="flex-1 min-w-0">
                  <SupplierPicker dark size="sm" textClass="text-[11px]" value={s.supplier?.id ?? null} onChange={(sup) => sup && match(s.folderItemId, { supplierId: sup.id })} placeholder="Przypisz dostawcę…" />
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Zamówienia (katalogi 2. poziomu)</div>
            {(status.orders || []).length === 0 && <p className="text-gray-500">Brak katalogów zamówień</p>}
            {(status.orders || []).map((o) => (
              <div key={o.folderItemId} className="flex items-center gap-2 py-1">
                <span className={`w-40 truncate ${o.order ? 'text-gray-300' : 'text-amber-300'}`} title={`${o.supplierFolder} / ${o.name}`}>📁 {o.name}</span>
                <select
                  value={o.order?.id || ''}
                  onChange={(e) => e.target.value && match(o.folderItemId, { orderNodeId: e.target.value })}
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-gray-200"
                >
                  <option value="">{o.order ? o.order.name : `— przypisz zamówienie${o.waitingFiles ? ` (${o.waitingFiles} plików czeka)` : ''} —`}</option>
                  {orders.map((x) => <option key={x.id} value={x.id}>{x.name}{x.parent ? ` (${x.parent})` : ''}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <OneDriveFolderPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pickFolder} title="Wspólny katalog ofert" />
    </div>
  );
}
