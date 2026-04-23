import React, { useState, useRef, useEffect, useCallback } from 'react';

function AutoResizeTextarea({ value, onChange, onBlur, placeholder, className }) {
    const ref = useRef(null);
    const adjust = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = '0px';
        el.style.height = el.scrollHeight + 'px';
    }, []);
    useEffect(() => {
        const t = setTimeout(adjust, 0);
        return () => clearTimeout(t);
    }, [value, adjust]);
    return (
        <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={e => { onChange(e); adjust(); }}
            onBlur={onBlur}
            placeholder={placeholder}
            className={className}
            style={{ overflow: 'hidden', minHeight: '1.4em' }}
        />
    );
}
import { Plus, Trash2, ChevronRight, ChevronDown, GripVertical, Tag, X, ExternalLink, Paperclip, Image, FileText, Volume2, Link, Unlink, FileDown, Package, Copy, Clipboard } from 'lucide-react';
import { UNIT_OPTIONS } from './wbsConstants';

const API_URL = '/api';

// ─── MaterialReqExpandPanel ───────────────────────────────────────────────────

function MaterialReqExpandPanel({ node, req, processNodeId, onSaved, onDeleteNode }) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const [techSpec, setTechSpec] = React.useState(req?.technicalSpec || '');

    React.useEffect(() => { setTechSpec(req?.technicalSpec || ''); }, [req?.id, req?.technicalSpec]);

    const handleBlur = async () => {
        if (techSpec === (req?.technicalSpec || '')) return;
        if (req?.id) {
            const res = await fetch(`${API_URL}/material-requirements/${req.id}`, {
                method: 'PATCH', headers, body: JSON.stringify({ technicalSpec: techSpec }),
            });
            if (res.ok) onSaved({ ...req, technicalSpec: techSpec });
        } else {
            const reqType = node.type === 'equipment' ? 'DEVICE' : 'MATERIAL';
            const res = await fetch(`${API_URL}/material-requirements`, {
                method: 'POST', headers, body: JSON.stringify({
                    nodeId: processNodeId,
                    name: node.name,
                    type: reqType,
                    quantity: node.quantity || 1,
                    unit: node.unit || 'szt',
                    wbsNodeId: node.id,
                    technicalSpec: techSpec,
                }),
            });
            if (res.ok) onSaved(await res.json());
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Usunąć pozycję „${node.name}" z WBS i wymagania materiałowe?`)) return;
        if (req?.id) {
            await fetch(`${API_URL}/material-requirements/${req.id}`, { method: 'DELETE', headers });
        }
        onDeleteNode?.();
    };

    return (
        <div className="px-6 py-3 flex flex-col gap-2 border-l-2 border-amber-500/30 ml-8">
            <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80">Wymagania materiałowe</span>
                <span className="text-[10px] text-gray-600">Logistyk dopasowuje produkty w zakładce Materiały</span>
                <button
                    onClick={handleDelete}
                    className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                >
                    <Trash2 size={10} /> Usuń z WBS
                </button>
            </div>
            <textarea
                value={techSpec}
                onChange={e => setTechSpec(e.target.value)}
                onBlur={handleBlur}
                rows={3}
                placeholder="Określ wymagania techniczne dla tego materiału/sprzętu (jedno per linia)..."
                className="w-full max-w-2xl bg-black/30 border border-amber-500/20 rounded px-3 py-2 text-xs text-white placeholder-gray-600 outline-none focus:border-amber-500/50 resize-none leading-relaxed"
            />
        </div>
    );
}

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
        status: 'PENDING',
        quantity: '',
        unit: 'sztuki',
        owner: '',
        resources: '',
        cost: '',
        tags: [],
        type: '',
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

const deepCloneNode = node => ({
    ...node,
    id: crypto.randomUUID(),
    children: (node.children || []).map(deepCloneNode),
});

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
// Depth-only: font size/weight, no color
const DEPTH_SIZE = [
    'text-sm font-bold uppercase text-white',
    'text-sm',
    'text-sm',
    'text-xs',
];
const MAX_DEPTH = DEPTH_SIZE.length - 1;

