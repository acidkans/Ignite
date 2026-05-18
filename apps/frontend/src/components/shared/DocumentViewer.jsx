import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { downloadPdfWithHighlights } from '../../utils/downloadPdfWithHighlights';
import DocViewer, { DocViewerRenderers } from '@cyntler/react-doc-viewer';
import { Maximize2, Minimize2, Download, X, ZoomIn, ZoomOut, CheckCircle, RotateCcw, FileText, ChevronRight, Link2, AlertCircle, ChevronDown, Sparkles, Trash2 } from 'lucide-react';
import { API_URL } from '../../config';
import PdfPageWithHighlights from './PdfPageWithHighlights';

// Set up worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const pdfOptions = {
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    disableXFA: true,
};

// ─── Fuzzy match helper ───────────────────────────────────────────────────────

const normStr = s => (s || '').toLowerCase().replace(/[\s\-_.]/g, '');
function fuzzyMatchScore(pos, mat) {
    const pm = normStr(pos.model), pd = normStr(pos.description), pf = normStr(pos.manufacturer);
    const mm = normStr(mat.model), mn = normStr(mat.name), mf = normStr(mat.manufacturer);
    let score = 0;
    if (pm && mm) {
        if (pm === mm) score += 4;
        else if (mm.includes(pm) || pm.includes(mm)) score += 3;
        else if (mm.length > 3 && pm.startsWith(mm.slice(0, 4))) score += 1;
    }
    if (pm && mn && !score) {
        if (pm === mn) score += 3;
        else if (mn.includes(pm) || pm.includes(mn)) score += 2;
    }
    if (!score && pd && mm && mm.length > 3 && pd.includes(mm)) score += 1;
    if (score > 0 && pf && mf) {
        if (pf === mf || mf.includes(pf) || pf.includes(mf)) score += 1;
    }
    return score;
}

// ─── Modal przypisania kart katalogowych do pozycji oferty ────────────────────

