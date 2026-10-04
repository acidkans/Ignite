// Ilość gałęzi grupującej (pakietu) mnoży całe jej poddrzewo: pakiet ×3 z podpakietem ×2
// daje liściom mnożnik 6. Odpowiednik frontowych `groupQtyFactor` / `buildGroupMultiplierMap`
// z `wbsConstants.js` — obie strony muszą liczyć identycznie.

type GroupQtyNode = { id: string; parentId: string | null; type: string | null; quantity: number | null };

// @anchor group-qty-factor-back — pusta / 0 ⇒ 1, żeby pakiet bez ilości nie zerował wartości.
export function groupQtyFactor(node: Pick<GroupQtyNode, 'type' | 'quantity'> | null | undefined): number {
    if (String(node?.type || '').toLowerCase() !== 'group') return 1;
    const q = Number(node?.quantity);
    return Number.isFinite(q) && q > 0 ? q : 1;
}

// @anchor group-multiplier-map-back — id węzła → iloczyn ilości gałęzi grupujących NAD nim.
export function groupMultiplierMap(nodes: GroupQtyNode[]): Map<string, number> {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const memo = new Map<string, number>();
    const multOf = (node: GroupQtyNode, guard = 0): number => {
        if (!node.parentId || guard > 100) return 1;
        const cached = memo.get(node.id);
        if (cached !== undefined) return cached;
        const parent = byId.get(node.parentId);
        const m = parent ? multOf(parent, guard + 1) * groupQtyFactor(parent) : 1;
        memo.set(node.id, m);
        return m;
    };
    for (const n of nodes) multOf(n);
    return memo;
}
