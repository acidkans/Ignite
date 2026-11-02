import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Inbox, X, HelpCircle } from 'lucide-react';
import { API_URL } from '../../../config';

const POLL_MS = 60_000;
const authJson = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

// @anchor qa-mail-auto-notice
// Popup „Dodano odpowiedzi z maila”: maile, z których AI samo wpisało odpowiedzi do Q&A (status AUTO,
// `qa-mail-replies-auto-apply`). Zostaje otwarty, aż użytkownik go zamknie albo kliknie „Otwórz Q&A” —
// oba potwierdzają maile (status DONE). `onOpenQa(replyIds)` otwiera Q&A z nowymi odpowiedziami na zielono.
export default function QaMailAutoNotice({ processNodeId, onOpenQa }) {
    const [autoReplies, setAutoReplies] = useState([]);
    const seenRef = useRef(null); // id maili AUTO już widzianych; null = jeszcze nie było odczytu

    const load = useCallback(async () => {
        if (!processNodeId) return;
        try {
            const r = await fetch(`${API_URL}/qa-mail/replies/${processNodeId}`, { headers: authJson() });
            if (!r.ok) return;
            const list = (await r.json()).filter(x => x.status === 'AUTO');
            // Wpis AI w trakcie pracy → drzewo WBS na ekranie ma stare Q&A; przeładuj (nie przy pierwszym odczycie).
            if (seenRef.current && list.some(x => !seenRef.current.has(x.id))) window.dispatchEvent(new CustomEvent('wbs-qa-imported'));
            seenRef.current = new Set([...(seenRef.current || []), ...list.map(x => x.id)]);
            setAutoReplies(list);
        } catch { /* offline — spróbuj przy następnym przebiegu */ }
    }, [processNodeId]);

    useEffect(() => {
        load();
        const t = setInterval(load, POLL_MS);
        return () => clearInterval(t);
    }, [load]);

    if (!autoReplies.length) return null;

    const answers = autoReplies.flatMap(r => (r.proposals || []).filter(p => p.applied));
    const acknowledge = () => {
        const ids = autoReplies.map(r => r.id);
        setAutoReplies([]);
        ids.forEach(id => fetch(`${API_URL}/qa-mail/replies/${id}/resolve`, { method: 'POST', headers: authJson(), body: JSON.stringify({ status: 'DONE' }) }).catch(() => {}));
        return ids;
    };

    return (
        <div className="fixed bottom-4 right-4 z-[10040] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border-2 border-emerald-400/60 bg-[#06140f] shadow-2xl">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-400/20">
                <Inbox size={15} className="text-emerald-300 shrink-0" />
                <p className="flex-1 text-sm font-bold text-emerald-200">Dodano odpowiedzi z maila</p>
                <button onClick={acknowledge} className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white" title="Zamknij"><X size={15} /></button>
            </div>
            <div className="px-4 py-3 text-[13px] text-gray-300 space-y-2">
                <p>
                    AI wpisało {answers.length} {answers.length === 1 ? 'odpowiedź' : 'odpowiedzi'} do Q&A
                    {' '}z {autoReplies.length === 1 ? `maila od ${autoReplies[0].fromName || autoReplies[0].fromEmail}` : `${autoReplies.length} maili`}.
                </p>
                <ul className="max-h-48 overflow-y-auto space-y-1.5">
                    {answers.slice(0, 8).map((p, i) => (
                        <li key={`${p.wbsNodeId}-${p.qaId}-${i}`} className="leading-snug">
                            <span className="text-gray-400">{p.question}</span>
                            <span className="block text-emerald-300">{p.answer}</span>
                        </li>
                    ))}
                    {answers.length > 8 && <li className="text-gray-500">…i {answers.length - 8} więcej</li>}
                </ul>
                <div className="flex justify-end pt-1">
                    <button onClick={() => onOpenQa(acknowledge())} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-bold">
                        <HelpCircle size={13} /> Otwórz Q&A
                    </button>
                </div>
            </div>
        </div>
    );
}
