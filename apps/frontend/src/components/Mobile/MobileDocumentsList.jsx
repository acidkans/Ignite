import React, { useState, useEffect } from 'react';
import { FileText, FileSpreadsheet, FileImage, File, Download, X } from 'lucide-react';
import { API_URL } from '../../config';

const fileIcon = (name = '') => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText size={18} className="text-red-400 shrink-0" />;
    if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileSpreadsheet size={18} className="text-green-400 shrink-0" />;
    if (['docx', 'doc'].includes(ext)) return <FileText size={18} className="text-blue-400 shrink-0" />;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <FileImage size={18} className="text-purple-400 shrink-0" />;
    return <File size={18} className="text-gray-400 shrink-0" />;
};

const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

// @anchor mobile-documents-list
// Lista dokumentów węzła na telefonie — to samo źródło co zakładka Dokumentacja na desktopie
// (GET /documents/node/:nodeId?category=standard). Plik otwiera systemowa przeglądarka telefonu.
export default function MobileDocumentsList({ nodeId, nodeName, onClose }) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [openingId, setOpeningId] = useState(null);

    const token = sessionStorage.getItem('token') || localStorage.getItem('token');

    useEffect(() => {
        if (!nodeId) return;
        let cancelled = false;
        setLoading(true); setError('');
        fetch(`${API_URL}/documents/node/${nodeId}?category=standard`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then(data => { if (!cancelled) setFiles(Array.isArray(data) ? data : []); })
            .catch(() => { if (!cancelled) setError('Nie udało się pobrać listy dokumentów'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [nodeId, token]);

    // Download wymaga nagłówka Authorization — pobieramy blob i oddajemy go telefonowi jako plik
    const openFile = async (file) => {
        setOpeningId(file.id);
        try {
            const res = await fetch(`${API_URL}/documents/download/${file.id}/${encodeURIComponent(file.fileName)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(String(res.status));
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch {
            setError(`Nie udało się otworzyć: ${file.fileName}`);
        } finally {
            setOpeningId(null);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-gray-900/60 shrink-0">
                <span className="font-black text-xs truncate">{nodeName}</span>
                {onClose && (
                    <button onClick={onClose} className="p-2 bg-white/10 rounded-xl text-white active:scale-90 transition-all shrink-0 ml-auto">
                        <X size={16} />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {error && <p className="text-red-400 text-xs px-2 py-2">{error}</p>}
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="w-6 h-6 border-2 border-gray-500/30 border-t-gray-400 rounded-full animate-spin" />
                    </div>
                ) : files.length === 0 ? (
                    <p className="text-center text-gray-600 text-sm mt-10">Brak dokumentów</p>
                ) : (
                    <div className="space-y-1">
                        {files.map(f => (
                            <button
                                key={f.id}
                                onClick={() => openFile(f)}
                                disabled={openingId === f.id}
                                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.03] border border-white/5 active:bg-white/10 text-left disabled:opacity-50"
                            >
                                {fileIcon(f.fileName)}
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] leading-snug break-words">{f.fileName}</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                        {[f.oneDrive?.folderPath, formatSize(f.fileSize), f.uploadedAt && new Date(f.uploadedAt).toLocaleDateString('pl-PL')].filter(Boolean).join(' · ')}
                                    </div>
                                </div>
                                {openingId === f.id
                                    ? <div className="w-4 h-4 border-2 border-gray-500/30 border-t-gray-300 rounded-full animate-spin shrink-0" />
                                    : <Download size={16} className="text-gray-500 shrink-0" />}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
