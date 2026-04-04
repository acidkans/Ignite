import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, Package } from 'lucide-react';
import { API_URL } from '../../config';
import PropertyPreview from './PropertyPreview';


// ─── Sekcja zwijalna ──────────────────────────────────────────────────────────
function CollapsibleSection({ title, open, onHeaderClick, onHeaderDblClick, children, accent = 'teal', count, focused }) {
    const colors = {
        teal:   { bar: 'bg-teal-500',   text: 'text-teal-400',   border: 'border-teal-500/20',   bg: 'bg-teal-500/5'   },
        amber:  { bar: 'bg-amber-500',  text: 'text-amber-400',  border: 'border-amber-500/20',  bg: 'bg-amber-500/5'  },
    };
    const c = colors[accent] || colors.teal;
    return (
        <div className={`border ${c.border} rounded-xl overflow-hidden flex flex-col ${focused ? 'flex-1 min-h-0' : ''}`}>
            <div
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors select-none flex-shrink-0 ${c.bg}`}
                onClick={onHeaderClick}
                onDoubleClick={onHeaderDblClick}
                title="Kliknij aby rozwinąć na cały ekran · Dwuklik aby zwinąć wszystkie"
            >
                <ChevronDown size={14} className={`${c.text} transition-transform duration-200 flex-shrink-0 ${open ? '' : '-rotate-90'}`} />
                <span className={`text-sm font-bold ${c.text} flex-1`}>{title}</span>
                {count !== undefined && (
                    <span className="text-[10px] font-bold text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">{count}</span>
                )}
            </div>
            {open && <div className="border-t border-white/5 flex-1 min-h-0 overflow-auto">{children}</div>}
        </div>
    );
}

// ─── Tabela ofert (dokumenty z parsedPositions) ──────────────────────────────
function OffersTable({ nodeId, refreshKey, searchQuery = '', isGlobal = false }) {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState(new Set());

    const q = searchQuery.trim().toLowerCase();
    const filteredDocs = useMemo(() => {
        if (!q) return docs;
        return docs.filter(doc => {
            if ((doc.fileName || '').toLowerCase().includes(q)) return true;
            return (doc.positions || []).some(p =>
                (p.name || '').toLowerCase().includes(q) ||
                (p.description || '').toLowerCase().includes(q) ||
                (p.manufacturer || '').toLowerCase().includes(q) ||
                (p.model || '').toLowerCase().includes(q)
            );
        });
    }, [docs, q]);

    useEffect(() => {
        if (!nodeId && !isGlobal) return;
        setLoading(true);
        const token = sessionStorage.getItem('token');
        const url = isGlobal ? `${API_URL}/offers` : `${API_URL}/offers/node/${nodeId}`;
        fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.ok ? r.json() : [])
            .then(data => setDocs(Array.isArray(data) ? data : []))
            .catch(() => setDocs([]))
            .finally(() => setLoading(false));
    }, [nodeId, refreshKey]);

    const toggle = (id) => setExpandedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const handleDelete = async (id) => {
        if (!confirm('Usunąć tę ofertę z listy?')) return;
        const token = sessionStorage.getItem('token');
        await fetch(`${API_URL}/offers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        setDocs(prev => prev.filter(d => d.id !== id));
    };

    if (loading) return <div className="flex items-center justify-center py-8 text-gray-500 text-sm">Ładowanie…</div>;

    if (filteredDocs.length === 0) return (
        <div className="flex flex-col items-center justify-center py-10 text-gray-500 gap-2">
            <Package size={24} className="opacity-30" />
            <span className="text-sm">{q ? `Brak wyników dla „${q}"` : 'Brak zatwierdzonych ofert z pozycjami'}</span>
        </div>
    );

    return (
        <div className="p-3 flex flex-col gap-2">
            {filteredDocs.map(doc => {
                const isOpen = expandedIds.has(doc.id) || (!!q && filteredDocs.length <= 3);
                const positions = doc.positions || [];
                return (
                    <div key={doc.id} className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01]">
                        <div className="flex items-center gap-3 px-4 py-3 select-none">
                            <ChevronDown size={13} className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? '' : '-rotate-90'}`} />
                            <span
                                className="text-sm font-semibold text-gray-200 flex-1 truncate cursor-pointer hover:text-white transition-colors"
                                onClick={() => toggle(doc.id)}
                            >{doc.fileName}</span>
                            <span className="text-[10px] text-gray-500 shrink-0">{positions.length} poz.</span>
                            <span className="text-[10px] text-gray-600 shrink-0">{new Date(doc.createdAt).toLocaleDateString('pl-PL')}</span>
                            <button onClick={e => { e.stopPropagation(); handleDelete(doc.id); }} className="p-1 text-gray-600 hover:text-red-400 transition-colors ml-1" title="Usuń ofertę">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                        </div>

                        {isOpen && (
                            <div className="border-t border-white/10 overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-white/[0.02] border-b border-white/5">
                                            <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider w-8">Lp.</th>
                                            <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">Nazwa</th>
                                            <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">Ilość</th>
                                            <th className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">Jedn.</th>
                                            <th className="text-right px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider">Cena netto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {positions.map((p, i) => (
                                            <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                                <td className="px-3 py-2 text-gray-600 text-center">{p.lp ?? i + 1}</td>
                                                <td className="px-3 py-2 text-gray-200 max-w-[220px]">
                                                    <span className="line-clamp-2" title={p.description || p.name}>{p.description || p.name || '—'}</span>
                                                    {p.manufacturer && <span className="text-[10px] text-gray-500 block">{p.manufacturer}{p.model ? ` · ${p.model}` : ''}</span>}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-300">{p.quantity ?? '—'}</td>
                                                <td className="px-3 py-2 text-gray-500">{p.unit || '—'}</td>
                                                <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">
                                                    {p.priceNetto != null ? `${Number(p.priceNetto).toFixed(2)} zł` : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Główny komponent ─────────────────────────────────────────────────────────
export default function OffersTab({ nodeId, searchQuery = '', isGlobal = false }) {
    // null = wszystkie zwinięte, 'upload' | 'list' = jedna sekcja na pełny ekran
    const [focusedSection, setFocusedSection] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const handleApprove = async (positions, documentId, fileName) => {
        try {
            const token = sessionStorage.getItem('token');
            await fetch(`${API_URL}/offers`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodeId, fileName, positions, documentId }),
            });
        } catch (e) {
            console.error('Błąd zapisu oferty:', e);
        }
        setRefreshKey(k => k + 1);
    };

    const handleClick = (section) => setFocusedSection(section);
    const handleDblClick = () => setFocusedSection(null);

    return (
        <div className="flex flex-col gap-3 h-full">
            {(focusedSection === null || focusedSection === 'upload') && (
                <CollapsibleSection
                    title="Wgrywanie ofert"
                    accent="amber"
                    open={focusedSection === 'upload'}
                    focused={focusedSection === 'upload'}
                    onHeaderClick={() => handleClick('upload')}
                    onHeaderDblClick={handleDblClick}
                >
                    <PropertyPreview
                        nodeId={nodeId}
                        isOfferTab={true}
                        onApprove={handleApprove}
                    />
                </CollapsibleSection>
            )}

            {(focusedSection === null || focusedSection === 'list') && (
                <CollapsibleSection
                    title="Lista ofert"
                    accent="teal"
                    open={focusedSection === 'list'}
                    focused={focusedSection === 'list'}
                    onHeaderClick={() => handleClick('list')}
                    onHeaderDblClick={handleDblClick}
                >
                    <OffersTable nodeId={nodeId} refreshKey={refreshKey} searchQuery={searchQuery} isGlobal={isGlobal} />
                </CollapsibleSection>
            )}
        </div>
    );
}
