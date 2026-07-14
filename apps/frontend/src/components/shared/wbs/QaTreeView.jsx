import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { X, HelpCircle, Plus, Search, CloudOff, ChevronLeft } from 'lucide-react';
import { API_URL } from '../../../config';
import { enqueueWbsQa, getPendingByType } from '../../../services/repos/outboxRepo';
import { getMeta, setMeta } from '../../../services/db';

// Wspólny edytowalny widok Q&A całego drzewa WBS — jeden komponent dla mobile
// (pełny ekran) i desktopu (modal 3/4). Zapis per węzeł: PATCH /wbs-nodes/:id,
// offline → kolejka outbox (typ WBS_QA) synchronizowana przez syncOutbox.
// Drzewo cache'owane w meta KV (qaTree:{nodeId}:{versionId}) — widok działa
// offline na ostatnio pobranych danych.

function cacheKey(nodeId, versionId) {
    return `qaTree:${nodeId}:${versionId || ''}`;
}

// Spłaszcza drzewo do wierszy { id, name, path, depth, topId, topName, qa }
function flattenRows(nodes, prefix = '', top = null, acc = []) {
    nodes.forEach((n, i) => {
        const path = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
        const topRef = top || { id: n.id, name: n.name || '(bez nazwy)', path };
        acc.push({
            id: n.id,
            name: n.name || '(bez nazwy)',
            path,
            depth: prefix ? prefix.split('.').length : 0,
            topId: topRef.id,
            topName: topRef.name,
            topPath: topRef.path,
            qa: Array.isArray(n.qa) ? n.qa : [],
        });
        if (n.children?.length) flattenRows(n.children, path, topRef, acc);
    });
    return acc;
}

function buildTree(items) {
    const byId = new Map(items.map(n => [n.id, { ...n, children: [] }]));
    const roots = [];
    for (const n of byId.values()) {
        if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId).children.push(n);
        else roots.push(n);
    }
    return roots;
}

function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

