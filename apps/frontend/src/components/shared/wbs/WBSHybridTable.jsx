import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { TYPE_OPTIONS, TYPE_LABELS, fmtPLN, wbsTypeFromAny, parseLocaleNumber, usesWorkStatuses, WORK_STATUS_META, resolveStatusCode, defaultStatusForType, nodeHasOwnStatus, aggregateBranchStatus, PLAN_STATUS_META, planStatusFromAny, nodeCanHaveOwner, buildOwnerOptions, defaultLogisticianOwner, isRejectedPlanNode, groupQtyFactor, EXEC_STATUS_META, isTaskClosed, isCostNode } from './wbsConstants';
import AutoResizeTextarea from './AutoResizeTextarea';
import { newQaId, ensureQaIds, strategyHasTokens, strategyTokenIds, buildQaIndex, resolveStrategyText, pendingStrategyQuestions, splitStrategyTokens } from './strategyQuestions';
import TaskModal from './TaskModal';
import QaMailModal from './QaMailModal';
import QaMailRepliesModal from './QaMailRepliesModal';
import WbsNameAutocomplete from './WbsNameAutocomplete';
import { buildNameSuggestionPool, pickTwinDefaults } from './wbsNameSuggest';
import { Inbox, Plus, Trash2, ChevronRight, ChevronDown, GripVertical, Tag, X, ExternalLink, Link, FileDown, Package, Copy, Clipboard, HelpCircle, ListTodo, MessageCircle, Send, ArrowRight, ArrowLeft, Check, Loader2, Calendar, Repeat, ImagePlus, Archive, RotateCcw, EyeOff, Mail } from 'lucide-react';
import { CyclicAlarmEditor } from '../MyTasksModal';
import { useDevice } from '../../../hooks/useDevice';

// @anchor normalize-lower-text
// Odpowiedzi Q&A zapisujemy małymi literami — ujednolica wpisy pisane CAPS LOCKIEM.
// Pytań NIE normalizujemy (zostają tak, jak je wpisano). Wołane na blur / przy zapisie.
const normalizeLowerText = (s) => String(s || '').trim().toLocaleLowerCase('pl-PL');

// ── Q&A cell — zagnieżdżona tabela Pytanie / Odpowiedź per WBS node ───────────
function QaPairRow({ p, idx, onUpdate, onRemove, onPersist, linked = false }) {
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
                    onBlur={() => { onUpdate(idx, 'question', String(p.question || '').trim()); onPersist?.(); }}
                    onFocus={syncHeights}
                    placeholder="Pytanie…"
                    title={linked ? 'Pytanie wstawione w strategię — odpowiedź uzupełni strategię' : undefined}
                    className={`bg-black/20 border ${linked ? 'border-amber-400/50' : 'border-white/10'} rounded px-1.5 py-0.5 text-[15px] w-full focus:outline-none focus:border-blue-500/50 placeholder-gray-700 text-gray-200`}
                    style={{ overflow: 'hidden', minHeight: '1.4em', resize: 'none' }}
                />
                {p.mailSentAt && !String(p.answer || '').trim() && (
                    <div className="flex items-center gap-1 text-[12px] text-sky-300/70" title={`Wysłane mailem do ${p.mailTo || ''}`}>
                        <Mail size={11} /> wysłane mailem {new Date(p.mailSentAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}
                    </div>
                )}
            </td>
            <td className="pr-1 py-0.5 border-t border-white/5">
                <textarea
                    ref={aRef}
                    rows={1}
                    value={p.answer || ''}
                    onChange={e => { onUpdate(idx, 'answer', e.target.value); syncHeights(); }}
                    onBlur={() => { onUpdate(idx, 'answer', normalizeLowerText(p.answer)); onPersist?.(); }}
                    onFocus={syncHeights}
                    placeholder="Odpowiedź…"
                    className="bg-black/20 border border-white/10 rounded px-1.5 py-0.5 text-[15px] w-full focus:outline-none focus:border-blue-500/50 placeholder-gray-700 text-gray-200"
                    style={{ overflow: 'hidden', minHeight: '1.4em', resize: 'none' }}
                />
                {p.answerSource === 'mail' && String(p.answer || '').trim() && (
                    <div className="flex items-center gap-1 text-[12px] text-emerald-300/70" title="Odpowiedź wpisana z maila klienta (Odpowiedzi z maila)">
                        <Mail size={11} /> odpowiedź mailem{p.mailReplyAt ? ` ${new Date(p.mailReplyAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}` : ''}
                    </div>
                )}
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

// `linkedIds` — id par użytych w strategii węzła (`{{q:id}}`), dostają obwódkę.
function QaCell({ pairs, onChange, onPersist, autoFocusNew = false, linkedIds = null }) {
    const list = Array.isArray(pairs) ? pairs : [];
    const update = (idx, field, value) => {
        onChange(list.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    };
    const remove = (idx) => { onChange(list.filter((_, i) => i !== idx)); onPersist?.(); };
    // @anchor qa-new-question — stałe pole „Nowe pytanie…" pod listą (jak „Nowe zadanie…" w szufladzie
    // Zadania). Enter / wyjście z pola dopisuje parę i zapisuje; puste nic nie tworzy, więc w bazie
    // nie lądują puste pary. `autoFocusNew` — kursor w polu od razu po otwarciu szuflady liścia.
    const [newQ, setNewQ] = useState('');
    const commitNew = () => {
        const q = newQ.trim();
        if (!q) return;
        onChange([...list, { id: newQaId(), question: q, answer: '' }]);
        setNewQ('');
        onPersist?.();
    };

    return (
        <div className="flex flex-col gap-1">
            {list.length > 0 && (
                <table className="w-full text-[15px] border-collapse">
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
                                onUpdate={update}
                                onRemove={remove}
                                onPersist={onPersist}
                                linked={!!(p.id && linkedIds?.has(p.id))}
                            />
                        ))}
                    </tbody>
                </table>
            )}
            <div className="flex items-center gap-1.5">
                <HelpCircle size={12} className="text-gray-600 flex-shrink-0" />
                <input
                    value={newQ}
                    autoFocus={autoFocusNew}
                    onChange={e => setNewQ(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitNew(); } }}
                    onBlur={commitNew}
                    placeholder="Nowe pytanie…"
                    className="flex-1 min-w-0 px-2 py-1 rounded bg-black/20 border border-white/10 text-[15px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                />
            </div>
        </div>
    );
}

// ── Q&A gałęzi — read-only agregacja ─────────────────────────────────────────
// Zbiera (tylko do odczytu) wszystkie niepuste pary Q&A z poddrzewa węzła —
// wyłącznie dzieci i głębiej, pomijając sam węzeł. Zwraca [{ id, name, depth, pairs }].
// @anchor collect-branch-qa
function collectBranchQa(node, depth = 0, acc = []) {
    for (const child of (node?.children || [])) {
        const pairs = (Array.isArray(child.qa) ? child.qa : [])
            .filter(p => (p?.question || '').trim() || (p?.answer || '').trim());
        if (pairs.length) acc.push({ id: child.id, name: child.name || 'Element WBS', depth, pairs });
        collectBranchQa(child, depth + 1, acc);
    }
    return acc;
}

// { [id]: nazwa } wszystkich potomków węzła (bez niego samego) — czat gałęzi głównej.
// @anchor collect-branch-names
function collectBranchNames(node, acc = {}) {
    for (const child of (node?.children || [])) {
        acc[child.id] = child.name || 'Element WBS';
        collectBranchNames(child, acc);
    }
    return acc;
}

// Zbiera wypełnione komórki strategii potomków (liście + węzły pośrednie) jako
// [{ id, name, strategy }]. Węzeł top-level sam się pomija. Baza dla renderu (bold nazwa)
// i dla złożenia utrwalanego na top-level.
// @anchor collect-branch-strategy-entries
function collectBranchStrategyEntries(node) {
    const entries = [];
    const walk = (n) => {
        for (const child of (n?.children || [])) {
            const s = (child.strategy || '').trim();
            if (s) entries.push({ id: child.id, name: (child.name || 'Element WBS').trim(), strategy: s });
            walk(child);
        }
    };
    walk(node);
    return entries;
}

// Składa strategię całej gałęzi do utrwalenia na polu strategy węzła top-level (czytają je
// eksporty PDF/Excel). Format: `nazwa:` a strategia od nowego wiersza; wpisy rozdzielone
// pustą linią.
// @anchor compose-branch-strategy
// Pytania do klienta (`{{q:id}}`) w złożeniu są rozwiązane: odpowiedź albo „[wyjaśnić: …]”.
export function composeBranchStrategy(node) {
    const qaIndex = buildQaIndex(node);
    return collectBranchStrategyEntries(node)
        .map(e => `${e.name}:\n${resolveStrategyText(e.strategy, qaIndex)}`)
        .join('\n\n');
}

// @anchor strategy-tokens
// Strategia z pytaniami do klienta w UI: odpowiedź (turkus) albo „⏳ pytanie” (bursztyn, klik → Q&A węzła).
function StrategyTokens({ text, qaIndex, onOpenQuestion }) {
    return splitStrategyTokens(text, qaIndex).map((part, i) => {
        if (part.text != null) return <React.Fragment key={i}>{part.text}</React.Fragment>;
        const p = part.qa;
        if (!p) return <span key={i} className="px-1 rounded bg-red-500/15 text-red-300 text-[12px]" title="Pytanie usunięte z Pytań i odpowiedzi">brak pytania</span>;
        if (String(p.answer || '').trim()) {
            return <span key={i} title={`Odpowiedź klienta na: ${p.question}`} className="text-teal-300 border-b border-dashed border-teal-400/50">{p.answer}</span>;
        }
        return (
            <span
                key={i}
                onMouseDown={e => { if (!onOpenQuestion) return; e.preventDefault(); e.stopPropagation(); onOpenQuestion(p); }}
                title="Czeka na odpowiedź klienta — kliknij, aby otworzyć Pytania i odpowiedzi"
                className="inline px-1.5 rounded border border-dashed border-amber-400/60 bg-amber-500/10 text-amber-300 text-[14px] cursor-pointer hover:bg-amber-500/20"
            >⏳ {p.question}</span>
        );
    });
}

// @anchor leaf-strategy-cell
// Komórka Strategii liścia / węzła pośredniego. Bez znaczników — zwykła textarea jak dotąd.
// Ze znacznikami `{{q:id}}` — podgląd z odpowiedziami; klik/fokus przełącza w edycję surowego tekstu.
// „?” dopisuje nowe pytanie w nowym wierszu na końcu strategii.
function LeafStrategyCell({ node, qaIndex, fieldClass, onChange, onSave, onAddQuestion, onOpenQuestion, onKeyDown }) {
    const value = node.strategy || '';
    const hasTokens = strategyHasTokens(value);
    const [editing, setEditing] = useState(false);
    const [asking, setAsking] = useState(false);
    const [question, setQuestion] = useState('');
    const [withTask, setWithTask] = useState(true);
    const [busy, setBusy] = useState(false);
    const pending = hasTokens ? pendingStrategyQuestions(value, qaIndex).length : 0;

    const submit = async () => {
        const q = question.trim();
        if (!q || busy) return;
        setBusy(true);
        try { await onAddQuestion(q, withTask); } finally { setBusy(false); }
        setQuestion('');
        setAsking(false);
    };

    return (
        <div className="group/strat relative pr-5">
            {hasTokens && !editing ? (
                <div
                    tabIndex={0}
                    data-nav-row={node.id}
                    data-nav-col="strategia"
                    onFocus={() => setEditing(true)}
                    className={`whitespace-pre-wrap text-base leading-snug text-gray-300 cursor-text min-h-[1.5em] focus:outline-none ${fieldClass}`}
                >
                    <StrategyTokens text={value} qaIndex={qaIndex} onOpenQuestion={onOpenQuestion} />
                </div>
            ) : (
                <AutoResizeTextarea
                    autoFocus={editing}
                    value={value}
                    onChange={onChange}
                    onBlur={e => { onSave(e.target.value); setEditing(false); }}
                    placeholder="Strategia elementu…"
                    className={`bg-transparent border-none resize-none focus:outline-none text-base w-full placeholder-gray-700 leading-snug ${fieldClass}`}
                    data-nav-row={node.id}
                    data-nav-col="strategia"
                    onKeyDown={onKeyDown}
                />
            )}
            {pending > 0 && !editing && (
                <div className="mt-0.5 text-[12px] text-amber-300/80">{pending === 1 ? 'czeka na odpowiedź' : `czeka na ${pending} odpowiedzi`}</div>
            )}
            {/* @anchor strategy-add-question-button */}
            <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => setAsking(a => !a)}
                title="Wstaw pytanie do klienta — odpowiedź uzupełni strategię"
                className={`absolute top-0 right-0 p-0.5 rounded text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/15 transition-opacity ${asking ? 'opacity-100' : 'opacity-0 group-hover/strat:opacity-100 focus:opacity-100'}`}
            >
                <HelpCircle size={13} />
            </button>
            {asking && (
                <div className="mt-1 flex flex-col gap-1 p-1.5 rounded border border-amber-400/40 bg-amber-500/[0.06]">
                    <input
                        autoFocus
                        value={question}
                        disabled={busy}
                        onChange={e => setQuestion(e.target.value)}
                        onKeyDown={e => {
                            e.stopPropagation();
                            if (e.key === 'Enter') { e.preventDefault(); submit(); }
                            if (e.key === 'Escape') { setAsking(false); setQuestion(''); }
                        }}
                        placeholder="Pytanie… (Enter)"
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-[14px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-400/50"
                    />
                    <label className="flex items-center gap-1.5 text-[12px] text-gray-400 cursor-pointer select-none">
                        <input type="checkbox" checked={withTask} onChange={e => setWithTask(e.target.checked)} className="accent-amber-500" />
                        zadanie „Wyjaśnić czy…” dla mnie
                    </label>
                </div>
            )}
        </div>
    );
}

// Wszystkie Q&A z gałęzi (dzieci danego węzła), grupowane po węźle — treść zakładki Q&A
// w szufladzie węzła top-level. Edytowalne: każda grupa to QaCell na PEŁNEJ liście `qa`
// danego dziecka (nie na przefiltrowanych parach — indeksy muszą zgadzać się z node.qa).
// Raz pokazana grupa zostaje do zamknięcia szuflady (`seenIds`), żeby nie znikała w trakcie
// edycji, gdy ktoś chwilowo wyczyści oba pola jedynej pary.
// @anchor qa-branch-view
function QaBranchView({ node, onChangeNode, onPersist }) {
    const seenIds = useRef(new Set());
    const groups = [];
    const walk = (n, depth) => {
        for (const child of (n?.children || [])) {
            const list = Array.isArray(child.qa) ? child.qa : [];
            const filled = list.some(p => (p?.question || '').trim() || (p?.answer || '').trim());
            if (filled) seenIds.current.add(child.id);
            if (seenIds.current.has(child.id)) groups.push({ id: child.id, name: child.name || 'Element WBS', depth, qa: list });
            walk(child, depth + 1);
        }
    };
    // Własne pytania gałęzi głównej (np. zadane w czacie gałęzi) — pierwsza grupa, przed elementami.
    const own = Array.isArray(node?.qa) ? node.qa : [];
    if (own.some(p => (p?.question || '').trim() || (p?.answer || '').trim())) seenIds.current.add(node.id);
    if (seenIds.current.has(node.id)) groups.push({ id: node.id, name: node.name || 'Gałąź', depth: 0, qa: own });
    walk(node, 0);
    if (groups.length === 0) {
        return <p className="text-gray-600 text-[15px] italic">Brak pytań i odpowiedzi w tej gałęzi — dodaj je w szufladzie Q&A konkretnej pozycji.</p>;
    }
    return (
        <div className="flex flex-col gap-5">
            {groups.map(g => (
                <div key={g.id} style={{ marginLeft: `${g.depth * 16}px` }}>
                    <p className="text-[14px] font-bold text-blue-300/80 mb-1.5">{g.name}</p>
                    <QaCell pairs={g.qa} onChange={next => onChangeNode(g.id, next)} onPersist={onPersist} />
                </div>
            ))}
        </div>
    );
}

// @anchor drawer-status-color
// Kolor ikony Zadania/Q&A w pasku akcji: czerwony = coś przeterminowane, pomarańczowy = coś
// niezamknięte, zielony = wszystko zamknięte, szary = brak wpisów.
const DRAWER_STATUS_COLOR = {
    overdue: 'text-red-400 hover:text-red-300',
    open: 'text-orange-400 hover:text-orange-300',
    done: 'text-emerald-400 hover:text-emerald-300',
    none: 'text-gray-500 hover:text-blue-400',
};
function drawerStatusKey({ open = 0, overdue = 0, done = 0 } = {}) {
    if (overdue > 0) return 'overdue';
    if (open > 0) return 'open';
    if (done > 0) return 'done';
    return 'none';
}
// Q&A: pytanie bez odpowiedzi = otwarte, z odpowiedzią = zamknięte (Q&A nie ma terminów).
function qaSummary(pairs) {
    const filled = (pairs || []).filter(p => (p?.question || '').trim() || (p?.answer || '').trim());
    const done = filled.filter(p => (p?.answer || '').trim()).length;
    return { open: filled.length - done, overdue: 0, done, total: filled.length };
}

// ── Zadania węzła WBS — treść zakładki „Zadania" w szufladzie ────────────────
// Pokazuje zadania WSZYSTKICH użytkowników przypięte do węzła (GET /my-tasks/by-wbs-node/:id).
// „Dodaj zadanie” i klik w zadanie otwierają wspólny TaskModal (ten sam co w kalendarzu zamówienia)
// z węzłem ustawionym na ten wiersz. Odhaczać, ustawiać alarm i usuwać może odpowiedzialny albo autor —
// backend sprawdza to samo (findEditable).

// @anchor chat-image-max-bytes-front — zgodne z CHAT_IMAGE_MAX_BYTES w backendzie (comments/chat-image.storage.ts).
const CHAT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
// @anchor chat-image-cache — { nazwa pliku → blob URL }; czat odświeża się co 15 s, obrazki pobieramy raz na sesję.
const chatImageCache = new Map();

