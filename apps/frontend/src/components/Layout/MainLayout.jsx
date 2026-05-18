import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { API_URL } from '../../config';
import DynamicSidebar from './DynamicSidebar';
import AIChatSidebar from '../AI/AIChatSidebar';
import DocumentationSidebar from '../Documentation/DocumentationSidebar';
import SchematTab from '../shared/SchematTab';
import DocumentViewer from '../shared/DocumentViewer';
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
    const [docsVisible, setDocsVisible] = useState(false);
    const [docsWidth, setDocsWidth] = useState(() => {
        const saved = parseInt(localStorage.getItem('docsSidebarWidth') || '480', 10);
        return Number.isFinite(saved) ? Math.min(Math.max(saved, 320), Math.floor(window.innerWidth * 0.6)) : 480;
    });
    const [schematVisible, setSchematVisible] = useState(false);
    const [schematWidth, setSchematWidth] = useState(() => {
        const saved = parseInt(localStorage.getItem('schematSidebarWidth') || '600', 10);
        return Number.isFinite(saved) ? Math.min(Math.max(saved, 400), Math.floor(window.innerWidth * 0.7)) : 600;
    });
    const [docsFullscreenFile, setDocsFullscreenFile] = useState(null);
    const [flashTick, setFlashTick] = useState(0);

    const triggerFlash = useCallback(() => {
        console.log('[Sidebar] triggerFlash() called');
        setFlashTick(t => t + 1);
    }, []);

    // Słuchaj wiadomości z service workera o nowym powiadomieniu push — natychmiast odpalamy miganie.
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        const handler = (event) => {
            if (event.data?.type === 'NEW_NOTIFICATION') triggerFlash();
        };
        navigator.serviceWorker.addEventListener('message', handler);
        // Debug helper: pozwala odpalić miganie z konsoli (window.__flashSidebar()).
        window.__flashSidebar = triggerFlash;
        return () => {
            navigator.serviceWorker.removeEventListener('message', handler);
            delete window.__flashSidebar;
        };
    }, [triggerFlash]);

    // Auto-czyszczenie stanu migania po 5 sekundach (5 cykli × 1s).
    useEffect(() => {
        if (flashTick === 0) return;
        const id = setTimeout(() => setFlashTick(0), 5200);
        return () => clearTimeout(id);
    }, [flashTick]);

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
    const isResizingDocs = useRef(false);
    const isResizingSchemat = useRef(false);
    useEffect(() => {
        const handleMove = (e) => {
            if (isResizingLeft.current) {
                if (e.clientX > 150 && e.clientX < 500) setLeftWidth(e.clientX);
            }
            if (isResizingDocs.current) {
                const aiOffset = aiVisible ? rightWidth : 0;
                const schematOffset = schematVisible ? schematWidth : 0;
                const newW = window.innerWidth - e.clientX - aiOffset - schematOffset;
                const clamped = Math.min(Math.max(newW, 320), Math.floor(window.innerWidth * 0.6));
                setDocsWidth(clamped);
            }
            if (isResizingSchemat.current) {
                const aiOffset = aiVisible ? rightWidth : 0;
                const docsOffset = docsVisible ? docsWidth : 0;
                const newW = window.innerWidth - e.clientX - aiOffset - docsOffset;
                const clamped = Math.min(Math.max(newW, 400), Math.floor(window.innerWidth * 0.7));
                setSchematWidth(clamped);
            }
        };
        const handleUp = () => {
            if (isResizingDocs.current) {
                isResizingDocs.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
            if (isResizingSchemat.current) {
                isResizingSchemat.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
            isResizingLeft.current = false;
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [aiVisible, rightWidth, schematVisible, schematWidth, docsVisible, docsWidth]);

    // Persist szerokości sidebarsów w localStorage (debounce ~300ms)
    useEffect(() => {
        const id = setTimeout(() => {
            try { localStorage.setItem('docsSidebarWidth', String(docsWidth)); } catch { /* quota */ }
        }, 300);
        return () => clearTimeout(id);
    }, [docsWidth]);

    useEffect(() => {
        const id = setTimeout(() => {
            try { localStorage.setItem('schematSidebarWidth', String(schematWidth)); } catch { /* quota */ }
        }, 300);
        return () => clearTimeout(id);
    }, [schematWidth]);

    // ESC zamyka fullscreen Docs
    useEffect(() => {
        if (!docsFullscreenFile) return;
        const onKey = (e) => { if (e.key === 'Escape') setDocsFullscreenFile(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [docsFullscreenFile]);

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
                        <NotificationBell
                            onNavigateToOrder={(orderId, requirementId) => {
                                const tab = requirementId ? 'materials' : 'comments';
                                pendingTabRef.current = tab;
                                pendingRequirementIdRef.current = requirementId || null;
                                window.dispatchEvent(new CustomEvent('notification-navigate', { detail: { orderId, tab } }));
                                handleNodeChange(orderId);
                            }}
                            onNewUnread={triggerFlash}
                        />
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
            <div
                key={!leftVisible && flashTick > 0 ? `flash-${flashTick}` : 'idle'}
                className={`flex-shrink-0 hidden md:flex items-center border-r border-white/5 ${!leftVisible && flashTick > 0 ? 'animate-sidebar-flash-red' : 'bg-black/20'}`}
            >
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
                <Outlet context={{ activeAreaId, setActiveAreaId: handleNodeChange, refreshTree: fetchTree, menuTree, setLeftVisible, setAiVisible, setDocsVisible, pendingTabRef, pendingRequirementIdRef }} />
            </main>

            {/* TOGGLE DOCS BUTTON (amber) */}
            <div className="flex-shrink-0 hidden md:flex items-center bg-black/20 border-l border-white/5">
                <button
                    onClick={() => setDocsVisible(v => !v)}
                    title={docsVisible ? 'Ukryj panel dokumentacji' : 'Pokaż panel dokumentacji'}
                    className={`w-4 h-24 flex items-center justify-center text-gray-500 hover:text-white hover:bg-amber-500/40 transition-colors border-y border-white/5 rounded-l-md ${docsVisible ? 'bg-amber-500/20 text-amber-200' : ''}`}
                >
                    {docsVisible
                        ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    }
                </button>
            </div>

            {/* DOCS SIDEBAR */}
            {docsVisible && (
                <aside style={{ width: docsWidth }} className="flex-shrink-0 hidden lg:flex bg-black/30 border-l border-amber-500/20 backdrop-blur-sm relative">
                    {/* Drag handle (lewa krawędź) */}
                    <div
                        onMouseDown={(e) => {
                            e.preventDefault();
                            isResizingDocs.current = true;
                            document.body.style.cursor = 'col-resize';
                            document.body.style.userSelect = 'none';
                        }}
                        onDoubleClick={() => setDocsWidth(480)}
                        title="Przeciągnij, aby zmienić szerokość (dbl-klik = reset)"
                        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-500/60 transition-colors z-50 group"
                    >
                        <div className="absolute inset-y-0 left-0 w-px bg-amber-500/30 group-hover:bg-amber-400 transition-colors"></div>
                    </div>
                    <DocumentationSidebar
                        nodeId={activeAreaId}
                        onClose={() => setDocsVisible(false)}
                        onOpenFullscreen={(file) => setDocsFullscreenFile(file)}
                    />
                </aside>
            )}

            {/* TOGGLE SCHEMAT BUTTON (teal) */}
            <div className="flex-shrink-0 hidden md:flex items-center bg-black/20 border-l border-white/5">
                <button
                    onClick={() => setSchematVisible(v => !v)}
                    title={schematVisible ? 'Ukryj schemat' : 'Pokaż schemat'}
                    className={`w-4 h-24 flex items-center justify-center text-gray-500 hover:text-white hover:bg-teal-500/40 transition-colors border-y border-white/5 rounded-l-md ${schematVisible ? 'bg-teal-500/20 text-teal-200' : ''}`}
                >
                    {schematVisible
                        ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                    }
                </button>
            </div>

            {/* SCHEMAT SIDEBAR */}
            {schematVisible && (
                <aside style={{ width: schematWidth }} className="flex-shrink-0 hidden lg:flex flex-col bg-black/30 border-l border-teal-500/20 backdrop-blur-sm relative overflow-hidden">
                    <div
                        onMouseDown={(e) => {
                            e.preventDefault();
                            isResizingSchemat.current = true;
                            document.body.style.cursor = 'col-resize';
                            document.body.style.userSelect = 'none';
                        }}
                        onDoubleClick={() => setSchematWidth(600)}
                        title="Przeciągnij, aby zmienić szerokość (dbl-klik = reset)"
                        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-teal-500/60 transition-colors z-50 group"
                    >
                        <div className="absolute inset-y-0 left-0 w-px bg-teal-500/30 group-hover:bg-teal-400 transition-colors"></div>
                    </div>
                    <div className="h-10 flex items-center justify-between px-4 border-b border-teal-500/20 bg-teal-500/5 flex-shrink-0">
                        <span className="text-[11px] font-bold text-teal-300 uppercase tracking-widest">Schemat</span>
                        <button onClick={() => setSchematVisible(false)} className="p-1 text-gray-500 hover:text-white rounded transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <SchematTab nodeId={activeAreaId} />
                    </div>
                </aside>
            )}

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

            {/* DOCS FULLSCREEN MODAL — z-9990 (poniżej wewnętrznego portalu DocumentViewer = 9999), Esc zamyka */}
            {docsFullscreenFile && (
                <div
                    className="fixed inset-0 z-[9990] bg-black/60 flex items-center justify-center p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setDocsFullscreenFile(null); }}
                >
                    <div className="w-full h-full max-w-[1600px]">
                        <DocumentViewer
                            fileUrl={`${API_URL}/documents/download/${docsFullscreenFile.id}`}
                            fileName={docsFullscreenFile.fileName}
                            mimeType={docsFullscreenFile.mimeType}
                            documentId={docsFullscreenFile.id}
                            token={sessionStorage.getItem('token')}
                            onClose={() => setDocsFullscreenFile(null)}
                        />
                    </div>
                </div>
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
