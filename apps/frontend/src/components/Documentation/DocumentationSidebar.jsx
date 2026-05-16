import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, pdfjs } from 'react-pdf';
import { FileText, ZoomIn, ZoomOut, Download, X, Maximize2, RefreshCw, FileQuestion, ChevronLeft, ChevronRight } from 'lucide-react';
import { PDFDocument, rgb } from 'pdf-lib';
import { API_URL } from '../../config';
import PdfPageWithHighlights from '../shared/PdfPageWithHighlights';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const pdfOptions = {
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    disableXFA: true,
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
    const [scale, setScale] = useState(1.0);
    const [containerWidth, setContainerWidth] = useState(420);
    const pdfScrollRef = useRef(null);

    // Highlights
    const [highlights, setHighlights] = useState([]);
    const [activeHighlightId, setActiveHighlightId] = useState(null);

    const token = useMemo(() => sessionStorage.getItem('token') || localStorage.getItem('token'), []);

    // Reset wybranego pliku przy zmianie węzła
    useEffect(() => {
        setSelectedFile(null);
        setNumPages(null);
        setHighlights([]);
        setActiveHighlightId(null);
    }, [nodeId]);

    // Pobierz highlighty po zmianie pliku
    useEffect(() => {
        setHighlights([]);
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

    const createHighlight = useCallback(async ({ page, rects, color }) => {
        if (!selectedFile?.id) return;
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const optimistic = { id: tempId, documentId: selectedFile.id, page, rects, color, comment: null, _optimistic: true };
        setHighlights(prev => [...prev, optimistic]);
        try {
            const res = await fetch(`${API_URL}/documents/${selectedFile.id}/highlights`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ page, rects, color }),
            });
            if (res.ok) {
                const saved = await res.json();
                setHighlights(prev => prev.map(h => h.id === tempId ? saved : h));
            } else {
                setHighlights(prev => prev.map(h => h.id === tempId ? { ...h, _failed: true } : h));
            }
        } catch (err) {
            console.error('[DocsSidebar] Błąd zapisu highlightu:', err);
            setHighlights(prev => prev.map(h => h.id === tempId ? { ...h, _failed: true } : h));
        }
    }, [selectedFile?.id, token]);

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

    // Mierzy szerokość wewnętrznego obszaru scrolla — fit-to-width PDF.
    // Tolerancja ±3px chroni przed feedback-loopem gdy pasek scrolla mryga
    // (renderuje się wertykalny scroll → kurczy szerokość → PDF mniejszy → znika scroll → szerokość rośnie → loop).
    useEffect(() => {
        const obs = new ResizeObserver(entries => {
            const w = entries[0]?.contentRect?.width;
            if (!w) return;
            const next = Math.floor(w - 24);
            setContainerWidth(prev => Math.abs(prev - next) < 4 ? prev : next);
        });
        if (pdfScrollRef.current) obs.observe(pdfScrollRef.current);
        return () => obs.disconnect();
    }, []);

    const ext = selectedFile?.fileName?.split('.').pop()?.toLowerCase() || '';
    const isPdf = selectedFile?.mimeType === 'application/pdf' || ext === 'pdf';
    const isImage = selectedFile?.mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext);

    const fileUrl = selectedFile ? `${API_URL}/documents/download/${selectedFile.id}` : null;

    const HL_RGB = {
        yellow: rgb(0.996, 0.941, 0.541),
        green:  rgb(0.733, 0.969, 0.816),
        blue:   rgb(0.749, 0.859, 0.996),
        pink:   rgb(0.984, 0.812, 0.910),
        orange: rgb(0.996, 0.843, 0.667),
    };
    const [downloading, setDownloading] = useState(false);

    const handleDownload = useCallback(async () => {
        if (!fileUrl) return;
        if (!isPdf || highlights.length === 0) {
            const a = document.createElement('a');
            a.href = fileUrl;
            a.download = selectedFile.fileName;
            a.click();
            return;
        }
        setDownloading(true);
        try {
            const res = await fetch(fileUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            const buffer = await res.arrayBuffer();
            const pdfDoc = await PDFDocument.load(buffer);
            const pages = pdfDoc.getPages();
            for (const h of highlights) {
                const page = pages[h.page - 1];
                if (!page) continue;
                const { width, height } = page.getSize();
                const color = HL_RGB[h.color] || HL_RGB.yellow;
                for (const r of (h.rects || [])) {
                    page.drawRectangle({
                        x: r.x * width,
                        y: height - (r.y + r.h) * height,
                        width: r.w * width,
                        height: r.h * height,
                        color,
                        opacity: 0.45,
                    });
                }
            }
            const bytes = await pdfDoc.save();
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = selectedFile.fileName;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (err) {
            console.error('[Sidebar Download] Błąd wypalania highlightów:', err);
            const a = document.createElement('a');
            a.href = fileUrl;
            a.download = selectedFile.fileName;
            a.click();
        } finally {
            setDownloading(false);
        }
    }, [fileUrl, isPdf, highlights, selectedFile, token]);

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
                    {files.length > 1 && (() => {
                        const idx = files.findIndex(f => f.id === selectedFile?.id);
                        const hasPrev = idx > 0;
                        const hasNext = idx < files.length - 1 && idx !== -1;
                        return <>
                            <button
                                onClick={() => { if (hasPrev) { setSelectedFile(files[idx - 1]); setScale(1.0); } }}
                                disabled={!hasPrev}
                                title="Poprzedni dokument"
                                className={`p-1.5 rounded-lg transition-colors ${hasPrev ? 'text-amber-300/60 hover:text-amber-200 hover:bg-amber-500/10' : 'text-amber-300/20 cursor-not-allowed'}`}>
                                <ChevronLeft size={14} />
                            </button>
                            <span className="text-[9px] text-amber-400/50 tabular-nums">
                                {idx === -1 ? '-' : idx + 1}/{files.length}
                            </span>
                            <button
                                onClick={() => { if (hasNext) { setSelectedFile(files[idx + 1]); setScale(1.0); } }}
                                disabled={!hasNext}
                                title="Następny dokument"
                                className={`p-1.5 rounded-lg transition-colors ${hasNext ? 'text-amber-300/60 hover:text-amber-200 hover:bg-amber-500/10' : 'text-amber-300/20 cursor-not-allowed'}`}>
                                <ChevronRight size={14} />
                            </button>
                        </>;
                    })()}
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
                                        onClick={() => { setSelectedFile(f); setScale(1.0); }}
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
                        <span className="text-[10px] text-gray-500 px-1 tabular-nums flex-shrink-0">{numPages} {numPages === 1 ? 'strona' : 'stron'}</span>
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
                        <button onClick={handleDownload} disabled={downloading} title={isPdf && highlights.length > 0 ? 'Pobierz z zaznaczeniami' : 'Pobierz'}
                            className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded inline-flex disabled:opacity-50">
                            {downloading ? <div className="w-3 h-3 border border-gray-400/30 border-t-gray-400 rounded-full animate-spin" /> : <Download size={12} />}
                        </button>
                    </div>
                </div>
            )}

            {/* Viewer area — overflow-y:scroll stabilizuje szerokość (zawsze rezerwuje miejsce na pionowy scroll) */}
            <div ref={pdfScrollRef} className="flex-1 overflow-x-auto overflow-y-scroll bg-white/[0.02] custom-scrollbar">
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
                            {Array.from(new Array(numPages || 0), (_, idx) => {
                                const pn = idx + 1;
                                return (
                                    <PdfPageWithHighlights
                                        key={`page_${pn}`}
                                        pageNumber={pn}
                                        width={Math.floor(containerWidth * scale)}
                                        pageHighlights={highlights.filter(h => h.page === pn)}
                                        activeHighlightId={activeHighlightId}
                                        onSetActive={setActiveHighlightId}
                                        onCreate={createHighlight}
                                        onDelete={deleteHighlight}
                                        onUpdateColor={updateHighlightColor}
                                    />
                                );
                            })}
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
                            <button onClick={handleDownload} disabled={downloading}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-gray-300 border border-white/10 rounded-lg text-[10px] font-bold hover:bg-white/10 transition-colors disabled:opacity-50">
                                <Download size={11} /> {downloading ? 'Pobieranie...' : 'Pobierz'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
