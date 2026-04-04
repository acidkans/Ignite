import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { API_URL } from '../../config';
import DynamicSidebar from './DynamicSidebar';
import AIChatSidebar from '../AI/AIChatSidebar';
import AddNodeModal from '../shared/AddNodeModal';
import NodePermissionsModal from '../shared/NodePermissionsModal';
import NotificationBell from '../shared/NotificationBell';

export default function MainLayout({ onLogout }) {
    const navigate = useNavigate();
    const location = useLocation();

    // UI State
    const [leftWidth, setLeftWidth] = useState(200);
    const [leftVisible, setLeftVisible] = useState(true);
    const [rightWidth, setRightWidth] = useState(320);
    const [aiVisible, setAiVisible] = useState(false);

    // Data State
    const [menuTree, setMenuTree] = useState([]);
    const [loadingMenu, setLoadingMenu] = useState(true);

    // Selection state
    const [activeAreaId, setActiveAreaId] = useState(() => sessionStorage.getItem('activeAreaId'));
    const pendingTabRef = useRef(null);
    const pendingRequirementIdRef = useRef(null);
    const [userLabel, setUserLabel] = useState('');
    const [userRoles, setUserRoles] = useState([]);

    // Modal State
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedParent, setSelectedParent] = useState(null);
    const [selectedNodePermissions, setSelectedNodePermissions] = useState(null);

    // --- 1. Load User Info ---
    useEffect(() => {
        const token = sessionStorage.getItem('token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                setUserLabel(payload.email || 'Użytkownik');
                setUserRoles(payload.roles || []);
            } catch (e) {
                console.error("Token parse error", e);
            }
        }
    }, []);

    // --- 2. Load Process Tree (Sidebar) ---
    const fetchTree = async () => {
        console.log("[MainLayout] Fetching process tree...");
        try {
            const token = sessionStorage.getItem('token');
            if (!token) return;

            const res = await fetch(`${API_URL}/process-tree?t=${Date.now()}`, {
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });

            if (!res.ok) throw new Error("Failed to fetch tree");

            const data = await res.json();
            console.log(`[MainLayout] Tree loaded: ${data.length} nodes`);
            setMenuTree(data);


        } catch (err) {
            console.error('[MainLayout] Menu load error:', err);
        } finally {
            setLoadingMenu(false);
        }
    };

    useEffect(() => {
        fetchTree();
    }, []); // Run once on mount

    // --- 3. Handle Node Selection ---
    const handleNodeChange = (nodeId) => {
        console.log('[MainLayout] Selected node:', nodeId);
        setActiveAreaId(nodeId);
        if (nodeId) sessionStorage.setItem('activeAreaId', nodeId);
        else sessionStorage.removeItem('activeAreaId');

        // Jeśli użytkownik jest na innej podstronie (np. Settings), a klika w drzewo,
        // chcemy go przenieść z powrotem do Dashboardu, gdzie wyświetlane są szczegóły węzła.
        if (location.pathname !== '/') {
            navigate('/');
        }
    };

    // --- 4. Node Management Handlers ---
    const handleAddNode = (parentNode) => {
        setSelectedParent(parentNode);
        setShowAddModal(true);
    };

    const handleDeleteNode = async (nodeId, nodeName) => {
        if (!window.confirm(`Czy na pewno chcesz usunąć "${nodeName}" i wszystkie elementy podrzędne?`)) {
            return;
        }
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/process-tree/${nodeId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Błąd usuwania węzła');
            fetchTree();
        } catch (err) {
            alert(err.message);
        }
    };

    // --- Resizing Logic (Opcjonalne, uproszczone) ---
    const isResizingLeft = useRef(false);
    useEffect(() => {
        const handleMove = (e) => {
            if (isResizingLeft.current) {
                if (e.clientX > 150 && e.clientX < 500) setLeftWidth(e.clientX);
            }
        };
        const handleUp = () => { isResizingLeft.current = false; };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, []);

    return (
        <div className="flex h-screen w-full bg-gray-900 text-white overflow-hidden font-sans selection:bg-blue-500/30">
            {/* LEWY SIDEBAR */}
            <nav style={{ width: leftVisible ? leftWidth : 0 }} className={`flex-shrink-0 bg-black/40 border-r border-white/10 flex flex-col backdrop-blur-md relative z-20 overflow-hidden transition-[width] duration-300 ease-in-out ${!leftVisible ? 'hidden md:flex' : 'hidden md:flex'}`}>
                {/* Header */}
                <div className="h-12 flex items-center px-4 border-b border-white/5">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mr-2 shadow-lg shadow-blue-500/20">
                        <span className="font-bold text-[10px] text-white">G</span>
                    </div>
                    <span className="font-bold text-sm tracking-wide text-gray-100 uppercase">Gigatel</span>
                </div>

                {/* Menu Content */}
                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                    <DynamicSidebar
                        menuTree={menuTree}
                        activeAreaId={activeAreaId}
                        setActiveAreaId={handleNodeChange}
                        loading={loadingMenu}
                        onAddNode={handleAddNode}
                        onDeleteNode={handleDeleteNode}
                        onPermissions={(node) => setSelectedNodePermissions(node)}
                        userRoles={userRoles}
                    />
                </div>

                {/* User Footer */}
                <div className="p-2 border-t border-white/5 bg-black/20 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                        <NotificationBell onNavigateToOrder={(orderId, requirementId) => { pendingTabRef.current = 'materials'; pendingRequirementIdRef.current = requirementId || null; handleNodeChange(orderId); }} />
                        <button
                            onClick={onLogout}
                            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors flex-shrink-0"
                            title="Wyloguj"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15M3 12h12.75m0 0l-3-3m3 3l-3 3" />
                            </svg>
                        </button>
                        <div className="overflow-hidden">
                            <div className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">Zalogowany jako</div>
                            <div className="text-sm font-medium text-gray-200 truncate">{userLabel || '...'}</div>
                        </div>
                    </div>
                </div>

                {/* Resizer Handle */}
                {leftVisible && <div
                    onMouseDown={() => { isResizingLeft.current = true; }}
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 transition-colors z-40 opacity-0 hover:opacity-100"
                />}
            </nav>

            {/* SIDEBAR TOGGLE STRIP */}
            <div className="flex-shrink-0 hidden md:flex items-center bg-black/20 border-r border-white/5">
                <button
                    onClick={() => setLeftVisible(v => !v)}
                    title={leftVisible ? 'Ukryj panel boczny' : 'Pokaż panel boczny'}
                    className="w-4 h-16 flex items-center justify-center text-gray-500 hover:text-white hover:bg-blue-600/40 transition-colors border-y border-white/5 rounded-r-md"
                >
                    {leftVisible
                        ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                    }
                </button>
            </div>

            {/* GŁÓWNA ZAWARTOŚĆ */}
            <main className="flex-1 flex flex-col min-w-0 bg-gray-900 relative z-10">
                {/* 
                    Outlet działa tutaj jako placeholder dla komponentów zdefiniowanych w App.jsx 
                    Przekazujemy setActiveAreaId itp. przez context, aby DashboardPage mógł z tego korzystać.
                */}
                <Outlet context={{ activeAreaId, setActiveAreaId: handleNodeChange, refreshTree: fetchTree, menuTree, setLeftVisible, setAiVisible, pendingTabRef, pendingRequirementIdRef }} />
            </main>

            {/* TOGGLE AI BUTTON */}
            <div className="flex-shrink-0 hidden md:flex items-center bg-black/20 border-l border-white/5">
                <button
                    onClick={() => setAiVisible(v => !v)}
                    title={aiVisible ? 'Ukryj asystenta AI' : 'Pokaż asystenta AI'}
                    className="w-4 h-24 flex items-center justify-center text-gray-500 hover:text-white hover:bg-blue-600/40 transition-colors border-y border-white/5 rounded-l-md"
                >
                    {aiVisible
                        ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    }
                </button>
            </div>

            {/* PRAWY SIDEBAR (AI) */}
            {aiVisible && (
                <aside style={{ width: rightWidth }} className="flex-shrink-0 hidden lg:flex bg-black/20 border-l border-white/5 backdrop-blur-sm relative glass-morphism">
                    <AIChatSidebar
                        nodeId={activeAreaId}
                        nodes={menuTree}
                        onClose={() => setAiVisible(false)}
                    />
                </aside>
            )}
            {/* MODALS */}
            {showAddModal && (
                <AddNodeModal
                    parent={selectedParent}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => {
                        setShowAddModal(false);
                        fetchTree();
                    }}
                />
            )}

            {selectedNodePermissions && (
                <NodePermissionsModal
                    node={selectedNodePermissions}
                    onClose={() => setSelectedNodePermissions(null)}
                    onSuccess={() => {
                        setSelectedNodePermissions(null);
                    }}
                />
            )}
        </div>
    );
}
