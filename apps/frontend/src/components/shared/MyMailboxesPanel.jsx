import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../../config';
import { Mail, Plus, Trash2, Loader2, CheckCircle2, AlertTriangle, PlugZap, ImagePlus, Send } from 'lucide-react';

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' });

// @anchor image-file-to-data-url
// Obrazek ze schowka / pliku → data:URI, zmniejszony do 600 px szerokości (logo w stopce nie musi być większe).
// GIF zostaje bez zmian, żeby nie zgubić animacji.
const imageFileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = reject;
  reader.onload = () => {
    if (file.type === 'image/gif') { resolve(reader.result); return; }
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, 600 / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// @anchor clean-pasted-html
// HTML wklejony z Outlooka/Worda: akapity <p class=MsoNormal> mają w Wordzie margines 0 z arkusza stylów,
// który ginie przy kopiowaniu — w mailu dostają domyślny odstęp 1em. Wpisujemy margin:0 wprost
// w akapit, wycinamy klasy Mso, <o:p>, komentarze i <style>. Kolory/czcionki inline zostają.
const cleanPastedHtml = (html) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, meta, link, script, title, xml').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => {
    if (n.tagName.includes(':')) { n.replaceWith(...n.childNodes); return; } // <o:p>, <v:shape>…
    n.removeAttribute('class');
    if (n.tagName === 'P') n.style.margin = '0';
  });
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments = []; while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
  return doc.body.innerHTML.replace(/<!--StartFragment-->|<!--EndFragment-->/g, '').trim();
};

