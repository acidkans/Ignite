import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';

function AutoResizeTextarea({ value, onChange, onBlur, placeholder, className, style }) {
    const ref = useRef(null);
    const adjust = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // Element niewidoczny (parent collapsed/display:none) → scrollHeight=0;
        // nie ustawiaj 0px, bo po rozwinięciu textarea ma height:0 i tekst wygląda jak „przekreślony".
        if (el.offsetParent === null && el.getClientRects().length === 0) return;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }, []);
    useLayoutEffect(() => { adjust(); }, [value, adjust]);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        // Gdy parent się rozwinie i textarea staje się widoczny, RO odpala się i wymusza przeliczenie.
        const ro = new ResizeObserver(() => adjust());
        ro.observe(el);
        return () => ro.disconnect();
    }, [adjust]);
    return (
        <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={e => { onChange(e); adjust(); }}
            onBlur={onBlur}
            onFocus={adjust}
            placeholder={placeholder}
            className={className}
            style={{ overflow: 'hidden', minHeight: '1.4em', resize: 'none', ...(style || {}) }}
        />
    );
}
import { Plus, Trash2, ChevronRight, ChevronDown, GripVertical, Tag, X, ExternalLink, Paperclip, Image, FileText, Volume2, Link, Unlink, FileDown, Package, Copy, Clipboard, HelpCircle } from 'lucide-react';

// ── Q&A cell — zagnieżdżona tabela Pytanie / Odpowiedź per WBS node ───────────
function QaPairRow({ p, idx, fieldClass, onUpdate, onRemove, onPersist }) {
    const qRef = useRef(null);
    const aRef = useRef(null);
    const syncHeights = useCallback(() => {
        const q = qRef.current;
        const a = aRef.current;
        if (!q || !a) return;
        q.style.height = 'auto';
        a.style.height = 'auto';
        const h = Math.max(q.scrollHeight, a.scrollHeight);
        q.style.height = h + 'px';
        a.style.height = h + 'px';
    }, []);
    useLayoutEffect(() => { requestAnimationFrame(() => syncHeights()); }, [p.question, p.answer, syncHeights]);
    useEffect(() => {
        const q = qRef.current;
        if (!q) return;
        const obs = new ResizeObserver(() => syncHeights());
        obs.observe(q);
        return () => obs.disconnect();
    }, [syncHeights]);

    return (
        <tr className="align-top">
            <td className="pr-1 py-0.5 border-t border-white/5">
                <textarea
                    ref={qRef}
                    rows={1}
                    value={p.question || ''}
                    onChange={e => { onUpdate(idx, 'question', e.target.value); syncHeights(); }}
                    onBlur={() => onPersist?.()}
                    onFocus={syncHeights}
                    placeholder="Pytanie…"
                    className={`bg-black/20 border border-white/10 rounded px-1.5 py-0.5 text-[11px] w-full focus:outline-none focus:border-blue-500/50 placeholder-gray-700 ${fieldClass}`}
                    style={{ overflow: 'hidden', minHeight: '1.4em', resize: 'none' }}
                />
            </td>
            <td className="pr-1 py-0.5 border-t border-white/5">
                <textarea
                    ref={aRef}
                    rows={1}
                    value={p.answer || ''}
                    onChange={e => { onUpdate(idx, 'answer', e.target.value); syncHeights(); }}
                    onBlur={() => onPersist?.()}
                    onFocus={syncHeights}
                    placeholder="Odpowiedź…"
                    className={`bg-black/20 border border-white/10 rounded px-1.5 py-0.5 text-[11px] w-full focus:outline-none focus:border-blue-500/50 placeholder-gray-700 ${fieldClass}`}
                    style={{ overflow: 'hidden', minHeight: '1.4em', resize: 'none' }}
                />
            </td>
            <td className="py-0.5 border-t border-white/5">
                <button
                    onClick={() => onRemove(idx)}
                    className="p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Usuń pytanie"
                >
                    <X size={9} />
                </button>
            </td>
        </tr>
    );
}

