import { useState, useEffect, useMemo, useRef } from 'react';
import { Trash2, Upload, MapPin, Hash, User, FileText, Eye, Clock, Activity, Image, Film, FileCode } from 'lucide-react';
import { API_URL } from '../../config';
import DocumentViewer from './DocumentViewer';

export default function PropertyPreview({ nodeId, searchQuery = '', isFinancialTab = false, isOfferTab = false, isDatasheetTab = false, onApprove = null, onDatasheetApprove = null }) {
    const [node, setNode] = useState(null);
    const [loading, setLoading] = useState(false);
    const [files, setFiles] = useState([]);
    const [treeFiles, setTreeFiles] = useState([]);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);
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
                    if (data.length > 0 && !selectedFile) {
                        // Optional: auto-select first file
                        // setSelectedFile(data[0]);
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
                if (filesRes.ok) setFiles(await filesRes.json());
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
        <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left Column: List + Upload */}
            <div
                className="flex flex-col gap-3 min-h-0 overflow-hidden shrink-0"
                style={{ width: isDatasheetTab ? listWidth : undefined, ...(isDatasheetTab ? {} : { minWidth: 220, maxWidth: 260, flex: '0 0 25%' }) }}
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FileText size={16} className={isFinancialTab ? 'text-amber-400' : 'text-blue-400'} />
                        {isFinancialTab ? 'Pliki finansowe' : 'Dokumentacja i pliki'}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
                        {files.length} PLIKÓW
                    </span>
                </div>

                {/* File List */}
                <div className="flex-1 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {filteredFiles.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-20 p-4">
                                <FileText size={32} className="mb-2" />
                                <span className="text-[10px] uppercase font-bold tracking-widest">Brak dokumentów</span>
                            </div>
                        ) : (
                            filteredFiles.map((file) => {
                                const isImg = file.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(file.fileName);
                                const isVid = file.mimeType?.startsWith('video/') || /\.(mp4|webm|ogg)$/i.test(file.fileName);
                                const isCode = file.mimeType === 'text/plain' || /\.(txt|json|js|ts|jsx|tsx|html|css|md|log)$/i.test(file.fileName);
                                const FileIcon = isImg ? Image : isVid ? Film : isCode ? FileCode : FileText;
                                return (
                                    <div
                                        key={file.id}
                                        onClick={() => setSelectedFile(file)}
                                        className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer group
                                            ${selectedFile?.id === file.id
                                                ? 'bg-blue-500/10 border-blue-500/30 text-white'
                                                : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/[0.05] hover:border-white/10'
                                            }`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedFile?.id === file.id ? 'bg-blue-500/20' : 'bg-white/5'}`}>
                                            <FileIcon size={16} className={selectedFile?.id === file.id ? 'text-blue-400' : 'text-gray-500'} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="truncate text-[11px] font-bold tracking-tight uppercase">{file.fileName}</div>
                                            <div className="flex items-center gap-2 mt-0.5 opacity-60">
                                                <Clock size={10} />
                                                <span className="text-[9px]">{new Date(file.uploadedAt).toLocaleDateString()}</span>
                                            </div>
                                            {file.nodeName && (
                                                <div className="mt-0.5">
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/20 rounded font-bold truncate block max-w-full">
                                                        {file.nodeCustomLabel || file.nodeType} · {file.nodeName}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id, file.fileName); }}
                                            className="p-1.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* AI Activity Log — ukryty w trybie datasheet */}
                {!isDatasheetTab && <div className="shrink-0 bg-white/[0.01] border border-white/5 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Activity size={12} className="text-emerald-400" />
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Logi Aktywności AI</h4>
                    </div>
                    <div className="flex flex-col gap-1.5 max-h-[90px] overflow-y-auto custom-scrollbar pr-1">
                        {files.slice(0, 5).map((f, i) => (
                            <div key={i} className="flex items-center justify-between py-0.5 border-b border-white/[0.02] last:border-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[9px] font-mono text-gray-600 shrink-0">[{new Date(f.uploadedAt).toLocaleTimeString()}]</span>
                                    <span className="text-[9px] text-emerald-500/80 truncate">{f.fileName}</span>
                                </div>
                                <span className="text-[9px] font-bold text-gray-700 px-1.5 py-0.5 rounded bg-white/5 uppercase shrink-0 ml-2">OK</span>
                            </div>
                        ))}
                        {files.length === 0 && (
                            <p className="text-[9px] text-gray-600 italic">Brak operacji.</p>
                        )}
                    </div>
                </div>}

                {/* Upload Area — na dole */}
                <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`shrink-0 border border-dashed rounded-xl py-8 px-3 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer relative
                        ${dragActive
                            ? 'border-blue-400 bg-blue-500/20'
                            : 'border-white/5 bg-white/[0.02] hover:border-blue-500/30 hover:bg-white/[0.04]'
                        }`}
                >
                    {uploading && (
                        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 rounded-xl">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                        </div>
                    )}
                    <Upload size={28} className="text-gray-500 shrink-0" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase text-center">Kliknij lub upuść pliki</span>
                    <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                </div>
            </div>

            {/* Resize handle */}
            {isDatasheetTab && (
                <div
                    className="w-1 shrink-0 cursor-col-resize bg-white/5 hover:bg-amber-500/40 active:bg-amber-500/60 transition-colors mx-1 rounded-full"
                    onMouseDown={(e) => {
                        dragging.current = true;
                        dragStartX.current = e.clientX;
                        dragStartWidth.current = listWidth;
                        document.body.style.cursor = 'col-resize';
                        document.body.style.userSelect = 'none';
                        e.preventDefault();
                    }}
                />
            )}
            {!isDatasheetTab && <div className="w-4 shrink-0" />}

            {/* Right Column: Preview */}
            <div className="flex-1 bg-black/40 rounded-2xl border border-white/10 overflow-hidden relative flex flex-col min-h-0">
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
                            <p className="text-[10px]">Wybierz plik z listy po lewej, aby zobaczyć jego zawartość</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
        </div>
    );
}
