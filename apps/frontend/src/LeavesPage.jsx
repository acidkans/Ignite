import { API_URL } from './config';
import { useCallback, useEffect, useState } from 'react';
import MyLeavesTab from './components/shared/leaves/MyLeavesTab';
import LeaveRequestsTab from './components/shared/leaves/LeaveRequestsTab';
import LeavesDashboardTab from './components/shared/leaves/LeavesDashboardTab';
import LeavesCalendarTab from './components/shared/leaves/LeavesCalendarTab';
import SmtpSettingsPanel from './components/shared/SmtpSettingsPanel';

// @anchor leaves-gov-url
/// Rządowa strona z zasadami urlopów i zwolnień od pracy — link w nagłówku modułu.
const GOV_LEAVES_URL = 'https://www.gov.pl/web/rodzina/urlopy-i-zwolnienia-od-pracy';

// @anchor leaves-tab-meta
// Zakładki modułu Urlopy — układ i styl jak pasek zakładek WBS.
const LEAVE_TABS = [
    { id: 'myData', label: 'Moje dane', activeColor: 'text-blue-400', bar: 'bg-blue-500', shadow: '59,130,246' },
    { id: 'requests', label: 'Wnioski', activeColor: 'text-cyan-400', bar: 'bg-cyan-500', shadow: '6,182,212' },
    { id: 'subordinateRequests', label: 'Wnioski moich podwładnych', activeColor: 'text-purple-400', bar: 'bg-purple-500', shadow: '168,85,247' },
    { id: 'dashboard', label: 'Dashboard', activeColor: 'text-amber-400', bar: 'bg-amber-500', shadow: '245,158,11' },
    // @anchor leaves-calendar-tab-meta
    // Wspólny kalendarz Google — bez ograniczeń uprawnień, widoczny dla każdego użytkownika modułu.
    { id: 'calendar', label: 'Kalendarz', activeColor: 'text-orange-400', bar: 'bg-orange-500', shadow: '249,115,22' },
    // @anchor leaves-smtp-tab-meta
    // Zakładka widoczna wyłącznie dla ADMIN (access.canEdit) — własny serwer poczty modułu.
    { id: 'smtp', label: 'Urlopy SMTP', activeColor: 'text-emerald-400', bar: 'bg-emerald-500', shadow: '16,185,129', adminOnly: true },
];

// @anchor leaves-page
export default function LeavesPage() {
    const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('erp_leavesTab') || 'myData');
    const [access, setAccess] = useState(null);
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [newRequestSignal, setNewRequestSignal] = useState(0);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        sessionStorage.setItem('erp_leavesTab', tab);
    };

    // @anchor fetch-leaves-meta
    const fetchMeta = useCallback(async () => {
        setLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                setCurrentUserId(payload.sub || payload.id || null);
            } catch { /* token bez czytelnego payloadu — currentUserId zostaje null */ }

            const accessRes = await fetch(`${API_URL}/leaves/access`, { headers });
            if (!accessRes.ok) throw new Error('Błąd pobierania uprawnień');
            const accessData = await accessRes.json();
            setAccess(accessData);
            if (!accessData.enabled) return;

            const [typesRes, employeesRes] = await Promise.all([
                fetch(`${API_URL}/leaves/types`, { headers }),
                fetch(`${API_URL}/leaves/employees`, { headers }),
            ]);
            if (typesRes.ok) setLeaveTypes(await typesRes.json());
            if (employeesRes.ok) setEmployees(await employeesRes.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchMeta(); }, [fetchMeta]);

    if (loading) return <div className="p-8 text-center text-gray-400">Ładowanie...</div>;
    if (error) return <div className="p-8 text-center text-red-400">Błąd: {error}</div>;
    if (access && !access.enabled) {
        return <div className="p-8 text-center text-gray-400">Moduł Urlopy jest dostępny tylko dla wybranych firm.</div>;
    }

    // zakładka podwładnych ma sens tylko dla przełożonego / admina, konfiguracja SMTP — tylko dla ADMIN
    const visibleTabs = LEAVE_TABS.filter(t =>
        (t.id !== 'subordinateRequests' || access?.scope !== 'SELF') && (!t.adminOnly || access?.canEdit)
    );
    const currentTab = visibleTabs.some(t => t.id === activeTab) ? activeTab : 'myData';

    return (
        <div className="w-full h-full animate-fade-in flex flex-col min-h-0">
            <div className="px-8 pt-6 pb-3 flex justify-between items-end">
                <div>
                    <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                        Urlopy
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                        {access?.scope === 'ALL'
                            ? 'Widok pełny — edycja wszystkich wpisów'
                            : access?.canViewAll
                                ? 'Widok DAK — podgląd wszystkich pracowników, bez edycji'
                                : access?.scope === 'SUBORDINATES'
                                    ? 'Widok przełożonego — Ty i Twoi podwładni'
                                    : 'Widok pracownika — tylko Twoje dane'}
                    </p>
                </div>

                {/* @anchor link-gov-leaves */}
                <a
                    href={GOV_LEAVES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Urlopy i zwolnienia od pracy — gov.pl"
                    className="italic font-bold underline text-sm text-blue-300 hover:text-blue-200 transition-colors"
                >
                    Urlopy i zwolnienia od pracy (gov.pl)
                </a>
            </div>

            {/* TAB SELECTOR — styl jak w WBS */}
            {/* @anchor leaves-tab-selector */}
            <div className="px-4 flex border-b border-white/5 bg-white/[0.01] flex-shrink-0 z-10 overflow-x-auto scrollbar-none">
                {visibleTabs.map(tab => {
                    const isActive = currentTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all relative whitespace-nowrap ${isActive ? tab.activeColor : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {tab.label}
                            {isActive && <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${tab.bar} shadow-[0_0_10px_rgba(${tab.shadow},0.5)]`} />}
                        </button>
                    );
                })}
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto min-h-0 p-6">
                {currentTab === 'myData' && (
                    <MyLeavesTab
                        access={access}
                        leaveTypes={leaveTypes}
                        employees={employees}
                        currentUserId={currentUserId}
                    />
                )}
                {currentTab === 'requests' && (
                    <LeaveRequestsTab
                        key={`mine-${newRequestSignal}`}
                        mode="mine"
                        access={access}
                        leaveTypes={leaveTypes}
                        employees={employees}
                        currentUserId={currentUserId}
                    />
                )}
                {currentTab === 'subordinateRequests' && (
                    <LeaveRequestsTab
                        mode="subordinates"
                        access={access}
                        leaveTypes={leaveTypes}
                        employees={employees}
                        currentUserId={currentUserId}
                    />
                )}
                {currentTab === 'dashboard' && (
                    <LeavesDashboardTab
                        access={access}
                        employees={employees}
                        currentUserId={currentUserId}
                        onNewRequest={() => { setNewRequestSignal(n => n + 1); handleTabChange('requests'); }}
                    />
                )}
                {currentTab === 'calendar' && <LeavesCalendarTab />}
                {/* @anchor leaves-smtp-tab */}
                {currentTab === 'smtp' && (
                    <SmtpSettingsPanel
                        profile="leaves"
                        title="Poczta wychodząca — Urlopy"
                        subtitle="Serwer używany wyłącznie do powiadomień o wnioskach urlopowych"
                        note="Dopóki pole Host jest puste, powiadomienia urlopowe idą przez globalną konfigurację z panelu „Poczta SMTP”."
                    />
                )}
            </div>
        </div>
    );
}
