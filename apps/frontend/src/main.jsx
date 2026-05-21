import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import App from './App.jsx'
import './index.css'

// Rejestracja modułów AG Grid
ModuleRegistry.registerModules([AllCommunityModule]);

// Baner „Dostępna nowa wersja" — pokazywany gdy nowy SW czeka na aktywację.
// Klik „Odśwież" → SKIP_WAITING → activate → controllerchange → reload.
function showSwUpdateBanner(registration) {
    if (document.getElementById('sw-update-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'sw-update-banner';
    bar.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:16px;background:#1e3a5f;color:#fff;padding:12px 18px;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.45);font:600 13px/1.2 system-ui,sans-serif;';
    const txt = document.createElement('span');
    txt.textContent = 'Dostępna nowa wersja aplikacji';
    const btn = document.createElement('button');
    btn.textContent = 'Odśwież';
    btn.style.cssText = 'background:#3b82f6;color:#fff;border:0;border-radius:7px;padding:8px 16px;font:700 11px system-ui;cursor:pointer;text-transform:uppercase;letter-spacing:.06em;';
    btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = 'Odświeżanie…';
        (registration.waiting || registration.installing)?.postMessage({ type: 'SKIP_WAITING' });
    };
    bar.appendChild(txt);
    bar.appendChild(btn);
    document.body.appendChild(bar);
}

// Rejestracja Service Workera (PWA shell + push). Idempotentne; usePushSubscription
// po loginie tylko subskrybuje pushManager na istniejącej rejestracji.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    // Gdy nowy SW przejmie kontrolę (po SKIP_WAITING) — jednorazowy reload na świeży kod.
    let swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (swRefreshing) return;
        swRefreshing = true;
        window.location.reload();
    });

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
            // Aktualizacja już czeka (np. pobrana w poprzedniej sesji).
            if (registration.waiting) showSwUpdateBanner(registration);
            // Nowy SW wykryty w trakcie sesji → pokaż baner po zainstalowaniu.
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showSwUpdateBanner(registration);
                    }
                });
            });
        }).catch((err) => {
            console.warn('[SW] Rejestracja nieudana:', err);
        });
    });
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>,
)
