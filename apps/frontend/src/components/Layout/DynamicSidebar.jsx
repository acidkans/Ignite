import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_URL } from '../../config';

// Rekurencyjne filtrowanie drzewa — zwraca węzeł jeśli on lub potomek pasuje do frazy
function filterNode(node, query) {
    const match = node.name.toLowerCase().includes(query);
    const filteredChildren = (node.children || [])
        .map(child => filterNode(child, query))
        .filter(Boolean);
    if (match || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children };
    }
    return null;
}

export default function DynamicSidebar({ menuTree, activeAreaId, setActiveAreaId, onAddNode, onDeleteNode, onPermissions, loading, userRoles = [], onReloadTree }) {
    const canManageTree = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
    const navigate = useNavigate();
    const location = useLocation();
    const [filter, setFilter] = useState('');
    // @anchor sidebar-drag-id
    const [dragId, setDragId] = useState(null);
    // @anchor sidebar-drag-over-id
    const [dragOverId, setDragOverId] = useState(null);

    // @anchor handle-sidebar-move
    const handleSidebarMove = async (sourceId, targetId) => {
        if (!sourceId || sourceId === targetId) return;
        const token = sessionStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/process-tree/${sourceId}/move`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ newParentId: targetId }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(`Nie udało się przenieść: ${err.message || res.statusText}`);
                return;
            }
            onReloadTree?.();
        } catch (e) {
            alert(`Błąd sieci podczas przenoszenia: ${e.message}`);
        }
    };
    const [unreadOrderIds, setUnreadOrderIds] = useState(new Set());

    useEffect(() => {
        const token = sessionStorage.getItem('token');
        if (!token) return;
        const load = async () => {
            const res = await fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return;
            const data = await res.json();
            const ids = new Set(data.filter(n => !n.readAt && n.orderId).map(n => n.orderId));
            setUnreadOrderIds(ids);
        };
        load();
        const id = setInterval(load, 30000);
        return () => clearInterval(id);
    }, []);

    if (loading) {
        return (
            <div className="px-4 py-8 text-center text-gray-500">
                <div className="inline-block w-6 h-6 border-2 border-gray-500/30 border-t-gray-500 rounded-full animate-spin"></div>
                <p className="mt-2 text-xs">Ładowanie...</p>
            </div>
        );
    }

    const isLogistyk = userRoles.includes('LOGISTYK');

    const query = filter.trim().toLowerCase();
    const rootAreas = menuTree.filter(node => node.type === 'area');
    const filteredAreas = query
        ? rootAreas.map(a => filterNode(a, query)).filter(Boolean)
        : rootAreas;
    const visibleAreas = [...filteredAreas].sort((a, b) => a.name === 'Logistyka' ? 1 : b.name === 'Logistyka' ? -1 : 0);

    return (
        <div className="space-y-4">
            {/* Dynamic Areas */}
            {rootAreas.length > 0 && (
                <div>
                    <div className="px-2 py-1.5 bg-white/[0.03] border-y border-white/[0.05] mb-1">
                        <input
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            placeholder="Szukaj..."
                            className="w-full bg-transparent border-none text-[10px] font-bold text-gray-400 uppercase tracking-widest placeholder:text-gray-500 placeholder:font-bold placeholder:uppercase placeholder:tracking-widest focus:outline-none"
                        />
                    </div>
                    <div className="space-y-0.5">
                        {visibleAreas.length === 0
                            ? <p className="px-3 py-2 text-[11px] text-gray-600 italic">Brak wyników</p>
                            : visibleAreas.map(area => (
                                <AreaWithChildren
                                    key={area.id}
                                    node={area}
                                    activeAreaId={activeAreaId}
                                    setActiveAreaId={setActiveAreaId}
                                    onAddNode={onAddNode}
                                    onDeleteNode={onDeleteNode}
                                    onPermissions={onPermissions}
                                    forceExpanded={!!query}
                                    unreadOrderIds={unreadOrderIds}
                                    isLogistykArea={!isLogistyk && area.name === 'Logistyka'}
                                    canManageTree={canManageTree}
                                    dragId={dragId}
                                    setDragId={setDragId}
                                    dragOverId={dragOverId}
                                    setDragOverId={setDragOverId}
                                    onSidebarMove={handleSidebarMove}
                                />
                            ))
                        }
                    </div>
                </div>
            )}

            {/* Static System Menu */}
            <div>
                <p className="px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-white/[0.03] border-y border-white/[0.05] mb-1">System</p>
                <div className="space-y-0.5">
                    <button
                        onClick={() => navigate('/users')}
                        title="Użytkownicy"
                        className={`w-full text-left px-2 py-1.5 text-xs transition-colors rounded-md
                            ${location.pathname === '/users'
                                ? 'text-blue-400 bg-blue-500/10'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                            }
                        `}
                    >
                        Użytkownicy
                    </button>
                    {canManageTree && (
                        <button
                            onClick={() => navigate('/process-tree')}
                            title="Zarządzanie Drzewem"
                            className={`w-full text-left px-2 py-1.5 text-xs transition-colors rounded-md
                                ${location.pathname === '/process-tree'
                                    ? 'text-blue-400 bg-blue-500/10'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                                }
                            `}
                        >
                            Zarządzanie Drzewem
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function nodeContainsId(node, id) {
    if (String(node.id) === String(id)) return true;
    return (node.children || []).some(c => nodeContainsId(c, id));
}

function AreaWithChildren({ node, activeAreaId, setActiveAreaId, onAddNode, onDeleteNode, onPermissions, level = 0, forceExpanded = false, unreadOrderIds = new Set(), isLogistykArea = false, canManageTree = false, dragId = null, setDragId = () => {}, dragOverId = null, setDragOverId = () => {}, onSidebarMove }) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(node.name);
    const inputRef = useRef(null);

    // Auto-rozwijaj gdy aktywne zamówienie jest w poddrzewie (np. po kliknięciu powiadomienia)
    useEffect(() => {
        if (activeAreaId && nodeContainsId(node, activeAreaId)) setExpanded(true);
    }, [activeAreaId, node]);

    const isExpanded = forceExpanded || expanded;
    const nonDocumentChildren = node.children ? node.children.filter(child => child.type !== 'document') : [];
    const hasChildren = nonDocumentChildren.length > 0;

    const getIcon = (type) => {
        const icons = { area: '📁', field: '📂', order: '📋', site: '📍', subtask: '✅' };
        return icons[type] || '📄';
    };

    const handleItemClick = (e) => {
        if (editing) return;
        e.preventDefault();
        e.stopPropagation();
        setActiveAreaId(String(node.id));
    };

    const startEditing = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setEditName(node.name);
        setEditing(true);
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
    };

    const saveEdit = async () => {
        const trimmed = editName.trim();
        setEditing(false);
        if (!trimmed || trimmed === node.name) return;
        const token = sessionStorage.getItem('token');
        await fetch(`/api/process-tree/${node.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: trimmed }),
        });
        node.name = trimmed; // optimistic local update
    };

    const cancelEdit = () => { setEditing(false); setEditName(node.name); };

    const isActive = String(activeAreaId) === String(node.id);

    return (
        <div>
            {isLogistykArea && <div className="my-1.5 border-t border-white/10" />}
            <div className="relative group">
                <div
                    onClick={handleItemClick}
                    title={editing ? undefined : node.name}
                    draggable={canManageTree && !editing}
                    onDragStart={canManageTree ? (e) => {
                        e.stopPropagation();
                        setDragId(node.id);
                        e.dataTransfer.effectAllowed = 'move';
                        try { e.dataTransfer.setData('application/process-node-id', String(node.id)); } catch {}
                    } : undefined}
                    onDragOver={canManageTree ? (e) => {
                        if (!dragId || dragId === node.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverId !== node.id) setDragOverId(node.id);
                    } : undefined}
                    onDragLeave={canManageTree ? (e) => {
                        if (e.currentTarget.contains(e.relatedTarget)) return;
                        if (dragOverId === node.id) setDragOverId(null);
                    } : undefined}
                    onDrop={canManageTree ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const src = dragId;
                        setDragId(null);
                        setDragOverId(null);
                        if (src && src !== node.id) onSidebarMove?.(src, node.id);
                    } : undefined}
                    onDragEnd={canManageTree ? () => { setDragId(null); setDragOverId(null); } : undefined}
                    className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-1.5 transition-all duration-200 cursor-pointer
                        ${isActive && !editing
                            ? 'bg-blue-600/30 text-white border border-blue-500/40 shadow-lg'
                            : isLogistykArea
                                ? 'text-amber-500/70 hover:bg-white/5 hover:text-amber-400'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                        }
                        ${dragOverId === node.id && dragId && dragId !== node.id ? 'ring-2 ring-blue-400 ring-inset bg-blue-500/10' : ''}
                        ${dragId === node.id ? 'opacity-40' : ''}
                    `}
                    style={{ paddingLeft: `${level * 10 + 8}px` }}
                >
                    {/* Expand/Collapse button */}
                    {hasChildren ? (
                        <span
                            className="text-[10px] w-4 h-4 flex items-center justify-center hover:bg-white/20 rounded-sm cursor-pointer flex-shrink-0"
                            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        >
                            {isExpanded ? '▼' : '▶'}
                        </span>
                    ) : (
                        <span className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className={`text-xs scale-90 flex-shrink-0${isLogistykArea ? ' opacity-60 saturate-0' : ''}`}
                        style={isLogistykArea ? { filter: 'sepia(1) hue-rotate(180deg) saturate(3) brightness(1.2)' } : undefined}
                    >{getIcon(node.type)}</span>
                    {editing ? (
                        <input
                            ref={inputRef}
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
                                if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                                e.stopPropagation();
                            }}
                            onClick={e => e.stopPropagation()}
                            className="flex-1 bg-black/40 border border-blue-500/50 rounded px-1.5 py-0.5 text-[13px] text-white focus:outline-none focus:border-blue-400 min-w-0"
                        />
                    ) : (
                        <span
                            className="font-medium flex-1 text-[13px] truncate flex items-center gap-1.5"
                            onDoubleClick={startEditing}
                            title="Podwójne kliknięcie — zmień nazwę"
                        >
                            {node.name}
                            {unreadOrderIds.has(node.id) && (
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" title="Nieprzeczytane komentarze" />
                            )}
                        </span>
                    )}
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onAddNode(node); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onAddNode(node); } }}
                        className="w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-green-500/30 text-green-400 rounded transition-all text-[10px] flex-shrink-0 cursor-pointer"
                        title="Dodaj podgałąź"
                    >
                        +
                    </span>
                </div>
            </div>

            {isExpanded && hasChildren && (
                <div className="mt-0.5 animate-fade-in">
                    {nonDocumentChildren.map(child => (
                        <AreaWithChildren
                            key={child.id}
                            node={child}
                            activeAreaId={activeAreaId}
                            setActiveAreaId={setActiveAreaId}
                            onAddNode={onAddNode}
                            onDeleteNode={onDeleteNode}
                            onPermissions={onPermissions}
                            level={level + 1}
                            forceExpanded={forceExpanded}
                            unreadOrderIds={unreadOrderIds}
                            canManageTree={canManageTree}
                            dragId={dragId}
                            setDragId={setDragId}
                            dragOverId={dragOverId}
                            setDragOverId={setDragOverId}
                            onSidebarMove={onSidebarMove}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
