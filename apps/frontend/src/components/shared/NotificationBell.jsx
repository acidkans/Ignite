import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, MessageCircle, AlertCircle, Check, X, BellOff, BellRing, Lock, ExternalLink } from 'lucide-react';
import { API_URL } from '../../config';

const TYPE_ICON = {
    NEW_COMMENT:  <MessageCircle size={11} className="text-teal-400" />,
    NEW_QUESTION: <AlertCircle size={11} className="text-yellow-400" />,
    NEW_MENTION:  <MessageCircle size={11} className="text-purple-400" />,
};

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function formatTime(iso) {
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return 'przed chwilą';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} godz.`;
    return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

export default function NotificationBell({ onNavigateToOrder, onNewUnread }) {
    const token = sessionStorage.getItem('token');
    const authHeaders = { Authorization: `Bearer ${token}` };

    const [notifications, setNotifications] = useState([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const prevUnreadRef = useRef(null);
    const [pushPermission, setPushPermission] = useState(() =>
        'Notification' in window ? Notification.permission : 'unsupported'
    );
    const [pushLoading, setPushLoading] = useState(false);
    const [showUnblockModal, setShowUnblockModal] = useState(false);

    // Wykryj przeglądarkę
    const isEdge = navigator.userAgent.includes('Edg/');
    const isChrome = !isEdge && navigator.userAgent.includes('Chrome');
    const browserName = isEdge ? 'Edge' : isChrome ? 'Chrome' : 'przeglądarce';
    const ref = useRef(null);

    const loadCount = useCallback(async () => {
        const res = await fetch(`${API_URL}/notifications/unread-count`, { headers: authHeaders });
        if (res.ok) {
            const next = await res.json();
            setUnread(next);
            const prev = prevUnreadRef.current;
            if (prev !== null && next > prev) onNewUnread?.();
            prevUnreadRef.current = next;
        }
    }, [onNewUnread]);

    const loadAll = useCallback(async () => {
        const res = await fetch(`${API_URL}/notifications`, { headers: authHeaders });
        if (res.ok) setNotifications(await res.json());
    }, []);

    // Polling co 30s
    useEffect(() => {
        loadCount();
        const id = setInterval(loadCount, 30000);
        return () => clearInterval(id);
    }, [loadCount]);

    useEffect(() => {
        if (open) loadAll();
    }, [open, loadAll]);

    // Zamknij po kliknięciu poza
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const markAllRead = async () => {
        await fetch(`${API_URL}/notifications/read-all`, { method: 'PATCH', headers: authHeaders });
        setUnread(0);
        setNotifications(prev => prev.map(n => ({ ...n, readAt: new Date().toISOString() })));
    };

    const handleClick = async (n) => {
        if (!n.readAt) {
            await fetch(`${API_URL}/notifications/${n.id}/read`, { method: 'PATCH', headers: authHeaders });
            setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x));
            setUnread(prev => Math.max(0, prev - 1));
        }
        if (n.orderId && onNavigateToOrder) {
            onNavigateToOrder(n.orderId, n.requirementId || null);
            setOpen(false);
        }
    };

    const handleEnablePush = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        setPushLoading(true);
        try {
            const permission = await Notification.requestPermission();
            setPushPermission(permission);
            if (permission !== 'granted') return;

            const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            await navigator.serviceWorker.ready;

            const keyRes = await fetch(`${API_URL}/push/vapid-public-key`, { headers: authHeaders });
            if (!keyRes.ok) return;
            const { publicKey } = await keyRes.json();

            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey),
                });
            }

            const { endpoint, keys } = sub.toJSON();
            await fetch(`${API_URL}/push/subscribe`, {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
            });
        } catch (err) {
            console.warn('[Push] Błąd rejestracji:', err);
        } finally {
            setPushLoading(false);
        }
    };

    // Modal odblokowania
    const UnblockModal = () => (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowUnblockModal(false)}>
            <div className="relative bg-[#0d0f18] border border-white/10 rounded-2xl shadow-2xl w-[440px] max-w-[90vw] p-6" onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowUnblockModal(false)} className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors">
                    <X size={16} />
                </button>

                <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                        <BellOff size={16} className="text-red-400" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">Odblokuj powiadomienia push</p>
                        <p className="text-[11px] text-gray-500">{browserName}</p>
                    </div>
                </div>

                <ol className="space-y-3">
                    <li className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-white/10 text-[10px] font-bold text-gray-300 flex items-center justify-center shrink-0 mt-0.5">1</span>
                        <div>
                            <p className="text-xs text-gray-200 font-medium">Kliknij ikonę kłódki w pasku adresu</p>
                            <div className="mt-1.5 flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 w-fit">
                                <Lock size={11} className="text-gray-400" />
                                <span className="text-[10px] text-gray-400 font-mono">{window.location.host}</span>
                            </div>
                        </div>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-white/10 text-[10px] font-bold text-gray-300 flex items-center justify-center shrink-0 mt-0.5">2</span>
                        <div>
                            <p className="text-xs text-gray-200 font-medium">Znajdź pozycję <span className="text-white font-bold">„Powiadomienia"</span></p>
                            <p className="text-[10px] text-gray-500 mt-0.5">W menu uprawnień strony zmień z <span className="text-red-400">Blokuj</span> na <span className="text-green-400">Zezwalaj</span></p>
                        </div>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-white/10 text-[10px] font-bold text-gray-300 flex items-center justify-center shrink-0 mt-0.5">3</span>
                        <div>
                            <p className="text-xs text-gray-200 font-medium">Odśwież stronę</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">Przeglądarka zapyta o zgodę ponownie</p>
                        </div>
                    </li>
                </ol>

                {(isChrome || isEdge) && (
                    <a
                        href={isEdge ? 'edge://settings/content/notifications' : 'chrome://settings/content/notifications'}
                        target="_blank" rel="noreferrer"
                        className="mt-5 flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-gray-400 hover:text-white transition-colors">
                        <ExternalLink size={11} />
                        Otwórz ustawienia powiadomień {browserName}
                    </a>
                )}
            </div>
        </div>
    );

    const handleTestPush = async () => {
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/push/test`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    };

    return (
        <>
        {showUnblockModal && <UnblockModal />}
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(v => !v)}
                className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Powiadomienia">
                <Bell size={16} />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute bottom-full mb-2 left-0 w-[320px] bg-[#0d0f18] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
                    {/* Nagłówek */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                        <p className="text-xs font-bold text-white">Powiadomienia</p>
                        <div className="flex items-center gap-1">
                            {unread > 0 && (
                                <button onClick={markAllRead}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                                    <Check size={10} /> Oznacz wszystkie
                                </button>
                            )}
                            {pushPermission === 'granted' && (
                                <button onClick={handleTestPush} title="Wyślij testowe powiadomienie push"
                                    className="px-2 py-1 rounded-lg text-[10px] text-gray-500 hover:text-teal-400 hover:bg-white/10 transition-colors">
                                    testuj
                                </button>
                            )}
                            <button onClick={() => setOpen(false)} className="p-1 text-gray-600 hover:text-white transition-colors">
                                <X size={12} />
                            </button>
                        </div>
                    </div>

                    {/* Baner push — widoczny gdy brak zgody */}
                    {pushPermission !== 'unsupported' && pushPermission !== 'granted' && (
                        <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/5 ${pushPermission === 'denied' ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
                            {pushPermission === 'denied'
                                ? <BellOff size={13} className="text-red-400 shrink-0" />
                                : <BellRing size={13} className="text-yellow-400 shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                                {pushPermission === 'denied' ? (
                                    <p className="text-[10px] text-red-300 leading-tight">Powiadomienia zablokowane w przeglądarce.</p>
                                ) : (
                                    <p className="text-[10px] text-yellow-300 leading-tight">Włącz powiadomienia push, aby otrzymywać alerty nawet gdy aplikacja jest zamknięta.</p>
                                )}
                            </div>
                            {pushPermission === 'default' && (
                                <button
                                    onClick={handleEnablePush}
                                    disabled={pushLoading}
                                    className="shrink-0 px-2 py-1 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-[10px] font-semibold transition-colors disabled:opacity-50">
                                    {pushLoading ? '…' : 'Włącz'}
                                </button>
                            )}
                            {pushPermission === 'denied' && (
                                <button
                                    onClick={() => { setShowUnblockModal(true); setOpen(false); }}
                                    className="shrink-0 px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[10px] font-semibold transition-colors">
                                    Jak odblokować?
                                </button>
                            )}
                        </div>
                    )}

                    {/* Lista */}
                    <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                        {notifications.filter(n => !n.readAt).length === 0 && (
                            <div className="px-4 py-8 text-center">
                                <Bell size={20} className="text-gray-700 mx-auto mb-2" />
                                <p className="text-xs text-gray-600">Brak nowych powiadomień</p>
                            </div>
                        )}
                        {notifications.filter(n => !n.readAt).map(n => (
                            <button key={n.id} onClick={() => handleClick(n)}
                                className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/[0.03] ${!n.readAt ? 'bg-teal-500/[0.04]' : ''}`}>
                                <div className="mt-0.5 shrink-0">{TYPE_ICON[n.type] || <Bell size={11} className="text-gray-500" />}</div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-[11px] font-semibold leading-tight ${!n.readAt ? 'text-white' : 'text-gray-400'}`}>{n.title}</p>
                                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{n.body}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <p className="text-[9px] text-gray-600">{formatTime(n.createdAt)}</p>
                                    {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
        </>
    );
}
