import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, FileText, FileSpreadsheet, FileImage, File, ExternalLink, RefreshCw, ChevronDown } from 'lucide-react';
import { API_URL } from '../../config';
import DocumentViewer from './DocumentViewer';

// @anchor onedrive-files-section
// Dropdown z listą plików z folderu OneDrive powiązanego z węzłem — w górnej belce, obok wyboru dokumentu.
// category: 'finanse' | 'dokumentacja'
// Jeśli folder niepowiązany lub brak plików — dropdown ukryty.
export default function OneDriveFilesSection({ nodeId, category = 'finanse' }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // @anchor onedrive-files-preview
  const [preview, setPreview] = useState(null); // { id, name, mimeType }
  const dropdownRef = useRef(null);

  const fetchFiles = useCallback(async () => {
    if (!nodeId) return;
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/onedrive/files/${nodeId}/${category}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setFiles([]); return; }
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      setError('Błąd pobierania plików OneDrive');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [nodeId, category]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // Click-outside zamyka dropdown
  useEffect(() => {
    const onDocClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Nie pokazuj dropdownu jeśli załadowano i brak plików
  if (loaded && !loading && files.length === 0 && !error) return null;
  if (!loaded && !loading) return null;

  const fileIcon = (name = '') => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['pdf'].includes(ext)) return <FileText size={14} className="text-red-400 shrink-0" />;
    if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileSpreadsheet size={14} className="text-green-400 shrink-0" />;
    if (['docx', 'doc'].includes(ext)) return <FileText size={14} className="text-blue-400 shrink-0" />;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <FileImage size={14} className="text-purple-400 shrink-0" />;
    return <File size={14} className="text-gray-400 shrink-0" />;
  };

  const fmtSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const folderLabel = category === 'finanse' ? 'pliki_finansowe' : 'dokumentacja_projektowa';

  const previewToken = sessionStorage.getItem('token') || localStorage.getItem('token');
  const previewUrl = preview
    ? `${API_URL}/onedrive/content/${nodeId}?itemId=${encodeURIComponent(preview.id)}&token=${encodeURIComponent(previewToken)}`
    : null;

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      {/* Przycisk dropdownu — styl jak wybór dokumentu */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-[220px] flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          open ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Cloud size={13} className="text-blue-400 shrink-0" />
        <span className="flex-1 truncate text-left">OneDrive — {folderLabel}</span>
        <span className="text-[10px] text-gray-500 shrink-0">({files.length})</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-96 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Pasek akcji dropdownu */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/8">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Pliki OneDrive</span>
            <button
              onClick={(e) => { e.stopPropagation(); fetchFiles(); }}
              className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
              title="Odśwież"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Lista plików */}
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            {loading && (
              <div className="px-4 py-3 text-[11px] text-gray-500 flex items-center gap-2">
                <RefreshCw size={11} className="animate-spin" /> Ładowanie…
              </div>
            )}
            {error && (
              <div className="px-4 py-2 text-[11px] text-red-400">{error}</div>
            )}
            {!loading && !error && files.length === 0 && (
              <div className="text-xs text-gray-500 text-center py-4">Brak plików.</div>
            )}
            {!loading && files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors group border-b border-white/[0.04] last:border-0"
              >
                {fileIcon(f.name)}
                <button
                  type="button"
                  onClick={() => { setPreview({ id: f.id, name: f.name, mimeType: f.file?.mimeType || '' }); setOpen(false); }}
                  className="flex-1 min-w-0 text-left text-[12px] text-gray-300 truncate hover:text-blue-300 transition-colors"
                  title={`Podgląd: ${f.name}`}
                >
                  {f.name}
                </button>
                <span className="text-[10px] text-gray-600 shrink-0 hidden group-hover:inline">{fmtDate(f.lastModifiedDateTime)}</span>
                <span className="text-[10px] text-gray-600 shrink-0 w-12 text-right">{fmtSize(f.size)}</span>
                {f.webUrl && (
                  <a
                    href={f.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-blue-500/20 text-gray-600 hover:text-blue-400 transition-colors shrink-0"
                    title="Otwórz w OneDrive"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal podglądu pliku OneDrive — DocumentViewer strumieniuje treść przez backend */}
      {preview && previewUrl && createPortal(
        <div
          className="fixed inset-0 z-[9990] bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setPreview(null); }}
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
