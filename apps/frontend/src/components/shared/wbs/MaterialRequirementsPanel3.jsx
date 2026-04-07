import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import {
    ChevronRight, ChevronDown, Plus, Package, Wrench,
    CheckCircle, Clock, XCircle, Star, Trash2, AlertCircle,
    ShoppingCart, Warehouse, LogOut, Lock, X, Filter, GitBranch,
} from 'lucide-react';
import { API_URL } from '../../../config';

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

function parseWbsNodeIds(r) {
    // wbsNodeIds is a JSON string array, or wbsNodeId is a single string
    try {
        if (r.wbsNodeIds) return JSON.parse(r.wbsNodeIds);
    } catch {}
    if (r.wbsNodeId) return [r.wbsNodeId];
    return [];
}

// ─── Komponent ────────────────────────────────────────────────────────────────

const MaterialRequirementsPanel3 = forwardRef(function MaterialRequirementsPanel3({
    nodeId,
    versionId,
    readOnly = false,
    isEmbedded = false,
    refreshKey = 0,
    onWbsUpdate = null,
}, ref) {
    const token = sessionStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };

    // ─── State ──────────────────────────────────────────────────────────────
    const [lists, setLists] = useState([]);
    const [activeListId, setActiveListId] = useState(null);
    const [requirements, setRequirements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [wbsNodes, setWbsNodes] = useState([]);
    const [activeTypes, setActiveTypes] = useState(['MATERIAL', 'DEVICE']);

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
    const filtered = useMemo(() => {
        return requirements.filter(r => activeTypes.includes(r.type));
    }, [requirements, activeTypes]);

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
                // API returns { items: [...] } — already flat with id, parentId, depth
                setWbsNodes(data.items || []);
            }
        } catch (err) {
            console.error('[Mat3] wbs fetch error:', err);
        }
    }, [nodeId, versionId]);

    // ─── Init ───────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!nodeId) return;
        let cancelled = false;
        (async () => {
            // Fetch WBS tree in parallel with lists
            fetchWbsNodes();
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
        }
    }, [refreshKey]);

    // ─── Patch ──────────────────────────────────────────────────────────────

    const patchItem = useCallback(async (id, data) => {
        try {
            const res = await fetch(`${API_URL}/material-requirements/${id}`, {
                method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(data),
            });
            if (res.ok) {
                const updated = await res.json();
                setRequirements(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
            }
        } catch (err) {
            console.error('[Mat3] patch error:', err);
        }
    }, []);

    const deleteItem = useCallback(async (id) => {
        try {
            await fetch(`${API_URL}/material-requirements/${id}`, { method: 'DELETE', headers });
            setRequirements(prev => prev.filter(r => r.id !== id));
            setExpandedId(prev => prev === id ? null : prev);
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
                    const count = requirements.filter(r => r.type === key).length;
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
                    {filtered.length}/{requirements.length}
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
                                            <ExpandedDetail r={r} token={token} onRefresh={() => fetchRequirements(activeListId)} />
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
    const branchNames = nodeIds.map(id => wbsMap[id]?.name).filter(Boolean);

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
                <span className="text-sm text-gray-300 font-mono">{r.quantity} {r.unit || 'szt'}</span>
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

// ─── ExpandedDetail (placeholder — tu docelowo ProductCard itp.) ─────────────

function ExpandedDetail({ r, token, onRefresh }) {
    return (
        <div className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span className="text-gray-500 text-xs uppercase">Producent</span>
                    <p className="text-white">{r.manufacturer || '—'}</p>
                </div>
                <div>
                    <span className="text-gray-500 text-xs uppercase">Model</span>
                    <p className="text-white">{r.model || '—'}</p>
                </div>
                <div>
                    <span className="text-gray-500 text-xs uppercase">Nazwa handlowa</span>
                    <p className="text-white">{r.productName || '—'}</p>
                </div>
                <div>
                    <span className="text-gray-500 text-xs uppercase">Sprzedawca</span>
                    <p className="text-white">{r.seller || '—'}</p>
                </div>
                <div>
                    <span className="text-gray-500 text-xs uppercase">Nr oferty</span>
                    <p className="text-white">{r.offerNumber || '—'}</p>
                </div>
                <div>
                    <span className="text-gray-500 text-xs uppercase">Dostępność</span>
                    <p className="text-white">{r.availability || '—'}</p>
                </div>
            </div>
            {r.technicalSpec && (
                <div className="mt-3">
                    <span className="text-gray-500 text-xs uppercase">Wymagania techniczne</span>
                    <pre className="text-gray-300 text-xs mt-1 whitespace-pre-wrap font-mono bg-black/20 rounded p-2">{r.technicalSpec}</pre>
                </div>
            )}
        </div>
    );
}

export default MaterialRequirementsPanel3;
