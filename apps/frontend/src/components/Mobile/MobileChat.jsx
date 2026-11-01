import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, MessageCircle, Send, ImagePlus, Camera, X, Loader2, Lock, Unlock, Plus, ChevronRight, Search } from 'lucide-react';
import { API_URL } from '../../config';

// Ten sam limit co CHAT_IMAGE_MAX_BYTES w backendzie (comments/chat-image.storage.ts).
const CHAT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const POLL_MS = 15000;

const getToken = () => sessionStorage.getItem('token') || localStorage.getItem('token');
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });
const myUserId = () => {
    try { return JSON.parse(atob(getToken().split('.')[1])).sub; } catch { return null; }
};

const fmtTime = (d) => {
    const dt = new Date(d);
    const today = new Date().toDateString() === dt.toDateString();
    return today
        ? dt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
        : dt.toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const fullName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || 'Użytkownik';

// Blob URL-e obrazków czatu na całą sesję — lista odświeża się co 15 s.
const imageCache = new Map();

// @anchor mobile-chat-image
// Miniatura obrazka z czatu — endpoint jest za JWT, więc blob przez fetch zamiast <img src>.
function MobileChatImage({ fileName, onOpen }) {
    const [url, setUrl] = useState(() => imageCache.get(fileName) || null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (url) return;
        let cancelled = false;
        fetch(`${API_URL}/comments/images/${encodeURIComponent(fileName)}`, { headers: authHeaders() })
            .then(r => (r.ok ? r.blob() : Promise.reject(r.status)))
            .then(b => { const u = URL.createObjectURL(b); imageCache.set(fileName, u); if (!cancelled) setUrl(u); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [fileName, url]);
    if (failed) return <span className="text-[11px] text-gray-500 italic">obrazek niedostępny</span>;
    if (!url) return <span className="h-24 w-24 rounded-lg bg-white/5 flex items-center justify-center"><Loader2 size={14} className="animate-spin text-gray-500" /></span>;
    return (
        <button onClick={() => onOpen(url)} className="block">
            <img src={url} alt="" className="max-h-48 max-w-[220px] rounded-lg border border-white/10 object-contain bg-black/20" />
        </button>
    );
}

// @anchor mobile-chat-conversation
// Rozmowa jednego wątku gałęzi WBS: wiadomości, wysyłka tekstu i zdjęć (aparat / galeria),
// zamknięcie i wznowienie wątku. Otwarcie oznacza wiadomości wątku jako przeczytane.
export function MobileChatConversation({ thread, onBack }) {
    const { orderId, wbsNodeId } = thread;
    const base = `${API_URL}/comments/order/${orderId}`;
    const ownId = myUserId();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(thread.status || 'ACTIVE');
    const [text, setText] = useState('');
    const [pending, setPending] = useState([]); // [{ fileName, url }]
    const [uploading, setUploading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState(null);
    const fileRef = useRef(null);
    const cameraRef = useRef(null);
    const endRef = useRef(null);
    const lastCount = useRef(0);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${base}?wbsNodeId=${encodeURIComponent(wbsNodeId)}`, { headers: authHeaders() });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            setMessages(Array.isArray(data) ? data : []);
            fetch(`${base}/mark-read?wbsNodeId=${encodeURIComponent(wbsNodeId)}`, { method: 'POST', headers: authHeaders() }).catch(() => {});
        } catch {
            setError('Nie udało się pobrać rozmowy');
        } finally {
            setLoading(false);
        }
    }, [base, wbsNodeId]);

    useEffect(() => {
        load();
        const id = setInterval(load, POLL_MS);
        return () => clearInterval(id);
    }, [load]);

    // Przewiń na dół tylko gdy przybyły nowe wiadomości — odświeżenie co 15 s nie skacze widokiem
    useEffect(() => {
        if (messages.length !== lastCount.current) endRef.current?.scrollIntoView({ block: 'end' });
        lastCount.current = messages.length;
    }, [messages]);

    const uploadImages = async (files) => {
        const imgs = [...files].filter(f => f.type.startsWith('image/'));
        if (!imgs.length) return;
        setError('');
        setUploading(true);
        try {
            for (const f of imgs) {
                if (f.size > CHAT_IMAGE_MAX_BYTES) { setError(`${f.name || 'Zdjęcie'} — za duże (max 15 MB)`); continue; }
                const fd = new FormData();
                fd.append('file', f, f.name || 'zdjecie.jpg');
                const res = await fetch(`${base}/images`, { method: 'POST', headers: authHeaders(), body: fd });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    setError(err.message || `Nie udało się wysłać zdjęcia (HTTP ${res.status})`);
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
        setSending(true); setError('');
        try {
            const res = await fetch(base, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: body, wbsNodeId, images: pending.map(p => p.fileName) }),
            });
            if (!res.ok) throw new Error(String(res.status));
            setText(''); setPending([]);
            await load();
        } catch {
            setError('Nie udało się wysłać wiadomości');
        } finally { setSending(false); }
    };

    const toggleStatus = async () => {
        const next = status === 'CLOSED' ? 'ACTIVE' : 'CLOSED';
        const res = await fetch(`${base}/threads/${encodeURIComponent(wbsNodeId)}`, {
            method: 'PATCH',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: next }),
        }).catch(() => null);
        if (res?.ok) setStatus(next); else setError('Nie udało się zmienić statusu wątku');
    };

    const closed = status === 'CLOSED';

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white">
            <header className="px-3 py-2.5 border-b border-white/5 bg-gray-900/60 flex items-center gap-2 shrink-0">
                <button onClick={onBack} className="p-2 rounded-xl bg-white/5 active:scale-90 transition-transform shrink-0">
                    <ArrowLeft size={18} className="text-gray-400" />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold uppercase truncate">{thread.wbsNodeName}</div>
                    <div className="text-[10px] text-gray-500 truncate">{[thread.orderName, thread.wbsParentName].filter(Boolean).join(' › ')}</div>
                </div>
                {/* Pusty wątek (dopiero zakładany) nie ma czego zamykać */}
                {(messages.length > 0 || closed) && <button
                    onClick={toggleStatus}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase border shrink-0 ${closed ? 'border-green-500/30 text-green-300 bg-green-500/10' : 'border-white/10 text-gray-400 bg-white/5'}`}
                >
                    {closed ? <><Unlock size={12} /> Otwórz</> : <><Lock size={12} /> Zamknij</>}
                </button>}
            </header>

            <main className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar">
                {loading ? (
                    <div className="flex justify-center mt-10"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
                ) : messages.length === 0 ? (
                    <p className="text-center text-gray-600 text-sm mt-10">Brak wiadomości — napisz pierwszą</p>
                ) : messages.map(m => {
                    const mine = m.userId === ownId;
                    return (
                        <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                            <div className="text-[10px] text-gray-500 mb-0.5 px-1">{mine ? 'Ty' : fullName(m.user)} · {fmtTime(m.createdAt)}</div>
                            <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? 'bg-blue-600/25 border border-blue-500/20' : 'bg-white/5 border border-white/5'}`}>
                                {m.replyTo && (
                                    <div className="text-[11px] text-gray-400 border-l-2 border-white/20 pl-2 mb-1 line-clamp-2">
                                        {fullName(m.replyTo.user)}: {m.replyTo.text}
                                    </div>
                                )}
                                {m.text && <div className="text-[14px] whitespace-pre-wrap break-words">{m.text}</div>}
                                {m.images?.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {m.images.map(f => <MobileChatImage key={f} fileName={f} onOpen={setPreview} />)}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div ref={endRef} />
            </main>

            {error && <div className="px-3 py-1.5 text-[11px] text-red-400 shrink-0">{error}</div>}

            {closed ? (
                <div className="px-4 py-4 border-t border-white/5 text-center text-[12px] text-gray-500 shrink-0">
                    Wątek zamknięty (archiwum) — otwórz go, żeby pisać
                </div>
            ) : (
                <div className="border-t border-white/5 bg-gray-900/60 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shrink-0">
                    {pending.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 px-1">
                            {pending.map(p => (
                                <div key={p.fileName} className="relative shrink-0">
                                    <img src={p.url} alt="" className="h-16 w-16 rounded-lg object-cover border border-white/10" />
                                    <button onClick={() => setPending(prev => prev.filter(x => x.fileName !== p.fileName))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 border border-white/20 flex items-center justify-center">
                                        <X size={11} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        {/* @anchor mobile-chat-photo-source — dwa osobne wejścia: `capture` otwiera od razu aparat,
                            bez niego telefon pokazuje galerię (wiele zdjęć naraz). */}
                        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { uploadImages(e.target.files || []); e.target.value = ''; }} />
                        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { uploadImages(e.target.files || []); e.target.value = ''; }} />
                        {uploading ? (
                            <div className="p-2.5 shrink-0"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
                        ) : (
                            <>
                                <button onClick={() => cameraRef.current?.click()} title="Zrób zdjęcie" className="p-2.5 rounded-xl bg-white/5 text-gray-400 active:scale-90 shrink-0">
                                    <Camera size={18} />
                                </button>
                                <button onClick={() => fileRef.current?.click()} title="Wybierz z galerii" className="p-2.5 rounded-xl bg-white/5 text-gray-400 active:scale-90 shrink-0">
                                    <ImagePlus size={18} />
                                </button>
                            </>
                        )}
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value)}
                            rows={1}
                            placeholder="Wiadomość…"
                            className="flex-1 min-w-0 resize-none max-h-32 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[16px] text-gray-100 focus:outline-none focus:border-blue-500/40"
                            style={{ fieldSizing: 'content' }}
                        />
                        <button onClick={send} disabled={sending || uploading || (!text.trim() && !pending.length)} className="p-2.5 rounded-xl bg-blue-600 text-white active:scale-90 disabled:opacity-30 shrink-0">
                            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </div>
                </div>
            )}

            {preview && (
                <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center" onClick={() => setPreview(null)}>
                    <img src={preview} alt="" className="max-w-full max-h-full object-contain" />
                    <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10"><X size={20} /></button>
                </div>
            )}
        </div>
    );
}

// @anchor mobile-chat-new-thread
// „Nowy wątek”: krok 1 — zamówienie z zespołów użytkownika (GET /comments/my-orders),
// krok 2 — węzeł WBS aktywnej wersji (GET /comments/order/:id/chat-nodes); przy jednym zamówieniu krok 1
// jest pomijany. Wątek powstaje
// z pierwszą wiadomością; węzeł z istniejącą rozmową otwiera ją (zamkniętą wznawia).
function MobileChatNewThread({ threads, onPick, onBack }) {
    const [orders, setOrders] = useState(null);
    const [order, setOrder] = useState(null);
    const [nodes, setNodes] = useState(null);
    const [nodeFilter, setNodeFilter] = useState('');
    const [globalFilter, setGlobalFilter] = useState('');
    // null = nie pobrano, undefined = w trakcie, [] = wynik
    const [allNodes, setAllNodes] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch(`${API_URL}/comments/my-orders`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
            .then(list => {
                setOrders(list);
                // Dostęp tylko do jednego zamówienia — krok wyboru nic nie wnosi, od razu jego gałęzie WBS
                if (list.length === 1) setOrder(list[0]);
            })
            .catch(() => { setOrders([]); setError('Nie udało się pobrać zamówień'); });
    }, []);

    useEffect(() => {
        if (!order) return;
        setNodes(null); setError(''); setNodeFilter('');
        fetch(`${API_URL}/comments/order/${order.id}/chat-nodes`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
            .then(setNodes)
            .catch(() => { setNodes([]); setError('Nie udało się pobrać elementów WBS'); });
    }, [order]);

    // Węzły ze wszystkich zamówień — dociągane przy pierwszym wpisaniu frazy w kroku 1.
    useEffect(() => {
        if (order || allNodes !== null || !globalFilter.trim()) return;
        setAllNodes(undefined);
        fetch(`${API_URL}/comments/my-chat-nodes`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
            .then(setAllNodes)
            .catch(() => { setAllNodes([]); setError('Nie udało się pobrać elementów WBS'); });
    }, [order, allNodes, globalFilter]);

    const existing = (orderId, wbsNodeId) => threads.find(t => t.orderId === orderId && t.wbsNodeId === wbsNodeId);
    const nameOf = (id) => nodes?.find(n => n.id === id)?.name || null;

    // Bez polskich znaków i wielkości liter — „wozek” znajdzie „WÓZEK WIDŁOWY”.
    const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
    const filtering = nodeFilter.trim().length > 0;
    const shownNodes = !nodes ? [] : filtering ? nodes.filter(n => norm(n.name).includes(norm(nodeFilter.trim()))) : nodes;
    const globalFiltering = !order && globalFilter.trim().length > 0;
    // Słowa frazy szukane w nazwie zamówienia i elementu — „durr” pokaże zamówienie DURR,
    // „durr wozek” wózki w DURR. Element musi trafić choć jednym słowem we własną nazwę.
    const tokens = norm(globalFilter).split(/\s+/).filter(Boolean);
    const orderHits = globalFiltering ? orders.filter(o => tokens.every(t => norm(o.name).includes(t))) : [];
    const globalHits = globalFiltering && Array.isArray(allNodes)
        ? allNodes.filter(n => {
            const nn = norm(n.name), on = norm(n.orderName);
            return tokens.every(t => nn.includes(t) || on.includes(t)) && tokens.some(t => nn.includes(t));
        })
        : [];

    // n: węzeł z kroku 2 (order z kontekstu) albo trafienie wyszukiwarki globalnej (orderId/orderName/parentName w węźle)
    const pick = (n) => {
        const orderId = n.orderId ?? order.id;
        const ex = existing(orderId, n.id);
        onPick(ex || {
            orderId,
            orderName: n.orderName ?? order.name,
            wbsNodeId: n.id,
            wbsNodeName: n.name,
            wbsParentName: n.orderId ? n.parentName : n.parentId ? nameOf(n.parentId) : null,
            status: 'ACTIVE',
        });
    };

    const searchBox = (value, setValue, placeholder) => (
        <div className="sticky top-0 z-10 bg-gray-950 pb-2 -mx-2 px-2 pt-0.5">
            <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                    type="text"
                    enterKeyHint="search"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-[16px] text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500/40"
                />
                {value && (
                    <button onClick={() => setValue('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500">
                        <X size={14} />
                    </button>
                )}
            </div>
        </div>
    );

    const badge = (ex) => ex && (
        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${ex.status === 'CLOSED' ? 'text-gray-500 bg-white/5' : 'text-blue-300 bg-blue-500/10'}`}>
            {ex.status === 'CLOSED' ? 'archiwum' : `${ex.total} wiad.`}
        </span>
    );

    const list = order ? nodes : orders;

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white">
            <header className="px-4 py-3 border-b border-white/5 bg-gray-900/50 backdrop-blur-xl flex items-center gap-3 shrink-0">
                <button onClick={() => (order && orders?.length > 1 ? setOrder(null) : onBack())} className="p-2 rounded-xl bg-white/5 active:scale-90 transition-transform shrink-0">
                    <ArrowLeft size={18} className="text-gray-400" />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm">Nowy wątek</div>
                    <div className="text-[10px] text-gray-500 truncate">{order ? order.name : 'Wybierz zamówienie'}</div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {error && <p className="text-red-400 text-xs px-2 py-2">{error}</p>}
                {list === null ? (
                    <div className="flex justify-center mt-10"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
                ) : list.length === 0 ? (
                    <p className="text-center text-gray-600 text-sm mt-10 px-6">
                        {order ? 'To zamówienie nie ma jeszcze struktury WBS' : 'Nie jesteś w zespole żadnego zamówienia'}
                    </p>
                ) : !order ? (
                    <div className="space-y-1">
                        {/* @anchor mobile-chat-global-node-filter — szukanie gałęzi/liścia we wszystkich zamówieniach od razu, przed wyborem zamówienia */}
                        {searchBox(globalFilter, setGlobalFilter, 'Szukaj gałęzi lub elementu WBS…')}
                        {(globalFiltering ? orderHits : orders).map(o => (
                            <button key={o.id} onClick={() => setOrder(o)} className="w-full flex items-center gap-2 px-3 py-3 rounded-xl bg-white/[0.03] border border-white/5 active:bg-white/10 text-left">
                                <span className="text-[13px] font-bold flex-1 min-w-0 truncate">{o.name}</span>
                                <ChevronRight size={16} className="text-gray-600 shrink-0" />
                            </button>
                        ))}
                        {!globalFiltering ? null : !Array.isArray(allNodes) ? (
                            <div className="flex justify-center mt-6"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
                        ) : globalHits.length === 0 ? (orderHits.length > 0 ? null :
                            <p className="text-center text-gray-600 text-sm mt-6">Brak elementów pasujących do „{globalFilter.trim()}”</p>
                        ) : globalHits.map(n => (
                            <button
                                key={`${n.orderId}|${n.id}`}
                                onClick={() => pick(n)}
                                className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl active:bg-white/10 text-left"
                            >
                                <span className="flex-1 min-w-0">
                                    <span className={`block text-[13px] uppercase break-words ${n.hasChildren ? 'font-bold text-gray-200' : 'text-gray-300'}`}>{n.name}</span>
                                    <span className="block text-[10px] text-gray-600 truncate">{[n.orderName, n.parentName].filter(Boolean).join(' › ')}</span>
                                </span>
                                {badge(existing(n.orderId, n.id))}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {/* @anchor mobile-chat-node-filter — filtr po nazwie elementu WBS; przy filtrze lista płaska z nazwą rodzica */}
                        {searchBox(nodeFilter, setNodeFilter, 'Szukaj elementu WBS…')}
                        {!filtering && <p className="text-[11px] text-gray-500 px-2 pb-2">Wybierz element WBS, którego dotyczy rozmowa</p>}
                        {filtering && shownNodes.length === 0 && <p className="text-center text-gray-600 text-sm mt-6">Brak elementów pasujących do „{nodeFilter.trim()}”</p>}
                        {shownNodes.map(n => {
                            const ex = existing(order.id, n.id);
                            const parent = filtering && n.parentId ? nameOf(n.parentId) : null;
                            return (
                                <button
                                    key={n.id}
                                    onClick={() => pick(n)}
                                    className="w-full flex items-center gap-2 py-2.5 pr-3 rounded-xl active:bg-white/10 text-left"
                                    style={{ paddingLeft: `${12 + (filtering ? 0 : n.depth) * 16}px` }}
                                >
                                    <span className="flex-1 min-w-0">
                                        <span className={`block text-[13px] uppercase break-words ${n.depth === 0 ? 'font-black text-gray-100' : n.hasChildren ? 'font-bold text-gray-300' : 'text-gray-400'}`}>{n.name}</span>
                                        {parent && <span className="block text-[10px] text-gray-600 truncate">{parent}</span>}
                                    </span>
                                    {badge(ex)}
                                </button>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}

// @anchor mobile-chat
// Widok „Czat” na telefonie: wątki czatu gałęzi WBS ze wszystkich zamówień użytkownika
// (GET /comments/my-threads), najświeższe na górze; zamknięte wątki pod przełącznikiem archiwum.
export default function MobileChat({ onBack }) {
    const [threads, setThreads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [open, setOpen] = useState(null);
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/comments/my-threads`, { headers: authHeaders() });
            if (!res.ok) throw new Error(String(res.status));
            setThreads(await res.json());
            setError('');
        } catch {
            setError('Nie udało się pobrać wątków');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open || creating) return;
        load();
        const id = setInterval(load, POLL_MS);
        return () => clearInterval(id);
    }, [load, open, creating]);

    // Wybranie węzła z wątkiem w archiwum wznawia go — jak „Nowy wątek w…” na desktopie.
    const openPicked = async (thread) => {
        let t = thread;
        if (t.status === 'CLOSED') {
            const res = await fetch(`${API_URL}/comments/order/${t.orderId}/threads/${encodeURIComponent(t.wbsNodeId)}`, {
                method: 'PATCH',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'ACTIVE' }),
            }).catch(() => null);
            if (res?.ok) t = { ...t, status: 'ACTIVE' };
        }
        setCreating(false);
        setOpen(t);
    };

    if (open) return <MobileChatConversation thread={open} onBack={() => setOpen(null)} />;
    if (creating) return <MobileChatNewThread threads={threads} onPick={openPicked} onBack={() => setCreating(false)} />;

    const archived = threads.filter(t => t.status === 'CLOSED');
    const visible = showArchived ? archived : threads.filter(t => t.status !== 'CLOSED');

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white">
            <header className="px-4 py-3 border-b border-white/5 bg-gray-900/50 backdrop-blur-xl flex items-center gap-3 shrink-0">
                <button onClick={onBack} className="p-2 rounded-xl bg-white/5 active:scale-90 transition-transform shrink-0">
                    <ArrowLeft size={18} className="text-gray-400" />
                </button>
                <span className="font-bold text-sm flex-1">Czat</span>
                {archived.length > 0 && (
                    <button onClick={() => setShowArchived(v => !v)} className={`text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-lg border ${showArchived ? 'border-amber-500/30 text-amber-300 bg-amber-500/10' : 'border-white/10 text-gray-500'}`}>
                        Archiwum ({archived.length})
                    </button>
                )}
                <button onClick={() => setCreating(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold active:scale-90 transition-transform">
                    <Plus size={14} /> Nowy
                </button>
            </header>

            <main className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {error && <p className="text-red-400 text-xs px-2 py-2">{error}</p>}
                {loading ? (
                    <div className="flex justify-center mt-10"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
                ) : visible.length === 0 ? (
                    <div className="flex flex-col items-center text-gray-600 mt-16 gap-2">
                        <MessageCircle size={28} />
                        <p className="text-sm">{showArchived ? 'Brak zamkniętych wątków' : 'Brak rozmów w Twoich zamówieniach'}</p>
                        {!showArchived && <p className="text-[11px] text-gray-700 px-8 text-center">Zacznij rozmowę przyciskiem „Nowy” u góry</p>}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {visible.map(t => (
                            <button
                                key={`${t.orderId}|${t.wbsNodeId}`}
                                onClick={() => setOpen(t)}
                                className="w-full text-left px-3 py-3 rounded-xl bg-white/[0.03] border border-white/5 active:bg-white/10 flex gap-3 items-start"
                            >
                                <div className="relative shrink-0 mt-0.5">
                                    <MessageCircle size={20} className={t.unread ? 'text-blue-400' : 'text-gray-600'} />
                                    {t.unread > 0 && (
                                        <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">{t.unread}</span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span className={`text-[13px] uppercase truncate flex-1 ${t.unread ? 'font-black text-white' : 'font-bold text-gray-200'}`}>{t.wbsNodeName}</span>
                                        <span className="text-[10px] text-gray-500 shrink-0">{fmtTime(t.last.at)}</span>
                                    </div>
                                    <div className="text-[10px] text-teal-500/80 truncate">{[t.orderName, t.wbsParentName].filter(Boolean).join(' › ')}</div>
                                    <div className={`text-[12px] truncate mt-0.5 ${t.unread ? 'text-gray-200' : 'text-gray-500'}`}>
                                        {t.last.mine ? 'Ty' : t.last.author}: {t.last.text || (t.last.images ? '📷 obrazek' : '')}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
