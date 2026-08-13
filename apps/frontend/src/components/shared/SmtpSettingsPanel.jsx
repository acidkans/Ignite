import { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { Save, CheckCircle, Mail, Server, Send, Loader2, ShieldCheck } from 'lucide-react';

// @anchor smtp-settings-panel
// Panel edycji ustawień SMTP — wspólny dla globalnej „Poczty SMTP" i zakładki „Urlopy SMTP".
// `profile` wybiera wiersz konfiguracji po stronie backendu ('singleton' | 'leaves').
// Hasło jest write-only: backend nie zwraca go nigdy (tylko flaga hasPassword),
// puste pole przy zapisie = bez zmiany hasła.
export default function SmtpSettingsPanel({
  profile = 'singleton',
  title = 'Poczta wychodząca (SMTP)',
  subtitle = 'Konfiguracja używana do wysyłki eksportów i powiadomień e-mail',
  note = null,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null); // { ok, text }
  const [form, setForm] = useState({
    host: '', port: 587, secure: false, username: '', password: '',
    fromEmail: '', fromName: '', replyTo: '',
  });

  const qs = `?profile=${encodeURIComponent(profile)}`;

  useEffect(() => { fetchSettings(); }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch(`${API_URL}/smtp${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setForm({
          host: d.host || '', port: d.port ?? 587, secure: !!d.secure,
          username: d.username || '', password: '',
          fromEmail: d.fromEmail || '', fromName: d.fromName || '', replyTo: d.replyTo || '',
        });
        setHasPassword(!!d.hasPassword);
      }
    } catch (e) {
      console.error('SMTP fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = sessionStorage.getItem('token');
      const payload = { ...form, port: form.port === '' ? null : Number(form.port) };
      if (!payload.password) delete payload.password; // write-only — nie nadpisuj pustym
      const res = await fetch(`${API_URL}/smtp${qs}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const d = await res.json();
        setHasPassword(!!d.hasPassword);
        setForm((p) => ({ ...p, password: '' }));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Błąd zapisu SMTP: ${err.message || res.status}`);
      }
    } catch (e) {
      alert('Błąd połączenia');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testTo.includes('@')) { setTestMsg({ ok: false, text: 'Podaj poprawny adres.' }); return; }
    setTesting(true); setTestMsg(null);
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch(`${API_URL}/smtp/test${qs}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo }),
      });
      if (res.ok) {
        setTestMsg({ ok: true, text: `Wysłano test na ${testTo}` });
      } else {
        const err = await res.json().catch(() => ({}));
        setTestMsg({ ok: false, text: err.message || `Błąd (${res.status})` });
      }
    } catch (e) {
      setTestMsg({ ok: false, text: 'Błąd połączenia z serwerem.' });
    } finally {
      setTesting(false);
    }
  };

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  if (loading) return (
    <div className="flex items-center justify-center p-20 text-gray-400">
      <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mr-3" />
      Ładowanie konfiguracji SMTP...
    </div>
  );

  const inputCls = 'w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-all text-sm';
  const labelCls = 'block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1';

  return (
    <div className="animate-fade-in flex flex-col gap-6 w-full max-w-4xl mx-auto">
      <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-gradient-to-br from-blue-600/10 to-purple-600/10 flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center border border-blue-500/30">
          <Mail className="text-blue-400" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <p className="text-xs text-blue-300 opacity-60">{subtitle}</p>
        </div>
      </div>

      {note && (
        <p className="text-xs text-amber-300/80 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
          {note}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <Server size={16} className="text-blue-400" />
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Serwer</h4>
          </div>
          <div>
            <label className={labelCls}>Host</label>
            <input name="host" value={form.host} onChange={onChange} className={inputCls} placeholder="np. smtp.gmail.com" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Port</label>
              <input name="port" type="number" value={form.port} onChange={onChange} className={inputCls} placeholder="587" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                <input name="secure" type="checkbox" checked={form.secure} onChange={onChange} className="w-4 h-4 accent-blue-500" />
                SSL/TLS (secure)
              </label>
            </div>
          </div>
          <p className="text-[9px] text-gray-500 -mt-1 ml-1">Port 465 → zaznacz SSL; port 587/25 → zwykle bez SSL (STARTTLS).</p>
        </section>

        <section className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={16} className="text-emerald-400" />
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Uwierzytelnianie</h4>
          </div>
          <div>
            <label className={labelCls}>Użytkownik (login)</label>
            <input name="username" value={form.username} onChange={onChange} className={inputCls} placeholder="np. konto@firma.pl" autoComplete="off" />
          </div>
          <div>
            <label className={labelCls}>Hasło</label>
            <input
              name="password" type="password" value={form.password} onChange={onChange}
              className={inputCls}
              placeholder={hasPassword ? '•••••• (zapisane — wpisz, aby zmienić)' : 'hasło SMTP'}
              autoComplete="new-password"
            />
          </div>
        </section>

        <section className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] md:col-span-2 flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail size={16} className="text-purple-400" />
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Nadawca</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Adres nadawcy (From)</label>
              <input name="fromEmail" value={form.fromEmail} onChange={onChange} className={inputCls} placeholder="noreply@firma.pl" />
            </div>
            <div>
              <label className={labelCls}>Nazwa nadawcy</label>
              <input name="fromName" value={form.fromName} onChange={onChange} className={inputCls} placeholder="GIGATEL ERP" />
            </div>
            <div>
              <label className={labelCls}>Reply-To (opcjonalnie)</label>
              <input name="replyTo" value={form.replyTo} onChange={onChange} className={inputCls} placeholder="kontakt@firma.pl" />
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-2">
          <input
            value={testTo} onChange={(e) => setTestTo(e.target.value)}
            className={`${inputCls} sm:w-64`} placeholder="adres do testu wysyłki"
          />
          <button
            onClick={handleTest} disabled={testing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 font-bold rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Wyślij test
          </button>
        </div>

        <button
          onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 active:scale-95 group"
        >
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : saved ? <CheckCircle size={18} className="text-emerald-300" />
              : <Save size={18} className="group-hover:scale-110 transition-transform" />}
          <span>{saving ? 'Zapisywanie...' : saved ? 'Zapisano!' : 'Zapisz ustawienia SMTP'}</span>
        </button>
      </div>

      {testMsg && (
        <p className={`text-xs rounded-lg px-3 py-2 border ${testMsg.ok ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
          {testMsg.text}
        </p>
      )}
    </div>
  );
}
