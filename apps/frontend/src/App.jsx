import { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import LoginPage from './LoginPage';
import UsersPage from './UsersPage';
import ProcessTreePage from './ProcessTreePage';
import DashboardPage from './DashboardPage';
import MainLayout from './components/Layout/MainLayout';
import MobileDashboard from './components/Mobile/MobileDashboard';
import { useDevice } from './hooks/useDevice';
import { usePushSubscription, unregisterPushSubscription } from './hooks/usePushSubscription';

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

const INACTIVITY_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 godziny

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
  const inactivityTimer = useRef(null);
  usePushSubscription(token);

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
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }));
    resetInactivityTimer(); // start timer immediately
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivityTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [token, resetInactivityTimer]);

  useEffect(() => {
    const storedToken = loadValidToken();
    if (storedToken !== token) setToken(storedToken);
  }, [location]);

  // Global 401 listener — auto-logout on expired session
  useEffect(() => {
    window.addEventListener('auth-expired', doLogout);
    return () => window.removeEventListener('auth-expired', doLogout);
  }, [doLogout]);

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
    return <MobileDashboard onLogout={handleLogout} />;
  }

  // Desktop view
  return (
    <Routes>
      <Route element={<MainLayout onLogout={handleLogout} />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/process-tree" element={<ProcessTreePage />} />
        <Route path="/hr/*" element={<Placeholder title="Moduł HR" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default App;
