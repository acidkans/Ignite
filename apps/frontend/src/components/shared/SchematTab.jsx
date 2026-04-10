import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../../config';
import { enqueueUpload, removeFromQueue, flushPendingUploads } from '../../utils/uploadQueue';
import {
    Upload, X, MapPin, Image as ImageIcon, Mic, Trash2,
    MousePointer2, Minus, Type, ZoomIn, ZoomOut, Maximize, Minimize2, Hand, Camera, Download, FileText, Save, FileDown,
    RefreshCw, HardDrive, FolderOpen, List, CheckSquare, Square, Layers
} from 'lucide-react';

function flattenWbsNodes(nodes, prefix = '') {
    const result = [];
    nodes.forEach((n, i) => {
        const label = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
        result.push({ id: n.id, name: n.name || '(bez nazwy)', path: label });
        if (n.children?.length) result.push(...flattenWbsNodes(n.children, label));
    });
    return result;
}
import { useLocalSchemaSync } from '../../hooks/useLocalSchemaSync';
import { useDevice } from '../../hooks/useDevice';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Konfiguracja workera dla react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function SchematTab({ nodeId }) {
    const { isDesktop } = useDevice();
    const { dirHandle, dirName, syncStatus, syncStats, lastSync, isSupported, chooseFolder, syncFiles } = useLocalSchemaSync();

    const [schematics, setSchematics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    
    const [selectedSchematic, setSelectedSchematic] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);

    const [selectedMarker, _setSelectedMarker] = useState(null);
    const setSelectedMarker = (m) => {
        if (m?.id) sessionStorage.setItem('erp_selectedMarkerId', m.id);
        else sessionStorage.removeItem('erp_selectedMarkerId');
        _setSelectedMarker(m);
    };
    const [isAddingMarker, setIsAddingMarker] = useState(false);
    const [activeTool, setActiveTool] = useState('POINT'); // 'POINT', 'LINE', 'TEXT', 'MOVE'
    const [lineStart, setLineStart] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1.0);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [inlineEdits, setInlineEdits] = useState({});
    const [showTable, setShowTable] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    const pageRef = useRef(null);
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(800);
    const [contentAspect, setContentAspect] = useState(null); // height/width ratio of current page
    const scaleRef = useRef(scale);
    const isAddingMarkerRef = useRef(isAddingMarker);

    useEffect(() => { scaleRef.current = scale; }, [scale]);
    useEffect(() => { isAddingMarkerRef.current = isAddingMarker; }, [isAddingMarker]);

    // Reset aspect ratio gdy zmienia się schemat
    useEffect(() => { setContentAspect(null); }, [selectedSchematic?.id]);

    // Auto-sync przy pierwszym załadowaniu schematów (tylko sprawdza różnice)
    const hasSyncedOnMount = useRef(false);
    useEffect(() => {
        if (schematics.length > 0 && dirHandle && !hasSyncedOnMount.current) {
            hasSyncedOnMount.current = true;
            const token = sessionStorage.getItem('token');
            syncFiles(schematics, token);
        }
    }, [schematics, dirHandle]);

    // Skalowanie PDF do obszaru
    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            if (entries[0]?.contentRect) {
                // Margines z obu stron 32px na swobodne przewijanie
                setContainerWidth(entries[0].contentRect.width - 32);
            }
        });

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }
        return () => observer.disconnect();
    }, [selectedSchematic]);

    // Pełna obsługa gestów dotykowych — touch-action:none, wszystko w JS
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let pinchState = null; // { startDist, startScale }
        let panState = null;   // { x, y, scrollLeft, scrollTop }

        const dist2 = (t) => {
            const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };
        const onTouchStart = (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                pinchState = { startDist: dist2(e.touches), startScale: scaleRef.current };
                panState = null;
            } else if (e.touches.length === 1) {
                panState = { x: e.touches[0].clientX, y: e.touches[0].clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
                pinchState = null;
            }
        };
        const onTouchMove = (e) => {
            if (e.touches.length === 2 && pinchState) {
                e.preventDefault();
                const d = dist2(e.touches);
                setScale(Math.max(0.5, Math.min(5.0, pinchState.startScale * (d / pinchState.startDist))));
            } else if (e.touches.length === 1 && panState && !isAddingMarkerRef.current) {
                e.preventDefault();
                el.scrollLeft = panState.scrollLeft - (e.touches[0].clientX - panState.x);
                el.scrollTop  = panState.scrollTop  - (e.touches[0].clientY - panState.y);
            }
        };
        const onTouchEnd = (e) => {
            if (e.touches.length < 2) pinchState = null;
            if (e.touches.length === 0) panState = null;
        };
        el.addEventListener('touchstart', onTouchStart, { passive: false });
        el.addEventListener('touchmove',  onTouchMove,  { passive: false });
        el.addEventListener('touchend',   onTouchEnd);
        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove',  onTouchMove);
            el.removeEventListener('touchend',   onTouchEnd);
        };
    }, [selectedSchematic]);

    useEffect(() => {
        if (nodeId) fetchSchematics();
    }, [nodeId]);

    // Przy mountowaniu — doślij zaległe uploady z IndexedDB (po reloadzie mobilnym)
    useEffect(() => {
        flushPendingUploads(API_URL, () => fetchSchematics(true)).then(sent => {
            if (sent > 0) console.log(`[UploadQueue] Dosłano ${sent} zaległych załączników`);
        }).catch(() => {});
    }, []);

    // Utrzymuj aktualny stan wybranego znacznika po odświeżeniu schematów
    // + odtwórz z sessionStorage po przeładowaniu strony (mobile camera return)
    useEffect(() => {
        if (schematics.length === 0) return;
        const savedMarkerId = selectedMarker?.id || sessionStorage.getItem('erp_selectedMarkerId');
        if (savedMarkerId) {
            const updatedSchematic = schematics.find(s => s.markers.some(m => m.id === savedMarkerId));
            if (updatedSchematic) {
                const updatedMarker = updatedSchematic.markers.find(m => m.id === savedMarkerId);
                if (updatedMarker && JSON.stringify(updatedMarker) !== JSON.stringify(selectedMarker)) {
                    setSelectedMarker(updatedMarker);
                    if (!selectedSchematic || selectedSchematic.id !== updatedSchematic.id) {
                        setSelectedSchematic(updatedSchematic);
                    }
                }
            } else if (selectedMarker) {
                setSelectedMarker(null);
            }
        }
    }, [schematics]);

    const fetchSchematics = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/node/${nodeId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Błąd pobierania schematów');
            const data = await res.json();
            setSchematics(data);
            if (data.length > 0) {
                // Automatycznie wybierz najnowszy schemat, lub pozostaw aktywny jeżeli już jest
                if (!selectedSchematic || !data.find(s => s.id === selectedSchematic.id)) {
                    setSelectedSchematic(data[0]);
                    setPageNumber(1);
                } else {
                    setSelectedSchematic(data.find(s => s.id === selectedSchematic.id));
                }
            } else {
                setSelectedSchematic(null);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('nodeId', nodeId);

        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) throw new Error('Błąd wgrywania pliku');
            await fetchSchematics();
        } catch (err) {
            alert(err.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteSchematic = async (id) => {
        if (!window.confirm('Na pewno chcesz usunąć ten schemat?')) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Błąd usuwania');
            await fetchSchematics();
        } catch (err) {
            alert(err.message);
        }
    };

    const patchMarkerNote = async (markerId, note) => {
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/schematics/markers/${markerId}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
        }).catch(() => {});
        fetchSchematics();
    };

    const patchAttNote = async (attId, note) => {
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/schematics/attachments/${attId}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
        }).catch(() => {});
        fetchSchematics();
    };

    const handleMouseMove = (e) => {
        if (isPanning && containerRef.current) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            containerRef.current.scrollLeft = panStart.scrollLeft - dx;
            containerRef.current.scrollTop = panStart.scrollTop - dy;
            return;
        }

        if (!isAddingMarker || activeTool !== 'LINE' || !lineStart || !pageRef.current) return;
        const canvas = pageRef.current.querySelector('canvas') || pageRef.current;
        const rect = canvas.getBoundingClientRect();
        setMousePos({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100
        });
    };

    const handlePanStart = (e) => {
        if (activeTool !== 'MOVE' || !containerRef.current) return;
        setIsPanning(true);
        setPanStart({
            x: e.clientX,
            y: e.clientY,
            scrollLeft: containerRef.current.scrollLeft,
            scrollTop: containerRef.current.scrollTop
        });
    };

    const handlePanEnd = () => {
        setIsPanning(false);
    };


    const handlePageClick = async (e) => {
        if (activeTool === 'MOVE') return;
        if (!isAddingMarker || !selectedSchematic || !pageRef.current) return;

        const canvas = pageRef.current.querySelector('canvas') || pageRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        if (activeTool === 'LINE') {
            if (!lineStart) {
                setLineStart({ x, y });
                return;
            }
            
            // Mamy już start, teraz mamy koniec
            const note = prompt('Podaj krótką notatkę dla tej linii:');
            if (note === null) {
                setLineStart(null);
                setIsAddingMarker(false);
                return;
            }

            try {
                const token = sessionStorage.getItem('token');
                const res = await fetch(`${API_URL}/schematics/${selectedSchematic.id}/markers`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        type: 'LINE', 
                        x: lineStart.x, 
                        y: lineStart.y, 
                        x2: x, 
                        y2: y, 
                        pageNumber, 
                        note 
                    })
                });
                if (!res.ok) throw new Error('Błąd zapisu linii');
                setLineStart(null);
                setIsAddingMarker(false);
                fetchSchematics();
            } catch (err) {
                alert(err.message);
            }
            return;
        }

        if (activeTool === 'TEXT') {
            const text = prompt('Wpisz tekst, który ma być widoczny na schemacie:');
            if (!text) {
               setIsAddingMarker(false);
               return;
            }

            try {
                const token = sessionStorage.getItem('token');
                const res = await fetch(`${API_URL}/schematics/${selectedSchematic.id}/markers`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ type: 'TEXT', x, y, pageNumber, note: text })
                });
                if (!res.ok) throw new Error('Błąd zapisu tekstu');
                setIsAddingMarker(false);
                fetchSchematics();
            } catch (err) {
                alert(err.message);
            }
            return;
        }

        // Standardowy Point
        const name = prompt('Nazwa znacznika (tooltip):');
        if (name === null) {
            setIsAddingMarker(false);
            return;
        }

        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/${selectedSchematic.id}/markers`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ type: 'POINT', x, y, pageNumber, name, note: '' })
            });
            if (!res.ok) throw new Error('Błąd zapisu znacznika');
            setIsAddingMarker(false);
            fetchSchematics();
        } catch (err) {
            alert(err.message);
        }
    };

    const onDocumentLoadSuccess = (pdf) => {
        setNumPages(pdf.numPages);
    };

    const getFileUrl = (fileName) => {
        return `${API_URL}/schematics/file/${fileName}`;
    };

    const isImageFile = (fileName) => /\.(jpg|jpeg|png|webp)$/i.test(fileName || '');

    const exportMarkersToPdf = async () => {
        setExporting(true);
        try {
            const token = sessionStorage.getItem('token');
            const allMarkers = schematics.flatMap(sch =>
                sch.markers.map(m => ({ ...m, schematicName: sch.fileName }))
            );
            const toBase64 = async (fileUrl) => {
                try {
                    const res = await fetch(`${API_URL}/schematics/file/${fileUrl}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!res.ok) return null;
                    const blob = await res.blob();
                    return new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch { return null; }
            };
            for (const m of allMarkers) {
                if (m.attachments) {
                    for (const att of m.attachments) {
                        if (att.fileType === 'IMAGE') att._b64 = await toBase64(att.fileUrl);
                    }
                }
            }
            const date = new Date().toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
            let rowNum = 0;
            const rows = allMarkers.flatMap((m) => {
                const wbsName = m.subtask?.name || '—';
                const images = (m.attachments || []).filter(a => a.fileType === 'IMAGE' && a._b64);
                if (images.length === 0) {
                    rowNum++;
                    return [`<tr>
                        <td>${rowNum}</td>
                        <td>${wbsName}</td>
                        <td>${m.name || '—'}</td>
                        <td>${m.note || '—'}</td>
                        <td>—</td>
                        <td>—</td>
                    </tr>`];
                }
                return images.map(a => {
                    rowNum++;
                    return `<tr>
                        <td>${rowNum}</td>
                        <td>${wbsName}</td>
                        <td>${m.name || '—'}</td>
                        <td>${m.note || '—'}</td>
                        <td><img src="${a._b64}" style="max-width:140px;max-height:140px;border-radius:4px;border:1px solid #e5e7eb;" /></td>
                        <td>${a.note || '—'}</td>
                    </tr>`;
                });
            }).join('');
            const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8">
            <title>Raport z wizji lokalnej</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 20px; }
                h1 { font-size: 16px; margin-bottom: 4px; }
                .meta { font-size: 10px; color: #666; margin-bottom: 16px; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #1e40af; color: white; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
                td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
                tr:nth-child(even) td { background: #f9fafb; }
                td:nth-child(2) { min-width: 120px; font-weight: bold; color: #1e40af; }
                td:nth-child(3) { min-width: 100px; }
                td:nth-child(4) { max-width: 220px; white-space: pre-wrap; word-break: break-word; }
                td:nth-child(6) { max-width: 180px; white-space: pre-wrap; word-break: break-word; }
                @media print { body { margin: 10mm; } }
            </style></head><body>
            <h1>Raport z wizji lokalnej</h1>
            <div class="meta">Wygenerowano: ${date} &nbsp;|&nbsp; Łączna liczba punktów: ${allMarkers.length}</div>
            <table>
                <thead><tr>
                    <th>#</th><th>Przedmiot WBS</th><th>Nazwa</th><th>Notatka do Punktu</th><th>Zdjęcie</th><th>Notatka do zdjęcia</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <script>window.onload = () => { window.print(); }<\/script>
            </body></html>`;
            const w = window.open('', '_blank');
            w.document.write(html);
            w.document.close();
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return <div className="text-gray-400 p-4">Ładowanie schematów...</div>;
    }

    return (
        <div className="flex flex-col md:flex-row h-full bg-gray-900/50 rounded-xl overflow-hidden border border-white/5 relative">
            {/* Lewy panel - narzędzia i lista schematów */}
            <div className="w-full md:w-64 h-48 md:h-auto bg-black/40 border-b md:border-b-0 md:border-r border-white/5 flex flex-col p-4 flex-shrink-0">
                <h3 className="text-white font-bold mb-4 uppercase tracking-wider text-xs flex items-center gap-2">
                    <MapPin size={14} className="text-orange-400" /> Schematy
                </h3>
                
                <div className="flex-1 overflow-y-auto pr-2 space-y-2 mb-4">
                    {schematics.map(sch => (
                        <div 
                            key={sch.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-all group relative ${
                                selectedSchematic?.id === sch.id 
                                ? 'bg-orange-500/20 border-orange-500/50 text-orange-200' 
                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                            }`}
                            onClick={() => { setSelectedSchematic(sch); setPageNumber(1); }}
                        >
                            <div className="text-xs truncate pr-6" title={sch.fileName}>{sch.fileName}</div>
                            <div className="text-[10px] opacity-60 mt-1">Znaczników: {sch.markers.length}</div>
                            
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteSchematic(sch.id); }}
                                className="absolute right-2 top-2 p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Usuń schemat"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                    {schematics.length === 0 && (
                        <div className="text-xs text-gray-500 text-center mt-10">
                            Brak wgranych schematów.
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t border-white/5 space-y-2">
                    {isSupported && (
                        dirHandle ? (
                            <div className="space-y-1">
                                <div className="relative group">
                                    <button
                                        onClick={() => {
                                            const token = sessionStorage.getItem('token');
                                            syncFiles(schematics, token);
                                        }}
                                        disabled={syncStatus === 'syncing'}
                                        className="w-full flex items-center justify-center gap-2 p-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-lg transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-wait"
                                    >
                                        <RefreshCw size={13} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                                        {syncStatus === 'syncing' ? 'Sprawdzanie...' : 'Synchronizuj'}
                                    </button>
                                    <div className="absolute bottom-full left-0 mb-2 w-72 bg-gray-900 border border-white/10 rounded-xl p-3 shadow-2xl text-[11px] text-gray-300 leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                        <p className="font-bold text-cyan-400 mb-1">Jak działa synchronizacja?</p>
                                        <p>Porównuje rozmiar każdego pliku na serwerze z lokalną kopią. Pobiera tylko pliki które się różnią — <span className="text-white">serwer zawsze wygrywa</span>.</p>
                                        <p className="mt-1.5 text-gray-500">Kierunek: <span className="text-cyan-400">serwer → folder lokalny</span></p>
                                        <p className="mt-1 text-gray-500">Uruchamia się automatycznie przy otwarciu zakładki.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] px-1">
                                    <FolderOpen size={9} className="text-gray-600 shrink-0" />
                                    <span className="truncate flex-1 text-gray-600" title={dirName}>{dirName}</span>
                                    {syncStats && syncStatus === 'done' && (
                                        <span className="shrink-0 text-cyan-500/70">
                                            {syncStats.downloaded > 0
                                                ? `↓ ${syncStats.downloaded} pobrano, ${syncStats.skipped} aktualne`
                                                : `✓ ${syncStats.skipped} aktualnych`}
                                        </span>
                                    )}
                                    {syncStatus === 'error' && (
                                        <span className="shrink-0 text-red-400">błąd sync</span>
                                    )}
                                    {lastSync && syncStatus !== 'error' && !syncStats && (
                                        <span className="shrink-0 text-gray-600">
                                            {lastSync.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={chooseFolder}
                                className="w-full flex items-center justify-center gap-2 p-2.5 bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 rounded-lg transition-colors text-xs font-medium"
                                title="Wybierz folder lokalny do synchronizacji schematów"
                            >
                                <HardDrive size={13} />
                                Ustaw folder lokalny
                            </button>
                        )
                    )}
                    <label className="flex items-center justify-center gap-2 p-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg cursor-pointer transition-colors text-sm font-medium">
                        <Upload size={16} />
                        {uploading ? 'Wgrywanie...' : 'Wgraj PDF / JPG'}
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleUpload}
                            className="hidden"
                            disabled={uploading}
                        />
                    </label>

                    {/* Narzędzia edycji — tylko mobile */}
                    {!isDesktop && selectedSchematic && (
                        <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
                                <button onClick={() => { setActiveTool('MOVE'); setIsAddingMarker(false); }} className={`p-1.5 rounded transition-colors ${activeTool === 'MOVE' ? 'bg-orange-500 text-white' : 'text-gray-400'}`} title="Przesuń"><Hand size={14}/></button>
                                <button onClick={() => setActiveTool('POINT')} className={`p-1.5 rounded transition-colors ${activeTool === 'POINT' ? 'bg-orange-500 text-white' : 'text-gray-400'}`} title="Punkt"><MapPin size={14}/></button>
                                <button onClick={() => setActiveTool('LINE')} className={`p-1.5 rounded transition-colors ${activeTool === 'LINE' ? 'bg-orange-500 text-white' : 'text-gray-400'}`} title="Linia"><Minus size={14}/></button>
                                <button onClick={() => setActiveTool('TEXT')} className={`p-1.5 rounded transition-colors ${activeTool === 'TEXT' ? 'bg-orange-500 text-white' : 'text-gray-400'}`} title="Tekst"><Type size={14}/></button>
                            </div>
                            <button
                                onClick={() => { setIsAddingMarker(!isAddingMarker); setLineStart(null); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${isAddingMarker ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' : 'bg-white/5 text-gray-300 border-white/10'}`}
                            >
                                <MapPin size={13}/>
                                {isAddingMarker ? 'Anuluj' : 'Dodaj'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Główny obszar - podgląd PDF */}
            <div className={`flex-1 flex flex-col bg-gray-800/20 overflow-hidden ${!isDesktop && isFullscreen ? 'fixed inset-0 z-[200]' : ''}`}>
                {/* Wiersz: PDF viewer + panel znacznika */}
                <div className="flex-1 flex overflow-hidden min-h-0 relative">
                <div className="flex-1 overflow-hidden flex flex-col min-w-0">
                {selectedSchematic ? (
                    <div className="flex flex-col flex-1 min-h-0">
                        {/* Pasek narzędzi PDF */}
                        <div className="h-12 border-b border-white/5 flex items-center px-4 justify-between bg-black/20 flex-shrink-0">
                            <div className="flex items-center gap-4">
                                {!isImageFile(selectedSchematic.fileUrl) && (<>
                                <button
                                    disabled={pageNumber <= 1}
                                    onClick={() => setPageNumber(p => p - 1)}
                                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-xs rounded disabled:opacity-30 text-white"
                                >
                                    Poprzednia
                                </button>
                                <span className="text-xs text-gray-400">
                                    Strona {pageNumber} z {numPages || '?'}
                                </span>
                                <button
                                    disabled={pageNumber >= numPages}
                                    onClick={() => setPageNumber(p => p + 1)}
                                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-xs rounded disabled:opacity-30 text-white"
                                >
                                    Następna
                                </button>
                                </>)}
                            </div>


                            {isDesktop && (<>
                            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10 mr-4">
                                <button
                                    onClick={() => { setActiveTool('MOVE'); setIsAddingMarker(false); }}
                                    className={`p-1.5 rounded transition-colors ${activeTool === 'MOVE' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
                                    title="Przesuń (Rączka)"
                                >
                                    <Hand size={14} />
                                </button>
                                <button
                                    onClick={() => setActiveTool('POINT')}
                                    className={`p-1.5 rounded transition-colors ${activeTool === 'POINT' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
                                    title="Punkt/Znacznik"
                                >
                                    <MapPin size={14} />
                                </button>
                                <button
                                    onClick={() => setActiveTool('LINE')}
                                    className={`p-1.5 rounded transition-colors ${activeTool === 'LINE' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
                                    title="Linia"
                                >
                                    <Minus size={14} />
                                </button>
                                <button
                                    onClick={() => setActiveTool('TEXT')}
                                    className={`p-1.5 rounded transition-colors ${activeTool === 'TEXT' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
                                    title="Tekst"
                                >
                                    <Type size={14} />
                                </button>
                            </div>

                            <button
                                onClick={() => {
                                    setIsAddingMarker(!isAddingMarker);
                                    setLineStart(null);
                                }}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                                    isAddingMarker
                                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/50'
                                    : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                                }`}
                            >
                                <MapPin size={14} />
                                {isAddingMarker
                                    ? (activeTool === 'LINE'
                                        ? (lineStart ? 'Kliknij by zakończyć linię' : 'Kliknij by zacząć linię')
                                        : activeTool === 'TEXT' ? 'Kliknij by wstawić tekst' : 'Kliknij na schemat by dodać')
                                    : `Dodaj ${activeTool === 'LINE' ? 'Linię' : activeTool === 'TEXT' ? 'Tekst' : 'Znacznik'}`
                                }
                            </button>
                            </>)}

                            <button
                                onClick={exportMarkersToPdf}
                                disabled={exporting}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-wait"
                                title="Eksportuj znaczniki do PDF"
                            >
                                <FileDown size={14} />
                                {exporting ? 'Przygotowuję...' : 'Eksport PDF'}
                            </button>

                            {!isDesktop && (<>

                            {selectedSchematic && (() => {
                                const cnt = selectedSchematic.markers.flatMap(m => m.attachments || []).length;
                                if (cnt === 0) return null;
                                return (
                                    <button
                                        onClick={() => setShowTable(s => !s)}
                                        className={`flex items-center gap-1 p-1.5 rounded-lg border transition-colors text-xs font-bold ${showTable ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-black/20 text-gray-400 hover:text-white border-white/10'}`}
                                        title="Tabela załączników"
                                    >
                                        <List size={14}/> <span className="text-[10px]">{cnt}</span>
                                    </button>
                                );
                            })()}
                            </>)}
                        </div>

                        {/* Overlay — przyciski zoom + fullscreen */}
                        <div className="fixed bottom-4 right-3 z-[100] flex flex-col gap-2 pointer-events-none">
                            {!isDesktop && (
                                <button
                                    onClick={() => setIsFullscreen(f => !f)}
                                    className={`pointer-events-auto w-8 h-8 flex items-center justify-center rounded-lg bg-black/25 border border-emerald-400 text-emerald-400 active:scale-95 transition-transform`}
                                    title={isFullscreen ? 'Zamknij pełny ekran' : 'Pełny ekran'}
                                >
                                    {isFullscreen ? <Minimize2 size={18}/> : <Maximize size={18}/>}
                                </button>
                            )}
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

                        {/* Obszar roboczy PDF */}
                        <div
                            className={`flex-1 min-h-0 overflow-auto overscroll-contain p-4 [&_canvas]:touch-none ${activeTool === 'MOVE' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
                            style={{ touchAction: 'none' }}
                            ref={containerRef}
                            onMouseMove={handleMouseMove}
                            onMouseDown={handlePanStart}
                            onMouseUp={handlePanEnd}
                            onMouseLeave={handlePanEnd}
                        >
                            {(() => {
                                const pageWidth = containerWidth * scale;
                                // Domyślny aspect A4 — zapewnia explicit height od razu (top:y% działa)
                                const aspect = contentAspect || 1.414;
                                const pageHeight = Math.round(pageWidth * aspect);
                                return (
                                <div
                                    className={`relative block shadow-2xl mx-auto ${isAddingMarker ? 'cursor-crosshair ring-2 ring-orange-500' : ''}`}
                                    style={{ width: pageWidth, minWidth: pageWidth, height: pageHeight }}
                                    onClick={handlePageClick}
                                    ref={pageRef}
                                >
                                {isImageFile(selectedSchematic.fileUrl) ? (
                                    <img
                                        src={getFileUrl(selectedSchematic.fileUrl)}
                                        alt={selectedSchematic.fileName}
                                        className="block w-full h-full object-fill"
                                        onLoad={(e) => {
                                            setNumPages(1);
                                            if (e.target.naturalWidth) setContentAspect(e.target.naturalHeight / e.target.naturalWidth);
                                        }}
                                    />
                                ) : (
                                    <Document
                                        file={getFileUrl(selectedSchematic.fileUrl)}
                                        onLoadSuccess={onDocumentLoadSuccess}
                                        loading={<div className="text-gray-500 p-10">Ładowanie PDF...</div>}
                                    >
                                        <Page
                                            pageNumber={pageNumber}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            width={pageWidth}
                                            className="rounded overflow-hidden shadow"
                                            onLoadSuccess={(page) => {
                                                const vp = page.getViewport({ scale: 1 });
                                                setContentAspect(vp.height / vp.width);
                                            }}
                                        />
                                    </Document>
                                )}

                                {/* Nakładka SVG dla linii i aktywnych rysunków */}
                                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ overflow: 'visible' }}>
                                    {selectedSchematic.markers.filter(m => m.pageNumber === pageNumber && m.type === 'LINE').map(line => (
                                        <g 
                                            key={line.id} 
                                            className="cursor-pointer pointer-events-auto group"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedMarker(line);
                                            }}
                                        >
                                            <line 
                                                x1={`${line.x}%`} y1={`${line.y}%`} 
                                                x2={`${line.x2}%`} y2={`${line.y2}%`} 
                                                stroke="rgba(249, 115, 22, 0.4)" 
                                                strokeWidth="12" 
                                                className="transition-all group-hover:stroke-orange-500/60"
                                            />
                                            <line 
                                                x1={`${line.x}%`} y1={`${line.y}%`} 
                                                x2={`${line.x2}%`} y2={`${line.y2}%`} 
                                                stroke="#f97316" 
                                                strokeWidth="3" 
                                                strokeDasharray="5,3"
                                            />
                                            <circle cx={`${line.x}%`} cy={`${line.y}%`} r="3" fill="#f97316" />
                                            <circle cx={`${line.x2}%`} cy={`${line.y2}%`} r="3" fill="#f97316" />
                                        </g>
                                    ))}

                                    {isAddingMarker && activeTool === 'LINE' && lineStart && (
                                        <line 
                                            x1={`${lineStart.x}%`} 
                                            y1={`${lineStart.y}%`} 
                                            x2={`${mousePos.x}%`} 
                                            y2={`${mousePos.y}%`}
                                            stroke="#f97316" 
                                            strokeWidth="2" 
                                            strokeDasharray="4"
                                            className="opacity-50"
                                        />
                                    )}
                                </svg>

                                {selectedSchematic.markers.filter(m => m.pageNumber === pageNumber && m.type === 'TEXT').map(text => (
                                    <div
                                        key={text.id}
                                        className="absolute cursor-pointer z-10 select-none transform -translate-x-1/2 -translate-y-1/2"
                                        style={{ left: `${text.x}%`, top: `${text.y}%` }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedMarker(text);
                                        }}
                                    >
                                        <div className="bg-orange-500/90 text-white text-[11px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-orange-400 group-hover:scale-110 transition-transform whitespace-nowrap">
                                            {text.note}
                                        </div>
                                    </div>
                                ))}

                                {selectedSchematic.markers.filter(m => m.pageNumber === pageNumber && m.type === 'POINT').map(marker => (
                                    <div
                                        key={marker.id}
                                        className="absolute w-6 h-6 -ml-3 -mt-6 cursor-pointer text-orange-500 hover:text-orange-400 hover:scale-110 transition-transform group z-10"
                                        style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedMarker(marker);
                                        }}
                                        title={marker.name || marker.note || 'Znacznik'}
                                    >
                                        <MapPin fill="currentColor" size={24} className="filter drop-shadow-md" />
                                        {(marker.name || marker.note) && (
                                            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/90 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none">
                                                {marker.name || marker.note}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                                );
                            })()}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                        Wybierz z listy lub wgraj nowy schemat PDF.
                    </div>
                )}
                </div>

                {selectedMarker && (
                    <div className={!isDesktop ? 'absolute inset-0 z-30' : 'contents'}>
                        <MarkerDetailsPanel
                            key={selectedMarker.id}
                            marker={selectedMarker}
                            onClose={() => setSelectedMarker(null)}
                            onRefresh={() => fetchSchematics(true)}
                            onMarkerUpdated={(updates) => {
                                setSelectedMarker(m => ({ ...m, ...updates }));
                                setSelectedSchematic(sch => sch ? ({
                                    ...sch,
                                    markers: sch.markers.map(m => m.id === updates.id ? { ...m, ...updates } : m)
                                }) : sch);
                            }}
                            onLightbox={setLightboxUrl}
                            nodeId={nodeId}
                        />
                    </div>
                )}
                </div>

            {(isDesktop || (showTable && !isFullscreen)) && selectedSchematic && (() => {
                const rows = selectedSchematic.markers.flatMap(m =>
                    (m.attachments || []).map(a => ({
                        ...a,
                        markerId: m.id,
                        markerName: m.name || '—',
                        markerNote: m.note || '',
                    }))
                );
                if (rows.length === 0) return null;

                const getFileUrl = (fileName) => `${API_URL}/schematics/file/${fileName}`;
                const downloadFile = async (att) => {
                    const token = sessionStorage.getItem('token');
                    try {
                        const res = await fetch(getFileUrl(att.fileUrl), { headers: { 'Authorization': `Bearer ${token}` } });
                        const blob = await res.blob();
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = att.fileName || att.fileUrl;
                        a.click();
                        URL.revokeObjectURL(a.href);
                    } catch (err) { alert('Błąd pobierania: ' + err.message); }
                };

                return (
                    <div className="border-t border-white/5 bg-black/30 px-4 py-3 max-h-72 overflow-y-auto flex-shrink-0">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em]">
                                Załączniki ({rows.length})
                            </span>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => rows.forEach(a => downloadFile(a))}
                                    className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    <Download size={12} /> Pobierz wszystko
                                </button>
                                <button onClick={() => setShowTable(false)} className="p-1 text-gray-500 hover:text-white rounded" title="Ukryj tabelę">
                                    <X size={13}/>
                                </button>
                            </div>
                        </div>
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-gray-600 text-[10px] uppercase border-b border-white/5">
                                    <th className="text-left py-1.5 pr-4 font-black w-32">Znacznik</th>
                                    <th className="text-left py-1.5 pr-4 font-black w-40">Notatka znacznika</th>
                                    <th className="text-left py-1.5 pr-4 font-black">Załącznik</th>
                                    <th className="text-left py-1.5 pr-4 font-black w-40">Notatka załącznika</th>
                                    <th className="py-1.5 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(att => (
                                    <tr key={att.id} className="border-b border-white/5 hover:bg-white/5 transition-colors align-middle">
                                        <td className="py-2 pr-4 text-gray-300 font-medium truncate max-w-[128px]">{att.markerName}</td>
                                        <td className="py-2 pr-4 max-w-[160px]">
                                            <input
                                                type="text"
                                                value={inlineEdits[`m_${att.markerId}`] !== undefined ? inlineEdits[`m_${att.markerId}`] : (att.markerNote || '')}
                                                onChange={e => setInlineEdits(p => ({...p, [`m_${att.markerId}`]: e.target.value}))}
                                                onBlur={() => { if (inlineEdits[`m_${att.markerId}`] !== undefined) { patchMarkerNote(att.markerId, inlineEdits[`m_${att.markerId}`]); setInlineEdits(p => { const n={...p}; delete n[`m_${att.markerId}`]; return n; }); }}}
                                                onKeyDown={e => { if (e.key==='Enter') { patchMarkerNote(att.markerId, inlineEdits[`m_${att.markerId}`] ?? att.markerNote ?? ''); setInlineEdits(p => { const n={...p}; delete n[`m_${att.markerId}`]; return n; }); }}}
                                                placeholder="brak notatki"
                                                className="w-full text-[11px] bg-transparent border-b border-transparent hover:border-white/20 focus:border-orange-500/50 text-gray-400 italic placeholder-gray-700 focus:outline-none py-0.5 transition-colors"
                                            />
                                        </td>
                                        <td className="py-2 pr-4">
                                            {att.fileType === 'IMAGE' && (
                                                <button onClick={() => setLightboxUrl(getFileUrl(att.fileUrl))} className="block">
                                                    <img src={getFileUrl(att.fileUrl)} alt={att.fileName} className="h-14 w-auto rounded border border-white/10 object-cover hover:opacity-80 transition-opacity cursor-zoom-in"/>
                                                </button>
                                            )}
                                            {att.fileType === 'AUDIO' && (
                                                <audio controls className="h-8 w-48" src={getFileUrl(att.fileUrl)}/>
                                            )}
                                            {att.fileType === 'FILE' && (
                                                <span className="text-gray-400 flex items-center gap-1"><FileText size={13}/>{att.fileName}</span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-4 max-w-[160px]">
                                            <input
                                                type="text"
                                                value={inlineEdits[`a_${att.id}`] !== undefined ? inlineEdits[`a_${att.id}`] : (att.note || '')}
                                                onChange={e => setInlineEdits(p => ({...p, [`a_${att.id}`]: e.target.value}))}
                                                onBlur={() => { if (inlineEdits[`a_${att.id}`] !== undefined) { patchAttNote(att.id, inlineEdits[`a_${att.id}`]); setInlineEdits(p => { const n={...p}; delete n[`a_${att.id}`]; return n; }); }}}
                                                onKeyDown={e => { if (e.key==='Enter') { patchAttNote(att.id, inlineEdits[`a_${att.id}`] ?? att.note ?? ''); setInlineEdits(p => { const n={...p}; delete n[`a_${att.id}`]; return n; }); }}}
                                                placeholder="brak notatki"
                                                className="w-full text-[11px] bg-transparent border-b border-transparent hover:border-white/20 focus:border-orange-500/50 text-gray-400 italic placeholder-gray-700 focus:outline-none py-0.5 transition-colors"
                                            />
                                        </td>
                                        <td className="py-2">
                                            <button onClick={() => downloadFile(att)} className="p-1 text-blue-400 hover:text-blue-300 transition-colors">
                                                <Download size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })()}
            </div>

            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
                    onClick={() => setLightboxUrl(null)}
                >
                    <img
                        src={lightboxUrl}
                        alt="Podgląd"
                        className="max-w-full max-h-full object-contain select-none"
                        onClick={e => e.stopPropagation()}
                    />
                    <button
                        className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80 transition-colors"
                        onClick={() => setLightboxUrl(null)}
                    >
                        <X size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}

function MarkerDetailsPanel({ marker, onClose, onRefresh, onMarkerUpdated, onLightbox, nodeId }) {
    const [uploading, setUploading] = useState(false);
    const [editName, setEditName] = useState(marker.name || '');
    const [editNote, setEditNote] = useState(marker.note || '');
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [subtasks, setSubtasks] = useState([]);
    const [selectedSubtaskId, setSelectedSubtaskId] = useState(marker.subtaskId || '');
    const [editingAttNotes, setEditingAttNotes] = useState({});
    const [wbsNodes, setWbsNodes] = useState([]);
    const [wbsLinks, setWbsLinks] = useState([]);
    const [wbsToggling, setWbsToggling] = useState(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

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
        fetch(`${API_URL}/order-requirements/${nodeId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()).then(data => {
            try {
                const tree = JSON.parse(data.wbsTree || '{}');
                setWbsNodes(flattenWbsNodes(tree.items || []));
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
                if (res.ok) { const link = await res.json(); setWbsLinks(prev => [...prev, link]); }
            }
        } finally {
            setWbsToggling(null);
        }
    };

    const handleUpdateName = async () => {
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: editName })
        }).catch(() => {});
        onMarkerUpdated?.({ id: marker.id, name: editName });
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
        onMarkerUpdated?.({ id: marker.id, subtaskId: val });
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks = [];

            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = async () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
                await uploadFile(file);
                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
        } catch (err) {
            alert('Błąd dostępu do mikrofonu: ' + err.message);
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            setIsRecording(false);
        }
    };

    const startCamera = async () => {
        setIsCameraActive(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 4096 }, height: { ideal: 2160 } }
            });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) {
            alert('Błąd dostępu do kamery: ' + err.message);
            setIsCameraActive(false);
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsCameraActive(false);
    };

    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
            await uploadFile(file);
            stopCamera();
        }, 'image/jpeg', 0.95);
    };

    const uploadFile = async (file) => {
        setUploading(true);
        // Zapisz do IndexedDB PRZED wysłaniem (przetrwa reload)
        let queueId = null;
        try {
            queueId = await enqueueUpload({
                markerId: marker.id,
                fileName: file.name,
                fileType: file.type,
                blob: file,
            });
        } catch (e) {
            console.warn('[UploadQueue] Nie udało się zapisać do kolejki:', e);
        }

        const formData = new FormData();
        formData.append('file', file);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/markers/${marker.id}/attachments`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            if (!res.ok) throw new Error('Błąd wgrywania pliku');
            // Sukces — usuń z kolejki
            if (queueId) await removeFromQueue(queueId).catch(() => {});
            onRefresh();
        } catch (err) {
            // Plik pozostaje w IndexedDB — zostanie dosłany po reloadzie
            console.warn('[Upload] Nie wysłano, plik w kolejce do retry:', err.message);
        } finally {
            setUploading(false);
        }
    };

    const handleUpdateNote = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ note: editNote })
            });
            if (!res.ok) throw new Error('Błąd zapisu');
            onMarkerUpdated?.({ id: marker.id, note: editNote });
        } catch(err) {
            alert(err.message);
        }
    };

    const handleDeleteMarker = async () => {
        if (!window.confirm('Usunąć znacznik i wszystkie jego załączniki?')) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/markers/${marker.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Błąd usuwania');
            onClose();
            onRefresh();
        } catch(err) {
            alert(err.message);
        }
    };

    const handleUploadAttachment = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        for (const file of files) {
            await uploadFile(file);
        }
    };

    const handleUpdateAttNote = async (attId, note) => {
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/schematics/attachments/${attId}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ note })
        }).catch(() => {});
        onRefresh();
    };

    const handleDeleteAttachment = async (id) => {
        if (!window.confirm('Usunąć ten załącznik?')) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/attachments/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Błąd usuwania');
            onRefresh();
        } catch(err) {
            alert(err.message);
        }
    };

    const getFileUrl = (fileName) => `${API_URL}/schematics/file/${fileName}`;

    return (
        <div className="w-full md:w-80 flex-shrink-0 bg-gray-900 border-l border-white/10 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                <h3 className="font-bold text-sm text-gray-200 flex items-center gap-2">
                    <MapPin size={16} className="text-orange-400" />
                    Szczegóły znacznika
                </h3>
                <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded">
                    <X size={16} />
                </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-6">
                <div>
                    <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Nazwa (tooltip)</label>
                    <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={handleUpdateName}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500/50"
                        placeholder="Nazwa widoczna na mapie..."
                    />
                </div>

                <div>
                    <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Notatka</label>
                    <textarea
                        value={editNote}
                        onChange={e => setEditNote(e.target.value)}
                        onBlur={handleUpdateNote}
                        className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-gray-200 resize-none h-24 focus:outline-none focus:border-orange-500/50"
                        placeholder="Brak notatki..."
                    />
                </div>

                {nodeId && wbsNodes.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <Layers size={11} className="text-gray-500" />
                            <label className="text-xs text-gray-500 uppercase font-bold">
                                Przedmioty projektu{wbsLinks.length > 0 ? ` (${wbsLinks.length})` : ''}
                            </label>
                        </div>
                        <div className="space-y-1 max-h-52 overflow-y-auto">
                            {wbsNodes.map(node => {
                                const linked = wbsLinks.some(l => l.wbsNodeId === node.id);
                                const toggling = wbsToggling === node.id;
                                const indent = (node.path.split('.').length - 1) * 10;
                                return (
                                    <button
                                        key={node.id}
                                        onClick={() => toggleWbsLink(node.id)}
                                        disabled={toggling}
                                        style={{ paddingLeft: `${8 + indent}px` }}
                                        className={`w-full flex items-center gap-2 py-1.5 pr-2 rounded-lg text-left text-xs transition-all ${
                                            linked
                                                ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                                                : 'bg-black/20 border border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                        } ${toggling ? 'opacity-50' : ''}`}
                                    >
                                        {linked
                                            ? <CheckSquare size={12} className="text-blue-400 flex-shrink-0" />
                                            : <Square size={12} className="text-gray-600 flex-shrink-0" />
                                        }
                                        <span className="font-mono text-[10px] text-gray-500 flex-shrink-0">{node.path}</span>
                                        <span className="truncate">{node.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div>
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-xs text-gray-500 uppercase font-bold">Załączniki</label>
                        <div className="flex gap-1">
                            <button 
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                                    isRecording ? 'bg-red-500 animate-pulse text-white' : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400'
                                }`}
                            >
                                <Mic size={12} />
                                {isRecording ? 'Stop' : 'Głos'}
                            </button>
                            <button 
                                onClick={isCameraActive ? stopCamera : startCamera}
                                className="text-[10px] bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 px-2 py-1 rounded transition-colors flex items-center gap-1"
                            >
                                <Camera size={12} />
                                {isCameraActive ? 'Anuluj' : 'Foto'}
                            </button>
                            <label className="text-[10px] bg-green-500/10 hover:bg-green-500/20 text-green-400 px-2 py-1 rounded cursor-pointer transition-colors flex items-center gap-1">
                                <ImageIcon size={11} />
                                Galeria
                                <input type="file" accept="image/*" multiple onChange={handleUploadAttachment} className="hidden" disabled={uploading}/>
                            </label>
                            <label className="text-[10px] bg-white/5 hover:bg-white/10 text-white px-2 py-1 rounded cursor-pointer transition-colors">
                                {uploading ? '...' : '+ Plik'}
                                <input type="file" multiple onChange={handleUploadAttachment} className="hidden" disabled={uploading}/>
                            </label>
                        </div>
                    </div>

                    {isCameraActive && (
                        <div className="relative bg-black rounded-lg overflow-hidden border border-orange-500/30 mb-4">
                            <video ref={videoRef} autoPlay playsInline className="w-full h-auto bg-black" />
                            <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
                                <button onClick={capturePhoto} className="bg-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
                                    <Camera size={16} /> Zrób zdjęcie
                                </button>
                            </div>
                            <canvas ref={canvasRef} className="hidden" />
                        </div>
                    )}

                    <div className="space-y-3">
                        {marker.attachments?.map(att => (
                            <div key={att.id} className="bg-black/20 border border-white/5 rounded-lg p-2 group relative">
                                {att.fileType === 'IMAGE' && (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2 text-xs text-blue-300"><ImageIcon size={14} /> Zdjęcie</div>
                                        <img
                                            src={getFileUrl(att.fileUrl)}
                                            alt={att.fileName}
                                            className="w-full h-auto rounded border border-white/10 cursor-zoom-in hover:opacity-80 transition-opacity"
                                            onClick={() => onLightbox && onLightbox(getFileUrl(att.fileUrl))}
                                        />
                                    </div>
                                )}
                                {att.fileType === 'AUDIO' && (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2 text-xs text-purple-300"><Mic size={14} /> Głos</div>
                                        <audio controls className="w-full h-8" src={getFileUrl(att.fileUrl)}/>
                                    </div>
                                )}
                                <input
                                    type="text"
                                    value={editingAttNotes[att.id] !== undefined ? editingAttNotes[att.id] : (att.note || '')}
                                    onChange={e => setEditingAttNotes(p => ({...p, [att.id]: e.target.value}))}
                                    onBlur={() => { if (editingAttNotes[att.id] !== undefined) { handleUpdateAttNote(att.id, editingAttNotes[att.id]); setEditingAttNotes(p => { const n={...p}; delete n[att.id]; return n; }); }}}
                                    onKeyDown={e => { if (e.key==='Enter') { handleUpdateAttNote(att.id, editingAttNotes[att.id] ?? att.note ?? ''); setEditingAttNotes(p => { const n={...p}; delete n[att.id]; return n; }); e.currentTarget.blur(); }}}
                                    placeholder="Notatka do załącznika..."
                                    className="w-full mt-1 text-[10px] bg-black/20 border border-white/10 rounded px-1.5 py-1 text-gray-400 placeholder-gray-600 focus:outline-none focus:border-orange-500/50 italic"
                                />
                                <button onClick={() => handleDeleteAttachment(att.id)} className="absolute top-2 right-2 p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="p-4 border-t border-white/10">
                <button onClick={handleDeleteMarker} className="w-full py-2 bg-red-500/10 text-red-400 text-xs font-bold rounded hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2">
                    <Trash2 size={14} /> Usuń znacznik
                </button>
            </div>
        </div>
    );
}
