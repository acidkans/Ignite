import { useState, useEffect, useCallback } from 'react';
import { X, Folder, ChevronRight, Loader2 } from 'lucide-react';
import { API_URL } from '../../config';

const token = () => sessionStorage.getItem('token') || localStorage.getItem('token');

// @anchor onedrive-folder-picker
// Modal wyboru katalogu OneDrive (konto usługowe aplikacji, przez `GET /onedrive/browse`).
// Wybierany jest katalog, w którym użytkownik aktualnie stoi. onPick({ id, driveId, name }).
export default function OneDriveFolderPicker({ open, onClose, onPick, title = 'Wybierz katalog OneDrive' }) {
  const [stack, setStack] = useState([{ id: null, name: 'OneDrive', driveId: '' }]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (parentId) => {
    setLoading(true); setError('');
    try {
      const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
      const r = await fetch(`${API_URL}/onedrive/browse${qs}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setItems(await r.json());
    } catch {
      setError('Nie udało się wczytać katalogów OneDrive.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStack([{ id: null, name: 'OneDrive', driveId: '' }]);
    load(null);
  }, [open, load]);

  if (!open) return null;
  const current = stack[stack.length - 1];

  const enter = (f) => { setStack((s) => [...s, { id: f.id, name: f.name, driveId: f.driveId }]); load(f.id); };
  const goTo = (i) => { const next = stack.slice(0, i + 1); setStack(next); load(next[i].id); };

  return (
    <div className="fixed inset-0 z-[150] bg-[#05070bcc] backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b0f17] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/10"><X size={14} /></button>
        </div>
        <div className="px-5 py-2 flex flex-wrap items-center gap-1 text-[11px] text-gray-400 border-b border-white/5">
          {stack.map((s, i) => (
            <span key={`${s.id}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={10} />}
              <button onClick={() => goTo(i)} className={i === stack.length - 1 ? 'text-white font-bold' : 'hover:text-white'}>{s.name}</button>
            </span>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-500"><Loader2 size={18} className="animate-spin" /></div>
          ) : error ? (
            <p className="text-xs text-red-400 p-3">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-gray-500 p-3">Brak podkatalogów</p>
          ) : items.map((f) => (
            <button key={f.id} onClick={() => enter(f)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-gray-200 hover:bg-white/5">
              <Folder size={14} className="text-amber-400 shrink-0" />
              <span className="flex-1 truncate">{f.name}</span>
              {f.childCount > 0 && <ChevronRight size={12} className="text-gray-500" />}
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500 truncate">Wybrany: {current.id ? current.name : '—'}</span>
          <button
            disabled={!current.id}
            onClick={() => onPick({ id: current.id, driveId: current.driveId || '', name: current.name })}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40"
          >
            Wybierz ten katalog
          </button>
        </div>
      </div>
    </div>
  );
}
