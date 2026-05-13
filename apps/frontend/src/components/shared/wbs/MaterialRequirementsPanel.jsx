import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import {
    ChevronRight, ChevronDown, Plus, Package, Wrench,
    CheckCircle, Clock, XCircle, Star, Trash2, AlertCircle,
    ShoppingCart, Warehouse, LogOut, Lock, X, Filter, GitBranch,
    FileText, Search, Sparkles, Link as LinkIcon,
} from 'lucide-react';
import { API_URL } from '../../../config';
import { UNIT_OPTIONS } from './wbsConstants';

// ─── Meta ────────────────────────────────────────────────────────────────────

const TYPE_META = {
    DEVICE:   { label: 'Sprzęt',    icon: Package, color: 'text-blue-300' },
    MATERIAL: { label: 'Materiał',   icon: Wrench,  color: 'text-amber-300' },
    CABLE:    { label: 'Kabel',      icon: Wrench,  color: 'text-orange-300' },
    SOFTWARE: { label: 'Software',   icon: Package, color: 'text-violet-300' },
    SERVICE:  { label: 'Usługa',     icon: Wrench,  color: 'text-pink-300' },
};

const STATUS_META = {
    PENDING:   { label: 'Oczekuje',     icon: Clock,        color: 'text-amber-400' },
    PROPOSAL:  { label: 'Propozycja',   icon: Star,         color: 'text-blue-400' },
    CONFIRMED: { label: 'Potwierdzone', icon: CheckCircle,  color: 'text-green-400' },
    REJECTED:  { label: 'Odrzucone',    icon: XCircle,      color: 'text-red-400' },
    ORDERED:   { label: 'Zamówione',    icon: ShoppingCart,  color: 'text-purple-400' },
    IN_STOCK:  { label: 'Na magazynie', icon: Warehouse,     color: 'text-cyan-400' },
    ISSUED:    { label: 'Wydane',       icon: LogOut,        color: 'text-emerald-400' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize: "DAHUA" → "Dahua", "dahua" → "Dahua" */
function normalizeName(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function parseWbsNodeIds(r) {
    // wbsNodeIds is a JSON string array, or wbsNodeId is a single string,
    // lub wbsNodeAllocations zawiera klucze z ID węzłów (fallback)
    try {
        if (r.wbsNodeIds) {
            const ids = JSON.parse(r.wbsNodeIds);
            if (Array.isArray(ids) && ids.length > 0) return ids;
        }
    } catch {}
    if (r.wbsNodeId) return [r.wbsNodeId];
    try {
        if (r.wbsNodeAllocations) {
            const alloc = JSON.parse(r.wbsNodeAllocations);
            const keys = Object.keys(alloc || {}).filter(k => k && parseFloat(alloc[k]) > 0);
            if (keys.length > 0) return keys;
        }
    } catch {}
    return [];
}

// ─── Komponent ────────────────────────────────────────────────────────────────

const MaterialRequirementsPanel = forwardRef(function MaterialRequirementsPanel({
    nodeId,
    versionId,
    readOnly = false,
    isEmbedded = false,
    refreshKey = 0,
    onWbsUpdate = null,
    onMaterialStatusChange = null,
    onMaterialQtyChange = null,
    externalRequirements = null,
    externalWbsNodes = null,
    requirementsQtyByNode = null,
}, ref) {
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

    // ─── State ──────────────────────────────────────────────────────────────
    const [lists, setLists] = useState([]);
    const [activeListId, setActiveListId] = useState(null);
    const [requirements, setRequirements] = useState([]);
    const [localOverrides, setLocalOverrides] = useState({});
    const [localDeleted, setLocalDeleted] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [wbsNodes, setWbsNodes] = useState([]);
    const [activeTypes, setActiveTypes] = useState(['MATERIAL', 'DEVICE']);
    const [materialDb, setMaterialDb] = useState([]);
    const [offers, setOffers] = useState([]);

    // Ref do unikania stale closures
    const reqRef = useRef(requirements);
    reqRef.current = requirements;

    // ─── WBS level map ──────────────────────────────────────────────────────
    const wbsMap = useMemo(() => {
        const map = {};
        for (const n of wbsNodes) map[n.id] = n;
        return map;
    }, [wbsNodes]);

    const wbsLevelMap = useMemo(() => {
        const levels = {};
        for (const n of wbsNodes) levels[n.id] = n.depth ?? 0;
        return levels;
    }, [wbsNodes]);

    // ─── Filtered requirements ──────────────────────────────────────────────
    // Etap 1: tylko filtr WBS (podstawa liczników w przyciskach)
    const wbsFiltered = useMemo(() => {
        const base = externalRequirements || requirements;
        const withOverrides = Object.keys(localOverrides).length > 0
            ? base.map(r => localOverrides[r.id] ? { ...r, ...localOverrides[r.id] } : r)
            : base;
        const source = localDeleted.size > 0
            ? withOverrides.filter(r => !localDeleted.has(r.id))
            : withOverrides;
        const validIds = new Set((externalWbsNodes || wbsNodes).map(n => n.id));
        return source.filter(r => {
            if (validIds.size === 0) {
                let allocIds = [];
                try { allocIds = Object.keys(JSON.parse(r.wbsNodeAllocations || '{}')).filter(k => parseFloat(JSON.parse(r.wbsNodeAllocations)[k]) > 0); } catch {}
                return allocIds.length > 0 || !!r.wbsNodeId;
            }
            const ids = parseWbsNodeIds(r);
            let allocIds = [];
            try {
                const alloc = r.wbsNodeAllocations ? JSON.parse(r.wbsNodeAllocations) : {};
                allocIds = Object.keys(alloc || {}).filter(k => parseFloat(alloc[k]) > 0);
            } catch {}
            const linked = [...ids, ...allocIds, r.wbsNodeId].filter(Boolean);
            return linked.some(id => validIds.has(id));
        });
    }, [externalRequirements, externalWbsNodes, requirements, wbsNodes]);

    // Etap 2: dodatkowo filtr typów (to co widać w tabeli)
    const filtered = useMemo(() =>
        wbsFiltered.filter(r => activeTypes.includes(r.type)),
    [wbsFiltered, activeTypes]);

    // ─── Fetch ──────────────────────────────────────────────────────────────

    const fetchLists = useCallback(async () => {
        const res = await fetch(`${API_URL}/material-requirements/lists/node/${nodeId}`, { headers });
        if (!res.ok) return [];
        return res.json();
    }, [nodeId]);

    const fetchRequirements = useCallback(async (listId) => {
        if (!listId) return;
        setLoading(true);
        try {
            const url = `${API_URL}/material-requirements/node/${nodeId}?listId=${listId}${versionId ? `&versionId=${versionId}` : ''}`;
            const res = await fetch(url, { headers });
            if (res.ok) {
                const data = await res.json();
                setRequirements(data);
            }
        } catch (err) {
            console.error('[Mat3] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [nodeId, versionId]);

    const fetchWbsNodes = useCallback(async () => {
        try {
            const url = `${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`;
            const res = await fetch(url, { headers });
            if (res.ok) {
                const data = await res.json();
                setWbsNodes(data.items || []);
            }
        } catch (err) {
            console.error('[Mat3] wbs fetch error:', err);
        }
    }, [nodeId, versionId]);

    const fetchMaterialDb = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/material-requirements/all-materials`, { headers });
            if (res.ok) {
                const data = await res.json();
                setMaterialDb(data.map(m => ({ ...m, manufacturer: m.manufacturer ? m.manufacturer.toUpperCase() : m.manufacturer })));
            }
        } catch {}
    }, []);

    const fetchOffers = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/offers/node/${nodeId}`, { headers });
            if (res.ok) setOffers(await res.json());
        } catch {}
    }, [nodeId]);

    // ─── Init ───────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!nodeId) return;
        let cancelled = false;
        (async () => {
            // Fetch WBS tree, material DB and offers in parallel with lists
            fetchWbsNodes();
            fetchMaterialDb();
            fetchOffers();
            let data = await fetchLists();
            if (cancelled) return;
            if (data.length === 0) {
                const res = await fetch(`${API_URL}/material-requirements/lists/node/${nodeId}/default`, {
                    method: 'POST', headers,
                });
                if (res.ok) {
                    const created = await res.json();
                    data = [created];
                }
            }
            if (cancelled) return;
            setLists(data);
            const last = data[data.length - 1];
            if (last) {
                setActiveListId(last.id);
                await fetchRequirements(last.id);
            }
        })();
        return () => { cancelled = true; };
    }, [nodeId, versionId]);

    // Refresh z parenta
    useEffect(() => {
        if (refreshKey > 0 && activeListId) {
            fetchRequirements(activeListId);
            fetchWbsNodes();
        }
    }, [refreshKey, activeListId, fetchRequirements, fetchWbsNodes]);

    // ─── Patch ──────────────────────────────────────────────────────────────

    const patchItem = useCallback(async (id, data) => {
        try {
            const res = await fetch(`${API_URL}/material-requirements/${id}`, {
                method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(data),
            });
            if (res.ok) {
                const updated = await res.json();
                setRequirements(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
                setLocalOverrides(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...updated } }));
                if ('status' in data) onMaterialStatusChange?.(id, data.status);
                if ('quantity' in data) onMaterialQtyChange?.(updated);
                if ('priceNetto' in data || 'status' in data || 'quantity' in data || 'unit' in data) onWbsUpdate?.();
            }
        } catch (err) {
            console.error('[Mat3] patch error:', err);
        }
    }, [onWbsUpdate, onMaterialStatusChange]);

    const deleteItem = useCallback(async (id) => {
        try {
            const res = await fetch(`${API_URL}/material-requirements/${id}`, { method: 'DELETE', headers });
            if (res.ok) {
                setRequirements(prev => prev.filter(r => r.id !== id));
                setLocalDeleted(prev => new Set([...prev, id]));
                setExpandedId(prev => prev === id ? null : prev);
            }
        } catch (err) {
            console.error('[Mat3] delete error:', err);
        }
    }, []);

    // ─── Lista tabs ─────────────────────────────────────────────────────────

    const switchList = (listId) => {
        setActiveListId(listId);
        setExpandedId(null);
        fetchRequirements(listId);
    };

    const activeList = lists.find(l => l.id === activeListId) || null;
    const isLocked = (activeList?.isLocked ?? false) || readOnly;

    // ─── Render ─────────────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({}), []);

    return (
        <div className={`flex flex-col ${isEmbedded ? 'h-full bg-transparent' : 'glass-panel rounded-2xl border border-white/5 bg-white/[0.02] flex-1 min-h-0'} overflow-hidden`}>

            {/* Tabs list */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5 overflow-x-auto flex-shrink-0">
                {lists.map(l => (
                    <button key={l.id} onClick={() => switchList(l.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${l.id === activeListId ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        {l.isLocked && <Lock size={9} className="inline mr-1" />}
                        v{l.version} · {l.name}
                    </button>
                ))}
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 flex-shrink-0">
                <Filter size={12} className="text-gray-500" />
                {Object.entries(TYPE_META).map(([key, meta]) => {
                    const count = wbsFiltered.filter(r => r.type === key).length;
                    const active = activeTypes.includes(key);
                    return (
                        <button key={key} onClick={() => setActiveTypes(prev =>
                            prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]
                        )}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${active ? `${meta.color} bg-white/[0.06] border border-white/10` : 'text-gray-600 hover:text-gray-400'}`}>
                            <meta.icon size={10} />
                            {meta.label}
                            {count > 0 && <span className="ml-0.5 opacity-60">({count})</span>}
                        </button>
                    );
                })}
                <span className="ml-auto text-[10px] text-gray-600">
                    {filtered.length}/{wbsFiltered.length}
                </span>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                    <AlertCircle size={28} className="text-gray-600" />
                    <p className="text-sm">{requirements.length === 0 ? 'Brak wymagań materiałowych' : 'Brak wymagań dla wybranych filtrów'}</p>
                </div>
            ) : (
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full">
                        <thead className="sticky top-0 z-10">
                            <tr className="border-b border-white/10 bg-gray-950">
                                <th className="w-9 px-2 py-2" />
                                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-24">Typ</th>
                                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Nazwa</th>
                                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-32">Gałąź WBS</th>
                                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-20">Ilość</th>
                                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-28">Cena netto</th>
                                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-36">Produkt</th>
                                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-gray-500 font-semibold w-32">Status</th>
                                {!isLocked && <th className="w-10" />}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(r => (
                                <React.Fragment key={r.id}>
                                    <Row
                                        r={r}
                                        isExpanded={expandedId === r.id}
                                        onToggleExpand={() => setExpandedId(prev => prev === r.id ? null : r.id)}
                                        onPatch={patchItem}
                                        onDelete={deleteItem}
                                        isLocked={isLocked}
                                        wbsMap={wbsMap}
                                    />
                                    {expandedId === r.id && (
                                        <tr><td colSpan={isLocked ? 8 : 9} className="p-0 bg-black/20 border-b border-white/5">
                                            <ExpandedDetail r={r} token={token} onRefresh={() => fetchRequirements(activeListId)} onPatch={patchItem} materialDb={materialDb} offers={offers} isLocked={isLocked} />
                                        </td></tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
});

// ─── Row ─────────────────────────────────────────────────────────────────────

function Row({ r, isExpanded, onToggleExpand, onPatch, onDelete, isLocked, wbsMap }) {
    const TypeIcon = TYPE_META[r.type]?.icon || Package;
    const StatusIcon = STATUS_META[r.status]?.icon || Clock;

    // Resolve WBS branch names
    const nodeIds = parseWbsNodeIds(r);
    const branchNames = nodeIds.map(id => {
        const node = wbsMap?.[id];
        const parent = node?.parentId ? wbsMap?.[node.parentId] : null;
        return parent?.name || node?.name;
    }).filter(Boolean);

    // Policz aktywne alokacje (wbsNodeAllocations z quantity > 0).
    // Gdy > 1 — pole "Ilość" w głównym wierszu jest zablokowane (edycja per gałąź w ExpandedDetail).
    let allocCount = 0;
    try {
        const alloc = r.wbsNodeAllocations ? JSON.parse(r.wbsNodeAllocations) : {};
        allocCount = Object.values(alloc).filter(v => parseFloat(v) > 0).length;
    } catch {}
    const qtyLocked = isLocked || allocCount > 1;

    return (
        <tr className={`border-b border-white/[0.03] transition-colors ${isExpanded ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}>
            {/* Expand */}
            <td className="px-2 py-1">
                <button onClick={onToggleExpand} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            </td>

            {/* Typ */}
            <td className="px-3 py-1">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${TYPE_META[r.type]?.color || 'text-gray-400'}`}>
                    <TypeIcon size={12} />
                    {TYPE_META[r.type]?.label || r.type}
                </span>
            </td>

            {/* Nazwa */}
            <td className="px-3 py-1">
                <span className="text-white text-sm font-medium">{r.name}</span>
            </td>

            {/* Gałąź WBS */}
            <td className="px-3 py-1">
                {branchNames.length > 0 ? (
                    <div className="flex flex-wrap gap-0.5">
                        {branchNames.map((name, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5 text-[10px] text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">
                                <GitBranch size={8} />
                                {name}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-[10px] text-gray-600">—</span>
                )}
            </td>

            {/* Ilość */}
            <td className="px-3 py-1">
                <div className="flex items-center gap-1">
                    {qtyLocked ? (
                        <span
                            className="text-sm text-gray-300 font-mono"
                            title={allocCount > 1 ? `Suma z ${allocCount} gałęzi WBS — edytuj per gałąź w rozwinięciu` : undefined}
                        >
                            {r.quantity}
                            {allocCount > 1 && <Lock size={9} className="inline ml-1 text-gray-500 -mt-0.5" />}
                        </span>
                    ) : (
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={r.quantity ?? ''}
                            onChange={e => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v) && v >= 0) onPatch(r.id, { quantity: v });
                            }}
                            className="w-16 bg-transparent border-b border-white/20 text-sm text-gray-300 font-mono focus:outline-none focus:border-blue-400 text-right"
                        />
                    )}
                    {isLocked ? (
                        <span className="text-xs text-gray-400 font-mono">{r.unit || 'sztuki'}</span>
                    ) : (
                        <select value={r.unit || ''} onChange={e => onPatch(r.id, { unit: e.target.value || null })}
                            className="bg-transparent border-none text-xs text-gray-400 font-mono focus:outline-none cursor-pointer hover:text-white">
                            <option value="" className="bg-gray-900">—</option>
                            {UNIT_OPTIONS.map(u => <option key={u} value={u} className="bg-gray-900">{u}</option>)}
                        </select>
                    )}
                </div>
            </td>

            {/* Cena */}
            <td className="px-3 py-1">
                {r.priceNetto ? (
                    <span className="text-sm text-green-400 font-mono">{Number(r.priceNetto).toFixed(2)} zł</span>
                ) : (
                    <span className="text-xs text-gray-600">—</span>
                )}
            </td>

            {/* Produkt */}
            <td className="px-3 py-1">
                {r.manufacturer || r.model ? (
                    <div className="text-xs leading-tight">
                        <span className="text-gray-300">{r.manufacturer}</span>
                        {r.model && <span className="text-gray-500 ml-1">{r.model}</span>}
                    </div>
                ) : (
                    <span className="text-xs text-gray-600">—</span>
                )}
            </td>

            {/* Status */}
            <td className="px-3 py-1">
                {isLocked ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${STATUS_META[r.status]?.color || ''}`}>
                        <StatusIcon size={11} />
                        {STATUS_META[r.status]?.label || r.status}
                    </span>
                ) : (
                    <select
                        value={r.status}
                        onChange={e => onPatch(r.id, { status: e.target.value })}
                        className={`w-full border rounded px-2 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer transition-colors ${STATUS_META[r.status]?.color || ''} bg-transparent border-current/20`}
                    >
                        {Object.entries(STATUS_META).map(([k, v]) => (
                            <option key={k} value={k} className="bg-gray-900 text-white">{v.label}</option>
                        ))}
                    </select>
                )}
            </td>

            {/* Delete */}
            {!isLocked && (
                <td className="px-2 py-1">
                    <button onClick={() => onDelete(r.id)} className="w-6 h-6 flex items-center justify-center text-red-800 hover:text-red-400">
                        <Trash2 size={13} />
                    </button>
                </td>
            )}
        </tr>
    );
}

// ─── ExpandedDetail ──────────────────────────────────────────────────────────

function ExpandedDetail({ r, token, onRefresh, onPatch, materialDb, offers, isLocked }) {
    const headers = { Authorization: `Bearer ${token}` };
    const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
    const readOnly = isLocked;

    // Local editable fields
    const [fields, setFields] = useState({
        manufacturer: r.manufacturer || '',
        model: r.model || '',
        productName: r.productName || '',
        availability: r.availability || '',
        technicalSpec: r.technicalSpec || '',
        priceNetto: r.priceNetto ?? '',
    });

    // Sync z zewnętrzną zmianą r (np. edyt z budżetu)
    useEffect(() => {
        setFields({
            manufacturer: r.manufacturer || '',
            model: r.model || '',
            productName: r.productName || '',
            availability: r.availability || '',
            technicalSpec: r.technicalSpec || '',
            priceNetto: r.priceNetto ?? '',
        });
    }, [r.id, r.manufacturer, r.model, r.productName, r.availability, r.technicalSpec, r.priceNetto]);
    const [comboOpen, setComboOpen] = useState(null);
    const [selectedOfferId, setSelectedOfferId] = useState(null);
    const [selectedPositionIdx, setSelectedPositionIdx] = useState(null);

    const setF = (k, v) => setFields(prev => ({ ...prev, [k]: v }));

    const patchFields = async (data) => {
        await onPatch(r.id, data);
    };

    // ─── Cross-filtering comboboxes ─────────────────────────────────────────
    const ciEq = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

    const comboFields = [
        ['manufacturer', 'Producent'],
        ['model', 'Model'],
        ['productName', 'Nazwa handlowa'],
    ];

    const getFilteredSuggestions = (fieldKey) => {
        const otherFields = ['manufacturer', 'model', 'productName'].filter(f => f !== fieldKey);
        let baseDb = materialDb;
        for (const f of otherFields) {
            if (fields[f]) baseDb = baseDb.filter(m => ciEq(m[f], fields[f]));
        }
        const typed = (fields[fieldKey] || '').toLowerCase();
        const filtered = baseDb.filter(m => {
            const v = m[fieldKey] || '';
            if (!v) return false;
            return typed ? v.toLowerCase().includes(typed) : true;
        });
        const seen = new Set();
        return filtered.filter(m => {
            const v = (m[fieldKey] || '').toLowerCase();
            return !seen.has(v) && seen.add(v);
        }).sort((a, b) => (a[fieldKey] || '').localeCompare(b[fieldKey] || ''));
    };

    const selectMaterial = async (mat, fromField) => {
        const uiFields = {};
        const updates = {};

        // Producent → only set manufacturer (let user pick model next)
        // Model → set manufacturer + model
        // productName → set all three + materialId
        if (fromField === 'manufacturer') {
            if (mat.manufacturer) { uiFields.manufacturer = mat.manufacturer; updates.manufacturer = mat.manufacturer; }
        } else if (fromField === 'model') {
            if (mat.manufacturer) { uiFields.manufacturer = mat.manufacturer; updates.manufacturer = mat.manufacturer; }
            if (mat.model) { uiFields.model = mat.model; updates.model = mat.model; }
        } else {
            // productName — full link
            updates.materialId = mat.id;
            if (mat.manufacturer) { uiFields.manufacturer = mat.manufacturer; updates.manufacturer = mat.manufacturer; }
            if (mat.model) { uiFields.model = mat.model; updates.model = mat.model; }
            if (mat.productName) { uiFields.productName = mat.productName; updates.productName = mat.productName; }
            if (mat.dataSheetUrl) {
                updates.dataSheetUrl = mat.dataSheetUrl;
                updates.dataSheetName = mat.dataSheetName || mat.productName || 'karta_katalogowa.pdf';
            }
        }

        setFields(prev => ({ ...prev, ...uiFields }));
        setComboOpen(null);
        if (Object.keys(updates).length > 0) await patchFields(updates);
    };

    // ─── Offers ─────────────────────────────────────────────────────────────
    // Flatten all offer positions with offer metadata
    const allOfferPositions = useMemo(() => {
        const result = [];
        for (const offer of offers) {
            const positions = offer.positions || [];
            positions.forEach((pos, idx) => {
                result.push({
                    ...pos,
                    _offerId: offer.id,
                    _offerFileName: offer.fileName,
                    _posIdx: idx,
                });
            });
        }
        return result;
    }, [offers]);

    const selectOfferPosition = async (pos) => {
        const offer = offers.find(o => o.id === pos._offerId);
        setSelectedOfferId(pos._offerId);
        setSelectedPositionIdx(pos._posIdx);
        const updates = {
            offerNumber: offer?.fileName || '',
            seller: offer?.createdBy || '',
            priceNetto: pos.priceNetto ?? null,
        };
        if (pos.manufacturer) updates.manufacturer = normalizeName(pos.manufacturer);
        if (pos.model) updates.model = pos.model;

        setFields(prev => ({
            ...prev,
            manufacturer: normalizeName(pos.manufacturer) || prev.manufacturer,
            model: pos.model || prev.model,
            priceNetto: pos.priceNetto ?? prev.priceNetto,
        }));

        await patchFields(updates);
    };

    // ─── Technical requirements (newline = separate requirement) ─────────────
    const techRequirements = useMemo(() => {
        return (fields.technicalSpec || '').split(/\n/).map(s => s.trim()).filter(s => s.length > 2);
    }, [fields.technicalSpec]);

    const saveTechSpec = async (newSpec) => {
        setF('technicalSpec', newSpec);
        await patchFields({ technicalSpec: newSpec || null });
    };

    // ─── Input class ────────────────────────────────────────────────────────
    const ic = 'w-full bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500 transition-colors';

    return (
        <div className="px-4 py-3 space-y-3">
            {/* Row 1: Producent, Model, Nazwa handlowa — comboboxes */}
            <div className="grid grid-cols-3 gap-3">
                {comboFields.map(([k, lbl]) => {
                    const suggestions = getFilteredSuggestions(k);
                    return (
                        <div key={k} className="relative">
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">{lbl}</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={fields[k]}
                                    onChange={e => { setF(k, e.target.value); setComboOpen(k); }}
                                    onFocus={() => setComboOpen(k)}
                                    onBlur={() => {
                                        setTimeout(() => setComboOpen(prev => prev === k ? null : prev), 200);
                                        let val = fields[k];
                                        // Normalize manufacturer name on blur
                                        if (k === 'manufacturer' && val) {
                                            val = normalizeName(val);
                                            setF(k, val);
                                        }
                                        if (val !== (r[k] ?? '')) patchFields({ [k]: val || null });
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Escape') setComboOpen(null);
                                        if (e.key === 'Enter' && comboOpen === k && suggestions.length > 0) {
                                            e.preventDefault();
                                            selectMaterial(suggestions[0], k);
                                        }
                                    }}
                                    disabled={readOnly}
                                    placeholder="— wpisz lub wybierz —"
                                    className={ic}
                                    autoComplete="off"
                                />
                                <Search size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600" />
                            </div>
                            {comboOpen === k && suggestions.length > 0 && !readOnly && (
                                <div className="absolute z-[300] top-full left-0 w-full bg-gray-900 border border-white/15 rounded-lg mt-0.5 max-h-48 overflow-y-auto shadow-2xl">
                                    {suggestions.map(mat => (
                                        <button key={mat.id} onMouseDown={e => { e.preventDefault(); selectMaterial(mat, k); }}
                                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 text-white truncate border-b border-white/5 last:border-0">
                                            {mat[k]}
                                            {k === 'manufacturer' && mat.model && <span className="text-gray-500 ml-1">· {mat.model}</span>}
                                            {k === 'model' && mat.manufacturer && <span className="text-gray-500 ml-1">· {mat.manufacturer}</span>}
                                            {k === 'productName' && mat.model && <span className="text-gray-500 ml-1">· {mat.model}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Row 2: Nr oferty, Sprzedawca, Dostępność, Cena netto */}
            <div className="grid grid-cols-4 gap-3">
                <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Nr oferty</label>
                    <p className="text-white text-xs bg-black/20 rounded px-2.5 py-1.5 border border-white/5 min-h-[30px]">
                        {r.offerNumber || '—'}
                    </p>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Sprzedawca</label>
                    <p className="text-white text-xs bg-black/20 rounded px-2.5 py-1.5 border border-white/5 min-h-[30px]">
                        {r.seller || '—'}
                    </p>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Dostępność</label>
                    <input
                        type="text"
                        value={fields.availability}
                        onChange={e => setF('availability', e.target.value)}
                        onBlur={e => {
                            if (e.target.value !== (r.availability ?? '')) patchFields({ availability: e.target.value || null });
                        }}
                        disabled={readOnly}
                        placeholder="np. 2-3 tyg."
                        className={ic}
                    />
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Cena netto</label>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.01"
                            value={fields.priceNetto}
                            onChange={e => setF('priceNetto', e.target.value)}
                            onBlur={e => {
                                const val = e.target.value ? parseFloat(e.target.value) : null;
                                if (val !== (r.priceNetto ?? null)) patchFields({ priceNetto: val });
                            }}
                            disabled={readOnly}
                            placeholder="0.00"
                            className={`${ic} pr-8`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]">zł</span>
                    </div>
                </div>
            </div>

            {/* Row 3: Pozycja z oferty */}
            {allOfferPositions.length > 0 && (
                <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">
                        <FileText size={10} className="inline mr-1" />
                        Pozycja z oferty ({allOfferPositions.length} pozycji w {offers.length} ofertach)
                    </label>
                    <div className="max-h-36 overflow-y-auto bg-black/20 rounded border border-white/5">
                        {offers.map(offer => (
                            <div key={offer.id}>
                                <div className="px-2 py-1 text-[10px] text-gray-500 bg-white/[0.02] border-b border-white/5 font-semibold uppercase tracking-wider">
                                    {offer.fileName}
                                </div>
                                {(offer.positions || []).map((pos, idx) => {
                                    const isSelected = selectedOfferId === offer.id && selectedPositionIdx === idx;
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => !readOnly && selectOfferPosition({ ...pos, _offerId: offer.id, _posIdx: idx })}
                                            disabled={readOnly}
                                            className={`w-full text-left px-3 py-1.5 text-xs border-b border-white/[0.03] transition-colors flex items-center gap-3 ${isSelected ? 'bg-green-500/10 border-green-500/20' : 'hover:bg-white/[0.04]'} ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                                        >
                                            <span className="text-gray-600 w-5 text-right font-mono">{pos.lp || idx + 1}.</span>
                                            <span className="text-white flex-1 truncate">{pos.description}</span>
                                            {pos.manufacturer && <span className="text-gray-500 text-[10px]">{pos.manufacturer}</span>}
                                            <span className="text-gray-400 font-mono w-14 text-right">{pos.quantity} {pos.unit || 'sztuki'}</span>
                                            <span className="text-green-400 font-mono w-20 text-right">{pos.priceNetto ? `${Number(pos.priceNetto).toFixed(2)} zł` : '—'}</span>
                                            {isSelected && <Star size={10} className="text-green-400 fill-green-400 shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Row 3b: Propozycje AI */}
            {!readOnly && (
                <ProposalsSection req={r} token={token} onRefresh={onRefresh} onPatch={onPatch} />
            )}

            {/* Row 4: Wymagania techniczne */}
            <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">
                    Wymagania techniczne
                    {techRequirements.length > 0 && <span className="text-gray-600 ml-1">({techRequirements.length})</span>}
                </label>
                {readOnly ? (
                    techRequirements.length > 0 ? (
                        <div className="space-y-0.5">
                            {techRequirements.map((req, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-gray-300 bg-black/20 rounded px-2.5 py-1 border border-white/5">
                                    <span className="text-gray-600 font-mono w-4 text-right shrink-0">{i + 1}.</span>
                                    <span>{req}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-600">—</p>
                    )
                ) : (
                    <>
                        <textarea
                            rows={3}
                            value={fields.technicalSpec}
                            onChange={e => setF('technicalSpec', e.target.value)}
                            onBlur={e => saveTechSpec(e.target.value)}
                            placeholder="Każda nowa linia = osobne wymaganie techniczne..."
                            className={`${ic} resize-none font-mono`}
                        />
                        {techRequirements.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                                {techRequirements.map((req, i) => (
                                    <div key={i} className="flex items-start gap-2 text-[11px] text-gray-400">
                                        <span className="text-gray-600 font-mono w-4 text-right shrink-0">{i + 1}.</span>
                                        <span>{req}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ─── ProposalsSection (AI + ręcznie) ──────────────────────────────────────────

function ProposalsSection({ req, token, onRefresh, onPatch }) {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };
    const [searching, setSearching] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newProp, setNewProp] = useState({ productName: '', manufacturer: '', model: '', sourceUrl: '' });

    const proposals = req.proposals || [];

    const handleSearch = async () => {
        setSearching(true);
        try {
            await fetch(`${API_URL}/material-requirements/${req.id}/search-products`, { method: 'POST', headers: authHeaders });
            await onRefresh?.();
        } finally { setSearching(false); }
    };

    const handleAdd = async () => {
        if (!newProp.productName || !newProp.manufacturer) return;
        await fetch(`${API_URL}/material-requirements/${req.id}/proposals`, {
            method: 'POST', headers: jsonHeaders, body: JSON.stringify(newProp),
        });
        setNewProp({ productName: '', manufacturer: '', model: '', sourceUrl: '' });
        setShowAddForm(false);
        await onRefresh?.();
    };

    const handleSelect = async (p) => {
        await fetch(`${API_URL}/material-requirements/proposals/${p.id}/select`, { method: 'PATCH', headers: authHeaders });
        // Kopiuj dane propozycji do headera wymagania (priceNetto → sync z budżetem)
        const patch = p.isSelected
            ? { manufacturer: null, model: null, priceNetto: null, seller: null, offerNumber: null, availability: null, status: 'PENDING' }
            : { manufacturer: p.manufacturer || null, model: p.model || null, priceNetto: p.priceNetto ?? null, seller: p.seller || null, offerNumber: p.offerNumber || null, availability: p.availability || null, status: 'CONFIRMED' };
        await onPatch?.(req.id, patch);
        await onRefresh?.();
    };

    const handleDelete = async (p, e) => {
        e.stopPropagation();
        await fetch(`${API_URL}/material-requirements/proposals/${p.id}`, { method: 'DELETE', headers: authHeaders });
        if (p.isSelected) {
            await onPatch?.(req.id, { manufacturer: null, model: null, priceNetto: null, seller: null, offerNumber: null, availability: null, status: 'PENDING' });
        }
        await onRefresh?.();
    };

    const ic = 'w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500';

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-500">
                    <Sparkles size={10} className="inline mr-1 text-purple-400" />
                    Propozycje AI {proposals.length > 0 && <span className="text-gray-600 ml-1">({proposals.length})</span>}
                </label>
                <div className="flex items-center gap-1.5">
                    <button onClick={handleSearch} disabled={searching}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-[10px] font-semibold disabled:opacity-40">
                        {searching ? <div className="w-3 h-3 border border-purple-400/30 border-t-purple-400 rounded-full animate-spin" /> : <Search size={9} />}
                        Szukaj AI
                    </button>
                    <button onClick={() => setShowAddForm(p => !p)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-400 text-[10px] font-semibold">
                        <Plus size={9} /> Dodaj ręcznie
                    </button>
                </div>
            </div>

            {showAddForm && (
                <div className="mb-2 p-2 rounded border border-blue-500/20 bg-blue-500/5 flex flex-col gap-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                        <input value={newProp.productName} onChange={e => setNewProp(p => ({ ...p, productName: e.target.value }))}
                            placeholder="Nazwa produktu *" autoFocus className={ic} />
                        <input value={newProp.manufacturer} onChange={e => setNewProp(p => ({ ...p, manufacturer: e.target.value }))}
                            placeholder="Producent *" className={ic} />
                        <input value={newProp.model} onChange={e => setNewProp(p => ({ ...p, model: e.target.value }))}
                            placeholder="Model / Symbol" className={ic} />
                        <input value={newProp.sourceUrl} onChange={e => setNewProp(p => ({ ...p, sourceUrl: e.target.value }))}
                            placeholder="URL (https://...)" className={ic} />
                    </div>
                    <div className="flex justify-end gap-1.5">
                        <button onClick={() => setShowAddForm(false)} className="px-2 py-1 text-[10px] text-gray-500 hover:text-white">Anuluj</button>
                        <button onClick={handleAdd} disabled={!newProp.productName || !newProp.manufacturer}
                            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold disabled:opacity-40">
                            Dodaj
                        </button>
                    </div>
                </div>
            )}

            {proposals.length === 0 ? (
                <p className="text-xs text-gray-600 italic">Brak propozycji — użyj "Szukaj AI" lub "Dodaj ręcznie"</p>
            ) : (
                <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-1">
                    {proposals.map(p => (
                        <div key={p.id} onClick={() => handleSelect(p)}
                            className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-all hover:bg-white/5 ${p.isSelected ? 'border-green-500/40 bg-green-500/10' : 'border-white/5 bg-white/[0.02]'}`}>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-white font-medium truncate">{p.productName}</p>
                                <p className="text-[10px] text-gray-400">
                                    {p.manufacturer}{p.model ? ` · ${p.model}` : ''}
                                    {p.priceNetto != null && <span className="text-green-400 ml-2 font-mono">{Number(p.priceNetto).toFixed(2)} zł</span>}
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {p.matchScore != null && <span className="text-[9px] text-gray-500">{Math.round(p.matchScore * 100)}%</span>}
                                {p.sourceUrl && (
                                    <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-400 hover:text-blue-300"><LinkIcon size={9} /></a>
                                )}
                                {p.isSelected && <Star size={9} className="text-green-400 fill-green-400" />}
                                <button onClick={e => handleDelete(p, e)} className="text-gray-600 hover:text-red-400 ml-1"><X size={9} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default MaterialRequirementsPanel;
