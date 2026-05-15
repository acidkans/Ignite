import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import {
    ChevronRight, ChevronDown, Package, Wrench,
    CheckCircle, Clock, XCircle, Star, Trash2, AlertCircle,
    ShoppingCart, Warehouse, LogOut, Plus, Search, Sparkles,
    FileText, Link as LinkIcon, Download, BookOpen, X,
} from 'lucide-react';
import { API_URL } from '../../../config';
import { UNIT_OPTIONS } from './wbsConstants';

// ─── Meta ────────────────────────────────────────────────────────────────────

const WBS_TYPE_TO_REQ = { material: 'MATERIAL', equipment: 'DEVICE' };

const TYPE_META = {
    material:  { label: 'Materiał', icon: Wrench,  color: 'text-amber-300',  reqType: 'MATERIAL' },
    equipment: { label: 'Sprzęt',   icon: Package, color: 'text-blue-300',   reqType: 'DEVICE' },
};

const STATUS_META = {
    PENDING:   { label: 'Oczekuje',     icon: Clock,        color: 'text-amber-400' },
    PROPOSAL:  { label: 'Propozycja',   icon: Star,         color: 'text-blue-400' },
    CONFIRMED: { label: 'Potwierdzone', icon: CheckCircle,  color: 'text-green-400' },
    REJECTED:  { label: 'Odrzucone',    icon: XCircle,      color: 'text-red-400' },
    ORDERED:   { label: 'Zamówione',    icon: ShoppingCart, color: 'text-purple-400' },
    IN_STOCK:  { label: 'Na magazynie', icon: Warehouse,    color: 'text-cyan-400' },
    ISSUED:    { label: 'Wydane',       icon: LogOut,       color: 'text-emerald-400' },
};

