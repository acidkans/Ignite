import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../../config';
import { 
    Upload, X, MapPin, Map as MapIcon, Image as ImageIcon, Mic, Trash2,
    Minus, Type, ZoomIn, ZoomOut, Maximize, Minimize2, Hand, Camera, Save, List
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import MarkerDetailsPanel from './MarkerDetailsPanel';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const pdfOptions = {
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    disableXFA: true,
    enableXfa: false,
    stopAtErrors: false,
};

export default function SchematicViewer({ nodeId, subtaskId, initialSchematics = [] }) {
    const [schematics, setSchematics] = useState(initialSchematics);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    
    const [selectedSchematic, setSelectedSchematic] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);

    const [selectedMarker, setSelectedMarker] = useState(null);
    const [isAddingMarker, setIsAddingMarker] = useState(false);
    const [activeTool, setActiveTool] = useState('POINT'); 
    const [lineStart, setLineStart] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1.0);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
    const pinchRef = useRef({ dist: null, scale: 1.0 });

    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [showTable, setShowTable] = useState(false);
    const [hoveredMarkerId, setHoveredMarkerId] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const pageRef = useRef(null);
    const containerRef = useRef(null);
    const toolbarRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(800);
    const [toolbarHeight, setToolbarHeight] = useState(72);

    useEffect(() => {
        if (!toolbarRef.current) return;
        const obs = new ResizeObserver(e => setToolbarHeight(e[0]?.contentRect.height || 72));
        obs.observe(toolbarRef.current);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 1024);
        };
        window.addEventListener('resize', handleResize);

        const observer = new ResizeObserver((entries) => {
            if (entries[0]?.contentRect) {
                const padding = window.innerWidth < 768 ? 0 : 64;
                setContainerWidth(entries[0].contentRect.width - padding);
            }
        });
        if (containerRef.current) observer.observe(containerRef.current);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        if (nodeId || subtaskId) fetchSchematics();
    }, [nodeId, subtaskId]);

    // Aktualizuj selectedMarker gdy schematics się zmienią (np. po dodaniu załącznika)
    const viewerSyncRef = useRef(null);
    useEffect(() => {
        if (selectedMarker && schematics) {
            const updatedSchematic = schematics.find(s => s.markers?.some(m => m.id === selectedMarker.id));
            if (updatedSchematic) {
                const updatedMarker = updatedSchematic.markers.find(m => m.id === selectedMarker.id);
                if (!updatedMarker) return;
                // Porównaj lekki podpis zamiast pełnego stringify (unika pętli renderowania)
                const sig = `${(updatedMarker.attachments || []).length}:${updatedMarker.name}:${updatedMarker.note || ''}`;
                if (sig !== viewerSyncRef.current) {
                    viewerSyncRef.current = sig;
                    setSelectedMarker(updatedMarker);
                }
            }
            // nie zerujemy selectedMarker gdy schemat nie jest znaleziony przy odświeżaniu
            // (panel zamykamy tylko przez onClose lub usunięcie znacznika)
        }
    }, [schematics]);

    const fetchSchematics = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const token = sessionStorage.getItem('token');
            let data = [];
            
            if (subtaskId) {
                const res = await fetch(`${API_URL}/schematics/subtask/${subtaskId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) data = await res.json();
            }

            if (data.length === 0 && nodeId) {
                const res = await fetch(`${API_URL}/schematics/node/${nodeId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) data = await res.json();
            }

            if (data.length > 0) {
                setSchematics(data);
                if (selectedSchematic) {
                    const updated = data.find(s => s.id === selectedSchematic.id);
                    if (updated) {
                        setSelectedSchematic(updated);
                        setSelectedMarker(prev => prev ? (updated.markers.find(m => m.id === prev.id) || prev) : null);
                    }
                } else {
                    setSelectedSchematic(data[0]);
                    setPageNumber(1);
                }
            }
            return data;
        } catch (err) {
            console.error(err);
            return [];
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('nodeId', nodeId);
        if (subtaskId) formData.append('subtaskId', subtaskId);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            if (!res.ok) throw new Error('Błąd wgrywania');
            await fetchSchematics();
        } catch (err) { alert(err.message); } finally { setUploading(false); }
    };

    const handleMouseMove = (e) => {
        if (isPanningRef.current && containerRef.current) {
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            const dx = clientX - panStartRef.current.x;
            const dy = clientY - panStartRef.current.y;
            containerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
            containerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
            return;
        }
        if ((!isAddingMarker || activeTool !== 'LINE' || !lineStart) && !pageRef.current) return;
        const rect = pageRef.current?.getBoundingClientRect();
        if (!rect) return;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        setMousePos({
            x: ((clientX - rect.left) / rect.width) * 100,
            y: ((clientY - rect.top) / rect.height) * 100
        });
    };

    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            pinchRef.current = { dist: Math.hypot(dx, dy), scale };
            isPanningRef.current = false;
        } else if (e.touches.length === 1) {
            const touch = e.touches[0];
            panStartRef.current = {
                x: touch.clientX,
                y: touch.clientY,
                scrollLeft: containerRef.current?.scrollLeft || 0,
                scrollTop: containerRef.current?.scrollTop || 0
            };
            if (!isAddingMarker) isPanningRef.current = true;
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && pinchRef.current.dist !== null) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const newDist = Math.hypot(dx, dy);
            const newScale = Math.min(5.0, Math.max(0.25, pinchRef.current.scale * (newDist / pinchRef.current.dist)));
            setScale(newScale);
            return;
        }
        handleMouseMove(e);
    };

    const handleTouchEnd = (e) => {
        if (e.touches.length < 2) pinchRef.current.dist = null;
        if (e.touches.length === 0) isPanningRef.current = false;
    };

    const handlePageClick = async (e) => {
        if (activeTool === 'MOVE' || !isAddingMarker || !selectedSchematic || !pageRef.current) return;
        
        const rect = pageRef.current.getBoundingClientRect();
        const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
        const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);

        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;

        if (activeTool === 'LINE' && !lineStart) {
            setLineStart({ x, y });
            return;
        }

        const newMarkerData = {
            type: activeTool,
            x: activeTool === 'LINE' ? lineStart.x : x,
            y: activeTool === 'LINE' ? lineStart.y : y,
            x2: activeTool === 'LINE' ? x : null,
            y2: activeTool === 'LINE' ? y : null,
            pageNumber,
            note: ''
        };

        setIsAddingMarker(false);
        setLineStart(null);
        setLoading(true);

        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/${selectedSchematic.id}/markers`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(newMarkerData)
            });
            if (!res.ok) throw new Error('Błąd zapisu');
            
            const freshData = await fetchSchematics();
            
            const updatedSchematic = freshData.find(s => s.id === selectedSchematic.id);
            if (updatedSchematic) {
                const markers = updatedSchematic.markers;
                if (markers.length > 0) {
                    const newest = [...markers].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
                    setSelectedMarker(newest);
                }
            }
        } catch (err) { alert(err.message); } finally { setLoading(false); }
    };

    const getFileUrl = (fileName) => `${API_URL}/schematics/file/${fileName}`;

    const isImageFile = (fileName) => /\.(jpg|jpeg|png|webp)$/i.test(fileName || '');

    return (
        <div className={`flex flex-col bg-[#020617] relative ${isFullscreen ? 'fixed inset-0 z-[200]' : 'min-h-[70vh] md:h-full md:min-h-0'}`}>
            {/* Toolbar */}
            <div ref={toolbarRef} className={`border-b md:border-b-0 md:border-t border-white/5 bg-slate-900/50 backdrop-blur-2xl z-40 ${isMobile ? 'order-2 px-2 py-2' : 'p-4 flex flex-row gap-3 items-center justify-between'}`}>

                {/* Mobile: jeden kompaktowy rząd */}
                {isMobile ? (
                    <div className="flex items-center gap-1.5 w-full overflow-x-auto no-scrollbar">
                        {/* Wybór pliku */}
                        <select
                            value={selectedSchematic?.id || ''}
                            onChange={(e) => { const sch = schematics.find(s => s.id === e.target.value); setSelectedSchematic(sch); setPageNumber(1); }}
                            className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-gray-200 focus:outline-none"
                        >
                            {schematics.map(s => <option key={s.id} value={s.id}>{s.fileName}</option>)}
                            {schematics.length === 0 && <option value="">Brak</option>}
                        </select>

                        {/* Upload */}
                        <label className="p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl cursor-pointer active:scale-95 shrink-0">
                            <Upload size={14}/>
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} className="hidden" disabled={uploading}/>
                        </label>

                        {selectedSchematic && (<>
                            {/* Narzędzia */}
                            <div className="flex items-center bg-black/40 p-0.5 rounded-xl border border-white/10 shrink-0">
                                <button onClick={() => setActiveTool('MOVE')} className={`p-2 rounded-lg ${activeTool === 'MOVE' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}><Hand size={15}/></button>
                                <button onClick={() => setActiveTool('POINT')} className={`p-2 rounded-lg ${activeTool === 'POINT' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}><MapPin size={15}/></button>
                                <button onClick={() => setActiveTool('LINE')} className={`p-2 rounded-lg ${activeTool === 'LINE' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}><Minus size={15}/></button>
                            </div>

                            {/* Dodaj */}
                            <button
                                onClick={() => setIsAddingMarker(!isAddingMarker)}
                                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border shrink-0 active:scale-95 ${isAddingMarker ? 'bg-orange-500 text-white border-orange-400' : 'bg-blue-600 text-white border-blue-400'}`}
                            >
                                {isAddingMarker ? '✕' : 'DODAJ'}
                            </button>

                            {/* Nawigacja stron (tylko PDF) */}
                            {!isImageFile(selectedSchematic.fileUrl) && (
                                <div className="flex items-center bg-black/40 px-1.5 py-1 rounded-xl border border-white/10 shrink-0 gap-0.5">
                                    <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => p - 1)} className="p-1 text-gray-400 disabled:opacity-30"><Minus size={12}/></button>
                                    <span className="text-[9px] text-gray-400 font-black w-8 text-center">{pageNumber}/{numPages}</span>
                                    <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(p => p + 1)} className="p-1 text-gray-400 disabled:opacity-30"><X size={12} className="rotate-45"/></button>
                                </div>
                            )}

                            {/* Tabela znaczników */}
                            {selectedSchematic.markers?.length > 0 && (
                                <button onClick={() => setShowTable(s => !s)} className={`p-2 rounded-xl border text-[10px] font-black shrink-0 ${showTable ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-black/40 text-gray-400 border-white/10'}`}>
                                    <List size={14}/>
                                </button>
                            )}
                        </>)}
                    </div>
                ) : (
                    /* Desktop: oryginalny layout */
                    <>
                        <div className="flex items-center gap-3">
                            <select
                                value={selectedSchematic?.id || ''}
                                onChange={(e) => { const sch = schematics.find(s => s.id === e.target.value); setSelectedSchematic(sch); setPageNumber(1); }}
                                className="bg-black/40 border border-white/10 rounded-2xl px-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50"
                            >
                                {schematics.map(s => <option key={s.id} value={s.id}>{s.fileName}</option>)}
                                {schematics.length === 0 && <option value="">Brak schematów</option>}
                            </select>
                            <label className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl cursor-pointer active:scale-95">
                                <Upload size={14}/>
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} className="hidden" disabled={uploading}/>
                            </label>
                        </div>

                        {selectedSchematic && (
                            <div className="flex items-center gap-4">
                                <button onClick={() => setIsAddingMarker(!isAddingMarker)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border active:scale-95 ${isAddingMarker ? 'bg-orange-500 text-white border-orange-400' : 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/20'}`}>
                                    {isAddingMarker ? 'PRZERWIJ' : 'DODAJ'}
                                </button>
                                {!isImageFile(selectedSchematic.fileUrl) && (
                                    <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-xl border border-white/10">
                                        <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => p - 1)} className="p-1 text-gray-400 disabled:opacity-30"><Minus size={14}/></button>
                                        <span className="text-[9px] text-gray-400 font-black min-w-[50px] text-center uppercase">Str. {pageNumber} / {numPages}</span>
                                        <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(p => p + 1)} className="p-1 text-gray-400 disabled:opacity-30"><X size={14} className="rotate-45"/></button>
                                    </div>
                                )}
                                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                                    <button onClick={() => setActiveTool('MOVE')} className={`p-2 rounded-lg ${activeTool === 'MOVE' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}><Hand size={16}/></button>
                                    <button onClick={() => setActiveTool('POINT')} className={`p-2 rounded-lg ${activeTool === 'POINT' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}><MapPin size={16}/></button>
                                    <button onClick={() => setActiveTool('LINE')} className={`p-2 rounded-lg ${activeTool === 'LINE' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}><Minus size={16}/></button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Content Area */}
            <div className={`flex-1 min-h-0 relative overflow-auto bg-[#020617] ${isMobile ? 'order-1' : ''}`} ref={containerRef}>
                {loading && (
                    <div className="absolute inset-x-0 top-0 h-1 bg-blue-500/20 overflow-hidden z-50">
                        <div className="h-full bg-blue-500 w-1/3 animate-progress" />
                    </div>
                )}

                {selectedSchematic ? (
                    <div
                        className={`relative shadow-2xl ring-1 ring-white/5 bg-gray-900 overflow-hidden flex-shrink-0 ${isAddingMarker ? 'cursor-crosshair ring-4 ring-orange-500/30' : ''}`}
                        style={{ width: containerWidth * scale, minWidth: containerWidth * scale, touchAction: 'none' }}
                        onClick={handlePageClick}
                        onMouseMove={handleMouseMove}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        onTouchMove={handleTouchMove}
                        ref={pageRef}
                    >
                        {isImageFile(selectedSchematic.fileUrl) ? (
                            <img
                                src={getFileUrl(selectedSchematic.fileUrl)}
                                alt={selectedSchematic.fileName}
                                className="w-full block"
                                onLoad={() => setNumPages(1)}
                            />
                        ) : (
                            <Document
                                file={getFileUrl(selectedSchematic.fileUrl)}
                                options={pdfOptions}
                                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                                loading={<div className="h-96 flex flex-col items-center justify-center gap-3"><div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" /></div>}
                            >
                                <Page pageNumber={pageNumber} renderTextLayer={true} renderAnnotationLayer={true} width={containerWidth * scale} className="origin-top-left" />
                            </Document>
                        )}

                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                            {selectedSchematic.markers.filter(m => m.pageNumber === pageNumber && m.type === 'LINE').map(line => (
                                <g key={line.id} className="pointer-events-auto cursor-pointer group" onClick={(e) => { e.stopPropagation(); setSelectedMarker(line); }}>
                                    <line x1={`${line.x}%`} y1={`${line.y}%`} x2={`${line.x2}%`} y2={`${line.y2}%`} stroke="#3b82f6" strokeWidth="6" className="opacity-0 group-hover:opacity-20 transition-opacity" />
                                    <line x1={`${line.x}%`} y1={`${line.y}%`} x2={`${line.x2}%`} y2={`${line.y2}%`} stroke="#3b82f6" strokeWidth="2" strokeDasharray="6,4" />
                                </g>
                            ))}
                            {isAddingMarker && activeTool === 'LINE' && lineStart && (
                                <line x1={`${lineStart.x}%`} y1={`${lineStart.y}%`} x2={`${mousePos.x}%`} y2={`${mousePos.y}%`} stroke="#f97316" strokeWidth="2" strokeDasharray="4" />
                            )}
                        </svg>

                        {selectedSchematic.markers.filter(m => m.pageNumber === pageNumber && m.type !== 'LINE').map(m => {
                            const isHovered = hoveredMarkerId === m.id;
                            const hasTooltip = !!(m.name || m.note);
                            return (
                                <div
                                    key={m.id}
                                    className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20"
                                    style={{ left: `${m.x}%`, top: `${m.y}%` }}
                                    onClick={(e) => { e.stopPropagation(); setSelectedMarker(m); }}
                                    onMouseEnter={() => setHoveredMarkerId(m.id)}
                                    onMouseLeave={() => setHoveredMarkerId(null)}
                                >
                                    <div className="relative">
                                        {hasTooltip && isHovered && (
                                            <div
                                                className="absolute pointer-events-none z-50"
                                                style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '10px', width: '220px' }}
                                            >
                                                <div style={{
                                                    background: 'rgba(0,0,0,0.82)',
                                                    backdropFilter: 'blur(12px)',
                                                    borderRadius: '12px',
                                                    border: '1px solid rgba(255,255,255,0.12)',
                                                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                                    overflow: 'hidden',
                                                }}>
                                                    {m.name && (
                                                        <div style={{
                                                            padding: '8px 12px',
                                                            fontSize: '11px',
                                                            fontWeight: 700,
                                                            color: '#fff',
                                                            borderBottom: m.note ? '1px solid rgba(255,255,255,0.1)' : 'none',
                                                        }}>
                                                            {m.name}
                                                        </div>
                                                    )}
                                                    {m.note && (
                                                        <div style={{
                                                            padding: '8px 12px',
                                                            fontSize: '11px',
                                                            color: '#cbd5e1',
                                                            lineHeight: 1.5,
                                                            wordBreak: 'break-word',
                                                            whiteSpace: 'pre-wrap',
                                                        }}>
                                                            {m.note}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{
                                                    width: 8, height: 8,
                                                    background: 'rgba(0,0,0,0.82)',
                                                    border: '1px solid rgba(255,255,255,0.12)',
                                                    borderTop: 'none', borderLeft: 'none',
                                                    transform: 'rotate(45deg)',
                                                    margin: '-4px auto 0',
                                                }} />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-blue-500 rounded-full blur-xl scale-150 animate-pulse opacity-20" />
                                        <MapPin
                                            size={isMobile ? 36 : 28}
                                            className="text-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.5)] transition-transform"
                                            style={{ transform: isHovered ? 'scale(1.1)' : 'scale(1)' }}
                                            fill="currentColor" fillOpacity={0.1}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 opacity-30">
                        <MapIcon size={80} className="text-gray-600" />
                        <span className="text-xs font-black uppercase tracking-widest">Brak schematów</span>
                    </div>
                )}
            </div>

            {/* Overlay — zoom + fullscreen — fixed do viewportu (nie drga przy zoomie) */}
            {selectedSchematic && (
                <div
                    className="fixed right-3 z-[100] flex flex-col gap-2 pointer-events-none"
                    style={{ bottom: isMobile ? toolbarHeight + 12 : 16 }}
                >
                    <button
                        onClick={() => setIsFullscreen(f => !f)}
                        className={`pointer-events-auto w-8 h-8 flex items-center justify-center rounded-lg bg-black/25 border border-emerald-400 text-emerald-400 active:scale-95 transition-transform`}
                        title={isFullscreen ? 'Zamknij pełny ekran' : 'Pełny ekran'}
                    >
                        {isFullscreen ? <Minimize2 size={18}/> : <Maximize size={18}/>}
                    </button>
                    <button
                        onClick={() => setScale(1.0)}
                        className="pointer-events-auto w-8 h-8 flex items-center justify-center rounded-lg bg-black/25 border border-violet-500 text-violet-400 active:scale-95 transition-transform"
                        title="Dopasuj (100%)"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                        </svg>
                    </button>
                    <button
                        onClick={() => setScale(s => Math.min(5.0, s + 0.25))}
                        className="pointer-events-auto w-8 h-8 flex items-center justify-center rounded-lg bg-black/25 border border-violet-500 text-violet-400 active:scale-95 transition-transform"
                        title="Powiększ"
                    >
                        <ZoomIn size={18}/>
                    </button>
                    <button
                        onClick={() => setScale(s => Math.max(0.25, s - 0.25))}
                        className="pointer-events-auto w-8 h-8 flex items-center justify-center rounded-lg bg-black/25 border border-violet-500 text-violet-400 active:scale-95 transition-transform"
                        title="Pomniejsz"
                    >
                        <ZoomOut size={18}/>
                    </button>
                </div>
            )}

            {(isMobile ? showTable : true) && selectedSchematic?.markers?.length > 0 && (
                <div className={`border-t border-white/5 bg-slate-900/30 overflow-auto flex-shrink-0 ${isMobile ? 'order-3' : ''}`} style={{ maxHeight: '220px' }}>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
                        <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Znaczniki ({selectedSchematic.markers.length})</span>
                        <button onClick={() => setShowTable(false)} className="p-1 text-gray-500 hover:text-white rounded" title="Ukryj tabelę"><X size={13}/></button>
                    </div>
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-sm z-10">
                            <tr className="text-gray-500 uppercase tracking-widest text-[9px]">
                                <th className="px-3 py-2 text-left font-black w-8">#</th>
                                <th className="px-3 py-2 text-left font-black">Nazwa</th>
                                <th className="px-3 py-2 text-left font-black">Notatka</th>
                                <th className="px-3 py-2 text-right font-black">Zał.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {selectedSchematic.markers.map((m, idx) => (
                                <tr
                                    key={m.id}
                                    onClick={() => { setSelectedMarker(m); setPageNumber(m.pageNumber); setShowTable(false); }}
                                    className={`cursor-pointer border-t border-white/5 transition-colors ${selectedMarker?.id === m.id ? 'bg-blue-500/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                                >
                                    <td className="px-3 py-1.5 text-gray-600">{idx + 1}</td>
                                    <td className="px-3 py-1.5 max-w-[120px] truncate">{m.name || <span className="text-gray-600 italic">—</span>}</td>
                                    <td className="px-3 py-1.5 max-w-[180px] truncate">{m.note || <span className="text-gray-600 italic">—</span>}</td>
                                    <td className="px-3 py-1.5 text-right">
                                        {m.attachments?.length > 0
                                            ? <span className="inline-block px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded text-[9px] font-black">{m.attachments.length}</span>
                                            : <span className="text-gray-700">0</span>
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedMarker && (
                <MarkerDetailsPanel
                    marker={selectedMarker}
                    onClose={() => setSelectedMarker(null)}
                    onRefresh={fetchSchematics}
                    nodeId={nodeId}
                />
            )}
        </div>
    );
}