function QaCell({ pairs, fieldClass, onChange, onPersist }) {
    const list = Array.isArray(pairs) ? pairs : [];
    const update = (idx, field, value) => {
        onChange(list.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    };
    const remove = (idx) => { onChange(list.filter((_, i) => i !== idx)); onPersist?.(); };
    const add = () => { onChange([...list, { question: '', answer: '' }]); };

    return (
        <div className="flex flex-col gap-1">
            {list.length > 0 && (
                <table className="w-full text-[11px] border-collapse">
                    <thead>
                        <tr>
                            <th className="text-left font-semibold uppercase tracking-wider text-gray-500 pb-0.5 w-1/2">Pytanie</th>
                            <th className="text-left font-semibold uppercase tracking-wider text-gray-500 pb-0.5 w-1/2">Odpowiedź</th>
                            <th className="w-4" />
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((p, idx) => (
                            <QaPairRow
                                key={idx}
                                p={p}
                                idx={idx}
                                fieldClass={fieldClass}
                                onUpdate={update}
                                onRemove={remove}
                                onPersist={onPersist}
                            />
                        ))}
                    </tbody>
                </table>
            )}
            <button
                onClick={add}
                className="self-start flex items-center gap-1 text-[10px] text-gray-600 hover:text-blue-400 transition-all"
            >
                <HelpCircle size={9} />
                <span>+ pytanie</span>
            </button>
        </div>
    );
}
import { UNIT_OPTIONS } from './wbsConstants';
import { ProductCard } from './WbsMaterialsPanel';

const API_URL = '/api';

// ─── MaterialReqExpandPanel ───────────────────────────────────────────────────

