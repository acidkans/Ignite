import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import App from './App.jsx'
import './index.css'

// Rejestracja modułów AG Grid
ModuleRegistry.registerModules([AllCommunityModule]);

// Rejestracja Service Workera (PWA shell + push). Idempotentne; usePushSubscription
// po loginie tylko subskrybuje pushManager na istniejącej rejestracji.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
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
