import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, MapPin, Mic, Camera, FilePlus, Trash2, Save, ChevronDown, Download, Image as ImageIcon, CheckSquare, Square, Layers } from 'lucide-react';
import { API_URL } from '../../config';

// Flatten all WBS nodes recursively with path label
function flattenWbsNodes(nodes, prefix = '') {
    const result = [];
    nodes.forEach((n, i) => {
        const label = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
        result.push({ id: n.id, name: n.name || '(bez nazwy)', path: label });
        if (n.children?.length) result.push(...flattenWbsNodes(n.children, label));
    });
    return result;
}

export default function MarkerDetailsPanel({ marker, onClose, onRefresh, nodeId }) {
    const [uploading, setUploading] = useState(false);
    const [editName, setEditName] = useState(marker.name || '');
    const [editNote, setEditNote] = useState(marker.note || '');
    const [editingAttNote, setEditingAttNote] = useState(null);
    const [subtasks, setSubtasks] = useState([]);
    const [selectedSubtaskId, setSelectedSubtaskId] = useState(marker.subtaskId || '');
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    // WBS multi-assign
    const [wbsNodes, setWbsNodes] = useState([]);
    const [wbsLinks, setWbsLinks] = useState([]); // [{id, wbsNodeId, markerId}]
    const [wbsToggling, setWbsToggling] = useState(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const camInputRef = useRef(null);

    // Responsive check
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!nodeId) return;
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/subtasks/node/${nodeId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()).then(data => setSubtasks(Array.isArray(data) ? data : [])).catch(() => {});
    }, [nodeId]);

    const fetchWbsLinks = useCallback(async () => {
        const token = sessionStorage.getItem('token');
        const res = await fetch(`${API_URL}/schematics/marker-wbs-links/${marker.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) setWbsLinks(await res.json());
    }, [marker.id]);

    useEffect(() => {
        if (!nodeId) return;
        const token = sessionStorage.getItem('token');
        // Fetch WBS from relational table (same source as UnifiedWbsPanel)
        fetch(`${API_URL}/wbs-nodes/unified/${nodeId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()).then(data => {
            try {
                const items = data.items || [];
                // Build tree from flat list with parentId
                const byId = new Map(items.map(n => [n.id, { ...n, children: [] }]));
                const roots = [];
                for (const n of byId.values()) {
                    if (n.parentId && byId.has(n.parentId)) {
                        byId.get(n.parentId).children.push(n);
                    } else {
                        roots.push(n);
                    }
                }
                setWbsNodes(flattenWbsNodes(roots));
            } catch { setWbsNodes([]); }
        }).catch(() => {});
        fetchWbsLinks();
    }, [nodeId, fetchWbsLinks]);

    const toggleWbsLink = async (wbsNodeId) => {
        const token = sessionStorage.getItem('token');
        const existing = wbsLinks.find(l => l.wbsNodeId === wbsNodeId);
        setWbsToggling(wbsNodeId);
        try {
            if (existing) {
                await fetch(`${API_URL}/schematics/wbs-node-markers/${existing.id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setWbsLinks(prev => prev.filter(l => l.id !== existing.id));
            } else {
                const res = await fetch(`${API_URL}/schematics/wbs-node-markers`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wbsNodeId, markerId: marker.id })
                });
                if (res.ok) {
                    const link = await res.json();
                    setWbsLinks(prev => [...prev, link]);
                }
            }
        } finally {
            setWbsToggling(null);
        }
    };

    const handleSubtaskChange = async (e) => {
        const val = e.target.value || null;
        setSelectedSubtaskId(val || '');
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subtaskId: val })
        });
        onRefresh(true);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
            const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            const chunks = [];
            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = async () => {
                const actualType = recorder.mimeType || mimeType || 'audio/webm';
                const blob = new Blob(chunks, { type: actualType });
                const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: actualType });
                await uploadFile(file);
                stream.getTracks().forEach(track => track.stop());
            };
            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
        } catch (err) {
            alert('Błąd mikrofonu: ' + err.message);
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            setIsRecording(false);
        }
    };

    const startCamera = async () => {
        if (isMobile || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            camInputRef.current?.click();
            return;
        }
        setIsCameraActive(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 4096 }, height: { ideal: 2160 } }
            });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) {
            setIsCameraActive(false);
            camInputRef.current?.click();
        }
    };

    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
            if (videoRef.current?.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
            setIsCameraActive(false);
            await uploadFile(file);
        }, 'image/jpeg', 0.95);
    };

    const handleCapture = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        for (const file of files) {
            await uploadFile(file);
        }
    };

    const uploadFile = async (file) => {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/markers/${marker.id}/attachments`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            if (!res.ok) {
                let msg = `Błąd wgrywania (HTTP ${res.status})`;
                try { const body = await res.json(); msg += ': ' + (body.message || JSON.stringify(body)); } catch {}
                throw new Error(msg);
            }
            onRefresh(true);
        } catch (err) {
            alert(err.message);
        } finally {
            setUploading(false);
        }
    };

    const handleUpdateName = async () => {
        try {
            const token = sessionStorage.getItem('token');
            await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName })
            });
            onRefresh(true);
        } catch(err) { console.error(err); }
    };

    const handleUpdateNote = async () => {
        try {
            const token = sessionStorage.getItem('token');
            await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: editNote })
            });
            onRefresh(true);
        } catch(err) { console.error(err); }
    };

    const handleDeleteMarker = async () => {
        if (!window.confirm('Usunąć znacznik?')) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Nie udało się usunąć znacznika');
            onClose();
            await onRefresh();
        } catch (err) { 
            alert(err.message);
            console.error(err); 
        }
    };

    const handleUpdateAttachmentNote = async (id, note) => {
        try {
            const token = sessionStorage.getItem('token');
            await fetch(`${API_URL}/schematics/attachments/${id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ note })
            });
            setEditingAttNote(null);
            onRefresh(true);
        } catch(err) { console.error(err); }
    };

    const handleDeleteAttachment = async (id) => {
        if (!window.confirm('Usunąć załącznik?')) return;
        try {
            const token = sessionStorage.getItem('token');
            await fetch(`${API_URL}/schematics/attachments/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            onRefresh(true);
        } catch(err) { console.error(err); }
    };

    const getFileUrl = (fileName) => `${API_URL}/schematics/file/${fileName}`;

    const downloadFile = async (att) => {
        const url = getFileUrl(att.fileUrl);
        const token = sessionStorage.getItem('token');
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = att.fileName || att.fileUrl;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (err) { alert('Błąd pobierania: ' + err.message); }
    };

    const downloadAll = async () => {
        for (const att of marker.attachments || []) {
            await downloadFile(att);
        }
    };

    const panelClasses = isMobile 
        ? "fixed inset-x-0 bottom-0 bg-[#0f172a] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col z-[100] rounded-t-[32px] animate-in slide-in-from-bottom duration-300 max-h-[85vh]"
        : "absolute top-4 bottom-4 right-4 w-96 bg-[#0f172a] border border-white/10 shadow-2xl flex flex-col z-[60] rounded-[32px] animate-in slide-in-from-right duration-300";

    return (
        <>
            {isMobile && <div className="fixed inset-0 bg-black/80 z-[99]" onClick={onClose} />}
            
            <div className={panelClasses}>
                {isMobile && (
                    <div className="flex justify-center pt-3 pb-1" onClick={onClose}>
                        <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                    </div>
                )}

                <div className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/20 rounded-xl">
                            <MapPin size={20} className="text-orange-500" />
                        </div>
                        <h3 className="font-black text-sm tracking-tight text-white">Szczegóły znacznika</h3>
                    </div>
                    <button onClick={onClose} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all">
                        {isMobile ? <ChevronDown size={20}/> : <X size={20}/>}
                    </button>
                </div>

                <div className="px-6 flex-1 overflow-y-auto space-y-8 pb-8 no-scrollbar">
                    {/* Nazwa (tooltip) */}
                    <div className="space-y-3">
                        <label className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] px-1">NAZWA (tooltip)</label>
                        <input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onBlur={handleUpdateName}
                            className="w-full bg-[#1e293b]/50 border border-white/5 rounded-2xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-orange-500/50 transition-all shadow-inner placeholder:text-gray-600"
                            placeholder="Nazwa widoczna na mapie..."
                        />
                    </div>

                    {/* Przyciski dodawania załączników — zaraz pod nazwą */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em]">DODAJ</label>
                            {uploading && (
                                <div className="flex items-center gap-2 animate-pulse">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                    <span className="text-[10px] font-bold text-blue-500 uppercase">WYSYŁANIE...</span>
                                </div>
                            )}
                        </div>

                        {isCameraActive && (
                            <div className="relative bg-black rounded-3xl overflow-hidden border-2 border-blue-500/40 shadow-2xl mb-4">
                                <video ref={videoRef} autoPlay playsInline className="w-full h-auto aspect-square object-cover" />
                                <div className="absolute inset-x-0 bottom-6 flex justify-center">
                                    <button
                                        onClick={capturePhoto}
                                        className="bg-blue-600 text-white px-8 py-3 rounded-full text-xs font-black shadow-2xl active:scale-95 transition-all border border-blue-400/30"
                                    >
                                        ZRÓB ZDJĘCIE
                                    </button>
                                </div>
                                <canvas ref={canvasRef} className="hidden" />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`flex items-center justify-center gap-2 px-4 py-3 w-full rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-[#1e293b] text-gray-300 border border-white/5'}`}
                            >
                                <Mic size={16} className={isRecording ? 'text-white' : 'text-orange-500'} />
                                Głos
                            </button>

                            {isMobile ? (
                                <label className="flex items-center justify-center gap-2 px-4 py-3 w-full rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer bg-[#1e293b] text-gray-300 border border-white/5">
                                    <Camera size={16} className="text-orange-500" />
                                    Foto
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={handleCapture}
                                    />
                                </label>
                            ) : window.isSecureContext && navigator.mediaDevices?.getUserMedia ? (
                                <button
                                    onClick={isCameraActive ? () => setIsCameraActive(false) : startCamera}
                                    className={`flex items-center justify-center gap-2 px-4 py-3 w-full rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 ${isCameraActive ? 'bg-blue-600 text-white' : 'bg-[#1e293b] text-gray-300 border border-white/5'}`}
                                >
                                    <Camera size={16} className={isCameraActive ? 'text-white' : 'text-orange-500'} />
                                    Foto
                                </button>
                            ) : (
                                <label className="flex items-center justify-center gap-2 px-4 py-3 w-full rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer bg-[#1e293b] text-gray-300 border border-white/5">
                                    <Camera size={16} className="text-orange-500" />
                                    Foto
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={handleCapture}
                                    />
                                </label>
                            )}

                            <label className="flex items-center justify-center gap-2 px-4 py-3 w-full bg-[#1e293b] border border-white/5 text-gray-300 rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer">
                                <ImageIcon size={16} className="text-green-400" />
                                Galeria
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleCapture}
                                />
                            </label>

                            <label className="flex items-center justify-center gap-2 px-4 py-3 w-full bg-[#1e293b] border border-white/5 text-gray-300 rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer">
                                <FilePlus size={16} className="text-blue-400" />
                                + Plik
                                <input
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={handleCapture}
                                />
                            </label>
                        </div>
                    </div>

                    {/* Notatka */}
                    <div className="space-y-3">
                        <label className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] px-1">NOTATKA</label>
                        <textarea
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            onBlur={handleUpdateNote}
                            className="w-full bg-[#1e293b]/50 border border-white/5 rounded-2xl p-4 text-sm text-gray-100 resize-none h-32 focus:outline-none focus:border-blue-500/50 transition-all shadow-inner placeholder:text-gray-600"
                            placeholder="Wpisz tutaj swoje uwagi..."
                        />
                    </div>

                    {/* Przedmioty projektu (WBS) */}
                    {nodeId && wbsNodes.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 px-1">
                                <Layers size={12} className="text-gray-500" />
                                <label className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em]">
                                    PRZEDMIOTY PROJEKTU ({wbsLinks.length > 0 ? `${wbsLinks.length} przypisane` : 'brak'})
                                </label>
                            </div>
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                {wbsNodes.map(node => {
                                    const linked = wbsLinks.some(l => l.wbsNodeId === node.id);
                                    const toggling = wbsToggling === node.id;
                                    const indent = (node.path.split('.').length - 1) * 12;
                                    return (
                                        <button
                                            key={node.id}
                                            onClick={() => toggleWbsLink(node.id)}
                                            disabled={toggling}
                                            style={{ paddingLeft: `${12 + indent}px` }}
                                            className={`w-full flex items-center gap-2.5 py-2 pr-3 rounded-xl text-left text-xs transition-all ${
                                                linked
                                                    ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                                                    : 'bg-[#1e293b]/40 border border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                            } ${toggling ? 'opacity-50' : ''}`}
                                        >
                                            {linked
                                                ? <CheckSquare size={13} className="text-blue-400 flex-shrink-0" />
                                                : <Square size={13} className="text-gray-600 flex-shrink-0" />
                                            }
                                            <span className="font-mono text-[10px] text-gray-500 flex-shrink-0">{node.path}</span>
                                            <span className="truncate">{node.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Podgląd wszystkich załączników na dole */}
                    {marker.attachments?.length > 0 && (
                        <div className="space-y-3">
                            <label className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] px-1">ZAŁĄCZNIKI ({marker.attachments.length})</label>
                            <div className="grid grid-cols-2 gap-3">
                                {marker.attachments.map(att => (
                                    <div key={att.id} className="relative rounded-2xl overflow-hidden bg-[#1e293b] border border-white/5 group shadow-xl">
                                        <div className="aspect-square">
                                            {att.fileType === 'IMAGE' ? (
                                                <img src={getFileUrl(att.fileUrl)} className="w-full h-full object-cover" alt="attachment" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
                                                    {att.fileType === 'AUDIO' ? <Mic size={24} className="text-purple-400" /> : <Save size={24} className="text-gray-500" />}
                                                    <span className="text-[10px] text-center text-gray-400 truncate w-full px-2">{att.fileName}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Note overlay at bottom */}
                                        {editingAttNote?.id === att.id ? (
                                            <div className="bg-black/80 px-2 py-1.5 flex gap-1 items-center">
                                                <input
                                                    autoFocus
                                                    value={editingAttNote.note}
                                                    onChange={e => setEditingAttNote({ ...editingAttNote, note: e.target.value })}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleUpdateAttachmentNote(att.id, editingAttNote.note);
                                                        if (e.key === 'Escape') setEditingAttNote(null);
                                                    }}
                                                    className="flex-1 bg-transparent text-white text-[11px] outline-none placeholder:text-gray-500 min-w-0"
                                                    placeholder="Wpisz notatkę..."
                                                />
                                                <button onClick={() => handleUpdateAttachmentNote(att.id, editingAttNote.note)} className="text-blue-400 shrink-0"><Save size={12}/></button>
                                            </div>
                                        ) : (
                                            <div
                                                className="bg-black/60 px-2 py-1 cursor-pointer min-h-[26px] flex items-center"
                                                onClick={() => setEditingAttNote({ id: att.id, note: att.note || '' })}
                                            >
                                                <span className="text-[11px] text-gray-300 truncate w-full">
                                                    {att.note || <span className="text-gray-600 italic">+ notatka</span>}
                                                </span>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => handleDeleteAttachment(att.id)}
                                            className="absolute top-2 right-2 p-1.5 bg-black/60 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                        <button
                                            onClick={() => downloadFile(att)}
                                            className="absolute top-2 left-2 p-1.5 bg-black/60 text-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Download size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={downloadAll}
                                className="w-full flex items-center justify-center gap-2 py-3 mt-1 text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-2xl hover:bg-blue-500/20 active:scale-[0.98] transition-all"
                            >
                                <Download size={14} />
                                Pobierz wszystko ({marker.attachments.length})
                            </button>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/5 bg-black/10">
                    <button 
                        onClick={handleDeleteMarker}
                        className="w-full py-4 text-xs font-black uppercase tracking-widest text-red-500/80 hover:text-red-500 bg-red-500/5 rounded-2xl border border-red-500/10 active:scale-[0.98] transition-all"
                    >
                        Usuń znacznik
                    </button>
                </div>
            </div>
        </>
    );
}