function OfferDatasheetMappingModal({ positions, documentId, token, onClose, onSaved }) {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const [materialDb, setMaterialDb] = useState([]);
    const [loadingDb, setLoadingDb] = useState(true);
    // mapping[i] = { materialId, dataSheetUrl, dataSheetName, matchScore }
    const [mapping, setMapping] = useState([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        (async () => {
            setLoadingDb(true);
            try {
                const res = await fetch(`${API_URL}/material-requirements/database`, { headers: authHeaders });
                if (res.ok) {
                    const db = await res.json();
                    setMaterialDb(db);
                    // Auto-match each position
                    const initial = positions.map(pos => {
                        let bestMatch = null, bestScore = 0;
                        for (const mat of db) {
                            const s = fuzzyMatchScore(pos, mat);
                            if (s > bestScore) { bestScore = s; bestMatch = mat; }
                        }
                        return {
                            materialId: bestMatch?.id || '',
                            dataSheetUrl: bestMatch?.dataSheetUrl || '',
                            dataSheetName: bestMatch?.dataSheetName || bestMatch?.name || '',
                            matchScore: bestScore,
                        };
                    });
                    setMapping(initial);
                }
            } catch { /* ignore */ }
            finally { setLoadingDb(false); }
        })();
    }, []);

    const setManual = (i, materialId) => {
        const mat = materialDb.find(m => m.id === materialId);
        setMapping(prev => prev.map((m, idx) => idx !== i ? m : {
            materialId,
            dataSheetUrl: mat?.dataSheetUrl || '',
            dataSheetName: mat?.dataSheetName || mat?.name || '',
            matchScore: -1, // manual
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated = positions.map((p, i) => ({
                ...p,
                dataSheetUrl: mapping[i]?.dataSheetUrl || p.dataSheetUrl || '',
                dataSheetName: mapping[i]?.dataSheetName || p.dataSheetName || '',
            }));
            const res = await fetch(`${API_URL}/documents/${documentId}/parsed-positions`, {
                method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ positions: updated }),
            });
            if (res.ok) { setSaved(true); onSaved?.(updated); setTimeout(onClose, 1200); }
        } catch { /* ignore */ }
        finally { setSaving(false); }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl w-[680px] max-h-[85vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div className="flex items-center gap-2.5">
                        <Link2 size={15} className="text-teal-400" />
                        <span className="text-sm font-bold text-white">Przypisanie kart katalogowych do pozycji oferty</span>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X size={16} /></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loadingDb ? (
                        <div className="flex items-center justify-center gap-3 py-10">
                            <div className="w-5 h-5 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
                            <span className="text-sm text-gray-400">Dopasowywanie z bazą materiałów...</span>
                        </div>
                    ) : positions.map((pos, i) => {
                        const m = mapping[i] || {};
                        const isAutoMatched = m.matchScore > 0;
                        const isManual = m.matchScore === -1;
                        const hasMatch = m.materialId && (m.dataSheetUrl || m.dataSheetName);
                        return (
                            <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-2">
                                {/* Position header */}
                                <div className="flex items-start gap-2">
                                    <span className="text-[9px] text-gray-600 font-mono mt-0.5 w-5 text-center shrink-0">{pos.lp ?? i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] text-white font-medium truncate">{pos.description || '—'}</p>
                                        <p className="text-[10px] text-gray-500 font-mono">{[pos.manufacturer, pos.model].filter(Boolean).join(' · ') || 'brak modelu'}</p>
                                    </div>
                                </div>
                                {/* Match row */}
                                <div className="ml-7 flex items-center gap-2">
                                    {isAutoMatched && (
                                        <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-teal-400/10 text-teal-400 border border-teal-400/20 shrink-0">
                                            <Sparkles size={8} />AI
                                        </span>
                                    )}
                                    {isManual && (
                                        <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20 shrink-0">
                                            <ChevronDown size={8} />ręcznie
                                        </span>
                                    )}
                                    {!hasMatch && !isManual && (
                                        <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 shrink-0">
                                            <AlertCircle size={8} />brak
                                        </span>
                                    )}
                                    <div className="relative flex-1">
                                        <select
                                            value={m.materialId || ''}
                                            onChange={e => setManual(i, e.target.value)}
                                            className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-200 appearance-none focus:outline-none focus:border-teal-500 cursor-pointer">
                                            <option value="">— brak karty katalogowej —</option>
                                            {materialDb.filter(m => m.dataSheetUrl).map(mat => (
                                                <option key={mat.id} value={mat.id}>
                                                    {[mat.manufacturer, mat.model || mat.name].filter(Boolean).join(' · ')}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                    </div>
                                </div>
                                {/* Datasheet name preview */}
                                {hasMatch && m.dataSheetName && (
                                    <p className="ml-7 text-[9px] text-gray-600 truncate">📄 {m.dataSheetName}</p>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-white/5 bg-black/20">
                    {saved ? (
                        <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-semibold">
                            <CheckCircle size={14} /> Powiązania zapisane
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <button onClick={onClose} className="flex-1 py-2 rounded-xl text-[11px] text-gray-400 border border-white/10 hover:bg-white/5 transition-all">
                                Pomiń
                            </button>
                            <button onClick={handleSave} disabled={saving || loadingDb}
                                className="flex-2 flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 text-[11px] font-semibold border border-teal-500/30 transition-all disabled:opacity-50">
                                {saving
                                    ? <><div className="w-3 h-3 border border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />Zapisywanie...</>
                                    : <><Link2 size={12} />Zapisz powiązania</>}
                            </button>
                        </div>
                    )}
                    <p className="text-[9px] text-gray-600 text-center mt-2">
                        Karta katalogowa będzie automatycznie wczytana przy wyborze pozycji w wymaganiach
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Panel pozycji oferty ─────────────────────────────────────────────────────

function OfferParsePanel({ documentId, token, onApprove }) {
    const [positions, setPositions] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [approved, setApproved] = useState(false);
    const [error, setError] = useState(null);
    const [showMapping, setShowMapping] = useState(false);
    const authHeaders = { Authorization: `Bearer ${token}` };

    const loadAndParse = useCallback(async (force = false) => {
        setLoading(true); setError(null); setApproved(false);
        try {
            if (!force) {
                // Check for pre-stored positions first
                try {
                    const stored = await fetch(`${API_URL}/documents/${documentId}/parsed-positions`, { headers: authHeaders });
                    if (stored.ok) {
                        const text = await stored.text();
                        const data = text ? JSON.parse(text) : null;
                        if (data && Array.isArray(data) && data.length > 0) {
                            setPositions(data); setApproved(true); setLoading(false); return;
                        }
                    }
                } catch { /* jeśli endpoint nie zwróci JSON — kontynuuj parsowanie */ }
            }
            // Parse from PDF
            const res = await fetch(`${API_URL}/material-requirements/parse-offer`, {
                method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId }),
            });
            if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.message || `Błąd ${res.status}`); return; }
            const data = await res.json();
            setPositions(data.length > 0 ? data : null);
            if (data.length === 0) setError('Nie znaleziono pozycji w tym dokumencie');
        } catch (e) { setError(`Błąd: ${e?.message || 'połączenia'}`); }
        finally { setLoading(false); }
    }, [documentId, token]);

    useEffect(() => {
        const timer = setTimeout(() => loadAndParse(), 1500);
        return () => clearTimeout(timer);
    }, [loadAndParse]);

    const updatePos = (i, field, value) => {
        setPositions(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
        setApproved(false);
    };

    const handleApprove = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/documents/${documentId}/parsed-positions`, {
                method: 'PATCH', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ positions }),
            });
            if (res.ok) { setApproved(true); onApprove?.(positions); setShowMapping(true); }
            else setError('Błąd zapisu');
        } catch { setError('Błąd połączenia'); }
        finally { setSaving(false); }
    };

    return (
        <div className="w-[340px] shrink-0 flex flex-col border-l border-white/5 bg-black/30 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <FileText size={12} className="text-teal-400" />
                    <span className="text-[11px] font-bold text-gray-300 uppercase tracking-widest">Pozycje z oferty</span>
                    {approved && <span className="flex items-center gap-1 text-[9px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full border border-green-400/20"><CheckCircle size={8} />zatwierdzone</span>}
                </div>
                <button onClick={() => loadAndParse(true)} title="Parsuj ponownie"
                    className="p-1 text-gray-500 hover:text-white transition-colors rounded">
                    <RotateCcw size={12} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {loading && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
                        <div className="w-5 h-5 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
                        <p className="text-[11px] text-gray-500">Parsowanie oferty PDF...</p>
                    </div>
                )}
                {error && !loading && (
                    <div className="p-4 text-center">
                        <p className="text-xs text-red-400">{error}</p>
                        <button onClick={() => loadAndParse(true)} className="mt-2 text-[10px] text-teal-400 hover:text-teal-300 underline">Spróbuj ponownie</button>
                    </div>
                )}
                {positions && !loading && (
                    <div className="p-2 flex flex-col gap-1.5">
                        {positions.map((pos, i) => (
                            <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-gray-600 font-mono w-4 text-center">{pos.lp ?? i + 1}</span>
                                    <input value={pos.description || ''} onChange={e => updatePos(i, 'description', e.target.value)}
                                        placeholder="Nazwa / opis"
                                        className="flex-1 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none focus:border-teal-500" />
                                </div>
                                <div className="grid grid-cols-2 gap-1 ml-5">
                                    <input value={pos.manufacturer || ''} onChange={e => updatePos(i, 'manufacturer', e.target.value)}
                                        placeholder="Producent"
                                        className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-teal-500" />
                                    <input value={pos.model || ''} onChange={e => updatePos(i, 'model', e.target.value)}
                                        placeholder="Model"
                                        className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[10px] text-gray-300 font-mono focus:outline-none focus:border-teal-500" />
                                </div>
                                <div className="grid grid-cols-3 gap-1 ml-5">
                                    <input value={pos.quantity ?? ''} onChange={e => updatePos(i, 'quantity', e.target.value)}
                                        placeholder="Ilość" type="number" min="0"
                                        className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[10px] text-gray-300 font-mono focus:outline-none focus:border-teal-500" />
                                    <input value={pos.unit || 'sztuki'} onChange={e => updatePos(i, 'unit', e.target.value)}
                                        placeholder="Jedn."
                                        className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-teal-500" />
                                    <input value={pos.priceNetto ?? ''} onChange={e => updatePos(i, 'priceNetto', e.target.value)}
                                        placeholder="Cena netto" type="number" min="0" step="0.01"
                                        className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[10px] text-teal-300 font-mono focus:outline-none focus:border-teal-500" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer — approve button */}
            {positions && !loading && (
                <div className="p-2.5 border-t border-white/5 bg-black/20 space-y-1.5">
                    {approved ? (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-center gap-2 py-1 text-green-400 text-[11px] font-semibold">
                                <CheckCircle size={13} /> Dane zatwierdzone
                            </div>
                            <button onClick={() => setShowMapping(true)}
                                className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 text-[10px] font-semibold border border-blue-500/25 transition-all">
                                <Link2 size={11} />Przypisz karty katalogowe
                            </button>
                        </div>
                    ) : (
                        <button onClick={handleApprove} disabled={saving}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 text-[11px] font-semibold border border-teal-500/30 transition-all disabled:opacity-50">
                            {saving
                                ? <><div className="w-3 h-3 border border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />Zapisywanie...</>
                                : <><CheckCircle size={12} />Zatwierdź dane oferty</>}
                        </button>
                    )}
                    <p className="text-[9px] text-gray-600 text-center">
                        Po zatwierdzeniu wybór oferty wypełni pola automatycznie
                    </p>
                </div>
            )}

            {showMapping && positions && (
                <OfferDatasheetMappingModal
                    positions={positions}
                    documentId={documentId}
                    token={token}
                    onClose={() => setShowMapping(false)}
                    onSaved={(updated) => { setPositions(updated); onApprove?.(updated); }}
                />
            )}
        </div>
    );
}

// ─── Panel kart katalogowych ──────────────────────────────────────────────────

function DatasheetParsePanel({ documentId, fileName, nodeId, token, onApprove }) {
    const [items, setItems] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingExisting, setLoadingExisting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const [isExisting, setIsExisting] = useState(false); // czy dane są z bazy (do aktualizacji)
    const authHeaders = { Authorization: `Bearer ${token}` };

    // Reset + załaduj istniejące dane przy zmianie pliku
    useEffect(() => {
        setItems(null);
        setError(null);
        setSaved(false);
        setIsExisting(false);
        if (!nodeId || !fileName) return;
        setLoadingExisting(true);
        fetch(`${API_URL}/material-requirements/datasheets/${nodeId}`, { headers: authHeaders })
            .then(r => r.ok ? r.json() : [])
            .then(all => {
                const matched = all.filter(r => r.dataSheetName === fileName);
                if (matched.length > 0) {
                    setItems(matched.map(r => ({ id: r.id, productName: r.productName, manufacturer: r.manufacturer || '', model: r.model || '', type: r.type })));
                    setIsExisting(true);
                }
            })
            .catch(() => {})
            .finally(() => setLoadingExisting(false));
    }, [documentId, nodeId, fileName]);

    const loadAndParse = useCallback(async () => {
        setLoading(true); setError(null); setSaved(false); setIsExisting(false);
        try {
            const res = await fetch(`${API_URL}/material-requirements/parse-datasheet`, {
                method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId }),
            });
            if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.message || `Błąd ${res.status}`); return; }
            const data = await res.json();
            setItems(data.length > 0 ? data : null);
            if (data.length === 0) setError('Nie znaleziono produktów w tym dokumencie');
        } catch { setError('Błąd połączenia'); }
        finally { setLoading(false); }
    }, [documentId, token]);

    const updateItem = (i, field, value) => {
        setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
        setSaved(false);
    };

    const removeItem = (i) => {
        setItems(prev => {
            const next = prev.filter((_, idx) => idx !== i);
            return next.length > 0 ? next : null;
        });
        setSaved(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (isExisting) {
                // Aktualizuj istniejące rekordy
                await Promise.all(items.map(item =>
                    fetch(`${API_URL}/material-requirements/${item.id}`, {
                        method: 'PATCH',
                        headers: { ...authHeaders, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ productName: item.productName, manufacturer: item.manufacturer || null, model: item.model || null, type: item.type }),
                    })
                ));
            } else {
                await onApprove?.(items);
            }
            setSaved(true);
        } catch { setError('Błąd zapisu'); }
        finally { setSaving(false); }
    };

    return (
        <div className="w-[320px] shrink-0 flex flex-col border-l border-white/5 bg-black/30 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <FileText size={12} className="text-amber-400" />
                    <span className="text-[11px] font-bold text-gray-300 uppercase tracking-widest">Karta katalogowa</span>
                    {isExisting && !saved && <span className="text-[9px] text-teal-400 bg-teal-400/10 px-1.5 py-0.5 rounded-full border border-teal-400/20">z bazy</span>}
                    {saved && <span className="flex items-center gap-1 text-[9px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full border border-green-400/20"><CheckCircle size={8} />zapisane</span>}
                </div>
                <button onClick={loadAndParse} title="Parsuj ponownie" className="p-1 text-gray-500 hover:text-white transition-colors rounded">
                    <RotateCcw size={12} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {(loading || loadingExisting) && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
                        <div className="w-5 h-5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                        <p className="text-[11px] text-gray-500">{loading ? 'Parsowanie...' : 'Ładowanie...'}</p>
                    </div>
                )}
                {error && !loading && !loadingExisting && (
                    <div className="p-4 text-center">
                        <p className="text-xs text-red-400">{error}</p>
                        <button onClick={loadAndParse} className="mt-2 text-[10px] text-amber-400 hover:text-amber-300 underline">Spróbuj ponownie</button>
                    </div>
                )}
                {!loading && !loadingExisting && !items && !error && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                        <RotateCcw size={20} className="text-gray-600" />
                        <p className="text-[11px] text-gray-500">Kliknij <span className="text-amber-400">↻</span> aby sparsować kartę</p>
                    </div>
                )}
                {items && !loading && !loadingExisting && (
                    <div className="p-2 flex flex-col gap-1.5">
                        {items.map((item, i) => (
                            <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 space-y-1.5 group/item relative">
                                <button onClick={() => removeItem(i)} title="Usuń pozycję"
                                    className="absolute -top-1 -right-1 p-1 rounded-full bg-red-900/60 text-red-400 hover:bg-red-700/80 hover:text-red-200 opacity-0 group-hover/item:opacity-100 transition-all z-10">
                                    <Trash2 size={10} />
                                </button>
                                <input value={item.productName || ''} onChange={e => updateItem(i, 'productName', e.target.value)}
                                    placeholder="Nazwa produktu"
                                    className="w-full bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500" />
                                <div className="grid grid-cols-2 gap-1">
                                    <input value={item.manufacturer || ''} onChange={e => updateItem(i, 'manufacturer', e.target.value)}
                                        placeholder="Producent"
                                        className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-amber-500" />
                                    <input value={item.model || ''} onChange={e => updateItem(i, 'model', e.target.value)}
                                        placeholder="Model"
                                        className="bg-black/40 border border-white/10 rounded px-1.5 py-1 text-[10px] text-gray-300 font-mono focus:outline-none focus:border-amber-500" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {items && !loading && !loadingExisting && (
                <div className="p-2.5 border-t border-white/5 bg-black/20">
                    {saved ? (
                        <div className="flex items-center justify-center gap-2 py-1.5 text-green-400 text-[11px] font-semibold">
                            <CheckCircle size={13} /> {isExisting ? 'Zaktualizowano' : 'Zapisano do bazy materiałów'}
                        </div>
                    ) : (
                        <button onClick={handleSave} disabled={saving}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-[11px] font-semibold border border-amber-500/30 transition-all disabled:opacity-50">
                            {saving
                                ? <><div className="w-3 h-3 border border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />Zapisywanie...</>
                                : isExisting
                                    ? <><CheckCircle size={12} />Aktualizuj bazę materiałów</>
                                    : <><CheckCircle size={12} />Zapisz do bazy materiałów</>}
                        </button>
                    )}
                    {!isExisting && <p className="text-[9px] text-gray-600 text-center mt-1.5">Cena i oferta pozostają puste</p>}
                </div>
            )}
        </div>
    );
}

// ─── Główny komponent ─────────────────────────────────────────────────────────

export default function DocumentViewer({ fileUrl, fileName, mimeType, onClose, documentId = null, token = null, isOffer = false, isDatasheet = false, onApprove = null, onDatasheetApprove = null, nodeId = null }) {
    const [numPages, setNumPages] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [scale, setScale] = useState(1.0);
    const [textContent, setTextContent] = useState('');
    const [textLoading, setTextLoading] = useState(false);
    const [pdfContainerWidth, setPdfContainerWidth] = useState(800);
    const pdfScrollRef = useRef(null);

    // Highlights
    const [highlights, setHighlights] = useState([]);
    const [activeHighlightId, setActiveHighlightId] = useState(null);
    const authToken = token || sessionStorage.getItem('token') || localStorage.getItem('token');

    const showOfferPanel = isOffer && documentId && token;
    const showDatasheetPanel = isDatasheet && documentId && token;

    // Mierzymy widoczną szerokość scroll-parenta (stała, nie rośnie z zoomem) — to chroni przed feedback-loopem.
    // Tolerancja ±4px chroni przed mryganiem scrollbara przy granicznych szerokościach.
    useEffect(() => {
        const obs = new ResizeObserver(entries => {
            const w = entries[0]?.contentRect?.width;
            if (!w) return;
            const next = Math.floor(w - 32);
            setPdfContainerWidth(prev => Math.abs(prev - next) < 4 ? prev : next);
        });
        if (pdfScrollRef.current) obs.observe(pdfScrollRef.current);
        return () => obs.disconnect();
    }, []);

    const ext = fileName?.split('.').pop()?.toLowerCase() || '';
    const isPdf = mimeType === 'application/pdf' || ext === 'pdf';

    const isOffice = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ].includes(mimeType) || ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(ext);

    const isImage = mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext);
    const isVideo = mimeType?.startsWith('video/') || ['mp4', 'webm', 'ogg'].includes(ext);
    const isText = [
        'text/plain', 'text/html', 'application/json', 'text/javascript', 'text/css'
    ].includes(mimeType) || ['txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'md', 'log'].includes(ext);

    useEffect(() => {
        if (isText && fileUrl) {
            const fetchText = async () => {
                setTextLoading(true);
                try {
                    const res = await fetch(fileUrl);
                    if (res.ok) setTextContent(await res.text());
                } catch { setTextContent('Błąd podczas ładowania zawartości tekstowej.'); }
                finally { setTextLoading(false); }
            };
            fetchText();
        }
    }, [fileUrl, isText]);

    function onDocumentLoadSuccess({ numPages }) { setNumPages(numPages); }
    const toggleFullscreen = () => setIsFullscreen(!isFullscreen);
    const docs = [{ uri: fileUrl, fileType: ext, fileName }];

    // Pobierz highlighty po zmianie dokumentu (tylko dla PDF)
    useEffect(() => {
        setHighlights([]);
        setActiveHighlightId(null);
        if (!documentId || !isPdf) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${API_URL}/documents/${documentId}/highlights`, {
                    headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
                });
                if (res.ok && !cancelled) setHighlights(await res.json());
            } catch (err) {
                console.error('[DocumentViewer] Błąd pobierania highlightów:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [documentId, isPdf, authToken]);

    const createHighlight = useCallback(async ({ page, rects, color }) => {
        if (!documentId) return;
        // Optymistyczny render — highlight pojawia się natychmiast, nawet gdy backend jeszcze nie odpowiedział
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const optimistic = { id: tempId, documentId, page, rects, color, comment: null, _optimistic: true };
        setHighlights(prev => [...prev, optimistic]);
        try {
            const res = await fetch(`${API_URL}/documents/${documentId}/highlights`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ page, rects, color }),
            });
            if (res.ok) {
                const saved = await res.json();
                setHighlights(prev => prev.map(h => h.id === tempId ? saved : h));
            } else {
                const text = await res.text().catch(() => '');
                console.error(`[DocumentViewer] Highlight POST ${res.status}:`, text);
                setHighlights(prev => prev.map(h => h.id === tempId ? { ...h, _failed: true } : h));
            }
        } catch (err) {
            console.error('[DocumentViewer] Błąd zapisu highlightu:', err);
            setHighlights(prev => prev.map(h => h.id === tempId ? { ...h, _failed: true } : h));
        }
    }, [documentId, authToken]);

    const deleteHighlight = useCallback(async (hid) => {
        if (!documentId) return;
        try {
            const res = await fetch(`${API_URL}/documents/${documentId}/highlights/${hid}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authToken}` },
            });
            if (res.ok) setHighlights(prev => prev.filter(h => h.id !== hid));
        } catch (err) {
            console.error('[DocumentViewer] Błąd usuwania highlightu:', err);
        }
        setActiveHighlightId(null);
    }, [documentId, authToken]);

    const updateHighlightColor = useCallback(async (hid, color) => {
        if (!documentId) return;
        try {
            const res = await fetch(`${API_URL}/documents/${documentId}/highlights/${hid}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ color }),
            });
            if (res.ok) {
                const updated = await res.json();
                setHighlights(prev => prev.map(h => h.id === hid ? updated : h));
            }
        } catch (err) {
            console.error('[DocumentViewer] Błąd zmiany koloru highlightu:', err);
        }
    }, [documentId, authToken]);
    const [downloading, setDownloading] = useState(false);

    const handleDownload = useCallback(async () => {
        if (!isPdf) {
            const a = document.createElement('a');
            a.href = fileUrl;
            a.download = fileName;
            a.click();
            return;
        }
        setDownloading(true);
        try {
            await downloadPdfWithHighlights({ fileUrl, fileName, highlights, token: authToken });
        } catch (err) {
            console.error('[Download]', err);
            const a = document.createElement('a');
            a.href = fileUrl;
            a.download = fileName;
            a.click();
        } finally {
            setDownloading(false);
        }
    }, [isPdf, highlights, fileUrl, fileName, authToken]);

    const icon = isPdf ? '📕' : isOffice ? '📘' : isImage ? '🖼️' : isVideo ? '🎬' : isText ? '📄' : '📁';

    const viewerContent = (
        <div className={`flex flex-col bg-black/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl transition-all relative ${isFullscreen ? 'fixed inset-4 z-[9999] bg-gray-900 border-white/20' : 'w-full h-full'}`}>
            {/* Header Toolbar */}
            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-3">
                    <span className="text-xl">{icon}</span>
                    <span className="text-sm font-bold text-gray-200 truncate max-w-[300px]" title={fileName}>
                        {fileName || 'Dokument'}
                    </span>
                    {showOfferPanel && (
                        <span className="text-[9px] uppercase tracking-widest text-teal-400 bg-teal-400/10 border border-teal-400/20 px-2 py-0.5 rounded-full font-bold">oferta</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleDownload} disabled={downloading}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                        title={isPdf && highlights.length > 0 ? 'Pobierz z zaznaczeniami' : 'Pobierz dokument'}>
                        {downloading
                            ? <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
                            : <Download size={16} />}
                    </button>
                    {onClose && (
                        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors ml-2">
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Overlay — zoom + fullscreen */}
            {(isPdf || isImage) && (
                <div className="fixed bottom-4 right-3 z-[100] flex flex-col gap-2 pointer-events-none">
                    <button onClick={toggleFullscreen}
                        className="pointer-events-auto w-11 h-11 flex items-center justify-center rounded-xl bg-black/70 backdrop-blur border border-white/15 text-white shadow-lg active:scale-95 transition-transform"
                        title={isFullscreen ? 'Zamknij pełny ekran' : 'Pełny ekran'}>
                        {isFullscreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}
                    </button>
                    {isPdf && <>
                        <button onClick={() => setScale(1.0)}
                            className="pointer-events-auto w-11 h-11 flex items-center justify-center rounded-xl bg-black/70 backdrop-blur border border-white/15 text-white shadow-lg active:scale-95 transition-transform"
                            title="Dopasuj (100%)">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                            </svg>
                        </button>
                        <button onClick={() => setScale(s => Math.min(3.0, s + 0.25))}
                            className="pointer-events-auto w-11 h-11 flex items-center justify-center rounded-xl bg-black/70 backdrop-blur border border-white/15 text-white shadow-lg active:scale-95 transition-transform"
                            title="Powiększ"><ZoomIn size={18}/></button>
                        <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
                            className="pointer-events-auto w-11 h-11 flex items-center justify-center rounded-xl bg-black/70 backdrop-blur border border-white/15 text-white shadow-lg active:scale-95 transition-transform"
                            title="Pomniejsz"><ZoomOut size={18}/></button>
                    </>}
                </div>
            )}

            {/* Main area: PDF viewer + optional offer panel */}
            <div className="flex-1 flex overflow-hidden">
                {/* Viewer Content */}
                <div ref={pdfScrollRef} className="flex-1 overflow-x-auto overflow-y-scroll bg-white/5 custom-scrollbar">
                    {isPdf ? (
                        // Wrapper rośnie z contentem (w-fit + min-w-full): mały PDF jest wyśrodkowany,
                        // duży (po zoomie) rozciąga area scrolla — można przewijać w lewo/prawo bez gubienia krawędzi.
                        <div className="p-4 w-fit min-w-full mx-auto">
                            <Document file={fileUrl} options={pdfOptions} onLoadSuccess={onDocumentLoadSuccess}
                                loading={
                                    <div className="flex flex-col items-center justify-center p-10 text-gray-400">
                                        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3"></div>
                                        <span className="text-xs">Ładowanie PDF...</span>
                                    </div>
                                }
                                error={<div className="p-10 text-red-400 text-center text-xs">Błąd podczas ładowania pliku PDF.<br/>Sprawdź czy plik nie jest uszkodzony.</div>}>
                                {Array.from(new Array(numPages), (el, index) => {
                                    const pn = index + 1;
                                    return (
                                        <PdfPageWithHighlights
                                            key={`page_${pn}`}
                                            pageNumber={pn}
                                            width={Math.floor(pdfContainerWidth * scale)}
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
                    ) : isOffice ? (
                        <div className="w-full h-full bg-white text-black overflow-hidden [&_.react-doc-viewer]:!bg-transparent">
                            <DocViewer documents={docs} pluginRenderers={DocViewerRenderers}
                                style={{ width: '100%', height: '100%' }}
                                config={{ header: { disableHeader: true, disableFileName: true, retainURLParams: false } }} />
                        </div>
                    ) : isImage ? (
                        <div className="flex items-center justify-center p-8 w-full h-full">
                            <img src={fileUrl} alt={fileName} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg border border-white/10" />
                        </div>
                    ) : isVideo ? (
                        <div className="flex items-center justify-center p-4 w-full h-full bg-black">
                            <video src={fileUrl} controls className="max-w-full max-h-full" />
                        </div>
                    ) : isText ? (
                        <div className="w-full h-full p-6 font-mono text-xs text-gray-300 whitespace-pre-wrap overflow-auto bg-[#0d1117]">
                            {textLoading
                                ? <div className="flex flex-col items-center justify-center h-full text-gray-500"><div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3"></div><span>Wczytywanie tekstu...</span></div>
                                : textContent}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500 flex-col gap-4 p-10 text-center">
                            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-4xl mb-2 grayscale opacity-20">📁</div>
                            <div className="max-w-xs">
                                <h4 className="text-sm font-bold text-gray-300 mb-2">Format nieobsługiwany w przeglądarce</h4>
                                <p className="text-[10px] leading-relaxed mb-6">Ten typ pliku nie może zostać wyświetlony bezpośrednio w tym oknie. Pobierz go na swój dysk, aby otworzyć go lokalnie.</p>
                                <a href={fileUrl} download className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20">
                                    <Download size={14} /> Pobierz plik
                                </a>
                            </div>
                        </div>
                    )}
                </div>

                {/* Offer parse panel */}
                {showOfferPanel && <OfferParsePanel documentId={documentId} token={token} onApprove={(positions) => onApprove?.(positions, documentId, fileName)} />}
                {/* Datasheet parse panel */}
                {showDatasheetPanel && <DatasheetParsePanel documentId={documentId} fileName={fileName} nodeId={nodeId} token={token} onApprove={(items) => onDatasheetApprove?.(items, documentId)} />}
            </div>
        </div>
    );

    if (isFullscreen) {
        return (
            <>
                <div className="w-full h-full min-h-[400px] relative bg-black/20 border border-white/10 rounded-2xl flex items-center justify-center">
                    <span className="text-gray-500 text-sm">Dokument otwarty w pełnym ekranie</span>
                </div>
                {createPortal(viewerContent, document.body)}
            </>
        );
    }

    return viewerContent;
}
