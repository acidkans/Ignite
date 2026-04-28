// Service Worker — obsługa Web Push

self.addEventListener('push', (event) => {
    let data = {};
    if (event.data) {
        try { data = event.data.json(); } catch { data = { title: 'ERP', body: event.data.text() }; }
    }

    const title = data.title || 'ERP';
    const options = {
        body: data.body || '',
        icon: '/vite.svg',
        badge: '/vite.svg',
        tag: data.orderId || 'erp-notification',
        renotify: true,
        data: { orderId: data.orderId || null, url: '/' },
    };

    event.waitUntil(Promise.all([
        self.registration.showNotification(title, options),
        // Poinformuj otwarte taby aplikacji o nowej wiadomości — używane do migania paska navbara.
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const c of list) c.postMessage({ type: 'NEW_NOTIFICATION', orderId: data.orderId || null });
        }),
    ]));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const orderId = event.notification.data?.orderId;
    const url = orderId ? `/?orderId=${orderId}` : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Jeśli aplikacja już otwarta — focusuj i przekieruj
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    client.postMessage({ type: 'NAVIGATE_TO_ORDER', orderId });
                    return;
                }
            }
            // Jeśli zamknięta — otwórz nowe okno
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