function MaterialReqExpandPanel({ node, req, processNodeId, onSaved, onDeleteNode }) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const headers = React.useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    const [card, setCard] = React.useState(req || null);
    const [materialDb, setMaterialDb] = React.useState([]);
    const [offers, setOffers] = React.useState([]);

    // Jeśli nie ma karty — utwórz ją automatycznie
    React.useEffect(() => {
        if (card) { setCard(req); return; }
        if (!node.id) return;
        const reqType = node.type === 'equipment' ? 'DEVICE' : 'MATERIAL';
        fetch(`${API_URL}/material-requirements`, {
            method: 'POST', headers,
            body: JSON.stringify({
                nodeId: processNodeId, name: node.name, type: reqType,
                quantity: node.quantity || 1, unit: node.unit || 'sztuki', wbsNodeId: node.id,
            }),
        }).then(r => r.ok ? r.json() : null).then(data => { if (data) { setCard(data); onSaved?.(data); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id]);

    React.useEffect(() => { setCard(req); }, [req]);

    React.useEffect(() => {
        const auth = { Authorization: `Bearer ${token}` };
        fetch(`${API_URL}/material-requirements/all-materials`, { headers: auth }).then(r => r.ok ? r.json() : []).then(setMaterialDb);
        fetch(`${API_URL}/offers/node/${processNodeId}`, { headers: auth }).then(r => r.ok ? r.json() : []).then(setOffers);
    }, [processNodeId, token]);

    const handleDelete = async () => {
        if (!window.confirm(`Usunąć pozycję „${node.name}" z WBS i wymagania materiałowe?`)) return;
        if (card?.id) await fetch(`${API_URL}/material-requirements/${card.id}`, { method: 'DELETE', headers });
        onDeleteNode?.();
    };

    return (
        <div className="border-l-2 border-amber-500/30 ml-8">
            <div className="flex items-center gap-3 px-4 pt-3 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80">Wymagania materiałowe</span>
                <button
                    onClick={handleDelete}
                    className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                >
                    <Trash2 size={10} /> Usuń z WBS
                </button>
            </div>
            {card ? (
                <ProductCard
                    card={card}
                    wbsNode={{ id: node.id, name: node.name }}
                    token={token}
                    materialDb={materialDb}
                    offers={offers}
                    onRefresh={updated => { setCard(updated); onSaved?.(updated); }}
                    onPropagatePrice={() => {}}
                    readOnly={false}
                />
            ) : (
                <div className="px-4 py-3 text-[10px] text-gray-600">Tworzenie karty materiałowej…</div>
            )}
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
        qa: [],
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
    const cleaned = clean(nodes); // musi być przed odczytem `found` — literał tablicy [found, clean(nodes)] czyta found PRZED wywołaniem clean
    return [found, cleaned];
};

const deepCloneNode = node => ({
    ...node,
    id: crypto.randomUUID(),
    children: (node.children || []).map(deepCloneNode),
});

// Wariant zwracający również mapping (oldId → newId) całego poddrzewa,
// potrzebny do skopiowania powiązanych wymagań technicznych po stronie backendu.
const deepCloneNodeWithMappings = (node) => {
    const mappings = [];
    const cloneRec = (n) => {
        const newId = crypto.randomUUID();
        mappings.push({ sourceWbsNodeId: n.id, targetWbsNodeId: newId });
        return {
            ...n,
            id: newId,
            children: (n.children || []).map(cloneRec),
        };
    };
    return { clone: cloneRec(node), mappings };
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
// Depth-only: font size/weight, no color
const DEPTH_SIZE = [
    'text-sm font-bold uppercase text-white',
    'text-sm',
    'text-sm',
    'text-xs',
];
const MAX_DEPTH = DEPTH_SIZE.length - 1;

// Naprzemienne palety: niebieska (parzyste gałęzie) / pomarańczowa (nieparzyste)
// Głębszy poziom = ciemniejszy odcień tła (depth 0 = najjaśniejszy, depth 3 = najciemniejszy)
const BRANCH_PALETTE = [
    // sky — parzyste gałęzie top-level (0, 2, 4, …)
    [
        { rowBg: 'bg-sky-500/[8%] hover:bg-sky-500/[13%]',    leftBorder: 'border-l-[3px] border-sky-400/70',  nameColor: 'text-white',    fieldClass: 'text-sky-200',  tagColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
        { rowBg: 'bg-sky-500/[15%] hover:bg-sky-500/[20%]',   leftBorder: 'border-l-[2px] border-sky-400/55',  nameColor: 'text-sky-100',  fieldClass: 'text-sky-200',  tagColor: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
        { rowBg: 'bg-sky-500/[22%] hover:bg-sky-500/[28%]',   leftBorder: 'border-l-[2px] border-sky-400/40',  nameColor: 'text-sky-200',  fieldClass: 'text-sky-300',  tagColor: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
        { rowBg: 'bg-sky-500/[30%] hover:bg-sky-500/[37%]',   leftBorder: 'border-l-[1px] border-sky-400/30',  nameColor: 'text-sky-300',  fieldClass: 'text-sky-400',  tagColor: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
    ],
    // orange — nieparzyste gałęzie top-level (1, 3, 5, …)
    [
        { rowBg: 'bg-orange-500/[8%] hover:bg-orange-500/[13%]',  leftBorder: 'border-l-[3px] border-orange-400/70', nameColor: 'text-white',      fieldClass: 'text-orange-200', tagColor: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
        { rowBg: 'bg-orange-500/[15%] hover:bg-orange-500/[20%]', leftBorder: 'border-l-[2px] border-orange-400/55', nameColor: 'text-orange-100',  fieldClass: 'text-orange-200', tagColor: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
        { rowBg: 'bg-orange-500/[22%] hover:bg-orange-500/[28%]', leftBorder: 'border-l-[2px] border-orange-400/40', nameColor: 'text-orange-200',  fieldClass: 'text-orange-300', tagColor: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
        { rowBg: 'bg-orange-500/[30%] hover:bg-orange-500/[37%]', leftBorder: 'border-l-[1px] border-orange-400/30', nameColor: 'text-orange-300',  fieldClass: 'text-orange-400', tagColor: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
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
                className="w-8 h-8 rounded overflow-hidden border border-white/10 hover:border-blue-500/60 transition-all flex-shrink-0 bg-black/20">
                <img src={url} alt={att.fileName} className="w-full h-full object-cover"
                    onError={e => { e.target.style.display = 'none'; }} />
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
    if (allAtts.length === 0) return null;

    const open = (e) => { e?.stopPropagation?.(); onOpenModal({ wbsNodeId, wbsNodeName: nodeName }); };
    const hasImg = allAtts.some(a => a.fileType === 'IMAGE');
    const hasAudio = allAtts.some(a => a.fileType === 'AUDIO');
    const Icon = hasImg ? Image : hasAudio ? Volume2 : Paperclip;

    return (
        <button
            onClick={open}
            title={`${allAtts.length} załącznik(ów) — kliknij aby otworzyć`}
            className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-blue-400 transition-all"
        >
            <Icon size={18} />
        </button>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function WBSHybridTable({ wbsTree, setWbsTree, nodeName = 'Projekt', processNodeId, onSave, onTagClick, onTopLevelAdded, onNodesDeleted, onMaterialNodeCreated, users = [], projectContacts = [], onRequirementDrop = null, isManager = false, requirementsQtyByNode = {}, onRequirementsQtyChange, onNodeStatusChange, unassignedRequirements = [], onRequirementAssign, onNodeFieldSave = null, materialRefreshKey = 0, searchQuery = '', onMaterialReqUpdated = null, onPasteCloned = null }) {
    const getAllIds = useCallback((items) => {
        const ids = ['root'];
        const walk = (nodes) => nodes?.forEach(n => { ids.push(`node_${n.id}`); walk(n.children); });
        walk(items);
        return new Set(ids);
    }, []);
    const [expanded, setExpanded] = useState(() => new Set());
    const initialExpandDoneRef = useRef(false);
    // Domyślnie rozwiń tylko do 2. poziomu (root + węzły top-level) przy pierwszym
    // załadowaniu — kolejne fetch'e nie nadpiszą ręcznych collapse'ów (ref pilnuje).
    useEffect(() => {
        if (initialExpandDoneRef.current) return;
        const items = wbsTree?.items || [];
        if (items.length === 0) return;
        const ids = new Set(['root']);
        for (const n of items) ids.add(`node_${n.id}`);
        setExpanded(ids);
        initialExpandDoneRef.current = true;
    }, [wbsTree]);
    const [dragId, setDragId] = useState(null);
    const dragIdRef = useRef(null);
    const [dragOver, setDragOverState] = useState(null);
    const dragOverRef = useRef(null);
    const setDragOver = (val) => { dragOverRef.current = val; setDragOverState(val); };
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
    const [colWidths, setColWidths] = useState({ nazwa: 320, typ: 120, ilosc: 80, jednostka: 90, status: 128, wlasciciel: 128, komentarz: 200, qa: 260, zalaczniki: 44 });
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
        // Firefox wymaga setData żeby drag w ogóle wystartował
        try { e.dataTransfer.setData('application/wbs-node-id', nodeId); } catch {}
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
        const currentDragOver = dragOverRef.current;
        if (!currentDragId || !currentDragOver || currentDragOver.nodeId !== nodeId || currentDragId === nodeId) {
            dragIdRef.current = null; setDragId(null); setDragOver(null); return;
        }
        const [extracted, withoutDrag] = extractNode(items, currentDragId);
        if (!extracted) { dragIdRef.current = null; setDragId(null); setDragOver(null); return; }
        const newItems = insertNode(withoutDrag, nodeId, extracted, currentDragOver.position);
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
                    className="px-2 py-2.5 cursor-grab min-w-[96px] w-[96px]"
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
                        <div className="relative z-20 flex flex-col gap-1 opacity-0 group-hover/node:opacity-100 transition-opacity" draggable={false} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                            <button
                                title="Kopiuj pozycję"
                                onMouseDown={e => e.stopPropagation()}
                                onPointerDown={e => e.stopPropagation()}
                                onClick={e => { e.stopPropagation(); setCopyBuffer({ node: findNode(items, node.id), sourceName: node.name }); }}
                                className="p-1.5 rounded bg-black/40 hover:bg-blue-500/40 text-gray-300 hover:text-white transition-all"
                            >
                                <Copy size={16} />
                            </button>
                            {copyBuffer && !subtreeContains(copyBuffer.node, node.id) && copyBuffer.node.id !== node.id && (
                                <button
                                    title={`Wklej „${copyBuffer.sourceName}" jako dziecko (z wymaganiami technicznymi, typem i statusem)`}
                                    onMouseDown={e => e.stopPropagation()}
                                    onPointerDown={e => e.stopPropagation()}
                                    onClick={e => {
                                        e.stopPropagation();
                                        const { clone, mappings } = deepCloneNodeWithMappings(copyBuffer.node);
                                        save({ ...wbsTree, items: addChildTo(items, node.id, clone) });
                                        setCopyBuffer(null);
                                        if (mappings.length > 0) onPasteCloned?.(mappings);
                                    }}
                                    className="p-1.5 rounded bg-black/40 hover:bg-emerald-500/40 text-gray-300 hover:text-emerald-200 transition-all"
                                >
                                    <Clipboard size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </td>

                {/* Nazwa */}
                <td className="px-3 py-1.5 select-text relative" style={{ paddingLeft: `calc(0.75rem + ${depth * 14}px)`, paddingRight: '3.5rem' }} onClick={e => e.stopPropagation()}>
                    <AutoResizeTextarea
                        value={node.name || ''}
                        onChange={e => handleField(node.id, 'name', e.target.value)}
                        onBlur={() => {
                            onSave?.();
                            if (node.name) onNodeFieldSave?.(node.id, 'name', node.name);
                            if ((node.type === 'equipment' || node.type === 'material') && node.name) {
                                onMaterialNodeCreated?.({ wbsNodeId: node.id, name: node.name, type: node.type, parentId });
                            }
                        }}
                        placeholder={depth === 0 ? 'Nazwa przedmiotu projektu…' : 'Nazwa elementu…'}
                        className={`w-full bg-transparent border-none resize-none focus:outline-none placeholder-gray-700 min-w-[60px] select-text leading-snug ${d.nameClass}`}
                    />
                    <div className="absolute top-1/2 -translate-y-1/2 right-1 flex items-center gap-1">
                        {(node.type === 'material' || node.type === 'equipment') && (
                            <button
                                onClick={e => { e.stopPropagation(); setExpandedMaterialIds(prev => { const n = new Set(prev); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n; }); }}
                                title="Karta materiałowa"
                                className={`p-1 rounded transition-all ${expandedMaterialIds.has(node.id) ? 'text-amber-400 bg-amber-500/15' : 'text-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10'}`}
                            >
                                <Package size={14} />
                            </button>
                        )}
                        {depth < MAX_DEPTH && (
                            <button
                                onClick={e => handleAddChild(node.id, e)}
                                className="p-1.5 hover:bg-white/10 rounded text-gray-500 hover:text-blue-400 transition-all"
                                title="Dodaj element podrzędny"
                            >
                                <Plus size={16} />
                            </button>
                        )}
                        <button
                            onClick={e => handleDelete(node.id, e)}
                            className="p-1 hover:bg-red-500/10 rounded text-gray-600 hover:text-red-500 transition-all"
                            title="Usuń"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                </td>

                {/* Typ — dla wszystkich poziomów poza rootem */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {depth >= 1 && (
                        <select
                            value={node.type || ''}
                            onChange={e => {
                                const newType = e.target.value;
                                const isMaterial = newType === 'equipment' || newType === 'material';
                                const wasWork = node.type === 'work' || node.type === 'service';
                                handleField(node.id, 'type', newType);
                                onNodeFieldSave?.(node.id, 'type', newType);
                                if (isMaterial && wasWork) {
                                    handleField(node.id, 'unit', 'sztuki');
                                    onNodeFieldSave?.(node.id, 'unit', 'sztuki');
                                }
                                onSave?.();
                                if (isMaterial && node.name) {
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
                            onFocus={e => e.target.select()} onMouseUp={e => e.target.select()}
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
                    {(users.length > 0 || projectContacts.length > 0) ? (
                        <select
                            value={node.owner || ''}
                            onChange={e => { handleField(node.id, 'owner', e.target.value); onSave?.(); }}
                            className={`bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-xs w-full focus:outline-none focus:border-blue-500 transition-colors cursor-pointer ${d.fieldClass}`}
                        >
                            <option value="" className="bg-gray-900">—</option>
                            {users.length > 0 && users.map(u => {
                                const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
                                const label = u.company ? `${u.company} — ${name}` : name;
                                return <option key={u.id} value={label} className="bg-gray-900">{label}</option>;
                            })}
                            {projectContacts.length > 0 && users.length > 0 && <option disabled className="bg-gray-900">──────────</option>}
                            {projectContacts.length > 0 && projectContacts.map(c => {
                                const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email;
                                const label = c.company ? `${c.company} - ${fullName}` : fullName;
                                const alreadyInUsers = users.some(u => ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email) === fullName);
                                if (alreadyInUsers) return null;
                                return <option key={c.id} value={label} className="bg-gray-900">{label}</option>;
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
                        onBlur={e => { onNodeFieldSave?.(node.id, 'comment', e.target.value); onSave?.(); window.dispatchEvent(new CustomEvent('wbs-comment-changed', { detail: { wbsNodeIds: [node.id], comment: e.target.value } })); }}
                        placeholder="—"
                        className={`bg-transparent border-none resize-none focus:outline-none text-xs w-full placeholder-gray-700 leading-snug ${d.fieldClass}`}
                    />
                </td>

                {/* Q&A — zagnieżdżona tabela Pytanie / Odpowiedź */}
                <td className="px-3 py-2.5 min-w-[200px]" onClick={e => e.stopPropagation()}>
                    <QaCell
                        pairs={Array.isArray(node.qa) ? node.qa : []}
                        fieldClass={d.fieldClass}
                        onChange={(next) => handleField(node.id, 'qa', next)}
                        onPersist={() => onSave?.()}
                    />
                </td>

                {/* Załączniki — miniatury zdjęć z markerów */}
                <td className="px-2 py-2 overflow-hidden max-w-0" style={{ width: colWidths.zalaczniki }} onClick={e => e.stopPropagation()}>
                    <AttachmentCell
                        wbsNodeId={node.id}
                        nodeName={node.name}
                        markerLinksCache={markerLinksCache}
                        onOpenModal={setAttachmentModal}
                        onPreview={setLightboxAtt}
                    />
                </td>

                {/* (delete przeniesiony do komórki nazwy) */}
                <td />
            </tr>
        );

        if ((node.type === 'material' || node.type === 'equipment') && expandedMaterialIds.has(node.id)) {
            rows.push(
                <tr key={`mat-req-${node.id}`}>
                    <td colSpan={11} className="p-0 border-b border-amber-500/10 bg-amber-500/[0.02]">
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
                    <td colSpan={10} className="px-3 py-3 pl-16 text-[10px] text-gray-700 italic">
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

        // Collect only visible (expanded) nodes with their attachments
        const nodeRows = [];
        const collectNodes = (nodes, prefix = '', depth = 0) => {
            nodes.forEach((n, i) => {
                const path = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
                const links = markerLinksCache[n.id] || [];
                const atts = links.flatMap(l => (l.marker?.attachments || []));
                nodeRows.push({
                    path,
                    name: n.name || '(bez nazwy)',
                    status: n.status || '',
                    quantity: n.quantity || '',
                    unit: n.unit || '',
                    cost: n.cost || '',
                    comment: n.comment || '',
                    tags: n.tags || [],
                    atts,
                    depth,
                });
                if (expanded.has(n.id) && (n.children || []).length > 0) {
                    collectNodes(n.children, path, depth + 1);
                }
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
                ${cell(`<span style="padding-left:${r.depth * 14}px">${r.name}</span>`)}
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
            h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            thead { display: table-header-group; }
            @page { size: A3 landscape; margin: 20mm 14mm; }
            @media print { body { margin: 0; } }
        </style></head><body>
        <h1>WBS — ${nodeName}</h1>
        <table>
            <colgroup>
                <col class="c-wbs"/><col class="c-name"/>
                <col class="c-xs"/><col class="c-xs"/><col class="c-md"/>
                <col class="c-sm"/><col class="c-xl"/><col class="c-lg"/><col class="c-att"/>
            </colgroup>
            <thead><tr>
                <th>WBS</th><th>Nazwa</th>
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
                        <col style={{ width: colWidths.qa }} />
                        <col style={{ width: colWidths.zalaczniki }} />
                        <col style={{ width: 48 }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-[#0b0f17]">
                        <tr className="border-b border-white/10">
                            <th className="px-1 py-2.5 text-base font-bold uppercase tracking-widest text-white" />
                            {[['nazwa','Nazwa','text-left'],['typ','Typ','text-left'],['ilosc','Ilość','text-right'],['jednostka','Jednostka','text-left'],['status','Status','text-left'],['wlasciciel','Właściciel','text-left'],['komentarz','Komentarz','text-left'],['qa','Q&A','text-left'],['zalaczniki','Attach.','text-left']].map(([key, label, align]) => (
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
