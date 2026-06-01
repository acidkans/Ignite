import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, ArrowLeft, Network, X } from 'lucide-react';
import SchematicViewer from '../shared/SchematicViewer';
import { API_URL } from '../../config';

const NODE_ICONS = { area: '📁', field: '📂', order: '📋', site: '📍', subtask: '✅' };

// @anchor mobile-tree-node
function TreeNode({ node, onSelectNode, level }) {
    const [expanded, setExpanded] = useState(false);
    const children = (node.children || []).filter(c => c.type !== 'document');
    const hasChildren = children.length > 0;

    return (
        <div>
            <button
                className="w-full text-left flex items-center gap-2 py-2.5 rounded-xl active:bg-white/5 transition-colors"
                style={{ paddingLeft: `${12 + level * 16}px`, paddingRight: '12px' }}
                onClick={() => {
                    if (hasChildren) setExpanded(e => !e);
                    onSelectNode(node);
                }}
            >
                <span className="w-4 flex-shrink-0 flex items-center justify-center">
                    {hasChildren
                        ? (expanded
                            ? <ChevronDown size={13} className="text-gray-500" />
                            : <ChevronRight size={13} className="text-gray-500" />)
                        : null}
                </span>
                <span className="text-sm flex-shrink-0">{NODE_ICONS[node.type] || '📄'}</span>
                <span className="text-sm text-gray-200 truncate">{node.name}</span>
            </button>
            {expanded && hasChildren && children.map(child => (
                <TreeNode key={child.id} node={child} onSelectNode={onSelectNode} level={level + 1} />
            ))}
        </div>
    );
}

// @anchor mobile-orders-tree
export default function MobileOrdersTree({ onBack }) {
    const [tree, setTree] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState(null);

    useEffect(() => {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) return;
        fetch(`${API_URL}/process-tree`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(setTree)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const rootAreas = tree.filter(n => n.type === 'area');

    return (
        <div className="flex flex-col h-full bg-gray-950 text-white">
            <header className="px-4 py-3 border-b border-white/5 bg-gray-900/50 backdrop-blur-xl flex items-center gap-3 flex-shrink-0">
                <button onClick={onBack} className="p-2 rounded-xl bg-white/5 active:scale-90 transition-transform flex-shrink-0">
                    <ArrowLeft size={18} className="text-gray-400" />
                </button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 flex items-center justify-center font-black shadow-lg flex-shrink-0">
                        <span className="text-[10px]">ERP</span>
                    </div>
                    <span className="font-bold text-sm truncate">Drzewo Zamówień</span>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="w-6 h-6 border-2 border-gray-500/30 border-t-gray-400 rounded-full animate-spin" />
                    </div>
                ) : rootAreas.length === 0 ? (
                    <p className="text-center text-gray-600 text-sm mt-10">Brak danych</p>
                ) : (
                    <div className="space-y-0.5">
                        {rootAreas.map(area => (
                            <TreeNode key={area.id} node={area} onSelectNode={setSelectedNode} level={0} />
                        ))}
                    </div>
                )}
            </main>

            <nav className="h-20 pb-4 border-t border-white/5 bg-gray-950/80 backdrop-blur-2xl flex items-center justify-around px-8 flex-shrink-0 z-10">
                <div className="flex flex-col items-center gap-1.5 text-teal-500 relative">
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full absolute -top-3 shadow-[0_0_10px_rgba(20,184,166,0.8)]" />
                    <Network size={22} className="drop-shadow-[0_0_8px_rgba(20,184,166,0.3)]" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Drzewo</span>
                </div>
            </nav>

            {/* @anchor mobile-tree-schematic-panel */}
            {selectedNode && (
                <>
                    <div className="fixed inset-0 bg-black/80 z-[99]" onClick={() => setSelectedNode(null)} />
                    <div className="fixed inset-x-0 bottom-0 top-16 bg-gray-950 border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col z-[100] rounded-t-[32px] overflow-hidden">
                        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-pointer" onClick={() => setSelectedNode(null)}>
                            <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                        </div>
                        <header className="px-4 py-2.5 flex items-center gap-3 border-b border-white/5 flex-shrink-0">
                            <div className="p-2 bg-teal-500/20 rounded-xl flex-shrink-0">
                                <Network size={16} className="text-teal-400" />
                            </div>
                            <h3 className="font-black text-sm text-white flex-1 truncate">{selectedNode.name}</h3>
                            <button onClick={() => setSelectedNode(null)} className="p-2 bg-white/10 rounded-full text-white active:scale-90 transition-all flex-shrink-0">
                                <X size={18} />
                            </button>
                        </header>
                        <div className="flex-1 min-h-0">
                            <SchematicViewer nodeId={selectedNode.id} />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
