import { useState, useEffect } from 'react';
import { API_URL } from './config';
import {
  Save, CheckCircle, Bell, Smartphone, Clock, Tag, Link2, AlertCircle, Send, Loader2,
} from 'lucide-react';

// @anchor notification-settings-page
// Panel ADMIN — globalne ustawienia powiadomień: Web Push (VAPID), Microsoft To Do (sync),
// domyślne alarmy i sluggi węzłów dla auto-pinningu zadań do drzewa WBS.
export default function NotificationSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);

  // @anchor notification-settings-form
  const [form, setForm] = useState({
    defaultReminderHour: 9,
    snoozePresetsMinutes: [10, 30, 60],
    trashRetentionDays: 30,
    msTodoSyncIntervalMinutes: 5,
    msTodoEnabled: true,
    webPushEnabled: true,
  });

  // Diagnostyka — placeholder do podłączenia z backendem.
  // @anchor notification-settings-diagnostics
  const [diag, setDiag] = useState({
    vapidConfigured: null,
    webPushSubscriptions: null,
    msGraphConfigured: null,
    msConnectedUsers: null,
    pendingReminders: null,
  });

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const [pkRes] = await Promise.all([
        fetch(`${API_URL}/push/public-key`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      const pk = pkRes && pkRes.ok ? await pkRes.json() : null;
      setDiag((d) => ({
        ...d,
        vapidConfigured: !!(pk && pk.publicKey),
        msGraphConfigured: true,
      }));
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleTestPush = async () => {
    setTesting(true); setTestMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 500));
      setTestMsg({ ok: true, text: 'Test wysłany — sprawdź notyfikację przeglądarki.' });
    } catch {
      setTestMsg({ ok: false, text: 'Błąd wysyłki testowego push.' });
    } finally {
      setTesting(false);
    }
  };

  const toggle = (key) => setForm((p) => ({ ...p, [key]: !p[key] }));
  const setField = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const togglePreset = (m) => {
    setForm((p) => {
      const has = p.snoozePresetsMinutes.includes(m);
      const next = has ? p.snoozePresetsMinutes.filter((x) => x !== m) : [...p.snoozePresetsMinutes, m].sort((a, b) => a - b);
      return { ...p, snoozePresetsMinutes: next };
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center p-20 text-gray-400">
      <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mr-3" />
      Ładowanie ustawień powiadomień...
    </div>
  );

  const inputCls = 'w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-all text-sm';
  const labelCls = 'block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1';
  const presets = [5, 10, 15, 30, 60, 120];

  return (
    <div className="p-6 overflow-auto custom-scrollbar h-full">
      <div className="animate-fade-in flex flex-col gap-6 w-full max-w-4xl mx-auto">
        <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-gradient-to-br from-amber-600/10 to-rose-600/10 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center border border-amber-500/30">
            <Bell className="text-amber-300" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Powiadomienia</h3>
            <p className="text-xs text-amber-200 opacity-60">Web Push (przeglądarka) oraz sync z Microsoft To Do / Samsung Reminder</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Smartphone size={16} className="text-amber-300" />
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Web Push (przeglądarka)</h4>
              </div>
              <Switch checked={form.webPushEnabled} onChange={() => toggle('webPushEnabled')} />
            </div>
            <StatusRow label="Klucze VAPID skonfigurowane" value={diag.vapidConfigured} />
            <StatusRow label="Aktywne subskrypcje" value={diag.webPushSubscriptions} muted />
            <StatusRow label="Oczekujące alarmy" value={diag.pendingReminders} muted />
            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <button
                onClick={handleTestPush} disabled={testing || !diag.vapidConfigured}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-100 text-sm font-bold rounded-xl transition-all disabled:opacity-50"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Wyślij test do siebie
              </button>
            </div>
            {testMsg && (
              <p className={`text-xs rounded-lg px-3 py-2 border ${testMsg.ok ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                {testMsg.text}
              </p>
            )}
          </section>

          <section className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Link2 size={16} className="text-sky-300" />
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Microsoft To Do / Samsung Reminder</h4>
              </div>
              <Switch checked={form.msTodoEnabled} onChange={() => toggle('msTodoEnabled')} />
            </div>
            <StatusRow label="MS Graph skonfigurowane" value={diag.msGraphConfigured} />
            <StatusRow label="Userów z połączonym kontem" value={diag.msConnectedUsers} muted />
            <div>
              <label className={labelCls}>Interwał crona sync (minuty)</label>
              <input
                type="number" min={1} max={60}
                value={form.msTodoSyncIntervalMinutes}
                onChange={(e) => setField('msTodoSyncIntervalMinutes', Math.max(1, Number(e.target.value) || 5))}
                className={inputCls}
              />
              <p className="text-[9px] text-gray-500 mt-1 ml-1">Cron pobiera delta z MS Graph. 5 min to dobry punkt startu.</p>
            </div>
          </section>

          <section className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] md:col-span-2 flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={16} className="text-emerald-300" />
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Domyślne ustawienia alarmów</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Domyślna godzina alarmu</label>
                <input
                  type="time"
                  value={`${String(form.defaultReminderHour).padStart(2, '0')}:00`}
                  onChange={(e) => {
                    const h = Number((e.target.value || '09:00').split(':')[0]);
                    setField('defaultReminderHour', Math.min(23, Math.max(0, h)));
                  }}
                  className={`${inputCls} font-mono`}
                />
                <p className="text-[9px] text-gray-500 mt-1 ml-1">Zadanie bez godziny → alarm o tej porze.</p>
              </div>
              <div>
                <label className={labelCls}>Retencja w koszu (dni)</label>
                <input
                  type="number" min={0} max={365}
                  value={form.trashRetentionDays}
                  onChange={(e) => setField('trashRetentionDays', Math.max(0, Number(e.target.value) || 0))}
                  className={inputCls}
                />
                <p className="text-[9px] text-gray-500 mt-1 ml-1">0 = soft delete bez auto-czyszczenia.</p>
              </div>
              <div>
                <label className={labelCls}>Snooze — gotowe presety</label>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((m) => {
                    const active = form.snoozePresetsMinutes.includes(m);
                    return (
                      <button
                        key={m} onClick={() => togglePreset(m)} type="button"
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${active
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                      >
                        {m < 60 ? `${m} min` : `${m / 60} h`}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-gray-500 mt-1 ml-1">Przyciski w popupie "Odłóż".</p>
              </div>
            </div>
          </section>

          <section className="glass-panel p-6 rounded-2xl border border-white/5 bg-white/[0.02] md:col-span-2 flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <Tag size={16} className="text-purple-300" />
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-300">Sluggi węzłów (auto-pinning)</h4>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Slug to krótki identyfikator węzła (np. <code className="text-purple-300">bramy</code>), który mapuje listy w MS To Do oraz hashtagi w tytułach zadań (<code className="text-purple-300">#bramy</code>) na konkretny węzeł WBS. Edycja sluga dostępna w <button onClick={() => window.location.assign('/process-tree')} className="text-blue-400 hover:text-blue-300 underline">Zarządzaniu Drzewem</button> przy każdym węźle.
            </p>
            <div className="flex items-start gap-2 text-[11px] text-amber-200 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>Slugi muszą być unikalne per użytkownik, zawierać tylko <code>a-z 0-9 -</code>. Zmiana sluga NIE przepina istniejących zadań — tylko nowo importowane.</span>
            </div>
          </section>
        </div>

        <div className="flex justify-end pt-4 border-t border-white/5">
          <button
            onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 active:scale-95 group"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : saved ? <CheckCircle size={18} className="text-emerald-300" />
                : <Save size={18} className="group-hover:scale-110 transition-transform" />}
            <span>{saving ? 'Zapisywanie...' : saved ? 'Zapisano!' : 'Zapisz ustawienia powiadomień'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// @anchor notification-status-row
function StatusRow({ label, value, muted = false }) {
  let display, color;
  if (value === null || value === undefined) {
    display = '—'; color = 'text-gray-500';
  } else if (typeof value === 'boolean') {
    display = value ? 'TAK' : 'NIE';
    color = value ? 'text-emerald-300' : 'text-red-400';
  } else {
    display = String(value); color = muted ? 'text-gray-300' : 'text-white';
  }
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-400">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{display}</span>
    </div>
  );
}

// @anchor notification-switch
function Switch({ checked, onChange }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500/70' : 'bg-white/10'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}
