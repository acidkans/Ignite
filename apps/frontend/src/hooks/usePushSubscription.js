import { useEffect } from 'react';
import { API_URL } from '../config';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function unregisterPushSubscription(token) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        const { endpoint } = sub.toJSON();
        // Usuń tylko z bazy backendu — subskrypcja przeglądarki pozostaje
        // dzięki temu następny user może od razu z niej skorzystać
        await fetch(`${API_URL}/push/unsubscribe`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
        });
    } catch (err) {
        console.warn('[Push] Wyrejestrowanie nieudane:', err);
    }
}

export function usePushSubscription(token) {
    useEffect(() => {
        if (!token) return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

        const register = async () => {
            try {
                const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
                await navigator.serviceWorker.ready;

                const keyRes = await fetch(`${API_URL}/push/vapid-public-key`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!keyRes.ok) return;
                const { publicKey } = await keyRes.json();

                let sub = await reg.pushManager.getSubscription();

                // Stara subskrypcja może być powiązana z innym kluczem VAPID (np. sprzed
                // skonfigurowania kluczy na serwerze) — wtedy push provider odrzuca wysyłkę
                // kodem 403, mimo że subskrypcja wygląda na aktywną. Trzeba ją odświeżyć.
                if (sub && sub.options?.applicationServerKey) {
                    const current = new Uint8Array(sub.options.applicationServerKey);
                    const expected = urlBase64ToUint8Array(publicKey);
                    const matches = current.length === expected.length && current.every((b, i) => b === expected[i]);
                    if (!matches) {
                        await sub.unsubscribe().catch(() => {});
                        sub = null;
                    }
                }

                if (!sub) {
                    const permission = await Notification.requestPermission();
                    if (permission !== 'granted') return;

                    sub = await reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(publicKey),
                    });
                }

                const { endpoint, keys } = sub.toJSON();
                await fetch(`${API_URL}/push/subscribe`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
                });
            } catch (err) {
                console.warn('[Push] Rejestracja nieudana:', err);
            }
        };

        register();
    }, [token]);
}
