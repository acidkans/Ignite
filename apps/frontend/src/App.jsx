import { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import LoginPage from './LoginPage';
import UsersPage from './UsersPage';
import FirmaPage from './FirmaPage';
import ProcessTreePage from './ProcessTreePage';
import DashboardPage from './DashboardPage';
import MainLayout from './components/Layout/MainLayout';
import MobileDashboard from './components/Mobile/MobileDashboard';
import OfflineBanner from './components/shared/OfflineBanner';
import { useDevice } from './hooks/useDevice';
import { useNetwork } from './hooks/useNetwork';
import { usePushSubscription, unregisterPushSubscription } from './hooks/usePushSubscription';
import { prefetchMobileData } from './services/sync/prefetch';
import { useSyncOutbox } from './hooks/useSyncOutbox';

const NotFound = () => (
  <div className="h-full flex flex-col items-center justify-center text-white p-10">
    <h1 className="text-4xl font-bold mb-4">404</h1>
    <p className="text-gray-400">Strona nie została znaleziona.</p>
  </div>
);

const Placeholder = ({ title }) => (
  <div className="h-full flex flex-col items-center justify-center text-white p-10">
    <h1 className="text-3xl font-bold mb-4">🚧 {title}</h1>
    <p className="text-gray-400">Moduł w trakcie budowy.</p>
  </div>
);

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minut braku aktywności

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function loadValidToken() {
  const stored = localStorage.getItem('token');
  if (!stored || isTokenExpired(stored)) {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    return null;
  }
  // sync sessionStorage for legacy code (MainLayout etc.)
  sessionStorage.setItem('token', stored);
  return stored;
}

const origFetch = window.fetch;
window.fetch = async (...args) => {
  const res = await origFetch(...args);
  if (res.status === 401) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
      window.dispatchEvent(new CustomEvent('auth-expired'));
    }
  }
  return res;
};

function App() {
  const [token, setToken] = useState(loadValidToken);
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, isTablet } = useDevice();
  const { isOnline } = useNetwork();
  const inactivityTimer = useRef(null);
  usePushSubscription(token);
  useSyncOutbox(token);

  const doLogout = useCallback(async () => {
    const t = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (t) await unregisterPushSubscription(t);
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    setToken(null);
    navigate('/login');
  }, [navigate]);

  // Reset inactivity timer on user activity
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(doLogout, INACTIVITY_TIMEOUT_MS);
  }, [doLogout]);

  useEffect(() => {
    if (!token) return;
    // Inactivity timer pauzowany offline — bez sieci nie ma jak ponownie się zalogować,
    // więc auto-logout w terenie zostawiałby pracownika bez dostępu (Etap 1.5 quick fix).
    if (!isOnline) {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      return;
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }));
    resetInactivityTimer(); // start timer immediately
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [token, isOnline, resetInactivityTimer]);

  useEffect(() => {
    const storedToken = loadValidToken();
    if (storedToken !== token) setToken(storedToken);
  }, [location]);

  // Global 401 listener — auto-logout on expired session
  useEffect(() => {
    window.addEventListener('auth-expired', doLogout);
    return () => window.removeEventListener('auth-expired', doLogout);
  }, [doLogout]);

  // Prefetch danych mobilnych po loginie + na powrót sieci.
  // Idempotentny — useCachedSubtasks też woła prefetch, inflight guard zapobiega duplikatom.
  useEffect(() => {
    if (!token) return;
    prefetchMobileData(token);
    const onOnline = () => prefetchMobileData(token);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [token]);

  // Nawigacja z powiadomienia push (kliknięcie gdy aplikacja otwarta)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE_TO_ORDER' && event.data.orderId) {
        window.dispatchEvent(new CustomEvent('push-navigate-order', { detail: { orderId: event.data.orderId } }));
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  const handleLogin = (data) => {
    localStorage.setItem('token', data.access_token);
    sessionStorage.setItem('token', data.access_token);
    setToken(data.access_token);
    navigate('/');
  };

  const handleLogout = doLogout;

  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Mobile/Tablet specific view
  if (isMobile || isTablet) {
    return (
      <div className="flex flex-col h-[100dvh]">
        <OfflineBanner />
        <div className="flex-1 min-h-0">
          <MobileDashboard onLogout={handleLogout} />
        </div>
      </div>
    );
  }

  // Desktop view
  return (
    <div className="flex flex-col h-screen">
      <OfflineBanner />
      <div className="flex-1 min-h-0">
        <Routes>
          <Route element={<MainLayout onLogout={handleLogout} />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/firma" element={<FirmaPage />} />
            <Route path="/process-tree" element={<ProcessTreePage />} />
            <Route path="/hr/*" element={<Placeholder title="Moduł HR" />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </div>
    </div>
  );
}

export default App;
