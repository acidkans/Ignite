import { API_URL } from './config';
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import AddNodeModal from './components/shared/AddNodeModal';
import NodePermissionsModal from './components/shared/NodePermissionsModal';
import HardwareModal from './components/shared/HardwareModal';
import SiteDetailsPanel from './components/shared/SiteDetailsPanel';
import DefaultProjectItemsPanel from './components/shared/DefaultProjectItemsPanel';

export default function ProcessTreePage() {
    const { refreshTree: refreshMainTree } = useOutletContext() || {};
    const [tab, setTab] = useState('tree'); // 'tree' | 'defaults'
    const [tree, setTree] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedParent, setSelectedParent] = useState(null);
    const [selectedNodeForPermissions, setSelectedNodeForPermissions] = useState(null);
    const [selectedSiteForHardware, setSelectedSiteForHardware] = useState(null);
    const [selectedSiteForDetails, setSelectedSiteForDetails] = useState(null);

    useEffect(() => {
        fetchTree();
    }, []);

    const fetchTree = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/process-tree?t=${Date.now()}`, {
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });

            if (!res.ok) {
                if (res.status === 403) throw new Error('Brak uprawnień do przeglądania drzewa');
                throw new Error('Błąd pobierania drzewa');
            }

            const data = await res.json();
            setTree(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (nodeId, nodeName) => {
        if (!window.confirm(`Czy na pewno chcesz usunąć "${nodeName}" i wszystkie elementy podrzędne?`)) {
            return;
        }

        try {
            console.log('Sending DELETE request for:', nodeId);
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/process-tree/${nodeId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            console.log('DELETE response status:', res.status);

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Błąd usuwania węzła: ${res.status} ${text}`);
            }

            console.log('Deletion successful, refreshing tree...');
            await fetchTree(); // Refresh local tree
            if (refreshMainTree) refreshMainTree(); // Refresh sidebar
        } catch (err) {
            console.error('Delete error:', err);
            alert(err.message);
        }
    };

    const handleAddChild = (parentNode) => {
        setSelectedParent(parentNode);
        setShowAddModal(true);
    };

    const handleAddRoot = () => {
        setSelectedParent(null);
        setShowAddModal(true);
    };

    const handleNodeSuccess = async () => {
        setShowAddModal(false);
        await fetchTree();
        if (refreshMainTree) refreshMainTree();
    };

    const handleRefresh = async () => {
        await fetchTree();
        if (refreshMainTree) refreshMainTree();
    };

    if (loading) return (
        <div className="p-8 text-center text-gray-400 animate-fade-in">
            <div className="inline-block w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="mt-4">Ładowanie drzewa...</p>
        </div>
    );

    if (error) return (
        <div className="p-8 text-center text-red-400 animate-fade-in">
            <div className="text-4xl mb-4">⚠️</div>
            <p>{error}</p>
        </div>
    );

    return (
        <div className="p-8 w-full h-full animate-fade-in flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                    🌲 Drzewo Procesów
                </h2>
                {tab === 'tree' && (
                    <button
                        onClick={handleAddRoot}
                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg shadow-lg transform transition-all active:scale-95"
                    >
                        + Nowy Obszar
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-5 bg-black/20 p-1 rounded-xl w-fit">
                <button
                    onClick={() => setTab('tree')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'tree' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Drzewo
                </button>
                <button
                    onClick={() => setTab('defaults')}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'defaults' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Domyślne przedmioty
                </button>
            </div>

            {tab === 'defaults' && <DefaultProjectItemsPanel />}

            {tab === 'tree' && (tree.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <div className="text-6xl mb-4 opacity-20">🌳</div>
                        <p className="text-lg">Brak elementów w drzewie</p>
                        <p className="text-sm mt-2">Kliknij "Nowy Obszar" aby rozpocząć</p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-auto glass-panel p-4 rounded-xl">
                    {tree
                        .filter(node => node.type !== 'document')
                        .map(node => (
                            <TreeNode
                                key={node.id}
                                node={node}
                                onDelete={handleDelete}
                                onAddChild={handleAddChild}
                                onRefresh={handleRefresh}
                                onPermissions={setSelectedNodeForPermissions}
                                onHardware={setSelectedSiteForHardware}
                                onEditSite={setSelectedSiteForDetails}
                            />
                        ))}
                </div>
            ))}

            {showAddModal && (
                <AddNodeModal
                    parent={selectedParent}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={handleNodeSuccess}
                />
            )}

            {selectedNodeForPermissions && (
                <NodePermissionsModal
                    node={selectedNodeForPermissions}
                    onClose={() => setSelectedNodeForPermissions(null)}
                    onSuccess={() => {
                        setSelectedNodeForPermissions(null);
                        handleRefresh();
                    }}
                />
            )}

            {selectedSiteForHardware && (
                <HardwareModal
                    site={selectedSiteForHardware}
                    onClose={() => setSelectedSiteForHardware(null)}
                />
            )}

            {selectedSiteForDetails && (
                <SiteDetailsPanel
                    siteId={selectedSiteForDetails.id}
                    onClose={() => setSelectedSiteForDetails(null)}
                />
            )}
        </div>
    );
}

// Recursive TreeNode Component
function TreeNode({ node, onDelete, onAddChild, onRefresh, onPermissions, onHardware, onEditSite, depth = 0 }) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(node.name);

    const [editingLabel, setEditingLabel] = useState(false);
    const [editLabel, setEditLabel] = useState(node.customTypeLabel || '');

    const handleSave = async () => {
        if (editName.trim() === node.name) {
            setEditing(false);
            return;
        }

        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/process-tree/${node.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: editName.trim() })
            });

            if (!res.ok) throw new Error('Błąd zapisu');

            setEditing(false);
            onRefresh();
        } catch (err) {
            alert(err.message);
            setEditName(node.name);
            setEditing(false);
        }
    };

    const handleSaveLabel = async () => {
        if (editLabel.trim() === (node.customTypeLabel || '')) {
            setEditingLabel(false);
            return;
        }

        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(`${API_URL}/process-tree/${node.id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ customTypeLabel: editLabel.trim().toUpperCase() })
            });

            if (!res.ok) throw new Error('Błąd zapisu etykiety');

            setEditingLabel(false);
            onRefresh();
        } catch (err) {
            alert(err.message);
            setEditLabel(node.customTypeLabel || '');
            setEditingLabel(false);
        }
    };

    const typeLabels = {
        area: '📁',
        field: '📂',
        order: '📋',
        site: '📍',
    };

    const typeColors = {
        area: 'text-blue-400',
        field: 'text-purple-400',
        order: 'text-green-400',
        site: 'text-yellow-400',
    };

    const currentLabel = node.customTypeLabel || node.type;

    return (
        <div className="mb-1">
            <div
                className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-white/5 transition-colors group ${depth > 0 ? 'ml-6' : ''}`}
                style={{ paddingLeft: `${depth * 24 + 12}px` }}
            >
                {/* Expand/Collapse button */}
                {node.children && node.children.length > 0 && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
                    >
                        {expanded ? '▼' : '▶'}
                    </button>
                )}

                {/* Type icon */}
                <span className={`text-lg ${typeColors[node.type]}`}>
                    {typeLabels[node.type] || '📄'}
                </span>

                {/* Visibility indicator */}
                <span className="text-xs" title={node.isPublic ? 'Publiczny' : 'Prywatny/Ograniczony'}>
                    {node.isPublic ? '🔓' : '🔒'}
                </span>

                {/* Name (editable) */}
                {editing ? (
                    <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave();
                            if (e.key === 'Escape') {
                                setEditName(node.name);
                                setEditing(false);
                            }
                        }}
                        className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500 min-w-0"
                        autoFocus
                    />
                ) : (
                    <span
                        onDoubleClick={() => setEditing(true)}
                        className="flex-1 text-gray-200 cursor-pointer hover:text-white truncate font-medium"
                        title="Podwójne kliknięcie, aby zmienić nazwę"
                    >
                        {node.name}
                    </span>
                )}

                {/* Type badge (editable) */}
                {editingLabel ? (
                    <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onBlur={handleSaveLabel}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveLabel();
                            if (e.key === 'Escape') {
                                setEditLabel(node.customTypeLabel || '');
                                setEditingLabel(false);
                            }
                        }}
                        className="w-24 bg-blue-500/10 border border-blue-500/30 rounded px-1.5 py-0.5 text-[10px] text-blue-400 font-bold uppercase focus:outline-none focus:border-blue-500"
                        autoFocus
                        placeholder={node.type.toUpperCase()}
                    />
                ) : (
                    <button
                        onClick={() => setEditingLabel(true)}
                        className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded border border-blue-500/20 hover:bg-blue-500/20 transition-all uppercase tracking-wider"
                        title="Kliknij, aby zmienić etykietę typu (np. na Klient)"
                    >
                        {currentLabel}
                    </button>
                )}

                {/* Action buttons (visible on hover) */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    {node.type === 'site' && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); onHardware(node); }}
                                className="p-1.5 text-yellow-400 hover:bg-yellow-500/20 rounded transition-colors"
                                title="Zarządzaj sprzętem"
                            >
                                🛠️
                            </button>
                            <button
                                className="p-1.5 text-cyan-400 hover:bg-cyan-500/20 rounded transition-colors"
                                title="Edytuj szczegóły Lokalizacji"
                                onClick={(e) => { e.stopPropagation(); onEditSite(node); }}
                            >
                                📝
                            </button>
                        </>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onPermissions(node); }}
                        className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                        title="Zarządzaj uprawnieniami"
                    >
                        🛡️
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onAddChild(node); }}
                        className="p-1.5 text-green-400 hover:bg-green-500/20 rounded transition-colors"
                        title="Dodaj element podrzędny"
                    >
                        ➕
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(node.id, node.name); }}
                        className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                        title="Usuń"
                    >
                        🗑️
                    </button>
                </div>
            </div>

            {/* Children */}
            {expanded && node.children && node.children.length > 0 && (
                <div>
                    {node.children
                        .filter(child => child.type !== 'document')
                        .map(child => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                onDelete={onDelete}
                                onAddChild={onAddChild}
                                onRefresh={onRefresh}
                                onPermissions={onPermissions}
                                onHardware={onHardware}
                                onEditSite={onEditSite}
                                depth={depth + 1}
                            />
                        ))}
                </div>
            )}
        </div>
    );
}
