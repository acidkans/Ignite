import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// @anchor draggable-card
// Karta przeciągalna myszą za nagłówek. Pozycja i rozmiar są STEROWANE z góry
// (MyLeavesTab trzyma cały układ i zapisuje go na serwerze per użytkownik).
// Karta zgłasza rodzicowi: koniec przeciągania, zmianę rozmiaru i swój zmierzony rozmiar.
export default function DraggableCard({
    id,
    title,
    subtitle,
    position,
    size,
    width = 380,
    height,
    resizable = false,
    onDragEnd,
    onMeasure,
    children,
    accent = '#3b82f6',
}) {
    const [drag, setDrag] = useState(null); // { dx, dy } — przesunięcie względem pozycji z propsów
    const [zIndex, setZIndex] = useState(10);
    const dragRef = useRef(null);
    const rootRef = useRef(null);

    const x = position.x + (drag?.dx || 0);
    const y = position.y + (drag?.dy || 0);

    // @anchor draggable-card-measure
    /// Rodzic potrzebuje realnych wymiarów kart, żeby wykrywać kolizje i odsuwać zasłonięte karty.
    useLayoutEffect(() => {
        if (!rootRef.current || !onMeasure) return;
        const el = rootRef.current;
        const report = () => onMeasure(id, el.offsetWidth, el.offsetHeight);
        report();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(report);
        ro.observe(el);
        return () => ro.disconnect();
    }, [id, onMeasure]);

    // @anchor draggable-card-start
    const handleMouseDown = (e) => {
        // przeciąganie tylko za nagłówek, nie za przyciski w nim
        if (e.button !== 0 || e.target.closest('button, input, select, a')) return;
        e.preventDefault();
        dragRef.current = { startX: e.clientX, startY: e.clientY };
        setDrag({ dx: 0, dy: 0 });
        setZIndex(50);
    };

    const handleMouseMove = useCallback((e) => {
        if (!dragRef.current) return;
        const { startX, startY } = dragRef.current;
        setDrag({ dx: e.clientX - startX, dy: e.clientY - startY });
    }, []);

    const handleMouseUp = useCallback(() => {
        if (!dragRef.current) return;
        dragRef.current = null;
        setZIndex(10);
        setDrag(d => {
            const next = {
                x: Math.max(0, position.x + (d?.dx || 0)),
                y: Math.max(0, position.y + (d?.dy || 0)),
            };
            onDragEnd?.(id, next);
            return null;
        });
    }, [id, onDragEnd, position.x, position.y]);

    useEffect(() => {
        if (!drag) return;
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [drag, handleMouseMove, handleMouseUp]);

    // rozmiar sterowany: po „Ułóż karty od nowa" trzeba wyczyścić wymiary wpisane przez uchwyt resize
    useEffect(() => {
        if (!resizable || !rootRef.current) return;
        const el = rootRef.current;
        el.style.width = `${size?.w ?? width}px`;
        el.style.height = size?.h ? `${size.h}px` : (typeof height === 'number' ? `${height}px` : '');
    }, [resizable, size?.w, size?.h, width, height]);

    return (
        <div
            ref={rootRef}
            style={{
                left: x,
                top: y,
                width: size?.w ?? width,
                height: size?.h ?? height,
                zIndex,
                ...(resizable ? { resize: 'both', overflow: 'hidden', minWidth: 420, minHeight: 260 } : null),
            }}
            className={`absolute bg-gray-900/95 border rounded-xl shadow-2xl backdrop-blur-sm transition-shadow flex flex-col
                ${drag ? 'border-blue-500/60 shadow-blue-500/20 select-none' : 'border-white/10'}`}
        >
            <div
                onMouseDown={handleMouseDown}
                title="Przeciągnij, aby przenieść"
                className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/5 rounded-t-xl shrink-0
                    ${drag ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{ background: `linear-gradient(90deg, ${accent}22, transparent)` }}
            >
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-300 truncate">{title}</p>
                    {subtitle && <p className="text-[10px] text-gray-500 truncate">{subtitle}</p>}
                </div>
                <span className="text-gray-600 text-sm leading-none shrink-0" aria-hidden>⠿</span>
            </div>
            <div className={resizable ? 'p-3 flex-1 min-h-0 flex flex-col' : 'p-4'}>{children}</div>
        </div>
    );
}
