/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// SW NIE aktywuje się automatycznie — czeka, aż aplikacja wyśle SKIP_WAITING
// (po kliknięciu „Odśwież" w banerze nowej wersji). Eliminuje niespójny cache.
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// Dev-Tracker widget — network-first, żeby PWA nie serwowało starego widget.js po deployu.
registerRoute(
    ({ url }) => url.hostname === 'dev-tracker.gigatel.org',
    new NetworkFirst({ cacheName: 'dev-tracker', networkTimeoutSeconds: 3 }),
);

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

// --- Web Push ---

// @anchor sw-push-handler
self.addEventListener('push', (event) => {
    let data = {};
    if (event.data) {
        try { data = event.data.json(); } catch { data = { title: 'ERP', body: event.data.text() }; }
    }

    const title = data.title || 'ERP';
    const isReminder = data.type === 'REMINDER';

    const options = {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: isReminder ? `reminder-${data.reminderId}` : (data.orderId || 'erp-notification'),
        renotify: true,
        data: {
            orderId: data.orderId || null,
            reminderId: data.reminderId || null,
            type: data.type || 'ORDER',
            // Cel kliknięcia WEWNĄTRZ zamówienia. Sam `orderId` otwiera je na ostatnio
            // oglądanej zakładce, więc powiadomienie o domówieniu lądowało gdziekolwiek.
            // Nadawca decyduje, dokąd prowadzi jego powiadomienie — SW tylko to przenosi.
            tab: data.tab || null,
            section: data.section || null,
            url: '/',
        },
        // Przyciski akcji widoczne w systemowym popupie (Android / Chrome desktop)
        actions: isReminder ? [
            { action: 'snooze-10', title: '10 min' },
            { action: 'snooze-30', title: '30 min' },
            { action: 'dismiss', title: 'Zamknij' },
        ] : [],
    };

    event.waitUntil(Promise.all([
        self.registration.showNotification(title, options),
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const c of list) {
                c.postMessage({ type: 'NEW_NOTIFICATION', orderId: data.orderId || null });
                if (isReminder) {
                    // Powiadom otwartą kartę żeby pokazała in-app toast
                    c.postMessage({ type: 'REMINDER_DUE', reminderId: data.reminderId });
                }
            }
        }),
    ]));
});

// @anchor sw-notification-click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const { orderId, reminderId, type, tab, section } = event.notification.data || {};
    const action = event.action;

    // Obsługa akcji dla REMINDER — deleguj do otwartej karty aplikacji
    if (type === 'REMINDER' && reminderId) {
        let msg;
        if (action === 'snooze-10') msg = { type: 'SNOOZE_REMINDER', reminderId, minutes: 10 };
        else if (action === 'snooze-30') msg = { type: 'SNOOZE_REMINDER', reminderId, minutes: 30 };
        else msg = { type: 'DISMISS_REMINDER', reminderId };

        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                for (const client of clientList) {
                    client.postMessage(msg);
                    if (!action) client.focus(); // klik w samo powiadomienie — otwórz kartę
                    return;
                }
                if (!action && self.clients.openWindow) return self.clients.openWindow('/');
            }),
        );
        return;
    }

    // Domyślna obsługa ORDER. Zimny start (brak otwartej karty) niesie cel w query — aplikacja
    // czyta go przy starcie; bez tego kliknięcie z zamkniętej aplikacji lądowało na pulpicie.
    const params = new URLSearchParams();
    if (orderId) params.set('orderId', orderId);
    if (tab) params.set('tab', tab);
    if (section) params.set('section', section);
    const url = orderId ? `/?${params.toString()}` : '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    client.postMessage({ type: 'NAVIGATE_TO_ORDER', orderId, tab, section });
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
