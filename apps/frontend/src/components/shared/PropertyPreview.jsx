import { useState, useEffect, useMemo, useRef } from 'react';
import { Trash2, Upload, MapPin, Hash, User, FileText, Eye, Clock, Image, Film, FileCode, ChevronDown, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_URL } from '../../config';
import DocumentViewer from './DocumentViewer';
import { importQaFormPdf } from './wbs/importQaFormPdf';

export default function PropertyPreview({ nodeId, versionId = null, searchQuery = '', isFinancialTab = false, isOfferTab = false, isDatasheetTab = false, onApprove = null, onDatasheetApprove = null }) {
    const [node, setNode] = useState(null);
    const [loading, setLoading] = useState(false);
    const [files, setFiles] = useState([]);
    const [treeFiles, setTreeFiles] = useState([]);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [showFileDropdown, setShowFileDropdown] = useState(false);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameSaving, setRenameSaving] = useState(false);
    const fileInputRef = useRef(null);
    const fileDropdownRef = useRef(null);
    const [qaImporting, setQaImporting] = useState(false);
    const [qaImportResult, setQaImportResult] = useState(null); // { ok: bool, msg: string }

    const isQaFile = (file) => file && /Q&A/i.test(file.fileName || '');

    const handleQaImport = async (file = selectedFile) => {
        if (!file?.id || !nodeId) return;
        setQaImporting(true);
        setQaImportResult(null);
        try {
            const token = sessionStorage.getItem('token');
            const [wbsRes, pdfRes] = await Promise.all([
                fetch(`${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/documents/download/${file.id}`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (!wbsRes.ok) throw new Error('Nie udało się pobrać struktury WBS');
            if (!pdfRes.ok) throw new Error('Nie udało się pobrać pliku PDF');
            const wbsJson = await wbsRes.json();
            const wbsItems = wbsJson.items || [];
            const buffer = await pdfRes.arrayBuffer();
            const updates = await importQaFormPdf(buffer, wbsItems);
            if (!updates.length) {
                setQaImportResult({ ok: false, msg: 'Brak nowych odpowiedzi' });
                return;
            }
            const results = await Promise.all(updates.map(({ nodeId: nid, qa }) =>
                fetch(`${API_URL}/wbs-nodes/${nid}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ qa }),
                })
            ));
            const failed = results.filter(r => !r.ok).length;
            if (failed) throw new Error(`${failed} z ${results.length} węzłów nie zostało zapisanych`);
            setQaImportResult({ ok: true, msg: `Zaimportowano (${updates.length} węzłów)` });
            window.dispatchEvent(new CustomEvent('wbs-qa-imported'));
        } catch (err) {
            console.error('[Import Q&A]', err);
            setQaImportResult({ ok: false, msg: 'Błąd: ' + err.message });
        } finally {
            setQaImporting(false);
        }
    };

    // Auto-import gdy wybrany plik zawiera "Q&A" w nazwie
    useEffect(() => {
        if (isQaFile(selectedFile)) handleQaImport(selectedFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFile?.id]);

    // Click-outside zamyka dropdown
    useEffect(() => {
        const onDocClick = (e) => {
            if (fileDropdownRef.current && !fileDropdownRef.current.contains(e.target)) setShowFileDropdown(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);
    const [listWidth, setListWidth] = useState(() => parseInt(localStorage.getItem('fileListWidth') || '176', 10));
    const dragging = useRef(false);
    const dragStartX = useRef(0);
    const dragStartWidth = useRef(0);
    useEffect(() => {
        const onMove = (e) => {
            if (!dragging.current) return;
            const delta = e.clientX - dragStartX.current;
            const w = Math.max(100, Math.min(480, dragStartWidth.current + delta));
            setListWidth(w);
            localStorage.setItem('fileListWidth', w);
        };
        const onUp = () => { dragging.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);

    const startRename = (file) => {
        setRenamingId(file.id);
        setRenameValue(file.fileName || '');
    };

    const cancelRename = () => {
        setRenamingId(null);
        setRenameValue('');
    };

    const commitRename = async () => {
        if (!renamingId) return;
        const newName = String(renameValue || '').trim();
        const current = files.find(f => f.id === renamingId);
        if (!newName || !current || newName === current.fileName) {
            cancelRename();
            return;
        }
        setRenameSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/documents/${renamingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ fileName: newName }),
            });
            if (res.ok) {
                setFiles(prev => prev.map(f => f.id === renamingId ? { ...f, fileName: newName } : f));
                if (selectedFile?.id === renamingId) setSelectedFile(prev => prev ? { ...prev, fileName: newName } : prev);
                cancelRename();
            } else {
                alert('Nie udało się zmienić nazwy pliku');
            }
        } catch (err) {
            console.error('Error renaming file:', err);
            alert('Błąd podczas zmiany nazwy pliku');
        } finally {
            setRenameSaving(false);
        }
    };

    const handleDeleteFile = async (fileId, fileName) => {
        if (!confirm(`Czy na pewno usunąć plik "${fileName}"?`)) return;

        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/documents/${fileId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                setFiles(prev => prev.filter(f => f.id !== fileId));
                if (selectedFile?.id === fileId) setSelectedFile(null);
                console.log(`[DELETE] File deleted: ${fileName}`);
            } else {
                alert('Nie udało się usunąć pliku');
            }
        } catch (err) {
            console.error('Error deleting file:', err);
            alert('Błąd podczas usuwania pliku');
        }
    };

    // Reset wybranego pliku przy zmianie węzła, żeby auto-otwierał się ostatni dokument nowego węzła
    useEffect(() => {
        setSelectedFile(null);
    }, [nodeId]);

    useEffect(() => {
        if (!nodeId) return;

        const fetchNode = async () => {
            setLoading(true);
            try {
                const token = sessionStorage.getItem('token');
                const res = await fetch(`${API_URL}/process-tree/${nodeId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setNode(data);
                }
            } catch (err) {
                console.error('Error fetching node details:', err);
            } finally {
                setLoading(false);
            }
        };

        const fetchNodeFiles = async () => {
            try {
                const token = sessionStorage.getItem('token');
                const category = isFinancialTab ? 'financial' : isOfferTab ? 'offer' : 'standard';
                const res = await fetch(`${API_URL}/documents/node/${nodeId}?category=${category}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setFiles(data);
                    // Auto-otwieranie ostatnio wgranego dokumentu (lista zwracana DESC po dacie)
                    if (data.length > 0) {
                        setSelectedFile(prev => prev || data[0]);
                    }
                }
            } catch (err) {
                console.error('Error fetching node files:', err);
                setFiles([]);
            }
        };

        fetchNode();
        fetchNodeFiles();
    }, [nodeId]);

    // Fetch all tree files when search query is active
    useEffect(() => {
        if (!searchQuery.trim() || !nodeId) {
            setTreeFiles([]);
            return;
        }
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/documents/tree/${nodeId}`, {
            headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.ok ? r.json() : []).then(setTreeFiles).catch(() => setTreeFiles([]));
    }, [nodeId, searchQuery]);

    const isSearching = !!searchQuery.trim();

    const filteredFiles = useMemo(() => {
        const source = isSearching ? treeFiles : files;
        if (!isSearching) return source;
        const q = searchQuery.toLowerCase();
        return source.filter(f => {
            const name = (f.fileName || '').toLowerCase();
            const dateFormatted = f.uploadedAt
                ? new Date(f.uploadedAt).toLocaleDateString('pl-PL')
                : '';
            const nodeName = (f.nodeName || '').toLowerCase();
            return name.includes(q) || dateFormatted.includes(q) || nodeName.includes(q);
        });
    }, [files, treeFiles, searchQuery, isSearching]);

    const handleDrag = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            setDragActive(false);
        }
    };

    const handleDrop = async (e) => {
        e.preventDefault(); e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await uploadFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleFileSelect = async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            await uploadFiles(Array.from(e.target.files));
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const uploadFiles = async (filesToUpload) => {
        setUploading(true);
        const token = sessionStorage.getItem('token');
        const category = isFinancialTab ? 'financial' : isOfferTab ? 'offer' : 'standard';
        let anySuccess = false;

        for (const file of filesToUpload) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('nodeId', nodeId);
            formData.append('category', category);

            try {
                const res = await fetch(`${API_URL}/documents/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                if (res.ok) anySuccess = true;
            } catch (err) {
                console.error('Upload error:', err);
            }
        }

        if (anySuccess) {
            try {
                const filesRes = await fetch(`${API_URL}/documents/node/${nodeId}?category=${category}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (filesRes.ok) {
                    const refreshed = await filesRes.json();
                    setFiles(refreshed);
                    // Automatycznie importuj odpowiedzi jeśli wgrany plik zawiera "Q&A"
                    const uploadedQaNames = new Set(filesToUpload.filter(f => /Q&A/i.test(f.name)).map(f => f.name));
                    if (uploadedQaNames.size > 0) {
                        const qaFile = refreshed.find(f => isQaFile(f) && uploadedQaNames.has(f.fileName));
                        if (qaFile) handleQaImport(qaFile);
                    }
                }
            } catch (err) {
                console.error('Error refreshing file list:', err);
            }
        }
        setUploading(false);
    };

    if (!nodeId) return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-50">
            <div className="text-4xl mb-4">🔍</div>
            <p>Wybierz element z menu, aby zobaczyć dokumentację</p>
        </div>
    );

    if (loading) return (
        <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div className="p-4 h-full flex flex-col gap-3 overflow-hidden animate-fade-in">
            {isFinancialTab && (
                <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300/80">
                    <span className="text-[10px] font-bold uppercase tracking-widest shrink-0">Pliki finansowe</span>
                    <span className="text-[10px] text-amber-300/60">Widoczne tylko dla managera i admina &nbsp;·&nbsp; Konwencja nazw ofert: <code className="bg-black/30 px-1 rounded text-amber-200">Oferta_NazwaSprzedawcy_NumerOferty.pdf</code></span>
                </div>
            )}
        <div
            className="flex-1 flex flex-col min-h-0 bg-gray-900/50 rounded-xl overflow-hidden border border-white/5 relative"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
        >
            {/* Górna belka sekcji — jak w Schemat */}
            <div className="h-12 border-b border-white/5 flex items-center px-3 gap-2 bg-black/20 flex-shrink-0">
                {/* Dropdown listy plików */}
                <div className="relative" ref={fileDropdownRef}>
                    <button
                        type="button"
                        onClick={() => setShowFileDropdown(v => !v)}
                        className={`w-[240px] flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                            showFileDropdown ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        <FileText size={13} className={isFinancialTab ? 'text-amber-400 shrink-0' : 'text-blue-400 shrink-0'} />
                        <span className="flex-1 truncate text-left">
                            {selectedFile ? selectedFile.fileName : (isFinancialTab ? 'Pliki finansowe' : 'Wybierz dokument')}
                        </span>
                        <span className="text-[10px] text-gray-500 shrink-0">({files.length})</span>
                        <ChevronDown size={12} className={`shrink-0 transition-transform ${showFileDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {showFileDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-80 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                            <div className="max-h-80 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
                                {filteredFiles.length === 0 ? (
                                    <div className="text-xs text-gray-500 text-center py-4">Brak dokumentów.</div>
                                ) : filteredFiles.map((file) => {
                                    const isRenaming = renamingId === file.id;
                                    return (
                                        <div
                                            key={file.id}
                                            onClick={() => { if (!isRenaming) { setSelectedFile(file); setShowFileDropdown(false); } }}
                                            className={`flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all group ${
                                                selectedFile?.id === file.id
                                                    ? 'bg-blue-500/20 text-blue-100'
                                                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                {isRenaming ? (
                                                    <input
                                                        autoFocus
                                                        value={renameValue}
                                                        disabled={renameSaving}
                                                        onChange={(e) => setRenameValue(e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                                                            else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                                                        }}
                                                        onBlur={commitRename}
                                                        className="w-full bg-black/40 border border-blue-500/40 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-blue-400"
                                                    />
                                                ) : (
                                                    <div
                                                        onDoubleClick={(e) => { e.stopPropagation(); startRename(file); }}
                                                        className="text-xs truncate select-none"
                                                        title="Dwuklik aby zmienić nazwę"
                                                    >
                                                        {file.fileName}
                                                    </div>
                                                )}
                                                <div className="text-[10px] opacity-60 mt-0.5">{new Date(file.uploadedAt).toLocaleDateString()}</div>
                                            </div>
                                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); startRename(file); }}
                                                    className="p-1 text-gray-500 hover:text-blue-400"
                                                    title="Zmień nazwę"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id, file.fileName); }}
                                                    className="p-1 text-gray-500 hover:text-red-400"
                                                    title="Usuń"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Prev/next navigation */}
                {files.length > 1 && (() => {
                    const idx = files.findIndex(f => f.id === selectedFile?.id);
                    const hasPrev = idx > 0;
                    const hasNext = idx !== -1 && idx < files.length - 1;
                    return <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                            onClick={() => { if (hasPrev) setSelectedFile(files[idx - 1]); }}
                            disabled={!hasPrev}
                            title="Poprzedni dokument"
                            className={`p-1.5 rounded-lg transition-colors ${hasPrev ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-700 cursor-not-allowed'}`}>
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-[10px] text-gray-500 tabular-nums px-0.5">{idx === -1 ? '-' : idx + 1}/{files.length}</span>
                        <button
                            onClick={() => { if (hasNext) setSelectedFile(files[idx + 1]); }}
                            disabled={!hasNext}
                            title="Następny dokument"
                            className={`p-1.5 rounded-lg transition-colors ${hasNext ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-700 cursor-not-allowed'}`}>
                            <ChevronRight size={14} />
                        </button>
                    </div>;
                })()}

                {qaImportResult && isQaFile(selectedFile) && (
                    <span className={`text-[10px] font-semibold flex-shrink-0 ${qaImportResult.ok ? 'text-green-400' : 'text-amber-400'}`}>
                        {qaImportResult.msg}
                    </span>
                )}

                {/* Upload */}
                <label
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg border cursor-pointer transition-all text-xs font-semibold flex-shrink-0 ${
                        dragActive
                            ? 'bg-blue-500/30 border-blue-400 text-blue-300 scale-105'
                            : 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border-blue-500/30 hover:border-blue-400'
                    }`}
                    title="Wgraj plik lub przeciągnij"
                >
                    <Upload size={14} />
                    {uploading ? 'Wgrywanie...' : dragActive ? 'Upuść plik' : 'Wgraj'}
                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} disabled={uploading} />
                </label>
            </div>

            {/* Obszar podglądu */}
            <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
                {selectedFile ? (
                    <DocumentViewer
                        fileUrl={`${API_URL}/documents/download/${selectedFile.id}`}
                        fileName={selectedFile.fileName}
                        mimeType={selectedFile.mimeType}
                        onClose={() => setSelectedFile(null)}
                        documentId={selectedFile.id}
                        token={sessionStorage.getItem('token')}
                        isOffer={isFinancialTab || isOfferTab || selectedFile.fileName?.toLowerCase().includes('oferta')}
                        isDatasheet={isDatasheetTab}
                        onApprove={onApprove}
                        onDatasheetApprove={onDatasheetApprove}
                        nodeId={nodeId}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 opacity-30 gap-4">
                        <Eye size={48} strokeWidth={1} />
                        <div className="text-center">
                            <p className="text-sm font-bold uppercase tracking-widest">Podgląd dokumentu</p>
                            <p className="text-[10px]">Wybierz plik z listy w górnej belce, aby zobaczyć jego zawartość</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
        </div>
    );
}
