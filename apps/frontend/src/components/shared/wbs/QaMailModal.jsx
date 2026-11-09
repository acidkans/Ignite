import React, { useEffect, useMemo, useState } from 'react';
import { Mail, X, Loader2, Send, AlertTriangle, Check } from 'lucide-react';
import AutoResizeTextarea from './AutoResizeTextarea';

const API_URL = '/api';
const authJson = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}`, 'Content-Type': 'application/json' });
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }); } catch { return ''; } };

// @anchor qa-mail-lang-texts — podgląd stałych tekstów maila; te same co `QA_MAIL_TEXTS` w qa-mail.service.ts.
const MAIL_TEXTS = {
    pl: { greeting: 'Dzień dobry,', intro: (o) => `w związku z zamówieniem „${o}” prosimy o odpowiedź na poniższe pytania.` },
    en: { greeting: 'Hello,', intro: (o) => `With regard to the order "${o}", we kindly ask you to answer the questions below.` },
};
const LANG_KEY = 'qaMailLang';
const readLang = () => { try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'pl'; } catch { return 'pl'; } };

// @anchor qa-mail-modal
// Wysyłka pytań z Q&A mailem do klienta (POST /qa-mail/send) ze skrzynki firmowej użytkownika
// w domenie zamówienia. `questions` = [{ wbsNodeId, nodeName, pair }] — otwarte pytania węzła/gałęzi;
// domyślnie zaznaczone te, których jeszcze nie wysłano. `onSent(result)` dostaje { mail, nodes }.
// @anchor qa-mail-no-preselect — `noPreselect` (Kokpit realizacji): start bez zaznaczeń, użytkownik sam wybiera pytania.
export default function QaMailModal({ processNodeId, title, questions, onClose, onSent, noPreselect = false }) {
    const [ctx, setCtx] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [picked, setPicked] = useState(() => new Set(noPreselect ? [] : questions.filter(q => !q.pair.mailId).map(q => q.pair.id)));
    const [toSel, setToSel] = useState(() => new Set());
    const [toExtra, setToExtra] = useState('');
    const [cc, setCc] = useState('');
    const [intro, setIntro] = useState('');
    // @anchor qa-mail-lang — język stałych tekstów maila (temat, powitanie, zamknięcie); pytania idą tak, jak wpisano.
    const [lang, setLang] = useState(readLang);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null);

    useEffect(() => {
        let alive = true;
        fetch(`${API_URL}/qa-mail/order/${processNodeId}`, { headers: authJson() })
            .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`); return j; })
            .then(j => {
                if (!alive) return;
                setCtx(j);
                setIntro(MAIL_TEXTS[readLang()].intro(j.orderName));
                // Domyślnie adresaci ostatniego maila z pytaniami, inaczej pierwszy kontakt.
                const last = j.mails?.[0]?.toEmails || [];
                const known = new Set((j.recipients || []).map(r => r.email));
                const pre = last.filter(e => known.has(e));
                setToSel(new Set(pre.length ? pre : (j.recipients?.[0] ? [j.recipients[0].email] : [])));
                const extra = last.filter(e => !known.has(e));
                if (extra.length) setToExtra(extra.join(', '));
            })
            .catch(e => alive && setLoadError(e.message));
        return () => { alive = false; };
    }, [processNodeId]);

    const multiNode = useMemo(() => new Set(questions.map(q => q.wbsNodeId)).size > 1, [questions]);
    // Zmiana języka podmienia wstęp tylko, gdy to wciąż domyślny tekst — własnego wstępu nie ruszamy.
    const changeLang = (next) => {
        if (next === lang) return;
        if (ctx && intro.trim() === MAIL_TEXTS[lang].intro(ctx.orderName)) setIntro(MAIL_TEXTS[next].intro(ctx.orderName));
        setLang(next);
        try { localStorage.setItem(LANG_KEY, next); } catch { /* bez pamięci wyboru */ }
    };
    const toggle = (set, setter, key) => setter(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

    const send = async () => {
        if (sending) return;
        setError(null);
        const to = [...toSel, ...toExtra.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)];
        if (!to.length) { setError('Wybierz albo wpisz co najmniej jednego odbiorcę.'); return; }
        const qs = questions.filter(q => picked.has(q.pair.id)).map(q => ({ wbsNodeId: q.wbsNodeId, qaId: q.pair.id, question: q.pair.question }));
        if (!qs.length) { setError('Zaznacz co najmniej jedno pytanie.'); return; }
        setSending(true);
        try {
            const r = await fetch(`${API_URL}/qa-mail/send`, {
                method: 'POST', headers: authJson(),
                body: JSON.stringify({ processNodeId, to, cc, intro, lang, questions: qs }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
            onSent?.(j);
            setDone(j.mail);
        } catch (e) {
            setError(e.message);
        } finally {
            setSending(false);
        }
    };

    const sender = ctx?.sender;
    const blocked = !!loadError || (ctx && !sender);

    return (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center p-0 md:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full h-full md:h-auto md:max-w-2xl md:max-h-[92vh] flex flex-col md:rounded-2xl border-0 md:border-2 border-sky-400/60 bg-[#06111a] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-sky-400/20 shrink-0">
                    <div className="min-w-0">
                        <p className="text-[12px] uppercase tracking-widest text-sky-300 font-bold flex items-center gap-1.5"><Mail size={13} /> Pytania do klienta mailem</p>
                        <p className="text-[15px] text-gray-300 truncate">{title}</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white" title="Zamknij"><X size={16} /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 text-[15px] text-gray-200">
                    {!ctx && !loadError && <div className="flex items-center gap-2 text-gray-400"><Loader2 size={14} className="animate-spin" /> Wczytuję…</div>}
                    {loadError && <div className="text-red-300">Nie udało się wczytać danych: {loadError}</div>}

                    {done ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-emerald-300"><Check size={16} /> Wysłano {done.items.length === 1 ? '1 pytanie' : `${done.items.length} pytań`} do {done.toEmails.join(', ')}.</div>
                            <div className="text-gray-400 text-[13px]">Temat: {done.subject}</div>
                            {done.sentCopyError && (
                                <div className="flex items-start gap-1.5 text-amber-300 text-[13px]"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> Mail poszedł, ale bez kopii w „Wysłanych”: {done.sentCopyError}</div>
                            )}
                        </div>
                    ) : ctx && (
                        <>
                            <div>
                                <div className="text-[12px] uppercase tracking-wider text-gray-500 mb-1">Od</div>
                                {sender ? (
                                    <div>
                                        {sender.name} &lt;{sender.email}&gt;
                                        {!sender.sentFolder && <div className="text-amber-300 text-[13px] mt-0.5">Skrzynka nieprzetestowana — mail pójdzie, ale bez kopii w „Wysłanych” (przetestuj ją w „Moim koncie”).</div>}
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-1.5 text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {ctx.senderError}</div>
                                )}
                            </div>

                            <div>
                                <div className="text-[12px] uppercase tracking-wider text-gray-500 mb-1">Do</div>
                                {ctx.recipients.length > 0 ? (
                                    <div className="flex flex-col gap-1 mb-1.5">
                                        {ctx.recipients.map(r => (
                                            <label key={r.email} className="flex items-center gap-2 cursor-pointer select-none">
                                                <input type="checkbox" className="accent-sky-500" checked={toSel.has(r.email)} onChange={() => toggle(toSel, setToSel, r.email)} />
                                                <span>{r.name || r.email}</span>
                                                {r.name && <span className="text-gray-500 text-[13px]">{r.email}</span>}
                                                {(r.role || r.company) && <span className="text-gray-600 text-[13px]">· {[r.role, r.company].filter(Boolean).join(', ')}</span>}
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-gray-500 text-[13px] mb-1.5">Brak kontaktów klienta w „Informacjach o zamówieniu” — wpisz adres poniżej.</div>
                                )}
                                <input value={toExtra} onChange={e => setToExtra(e.target.value)} placeholder="Inne adresy (po przecinku)…"
                                    className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 placeholder-gray-600 focus:outline-none focus:border-sky-400/50" />
                            </div>

                            <div>
                                <div className="text-[12px] uppercase tracking-wider text-gray-500 mb-1">DW</div>
                                <input value={cc} onChange={e => setCc(e.target.value)} placeholder="Do wiadomości (po przecinku)…"
                                    className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 placeholder-gray-600 focus:outline-none focus:border-sky-400/50" />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <div className="text-[12px] uppercase tracking-wider text-gray-500">Treść</div>
                                    <div className="flex rounded border border-white/10 overflow-hidden text-[12px]" title="Język maila — pytania zostają tak, jak je wpisano">
                                        {[['pl', 'Polski'], ['en', 'English']].map(([k, l]) => (
                                            <button key={k} type="button" onClick={() => changeLang(k)}
                                                className={`px-2 py-0.5 ${lang === k ? 'bg-sky-600 text-white' : 'text-gray-400 hover:bg-white/10'}`}>{l}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="text-gray-400 text-[13px] mb-1">{MAIL_TEXTS[lang].greeting}</div>
                                <AutoResizeTextarea value={intro} onChange={e => setIntro(e.target.value)}
                                    className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 focus:outline-none focus:border-sky-400/50 resize-none" />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <div className="text-[12px] uppercase tracking-wider text-gray-500">Pytania ({picked.size}/{questions.length})</div>
                                    {noPreselect && questions.length > 0 && (
                                        <button type="button" onClick={() => setPicked(picked.size === questions.length ? new Set() : new Set(questions.map(q => q.pair.id)))}
                                            className="px-2 py-0.5 rounded border border-white/10 text-[12px] text-gray-400 hover:bg-white/10">
                                            {picked.size === questions.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                                        </button>
                                    )}
                                </div>
                                {questions.length === 0 && <div className="text-gray-500">Brak pytań bez odpowiedzi.</div>}
                                <div className="flex flex-col gap-1">
                                    {questions.map(q => (
                                        <label key={q.pair.id} className="flex items-start gap-2 cursor-pointer select-none">
                                            <input type="checkbox" className="accent-sky-500 mt-1" checked={picked.has(q.pair.id)} onChange={() => toggle(picked, setPicked, q.pair.id)} />
                                            <span className="min-w-0">
                                                {multiNode && <span className="font-semibold text-gray-300">{q.nodeName}: </span>}
                                                {q.pair.question}
                                                {String(q.pair.answer || '').trim() && <span className="ml-1.5 text-emerald-300/70 text-[12px]" title={q.pair.answer}>ma odpowiedź</span>}
                                                {q.pair.mailSentAt && <span className="ml-1.5 inline-flex items-center gap-1 text-sky-300/70 text-[12px]" title={`Wysłane do ${q.pair.mailTo || ''}`}><Mail size={11} /> wysłane {fmtDate(q.pair.mailSentAt)}</span>}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="text-gray-500 text-[13px]">Na końcu tematu pojawi się „Ref number [IGN-…]” — po nim Ignite rozpozna odpowiedź klienta.{sender?.hasSignature ? ' Podpis skrzynki zostanie doklejony.' : ''}</div>
                        </>
                    )}
                    {error && <div className="text-red-300">{error}</div>}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-sky-400/20 shrink-0">
                    <button onClick={onClose} className="px-3 py-1.5 rounded text-gray-300 hover:bg-white/10">{done ? 'Zamknij' : 'Anuluj'}</button>
                    {!done && (
                        <button onClick={send} disabled={sending || blocked || !ctx}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 disabled:cursor-not-allowed">
                            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Wyślij
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
