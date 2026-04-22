import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronRight, ChevronDown, GripVertical, Tag, X, ExternalLink, Paperclip, Image, FileText, Volume2, Link, Unlink, FileDown, Package } from 'lucide-react';
import { UNIT_OPTIONS } from './wbsConstants';

const API_URL = '/api';

const STRUCT_STATUS_META = {
    '':        { label: 'Brak',         style: 'bg-transparent text-gray-600 border-transparent' },
    PENDING:   { label: 'Oczekuje',     style: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    PROPOSAL:  { label: 'Propozycja',   style: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    CONFIRMED: { label: 'Potwierdzone', style: 'bg-green-500/20 text-green-300 border-green-500/30' },
    REJECTED:  { label: 'Odrzucone',    style: 'bg-red-500/20 text-red-300 border-red-500/30' },
    ORDERED:   { label: 'Zamówione',    style: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
    IN_STOCK:  { label: 'Na magazynie', style: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
    ISSUED:    { label: 'Wydane',       style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    MIXED:     { label: 'Mieszany',     style: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
};

function StatusSelect({ value, onChange }) {
    const meta = STRUCT_STATUS_META[value || ''] || STRUCT_STATUS_META[''];
    return (
        <select
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            className={`text-[10px] px-2 py-0.5 rounded-lg border font-medium bg-black/40 cursor-pointer focus:outline-none focus:ring-0 transition-colors ${meta.style}`}
            onClick={e => e.stopPropagation()}
        >
            {Object.entries(STRUCT_STATUS_META).map(([code, { label }]) => (
                <option key={code} value={code} className="bg-gray-900 text-white">{label}</option>
            ))}
        </select>
    );
}

function InheritedStatusBadge({ status }) {
    const meta = STRUCT_STATUS_META[status];
    if (!meta) return <span className="text-[10px] px-2 py-0.5 rounded-lg border font-medium bg-black/40 text-gray-500 border-gray-600/30 flex items-center gap-1 w-max"><Link size={8}/> {status}</span>;
    return <span title="Status dziedziczony z zapotrzebowania" className={`text-[10px] px-2 py-0.5 rounded-lg border font-medium bg-black/40 flex items-center gap-1 w-max cursor-default ${meta.style}`}><Link size={8}/> {meta.label}</span>;
}

function QtyInput({ value, onChange }) {
    const [local, setLocal] = useState(value != null ? String(value) : '');
    useEffect(() => { setLocal(value != null ? String(value) : ''); }, [value]);
    return (
        <input
            type="text"
            value={local}
            onChange={e => setLocal(e.target.value)}
            onBlur={() => {
                const v = parseFloat(local.replace(',', '.'));
                if (!isNaN(v) && v >= 0) onChange(v);
            }}
            placeholder="1"
            className="bg-transparent border-none focus:outline-none text-xs w-full text-right placeholder-gray-700"
        />
    );
}

// Node types: 'project' (root), 'product' (przedmiot projektu), 'material'|'work'|'service' (typy pracy)
const mkNode = (withDefaults = false) => {
    const id = crypto.randomUUID();
    return {
        id,
        name: '',
        status: '',
        owner: '',
        resources: '',
        cost: '',
        tags: [],
        type: '', // 'product', 'material', 'work', 'service' - empty for root
        comment: '',
        children: [],
    };
};

// ── Recursive tree helpers ────────────────────────────────────────────────────
const updateField = (nodes, id, field, value) =>
    nodes.map(n => n.id === id
        ? { ...n, [field]: value }
        : { ...n, children: updateField(n.children || [], id, field, value) }
    );

const deleteNode = (nodes, id) =>
    nodes.filter(n => n.id !== id)
         .map(n => ({ ...n, children: deleteNode(n.children || [], id) }));

const collectIds = (nodes, id) => {
    for (const n of nodes) {
        if (n.id === id) {
            const ids = [n.id];
            for (const c of (n.children || [])) ids.push(...collectIds([c], c.id));
            return ids;
        }
        const found = collectIds(n.children || [], id);
        if (found.length) return found;
    }
    return [];
};

const addChildTo = (nodes, parentId, child) =>
    nodes.map(n => n.id === parentId
        ? { ...n, children: [...(n.children || []), child] }
        : { ...n, children: addChildTo(n.children || [], parentId, child) }
    );

const findNode = (nodes, id) => {
    for (const n of nodes) {
        if (n.id === id) return n;
        const found = findNode(n.children || [], id);
        if (found) return found;
    }
    return null;
};

const subtreeContains = (node, id) =>
    node.id === id || (node.children || []).some(c => subtreeContains(c, id));

const extractNode = (nodes, id) => {
    let found = null;
    const clean = arr => arr.reduce((acc, n) => {
        if (n.id === id) { found = n; return acc; }
        return [...acc, { ...n, children: clean(n.children || []) }];
    }, []);
    return [found, clean(nodes)];
};

const insertNode = (nodes, targetId, node, position) => {
    if (position === 'into') {
        return nodes.map(n => n.id === targetId
            ? { ...n, children: [...(n.children || []), node] }
            : { ...n, children: insertNode(n.children || [], targetId, node, position) }
        );
    }
    const result = [];
    for (const n of nodes) {
        if (n.id === targetId && position === 'before') result.push(node);
        result.push({ ...n, children: insertNode(n.children || [], targetId, node, position) });
        if (n.id === targetId && position === 'after') result.push(node);
    }
    return result;
};

// ── Stats ─────────────────────────────────────────────────────────────────────
const nodeTotal = node => {
    const base = { res: parseFloat(node.resources) || 0, cost: parseFloat(node.cost) || 0 };
    return (node.children || []).reduce((a, c) => {
        const t = nodeTotal(c);
        return { res: a.res + t.res, cost: a.cost + t.cost };
    }, base);
};

const fmt = v => v ? new Intl.NumberFormat('pl-PL').format(Math.round(v)) : '';

// ── Depth visual config ───────────────────────────────────────────────────────
const DEPTH = [
    {
        pl: 'pl-5',
        rowBg: 'bg-blue-950/30 hover:bg-blue-900/30',
        leftBorder: 'border-l-[3px] border-blue-500',
        badge: 'bg-blue-600 text-white shadow shadow-blue-900/60',
        nameClass: 'text-base font-bold uppercase text-white',
        fieldClass: 'text-blue-200',
        tagColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    },
    {
        pl: 'pl-10',
        rowBg: 'bg-violet-950/20 hover:bg-violet-900/25',
        leftBorder: 'border-l-[3px] border-violet-500/70',
        badge: 'bg-violet-600/70 text-violet-100',
        nameClass: 'text-base text-violet-200',
        fieldClass: 'text-violet-300',
        tagColor: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    },
    {
        pl: 'pl-16',
        rowBg: 'bg-teal-950/15 hover:bg-teal-900/20',
        leftBorder: 'border-l-[3px] border-teal-500/50',
        badge: 'bg-teal-700/50 text-teal-200',
        nameClass: 'text-base text-teal-300',
        fieldClass: 'text-teal-400',
        tagColor: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    },
    {
        pl: 'pl-24',
        rowBg: 'bg-amber-950/10 hover:bg-amber-900/15',
        leftBorder: 'border-l-[3px] border-amber-500/40',
        badge: 'bg-amber-800/30 text-amber-400',
        nameClass: 'text-sm text-amber-400',
        fieldClass: 'text-amber-500',
        tagColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
];
const MAX_DEPTH = DEPTH.length - 1;

// ── Tag chips ─────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function TagChips({ tags = [], tagColor, onRemove, onTagClick }) {
    const visible = tags.map((t, i) => ({ tag: t, idx: i })).filter(({ tag }) =>
        !UUID_RE.test(tag) && !String(tag).startsWith('req:') && tag !== 'auto-requirement');
    return (
        <div className="flex flex-wrap gap-1">
            {visible.map(({ tag, idx }) => (
                <span key={idx} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${tagColor}`}>
                    <Tag size={8} className="flex-shrink-0" />
                    <span>{tag}</span>
                    {onTagClick && (
                        <button
                            onClick={e => { e.stopPropagation(); onTagClick(tag); }}
                            className="hover:opacity-70 transition-opacity"
                            title="Szczegóły / Schemat"
                        >
                            <ExternalLink size={8} />
                        </button>
                    )}
                    {onRemove && (
                        <button
                            onClick={e => { e.stopPropagation(); onRemove(idx); }}
                            className="hover:opacity-70 transition-opacity"
                        >
                            <X size={8} />
                        </button>
                    )}
                </span>
            ))}
        </div>
    );
}

// ── Attachment thumbnail ──────────────────────────────────────────────────────
function AttachmentThumb({ att, onClick }) {
    const url = `${API_URL}/schematics/file/${att.fileUrl}`;
    if (att.fileType === 'IMAGE') {
        return (
            <button onClick={e => { e.stopPropagation(); onClick(att); }} title={att.fileName}
                className="w-8 h-8 rounded overflow-hidden border border-white/10 hover:border-blue-500/60 transition-all flex-shrink-0">
                <img src={url} alt={att.fileName} className="w-full h-full object-cover" />
            </button>
        );
    }
    const Icon = att.fileType === 'AUDIO' ? Volume2 : FileText;
    return (
        <button onClick={e => { e.stopPropagation(); onClick(att); }} title={att.fileName}
            className="w-8 h-8 rounded border border-white/10 hover:border-blue-500/60 transition-all flex-shrink-0 flex items-center justify-center bg-white/5">
            <Icon size={14} className="text-gray-400" />
        </button>
    );
}

// ── Marker Attachments Modal ──────────────────────────────────────────────────
function MarkerAttachmentsModal({ wbsNodeId, wbsNodeName, processNodeId, onClose }) {
    const [links, setLinks] = useState([]);
    const [allSchematics, setAllSchematics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingPicker, setLoadingPicker] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [previewAtt, setPreviewAtt] = useState(null);

    const fetchLinks = useCallback(async () => {
        const res = await fetch(`${API_URL}/schematics/wbs-node-markers/${wbsNodeId}`);
        if (res.ok) setLinks(await res.json());
    }, [wbsNodeId]);

    useEffect(() => {
        setLoading(true);
        fetchLinks().finally(() => setLoading(false));
    }, [fetchLinks]);

    const openPicker = async () => {
        setShowPicker(true);
        setLoadingPicker(true);
        const res = await fetch(`${API_URL}/schematics/process-node-markers/${processNodeId}`);
        if (res.ok) setAllSchematics(await res.json());
        setLoadingPicker(false);
    };

    const assign = async (markerId) => {
        await fetch(`${API_URL}/schematics/wbs-node-markers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wbsNodeId, markerId }),
        });
        await fetchLinks();
    };

    const unlink = async (linkId) => {
        await fetch(`${API_URL}/schematics/wbs-node-markers/${linkId}`, { method: 'DELETE' });
        setLinks(prev => prev.filter(l => l.id !== linkId));
    };

    const linkedMarkerIds = new Set(links.map(l => l.markerId));
    const allMarkers = allSchematics.flatMap(s => (s.markers || []).map(m => ({ ...m, schematicName: s.fileName })));

    return (
        <>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="relative bg-gray-950 border border-white/10 rounded-2xl shadow-2xl w-[680px] max-h-[80vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div>
                        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Znaczniki WBS</p>
                        <h2 className="text-sm font-semibold text-white mt-0.5">{wbsNodeName || 'Element WBS'}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={openPicker}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-[11px] font-medium transition-all">
                            <Link size={11} /> Przypisz znacznik
                        </button>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-all">
                            <X size={14} />
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 p-5 space-y-4">
                    {/* Picker */}
                    {showPicker && (
                        <div className="border border-white/10 rounded-xl bg-white/[0.02] p-4">
                            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-3">Dostępne znaczniki schematu</p>
                            {loadingPicker && <p className="text-xs text-gray-600">Ładowanie...</p>}
                            {!loadingPicker && allMarkers.length === 0 && (
                                <p className="text-xs text-gray-600 italic">Brak znaczników w schematach tego węzła</p>
                            )}
                            <div className="space-y-2">
                                {allMarkers.map(m => {
                                    const isLinked = linkedMarkerIds.has(m.id);
                                    return (
                                        <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] border border-white/5">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-white font-medium truncate">{m.name || m.note || `Znacznik (${m.type})`}</p>
                                                <p className="text-[10px] text-gray-600 truncate">{m.schematicName} · str. {m.pageNumber}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                {(m.attachments || []).slice(0, 3).map(att => (
                                                    <AttachmentThumb key={att.id} att={att} onClick={setPreviewAtt} />
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => isLinked ? null : assign(m.id)}
                                                disabled={isLinked}
                                                className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
                                                    isLinked
                                                        ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
                                                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30'
                                                }`}
                                            >
                                                <Link size={9} /> {isLinked ? 'Przypisany' : 'Przypisz'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Current links */}
                    {loading && <p className="text-xs text-gray-600">Ładowanie...</p>}
                    {!loading && links.length === 0 && !showPicker && (
                        <p className="text-xs text-gray-600 italic text-center py-6">
                            Brak przypisanych znaczników. Kliknij „Przypisz znacznik" aby dodać.
                        </p>
                    )}
                    {links.map(link => {
                        const m = link.marker;
                        const atts = m?.attachments || [];
                        return (
                            <div key={link.id} className="border border-white/10 rounded-xl bg-white/[0.02] p-4">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div>
                                        <p className="text-xs font-semibold text-white">{m?.name || m?.note || `Znacznik (${m?.type})`}</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">{m?.schematic?.fileName} · str. {m?.pageNumber}</p>
                                    </div>
                                    <button onClick={() => unlink(link.id)}
                                        className="p-1 rounded hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-all flex-shrink-0" title="Odepnij">
                                        <Unlink size={12} />
                                    </button>
                                </div>
                                {atts.length === 0 && (
                                    <p className="text-[10px] text-gray-700 italic">Brak załączników do tego znacznika</p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {atts.map(att => (
                                        <div key={att.id} className="flex flex-col items-center gap-1">
                                            <AttachmentThumb att={att} onClick={setPreviewAtt} />
                                            <span className="text-[9px] text-gray-600 max-w-[32px] truncate">{att.fileName}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>

        {/* Full-screen attachment preview — poza modalem, żeby nie być ograniczonym jego stacking context */}
        {previewAtt && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95"
                onClick={() => setPreviewAtt(null)}>
                <div className="relative w-full h-full flex items-center justify-center p-6" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setPreviewAtt(null)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10 transition-all">
                        <X size={20} />
                    </button>
                    {previewAtt.fileType === 'IMAGE' ? (
                        <img src={`${API_URL}/schematics/file/${previewAtt.fileUrl}`}
                            alt={previewAtt.fileName}
                            className="max-w-full max-h-full rounded-xl object-contain" />
                    ) : previewAtt.fileType === 'AUDIO' ? (
                        <audio controls src={`${API_URL}/schematics/file/${previewAtt.fileUrl}`} />
                    ) : (
                        <div className="bg-gray-900 rounded-xl p-10 text-center">
                            <FileText size={56} className="text-gray-500 mx-auto mb-4" />
                            <p className="text-white text-sm">{previewAtt.fileName}</p>
                            <a href={`${API_URL}/schematics/file/${previewAtt.fileUrl}`} target="_blank" rel="noreferrer"
                                className="mt-3 inline-block text-blue-400 text-sm hover:underline">Otwórz plik</a>
                        </div>
                    )}
                    {previewAtt.note && (
                        <p className="absolute bottom-6 left-0 right-0 text-xs text-gray-400 text-center">{previewAtt.note}</p>
                    )}
                </div>
            </div>
        )}
        </>
    );
}

// ── Attachment preview cell ───────────────────────────────────────────────────
function AttachmentCell({ wbsNodeId, nodeName, markerLinksCache, onOpenModal, onPreview }) {
    const links = markerLinksCache[wbsNodeId] || [];

    const allAtts = links.flatMap(l => (l.marker?.attachments || []));
    const imgAtts = allAtts.filter(a => a.fileType === 'IMAGE');
    const otherCount = allAtts.length - imgAtts.length;

    const open = (e) => { e?.stopPropagation?.(); onOpenModal({ wbsNodeId, wbsNodeName: nodeName }); };

    return (
        <div className="flex items-center gap-1 flex-wrap">
            {imgAtts.slice(0, 3).map(att => (
                <AttachmentThumb key={att.id} att={att} onClick={(a) => onPreview?.(a)} />
            ))}
            {otherCount > 0 && (
                <span className="text-[9px] text-gray-500 flex items-center gap-0.5">
                    <FileText size={9} /> {otherCount}
                </span>
            )}
            <button
                onClick={open}
                className="opacity-0 group-hover/node:opacity-100 p-1 rounded hover:bg-white/10 text-gray-600 hover:text-blue-400 transition-all flex-shrink-0"
                title="Zarządzaj załącznikami znaczników"
            >
                <Paperclip size={11} />
            </button>
            {allAtts.length > 3 && (
                <button onClick={open} className="text-[9px] text-gray-600 hover:text-blue-400 transition-all">
                    +{allAtts.length - 3}
                </button>
            )}
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function WBSHybridTable({ wbsTree, setWbsTree, nodeName = 'Projekt', processNodeId, onSave, onTagClick, onTopLevelAdded, onNodesDeleted, onMaterialNodeCreated, users = [], onRequirementDrop = null, isManager = false, requirementsQtyByNode = {}, onRequirementsQtyChange, onNodeStatusChange, unassignedRequirements = [], onRequirementAssign, onNodeFieldSave = null, materialRefreshKey = 0, searchQuery = '' }) {
    const getAllIds = useCallback((items) => {
        const ids = ['root'];
        const walk = (nodes) => nodes?.forEach(n => { ids.push(`node_${n.id}`); walk(n.children); });
        walk(items);
        return new Set(ids);
    }, []);
    const [expanded, setExpanded] = useState(() => new Set(['root']));
    const initialExpandDone = useRef(false);
    useEffect(() => {
        if (!initialExpandDone.current && wbsTree?.items?.length) {
            setExpanded(getAllIds(wbsTree.items));
            initialExpandDone.current = true;
        }
    }, [wbsTree, getAllIds]);
    const [dragId, setDragId] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const [editingTagsFor, setEditingTagsFor] = useState(null);
    const [tagInput, setTagInput] = useState('');
    const [markerLinksCache, setMarkerLinksCache] = useState({});
    const [attachmentModal, setAttachmentModal] = useState(null); // { wbsNodeId, wbsNodeName }
    const [lightboxAtt, setLightboxAtt] = useState(null); // attachment for fullscreen preview
    const tagInputRef = useRef(null);
    const [materialStatuses, setMaterialStatuses] = useState({});
    const [reqDragOverNode, setReqDragOverNode] = useState(null);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [showBasket, setShowBasket] = useState(false);

    // materialStatuses kept for InheritedStatusBadge display only (no longer syncs to wbsTree)
    useEffect(() => {
        if (!processNodeId) return;
        const fetchMat = async () => {
            try {
                const token = sessionStorage.getItem('token') || localStorage.getItem('token');
                const res = await fetch(`${API_URL}/material-requirements/node/${processNodeId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const map = {};
                    data.forEach(r => { if (r.name) map[r.name.toLowerCase()] = r.status; });
                    setMaterialStatuses(map);
                }
            } catch (e) {}
        };
        fetchMat();
    }, [processNodeId, materialRefreshKey]);

    const items = wbsTree?.items || [];

    // Pre-fetch marker links for all WBS nodes (+ periodic refresh)
    const fetchMarkerLinks = useCallback(() => {
        if (!processNodeId) return;
        const allIds = [];
        const collectAllIds = (nodes) => nodes.forEach(n => { allIds.push(n.id); collectAllIds(n.children || []); });
        collectAllIds(items);
        allIds.forEach(async id => {
            const res = await fetch(`${API_URL}/schematics/wbs-node-markers/${id}`);
            if (res.ok) {
                const data = await res.json();
                setMarkerLinksCache(prev => ({ ...prev, [id]: data }));
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processNodeId, items.length]);

    useEffect(() => {
        fetchMarkerLinks();
        const iv = setInterval(fetchMarkerLinks, 30000);
        window.addEventListener('wbs-link-changed', fetchMarkerLinks);
        return () => { clearInterval(iv); window.removeEventListener('wbs-link-changed', fetchMarkerLinks); };
    }, [fetchMarkerLinks]);

    const toggle = (id, e) => {
        e?.stopPropagation();
        setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    };
    const open = id => setExpanded(prev => new Set([...prev, id]));
    const isOpen = id => expanded.has(id);

    const save = newTree => { setWbsTree(newTree); setTimeout(() => onSave?.(), 0); };

    const handleField = (id, field, value) =>
        setWbsTree(t => ({ ...t, items: updateField(t.items || [], id, field, value) }));

    const handleDelete = (id, e) => {
        e?.stopPropagation();
        const deletedIds = collectIds(items, id);
        save({ ...wbsTree, items: deleteNode(items, id) });
        if (deletedIds.length) onNodesDeleted?.(deletedIds);
    };

    const handleAddChild = (parentId, e) => {
        e?.stopPropagation();
        const child = mkNode(false);
        setWbsTree(t => ({ ...t, items: addChildTo(t.items || [], parentId, child) }));
        open(`node_${parentId}`);
        setTimeout(() => onSave?.(), 0);
    };

    const handleAddTopLevel = e => {
        e?.stopPropagation();
        const item = mkNode(true);
        setWbsTree(t => ({ ...t, items: [...(t.items || []), item] }));
        open('root');
        open(`node_${item.id}`);
        setTimeout(() => {
            onSave?.();
            onTopLevelAdded?.(item);
        }, 0);
    };

    // ── Tags ──────────────────────────────────────────────────────────────────
    const addTag = (nodeId) => {
        const val = tagInput.trim();
        if (!val) return;
        const node = findNode(items, nodeId);
        const tags = [...(node?.tags || [])];
        if (!tags.includes(val)) {
            tags.push(val);
            handleField(nodeId, 'tags', tags);
            setTimeout(() => onSave?.(), 0);
        }
        setTagInput('');
        tagInputRef.current?.focus();
    };

    const removeTag = (nodeId, tagIndex) => {
        const node = findNode(items, nodeId);
        const tags = (node?.tags || []).filter((_, i) => i !== tagIndex);
        handleField(nodeId, 'tags', tags);
        setTimeout(() => onSave?.(), 0);
    };

    // ── Drag & Drop ───────────────────────────────────────────────────────────
    const onDragStart = (e, nodeId) => {
        e.stopPropagation();
        setDragId(nodeId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = (e, nodeId, depth) => {
        e.preventDefault();
        e.stopPropagation();
        const dragTypes = Array.from(e.dataTransfer?.types || []);
        if (isManager && onRequirementDrop && dragTypes.includes('application/requirement-id')) {
            setReqDragOverNode(nodeId);
            e.dataTransfer.dropEffect = 'copy';
            return;
        }
        if (!dragId || dragId === nodeId) return;
        const dragNode = findNode(items, dragId);
        if (dragNode && subtreeContains(dragNode, nodeId)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const relY = (e.clientY - rect.top) / rect.height;
        let position;
        if (relY < 0.25) position = 'before';
        else if (relY > 0.75) position = 'after';
        else position = depth < MAX_DEPTH ? 'into' : (relY < 0.5 ? 'before' : 'after');
        setDragOver({ nodeId, position });
        e.dataTransfer.dropEffect = 'move';
    };

    const onDragLeave = e => {
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setDragOver(null);
        setReqDragOverNode(null);
    };

    const onDrop = (e, nodeId) => {
        e.preventDefault();
        e.stopPropagation();
        if (isManager && onRequirementDrop) {
            const reqId = e.dataTransfer.getData('application/requirement-id');
            if (reqId) {
                setReqDragOverNode(null);
                onRequirementDrop(nodeId, reqId);
                return;
            }
        }
        if (!dragId || !dragOver || dragOver.nodeId !== nodeId || dragId === nodeId) {
            setDragId(null); setDragOver(null); return;
        }
        const [extracted, withoutDrag] = extractNode(items, dragId);
        if (!extracted) { setDragId(null); setDragOver(null); return; }
        const newItems = insertNode(withoutDrag, nodeId, extracted, dragOver.position);
        save({ ...wbsTree, items: newItems });
        setDragId(null); setDragOver(null);
    };

    const onDragEnd = () => { setDragId(null); setDragOver(null); setReqDragOverNode(null); };

    // ── Totals ────────────────────────────────────────────────────────────────
    const totalRes  = items.reduce((a, n) => a + nodeTotal(n).res,  0);
    const totalCost = items.reduce((a, n) => a + nodeTotal(n).cost, 0);

    // ── Search filter ─────────────────────────────────────────────────────────
    const normalizedSearch = String(searchQuery || '').trim().toLowerCase();
    let searchVisibleIds = null;
    if (normalizedSearch) {
        const STRUCT_STATUS_LABELS = Object.fromEntries(Object.entries(STRUCT_STATUS_META).map(([k, v]) => [k, v.label.toLowerCase()]));
        const nodeMatchesSearch = (n) => {
            const fields = [n.name, n.type, n.status ? STRUCT_STATUS_LABELS[n.status] : '', n.owner, n.unit, String(n.quantity ?? '')];
            return fields.some(f => String(f || '').toLowerCase().includes(normalizedSearch));
        };
        const matchingIds = new Set();
        const collectMatching = (nodes) => nodes.forEach(n => {
            if (nodeMatchesSearch(n)) matchingIds.add(n.id);
            collectMatching(n.children || []);
        });
        collectMatching(items);
        // Include ancestors of all matching nodes
        const nodeById = new Map();
        const buildMap = (nodes, parent = null) => nodes.forEach(n => { nodeById.set(n.id, { ...n, _parentId: parent }); buildMap(n.children || [], n.id); });
        buildMap(items);
        searchVisibleIds = new Set(matchingIds);
        for (const id of matchingIds) {
            let cur = nodeById.get(id);
            while (cur?._parentId) { searchVisibleIds.add(cur._parentId); cur = nodeById.get(cur._parentId); }
        }
    }

    const rows = [];

    // ── Root row ──────────────────────────────────────────────────────────────
    rows.push(
        <tr key="root" className="border-b border-white/5 bg-slate-900/50 hover:bg-slate-900/70 cursor-pointer select-none" onClick={e => toggle('root', e)}>
            <td className="px-3 py-3">
                <ChevronRight size={14} className={`text-gray-400 transition-transform ${isOpen('root') ? 'rotate-90' : ''}`} />
            </td>
            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-white uppercase tracking-wide">{nodeName}</span>
                    <button onClick={handleAddTopLevel} className="p-0.5 hover:bg-white/10 rounded text-gray-600 hover:text-blue-400 transition-all" title="Dodaj przedmiot projektu">
                        <Plus size={12} />
                    </button>
                </div>
            </td>
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3 text-right"><span className="text-xs text-gray-300 font-mono">{fmt(totalRes)}</span></td>
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
        </tr>
    );

    // ── Recursive renderer ────────────────────────────────────────────────────
    const renderNode = (node, depth, wbsPath, parentId = null) => {
        if (searchVisibleIds && !searchVisibleIds.has(node.id)) {
            // Recurse children even when parent is hidden (ancestors are included, but keep going for matching descendants)
            (node.children || []).forEach((child, ci) => renderNode(child, depth + 1, `${wbsPath}.${ci + 1}`, node.id));
            return;
        }
        const rowId = `node_${node.id}`;
        const d = DEPTH[Math.min(depth, MAX_DEPTH)];
        const hasChildren = (node.children || []).length > 0;
        const isDragging = dragId === node.id;
        const overPos = dragOver?.nodeId === node.id ? dragOver.position : null;
        const isEditingTags = editingTagsFor === node.id;

        const dropBorder = overPos === 'before' ? 'border-t-[2px] border-t-blue-500'
            : overPos === 'after'  ? 'border-b-[2px] border-b-blue-500'
            : overPos === 'into'   ? '!bg-blue-500/10 outline outline-1 outline-blue-500/30'
            : '';
        const reqDropHighlight = reqDragOverNode === node.id ? '!bg-emerald-500/10 outline outline-1 outline-emerald-500/40' : '';

        rows.push(
            <tr
                key={rowId}
                onDragOver={e => onDragOver(e, node.id, depth)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, node.id)}
                className={`border-b border-white/5 cursor-pointer group/node transition-opacity ${d.rowBg} ${d.leftBorder} ${isDragging ? 'opacity-25' : ''} ${dropBorder} ${reqDropHighlight} ${selectedNodeId === node.id ? 'outline outline-1 outline-blue-500/40 !bg-blue-500/5' : ''}`}
                onClick={e => { setSelectedNodeId(node.id); hasChildren && toggle(rowId, e); }}
            >
                {/* WBS ID — uchwyt drag */}
                <td
                    className="px-1 py-2.5 cursor-grab"
                    draggable
                    onDragStart={e => onDragStart(e, node.id)}
                    onDragEnd={onDragEnd}
                >
                    <div className="flex items-center gap-1.5">
                        <GripVertical
                            size={11}
                            className="text-gray-700 group-hover/node:text-gray-500 flex-shrink-0"
                        />
                        {hasChildren
                            ? <ChevronRight size={12} className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen(rowId) ? 'rotate-90' : ''}`} />
                            : <span className="w-[12px] flex-shrink-0" />
                        }
                    </div>
                </td>

                {/* Nazwa */}
                <td className="px-3 py-1.5 select-text" style={{ paddingLeft: `calc(0.75rem + ${depth * 14}px)` }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-start gap-1.5">
                        <textarea
                            rows={1}
                            value={node.name || ''}
                            onChange={e => {
                                handleField(node.id, 'name', e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                            }}
                            onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                            onBlur={() => {
                                onSave?.();
                                if ((node.type === 'equipment' || node.type === 'material') && node.name) {
                                    onMaterialNodeCreated?.({ wbsNodeId: node.id, name: node.name, type: node.type, parentId });
                                }
                            }}
                            placeholder={depth === 0 ? 'Nazwa przedmiotu projektu…' : 'Nazwa elementu…'}
                            className={`bg-transparent border-none resize-none overflow-hidden focus:outline-none placeholder-gray-700 w-full min-w-0 select-text leading-snug ${d.nameClass}`}
                            style={{ height: 'auto', minHeight: '1.4em' }}
                        />
                        {depth < MAX_DEPTH && (
                            <button
                                onClick={e => handleAddChild(node.id, e)}
                                className="opacity-0 group-hover/node:opacity-100 p-0.5 hover:bg-white/10 rounded text-gray-600 transition-all flex-shrink-0"
                                title="Dodaj element podrzędny"
                            >
                                <Plus size={10} />
                            </button>
                        )}
                    </div>
                </td>

                {/* Typ — dla wszystkich poziomów poza rootem */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {depth >= 1 && (
                        <select
                            value={node.type || ''}
                            onChange={e => {
                                const newType = e.target.value;
                                handleField(node.id, 'type', newType);
                                onNodeFieldSave?.(node.id, 'type', newType);
                                onSave?.();
                                if ((newType === 'equipment' || newType === 'material') && node.name) {
                                    onMaterialNodeCreated?.({ wbsNodeId: node.id, name: node.name, type: newType, parentId });
                                }
                            }}
                            className={`bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-xs w-full focus:outline-none focus:border-blue-500 transition-colors cursor-pointer ${d.fieldClass}`}
                        >
                            <option value="" className="bg-gray-900">— wybierz typ —</option>
                            <option value="work" className="bg-gray-900">Praca</option>
                            <option value="material" className="bg-gray-900">Materiał</option>
                            <option value="equipment" className="bg-gray-900">Sprzęt</option>
                            <option value="service" className="bg-gray-900">Usługa</option>
                            <option value="lodging" className="bg-gray-900">Nocleg</option>
                            <option value="fuel" className="bg-gray-900">Paliwo</option>
                        </select>
                    )}
                </td>

                {/* Ilość wymagań */}
                <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                    {depth >= 1 && (
                        <QtyInput
                            value={requirementsQtyByNode[node.id] ?? null}
                            onChange={v => onRequirementsQtyChange?.(node.id, v, node.name)}
                        />
                    )}
                </td>

                {/* Jednostka */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {depth >= 1 && (
                        <select value={node.unit || ''}
                            onChange={e => { handleField(node.id, 'unit', e.target.value); onNodeFieldSave?.(node.id, 'unit', e.target.value); onSave?.(); }}
                            className={`bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-xs w-full focus:outline-none focus:border-blue-500 cursor-pointer ${d.fieldClass}`}>
                            <option value="" className="bg-gray-900">—</option>
                            {UNIT_OPTIONS.map(u => <option key={u} value={u} className="bg-gray-900">{u}</option>)}
                        </select>
                    )}
                </td>

                {/* Status */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {(() => {
                        const reqTag = (node.tags || []).find(t => String(t).startsWith('req:'));
                        const inherited = !reqTag && node.name ? materialStatuses[node.name.toLowerCase()] : null;
                        if (inherited) return <InheritedStatusBadge status={inherited} />;
                        return (
                            <StatusSelect
                                value={node.status}
                                onChange={v => {
                                    handleField(node.id, 'status', v);
                                    onSave?.();
                                    if (reqTag) onNodeStatusChange?.(node.id, v, reqTag.slice(4));
                                }}
                            />
                        );
                    })()}
                </td>

                {/* Właściciel */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {users.length > 0 ? (
                        <select
                            value={node.owner || ''}
                            onChange={e => { handleField(node.id, 'owner', e.target.value); onSave?.(); }}
                            className={`bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-xs w-full focus:outline-none focus:border-blue-500 transition-colors cursor-pointer ${d.fieldClass}`}
                        >
                            <option value="" className="bg-gray-900">—</option>
                            {users.map(u => {
                                const label = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
                                return <option key={u.id} value={label} className="bg-gray-900">{label}</option>;
                            })}
                        </select>
                    ) : (
                        <input type="text" value={node.owner || ''} onChange={e => handleField(node.id, 'owner', e.target.value)} onBlur={onSave}
                            placeholder="—" className={`bg-transparent border-none focus:outline-none text-xs w-full placeholder-gray-700 ${d.fieldClass}`} />
                    )}
                </td>

                {/* Zasoby */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <input type="text" value={node.resources || ''} onChange={e => handleField(node.id, 'resources', e.target.value)} onBlur={onSave}
                        placeholder="0" className={`bg-transparent border-none focus:outline-none text-xs w-full text-right placeholder-gray-700 ${d.fieldClass}`} />
                </td>

                {/* Komentarz */}
                <td className="px-3 py-2.5 min-w-[180px]" onClick={e => e.stopPropagation()}>
                    <input type="text" value={node.comment || ''} onChange={e => handleField(node.id, 'comment', e.target.value)}
                        onBlur={e => { onNodeFieldSave?.(node.id, 'comment', e.target.value); onSave?.(); }}
                        placeholder="—" className={`bg-transparent border-none focus:outline-none text-xs w-full placeholder-gray-700 ${d.fieldClass}`} />
                </td>

                {/* Znaczniki */}
                <td className="px-3 py-2.5 min-w-[100px]" onClick={e => e.stopPropagation()}>
                    <div className="flex flex-col gap-1">
                        <TagChips
                            tags={node.tags || []}
                            tagColor={d.tagColor}
                            onRemove={isEditingTags ? (i) => removeTag(node.id, i) : null}
                            onTagClick={onTagClick}
                        />
                        {isEditingTags ? (
                            <div className="flex items-center gap-1 mt-0.5">
                                <input
                                    ref={tagInputRef}
                                    type="text"
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') { e.preventDefault(); addTag(node.id); }
                                        if (e.key === 'Escape') { setEditingTagsFor(null); setTagInput(''); }
                                    }}
                                    placeholder="Znacznik…"
                                    autoFocus
                                    className="bg-black/40 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white w-24 focus:outline-none focus:border-blue-500/50"
                                />
                                <button onClick={() => addTag(node.id)} className="p-0.5 hover:bg-white/10 rounded text-gray-500 hover:text-blue-400 transition-all"><Plus size={10} /></button>
                                <button onClick={() => { setEditingTagsFor(null); setTagInput(''); }} className="p-0.5 hover:bg-white/10 rounded text-gray-500 hover:text-red-400 transition-all"><X size={10} /></button>
                            </div>
                        ) : (
                            <button
                                onClick={e => { e.stopPropagation(); setEditingTagsFor(node.id); setTagInput(''); setTimeout(() => tagInputRef.current?.focus(), 50); }}
                                className="opacity-0 group-hover/node:opacity-100 flex items-center gap-1 text-[10px] text-gray-600 hover:text-blue-400 transition-all"
                            >
                                <Tag size={9} />
                                <span>+ znacznik</span>
                            </button>
                        )}
                    </div>
                </td>

                {/* Załączniki znaczników */}
                <td className="px-3 py-2.5 min-w-[100px]" onClick={e => e.stopPropagation()}>
                    {processNodeId ? (
                        <AttachmentCell
                            wbsNodeId={node.id}
                            nodeName={node.name}
                            markerLinksCache={markerLinksCache}
                            onOpenModal={setAttachmentModal}
                            onPreview={setLightboxAtt}
                        />
                    ) : null}
                </td>

                {/* Usuń */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <button onClick={e => handleDelete(node.id, e)} className="opacity-0 group-hover/node:opacity-100 p-1 hover:bg-red-500/10 rounded text-red-500 transition-all">
                        <Trash2 size={11} />
                    </button>
                </td>
            </tr>
        );

        if (searchVisibleIds || isOpen(rowId)) {
            (node.children || []).forEach((child, ci) => {
                renderNode(child, depth + 1, `${wbsPath}.${ci + 1}`, node.id);
            });
        }
    };

    if (isOpen('root')) {
        if (items.length === 0) {
            rows.push(
                <tr key="empty">
                    <td colSpan={11} className="px-3 py-3 pl-16 text-[10px] text-gray-700 italic">
                        Brak przedmiotów — kliknij <span className="text-gray-500">+</span> przy projekcie, aby dodać
                    </td>
                </tr>
            );
        }
        items.forEach((item, i) => renderNode(item, 0, `${i + 1}`));
    }

    const closeAttachmentModal = async () => {
        const id = attachmentModal?.wbsNodeId;
        setAttachmentModal(null);
        if (id) {
            const res = await fetch(`${API_URL}/schematics/wbs-node-markers/${id}`);
            if (res.ok) {
                const data = await res.json();
                setMarkerLinksCache(prev => ({ ...prev, [id]: data }));
            }
        }
    };

    // ── PDF export with full-size images ─────────────────────────────────────
    const handleExportPdf = useCallback(async () => {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');

        // Convert image URL to base64 for embedding in print HTML
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

        // Collect all nodes with their attachments
        const nodeRows = [];
        const collectNodes = (nodes, prefix = '') => {
            nodes.forEach((n, i) => {
                const path = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
                const links = markerLinksCache[n.id] || [];
                const atts = links.flatMap(l => (l.marker?.attachments || []));
                nodeRows.push({ path, name: n.name || '(bez nazwy)', type: n.type || '', status: n.status || '', owner: n.owner || '', tags: n.tags || [], atts });
                collectNodes(n.children || [], path);
            });
        };
        collectNodes(items);

        // Pre-fetch all images as base64
        const allImageAtts = nodeRows.flatMap(r => r.atts.filter(a => a.fileType === 'IMAGE'));
        const b64Map = {};
        await Promise.all(allImageAtts.map(async att => {
            b64Map[att.fileUrl] = await toBase64(att.fileUrl);
        }));

        // Build HTML
        const tableRows = nodeRows.map(r => {
            const imagesHtml = r.atts.filter(a => a.fileType === 'IMAGE').map(a => {
                const src = b64Map[a.fileUrl];
                return src ? `<div style="page-break-inside:avoid;margin:8px 0"><img src="${src}" style="max-width:100%;height:auto;border-radius:4px" />${a.note ? `<p style="font-size:10px;color:#666;margin:2px 0">${a.note}</p>` : ''}</div>` : '';
            }).join('');
            const filesHtml = r.atts.filter(a => a.fileType !== 'IMAGE').map(a =>
                `<span style="display:inline-block;padding:2px 6px;background:#f0f0f0;border-radius:4px;font-size:10px;margin:2px">${a.fileName}</span>`
            ).join('');
            const tagsHtml = r.tags.map(t => `<span style="display:inline-block;padding:1px 6px;background:#e0e7ff;border-radius:8px;font-size:10px;margin:1px">${t}</span>`).join(' ');

            return `<tr>
                <td style="padding:6px 8px;border:1px solid #ddd;white-space:nowrap;font-family:monospace;font-size:11px;vertical-align:top">${r.path}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;vertical-align:top">${r.name}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;font-size:11px;vertical-align:top">${r.type}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;font-size:11px;vertical-align:top">${r.status}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;font-size:11px;vertical-align:top">${r.owner}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;font-size:11px;vertical-align:top">${tagsHtml}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;vertical-align:top">${imagesHtml}${filesHtml}</td>
            </tr>`;
        }).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>WBS - ${nodeName}</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; margin: 20px; color: #1a1a1a; }
            h1 { font-size: 18px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f3f4f6; padding: 8px; border: 1px solid #ddd; font-size: 10px; text-transform: uppercase; text-align: left; }
            img { max-width: 100%; }
            @media print { body { margin: 10mm; } }
        </style></head><body>
        <h1>WBS — ${nodeName}</h1>
        <table>
            <thead><tr>
                <th>WBS</th><th>Nazwa</th><th>Typ</th><th>Status</th><th>Właściciel</th><th>Znaczniki</th><th>Załączniki</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
        </body></html>`;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 600);
    }, [items, markerLinksCache, nodeName]);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            <div className="w-full overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#0b0f17]">
                        <tr className="border-b border-white/10">
                            <th className="text-left px-1 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-8"></th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 min-w-[320px]">Nazwa</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-28">Typ</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-28">Ilość wymagań</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-20">Jednostka</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-32">Status</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-32">Właściciel</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-24">Zasoby (h)</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-48">Komentarz</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-28">Znaczniki</th>
                            <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-28">Załączniki</th>
                            <th className="w-12" />
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </div>
            </div>{/* end flex-1 scroll */}

            {/* Koszyk nieprzypisanych wymagań */}
            {isManager && unassignedRequirements.length > 0 && (
                <div className="flex-shrink-0 border-t border-white/5 bg-[#0b0f17]">
                    <button
                        onClick={() => setShowBasket(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
                    >
                        <span className="text-[10px] uppercase tracking-widest text-amber-500/70 font-bold flex items-center gap-1.5">
                            <Package size={10} />
                            Koszyk — nieprzypisane ({unassignedRequirements.length})
                            {selectedNodeId && !showBasket && <span className="ml-2 text-gray-600 normal-case tracking-normal font-normal text-[9px]">rozwiń, by przypisać</span>}
                        </span>
                        <ChevronDown size={13} className={`text-amber-500/50 transition-transform ${showBasket ? 'rotate-180' : ''}`} />
                    </button>
                    {showBasket && (
                        <div className="px-4 pb-3 max-h-48 overflow-y-auto custom-scrollbar">
                            {selectedNodeId && (
                                <p className="text-[10px] text-gray-600 mb-2">przeciągnij na wiersz lub kliknij → Przypisz</p>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {unassignedRequirements.map(req => (
                                    <div
                                        key={req.id}
                                        draggable
                                        onDragStart={e => {
                                            e.dataTransfer.setData('application/requirement-id', req.id);
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-900/30 border border-emerald-500/20 rounded-lg text-emerald-300 text-[11px] cursor-grab select-none"
                                    >
                                        <span>{req.name || req.productName || '—'}</span>
                                        {req.quantity > 0 && <span className="text-emerald-500/60 text-[10px]">×{req.quantity}{req.unit ? ` ${req.unit}` : ''}</span>}
                                        {selectedNodeId && (
                                            <button
                                                onClick={e => { e.stopPropagation(); onRequirementAssign?.(selectedNodeId, req.id); }}
                                                className="ml-1 px-1.5 py-0.5 bg-emerald-600/40 hover:bg-emerald-600/70 rounded text-[9px] font-bold text-emerald-200 cursor-pointer"
                                                title="Przypisz do zaznaczonej gałęzi"
                                            >→ Przypisz</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Lightbox — powiększenie załącznika */}
            {lightboxAtt && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95" onClick={() => setLightboxAtt(null)}>
                    <div className="relative w-full h-full flex items-center justify-center p-6" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setLightboxAtt(null)}
                            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10 transition-all">
                            <X size={20} />
                        </button>
                        {lightboxAtt.fileType === 'IMAGE' ? (
                            <img src={`${API_URL}/schematics/file/${lightboxAtt.fileUrl}`}
                                alt={lightboxAtt.fileName}
                                className="max-w-full max-h-full rounded-xl object-contain" />
                        ) : lightboxAtt.fileType === 'AUDIO' ? (
                            <audio controls src={`${API_URL}/schematics/file/${lightboxAtt.fileUrl}`} />
                        ) : (
                            <div className="bg-gray-900 rounded-xl p-10 text-center">
                                <FileText size={56} className="text-gray-500 mx-auto mb-4" />
                                <p className="text-white text-sm">{lightboxAtt.fileName}</p>
                                <a href={`${API_URL}/schematics/file/${lightboxAtt.fileUrl}`} target="_blank" rel="noreferrer"
                                    className="mt-3 inline-block text-blue-400 text-sm hover:underline">Otwórz plik</a>
                            </div>
                        )}
                        {lightboxAtt.note && (
                            <p className="absolute bottom-6 left-0 right-0 text-xs text-gray-400 text-center">{lightboxAtt.note}</p>
                        )}
                    </div>
                </div>
            )}

            {attachmentModal && (
                <MarkerAttachmentsModal
                    wbsNodeId={attachmentModal.wbsNodeId}
                    wbsNodeName={attachmentModal.wbsNodeName}
                    processNodeId={processNodeId}
                    onClose={closeAttachmentModal}
                />
            )}
        </div>
    );
}
