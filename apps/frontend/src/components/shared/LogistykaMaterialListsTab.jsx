import { useState, useMemo, useEffect } from 'react';
import { ExternalLink, ChevronDown, Maximize2, Minimize2, Package } from 'lucide-react';
import { API_URL } from '../../config';
import WbsMaterialsPanel from './wbs/WbsMaterialsPanel';
import OfferLockGuard, { useOfferLock } from './OfferLockGuard';

function getAllOrders(nodes) {
    const result = [];
    for (const node of nodes || []) {
        if (node.type === 'order') result.push(node);
        if (node.children?.length) result.push(...getAllOrders(node.children));
    }
    return result;
}

// @anchor logistyka-order-materials-view — skrót do widoku WBS/Materiały dla pojedynczego
// zamówienia. Renderuje ten sam `WbsMaterialsPanel` co sekcja „Materiały" w UnifiedWbsPanel
// (razem z BaselineSplitCard po rozwinięciu wiersza), więc logistyk pracuje na dokładnie tym
// samym widoku, a nie na osobnej liście materiałowej.
function OrderMaterialsView({ orderId, isManagerOrAdmin, isLogistyk }) {
    // Akceptacja baseline steruje kolumną „Koszt jedn. zakupu" i zamrożeniem strony „Wycena".
    // UnifiedWbsPanel pobiera to samo z /orders/:id/acceptance — tu musimy pobrać sami,
    // bo panel jest osadzony poza WBS.
    const [acceptance, setAcceptance] = useState(null);
    const { locked: offerLocked } = useOfferLock();

    useEffect(() => {
        setAcceptance(null);
        if (!orderId) return;
        let cancelled = false;
        fetch(`${API_URL}/orders/${orderId}/acceptance`, {
            headers: { Authorization: `Bearer ${sessionStorage.getItem('token') || localStorage.getItem('token')}` },
        })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (!cancelled) setAcceptance(d?.acceptedVersionId ? d : null); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [orderId]);

    const accepted = !!acceptance?.acceptedVersionId;

    return (
        <>
            <WbsMaterialsPanel
                nodeId={String(orderId)}
                readOnly={!isManagerOrAdmin && !isLogistyk}
                accepted={accepted}
                offerLocked={offerLocked}
            />
            {/* Modal blokady wartości ofertowych — bez niego kliknięcie w zamrożone pole nie
                miałoby jak pokazać komunikatu (guard żyje w module-store, nie w kontekście). */}
            <OfferLockGuard
                accepted={accepted}
                versionLabel={acceptance?.acceptedVersion?.label}
                canOverride={isManagerOrAdmin}
            />
        </>
    );
}

export default function LogistykaMaterialListsTab({ menuTree = [], onNavigateToOrder, searchQuery = '', userRoles = [] }) {
    const [expandedId, setExpandedId] = useState(null);
    const [fullscreenId, setFullscreenId] = useState(null);

    const orders = useMemo(() => getAllOrders(menuTree), [menuTree]);

    const q = searchQuery.trim().toLowerCase();
    const isLogistyk = userRoles.includes('LOGISTYK');
    const isManagerOrAdmin = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
    const filteredOrders = useMemo(() => {
        if (!q) return orders;
        return orders.filter(o =>
            (o.name || '').toLowerCase().includes(q) ||
            (o.customTypeLabel || '').toLowerCase().includes(q)
        );
    }, [orders, q]);

    // Auto-rozwijanie pierwszego trafienia
    useEffect(() => {
        if (q && filteredOrders.length > 0) setExpandedId(String(filteredOrders[0].id));
        else if (!q) setExpandedId(null);
    }, [q]);

    const handleSectionClick = (orderId) => {
        setExpandedId(prev => prev === orderId ? null : orderId);
    };

    const handleFullscreen = (e, orderId) => {
        e.stopPropagation();
        setFullscreenId(orderId);
        setExpandedId(orderId);
    };

    const fullscreenOrder = fullscreenId ? orders.find(o => String(o.id) === String(fullscreenId)) : null;

    // ── Tryb pełnoekranowy ────────────────────────────────────────────────────
    if (fullscreenId && fullscreenOrder) {
        return (
            <div className="flex flex-col h-full">
                {/* Nagłówek fullscreen */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/[0.02] flex-shrink-0">
                    <button
                        onClick={() => setFullscreenId(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-semibold transition-all border border-white/10"
                    >
                        <Minimize2 size={12} /> Powrót do listy
                    </button>
                    <div className="h-4 w-px bg-white/10" />
                    <span className="text-sm font-bold text-white flex-1 truncate">{fullscreenOrder.name}</span>
                    <button
                        onClick={() => onNavigateToOrder?.(fullscreenOrder.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold transition-all border border-blue-500/20"
                        title="Przejdź do zakładki Planowanie"
                    >
                        <ExternalLink size={11} /> Planowanie
                    </button>
                </div>
                {/* Panel materiałów */}
                <div className="flex-1 overflow-hidden min-h-0">
                    <OrderMaterialsView
                        key={`logistyka-full-${fullscreenId}`}
                        orderId={fullscreenOrder.id}
                        isManagerOrAdmin={isManagerOrAdmin}
                        isLogistyk={isLogistyk}
                    />
                </div>
            </div>
        );
    }

    // ── Widok listy zamówień ──────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-2 p-4">
            {filteredOrders.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
                    <Package size={28} className="text-gray-600" />
                    <p className="text-sm">{q ? `Brak wyników dla „${q}"` : 'Brak zamówień w systemie'}</p>
                </div>
            )}

            {filteredOrders.map(order => {
                const isExpanded = expandedId === String(order.id);
                return (
                    <div
                        key={order.id}
                        className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.015] transition-all"
                    >
                        {/* Nagłówek sekcji */}
                        <div
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors select-none"
                            onClick={() => handleSectionClick(String(order.id))}
                            onDoubleClick={(e) => handleFullscreen(e, String(order.id))}
                            title="Kliknij aby rozwinąć · Dwuklik aby pełny ekran"
                        >
                            <ChevronDown
                                size={14}
                                className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                            />
                            <span className="text-sm font-bold text-white flex-1 truncate">{order.name}</span>

                            {/* Przycisk nawigacji do Planowania */}
                            <button
                                onClick={(e) => { e.stopPropagation(); onNavigateToOrder?.(order.id); }}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[11px] font-semibold transition-all border border-blue-500/20 flex-shrink-0"
                                title="Otwórz zakładkę Planowanie"
                            >
                                <ExternalLink size={11} /> Planowanie
                            </button>

                            {/* Przycisk pełnego ekranu */}
                            <button
                                onClick={(e) => handleFullscreen(e, String(order.id))}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-all flex-shrink-0"
                                title="Rozwiń na cały ekran"
                            >
                                <Maximize2 size={12} />
                            </button>
                        </div>

                        {/* Rozwinięty panel materiałów — ten sam widok co WBS/Materiały.
                            Stała wysokość, bo WbsMaterialsPanel skaluje się do rodzica (h-full). */}
                        {isExpanded && (
                            <div className="border-t border-white/10 h-[70vh]">
                                <OrderMaterialsView
                                    key={`logistyka-${order.id}`}
                                    orderId={order.id}
                                    isManagerOrAdmin={isManagerOrAdmin}
                                    isLogistyk={isLogistyk}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
