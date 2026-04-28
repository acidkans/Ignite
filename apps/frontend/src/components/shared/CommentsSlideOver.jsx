import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, MessageCircle, AlertCircle, CheckCircle, Zap, Hash, ChevronDown, AtSign, CornerUpLeft, Check, CheckCheck } from 'lucide-react';
import { API_URL } from '../../config';

const TYPE_CONFIG = {
    NOTE:     { label: 'Komentarz', color: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/20' },
    QUESTION: { label: 'Pytanie',   color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    RESOLVED: { label: 'Rozwiązane',color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
    URGENT:   { label: 'Pilne',     color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20' },
};

const TYPE_ICON = {
    NOTE:     <MessageCircle size={11} />,
    QUESTION: <AlertCircle size={11} />,
    RESOLVED: <CheckCircle size={11} />,
    URGENT:   <Zap size={11} />,
};

function getInitials(user) {
    return ((user?.firstName?.[0] || '') + (user?.lastName?.[0] || '')).toUpperCase() || '?';
}

function getRoleColor(roles) {
    const names = roles?.map(r => r.role?.name) || [];
    if (names.includes('ADMIN') || names.includes('MANAGER')) return 'bg-blue-500/20 text-blue-300';
    if (names.includes('LOGISTYK')) return 'bg-teal-500/20 text-teal-300';
    return 'bg-gray-500/20 text-gray-400';
}

function formatTime(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return 'przed chwilą';
    if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} godz. temu`;
    return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function userName(u) {
    return [u?.firstName, u?.lastName].filter(Boolean).join(' ') || 'Użytkownik';
}

export default function CommentsSlideOver({ orderId, orderName, requirements = [], onClose }) {
    const token = sessionStorage.getItem('token');
    const authHeaders = { Authorization: `Bearer ${token}` };
    const currentUserId = token ? (() => { try { return JSON.parse(atob(token.split('.')[1])).sub; } catch { return null; } })() : null;

    const [comments, setComments] = useState([]);
    const [text, setText] = useState('');
    const [type, setType] = useState('NOTE');
    const [requirementId, setRequirementId] = useState('');
    const [sending, setSending] = useState(false);
    const [filterReqId, setFilterReqId] = useState('');

    // Reply state
    const [replyTo, setReplyTo] = useState(null); // { id, text, user }

    // @ mention state
    const [users, setUsers] = useState([]);
    const [mentionedUsers, setMentionedUsers] = useState([]);
    const [mentionQuery, setMentionQuery] = useState(null);
    const [mentionAnchor, setMentionAnchor] = useState(0);
    const [mentionIndex, setMentionIndex] = useState(0);

    const textareaRef = useRef(null);
    const bottomRef = useRef(null);

    const load = useCallback(async () => {
        if (!orderId) return;
        const res = await fetch(`${API_URL}/comments/order/${orderId}`, { headers: authHeaders });
        if (res.ok) setComments(await res.json());
    }, [orderId]);

    // Oznacz cudze komentarze w tym zamówieniu jako przeczytane (idempotentne).
    // Wywoływane przy otwarciu i po każdym poll-fetchu, gdy slide-over jest otwarty.
    const markRead = useCallback(async () => {
        if (!orderId) return;
        try {
            await fetch(`${API_URL}/comments/order/${orderId}/mark-read`, { method: 'POST', headers: authHeaders });
        } catch { /* ignore */ }
    }, [orderId]);

    const loadUsers = useCallback(async () => {
        const res = await fetch(`${API_URL}/comments/users`, { headers: authHeaders });
        if (res.ok) setUsers(await res.json());
    }, []);

    useEffect(() => { (async () => { await load(); await markRead(); await load(); })(); loadUsers(); }, [load, loadUsers, markRead]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comments]);
    useEffect(() => {
        const id = setInterval(async () => { await load(); await markRead(); }, 15000);
        return () => clearInterval(id);
    }, [load, markRead]);

    const filteredMentions = mentionQuery !== null
        ? users.filter(u => userName(u).toLowerCase().includes(mentionQuery.toLowerCase()) && !mentionedUsers.find(m => m.id === u.id))
        : [];

    const handleTextChange = (e) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart;
        setText(val);
        const before = val.slice(0, cursor);
        const atMatch = before.match(/@(\w*)$/);
        if (atMatch) {
            setMentionQuery(atMatch[1]);
            setMentionAnchor(before.lastIndexOf('@'));
            setMentionIndex(0);
        } else {
            setMentionQuery(null);
        }
    };

    const insertMention = (user) => {
        const name = userName(user);
        const before = text.slice(0, mentionAnchor);
        const after = text.slice(textareaRef.current?.selectionStart || mentionAnchor + (mentionQuery?.length || 0) + 1);
        const newText = `${before}@${name} ${after}`;
        setText(newText);
        setMentionedUsers(prev => [...prev, { id: user.id, name }]);
        setMentionQuery(null);
        setTimeout(() => {
            const pos = before.length + name.length + 2;
            textareaRef.current?.setSelectionRange(pos, pos);
            textareaRef.current?.focus();
        }, 0);
    };

    const removeMention = (userId) => {
        setMentionedUsers(prev => prev.filter(m => m.id !== userId));
    };

    const handleKeyDown = (e) => {
        if (mentionQuery !== null && filteredMentions.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentions[mentionIndex]); return; }
            if (e.key === 'Escape') { setMentionQuery(null); return; }
        }
        if (e.key === 'Escape' && replyTo) { setReplyTo(null); return; }
        if (e.key === 'Enter' && !e.shiftKey && mentionQuery === null) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleReply = (comment) => {
        setReplyTo({ id: comment.id, text: comment.text, user: comment.user });
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const handleSend = async () => {
        if (!text.trim() || sending) return;
        setSending(true);
        const res = await fetch(`${API_URL}/comments/order/${orderId}`, {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text.trim(),
                type,
                requirementId: requirementId || undefined,
                mentionedUserIds: mentionedUsers.map(m => m.id),
                replyToId: replyTo?.id || undefined,
            }),
        });
        if (res.ok) {
            setText('');
            setType('NOTE');
            setRequirementId('');
            setMentionedUsers([]);
            setMentionQuery(null);
            setReplyTo(null);
            await load();
        }
        setSending(false);
    };

    const handleChangeType = async (commentId, newType) => {
        await fetch(`${API_URL}/comments/${commentId}/type`, {
            method: 'PATCH',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: newType }),
        });
        await load();
    };

    const handleDelete = async (commentId) => {
        await fetch(`${API_URL}/comments/${commentId}`, { method: 'DELETE', headers: authHeaders });
        await load();
    };

    const renderText = (txt) => {
        const parts = txt.split(/(@\w[\w\s]*)/g);
        return parts.map((p, i) =>
            p.startsWith('@')
                ? <span key={i} className="text-teal-400 font-semibold">{p}</span>
                : p
        );
    };

    const filtered = filterReqId ? comments.filter(c => c.requirementId === filterReqId) : comments;
    const openQuestions = comments.filter(c => c.type === 'QUESTION').length;

    return (
        <div className="fixed inset-y-0 right-0 w-[400px] z-50 flex flex-col bg-[#0d0f18] border-l border-white/10 shadow-2xl shadow-black/60 animate-slide-in-right">
            {/* Nagłówek */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/20 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <MessageCircle size={14} className="text-teal-400" />
                    <div>
                        <p className="text-xs font-bold text-white">Komunikacja</p>
                        <p className="text-[10px] text-gray-500 truncate max-w-[200px]">{orderName}</p>
                    </div>
                    {openQuestions > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[10px] font-semibold">
                            <AlertCircle size={9} /> {openQuestions} pytań
                        </span>
                    )}
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                    <X size={14} />
                </button>
            </div>

            {/* Filtr wymagania */}
            {requirements.length > 0 && (
                <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2 flex-shrink-0">
                    <Hash size={11} className="text-gray-500 shrink-0" />
                    <select value={filterReqId} onChange={e => setFilterReqId(e.target.value)}
                        className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-teal-500 cursor-pointer">
                        <option value="">Wszystkie komentarze</option>
                        {requirements.map(r => <option key={r.id} value={r.id}>{r.productName}</option>)}
                    </select>
                </div>
            )}

            {/* Lista komentarzy */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar">
                {filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                        <MessageCircle size={24} className="text-gray-700 mb-2" />
                        <p className="text-xs text-gray-600">Brak komentarzy</p>
                        <p className="text-[10px] text-gray-700 mt-1">Napisz pierwszą wiadomość poniżej</p>
                    </div>
                )}
                {filtered.map(c => {
                    const cfg = TYPE_CONFIG[c.type] || TYPE_CONFIG.NOTE;
                    const reqName = requirements.find(r => r.id === c.requirementId)?.productName;
                    return (
                        <div key={c.id} className={`rounded-xl border p-3 group ${cfg.bg} ${cfg.border}`}>
                            {/* Nagłówek komentarza */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${getRoleColor(c.user?.userRoles)}`}>
                                        {getInitials(c.user)}
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-semibold text-white leading-none">{userName(c.user)}</p>
                                        <p className="text-[9px] text-gray-600 mt-0.5">{formatTime(c.createdAt)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    {/* Przycisk Odpowiedz */}
                                    <button
                                        onClick={() => handleReply(c)}
                                        className="p-1 text-gray-600 hover:text-teal-400 transition-colors opacity-0 group-hover:opacity-100 rounded"
                                        title="Odpowiedz">
                                        <CornerUpLeft size={11} />
                                    </button>
                                    <div className="relative group/type">
                                        <button className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                                            {TYPE_ICON[c.type]} {cfg.label} <ChevronDown size={8} />
                                        </button>
                                        <div className="absolute right-0 top-full mt-1 hidden group-hover/type:flex flex-col bg-[#0c0e14] border border-white/10 rounded-xl shadow-2xl z-50 min-w-[120px] overflow-hidden p-1">
                                            {Object.entries(TYPE_CONFIG).map(([t, tcfg]) => (
                                                <button key={t} onClick={() => handleChangeType(c.id, t)}
                                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-semibold ${tcfg.color} hover:bg-white/5 transition-colors text-left`}>
                                                    {TYPE_ICON[t]} {tcfg.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {c.user?.id === currentUserId && (
                                        <button onClick={() => handleDelete(c.id)}
                                            className="p-1 text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 rounded">
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Tag wymagania */}
                            {reqName && (
                                <p className="text-[9px] text-teal-400/70 mb-1.5 flex items-center gap-1">
                                    <Hash size={8} /> {reqName}
                                </p>
                            )}

                            {/* Cytat odpowiedzi */}
                            {c.replyTo && (
                                <div className="mb-2 pl-2 border-l-2 border-white/20 bg-white/5 rounded-r-lg py-1 pr-2">
                                    <p className="text-[9px] text-gray-500 font-semibold mb-0.5">{userName(c.replyTo.user)}</p>
                                    <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
                                        {c.replyTo.text.length > 120 ? c.replyTo.text.slice(0, 120) + '…' : c.replyTo.text}
                                    </p>
                                </div>
                            )}

                            {/* Treść */}
                            <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">{renderText(c.text)}</p>

                            {/* Wskaźnik przeczytania — tylko dla własnych wiadomości */}
                            {c.user?.id === currentUserId && (() => {
                                const reads = (c.reads || []).filter(r => r.userId !== currentUserId);
                                const readByNames = reads.map(r => userName(r.user)).join(', ');
                                const tooltip = reads.length === 0
                                    ? 'Dostarczone — nikt jeszcze nie odczytał'
                                    : `Odczytane przez: ${readByNames}`;
                                return (
                                    <div className="flex items-center justify-end gap-1 mt-1.5 text-[9px]" title={tooltip}>
                                        {reads.length === 0
                                            ? <Check size={11} className="text-gray-500" />
                                            : <CheckCheck size={11} className="text-teal-400" />
                                        }
                                        {reads.length > 0 && (
                                            <span className="text-teal-400/80 truncate max-w-[200px]">{readByNames}</span>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Pole tekstowe */}
            <div className="border-t border-white/5 bg-black/20 p-3 flex-shrink-0 space-y-2">
                {/* Typ + oznaczenie wymagania */}
                <div className="flex items-center gap-2">
                    <select value={type} onChange={e => setType(e.target.value)}
                        className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-gray-300 focus:outline-none focus:border-teal-500 cursor-pointer">
                        {Object.entries(TYPE_CONFIG).map(([t, cfg]) => (
                            <option key={t} value={t}>{cfg.label}</option>
                        ))}
                    </select>
                    {requirements.length > 0 && (
                        <select value={requirementId} onChange={e => setRequirementId(e.target.value)}
                            className="flex-1 bg-[#0b0f17] border border-white/20 rounded-lg px-2 py-1 text-[10px] text-gray-200 focus:outline-none focus:border-teal-500 cursor-pointer">
                            <option value="">Bez powiązania</option>
                            {requirements.map(r => <option key={r.id} value={r.id}>{r.name || r.productName || r.id}</option>)}
                        </select>
                    )}
                </div>

                {/* Podgląd odpowiedzi */}
                {replyTo && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
                        <CornerUpLeft size={11} className="text-teal-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-[9px] text-teal-400 font-semibold">{userName(replyTo.user)}</p>
                            <p className="text-[10px] text-gray-400 truncate">{replyTo.text}</p>
                        </div>
                        <button onClick={() => setReplyTo(null)} className="text-gray-600 hover:text-white transition-colors shrink-0">
                            <X size={10} />
                        </button>
                    </div>
                )}

                {/* Oznaczeni użytkownicy */}
                {mentionedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {mentionedUsers.map(m => (
                            <span key={m.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[10px] font-semibold">
                                <AtSign size={8} /> {m.name}
                                <button onClick={() => removeMention(m.id)} className="text-teal-500 hover:text-white ml-0.5">
                                    <X size={8} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                {/* Textarea + autocomplete + wyślij */}
                <div className="relative">
                    {mentionQuery !== null && filteredMentions.length > 0 && (
                        <div className="absolute bottom-full mb-1 left-0 w-full bg-[#0c0e14] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden max-h-40 overflow-y-auto">
                            {filteredMentions.map((u, i) => (
                                <button key={u.id} onClick={() => insertMention(u)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${i === mentionIndex ? 'bg-teal-500/15 text-white' : 'text-gray-300 hover:bg-white/5'}`}>
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 ${getRoleColor(u.userRoles)}`}>
                                        {getInitials(u)}
                                    </div>
                                    <span className="text-xs font-medium">{userName(u)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-2 items-end">
                        <textarea
                            ref={textareaRef}
                            value={text}
                            onChange={handleTextChange}
                            onKeyDown={handleKeyDown}
                            placeholder={replyTo ? `Odpowiedz ${userName(replyTo.user)}…` : 'Napisz komentarz… wpisz @ aby oznaczyć'}
                            rows={2}
                            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-teal-500 resize-none custom-scrollbar"
                        />
                        <button onClick={handleSend} disabled={!text.trim() || sending}
                            className="p-2.5 rounded-xl bg-teal-600/20 border border-teal-500/30 text-teal-400 hover:bg-teal-600/30 disabled:opacity-40 transition-all">
                            <Send size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