// Per-branch palette: 6 hues × 4 depth variants
// Each entry: [depth0, depth1, depth2, depth3]
const BRANCH_PALETTE = [
    // blue
    [
        { rowBg: 'bg-blue-950/30 hover:bg-blue-900/30',   leftBorder: 'border-l-[3px] border-blue-500',     nameColor: 'text-white',      fieldClass: 'text-blue-200', tagColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
        { rowBg: 'bg-blue-950/20 hover:bg-blue-900/25',   leftBorder: 'border-l-[2px] border-blue-500/60',  nameColor: 'text-blue-100',   fieldClass: 'text-blue-300', tagColor: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
        { rowBg: 'bg-blue-950/12 hover:bg-blue-900/18',   leftBorder: 'border-l-[2px] border-blue-500/40',  nameColor: 'text-blue-200',   fieldClass: 'text-blue-400', tagColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
        { rowBg: 'bg-blue-950/6 hover:bg-blue-900/10',    leftBorder: 'border-l-[1px] border-blue-500/25',  nameColor: 'text-blue-300',   fieldClass: 'text-blue-500', tagColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    ],
    // violet
    [
        { rowBg: 'bg-violet-950/30 hover:bg-violet-900/30', leftBorder: 'border-l-[3px] border-violet-500',    nameColor: 'text-white',       fieldClass: 'text-violet-200', tagColor: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
        { rowBg: 'bg-violet-950/20 hover:bg-violet-900/25', leftBorder: 'border-l-[2px] border-violet-500/60', nameColor: 'text-violet-100',  fieldClass: 'text-violet-300', tagColor: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
        { rowBg: 'bg-violet-950/12 hover:bg-violet-900/18', leftBorder: 'border-l-[2px] border-violet-500/40', nameColor: 'text-violet-200',  fieldClass: 'text-violet-400', tagColor: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
        { rowBg: 'bg-violet-950/6 hover:bg-violet-900/10',  leftBorder: 'border-l-[1px] border-violet-500/25', nameColor: 'text-violet-300',  fieldClass: 'text-violet-500', tagColor: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
    ],
    // teal
    [
        { rowBg: 'bg-teal-950/30 hover:bg-teal-900/30',   leftBorder: 'border-l-[3px] border-teal-500',     nameColor: 'text-white',      fieldClass: 'text-teal-200', tagColor: 'bg-teal-500/20 text-teal-300 border-teal-500/40' },
        { rowBg: 'bg-teal-950/20 hover:bg-teal-900/25',   leftBorder: 'border-l-[2px] border-teal-500/60',  nameColor: 'text-teal-100',   fieldClass: 'text-teal-300', tagColor: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
        { rowBg: 'bg-teal-950/12 hover:bg-teal-900/18',   leftBorder: 'border-l-[2px] border-teal-500/40',  nameColor: 'text-teal-200',   fieldClass: 'text-teal-400', tagColor: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
        { rowBg: 'bg-teal-950/6 hover:bg-teal-900/10',    leftBorder: 'border-l-[1px] border-teal-500/25',  nameColor: 'text-teal-300',   fieldClass: 'text-teal-500', tagColor: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
    ],
    // amber
    [
        { rowBg: 'bg-amber-950/30 hover:bg-amber-900/30', leftBorder: 'border-l-[3px] border-amber-500',    nameColor: 'text-white',       fieldClass: 'text-amber-200', tagColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
        { rowBg: 'bg-amber-950/20 hover:bg-amber-900/25', leftBorder: 'border-l-[2px] border-amber-500/60', nameColor: 'text-amber-100',   fieldClass: 'text-amber-300', tagColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
        { rowBg: 'bg-amber-950/12 hover:bg-amber-900/18', leftBorder: 'border-l-[2px] border-amber-500/40', nameColor: 'text-amber-200',   fieldClass: 'text-amber-400', tagColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
        { rowBg: 'bg-amber-950/6 hover:bg-amber-900/10',  leftBorder: 'border-l-[1px] border-amber-500/25', nameColor: 'text-amber-300',   fieldClass: 'text-amber-500', tagColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    ],
    // rose
    [
        { rowBg: 'bg-rose-950/30 hover:bg-rose-900/30',   leftBorder: 'border-l-[3px] border-rose-500',     nameColor: 'text-white',      fieldClass: 'text-rose-200', tagColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
        { rowBg: 'bg-rose-950/20 hover:bg-rose-900/25',   leftBorder: 'border-l-[2px] border-rose-500/60',  nameColor: 'text-rose-100',   fieldClass: 'text-rose-300', tagColor: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
        { rowBg: 'bg-rose-950/12 hover:bg-rose-900/18',   leftBorder: 'border-l-[2px] border-rose-500/40',  nameColor: 'text-rose-200',   fieldClass: 'text-rose-400', tagColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
        { rowBg: 'bg-rose-950/6 hover:bg-rose-900/10',    leftBorder: 'border-l-[1px] border-rose-500/25',  nameColor: 'text-rose-300',   fieldClass: 'text-rose-500', tagColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
    ],
    // emerald
    [
        { rowBg: 'bg-emerald-950/30 hover:bg-emerald-900/30', leftBorder: 'border-l-[3px] border-emerald-500',    nameColor: 'text-white',         fieldClass: 'text-emerald-200', tagColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
        { rowBg: 'bg-emerald-950/20 hover:bg-emerald-900/25', leftBorder: 'border-l-[2px] border-emerald-500/60', nameColor: 'text-emerald-100',   fieldClass: 'text-emerald-300', tagColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
        { rowBg: 'bg-emerald-950/12 hover:bg-emerald-900/18', leftBorder: 'border-l-[2px] border-emerald-500/40', nameColor: 'text-emerald-200',   fieldClass: 'text-emerald-400', tagColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        { rowBg: 'bg-emerald-950/6 hover:bg-emerald-900/10',  leftBorder: 'border-l-[1px] border-emerald-500/25', nameColor: 'text-emerald-300',   fieldClass: 'text-emerald-500', tagColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    ],
];

// ── Tag chips ─────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function TagChips({ tags = [], tagColor, onRemove, onTagClick }) {
    const visible = tags.map((t, i) => ({ tag: t, idx: i })).filter(({ tag }) =>
        !UUID_RE.test(tag) && !String(tag).startsWith('req:') && tag !== 'auto-requirement');
    return (
        <div className="flex flex-nowrap gap-1 overflow-hidden max-w-full">
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
        <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
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
export default function WBSHybridTable({ wbsTree, setWbsTree, nodeName = 'Projekt', processNodeId, onSave, onTagClick, onTopLevelAdded, onNodesDeleted, onMaterialNodeCreated, users = [], onRequirementDrop = null, isManager = false, requirementsQtyByNode = {}, onRequirementsQtyChange, onNodeStatusChange, unassignedRequirements = [], onRequirementAssign, onNodeFieldSave = null, materialRefreshKey = 0, searchQuery = '', onMaterialReqUpdated = null }) {
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
    const dragIdRef = useRef(null);
    const [dragOver, setDragOver] = useState(null);
    const [editingTagsFor, setEditingTagsFor] = useState(null);
    const [tagInput, setTagInput] = useState('');
    const [markerLinksCache, setMarkerLinksCache] = useState({});
    const [attachmentModal, setAttachmentModal] = useState(null); // { wbsNodeId, wbsNodeName }
    const [lightboxAtt, setLightboxAtt] = useState(null); // attachment for fullscreen preview
    const tagInputRef = useRef(null);
    const [materialStatuses, setMaterialStatuses] = useState({});
    const [matReqByWbsId, setMatReqByWbsId] = useState({});
    const [expandedMaterialIds, setExpandedMaterialIds] = useState(new Set());
    const [reqDragOverNode, setReqDragOverNode] = useState(null);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [showBasket, setShowBasket] = useState(false);
    const [copyBuffer, setCopyBuffer] = useState(null); // { node, sourceName }
    const [colWidths, setColWidths] = useState({ nazwa: 320, typ: 120, ilosc: 80, jednostka: 90, status: 128, wlasciciel: 128, komentarz: 200, znaczniki: 120, zalaczniki: 120 });
    const resizeDrag = useRef(null);

    const startColResize = (col, e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = colWidths[col] ?? 120;
        resizeDrag.current = { col, startX, startW };
        const onMove = (ev) => {
            if (!resizeDrag.current) return;
            const w = Math.max(60, resizeDrag.current.startW + ev.clientX - resizeDrag.current.startX);
            setColWidths(prev => ({ ...prev, [resizeDrag.current.col]: w }));
        };
        const onUp = () => { resizeDrag.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

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
                    const reqMap = {};
                    data.forEach(r => {
                        if (r.name) map[r.name.toLowerCase()] = r.status;
                        if (r.wbsNodeId) reqMap[r.wbsNodeId] = r;
                    });
                    setMaterialStatuses(map);
                    setMatReqByWbsId(reqMap);
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
        if (!window.confirm('Usunąć ten węzeł i wszystkie podgałęzie?')) return;
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
        dragIdRef.current = nodeId;
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
        const currentDragId = dragIdRef.current;
        if (!currentDragId || currentDragId === nodeId) return;
        const dragNode = findNode(items, currentDragId);
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
        const currentDragId = dragIdRef.current;
        if (!currentDragId || !dragOver || dragOver.nodeId !== nodeId || currentDragId === nodeId) {
            dragIdRef.current = null; setDragId(null); setDragOver(null); return;
        }
        const [extracted, withoutDrag] = extractNode(items, currentDragId);
        if (!extracted) { dragIdRef.current = null; setDragId(null); setDragOver(null); return; }
        const newItems = insertNode(withoutDrag, nodeId, extracted, dragOver.position);
        save({ ...wbsTree, items: newItems });
        dragIdRef.current = null; setDragId(null); setDragOver(null);
    };

    const onDragEnd = () => { dragIdRef.current = null; setDragId(null); setDragOver(null); setReqDragOverNode(null); };

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
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
        </tr>
    );

    // ── Recursive renderer ────────────────────────────────────────────────────
    const renderNode = (node, depth, wbsPath, parentId = null, rootIndex = 0) => {
        if (searchVisibleIds && !searchVisibleIds.has(node.id)) {
            (node.children || []).forEach((child, ci) => renderNode(child, depth + 1, `${wbsPath}.${ci + 1}`, node.id, rootIndex));
            return;
        }
        const rowId = `node_${node.id}`;
        const bc = BRANCH_PALETTE[rootIndex % BRANCH_PALETTE.length][Math.min(depth, MAX_DEPTH)];
        const d = { ...bc, nameClass: `${DEPTH_SIZE[Math.min(depth, MAX_DEPTH)]} ${bc.nameColor}` };
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
                    <div className="flex items-center gap-1">
                        <GripVertical
                            size={11}
                            className="text-gray-700 group-hover/node:text-gray-500 flex-shrink-0"
                        />
                        {hasChildren
                            ? <ChevronRight size={12} className={`text-gray-400 transition-transform flex-shrink-0 ${isOpen(rowId) ? 'rotate-90' : ''}`} />
                            : <span className="w-[12px] flex-shrink-0" />
                        }
                        {(node.type === 'material' || node.type === 'equipment') && (
                            <button
                                title="Wymagania materiałowe"
                                onClick={e => { e.stopPropagation(); setExpandedMaterialIds(prev => { const n = new Set(prev); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n; }); }}
                                className={`p-0.5 rounded transition-all flex-shrink-0 ${expandedMaterialIds.has(node.id) ? 'text-amber-400 bg-amber-500/10' : 'text-gray-600 hover:text-amber-400'}`}
                            >
                                <FileText size={9} />
                            </button>
                        )}
                        <div className="flex flex-col gap-0.5 opacity-0 group-hover/node:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button
                                title="Kopiuj pozycję"
                                onClick={e => { e.stopPropagation(); setCopyBuffer({ node: findNode(items, node.id), sourceName: node.name }); }}
                                className="p-0.5 rounded hover:bg-blue-500/20 text-gray-600 hover:text-blue-400 transition-all"
                            >
                                <Copy size={9} />
                            </button>
                            {copyBuffer && !subtreeContains(copyBuffer.node, node.id) && copyBuffer.node.id !== node.id && (
                                <button
                                    title={`Wklej „${copyBuffer.sourceName}" jako dziecko`}
                                    onClick={e => { e.stopPropagation(); const cloned = deepCloneNode(copyBuffer.node); save({ ...wbsTree, items: addChildTo(items, node.id, cloned) }); setCopyBuffer(null); }}
                                    className="p-0.5 rounded hover:bg-emerald-500/20 text-gray-600 hover:text-emerald-400 transition-all"
                                >
                                    <Clipboard size={9} />
                                </button>
                            )}
                        </div>
                    </div>
                </td>

                {/* Nazwa */}
                <td className="px-3 py-1.5 select-text" style={{ paddingLeft: `calc(0.75rem + ${depth * 14}px)` }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-start gap-1.5">
                        <AutoResizeTextarea
                            value={node.name || ''}
                            onChange={e => handleField(node.id, 'name', e.target.value)}
                            onBlur={() => {
                                onSave?.();
                                if ((node.type === 'equipment' || node.type === 'material') && node.name) {
                                    onMaterialNodeCreated?.({ wbsNodeId: node.id, name: node.name, type: node.type, parentId });
                                }
                            }}
                            placeholder={depth === 0 ? 'Nazwa przedmiotu projektu…' : 'Nazwa elementu…'}
                            className={`bg-transparent border-none resize-none focus:outline-none placeholder-gray-700 w-full min-w-0 select-text leading-snug ${d.nameClass}`}
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

                {/* Ilość */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {depth >= 1 && (
                        <input type="text" value={node.quantity || ''} onChange={e => handleField(node.id, 'quantity', e.target.value)}
                            onBlur={e => { onSave?.(); onRequirementsQtyChange?.(node.id, e.target.value, node.name); }}
                            placeholder="0" className={`bg-transparent border-none focus:outline-none text-xs w-full text-right placeholder-gray-700 ${d.fieldClass}`} />
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

                {/* Komentarz */}
                <td className="px-3 py-2.5 min-w-[180px]" onClick={e => e.stopPropagation()}>
                    <AutoResizeTextarea
                        value={node.comment || ''}
                        onChange={e => handleField(node.id, 'comment', e.target.value)}
                        onBlur={e => { onNodeFieldSave?.(node.id, 'comment', e.target.value); onSave?.(); }}
                        placeholder="—"
                        className={`bg-transparent border-none resize-none focus:outline-none text-xs w-full placeholder-gray-700 leading-snug ${d.fieldClass}`}
                    />
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

        if ((node.type === 'material' || node.type === 'equipment') && expandedMaterialIds.has(node.id)) {
            rows.push(
                <tr key={`mat-req-${node.id}`}>
                    <td colSpan={13} className="p-0 border-b border-amber-500/10 bg-amber-500/[0.02]">
                        <MaterialReqExpandPanel
                            node={node}
                            req={matReqByWbsId[node.id] || null}
                            processNodeId={processNodeId}
                            onSaved={updated => { setMatReqByWbsId(prev => ({ ...prev, [node.id]: updated })); onMaterialReqUpdated?.(); }}
                            onDeleteNode={() => {
                                const deletedIds = collectIds(items, node.id);
                                save({ ...wbsTree, items: deleteNode(items, node.id) });
                                if (deletedIds.length) onNodesDeleted?.(deletedIds);
                                setExpandedMaterialIds(prev => { const n = new Set(prev); n.delete(node.id); return n; });
                            }}
                        />
                    </td>
                </tr>
            );
        }

        if (searchVisibleIds || isOpen(rowId)) {
            (node.children || []).forEach((child, ci) => {
                renderNode(child, depth + 1, `${wbsPath}.${ci + 1}`, node.id, rootIndex);
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
        items.forEach((item, i) => renderNode(item, 0, `${i + 1}`, null, i));
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
                nodeRows.push({
                    path,
                    name: n.name || '(bez nazwy)',
                    type: n.type || '',
                    status: n.status || '',
                    quantity: n.quantity || '',
                    unit: n.unit || '',
                    cost: n.cost || '',
                    comment: n.comment || '',
                    tags: n.tags || [],
                    atts,
                });
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

        const cell = (content, extra = '') =>
            `<td style="padding:5px 7px;border:1px solid #ddd;font-size:11px;vertical-align:top${extra ? ';' + extra : ''}">${content}</td>`;

        // Build HTML
        const tableRows = nodeRows.map(r => {
            const imagesHtml = r.atts.filter(a => a.fileType === 'IMAGE').map(a => {
                const src = b64Map[a.fileUrl];
                return src ? `<div style="page-break-inside:avoid;margin:6px 0"><img src="${src}" style="max-width:100%;height:auto;border-radius:4px" />${a.note ? `<p style="font-size:10px;color:#666;margin:2px 0">${a.note}</p>` : ''}</div>` : '';
            }).join('');
            const filesHtml = r.atts.filter(a => a.fileType !== 'IMAGE').map(a =>
                `<span style="display:inline-block;padding:2px 6px;background:#f0f0f0;border-radius:4px;font-size:10px;margin:2px">${a.fileName}</span>`
            ).join('');
            const tagsHtml = r.tags.map(t => `<span style="display:inline-block;padding:1px 6px;background:#e0e7ff;border-radius:8px;font-size:10px;margin:1px">${t}</span>`).join(' ');

            return `<tr>
                ${cell(r.path, 'white-space:nowrap;font-family:monospace')}
                ${cell(r.name)}
                ${cell(r.type)}
                ${cell(r.quantity, 'text-align:right')}
                ${cell(r.unit)}
                ${cell(r.status)}
                ${cell(r.cost, 'text-align:right')}
                ${cell(r.comment)}
                ${cell(tagsHtml)}
                ${cell(imagesHtml + filesHtml)}
            </tr>`;
        }).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>WBS - ${nodeName}</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; margin: 20px; color: #1a1a1a; }
            h1 { font-size: 18px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            col.c-wbs  { width: 60px; }
            col.c-name { width: 200px; }
            col.c-sm   { width: 60px; }
            col.c-xs   { width: 50px; }
            col.c-md   { width: 90px; }
            col.c-lg   { width: 130px; }
            col.c-xl   { width: 160px; }
            col.c-att  { width: 140px; }
            th { background: #f3f4f6; padding: 6px 7px; border: 1px solid #ddd; font-size: 10px; text-transform: uppercase; text-align: left; }
            img { max-width: 100%; }
            @media print { body { margin: 8mm; } @page { size: A3 landscape; } }
        </style></head><body>
        <h1>WBS — ${nodeName}</h1>
        <table>
            <colgroup>
                <col class="c-wbs"/><col class="c-name"/><col class="c-sm"/>
                <col class="c-xs"/><col class="c-xs"/><col class="c-md"/>
                <col class="c-sm"/><col class="c-xl"/><col class="c-lg"/><col class="c-att"/>
            </colgroup>
            <thead><tr>
                <th>WBS</th><th>Nazwa</th><th>Typ</th>
                <th style="text-align:right">Ilość</th><th>Jednostka</th><th>Status</th>
                <th style="text-align:right">Koszt</th>
                <th>Komentarz</th><th>Znaczniki</th><th>Załączniki</th>
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
            {copyBuffer && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 border-b border-blue-500/20 text-[11px] text-blue-300">
                    <Clipboard size={12} className="flex-shrink-0" />
                    <span>Kopiujesz: <strong>{copyBuffer.sourceName || '—'}</strong> — najedź na wiersz i kliknij <Clipboard size={10} className="inline" /> by wkleić jako dziecko</span>
                    <button onClick={() => setCopyBuffer(null)} className="ml-auto p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-white"><X size={12} /></button>
                </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto overflow-x-auto custom-scrollbar">
            <div className="w-full">
                <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <colgroup>
                        <col style={{ width: 32 }} />
                        <col style={{ width: colWidths.nazwa }} />
                        <col style={{ width: colWidths.typ }} />
                        <col style={{ width: colWidths.ilosc }} />
                        <col style={{ width: colWidths.jednostka }} />
                        <col style={{ width: colWidths.status }} />
                        <col style={{ width: colWidths.wlasciciel }} />
                        <col style={{ width: colWidths.komentarz }} />
                        <col style={{ width: colWidths.znaczniki }} />
                        <col style={{ width: colWidths.zalaczniki }} />
                        <col style={{ width: 48 }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-[#0b0f17]">
                        <tr className="border-b border-white/10">
                            <th className="px-1 py-2.5 text-base font-bold uppercase tracking-widest text-white" />
                            {[['nazwa','Nazwa','text-left'],['typ','Typ','text-left'],['ilosc','Ilość','text-right'],['jednostka','Jednostka','text-left'],['status','Status','text-left'],['wlasciciel','Właściciel','text-left'],['komentarz','Komentarz','text-left'],['znaczniki','Znaczniki','text-left'],['zalaczniki','Załączniki','text-left']].map(([key, label, align]) => (
                                <th key={key} className={`px-3 py-2.5 text-base font-bold uppercase tracking-widest text-white ${align} relative select-none`}>
                                    {label}
                                    <div onMouseDown={e => startColResize(key, e)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors" />
                                </th>
                            ))}
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
