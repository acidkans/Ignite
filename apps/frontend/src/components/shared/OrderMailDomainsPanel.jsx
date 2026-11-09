import { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../../config';
import { Mail, Search, Loader2, CheckCircle } from 'lucide-react';

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' });

// @anchor order-mail-domains-panel
// ADMIN — z której domeny wychodzą maile każdego zamówienia (`OrderRequirements.mailDomainId`).
// Zmiana w wierszu zapisuje się od razu; ostatnia kolumna ostrzega, kto z zespołu nie ma skrzynki w tej domenie.
// `domainsVersion` rośnie po zmianie w `MailDomainsPanel`, żeby lista domen była aktualna.
export default function OrderMailDomainsPanel({ domainsVersion = 0 }) {
  const [orders, setOrders] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [rowError, setRowError] = useState(null); // { id, message }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadError(null);
      try {
        const [o, d] = await Promise.all([
          fetch(`${API_URL}/mail-domains/orders`, { headers: authHeaders() }),
          fetch(`${API_URL}/mail-domains?all=true`, { headers: authHeaders() }),
        ]);
        if (!o.ok || !d.ok) throw new Error(`HTTP ${o.ok ? d.status : o.status}`);
        const [ordersData, domainsData] = await Promise.all([o.json(), d.json()]);
        if (alive) { setOrders(ordersData); setDomains(domainsData); }
      } catch (e) {
        if (alive) setLoadError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [domainsVersion]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? orders.filter((o) => `${o.name} ${o.parentName || ''}`.toLowerCase().includes(q)) : orders;
  }, [orders, query]);

  // @anchor order-mail-domains-assign
  const assign = async (order, mailDomainId) => {
    const setDomain = (value) => setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, mailDomainId: value } : o)));
    setDomain(mailDomainId || null);
    setSavingId(order.id); setSavedId(null); setRowError(null);
    try {
      const res = await fetch(`${API_URL}/mail-domains/orders/${order.id}`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ mailDomainId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || `Błąd (${res.status})`);
      }
      setSavedId(order.id);
      setTimeout(() => setSavedId((id) => (id === order.id ? null : id)), 2500);
    } catch (e) {
      setDomain(order.mailDomainId);
      setRowError({ id: order.id, message: e.message });
    } finally {
      setSavingId(null);
    }
  };

  const withoutDomain = orders.filter((o) => !o.mailDomainId).length;

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl mx-auto mt-10 mb-10">
      <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-gradient-to-br from-teal-600/10 to-blue-600/10 flex items-center gap-4">
        <div className="w-12 h-12 bg-teal-500/20 rounded-2xl flex items-center justify-center border border-teal-500/30">
          <Mail className="text-teal-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white">Domeny poczty zamówień</h3>
          <p className="text-xs text-teal-200/60">Z tej domeny wychodzą maile zamówienia. Każdy z zespołu wysyła ze swojej skrzynki w tej domenie, dodanej w „Moje konto”.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm p-4"><Loader2 size={16} className="animate-spin" /> Ładowanie zamówień…</div>
      ) : loadError ? (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">Nie udało się wczytać zamówień: {loadError}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj zamówienia…"
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-white focus:outline-none focus:border-teal-500/50 text-sm" />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">Zamówień: {orders.length} · bez domeny: {withoutDomain}</span>
          </div>
          <div className="glass-panel rounded-xl border border-white/5 bg-white/[0.02] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/10">
                  <th className="px-4 py-2">Zamówienie</th>
                  <th className="px-4 py-2 w-64">Domena</th>
                  <th className="px-4 py-2">Skrzynki zespołu</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const missing = o.mailDomainId ? o.team.filter((u) => !u.domainIds.includes(o.mailDomainId)) : [];
                  const current = domains.find((d) => d.id === o.mailDomainId);
                  return (
                    <tr key={o.id} className="border-b border-white/5 last:border-0 align-top">
                      <td className="px-4 py-2">
                        <div className="text-white">{o.name}</div>
                        {o.parentName && <div className="text-[11px] text-gray-500">{o.parentName}</div>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <select value={o.mailDomainId || ''} disabled={savingId === o.id} onChange={(e) => assign(o, e.target.value)}
                            className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-2 py-1 text-[13px] text-gray-200 focus:outline-none focus:border-teal-500/40 disabled:opacity-50">
                            <option value="">— nie ustawiono —</option>
                            {domains.filter((d) => d.isActive || d.id === o.mailDomainId).map((d) => (
                              <option key={d.id} value={d.id}>@{d.domain}{d.label ? ` (${d.label})` : ''}{d.isActive ? '' : ' — nieaktywna'}</option>
                            ))}
                          </select>
                          {savingId === o.id && <Loader2 size={14} className="animate-spin text-gray-400 shrink-0" />}
                          {savedId === o.id && <CheckCircle size={14} className="text-emerald-400 shrink-0" />}
                        </div>
                        {rowError?.id === o.id && <div className="text-[12px] text-red-400 mt-1">{rowError.message}</div>}
                      </td>
                      <td className="px-4 py-2 text-[12px]">
                        {!o.mailDomainId ? <span className="text-gray-600">—</span>
                          : !o.team.length ? <span className="text-gray-500">Brak zespołu</span>
                            : missing.length ? <span className="text-amber-300/80">Bez skrzynki @{current?.domain}:{missing.map((u) => u.name).join(', ')}</span>
                              : <span className="text-teal-300/60">Każdy ma skrzynkę</span>}
                      </td>
                    </tr>
                  );
                })}
                {!visible.length && <tr><td colSpan={3} className="px-4 py-4 text-gray-500">Brak zamówień.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
