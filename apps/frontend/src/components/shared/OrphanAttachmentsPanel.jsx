import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Search, Image as ImageIcon, Save, Check, Loader2, AlertTriangle } from 'lucide-react';
import { API_URL } from '../../config';
import { db } from '../../services/db';
import { getOrphanedAttachments, reassignOrphanedAttachment } from '../../services/repos/outboxRepo';
import { syncOutbox } from '../../services/sync/syncOutbox';

/**
 * Panel ręcznego przypisania osieroconych załączników.
 *
 * Osierocone zdjęcie nie niesie ŻADNEJ informacji o swoim znaczniku — jedynym
 * łącznikiem był `temp_` id, który przestał cokolwiek znaczyć. Dlatego zamiast
 * zgadywać, pokazujemy wszystkie znaczniki (zamówienie + nazwa) i pozwalamy
 * przeciągnąć zdjęcie na właściwy.
 *
 * Dotyk: HTML5 drag&drop nie dostaje z palca żadnych zdarzeń, więc gest robimy
 * ręcznie na Pointer Events — tak samo jak przenoszenie węzłów w WBSHybridTable.
 * Mysz zostaje na natywnym DnD.
 *
 * @anchor orphan-attachments-panel
 */
export default function OrphanAttachmentsPanel({ onClose, onAssigned }) {
    const [orphans, setOrphans] = useState([]);
    const [markers, setMarkers] = useState([]);
    const [loadingMarkers, setLoadingMarkers] = useState(true);
    const [markersError, setMarkersError] = useState(null);
    const [search, setSearch] = useState('');
    const [assigning, setAssigning] = useState(null); // outboxRowId w trakcie wysyłki
    const [justAssigned, setJustAssigned] = useState(null); // markerId — zielony błysk po dropie
    // Tryb bez przeciągania: tap w zdjęcie zaznacza, tap w znacznik przypisuje.
    // Na telefonie celowanie kciukiem w wiersz długiej listy podczas ciągnięcia
    // jest męczące — dwa tapnięcia są pewniejsze.
    // @anchor orphan-selected-id
    const [selectedOrphanId, setSelectedOrphanId] = useState(null);

    // Stan przeciągania (wspólny dla myszy i palca)
    const [dragOrphanId, setDragOrphanId] = useState(null);
    const [dragOverMarkerId, setDragOverMarkerId] = useState(null);
    const [ghost, setGhost] = useState(null); // { x, y, url } — podgląd pod palcem
    const pointerDragRef = useRef(null);
    const dragOverRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => { dragOverRef.current = dragOverMarkerId; }, [dragOverMarkerId]);

    // ── Dane ──────────────────────────────────────────────────────────────────

    // @anchor load-orphans-panel
    const loadOrphans = useCallback(async () => {
        const items = await getOrphanedAttachments();
        const out = [];
        for (const item of items) {
            const draft = await db.attachmentDrafts.where('outboxId').equals(item.payload.outboxId).first();
            if (!draft) continue;
            const ft = draft.fileType || '';
            out.push({
                outboxRowId: item.id,
                outboxId: item.payload.outboxId,
                isImage: ft.startsWith('image/'),
                fileUrl: URL.createObjectURL(new Blob([draft.arrayBuffer], { type: ft })),
                fileName: draft.fileName,
                createdAt: draft.createdAt,
            });
        }
        setOrphans(prev => {
            prev.forEach(o => { try { URL.revokeObjectURL(o.fileUrl); } catch (_) {} });
            return out;
        });
    }, []);

    useEffect(() => {
        loadOrphans();
        return () => setOrphans(prev => {
            prev.forEach(o => { try { URL.revokeObjectURL(o.fileUrl); } catch (_) {} });
            return [];
        });
    }, [loadOrphans]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const token = sessionStorage.getItem('token');
                const res = await fetch(`${API_URL}/schematics/markers/all`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) setMarkers(data);
            } catch (err) {
                if (!cancelled) setMarkersError(err.message);
            } finally {
                if (!cancelled) setLoadingMarkers(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Filtrowanie + grupowanie po zamówieniu ────────────────────────────────

    const grouped = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = q
            ? markers.filter(m =>
                `${m.orderName} ${m.name || ''} ${m.note || ''} ${m.schematicName || ''}`.toLowerCase().includes(q))
            : markers;
        const byOrder = new Map();
        for (const m of filtered) {
            if (!byOrder.has(m.orderName)) byOrder.set(m.orderName, []);
            byOrder.get(m.orderName).push(m);
        }
        return [...byOrder.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pl'));
    }, [markers, search]);

    const markerLabel = (m) => m.name || m.note || `Znacznik bez nazwy (${m.id.slice(0, 6)})`;

    // ── Przypisanie ───────────────────────────────────────────────────────────

    // @anchor assign-orphan-to-marker
    const assign = useCallback(async (orphan, marker) => {
        if (!orphan || !marker) return;
        setAssigning(orphan.outboxRowId);
        try {
            await reassignOrphanedAttachment(orphan.outboxRowId, marker.id, {
                subtaskId: marker.subtaskId,
                nodeId: marker.nodeId,
            });
            const token = sessionStorage.getItem('token');
            if (token) await syncOutbox(token);
            await loadOrphans();
            setSelectedOrphanId(null);
            setJustAssigned(marker.id);
            setTimeout(() => setJustAssigned(null), 1400);
            onAssigned?.();
        } catch (err) {
            alert('Nie udało się przypisać: ' + err.message);
        } finally {
            setAssigning(null);
        }
    }, [loadOrphans, onAssigned]);

    const commitDrop = useCallback((orphanId, markerId) => {
        const orphan = orphans.find(o => o.outboxRowId === orphanId);
        const marker = markers.find(m => m.id === markerId);
        if (orphan && marker) assign(orphan, marker);
    }, [orphans, markers, assign]);

    // ── Dotyk: Pointer Events ─────────────────────────────────────────────────

    const markerIdUnder = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest('[data-marker-id]')?.getAttribute('data-marker-id') || null;
    };

    const onCardPointerDown = (e, orphan) => {
        if (e.pointerType === 'mouse') return; // mysz → natywne HTML5 DnD
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
        pointerDragRef.current = {
            pointerId: e.pointerId, orphanId: orphan.outboxRowId,
            url: orphan.fileUrl, startX: e.clientX, startY: e.clientY, moved: false,
        };
    };

    const onCardPointerMove = (e) => {
        const st = pointerDragRef.current;
        if (!st || e.pointerId !== st.pointerId) return;
        // Próg 6 px — samo dotknięcie kafelka nie ma zaczynać przeciągania.
        if (!st.moved) {
            if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < 6) return;
            st.moved = true;
            setDragOrphanId(st.orphanId);
        }
        e.preventDefault();
        setGhost({ x: e.clientX, y: e.clientY, url: st.url });

        // Auto-scroll listy przy krawędziach — lista znaczników bywa długa.
        const wrap = listRef.current;
        if (wrap) {
            const r = wrap.getBoundingClientRect();
            const EDGE = 48;
            if (e.clientY < r.top + EDGE) wrap.scrollTop -= 12;
            else if (e.clientY > r.bottom - EDGE) wrap.scrollTop += 12;
        }
        setDragOverMarkerId(markerIdUnder(e.clientX, e.clientY));
    };

    const onCardPointerUp = (e, commit) => {
        const st = pointerDragRef.current;
        if (!st || e.pointerId !== st.pointerId) return;
        pointerDragRef.current = null;
        try { e.currentTarget.releasePointerCapture(st.pointerId); } catch (_) {}
        const targetMarkerId = dragOverRef.current;
        const moved = st.moved;
        setDragOrphanId(null); setDragOverMarkerId(null); setGhost(null);
        if (!commit) return;
        // Dotknięcie bez ruchu = tap → zaznaczenie zamiast przeciągania.
        if (!moved) {
            setSelectedOrphanId(prev => (prev === st.orphanId ? null : st.orphanId));
            return;
        }
        if (targetMarkerId) commitDrop(st.orphanId, targetMarkerId);
    };

    // Tap w wiersz znacznika — przypisuje zaznaczone zdjęcie (tryb dwóch tapnięć).
    // @anchor orphan-row-tap-assign
    const onMarkerRowClick = (marker) => {
        if (!selectedOrphanId) return;
        commitDrop(selectedOrphanId, marker.id);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const dragging = dragOrphanId !== null;

    return (
        <div className="fixed inset-0 z-[9998] bg-[#070b12] flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white">Niewysłane zdjęcia</h2>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                        {selectedOrphanId
                            ? 'Teraz tapnij znacznik, do którego to zdjęcie należy'
                            : 'Przeciągnij zdjęcie na znacznik — albo tapnij zdjęcie, potem znacznik'}
                    </p>
                </div>
                <button onClick={onClose} className="p-2 rounded-full bg-white/5 text-gray-400 active:bg-white/10">
                    <X size={18} />
                </button>
            </div>

            {orphans.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-600 px-6 text-center">
                    <Check size={40} className="opacity-30 text-emerald-500" />
                    <p className="text-sm">Wszystkie zdjęcia wysłane</p>
                    <p className="text-[11px] text-gray-700">Nie ma nic zaległego w kolejce tego urządzenia.</p>
                </div>
            ) : (
                <>
                    {/* Pasek osieroconych zdjęć */}
                    <div className="flex-shrink-0 px-3 py-3 border-b border-white/10 bg-black/30">
                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2 px-1">
                            Do przypisania ({orphans.length})
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {orphans.map(o => {
                                const isDragged = dragOrphanId === o.outboxRowId;
                                const isSelected = selectedOrphanId === o.outboxRowId;
                                const busy = assigning === o.outboxRowId;
                                return (
                                    <div
                                        key={o.outboxId}
                                        data-orphan-id={o.outboxRowId}
                                        draggable={!busy}
                                        onDragStart={e => {
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', String(o.outboxRowId));
                                            setDragOrphanId(o.outboxRowId);
                                        }}
                                        onDragEnd={() => { setDragOrphanId(null); setDragOverMarkerId(null); }}
                                        onPointerDown={e => onCardPointerDown(e, o)}
                                        onPointerMove={onCardPointerMove}
                                        onPointerUp={e => onCardPointerUp(e, true)}
                                        onPointerCancel={e => onCardPointerUp(e, false)}
                                        onClick={() => setSelectedOrphanId(prev => (prev === o.outboxRowId ? null : o.outboxRowId))}
                                        style={{ touchAction: 'none' }}
                                        className={`relative flex-shrink-0 w-24 rounded-xl overflow-hidden border bg-black/40 cursor-grab active:cursor-grabbing transition-all ${
                                            isDragged ? 'opacity-40 border-blue-500'
                                                : isSelected ? 'border-blue-500 ring-2 ring-blue-500/50'
                                                : 'border-amber-500/30'
                                        }`}
                                    >
                                        {isSelected && (
                                            <div className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                                                <Check size={12} className="text-white" />
                                            </div>
                                        )}
                                        <div className="w-24 h-24">
                                            {o.isImage ? (
                                                <img src={o.fileUrl} alt={o.fileName} className="w-full h-full object-cover pointer-events-none" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1">
                                                    <Save size={18} className="text-gray-500" />
                                                    <span className="text-[8px] text-center text-gray-400 truncate w-full">{o.fileName}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="px-1.5 py-1 bg-black/70">
                                            <div className="text-[9px] text-gray-400 truncate">{o.fileName}</div>
                                            {o.createdAt && (
                                                <div className="text-[9px] text-amber-400/80 font-mono">
                                                    {new Date(o.createdAt).toLocaleString('pl-PL', {
                                                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        {busy && (
                                            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                                <Loader2 size={20} className="text-blue-400 animate-spin" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Szukajka */}
                    <div className="flex-shrink-0 px-3 py-2 border-b border-white/10">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                            <Search size={14} className="text-gray-500 flex-shrink-0" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Szukaj zamówienia lub znacznika…"
                                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-600 min-w-0"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="text-gray-500 p-0.5"><X size={13} /></button>
                            )}
                        </div>
                    </div>

                    {/* Lista znaczników */}
                    <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2">
                        {loadingMarkers ? (
                            <div className="flex items-center justify-center gap-2 py-16 text-gray-600">
                                <Loader2 size={18} className="animate-spin" /> <span className="text-sm">Wczytywanie znaczników…</span>
                            </div>
                        ) : markersError ? (
                            <div className="py-16 text-center text-red-400 text-sm">
                                Nie udało się pobrać znaczników: {markersError}
                            </div>
                        ) : grouped.length === 0 ? (
                            <div className="py-16 text-center text-gray-600 text-sm">Brak znaczników pasujących do wyszukiwania</div>
                        ) : grouped.map(([orderName, list]) => (
                            <div key={orderName} className="mb-4">
                                <div className="sticky top-0 z-10 px-1 py-1.5 bg-[#070b12] text-[10px] font-black uppercase tracking-widest text-blue-400">
                                    {orderName} <span className="text-gray-600">({list.length})</span>
                                </div>
                                <div className="space-y-1.5">
                                    {list.map(m => {
                                        const isOver = dragOverMarkerId === m.id;
                                        const flash = justAssigned === m.id;
                                        return (
                                            <div
                                                key={m.id}
                                                data-marker-id={m.id}
                                                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverMarkerId(m.id); }}
                                                onDragLeave={() => setDragOverMarkerId(prev => (prev === m.id ? null : prev))}
                                                onDrop={e => {
                                                    e.preventDefault();
                                                    const orphanId = Number(e.dataTransfer.getData('text/plain'));
                                                    setDragOrphanId(null); setDragOverMarkerId(null);
                                                    commitDrop(orphanId, m.id);
                                                }}
                                                onClick={() => onMarkerRowClick(m)}
                                                className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-all ${
                                                    flash ? 'border-emerald-500/60 bg-emerald-500/15'
                                                        : isOver ? 'border-blue-500 bg-blue-500/20 scale-[1.01]'
                                                        : selectedOrphanId ? 'border-blue-500/25 bg-white/5 cursor-pointer active:bg-blue-500/15'
                                                        : 'border-white/5 bg-white/5'
                                                } ${dragging ? 'ring-1 ring-white/5' : ''}`}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm text-white truncate">{markerLabel(m)}</div>
                                                    <div className="text-[10px] text-gray-500 truncate">
                                                        {m.schematicName}
                                                        {m.attachmentsCount > 0 && ` · ${m.attachmentsCount} zał.`}
                                                    </div>
                                                </div>
                                                {flash && <Check size={16} className="text-emerald-400 flex-shrink-0" />}
                                                {isOver && !flash && (
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-300 flex-shrink-0">Upuść</span>
                                                )}
                                                {selectedOrphanId && !isOver && !flash && (
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400/70 flex-shrink-0">Przypisz</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Podgląd pod palcem — HTML5 DnD rysuje swój własny, ten jest dla dotyku */}
            {ghost && (
                <div
                    className="fixed pointer-events-none z-[9999] w-20 h-20 rounded-xl overflow-hidden border-2 border-blue-500 shadow-2xl opacity-90"
                    style={{ left: ghost.x - 40, top: ghost.y - 40 }}
                >
                    <img src={ghost.url} alt="" className="w-full h-full object-cover" />
                </div>
            )}
        </div>
    );
}