// @anchor chat-image
// Miniatura obrazka z czatu. Endpoint jest za JWT, więc pobieramy blob fetch-em zamiast <img src>.
function ChatImage({ fileName, onOpen }) {
    const [url, setUrl] = useState(() => chatImageCache.get(fileName) || null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (url) return;
        let cancelled = false;
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        fetch(`${API_URL}/comments/images/${encodeURIComponent(fileName)}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => (r.ok ? r.blob() : Promise.reject(r.status)))
            .then(b => { const u = URL.createObjectURL(b); chatImageCache.set(fileName, u); if (!cancelled) setUrl(u); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [fileName, url]);
    if (failed) return <span className="text-[12px] text-gray-500 italic">obrazek niedostępny</span>;
    if (!url) return <span className="h-24 w-24 rounded bg-white/5 flex items-center justify-center"><Loader2 size={14} className="animate-spin text-gray-500" /></span>;
    return (
        <button onClick={() => onOpen?.(url)} className="block" title="Powiększ">
            <img src={url} alt="" className="max-h-40 max-w-[240px] rounded border border-white/10 object-contain bg-black/20" />
        </button>
    );
}

const fmtChatTime = (d) => new Date(d).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// @anchor group-chat-threads
// Dzieli wiadomości gałęzi głównej na wątki per węzeł ({ id, messages }), wiadomości w wątku chronologicznie.
// Wątki rosnąco po ostatniej wiadomości — najświeższy ląduje na dole, przy polu wpisywania.
function groupChatThreads(messages, ownId) {
    const byNode = new Map();
    for (const m of messages) {
        const id = m.wbsNodeId || ownId;
        if (!byNode.has(id)) byNode.set(id, []);
        byNode.get(id).push(m);
    }
    const lastAt = (g) => new Date(g.messages[g.messages.length - 1].createdAt).getTime();
    return [...byNode].map(([id, msgs]) => ({ id, messages: msgs })).sort((a, b) => lastAt(a) - lastAt(b));
}

// @anchor wbs-chat-drawer
// Czat gałęzi WBS — treść zakładki „Czat" w szufladzie. Wpisy to Comment z wbsNodeId
// (GET/POST /comments/order/:processNodeId?wbsNodeId=), więc trafiają też do ogólnego czatu
// zamówienia. Wysłanie powiadamia cały zespół zamówienia (backend). Otwarta szuflada oznacza
// cudze wpisy jako przeczytane i odświeża się co 15 s.
// `branchNames` ({ [id]: nazwa } potomków) — tylko dla gałęzi głównej: czat pokazuje wtedy też
// wiadomości z podgałęzi (z ich nazwą), jak Q&A gałęzi; nowa wiadomość idzie do gałęzi głównej.
// `questionsFor(wbsNodeId)` — otwarte pytania węzła wątku; `onAnswerQuestion(wbsNodeId, qaId, text, messageId)`
// wpisuje treść wiadomości jako odpowiedź; `answerFor(messageId)` — pytanie, na które wiadomość już odpowiada.
// `onAskQuestion(wbsNodeId, text, messageId, qaId)` — wiadomość wysłana jako pytanie (nowe albo istniejące z Q&A);
// `askedBy(messageId)` — para Q&A, którą ta wiadomość zadała.
function WbsChatDrawer({ wbsNodeId, processNodeId, onChanged, branchNames, nodeName, questionsFor, onAnswerQuestion, answerFor, onAskQuestion, askedBy }) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const currentUserId = token ? (() => { try { return JSON.parse(atob(token.split('.')[1])).sub; } catch { return null; } })() : null;
    const [messages, setMessages] = useState(null);
    // @anchor wbs-chat-unread-threads — gałąź główna: wątki, które przy otwarciu miały nieprzeczytane (kropka na liście).
    const [unreadThreads, setUnreadThreads] = useState(() => new Set());
    // Wątek wybrany ręcznie — od tej chwili auto-wybór najnowszego nieprzeczytanego już go nie przestawia.
    const userPickedRef = useRef(false);
    // @anchor wbs-chat-reply-to — gałąź główna: wątek (id liścia), do którego idzie wiadomość; null = sama gałąź główna.
    const [replyTo, setReplyTo] = useState(null);
    const [newThreadOpen, setNewThreadOpen] = useState(false);
    // @anchor wbs-chat-thread-statuses — { [wbsNodeId]: { status, closedAt, closedBy } }; brak wpisu = aktywny.
    const [threadStatuses, setThreadStatuses] = useState({});
    // @anchor wbs-chat-show-archived — filtr „Pokaż archiwalne”: zamknięte wątki domyślnie ukryte.
    const [showArchived, setShowArchived] = useState(false);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    // @anchor wbs-chat-answering — { messageId, qaId } wiadomość przypisywana jako odpowiedź na pytanie
    const [answering, setAnswering] = useState(null);
    // @anchor wbs-chat-ask-mode — null | 'new' (wiadomość = nowe pytanie) | id pary Q&A wysyłanej do czatu
    const [askMode, setAskMode] = useState(null);
    const [askMenuOpen, setAskMenuOpen] = useState(false);
    const bottomRef = useRef(null);
    const auth = { Authorization: `Bearer ${token}` };
    const base = `${API_URL}/comments/order/${processNodeId}`;
    const q = `?wbsNodeId=${encodeURIComponent(wbsNodeId)}`;
    const branchNamesRef = useRef(branchNames);
    branchNamesRef.current = branchNames;
    const isBranch = !!branchNames;

    const load = useCallback(async () => {
        if (!processNodeId) return;
        try {
            const names = branchNamesRef.current;
            const stRes = await fetch(`${base}/threads`, { headers: auth });
            const statuses = stRes.ok ? await stRes.json() : {};
            setThreadStatuses(statuses);
            if (names) {
                // Gałąź główna: węzeł + WSZYSCY potomkowie wg bazy (?branchOf=), nie tylko liście widoczne w tabeli —
                // tabela chowa pozycje wg roli, a każdy z zespołu ma widzieć te same wątki. Każdy wpis niesie `wbsNodeName`.
                const res = await fetch(`${base}?branchOf=${encodeURIComponent(wbsNodeId)}`, { headers: auth });
                if (!res.ok) return;
                const list = await res.json();
                setMessages(list);
                // Przeczytane oznaczamy per węzeł: własny zawsze, potomkowie tylko z cudzymi nieprzeczytanymi.
                const unreadIds = new Set([wbsNodeId]);
                const unreadThreads = new Set();
                for (const m of list) {
                    if (m.user?.id !== currentUserId && !(m.reads || []).some(r => r.userId === currentUserId)) {
                        unreadIds.add(m.wbsNodeId);
                        unreadThreads.add(m.wbsNodeId || wbsNodeId);
                    }
                }
                // Lista pobrana PRZED mark-read, więc widać tu, co było nieprzeczytane — te wątki dostają kropkę.
                // Dokładamy, nie nadpisujemy: kolejne odświeżenie (już przeczytane) nie może jej zgasić.
                if (unreadThreads.size) setUnreadThreads(prev => new Set([...prev, ...unreadThreads]));
                // Dopóki nikt nie wybrał wątku, po prawej otwiera się najnowszy nieprzeczytany
                // (a bez nieprzeczytanych — najnowszy w ogóle).
                if (!userPickedRef.current) {
                    const threads = groupChatThreads(list, wbsNodeId);
                    // Zamknięte (archiwum) pomijamy — otwierają się tylko z włączonym filtrem.
                    const open = [...threads].reverse().filter(t => statuses[t.id]?.status !== 'CLOSED');
                    const pick = open.find(t => unreadThreads.has(t.id)) || open[0];
                    if (pick) setReplyTo(pick.id === wbsNodeId ? null : pick.id);
                }
                await Promise.all([...unreadIds].map(id => fetch(`${base}/mark-read?wbsNodeId=${encodeURIComponent(id)}`, { method: 'POST', headers: auth })));
            } else {
                const res = await fetch(`${base}${q}`, { headers: auth });
                if (res.ok) setMessages(await res.json());
                await fetch(`${base}/mark-read${q}`, { method: 'POST', headers: auth });
            }
            onChanged?.();
        } catch (e) { console.warn('[WBS] chat load failed', e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processNodeId, wbsNodeId, isBranch]);
    useEffect(() => {
        load();
        const iv = setInterval(load, 15000);
        return () => clearInterval(iv);
    }, [load]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages?.length, replyTo]);

    // Obrazki czekające na wysłanie: już wgrane na serwer, w wiadomości idą jako nazwy plików.
    const [pending, setPending] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [preview, setPreview] = useState(null);
    const inputRef = useRef(null);
    const selectThread = (id) => {
        userPickedRef.current = true;
        setReplyTo(id === wbsNodeId ? null : id);
        setUnreadThreads(prev => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
        inputRef.current?.focus();
    };
    const fileInputRef = useRef(null);

    // @anchor upload-chat-images
    const uploadImages = async (files) => {
        const imgs = [...files].filter(f => f.type.startsWith('image/'));
        if (!imgs.length) return;
        setUploadError('');
        setUploading(true);
        try {
            for (const f of imgs) {
                if (f.size > CHAT_IMAGE_MAX_BYTES) { setUploadError(`${f.name || 'Obrazek'} — za duży (max 15 MB)`); continue; }
                const fd = new FormData();
                fd.append('file', f, f.name || 'obrazek.png');
                const res = await fetch(`${base}/images`, { method: 'POST', headers: auth, body: fd });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    setUploadError(err.message || `Nie udało się wysłać obrazka (HTTP ${res.status})`);
                    continue;
                }
                const { fileName } = await res.json();
                setPending(prev => [...prev, { fileName, url: URL.createObjectURL(f) }]);
            }
        } finally { setUploading(false); }
    };

    const send = async () => {
        const body = text.trim();
        if ((!body && !pending.length) || sending || uploading) return;
        setSending(true);
        try {
            const thread = replyTo || wbsNodeId;
            const res = await fetch(base, {
                method: 'POST',
                headers: { ...auth, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: body, wbsNodeId: thread, images: pending.map(p => p.fileName), ...(askMode && body ? { type: 'QUESTION' } : {}) }),
            });
            if (res.ok) {
                if (askMode && body) {
                    const created = await res.clone().json().catch(() => null);
                    if (created?.id) onAskQuestion?.(thread, body, created.id, askMode === 'new' ? null : askMode);
                    setAskMode(null);
                }
                // Podgląd lokalny przechodzi do cache, żeby świeżo wysłany obrazek nie pobierał się drugi raz.
                pending.forEach(p => chatImageCache.set(p.fileName, p.url));
                setText(''); setPending([]); await load();
            }
        } finally { setSending(false); }
    };

    if (messages === null) return <p className="text-gray-600 text-[15px] italic">Ładowanie…</p>;

    const renderMessage = (m) => {
        const mine = m.user?.id === currentUserId;
        const who = [m.user?.firstName, m.user?.lastName].filter(Boolean).join(' ') || 'Użytkownik';
        return (
            <div key={m.id} className={`flex flex-col max-w-[85%] ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
                <span className="text-[12px] text-gray-500">{who} · {fmtChatTime(m.createdAt)}</span>
                {m.text && (
                    <span className={`px-2.5 py-1.5 rounded-lg text-[15px] whitespace-pre-wrap break-words ${mine ? 'bg-blue-500/20 text-blue-100' : 'bg-white/5 text-gray-200'}`}>
                        {m.text}
                    </span>
                )}
                {m.text && (() => {
                    const asked = askedBy?.(m.id);
                    if (asked) {
                        const done = !!String(asked.answer || '').trim();
                        return (
                            <span className={`mt-0.5 text-[11px] ${done ? 'text-teal-300/80' : 'text-amber-300/80'}`}>
                                ❓ pytanie · {done ? `odpowiedź: ${asked.answer}` : 'czeka na odpowiedź'}
                            </span>
                        );
                    }
                    const linked = answerFor?.(m.id);
                    if (linked) return <span className="mt-0.5 text-[11px] text-teal-300/80">↳ odpowiedź na: {linked}</span>;
                    const thread = m.wbsNodeId || wbsNodeId;
                    const open = questionsFor?.(thread) || [];
                    if (!open.length) return null;
                    if (answering?.messageId !== m.id) {
                        return (
                            <button
                                onClick={() => setAnswering({ messageId: m.id, qaId: open[0].id })}
                                className="mt-0.5 text-[11px] text-amber-300/70 hover:text-amber-200"
                                title="Wpisz treść tej wiadomości jako odpowiedź na pytanie do klienta"
                            >↳ to odpowiedź na pytanie…</button>
                        );
                    }
                    return (
                        <div className="mt-1 flex items-center gap-1.5 max-w-full">
                            <select
                                value={answering.qaId}
                                onChange={e => setAnswering(a => ({ ...a, qaId: e.target.value }))}
                                className="min-w-0 max-w-[260px] bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-[12px] text-gray-200"
                            >
                                {open.map(p => <option key={p.id} value={p.id}>{p.question}</option>)}
                            </select>
                            <button
                                onClick={() => { onAnswerQuestion?.(thread, answering.qaId, m.text, m.id); setAnswering(null); }}
                                className="px-2 py-0.5 rounded border border-teal-400/40 text-[12px] text-teal-200 hover:bg-teal-500/15"
                            >Przypisz</button>
                            <button onClick={() => setAnswering(null)} className="p-0.5 text-gray-500 hover:text-white" title="Anuluj"><X size={11} /></button>
                        </div>
                    );
                })()}
                {m.images?.length > 0 && (
                    <div className={`flex flex-wrap gap-1.5 mt-1 ${mine ? 'justify-end' : ''}`}>
                        {m.images.map(name => <ChatImage key={name} fileName={name} onOpen={setPreview} />)}
                    </div>
                )}
            </div>
        );
    };
    const composer = (
        <>
            {(pending.length > 0 || uploading || uploadError) && (
                <div className="flex flex-wrap items-center gap-2">
                    {pending.map(p => (
                        <div key={p.fileName} className="relative">
                            <img src={p.url} alt="" className="h-16 w-16 object-cover rounded border border-white/10" />
                            <button
                                onClick={() => setPending(prev => prev.filter(x => x.fileName !== p.fileName))}
                                className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-gray-900 border border-white/20 text-gray-300 hover:text-white"
                                title="Usuń obrazek"
                            >
                                <X size={11} />
                            </button>
                        </div>
                    ))}
                    {uploading && <Loader2 size={16} className="animate-spin text-gray-400" />}
                    {uploadError && <span className="text-[12px] text-red-300">{uploadError}</span>}
                </div>
            )}
            <div className="flex items-end gap-2">
                <input
                    ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple className="hidden"
                    onChange={e => { uploadImages(e.target.files); e.target.value = ''; }}
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="p-1.5 rounded border border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10 disabled:opacity-40"
                    title="Załącz obrazek (można też wkleić Ctrl+V)"
                >
                    <ImagePlus size={16} />
                </button>
                {onAskQuestion && (() => {
                    // @anchor wbs-chat-ask-button — „?”: wiadomość jako nowe pytanie albo wysłanie pytania z Q&A węzła
                    const open = (questionsFor?.(replyTo || wbsNodeId) || []).filter(p => !p.askedMessageId);
                    return (
                        <div className="relative">
                            <button
                                onClick={() => (askMode ? (setAskMode(null), setAskMenuOpen(false)) : setAskMenuOpen(o => !o))}
                                className={`p-1.5 rounded border ${askMode ? 'border-amber-400/60 bg-amber-500/20 text-amber-200' : 'border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10'}`}
                                title={askMode ? 'Wyłącz tryb pytania' : 'Zadaj pytanie — trafi do Pytań i odpowiedzi tego elementu'}
                            >
                                <HelpCircle size={16} />
                            </button>
                            {askMenuOpen && !askMode && (
                                <div className="absolute bottom-full left-0 mb-1 z-20 w-72 max-h-64 overflow-y-auto rounded-lg border border-white/15 bg-[#0b1119] shadow-xl p-1 flex flex-col">
                                    <button
                                        onClick={() => { setAskMode('new'); setAskMenuOpen(false); inputRef.current?.focus(); }}
                                        className="text-left px-2.5 py-1.5 rounded text-[13px] text-amber-200 hover:bg-amber-500/10"
                                    >+ Nowe pytanie (wpisz je w polu wiadomości)</button>
                                    {open.length > 0 && <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] uppercase tracking-widest text-gray-500">Wyślij pytanie z Q&amp;A</div>}
                                    {open.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => { setAskMode(p.id); setText(p.question); setAskMenuOpen(false); inputRef.current?.focus(); }}
                                            className="text-left px-2.5 py-1.5 rounded text-[13px] text-gray-200 hover:bg-white/10"
                                        >{p.question}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}
                <AutoResizeTextarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    onPaste={e => {
                        const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
                        if (files.length) { e.preventDefault(); uploadImages(files); }
                    }}
                    inputRef={inputRef}
                    placeholder={askMode ? 'Pytanie… (Enter wysyła i dopisuje je do Pytań i odpowiedzi)' : 'Napisz do zespołu… (Enter wysyła, Shift+Enter nowa linia, Ctrl+V wkleja obrazek)'}
                    className={`flex-1 min-w-0 px-2 py-1.5 rounded bg-black/20 border ${askMode ? 'border-amber-400/60' : 'border-white/10'} text-[15px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-400/50`}
                />
                <button
                    onClick={send}
                    disabled={sending || uploading || (!text.trim() && !pending.length)}
                    className="px-3 py-1.5 rounded bg-red-500/20 border border-red-400/40 text-red-200 text-[14px] hover:bg-red-500/30 disabled:opacity-40 flex items-center gap-1"
                >
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Wyślij
                </button>
            </div>
        </>
    );

    // Nazwa liścia: z drzewa w tabeli, a dla liści ukrytych przed tą rolą — z `wbsNodeName` od backendu.
    const threadLabel = (id) => (id === wbsNodeId
        ? (nodeName || 'Ta gałąź')
        : (branchNames?.[id] || messages.find(m => m.wbsNodeId === id)?.wbsNodeName || 'Podgałąź'));
    const selectedId = replyTo || wbsNodeId;
    const threads = branchNames ? groupChatThreads(messages, wbsNodeId) : [];
    // Gałąź główna jest na liście zawsze (nawet bez wiadomości), żeby było gdzie zacząć rozmowę.
    if (branchNames && !threads.some(t => t.id === wbsNodeId)) threads.unshift({ id: wbsNodeId, messages: [] });
    // Wybrany liść bez wiadomości („Nowy wątek w…”) też trafia na listę, dopóki nikt w nim nie napisze.
    if (branchNames && !threads.some(t => t.id === selectedId)) threads.push({ id: selectedId, messages: [] });
    const selectedMessages = branchNames ? messages.filter(m => (m.wbsNodeId || wbsNodeId) === selectedId) : messages;
    const isClosed = (id) => threadStatuses[id]?.status === 'CLOSED';
    const archivedCount = threads.filter(t => isClosed(t.id)).length;
    // Zamknięte wątki ukryte (archiwum), chyba że włączony filtr „Pokaż archiwalne”.
    const visibleThreads = threads.filter(t => showArchived || !isClosed(t.id));
    const selectedVisible = visibleThreads.some(t => t.id === selectedId);
    // „Nowy wątek w…”: gałąź główna i liście bez widocznego wątku — także te z wątkiem w archiwum
    // (wybranie takiego wznawia go, bo pisać da się tylko w aktywnym).
    const freeLeaves = branchNames
        ? [wbsNodeId, ...Object.keys(branchNames)].filter(id => !visibleThreads.some(t => t.id === id))
        : [];
    const startThread = (id) => {
        setNewThreadOpen(false);
        if (isClosed(id)) setThreadStatus(id, 'ACTIVE');
        selectThread(id);
    };

    // @anchor set-thread-status — zamknij (do archiwum) / otwórz ponownie wątek; od razu w UI, potem PATCH.
    const setThreadStatus = async (id, status) => {
        setThreadStatuses(prev => ({ ...prev, [id]: { ...(prev[id] || {}), status, closedAt: status === 'CLOSED' ? new Date().toISOString() : null, closedBy: status === 'CLOSED' ? 'Ty' : null } }));
        try {
            await fetch(`${base}/threads/${encodeURIComponent(id)}`, {
                method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
            });
        } catch (e) { console.warn('[WBS] thread status failed', e); }
        load();
    };

    // @anchor wbs-chat-thread-header — nazwa wątku, status Aktywny/Zamknięty i przycisk zamknij / otwórz ponownie.
    const threadHeader = (id) => {
        const closed = isClosed(id);
        const st = threadStatuses[id];
        return (
            <div className="flex items-center gap-2 pb-1.5 border-b border-white/10">
                <span className={`text-[12px] font-bold uppercase tracking-wider truncate ${id === wbsNodeId ? 'text-sky-300' : 'text-emerald-300'}`}>{threadLabel(id)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${closed ? 'border-gray-500/40 text-gray-400 bg-white/5' : 'border-emerald-400/40 text-emerald-300 bg-emerald-500/10'}`}>
                    {closed ? 'Zamknięty' : 'Aktywny'}
                </span>
                {closed && st?.closedAt && (
                    <span className="text-[11px] text-gray-500 truncate">{fmtChatTime(st.closedAt)}{st.closedBy ? ` · ${st.closedBy}` : ''}</span>
                )}
                <button
                    onClick={() => setThreadStatus(id, closed ? 'ACTIVE' : 'CLOSED')}
                    className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] transition-all ${closed ? 'border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/10' : 'border-white/15 text-gray-400 hover:text-gray-200 hover:bg-white/10'}`}
                    title={closed ? 'Przywróć wątek z archiwum' : 'Zamknij wątek i przenieś do archiwum'}
                >
                    {closed ? <><RotateCcw size={11} /> Otwórz ponownie</> : <><Archive size={11} /> Zamknij wątek</>}
                </button>
            </div>
        );
    };
    // Zamknięty wątek jest tylko do odczytu — zamiast pola wpisywania informacja, jak go wznowić.
    const composerFor = (id) => (isClosed(id)
        ? <p className="text-[12px] text-gray-500 italic border-t border-white/10 pt-2">Wątek zamknięty (archiwum) — otwórz go ponownie, żeby pisać.</p>
        : composer);

    const messagesPane = (list, emptyText) => (
        list.length === 0
            ? <p className="flex-1 min-h-0 text-gray-600 text-[15px] italic">{emptyText}</p>
            : (
                <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto pr-1">
                    {list.map(renderMessage)}
                    <div ref={bottomRef} />
                </div>
            )
    );

    return (
        // @anchor wbs-chat-drawer-height — stała wysokość szuflady (pół ekranu); rozmowa przewija się w środku,
        // pole wpisywania zawsze przyklejone na dole.
        <div className={branchNames ? 'grid grid-cols-1 md:grid-cols-2 gap-3 w-full md:h-[50vh] md:min-h-[320px]' : 'flex flex-col gap-2 w-full md:w-1/2 h-[50vh] min-h-[320px]'}>
            {branchNames ? (
                <>
                    {/* @anchor wbs-chat-thread-list — lewa połowa: wątki gałęzi (gałąź główna + liście z wiadomościami),
                        najświeższy na górze; kropka = nieprzeczytane przy otwarciu szuflady. Klik wybiera wątek po prawej. */}
                    <div className="flex flex-col gap-1.5 min-h-0 max-h-[30vh] md:max-h-none overflow-y-auto pr-1">
                        {archivedCount > 0 && (
                            <label className="shrink-0 flex items-center gap-2 px-1 pb-0.5 text-[12px] text-gray-400 cursor-pointer select-none">
                                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="accent-emerald-500" />
                                Pokaż archiwalne ({archivedCount})
                            </label>
                        )}
                        {[...visibleThreads].reverse().map(g => {
                            const own = g.id === wbsNodeId;
                            const active = g.id === selectedId;
                            const last = g.messages[g.messages.length - 1];
                            const unread = unreadThreads.has(g.id) && !active;
                            const closed = isClosed(g.id);
                            return (
                                <button
                                    key={g.id}
                                    onClick={() => selectThread(g.id)}
                                    className={`shrink-0 text-left rounded-lg border px-3 py-2 transition-all ${closed ? 'border-white/10 bg-white/[0.02] opacity-60' : own ? 'border-sky-400/25 bg-sky-500/[0.04]' : 'border-emerald-400/25 bg-emerald-500/[0.03]'} ${active ? 'ring-2 ring-amber-400/60' : 'hover:border-white/30'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        {unread && <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" title="Nieprzeczytane" />}
                                        <span className={`text-[12px] font-bold uppercase tracking-wider truncate ${own ? 'text-sky-300' : 'text-emerald-300'}`}>{threadLabel(g.id)}</span>
                                        {closed && <span className="px-1 rounded text-[9px] font-bold uppercase tracking-wider border border-gray-500/40 text-gray-400">Zamknięty</span>}
                                        <span className="ml-auto text-[11px] text-gray-500 whitespace-nowrap">
                                            {last ? `${g.messages.length} · ${fmtChatTime(last.createdAt)}` : 'brak wiadomości'}
                                        </span>
                                    </div>
                                    {last && (
                                        <div className={`mt-0.5 text-[12px] truncate ${unread ? 'text-gray-200' : 'text-gray-500'}`}>
                                            {last.user?.firstName || 'Użytkownik'}: {last.text || (last.images?.length ? '📷 obrazek' : '')}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                        {freeLeaves.length > 0 && (
                            // @anchor wbs-chat-new-thread-picker — własna lista zamiast <select>: natywnych opcji
                            // nie da się ostylować, odstawały od szuflady. Rozwija się w miejscu (lista wątków przewija się,
                            // więc pływające menu by się ucinało).
                            <div className="mt-1 shrink-0 rounded-lg border border-dashed border-emerald-400/25 overflow-hidden">
                                <button
                                    onClick={() => setNewThreadOpen(o => !o)}
                                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-gray-400 hover:text-emerald-200 hover:bg-emerald-500/[0.06] transition-all"
                                >
                                    <Plus size={13} /> Nowy wątek w…
                                    {newThreadOpen ? <ChevronDown size={13} className="ml-auto" /> : <ChevronRight size={13} className="ml-auto" />}
                                </button>
                                {newThreadOpen && (
                                    <div className="flex flex-col gap-0.5 p-1 border-t border-emerald-400/15 bg-black/20">
                                        {freeLeaves.map(id => (
                                            <button
                                                key={id}
                                                onClick={() => startThread(id)}
                                                className="flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-[12px] font-semibold uppercase tracking-wider text-emerald-300/80 hover:text-emerald-200 hover:bg-emerald-500/10 transition-all"
                                            >
                                                <span className="truncate">{threadLabel(id)}</span>
                                                {isClosed(id) && <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-gray-500 whitespace-nowrap">w archiwum — wznowi</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Prawa połowa: rozmowa wybranego wątku i pole wpisywania (wiadomość idzie do tego wątku). */}
                    <div className="flex flex-col gap-2 min-w-0 min-h-0 rounded-lg border border-amber-400/30 bg-black/10 p-2.5">
                        {selectedVisible ? (
                            <>
                                {threadHeader(selectedId)}
                                {messagesPane(selectedMessages, 'Brak wiadomości w tym wątku — napisz pierwszą, dostanie ją cały zespół zamówienia.')}
                                {composerFor(selectedId)}
                            </>
                        ) : (
                            // Wybrany wątek poszedł do archiwum (albo wszystkie są zamknięte) — nic nie pokazujemy na siłę.
                            <p className="flex-1 flex items-center justify-center text-center text-[13px] text-gray-500 italic px-4">
                                Brak aktywnego wątku — wybierz wątek z listy albo zacznij nowy przez „Nowy wątek w…”.
                            </p>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {threadHeader(wbsNodeId)}
                    {messagesPane(messages, 'Brak wiadomości — napisz pierwszą, dostanie ją cały zespół zamówienia.')}
                    {composerFor(wbsNodeId)}
                </>
            )}
            {/* Podgląd w DOM szuflady — klik w niego nie liczy się jako „poza czatem” i nie zamyka czatu. */}
            {preview && (
                <div className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out" onClick={() => setPreview(null)}>
                    <img src={preview} alt="" className="max-h-full max-w-full rounded shadow-2xl" />
                    <button onClick={() => setPreview(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" title="Zamknij">
                        <X size={18} />
                    </button>
                </div>
            )}
        </div>
    );
}

// @anchor wbs-tasks-drawer
// `branch` — gałąź główna: zadania całego poddrzewa (jak eksport PDF strategii), z nazwą pozycji przy zadaniu.
function WbsTasksDrawer({ wbsNodeId, processNodeId, onChanged, branch = false }) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const currentUserId = token ? (() => { try { return JSON.parse(atob(token.split('.')[1])).sub; } catch { return null; } })() : null;
    const [tasks, setTasks] = useState(null);
    const [error, setError] = useState(null);
    // @anchor wbs-task-alarm-task-id — zadanie z otwartym edytorem alarmu cyklicznego (tylko odpowiedzialny)
    const [alarmTaskId, setAlarmTaskId] = useState(null);
    // @anchor wbs-task-modal — { task } edycja albo { task: null } nowe zadanie tego węzła
    const [modal, setModal] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/my-tasks/by-wbs-node/${wbsNodeId}${branch ? '?subtree=1' : ''}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error('Błąd pobierania zadań');
            setTasks(await res.json());
        } catch (err) {
            setError(err.message);
            setTasks([]);
        }
    }, [wbsNodeId, token, branch]);
    useEffect(() => { load(); }, [load]);

    const toggleDone = async (t) => {
        const status = isTaskClosed(t.status) ? 'TO_DO' : 'DONE';
        setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status } : x));
        await fetch(`/api/my-tasks/${t.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        onChanged?.();
    };

    const remove = async (t) => {
        setTasks(prev => prev.filter(x => x.id !== t.id));
        await fetch(`/api/my-tasks/${t.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        onChanged?.();
    };

    const who = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.email || '—';
    // Od–Do: ten sam dzień „07.11.2026 08:00–09:00”, kilka dni „07.11 08:00 – 09.11.2026 16:00”; bez godziny sam termin.
    const fmtWhen = (t) => {
        if (!t.plannedEnd) return '';
        const end = new Date(t.plannedEnd);
        const day = (d, year = true) => d.toLocaleDateString('pl-PL', year ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { day: '2-digit', month: '2-digit' });
        const hm = (d) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        if (!t.durationMinutes) return day(end);
        const start = new Date(t.plannedStart || t.plannedEnd);
        return start.toDateString() === end.toDateString()
            ? `${day(end)} ${hm(start)}–${hm(end)}`
            : `${day(start, false)} ${hm(start)} – ${day(end)} ${hm(end)}`;
    };

    return (
        <div className="flex flex-col gap-2">
            {tasks === null ? (
                <p className="text-gray-500 text-[14px] flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Wczytywanie…</p>
            ) : tasks.length === 0 ? (
                <p className="text-gray-600 text-[14px] italic">{branch ? 'Brak zadań w tej gałęzi.' : 'Brak zadań przypiętych do tej pozycji.'}</p>
            ) : (
                <ul className="flex flex-col">
                    {tasks.map(t => {
                        const mine = t.userId === currentUserId || t.createdById === currentUserId;
                        const done = isTaskClosed(t.status);
                        const overdue = !done && t.plannedEnd && new Date(t.plannedEnd) < new Date();
                        const meta = EXEC_STATUS_META[t.status === 'OPEN' ? 'TO_DO' : t.status];
                        return (
                            <li key={t.id} className="py-1 border-t border-white/5 first:border-t-0 group/task">
                                <div className="flex items-center gap-2">
                                <button
                                    onClick={() => mine && toggleDone(t)}
                                    disabled={!mine}
                                    title={mine ? (done ? 'Oznacz jako do wykonania' : 'Oznacz jako wykonane') : 'Zadanie innej osoby — zmienić może odpowiedzialny lub zlecający'}
                                    className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-all ${done ? 'bg-emerald-500/30 border-emerald-400/60 text-emerald-300' : 'border-white/20'} ${mine ? 'hover:border-blue-400' : 'opacity-50 cursor-default'}`}
                                >
                                    {done && <Check size={11} />}
                                </button>
                                <button
                                    onClick={() => setModal({ task: t })}
                                    title="Otwórz zadanie"
                                    className={`flex-1 min-w-0 text-left text-[15px] break-words hover:underline ${done ? 'line-through text-gray-500' : 'text-gray-200'}`}
                                >
                                    {branch && t.wbsNodeId !== wbsNodeId && t.wbsNode?.name && <span className="block text-[12px] text-gray-500 uppercase tracking-wide no-underline">{t.wbsNode.name}</span>}
                                    {t.title}
                                    {t.description && <span className="block text-[13px] text-gray-500 italic whitespace-pre-wrap no-underline">{t.description}</span>}
                                </button>
                                {meta && <span className={`text-[12px] flex-shrink-0 ${meta.color}`}>{meta.label}</span>}
                                {t.plannedEnd && (
                                    <span className={`text-[13px] flex-shrink-0 ${overdue ? 'text-red-400' : 'text-gray-500'}`}>{fmtWhen(t)}</span>
                                )}
                                <span className="text-[13px] text-gray-500 flex-shrink-0 w-48 truncate text-right" title={t.createdById && t.createdById !== t.userId ? `Zlecił: ${who(t.createdBy)}` : t.user?.email}>{who(t.user)}</span>
                                {mine ? (
                                    <button
                                        onClick={() => setAlarmTaskId(id => id === t.id ? null : t.id)}
                                        title="Alarm cykliczny"
                                        className={`flex-shrink-0 w-6 h-6 rounded border flex items-center justify-center transition-all ${alarmTaskId === t.id || t.reminders?.length ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300' : 'border-white/10 text-gray-500 hover:text-indigo-300'}`}
                                    >
                                        <Repeat size={11} />
                                    </button>
                                ) : <span className="w-6 flex-shrink-0" title="Alarm cykliczny ustawia odpowiedzialny lub zlecający" />}
                                {mine ? (
                                    <button onClick={() => remove(t)} title="Usuń zadanie" className="p-0.5 rounded text-gray-700 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/task:opacity-100 transition-all">
                                        <X size={12} />
                                    </button>
                                ) : <span className="w-[16px]" />}
                                </div>
                                {alarmTaskId === t.id && (
                                    <div className="max-w-md ml-6">
                                        <CyclicAlarmEditor taskId={t.id} plannedEnd={t.plannedEnd} onClose={() => { setAlarmTaskId(null); load(); }} />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            <div className="pt-1">
                <button
                    onClick={() => setModal({ task: null })}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/80 hover:bg-blue-600 text-white text-[14px] transition-all"
                >
                    <Plus size={12} /> Dodaj zadanie
                </button>
            </div>
            {error && <p className="text-[13px] text-red-400">{error}</p>}
            {modal && (
                <TaskModal
                    task={modal.task}
                    processNodeId={processNodeId}
                    defaults={{ wbsNodeId }}
                    lockNode={!modal.task}
                    onClose={() => setModal(null)}
                    onSaved={() => { setModal(null); load(); onChanged?.(); }}
                />
            )}
        </div>
    );
}

import { UNIT_OPTIONS, sanitizeQtyInput, evalQtyFormula, suggestDefaultUnit, getLeafDefaultFrom, DRAWER } from './wbsConstants';
import { ProductCard } from './WbsMaterialsPanel';
import WbsRealizationDrawer, { PickaxeIcon } from './WbsRealizationDrawer';
import { offerLockInputProps } from '../OfferLockGuard';

const API_URL = '/api';
const WBS_COL_WIDTHS_KEY = 'wbs-hybrid-col-widths';
const WBS_HIDDEN_COLS_KEY = 'wbs-hybrid-hidden-cols';

// ─── MaterialReqExpandPanel ───────────────────────────────────────────────────

function MaterialReqExpandPanel({ node, req, processNodeId, versionId, onSaved, onDeleteNode, onNodeFieldSave, onNodeFieldLocal, reqsLoaded, offerLocked = false }) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const headers = React.useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    const [card, setCard] = React.useState(req || null);
    const [materialDb, setMaterialDb] = React.useState([]);
    const [offers, setOffers] = React.useState([]);

    // @anchor mat-req-reload-seq — numer ostatniego żądania GET karty. Odpowiedzi potrafią wrócić
    // w innej kolejności niż wysłane (na produkcji, przy realnym opóźnieniu sieci); starsza
    // odpowiedź nadpisywała wtedy świeższy stan i pola panelu wracały do poprzednich wartości.
    const reloadSeq = React.useRef(0);
    // `opts.silent` — odśwież tylko tę kartę, bez bumpu reqRefreshKey i przeładowania drzewa WBS.
    const reloadCard = React.useCallback(async (opts) => {
        if (!card?.id) return;
        const seq = ++reloadSeq.current;
        const res = await fetch(`${API_URL}/material-requirements/${card.id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const updated = await res.json();
        if (seq !== reloadSeq.current) return; // wyprzedzona przez nowsze żądanie — odrzuć
        setCard(updated);
        onSaved?.(updated, opts);
    }, [card?.id, token, onSaved]);

    // Jeśli nie ma karty — utwórz ją automatycznie (tylko gdy naprawdę nie istnieje).
    // WAŻNE: versionId=null (baseline), nie snapshot — requirement musi być widoczny we wszystkich wersjach.
    // Snapshot-owe wersjoowanie WBS klonuje węzły (nowe UUID), więc `req` lookup po wbsNodeId
    // zawodzi dla snapshot-ów. Fallback po nazwie (matReqByName) jest obsługiwany przez rodzica przed
    // przekazaniem `req` do panelu, więc tutaj docieramy tylko gdy requirement faktycznie nie istnieje.
    // reqsLoaded pilnuje, żeby auto-create nie odpalił się zanim rodzic skończy pierwszy fetch
    // material-requirements/node/{processNodeId} — inaczej `req` bywa chwilowo null i powstaje
    // duplikat (ghost-requirement), bo prawdziwe wymaganie i tak zaraz przyjdzie z fetcha.
    React.useEffect(() => {
        if (card) { if (req) setCard(req); return; }
        if (!node.id || !reqsLoaded) return;
        const reqType = wbsTypeFromAny(node.type) === 'equipment' ? 'equipment' : 'material';
        fetch(`${API_URL}/material-requirements`, {
            method: 'POST', headers,
            body: JSON.stringify({
                nodeId: processNodeId, versionId: null, name: node.name, type: reqType,
                quantity: node.quantity || 1, unit: node.unit || 'sztuki', wbsNodeId: node.id,
            }),
        }).then(r => r.ok ? r.json() : null).then(data => { if (data) { setCard(data); onSaved?.(data); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id, reqsLoaded]);

    // `req` z rodzica nadpisuje kartę tylko gdy istnieje. Chwilowe null (rozwiązanie węzeł→wymaganie
    // nie trafia po odświeżeniu listy) zwijało cały panel do „Tworzenie karty materiałowej…" —
    // to właśnie wyglądało jak restart widoku w trakcie wypełniania.
    React.useEffect(() => { if (req) setCard(req); }, [req]);

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

    // Cena z ProductCard → budżet WBS. Aktualizuje lokalny wbsTree (żeby wiersz liścia od razu
    // pokazał nową cenę, nie starą do przeładowania) + persystuje unitCost na węźle ORAZ priceNetto
    // na karcie materiałowej (inaczej KOSZT JEDN wraca do starej wartości po onRefresh).
    const handlePropagatePrice = React.useCallback(async (c, w, price) => {
        onNodeFieldLocal?.(node.id, 'unitCost', price);
        if (c?.id) {
            setCard(prev => (prev ? { ...prev, priceNetto: price } : prev));
            await fetch(`${API_URL}/material-requirements/${c.id}`, {
                method: 'PATCH', headers, body: JSON.stringify({ priceNetto: price }),
            });
        }
        // await, nie fire-and-forget: updateNodeField robi PATCH /budget i dopiero potem
        // refreshWbsNodes. Bez oczekiwania odczyty odpalone przez wołającego wyprzedzały ten
        // zapis i cena w karcie oraz w kolumnie WBS wracała do poprzedniej wartości.
        await onNodeFieldSave?.(node.id, 'unitCost', price);
    }, [node.id, headers, onNodeFieldLocal, onNodeFieldSave]);

    return (
        // Szuflada rozwiniętego liścia w wariancie KARTY (`DRAWER.card`) — ten sam zabieg co
        // w Realizacja_new: zaokrąglony prostokąt na ciemniejszym tle, obwiedziony akcentem,
        // z pełnowymiarowym nagłówkiem zamiast mikro-etykiety 10 px. Wcześniej był kręgosłup
        // przy lewej krawędzi i rozwinięcie ciągnęło się jako dalszy ciąg listy, choć karta
        // produktu jest osobnym obiektem, nie kolejnym wierszem drzewa.
        // Bez `overflow-hidden` świadomie: przycinałby rozwinięte listy w karcie produktu.
        <div className={`${DRAWER.card} ${DRAWER.accent.offer.card}`}>
            <div className={DRAWER.cardHead}>
                <span className={`${DRAWER.cardTitle} ${DRAWER.accent.offer.title} text-base`}>Karta produktu</span>
                <span className={DRAWER.name}>{node.name}</span>
                <button
                    onClick={handleDelete}
                    className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                >
                    <Trash2 size={10} /> Usuń z WBS
                </button>
            </div>
            {card ? (
                <ProductCard
                    card={card}
                    wbsNode={{ id: node.id, name: node.name, quantity: node.quantity }}
                    token={token}
                    materialDb={materialDb}
                    offers={offers}
                    onRefresh={reloadCard}
                    onPropagatePrice={handlePropagatePrice}
                    readOnly={false}
                    offerLocked={offerLocked}
                />
            ) : (
                <div className="px-4 py-3 text-[14px] text-gray-600">Tworzenie karty materiałowej…</div>
            )}
        </div>
    );
}

const STRUCT_STATUS_META = {
    '':        { label: 'Brak',         style: 'bg-transparent text-gray-600 border-transparent' },
    NEW:       { label: 'Nowy',         style: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
    PENDING:   { label: 'Oczekuje',     style: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    PROPOSAL:  { label: 'Propozycja',   style: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    CONFIRMED: { label: 'Potwierdzone', style: 'bg-green-500/20 text-green-300 border-green-500/30' },
    REJECTED:  { label: 'Odrzucone',    style: 'bg-red-500/20 text-red-300 border-red-500/30' },
    ORDERED:   { label: 'Zamówione',    style: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
    EXTRA_ORDER: { label: 'Dodatkowe zamówienie', style: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30' },
    IN_STOCK:  { label: 'Na magazynie', style: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
    ISSUED:    { label: 'Wydane',       style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    DONE:      { label: 'Wykonane',     style: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
    INSTALLED: { label: 'Zainstalowane', style: 'bg-lime-500/20 text-lime-300 border-lime-500/30' },
    MIXED:     { label: 'Mieszany',     style: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
};

// @anchor work-struct-status-meta — te same kody i etykiety co `WORK_STATUS_META`
// (wbsConstants), tylko w plakietkowym kształcie tej tabeli. Etykiety biorę stamtąd,
// a nie przepisuję: piąta kopia listy statusów była dokładnie tym, co poprzednio
// rozjechało widoki i kazało drukować surowy kod zamiast nazwy.
const WORK_STRUCT_STATUS_META = {
    NEW:        { label: WORK_STATUS_META.NEW.label,        style: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
    STARTED:    { label: WORK_STATUS_META.STARTED.label,    style: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    ON_HOLD:    { label: WORK_STATUS_META.ON_HOLD.label,    style: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    COMPLETED:  { label: WORK_STATUS_META.COMPLETED.label,  style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    UNFINISHED: { label: WORK_STATUS_META.UNFINISHED.label, style: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    CANCELLED:  { label: WORK_STATUS_META.CANCELLED.label,  style: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

// @anchor struct-status-meta-for — plakietki właściwe dla typu liścia: praca, usługa,
// nocleg i paliwo idą własnym słownikiem, reszta drzewa zostaje na materiałowym.
const structStatusMetaFor = (type) => (usesWorkStatuses(type) ? WORK_STRUCT_STATUS_META : STRUCT_STATUS_META);

// Eksportowane nazwanym eksportem (jak `ConfirmDeleteModal`), żeby harness
// `test/status-dropdowns.html` renderował PRAWDZIWY select, a nie jego kopię — kopia
// przeszłaby test także wtedy, gdyby lista statusów w komponencie się rozjechała.
export { STRUCT_STATUS_META, WORK_STRUCT_STATUS_META };
// @anchor plan-struct-status-meta — plakietkowy wygląd czterech statusów PLANU. Etykiety
// biorę z `PLAN_STATUS_META`, nie przepisuję: piąta kopia listy statusów była dokładnie tym,
// co poprzednio rozjechało widoki.
const PLAN_STRUCT_STATUS_META = {
    NEW:       { label: PLAN_STATUS_META.NEW.label,       style: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
    PROPOSAL:  { label: PLAN_STATUS_META.PROPOSAL.label,  style: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    CONFIRMED: { label: PLAN_STATUS_META.CONFIRMED.label, style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    REJECTED:  { label: PLAN_STATUS_META.REJECTED.label,  style: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

// Ta tabela to ETAP PLANU, więc lista statusów jest JEDNA dla wszystkich typów liści:
// Nowe → Zaproponowane → Zaakceptowane / Odrzucone. „Rozpoczęte" nad pracą i „Zainstalowane"
// nad materiałem opisywały świat, który zaczyna się PO akceptacji — w planie nie miały czego
// opisywać, a mimo to dało się je tu ustawić. Pełne słowniki (magazynowy i robociznowy)
// zostają w zakładce Realizacja, gdzie mają sens.
//
// `type` przyjmujemy dalej, bo wołający go podaje, a na etapie planu po prostu nie zmienia
// listy — i nie ma go „porządkować" z wywołań: wraca, gdy dojdzie osobne pole statusu realizacji.
export function StatusSelect({ value, onChange, onKeyDown, type = '', ...rest }) {
    // Pozycja z kodem realizacyjnym w bazie (`ORDERED`, `IN_STOCK`, `STARTED`…) pokazuje się
    // jako „Zaakceptowane" — skoro ją zamówiono albo ekipa ją zaczęła, klient przyjął ją wcześniej.
    const code = planStatusFromAny(value);
    const meta = PLAN_STRUCT_STATUS_META[code];
    return (
        <select
            value={code}
            onChange={e => onChange(e.target.value)}
            // `w-full min-w-0` — tabela ma `table-layout: fixed`, więc komórka trzyma 128 px,
            // ale natywny select rozpychał się do najdłuższej opcji i WYCHODZIŁ na kolumnę
            // Właściciel, wyglądając jak drugi dropdown w tamtej kolumnie.
            className={`w-full min-w-0 text-[14px] px-2 py-0.5 rounded-lg border font-medium bg-black/40 cursor-pointer focus:outline-none focus:ring-0 transition-colors ${meta.style}`}
            onClick={e => e.stopPropagation()}
            onKeyDown={onKeyDown}
            {...rest}
        >
            {Object.entries(PLAN_STRUCT_STATUS_META).map(([c, { label }]) => (
                <option key={c} value={c} className="bg-gray-900 text-white">{label}</option>
            ))}
        </select>
    );
}

// @anchor aggregated-status-badge — status gałęzi: wartość WYLICZONA z pozycji poddrzewa,
// nigdy zapisana w bazie i nigdy edytowalna. Dropdown w tym miejscu wprowadzał w błąd —
// ręcznie ustawiony status gałęzi rozjeżdżał się z pozycjami pod nią przy pierwszej zmianie
// liścia i nikt tego nie widział, bo obie wartości wyglądały tak samo.
// Ikona łańcucha (`Link`) odróżnia plakietkę wyliczoną od plakietki-selecta na pozycji.
function AggregatedStatusBadge({ node, depth }) {
    const agg = aggregateBranchStatus(node, depth);
    // Gałąź sumuje statusy PLANU, więc plakietka bierze wygląd z tej samej listy co dropdown
    // pozycji; `MIXED` i pusta gałąź spadają na słownik strukturalny („Mieszany" / „Brak").
    const meta = PLAN_STRUCT_STATUS_META[agg.code] || STRUCT_STATUS_META[agg.code] || STRUCT_STATUS_META[''];
    const title = agg.count === 0
        ? 'Gałąź bez pozycji — brak statusu do wyliczenia'
        : `Status wyliczony z ${agg.count} ${agg.count === 1 ? 'pozycji' : 'pozycji'}: `
          + agg.breakdown.map(b => `${b.label} ${b.count}`).join(', ');
    return (
        <span
            title={title}
            className={`text-[14px] px-2 py-0.5 rounded-lg border font-medium bg-black/40 flex items-center gap-1 max-w-full cursor-default ${meta.style}`}
        >
            <Link size={8}/> {agg.label}
        </span>
    );
}

// Node types: 'project' (root), 'product' (przedmiot projektu), 'material'|'work'|'service' (typy pracy)
// @anchor mk-node — `type` podany od razu (liść Paliwo, gałąź gwarancyjna) decyduje o statusie
// startowym: praca, usługa, nocleg i paliwo rodzą się jako „Nowe", reszta jak dotąd „Oczekuje".
// Węzeł bez typu zostaje na materiałowym `PENDING` — typ nadaje mu się dopiero w tabeli,
// a od tej chwili `resolveStatusCode` pokazuje właściwą etykietę bez ruszania bazy.
const mkNode = (withDefaults = false, type = '') => {
    const id = crypto.randomUUID();
    return {
        id,
        name: '',
        status: defaultStatusForType(type),
        quantity: '',
        unit: 'sztuki',
        owner: '',
        resources: '',
        cost: '',
        tags: [],
        qa: [],
        type,
        comment: '',
        strategy: '',
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

// @anchor find-depth
const findDepth = (nodes, id, depth = 0) => {
    for (const n of nodes) {
        if (n.id === id) return depth;
        const found = findDepth(n.children || [], id, depth + 1);
        if (found != null) return found;
    }
    return null;
};

const subtreeContains = (node, id) =>
    node.id === id || (node.children || []).some(c => subtreeContains(c, id));

// @anchor subtree-has-fuel
// Czy gdziekolwiek w poddrzewie stoi już liść typ=paliwo. Szukamy w CAŁYM poddrzewie,
// a nie tylko wśród dzieci, bo starsze zlecenia mają paliwo dołożone pod liśćmi pracy
// (tak działała poprzednia reguła) i nie chcemy im dokładać drugiego na górnym poziomie.
const subtreeHasFuel = node =>
    node?.type === 'fuel' || (node?.children || []).some(subtreeHasFuel);

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
// @anchor clone-dropped-tags — tagi, które NIE mogą przejechać na klon: wskazują kartę
// produktową węzła źródłowego. Nową kartę zakłada `clone-for-wbs`, ono też dopisuje
// węzłowi świeży `req:`.
const isTagDroppedOnClone = (t) =>
    typeof t === 'string' && (t.startsWith('req:') || t === 'auto-requirement');

// @anchor deep-clone-node-with-mappings
// Klon liścia lub gałęzi: nowe UUID i tagi OCZYSZCZONE ze wskaźników na kartę produktową.
// `{ ...n }` kopiuje wszystkie pola, więc `req:<id-źródła>` jechał ze spreadem i wklejony
// węzeł wskazywał kartę oryginału — edycja wymagań technicznych, statusu czy dostawcy na
// kopii lądowała na pozycji, z której kopiowano. Od momentu wklejenia obie pozycje mają być
// niezależne: wspólny może być produkt katalogowy, nigdy pola karty.
const deepCloneNodeWithMappings = (node) => {
    const mappings = [];
    const cloneRec = (n) => {
        const newId = crypto.randomUUID();
        mappings.push({ sourceWbsNodeId: n.id, targetWbsNodeId: newId });
        return {
            ...n,
            id: newId,
            tags: Array.isArray(n.tags) ? n.tags.filter(t => !isTagDroppedOnClone(t)) : n.tags,
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
// @anchor sum-children-cost
// Koszt węzła = własny Q×unitCost + suma dzieci.
// Węzeł grupujący (type=group) jest czystym agregatorem — liczy TYLKO sumę dzieci × ilość pakietu
// (`groupQtyFactor`: pusta/0 ⇒ 1),
// nigdy własną cenę, nawet jeśli ma niezerowe unitCost/margin (spójne z buildRows(VIEWS.BUDGET),
// offerRevenueTotal i backendowym zerowaniem pól cenowych dla type=group).
const sumChildrenCost = node => {
    // Pozycja odrzucona wypada z sumy RAZEM z poddrzewem — gałąź ma pokazywać wartość
    // zakresu, który klient kupuje. Ta sama reguła co `stripRejectedNodes` w Budżecie
    // i w eksportach; rozjazd znaczyłby, że suma nad gałęzią kłóci się z tabelą Budżet.
    if (isRejectedPlanNode(node)) return 0;
    const kids = node.children || [];
    if (node.type === 'group') return groupQtyFactor(node) * kids.reduce((a, c) => a + sumChildrenCost(c), 0);
    const own = (parseFloat(node.unitCost) || 0) * (parseFloat(node.quantity) || 0);
    if (!kids.length) return own;
    return own + kids.reduce((a, c) => a + sumChildrenCost(c), 0);
};

// @anchor sum-children-offer-price
// Cena ofertowa węzła = własna (ilość×koszt×narzut, jak w budżecie) + suma dzieci.
// Formuła identyczna z BudgetTable.calcDerived: brak narzutu → 0, potem opcjonalny rabat.
// Węzeł grupujący (type=group) jest czystym agregatorem — patrz sumChildrenCost.
const sumChildrenOfferPrice = node => {
    if (isRejectedPlanNode(node)) return 0;
    const kids = node.children || [];
    if (node.type === 'group') return groupQtyFactor(node) * kids.reduce((a, c) => a + sumChildrenOfferPrice(c), 0);
    const cost = (parseFloat(node.unitCost) || 0) * (parseFloat(node.quantity) || 0);
    const marginRaw = node.margin != null && node.margin !== '' ? parseLocaleNumber(String(node.margin)) : null;
    const disc = Math.max(0, parseLocaleNumber(String(node.discount ?? '')) ?? 0);
    let own = (marginRaw !== null && marginRaw !== 0) ? cost * (1 + marginRaw / 100) : 0;
    if (own > 0 && disc > 0) own = Math.max(0, own * (1 - disc / 100));
    if (!kids.length) return own;
    return own + kids.reduce((a, c) => a + sumChildrenOfferPrice(c), 0);
};

// ── Depth visual config ───────────────────────────────────────────────────────
const DEPTH_SIZE = [
    'text-base font-bold uppercase',
    'text-base',
    'text-base',
    'text-base',
];
const MAX_DEPTH = DEPTH_SIZE.length - 1;

// Złoty kąt (137.508°) rozdziela barwy sąsiednich gałęzi maksymalnie od siebie.
// Głębszy poziom = wyższe nasycenie i nieprzezroczystość tła.
const GOLDEN_ANGLE = 137.508;
function getBranchStyle(rootIndex, depth) {
    const hue = (rootIndex * GOLDEN_ANGLE) % 360;
    const d = Math.min(depth, 3);
    const sat    = [55, 62, 68, 75][d];
    const alpha  = [0.06, 0.11, 0.17, 0.23][d];
    const alphaH = [0.11, 0.17, 0.24, 0.32][d];
    const bw     = [3, 2, 2, 1][d];
    const bSat   = [65, 68, 70, 73][d];
    const bAlpha = [0.70, 0.55, 0.40, 0.28][d];
    const nSat   = [90, 80, 75, 70][d];
    const nL     = [92, 88, 85, 82][d];
    const fSat   = [50, 55, 60, 65][d];
    const fL     = [78, 74, 70, 67][d];
    return {
        trStyle: {
            '--wbs-bg':  `hsla(${hue|0},${sat}%,55%,${alpha})`,
            '--wbs-bgh': `hsla(${hue|0},${sat}%,55%,${alphaH})`,
            '--wbs-bc':  `hsla(${hue|0},${bSat}%,65%,${bAlpha})`,
            '--wbs-bw':  `${bw}px`,
            '--wbs-nc':  `hsl(${hue|0},${nSat}%,${nL}%)`,
            '--wbs-fc':  `hsl(${hue|0},${fSat}%,${fL}%)`,
        },
        // @anchor wbs-branch-spine — kolor kręgosłupa szuflady. Pełne nasycenie i stała
        // grubość niezależnie od głębokości: kręgosłup ma powiedzieć „to jest jeden blok",
        // a nie „to jest poziom N" (od poziomu jest tło i lewa krawędź wiersza).
        // Zawsze zielony, niezależnie od koloru gałęzi — szuflada ma być od razu rozpoznawalna.
        spine: 'rgba(52,211,153,0.9)',
    };
}
// CSS wstrzyknięte raz — hover i kolory przez custom properties na <tr>
// @anchor wbs-drawer-css — szuflada rozwiniętej gałęzi: ten sam pomysł co rozwinięty wiersz
// w panelu Materiały. Gałąź będąca nagłówkiem szuflady dostaje jaśniejsze tło i górną
// krawędź, całe jej pod-drzewo — gałęzie i liście — wspólny kręgosłup przy lewej krawędzi,
// a domyka je listwa na dole.
// Nagłówkiem jest gałąź NAJGŁĘBSZA z otwartych na ścieżce, nie najwyższa (patrz
// `has-open-branch-below`) — wszystkie kręgosłupy rysują się w tym samym miejscu (x=0
// wiersza), więc dwa naraz i tak byłyby nie do odróżnienia.
const WBS_BRANCH_CSS = `.wbs-br{background-color:var(--wbs-bg);border-left:var(--wbs-bw) solid var(--wbs-bc);transition:background-color .12s}.wbs-br:hover{background-color:var(--wbs-bgh)}.wbs-br .wbs-name{color:var(--wbs-nc)}.wbs-br .wbs-field{color:var(--wbs-fc)}`
    // Cała szuflada (z gałęzią-nagłówkiem) to jedna zielona ramka 3 px z zielonym tłem.
    + `.wbs-br.wbs-drawer,.wbs-drawer-row{border-left:3px solid var(--wbs-spine);border-right:3px solid var(--wbs-spine)}`
    + `.wbs-br.wbs-drawer{background-color:rgba(16,185,129,0.10)}.wbs-br.wbs-drawer:hover{background-color:rgba(16,185,129,0.16)}`
    + `.wbs-br.wbs-drawer-head,.wbs-br.wbs-drawer-head:hover{background-color:rgba(16,185,129,0.20);border-top:3px solid var(--wbs-spine)}`
    // Domknięcie szuflady to PEŁNA listwa w kolorze kręgosłupa, nie krawędź 2 px pod pustym
    // wierszem — ta ginęła między wierszami tabeli i nie było widać, gdzie gałąź się kończy.
    // Ta sama grubość i ten sam zabieg co `materials-group-cap` / `realization-drawer-cap`.
    + `.wbs-drawer-end{border-left:3px solid var(--wbs-spine);border-right:3px solid var(--wbs-spine)}`
    + `.wbs-drawer-end td{height:4px;padding:0;background-color:var(--wbs-spine)}`
    // @anchor wbs-leaf-open-css — rozwinięty liść materiałowy i jego szuflada czytają się jako
    // JEDNA karta, tak samo jak w Realizacja_new: wiersz dostaje górną i boczne krawędzie
    // w kolorze akcentu, jaśniejsze tło i TRACI dolną — przez to zlewa się z komórką szuflady
    // pod sobą. Ramka idzie przez CSS na komórkach, a nie klasą na każdym `<td>`, bo komórek
    // w wierszu WBS jest kilkanaście i każda ma własny zestaw klas.
    // `tr.wbs-leaf-open` (0,1,1) bije tailwindowe `.border-b` (0,1,0) z klasy wiersza.
    + `tr.wbs-leaf-open{border-bottom-width:0}`
    + `.wbs-leaf-open>td{background-color:var(--wbs-drawer-fill);border-top:var(--wbs-drawer-bw,1px) solid var(--wbs-drawer-edge);border-bottom:0}`
    + `.wbs-leaf-open>td:first-child{border-left:var(--wbs-drawer-bw,1px) solid var(--wbs-drawer-edge)}`
    + `.wbs-leaf-open>td:last-child{border-right:var(--wbs-drawer-bw,1px) solid var(--wbs-drawer-edge)}`
    // @anchor wbs-drawer-focus-css — przy otwartej szufladzie Zadania/Q&A reszta drzewa jest
    // rozmyta i przygaszona; ostre zostają tylko wiersz węzła i jego szuflada (`wbs-focus-keep`).
    // Kombinatory `>` — żeby nie rozmyć zagnieżdżonej tabeli Q&A wewnątrz szuflady.
    + `.wbs-focus>tbody>tr:not(.wbs-focus-keep)>td{filter:blur(2px);opacity:.45;transition:filter .15s,opacity .15s}`;

// ── Tag chips ─────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function TagChips({ tags = [], tagColor, onRemove, onTagClick }) {
    const visible = tags.map((t, i) => ({ tag: t, idx: i })).filter(({ tag }) =>
        !UUID_RE.test(tag) && !String(tag).startsWith('req:') && tag !== 'auto-requirement');
    return (
        <div className="flex flex-nowrap gap-1 overflow-hidden max-w-full">
            {visible.map(({ tag, idx }) => (
                <span key={idx} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[14px] font-medium border ${tagColor}`}>
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

// ── Component ─────────────────────────────────────────────────────────────────
// @anchor wbs-hybrid-table
export default function WBSHybridTable({ wbsTree, setWbsTree, nodeName = 'Projekt', processNodeId, versionId, onSave, onTagClick, onTopLevelAdded, onNodesDeleted, onMaterialNodeCreated, users = [], projectContacts = [], onRequirementDrop = null, isManager = false, requirementsQtyByNode = {}, onRequirementsQtyChange, onNodeStatusChange, unassignedRequirements = [], onRequirementAssign, onNodeFieldSave = null, materialRefreshKey = 0, searchQuery = '', onMaterialReqUpdated = null, onPasteCloned = null, onNodeExpand = null, onRequirementMerge = null, onApplyLeafDefaults = null, leafDefaults = null, offerLocked = false, realization = null }) {
    // @anchor wbs-hybrid-offer-lock — po akceptacji baseline kolumny Ilość / Koszt jedn. / Narzut %
    // przestają przyjmować wpis (każdy typ liścia); kliknięcie otwiera modal `OfferLockGuard`.
    const offerLockProps = offerLockInputProps(offerLocked);
    // @anchor wbs-hybrid-is-touch — na dotyku kolumna uchwytu zamienia się w duży przycisk
    // rozwijania (drag&drop HTML5 i tak nie działa palcem, więc uchwyt tylko zajmował miejsce).
    const { isTouch } = useDevice();
    const [expanded, setExpanded] = useState(() => new Set());
    const initialExpandDoneRef = useRef(false);
    // Domyślnie rozwiń tylko do 2. poziomu (root + węzły top-level) przy pierwszym
    // załadowaniu — kolejne fetch'e nie nadpiszą ręcznych collapse'ów (ref pilnuje).
    useEffect(() => {
        if (initialExpandDoneRef.current) return;
        const items = wbsTree?.items || [];
        if (items.length === 0) return;
        // Inicjalnie wszystkie gałęzie top-level zwinięte — żeby były wszystkie widoczne.
        // (Akordeon i tak ukrywa rodzeństwo gdy któraś jest rozwinięta — auto-expand pierwszej
        // ukrywał resztę domyślnych gałęzi: Zarządzanie projektem, Paliwo itd.)
        const ids = new Set(['root']);
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
    const tagInputRef = useRef(null);
    const [materialStatuses, setMaterialStatuses] = useState({});
    // @anchor mat-req-by-wbs-id
    // Mapa node→wymaganie. Klucze: wbsNodeId ORAZ MaterialRequirement.id (dla rozwiązywania liścia po tagu req:).
    const [matReqByWbsId, setMatReqByWbsId] = useState({});
    // @anchor mat-req-by-name
    // Fallback: gdy node nie ma tagu req: i wbsNodeId nie pasuje (np. snapshot lub stary węzeł),
    // szukamy requirement po nazwie. Zapobiega auto-tworzeniu ghost-requirements.
    const [matReqByName, setMatReqByName] = useState({});
    // @anchor mat-reqs-loaded
    // True dopiero po pierwszym fetch'u material-requirements/node/{processNodeId} — zapobiega
    // auto-create ghost-requirements w MaterialReqExpandPanel, jeśli user rozwinie panel wcześniej.
    const [matReqsLoaded, setMatReqsLoaded] = useState(false);
    const [expandedMaterialIds, setExpandedMaterialIds] = useState(new Set());
    const [reqDragOverNode, setReqDragOverNode] = useState(null);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [costFocusId, setCostFocusId] = useState(null);
    const [qtyFocusId, setQtyFocusId] = useState(null);
    const [warnKey, setWarnKey] = useState(null);
    const warnTimer = useRef(null);
    // @anchor twin-flash
    // Które pola właśnie przepisano z bliźniaka — podświetlane na 2 s, żeby zmiana ceny
    // czy typu nie wydarzyła się niezauważona. `{ id, fields: ['type','unit',...] }`.
    const [twinFlash, setTwinFlash] = useState(null);
    const twinFlashTimer = useRef(null);
    const [showBasket, setShowBasket] = useState(false);
    // Koszyk: id wymagań, dla których rozwinięto podgląd wymagań technicznych (przed przypisaniem).
    const [expandedBasketIds, setExpandedBasketIds] = useState(new Set());
    // Koszyk: id chipa-celu podświetlonego podczas przeciągania innego chipa (scalanie duplikatów).
    const [mergeOverId, setMergeOverId] = useState(null);
    const [copyBuffer, setCopyBuffer] = useState(null); // { node, sourceName }
    // @anchor node-drawer-tab
    // { [wbsNodeId]: 'tasks' | 'qa' | 'chat' } — otwarta zakładka szuflady pod wierszem. Jeden węzeł = jedna
    // szuflada: otwarcie zakładki zamyka kartę materiałową tego węzła i odwrotnie.
    const [nodeDrawerTab, setNodeDrawerTab] = useState({});
    // @anchor qa-mail-node — węzeł, dla którego otwarte jest okno wysyłki pytań mailem (QaMailModal).
    const [qaMailNode, setQaMailNode] = useState(null);
    // @anchor mail-replies — odpowiedzi klientów na maile z pytaniami (QaMailRepliesModal); licznik NEW przy Q&A.
    const [mailReplies, setMailReplies] = useState(null);
    const [mailRepliesLoading, setMailRepliesLoading] = useState(false);
    const [mailRepliesOpen, setMailRepliesOpen] = useState(false);
    const loadMailReplies = useCallback(async () => {
        if (!processNodeId) return;
        setMailRepliesLoading(true);
        try {
            const r = await fetch(`/api/qa-mail/replies/${processNodeId}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}` } });
            if (r.ok) setMailReplies(await r.json());
        } catch { /* licznik bez odświeżenia */ } finally {
            setMailRepliesLoading(false);
        }
    }, [processNodeId]);
    useEffect(() => { loadMailReplies(); }, [loadMailReplies]);
    const newMailReplies = (mailReplies || []).filter(r => r.status === 'NEW').length;
    const openMailReplies = () => { setMailRepliesOpen(true); loadMailReplies(); };
    // @anchor wbs-task-summary
    // { [wbsNodeId]: { open, overdue, done } } — z GET /my-tasks/wbs-summary/:processNodeId; koloruje ikonę Zadania.
    const [taskSummary, setTaskSummary] = useState({});
    // @anchor load-task-summary
    const loadTaskSummary = useCallback(async () => {
        if (!processNodeId) return;
        try {
            const token = sessionStorage.getItem('token') || localStorage.getItem('token');
            const res = await fetch(`${API_URL}/my-tasks/wbs-summary/${processNodeId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setTaskSummary(await res.json());
        } catch (e) { console.warn('[WBS] task summary failed', e); }
    }, [processNodeId]);
    useEffect(() => { loadTaskSummary(); }, [loadTaskSummary]);
    // Zmiana zadania gdziekolwiek (Moje zadania, kalendarz, alarm) → przelicz kolory ikon.
    // Krótkie opóźnienie zbija serię zapisów (zadanie + alarm) w jedno zapytanie.
    useEffect(() => {
        let timer;
        const onChanged = () => { clearTimeout(timer); timer = setTimeout(loadTaskSummary, 300); };
        window.addEventListener('user-tasks-changed', onChanged);
        return () => { clearTimeout(timer); window.removeEventListener('user-tasks-changed', onChanged); };
    }, [loadTaskSummary]);
    // @anchor wbs-chat-summary
    // { [wbsNodeId]: { total, unread } } — z GET /comments/order/:processNodeId/wbs-summary; koloruje ikonę czatu.
    const [chatSummary, setChatSummary] = useState({});
    // @anchor load-chat-summary
    const loadChatSummary = useCallback(async () => {
        if (!processNodeId) return;
        try {
            const token = sessionStorage.getItem('token') || localStorage.getItem('token');
            const res = await fetch(`${API_URL}/comments/order/${processNodeId}/wbs-summary`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setChatSummary(await res.json());
        } catch (e) { console.warn('[WBS] chat summary failed', e); }
    }, [processNodeId]);
    // Nowe wiadomości od innych pojawiają się bez przeładowania — odpytywanie co 30 s.
    useEffect(() => {
        loadChatSummary();
        const iv = setInterval(loadChatSummary, 30000);
        return () => clearInterval(iv);
    }, [loadChatSummary]);
    // @anchor wbs-col-widths-storage — szerokości kolumn zapamiętane w tej przeglądarce (per urządzenie);
    // brak/zepsuty wpis albo zablokowany storage = szerokości domyślne.
    const [colWidths, setColWidths] = useState(() => {
        const defaults = { nazwa: 320, typ: 120, ilosc: 80, jednostka: 90, cena_netto: 100, koszt_calk: 120, narzut: 90, cena_ofert: 110, status: 152, wlasciciel: 128, komentarz: 200, strategia: 220, zalaczniki: 44 };
        try {
            const saved = JSON.parse(localStorage.getItem(WBS_COL_WIDTHS_KEY) || 'null');
            if (saved && typeof saved === 'object') {
                for (const k of Object.keys(defaults)) if (Number.isFinite(saved[k]) && saved[k] >= 40) defaults[k] = saved[k];
            }
        } catch { /* domyślne */ }
        return defaults;
    });
    // @anchor wbs-hidden-cols — kolumny ukryte przez użytkownika, zapamiętane PER ZAMÓWIENIE
    // (localStorage, klucz z `processNodeId`). Zamówienie bez własnego wpisu startuje z dawnym
    // wspólnym ustawieniem przeglądarki. Ukrycie przez `visibility: collapse` na <col> — komórki
    // zostają w DOM, więc colSpan szuflad i kolejność komórek w wierszach się nie zmieniają.
    const hiddenColsKey = processNodeId ? `${WBS_HIDDEN_COLS_KEY}:${processNodeId}` : WBS_HIDDEN_COLS_KEY;
    const readHiddenCols = (key) => {
        try {
            const raw = localStorage.getItem(key) ?? localStorage.getItem(WBS_HIDDEN_COLS_KEY) ?? '[]';
            const saved = JSON.parse(raw);
            return new Set(Array.isArray(saved) ? saved : []);
        } catch { return new Set(); }
    };
    const [hiddenCols, setHiddenCols] = useState(() => readHiddenCols(hiddenColsKey));
    // Przełączenie zamówienia bez przemontowania tabeli — wczytaj jego układ.
    useEffect(() => { setHiddenCols(readHiddenCols(hiddenColsKey)); }, [hiddenColsKey]);
    const toggleHiddenCol = (key) => setHiddenCols(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        try { localStorage.setItem(hiddenColsKey, JSON.stringify([...next])); } catch { /* bez zapamiętania */ }
        return next;
    });
    const [colsMenuOpen, setColsMenuOpen] = useState(false);
    const resizeDrag = useRef(null);
    // @anchor grid-nav-table-ref
    // Kontener tabeli — zawęża zapytania nawigacji klawiaturowej (grid-nav) do tego drzewa,
    // zamiast przeszukiwać cały document (poprzednia wersja gubiła fokus poza tabelą).
    const tableWrapperRef = useRef(null);
    // @anchor wbs-view-width
    // Widoczna szerokość obszaru tabeli → CSS `--wbs-view-w`. Szuflada (colSpan na wszystkie kolumny)
    // bez tego miała szerokość całej tabeli — przy węższym oknie tabela przewija się w poziomie
    // i prawa część szuflady była poza ekranem.
    useEffect(() => {
        const wrap = tableWrapperRef.current;
        if (!wrap || typeof ResizeObserver === 'undefined') return;
        const set = () => wrap.style.setProperty('--wbs-view-w', `${wrap.clientWidth}px`);
        set();
        const ro = new ResizeObserver(set);
        ro.observe(wrap);
        return () => ro.disconnect();
    }, []);

    // @anchor start-col-resize — przeciąganie szerokości kolumny: zdarzenia wskaźnika (mysz, palec,
    // rysik). Uchwyt ma `touch-action: none` i przechwytuje wskaźnik, więc gest palcem nie przewija
    // tabeli. Szerokość zapisuje się po puszczeniu.
    const startColResize = (col, e) => {
        e.preventDefault();
        e.stopPropagation();
        const handle = e.currentTarget;
        const pointerId = e.pointerId;
        try { handle.setPointerCapture?.(pointerId); } catch { /* starsze przeglądarki */ }
        const startX = e.clientX;
        const startW = colWidths[col] ?? 120;
        resizeDrag.current = { col, startX, startW, last: startW };
        const onMove = (ev) => {
            if (!resizeDrag.current || ev.pointerId !== pointerId) return;
            const w = Math.max(60, Math.round(resizeDrag.current.startW + ev.clientX - resizeDrag.current.startX));
            resizeDrag.current.last = w;
            setColWidths(prev => ({ ...prev, [resizeDrag.current.col]: w }));
        };
        const onUp = (ev) => {
            if (ev.pointerId !== pointerId) return;
            const drag = resizeDrag.current;
            resizeDrag.current = null;
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            if (drag) setColWidths(prev => {
                const next = { ...prev, [drag.col]: drag.last };
                try { localStorage.setItem(WBS_COL_WIDTHS_KEY, JSON.stringify(next)); } catch { /* bez zapamiętania */ }
                return next;
            });
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    };

    // @anchor fetch-mat-seq — numer ostatniego fetcha listy wymagań; starsza odpowiedź (kolejny bump
    // materialRefreshKey wyprzedzony przez wolniejsze pierwsze żądanie) nie może nadpisać nowszej mapy.
    const fetchMatSeq = useRef(0);
    // materialStatuses kept for display only (no longer syncs to wbsTree)
    useEffect(() => {
        if (!processNodeId) return;
        const fetchMat = async () => {
            const seq = ++fetchMatSeq.current;
            try {
                const token = sessionStorage.getItem('token') || localStorage.getItem('token');
                const res = await fetch(`${API_URL}/material-requirements/node/${processNodeId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok && seq === fetchMatSeq.current) {
                    const data = await res.json();
                    const map = {};
                    const reqMap = {};
                    const nameMap = {};
                    data.forEach(r => {
                        if (r.name) map[r.name.toLowerCase()] = r.status;
                        if (r.wbsNodeId) reqMap[r.wbsNodeId] = r;
                        // Indeks też po ID wymagania: liść WBS łączy się z wymaganiem tagiem `req:<id>`,
                        // a wbsNodeId wskazuje gałąź-rodzica (cel dropa), nie liść. Bez tego klucza
                        // ProductCard liścia nie znajdował wymagania i pokazywał puste „Wymagania techniczne".
                        reqMap[r.id] = r;
                        // Fallback po nazwie — dla węzłów snapshot (klonowane ID) i starych węzłów bez req: taga.
                        if (r.name) nameMap[r.name.toLowerCase()] = r;
                    });
                    setMaterialStatuses(map);
                    setMatReqByWbsId(reqMap);
                    setMatReqByName(nameMap);
                }
            } catch (e) { console.warn('[WBS] fetchMat failed', e); }
            finally { setMatReqsLoaded(true); }
        };
        fetchMat();
    }, [processNodeId, materialRefreshKey]);

    const items = wbsTree?.items || [];

    // @anchor name-suggestion-pool
    // Nazwy z całego drzewa jako źródło podpowiedzi w kolumnie Nazwa, wraz z ustawieniami
    // bliźniaków (typ, jednostka, cena, narzut) do przepisania po zatwierdzeniu nazwy.
    // Memo po `items`, więc przelicza się przy każdej zmianie drzewa — zmierzone 1,5 ms
    // dla 2751 węzłów (test/test-name-autocomplete.mjs), czyli bez wpływu na pisanie.
    const nameSuggestionPool = React.useMemo(() => buildNameSuggestionPool(items), [items]);
    // @anchor branch-chat-unread
    // { [wbsNodeId]: liczba nieprzeczytanych wiadomości czatu w POTOMKACH węzła (bez niego samego).
    // Zwinięta gałąź pokazuje ją przy swoim dymku — inaczej wiadomość w ukrytym liściu nie była widoczna.
    const branchChatUnread = React.useMemo(() => {
        const out = {};
        const walk = (n) => {
            let u = 0;
            for (const c of n.children || []) u += (chatSummary[c.id]?.unread || 0) + walk(c);
            out[n.id] = u;
            return u;
        };
        items.forEach(walk);
        return out;
    }, [items, chatSummary]);


    // Zwraca listę id węzłów będących rodzeństwem targetId (na tym samym poziomie w drzewie)
    const findSiblingIds = (nodes, targetId) => {
        for (const n of nodes) {
            if (n.id === targetId) return nodes.map(c => c.id);
            const found = findSiblingIds(n.children || [], targetId);
            if (found !== null) return found;
        }
        return null;
    };

    const toggle = (id, e) => {
        e?.stopPropagation();
        setExpanded(prev => {
            const s = new Set(prev);
            const wasOpen = s.has(id);
            if (wasOpen) {
                s.delete(id);
            } else {
                // Accordion: zamknij rodzeństwo na tym samym poziomie drzewa
                const nodeId = id.startsWith('node_') ? id.slice(5) : null;
                if (nodeId) {
                    const siblings = findSiblingIds(items, nodeId);
                    if (siblings) {
                        for (const sibId of siblings) {
                            if (sibId !== nodeId) s.delete(`node_${sibId}`);
                        }
                    }
                }
                s.add(id);
                onNodeExpand?.(id);
            }
            return s;
        });
    };
    const open = id => setExpanded(prev => new Set([...prev, id]));
    const isOpen = id => expanded.has(id);

    const save = newTree => { setWbsTree(newTree); setTimeout(() => onSave?.(), 0); };

    const handleField = (id, field, value) =>
        setWbsTree(t => ({ ...t, items: updateField(t.items || [], id, field, value) }));

    // Zapis strategii na węźle-elemencie (liść / węzeł pośredni): utrwala własną wartość,
    // po czym przelicza złożenie całej gałęzi i utrwala je na węźle top-level (depth 0).
    // Puste złożenie NIE nadpisuje istniejącej strategii top-level (ochrona starych danych).
    // @anchor save-leaf-strategy
    const saveLeafStrategy = (nodeId, value, itemsOverride = null) => {
        onNodeFieldSave?.(nodeId, 'strategy', value);
        const nextItems = updateField(itemsOverride || items, nodeId, 'strategy', value);
        const root = nextItems.find(r => subtreeContains(r, nodeId));
        if (!root) return;
        const composed = composeBranchStrategy(root);
        if (composed && composed !== (root.strategy || '')) {
            handleField(root.id, 'strategy', composed);
            onNodeFieldSave?.(root.id, 'strategy', composed);
        }
    };

    // ── Pytania do klienta w strategii (`{{q:id}}`) ─────────────────────────────
    const qaIndexAll = buildQaIndex(items);
    const authJson = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}`, 'Content-Type': 'application/json' });
    const persistQa = (nodeId, next) => {
        if (onNodeFieldSave) onNodeFieldSave(nodeId, 'qa', next);
        else setTimeout(() => onSave?.(), 0);
    };

    // @anchor recompose-root-strategy-for-qa
    // Odpowiedź zmienia tekst złożenia gałęzi (top-level), gdy któraś strategia w gałęzi ma znaczniki.
    const recomposeRootFor = (nodeId, itemsNow) => {
        const root = itemsNow.find(r => subtreeContains(r, nodeId));
        if (!root) return;
        let tokens = false;
        const walk = n => { if (strategyHasTokens(n?.strategy)) tokens = true; (n?.children || []).forEach(walk); };
        (root.children || []).forEach(walk);
        if (!tokens) return;
        const composed = composeBranchStrategy(root);
        if (composed && composed !== (root.strategy || '')) {
            handleField(root.id, 'strategy', composed);
            onNodeFieldSave?.(root.id, 'strategy', composed);
        }
    };

    // @anchor handle-qa-change
    // Zmiana listy Q&A węzła. Para z `taskId`, która zyskała/straciła odpowiedź, zamyka/otwiera
    // swoje zadanie „Wyjaśnić czy…”.
    const handleQaChange = (nodeId, next) => {
        const prev = findNode(items, nodeId)?.qa || [];
        const flips = [];
        for (const p of next) {
            if (!p?.taskId) continue;
            const was = !!String(prev.find(x => x.id === p.id)?.answer || '').trim();
            const now = !!String(p.answer || '').trim();
            if (was !== now) flips.push({ taskId: p.taskId, status: now ? 'DONE' : 'TO_DO' });
        }
        handleField(nodeId, 'qa', next);
        if (flips.length) {
            Promise.all(flips.map(f => fetch(`${API_URL}/my-tasks/${f.taskId}`, { method: 'PATCH', headers: authJson(), body: JSON.stringify({ status: f.status }) }).catch(() => {})))
                .then(() => loadTaskSummary());
        }
        return updateField(items, nodeId, 'qa', next);
    };

    // @anchor add-strategy-question
    // Nowe pytanie do klienta z komórki Strategii: para w Q&A węzła (+ opcjonalnie zadanie dla mnie)
    // i znacznik `{{q:id}}` w nowym wierszu na końcu strategii.
    const addStrategyQuestion = async (node, question, withTask) => {
        const id = newQaId();
        let taskId = null;
        if (withTask && processNodeId) {
            try {
                const res = await fetch(`${API_URL}/my-tasks`, {
                    method: 'POST', headers: authJson(),
                    body: JSON.stringify({ title: `Wyjaśnić czy ${question.replace(/^czy\s+/i, '')}`, nodeId: processNodeId, wbsNodeId: node.id }),
                });
                if (res.ok) taskId = (await res.json())?.id || null;
                loadTaskSummary();
            } catch { /* pytanie powstaje i bez zadania */ }
        }
        const fresh = findNode(items, node.id) || node;
        const nextQa = [...ensureQaIds(fresh.qa), { id, question, answer: '', ...(taskId ? { taskId } : {}) }];
        const cur = fresh.strategy || '';
        // Pytanie zawsze w nowym wierszu na końcu strategii.
        const body = cur.replace(/\s+$/, '');
        const nextStrategy = `${body}${body ? '\n' : ''}{{q:${id}}}`;
        handleField(node.id, 'qa', nextQa);
        handleField(node.id, 'strategy', nextStrategy);
        persistQa(node.id, nextQa);
        saveLeafStrategy(node.id, nextStrategy, updateField(items, node.id, 'qa', nextQa));
    };

    // @anchor answer-question-from-chat
    const answerQuestionFromChat = (threadNodeId, qaId, text, messageId) => {
        const n = findNode(items, threadNodeId);
        if (!n) return;
        const nextQa = (n.qa || []).map(p => p.id === qaId ? { ...p, answer: normalizeLowerText(text), chatMessageId: messageId, answerSource: 'chat' } : p);
        const nextItems = handleQaChange(n.id, nextQa);
        persistQa(n.id, nextQa);
        recomposeRootFor(n.id, nextItems);
    };
    // @anchor ask-question-from-chat
    // Wiadomość wysłana w czacie jako pytanie: nowa para w Q&A węzła wątku albo oznaczenie istniejącej.
    const askQuestionFromChat = (threadNodeId, text, messageId, qaId) => {
        const n = findNode(items, threadNodeId);
        if (!n) return;
        const nextQa = qaId
            ? (n.qa || []).map(p => p.id === qaId ? { ...p, askedMessageId: messageId } : p)
            : [...ensureQaIds(n.qa), { id: newQaId(), question: String(text || '').trim(), answer: '', askedMessageId: messageId }];
        handleQaChange(n.id, nextQa);
        persistQa(n.id, nextQa);
    };
    const askedByMessage = (messageId) => {
        for (const p of qaIndexAll.values()) if (p.askedMessageId === messageId) return p;
        return null;
    };
    const openQuestionsFor = (nodeId) => (findNode(items, nodeId)?.qa || [])
        .filter(p => p?.id && String(p.question || '').trim() && !String(p.answer || '').trim());
    const answeredByMessage = (messageId) => {
        for (const p of qaIndexAll.values()) if (p.chatMessageId === messageId) return p.question;
        return null;
    };
    const openQaDrawer = (nodeId) => setNodeDrawerTab(prev => ({ ...prev, [nodeId]: 'qa' }));

    // @anchor collect-mail-questions
    // Otwarte pytania do wysyłki mailem: sam węzeł albo (gałąź główna) węzeł z całym poddrzewem.
    const collectMailQuestions = (node, branch) => {
        const out = [];
        const add = (n) => {
            for (const p of ensureQaIds(n?.qa)) {
                if (String(p.question || '').trim() && !String(p.answer || '').trim()) out.push({ wbsNodeId: n.id, nodeName: n.name || 'Element WBS', pair: p });
            }
        };
        const walk = (n) => { add(n); if (branch) (n?.children || []).forEach(walk); };
        walk(node);
        return out;
    };
    // @anchor apply-qa-mail-sent
    // Po wysyłce: znacznik mailowy z backendu nakładany na lokalne pary po id (bez zapisu — backend już zapisał),
    // żeby nie nadpisać edycji, które użytkownik zrobił w międzyczasie.
    const applyQaMailSent = (result) => {
        for (const upd of result?.nodes || []) {
            const n = findNode(items, upd.id);
            if (!n) continue;
            // Para mogła mieć w stanie frontu id nadane przy odczycie — backend zapisał ją pod `qaId`.
            const byId = new Map(upd.qa.map(p => [p.id, p]));
            const idFor = new Map((upd.sent || []).map(x => [x.clientQaId, x.qaId]));
            const next = (n.qa || []).map(p => {
                const id = idFor.get(p.id) || p.id;
                const u = byId.get(id);
                return u?.mailId ? { ...p, id, mailId: u.mailId, mailSentAt: u.mailSentAt, mailTo: u.mailTo } : p;
            });
            handleField(upd.id, 'qa', next);
        }
    };

    // @anchor answer-questions-from-mail
    // Zatwierdzone odpowiedzi z maila klienta → pary Q&A (tak jak odpowiedź z czatu: zamyka zadanie
    // „Wyjaśnić czy…”, uzupełnia `{{q:id}}` w strategii). Para szukana po id, potem po treści pytania.
    // Zwraca liczbę pytań, których nie ma już w Q&A.
    const answerQuestionsFromMail = (reply, rows) => {
        const norm = t => String(t || '').trim().toLowerCase();
        let itemsNow = items;
        let missing = 0;
        const byNode = new Map();
        rows.forEach(r => byNode.set(r.wbsNodeId, [...(byNode.get(r.wbsNodeId) || []), r]));
        for (const [nodeId, list] of byNode) {
            const n = findNode(itemsNow, nodeId);
            if (!n) { missing += list.length; continue; }
            let qa = ensureQaIds(n.qa);
            for (const r of list) {
                const idx = qa.findIndex(p => p.id === r.qaId) >= 0 ? qa.findIndex(p => p.id === r.qaId) : qa.findIndex(p => norm(p.question) === norm(r.question));
                if (idx < 0) { missing++; continue; }
                qa = qa.map((p, i) => i === idx ? { ...p, answer: normalizeLowerText(r.answer), answerSource: 'mail', mailReplyId: reply.id, mailReplyAt: reply.receivedAt } : p);
            }
            itemsNow = handleQaChange(nodeId, qa);
            persistQa(nodeId, qa);
            recomposeRootFor(nodeId, itemsNow);
        }
        return missing;
    };
    // Bieżąca odpowiedź pary w Q&A (podgląd w oknie odpowiedzi z maila).
    const currentQaAnswer = (nodeId, qaId, question) => {
        const qa = findNode(items, nodeId)?.qa || [];
        const p = qa.find(x => x.id === qaId) || qa.find(x => String(x.question || '').trim().toLowerCase() === String(question || '').trim().toLowerCase());
        return String(p?.answer || '').trim();
    };

    // @anchor copy-comment-strategy
    // Kopiowanie między kolumnami Komentarz ↔ Strategia (ikonki na styku kolumn). Pusty cel =
    // wstawienie; niepusty = dopisanie w nowej linii (nic nie ginie); ten sam tekst = bez zmian.
    const mergeCopy = (target, source) => {
        const t = (target || '').trim();
        const src = (source || '').trim();
        if (!src || t === src || t.includes(src)) return null;
        return t ? `${target.replace(/\s+$/, '')}\n${src}` : src;
    };
    const copyCommentToStrategy = (node) => {
        const next = mergeCopy(node.strategy, node.comment);
        if (next === null) return;
        handleField(node.id, 'strategy', next);
        saveLeafStrategy(node.id, next);
    };
    const copyStrategyToComment = (node) => {
        const next = mergeCopy(node.comment, node.strategy);
        if (next === null) return;
        handleField(node.id, 'comment', next);
        onNodeFieldSave?.(node.id, 'comment', next);
        window.dispatchEvent(new CustomEvent('wbs-comment-changed', { detail: { wbsNodeIds: [node.id], comment: next } }));
    };

    // Po usunięciu węzła przelicza złożenie strategii gałęzi top-level, do której należał
    // usunięty węzeł, i utrwala je (także czyści, gdy usunięto ostatni wpis strategii —
    // top-level jest read-only, więc bez tego stary wpis zostawał w eksportach i nie dało
    // się go poprawić). Chroni starą ręczną treść top-level: gdy złożenie puste, nadpisuje
    // tylko jeśli usunięte poddrzewo faktycznie zawierało strategię.
    // @anchor recompose-branch-strategy-after-delete
    const recomposeBranchStrategyAfterDelete = (deletedNode, prevRoots, nextItems) => {
        const root = prevRoots.find(r => subtreeContains(r, deletedNode.id));
        if (!root || root.id === deletedNode.id) return;
        const newRoot = nextItems.find(r => r.id === root.id);
        if (!newRoot) return;
        let deletedHadStrategy = false;
        const walk = n => { if ((n?.strategy || '').trim()) deletedHadStrategy = true; (n?.children || []).forEach(walk); };
        walk(deletedNode);
        const composed = composeBranchStrategy(newRoot);
        if (composed === (newRoot.strategy || '')) return;
        if (!composed && !deletedHadStrategy) return;
        handleField(newRoot.id, 'strategy', composed);
        onNodeFieldSave?.(newRoot.id, 'strategy', composed);
    };

    // @anchor apply-twin-defaults
    // Nazwa zatwierdzona (z podpowiedzi albo wpisana ręcznie) pokrywa się z pozycją już
    // obecną w drzewie → przepisujemy jej ustawienia: typ, jednostkę, cenę i narzut.
    // Zasada nadrzędna: WYPEŁNIAMY TYLKO PUSTE — nic, co użytkownik już wpisał, nie zostaje
    // nadpisane. `unit === 'sztuki'` liczy się jako puste, bo to wartość startowa nowego
    // węzła, tak samo traktuje ją podpowiadacz jednostki przy zmianie typu.
    // Zwraca true, gdy cokolwiek skopiowano — wtedy wołający pomija heurystykę jednostki,
    // bo jednostka realnego bliźniaka jest mocniejszą przesłanką niż zgadywanie z nazwy.
    const applyTwinDefaults = (node, depth, parentId) => {
        const twin = pickTwinDefaults(nameSuggestionPool, node.name, node.id);
        if (!twin) return false;
        const copied = [];
        // Typ: root (depth 0) nie ma kolumny Typ, więc nie ma czego kopiować.
        if (depth >= 1 && twin.type && !node.type) {
            handleField(node.id, 'type', twin.type);
            onNodeFieldSave?.(node.id, 'type', twin.type);
            copied.push('type');
            if (twin.type === 'work') ensureFuelLeaf(node.id);
            if ((twin.type === 'equipment' || twin.type === 'material') && node.name) {
                onMaterialNodeCreated?.({ wbsNodeId: node.id, name: node.name, type: twin.type, parentId });
            }
        }
        if (twin.unit && (!node.unit || node.unit === 'sztuki')) {
            handleField(node.id, 'unit', twin.unit);
            onNodeFieldSave?.(node.id, 'unit', twin.unit);
            copied.push('unit');
        }
        // Cena i narzut są zablokowane po akceptacji baseline — wtedy ich nie ruszamy.
        if (!offerLocked && twin.unitCost && !Number(node.unitCost)) {
            handleField(node.id, 'unitCost', twin.unitCost);
            onNodeFieldSave?.(node.id, 'unitCost', twin.unitCost);
            copied.push('unitCost');
        }
        if (!offerLocked && twin.margin && !Number(node.margin)) {
            handleField(node.id, 'margin', twin.margin);
            onNodeFieldSave?.(node.id, 'margin', twin.margin);
            copied.push('margin');
        }
        if (!copied.length) return false;
        setTwinFlash({ id: node.id, fields: copied });
        if (twinFlashTimer.current) clearTimeout(twinFlashTimer.current);
        twinFlashTimer.current = setTimeout(() => setTwinFlash(null), 2000);
        return copied.includes('unit');
    };

    // @anchor twin-flash-class
    // Podświetlenie komórki przepisanej z bliźniaka — bez tego cena czy typ zmieniłyby się
    // po wyjściu z pola nazwy zupełnie bezgłośnie.
    const twinFlashClass = (id, field) =>
        (twinFlash?.id === id && twinFlash.fields.includes(field))
            ? ' ring-1 ring-amber-400/70 bg-amber-500/10 rounded' : '';

    // Pokaż na chwilę ostrzeżenie "tylko cyfry" przy komórce liczbowej (klucz = `${id}:${field}`).
    const flashWarn = (id, field) => {
        setWarnKey(`${id}:${field}`);
        if (warnTimer.current) clearTimeout(warnTimer.current);
        warnTimer.current = setTimeout(() => setWarnKey(null), 2500);
    };

    const handleDelete = (id, e) => {
        e?.stopPropagation();
        if (!window.confirm('Usunąć ten węzeł i wszystkie podgałęzie?')) return;
        const deletedNode = findNode(items, id);
        const deletedIds = collectIds(items, id);
        const nextItems = deleteNode(items, id);
        save({ ...wbsTree, items: nextItems });
        if (deletedIds.length) onNodesDeleted?.(deletedIds);
        if (deletedNode) recomposeBranchStrategyAfterDelete(deletedNode, items, nextItems);
    };

    const handleAddChild = (parentId, e) => {
        e?.stopPropagation();
        const child = mkNode(false);
        setWbsTree(t => ({ ...t, items: addChildTo(t.items || [], parentId, child) }));
        open(`node_${parentId}`);
        setTimeout(() => onSave?.(), 0);
    };

    // @anchor build-fuel-leaf
    // Liść Paliwo z wartościami domyślnymi z modalu „Domyślne wartości” (jednostka,
    // cena, NARZUT). Wcześniej narzut nie był wypełniany — automatycznie dodane paliwo
    // wchodziło do oferty z pustym narzutem. Bez ceny zaszytej na sztywno (dawniej 0,70 zł/km) —
    // brak stawki w modalu = 0. Ilość km = przejazd tam i z powrotem (2 × odległość do klienta).
    const buildFuelLeaf = (extra = {}) => {
        const defs = getLeafDefaultFrom(leafDefaults, 'fuel') || {};
        const unit = defs.unit || 'kilometry';
        const unitCost = Number(defs.unitCost) || 0;
        const leaf = { ...mkNode(false, 'fuel'), name: 'Paliwo', unit, unitCost, ...extra };
        if (defs.margin != null) leaf.margin = defs.margin;
        const km = Number(leafDefaults?.order?.distanceKm);
        if (Number.isFinite(km) && km > 0) leaf.quantity = 2 * km;
        return leaf;
    };

    // @anchor ensure-fuel-leaf
    // Paliwo dokładamy RAZ na główną gałąź (top-level), a nie pod każdy liść typ=praca.
    // Wcześniej gałąź z kilkunastoma pracami dostawała kilkanaście identycznych pozycji
    // „Paliwo”, choć przejazd na budowę jest jeden — oferta puchnęła i nikt tego nie sprzątał.
    // Wołane po ustawieniu typu=praca: szukamy gałęzi top-level, w której siedzi ten liść,
    // i dokładamy paliwo jako jej bezpośrednie dziecko, o ile w całym jej poddrzewie
    // jeszcze go nie ma.
    const ensureFuelLeaf = (nodeId) => {
        const root = (items || []).find(r => subtreeContains(r, nodeId));
        if (!root || subtreeHasFuel(root)) return;
        const fuel = buildFuelLeaf({ comment: 'utworzony automatycznie' });
        setWbsTree(t => {
            const roots = t.items || [];
            const target = roots.find(r => r.id === root.id);
            if (!target || subtreeHasFuel(target)) return t;
            return { ...t, items: addChildTo(roots, root.id, fuel) };
        });
        open(`node_${root.id}`);
        setTimeout(() => onSave?.(), 0);
    };

    // Przedmiot projektu nie dostaje już własnej gałęzi „Gwarancja 24m" — wizyta
    // gwarancyjna, paliwo, zarządzanie, dokumentacja powykonawcza i logistyka żyją
    // w gałęzi „Koszty ogólne" tworzonej raz na zlecenie (process-tree.service.ts).
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

    // ── Przenoszenie palcem (Pointer Events) ──────────────────────────────────
    // HTML5 drag&drop nie dostaje z dotyku ŻADNYCH zdarzeń (ani Chrome na Androidzie,
    // ani Safari), więc na tablecie gest obsługujemy ręcznie. Stan (`dragIdRef`,
    // `dragOver`) i samo przeniesienie (`extractNode` + `insertNode`) są te same co przy
    // myszy — inna jest wyłącznie warstwa gestu, więc podświetlenia before/after/into
    // i wiersz-widmo działają bez zmian.
    // Uchwyt ma `touch-action: none`, dzięki czemu przeglądarka nie zabierze gestu na
    // przewijanie i nie trzeba wymuszać przytrzymania — chwyt jest natychmiastowy.
    // @anchor wbs-hybrid-pointer-drag
    const pointerDragRef = useRef(null);      // { pointerId, nodeId, startX, startY, moved }
    const autoScrollRafRef = useRef(0);
    const autoScrollSpeedRef = useRef(0);

    // Pętla dosuwania listy, gdy palec stoi przy krawędzi — bez niej nie da się przenieść
    // wiersza poza widoczny fragment tabeli (palec nie generuje wtedy żadnych zdarzeń).
    const autoScrollTick = () => {
        const wrap = tableWrapperRef.current;
        if (!pointerDragRef.current || !wrap) { autoScrollRafRef.current = 0; autoScrollSpeedRef.current = 0; return; }
        if (autoScrollSpeedRef.current) wrap.scrollTop += autoScrollSpeedRef.current;
        autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
    };

    // Wiersz pod palcem + miejsce zrzutu. Ta sama matematyka progów co w `onDragOver`.
    const pointerDropTargetAt = (x, y) => {
        const row = document.elementFromPoint(x, y)?.closest('tr[data-node-id]');
        if (!row) return null;
        const nodeId = row.dataset.nodeId;
        const depth = Number(row.dataset.depth || 0);
        const currentDragId = dragIdRef.current;
        if (!currentDragId || currentDragId === nodeId) return null;
        const dragNode = findNode(items, currentDragId);
        if (dragNode && subtreeContains(dragNode, nodeId)) return null;
        const rect = row.getBoundingClientRect();
        const relY = (y - rect.top) / rect.height;
        let position;
        if (relY < 0.25) position = 'before';
        else if (relY > 0.75) position = 'after';
        else position = depth < MAX_DEPTH ? 'into' : (relY < 0.5 ? 'before' : 'after');
        return { nodeId, position };
    };

    const onHandlePointerDown = (e, nodeId) => {
        if (e.pointerType === 'mouse') return;   // mysz zostaje na natywnym HTML5 DnD
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
        pointerDragRef.current = { pointerId: e.pointerId, nodeId, startX: e.clientX, startY: e.clientY, moved: false };
    };

    const onHandlePointerMove = (e) => {
        const st = pointerDragRef.current;
        if (!st || e.pointerId !== st.pointerId) return;
        // Próg 6 px — samo dotknięcie uchwytu (bez ruchu) nie ma podnosić wiersza.
        if (!st.moved) {
            if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < 6) return;
            st.moved = true;
            dragIdRef.current = st.nodeId;
            setDragId(st.nodeId);
            if (!autoScrollRafRef.current) autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
        }
        e.preventDefault();
        const wrap = tableWrapperRef.current;
        if (wrap) {
            const r = wrap.getBoundingClientRect();
            const EDGE = 56;
            if (e.clientY < r.top + EDGE) autoScrollSpeedRef.current = -Math.ceil((r.top + EDGE - e.clientY) / 4);
            else if (e.clientY > r.bottom - EDGE) autoScrollSpeedRef.current = Math.ceil((e.clientY - (r.bottom - EDGE)) / 4);
            else autoScrollSpeedRef.current = 0;
        }
        setDragOver(pointerDropTargetAt(e.clientX, e.clientY));
    };

    const finishPointerDrag = (e, commit) => {
        const st = pointerDragRef.current;
        if (!st || e.pointerId !== st.pointerId) return;
        pointerDragRef.current = null;
        autoScrollSpeedRef.current = 0;
        try { e.currentTarget.releasePointerCapture(st.pointerId); } catch {}
        const target = dragOverRef.current;
        const draggedId = dragIdRef.current;
        dragIdRef.current = null; setDragId(null); setDragOver(null);
        if (!commit || !st.moved || !target || !draggedId || target.nodeId === draggedId) return;
        const [extracted, withoutDrag] = extractNode(items, draggedId);
        if (!extracted) return;
        save({ ...wbsTree, items: insertNode(withoutDrag, target.nodeId, extracted, target.position) });
    };

    useEffect(() => () => { if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current); }, []);

    // ── Search filter ─────────────────────────────────────────────────────────
    const normalizedSearch = String(searchQuery || '').trim().toLowerCase();
    let searchVisibleIds = null;
    if (normalizedSearch) {
        // Etykieta statusu do szukania idzie przez słownik WŁAŚCIWY dla typu liścia — inaczej
        // wpisanie „nowe" nie znalazłoby ani jednej pozycji pracy, bo w bazie siedzi tam `PENDING`.
        const statusSearchLabel = (n) => {
            const map = structStatusMetaFor(n.type);
            const code = usesWorkStatuses(n.type) ? resolveStatusCode(n.type, n.status) : (n.status || '');
            return code ? (map[code]?.label || code).toLowerCase() : '';
        };
        const nodeMatchesSearch = (n) => {
            const fields = [n.name, n.type, statusSearchLabel(n), n.owner, n.unit, String(n.quantity ?? '')];
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

    // Klik poza otwartym czatem gałęzi zamyka go. Własny przycisk czatu pomijamy — on sam przełącza.
    useEffect(() => {
        const chatIds = Object.keys(nodeDrawerTab).filter(id => nodeDrawerTab[id] === 'chat');
        if (!chatIds.length) return;
        const onDown = (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            const toClose = chatIds.filter(id =>
                !t.closest(`[data-chat-drawer="${id}"]`) && !t.closest(`[data-chat-toggle="${id}"]`));
            if (!toClose.length) return;
            setNodeDrawerTab(prev => {
                const next = { ...prev };
                toClose.forEach(id => { if (next[id] === 'chat') delete next[id]; });
                return next;
            });
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [nodeDrawerTab]);

    // @anchor wbs-outside-click-close — klik poza szufladą (jak w czacie) zamyka WSZYSTKIE szuflady:
    // zwija gałęzie, zamyka zakładki Zadania/Q&A/Czat/Realizacja i karty materiałowe.
    // Modale i nakładki (`fixed`, `role=dialog`) pomijamy — to nie jest klik „poza”, tylko w okno nad tabelą.
    const anyDrawerOpen = expanded.size > 1 || expandedMaterialIds.size > 0 || Object.keys(nodeDrawerTab).length > 0;
    useEffect(() => {
        if (!anyDrawerOpen) return;
        const onDown = (e) => {
            const t = e.target;
            if (!(t instanceof Element) || !t.isConnected) return;
            if (t.closest('.wbs-drawer, .wbs-drawer-row, .wbs-drawer-end, .wbs-leaf-open, .wbs-focus-keep, [data-wbs-card], .fixed, [role="dialog"]')) return;
            setExpanded(prev => (prev.size > 1 ? new Set(['root']) : prev));
            setExpandedMaterialIds(prev => (prev.size ? new Set() : prev));
            setNodeDrawerTab(prev => (Object.keys(prev).length ? {} : prev));
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [anyDrawerOpen]);

    // @anchor toggle-drawer-tab
    const toggleDrawerTab = (id, tab) => {
        setNodeDrawerTab(prev => {
            const next = { ...prev };
            if (next[id] === tab) delete next[id]; else next[id] = tab;
            return next;
        });
        setExpandedMaterialIds(prev => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
    };
    // @anchor toggle-material-card
    const toggleMaterialCard = (id) => {
        setExpandedMaterialIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
        setNodeDrawerTab(prev => { if (!prev[id]) return prev; const next = { ...prev }; delete next[id]; return next; });
    };

    const rows = [];
    const selectedDepth = selectedNodeId != null ? findDepth(items, selectedNodeId) : null;

    // ── Grid keyboard navigation (Excel-like) ────────────────────────────────
    // @anchor grid-nav-row-order
    // Kolejność renderowanych wierszy węzłów (node.id), wypełniana w trakcie renderNode —
    // pomija wiersze zwinięte/odfiltrowane przez wyszukiwarkę, więc Góra/Dół trafiają
    // tylko w faktycznie widoczne wiersze.
    const navRowOrder = [];
    // @anchor wbs-total-cols — liczba kolumn <col> tabeli: uchwyt + nazwa/typ/ilosc/jednostka
    // + (manager: cena_netto/narzut/cena_ofert) + status/wlasciciel/komentarz/strategia
    // + kolumna domykajaca. Wiersze rozpiete na calej szerokosci (szuflada karty produktu,
    // listwa domykajaca, pusty stan) MUSZA uzywac tej wartosci — zaszyty colSpan=12 obcinal
    // szuflade przed ostatnimi kolumnami, przez co karta byla wezsza niz wiersz drzewa.
    const TOTAL_COLS = isManager ? 14 : 10;
    // @anchor wbs-data-columns — kolumny danych w kolejności komórek wiersza: [klucz, nagłówek, wyrównanie].
    // Z tej listy powstają <col>, nagłówek i menu ukrywania kolumn.
    const DATA_COLUMNS = [
        ['nazwa', 'Nazwa', 'text-left'], ['typ', 'Typ', 'text-left'], ['ilosc', 'Ilość', 'text-right'], ['jednostka', 'Jedn.', 'text-left'],
        ...(isManager ? [['cena_netto', 'Koszt jedn.', 'text-right'], ['koszt_calk', 'Koszt całk.', 'text-right'], ['narzut', 'Narzut %', 'text-right'], ['cena_ofert', 'Cena ofert.', 'text-right']] : []),
        ['status', 'Status', 'text-left'], ['wlasciciel', 'Właściciel', 'text-left'], ['komentarz', 'Komentarz', 'text-left'], ['strategia', 'Strategia', 'text-left'],
    ];
    // @anchor grid-nav-column-order — ukryte kolumny wypadają z nawigacji klawiaturą
    const GRID_COLUMN_ORDER = ['nazwa', 'typ', 'ilosc', 'jednostka', ...(isManager ? ['cena_netto', 'narzut'] : []), 'status', 'wlasciciel', 'komentarz', 'strategia'].filter(k => !hiddenCols.has(k));
    // @anchor handle-grid-key-down
    // Enter/strzałki nawigują między edytowalnymi komórkami jak w arkuszu kalkulacyjnym:
    // Enter/Dół/Góra = ta sama kolumna, sąsiedni wiersz; Lewo/Prawo = sąsiednia kolumna w wierszu.
    // W polach tekstowych strzałki Lewo/Prawo/Góra/Dół nawigują tylko gdy kursor jest na
    // brzegu tekstu — w przeciwnym razie poruszają kursorem tekstowym (zachowanie natywne).
    const handleGridKeyDown = (e, rowKey, colKey) => {
        const target = e.target;
        const isTextarea = target.tagName === 'TEXTAREA';
        const isTextInput = target.tagName === 'INPUT' && target.type === 'text';
        const isText = isTextarea || isTextInput;
        // selectionStart===0 (nie wymaga selectionEnd===0) obejmuje też stan "cały tekst zaznaczony"
        // (np. po onFocus robiącym e.target.select() w polach Ilość/Koszt) — w takim stanie strzałka
        // ma od razu nawigować między komórkami, tak jak w arkuszu, a nie tylko kolapsować zaznaczenie.
        const atStart = isText && target.selectionStart === 0;
        const atEnd = isText && target.selectionEnd === target.value.length;

        const focusCell = (r, c) => {
            const el = tableWrapperRef.current?.querySelector(`[data-nav-row="${CSS.escape(r)}"][data-nav-col="${c}"]`);
            if (!el) return false;
            el.focus();
            if (typeof el.select === 'function') el.select();
            return true;
        };
        const stepRow = (dir) => {
            const idx = navRowOrder.indexOf(rowKey);
            if (idx === -1) return false;
            for (let i = idx + dir; i >= 0 && i < navRowOrder.length; i += dir) {
                if (focusCell(navRowOrder[i], colKey)) return true;
            }
            return false;
        };
        const stepCol = (dir) => {
            const idx = GRID_COLUMN_ORDER.indexOf(colKey);
            if (idx === -1) return false;
            for (let i = idx + dir; i >= 0 && i < GRID_COLUMN_ORDER.length; i += dir) {
                if (focusCell(rowKey, GRID_COLUMN_ORDER[i])) return true;
            }
            return false;
        };

        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                stepRow(1);
                return;
            case 'ArrowDown':
                if (isTextarea && !atEnd) return;
                if (stepRow(1)) e.preventDefault();
                return;
            case 'ArrowUp':
                if (isTextarea && !atStart) return;
                if (stepRow(-1)) e.preventDefault();
                return;
            case 'ArrowRight':
                if (isText && !atEnd) return;
                if (stepCol(1)) e.preventDefault();
                return;
            case 'ArrowLeft':
                if (isText && !atStart) return;
                if (stepCol(-1)) e.preventDefault();
                return;
            default:
                return;
        }
    };

    // ── Root row ──────────────────────────────────────────────────────────────
    rows.push(
        <tr key="root" className="border-b border-white/5 bg-slate-900/50 hover:bg-slate-900/70 cursor-pointer select-none" onClick={e => toggle('root', e)} style={{ touchAction: 'manipulation' }}>
            <td className={isTouch ? 'p-0 text-center' : 'px-3 py-3'}>
                <ChevronRight size={isTouch ? 20 : 18} className={`inline-block text-yellow-400 transition-transform ${isOpen('root') ? 'rotate-90' : ''}`} />
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
            {isManager && (
                <td className="px-3 py-3 text-right font-bold text-white text-base" onClick={e => e.stopPropagation()}>
                </td>
            )}
            {isManager && (
                <td className="px-3 py-3 text-right font-bold text-white text-base" onClick={e => e.stopPropagation()}>
                    {fmtPLN(items.reduce((a, n) => a + sumChildrenCost(n), 0))}
                </td>
            )}
            {isManager && <td className="px-3 py-3" />}
            {isManager && (
                <td className="px-3 py-3 text-right font-bold text-green-400 text-base" onClick={e => e.stopPropagation()}>
                    {fmtPLN(items.reduce((a, n) => a + sumChildrenOfferPrice(n), 0))}
                </td>
            )}
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
        </tr>
    );

    // ── Recursive renderer ────────────────────────────────────────────────────
    // `spine` — kolor kręgosłupa szuflady odziedziczony po najbardziej zewnętrznej otwartej
    // gałęzi. null = ten wiersz nie siedzi w żadnej szufladzie.
    // @anchor has-open-branch-below
    // Czy w pod-drzewie tej gałęzi stoi jeszcze jakaś otwarta gałąź (z dziećmi).
    // Szuflada należy do gałęzi NAJGŁĘBSZEJ z otwartych: rozwinięcie podgałęzi ma obrysować
    // właśnie ją i jej liście, a nie całą gałąź top-level razem z rodzeństwem, które z tym
    // rozwinięciem nie ma nic wspólnego. Akordeon (`toggle`) zamyka rodzeństwo na każdym
    // poziomie, więc na jednej ścieżce otwarta gałąź jest jedna i „najgłębsza” jest jednoznaczna.
    const hasOpenBranchBelow = (node) =>
        (node.children || []).some(c =>
            ((c.children || []).length > 0 && isOpen(`node_${c.id}`)) || hasOpenBranchBelow(c));

    const renderNode = (node, depth, wbsPath, parentId = null, rootIndex = 0, spine = null) => {
        if (searchVisibleIds && !searchVisibleIds.has(node.id)) {
            (node.children || []).forEach((child, ci) => renderNode(child, depth + 1, `${wbsPath}.${ci + 1}`, node.id, rootIndex, spine));
            return;
        }
        const rowId = `node_${node.id}`;
        navRowOrder.push(node.id);
        const bs = getBranchStyle(rootIndex, depth);
        const hasChildren = (node.children || []).length > 0;
        // Szuflada zaczyna się na NAJGŁĘBSZEJ otwartej gałęzi i obejmuje całe jej pod-drzewo.
        // Gałęzie wyżej, które są otwarte tylko po to, żeby tę pokazać, zostają zwykłymi wierszami.
        const isDrawerHead = hasChildren && isOpen(rowId) && !hasOpenBranchBelow(node);
        const drawerSpine = spine || (isDrawerHead ? bs.spine : null);
        const drawerClass = drawerSpine ? `wbs-drawer ${isDrawerHead ? 'wbs-drawer-head' : ''}` : '';
        const d = {
            trStyle: drawerSpine ? { ...bs.trStyle, '--wbs-spine': drawerSpine } : bs.trStyle,
            nameClass: `${DEPTH_SIZE[Math.min(depth, MAX_DEPTH)]} wbs-name`,
            fieldClass: 'wbs-field',
        };
        // Rozwinięty liść materiałowy — wiersz staje się górną połową karty z szufladą pod nim.
        const isMaterialLeaf = node.type === 'material' || node.type === 'equipment';
        const drawerTab = nodeDrawerTab[node.id] || null;
        const leafOpen = (isMaterialLeaf && expandedMaterialIds.has(node.id)) || !!drawerTab;
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
                data-node-id={node.id}
                data-depth={depth}
                onDragOver={e => onDragOver(e, node.id, depth)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, node.id)}
                style={leafOpen
                    ? (drawerTab
                        ? { ...d.trStyle, '--wbs-drawer-edge': DRAWER.accent.task.edge, '--wbs-drawer-fill': DRAWER.accent.task.fill, '--wbs-drawer-bw': DRAWER.accent.task.width }
                        : { ...d.trStyle, '--wbs-drawer-edge': DRAWER.accent.offer.edge, '--wbs-drawer-fill': DRAWER.accent.offer.fill })
                    : d.trStyle}
                className={`border-b border-white/5 cursor-pointer group/node transition-opacity wbs-br ${drawerClass} ${leafOpen ? 'wbs-leaf-open' : ''} ${drawerTab ? 'wbs-focus-keep' : ''} ${isDragging ? 'opacity-25' : ''} ${dropBorder} ${reqDropHighlight} ${selectedNodeId === node.id ? (drawerSpine ? 'outline outline-1 outline-emerald-400/40' : 'outline outline-1 outline-blue-500/40 !bg-blue-500/5') : ''}`}
                onClick={e => { setSelectedNodeId(node.id); hasChildren && toggle(rowId, e); }}
            >
                {/* WBS ID — uchwyt drag (mysz) / pełnokomórkowy przycisk rozwijania (dotyk).
                    Na dotyku uchwyt drag znika (HTML5 DnD nie działa palcem), a chevron dostaje
                    całą komórkę jako pole trafienia — inaczej 12-pikselowa ikona w 32-pikselowej
                    kolumnie jest praktycznie nie do trafienia palcem. */}
                {isTouch ? (
                    <td className={`relative p-0 ${isDrawerHead ? 'bg-white/[0.04]' : ''}`}>
                        <div className="absolute inset-0 flex items-stretch">
                            {/* Uchwyt przeniesienia — `touch-action: none`, więc gest zaczęty tutaj
                                nie przewija listy, tylko podnosi wiersz. `draggable` zostaje dla
                                hybryd (laptop z ekranem dotykowym trafia w gałąź dotykową, ale myszą
                                dalej ma korzystać z natywnego HTML5 DnD — ścieżka wskaźnika
                                ignoruje `pointerType === 'mouse'`). */}
                            <span
                                draggable
                                onDragStart={e => onDragStart(e, node.id)}
                                onDragEnd={onDragEnd}
                                onPointerDown={e => onHandlePointerDown(e, node.id)}
                                onPointerMove={onHandlePointerMove}
                                onPointerUp={e => finishPointerDrag(e, true)}
                                onPointerCancel={e => finishPointerDrag(e, false)}
                                onClick={e => e.stopPropagation()}
                                title="Przeciągnij, aby przenieść"
                                style={{ touchAction: 'none' }}
                                className={`flex items-center justify-center w-9 flex-shrink-0 active:bg-blue-500/25 active:text-blue-300 ${selectedDepth != null && depth === selectedDepth + 1 ? 'text-amber-400' : 'text-gray-600'}`}
                            >
                                <GripVertical size={18} />
                            </span>
                            {hasChildren ? (
                                <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); setSelectedNodeId(node.id); toggle(rowId, e); }}
                                    aria-expanded={isOpen(rowId)}
                                    aria-label={isOpen(rowId) ? 'Zwiń gałąź' : 'Rozwiń gałąź'}
                                    title={isOpen(rowId) ? 'Zwiń' : 'Rozwiń'}
                                    style={{ touchAction: 'manipulation' }}
                                    className="flex-1 flex items-center justify-center text-gray-300 active:bg-blue-500/25 active:text-blue-300 transition-colors"
                                >
                                    <ChevronRight size={20} className={`text-yellow-400 transition-transform ${isOpen(rowId) ? 'rotate-90' : ''}`} />
                                </button>
                            ) : <span className="flex-1" />}
                        </div>
                    </td>
                ) : (
                    <td
                        className="px-2 py-2.5"
                        onClick={e => { e.stopPropagation(); setSelectedNodeId(node.id); }}
                    >
                        {/* Kropki = tylko przeniesienie, żółta strzałka = tylko rozwinięcie. */}
                        <div className="relative flex items-center gap-1.5">
                            <span
                                draggable
                                onDragStart={e => onDragStart(e, node.id)}
                                onDragEnd={onDragEnd}
                                title="Przeciągnij, aby przenieść"
                                className="flex-shrink-0 cursor-grab p-0.5"
                            >
                                <GripVertical
                                    size={11}
                                    className={selectedDepth != null && depth === selectedDepth + 1 ? 'text-amber-400' : 'text-gray-700 group-hover/node:text-gray-500'}
                                />
                            </span>
                            {hasChildren
                                ? <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); setSelectedNodeId(node.id); toggle(rowId, e); }}
                                    aria-expanded={isOpen(rowId)}
                                    title={isOpen(rowId) ? 'Zwiń' : 'Rozwiń'}
                                    className="flex-shrink-0 cursor-pointer"
                                >
                                    <ChevronRight size={18} className={`text-yellow-400 transition-transform ${isOpen(rowId) ? 'rotate-90' : ''}`} />
                                </button>
                                : <span className="w-[18px] flex-shrink-0" />
                            }
                        </div>
                    </td>
                )}

                {/* Nazwa */}
                <td className="px-3 py-1.5 select-text relative" style={{ paddingLeft: `calc(0.75rem + ${depth * 24}px)` }} onClick={e => e.stopPropagation()}>
                    <WbsNameAutocomplete
                        value={node.name || ''}
                        pool={nameSuggestionPool}
                        excludeId={node.id}
                        onValueChange={v => handleField(node.id, 'name', v)}
                        onValueBlur={v => {
                            onNodeFieldSave?.(node.id, 'name', v);
                            if ((node.type === 'equipment' || node.type === 'material') && v) {
                                onMaterialNodeCreated?.({ wbsNodeId: node.id, name: v, type: node.type, parentId });
                            }
                            // Nazwa pokrywa się z pozycją już w drzewie → przepisz jej ustawienia.
                            // `node` jeszcze nie widzi nowej nazwy (stan rodzica), więc podajemy `v`.
                            const unitFromTwin = applyTwinDefaults({ ...node, name: v }, depth, parentId);
                            if (!unitFromTwin && (!node.unit || node.unit === 'sztuki')) {
                                const suggested = suggestDefaultUnit(v, node.type);
                                if (suggested) {
                                    handleField(node.id, 'unit', suggested);
                                    onNodeFieldSave?.(node.id, 'unit', suggested);
                                }
                            }
                        }}
                        placeholder={depth === 0 ? 'Nazwa przedmiotu projektu…' : 'Nazwa elementu…'}
                        className={`w-full bg-transparent border-none resize-none focus:outline-none placeholder-gray-700 min-w-[60px] select-text leading-snug ${d.nameClass}`}
                        data-nav-row={node.id}
                        data-nav-col="nazwa"
                        onKeyDown={e => handleGridKeyDown(e, node.id, 'nazwa')}
                    />
                    {/* @anchor wbs-node-action-bar — przyciski akcji pod nazwą. Kopiuj/Wklej/Dodaj/Usuń
                        działają od razu; Karta materiałowa, Zadania i Q&A otwierają szufladę pod
                        wierszem (jedna na węzeł — ponowne kliknięcie aktywnej zakładki ją zamyka). */}
                    <div className="flex items-center gap-0.5 mt-0.5 -ml-1">
                        <button
                            onClick={e => { e.stopPropagation(); setCopyBuffer({ node: findNode(items, node.id), sourceName: node.name }); }}
                            title="Kopiuj pozycję"
                            className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                        >
                            <Copy size={19} />
                        </button>
                        {copyBuffer && !subtreeContains(copyBuffer.node, node.id) && copyBuffer.node.id !== node.id && (
                            <button
                                onClick={e => {
                                    e.stopPropagation();
                                    const { clone, mappings } = deepCloneNodeWithMappings(copyBuffer.node);
                                    const newTree = { ...wbsTree, items: addChildTo(items, node.id, clone) };
                                    save(newTree);
                                    setCopyBuffer(null);
                                    if (mappings.length > 0) onPasteCloned?.(mappings, newTree);
                                }}
                                title={`Wklej „${copyBuffer.sourceName}" jako dziecko (z wymaganiami technicznymi, typem i statusem)`}
                                className="p-1 rounded text-emerald-500/60 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all"
                            >
                                <Clipboard size={19} />
                            </button>
                        )}
                        {depth < MAX_DEPTH && (
                            <button
                                onClick={e => handleAddChild(node.id, e)}
                                className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-blue-400 transition-all"
                                title="Dodaj element podrzędny"
                            >
                                <Plus size={20} />
                            </button>
                        )}
                        {isMaterialLeaf && (
                            <button
                                onClick={e => { e.stopPropagation(); toggleMaterialCard(node.id); }}
                                title="Karta materiałowa"
                                className={`p-1 rounded transition-all ${expandedMaterialIds.has(node.id) ? 'text-amber-400 bg-amber-500/15' : 'text-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10'}`}
                            >
                                <Package size={19} />
                            </button>
                        )}
                        {(() => {
                            // Gałąź główna: suma zadań całego poddrzewa (szuflada pokazuje je wszystkie).
                            const ts = depth === 0 && hasChildren
                                ? [node.id, ...Object.keys(collectBranchNames(node))].reduce((acc, id) => {
                                    const s = taskSummary[id];
                                    if (!s) return acc;
                                    const a = acc || { open: 0, overdue: 0, done: 0 };
                                    return { open: a.open + s.open, overdue: a.overdue + s.overdue, done: a.done + s.done };
                                }, undefined) // undefined, nie null — drawerStatusKey ma domyślny argument tylko dla undefined
                                : taskSummary[node.id];
                            const key = drawerStatusKey(ts);
                            const n = ts ? (ts.open || ts.done) : 0;
                            return (
                                <button
                                    onClick={e => { e.stopPropagation(); toggleDrawerTab(node.id, 'tasks'); }}
                                    className={`flex items-center gap-0.5 p-1 rounded transition-all ${DRAWER_STATUS_COLOR[key]} ${drawerTab === 'tasks' ? 'bg-blue-500/15' : 'hover:bg-white/10'}`}
                                    title={ts ? `Zadania: ${ts.open} otwarte (${ts.overdue} po terminie), ${ts.done} wykonane` : 'Zadania tej pozycji'}
                                >
                                    <ListTodo size={19} />
                                    {n > 0 && <span className="text-[12px] leading-none">{n}</span>}
                                </button>
                            );
                        })()}
                        {(() => {
                            const qs = qaSummary(depth === 0 && hasChildren
                                ? [...(Array.isArray(node.qa) ? node.qa : []), ...collectBranchQa(node).flatMap(g => g.pairs)]
                                : (Array.isArray(node.qa) ? node.qa : []));
                            return (
                                <button
                                    onClick={e => { e.stopPropagation(); toggleDrawerTab(node.id, 'qa'); }}
                                    className={`flex items-center gap-0.5 p-1 rounded transition-all ${DRAWER_STATUS_COLOR[drawerStatusKey(qs)]} ${drawerTab === 'qa' ? 'bg-blue-500/15' : 'hover:bg-white/10'}`}
                                    title={`${depth === 0 && hasChildren ? 'Q&A całej gałęzi' : 'Pytania i odpowiedzi'}${qs.total ? ` — ${qs.open} bez odpowiedzi, ${qs.done} z odpowiedzią` : ''}`}
                                >
                                    <HelpCircle size={19} />
                                    {qs.total > 0 && <span className="text-[12px] leading-none">{qs.total}</span>}
                                </button>
                            );
                        })()}
                        {(() => {
                            // @anchor wbs-chat-icon — szary = brak wiadomości, szary z liczbą = wszystko
                            // przeczytane, niebieski z czerwoną plakietką = nieprzeczytane od innych.
                            const cs = chatSummary[node.id];
                            const unread = cs?.unread || 0;
                            const below = branchChatUnread[node.id] || 0;
                            const color = unread > 0 || below > 0 ? 'text-blue-400 hover:text-blue-300'
                                : cs?.total ? 'text-gray-400 hover:text-gray-200' : DRAWER_STATUS_COLOR.none;
                            return (
                                <button
                                    data-chat-toggle={node.id}
                                    onClick={e => { e.stopPropagation(); toggleDrawerTab(node.id, 'chat'); }}
                                    className={`relative flex items-center gap-0.5 p-1 rounded transition-all ${color} ${drawerTab === 'chat' ? 'bg-red-500/15' : 'hover:bg-white/10'}`}
                                    title={`${cs?.total ? `Czat gałęzi — ${cs.total} wiadomości${unread ? `, ${unread} nieprzeczytane` : ''}` : 'Czat gałęzi'}${below ? ` · ${below} nieprzeczytane niżej w gałęzi — rozwiń, żeby znaleźć` : ''}`}
                                >
                                    <MessageCircle size={19} />
                                    {unread > 0
                                        ? <span className="min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[11px] leading-[16px] text-center">{unread}</span>
                                        : cs?.total > 0 && <span className="text-[12px] leading-none">{cs.total}</span>}
                                    {/* Nieprzeczytane w potomkach — obrys zamiast pełnej plakietki, żeby odróżnić „tu” od „niżej” */}
                                    {below > 0 && (
                                        <span className="min-w-[16px] px-1 rounded-full border border-red-500 text-red-400 text-[11px] leading-[14px] text-center" title={`${below} nieprzeczytane niżej w gałęzi`}>
                                            ↓{below}
                                        </span>
                                    )}
                                </button>
                            );
                        })()}
                        {/* @anchor wbs-realization-icon — kilof: szuflada realizacji (zakupy i wykonanie) tej
                            pozycji albo całej gałęzi; tylko w zamówieniu (`realization` z DashboardPage). */}
                        {realization && (
                            <button
                                onClick={e => { e.stopPropagation(); toggleDrawerTab(node.id, 'real'); }}
                                className={`p-1 rounded transition-all ${drawerTab === 'real' ? 'text-teal-300 bg-teal-500/15' : 'text-teal-500/50 hover:text-teal-300 hover:bg-white/10'}`}
                                title={hasChildren ? 'Realizacja gałęzi — zakupy i wykonanie pozycji' : 'Realizacja — zakupy i wykonanie'}
                            >
                                <PickaxeIcon size={19} />
                            </button>
                        )}
                        <button
                            onClick={e => handleDelete(node.id, e)}
                            className="p-1 hover:bg-red-500/10 rounded text-gray-600 hover:text-red-500 transition-all"
                            title="Usuń"
                        >
                            <Trash2 size={17} />
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
                                handleField(node.id, 'type', newType);
                                onNodeFieldSave?.(node.id, 'type', newType);
                                if (newType === 'group') {
                                    handleField(node.id, 'unit', 'pakiet');
                                    onNodeFieldSave?.(node.id, 'unit', 'pakiet');
                                    // Gałąź grupująca nie ma własnej ceny (wartość = suma dzieci) —
                                    // zeruj koszt lokalnie od razu, żeby rollup w tabeli nie trzymał
                                    // starej ceny do czasu refreshu. Backend (updateNode) utrwala zero
                                    // przy zapisie type='group', więc osobny PATCH kosztu jest zbędny.
                                    handleField(node.id, 'unitCost', 0);
                                } else if (isMaterial) {
                                    // Materiał/sprzęt wyceniane indywidualnie (wymagania materiałowe) —
                                    // te dwa typy nie mają ceny domyślnej w modalu „Domyślne wartości".
                                    // Brak ceny domyślnej = ZERUJEMY cenę, a nie zostawiamy starej: zmiana
                                    // typu z pracy zostawiała na materiale stawkę pracy (np. 800 zł/dzień
                                    // na switchu) i wyglądała jak prawdziwa cena zakupu. Właściwy koszt
                                    // wraca z wymagań materiałowych. Narzut czyścimy z tego samego powodu:
                                    // pochodził z domyślnych POPRZEDNIEGO typu, a materiał swojego nie ma.
                                    const suggestedUnit = suggestDefaultUnit(node.name, newType);
                                    const unitToApply = suggestedUnit || (getLeafDefaultFrom(leafDefaults, newType) || {}).unit;
                                    if (unitToApply != null) { handleField(node.id, 'unit', unitToApply); onNodeFieldSave?.(node.id, 'unit', unitToApply); }
                                    handleField(node.id, 'unitCost', 0);
                                    handleField(node.id, 'margin', 0);
                                    onApplyLeafDefaults?.(node.id, { unit: unitToApply, unitCost: 0, margin: 0 });
                                    // Materiał i sprzęt kupuje LOGISTYK — pozycja zakupowa startuje na
                                    // nim, a nie pusta. Bierzemy logistyka z kontaktów zamówienia
                                    // (`default-logistician-owner`); nadpisujemy WYŁĄCZNIE puste pole,
                                    // żeby zmiana typu nie zdejmowała nazwiska wpisanego ręcznie.
                                    if (!String(node.owner || '').trim()) {
                                        const logistyk = defaultLogisticianOwner(projectContacts);
                                        if (logistyk) { handleField(node.id, 'owner', logistyk); onNodeFieldSave?.(node.id, 'owner', logistyk); }
                                    }
                                } else if (newType) {
                                    // Praca/usługa/nocleg/paliwo — wartości domyślne z modalu przy KAŻDEJ zmianie typu
                                    // (nowe i istniejące pozycje), od razu w tabeli, edytowalne później.
                                    // Jednostka: nazwa kablowa/światłowodowa ma priorytet nad domyślną z modalu.
                                    // Ilość zachowana (nie przekazujemy jej do defaults) — patrz applyLeafDefaults.
                                    // Typ usunięty z listy domyślnych (getLeafDefaultFrom → null) — cen nie ruszamy.
                                    const rawDefs = getLeafDefaultFrom(leafDefaults, newType);
                                    const defs = rawDefs || {};
                                    const suggestedUnit = suggestDefaultUnit(node.name, newType);
                                    const unitToApply = suggestedUnit || defs.unit;
                                    if (unitToApply != null) handleField(node.id, 'unit', unitToApply);
                                    if (rawDefs) {
                                        if (defs.unitCost != null) handleField(node.id, 'unitCost', defs.unitCost);
                                        if (defs.margin != null) handleField(node.id, 'margin', defs.margin);
                                        onApplyLeafDefaults?.(node.id, { unit: unitToApply, unitCost: defs.unitCost, margin: defs.margin });
                                    } else if (unitToApply != null) {
                                        onNodeFieldSave?.(node.id, 'unit', unitToApply);
                                    }
                                }
                                if (newType === 'work') {
                                    ensureFuelLeaf(node.id);
                                }
                                if (isMaterial && node.name) {
                                    onMaterialNodeCreated?.({ wbsNodeId: node.id, name: node.name, type: newType, parentId });
                                }
                            }}
                            className={`bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-base w-full focus:outline-none focus:border-blue-500 transition-colors cursor-pointer ${d.fieldClass}${twinFlashClass(node.id, 'type')}`}
                            data-nav-row={node.id}
                            data-nav-col="typ"
                            onKeyDown={e => handleGridKeyDown(e, node.id, 'typ')}
                        >
                            <option value="" className="bg-gray-900">— wybierz typ —</option>
                            {TYPE_OPTIONS.filter(o => o !== '').map(o => (
                                <option key={o} value={o} className="bg-gray-900">{TYPE_LABELS[o] || o}</option>
                            ))}
                        </select>
                    )}
                </td>

                {/* Ilość */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {depth >= 1 && (
                        <div className="relative">
                            <input type="text" inputMode="decimal"
                                value={qtyFocusId === node.id
                                    ? (node.quantity ?? '')
                                    : (parseFloat(String(node.quantity).replace(',', '.')) ? node.quantity : '')}
                                onChange={e => {
                                    const clean = sanitizeQtyInput(e.target.value);
                                    if (clean !== e.target.value) flashWarn(node.id, 'quantity');
                                    handleField(node.id, 'quantity', clean);
                                }}
                                onFocus={e => { setQtyFocusId(node.id); if (!parseFloat(String(node.quantity).replace(',', '.'))) handleField(node.id, 'quantity', ''); e.target.select(); }}
                                onMouseUp={e => e.target.select()}
                                onKeyDown={e => handleGridKeyDown(e, node.id, 'ilosc')}
                                onBlur={e => {
                                    setQtyFocusId(null);
                                    const raw = String(e.target.value);
                                    const evaluated = evalQtyFormula(raw);
                                    const n = evaluated !== null ? evaluated : parseFloat(raw.replace(',', '.'));
                                    const clean = Number.isFinite(n) && n >= 0 ? String(n) : '0';
                                    handleField(node.id, 'quantity', clean);
                                    onRequirementsQtyChange?.(node.id, clean, node.name);
                                }}
                                placeholder="0" {...offerLockProps}
                                className={`bg-transparent border-none focus:outline-none text-base w-full text-right placeholder-gray-700 ${d.fieldClass}${offerLocked ? ' cursor-not-allowed opacity-70' : ''}`}
                                data-nav-row={node.id}
                                data-nav-col="ilosc" />
                            {warnKey === `${node.id}:quantity` && (
                                <span className="absolute right-0 top-full mt-0.5 z-20 whitespace-nowrap text-[10px] text-red-300 bg-red-900/90 border border-red-500/40 px-1.5 py-0.5 rounded shadow-lg">tylko cyfry</span>
                            )}
                        </div>
                    )}
                </td>

                {/* Jednostka */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {depth >= 1 && (
                        node.type === 'group' ? (
                            <div className={`text-base w-full ${d.fieldClass}`}>pakiet</div>
                        ) : (
                            <select value={node.unit || ''}
                                onChange={e => { handleField(node.id, 'unit', e.target.value); onNodeFieldSave?.(node.id, 'unit', e.target.value); }}
                                className={`bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-base w-full focus:outline-none focus:border-blue-500 cursor-pointer ${d.fieldClass}${twinFlashClass(node.id, 'unit')}`}
                                data-nav-row={node.id}
                                data-nav-col="jednostka"
                                onKeyDown={e => handleGridKeyDown(e, node.id, 'jednostka')}>
                                <option value="" className="bg-gray-900">—</option>
                                {UNIT_OPTIONS.map(u => <option key={u} value={u} className="bg-gray-900">{u}</option>)}
                            </select>
                        )
                    )}
                </td>

                {/* Koszt jednostkowy (tylko manager) */}
                {/* @anchor wbs-unit-price-input */}
                {isManager && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        {(depth === 0 || !isCostNode(node)) ? (
                            // Suma gałęzi jest w kolumnie „Koszt całk.” — tu tylko koszt jednostkowy pozycji
                            <div className={`text-base w-full text-right text-gray-600 ${d.fieldClass}`}>—</div>
                        ) : (
                            <div className="relative">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={costFocusId === node.id
                                        ? (node.unitCost || '')
                                        : (Number(node.unitCost) ? fmtPLN(Number(node.unitCost)) : '')}
                                    onChange={e => {
                                        const clean = sanitizeQtyInput(e.target.value);
                                        if (clean !== e.target.value) flashWarn(node.id, 'unitCost');
                                        handleField(node.id, 'unitCost', clean);
                                    }}
                                    onFocus={e => { setCostFocusId(node.id); e.target.select(); }}
                                    onBlur={e => {
                                        setCostFocusId(null);
                                        const raw = String(e.target.value);
                                        const evaluated = evalQtyFormula(raw);
                                        const n = evaluated !== null ? evaluated : parseFloat(raw.replace(',', '.'));
                                        const rounded = Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
                                        handleField(node.id, 'unitCost', String(rounded));
                                        onNodeFieldSave?.(node.id, 'unitCost', rounded);
                                    }}
                                    onKeyDown={e => handleGridKeyDown(e, node.id, 'cena_netto')}
                                    placeholder="0,00"
                                    {...offerLockProps}
                                    className={`bg-transparent border-none focus:outline-none text-base w-full text-right placeholder-gray-700 ${d.fieldClass}${offerLocked ? ' cursor-not-allowed opacity-70' : ''}${twinFlashClass(node.id, 'unitCost')}`}
                                    data-nav-row={node.id}
                                    data-nav-col="cena_netto"
                                />
                                {warnKey === `${node.id}:unitCost` && (
                                    <span className="absolute right-0 top-full mt-0.5 z-20 whitespace-nowrap text-[10px] text-red-300 bg-red-900/90 border border-red-500/40 px-1.5 py-0.5 rounded shadow-lg">tylko cyfry</span>
                                )}
                            </div>
                        )}
                    </td>
                )}

                {/* Koszt całkowity = ilość × koszt jedn.; na gałęziach suma poddrzewa (tylko manager) */}
                {/* @anchor wbs-total-cost-cell */}
                {isManager && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        {(() => {
                            const total = sumChildrenCost(node);
                            return (
                                <div
                                    title={hasChildren ? 'Suma kosztów gałęzi' : 'Koszt całkowity = ilość × koszt jedn.'}
                                    className={`text-base w-full text-right font-semibold ${total > 0 ? 'text-gray-200' : 'text-gray-600'}`}
                                >
                                    {total > 0 ? fmtPLN(total) : '—'}
                                </div>
                            );
                        })()}
                    </td>
                )}

                {/* Narzut % (tylko manager) — edytowalny na liściach/węzłach z kosztem */}
                {/* @anchor wbs-margin-input */}
                {isManager && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        {(depth === 0 || !isCostNode(node)) ? (
                            <div className={`text-base w-full text-right text-gray-600 ${d.fieldClass}`}>—</div>
                        ) : (
                            <div className="relative">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={node.margin != null && node.margin !== '' ? String(node.margin).replace('.', ',') : ''}
                                    onChange={e => {
                                        const clean = sanitizeQtyInput(e.target.value);
                                        if (clean !== e.target.value) flashWarn(node.id, 'margin');
                                        handleField(node.id, 'margin', clean);
                                    }}
                                    onFocus={e => e.target.select()}
                                    onBlur={e => {
                                        const raw = String(e.target.value);
                                        const n = parseFloat(raw.replace(',', '.'));
                                        const val = Number.isFinite(n) ? String(n) : '';
                                        handleField(node.id, 'margin', val);
                                        onNodeFieldSave?.(node.id, 'margin', val === '' ? null : Number(val));
                                    }}
                                    onKeyDown={e => handleGridKeyDown(e, node.id, 'narzut')}
                                    placeholder="—"
                                    {...offerLockProps}
                                    className={`bg-transparent border-none focus:outline-none text-base w-full text-right placeholder-gray-700 ${d.fieldClass}${offerLocked ? ' cursor-not-allowed opacity-70' : ''}${twinFlashClass(node.id, 'margin')}`}
                                    data-nav-row={node.id}
                                    data-nav-col="narzut"
                                />
                                {warnKey === `${node.id}:margin` && (
                                    <span className="absolute right-0 top-full mt-0.5 z-20 whitespace-nowrap text-[10px] text-red-300 bg-red-900/90 border border-red-500/40 px-1.5 py-0.5 rounded shadow-lg">tylko cyfry</span>
                                )}
                            </div>
                        )}
                    </td>
                )}

                {/* Cena ofertowa (ilość×koszt×narzut, sumowana jak koszt — tylko manager) */}
                {/* @anchor wbs-offer-price-cell */}
                {isManager && (
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        {(() => {
                            const offer = sumChildrenOfferPrice(node);
                            return (
                                <div
                                    title={hasChildren ? 'Suma cen ofertowych gałęzi' : 'Cena ofertowa = ilość × koszt × narzut'}
                                    className={`text-base w-full text-right font-semibold ${offer > 0 ? 'text-green-400' : 'text-gray-600'}`}
                                >
                                    {offer > 0 ? fmtPLN(offer) : '—'}
                                </div>
                            );
                        })()}
                    </td>
                )}

                {/* Status */}
                <td className="px-3 py-2.5 overflow-hidden" onClick={e => e.stopPropagation()}>
                    {(() => {
                        // Gałąź grupująca i przedmiot projektu (depth 0) statusu nie mają —
                        // plakietka liczy go z pozycji poddrzewa. Pozycja kosztowa z dziećmi
                        // zachowuje własny dropdown (patrz `nodeHasOwnStatus`).
                        if (!nodeHasOwnStatus(node, depth)) {
                            return <AggregatedStatusBadge node={node} depth={depth} />;
                        }
                        // @anchor wbs-status-req-link — wymaganie do zsynchronizowania statusem:
                        // tag `req:<id>` jest połączeniem właściwym, ale 15 pozycji na produkcji
                        // trzyma się karty wyłącznie przez `MaterialRequirement.wbsNodeId` (stare
                        // węzły bez taga). Bez tego fallbacku status ustawiony w drzewie nie
                        // docierał do panelu Materiały i oba widoki pokazywały co innego.
                        // Fallback po NAZWIE świadomie pominięty: przy odczycie dopasowuje
                        // węzeł do karty, ale przy zapisie potrafiłby ostemplować statusem
                        // kartę innej pozycji, która nazywa się tak samo.
                        const reqTag = (node.tags || []).find(t => String(t).startsWith('req:'));
                        const reqId = reqTag ? reqTag.slice(4) : (matReqByWbsId[node.id]?.id || null);
                        return (
                            <StatusSelect
                                value={node.status}
                                type={node.type}
                                onChange={v => {
                                    handleField(node.id, 'status', v);
                                    onNodeFieldSave?.(node.id, 'status', v);
                                    if (reqId) onNodeStatusChange?.(node.id, v, reqId);
                                }}
                                data-nav-row={node.id}
                                data-nav-col="status"
                                onKeyDown={e => handleGridKeyDown(e, node.id, 'status')}
                            />
                        );
                    })()}
                </td>

                {/* Właściciel — tylko POZYCJE (patrz `node-can-have-owner`). Gałąź porządkowa
                    i przedmiot projektu pokazują wartość zapisaną wcześniej, ale bez edycji:
                    odpowiedzialność siedzi na pozycji, nie na nagłówku. */}
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {!nodeCanHaveOwner(node, depth, hasChildren) ? (
                        <span className="text-base text-gray-600" title="Osobę odpowiedzialną przypisuje się do pozycji, nie do gałęzi">
                            {node.owner || '—'}
                        </span>
                    ) : (users.length > 0 || projectContacts.length > 0) ? (
                        <select
                            value={node.owner || ''}
                            onChange={e => { handleField(node.id, 'owner', e.target.value); onNodeFieldSave?.(node.id, 'owner', e.target.value); }}
                            className={`bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-base w-full focus:outline-none focus:border-blue-500 transition-colors cursor-pointer ${d.fieldClass}`}
                            data-nav-row={node.id}
                            data-nav-col="wlasciciel"
                            onKeyDown={e => handleGridKeyDown(e, node.id, 'wlasciciel')}
                        >
                            <option value="" className="bg-gray-900">—</option>
                            {/* Lista opcji pochodzi z `build-owner-options` — tej samej, z której
                                korzysta karta pozycji w Realizacji. Dwie kopie tej arytmetyki
                                znaczyłyby dwie różne etykiety tej samej osoby w bazie. */}
                            {buildOwnerOptions(users, projectContacts, [node.owner]).map((o, i) => (
                                o.separator
                                    ? <option key={`sep-${i}`} disabled className="bg-gray-900">──────────</option>
                                    : <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>
                            ))}
                        </select>
                    ) : (
                        <input type="text" value={node.owner || ''} onChange={e => handleField(node.id, 'owner', e.target.value)} onBlur={e => onNodeFieldSave?.(node.id, 'owner', e.target.value)}
                            onKeyDown={e => handleGridKeyDown(e, node.id, 'wlasciciel')}
                            placeholder="—" className={`bg-transparent border-none focus:outline-none text-base w-full placeholder-gray-700 ${d.fieldClass}`}
                            data-nav-row={node.id}
                            data-nav-col="wlasciciel" />
                    )}
                </td>

                {/* Komentarz — przy prawej krawędzi ikonki kopiujące do/z sąsiedniej Strategii
                    (tylko węzły-elementy: strategia top-level jest złożeniem, read-only). */}
                <td className="px-3 pr-6 py-2.5 min-w-[180px] relative group/cs" onClick={e => e.stopPropagation()}>
                    {depth > 0 && ((node.comment || '').trim() || (node.strategy || '').trim()) && (
                        <div className="absolute right-0.5 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-30 group-hover/cs:opacity-100 transition-opacity">
                            {(node.comment || '').trim() && (
                                <button type="button" tabIndex={-1} onClick={() => copyCommentToStrategy(node)}
                                    className="p-0.5 rounded text-gray-400 hover:text-sky-300 hover:bg-white/10" title="Kopiuj komentarz do strategii (dopisze, jeśli strategia jest wypełniona)">
                                    <ArrowRight size={11} />
                                </button>
                            )}
                            {(node.strategy || '').trim() && (
                                <button type="button" tabIndex={-1} onClick={() => copyStrategyToComment(node)}
                                    className="p-0.5 rounded text-gray-400 hover:text-sky-300 hover:bg-white/10" title="Kopiuj strategię do komentarza (dopisze, jeśli komentarz jest wypełniony)">
                                    <ArrowLeft size={11} />
                                </button>
                            )}
                        </div>
                    )}
                    <AutoResizeTextarea
                        value={node.comment || ''}
                        onChange={e => handleField(node.id, 'comment', e.target.value)}
                        onBlur={e => { onNodeFieldSave?.(node.id, 'comment', e.target.value); window.dispatchEvent(new CustomEvent('wbs-comment-changed', { detail: { wbsNodeIds: [node.id], comment: e.target.value } })); }}
                        placeholder="—"
                        className={`bg-transparent border-none resize-none focus:outline-none text-base w-full placeholder-gray-700 leading-snug ${d.fieldClass}`}
                        data-nav-row={node.id}
                        data-nav-col="komentarz"
                        onKeyDown={e => handleGridKeyDown(e, node.id, 'komentarz')}
                    />
                </td>

                {/* Strategia — edytowalna na węzłach-elementach (liście / pośrednie), read-only na top-level.
                    Top-level (depth===0) pokazuje złożenie ze składowych: linia `nazwa: strategia` na każdy
                    wypełniony potomek. Złożenie jest utrwalane na polu strategy top-level (czytają eksporty).

                    @anchor wbs-strategy-cell-scroll — złożenie MUSI mieć własny scroll. Bez niego wiersz
                    gałęzi rósł do wysokości sumy wszystkich strategii poddrzewa (na AMP_5G: 5859 px) i
                    rozwinięcie gałęzi wyglądało jak zepsuty przycisk — dzieci renderowały się poprawnie,
                    tylko sześć tysięcy pikseli niżej, poza ekranem. Wysokość wiersza ma zależeć od liczby
                    kolumn, nie od tego, ile ktoś napisał w strategii. */}
                <td className="px-3 py-2.5 min-w-[180px] align-top" onClick={e => e.stopPropagation()}>
                    {depth === 0 ? (() => {
                        const entries = collectBranchStrategyEntries(node);
                        const branchQa = buildQaIndex(node);
                        if (entries.length) {
                            return (
                                <div
                                    title="Strategia całej gałęzi — przewiń, aby zobaczyć resztę"
                                    className={`max-h-24 overflow-y-auto pr-1 text-base leading-snug text-gray-300 select-text ${d.fieldClass}`}
                                >
                                    {entries.map(e => (
                                        <div key={e.id} className="mb-1.5 last:mb-0">
                                            <span className="font-bold text-gray-200">{e.name}</span>
                                            <div className="whitespace-pre-wrap"><StrategyTokens text={e.strategy} qaIndex={branchQa} onOpenQuestion={p => openQaDrawer(p.nodeId)} /></div>
                                        </div>
                                    ))}
                                </div>
                            );
                        }
                        return (node.strategy || '')
                            ? <div className={`max-h-24 overflow-y-auto pr-1 whitespace-pre-wrap text-base leading-snug text-gray-300 select-text ${d.fieldClass}`}>{node.strategy}</div>
                            : <span className="text-gray-700 text-base select-none">—</span>;
                    })() : (
                        <LeafStrategyCell
                            node={node}
                            qaIndex={qaIndexAll}
                            fieldClass={d.fieldClass}
                            onChange={e => handleField(node.id, 'strategy', e.target.value)}
                            onSave={value => saveLeafStrategy(node.id, value)}
                            onAddQuestion={(q, withTask) => addStrategyQuestion(node, q, withTask)}
                            onOpenQuestion={() => openQaDrawer(node.id)}
                            onKeyDown={e => handleGridKeyDown(e, node.id, 'strategia')}
                        />
                    )}
                </td>

                {/* (delete przeniesiony do komórki nazwy) */}
                <td />
            </tr>
        );

        if ((node.type === 'material' || node.type === 'equipment') && expandedMaterialIds.has(node.id)) {
            rows.push(
                <tr
                    key={`mat-req-${node.id}`}
                    data-wbs-card
                    className={drawerSpine ? 'wbs-drawer-row' : ''}
                    style={drawerSpine ? { '--wbs-spine': drawerSpine } : undefined}
                >
                    <td colSpan={TOTAL_COLS} className={`${DRAWER.cardCell} ${DRAWER.accent.offer.cell}`}>
                        <MaterialReqExpandPanel
                            node={node}
                            req={(() => {
                                // 1. Tag req:<id> — bezpośrednie połączenie liść↔wymaganie (najwłaściwsze)
                                const reqTag = (node.tags || []).find(t => String(t).startsWith('req:'));
                                if (reqTag && matReqByWbsId[reqTag.slice(4)]) return matReqByWbsId[reqTag.slice(4)];
                                // 2. wbsNodeId — aktywna wersja, węzeł jest właścicielem wymagania
                                if (matReqByWbsId[node.id]) return matReqByWbsId[node.id];
                                // 3. Fallback po nazwie — dla węzłów snapshot (klonowane ID) i starych węzłów
                                //    bez tagu req:. Zapobiega tworzeniu ghost-requirements z błędnym versionId.
                                return matReqByName[String(node.name || '').trim().toLowerCase()] || null;
                            })()}
                            processNodeId={processNodeId}
                            versionId={versionId}
                            reqsLoaded={matReqsLoaded}
                            offerLocked={offerLocked}
                            onNodeFieldSave={onNodeFieldSave}
                            onNodeFieldLocal={handleField}
                            onSaved={(updated, opts) => {
                                setMatReqByWbsId(prev => ({ ...prev, [node.id]: updated, ...(updated?.id ? { [updated.id]: updated } : {}) }));
                                if (updated?.name) setMatReqByName(prev => ({ ...prev, [String(updated.name).trim().toLowerCase()]: updated }));
                                // silent = edycja pola propozycji/wymagania bez wpływu na budżet. Pełny
                                // onMaterialReqUpdated przeładowuje całe drzewo WBS i listę wymagań —
                                // przy każdym polu wyglądało to jak restart widoku, a wyścig tego
                                // odczytu z własnym PATCH-em cofał świeżo wpisane wartości.
                                if (opts?.silent) return;
                                onMaterialReqUpdated?.();
                            }}
                            onDeleteNode={() => {
                                const deletedNode = findNode(items, node.id);
                                const deletedIds = collectIds(items, node.id);
                                const nextItems = deleteNode(items, node.id);
                                save({ ...wbsTree, items: nextItems });
                                if (deletedIds.length) onNodesDeleted?.(deletedIds);
                                if (deletedNode) recomposeBranchStrategyAfterDelete(deletedNode, items, nextItems);
                                setExpandedMaterialIds(prev => { const n = new Set(prev); n.delete(node.id); return n; });
                            }}
                        />
                    </td>
                </tr>
            );
        }

        if (drawerTab) {
            rows.push(
                <tr
                    key={`drawer-${node.id}`}
                    className={`wbs-focus-keep ${drawerSpine ? 'wbs-drawer-row' : ''}`}
                    style={drawerSpine ? { '--wbs-spine': drawerSpine } : undefined}
                >
                    <td colSpan={TOTAL_COLS} className={`px-2 pb-2 ${DRAWER.accent.task.cell}`}>
                        {/* Sticky + szerokość widocznego obszaru — szuflada zawsze mieści się w oknie, także gdy tabela przewija się w poziomie */}
                        <div
                            data-chat-drawer={drawerTab === 'chat' ? node.id : undefined}
                            className={`${DRAWER.card} ${DRAWER.accent.task.card} ${drawerTab === 'chat' ? DRAWER.chatBar : ''}`}
                            style={{ position: 'sticky', left: 8, maxWidth: 'calc(var(--wbs-view-w, 100%) - 16px)' }}
                        >
                            <div className={`${DRAWER.cardHead} border-b border-emerald-400/20`}>
                                <span className={`${DRAWER.cardTitle} text-[13px] ${DRAWER.accent.task.title} flex items-center gap-1.5`}>
                                    {drawerTab === 'tasks'
                                        ? <><ListTodo size={13} /> Zadania</>
                                        : drawerTab === 'chat'
                                        ? <><MessageCircle size={13} /> Czat gałęzi</>
                                        : drawerTab === 'real'
                                        ? <><PickaxeIcon size={13} /> Realizacja</>
                                        : <><HelpCircle size={13} /> {depth === 0 && hasChildren ? 'Q&A gałęzi' : 'Pytania i odpowiedzi'}</>}
                                </span>
                                <span className="text-[13px] text-gray-500 truncate">{node.name}</span>
                                {drawerTab === 'qa' && processNodeId && (
                                    <button
                                        onClick={openMailReplies}
                                        className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[13px] transition-all ${newMailReplies ? 'text-amber-300 bg-amber-500/10 hover:bg-amber-500/20' : 'text-gray-400 hover:text-gray-200 hover:bg-white/10'}`}
                                        title="Odpowiedzi klienta na maile z pytaniami"
                                    >
                                        <Inbox size={13} /> Odpowiedzi z maila{newMailReplies ? ` (${newMailReplies})` : ''}
                                    </button>
                                )}
                                {drawerTab === 'qa' && processNodeId && (
                                    <button
                                        onClick={() => setQaMailNode({ id: node.id, branch: depth === 0 && hasChildren })}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[13px] text-sky-300 hover:text-sky-200 hover:bg-sky-500/15 transition-all"
                                        title="Wyślij pytania bez odpowiedzi mailem do klienta"
                                    >
                                        <Mail size={13} /> Wyślij mailem
                                    </button>
                                )}
                                <button onClick={() => toggleDrawerTab(node.id, drawerTab)} className={`${drawerTab === 'qa' && processNodeId ? '' : 'ml-auto '}p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-all`} title="Zamknij">
                                    <X size={13} />
                                </button>
                            </div>
                            <div className="px-3 pt-2 pb-3">
                                {drawerTab === 'tasks' ? (
                                    <WbsTasksDrawer wbsNodeId={node.id} processNodeId={processNodeId} onChanged={loadTaskSummary} branch={depth === 0 && hasChildren} />
                                ) : drawerTab === 'real' ? (
                                    <WbsRealizationDrawer wbsNode={node} processNodeId={processNodeId} realization={realization} />
                                ) : drawerTab === 'chat' ? (
                                    <WbsChatDrawer
                                        wbsNodeId={node.id} processNodeId={processNodeId} onChanged={loadChatSummary}
                                        branchNames={depth === 0 && hasChildren ? collectBranchNames(node) : undefined}
                                        nodeName={node.name}
                                        questionsFor={openQuestionsFor}
                                        onAnswerQuestion={answerQuestionFromChat}
                                        answerFor={answeredByMessage}
                                        onAskQuestion={askQuestionFromChat}
                                        askedBy={askedByMessage}
                                    />
                                ) : depth === 0 && hasChildren ? (
                                    <QaBranchView node={node} onChangeNode={(id, next) => handleQaChange(id, next)} onPersist={() => { onSave?.(); recomposeRootFor(node.id, items); }} />
                                ) : (
                                    <QaCell
                                        pairs={node.qa}
                                        onChange={(next) => handleQaChange(node.id, next)}
                                        onPersist={() => { onSave?.(); recomposeRootFor(node.id, items); }}
                                        autoFocusNew
                                        linkedIds={new Set(strategyTokenIds(node.strategy))}
                                    />
                                )}
                            </div>
                        </div>
                    </td>
                </tr>
            );
        }

        if (searchVisibleIds || isOpen(rowId)) {
            const kids = node.children || [];
            // Akordeon: rodzeństwo jest widoczne jako wiersze, ale tylko rozwinięte dziecko
            // pokazuje swoje pod-drzewo (sterowane przez `isOpen(rowId)` przy każdym wierszu).
            kids.forEach((child, ci) => {
                renderNode(child, depth + 1, `${wbsPath}.${ci + 1}`, node.id, rootIndex, drawerSpine);
            });
        }

        // Listwa domykająca szufladę — rysuje ją wyłącznie gałąź, która szufladę otworzyła
        // (`!spine`), inaczej każda zagnieżdżona gałąź kończyłaby blok w środku.
        if (isDrawerHead && !spine) {
            rows.push(
                <tr key={`${rowId}-drawer-end`} className="wbs-drawer-end" style={{ '--wbs-spine': drawerSpine }}>
                    <td colSpan={TOTAL_COLS} />
                </tr>
            );
        }
    };

    if (isOpen('root')) {
        if (items.length === 0) {
            rows.push(
                <tr key="empty">
                    <td colSpan={TOTAL_COLS} className="px-3 py-3 pl-16 text-[14px] text-gray-700 italic">
                        Brak przedmiotów — kliknij <span className="text-gray-500">+</span> przy projekcie, aby dodać
                    </td>
                </tr>
            );
        }
        // Akordeon: wszystkie top-level gałęzie zawsze widoczne jako wiersze;
        // tylko rozwinięta gałąź pokazuje swoje pod-drzewo (przez `isOpen(rowId)`).
        items.forEach((item, i) => {
            renderNode(item, 0, `${i + 1}`, null, i);
        });
    }

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <style>{WBS_BRANCH_CSS}</style>
            {copyBuffer && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 border-b border-blue-500/20 text-[15px] text-blue-300">
                    <Clipboard size={12} className="flex-shrink-0" />
                    <span>Kopiujesz: <strong>{copyBuffer.sourceName || '—'}</strong> — najedź na wiersz i kliknij <Clipboard size={10} className="inline" /> by wkleić jako dziecko</span>
                    <button onClick={() => setCopyBuffer(null)} className="ml-auto p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-white"><X size={12} /></button>
                </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto overflow-x-auto custom-scrollbar" ref={tableWrapperRef}>
            <div className="w-full">
                <table className={`text-base border-collapse ${Object.values(nodeDrawerTab).some(Boolean) ? 'wbs-focus' : ''}`} style={{ tableLayout: 'fixed', width: '100%' }}>
                    <colgroup>
                        {/* Kolumna uchwytu/rozwijania — na dotyku mieści uchwyt przeniesienia (36 px)
                            i przycisk rozwijania (48 px), oba w rozmiarze pod palec. Mysz: kropki + strzałka
                            (~56 px) — węższa kolumna wypychała strzałkę pod komórkę nazwy i klik w nią nie działał */}
                        <col style={{ width: isTouch ? 84 : 56 }} />
                        {(() => {
                            // Szerokość ukrytych kolumn przechodzi na Komentarz i Strategię (po równo,
                            // na te z nich, które są widoczne) — tabela nie kurczy się po ukryciu kolumny.
                            const growKeys = ['komentarz', 'strategia'].filter(k => !hiddenCols.has(k));
                            const freed = DATA_COLUMNS.reduce((a, [k]) => a + (hiddenCols.has(k) && !growKeys.includes(k) ? (colWidths[k] || 0) : 0), 0);
                            const bonus = growKeys.length ? freed / growKeys.length : 0;
                            return DATA_COLUMNS.map(([key]) => (
                                // Ukryta: szerokość 0 + collapse — inaczej przeglądarka rezerwuje jej miejsce
                                // przy rozkładzie 100% i po zwinięciu zostaje pusty pas z prawej.
                                hiddenCols.has(key)
                                    ? <col key={key} style={{ width: 0, visibility: 'collapse' }} />
                                    : <col key={key} style={{ width: (colWidths[key] || 0) + (growKeys.includes(key) ? bonus : 0) }} />
                            ));
                        })()}
                        <col style={{ width: 48 }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-[#0b0f17]">
                        <tr className="border-b border-white/10">
                            <th className="px-1 py-2.5 text-base font-bold uppercase tracking-widest text-white" />
                            {DATA_COLUMNS.map(([key, label, align]) => (
                                <th key={key} className={`px-3 py-2.5 text-base font-bold uppercase tracking-widest text-white ${align} relative select-none`}>
                                    {label}
                                    {/* Uchwyt szerokości — na dotyku szerszy i widoczny (palcem 6 px nie da się trafić) */}
                                    <div
                                        onPointerDown={e => startColResize(key, e)}
                                        style={{ touchAction: 'none' }}
                                        title="Przeciągnij, aby zmienić szerokość kolumny"
                                        className={`absolute right-0 top-0 h-full cursor-col-resize transition-colors ${isTouch ? 'w-4 flex justify-center after:content-[""] after:w-[3px] after:h-1/2 after:self-center after:rounded-full after:bg-white/25 active:bg-blue-500/30' : 'w-1.5 hover:bg-blue-500/40'}`}
                                    />
                                </th>
                            ))}
                            {/* @anchor wbs-cols-menu — wybór widocznych kolumn (Nazwa zawsze widoczna) */}
                            <th className="w-12 relative">
                                <button
                                    type="button"
                                    onClick={() => setColsMenuOpen(o => !o)}
                                    title="Pokaż / ukryj kolumny"
                                    className={`p-1.5 rounded hover:bg-white/10 transition-colors ${hiddenCols.size ? 'text-blue-400' : 'text-gray-500 hover:text-white'}`}
                                >
                                    <EyeOff size={14} />
                                </button>
                                {colsMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-30" onClick={() => setColsMenuOpen(false)} />
                                        <div className="absolute right-1 top-full mt-1 z-40 w-52 rounded-lg border border-white/10 bg-[#111827] shadow-xl py-1 text-left normal-case tracking-normal font-normal">
                                            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-gray-500">Widoczne kolumny</div>
                                            {DATA_COLUMNS.filter(([key]) => key !== 'nazwa').map(([key, label]) => (
                                                <label key={key} className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-gray-200 hover:bg-white/5 cursor-pointer">
                                                    <input type="checkbox" checked={!hiddenCols.has(key)} onChange={() => toggleHiddenCol(key)} className="accent-blue-500" />
                                                    {label}
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </th>
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
                        <span className="text-[14px] uppercase tracking-widest text-amber-500/70 font-bold flex items-center gap-1.5">
                            <Package size={10} />
                            Koszyk — nieprzypisane ({unassignedRequirements.length})
                            {selectedNodeId && !showBasket && <span className="ml-2 text-gray-600 normal-case tracking-normal font-normal text-[9px]">rozwiń, by przypisać</span>}
                        </span>
                        <ChevronDown size={13} className={`text-amber-500/50 transition-transform ${showBasket ? 'rotate-180' : ''}`} />
                    </button>
                    {showBasket && (
                        <div className="px-4 pb-3 max-h-48 overflow-y-auto custom-scrollbar">
                            {selectedNodeId && (
                                <p className="text-[14px] text-gray-600 mb-2">przeciągnij na wiersz lub kliknij → Przypisz</p>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {unassignedRequirements.map(req => {
                                    const isOpen = expandedBasketIds.has(req.id);
                                    const spec = String(req.technicalSpec || '').trim();
                                    return (
                                    <div
                                        key={req.id}
                                        draggable
                                        onDragStart={e => {
                                            e.dataTransfer.setData('application/requirement-id', req.id);
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        onDragOver={e => { if ((e.dataTransfer.types || []).includes('application/requirement-id')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setMergeOverId(req.id); } }}
                                        onDragLeave={() => setMergeOverId(prev => (prev === req.id ? null : prev))}
                                        onDrop={e => { e.preventDefault(); e.stopPropagation(); const src = e.dataTransfer.getData('application/requirement-id'); setMergeOverId(null); if (src && src !== req.id) onRequirementMerge?.(src, req.id); }}
                                        title={onRequirementMerge ? 'Przeciągnij inny liść tutaj, aby scalić jego wymagania' : undefined}
                                        className={`flex gap-1.5 px-2.5 py-1.5 bg-emerald-900/30 border rounded-lg text-emerald-300 text-[15px] cursor-grab select-none ${mergeOverId === req.id ? 'border-amber-400/70 ring-2 ring-amber-400/50' : 'border-emerald-500/20'} ${isOpen ? 'w-full flex-col items-start' : 'items-center'}`}
                                    >
                                        <div className="flex items-center gap-1.5 w-full">
                                            <button
                                                onClick={e => { e.stopPropagation(); setExpandedBasketIds(prev => { const n = new Set(prev); n.has(req.id) ? n.delete(req.id) : n.add(req.id); return n; }); }}
                                                className="flex items-center gap-1.5 cursor-pointer hover:text-emerald-200 text-left min-w-0"
                                                title="Pokaż wymagania techniczne"
                                            >
                                                <ChevronDown size={11} className={`text-emerald-500/60 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                                <span className="truncate">{req.name || req.productName || '—'}</span>
                                            </button>
                                            {req.quantity > 0 && <span className="text-emerald-500/60 text-[14px] flex-shrink-0">×{req.quantity}{req.unit ? ` ${req.unit}` : ''}</span>}
                                            {selectedNodeId && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); onRequirementAssign?.(selectedNodeId, req.id); }}
                                                    className="ml-auto px-1.5 py-0.5 bg-emerald-600/40 hover:bg-emerald-600/70 rounded text-[9px] font-bold text-emerald-200 cursor-pointer flex-shrink-0"
                                                    title="Przypisz do zaznaczonej gałęzi"
                                                >→ Przypisz</button>
                                            )}
                                        </div>
                                        {isOpen && (
                                            <div className="w-full mt-1 px-2 py-1.5 bg-black/30 border border-emerald-500/10 rounded text-[13px] text-emerald-100/80 whitespace-pre-wrap break-words cursor-text">
                                                {spec || <span className="text-gray-500 italic">(brak wymagań technicznych)</span>}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {qaMailNode && (() => {
                const n = findNode(items, qaMailNode.id);
                if (!n) return null;
                return (
                    <QaMailModal
                        processNodeId={processNodeId}
                        title={n.name || 'Element WBS'}
                        questions={collectMailQuestions(n, qaMailNode.branch)}
                        onClose={() => setQaMailNode(null)}
                        onSent={applyQaMailSent}
                    />
                );
            })()}

            {mailRepliesOpen && (
                <QaMailRepliesModal
                    processNodeId={processNodeId}
                    replies={mailReplies}
                    loading={mailRepliesLoading}
                    onReload={loadMailReplies}
                    onApply={answerQuestionsFromMail}
                    currentAnswer={currentQaAnswer}
                    onClose={() => setMailRepliesOpen(false)}
                />
            )}
        </div>
    );
}
