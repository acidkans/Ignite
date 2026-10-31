import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Search, GitBranch } from 'lucide-react';

// @anchor wbs-node-tree-picker
// Wybór węzła WBS jako rozwijane drzewo (zamiast <select> z pełnymi ścieżkami, które się nie mieszczą).
// Klik w strzałkę rozwija gałąź, klik w nazwę przypisuje węzeł i zwija panel. Na starcie rozwinięta
// jest droga do wybranego węzła; wyszukiwarka pokazuje trafienia razem z ich przodkami.
// `items` — płaska lista z GET /wbs-nodes/unified/:nodeId ({ id, name, parentId, sortOrder }).
export default function WbsNodeTreePicker({ items, value, onChange, disabled, fallbackLabel, invalid }) {
    const byId = useMemo(() => new Map(items.map(n => [n.id, n])), [items]);
    const children = useMemo(() => {
        const map = new Map();
        for (const n of items) {
            const key = n.parentId && byId.has(n.parentId) ? n.parentId : null;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(n);
        }
        for (const list of map.values()) list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'pl'));
        return map;
    }, [items, byId]);
    const ancestors = (id) => {
        const out = [];
        for (let cur = byId.get(id), guard = 0; cur && guard < 30; cur = byId.get(cur.parentId), guard++) out.unshift(cur);
        return out;
    };

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    // @anchor wbs-node-tree-expanded — rozwinięte gałęzie; startowo droga do wybranego węzła
    const [expanded, setExpanded] = useState(() => new Set(value ? ancestors(value).map(n => n.id) : []));

    const path = value ? ancestors(value) : [];
    const label = path.length ? path.map(n => n.name || '—').join(' › ') : (value ? fallbackLabel || 'Węzeł spoza aktywnej wersji' : '');

    // Wyszukiwanie: trafienia + wszyscy ich przodkowie (żeby było widać, gdzie leżą), wszystko rozwinięte.
    const q = query.trim().toLowerCase();
    const visible = useMemo(() => {
        if (!q) return null;
        const set = new Set();
        for (const n of items) {
            if (String(n.name || '').toLowerCase().includes(q)) ancestors(n.id).forEach(a => set.add(a.id));
        }
        return set;
    }, [q, items]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = (id) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const pick = (id) => { onChange(id); setOpen(false); setQuery(''); };

    const renderLevel = (parentId, depth) => (children.get(parentId) || [])
        .filter(n => !visible || visible.has(n.id))
        .map(n => {
            const kids = (children.get(n.id) || []).length > 0;
            const isOpen = visible ? true : expanded.has(n.id);
            const selected = n.id === value;
            return (
                <div key={n.id}>
                    <div className={`flex items-start gap-1 rounded px-1 py-0.5 ${selected ? 'bg-emerald-500/20' : 'hover:bg-white/[0.06]'}`} style={{ paddingLeft: 4 + depth * 16 }}>
                        <button type="button" onClick={() => kids && toggle(n.id)} className={`mt-0.5 w-4 h-4 flex-shrink-0 flex items-center justify-center text-gray-500 ${kids ? 'hover:text-white' : 'opacity-0 cursor-default'}`} tabIndex={kids ? 0 : -1}>
                            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                        <button type="button" onClick={() => pick(n.id)} className={`flex-1 min-w-0 text-left text-[13px] break-words ${selected ? 'text-emerald-200 font-semibold' : 'text-gray-200'}`}>
                            {n.name || '—'}
                        </button>
                    </div>
                    {kids && isOpen && renderLevel(n.id, depth + 1)}
                </div>
            );
        });

    return (
        <div className="flex flex-col gap-1.5">
            <button
                type="button"
                onClick={() => !disabled && setOpen(o => !o)}
                disabled={disabled}
                className={`w-full flex items-start gap-2 px-3 py-2 rounded-lg bg-white/[0.05] border text-left text-sm disabled:opacity-60 ${invalid ? 'border-amber-500/60' : 'border-white/10'} ${open ? 'border-emerald-500/50' : ''}`}
            >
                <GitBranch size={13} className="mt-0.5 flex-shrink-0 text-gray-500" />
                <span className={`flex-1 min-w-0 break-words ${label ? 'text-white' : 'text-gray-500'}`}>{label || '— wybierz węzeł —'}</span>
                {!disabled && (open ? <ChevronDown size={14} className="mt-0.5 text-gray-500" /> : <ChevronRight size={14} className="mt-0.5 text-gray-500" />)}
            </button>
            {open && (
                <div className="rounded-lg border border-white/10 bg-black/30">
                    <label className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/10">
                        <Search size={12} className="text-gray-500" />
                        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Szukaj węzła…" className="flex-1 bg-transparent text-[13px] text-white placeholder-gray-600 focus:outline-none" />
                    </label>
                    <div className="max-h-72 overflow-y-auto p-1">
                        {items.length === 0 ? <p className="px-2 py-1 text-[12px] text-gray-500">Brak węzłów WBS w aktywnej wersji.</p> : renderLevel(null, 0)}
                        {visible && visible.size === 0 && <p className="px-2 py-1 text-[12px] text-gray-500">Brak węzła o tej nazwie.</p>}
                    </div>
                </div>
            )}
        </div>
    );
}
