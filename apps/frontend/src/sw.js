/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// SW NIE aktywuje się automatycznie — czeka, aż aplikacja wyśle SKIP_WAITING
// (po kliknięciu „Odśwież" w banerze nowej wersji). Eliminuje niespójny cache.
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// SPA navigation fallback: KAŻDA nawigacja (np. /login, /process-tree, /users)
// serwowana jest z precachowanego /index.html. React Router przejmuje routing.
// Bez tego offline GET /login zwraca ERR_FAILED bo brak precache dla tego URL.
registerRoute(
    new NavigationRoute(
        createHandlerBoundToURL('/index.html'),
        {
            denylist: [/^\/api\//, /^\/sw\.js$/, /^\/workbox-/],
        },
    ),
);

registerRoute(
    ({ request }) => request.destination === 'image',
    new CacheFirst({
        cacheName: 'images',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60,
            }),
        ],
    }),
);

// Pliki schematów (PDF/JPG/PNG) — CacheFirst, żeby działały w terenie offline.
// Klucz cache pomija nagłówek Authorization (różny per user) — request URL jest
// niepowtarzalnym hashed identyfikatorem pliku, więc kolizji między userami nie ma.
registerRoute(
    ({ url }) => url.pathname.startsWith('/api/schematics/file/'),
    new CacheFirst({
        cacheName: 'schematic-files',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 200,
                maxAgeSeconds: 60 * 24 * 60 * 60,
                purgeOnQuotaError: true,
            }),
        ],
    }),
);

// --- Web Push (zachowane z public/sw.js z v2026.04.29.301) ---

self.addEventListener('push', (event) => {
    let data = {};
    if (event.data) {
        try { data = event.data.json(); } catch { data = { title: 'ERP', body: event.data.text() }; }
    }

    const title = data.title || 'ERP';
    const options = {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.orderId || 'erp-notification',
        renotify: true,
        data: { orderId: data.orderId || null, url: '/' },
    };

    event.waitUntil(Promise.all([
        self.registration.showNotification(title, options),
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const c of list) c.postMessage({ type: 'NEW_NOTIFICATION', orderId: data.orderId || null });
        }),
    ]));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const orderId = event.notification.data?.orderId;
    const url = orderId ? `/?orderId=${orderId}` : '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    client.postMessage({ type: 'NAVIGATE_TO_ORDER', orderId });
                    return;
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(url);
        }),
    );
});

self.addEventListener('activate', (event) => {
    // Po aktywacji nowy SW przejmuje kontrolę nad otwartymi kartami → w aplikacji
    // zdarzenie `controllerchange` wymusi jednorazowy reload na świeży kod.
    event.waitUntil(self.clients.claim());
});
