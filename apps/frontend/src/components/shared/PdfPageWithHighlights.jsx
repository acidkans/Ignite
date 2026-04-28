import { useState, useRef, useEffect, useCallback } from 'react';
import { Page } from 'react-pdf';
import { Highlighter, Trash2, X } from 'lucide-react';

// Paleta highlightów PDF
export const HL_COLORS = {
    yellow: '#fef08a',
    green:  '#bbf7d0',
    blue:   '#bfdbfe',
    pink:   '#fbcfe8',
    orange: '#fed7aa',
};

// Strona PDF z warstwą highlightów + toolbarem zaznaczenia
export default function PdfPageWithHighlights({
    pageNumber,
    width,
    pageHighlights,
    activeHighlightId,
    onSetActive,
    onCreate,
    onDelete,
    onUpdateColor,
}) {
    const wrapperRef = useRef(null);
    const [selToolbar, setSelToolbar] = useState(null);

    useEffect(() => { setSelToolbar(null); }, [width]);

    const handleMouseUp = useCallback(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSelToolbar(null); return; }
        const range = sel.getRangeAt(0);
        if (!wrapper.contains(range.commonAncestorContainer)) { setSelToolbar(null); return; }
        const wrapRect = wrapper.getBoundingClientRect();
        if (wrapRect.width === 0 || wrapRect.height === 0) return;
        const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1);
        if (clientRects.length === 0) { setSelToolbar(null); return; }
        const rects = clientRects.map(r => ({
            x: (r.left - wrapRect.left) / wrapRect.width,
            y: (r.top - wrapRect.top) / wrapRect.height,
            w: r.width / wrapRect.width,
            h: r.height / wrapRect.height,
        }));
        const first = clientRects[0];
        setSelToolbar({
            x: first.left - wrapRect.left + first.width / 2,
            y: first.top - wrapRect.top - 4,
            rects,
        });
    }, []);

    const create = (color) => {
        if (!selToolbar) return;
        onCreate({ page: pageNumber, rects: selToolbar.rects, color });
        window.getSelection()?.removeAllRanges();
        setSelToolbar(null);
    };

    return (
        <div
            ref={wrapperRef}
            onMouseUp={handleMouseUp}
            className="mb-4 shadow-xl border border-white/10 mx-auto bg-white w-fit"
            style={{ position: 'relative' }}
        >
            <Page pageNumber={pageNumber} renderTextLayer renderAnnotationLayer width={width} />

            {/* Highlight overlay */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
                {pageHighlights.flatMap(h => (Array.isArray(h.rects) ? h.rects : []).map((r, i) => (
                    <div
                        key={`${h.id}-${i}`}
                        onClick={(e) => { e.stopPropagation(); onSetActive(activeHighlightId === h.id ? null : h.id); }}
                        title={h.comment || 'Kliknij aby zarządzać'}
                        style={{
                            position: 'absolute',
                            left:   `${r.x * 100}%`,
                            top:    `${r.y * 100}%`,
                            width:  `${r.w * 100}%`,
                            height: `${r.h * 100}%`,
                            backgroundColor: HL_COLORS[h.color] || HL_COLORS.yellow,
                            opacity: 0.55,
                            mixBlendMode: 'multiply',
                            cursor: 'pointer',
                            pointerEvents: 'auto',
                            outline: activeHighlightId === h.id ? '1px solid rgba(0,0,0,0.4)' : 'none',
                        }}
                    />
                )))}
            </div>

            {/* Pop-over aktywnego highlightu */}
            {activeHighlightId && (() => {
                const h = pageHighlights.find(x => x.id === activeHighlightId);
                if (!h) return null;
                const r0 = (Array.isArray(h.rects) ? h.rects : [])[0];
                if (!r0) return null;
                return (
                    <div
                        className="absolute z-20 flex items-center gap-1 bg-gray-900 border border-white/15 rounded-lg shadow-xl px-1.5 py-1"
                        style={{
                            left: `${(r0.x + r0.w) * 100}%`,
                            top:  `${r0.y * 100}%`,
                            transform: 'translate(4px, -100%)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {Object.entries(HL_COLORS).map(([k, v]) => (
                            <button
                                key={k}
                                onClick={() => onUpdateColor(h.id, k)}
                                className="w-4 h-4 rounded-full border border-white/30"
                                style={{ backgroundColor: v, outline: h.color === k ? '2px solid #fff' : 'none' }}
                                title={k}
                            />
                        ))}
                        <span className="w-px h-4 bg-white/20 mx-0.5" />
                        <button onClick={() => onDelete(h.id)} className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded" title="Usuń">
                            <Trash2 size={11} />
                        </button>
                        <button onClick={() => onSetActive(null)} className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded" title="Zamknij">
                            <X size={11} />
                        </button>
                    </div>
                );
            })()}

            {/* Toolbar zaznaczenia */}
            {selToolbar && (
                <div
                    className="absolute z-30 flex items-center gap-1 bg-gray-900 border border-amber-400/40 rounded-lg shadow-xl px-1.5 py-1"
                    style={{ left: selToolbar.x, top: selToolbar.y, transform: 'translate(-50%, -100%)' }}
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <Highlighter size={11} className="text-amber-300" />
                    {Object.entries(HL_COLORS).map(([k, v]) => (
                        <button
                            key={k}
                            onClick={() => create(k)}
                            className="w-4 h-4 rounded-full border border-white/30 hover:scale-110 transition-transform"
                            style={{ backgroundColor: v }}
                            title={`Zaznacz ${k}`}
                        />
                    ))}
                    <button
                        onClick={() => { window.getSelection()?.removeAllRanges(); setSelToolbar(null); }}
                        className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded"
                        title="Anuluj"
                    >
                        <X size={10} />
                    </button>
                </div>
            )}
        </div>
    );
}
