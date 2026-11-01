import { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { Mail, Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, PlugZap } from 'lucide-react';

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' });

// @anchor my-mailboxes-panel
// „Moje konto” → skrzynki firmowe użytkownika, po jednej na domenę (airtel.pl, europrim.pl…).
// Maile zamówienia wychodzą ze skrzynki w domenie ustawionej w „Informacjach o zamówieniu”.
// Hasło write-only; „Testuj” loguje się do SMTP i IMAP i znajduje folder „Wysłane”.
export default function MyMailboxesPanel() {
  const [boxes, setBoxes] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);       // { id?, domainId, email, username, password }
  const [busy, setBusy] = useState(null);       // id skrzynki w trakcie testu / 'save'
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    try {
      const [b, d] = await Promise.all([
        fetch(`${API_URL}/mailboxes/me`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API_URL}/mail-domains`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
      ]);
      setBoxes(b); setDomains(d);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const freeDomains = domains.filter((d) => !boxes.some((b) => b.domainId === d.id));
  const domainOf = (id) => domains.find((d) => d.id === id);

  // @anchor my-mailboxes-test
  const test = async (id) => {
    setBusy(id); setError(null);
    try {
      const res = await fetch(`${API_URL}/mailboxes/me/${id}/test`, { method: 'POST', headers: authHeaders() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message || `Błąd (${res.status})`); return; }
      setBoxes((p) => p.map((b) => (b.id === id ? d.mailbox : b)));
    } catch {
      setError('Błąd połączenia z serwerem.');
    } finally {
      setBusy(null);
    }
  };

  // @anchor my-mailboxes-save
  // Po zapisie od razu test — użytkownik widzi, czy hasło i serwer działają.
  const save = async () => {
    setBusy('save'); setError(null);
    try {
      const { id, ...body } = form;
      if (id) delete body.domainId;
      if (!body.password) delete body.password;
      const res = await fetch(`${API_URL}/mailboxes/me${id ? `/${id}` : ''}`, {
        method: id ? 'PATCH' : 'POST', headers: authHeaders(), body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message || `Błąd (${res.status})`); return; }
      setForm(null);
      setBoxes((p) => (id ? p.map((b) => (b.id === id ? d : b)) : [...p, d]));
      if (d.hasPassword) test(d.id);
    } catch {
      setError('Błąd połączenia z serwerem.');
    } finally {
      setBusy((b) => (b === 'save' ? null : b));
    }
  };

  const remove = async (id) => {
    setConfirmDelete(null);
    const res = await fetch(`${API_URL}/mailboxes/me/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) setBoxes((p) => p.filter((b) => b.id !== id));
  };

  const openNew = () => {
    const d = freeDomains[0];
    setForm({ domainId: d?.id || '', email: '', username: '', password: '' });
    setError(null);
  };

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const inputCls = 'w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:border-blue-500';

  if (loading) return <div className="flex items-center gap-2 text-xs text-gray-500 py-2"><Loader2 size={13} className="animate-spin" /> Ładowanie skrzynek…</div>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Mail size={14} className="text-teal-400" />
        <p className="text-[12px] uppercase tracking-widest text-gray-300 font-bold flex-1">Skrzynki firmowe</p>
        {!form && freeDomains.length > 0 && (
          <button onClick={openNew} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg border border-teal-500/40 text-teal-200 hover:bg-teal-500/10"><Plus size={12} /> Dodaj</button>
        )}
      </div>
      <p className="text-[11px] text-gray-500 -mt-1">Z tych adresów Ignite wysyła maile zamówień — z domeny wybranej w „Informacjach o zamówieniu”. Kopie lądują w „Wysłanych”, więc widzisz je w Outlooku.</p>

      {!domains.length && <p className="text-[12px] text-amber-300/80">Administrator nie dodał jeszcze domen pocztowych (Poczta SMTP → Domeny).</p>}
      {domains.length > 0 && !boxes.length && !form && <p className="text-[12px] text-gray-500 italic">Nie masz jeszcze żadnej skrzynki.</p>}

      {boxes.map((b) => (
        <div key={b.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
          <div className="flex items-center gap-2">
            {b.verifiedAt ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> : <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-white truncate">{b.email}</p>
              <p className="text-[10px] text-gray-500">
                {b.domain?.label || b.domain?.domain}
                {b.verifiedAt ? ` · działa${b.sentFolder ? ` · Wysłane: ${b.sentFolder}` : ''}` : b.lastError ? ' · test nieudany' : b.hasPassword ? ' · nieprzetestowana' : ' · brak hasła'}
              </p>
            </div>
            <button onClick={() => test(b.id)} disabled={busy === b.id || !b.hasPassword} title="Sprawdź logowanie SMTP i IMAP" className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-40">
              {busy === b.id ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />} Testuj
            </button>
            <button onClick={() => { setForm({ id: b.id, domainId: b.domainId, email: b.email, username: b.username || '', password: '' }); setError(null); }} className="px-2 py-1 text-[11px] rounded border border-white/10 text-gray-300 hover:bg-white/10">Edytuj</button>
            {confirmDelete === b.id ? (
              <span className="flex items-center gap-1 text-[11px] text-red-300">
                <button onClick={() => remove(b.id)} className="px-1.5 py-0.5 rounded border border-red-500/40 hover:bg-red-500/20">TAK</button>
                <button onClick={() => setConfirmDelete(null)} className="px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/10">NIE</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(b.id)} title="Usuń skrzynkę" className="p-1 rounded text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>
            )}
          </div>
          {!b.verifiedAt && b.lastError && <p className="mt-1 text-[11px] text-red-400 break-words">{b.lastError}</p>}
        </div>
      ))}

      {form && (
        <div className="rounded-lg border border-teal-500/30 bg-teal-500/[0.03] p-3 grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Domena</label>
            {form.id ? (
              <p className="text-[13px] text-gray-300">@{domainOf(form.domainId)?.domain || boxes.find((b) => b.id === form.id)?.domain?.domain}</p>
            ) : (
              <select value={form.domainId} onChange={set('domainId')} className={inputCls}>
                {freeDomains.map((d) => <option key={d.id} value={d.id}>@{d.domain}{d.label ? ` — ${d.label}` : ''}</option>)}
              </select>
            )}
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Adres e-mail</label>
            <input value={form.email} onChange={set('email')} className={inputCls} placeholder={`jan.kowalski@${domainOf(form.domainId)?.domain || 'firma.pl'}`} autoComplete="off" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Login (opcjonalnie)</label>
            <input value={form.username} onChange={set('username')} className={inputCls} placeholder="= adres e-mail" autoComplete="off" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Hasło</label>
            <input type="password" value={form.password} onChange={set('password')} className={inputCls} placeholder={form.id ? '•••• (bez zmiany)' : 'hasło skrzynki'} autoComplete="new-password" />
          </div>
          {error && <p className="col-span-2 text-[11px] text-red-400">{error}</p>}
          <div className="col-span-2 flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="px-3 py-1 text-[12px] rounded border border-white/10 text-gray-300 hover:bg-white/10">Anuluj</button>
            <button onClick={save} disabled={busy === 'save'} className="flex items-center gap-1 px-3 py-1 text-[12px] font-bold rounded border border-teal-500/50 bg-teal-600/20 text-teal-100 hover:bg-teal-600/30 disabled:opacity-50">
              {busy === 'save' && <Loader2 size={12} className="animate-spin" />} Zapisz i przetestuj
            </button>
          </div>
        </div>
      )}
      {!form && error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
