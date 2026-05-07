import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../../config';
import { enqueueUpload, removeFromQueue, flushPendingUploads } from '../../utils/uploadQueue';
import {
    Upload, X, MapPin, Image as ImageIcon, Mic, Trash2,
    MousePointer2, Minus, Type, ZoomIn, ZoomOut, Maximize, Minimize2, Hand, Camera, Download, FileText, Save, FileDown,
    RefreshCw, HardDrive, FolderOpen, List, CheckSquare, Square, Layers, ChevronDown, Plus, Check, Pencil
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
    const [tableFilters, setTableFilters] = useState({ markerName: '', pozycja: '', markerNote: '', note: '' });
    const [markerFilter, setMarkerFilter] = useState(new Set());
    const [markerFilterOpen, setMarkerFilterOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [showFileDropdown, setShowFileDropdown] = useState(false);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameSaving, setRenameSaving] = useState(false);

    const pageRef = useRef(null);
    const containerRef = useRef(null);
    const rootRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(800);
    const [contentAspect, setContentAspect] = useState(null); // height/width ratio of current page
    const scaleRef = useRef(scale);
    const isAddingMarkerRef = useRef(isAddingMarker);

    useEffect(() => { scaleRef.current = scale; }, [scale]);
    useEffect(() => { isAddingMarkerRef.current = isAddingMarker; }, [isAddingMarker]);

    useEffect(() => {
        if (!showFileDropdown) return;
        const handler = (e) => { if (!e.target.closest('[data-file-dropdown]')) setShowFileDropdown(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showFileDropdown]);

    useEffect(() => {
        if (!markerFilterOpen) return;
        const handler = (e) => { if (!e.target.closest('[data-marker-filter]')) setMarkerFilterOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [markerFilterOpen]);

    // Reset aspect ratio gdy zmienia się schemat
    useEffect(() => { setContentAspect(null); }, [selectedSchematic?.id]);

    // Zamknij szczegóły znacznika przy zmianie filtra
    useEffect(() => { setSelectedMarker(null); }, [markerFilter]);

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
            if (e.touches.length === 1) {
                // przejście pinch→pan: inicjuj panState dla pozostałego palca
                panState = { x: e.touches[0].clientX, y: e.touches[0].clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
            }
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

    // Blokada browser viewport-zoom (pinch) na całym komponencie — JS backup dla CSS touch-action
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const preventPinch = (e) => { if (e.touches.length > 1) e.preventDefault(); };
        el.addEventListener('touchstart', preventPinch, { passive: false });
        el.addEventListener('touchmove',  preventPinch, { passive: false });
        return () => {
            el.removeEventListener('touchstart', preventPinch);
            el.removeEventListener('touchmove',  preventPinch);
        };
    }, []);

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
    const markerSyncRef = useRef(null);
    useEffect(() => {
        if (schematics.length === 0) return;
        const savedMarkerId = selectedMarker?.id || sessionStorage.getItem('erp_selectedMarkerId');
        if (!savedMarkerId) return;

        const updatedSchematic = schematics.find(s => s.markers.some(m => m.id === savedMarkerId));
        if (!updatedSchematic) {
            if (selectedMarker) { _setSelectedMarker(null); sessionStorage.removeItem('erp_selectedMarkerId'); }
            return;
        }
        const updatedMarker = updatedSchematic.markers.find(m => m.id === savedMarkerId);
        if (!updatedMarker) return;

        // Porównaj lekki podpis (count + nazwy) zamiast pełnego stringify (unika pętli)
        const atts = updatedMarker.attachments || [];
        const sig = `${atts.length}:${atts.map(a => a.id).join(',')}:${updatedMarker.name}:${updatedMarker.note || ''}`;
        const isRestore = !selectedMarker && savedMarkerId;

        if (isRestore || sig !== markerSyncRef.current) {
            markerSyncRef.current = sig;
            _setSelectedMarker(updatedMarker);
            if (!selectedSchematic || selectedSchematic.id !== updatedSchematic.id) {
                setSelectedSchematic(updatedSchematic);
            }
        }
    }, [schematics]);

    const lsKey = nodeId ? `erp_lastSchematicId_${nodeId}` : null;

    const selectSchematic = (sch) => {
        setSelectedSchematic(sch);
        setPageNumber(1);
        if (lsKey && sch?.id) localStorage.setItem(lsKey, sch.id);
    };

    const getMarkerPozycja = (m) => {
        const links = m.wbsLinks || [];
        const childLink = links.find(l => l.wbsParentName && l.wbsNodeName);
        const rootLink = links.find(l => !l.wbsParentName && l.wbsNodeName);
        return childLink?.wbsParentName || rootLink?.wbsNodeName || null;
    };

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
                const currentId = selectedSchematic?.id;
                const savedId = lsKey ? localStorage.getItem(lsKey) : null;
                const preferred = (currentId && data.find(s => s.id === currentId))
                    || (savedId && data.find(s => s.id === savedId))
                    || data[0];
                setSelectedSchematic(preferred);
                if (!currentId || currentId !== preferred.id) setPageNumber(1);
            } else {
                setSelectedSchematic(null);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const uploadFile = async (file) => {
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

    const handleUpload = (e) => uploadFile(e.target.files?.[0]);

    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) uploadFile(file);
    };

    const startRename = (sch) => {
        setRenamingId(sch.id);
        setRenameValue(sch.fileName || '');
    };

    const cancelRename = () => {
        setRenamingId(null);
        setRenameValue('');
    };

    const commitRename = async () => {
        if (!renamingId) return;
        const newName = String(renameValue || '').trim();
        const current = schematics.find(s => s.id === renamingId);
        if (!newName || !current || newName === current.fileName) {
            cancelRename();
            return;
        }
        setRenameSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/schematics/${renamingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ fileName: newName }),
            });
            if (res.ok) {
                setSchematics(prev => prev.map(s => s.id === renamingId ? { ...s, fileName: newName } : s));
                if (selectedSchematic?.id === renamingId) {
                    setSelectedSchematic(prev => prev ? { ...prev, fileName: newName } : prev);
                }
                cancelRename();
            } else {
                alert('Nie udało się zmienić nazwy schematu');
            }
        } catch (err) {
            console.error('Error renaming schematic:', err);
            alert('Błąd podczas zmiany nazwy schematu');
        } finally {
            setRenameSaving(false);
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

            // Pobierz świeże schematy (backend dołącza wbsNodeName do każdego linku)
            const freshRes = await fetch(`${API_URL}/schematics/node/${nodeId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const freshSchematics = freshRes.ok ? await freshRes.json() : schematics;

            // Pobierz dane WBS (Q&A)
            const wbsRes = await fetch(`${API_URL}/wbs-nodes/unified/${nodeId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const wbsRespJson = wbsRes.ok ? await wbsRes.json() : {};
            const allWbsNodes = Array.isArray(wbsRespJson?.items) ? wbsRespJson.items : [];

            // Przypisz globalne numery przed renderowaniem (spójność tabela ↔ obrazy)
            let _globalNum = 0;
            for (const sch of freshSchematics) {
                for (const m of (sch.markers || [])) m._num = ++_globalNum;
            }

            const allMarkers = freshSchematics.flatMap(sch =>
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

            const drawMarkers = (ctx, w, h, markers) => {
                markers.forEach((m, idx) => {
                    const x = (m.x / 100) * w;
                    const y = (m.y / 100) * h;
                    ctx.save();
                    if (m.type === 'LINE' && m.x2 != null && m.y2 != null) {
                        const x2 = (m.x2 / 100) * w;
                        const y2 = (m.y2 / 100) * h;
                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 2.5;
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.lineTo(x2, y2);
                        ctx.stroke();
                    } else if (m.type === 'TEXT') {
                        ctx.fillStyle = '#1d4ed8';
                        ctx.font = `bold ${Math.max(12, w * 0.012)}px Arial`;
                        ctx.fillText(m.name || '', x, y);
                    } else {
                        // POINT
                        const r = Math.max(10, w * 0.012);
                        ctx.fillStyle = '#ef4444';
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(x, y, r, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        // numer
                        ctx.fillStyle = '#fff';
                        ctx.font = `bold ${Math.round(r * 1.1)}px Arial`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(String(m._num != null ? m._num : idx + 1), x, y);
                        // etykieta
                        if (m.name) {
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'alphabetic';
                            ctx.fillStyle = '#1d4ed8';
                            ctx.font = `bold ${Math.max(11, w * 0.011)}px Arial`;
                            ctx.fillText(m.name, x + r + 3, y + 4);
                        }
                    }
                    ctx.restore();
                });
            };

            // Renderuj wszystkie schematy (PDF → canvas per strona, obrazy bezpośrednio)
            const schematicSections = [];
            for (const sch of freshSchematics) {
                const ext = sch.fileName.split('.').pop().toLowerCase();
                try {
                    const res = await fetch(`${API_URL}/schematics/file/${sch.fileUrl}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!res.ok) continue;
                    const blob = await res.blob();
                    if (ext === 'pdf') {
                        const arrayBuffer = await blob.arrayBuffer();
                        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
                        const pages = [];
                        for (let p = 1; p <= pdf.numPages; p++) {
                            const page = await pdf.getPage(p);
                            const viewport = page.getViewport({ scale: 1.5 });
                            const canvas = document.createElement('canvas');
                            canvas.width = viewport.width;
                            canvas.height = viewport.height;
                            const ctx = canvas.getContext('2d');
                            await page.render({ canvasContext: ctx, viewport }).promise;
                            const pageMarkers = (sch.markers || []).filter(m => m.pageNumber === p);
                            drawMarkers(ctx, canvas.width, canvas.height, pageMarkers);
                            pages.push(canvas.toDataURL('image/jpeg', 0.9));
                        }
                        schematicSections.push({ name: sch.fileName, pages });
                    } else {
                        const b64 = await new Promise(resolve => {
                            const img = new Image();
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.naturalWidth;
                                canvas.height = img.naturalHeight;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0);
                                const pageMarkers = (sch.markers || []).filter(m => m.pageNumber === 1);
                                drawMarkers(ctx, canvas.width, canvas.height, pageMarkers);
                                resolve(canvas.toDataURL('image/jpeg', 0.9));
                            };
                            img.src = URL.createObjectURL(blob);
                        });
                        schematicSections.push({ name: sch.fileName, pages: [b64] });
                    }
                } catch { /* pomiń uszkodzony plik */ }
            }

            const date = new Date().toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
            let rowNum = 0;
            const rows = allMarkers.flatMap((m) => {
                const links = m.wbsLinks || [];
                const childLink = links.find(l => l.wbsParentName && l.wbsNodeName);
                const rootLink = links.find(l => !l.wbsParentName && l.wbsNodeName);
                const przedmiot = childLink?.wbsParentName || rootLink?.wbsNodeName || (m.subtask?.name || '—');
                const wymaganie = childLink?.wbsNodeName || '—';
                const images = (m.attachments || []).filter(a => a.fileType === 'IMAGE' && a._b64);
                rowNum++;
                const textRow = `<tr class="text-row">
                    <td>${rowNum}</td>
                    <td>${przedmiot}</td>
                    <td>${wymaganie}</td>
                    <td>${m.name || '—'}</td>
                </tr>`;
                const imageRows = images.map(a => `<tr class="img-row">
                    <td></td>
                    <td style="width:180px;vertical-align:top;padding:6px 8px;">
                        <img src="${a._b64}" style="max-width:170px;max-height:150px;border-radius:4px;border:1px solid #e5e7eb;display:block;" />
                        ${a.note ? `<div style="font-size:9px;color:#6b7280;margin-top:4px;white-space:pre-wrap;">${a.note}</div>` : ''}
                    </td>
                    <td colspan="2" style="vertical-align:top;padding:6px 8px;white-space:pre-wrap;word-break:break-word;">${m.note || '—'}</td>
                </tr>`);
                const noImageRow = images.length === 0 ? [`<tr class="note-row">
                    <td></td>
                    <td colspan="3" style="color:#374151;padding:4px 8px;">${m.note || ''}</td>
                </tr>`] : [];
                return [textRow, ...imageRows, ...noImageRow];
            }).join('');

            // Buduj sekcję Q&A z WBS
            const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const wbsNodeMap = new Map(allWbsNodes.map(n => [String(n.id), n]));
            const buildQaPath = (id) => {
                const parts = [];
                let cur = wbsNodeMap.get(String(id));
                while (cur) {
                    parts.unshift(cur.name || '');
                    cur = cur.parentId != null ? wbsNodeMap.get(String(cur.parentId)) : null;
                }
                return parts.join(' › ');
            };
            const qaNodes = allWbsNodes.filter(n => Array.isArray(n.qa) && n.qa.some(p => (p?.question || '').trim()));
            const qaRows = qaNodes.flatMap(n => {
                const pairs = n.qa.filter(p => (p?.question || '').trim());
                const path = buildQaPath(n.id);
                return [
                    `<tr><td colspan="2" style="background:#dbeafe;color:#1e40af;font-weight:bold;padding:5px 8px;font-size:10px;page-break-inside:avoid;break-inside:avoid;">${esc(path)}</td></tr>`,
                    ...pairs.map(p => `<tr><td style="vertical-align:top;width:50%;white-space:pre-wrap;">${esc(p.question)}</td><td style="vertical-align:top;white-space:pre-wrap;color:#374151;">${esc(p.answer || '')}</td></tr>`)
                ];
            }).join('');
            const qaHtml = qaNodes.length > 0 ? `
                <h2>Pytania i odpowiedzi</h2>
                <table>
                    <thead><tr><th style="width:50%">Pytanie</th><th style="width:50%">Odpowiedź</th></tr></thead>
                    <tbody>${qaRows}</tbody>
                </table>` : '';

            const schematicHtml = schematicSections.map((s) => `
                <div class="sch-section">
                    ${s.pages.map((pg, i) => `
                        <div class="sch-page">
                            <div class="sch-name">${esc(s.name)}${s.pages.length > 1 ? ` — strona ${i + 1} / ${s.pages.length}` : ''}</div>
                            <img src="${pg}" />
                        </div>`).join('')}
                </div>`).join('');

            const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8">
            <title>Raport z wizji lokalnej</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 8px; }
                h1 { font-size: 16px; margin-bottom: 4px; }
                h2 { font-size: 13px; margin: 24px 0 8px; color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 4px; break-after: avoid; page-break-after: avoid; }
                .meta { font-size: 10px; color: #666; margin-bottom: 16px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
                th { background: #1e40af; color: white; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
                td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
                tr:nth-child(even) td { background: #f9fafb; }
                tr.text-row td:nth-child(1) { width: 24px; color: #6b7280; }
                tr.text-row td:nth-child(2) { width: 22%; font-weight: bold; color: #1e40af; }
                tr.text-row td:nth-child(3) { width: 28%; }
                tr.img-row td, tr.note-row td { background: #f8faff; }
                tr.note-row td { font-style: italic; color: #555; font-size: 10px; }
                tr { break-inside: avoid; page-break-inside: avoid; }
                thead { display: table-header-group; }
                p { orphans: 3; widows: 3; }
                .sch-section { }
                .sch-name { font-size: 9px; color: #6b7280; margin-bottom: 4px; font-style: italic; flex-shrink: 0; }
                .sch-page {
                    page-break-before: always;
                    page-break-after: always;
                    page-break-inside: avoid;
                    break-before: page;
                    break-after: page;
                    break-inside: avoid;
                    display: flex;
                    flex-direction: column;
                    height: 257mm;
                    box-sizing: border-box;
                    padding: 4px 0;
                }
                .sch-page img {
                    flex: 1;
                    min-height: 0;
                    object-fit: contain;
                    width: 100%;
                    display: block;
                    border: 1px solid #e5e7eb;
                }
                @page { size: A4 portrait; margin: 20mm 14mm; }
                @media print { body { margin: 0; } }
            </style></head><body>
            <h1>Raport z wizji lokalnej</h1>
            <div class="meta">Wygenerowano: ${date} &nbsp;|&nbsp; Łączna liczba punktów: ${allMarkers.length} &nbsp;|&nbsp; Pliki: ${schematics.length}</div>
            <table>
                <thead><tr>
                    <th style="width:24px">#</th><th>Przedmiot projektu</th><th>Pozycja przedmiotu</th><th>Nazwa znacznika na schemacie</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            ${qaHtml}
            ${schematicSections.length > 0 ? schematicHtml : ''}
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
        <div ref={rootRef} className={`flex flex-col h-full bg-gray-900/50 rounded-xl overflow-hidden border border-white/5 relative ${!isDesktop && isFullscreen ? 'fixed inset-0 z-[200]' : ''}`}>

            {/* Górna belka — pełna szerokość */}
            <div
                className="h-12 border-b border-white/5 flex items-center px-3 gap-2 bg-black/20 flex-shrink-0"
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Dropdown listy plików */}
                <div className="relative" data-file-dropdown>
                    <button
                        onClick={() => setShowFileDropdown(v => !v)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                            showFileDropdown ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                        <MapPin size={13} className="text-orange-400 shrink-0" />
                        <span className="max-w-[180px] truncate">
                            {selectedSchematic ? selectedSchematic.fileName : 'Wybierz schemat'}
                        </span>
                        {selectedSchematic && (
                            <span className="text-[10px] text-gray-500 shrink-0">({selectedSchematic.markers.length})</span>
                        )}
                        <ChevronDown size={12} className={`shrink-0 transition-transform ${showFileDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {showFileDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-72 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                            <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
                                {schematics.map(sch => {
                                    const isRenaming = renamingId === sch.id;
                                    return (
                                        <div
                                            key={sch.id}
                                            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all group ${
                                                selectedSchematic?.id === sch.id
                                                ? 'bg-orange-500/20 text-orange-200'
                                                : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'
                                            }`}
                                            onClick={() => { if (!isRenaming) { selectSchematic(sch); setShowFileDropdown(false); } }}
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
                                                        className="w-full bg-black/40 border border-orange-500/40 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-orange-400"
                                                    />
                                                ) : (
                                                    <div
                                                        onDoubleClick={(e) => { e.stopPropagation(); startRename(sch); }}
                                                        className="text-xs truncate max-w-[220px] select-none"
                                                        title="Dwuklik aby zmienić nazwę"
                                                    >
                                                        {sch.fileName}
                                                    </div>
                                                )}
                                                <div className="text-[10px] opacity-60">Znaczników: {sch.markers.length}</div>
                                            </div>
                                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); startRename(sch); }}
                                                    className="p-1 text-gray-500 hover:text-orange-400"
                                                    title="Zmień nazwę"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteSchematic(sch.id); }}
                                                    className="p-1 text-gray-600 hover:text-red-400"
                                                    title="Usuń schemat"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {schematics.length === 0 && (
                                    <div className="text-xs text-gray-500 text-center py-4">Brak schematów.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Wgraj PDF */}
                <label
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all text-sm font-semibold flex-shrink-0 ${
                        isDragging
                        ? 'bg-blue-500/30 border-blue-400 text-blue-300 scale-105'
                        : 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border-blue-500/30 hover:border-blue-400'
                    }`}
                    title="Wgraj PDF / JPG lub przeciągnij plik"
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <Upload size={15} />
                    {uploading ? 'Wgrywanie...' : isDragging ? 'Upuść plik' : 'Wgraj'}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} className="hidden" disabled={uploading} />
                </label>

                {/* Sync / folder lokalny */}
                {isSupported && (
                    dirHandle ? (
                        <button
                            onClick={() => { const token = sessionStorage.getItem('token'); syncFiles(schematics, token); }}
                            disabled={syncStatus === 'syncing'}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition-colors text-xs font-medium flex-shrink-0 disabled:opacity-50"
                            title={dirName ? `Folder: ${dirName}` : 'Synchronizuj'}
                        >
                            <RefreshCw size={13} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                            {syncStatus === 'syncing' ? 'Sync...' : 'Sync'}
                        </button>
                    ) : (
                        <button
                            onClick={chooseFolder}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 transition-colors text-xs font-medium flex-shrink-0"
                            title="Ustaw folder lokalny do synchronizacji"
                        >
                            <HardDrive size={13} />
                            Folder
                        </button>
                    )
                )}

                {/* Nawigacja stron PDF */}
                {selectedSchematic && !isImageFile(selectedSchematic.fileUrl) && (
                    <div className="flex items-center gap-2">
                        <button disabled={pageNumber <= 1} onClick={() => setPageNumber(p => p - 1)} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-xs rounded disabled:opacity-30 text-white">Poprzednia</button>
                        <span className="text-xs text-gray-400">Strona {pageNumber} z {numPages || '?'}</span>
                        <button disabled={pageNumber >= numPages} onClick={() => setPageNumber(p => p + 1)} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-xs rounded disabled:opacity-30 text-white">Następna</button>
                    </div>
                )}

                {selectedSchematic && (() => {
                    const options = [...new Set(
                        (selectedSchematic.markers || [])
                            .map(m => getMarkerPozycja(m))
                            .filter(Boolean)
                    )].sort();
                    if (options.length === 0) return null;
                    const toggle = (o) => setMarkerFilter(prev => {
                        const next = new Set(prev);
                        next.has(o) ? next.delete(o) : next.add(o);
                        return next;
                    });
                    const label = markerFilter.size === 0
                        ? 'Wszystkie przedmioty'
                        : markerFilter.size === 1
                            ? [...markerFilter][0]
                            : `${markerFilter.size} wybrane`;
                    return (
                        <div className="relative" data-marker-filter>
                            <button
                                onClick={() => setMarkerFilterOpen(o => !o)}
                                className={`text-[11px] px-2 py-1 rounded border flex items-center gap-1.5 max-w-[180px] truncate transition-colors ${markerFilter.size > 0 ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : 'bg-black/40 border-white/10 text-gray-300 hover:border-white/20'}`}
                            >
                                <span className="truncate">{label}</span>
                                <svg className={`shrink-0 w-3 h-3 transition-transform ${markerFilterOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </button>
                            {markerFilterOpen && (
                                <div className="absolute top-full mt-1 left-0 z-50 bg-[#0d1117] border border-white/10 rounded-lg shadow-2xl min-w-[180px] py-1 max-h-60 overflow-y-auto">
                                    <button
                                        onClick={() => { setMarkerFilter(new Set()); }}
                                        className="w-full text-left px-3 py-1.5 text-[11px] text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                                    >
                                        Wyczyść filtr
                                    </button>
                                    <div className="border-t border-white/5 my-1" />
                                    {options.map(o => (
                                        <label key={o} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={markerFilter.has(o)}
                                                onChange={() => toggle(o)}
                                                className="accent-orange-500 shrink-0"
                                            />
                                            <span className="text-[11px] text-gray-300 truncate">{o}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}

                <div className="flex-1" />

                {/* Narzędzia rysowania */}
                {selectedSchematic && isDesktop && (<>
                    <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
                        <button onClick={() => { setActiveTool('MOVE'); setIsAddingMarker(false); }} className={`p-1.5 rounded transition-colors ${activeTool === 'MOVE' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`} title="Przesuń (Rączka)"><Hand size={14} /></button>
                        <button onClick={() => setActiveTool('POINT')} className={`p-1.5 rounded transition-colors ${activeTool === 'POINT' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`} title="Punkt/Znacznik"><MapPin size={14} /></button>
                        <button onClick={() => setActiveTool('LINE')} className={`p-1.5 rounded transition-colors ${activeTool === 'LINE' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`} title="Linia"><Minus size={14} /></button>
                        <button onClick={() => setActiveTool('TEXT')} className={`p-1.5 rounded transition-colors ${activeTool === 'TEXT' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`} title="Tekst"><Type size={14} />
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

            {/* Obszar roboczy - PDF viewer + panel znacznika */}
            <div className="flex-1 flex overflow-hidden min-h-0 relative">
            <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {selectedSchematic ? (
                <div className="flex flex-col flex-1 min-h-0">

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

                        {/* Mobilna belka narzędzi — nad podglądem PDF */}
                        {!isDesktop && (
                            <div className="flex-shrink-0 border-b border-white/10 bg-black/40 flex items-center gap-2 px-3 py-2 z-10">
                                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
                                    <button onClick={() => { setActiveTool('POINT'); setIsAddingMarker(false); }} className={`p-1.5 rounded transition-colors ${activeTool === 'POINT' ? 'bg-orange-500 text-white' : 'text-gray-400'}`} title="Punkt"><MapPin size={14} /></button>
                                    <button onClick={() => { setActiveTool('LINE'); setIsAddingMarker(false); }} className={`p-1.5 rounded transition-colors ${activeTool === 'LINE' ? 'bg-orange-500 text-white' : 'text-gray-400'}`} title="Linia"><Minus size={14} /></button>
                                    <button onClick={() => { setActiveTool('TEXT'); setIsAddingMarker(false); }} className={`p-1.5 rounded transition-colors ${activeTool === 'TEXT' ? 'bg-orange-500 text-white' : 'text-gray-400'}`} title="Tekst"><Type size={14} /></button>
                                </div>
                                <button
                                    onClick={() => { setIsAddingMarker(v => !v); setLineStart(null); }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                                        isAddingMarker
                                        ? 'bg-orange-500/20 text-orange-400 border-orange-500/50'
                                        : 'bg-white/5 text-gray-300 border-white/10'
                                    }`}
                                >
                                    <MapPin size={14} />
                                    {isAddingMarker
                                        ? (activeTool === 'LINE'
                                            ? (lineStart ? 'Zakończ linię' : 'Zacznij linię')
                                            : 'Kliknij schemat')
                                        : `Dodaj ${activeTool === 'LINE' ? 'linię' : activeTool === 'TEXT' ? 'tekst' : 'znacznik'}`
                                    }
                                </button>
                                <div className="flex-1" />
                                <button
                                    onClick={exportMarkersToPdf}
                                    disabled={exporting}
                                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 disabled:opacity-50"
                                    title="Eksportuj do PDF"
                                >
                                    <FileDown size={14} />
                                    {exporting ? '...' : 'PDF'}
                                </button>
                            </div>
                        )}

                        {/* Obszar roboczy PDF */}
                        <div
                            className={`flex-1 min-h-0 overflow-auto overscroll-contain p-4 [&_canvas]:touch-none ${activeTool === 'MOVE' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
                            style={{ touchAction: 'none', scrollbarGutter: 'stable' }}
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

                                {selectedSchematic.markers.filter(m => m.pageNumber === pageNumber && m.type === 'POINT' && (markerFilter.size === 0 || markerFilter.has(getMarkerPozycja(m)))).map(marker => (
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
                    <div
                        className={`flex-1 flex flex-col items-center justify-center text-gray-500 text-sm gap-3 transition-colors ${isDragging ? 'bg-blue-500/10' : ''}`}
                        onDragOver={handleDragOver}
                        onDragEnter={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        {isDragging ? (
                            <div className="flex flex-col items-center gap-2 text-blue-400 pointer-events-none">
                                <Upload size={32} />
                                <span className="font-medium">Upuść plik PDF / JPG</span>
                            </div>
                        ) : (
                            <>
                                <span>Wybierz z listy lub wgraj nowy schemat PDF.</span>
                                <span className="text-xs text-gray-600">Możesz też przeciągnąć plik tutaj.</span>
                            </>
                        )}
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


            {selectedSchematic && (() => {
                const rows = selectedSchematic.markers.flatMap(m => {
                    const links = m.wbsLinks || [];
                    const childLink = links.find(l => l.wbsParentName && l.wbsNodeName);
                    const rootLink = links.find(l => !l.wbsParentName && l.wbsNodeName);
                    const pozycja = childLink?.wbsParentName || rootLink?.wbsNodeName || '—';
                    return (m.attachments || []).map(a => ({
                        ...a,
                        markerId: m.id,
                        markerName: m.name || '—',
                        markerNote: m.note || '',
                        pozycja,
                    }));
                });
                if (rows.length === 0) return null;
                const filteredRows = rows.filter(att =>
                    (!tableFilters.markerName || att.markerName.toLowerCase().includes(tableFilters.markerName.toLowerCase())) &&
                    (!tableFilters.pozycja || (att.pozycja || '').toLowerCase().includes(tableFilters.pozycja.toLowerCase())) &&
                    (!tableFilters.markerNote || (att.markerNote || '').toLowerCase().includes(tableFilters.markerNote.toLowerCase())) &&
                    (!tableFilters.note || (att.note || '').toLowerCase().includes(tableFilters.note.toLowerCase()))
                );

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
                    <div className="border-t border-white/5 flex-shrink-0">
                        <button
                            onClick={() => setShowTable(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 bg-black/30 hover:bg-white/5 transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                <List size={13} className="text-blue-400" />
                                <span className="text-[10px] text-gray-400 uppercase font-black tracking-[0.15em]">
                                    Znaczniki i załączniki ({rows.length})
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {showTable && (
                                    <button
                                        onClick={e => { e.stopPropagation(); rows.forEach(a => downloadFile(a)); }}
                                        className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                                    >
                                        <Download size={12} /> Pobierz wszystko
                                    </button>
                                )}
                                <ChevronDown size={14} className={`text-gray-500 transition-transform ${showTable ? 'rotate-180' : ''}`} />
                            </div>
                        </button>
                        {showTable && <div className="bg-black/30 px-4 py-3 max-h-72 overflow-y-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-gray-600 text-[10px] uppercase border-b border-white/5">
                                    <th className="text-left py-1.5 pr-4 font-black w-28">Znacznik</th>
                                    <th className="text-left py-1.5 pr-4 font-black w-36">Pozycja przedmiotu projektu</th>
                                    <th className="text-left py-1.5 pr-4 font-black w-40">Notatka znacznika</th>
                                    <th className="text-left py-1.5 pr-4 font-black">Załącznik</th>
                                    <th className="text-left py-1.5 pr-4 font-black w-40">Notatka załącznika</th>
                                    <th className="py-1.5 w-8"></th>
                                </tr>
                                <tr className="border-b border-white/5">
                                    {[
                                        ['markerName', 'w-28'],
                                        ['pozycja', 'w-36'],
                                        ['markerNote', 'w-40'],
                                        [null, ''],
                                        ['note', 'w-40'],
                                        [null, 'w-8'],
                                    ].map(([key, w], i) => (
                                        <td key={i} className={`pb-1.5 pr-4 ${w}`}>
                                            {key && <input
                                                type="text"
                                                value={tableFilters[key]}
                                                onChange={e => setTableFilters(f => ({ ...f, [key]: e.target.value }))}
                                                placeholder="filtruj…"
                                                className="w-full text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-gray-400 placeholder-gray-700 focus:outline-none focus:border-orange-500/50"
                                            />}
                                        </td>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map(att => (
                                    <tr key={att.id} className="border-b border-white/5 hover:bg-white/5 transition-colors align-middle">
                                        <td className="py-2 pr-4 text-gray-300 font-medium truncate max-w-[112px]">{att.markerName}</td>
                                        <td className="py-2 pr-4 text-gray-400 text-[11px] truncate max-w-[144px]">{att.pozycja || '—'}</td>
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
                    </div>}
                    </div>
                );
            })()}

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
    const [addWbsMode, setAddWbsMode] = useState(null); // null | 'item' | 'requirement'
    const [addWbsParentId, setAddWbsParentId] = useState('');
    const [addWbsName, setAddWbsName] = useState('');
    const [addWbsSaving, setAddWbsSaving] = useState(false);
    const addWbsInputRef = useRef(null);
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
            onRefresh?.();
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

    const openAddWbs = (mode) => {
        setAddWbsMode(mode);
        setAddWbsName('');
        if (mode === 'requirement') {
            const rootNodes = wbsNodes.filter(n => n.path.split('.').length === 1);
            setAddWbsParentId(rootNodes[0]?.id || '');
        } else {
            setAddWbsParentId('');
        }
        setTimeout(() => addWbsInputRef.current?.focus(), 80);
    };

    const createWbsNode = async () => {
        if (!addWbsName.trim() || !nodeId) return;
        setAddWbsSaving(true);
        try {
            const token = sessionStorage.getItem('token');
            const body = { nodeId, name: addWbsName.trim() };
            if (addWbsMode === 'requirement' && addWbsParentId) body.parentId = addWbsParentId;
            const res = await fetch(`${API_URL}/wbs-nodes`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error('Błąd tworzenia');
            const newNode = await res.json();
            // Odśwież listę węzłów
            const treeRes = await fetch(`${API_URL}/order-requirements/${nodeId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (treeRes.ok) {
                const data = await treeRes.json();
                const tree = typeof data.wbsTree === 'string' ? JSON.parse(data.wbsTree) : (data.wbsTree || []);
                setWbsNodes(flattenWbsNodes(tree));
            }
            // Auto-linkuj nowy węzeł do znacznika
            const linkRes = await fetch(`${API_URL}/schematics/wbs-node-markers`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ wbsNodeId: newNode.id, markerId: marker.id })
            });
            if (linkRes.ok) {
                const link = await linkRes.json();
                setWbsLinks(prev => [...prev, link]);
                window.dispatchEvent(new CustomEvent('wbs-link-changed'));
            }
            setAddWbsMode(null);
        } catch (err) {
            alert(err.message);
        } finally {
            setAddWbsSaving(false);
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

                {nodeId && (
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

                        {/* Formularz dodawania */}
                        {addWbsMode ? (
                            <div className="mt-2 p-3 bg-black/40 border border-white/10 rounded-xl space-y-2">
                                <p className="text-[10px] text-gray-400 uppercase font-bold">
                                    {addWbsMode === 'item' ? '+ Nowy przedmiot' : '+ Nowe wymaganie'}
                                </p>
                                {addWbsMode === 'requirement' && wbsNodes.filter(n => n.path.split('.').length === 1).length > 0 && (
                                    <select
                                        value={addWbsParentId}
                                        onChange={e => setAddWbsParentId(e.target.value)}
                                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50"
                                    >
                                        {wbsNodes.filter(n => n.path.split('.').length === 1).map(n => (
                                            <option key={n.id} value={n.id}>{n.path} {n.name}</option>
                                        ))}
                                    </select>
                                )}
                                <input
                                    ref={addWbsInputRef}
                                    value={addWbsName}
                                    onChange={e => setAddWbsName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') createWbsNode(); if (e.key === 'Escape') setAddWbsMode(null); }}
                                    placeholder="Nazwa..."
                                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 placeholder-gray-600"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={createWbsNode}
                                        disabled={!addWbsName.trim() || addWbsSaving}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
                                    >
                                        <Check size={14} />
                                        {addWbsSaving ? 'Zapisuję...' : 'Dodaj i przypisz'}
                                    </button>
                                    <button
                                        onClick={() => setAddWbsMode(null)}
                                        className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 rounded-lg text-sm transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 flex gap-2">
                                <button
                                    onClick={() => openAddWbs('item')}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 border border-white/10 rounded-lg text-xs transition-colors"
                                >
                                    <Plus size={12} /> Przedmiot
                                </button>
                                <button
                                    onClick={() => openAddWbs('requirement')}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 border border-white/10 rounded-lg text-xs transition-colors"
                                >
                                    <Plus size={12} /> Wymaganie
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div>
                    <div className="flex gap-1 mb-2">
                        <button
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`flex-1 text-[11px] py-1.5 rounded transition-colors flex items-center justify-center gap-1 ${
                                isRecording ? 'bg-red-500 animate-pulse text-white' : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400'
                            }`}
                        >
                            <Mic size={12} />
                            {isRecording ? 'Stop' : 'Głos'}
                        </button>
                        <button
                            onClick={isCameraActive ? stopCamera : startCamera}
                            className="flex-1 text-[11px] bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 py-1.5 rounded transition-colors flex items-center justify-center gap-1"
                        >
                            <Camera size={12} />
                            {isCameraActive ? 'Anuluj' : 'Foto'}
                        </button>
                        <label className="flex-1 text-[11px] bg-green-500/10 hover:bg-green-500/20 text-green-400 py-1.5 rounded cursor-pointer transition-colors flex items-center justify-center gap-1">
                            <ImageIcon size={11} />
                            Galeria
                            <input type="file" accept="image/*" multiple onChange={handleUploadAttachment} className="hidden" disabled={uploading}/>
                        </label>
                        <label className="flex-1 text-[11px] bg-white/5 hover:bg-white/10 text-white py-1.5 rounded cursor-pointer transition-colors flex items-center justify-center">
                            {uploading ? '...' : '+ Plik'}
                            <input type="file" multiple onChange={handleUploadAttachment} className="hidden" disabled={uploading}/>
                        </label>
                    </div>
                    <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Załączniki</label>

                    {isCameraActive && (
                        <div className="relative bg-black rounded-lg overflow-hidden border border-orange-500/30 mb-3">
                            <video ref={videoRef} autoPlay playsInline className="w-full h-auto bg-black" />
                            <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
                                <button onClick={capturePhoto} className="bg-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
                                    <Camera size={16} /> Zrób zdjęcie
                                </button>
                            </div>
                            <canvas ref={canvasRef} className="hidden" />
                        </div>
                    )}

                    <div className="flex flex-row flex-wrap gap-2">
                        {marker.attachments?.map(att => (
                            <div key={att.id} className="bg-black/20 border border-white/5 rounded-lg p-2 group relative w-40 flex flex-col gap-1 shrink-0">
                                {att.fileType === 'IMAGE' && (
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1 text-[10px] text-blue-300"><ImageIcon size={12} /> Zdjęcie</div>
                                        <img
                                            src={getFileUrl(att.fileUrl)}
                                            alt={att.fileName}
                                            className="w-full h-auto rounded border border-white/10 cursor-zoom-in hover:opacity-80 transition-opacity"
                                            onClick={() => onLightbox && onLightbox(getFileUrl(att.fileUrl))}
                                        />
                                    </div>
                                )}
                                {att.fileType === 'AUDIO' && (
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1 text-[10px] text-purple-300"><Mic size={12} /> Głos</div>
                                        <audio controls className="w-full h-8" src={getFileUrl(att.fileUrl)}/>
                                    </div>
                                )}
                                {att.fileType === 'FILE' && (
                                    <div className="flex items-center gap-1 text-[10px] text-gray-400"><FileText size={12} />{att.fileName}</div>
                                )}
                                <input
                                    type="text"
                                    value={editingAttNotes[att.id] !== undefined ? editingAttNotes[att.id] : (att.note || '')}
                                    onChange={e => setEditingAttNotes(p => ({...p, [att.id]: e.target.value}))}
                                    onBlur={() => { if (editingAttNotes[att.id] !== undefined) { handleUpdateAttNote(att.id, editingAttNotes[att.id]); setEditingAttNotes(p => { const n={...p}; delete n[att.id]; return n; }); }}}
                                    onKeyDown={e => { if (e.key==='Enter') { handleUpdateAttNote(att.id, editingAttNotes[att.id] ?? att.note ?? ''); setEditingAttNotes(p => { const n={...p}; delete n[att.id]; return n; }); e.currentTarget.blur(); }}}
                                    placeholder="Notatka..."
                                    className="w-full text-[10px] bg-black/20 border border-white/10 rounded px-1.5 py-1 text-gray-400 placeholder-gray-600 focus:outline-none focus:border-orange-500/50 italic"
                                />
                                <button onClick={() => handleDeleteAttachment(att.id)} className="absolute top-1 right-1 p-0.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded">
                                    <Trash2 size={11} />
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
