import React, { useState } from 'react';
import { Mail, X, Loader2, RefreshCw, Check, AlertTriangle, Sparkles, ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import AutoResizeTextarea from './AutoResizeTextarea';

const API_URL = '/api';
const authJson = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}`, 'Content-Type': 'application/json' });
const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const post = async (url, body) => {
    const r = await fetch(`${API_URL}${url}`, { method: 'POST', headers: authJson(), body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
    return j;
};

// @anchor qa-mail-reply-card
// Jedna odpowiedź klienta: treść maila (zwijana) i propozycje AI do poprawienia. „Wpisz do Q&A”
// przekazuje zaznaczone, niepuste odpowiedzi do `onApply` i oznacza mail jako obsłużony.
function ReplyCard({ reply, currentAnswer, onApply, onChanged }) {
    const [rows, setRows] = useState(() => (reply.proposals || []).map(p => ({ ...p, use: !!String(p.answer || '').trim() })));
    const [showText, setShowText] = useState(!(reply.proposals || []).some(p => String(p.answer || '').trim()));
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const multiNode = new Set(rows.map(r => r.wbsNodeId)).size > 1;

    const run = async (what, fn) => {
        setBusy(what); setError(null);
        try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(null); }
    };
    const apply = () => run('apply', async () => {
        const picked = rows.filter(r => r.use && String(r.answer || '').trim());
        if (!picked.length) throw new Error('Zaznacz co najmniej jedną odpowiedź albo pomiń mail.');
        const missing = onApply(reply, picked);
        await post(`/qa-mail/replies/${reply.id}/resolve`, { status: 'DONE' });
        if (missing) setError(`Nie znaleziono w Q&A: ${missing} — pytanie mogło zostać usunięte.`);
        onChanged();
    });
    const ignore = () => run('ignore', async () => { await post(`/qa-mail/replies/${reply.id}/resolve`, { status: 'IGNORED' }); onChanged(); });
    const reanalyze = () => run('ai', async () => {
        const r = await post(`/qa-mail/replies/${reply.id}/analyze`);
        const next = JSON.parse(r.proposals || '[]');
        setRows(next.map(p => ({ ...p, use: !!String(p.answer || '').trim() })));
        if (r.aiError) setError(`AI: ${r.aiError}`);
    });

    return (
        <div className="rounded-lg border border-sky-400/30 bg-sky-500/[0.04]">
            <div className="flex items-start gap-2 px-3 py-2 border-b border-sky-400/15">
                <Mail size={14} className="text-sky-300 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="text-gray-200">{reply.fromName ? `${reply.fromName} ` : ''}<span className="text-gray-500 text-[13px]">&lt;{reply.fromEmail}&gt;</span></div>
                    <div className="text-[13px] text-gray-500 truncate" title={reply.subject}>{fmtDateTime(reply.receivedAt)} · {reply.subject}</div>
                </div>
                <button onClick={() => setShowText(v => !v)} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[13px] text-gray-400 hover:text-white hover:bg-white/10 shrink-0">
                    {showText ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Treść maila
                </button>
            </div>
            {showText && (
                <pre className="mx-3 mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[13px] text-gray-300 bg-black/30 rounded px-2 py-1.5">{reply.text || '(pusta treść)'}</pre>
            )}
            {reply.aiError && !error && (
                <div className="mx-3 mt-2 flex items-start gap-1.5 text-amber-300 text-[13px]"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> AI nie podpowiedziało odpowiedzi — przepisz je z treści maila. ({reply.aiError})</div>
            )}
            <div className="px-3 py-2 flex flex-col gap-2">
                {rows.map((r, i) => {
                    const cur = currentAnswer(r.wbsNodeId, r.qaId, r.question);
                    return (
                        <div key={`${r.wbsNodeId}-${r.qaId}`} className="flex items-start gap-2">
                            <input type="checkbox" className="accent-sky-500 mt-1.5" checked={r.use} onChange={() => setRows(rs => rs.map((x, j) => j === i ? { ...x, use: !x.use } : x))} />
                            <div className="min-w-0 flex-1">
                                <div className="text-[14px] text-gray-300">
                                    {multiNode && r.nodeName && <span className="font-semibold">{r.nodeName}: </span>}
                                    {r.question}
                                </div>
                                {cur && <div className="text-[12px] text-gray-500">Obecnie w Q&A: {cur}</div>}
                                <AutoResizeTextarea
                                    value={r.answer || ''}
                                    onChange={e => { const v = e.target.value; setRows(rs => rs.map((x, j) => j === i ? { ...x, answer: v, use: !!v.trim() } : x)); }}
                                    placeholder="Odpowiedź klienta…"
                                    className="mt-0.5 w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-[14px] placeholder-gray-600 focus:outline-none focus:border-sky-400/50 resize-none"
                                />
                            </div>
                        </div>
                    );
                })}
                {error && <div className="text-red-300 text-[13px]">{error}</div>}
                <div className="flex items-center gap-2 pt-1">
                    <button onClick={reanalyze} disabled={!!busy} className="flex items-center gap-1 px-2 py-1 rounded text-[13px] text-violet-300 hover:bg-violet-500/15 disabled:opacity-40" title="Jeszcze raz poproś AI o dopasowanie odpowiedzi">
                        {busy === 'ai' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Podpowiedz AI
                    </button>
                    <button onClick={ignore} disabled={!!busy} className="ml-auto px-2 py-1 rounded text-[13px] text-gray-400 hover:bg-white/10 disabled:opacity-40">Pomiń mail</button>
                    <button onClick={apply} disabled={!!busy} className="flex items-center gap-1 px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[13px] disabled:opacity-40">
                        {busy === 'apply' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Wpisz do Q&A
                    </button>
                </div>
            </div>
        </div>
    );
}

// @anchor qa-mail-replies-modal
// Odpowiedzi klientów na maile z pytaniami (GET /qa-mail/replies/:processNodeId). Nowe na górze
// z propozycjami AI do zatwierdzenia; obsłużone zwinięte, z możliwością przywrócenia.
// `onApply(reply, rows)` wpisuje odpowiedzi do Q&A i zwraca liczbę pytań, których nie znaleziono.
export default function QaMailRepliesModal({ processNodeId, replies, loading, onReload, onApply, currentAnswer, onClose }) {
    const [checking, setChecking] = useState(false);
    const [info, setInfo] = useState(null);
    const [showDone, setShowDone] = useState(false);
    const pending = (replies || []).filter(r => r.status === 'NEW');
    const handled = (replies || []).filter(r => r.status !== 'NEW');

    const check = async () => {
        setChecking(true); setInfo(null);
        try {
            const r = await post('/qa-mail/replies/check', { processNodeId });
            setInfo(r.errors?.length ? `Błąd skrzynki: ${r.errors.join('; ')}` : r.found ? `Nowe odpowiedzi: ${r.found}` : 'Brak nowych odpowiedzi.');
            await onReload();
        } catch (e) {
            setInfo(e.message);
        } finally {
            setChecking(false);
        }
    };
    const restore = async (id) => { await post(`/qa-mail/replies/${id}/resolve`, { status: 'NEW' }).catch(() => {}); onReload(); };

    return (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center p-0 md:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full h-full md:h-auto md:max-w-3xl md:max-h-[92vh] flex flex-col md:rounded-2xl border-0 md:border-2 border-sky-400/60 bg-[#06111a] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-5 py-4 border-b border-sky-400/20 shrink-0">
                    <p className="text-[12px] uppercase tracking-widest text-sky-300 font-bold flex items-center gap-1.5"><Mail size={13} /> Odpowiedzi klienta z maila</p>
                    <button onClick={check} disabled={checking} className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[13px] text-sky-300 hover:bg-sky-500/15 disabled:opacity-40" title="Przejrzyj teraz skrzynki, z których wysłano pytania">
                        {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sprawdź pocztę
                    </button>
                    <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white" title="Zamknij"><X size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 text-[15px] text-gray-200">
                    {info && <div className="text-[13px] text-gray-400">{info}</div>}
                    {loading && !replies && <div className="flex items-center gap-2 text-gray-400"><Loader2 size={14} className="animate-spin" /> Wczytuję…</div>}
                    {replies && pending.length === 0 && <div className="text-gray-500">Brak odpowiedzi do przejrzenia. Poczta sprawdza się sama co kilka minut.</div>}
                    {pending.map(r => (
                        <ReplyCard key={r.id} reply={r} currentAnswer={currentAnswer} onApply={onApply} onChanged={onReload} />
                    ))}
                    {handled.length > 0 && (
                        <div>
                            <button onClick={() => setShowDone(v => !v)} className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-300">
                                {showDone ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Obsłużone ({handled.length})
                            </button>
                            {showDone && (
                                <div className="mt-1 flex flex-col gap-1">
                                    {handled.map(r => (
                                        <div key={r.id} className="flex items-center gap-2 text-[13px] text-gray-400">
                                            <span className={r.status === 'IGNORED' ? 'text-gray-600' : 'text-emerald-400'}>{r.status === 'IGNORED' ? 'pominięte' : (r.proposals || []).some(p => p.applied) ? 'wpisane przez AI' : 'wpisane'}</span>
                                            <span className="truncate">{fmtDateTime(r.receivedAt)} · {r.fromEmail} · {r.subject}</span>
                                            <button onClick={() => restore(r.id)} className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/10 hover:text-white shrink-0" title="Przywróć do przejrzenia"><Undo2 size={12} /> Przywróć</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
