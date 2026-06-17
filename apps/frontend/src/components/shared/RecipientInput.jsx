import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { fetchRecipients } from '../../utils/exportMail';

// @anchor recipient-input
// Pole odbiorców maila (chipy) z podpowiedziami: zespół + kontakty danego zamówienia (nodeId).
export default function RecipientInput({ value = [], onChange, nodeId }) {
  const [suggestions, setSuggestions] = useState([]);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchRecipients(nodeId).then((r) => { if (alive) setSuggestions(Array.isArray(r) ? r : []); });
    return () => { alive = false; };
  }, [nodeId]);

  const add = (email) => {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !e.includes('@')) return;
    if (!value.includes(e)) onChange([...value, e]);
    setText('');
  };
  const remove = (email) => onChange(value.filter((v) => v !== email));

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    return suggestions
      .filter((s) => !value.includes(s.email))
      .filter((s) => !q || s.email.includes(q) || (s.label || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [suggestions, text, value]);

  const inputCls = 'flex-1 min-w-[140px] bg-transparent border-none text-white text-sm focus:outline-none placeholder:text-gray-500';

  return (
    <div className="relative">
      <div className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2 flex flex-wrap items-center gap-1.5 focus-within:border-blue-500 transition-all">
        {value.map((e) => (
          <span key={e} className="flex items-center gap-1 bg-blue-500/15 border border-blue-500/30 text-blue-200 text-xs rounded-lg px-2 py-0.5">
            {e}
            <button type="button" onClick={() => remove(e)} className="hover:text-white"><X size={11} /></button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ') && text.trim()) {
              e.preventDefault(); add(text);
            } else if (e.key === 'Backspace' && !text && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          placeholder={value.length ? '' : 'wpisz e-mail lub wybierz z podpowiedzi…'}
          className={inputCls}
        />
      </div>

      {focused && filtered.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 max-h-56 overflow-y-auto custom-scrollbar bg-[#0b0f17] border border-white/10 rounded-xl shadow-2xl">
          {filtered.map((s) => (
            <button
              type="button"
              key={s.email}
              onMouseDown={(e) => { e.preventDefault(); add(s.email); }}
              className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between gap-2"
            >
              <span className="min-w-0">
                <span className="block text-sm text-gray-200 truncate">{s.label || s.email}</span>
                <span className="block text-[11px] text-gray-500 truncate">{s.email}</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-gray-500 flex-shrink-0">{s.source}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