// @anchor signature-editor
// Edytor podpisu (contentEditable): tekst z formatowaniem wklejonym np. z Outlooka, obrazek wklejony
// ze schowka (Ctrl+V) albo z pliku. Niekontrolowany — HTML wczytany raz, zmiany idą przez onChange.
// Klik w obrazek → suwak szerokości. Szerokość idzie w atrybut width i style (Outlook czyta atrybut).
function SignatureEditor({ value, onChange }) {
  const ref = useRef(null);
  const fileRef = useRef(null);
  const [selImg, setSelImg] = useState(null);   // zaznaczony <img> w edytorze
  const [imgWidth, setImgWidth] = useState(0);
  useEffect(() => { if (ref.current) ref.current.innerHTML = value || ''; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Znacznik zaznaczenia (data-sel) jest tylko do podświetlenia w edytorze — nie trafia do zapisu.
  const emit = () => onChange(ref.current.innerHTML.replace(/\sdata-sel="1"/g, ''));

  const selectImg = (img) => {
    ref.current?.querySelectorAll('img[data-sel]').forEach((i) => i.removeAttribute('data-sel'));
    setSelImg(img);
    if (img) { img.setAttribute('data-sel', '1'); setImgWidth(Math.round(img.getBoundingClientRect().width)); }
  };

  // @anchor signature-set-image-width
  const setWidth = (w) => {
    if (!selImg) return;
    const px = Math.max(20, Math.min(600, parseInt(w, 10) || 20));
    setImgWidth(px);
    selImg.setAttribute('width', px);
    selImg.removeAttribute('height');
    selImg.style.width = `${px}px`;
    selImg.style.height = 'auto';
    emit();
  };

  const insertImages = async (files) => {
    ref.current?.focus();
    for (const f of files) {
      const src = await imageFileToDataUrl(f).catch(() => null);
      if (!src) continue;
      // Startowo najwyżej 200 px — typowy rozmiar logo w stopce; suwakiem można powiększyć.
      const w = await new Promise((r) => { const i = new Image(); i.onload = () => r(Math.min(200, i.width)); i.onerror = () => r(200); i.src = src; });
      document.execCommand('insertHTML', false, `<img src="${src}" alt="" width="${w}" style="width:${w}px;height:auto;max-width:100%">`);
    }
    emit();
  };

  const onPaste = async (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    const html = e.clipboardData?.getData('text/html');
    if (files.length && !html) { e.preventDefault(); insertImages(files); return; }
    if (!html) return; // zwykły tekst — wkleja przeglądarka
    e.preventDefault();
    // Obrazki z Outlooka mają w HTML ścieżkę file:// / cid: — podmieniamy je kolejno na pliki ze schowka.
    const srcs = await Promise.all(files.map((f) => imageFileToDataUrl(f).catch(() => null)));
    const doc = new DOMParser().parseFromString(cleanPastedHtml(html), 'text/html');
    doc.querySelectorAll('img').forEach((img) => {
      if (/^(data:|https?:)/i.test(img.getAttribute('src') || '')) return;
      const src = srcs.shift();
      if (src) img.setAttribute('src', src); else img.remove();
    });
    ref.current?.focus();
    document.execCommand('insertHTML', false, doc.body.innerHTML);
    emit();
  };

  // @anchor signature-compact-paragraphs
  // Podpis wklejony przed czyszczeniem ma akapity z domyślnym odstępem — jednym klikiem zbijamy je.
  const compactParagraphs = () => {
    ref.current?.querySelectorAll('p').forEach((p) => { p.style.margin = '0'; });
    emit();
  };

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 focus-within:border-blue-500">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => { if (selImg && !ref.current.contains(selImg)) setSelImg(null); emit(); }}
        onPaste={onPaste}
        onClick={(e) => selectImg(e.target.tagName === 'IMG' ? e.target : null)}
        data-placeholder="Jan Kowalski · tel. … — wklej też logo (Ctrl+V)"
        className="min-h-[70px] max-h-[320px] overflow-auto rounded-t-lg bg-white px-3 py-2 text-[11pt] leading-normal text-black [font-family:Calibri,Arial,sans-serif] focus:outline-none overflow-x-hidden [&_p]:my-[1em] [&_a]:text-blue-700 [&_a]:underline [&_img]:!max-w-full [&_img]:!h-auto [&_img]:inline-block [&_img]:cursor-pointer [&_img[data-sel]]:outline [&_img[data-sel]]:outline-2 [&_img[data-sel]]:outline-blue-500 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
      />
      <div className="flex items-center gap-2 border-t border-white/5 px-1.5 py-1">
        {selImg ? (
          <>
            <span className="text-[11px] text-gray-400 shrink-0">Szerokość obrazka</span>
            <input type="range" min={20} max={600} step={5} value={imgWidth} onChange={(e) => setWidth(e.target.value)} className="flex-1 accent-teal-500" />
            <input type="number" min={20} max={600} value={imgWidth} onChange={(e) => setWidth(e.target.value)} className="w-14 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[11px] text-white" />
            <span className="text-[11px] text-gray-500">px</span>
          </>
        ) : (
          <span className="text-[11px] text-gray-600 flex-1">Kliknij obrazek, żeby zmienić jego wielkość.</span>
        )}
        <button type="button" onClick={compactParagraphs} title="Usuwa odstęp pod każdym akapitem (jak w Outlooku)" className="px-1.5 py-0.5 text-[11px] rounded text-gray-400 hover:text-white hover:bg-white/10 shrink-0">
          Zbij odstępy
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { insertImages([...e.target.files]); e.target.value = ''; }} />
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded text-gray-400 hover:text-white hover:bg-white/10">
          <ImagePlus size={12} /> Wstaw obrazek
        </button>
      </div>
    </div>
  );
}

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
  const [notice, setNotice] = useState(null);

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

  // @anchor my-mailboxes-send-test
  const sendTest = async (id) => {
    setBusy(`send:${id}`); setError(null); setNotice(null);
    try {
      const res = await fetch(`${API_URL}/mailboxes/me/${id}/send-test`, { method: 'POST', headers: authHeaders() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message || `Błąd (${res.status})`); return; }
      setNotice(`Wysłano mail testowy na ${d.to} — sprawdź skrzynkę odbiorczą.`);
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
      const { id, local, ...body } = form;
      body.email = emailOf(form);
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
    setForm({ domainId: d?.id || '', local: '', username: '', password: '', signatureHtml: '' });
    setError(null);
  };

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  // Adres = część przed „@” + domena wybrana w formularzu (wklejony pełny adres jest obcinany do części lokalnej).
  const emailOf = (f) => (f.local ? `${f.local}@${domainOf(f.domainId)?.domain || ''}` : '');
  // Login podąża za adresem, dopóki użytkownik nie wpisze własnego.
  const setEmail = (k) => (e) => setForm((p) => {
    const next = { ...p, [k]: k === 'local' ? e.target.value.split('@')[0].trim() : e.target.value };
    if (!p.username || p.username === emailOf(p)) next.username = emailOf(next);
    return next;
  });
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

      {/* Przy otwartym formularzu widać tylko edytowaną skrzynkę (przy dodawaniu — żadnej), żeby podpis się nie mieszał. */}
      {boxes.filter((b) => !form || b.id === form.id).map((b) => (
        <div key={b.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
          <div className="flex items-center gap-2">
            {b.verifiedAt ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> : <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-white truncate">{b.email}</p>
              <p className="text-[10px] text-gray-500">
                {b.domain?.label || b.domain?.domain}
                {b.signatureHtml ? ' · z podpisem' : ''}
                {b.verifiedAt ? ` · działa${b.sentFolder ? ` · Wysłane: ${b.sentFolder}` : ''}` : b.lastError ? ' · test nieudany' : b.hasPassword ? ' · nieprzetestowana' : ' · brak hasła'}
              </p>
            </div>
            <button onClick={() => test(b.id)} disabled={busy === b.id || !b.hasPassword} title="Sprawdź logowanie SMTP i IMAP" className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-40">
              {busy === b.id ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />} Testuj
            </button>
            <button onClick={() => sendTest(b.id)} disabled={busy === `send:${b.id}` || !b.hasPassword} title="Wyślij mail testowy z podpisem na ten adres" className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-40">
              {busy === `send:${b.id}` ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Mail testowy
            </button>
            <button onClick={() => { setForm({ id: b.id, domainId: b.domainId, local: b.email.split('@')[0], username: b.username || b.email, password: '', signatureHtml: b.signatureHtml || '' }); setError(null); }} className="px-2 py-1 text-[11px] rounded border border-white/10 text-gray-300 hover:bg-white/10">Edytuj</button>
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
              <select value={form.domainId} onChange={setEmail('domainId')} className={inputCls}>
                {freeDomains.map((d) => <option key={d.id} value={d.id}>@{d.domain}{d.label ? ` — ${d.label}` : ''}</option>)}
              </select>
            )}
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Adres e-mail</label>
            <div className="flex items-center gap-1">
              <input value={form.local} onChange={setEmail('local')} className={inputCls} placeholder="jan.kowalski" autoComplete="off" />
              <span className="text-[13px] text-gray-400 shrink-0">@{domainOf(form.domainId)?.domain || 'firma.pl'}</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Login (opcjonalnie)</label>
            <input value={form.username} onChange={set('username')} className={inputCls} placeholder="= adres e-mail" autoComplete="off" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Hasło</label>
            <input type="password" value={form.password} onChange={set('password')} className={inputCls} placeholder={form.id ? '•••• (bez zmiany)' : 'hasło skrzynki'} autoComplete="new-password" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Podpis</label>
            <SignatureEditor key={form.id || 'new'} value={form.signatureHtml} onChange={(html) => setForm((p) => ({ ...p, signatureHtml: html }))} />
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
      {!form && notice && <p className="text-[11px] text-emerald-400">{notice}</p>}
    </div>
  );
}
