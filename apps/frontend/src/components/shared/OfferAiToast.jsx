import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X, AlertCircle } from 'lucide-react';
import { API_URL } from '../../config';

const TYPE = 'AI_OFFER_ANALYSIS';
const SHOWN_KEY = 'offerAiToastShown';
const POLL_MS = 15000;
// Toast tylko dla świeżych powiadomień — stare nieprzeczytane zostają w dzwonku.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

const readShown = () => {
    try { return new Set(JSON.parse(localStorage.getItem(SHOWN_KEY) || '[]')); } catch { return new Set(); }
};
const saveShown = (set) => {
    try { localStorage.setItem(SHOWN_KEY, JSON.stringify([...set].slice(-50))); } catch { /* brak miejsca — najwyżej toast pokaże się drugi raz */ }
};

// @anchor offer-ai-toast
// Globalny toast „Analiza AI oferty gotowa" — widoczny w całej aplikacji, niezależnie od
// tego, który projekt jest otwarty (analiza liczy się na serwerze, patrz
// `run-offer-budget-job`). Źródło: nieprzeczytane powiadomienia typu AI_OFFER_ANALYSIS.
// Pokazanie toastu odświeża też panel analizy i listę dokumentacji danego zamówienia.
export default function OfferAiToast() {
    const [toasts, setToasts] = useState([]);
    const shownRef = useRef(readShown());

    const poll = useCallback(async () => {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token || document.visibilityState === 'hidden') return;
        try {
            const res = await fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;
            const list = await res.json();
            const fresh = (Array.isArray(list) ? list : []).filter(n =>
                n.type === TYPE && !n.readAt && !shownRef.current.has(n.id)
                && Date.now() - new Date(n.createdAt).getTime() < MAX_AGE_MS);
            if (!fresh.length) return;
            fresh.forEach(n => {
                shownRef.current.add(n.id);
                window.dispatchEvent(new CustomEvent('offer-ai-analysis-finished', { detail: { nodeId: n.orderId } }));
                window.dispatchEvent(new CustomEvent('documents-changed', { detail: { nodeId: n.orderId } }));
            });
            saveShown(shownRef.current);
            setToasts(prev => [...fresh, ...prev].slice(0, 3));
        } catch { /* sieć — następne odpytanie */ }
    }, []);

    useEffect(() => {
        poll();
        const id = setInterval(poll, POLL_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    }, [poll]);

    const markRead = (id) => {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        fetch(`${API_URL}/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    };
    const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id));
    const open = (t) => {
        markRead(t.id);
        dismiss(t.id);
        // Ta sama droga co klik w push — MainLayout przełącza zamówienie i sekcję.
        window.dispatchEvent(new CustomEvent('push-navigate-order', { detail: { orderId: t.orderId, tab: 'unified', section: 'oferta' } }));
    };

    if (!toasts.length) return null;
    return (
        <div className="fixed z-[9995] bottom-4 right-4 flex flex-col gap-2" style={{ maxWidth: '340px' }}>
            {toasts.map(t => {
                const failed = /nieudana/i.test(t.title);
                return (
                    <div key={t.id} className={`rounded-xl border shadow-2xl overflow-hidden animate-fade-in ${failed ? 'border-red-500/30' : 'border-violet-500/30'}`}
                        style={{ background: 'rgba(15,15,20,0.96)', backdropFilter: 'blur(20px)' }}>
                        <div className="flex items-start gap-2.5 px-3.5 py-3">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${failed ? 'bg-red-500/15 border-red-500/25' : 'bg-violet-500/15 border-violet-500/25'}`}>
                                {failed ? <AlertCircle size={13} className="text-red-300" /> : <Sparkles size={13} className="text-violet-300" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-[12px] font-semibold leading-snug ${failed ? 'text-red-200' : 'text-violet-200'}`}>{t.title}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{t.body}</p>
                                {t.orderId && (
                                    <button onClick={() => open(t)}
                                        className="mt-2 px-2.5 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-[10px] font-bold uppercase tracking-widest text-violet-200">
                                        Przejdź do oferty
                                    </button>
                                )}
                            </div>
                            <button onClick={() => dismiss(t.id)} className="w-5 h-5 rounded-md bg-white/[0.04] hover:bg-white/[0.10] flex items-center justify-center flex-shrink-0">
                                <X size={10} className="text-gray-500" />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
