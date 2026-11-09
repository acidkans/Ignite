import { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { Globe, Plus, Save, Trash2, Loader2, CheckCircle } from 'lucide-react';

const EMPTY = { domain: '', label: '', smtpHost: '', smtpPort: 587, smtpSecure: false, imapHost: '', imapPort: 993, imapSecure: true, isActive: true };

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' });

// @anchor mail-domains-panel
// ADMIN — domeny pocztowe firm (Airtel, Europrim…) z serwerem SMTP i IMAP wspólnym dla domeny.
// Użytkownicy dopisują w „Moje konto” tylko swój adres i hasło w tych domenach, a zamówienie
// wybiera domenę, z której wychodzą jego maile.
export default function MailDomainsPanel({ onChanged }) {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);       // { id?, ...pola } — otwarty formularz
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [savedId, setSavedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/mail-domains?all=true`, { headers: authHeaders() });
      if (res.ok) setDomains(await res.json());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // @anchor mail-domains-save
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const { id, mailboxCount: _c, createdAt: _a, updatedAt: _b, ...body } = edit;
      const res = await fetch(`${API_URL}/mail-domains${id ? `/${id}` : ''}`, {
        method: id ? 'PATCH' : 'POST', headers: authHeaders(), body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message || `Błąd (${res.status})`); return; }
      setEdit(null); setSavedId(d.id); setTimeout(() => setSavedId(null), 2500);
      load();
      onChanged?.();
    } catch {
      setError('Błąd połączenia z serwerem.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    setConfirmDelete(null);
    const res = await fetch(`${API_URL}/mail-domains/${d.id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) { load(); onChanged?.(); }
  };

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setEdit((p) => ({ ...p, [k]: v }));
  };

  const inputCls = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-all text-sm';
  const labelCls = 'block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1';

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl mx-auto mt-10">
      <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-gradient-to-br from-teal-600/10 to-blue-600/10 flex items-center gap-4">
        <div className="w-12 h-12 bg-teal-500/20 rounded-2xl flex items-center justify-center border border-teal-500/30">
          <Globe className="text-teal-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white">Domeny pocztowe firm</h3>
          <p className="text-xs text-teal-200/60">Serwery skrzynek firmowych. Z nich wychodzą maile zamówień (pytania do klienta) — każdy użytkownik ze swojej skrzynki w domenie zamówienia.</p>
        </div>
        {!edit && (
          <button onClick={() => { setEdit({ ...EMPTY }); setError(null); }} className="flex items-center gap-2 px-4 py-2 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-200 text-sm font-bold rounded-xl">
            <Plus size={16} /> Dodaj domenę
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm p-4"><Loader2 size={16} className="animate-spin" /> Ładowanie domen…</div>
      ) : (
        <div className="flex flex-col gap-2">
          {!domains.length && !edit && <p className="text-sm text-gray-500 px-2">Brak domen. Dodaj np. airtel.pl i europrim.pl.</p>}
          {domains.map((d) => (
            <div key={d.id} className={`glass-panel px-4 py-3 rounded-xl border bg-white/[0.02] flex items-center gap-4 ${d.isActive ? 'border-white/5' : 'border-white/5 opacity-50'}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-bold">
                  @{d.domain} {d.label && <span className="text-gray-400 font-normal">· {d.label}</span>}
                  {!d.isActive && <span className="ml-2 text-[10px] text-gray-500 uppercase">nieaktywna</span>}
                  {savedId === d.id && <CheckCircle size={14} className="inline ml-2 text-emerald-400" />}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  SMTP {d.smtpHost ? `${d.smtpHost}:${d.smtpPort ?? ''}${d.smtpSecure ? ' SSL' : ''}` : <span className="text-amber-400">brak</span>}
                  {' · '}IMAP {d.imapHost ? `${d.imapHost}:${d.imapPort ?? ''}${d.imapSecure ? ' SSL' : ''}` : <span className="text-amber-400">brak</span>}
                  {' · '}skrzynek: {d.mailboxCount}
                </div>
              </div>
              <button onClick={() => { setEdit({ ...d }); setError(null); }} className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-300 hover:bg-white/10">Edytuj</button>
              {confirmDelete === d.id ? (
                <span className="flex items-center gap-1 text-xs text-red-300">
                  Usunąć{d.mailboxCount ? ` (i ${d.mailboxCount} skrzynek)` : ''}?
                  <button onClick={() => remove(d)} className="px-2 py-1 rounded border border-red-500/40 hover:bg-red-500/20">TAK</button>
                  <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 rounded border border-white/10 hover:bg-white/10">NIE</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDelete(d.id)} title="Usuń domenę" className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {edit && (
        <section className="glass-panel p-5 rounded-2xl border border-teal-500/30 bg-white/[0.02] grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-3">
            <label className={labelCls}>Domena</label>
            <input value={edit.domain} onChange={set('domain')} className={inputCls} placeholder="airtel.pl" disabled={!!edit.id && edit.mailboxCount > 0} />
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>Nazwa firmy</label>
            <input value={edit.label || ''} onChange={set('label')} className={inputCls} placeholder="Airtel" />
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>Serwer SMTP (wysyłka)</label>
            <input value={edit.smtpHost || ''} onChange={set('smtpHost')} className={inputCls} placeholder="np. smtp.airtel.pl" />
          </div>
          <div>
            <label className={labelCls}>Port</label>
            <input type="number" value={edit.smtpPort ?? ''} onChange={set('smtpPort')} className={inputCls} placeholder="587" />
          </div>
          <label className="md:col-span-2 flex items-end pb-2 gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={!!edit.smtpSecure} onChange={set('smtpSecure')} className="w-4 h-4 accent-teal-500" /> SSL (port 465)
          </label>
          <div className="md:col-span-3">
            <label className={labelCls}>Serwer IMAP (Wysłane + odpowiedzi)</label>
            <input value={edit.imapHost || ''} onChange={set('imapHost')} className={inputCls} placeholder="np. imap.airtel.pl" />
          </div>
          <div>
            <label className={labelCls}>Port</label>
            <input type="number" value={edit.imapPort ?? ''} onChange={set('imapPort')} className={inputCls} placeholder="993" />
          </div>
          <label className="md:col-span-2 flex items-end pb-2 gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={!!edit.imapSecure} onChange={set('imapSecure')} className="w-4 h-4 accent-teal-500" /> SSL (port 993)
          </label>
          <label className="md:col-span-6 flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={!!edit.isActive} onChange={set('isActive')} className="w-4 h-4 accent-teal-500" /> Aktywna (do wyboru w zamówieniach i skrzynkach)
          </label>
          {error && <p className="md:col-span-6 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="md:col-span-6 flex justify-end gap-2">
            <button onClick={() => setEdit(null)} className="px-4 py-2 text-sm rounded-xl border border-white/10 text-gray-300 hover:bg-white/10">Anuluj</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-xl bg-teal-600/30 border border-teal-500/50 text-teal-100 hover:bg-teal-600/40 disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Zapisz domenę
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
