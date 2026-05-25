import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import PropertyPreview from './components/shared/PropertyPreview';
import RequirementsTab from './components/shared/RequirementsTab';
import SiteInfoTab from './components/shared/SiteInfoTab';
import NodeInfoTab from './components/shared/NodeInfoTab';
import SchematTab from './components/shared/SchematTab';
import LogistykaMaterialListsTab from './components/shared/LogistykaMaterialListsTab';
import MaterialDatabaseTab from './components/shared/MaterialDatabaseTab';
import OffersTab from './components/shared/OffersTab';
import UnifiedWbsPanel from './components/shared/wbs/UnifiedWbsPanel';
import CommentsSlideOver from './components/shared/CommentsSlideOver';
import { Layers, ChevronDown, Calendar, Search, Plus, X, Database, RotateCcw, MessageCircle, Pencil, Check } from 'lucide-react';
import { API_URL } from './config';

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function formatPolishDate(date) {
    return date.toLocaleDateString('pl-PL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
}

function findNodeById(nodes, id) {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children?.length) {
            const found = findNodeById(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

function findParentById(nodes, id, parent = null) {
    for (const node of nodes) {
        if (node.id === id) return parent;
        if (node.children?.length) {
            const found = findParentById(node.children, id, node);
            if (found !== undefined) return found;
        }
    }
    return undefined;
}

function decodeToken() {
    try {
        const token = sessionStorage.getItem('token');
        if (!token) return {};
        const p = JSON.parse(atob(token.split('.')[1]));
        return { userId: p.sub, roles: p.roles || [] };
    } catch { return {}; }
}

export default function DashboardPage() {
    const context = useOutletContext();
    const activeAreaId = context ? context.activeAreaId : null;
    const setActiveAreaId = context?.setActiveAreaId;
    const menuTree = context?.menuTree || [];
    const setLeftVisible = context?.setLeftVisible;
    const setAiVisible = context?.setAiVisible;
    const contextPendingTabRef = context?.pendingTabRef;
    const contextPendingRequirementIdRef = context?.pendingRequirementIdRef;

    const { userId: currentUserId, roles: currentRoles = [] } = useMemo(() => decodeToken() || {}, []); // eslint-disable-line react-hooks/exhaustive-deps
    const isWorker = currentRoles.includes('USER') && !currentRoles.some(r => ['ADMIN', 'MANAGER', 'LOGISTYK'].includes(r));
    const isLogistyk = currentRoles.includes('LOGISTYK');
    const isManagerOrAdmin = currentRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));

    const [activeTab, _setActiveTab] = useState(() => {
        const saved = sessionStorage.getItem('erp_activeTab');
        if (saved) return saved;
        return isWorker ? 'unified' : 'files';
    });
    const setActiveTab = (tab) => {
        sessionStorage.setItem('erp_activeTab', tab);
        _setActiveTab(tab);
    };
    const [tabOrder, setTabOrder] = useState(() => {
        const ALL_TABS = ['files', 'financialFiles', 'unified', 'schematics', 'materialDatabase'];
        try {
            const saved = JSON.parse(localStorage.getItem('tabOrder') || 'null');
            if (!saved) return ALL_TABS;
            const merged = [...saved, ...ALL_TABS.filter(t => !saved.includes(t))];
            return merged;
        }
        catch { return ALL_TABS; }
    });
    const [dragTabId, setDragTabId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showComments, setShowComments] = useState(false);
    const [orderRequirements, setOrderRequirements] = useState([]);
    const [versions, setVersions] = useState([]);
    const [selectedVersionId, setSelectedVersionId] = useState(null);
    const [showVersionMenu, setShowVersionMenu] = useState(false);
    const [renamingVersionId, setRenamingVersionId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [wbsUpdateCount, setWbsUpdateCount] = useState(0);
    const [wbsDataCache, setWbsDataCache] = useState({});

    const now = useMemo(() => new Date(), []);
    const dateLabel = formatPolishDate(now);
    const weekNumber = getWeekNumber(now);

    // Sprawdź typ aktywnego węzła
    const activeNode = useMemo(() => findNodeById(menuTree, activeAreaId), [menuTree, activeAreaId]);
    const parentNode = useMemo(() => findParentById(menuTree, activeAreaId), [menuTree, activeAreaId]);
    const isOrder = activeNode?.type === 'order';
    const isField = activeNode?.type === 'field';
    const isLogistykaArea = activeNode?.type === 'area' && activeNode?.name === 'Logistyka' && (isLogistyk || isManagerOrAdmin);
    const showMaterialLists = isLogistykaArea;

    const localPendingTabRef = useRef(null);
    const pendingTabRef = contextPendingTabRef || localPendingTabRef;

    const [focusedRequirementId, setFocusedRequirementId] = useState(null);

    // Fetch requirements for comments #tags
    useEffect(() => {
        if (!activeAreaId || !isOrder) { setOrderRequirements([]); return; }
        const token = sessionStorage.getItem('token');
        fetch(`${API_URL}/material-requirements/node/${activeAreaId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then(data => setOrderRequirements(Array.isArray(data) ? data : []))
            .catch(() => setOrderRequirements([]));
    }, [activeAreaId, isOrder]);

    // Fetch versions when node changes
    useEffect(() => {
        if (activeAreaId && isOrder) {
            fetchVersions();
            const targetTab = pendingTabRef.current || 'requirements';
            const openComments = targetTab === 'comments';
            pendingTabRef.current = null;
            const reqId = contextPendingRequirementIdRef?.current || null;
            if (contextPendingRequirementIdRef) contextPendingRequirementIdRef.current = null;
            setFocusedRequirementId(reqId);
            if (openComments) {
                setShowComments(true);
                setActiveTab('requirements');
            } else {
                setShowComments(false);
                setActiveTab(targetTab);
            }
        } else if (activeAreaId && isLogistykaArea) {
            pendingTabRef.current = null;
            setVersions([]);
            setSelectedVersionId(null);
            setActiveTab('materialLists');
        } else {
            pendingTabRef.current = null;
            setVersions([]);
            setSelectedVersionId(null);
        }
    }, [activeAreaId, isOrder, isLogistykaArea]);

    // Otwórz chat gdy powiadomienie kliknięte dla tego samego zamówienia (activeAreaId się nie zmienił)
    useEffect(() => {
        const handler = (e) => {
            const { orderId, tab } = e.detail;
            if (String(orderId) === String(activeAreaId) && isOrder && tab === 'comments') {
                setShowComments(true);
            }
        };
        window.addEventListener('notification-navigate', handler);
        return () => window.removeEventListener('notification-navigate', handler);
    }, [activeAreaId, isOrder]);

    const fetchVersions = async () => {
        try {
            const res = await fetch(`/api/ai/versions/${activeAreaId}`);
            const data = await res.json();
            setVersions(data);
            if (data.length > 0) {
                const active = data.find(v => v.isActive) || data[0];
                setSelectedVersionId(active.id);
            }
        } catch (err) {
            console.error('Failed to fetch versions:', err);
        }
    };

    const handleCreateVersion = async () => {
        const sourceLabel = versions.find(v => v.id === selectedVersionId)?.label || 'pierwszy';
        const label = prompt(`Nowa wersja zostanie utworzona na podstawie: "${sourceLabel}".\nPodaj etykietę nowej wersji:`);
        if (!label?.trim()) return;
        try {
            const res = await fetch('/api/ai/versions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    nodeId: activeAreaId,
                    label: label.trim(),
                    sourceVersionId: selectedVersionId
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert('Błąd tworzenia wersji: ' + (err.message || res.status));
                return;
            }
            const newVer = await res.json();
            await fetchVersions();
            setSelectedVersionId(newVer.id);
        } catch (err) {
            console.error('Failed to create version:', err);
            alert('Błąd komunikacji z serwerem.');
        }
    };

    const handleActivateVersion = async (versionId) => {
        try {
            await fetch(`/api/ai/versions/${versionId}/activate`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
            });
            await fetchVersions();
            setSelectedVersionId(versionId);
        } catch (err) {
            console.error('Failed to activate version:', err);
        }
    };

    const handleDeleteVersion = async (versionId) => {
        if (versions.length <= 1) { alert('Nie można usunąć jedynej wersji.'); return; }
        if (!confirm('Czy na pewno chcesz usunąć tę wersję? Operacja jest nieodwracalna.')) return;
        try {
            await fetch(`/api/ai/versions/${versionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
            });
            if (selectedVersionId === versionId) {
                const remaining = versions.find(v => v.id !== versionId);
                setSelectedVersionId(remaining?.id || null);
            }
            fetchVersions();
        } catch (err) {
            console.error('Failed to delete version:', err);
        }
    };

    const handleRenameVersion = async (versionId, newLabel) => {
        const trimmed = newLabel.trim();
        if (!trimmed) { setRenamingVersionId(null); return; }
        try {
            await fetch(`/api/ai/versions/${versionId}/label`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: trimmed }),
            });
            setVersions(prev => prev.map(v => v.id === versionId ? { ...v, label: trimmed } : v));
        } catch (err) {
            console.error('Failed to rename version:', err);
        } finally {
            setRenamingVersionId(null);
        }
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSearchQuery('');
    };

    const handleNavigateToOrderPlanning = (orderId) => {
        if (!orderId || !setActiveAreaId) return;
        pendingTabRef.current = 'unified';
        setActiveAreaId(String(orderId));
    };

    const handleSnapshot = async () => {
        try {
            const res = await fetch('/api/process-tree/snapshot', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();
            if (data.success) {
                alert(`Snapshot zakończony pomyślnie!\nZapisano użytkowników: ${data.stats.users}\nWęzłów: ${data.stats.nodes}\nPozycji budżetowych: ${data.stats.budgetItems}`);
            } else {
                alert('Błąd podczas tworzenia snapshotu: ' + data.message);
            }
        } catch (err) {
            console.error('Failed to take snapshot:', err);
            alert('Wystąpił błąd komunikacji z serwerem.');
        }
    };

    const currentVersion = versions.find(v => v.id === selectedVersionId);

    const showSearch = activeTab !== 'requirements';
    const searchPlaceholder = activeTab === 'unified'
        ? 'Szukaj w strukturze, budżecie, materiałach…'
        : activeTab === 'materialDatabase'
        ? 'Szukaj w materiałach i kartach katalogowych…'
        : 'Szukaj po nazwie pliku, dacie…';

    return (
        <>
        <div className="flex flex-col h-full bg-gradient-to-br from-gray-900 via-gray-900 to-black text-white relative overflow-hidden">

            {/* TOP BAR */}
            <header className="h-16 px-6 flex items-center gap-3 border-b border-white/5 bg-white/[0.02] backdrop-blur-sm flex-shrink-0 z-20">

                {/* Data i tydzień */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <Calendar size={13} className="text-blue-400" />
                    </div>
                    <div className="flex flex-col leading-tight">
                        <span className="text-[11px] text-gray-200 font-medium capitalize">{dateLabel}</span>
                        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Tydzień {weekNumber}</span>
                    </div>
                </div>

                <div className="h-7 w-px bg-white/10 flex-shrink-0" />

                {/* Nazwa i Etykieta Klienta/Węzła (zastępuje Snapshot po lewej) */}
                {activeNode && (
                    <div className="flex items-center gap-3 animate-fade-in pr-4">
                        <div className="flex flex-col leading-tight">
                            <span className="text-sm font-bold text-white tracking-tight">{activeNode.name}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] font-black rounded border border-blue-500/30 uppercase tracking-tighter shadow-sm">
                                    {activeNode.customTypeLabel || activeNode.type}
                                </span>
                                {activeNode.region && (
                                    <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[9px] font-black rounded border border-purple-500/30 uppercase tracking-tighter shadow-sm">
                                        {activeNode.region}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Wyszukiwarka — zaraz obok węzła */}
                {showSearch && (
                    <div className="w-[260px] relative flex-shrink-0">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full h-8 pl-9 pr-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
                        />
                    </div>
                )}

                {!isOrder && <div className="flex-1" />}

                {/* Aktywne Zlecenie i Wersja */}
                {isOrder && (
                    <div className="flex items-center gap-4 flex-1">
                        <div className="h-4 w-px bg-white/10" />

                        <div className="relative">
                            <button
                                onClick={() => setShowVersionMenu(!showVersionMenu)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-all group"
                            >
                                <Layers size={12} className="text-blue-400" />
                                <span className="text-[11px] font-bold text-blue-300">Wersja: {currentVersion?.label || 'pierwszy'}</span>
                                <ChevronDown size={10} className={`text-blue-400/50 transition-transform ${showVersionMenu ? 'rotate-180' : ''}`} />
                            </button>

                            {showVersionMenu && (
                                <div className="absolute left-0 mt-2 w-48 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
                                    <div className="p-2 border-b border-white/5 bg-white/[0.02]">
                                        <button
                                            onClick={() => { handleCreateVersion(); setShowVersionMenu(false); }}
                                            className="w-full text-left px-3 py-2 text-[10px] font-bold text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors flex items-center gap-2"
                                        >
                                            <Plus size={12} /> Nowa wersja / Snapshot
                                        </button>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto p-1">
                                        {versions.map(v => (
                                            <div key={v.id} className="group relative flex items-center">
                                                <button
                                                    onClick={() => { if (renamingVersionId !== v.id) { setSelectedVersionId(v.id); setShowVersionMenu(false); } }}
                                                    className={`flex-1 text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-1 min-w-0 pr-2 ${selectedVersionId === v.id ? 'bg-white/10 text-white font-bold' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                                                >
                                                    {renamingVersionId === v.id ? (
                                                        <input
                                                            autoFocus
                                                            value={renameValue}
                                                            onChange={e => setRenameValue(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') { e.preventDefault(); handleRenameVersion(v.id, renameValue); }
                                                                if (e.key === 'Escape') setRenamingVersionId(null);
                                                            }}
                                                            onBlur={() => handleRenameVersion(v.id, renameValue)}
                                                            onClick={e => e.stopPropagation()}
                                                            className="flex-1 bg-white/10 text-white text-xs px-1 rounded outline-none border border-blue-500/50 min-w-0"
                                                        />
                                                    ) : (
                                                        <>
                                                            <span className="truncate flex-1">{v.label}</span>
                                                            {v.isActive && <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full shrink-0">ACTIVE</span>}
                                                        </>
                                                    )}
                                                </button>
                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all pr-1 shrink-0">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setRenamingVersionId(v.id); setRenameValue(v.label); }}
                                                        className="p-1 text-gray-500 hover:text-yellow-300"
                                                        title="Zmień nazwę"
                                                    >
                                                        <Pencil size={11} />
                                                    </button>
                                                    {!v.isActive && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleActivateVersion(v.id); setShowVersionMenu(false); }}
                                                            className="p-1 text-blue-500 hover:text-blue-300"
                                                            title="Przywróć jako aktywną"
                                                        >
                                                            <RotateCcw size={11} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteVersion(v.id); }}
                                                        className="p-1 text-gray-600 hover:text-red-400"
                                                        title="Usuń wersję"
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                )}


                <div className="flex items-center gap-3">
                    {/* Komunikacja — tylko dla zamówień */}
                    {isOrder && (
                        <button
                            onClick={() => setShowComments(v => !v)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all group shrink-0 ${showComments ? 'bg-teal-500/20 border-teal-500/30 text-teal-300' : 'bg-teal-500/10 border-teal-500/20 text-teal-400 hover:bg-teal-500/20'}`}
                            title="Komunikacja / Komentarze"
                        >
                            <MessageCircle size={14} className="group-hover:scale-110 transition-transform" />
                            <span className="text-[11px] font-bold">Czat</span>
                        </button>
                    )}
                    {/* Database Snapshot Button (przeniesiony stąd) */}
                    <button
                        onClick={handleSnapshot}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-all group shrink-0"
                        title="Snapshot bazy danych"
                    >
                        <Database size={14} className="text-purple-400 group-hover:scale-110 transition-transform" />
                        <span className="text-[11px] font-bold text-purple-300">Snapshot</span>
                    </button>
                </div>
            </header>

            {/* TAB SELECTOR */}
            <div className="px-4 flex border-b border-white/5 bg-white/[0.01] flex-shrink-0 z-10 overflow-x-auto scrollbar-none">
                {/* Zakładki obszaru Logistyka */}
                {isLogistykaArea && (
                    <>
                        <button onClick={() => handleTabChange('materialLists')}
                            className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all relative ${activeTab === 'materialLists' ? 'text-teal-400' : 'text-gray-500 hover:text-gray-300'}`}>
                            Listy Materiałowe
                            {activeTab === 'materialLists' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]" />}
                        </button>
                        <button onClick={() => handleTabChange('offers')}
                            className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all relative ${activeTab === 'offers' ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}>
                            Oferty
                            {activeTab === 'offers' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />}
                        </button>
                        <button onClick={() => handleTabChange('materialDatabase')}
                            className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all relative ${activeTab === 'materialDatabase' ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}>
                            Baza Materiałów
                            {activeTab === 'materialDatabase' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />}
                        </button>
                    </>
                )}

                {/* @anchor tab-site-info-order
                    „Informacje o lokalizacji" dla węzła type=order — JAKO PIERWSZA zakładka.
                    Komponent SiteInfoTab współdzielony z węzłami type=site (backend auto-create site row). */}
                {activeNode && activeNode.type === 'order' && !isWorker && !isLogistykaArea && (
                    <button onClick={() => handleTabChange('siteInfo')}
                        className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all relative ${activeTab === 'siteInfo' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>
                        <span className="md:hidden">Lokalizacja</span>
                        <span className="hidden md:inline">Informacje o Lokalizacji</span>
                        {activeTab === 'siteInfo' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />}
                    </button>
                )}

                {/* Informacje o węźle — niewidoczna dla pracownika i obszaru Logistyka */}
                {activeNode && !isWorker && !isLogistykaArea && (
                    <button onClick={() => handleTabChange('requirements')}
                        className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all relative ${activeTab === 'requirements' ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}>
                        <span className="md:hidden">Szczegóły</span>
                        <span className="hidden md:inline">{activeNode.customTypeLabel ? `Informacje o: ${activeNode.customTypeLabel}` :
                            activeNode.type === 'area' ? 'Informacje o Obszarze' :
                                activeNode.type === 'field' ? 'Informacje o Terenie' :
                                    activeNode.type === 'order' ? 'Informacje o Zamówieniu' :
                                        activeNode.type === 'site' ? 'Informacje o Lokalizacji' :
                                            'Informacje'}</span>
                        {activeTab === 'requirements' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />}
                    </button>
                )}


                {/* Reorderable tabs */}
                {tabOrder.map(tabId => {
                    const TAB_META = {
                        files:           { label: 'Dokumentacja',    color: 'blue',   activeColor: 'text-blue-400',   bar: 'bg-blue-500',   shadow: '59,130,246',  cond: !isLogistykaArea },
                        financialFiles:  { label: 'Pliki finansowe', color: 'amber',  activeColor: 'text-amber-400',  bar: 'bg-amber-500',  shadow: '245,158,11',  cond: isOrder && isManagerOrAdmin && !currentRoles.includes('LOGISTYK') },
                        unified:         { label: 'planowanie',      color: 'cyan',   activeColor: 'text-cyan-400',   bar: 'bg-cyan-500',   shadow: '6,182,212',   cond: isOrder },
                        schematics:      { label: 'Schemat',          color: 'orange', activeColor: 'text-orange-400', bar: 'bg-orange-500', shadow: '249,115,22',  cond: isOrder },
                        materialDatabase:{ label: 'Baza Materiałów',  color: 'purple', activeColor: 'text-purple-400', bar: 'bg-purple-500', shadow: '168,85,247',  cond: isOrder },
                    };
                    const meta = TAB_META[tabId];
                    if (!meta || !meta.cond) return null;
                    const isActive = activeTab === tabId;
                    return (
                        <button key={tabId}
                            onClick={() => handleTabChange(tabId)}
                            draggable
                            onDragStart={e => { setDragTabId(tabId); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                            onDrop={e => {
                                e.preventDefault();
                                if (!dragTabId || dragTabId === tabId) return;
                                const next = [...tabOrder];
                                const from = next.indexOf(dragTabId);
                                const to = next.indexOf(tabId);
                                next.splice(from, 1);
                                next.splice(to, 0, dragTabId);
                                setTabOrder(next);
                                localStorage.setItem('tabOrder', JSON.stringify(next));
                                setDragTabId(null);
                            }}
                            onDragEnd={() => setDragTabId(null)}
                            title="Przeciągnij aby zmienić kolejność"
                            className={`hidden md:flex px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all relative select-none cursor-grab active:cursor-grabbing ${isActive ? meta.activeColor : 'text-gray-500 hover:text-gray-300'} ${dragTabId === tabId ? 'opacity-40' : ''}`}>
                            {meta.label}
                            {isActive && <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${meta.bar} shadow-[0_0_10px_rgba(${meta.shadow},0.5)]`} />}
                        </button>
                    );
                })}
            </div>



            {/* CONTENT */}
            {!activeAreaId ? (
                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                    Wybierz element z drzewa
                </div>
            ) : (
            <div className="flex-1 overflow-y-auto min-h-0 relative scroll-smooth p-3 pb-10">
                    <div className="w-full h-full">
                        {activeTab === 'materialLists' && isLogistykaArea && (
                            <LogistykaMaterialListsTab
                                key={`materialLists-${activeAreaId}`}
                                menuTree={menuTree}
                                searchQuery={searchQuery}
                                onNavigateToOrder={handleNavigateToOrderPlanning}
                                userRoles={currentRoles}
                            />
                        )}
                        {activeTab === 'offers' && isLogistykaArea && (
                            <OffersTab key={`offers-${activeAreaId}`} nodeId={activeAreaId} searchQuery={searchQuery} isGlobal={true} />
                        )}
                        {activeTab === 'materialDatabase' && isLogistykaArea && (
                            <MaterialDatabaseTab key="materialDatabase" nodeId={activeAreaId} searchQuery={searchQuery} isGlobal={true} />
                        )}
                        {activeTab === 'materialDatabase' && isOrder && (
                            <MaterialDatabaseTab key={`materialDatabase-${activeAreaId}`} nodeId={activeAreaId} searchQuery={searchQuery} isGlobal={false} />
                        )}
                        {activeTab === 'files' && (
                            <PropertyPreview
                                key={`files-${activeAreaId}`}
                                nodeId={activeAreaId}
                                versionId={selectedVersionId}
                                searchQuery={searchQuery}
                            />
                        )}
                        {activeTab === 'financialFiles' && isManagerOrAdmin && (
                            <PropertyPreview
                                key={`financialFiles-${activeAreaId}`}
                                nodeId={activeAreaId}
                                versionId={selectedVersionId}
                                searchQuery={searchQuery}
                                isFinancialTab={true}
                            />
                        )}
                        {activeTab === 'unified' && isOrder && (
                            <div className="absolute inset-0 overflow-hidden">
                                <UnifiedWbsPanel
                                    nodeId={activeAreaId}
                                    versionId={selectedVersionId}
                                    projectName={parentNode?.name || ''}
                                    orderName={activeNode?.name || ''}
                                    searchQuery={searchQuery}
                                    userRoles={currentRoles}
                                    onWbsUpdate={() => setWbsUpdateCount(c => c + 1)}
                                    onWbsDataLoad={(data) => setWbsDataCache(prev => ({ ...prev, [activeAreaId]: data }))}
                                    setLeftVisible={setLeftVisible}
                                    setAiVisible={setAiVisible}
                                />
                            </div>
                        )}
                        {activeTab === 'schematics' && (
                           <div className="absolute inset-0 overflow-hidden">
                               <SchematTab
                                   key={`schematics-${activeAreaId}`}
                                   nodeId={activeAreaId}
                                   versionId={selectedVersionId}
                                   wbsData={wbsDataCache[activeAreaId]}
                                   orderName={activeNode?.name || ''}
                               />
                           </div>
                        )}
                        {activeTab === 'siteInfo' && activeNode?.type === 'order' && (
                            <SiteInfoTab
                                key={`site-info-order-${activeAreaId}`}
                                nodeId={activeAreaId}
                                nodeName={activeNode.name}
                            />
                        )}
                        {activeTab === 'requirements' && activeNode && (
                            activeNode.type === 'site' ? (
                                <SiteInfoTab
                                    key={`site-${activeAreaId}`}
                                    nodeId={activeAreaId}
                                    nodeName={activeNode.name}
                                />
                            ) : activeNode.type === 'order' ? (
                                <RequirementsTab
                                    key={`requirements-${activeAreaId}-${selectedVersionId}`}
                                    nodeId={activeAreaId}
                                    versionId={selectedVersionId}
                                    orderName={activeNode?.name || ''}
                                />
                            ) : (
                                <NodeInfoTab
                                    key={`node-info-${activeAreaId}`}
                                    nodeId={activeAreaId}
                                />
                            )
                        )}
                    </div>
            </div>
            )}
        </div>

        {/* Slide-over czatu */}
        {showComments && isOrder && (
            <CommentsSlideOver
                orderId={activeAreaId}
                orderName={activeNode?.name || ''}
                requirements={orderRequirements}
                onClose={() => setShowComments(false)}
            />
        )}
        </>
    );
}
