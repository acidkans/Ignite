import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { X, HelpCircle, Plus, Search, CloudOff, ChevronLeft, Mail, Inbox } from 'lucide-react';
import { API_URL } from '../../../config';
import { enqueueWbsQa, getPendingByType } from '../../../services/repos/outboxRepo';
import { getMeta, setMeta } from '../../../services/db';
import { ensureQaIds, strategyHasTokens } from './strategyQuestions';
import QaMailModal from './QaMailModal';
import QaMailRepliesModal from './QaMailRepliesModal';
import { composeBranchStrategy } from './WBSHybridTable';

// Wspólny edytowalny widok Q&A całego drzewa WBS — jeden komponent dla mobile
// (pełny ekran) i desktopu (modal 3/4). Zapis per węzeł: PATCH /wbs-nodes/:id,
// offline → kolejka outbox (typ WBS_QA) synchronizowana przez syncOutbox.
// Drzewo cache'owane w meta KV (qaTree:{nodeId}:{versionId}) — widok działa
// offline na ostatnio pobranych danych.

function cacheKey(nodeId, versionId) {
    return `qaTree:${nodeId}:${versionId || ''}`;
}

// Stabilny klucz pary Q&A (tylko w UI, nie trafia do zapisu) — pozwala trzymać
// migawkę "pytań bez odpowiedzi" niezależnie od przesuwania indeksów.
let pairSeq = 0;
const withPairKey = (p) => ({ ...p, _k: ++pairSeq });

