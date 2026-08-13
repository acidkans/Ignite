// @anchor cards-layout-gap
/// Minimalny odstep miedzy kartami przy automatycznym odsuwaniu.
const GAP = 12;
const STEP = 20;

const rectsOverlap = (a, b) => (
    a.x < b.x + b.w + GAP &&
    a.x + a.w + GAP > b.x &&
    a.y < b.y + b.h + GAP &&
    a.y + a.h + GAP > b.y
);

// @anchor find-free-spot
/// Pierwsze wolne miejsce dla karty o zadanych wymiarach — skan od gory, wierszami.
function findFreeSpot(card, blockers, containerWidth) {
    const maxX = Math.max(0, containerWidth - card.w);
    for (let y = 0; y < 6000; y += STEP) {
        for (let x = 0; x <= maxX; x += STEP) {
            const candidate = { x, y, w: card.w, h: card.h };
            if (!blockers.some(b => rectsOverlap(candidate, b))) return { x, y };
        }
    }
    return { x: 0, y: 0 };
}

// @anchor resolve-card-overlaps
/// Po puszczeniu karty: kazda karta, ktora zostala przykryta, wedruje w wolne miejsce.
/// `layout` = { id: {x, y} }, `sizes` = { id: {w, h} } (zmierzone w DOM).
export function resolveCardOverlaps(layout, sizes, movedId, containerWidth) {
    const next = { ...layout };
    const rectOf = (id) => ({
        x: next[id]?.x ?? 0,
        y: next[id]?.y ?? 0,
        w: sizes[id]?.w ?? 380,
        h: sizes[id]?.h ?? 220,
    });

    const others = Object.keys(next).filter(id => id !== movedId);
    for (const id of others) {
        if (!rectsOverlap(rectOf(movedId), rectOf(id))) continue;
        const blockers = [movedId, ...others.filter(o => o !== id)].map(rectOf);
        const spot = findFreeSpot(rectOf(id), blockers, containerWidth);
        next[id] = { ...next[id], ...spot };
    }
    return next;
}
