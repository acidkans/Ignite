import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../../config';
import { ZoomIn, ZoomOut, Maximize, Minimize2, FileText, Image as ImageIcon } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const isImage = (name) => /\.(jpg|jpeg|png|webp)$/i.test(name || '');
const getFileUrl = (f) => `${API_URL}/schematics/file/${f}`;

export default function PdfViewerTab({ nodeId }) {
    const [files, setFiles] = useState([]);
    const [selected, setSelected] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [contentAspect, setContentAspect] = useState(null);
    const [containerWidth, setContainerWidth] = useState(800);

    const containerRef = useRef(null);
    const scaleRef = useRef(scale);
    const isAddingRef = useRef(false); // always false — no markers

    useEffect(() => { scaleRef.current = scale; }, [scale]);
    useEffect(() => { setContentAspect(null); setPageNumber(1); }, [selected?.id]);

    useEffect(() => {
        if (!nodeId) return;
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/schematics/node/${nodeId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                setFiles(data);
                if (data.length > 0) setSelected(data[0]);
            })
            .catch(() => {});
    }, [nodeId]);

    // ResizeObserver
    useEffect(() => {
        const obs = new ResizeObserver(entries => {
            if (entries[0]?.contentRect) setContainerWidth(entries[0].contentRect.width - 32);
        });
        if (containerRef.current) obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, [selected]);

    // Touch: pinch zoom + pan
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let pinch = null, pan = null;
        const d2 = (t) => { const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx*dx + dy*dy); };
        const onStart = (e) => {
            if (e.touches.length === 2) { e.preventDefault(); pinch = { startDist: d2(e.touches), startScale: scaleRef.current }; pan = null; }
            else if (e.touches.length === 1) { pan = { x: e.touches[0].clientX, y: e.touches[0].clientY, sl: el.scrollLeft, st: el.scrollTop }; pinch = null; }
        };
        const onMove = (e) => {
            if (e.touches.length === 2 && pinch) { e.preventDefault(); setScale(Math.max(0.5, Math.min(5.0, pinch.startScale * (d2(e.touches) / pinch.startDist)))); }
            else if (e.touches.length === 1 && pan) { e.preventDefault(); el.scrollLeft = pan.sl - (e.touches[0].clientX - pan.x); el.scrollTop = pan.st - (e.touches[0].clientY - pan.y); }
        };
        const onEnd = (e) => { if (e.touches.length < 2) pinch = null; if (e.touches.length === 0) pan = null; };
        el.addEventListener('touchstart', onStart, { passive: false });
        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onEnd);
        return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd); };
    }, [selected]);

    const pageWidth = containerWidth * scale;
    const aspect = contentAspect || 1.414;
    const pageHeight = Math.round(pageWidth * aspect);

    return (
        <div className={`flex flex-col md:flex-row h-full bg-gray-900/50 rounded-xl overflow-hidden border border-white/5 ${isFullscreen ? 'fixed inset-0 z-[200] rounded-none' : ''}`}>

            {/* Lewy panel — lista plików */}
            {!isFullscreen && (
                <div className="w-full md:w-56 h-32 md:h-auto bg-black/40 border-b md:border-b-0 md:border-r border-white/5 flex flex-col p-3 flex-shrink-0 overflow-y-auto">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-2">Pliki ({files.length})</p>
                    {files.length === 0 && <p className="text-gray-600 text-xs">Brak plików</p>}
                    {files.map(f => (
                        <button
                            key={f.id}
                            onClick={() => { setSelected(f); setScale(1.0); }}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors mb-0.5 ${selected?.id === f.id ? 'bg-orange-500/20 text-orange-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                        >
                            {isImage(f.fileUrl) ? <ImageIcon size={11} className="shrink-0" /> : <FileText size={11} className="shrink-0" />}
                            <span className="truncate">{f.fileName || f.fileUrl}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Prawy panel — podgląd */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">

                {/* Floating overlay buttons — poza scroll-kontenerem, przyklejone do rogu panelu */}
                {selected && (
                    <div className="fixed bottom-4 right-3 z-[100] flex flex-col gap-2 pointer-events-none">
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
                            onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
                            className="pointer-events-auto w-8 h-8 flex items-center justify-center rounded-lg bg-black/25 border border-violet-500 text-violet-400 active:scale-95 transition-transform"
                            title="Pomniejsz"
                        >
                            <ZoomOut size={18}/>
                        </button>
                    </div>
                )}

                {/* Obszar przewijania */}
                <div
                    ref={containerRef}
                    className="flex-1 min-h-0 overflow-auto p-4 [&_canvas]:touch-none"
                    style={{ touchAction: 'none' }}
                >
                    {selected ? (
                        <div style={{ width: pageWidth, minWidth: pageWidth, height: pageHeight }} className="mx-auto block shadow-2xl relative">
                            {isImage(selected.fileUrl) ? (
                                <img
                                    src={getFileUrl(selected.fileUrl)}
                                    alt={selected.fileName}
                                    className="w-full h-full object-fill block rounded"
                                    onLoad={(e) => { if (e.target.naturalWidth) setContentAspect(e.target.naturalHeight / e.target.naturalWidth); setNumPages(1); }}
                                />
                            ) : (
                                <Document
                                    file={getFileUrl(selected.fileUrl)}
                                    onLoadSuccess={pdf => setNumPages(pdf.numPages)}
                                    loading={<div className="text-gray-500 p-10 text-sm">Ładowanie...</div>}
                                >
                                    <Page
                                        pageNumber={pageNumber}
                                        width={pageWidth}
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                        className="rounded overflow-hidden shadow"
                                        onLoadSuccess={page => { const vp = page.getViewport({ scale: 1 }); setContentAspect(vp.height / vp.width); }}
                                    />
                                </Document>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-600 text-sm">
                            Wybierz plik z listy po lewej
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