const isUnanswered = (p) => (p.question || '').trim() && !(p.answer || '').trim();
const fmtDay = (iso) => { try { return new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }); } catch { return ''; } };

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
            qa: Array.isArray(n.qa) ? n.qa.map(withPairKey) : [],
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
// `initialFilter` — „Z pytaniami” po kliknięciu przycisku Q&A (widać wszystkie pytania), „Bez odpowiedzi”
// przy automatycznym otwarciu na wejściu w WBS (`wbs-qa-tree-open`). `highlightReplyIds` — id maili, których
// odpowiedzi (para z `mailReplyId`) są nowe i świecą na zielono (popup `qa-mail-auto-notice`).
export default function QaTreeView({ nodeId, versionId, onClose, initialFilter = 'withQa', highlightReplyIds = null }) {
    const [rows, setRows] = useState(null); // null = ładowanie
    const [loadError, setLoadError] = useState(false);
    const [fromCache, setFromCache] = useState(false);
    // @anchor qa-tree-filter
    const [qaFilter, setQaFilter] = useState(initialFilter);
    const [search, setSearch] = useState('');
    // @anchor qa-queued-ids
    const [queuedIds, setQueuedIds] = useState(new Set()); // węzły z zapisem czekającym w outboxie
    const dirtyRef = useRef(new Set());
    // @anchor qa-tree-mail-questions — pytania bez odpowiedzi całego zamówienia w oknie wysyłki mailem (QaMailModal)
    const [mailQuestions, setMailQuestions] = useState(null);
    const rowsRef = useRef([]);
    useEffect(() => { rowsRef.current = rows || []; }, [rows]);
    // Surowe węzły (ze strategią) — do przeliczenia złożenia strategii gałęzi po odpowiedzi z maila.
    const itemsRef = useRef([]);

    // @anchor qa-tree-mail-replies — odpowiedzi klientów na maile z pytaniami (QaMailRepliesModal); licznik NEW w nagłówku.
    const [mailReplies, setMailReplies] = useState(null);
    const [mailRepliesLoading, setMailRepliesLoading] = useState(false);
    const [mailRepliesOpen, setMailRepliesOpen] = useState(false);
    const loadMailReplies = useCallback(async () => {
        if (!nodeId) return;
        setMailRepliesLoading(true);
        try {
            const r = await fetch(`${API_URL}/qa-mail/replies/${nodeId}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } });
            if (r.ok) setMailReplies(await r.json());
        } catch { /* offline — licznik bez odświeżenia */ } finally {
            setMailRepliesLoading(false);
        }
    }, [nodeId]);
    useEffect(() => { loadMailReplies(); }, [loadMailReplies]);
    const newMailReplies = (mailReplies || []).filter(r => r.status === 'NEW').length;

    // Migawka par bez odpowiedzi — liczona przy wejściu w filtr, żeby wpisana
    // odpowiedź nie znikała z ekranu w trakcie pisania.
    const [unansweredKeys, setUnansweredKeys] = useState(new Set());
    const loaded = rows !== null;
    useEffect(() => {
        if (!loaded || qaFilter !== 'unanswered') return;
        const keys = new Set();
        rowsRef.current.forEach(r => r.qa.forEach(p => { if (isUnanswered(p)) keys.add(p._k); }));
        setUnansweredKeys(keys);
    }, [qaFilter, loaded]);

    const isNewFromMail = (p) => !!(highlightReplyIds && p.mailReplyId && highlightReplyIds.has(p.mailReplyId));
    // Po wczytaniu przewiń do pierwszej nowej odpowiedzi z maila.
    useEffect(() => {
        if (!loaded || !highlightReplyIds?.size) return;
        requestAnimationFrame(() => document.querySelector('[data-mail-new="1"]')?.scrollIntoView({ block: 'center' }));
    }, [loaded, highlightReplyIds]);

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
            itemsRef.current = items;
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
        // Para zachowuje `id` (cel znacznika `{{q:id}}` w strategii) i powiązania (zadanie, mail, czat) — bez nich
        // backend nada nowe id i strategia pokaże „brak pytania”. `_k` to tylko klucz Reacta.
        const cleaned = row.qa
            .map(({ _k, ...p }) => ({ ...p, question: String(p.question || '').trim(), answer: String(p.answer || '').trim() }))
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

    // @anchor open-qa-tree-mail
    // Wysyłka mailem pytań z całego drzewa — ten sam QaMailModal co w gałęziach. Niezapisane edycje idą
    // najpierw na serwer; pary bez `id` dostają je lokalnie (backend zapisze je pod `qaId` przy wysyłce).
    const openMail = async () => {
        await Promise.all([...dirtyRef.current].map(id => persistNodeQa(id)));
        const next = rowsRef.current.map(r => {
            const withIds = ensureQaIds(r.qa);
            return withIds === r.qa ? r : { ...r, qa: withIds };
        });
        setRows(next);
        setMailQuestions(next.flatMap(r => r.qa.filter(isUnanswered)
            .map(p => ({ wbsNodeId: r.id, nodeName: `${r.path} ${r.name}`, pair: p }))));
    };
    // @anchor apply-qa-tree-mail-sent
    // Znacznik wysyłki z backendu nakładany na pary po id (backend już zapisał — bez PATCH).
    const applyMailSent = (result) => {
        const upd = new Map((result?.nodes || []).map(n => [n.id, n]));
        setRows(prev => prev.map(r => {
            const u = upd.get(r.id);
            if (!u) return r;
            const byId = new Map(u.qa.map(p => [p.id, p]));
            const idFor = new Map((u.sent || []).map(x => [x.clientQaId, x.qaId]));
            return { ...r, qa: r.qa.map(p => {
                const id = idFor.get(p.id) || p.id;
                const s = byId.get(id);
                return s?.mailId ? { ...p, id, mailId: s.mailId, mailSentAt: s.mailSentAt, mailTo: s.mailTo } : p;
            }) };
        }));
        window.dispatchEvent(new CustomEvent('wbs-qa-imported'));
    };

    // @anchor answer-qa-tree-from-mail
    // Zatwierdzone odpowiedzi z maila klienta → pary Q&A drzewa, jak w Q&A węzła (`answer-questions-from-mail`):
    // zamyka zadanie „Wyjaśnić czy…”, przelicza złożenie strategii gałęzi z `{{q:id}}`. Para szukana po id,
    // potem po treści pytania. Zwraca liczbę pytań, których nie ma już w Q&A.
    const answerFromMail = (reply, picked) => {
        const norm = t => String(t || '').trim().toLowerCase();
        const byNode = new Map();
        picked.forEach(r => byNode.set(r.wbsNodeId, [...(byNode.get(r.wbsNodeId) || []), r]));
        let missing = 0;
        const changed = new Map();
        const doneTaskIds = [];
        for (const [wbsNodeId, list] of byNode) {
            const row = rowsRef.current.find(r => r.id === wbsNodeId);
            if (!row) { missing += list.length; continue; }
            let qa = ensureQaIds(row.qa);
            for (const r of list) {
                let idx = qa.findIndex(p => p.id === r.qaId);
                if (idx < 0) idx = qa.findIndex(p => norm(p.question) === norm(r.question));
                if (idx < 0) { missing++; continue; }
                if (qa[idx].taskId && !String(qa[idx].answer || '').trim()) doneTaskIds.push(qa[idx].taskId);
                const answer = String(r.answer || '').trim().toLocaleLowerCase('pl-PL');
                qa = qa.map((p, i) => i === idx ? { ...p, answer, answerSource: 'mail', mailReplyId: reply.id, mailReplyAt: reply.receivedAt } : p);
            }
            changed.set(wbsNodeId, qa);
        }
        if (!changed.size) return missing;

        const next = rowsRef.current.map(r => changed.has(r.id) ? { ...r, qa: changed.get(r.id) } : r);
        rowsRef.current = next;
        setRows(next);
        changed.forEach((_, id) => { dirtyRef.current.add(id); persistNodeQa(id); });

        const headers = { Authorization: `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' };
        doneTaskIds.forEach(taskId => fetch(`${API_URL}/my-tasks/${taskId}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'DONE' }) }).catch(() => {}));

        // Złożenie strategii gałęzi (top-level) — tylko gdy któraś strategia w gałęzi ma znaczniki.
        itemsRef.current = itemsRef.current.map(n => changed.has(n.id) ? { ...n, qa: changed.get(n.id).map(({ _k, ...p }) => p) } : n);
        const topIds = new Set(next.filter(r => changed.has(r.id)).map(r => r.topId));
        for (const root of buildTree(itemsRef.current).filter(r => topIds.has(r.id))) {
            let tokens = false;
            const walk = n => { if (strategyHasTokens(n?.strategy)) tokens = true; (n?.children || []).forEach(walk); };
            (root.children || []).forEach(walk);
            if (!tokens) continue;
            const composed = composeBranchStrategy(root);
            if (!composed || composed === (root.strategy || '')) continue;
            itemsRef.current = itemsRef.current.map(n => n.id === root.id ? { ...n, strategy: composed } : n);
            fetch(`${API_URL}/wbs-nodes/${root.id}`, { method: 'PATCH', headers, body: JSON.stringify({ strategy: composed }) })
                .then(() => window.dispatchEvent(new CustomEvent('wbs-qa-imported')))
                .catch(() => {});
        }
        return missing;
    };

    const updatePair = (wbsNodeId, idx, field, value) => {
        dirtyRef.current.add(wbsNodeId);
        setRows(prev => prev.map(r => r.id === wbsNodeId
            ? { ...r, qa: r.qa.map((p, i) => i === idx ? { ...p, [field]: value } : p) }
            : r));
    };
    const addPair = (wbsNodeId) => {
        const pair = withPairKey({ question: '', answer: '' });
        setUnansweredKeys(prev => new Set(prev).add(pair._k));
        setRows(prev => prev.map(r => r.id === wbsNodeId ? { ...r, qa: [...r.qa, pair] } : r));
    };
    const removePair = (wbsNodeId, idx) => {
        dirtyRef.current.add(wbsNodeId);
        setRows(prev => prev.map(r => r.id === wbsNodeId ? { ...r, qa: r.qa.filter((_, i) => i !== idx) } : r));
        // setRows jest asynchroniczne — persist po fladze dirty odczyta stan z rowsRef w następnym ticku
        setTimeout(() => persistNodeQa(wbsNodeId), 0);
    };

    const q = search.trim().toLowerCase();
    // W trybie "Bez odpowiedzi" pokazujemy tylko pojedyncze pary z migawki
    const isPairVisible = (p) => qaFilter !== 'unanswered' || unansweredKeys.has(p._k);
    const visibleGroups = useMemo(() => {
        if (!rows) return [];
        const visible = rows.filter(r => {
            const pairs = qaFilter === 'unanswered' ? r.qa.filter(p => unansweredKeys.has(p._k)) : r.qa;
            if (qaFilter === 'withQa' && r.qa.length === 0) return false;
            if (qaFilter === 'unanswered' && pairs.length === 0) return false;
            if (q) {
                const hay = `${r.name} ${pairs.map(p => `${p.question} ${p.answer}`).join(' ')}`.toLowerCase();
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
    }, [rows, qaFilter, q, unansweredKeys]);

    const totalPairs = useMemo(() => (rows || []).reduce((s, r) => s + r.qa.filter(p => (p.question || '').trim() || (p.answer || '').trim()).length, 0), [rows]);
    const openPairs = useMemo(() => (rows || []).reduce((s, r) => s + r.qa.filter(isUnanswered).length, 0), [rows]);

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
                        <p className="text-[10px] text-gray-500">{totalPairs} pytań · {openPairs} bez odpowiedzi{fromCache ? ' · dane z pamięci offline' : ''}</p>
                    </div>
                    {queuedIds.size > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] font-bold flex-shrink-0" title="Zapisy czekają na synchronizację — wyślą się automatycznie po odzyskaniu sieci">
                            <CloudOff size={12} /> {queuedIds.size} w kolejce
                        </div>
                    )}
                    {rows !== null && !loadError && !fromCache && (
                        <button onClick={() => { setMailRepliesOpen(true); loadMailReplies(); }} title="Odpowiedzi klienta na maile z pytaniami"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all flex-shrink-0 ${newMailReplies ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25' : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10'}`}>
                            <Inbox size={12} /> {isMobile ? 'Odpowiedzi' : 'Odpowiedzi z maila'}{newMailReplies ? ` (${newMailReplies})` : ''}
                        </button>
                    )}
                    {rows !== null && !loadError && !fromCache && openPairs > 0 && (
                        <button onClick={openMail} title="Wyślij pytania bez odpowiedzi mailem do klienta — domyślnie zaznaczone jeszcze niewysłane"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25 text-[11px] font-bold transition-all flex-shrink-0">
                            <Mail size={12} /> Wyślij mailem
                        </button>
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
                                    {row.qa.map((p, idx) => isPairVisible(p) && (
                                        <div key={p._k} className={`gap-2 ${isMobile ? 'flex flex-col' : 'grid grid-cols-[1fr_1fr_auto] items-start'}`}>
                                            <div className="min-w-0">
                                                <GrowingTextarea value={p.question || ''} placeholder="Pytanie…"
                                                    onChange={e => updatePair(row.id, idx, 'question', e.target.value)}
                                                    onBlur={() => persistNodeQa(row.id)}
                                                    className="w-full resize-none overflow-hidden bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-amber-500/50" />
                                                {p.mailSentAt && (
                                                    <span className="flex items-center gap-1 mt-0.5 pl-1 text-[10px] text-sky-300/70" title={`Wysłane do ${p.mailTo || ''}`}>
                                                        <Mail size={10} /> wysłane mailem {fmtDay(p.mailSentAt)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className={isMobile ? 'flex gap-2' : 'contents'}>
                                                <GrowingTextarea value={p.answer || ''} placeholder="Odpowiedź…"
                                                    data-mail-new={isNewFromMail(p) ? '1' : undefined}
                                                    title={isNewFromMail(p) ? 'Nowa odpowiedź wpisana przez AI z maila klienta' : undefined}
                                                    onChange={e => updatePair(row.id, idx, 'answer', e.target.value)}
                                                    onBlur={() => persistNodeQa(row.id)}
                                                    className={`w-full resize-none overflow-hidden rounded-xl px-3 py-2 text-sm placeholder-gray-700 focus:outline-none ${isNewFromMail(p) ? 'bg-emerald-500/15 border-2 border-emerald-400/70 text-emerald-200 focus:border-emerald-300' : 'bg-black/20 border border-white/10 text-blue-200 focus:border-blue-500/50'}`} />
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
            {mailQuestions && (
                <QaMailModal
                    processNodeId={nodeId}
                    title="Całe zamówienie"
                    questions={mailQuestions}
                    onClose={() => setMailQuestions(null)}
                    onSent={applyMailSent}
                />
            )}
            {mailRepliesOpen && (
                <QaMailRepliesModal
                    processNodeId={nodeId}
                    replies={mailReplies}
                    loading={mailRepliesLoading}
                    onReload={loadMailReplies}
                    onApply={answerFromMail}
                    currentAnswer={(wbsNodeId, qaId, question) => {
                        const qa = rowsRef.current.find(r => r.id === wbsNodeId)?.qa || [];
                        const p = qa.find(x => x.id === qaId) || qa.find(x => String(x.question || '').trim().toLowerCase() === String(question || '').trim().toLowerCase());
                        return String(p?.answer || '').trim();
                    }}
                    onClose={() => setMailRepliesOpen(false)}
                />
            )}
        </div>
    );
}