const WBS_NODE_STATUSES = [
    { value: '',          label: '—' },
    { value: 'todo',      label: 'Do zrobienia' },
    { value: 'inprogress',label: 'W trakcie' },
    { value: 'done',      label: 'Gotowe' },
    { value: 'blocked',   label: 'Zablokowane' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders() {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function normalizeName(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function flattenWbsNodes(items, result = []) {
    for (const n of (items || [])) {
        result.push(n);
        if (n.children?.length) flattenWbsNodes(n.children, result);
    }
    return result;
}

function getParentPath(nodePath) {
    const segs = nodePath ? nodePath.split(' › ') : [];
    if (segs.length <= 1) return segs[0] || '—';
    return segs.slice(0, -1).join(' / ');
}

// ─── ProposalsSection ─────────────────────────────────────────────────────────

function ProposalImage({ proposalId, token, onDeleted }) {
    const [blobUrl, setBlobUrl] = useState(null);
    const blobRef = useRef(null);
    useEffect(() => {
        let cancelled = false;
        fetch(`${API_URL}/material-requirements/proposals/${proposalId}/image`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(async res => {
            if (!res.ok || cancelled) return;
            const blob = await res.blob();
            if (cancelled) return;
            if (blobRef.current) URL.revokeObjectURL(blobRef.current);
            const url = URL.createObjectURL(blob);
            blobRef.current = url;
            setBlobUrl(url);
        }).catch(() => {});
        return () => {
            cancelled = true;
            if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
        };
    }, [proposalId, token]);

    if (!blobUrl) return null;
    return (
        <div className="relative flex-shrink-0 w-10 h-10 group">
            <img src={blobUrl} alt="produkt" className="w-full h-full object-contain rounded" />
            <button
                onClick={onDeleted}
                title="Usuń obrazek"
                className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 rounded transition-opacity text-red-400 hover:text-red-300"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
}

function ProposalsSection({ req, token, onRefresh }) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const [proposals, setProposals] = useState(req.proposals || []);
    const [searching, setSearching] = useState(false);
    const [manualForm, setManualForm] = useState(null);

    useEffect(() => { setProposals(req.proposals || []); }, [req.id, req.proposals]);

    const searchAI = async () => {
        setSearching(true);
        try {
            const res = await fetch(`${API_URL}/material-requirements/${req.id}/search-products`, { method: 'POST', headers });
            if (res.ok) { const data = await res.json(); setProposals(data); onRefresh(); }
        } finally { setSearching(false); }
    };

    const selectProposal = async (p) => {
        await fetch(`${API_URL}/material-requirements/proposals/${p.id}/select`, { method: 'PATCH', headers });
        onRefresh();
    };

    const deleteProposal = async (p) => {
        await fetch(`${API_URL}/material-requirements/proposals/${p.id}`, { method: 'DELETE', headers });
        setProposals(prev => prev.filter(x => x.id !== p.id));
        onRefresh();
    };

    const deleteProposalImage = async (p) => {
        await fetch(`${API_URL}/material-requirements/proposals/${p.id}/image`, { method: 'DELETE', headers });
        setProposals(prev => prev.map(x => x.id === p.id ? { ...x, imageUrl: null } : x));
        onRefresh();
    };

    const addManual = async () => {
        if (!manualForm?.productName) return;
        const payload = { ...manualForm, isManual: true };
        const raw = String(manualForm.priceNetto ?? '').trim().replace(',', '.');
        payload.priceNetto = raw === '' ? null : (parseFloat(raw) || null);
        const res = await fetch(`${API_URL}/material-requirements/${req.id}/proposals`, {
            method: 'POST', headers, body: JSON.stringify(payload),
        });
        if (res.ok) { const p = await res.json(); setProposals(prev => [...prev, p]); setManualForm(null); onRefresh(); }
    };

    return (
        <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center gap-2">
                <span className="text-[10px] italic uppercase tracking-widest text-white font-semibold">Propozycje produktów</span>
                <button onClick={searchAI} disabled={searching}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors disabled:opacity-40">
                    <Sparkles size={10} /> {searching ? 'Szukam...' : 'Szukaj AI'}
                </button>
                <button onClick={() => setManualForm(manualForm ? null : { productName: '', manufacturer: '', model: '', priceNetto: '', availability: '', sourceUrl: '' })}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 transition-colors">
                    <Plus size={10} /> Dodaj ręcznie
                </button>
            </div>

            {manualForm && (
                <div className="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10">
                    {[
                        { key: 'manufacturer', ph: 'Producent' },
                        { key: 'model', ph: 'Model' },
                        { key: 'productName', ph: 'Nazwa handlowa' },
                        { key: 'priceNetto', ph: 'Cena netto' },
                        { key: 'availability', ph: 'Dostępność' },
                        { key: 'sourceUrl', ph: 'https://...' },
                    ].map(({ key, ph }) => (
                        <input key={key} value={manualForm[key] || ''} onChange={e => setManualForm(p => ({ ...p, [key]: e.target.value }))}
                            placeholder={ph}
                            className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-600 outline-none" />
                    ))}
                    <button onClick={addManual} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs transition-colors flex-shrink-0">Dodaj</button>
                    <button onClick={() => setManualForm(null)} className="text-gray-500 hover:text-gray-300 flex-shrink-0"><XCircle size={14} /></button>
                </div>
            )}

            {proposals.length === 0 && !manualForm && (
                <p className="text-[11px] text-gray-600 italic">Brak propozycji — kliknij „Szukaj AI" lub dodaj ręcznie.</p>
            )}

            {proposals.map(p => (
                <div key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded border text-[10px] transition-colors ${p.isSelected ? 'bg-green-500/10 border-green-500/30' : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]'}`}>
                    <button onClick={() => deleteProposal(p)} title="Usuń propozycję" className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                        <Trash2 size={11} />
                    </button>
                    {p.imageUrl && <ProposalImage proposalId={p.id} token={token} onDeleted={() => deleteProposalImage(p)} />}
                    <span className="w-16 flex-shrink-0 truncate text-gray-300" title={p.manufacturer}>{p.manufacturer || '—'}</span>
                    <span className="w-20 flex-shrink-0 truncate text-gray-400 font-mono" title={p.model}>{p.model || '—'}</span>
                    <span className="flex-1 min-w-0 truncate text-white" title={p.productName}>{p.productName || '—'}</span>
                    {p.priceNetto != null && (
                        <span className="flex-shrink-0 text-green-400 font-mono whitespace-nowrap">{Number(p.priceNetto).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
                    )}
                    {p.availability && (
                        <span className="flex-shrink-0 w-16 truncate text-cyan-400" title={p.availability}>{p.availability}</span>
                    )}
                    {p.sourceUrl && (
                        <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer"
                           className="flex-shrink-0 w-24 truncate text-blue-400 hover:text-blue-300 transition-colors block"
                           title={p.sourceUrl}>
                            {(() => { try { return new URL(p.sourceUrl).hostname.replace(/^www\./, ''); } catch { return p.sourceUrl.slice(0, 20); } })()}
                        </a>
                    )}
                    {p.matchScore != null && (
                        <span className="flex-shrink-0 text-blue-400">{Math.round(p.matchScore * 100)}%</span>
                    )}
                    {!p.isSelected ? (
                        <button onClick={() => selectProposal(p)}
                            className="flex-shrink-0 px-2 py-0.5 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/20 transition-colors">
                            Wybierz
                        </button>
                    ) : (
                        <CheckCircle size={12} className="text-green-400 flex-shrink-0" />
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── ProductCard ──────────────────────────────────────────────────────────────

export function ProductCard({ card, wbsNode, token, materialDb, offers, onRefresh, onPropagatePrice, readOnly }) {
    const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    const [fields, setFields] = useState({
        manufacturer: card?.manufacturer || '',
        model: card?.model || '',
        productName: card?.productName || '',
        availability: card?.availability || '',
        technicalSpec: card?.technicalSpec || '',
        priceNetto: card?.priceNetto ?? '',
        productUrl: card?.productUrl || '',
    });
    const [comboOpen, setComboOpen] = useState(null);
    const [localImageUrl, setLocalImageUrl] = useState(null);
    const [imageKey, setImageKey] = useState(0);
    const [fetchedImageUrl, setFetchedImageUrl] = useState(null);
    const [showCatalogModal, setShowCatalogModal] = useState(false);
    const [catalogImageUrl, setCatalogImageUrl] = useState(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const pdfBlobUrlRef = useRef(null);

    const openPdfPreview = useCallback(async (type = 'datasheet') => {
        const res = await fetch(`${API_URL}/material-requirements/${card.id}/${type}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        if (pdfBlobUrlRef.current) URL.revokeObjectURL(pdfBlobUrlRef.current);
        const url = URL.createObjectURL(blob);
        pdfBlobUrlRef.current = url;
        setPdfPreviewUrl(url);
    }, [card?.id, token]);

    const closePdfPreview = useCallback(() => {
        setPdfPreviewUrl(null);
        if (pdfBlobUrlRef.current) { URL.revokeObjectURL(pdfBlobUrlRef.current); pdfBlobUrlRef.current = null; }
    }, []);
    const fileInputRef = useRef(null);
    const pasteInputRef = useRef(null);
    const localImageUrlRef = useRef(null);
    const fetchedImageUrlRef = useRef(null);
    const catalogImageUrlRef = useRef(null);
    const [catalogMaterial, setCatalogMaterial] = useState(null);

    useEffect(() => {
        setFields({
            manufacturer: card?.manufacturer || '',
            model: card?.model || '',
            productName: card?.productName || '',
            availability: card?.availability || '',
            technicalSpec: card?.technicalSpec || '',
            priceNetto: card?.priceNetto ?? '',
            productUrl: card?.productUrl || '',
        });
    // Zresetuj formularz tylko przy zmianie karty (nowe id).
    // Nie reaguj na zmiany pojedynczych pól — każdy blur sam wywołuje patchCard,
    // a reset po onRefresh kasował niezapisane wartości innych pól.
    }, [card?.id]);

    // Pobierz obrazek z auth nagłówkiem i stwórz blob URL (img src nie może wysłać Authorization)
    useEffect(() => {
        if (!card?.imageUrl || !card?.id) {
            setFetchedImageUrl(null);
            return;
        }
        let cancelled = false;
        fetch(`${API_URL}/material-requirements/${card.id}/image?t=${imageKey}`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(async res => {
            if (!res.ok || cancelled) return;
            const blob = await res.blob();
            if (cancelled) return;
            if (fetchedImageUrlRef.current) URL.revokeObjectURL(fetchedImageUrlRef.current);
            const url = URL.createObjectURL(blob);
            fetchedImageUrlRef.current = url;
            setFetchedImageUrl(url);
        }).catch(() => { if (!cancelled) setFetchedImageUrl(null); });
        return () => { cancelled = true; };
    }, [card?.id, card?.imageUrl, imageKey, token]);

    // Pobierz dane i obrazek karty katalogowej gdy modal otwarty
    useEffect(() => {
        if (!showCatalogModal || !card?.materialId) {
            if (catalogImageUrlRef.current) { URL.revokeObjectURL(catalogImageUrlRef.current); catalogImageUrlRef.current = null; }
            setCatalogImageUrl(null);
            setCatalogMaterial(null);
            return;
        }
        let cancelled = false;
        // Fetch danych materiału
        fetch(`${API_URL}/material-requirements/${card.materialId}`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(async res => {
            if (!res.ok || cancelled) return;
            const data = await res.json();
            if (!cancelled) setCatalogMaterial(data);
        }).catch(() => {});
        // Fetch obrazka
        fetch(`${API_URL}/material-requirements/${card.materialId}/image`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(async res => {
            if (!res.ok || cancelled) return;
            const blob = await res.blob();
            if (cancelled) return;
            if (catalogImageUrlRef.current) URL.revokeObjectURL(catalogImageUrlRef.current);
            const url = URL.createObjectURL(blob);
            catalogImageUrlRef.current = url;
            setCatalogImageUrl(url);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [showCatalogModal, card?.materialId, token]);

    // Zwolnij objectURL przy odmontowaniu
    useEffect(() => () => {
        if (localImageUrlRef.current) URL.revokeObjectURL(localImageUrlRef.current);
        if (fetchedImageUrlRef.current) URL.revokeObjectURL(fetchedImageUrlRef.current);
        if (catalogImageUrlRef.current) URL.revokeObjectURL(catalogImageUrlRef.current);
    }, []);

    const uploadBlob = useCallback(async (blob, filename = 'image.png') => {
        if (readOnly || !card?.id) return;
        if (localImageUrlRef.current) URL.revokeObjectURL(localImageUrlRef.current);
        const objUrl = URL.createObjectURL(blob);
        localImageUrlRef.current = objUrl;
        setLocalImageUrl(objUrl);
        const formData = new FormData();
        formData.append('file', blob, filename);
        const res = await fetch(`${API_URL}/material-requirements/${card.id}/upload-image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        if (res.ok) { setImageKey(k => k + 1); onRefresh(); }
    }, [card?.id, token, readOnly, onRefresh]);

    const handlePaste = useCallback((e) => {
        const items = Array.from(e.clipboardData?.items || []);
        const imgItem = items.find(i => i.type.startsWith('image/'));
        if (!imgItem) return;
        e.preventDefault();
        const blob = imgItem.getAsFile();
        if (blob) uploadBlob(blob, 'screenshot.png');
    }, [uploadBlob]);

    const handleFileSelect = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file || readOnly || !card?.id) return;
        // Natychmiastowy podgląd
        if (localImageUrlRef.current) URL.revokeObjectURL(localImageUrlRef.current);
        const objUrl = URL.createObjectURL(file);
        localImageUrlRef.current = objUrl;
        setLocalImageUrl(objUrl);
        await uploadBlob(file, file.name);
        e.target.value = '';
    }, [uploadBlob, readOnly, card?.id]);

    const setF = (k, v) => setFields(prev => ({ ...prev, [k]: v }));

    const patchCard = useCallback(async (data) => {
        if (!card?.id) return;
        await fetch(`${API_URL}/material-requirements/${card.id}`, {
            method: 'PATCH', headers, body: JSON.stringify(data),
        });
        onRefresh();
    }, [card?.id, headers, onRefresh]);

    // Cross-filtering comboboxes
    const ciEq = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

    const getFilteredSuggestions = useCallback((fieldKey) => {
        const otherFields = ['manufacturer', 'model', 'productName'].filter(f => f !== fieldKey);
        let base = materialDb;
        for (const f of otherFields) {
            if (fields[f]) base = base.filter(m => ciEq(m[f], fields[f]));
        }
        const typed = (fields[fieldKey] || '').toLowerCase();
        const filtered = base.filter(m => {
            const v = m[fieldKey] || '';
            return v && (typed ? v.toLowerCase().includes(typed) : true);
        });
        const seen = new Set();
        return filtered.filter(m => {
            const v = (m[fieldKey] || '').toLowerCase();
            return !seen.has(v) && seen.add(v);
        }).sort((a, b) => (a[fieldKey] || '').localeCompare(b[fieldKey] || ''));
    }, [materialDb, fields]);

    const selectMaterial = useCallback(async (mat) => {
        const uiFields = {};
        const updates = { materialId: mat.id };
        if (mat.manufacturer) { uiFields.manufacturer = mat.manufacturer.toUpperCase(); updates.manufacturer = mat.manufacturer.toUpperCase(); }
        if (mat.model) { uiFields.model = mat.model; updates.model = mat.model; }
        if (mat.productName) { uiFields.productName = mat.productName; updates.productName = mat.productName; }
        if (mat.dataSheetUrl) { updates.dataSheetUrl = mat.dataSheetUrl; updates.dataSheetName = mat.dataSheetName || mat.productName || 'karta.pdf'; }
        setFields(prev => ({ ...prev, ...uiFields }));
        setComboOpen(null);
        await patchCard(updates);
    }, [patchCard]);

    const comboFields = [
        ['manufacturer', 'Producent'],
        ['model', 'Model'],
        ['productName', 'Nazwa handlowa'],
    ];

    if (!card) return null;

    return (
        <>
        <div className="flex gap-0 p-0">
            {/* Lewa kolumna — pola (zwężona) */}
            <div className="flex flex-col gap-3 p-4 flex-1 min-w-0">
                {/* Comboboxes */}
                <div className="flex flex-wrap gap-2">
                    {comboFields.map(([key, label]) => {
                        const suggestions = getFilteredSuggestions(key);
                        return (
                            <div key={key} className="relative flex-1 min-w-[120px]">
                                <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">{label}</label>
                                <input
                                    value={fields[key]}
                                    onChange={e => setF(key, key === 'manufacturer' ? e.target.value.toUpperCase() : e.target.value)}
                                    onFocus={() => setComboOpen(key)}
                                    onBlur={() => {
                                        setTimeout(() => setComboOpen(null), 150);
                                        if (key === 'manufacturer' && !fields.manufacturer) {
                                            setF('model', '');
                                            setF('productName', '');
                                            patchCard({ manufacturer: '', model: '', productName: '', materialId: null });
                                        }
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            setComboOpen(null);
                                            const updates = { [key]: fields[key] };
                                            if (key === 'manufacturer' && !fields[key]) {
                                                updates.model = '';
                                                updates.productName = '';
                                                updates.materialId = null;
                                                setF('model', '');
                                                setF('productName', '');
                                            }
                                            patchCard(updates);
                                        }
                                    }}
                                    disabled={readOnly}
                                    className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                                    placeholder={`Wpisz ${label.toLowerCase()}...`}
                                />
                                {comboOpen === key && suggestions.length > 0 && (
                                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-gray-900 border border-white/20 rounded shadow-xl max-h-48 overflow-auto custom-scrollbar">
                                        {suggestions.map((m, i) => (
                                            <button key={i} onMouseDown={() => selectMaterial(m)}
                                                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 truncate">
                                                {m[key]}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <div className="flex-1 min-w-[90px]">
                        <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">Cena netto</label>
                        <input value={fields.priceNetto} onChange={e => setF('priceNetto', e.target.value)}
                            onBlur={() => {
                                // Pusty input = wyczyszczenie ceny (null), inaczej parseFloat
                                // (wcześniej NaN powodował pominięcie PATCH-a → cena "wracała").
                                // onPropagatePrice realizuje wariant A (ten sam materiał = jedna cena).
                                const raw = String(fields.priceNetto ?? '').trim().replace(',', '.');
                                let next;
                                if (raw === '') next = null;
                                else { const v = parseFloat(raw); if (isNaN(v)) return; next = v; }
                                if (onPropagatePrice) onPropagatePrice(card, wbsNode, next);
                                else patchCard({ priceNetto: next });
                            }}
                            disabled={readOnly}
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                            placeholder="0.00" />
                    </div>
                    <div className="flex-1 min-w-[90px]">
                        <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">Dostępność</label>
                        <input value={fields.availability} onChange={e => setF('availability', e.target.value)}
                            onBlur={() => patchCard({ availability: fields.availability })}
                            disabled={readOnly}
                            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                            placeholder="np. 7 dni" />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                        <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">Adres www</label>
                        <div className="flex items-center gap-1">
                            <input
                                value={fields.productUrl}
                                onChange={e => setF('productUrl', e.target.value)}
                                onBlur={() => patchCard({ productUrl: fields.productUrl })}
                                disabled={readOnly}
                                placeholder="https://..."
                                className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                            />
                            {fields.productUrl && (
                                <a href={fields.productUrl} target="_blank" rel="noopener noreferrer"
                                    className="flex-shrink-0 p-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 transition-colors">
                                    <LinkIcon size={11} />
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Wymagania techniczne */}
                <div className="flex-1">
                    <label className="block text-[10px] italic uppercase tracking-widest text-white mb-1">Wymagania techniczne</label>
                    <textarea value={fields.technicalSpec} onChange={e => setF('technicalSpec', e.target.value)}
                        onBlur={() => patchCard({ technicalSpec: fields.technicalSpec })}
                        disabled={readOnly} rows={3}
                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50 resize-none"
                        placeholder="Wymagania techniczne (jedno per linia)..." />
                </div>

                {/* Propozycje */}
                {!readOnly && <ProposalsSection req={card} token={token} onRefresh={onRefresh} />}
            </div>

            {/* Ikona karty katalogowej — widoczna gdy materiał zaciągnięty z bazy */}
            {card?.materialId && (
                <div className="flex flex-col items-center justify-start pt-3 w-7 flex-shrink-0 border-l border-white/5">
                    <button
                        onClick={() => setShowCatalogModal(true)}
                        title="Karta katalogowa"
                        className="p-1.5 rounded hover:bg-white/10 text-blue-400/60 hover:text-blue-300 transition-colors"
                    >
                        <BookOpen size={20} />
                    </button>
                </div>
            )}

            {/* Prawa kolumna — kliknięcie = file picker, hover+Ctrl+V = schowek */}
            <div
                onMouseEnter={() => !readOnly && pasteInputRef.current?.focus()}
                onClick={() => !readOnly && fileInputRef.current?.click()}
                className={`relative w-44 flex-shrink-0 border-l transition-colors ${readOnly ? 'cursor-default' : 'cursor-pointer hover:border-blue-500/30 hover:bg-blue-500/5'} border-white/5 bg-black/10`}
                title="Kliknij aby wybrać plik | Najedź i Ctrl+V aby wkleić ze schowka"
            >
                {/* file picker */}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                {/* paste trap — uncontrolled text input, dostaje focus na hover */}
                <input
                    ref={pasteInputRef}
                    type="text"
                    onPaste={handlePaste}
                    tabIndex={-1}
                    aria-hidden="true"
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, border: 'none', outline: 'none', padding: 0 }}
                />
                {(localImageUrl || fetchedImageUrl) ? (
                    <img
                        key={imageKey}
                        src={localImageUrl || fetchedImageUrl}
                        alt="podgląd"
                        className="absolute inset-0 w-full h-full object-contain p-2"
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-gray-600 pointer-events-none">
                        <Search size={20} />
                        <span className="text-[10px] text-center px-2">Kliknij aby<br/>wybrać zdjęcie</span>
                    </div>
                )}
            </div>
        </div>

        {/* Modal podglądu PDF */}
        {pdfPreviewUrl && createPortal(
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80" onClick={closePdfPreview}>
                <div className="bg-[#0d1520] border border-white/15 rounded-2xl shadow-2xl flex flex-col" style={{ width: '90vw', height: '90vh' }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-2 text-[10px] text-teal-400 uppercase tracking-widest font-bold">
                            <FileText size={12} /> Karta katalogowa (PDF)
                        </div>
                        <div className="flex items-center gap-2">
                            <a href={pdfPreviewUrl} download className="text-gray-400 hover:text-gray-200 text-[10px] uppercase tracking-wider">Pobierz</a>
                            <button onClick={closePdfPreview} className="text-gray-500 hover:text-gray-300 transition-colors ml-2"><X size={14} /></button>
                        </div>
                    </div>
                    <iframe src={pdfPreviewUrl} className="flex-1 w-full rounded-b-2xl" title="Karta katalogowa" />
                </div>
            </div>,
            document.body
        )}

        {/* Modal karty katalogowej */}
        {showCatalogModal && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" onClick={() => setShowCatalogModal(false)}>
                <div className="bg-[#0d1520] border border-white/15 rounded-2xl shadow-2xl w-80 overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                        <div className="flex items-center gap-2 text-[10px] text-blue-400 uppercase tracking-widest font-bold">
                            <BookOpen size={12} /> Karta katalogowa
                        </div>
                        <button onClick={() => setShowCatalogModal(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
                            <X size={14} />
                        </button>
                    </div>
                    {catalogImageUrl && (
                        <div className="w-full h-36 bg-black/30 border-b border-white/5">
                            <img src={catalogImageUrl} alt="produkt" className="w-full h-full object-contain p-2" />
                        </div>
                    )}
                    {!catalogMaterial && (
                        <div className="p-4 text-xs text-gray-500 text-center">Ładowanie...</div>
                    )}
                    {catalogMaterial && (
                        <>
                        <div className="p-4 flex flex-col gap-2 text-xs">
                            {catalogMaterial.manufacturer && (
                                <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">Producent</span><span className="text-white font-semibold">{catalogMaterial.manufacturer.toUpperCase()}</span></div>
                            )}
                            {catalogMaterial.model && (
                                <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">Model</span><span className="text-gray-200">{catalogMaterial.model}</span></div>
                            )}
                            {catalogMaterial.productName && (
                                <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">Nazwa</span><span className="text-gray-200">{catalogMaterial.productName}</span></div>
                            )}
                            {catalogMaterial.stockStatus != null && (
                                <div className="flex gap-2"><span className="text-gray-500 w-20 flex-shrink-0">Magazyn</span><span className="text-gray-200">{catalogMaterial.stockStatus} szt.</span></div>
                            )}
                        </div>
                        {(catalogMaterial.dataSheetUrl || catalogMaterial.complianceUrl) && (
                            <div className="px-4 pb-4 flex flex-col gap-2">
                                {catalogMaterial.dataSheetUrl && (
                                    <button onClick={() => openPdfPreview('datasheet')}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg text-teal-300 text-[10px] font-bold uppercase tracking-widest transition-all w-full">
                                        <FileText size={11} /> Karta katalogowa (PDF)
                                    </button>
                                )}
                                {catalogMaterial.complianceUrl && (
                                    <button onClick={() => openPdfPreview('compliance')}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-blue-300 text-[10px] font-bold uppercase tracking-widest transition-all w-full">
                                        <FileText size={11} /> Deklaracja zgodności
                                    </button>
                                )}
                            </div>
                        )}
                        </>
                    )}
                </div>
            </div>,
            document.body
        )}
        </>
    );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function WbsMaterialRow({ node, card, isExpanded, onToggle, onPatchNode, onCreateCard, materialDb, offers, token, readOnly, onRefresh, onPatchCard, onPropagatePrice }) {
    const meta = TYPE_META[node.type] || TYPE_META.material;
    const TypeIcon = meta.icon;
    const reqStatus = card?.status;
    const StatusMeta = STATUS_META[reqStatus];

    const [editQty, setEditQty] = useState(false);
    const [qtyVal, setQtyVal] = useState(String(node.quantity ?? 1));
    useEffect(() => {
        if (!editQty) setQtyVal(String(node.quantity ?? 1));
    }, [node.quantity, editQty]);

    const [editPrice, setEditPrice] = useState(false);
    const [priceVal, setPriceVal] = useState(card?.priceNetto != null ? String(card.priceNetto) : '');
    useEffect(() => {
        if (!editPrice) setPriceVal(card?.priceNetto != null ? String(card.priceNetto) : '');
    }, [card?.priceNetto, editPrice]);

    const [creating, setCreating] = useState(false);

    const handleQtyBlur = () => {
        setEditQty(false);
        const v = parseFloat(qtyVal.replace(',', '.'));
        if (!isNaN(v) && v !== node.quantity) onPatchNode(node.id, { quantity: v });
    };

    const handlePriceBlur = () => {
        setEditPrice(false);
        if (!card?.id) return;
        const raw = String(priceVal ?? '').trim().replace(',', '.');
        let next;
        if (raw === '') next = null;
        else { const v = parseFloat(raw); if (isNaN(v)) return; next = v; }
        if (next === (card.priceNetto ?? null)) return;
        if (onPropagatePrice) onPropagatePrice(card, node, next);
        else if (onPatchCard) onPatchCard(card.id, { priceNetto: next });
    };

    const handleCreateCard = async () => {
        setCreating(true);
        try { await onCreateCard(node); } finally { setCreating(false); }
    };

    const parent = getParentPath(node.path);

    return (
        <tr className={`border-b border-white/[0.03] transition-colors ${isExpanded ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}>
            {/* Expand */}
            <td className="w-9 px-2 py-2.5 text-center">
                <button onClick={onToggle} className="text-gray-600 hover:text-gray-300 transition-colors">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            </td>
            {/* Przedmiot projektu */}
            <td className="px-3 py-2.5">
                <span className="text-sm text-white break-words" title={node.path}>{parent}</span>
            </td>
            {/* Nazwa */}
            <td className="px-3 py-2.5">
                <div className="text-sm text-white break-words">{node.name}</div>
                {node.phase && <div className="text-xs text-gray-500 mt-0.5">{node.phase}</div>}
            </td>
            {/* Wymagania techniczne */}
            <td className="px-3 py-2.5">
                <span className="text-sm text-white break-words whitespace-pre-wrap">{card?.technicalSpec || '—'}</span>
            </td>
            {/* Ilość */}
            <td className="px-3 py-2.5">
                {editQty && !readOnly ? (
                    <input autoFocus value={qtyVal}
                        onChange={e => setQtyVal(e.target.value)}
                        onFocus={e => e.target.select()} onMouseUp={e => e.target.select()}
                        onBlur={handleQtyBlur}
                        onKeyDown={e => { if (e.key === 'Enter') handleQtyBlur(); if (e.key === 'Escape') { setQtyVal(String(node.quantity ?? 1)); setEditQty(false); } }}
                        className="w-16 bg-black/30 border border-blue-500/50 rounded px-2 py-0.5 text-sm text-white outline-none" />
                ) : (
                    <span onClick={() => !readOnly && setEditQty(true)}
                        className={`text-sm text-gray-200 whitespace-nowrap ${!readOnly ? 'cursor-pointer hover:text-white' : ''}`}>
                        {node.quantity ?? 1} <span className="text-xs text-gray-500">{node.unit || 'szt'}</span>
                    </span>
                )}
            </td>
            {/* Produkt */}
            <td className="px-3 py-2.5">
                {card ? (
                    <div>
                        {card.manufacturer && <div className="text-sm text-white break-words">{card.manufacturer}</div>}
                        {card.model && <div className="text-xs text-gray-400 break-words">{card.model}</div>}
                        {!card.manufacturer && !card.model && <span className="text-sm text-white italic">Brak produktu</span>}
                    </div>
                ) : (
                    <button onClick={handleCreateCard} disabled={creating || readOnly}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 text-gray-500 hover:text-gray-300 border border-white/10 transition-colors disabled:opacity-40">
                        <Plus size={11} /> {creating ? '...' : 'Utwórz kartę'}
                    </button>
                )}
            </td>
            {/* Cena - inline edit (klik aby edytować, Enter/blur zapisuje, propaguje na duplikaty wariant A) */}
            <td className="px-3 py-2.5 text-sm font-mono whitespace-nowrap">
                {editPrice && !readOnly && card ? (
                    <input autoFocus value={priceVal}
                        onChange={e => setPriceVal(e.target.value)}
                        onFocus={e => e.target.select()} onMouseUp={e => e.target.select()}
                        onBlur={handlePriceBlur}
                        onKeyDown={e => { if (e.key === 'Enter') handlePriceBlur(); if (e.key === 'Escape') { setPriceVal(card?.priceNetto != null ? String(card.priceNetto) : ''); setEditPrice(false); } }}
                        placeholder="0.00"
                        className="w-24 bg-black/30 border border-blue-500/50 rounded px-2 py-0.5 text-sm text-white outline-none" />
                ) : (
                    <span onClick={() => !readOnly && card && setEditPrice(true)}
                        className={`text-green-400 ${!readOnly && card ? 'cursor-pointer hover:text-green-300' : ''}`}>
                        {card?.priceNetto != null ? `${Number(card.priceNetto).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł` : '—'}
                    </span>
                )}
            </td>
            {/* Status — edytowalny dropdown */}
            <td className="px-3 py-2.5">
                {card ? (
                    <select
                        value={card.status || 'PENDING'}
                        onChange={async e => {
                            if (!readOnly && onPatchCard) await onPatchCard(card.id, { status: e.target.value });
                        }}
                        disabled={readOnly}
                        className={`bg-transparent border border-white/10 rounded px-1.5 py-0.5 text-xs font-semibold outline-none cursor-pointer hover:bg-white/5 transition-colors ${StatusMeta?.color || 'text-gray-500'}`}
                        style={{ WebkitAppearance: 'auto' }}
                    >
                        {Object.entries(STATUS_META).map(([v, m]) => (
                            <option key={v} value={v} className="bg-gray-900 text-white font-normal">{m.label}</option>
                        ))}
                    </select>
                ) : (
                    <span className="text-sm text-gray-600">—</span>
                )}
            </td>
        </tr>
    );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

const COL_DEFS = [
    { key: 'parent',   label: 'Przedmiot projektu',     defaultW: 144 },
    { key: 'name',     label: 'Nazwa',                  defaultW: 220 },
    { key: 'techSpec', label: 'Wymagania techniczne',   defaultW: 200 },
    { key: 'qty',      label: 'Ilość',                  defaultW: 88  },
    { key: 'product',  label: 'Produkt',                defaultW: 160 },
    { key: 'price',    label: 'Cena netto',             defaultW: 112 },
    { key: 'status',   label: 'Status oferty',          defaultW: 148 },
];

export default function WbsMaterialsPanel({
    nodeId,
    versionId,
    readOnly = false,
    onWbsUpdate,
    onPatchNode,
    externalWbsNodes,
    refreshKey = 0,
    searchQuery = '',
    projectName = '',
    orderName = '',
    onExportReady,
    onExportPdfReady,
}) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');

    const [internalWbsNodes, setInternalWbsNodes] = useState([]);
    const wbsNodes = externalWbsNodes ?? internalWbsNodes;

    const [cards, setCards] = useState({});
    const [materialDb, setMaterialDb] = useState([]);
    const [offers, setOffers] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [loading, setLoading] = useState(!externalWbsNodes);

    // ─ Sorting / filtering / column widths ──────────────────────────────────
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [colFilters, setColFilters] = useState({});
    const [colWidths, setColWidths] = useState(
        () => Object.fromEntries(COL_DEFS.map(c => [c.key, c.defaultW]))
    );
    const resizeDrag = useRef(null);

    const matNodes = useMemo(() =>
        wbsNodes.filter(n => n.type === 'material' || n.type === 'equipment'),
        [wbsNodes]
    );

    const sortedFilteredNodes = useMemo(() => {
        let nodes = [...matNodes];

        const matchTokens = (text, q) =>
            q.split(/[\s/]+/).filter(Boolean).every(t => text.toLowerCase().includes(t));

        // Global search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            nodes = nodes.filter(n => {
                const c = cards[n.id];
                const parent = getParentPath(n.path);
                return (n.name || '').toLowerCase().includes(q) ||
                    (TYPE_META[n.type]?.label || '').toLowerCase().includes(q) ||
                    matchTokens(parent, q) ||
                    (c?.manufacturer || '').toLowerCase().includes(q) ||
                    (c?.model || '').toLowerCase().includes(q) ||
                    (STATUS_META[c?.status]?.label || '').toLowerCase().includes(q);
            });
        }

        // Per-column filters
        for (const [key, val] of Object.entries(colFilters)) {
            if (!val) continue;
            const q = val.toLowerCase();
            nodes = nodes.filter(n => {
                const c = cards[n.id];
                const parent = getParentPath(n.path);
                if (key === 'parent') return matchTokens(parent, q);
                if (key === 'name')   return (n.name || '').toLowerCase().includes(q);
                if (key === 'qty')    return String(n.quantity ?? '').includes(q);
                if (key === 'product') return `${c?.manufacturer || ''} ${c?.model || ''}`.toLowerCase().includes(q);
                if (key === 'price')  return String(c?.priceNetto ?? '').includes(q);
                if (key === 'techSpec') return (c?.technicalSpec || '').toLowerCase().includes(q);
                if (key === 'status') return (STATUS_META[c?.status]?.label || c?.status || '').toLowerCase().includes(q);
                return true;
            });
        }

        // Sort
        nodes.sort((a, b) => {
            const ca = cards[a.id];
            const cb = cards[b.id];
            let cmp = 0;
            if (sortConfig.key === 'parent') {
                const pa = getParentPath(a.path);
                const pb = getParentPath(b.path);
                cmp = pa.localeCompare(pb, 'pl');
            } else if (sortConfig.key === 'name') {
                cmp = (a.name || '').localeCompare(b.name || '', 'pl');
            } else if (sortConfig.key === 'qty') {
                cmp = (a.quantity ?? 1) - (b.quantity ?? 1);
            } else if (sortConfig.key === 'product') {
                const pa = `${ca?.manufacturer || ''} ${ca?.model || ''}`.trim();
                const pb = `${cb?.manufacturer || ''} ${cb?.model || ''}`.trim();
                cmp = pa.localeCompare(pb, 'pl');
            } else if (sortConfig.key === 'price') {
                cmp = (ca?.priceNetto ?? Infinity) - (cb?.priceNetto ?? Infinity);
            } else if (sortConfig.key === 'techSpec') {
                cmp = (ca?.technicalSpec || '').localeCompare(cb?.technicalSpec || '', 'pl');
            } else if (sortConfig.key === 'status') {
                cmp = (STATUS_META[ca?.status]?.label || '').localeCompare(STATUS_META[cb?.status]?.label || '', 'pl');
            }
            return sortConfig.direction === 'asc' ? cmp : -cmp;
        });

        return nodes;
    }, [matNodes, cards, sortConfig, colFilters, searchQuery]);

    // ─ Data fetching ─────────────────────────────────────────────────────────

    const fetchCards = useCallback(async () => {
        if (!nodeId) return;
        if (!externalWbsNodes) setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            let flatNodes = externalWbsNodes || [];
            if (!externalWbsNodes) {
                const wbsRes = await fetch(
                    `${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`,
                    { headers }
                );
                if (wbsRes.ok) {
                    const data = await wbsRes.json();
                    flatNodes = flattenWbsNodes(data.items || []);
                    setInternalWbsNodes(flatNodes);
                }
            }
            const reqRes = await fetch(
                `${API_URL}/material-requirements/node/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`,
                { headers }
            );
            if (reqRes.ok) {
                const reqs = await reqRes.json();
                const map = {};
                const reqById = Object.fromEntries(reqs.map(r => [r.id, r]));
                for (const r of reqs) { if (r.wbsNodeId) map[r.wbsNodeId] = r; }
                // Fallback: match via req: tag on WBS node (safer than name-matching)
                const matNodeList = flatNodes.filter(n => n.type === 'material' || n.type === 'equipment');
                for (const node of matNodeList) {
                    if (map[node.id]) continue;
                    const reqTag = (node.tags || []).find(t => typeof t === 'string' && t.startsWith('req:'));
                    if (!reqTag) continue;
                    const reqId = reqTag.slice(4);
                    const req = reqById[reqId];
                    if (req) map[node.id] = req;
                }
                setCards(map);
            }
        } catch (e) {
            console.error('[WbsMaterialsPanel] fetchCards error:', e);
        } finally {
            setLoading(false);
        }
    }, [nodeId, versionId, token, externalWbsNodes]);

    const fetchMaterialDb = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/material-requirements/all-materials`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMaterialDb(data.map(m => ({ ...m, manufacturer: m.manufacturer ? m.manufacturer.toUpperCase() : m.manufacturer })));
            }
        } catch {}
    }, [token]);

    const fetchOffers = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/offers/node/${nodeId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setOffers(await res.json());
        } catch {}
    }, [nodeId, token]);

    useEffect(() => {
        fetchCards();
        fetchMaterialDb();
        fetchOffers();
    }, [fetchCards, fetchMaterialDb, fetchOffers, refreshKey]);

    const prevExternalRef = useRef(null);
    useEffect(() => {
        if (!externalWbsNodes) return;
        if (externalWbsNodes !== prevExternalRef.current) {
            prevExternalRef.current = externalWbsNodes;
            fetchCards();
        }
    }, [externalWbsNodes, fetchCards]);

    // ─ Mutations ─────────────────────────────────────────────────────────────

    const patchWbsNode = useCallback(async (wbsNodeId, data) => {
        await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(data),
        });
        if (!externalWbsNodes) {
            setInternalWbsNodes(prev => prev.map(n => n.id === wbsNodeId ? { ...n, ...data } : n));
        }
        onPatchNode?.(wbsNodeId, data);
        onWbsUpdate?.();
    }, [onWbsUpdate, onPatchNode, externalWbsNodes]);

    const createCard = useCallback(async (node) => {
        const reqType = WBS_TYPE_TO_REQ[node.type] || 'MATERIAL';
        const res = await fetch(`${API_URL}/material-requirements`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                nodeId,
                versionId: versionId || null,
                name: node.name,
                type: reqType,
                quantity: node.quantity || 1,
                unit: node.unit || 'szt',
                wbsNodeId: node.id,
            }),
        });
        if (!res.ok) return;
        const created = await res.json();
        setCards(prev => ({ ...prev, [node.id]: created }));
        setExpandedId(node.id);
    }, [nodeId, versionId]);

    const refreshCards = useCallback(async () => {
        if (!nodeId) return;
        const res = await fetch(
            `${API_URL}/material-requirements/node/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
            const reqs = await res.json();
            const map = {};
            for (const r of reqs) { if (r.wbsNodeId) map[r.wbsNodeId] = r; }
            // Fallback: match by name
            const flatNodes = externalWbsNodes ?? internalWbsNodes;
            const matNodeList = flatNodes.filter(n => n.type === 'material' || n.type === 'equipment');
            for (const r of reqs) {
                if (r.wbsNodeId) continue;
                const reqName = (r.name || r.productName || '').toLowerCase().trim();
                if (!reqName) continue;
                const match = matNodeList.find(n =>
                    (n.name || '').toLowerCase().trim() === reqName && !map[n.id]
                );
                if (match) map[match.id] = r;
            }
            setCards(map);
            onWbsUpdate?.();
        }
    }, [nodeId, versionId, token, onWbsUpdate, externalWbsNodes, internalWbsNodes]);

    const patchCard = useCallback(async (cardId, data) => {
        await fetch(`${API_URL}/material-requirements/${cardId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(data),
        });
        await refreshCards();
    }, [refreshCards]);

    // Wariant A: ten sam materiał (po nazwie WBS węzła) w obrębie projektu = jedna cena.
    // Materials view jest już ograniczony do scope projektu (nodeId), więc dopasowanie
    // po samej nazwie jest bezpieczne. Używamy node.name (zawsze poprawna), nie card.name -
    // zdarzają się orphan requirements z pustą nazwą (auto-generated) gdzie wiersz pokazuje
    // node.name, ale card.name=''. Wcześniej te karty były pomijane przy propagacji.
    const propagatePriceNetto = useCallback(async (sourceCard, sourceWbsNode, priceNetto) => {
        if (!sourceCard?.id) return;
        const flatNodes = externalWbsNodes ?? internalWbsNodes;
        const nodeNameById = new Map((flatNodes || []).map(n => [n.id, String(n.name || '').trim().toLowerCase()]));
        const targetName = String(sourceWbsNode?.name || sourceCard.name || '').trim().toLowerCase();
        if (!targetName) {
            await fetch(`${API_URL}/material-requirements/${sourceCard.id}`, {
                method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ priceNetto }),
            });
            await refreshCards();
            return;
        }
        const matchingIds = Object.entries(cards)
            .filter(([wbsNodeId, c]) => c?.id && nodeNameById.get(wbsNodeId) === targetName)
            .map(([, c]) => c.id);
        const ids = Array.from(new Set(matchingIds.length > 0 ? matchingIds : [sourceCard.id]));
        await Promise.all(ids.map(id => fetch(`${API_URL}/material-requirements/${id}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ priceNetto }),
        })));
        await refreshCards();
    }, [cards, externalWbsNodes, internalWbsNodes, refreshCards]);

    // ─ Column resize ─────────────────────────────────────────────────────────

    const startResize = useCallback((colKey, e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = colWidths[colKey] || 100;
        resizeDrag.current = { colKey, startX, startW };

        const onMove = (ev) => {
            if (!resizeDrag.current) return;
            const dx = ev.clientX - resizeDrag.current.startX;
            const newW = Math.max(60, resizeDrag.current.startW + dx);
            setColWidths(prev => ({ ...prev, [resizeDrag.current.colKey]: newW }));
        };
        const onUp = () => {
            resizeDrag.current = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [colWidths]);

    // ─ Export ────────────────────────────────────────────────────────────────

    const exportToExcel = useCallback(async () => {
        const STATUS_LABELS_XLS = { PENDING: 'Oczekuje', PROPOSAL: 'Propozycja', CONFIRMED: 'Potwierdzone', REJECTED: 'Odrzucone', ORDERED: 'Zamówione', IN_STOCK: 'Na magazynie', ISSUED: 'Wydane' };
        const TYPE_LABELS_XLS = { material: 'Materiał', equipment: 'Sprzęt' };

        // depth-0 (gałąź WBS) jest w UI uppercase'owane przez CSS (text-transform);
        // ujednolicamy w eksporcie — pierwszy segment ścieżki idzie wielkimi literami.
        const upperFirstSegment = (path) => {
            if (!path) return '';
            const idx = path.indexOf(' › ');
            if (idx < 0) return path.toUpperCase();
            return path.slice(0, idx).toUpperCase() + path.slice(idx);
        };

        const workbook = new ExcelJS.Workbook();
        const detailsSheet = workbook.addWorksheet('Materiały');
        const aggregateSheet = workbook.addWorksheet('Zamówienie (agregacja)');

        // ── Sheet 1: pełna lista (jak wcześniej) ─────────────────────────────
        detailsSheet.columns = [
            { header: 'Typ', key: 'type', width: 12 },
            { header: 'Przedmiot projektu', key: 'parent', width: 24 },
            { header: 'Pełna ścieżka WBS', key: 'path', width: 40 },
            { header: 'Pozycja przedmiotu', key: 'name', width: 28 },
            { header: 'Ilość', key: 'qty', width: 8 },
            { header: 'Jednostka', key: 'unit', width: 10 },
            { header: 'Wymagania techniczne', key: 'tech', width: 40 },
            { header: 'Producent', key: 'manufacturer', width: 18 },
            { header: 'Model', key: 'model', width: 18 },
            { header: 'Nazwa handlowa', key: 'productName', width: 22 },
            { header: 'Cena netto', key: 'price', width: 12 },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Dostępność', key: 'availability', width: 14 },
            { header: 'Prop. producent', key: 'pManufacturer', width: 18 },
            { header: 'Prop. model', key: 'pModel', width: 18 },
            { header: 'Prop. nazwa handlowa', key: 'pProductName', width: 22 },
            { header: 'Prop. cena', key: 'pPrice', width: 12 },
            { header: 'Prop. wybrana', key: 'pSelected', width: 12 },
        ];
        const detHeader = detailsSheet.getRow(1);
        detHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        detHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

        const detailsNodes = [...matNodes].sort((a, b) => (a.path || '').localeCompare(b.path || '', 'pl', { numeric: true, sensitivity: 'base' }));
        for (const node of detailsNodes) {
            const card = cards[node.id] || null;
            const parent = getParentPath(node.path);
            const selectedProposal = (card?.proposals || []).find(p => p.isSelected);
            const allProposals = card?.proposals || [];

            detailsSheet.addRow({
                type: TYPE_LABELS_XLS[node.type] || node.type,
                parent,
                path: upperFirstSegment(node.path || ''),
                name: node.name || '',
                qty: Number(node.quantity ?? 1),
                unit: node.unit || 'szt',
                manufacturer: card?.manufacturer || '',
                model: card?.model || '',
                productName: card?.productName || '',
                price: card?.priceNetto != null ? Number(card.priceNetto) : null,
                status: STATUS_LABELS_XLS[card?.status] || (card ? (card.status || '') : ''),
                tech: card?.technicalSpec || '',
                availability: card?.availability || '',
                pManufacturer: selectedProposal?.manufacturer || '',
                pModel: selectedProposal?.model || '',
                pProductName: selectedProposal?.productName || '',
                pPrice: selectedProposal?.priceNetto != null ? Number(selectedProposal.priceNetto) : null,
                pSelected: selectedProposal ? 'TAK' : '',
            });

            for (const p of allProposals.filter(pp => !pp.isSelected)) {
                detailsSheet.addRow({
                    pManufacturer: p.manufacturer || '',
                    pModel: p.model || '',
                    pProductName: p.productName || '',
                    pPrice: p.priceNetto != null ? Number(p.priceNetto) : null,
                    pSelected: 'NIE',
                });
            }
        }
        detailsSheet.getColumn('price').numFmt = '#,##0.00';
        detailsSheet.getColumn('pPrice').numFmt = '#,##0.00';
        detailsSheet.views = [{ state: 'frozen', ySplit: 1 }];
        detailsSheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: detailsSheet.rowCount, column: detailsSheet.columnCount },
        };

        // ── Sheet 2: agregacja po nazwie + wymaganiach (dla logistyka) ───────
        const agg = new Map();
        for (const node of matNodes) {
            const card = cards[node.id] || null;
            const name = (node.name || '').trim();
            const tech = (card?.technicalSpec || '').trim();
            const unit = (node.unit || 'szt').trim();
            const type = TYPE_LABELS_XLS[node.type] || node.type || '';
            if (!name && !tech) continue;
            const key = `${type}||${name.toLowerCase()}||${tech.toLowerCase()}||${unit.toLowerCase()}`;
            const qty = Number(node.quantity) || 0;
            const status = STATUS_LABELS_XLS[card?.status] || '';
            const selectedProposal = (card?.proposals || []).find(p => p.isSelected);
            const chosen = selectedProposal || card || null;
            const product = [chosen?.manufacturer, chosen?.model].filter(Boolean).join(' / ');
            const price = chosen?.priceNetto != null ? Number(chosen.priceNetto) : null;

            if (!agg.has(key)) {
                agg.set(key, {
                    type,
                    name,
                    tech,
                    unit,
                    qty: 0,
                    positions: 0,
                    paths: [],
                    statuses: new Set(),
                    products: new Set(),
                    priceSum: 0,
                    priceCount: 0,
                });
            }
            const row = agg.get(key);
            row.qty += qty;
            row.positions += 1;
            if (node.path) row.paths.push(upperFirstSegment(node.path));
            if (status) row.statuses.add(status);
            if (product) row.products.add(product);
            if (price != null && Number.isFinite(price)) {
                row.priceSum += price * qty;
                row.priceCount += qty;
            }
        }

        aggregateSheet.columns = [
            { header: 'Lp.', key: 'idx', width: 5 },
            { header: 'Gdzie wykorzystywany', key: 'paths', width: 60 },
            { header: 'Nazwa', key: 'name', width: 32 },
            { header: 'Łączna ilość', key: 'qty', width: 14 },
            { header: 'Jednostka', key: 'unit', width: 10 },
            { header: 'Wymagania techniczne', key: 'tech', width: 48 },
            { header: 'Liczba pozycji WBS', key: 'positions', width: 14 },
            { header: 'Proponowany produkt', key: 'product', width: 28 },
            { header: 'Średnia cena netto', key: 'price', width: 16 },
            { header: 'Szac. wartość netto', key: 'value', width: 16 },
            { header: 'Statusy', key: 'statuses', width: 28 },
        ];
        const aggHeader = aggregateSheet.getRow(1);
        aggHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        aggHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

        const aggRows = [...agg.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl', { numeric: true, sensitivity: 'base' }));

        aggRows.forEach((row, i) => {
            const avgPrice = row.priceCount > 0 ? row.priceSum / row.priceCount : null;
            const value = avgPrice != null ? avgPrice * row.qty : null;
            const added = aggregateSheet.addRow({
                idx: i + 1,
                paths: row.paths.join('\n'),
                name: row.name,
                tech: row.tech,
                qty: row.qty,
                unit: row.unit,
                positions: row.positions,
                product: [...row.products].join('; '),
                price: avgPrice,
                value,
                statuses: [...row.statuses].join(', '),
            });
            added.alignment = { vertical: 'top', wrapText: true };
        });

        if (aggRows.length > 0) {
            const totalRowNum = aggRows.length + 2;
            const totalsRow = aggregateSheet.addRow({
                name: 'Razem',
                qty: { formula: `=SUM(D2:D${totalRowNum - 1})`, result: aggRows.reduce((s, r) => s + r.qty, 0) },
                positions: { formula: `=SUM(G2:G${totalRowNum - 1})`, result: aggRows.reduce((s, r) => s + r.positions, 0) },
                value: { formula: `=SUM(J2:J${totalRowNum - 1})`, result: aggRows.reduce((s, r) => s + (r.priceCount > 0 ? (r.priceSum / r.priceCount) * r.qty : 0), 0) },
            });
            totalsRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        }

        aggregateSheet.getColumn('qty').numFmt = '#,##0.##';
        aggregateSheet.getColumn('price').numFmt = '#,##0.00';
        aggregateSheet.getColumn('value').numFmt = '#,##0.00';
        aggregateSheet.views = [{ state: 'frozen', ySplit: 1 }];
        if (aggRows.length > 0) {
            aggregateSheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: aggRows.length + 1, column: aggregateSheet.columnCount },
            };
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeOrder = String(orderName || projectName || 'zamowienie').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'zamowienie';
        a.href = url; a.download = `${safeOrder}_materialy.xlsx`; a.click();
        URL.revokeObjectURL(url);
    }, [matNodes, cards, orderName, projectName]);

    const exportToPdf = useCallback(async () => {
        const cols = ['Przedmiot projektu', 'Nazwa', 'Wymagania techniczne', 'Ilość', 'Produkt', 'Zdjęcie'];

        // Pobierz obrazki z auth headerem i zakoduj do base64
        const imageBase64 = {};
        await Promise.all(sortedFilteredNodes.map(async node => {
            const card = cards[node.id];
            if (!card?.imageUrl || !card?.id) return;
            try {
                const res = await fetch(`${API_URL}/material-requirements/${card.id}/image`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const blob = await res.blob();
                const b64 = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                imageBase64[node.id] = b64;
            } catch {}
        }));

        const bodyRows = sortedFilteredNodes.map(node => {
            const card = cards[node.id] || null;
            const parent = getParentPath(node.path);
            const product = [card?.manufacturer, card?.model].filter(Boolean).join(' / ') || '—';
            const techSpec = (card?.technicalSpec || '—').replace(/\n/g, '<br>');
            const imgCell = imageBase64[node.id]
                ? `<img src="${imageBase64[node.id]}" style="max-width:80px;max-height:80px;object-fit:contain;" />`
                : '—';
            return [parent, node.name || '—', techSpec, `${node.quantity ?? 1} ${node.unit || 'szt'}`, product, imgCell];
        });

        const safeOrderPdf = String(orderName || projectName || 'zamowienie').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'zamowienie';
        const safeProjectPdf = String(projectName || '').trim().replace(/[\\/:*?"<>|]+/g, '_');
        const pdfTitle = safeProjectPdf ? `${safeProjectPdf}_${safeOrderPdf}_materialy` : `${safeOrderPdf}_materialy`;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${pdfTitle}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
  h2 { font-size: 16px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a1a2e; color: #fff; text-align: left; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  @page { size: A4 landscape; margin: 20mm 14mm; }
</style></head><body>
<h2>Pozycje materiałowe dla projektu_${safeOrderPdf}</h2>
<table>
  <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
  <tbody>${bodyRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
</table>
</body></html>`;

        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 400);
    }, [sortedFilteredNodes, cards, token]);

    // Notify parent when export functions update
    useEffect(() => { onExportReady?.(exportToExcel); }, [exportToExcel]);
    useEffect(() => { onExportPdfReady?.(exportToPdf); }, [exportToPdf]);

    // ─ Render guards ─────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (matNodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                <AlertCircle size={28} className="text-gray-600" />
                <p className="text-sm">Brak węzłów WBS typu materiał lub sprzęt.</p>
                <p className="text-xs text-gray-600">Ustaw typ wiersza na "materiał" lub "sprzęt" w Strukturze projektu.</p>
            </div>
        );
    }

    const toggleSort = (key) => setSortConfig(s =>
        s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }
    );

    return (
        <div className="flex flex-col h-full bg-slate-800/30">
            {/* Tabela */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="table-fixed w-full">
                    <colgroup>
                        <col style={{ width: 36 }} />
                        {COL_DEFS.map(c => (
                            <col key={c.key} style={{ width: colWidths[c.key] }} />
                        ))}
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                        {/* Sort row */}
                        <tr className="border-b border-white/10 bg-gray-950">
                            <th className="w-9 bg-gray-950" />
                            {COL_DEFS.map(c => (
                                <th key={c.key} className="px-3 py-2 text-left bg-gray-950 select-none relative">
                                    <button
                                        onClick={() => toggleSort(c.key)}
                                        className="inline-flex items-center gap-1 text-base font-bold uppercase tracking-widest text-white hover:text-gray-200 transition-colors w-full"
                                    >
                                        <span className="truncate">{c.label}</span>
                                        <span className={sortConfig.key === c.key ? 'text-blue-400 flex-shrink-0' : 'text-gray-600 flex-shrink-0'}>
                                            {sortConfig.key === c.key ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⬍'}
                                        </span>
                                    </button>
                                    {/* Resize handle */}
                                    <div
                                        onMouseDown={e => startResize(c.key, e)}
                                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors z-10"
                                    />
                                </th>
                            ))}
                        </tr>
                        {/* Filter row */}
                        <tr className="border-b border-white/5 bg-gray-950">
                            <th className="bg-gray-950" />
                            {COL_DEFS.map(c => (
                                <th key={c.key} className="px-2 py-1 bg-gray-950">
                                    <input
                                        value={colFilters[c.key] || ''}
                                        onChange={e => setColFilters(p => ({ ...p, [c.key]: e.target.value }))}
                                        placeholder="filtruj..."
                                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white placeholder-gray-700 outline-none focus:border-blue-500/40"
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedFilteredNodes.map(node => {
                            const card = cards[node.id] || null;
                            const isExpanded = expandedId === node.id;
                            return (
                                <React.Fragment key={node.id}>
                                    <WbsMaterialRow
                                        node={node}
                                        card={card}
                                        isExpanded={isExpanded}
                                        onPropagatePrice={propagatePriceNetto}
                                        onToggle={async () => {
                                            if (isExpanded) {
                                                setExpandedId(null);
                                            } else if (!card) {
                                                await createCard(node);
                                            } else {
                                                setExpandedId(node.id);
                                            }
                                        }}
                                        onPatchNode={patchWbsNode}
                                        onCreateCard={createCard}
                                        materialDb={materialDb}
                                        offers={offers}
                                        token={token}
                                        readOnly={readOnly}
                                        onRefresh={refreshCards}
                                        onPatchCard={patchCard}
                                    />
                                    {isExpanded && card && (
                                        <tr>
                                            <td colSpan={8} className="p-0 bg-black/20 border-b border-white/5">
                                                <ProductCard
                                                    card={card}
                                                    wbsNode={node}
                                                    token={token}
                                                    materialDb={materialDb}
                                                    offers={offers}
                                                    onRefresh={refreshCards}
                                                    onPropagatePrice={propagatePriceNetto}
                                                    readOnly={readOnly}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
