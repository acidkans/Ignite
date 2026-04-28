import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { FileText, ZoomIn, ZoomOut, ChevronUp, ChevronDown, Download, X, Maximize2, RefreshCw, Image as ImageIcon, FileQuestion, Highlighter, Trash2 } from 'lucide-react';
import { API_URL } from '../../config';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const pdfOptions = {
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    disableXFA: true,
};

// Paleta highlightów — kolor → (bg pełny, bg w toolbarze)
const HL_COLORS = {
    yellow: '#fef08a',
    green:  '#bbf7d0',
    blue:   '#bfdbfe',
    pink:   '#fbcfe8',
    orange: '#fed7aa',
};

const formatBytes = (b) => {
    if (!b && b !== 0) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const fileIcon = (mime, name) => {
    const ext = (name || '').split('.').pop()?.toLowerCase();
    if (mime === 'application/pdf' || ext === 'pdf') return '📕';
    if (mime?.startsWith('image/')) return '🖼️';
    if (['docx', 'doc'].includes(ext)) return '📘';
    if (['xlsx', 'xls'].includes(ext)) return '📗';
    return '📄';
};

export default function DocumentationSidebar({ nodeId, onClose, onOpenFullscreen }) {
    const [files, setFiles] = useState([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [pageNum, setPageNum] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [containerWidth, setContainerWidth] = useState(420);
    const pdfScrollRef = useRef(null);
    const pageWrapperRef = useRef(null);

    // Highlights
    const [highlights, setHighlights] = useState([]);
    const [selToolbar, setSelToolbar] = useState(null); // { x, y, rects:[{x,y,w,h}] } w fractions 0..1
    const [activeHighlightId, setActiveHighlightId] = useState(null);

    const token = useMemo(() => sessionStorage.getItem('token') || localStorage.getItem('token'), []);

    // Reset wybranego pliku przy zmianie węzła
    useEffect(() => {
        setSelectedFile(null);
        setNumPages(null);
        setPageNum(1);
        setHighlights([]);
        setSelToolbar(null);
        setActiveHighlightId(null);
    }, [nodeId]);

    // Pobierz highlighty po zmianie pliku
    useEffect(() => {
        setHighlights([]);
        setSelToolbar(null);
        setActiveHighlightId(null);
        if (!selectedFile?.id) return;
        const isPdfFile = selectedFile.mimeType === 'application/pdf'
            || selectedFile.fileName?.toLowerCase().endsWith('.pdf');
        if (!isPdfFile) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${API_URL}/documents/${selectedFile.id}/highlights`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (res.ok && !cancelled) setHighlights(await res.json());
            } catch (err) {
                console.error('[DocsSidebar] Błąd pobierania highlightów:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedFile?.id, token]);

    // Reset overlay UI przy zmianie strony / skali
    useEffect(() => {
        setSelToolbar(null);
        setActiveHighlightId(null);
        window.getSelection()?.removeAllRanges();
    }, [pageNum, scale]);

    // Capture zaznaczenia tekstu — mouseup w obrębie strony PDF
    const handlePageMouseUp = useCallback(() => {
        const wrapper = pageWrapperRef.current;
        if (!wrapper) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSelToolbar(null); return; }
        const range = sel.getRangeAt(0);
        // Sprawdź, czy zaznaczenie leży w obrębie wrappera
        if (!wrapper.contains(range.commonAncestorContainer)) { setSelToolbar(null); return; }
        const wrapRect = wrapper.getBoundingClientRect();
        if (wrapRect.width === 0 || wrapRect.height === 0) return;
        const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1);
        if (clientRects.length === 0) { setSelToolbar(null); return; }
        const rects = clientRects.map(r => ({
            x: (r.left - wrapRect.left) / wrapRect.width,
            y: (r.top - wrapRect.top) / wrapRect.height,
            w: r.width / wrapRect.width,
            h: r.height / wrapRect.height,
        }));
        // Toolbar nad pierwszym rectem
        const first = clientRects[0];
        setSelToolbar({
            x: first.left - wrapRect.left + first.width / 2,
            y: first.top - wrapRect.top - 4,
            rects,
        });
    }, []);

    const createHighlight = useCallback(async (color) => {
        if (!selectedFile?.id || !selToolbar) return;
        try {
            const res = await fetch(`${API_URL}/documents/${selectedFile.id}/highlights`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: pageNum, rects: selToolbar.rects, color }),
            });
            if (res.ok) {
                const created = await res.json();
                setHighlights(prev => [...prev, created]);
            }
        } catch (err) {
            console.error('[DocsSidebar] Błąd zapisu highlightu:', err);
        }
        window.getSelection()?.removeAllRanges();
        setSelToolbar(null);
    }, [selectedFile?.id, selToolbar, pageNum, token]);

    const deleteHighlight = useCallback(async (hid) => {
        if (!selectedFile?.id) return;
        try {
            const res = await fetch(`${API_URL}/documents/${selectedFile.id}/highlights/${hid}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) setHighlights(prev => prev.filter(h => h.id !== hid));
        } catch (err) {
            console.error('[DocsSidebar] Błąd usuwania highlightu:', err);
        }
        setActiveHighlightId(null);
    }, [selectedFile?.id, token]);

    const updateHighlightColor = useCallback(async (hid, color) => {
        if (!selectedFile?.id) return;
        try {
            const res = await fetch(`${API_URL}/documents/${selectedFile.id}/highlights/${hid}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ color }),
            });
            if (res.ok) {
                const updated = await res.json();
                setHighlights(prev => prev.map(h => h.id === hid ? updated : h));
            }
        } catch (err) {
            console.error('[DocsSidebar] Błąd zmiany koloru highlightu:', err);
        }
    }, [selectedFile?.id, token]);

    // Pobierz listę plików dla aktualnego węzła (kategoria standard — jak ustalono)
    const fetchFiles = useCallback(async () => {
        if (!nodeId) {
            setFiles([]);
            return;
        }
        setLoadingFiles(true);
        try {
            const res = await fetch(`${API_URL}/documents/node/${nodeId}?category=standard`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setFiles(data);
                if (data.length > 0) setSelectedFile(prev => prev || data[0]);
            } else {
                setFiles([]);
            }
        } catch (err) {
            console.error('[DocsSidebar] Błąd pobierania plików:', err);
            setFiles([]);
        } finally {
            setLoadingFiles(false);
        }
    }, [nodeId, token]);

    useEffect(() => { fetchFiles(); }, [fetchFiles]);

    // Mierzy szerokość wewnętrznego obszaru scrolla — fit-to-width PDF
    useEffect(() => {
        const obs = new ResizeObserver(entries => {
            const w = entries[0]?.contentRect?.width;
            if (w) setContainerWidth(Math.floor(w - 24));
        });
        if (pdfScrollRef.current) obs.observe(pdfScrollRef.current);
        return () => obs.disconnect();
    }, []);

    const ext = selectedFile?.fileName?.split('.').pop()?.toLowerCase() || '';
    const isPdf = selectedFile?.mimeType === 'application/pdf' || ext === 'pdf';
    const isImage = selectedFile?.mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext);

    const fileUrl = selectedFile ? `${API_URL}/documents/download/${selectedFile.id}` : null;

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            {/* Header */}
            <div className="h-12 flex items-center justify-between px-3 border-b border-white/5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0">
                        <FileText size={14} className="text-white" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[11px] font-bold text-amber-200 uppercase tracking-wider truncate">Dokumentacja</div>
                        <div className="text-[9px] text-amber-400/60 truncate">{files.length} {files.length === 1 ? 'plik' : 'plików'}</div>
                    </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={fetchFiles} title="Odśwież listę"
                        className="p-1.5 text-amber-300/60 hover:text-amber-200 hover:bg-amber-500/10 rounded-lg transition-colors">
                        <RefreshCw size={14} className={loadingFiles ? 'animate-spin' : ''} />
                    </button>
                    {onClose && (
                        <button onClick={onClose} title="Zamknij panel"
                            className="p-1.5 text-amber-300/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* File list */}
            <div className="flex-shrink-0 max-h-[35%] overflow-y-auto custom-scrollbar border-b border-white/5 bg-black/20">
                {!nodeId ? (
                    <div className="p-4 text-center text-[10px] text-gray-500">
                        Wybierz węzeł w drzewie, aby zobaczyć dokumentację.
                    </div>
                ) : loadingFiles ? (
                    <div className="p-4 flex items-center justify-center text-[10px] text-gray-500">
                        <div className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mr-2"></div>
                        Ładowanie...
                    </div>
                ) : files.length === 0 ? (
                    <div className="p-4 text-center text-[10px] text-gray-500">
                        Brak plików w kategorii „standard".
                    </div>
                ) : (
                    <ul className="py-1">
                        {files.map(f => {
                            const active = selectedFile?.id === f.id;
                            return (
                                <li key={f.id}>
                                    <button
                                        onClick={() => { setSelectedFile(f); setPageNum(1); setScale(1.0); }}
                                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-[11px] transition-colors ${active ? 'bg-amber-500/15 text-amber-100 border-l-2 border-amber-400' : 'text-gray-300 hover:bg-white/5 border-l-2 border-transparent'}`}
                                        title={f.fileName}
                                    >
                                        <span className="text-base flex-shrink-0">{fileIcon(f.mimeType, f.fileName)}</span>
                                        <span className="truncate flex-1">{f.fileName}</span>
                                        <span className="text-[9px] text-gray-500 flex-shrink-0">{formatBytes(f.fileSize)}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Viewer toolbar */}
            {selectedFile && (
                <div className="flex-shrink-0 flex items-center justify-between px-2 py-1.5 border-b border-white/5 bg-white/[0.02] gap-1">
                    <div className="text-[10px] text-gray-400 truncate flex-1 min-w-0" title={selectedFile.fileName}>
                        {selectedFile.fileName}
                    </div>
                    {isPdf && numPages && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button onClick={() => setPageNum(p => Math.max(1, p - 1))}
                                disabled={pageNum <= 1}
                                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:hover:bg-transparent">
                                <ChevronUp size={12} />
                            </button>
                            <span className="text-[10px] text-gray-400 px-1 tabular-nums">{pageNum}/{numPages}</span>
                            <button onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
                                disabled={pageNum >= numPages}
                                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded disabled:opacity-30 disabled:hover:bg-transparent">
                                <ChevronDown size={12} />
                            </button>
                        </div>
                    )}
                    {(isPdf || isImage) && (
                        <div className="flex items-center gap-0.5 flex-shrink-0 border-l border-white/10 pl-1 ml-1">
                            <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
                                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded" title="Pomniejsz">
                                <ZoomOut size={12} />
                            </button>
                            <button onClick={() => setScale(1.0)}
                                className="text-[10px] text-gray-400 hover:text-white px-1.5 py-1 rounded hover:bg-white/10 tabular-nums" title="Reset">
                                {Math.round(scale * 100)}%
                            </button>
                            <button onClick={() => setScale(s => Math.min(3.0, s + 0.25))}
                                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded" title="Powiększ">
                                <ZoomIn size={12} />
                            </button>
                        </div>
                    )}
                    <div className="flex items-center gap-0.5 flex-shrink-0 border-l border-white/10 pl-1 ml-1">
                        {onOpenFullscreen && (
                            <button onClick={() => onOpenFullscreen(selectedFile)} title="Otwórz w pełnym ekranie"
                                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded">
                                <Maximize2 size={12} />
                            </button>
                        )}
                        <a href={fileUrl} download={selectedFile.fileName} target="_blank" rel="noreferrer" title="Pobierz"
                            className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded inline-flex">
                            <Download size={12} />
                        </a>
                    </div>
                </div>
            )}

            {/* Viewer area */}
            <div ref={pdfScrollRef} className="flex-1 overflow-auto bg-white/[0.02] custom-scrollbar">
                {!selectedFile ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 p-6 text-center">
                        <FileQuestion size={32} className="mb-3 opacity-30" />
                        <p className="text-[10px]">Wybierz plik z listy powyżej, aby otworzyć podgląd.</p>
                    </div>
                ) : isPdf ? (
                    <div className="p-3 w-fit min-w-full mx-auto">
                        <Document
                            file={fileUrl}
                            options={pdfOptions}
                            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                            loading={
                                <div className="flex flex-col items-center justify-center p-6 text-gray-400">
                                    <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-2"></div>
                                    <span className="text-[10px]">Ładowanie PDF...</span>
                                </div>
                            }
                            error={<div className="p-6 text-red-400 text-center text-[10px]">Błąd ładowania pliku PDF.</div>}
                        >
                            <div
                                ref={pageWrapperRef}
                                className="shadow-xl border border-white/10 mx-auto bg-white w-fit relative"
                                onMouseUp={handlePageMouseUp}
                            >
                                <Page
                                    pageNumber={pageNum}
                                    renderTextLayer={true}
                                    renderAnnotationLayer={true}
                                    width={Math.floor(containerWidth * scale)}
                                />

                                {/* Highlight overlay (per current page) */}
                                <div className="absolute inset-0 pointer-events-none" style={{ mixBlendMode: 'multiply' }}>
                                    {highlights.filter(h => h.page === pageNum).flatMap(h =>
                                        (Array.isArray(h.rects) ? h.rects : []).map((r, i) => (
                                            <div
                                                key={`${h.id}-${i}`}
                                                onClick={(e) => { e.stopPropagation(); setActiveHighlightId(prev => prev === h.id ? null : h.id); }}
                                                className="absolute cursor-pointer"
                                                style={{
                                                    left:   `${r.x * 100}%`,
                                                    top:    `${r.y * 100}%`,
                                                    width:  `${r.w * 100}%`,
                                                    height: `${r.h * 100}%`,
                                                    backgroundColor: HL_COLORS[h.color] || HL_COLORS.yellow,
                                                    pointerEvents: 'auto',
                                                    outline: activeHighlightId === h.id ? '1px solid rgba(0,0,0,0.4)' : 'none',
                                                }}
                                                title={h.comment || 'Kliknij aby zarządzać'}
                                            />
                                        ))
                                    )}
                                </div>

                                {/* Pop-over dla aktywnego highlightu — paleta + delete */}
                                {activeHighlightId && (() => {
                                    const h = highlights.find(x => x.id === activeHighlightId);
                                    if (!h || h.page !== pageNum) return null;
                                    const r0 = (Array.isArray(h.rects) ? h.rects : [])[0];
                                    if (!r0) return null;
                                    return (
                                        <div
                                            className="absolute z-20 flex items-center gap-1 bg-gray-900 border border-white/15 rounded-lg shadow-xl px-1.5 py-1"
                                            style={{
                                                left: `${(r0.x + r0.w) * 100}%`,
                                                top:  `${r0.y * 100}%`,
                                                transform: 'translate(4px, -100%)',
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {Object.entries(HL_COLORS).map(([k, v]) => (
                                                <button
                                                    key={k}
                                                    onClick={() => updateHighlightColor(h.id, k)}
                                                    className="w-4 h-4 rounded-full border border-white/30"
                                                    style={{ backgroundColor: v, outline: h.color === k ? '2px solid #fff' : 'none' }}
                                                    title={k}
                                                />
                                            ))}
                                            <span className="w-px h-4 bg-white/20 mx-0.5" />
                                            <button
                                                onClick={() => deleteHighlight(h.id)}
                                                className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded"
                                                title="Usuń"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                            <button
                                                onClick={() => setActiveHighlightId(null)}
                                                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded"
                                                title="Zamknij"
                                            >
                                                <X size={11} />
                                            </button>
                                        </div>
                                    );
                                })()}

                                {/* Toolbar zaznaczenia — paleta kolorów */}
                                {selToolbar && (
                                    <div
                                        className="absolute z-30 flex items-center gap-1 bg-gray-900 border border-amber-400/40 rounded-lg shadow-xl px-1.5 py-1"
                                        style={{
                                            left: selToolbar.x,
                                            top:  selToolbar.y,
                                            transform: 'translate(-50%, -100%)',
                                        }}
                                        onMouseDown={(e) => e.preventDefault()}
                                    >
                                        <Highlighter size={11} className="text-amber-300" />
                                        {Object.entries(HL_COLORS).map(([k, v]) => (
                                            <button
                                                key={k}
                                                onClick={() => createHighlight(k)}
                                                className="w-4 h-4 rounded-full border border-white/30 hover:scale-110 transition-transform"
                                                style={{ backgroundColor: v }}
                                                title={`Zaznacz ${k}`}
                                            />
                                        ))}
                                        <button
                                            onClick={() => { window.getSelection()?.removeAllRanges(); setSelToolbar(null); }}
                                            className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded"
                                            title="Anuluj"
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </Document>
                    </div>
                ) : isImage ? (
                    <div className="flex items-center justify-center p-3 w-full h-full">
                        <img src={fileUrl} alt={selectedFile.fileName}
                            style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
                            className="max-w-full max-h-full object-contain shadow-xl rounded border border-white/10 transition-transform" />
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6 text-center gap-3">
                        <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center text-2xl opacity-30">
                            {fileIcon(selectedFile.mimeType, selectedFile.fileName)}
                        </div>
                        <p className="text-[10px] max-w-[220px]">
                            Format <strong>.{ext}</strong> nie wyświetla się w panelu. Otwórz pełny ekran lub pobierz plik.
                        </p>
                        <div className="flex gap-2">
                            {onOpenFullscreen && (
                                <button onClick={() => onOpenFullscreen(selectedFile)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-200 border border-amber-500/30 rounded-lg text-[10px] font-bold hover:bg-amber-500/30 transition-colors">
                                    <Maximize2 size={11} /> Pełny ekran
                                </button>
                            )}
                            <a href={fileUrl} download={selectedFile.fileName}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-gray-300 border border-white/10 rounded-lg text-[10px] font-bold hover:bg-white/10 transition-colors">
                                <Download size={11} /> Pobierz
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
