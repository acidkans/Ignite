import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ChevronRight, ChevronDown, Package, Wrench,
    CheckCircle, Clock, XCircle, Star, Trash2, AlertCircle,
    ShoppingCart, Warehouse, LogOut, Plus, Search, Sparkles,
    FileText, Link as LinkIcon,
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

// ─── ProposalsSection ─────────────────────────────────────────────────────────

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

    const addManual = async () => {
        if (!manualForm?.productName) return;
        const res = await fetch(`${API_URL}/material-requirements/${req.id}/proposals`, {
            method: 'POST', headers, body: JSON.stringify({ ...manualForm, isManual: true }),
        });
        if (res.ok) { const p = await res.json(); setProposals(prev => [...prev, p]); setManualForm(null); onRefresh(); }
    };

    return (
        <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Propozycje produktów</span>
                <button onClick={searchAI} disabled={searching}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-colors disabled:opacity-40">
                    <Sparkles size={10} /> {searching ? 'Szukam...' : 'Szukaj AI'}
                </button>
                <button onClick={() => setManualForm(manualForm ? null : { productName: '', manufacturer: '', model: '' })}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10 transition-colors">
                    <Plus size={10} /> Dodaj ręcznie
                </button>
            </div>

            {manualForm && (
                <div className="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10">
                    {['productName', 'manufacturer', 'model'].map(k => (
                        <input key={k} value={manualForm[k] || ''} onChange={e => setManualForm(p => ({ ...p, [k]: e.target.value }))}
                            placeholder={{ productName: 'Nazwa handlowa', manufacturer: 'Producent', model: 'Model' }[k]}
                            className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-600 outline-none" />
                    ))}
                    <button onClick={addManual} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs transition-colors">Dodaj</button>
                    <button onClick={() => setManualForm(null)} className="text-gray-500 hover:text-gray-300"><XCircle size={14} /></button>
                </div>
            )}

            {proposals.length === 0 && !manualForm && (
                <p className="text-[11px] text-gray-600 italic">Brak propozycji — kliknij „Szukaj AI" lub dodaj ręcznie.</p>
            )}

            {proposals.map(p => (
                <div key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded border transition-colors ${p.isSelected ? 'bg-green-500/10 border-green-500/30' : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]'}`}>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs text-white truncate">{p.productName}</div>
                        <div className="text-[10px] text-gray-400">{[p.manufacturer, p.model].filter(Boolean).join(' · ')}</div>
                        {p.matchScore != null && (
                            <div className="text-[10px] text-blue-400 mt-0.5">{Math.round(p.matchScore * 100)}% zgodności</div>
                        )}
                    </div>
                    {p.sourceUrl && (
                        <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                            <LinkIcon size={12} />
                        </a>
                    )}
                    {!p.isSelected && (
                        <button onClick={() => selectProposal(p)}
                            className="px-2 py-1 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 text-[10px] border border-green-500/20 transition-colors">
                            Wybierz
                        </button>
                    )}
                    {p.isSelected && <CheckCircle size={14} className="text-green-400 flex-shrink-0" />}
                    <button onClick={() => deleteProposal(p)} className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                        <Trash2 size={12} />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ─── ProductCard ──────────────────────────────────────────────────────────────

function ProductCard({ card, wbsNode, token, materialDb, offers, onRefresh, readOnly }) {
    const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    const [fields, setFields] = useState({
        manufacturer: card?.manufacturer || '',
        model: card?.model || '',
        productName: card?.productName || '',
        availability: card?.availability || '',
        technicalSpec: card?.technicalSpec || '',
        priceNetto: card?.priceNetto ?? '',
    });
    const [comboOpen, setComboOpen] = useState(null);

    useEffect(() => {
        setFields({
            manufacturer: card?.manufacturer || '',
            model: card?.model || '',
            productName: card?.productName || '',
            availability: card?.availability || '',
            technicalSpec: card?.technicalSpec || '',
            priceNetto: card?.priceNetto ?? '',
        });
    }, [card?.id, card?.manufacturer, card?.model, card?.productName]);

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

    const selectMaterial = useCallback(async (mat, fromField) => {
        const uiFields = {};
        const updates = {};
        if (fromField === 'manufacturer') {
            if (mat.manufacturer) { uiFields.manufacturer = mat.manufacturer; updates.manufacturer = mat.manufacturer; }
        } else if (fromField === 'model') {
            if (mat.manufacturer) { uiFields.manufacturer = mat.manufacturer; updates.manufacturer = mat.manufacturer; }
            if (mat.model) { uiFields.model = mat.model; updates.model = mat.model; }
        } else {
            updates.materialId = mat.id;
            if (mat.manufacturer) { uiFields.manufacturer = mat.manufacturer; updates.manufacturer = mat.manufacturer; }
            if (mat.model) { uiFields.model = mat.model; updates.model = mat.model; }
            if (mat.productName) { uiFields.productName = mat.productName; updates.productName = mat.productName; }
            if (mat.dataSheetUrl) { updates.dataSheetUrl = mat.dataSheetUrl; updates.dataSheetName = mat.dataSheetName || mat.productName || 'karta.pdf'; }
        }
        setFields(prev => ({ ...prev, ...uiFields }));
        setComboOpen(null);
        if (Object.keys(updates).length > 0) await patchCard(updates);
    }, [patchCard]);

    const comboFields = [
        ['manufacturer', 'Producent'],
        ['model', 'Model'],
        ['productName', 'Nazwa handlowa'],
    ];

    if (!card) return null;

    return (
        <div className="flex flex-col gap-4 p-4">
            {/* Comboboxes */}
            <div className="flex flex-wrap gap-3">
                {comboFields.map(([key, label]) => {
                    const suggestions = getFilteredSuggestions(key);
                    return (
                        <div key={key} className="relative flex-1 min-w-[160px]">
                            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">{label}</label>
                            <input
                                value={fields[key]}
                                onChange={e => setF(key, e.target.value)}
                                onFocus={() => setComboOpen(key)}
                                onBlur={() => setTimeout(() => setComboOpen(null), 150)}
                                onKeyDown={e => { if (e.key === 'Enter') { setComboOpen(null); patchCard({ [key]: fields[key] }); } }}
                                disabled={readOnly}
                                className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                                placeholder={`Wpisz ${label.toLowerCase()}...`}
                            />
                            {comboOpen === key && suggestions.length > 0 && (
                                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-gray-900 border border-white/20 rounded shadow-xl max-h-48 overflow-auto custom-scrollbar">
                                    {suggestions.map((m, i) => (
                                        <button key={i} onMouseDown={() => selectMaterial(m, key)}
                                            className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 truncate">
                                            {m[key]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Dane ofertowe */}
            <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[120px]">
                    <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Cena netto</label>
                    <input value={fields.priceNetto} onChange={e => setF('priceNetto', e.target.value)}
                        onBlur={() => { const v = parseFloat(String(fields.priceNetto).replace(',', '.')); if (!isNaN(v)) patchCard({ priceNetto: v }); }}
                        disabled={readOnly}
                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                        placeholder="0.00" />
                </div>
                <div className="flex-1 min-w-[120px]">
                    <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Dostępność</label>
                    <input value={fields.availability} onChange={e => setF('availability', e.target.value)}
                        onBlur={() => patchCard({ availability: fields.availability })}
                        disabled={readOnly}
                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                        placeholder="np. 7 dni" />
                </div>
                {card.seller && (
                    <div className="flex-1 min-w-[120px]">
                        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Sprzedawca</label>
                        <div className="px-2 py-1.5 text-xs text-gray-300">{card.seller}</div>
                    </div>
                )}
            </div>

            {/* Wymagania techniczne */}
            <div>
                <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Wymagania techniczne</label>
                <textarea value={fields.technicalSpec} onChange={e => setF('technicalSpec', e.target.value)}
                    onBlur={() => patchCard({ technicalSpec: fields.technicalSpec })}
                    disabled={readOnly} rows={3}
                    className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500/50 resize-none"
                    placeholder="Wymagania techniczne (jedno per linia)..." />
            </div>

            {/* Propozycje */}
            {!readOnly && <ProposalsSection req={card} token={token} onRefresh={onRefresh} />}
        </div>
    );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function WbsMaterialRow({ node, card, isExpanded, onToggle, onPatchNode, onCreateCard, materialDb, offers, token, readOnly, onRefresh }) {
    const meta = TYPE_META[node.type] || TYPE_META.material;
    const TypeIcon = meta.icon;
    const reqStatus = card?.status;
    const StatusMeta = STATUS_META[reqStatus];
    const StatusIcon = StatusMeta?.icon || Clock;

    const [editQty, setEditQty] = useState(false);
    const [qtyVal, setQtyVal] = useState(String(node.quantity ?? 1));

    const [creating, setCreating] = useState(false);

    const handleQtyBlur = () => {
        setEditQty(false);
        const v = parseFloat(qtyVal.replace(',', '.'));
        if (!isNaN(v) && v !== node.quantity) onPatchNode(node.id, { quantity: v });
    };

    const handleCreateCard = async () => {
        setCreating(true);
        try { await onCreateCard(node); } finally { setCreating(false); }
    };

    return (
        <tr className={`border-b border-white/[0.03] transition-colors ${isExpanded ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}>
            {/* Expand */}
            <td className="w-9 px-2 py-2.5 text-center">
                <button onClick={onToggle} className="text-gray-600 hover:text-gray-300 transition-colors">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            </td>
            {/* Typ */}
            <td className="px-3 py-2.5 w-24">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${meta.color}`}>
                    <TypeIcon size={11} /> {meta.label}
                </span>
            </td>
            {/* Przedmiot projektu */}
            <td className="px-3 py-2.5 w-36">
                <span className="text-[10px] text-gray-400 truncate block max-w-[140px]" title={node.path}>
                    {node.path ? node.path.split(' › ')[0] : '—'}
                </span>
            </td>
            {/* Nazwa */}
            <td className="px-3 py-2.5">
                <div className="text-sm text-white">{node.name}</div>
                {node.phase && <div className="text-[10px] text-gray-500 mt-0.5">{node.phase}</div>}
            </td>
            {/* Ilość */}
            <td className="px-3 py-2.5 w-24">
                {editQty && !readOnly ? (
                    <input autoFocus value={qtyVal}
                        onChange={e => setQtyVal(e.target.value)}
                        onBlur={handleQtyBlur}
                        onKeyDown={e => e.key === 'Enter' && handleQtyBlur()}
                        className="w-16 bg-black/30 border border-blue-500/50 rounded px-2 py-0.5 text-xs text-white outline-none" />
                ) : (
                    <span onClick={() => !readOnly && setEditQty(true)}
                        className={`text-sm text-gray-200 ${!readOnly ? 'cursor-pointer hover:text-white' : ''}`}>
                        {node.quantity ?? 1} <span className="text-[10px] text-gray-500">{node.unit || 'szt'}</span>
                    </span>
                )}
            </td>
            {/* Produkt */}
            <td className="px-3 py-2.5 w-40">
                {card ? (
                    <div className="text-xs">
                        {card.manufacturer && <div className="text-gray-300 truncate">{card.manufacturer}</div>}
                        {card.model && <div className="text-gray-500 truncate text-[10px]">{card.model}</div>}
                        {!card.manufacturer && !card.model && <span className="text-gray-600 italic">Brak produktu</span>}
                    </div>
                ) : (
                    <button onClick={handleCreateCard} disabled={creating || readOnly}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-white/5 hover:bg-white/10 text-gray-500 hover:text-gray-300 border border-white/10 transition-colors disabled:opacity-40">
                        <Plus size={10} /> {creating ? '...' : 'Utwórz kartę'}
                    </button>
                )}
            </td>
            {/* Cena */}
            <td className="px-3 py-2.5 w-28 text-xs text-gray-300">
                {card?.priceNetto != null ? `${Number(card.priceNetto).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł` : '—'}
            </td>
            {/* Status (z karty produktowej req) */}
            <td className="px-3 py-2.5 w-36">
                {card ? (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${StatusMeta?.color || 'text-gray-500'}`}>
                        <StatusIcon size={11} />
                        {StatusMeta?.label || reqStatus || '—'}
                    </span>
                ) : (
                    <span className="text-[10px] text-gray-600">—</span>
                )}
            </td>
        </tr>
    );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function WbsMaterialsPanel({
    nodeId,
    versionId,
    readOnly = false,
    onWbsUpdate,
    onPatchNode,       // (id, data) => void — optymistyczna aktualizacja w rodzicu
    externalWbsNodes,  // flat array z wbsData rodzica — jeśli podany, panel nie fetchuje własnych
    refreshKey = 0,
}) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');

    // Gdy rodzic przekazuje wbsNodes — używamy ich bez własnego fetcha
    const [internalWbsNodes, setInternalWbsNodes] = useState([]);
    const wbsNodes = externalWbsNodes ?? internalWbsNodes;

    const [cards, setCards] = useState({}); // Map<wbsNodeId, MaterialRequirement>
    const [materialDb, setMaterialDb] = useState([]);
    const [offers, setOffers] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [loading, setLoading] = useState(!externalWbsNodes);

    const matNodes = useMemo(() =>
        wbsNodes.filter(n => n.type === 'material' || n.type === 'equipment'),
        [wbsNodes]
    );

    const fetchCards = useCallback(async () => {
        if (!nodeId) return;
        if (!externalWbsNodes) setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            // WBS nodes — tylko gdy nie przekazano z zewnątrz
            if (!externalWbsNodes) {
                const wbsRes = await fetch(
                    `${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`,
                    { headers }
                );
                if (wbsRes.ok) {
                    const data = await wbsRes.json();
                    setInternalWbsNodes(flattenWbsNodes(data.items || []));
                }
            }
            // Karty produktowe
            const reqRes = await fetch(
                `${API_URL}/material-requirements/node/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`,
                { headers }
            );
            if (reqRes.ok) {
                const reqs = await reqRes.json();
                const map = {};
                for (const r of reqs) { if (r.wbsNodeId) map[r.wbsNodeId] = r; }
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
                setMaterialDb(data.map(m => ({ ...m, manufacturer: normalizeName(m.manufacturer) })));
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

    // Gdy externalWbsNodes zmienia się (rodzic zaktualizował wbsData) — odśwież karty
    const prevExternalRef = useRef(null);
    useEffect(() => {
        if (!externalWbsNodes) return;
        if (externalWbsNodes !== prevExternalRef.current) {
            prevExternalRef.current = externalWbsNodes;
            fetchCards();
        }
    }, [externalWbsNodes, fetchCards]);

    const patchWbsNode = useCallback(async (wbsNodeId, data) => {
        await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(data),
        });
        // Optimistyczna aktualizacja lokalnych (gdy bez rodzica)
        if (!externalWbsNodes) {
            setInternalWbsNodes(prev => prev.map(n => n.id === wbsNodeId ? { ...n, ...data } : n));
        }
        onPatchNode?.(wbsNodeId, data); // informuj rodzica
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
            setCards(map);
            onWbsUpdate?.();
        }
    }, [nodeId, versionId, token, onWbsUpdate]);

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

    return (
        <div className="flex flex-col h-full">
            {/* Nagłówek z licznikami */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-white/5 flex-shrink-0">
                <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                    Pozycje materiałowe z WBS
                </span>
                <span className="text-[10px] text-gray-600">
                    {matNodes.filter(n => cards[n.id]).length}/{matNodes.length} z kartą produktową
                </span>
            </div>

            {/* Tabela */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full">
                    <thead className="sticky top-0 z-10">
                        <tr className="border-b border-white/10 bg-gray-950">
                            <th className="w-9 px-2 py-2" />
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-24">Typ</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-36">Przedmiot projektu</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Nazwa</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-24">Ilość</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-40">Produkt</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-28">Cena netto</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-36">Status oferty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matNodes.map(node => {
                            const card = cards[node.id] || null;
                            const isExpanded = expandedId === node.id;
                            return (
                                <React.Fragment key={node.id}>
                                    <WbsMaterialRow
                                        node={node}
                                        card={card}
                                        isExpanded={isExpanded}
                                        onToggle={() => setExpandedId(prev => prev === node.id ? null : node.id)}
                                        onPatchNode={patchWbsNode}
                                        onCreateCard={createCard}
                                        materialDb={materialDb}
                                        offers={offers}
                                        token={token}
                                        readOnly={readOnly}
                                        onRefresh={refreshCards}
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
                                                    readOnly={readOnly}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                    {isExpanded && !card && (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-3 bg-black/20 border-b border-white/5 text-xs text-gray-500 italic">
                                                Kliknij „Utwórz kartę" aby dodać dane produktowe dla tego węzła.
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