// Textarea dopasowująca wysokość do treści już przy pierwszym renderze
// (nie dopiero przy edycji) i przy zmianie szerokości okna.
// @anchor growing-textarea
function GrowingTextarea({ value, ...props }) {
    const ref = useRef(null);
    useLayoutEffect(() => { autoGrow(ref.current); }, [value]);
    useEffect(() => {
        const onResize = () => autoGrow(ref.current);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    return <textarea ref={ref} rows={1} value={value} {...props} />;
}

// @anchor qa-tree-view
export default function QaTreeView({ nodeId, versionId, onClose }) {
    const [rows, setRows] = useState(null); // null = ładowanie
    const [loadError, setLoadError] = useState(false);
    const [fromCache, setFromCache] = useState(false);
    // @anchor qa-tree-filter
    const [qaFilter, setQaFilter] = useState(() => window.innerWidth < 1024 ? 'unanswered' : 'withQa');
    const [search, setSearch] = useState('');
    // @anchor qa-queued-ids
    const [queuedIds, setQueuedIds] = useState(new Set()); // węzły z zapisem czekającym w outboxie
    const dirtyRef = useRef(new Set());
    const rowsRef = useRef([]);
    useEffect(() => { rowsRef.current = rows || []; }, [rows]);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Wczytanie drzewa: sieć → cache; potem nałożenie zapisów czekających w outboxie
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const token = sessionStorage.getItem('token');
            let items = null;
            try {
                const url = `${API_URL}/wbs-nodes/unified/${nodeId}${versionId ? `?versionId=${versionId}` : ''}`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    items = data.items || [];
                    await setMeta(cacheKey(nodeId, versionId), items);
                }
            } catch { /* offline — spróbuj cache */ }
            if (!items) {
                items = await getMeta(cacheKey(nodeId, versionId));
                if (!cancelled && items) setFromCache(true);
            }
            if (cancelled) return;
            if (!items) { setLoadError(true); setRows([]); return; }

            // Nałóż niesynchronizowane zapisy Q&A z outboxa (lokalna wersja jest nowsza)
            const pending = await getPendingByType('WBS_QA');
            const pendingByNode = new Map(pending.map(p => [p.payload?.wbsNodeId, p.payload?.qa]));
            if (pendingByNode.size) {
                items = items.map(n => pendingByNode.has(n.id) ? { ...n, qa: pendingByNode.get(n.id) } : n);
                setQueuedIds(new Set(pendingByNode.keys()));
            }
            setRows(flattenRows(buildTree(items)));
        })();
        return () => { cancelled = true; };
    }, [nodeId, versionId]);

    // Po syncu outboxa zdejmij znacznik "w kolejce" z węzła
    useEffect(() => {
        const handler = (e) => {
            const id = e.detail?.wbsNodeId;
            if (!id) return;
            setQueuedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
        };
        window.addEventListener('wbs-qa-synced', handler);
        return () => window.removeEventListener('wbs-qa-synced', handler);
    }, []);

    // Zapis Q&A jednego węzła: online → PATCH, offline/błąd → kolejka outbox.
    // @anchor persist-node-qa
    const persistNodeQa = useCallback(async (wbsNodeId) => {
        if (!dirtyRef.current.has(wbsNodeId)) return;
        dirtyRef.current.delete(wbsNodeId);
        const row = rowsRef.current.find(r => r.id === wbsNodeId);
        if (!row) return;
        const cleaned = row.qa
            .map(p => ({ question: String(p.question || '').trim(), answer: String(p.answer || '').trim() }))
            .filter(p => p.question || p.answer);

        // Write-through do cache, żeby offline'owe ponowne otwarcie widziało edycję
        try {
            const cached = await getMeta(cacheKey(nodeId, versionId));
            if (Array.isArray(cached)) {
                await setMeta(cacheKey(nodeId, versionId), cached.map(n => n.id === wbsNodeId ? { ...n, qa: cleaned } : n));
            }
        } catch { /* cache best-effort */ }

        if (navigator.onLine) {
            try {
                const token = sessionStorage.getItem('token');
                const res = await fetch(`${API_URL}/wbs-nodes/${wbsNodeId}`, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ qa: cleaned }),
                });
                if (res.ok) {
                    setQueuedIds(prev => { const next = new Set(prev); next.delete(wbsNodeId); return next; });
                    window.dispatchEvent(new CustomEvent('wbs-qa-imported'));
                    return;
                }
            } catch { /* sieć padła w trakcie — kolejkuj */ }
        }
        await enqueueWbsQa(wbsNodeId, cleaned);
        setQueuedIds(prev => new Set(prev).add(wbsNodeId));
        window.dispatchEvent(new CustomEvent('wbs-qa-imported'));
    }, [nodeId, versionId]);

    const updatePair = (wbsNodeId, idx, field, value) => {
        dirtyRef.current.add(wbsNodeId);
        setRows(prev => prev.map(r => r.id === wbsNodeId
            ? { ...r, qa: r.qa.map((p, i) => i === idx ? { ...p, [field]: value } : p) }
            : r));
    };
    const addPair = (wbsNodeId) => {
        setRows(prev => prev.map(r => r.id === wbsNodeId ? { ...r, qa: [...r.qa, { question: '', answer: '' }] } : r));
    };
    const removePair = (wbsNodeId, idx) => {
        dirtyRef.current.add(wbsNodeId);
        setRows(prev => prev.map(r => r.id === wbsNodeId ? { ...r, qa: r.qa.filter((_, i) => i !== idx) } : r));
        // setRows jest asynchroniczne — persist po fladze dirty odczyta stan z rowsRef w następnym ticku
        setTimeout(() => persistNodeQa(wbsNodeId), 0);
    };

    const q = search.trim().toLowerCase();
    const visibleGroups = useMemo(() => {
        if (!rows) return [];
        const visible = rows.filter(r => {
            if (qaFilter === 'withQa' && r.qa.length === 0) return false;
            if (qaFilter === 'unanswered' && !r.qa.some(p => (p.question || '').trim() && !(p.answer || '').trim())) return false;
            if (q) {
                const hay = `${r.name} ${r.qa.map(p => `${p.question} ${p.answer}`).join(' ')}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
        const groups = [];
        const byTop = new Map();
        for (const r of visible) {
            if (!byTop.has(r.topId)) {
                const g = { topId: r.topId, topName: r.topName, topPath: r.topPath, rows: [] };
                byTop.set(r.topId, g);
                groups.push(g);
            }
            byTop.get(r.topId).rows.push(r);
        }
        return groups;
    }, [rows, qaFilter, q]);

    const totalPairs = useMemo(() => (rows || []).reduce((s, r) => s + r.qa.filter(p => (p.question || '').trim() || (p.answer || '').trim()).length, 0), [rows]);

    const FILTERS = [
        ['all', 'Wszystkie'],
        ['withQa', 'Z pytaniami'],
        ['unanswered', 'Bez odpowiedzi'],
    ];

    return (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className={`relative bg-[#0f172a] flex flex-col overflow-hidden ${isMobile ? 'w-full h-[100dvh]' : 'w-3/4 max-w-5xl h-[85vh] border border-white/10 rounded-2xl shadow-2xl'}`}>

                {/* Nagłówek */}
                <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10 flex-shrink-0">
                    {isMobile && (
                        <button onClick={onClose} className="p-2 bg-white/10 rounded-full text-white active:scale-90 transition-all flex-shrink-0">
                            <ChevronLeft size={18} />
                        </button>
                    )}
                    <div className="p-2 bg-amber-500/20 rounded-xl flex-shrink-0">
                        <HelpCircle size={16} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-black text-sm text-white truncate">Q&A — całe drzewo</h3>
                        <p className="text-[10px] text-gray-500">{totalPairs} pytań{fromCache ? ' · dane z pamięci offline' : ''}</p>
                    </div>
                    {queuedIds.size > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] font-bold flex-shrink-0" title="Zapisy czekają na synchronizację — wyślą się automatycznie po odzyskaniu sieci">
                            <CloudOff size={12} /> {queuedIds.size} w kolejce
                        </div>
                    )}
                    {!isMobile && (
                        <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all flex-shrink-0">
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* Pasek narzędzi: szukaj + filtry */}
                <div className={`px-4 py-2.5 flex gap-2 border-b border-white/5 flex-shrink-0 ${isMobile ? 'flex-col' : 'items-center'}`}>
                    <div className="relative flex-1 min-w-0">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj w pytaniach, odpowiedziach, nazwach…"
                            className="w-full bg-[#1e293b]/60 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/50" />
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                        {FILTERS.map(([key, label]) => (
                            <button key={key} onClick={() => setQaFilter(key)}
                                className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${qaFilter === key ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300' : 'bg-white/5 border border-white/10 text-gray-500 active:scale-95'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Treść */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-5">
                    {rows === null && <p className="text-sm text-gray-500 py-8 text-center">Ładowanie drzewa…</p>}
                    {loadError && (
                        <p className="text-sm text-orange-400/80 py-8 text-center">Brak sieci i brak zapisanej kopii drzewa — otwórz widok raz online, aby działał offline.</p>
                    )}
                    {rows !== null && !loadError && visibleGroups.length === 0 && (
                        <p className="text-sm text-gray-600 py-8 text-center">
                            {qaFilter === 'unanswered' ? 'Brak pytań bez odpowiedzi.' : qaFilter === 'withQa' ? 'Żaden węzeł nie ma jeszcze pytań.' : 'Brak wyników.'}
                            {qaFilter !== 'all' && <span className="block mt-1 text-[11px]">Przełącz filtr na „Wszystkie", aby dodać pytania do dowolnego węzła.</span>}
                        </p>
                    )}

                    {visibleGroups.map(g => (
                        <div key={g.topId} className="space-y-2">
                            <div className="flex items-center gap-2 sticky top-0 bg-[#0f172a] py-1.5 z-10">
                                <span className="font-mono text-[11px] text-gray-600">{g.topPath}</span>
                                <span className="text-xs font-black text-blue-300 uppercase tracking-wide truncate">{g.topName}</span>
                                <div className="flex-1 h-px bg-white/10" />
                            </div>
                            {g.rows.map(row => (
                                <div key={row.id} className="rounded-2xl bg-white/[0.03] border border-white/5 p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[10px] text-gray-600 flex-shrink-0">{row.path}</span>
                                        <span className="text-xs font-semibold text-gray-300 truncate flex-1">{row.name}</span>
                                        {queuedIds.has(row.id) && (
                                            <span className="flex items-center gap-1 text-[9px] font-bold text-orange-400 flex-shrink-0" title="Czeka na synchronizację">
                                                <CloudOff size={10} /> offline
                                            </span>
                                        )}
                                        <button onClick={() => addPair(row.id)} className="flex items-center gap-1 text-[10px] font-bold text-gray-600 hover:text-amber-400 active:text-amber-400 transition-all flex-shrink-0">
                                            <Plus size={11} /> pytanie
                                        </button>
                                    </div>
                                    {row.qa.map((p, idx) => (
                                        <div key={idx} className={`gap-2 ${isMobile ? 'flex flex-col' : 'grid grid-cols-[1fr_1fr_auto] items-start'}`}>
                                            <GrowingTextarea value={p.question || ''} placeholder="Pytanie…"
                                                onChange={e => updatePair(row.id, idx, 'question', e.target.value)}
                                                onBlur={() => persistNodeQa(row.id)}
                                                className="w-full resize-none overflow-hidden bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-amber-500/50" />
                                            <div className={isMobile ? 'flex gap-2' : 'contents'}>
                                                <GrowingTextarea value={p.answer || ''} placeholder="Odpowiedź…"
                                                    onChange={e => updatePair(row.id, idx, 'answer', e.target.value)}
                                                    onBlur={() => persistNodeQa(row.id)}
                                                    className="w-full resize-none overflow-hidden bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-blue-200 placeholder-gray-700 focus:outline-none focus:border-blue-500/50" />
                                                <button onClick={() => removePair(row.id, idx)} className="p-2 rounded-lg text-gray-700 hover:text-red-400 hover:bg-red-500/10 active:text-red-400 transition-all flex-shrink-0 self-start" title="Usuń pytanie">
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
