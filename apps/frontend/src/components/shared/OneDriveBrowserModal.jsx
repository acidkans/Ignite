import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, Folder, FileText, FileSpreadsheet, FileImage, File, ChevronRight, ArrowLeft, RefreshCw, X } from 'lucide-react';
import { API_URL } from '../../config';
import DocumentViewer from './DocumentViewer';

// @anchor onedrive-browser-modal
// Przeglądarka folderu OneDrive przypisanego do zamówienia — w modalu, bez przechodzenia na stronę
// OneDrive. Korzeniem jest folder zamówienia: wyżej wyjść się nie da (backend też tego pilnuje).
// Klik w plik otwiera podgląd w DocumentViewer (treść strumieniowana przez backend).
export default function OneDriveBrowserModal({ nodeId, folderName, onClose }) {
  // @anchor onedrive-browser-stack — ścieżka od folderu zamówienia (id null = korzeń zamówienia)
  const [stack, setStack] = useState([{ id: null, name: folderName || 'Folder zamówienia' }]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { id, name, mimeType }

  const current = stack[stack.length - 1];

  const load = useCallback(async (itemId) => {
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const qs = itemId ? `?itemId=${encodeURIComponent(itemId)}` : '';
      const res = await fetch(`${API_URL}/onedrive/items/${nodeId}${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
      setError('Nie udało się wczytać zawartości folderu.');
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => { load(current.id); }, [load, current.id]);

  // Esc zamyka podgląd, a bez podglądu cały modal
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (preview) setPreview(null); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, onClose]);

  const enter = (folder) => setStack(s => [...s, { id: folder.id, name: folder.name }]);
  const goTo = (index) => setStack(s => s.slice(0, index + 1));

  const fileIcon = (name = '') => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText size={16} className="text-red-400 shrink-0" />;
    if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileSpreadsheet size={16} className="text-green-400 shrink-0" />;
    if (['docx', 'doc'].includes(ext)) return <FileText size={16} className="text-blue-400 shrink-0" />;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return <FileImage size={16} className="text-purple-400 shrink-0" />;
    return <File size={16} className="text-gray-400 shrink-0" />;
  };

  const fmtSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

  const previewToken = sessionStorage.getItem('token') || localStorage.getItem('token');
  const previewUrl = preview
    ? `${API_URL}/onedrive/content/${nodeId}?itemId=${encodeURIComponent(preview.id)}&token=${encodeURIComponent(previewToken)}`
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {preview && previewUrl ? (
        <div className="w-full h-full max-w-[1600px] relative">
          <DocumentViewer
            fileUrl={previewUrl}
            fileName={preview.name}
            mimeType={preview.mimeType}
            nodeId={nodeId}
            token={previewToken}
            onClose={() => setPreview(null)}
          />
        </div>
      ) : (
        <div className="w-full max-w-3xl h-[80vh] flex flex-col bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <Cloud size={16} className="text-green-400 shrink-0" />
            <span className="text-sm font-bold text-gray-200 flex-1 truncate">OneDrive — folder zamówienia</span>
            <button type="button" onClick={() => load(current.id)} className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200" title="Odśwież">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200" title="Zamknij" aria-label="Zamknij">
              <X size={16} />
            </button>
          </div>

          {/* Breadcrumb — pierwszy element to folder zamówienia, wyżej nie ma nic */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] text-xs overflow-x-auto custom-scrollbar">
            <button
              type="button"
              onClick={() => goTo(stack.length - 2)}
              disabled={stack.length < 2}
              className="p-1 mr-1 rounded hover:bg-white/10 text-gray-400 disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
              title="Folder wyżej"
              aria-label="Folder wyżej"
            >
              <ArrowLeft size={14} />
            </button>
            {stack.map((s, i) => (
              <span key={`${s.id}-${i}`} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ChevronRight size={12} className="text-gray-600" />}
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  disabled={i === stack.length - 1}
                  className={`px-1.5 py-0.5 rounded ${i === stack.length - 1 ? 'text-gray-200 font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                >
                  {s.name}
                </button>
              </span>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading && (
              <div className="px-4 py-3 text-xs text-gray-500 flex items-center gap-2"><RefreshCw size={12} className="animate-spin" /> Ładowanie…</div>
            )}
            {!loading && error && <div className="px-4 py-3 text-xs text-red-400">{error}</div>}
            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-8 text-xs text-gray-500 text-center">Folder jest pusty.</div>
            )}
            {!loading && !error && items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => (it.isFolder ? enter(it) : setPreview({ id: it.id, name: it.name, mimeType: it.mimeType }))}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 border-b border-white/[0.04] last:border-0 transition-colors"
                title={it.isFolder ? `Otwórz folder ${it.name}` : `Podgląd: ${it.name}`}
              >
                {it.isFolder ? <Folder size={16} className="text-amber-400 shrink-0" /> : fileIcon(it.name)}
                <span className="flex-1 min-w-0 truncate text-[13px] text-gray-200">{it.name}</span>
                <span className="text-[11px] text-gray-500 shrink-0 w-20 text-right">{fmtDate(it.lastModified)}</span>
                <span className="text-[11px] text-gray-500 shrink-0 w-16 text-right">
                  {it.isFolder ? `${it.childCount} el.` : fmtSize(it.size)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
