// @anchor app-zoom — skalowanie całej aplikacji do szerokości okna (CSS `zoom` na <html>).
// Rozmiary w kodzie są w dużej części w px, więc sama bazowa czcionka nie wystarczy. Przy `zoom` przeglądarka
// podaje współrzędne myszy, prostokąty elementów i wymiary okna już przeskalowane, a style CSS są w jednostkach
// nieskalowanych — poniższe nakładki oddają odczyty w jednostkach CSS, więc przeciąganie, popupy i AG Grid
// działają bez zmian. `vh` / `vw` koryguje wtyczka `app-zoom-viewport-units` (postcss.config.js).
// Moduł musi być załadowany pierwszy w main.jsx, przed bibliotekami.

// @anchor app-zoom-stops — [szerokość okna, skala]; do pierwszego progu bez skalowania, powyżej ostatniego stała skala.
const ZOOM_STOPS = [[1920, 1], [2560, 1.15], [3440, 1.3]];

// @anchor app-zoom-for-width
export function zoomForWidth(width) {
    const last = ZOOM_STOPS[ZOOM_STOPS.length - 1];
    if (width <= ZOOM_STOPS[0][0]) return 1;
    if (width >= last[0]) return last[1];
    const i = ZOOM_STOPS.findIndex(([w]) => w >= width);
    const [w0, z0] = ZOOM_STOPS[i - 1];
    const [w1, z1] = ZOOM_STOPS[i];
    return Math.round((z0 + (z1 - z0) * (width - w0) / (w1 - w0)) * 100) / 100;
}

let zoom = 1;

const unscaleGetters = (target, props) => {
    for (const prop of props) {
        const desc = Object.getOwnPropertyDescriptor(target, prop);
        if (!desc?.get) continue;
        Object.defineProperty(target, prop, { ...desc, get() { return desc.get.call(this === undefined ? target : this) / zoom; } });
    }
};
const unscaleRect = (r) => new DOMRect(r.x / zoom, r.y / zoom, r.width / zoom, r.height / zoom);

const rawInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')?.get;

function installCoordinateShims() {
    unscaleGetters(MouseEvent.prototype, ['clientX', 'clientY', 'pageX', 'pageY', 'x', 'y']);
    if (window.Touch) unscaleGetters(Touch.prototype, ['clientX', 'clientY', 'pageX', 'pageY']);
    unscaleGetters(window, ['innerWidth', 'innerHeight']);

    for (const proto of [Element.prototype, Range.prototype]) {
        const original = proto.getBoundingClientRect;
        proto.getBoundingClientRect = function getBoundingClientRect() {
            const rect = original.call(this);
            return zoom === 1 ? rect : unscaleRect(rect);
        };
    }
    const rangeRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function getClientRects() {
        const rects = rangeRects.call(this);
        return zoom === 1 ? rects : Array.from(rects, unscaleRect);
    };
    for (const method of ['elementFromPoint', 'elementsFromPoint']) {
        const original = Document.prototype[method];
        Document.prototype[method] = function fromPoint(x, y) { return original.call(this, x * zoom, y * zoom); };
    }
}

function applyZoom() {
    const next = zoomForWidth(rawInnerWidth ? rawInnerWidth.call(window) : window.innerWidth * zoom);
    if (next === zoom) return;
    zoom = next;
    const html = document.documentElement;
    html.style.zoom = next === 1 ? '' : String(next);
    html.style.setProperty('--app-zoom', String(next));
}

installCoordinateShims();
applyZoom();
window.addEventListener('resize', applyZoom);
