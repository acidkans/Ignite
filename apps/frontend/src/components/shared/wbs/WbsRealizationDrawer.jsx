// @anchor wbs-realization-drawer — szuflada „Realizacja" w wierszu Struktury projektu: prowadzenie
// zakupów i wykonania bez przechodzenia do zakładki Realizacja. To NIE jest kopia — tabela pozycji
// (`PositionsTable`), szuflada zakupów, formularz wpisu, osie i filtry są tymi samymi komponentami
// co w zakładce, a dane i zapisy idą przez wspólny hook `use-realization-data`.
// Plan (ilości, koszty jedn.) czyta się z wersji REALIZACJI (baseline albo aktywny snapszot —
// `realization-baseline-version`), a nie z wersji oglądanej w WBS: węzeł WBS łączy się z pozycją
// realizacji po `wbsRootId`, który jest wspólny dla wszystkich wersji.
import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useRealizationData, useRealizationFilters } from './useRealizationData';
import { PositionsTable, buildBranchIndex, hasColFilter } from '../RealizationNewTab';
import { LEAF_TYPES, OPEN_LEAF_TYPES, wbsRootOf } from './realizationShared';

// @anchor pickaxe-icon — kilof (realizacja). Zainstalowany lucide-react nie ma jeszcze `Pickaxe`,
// więc ścieżki są przepisane z lucide, żeby ikona miała tę samą grubość kreski co sąsiednie.
export function PickaxeIcon({ size = 19, className = '' }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912" />
            <path d="M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393" />
            <path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z" />
            <path d="M19.686 8.314a12.501 12.501 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319" />
        </svg>
    );
}

export default function WbsRealizationDrawer({ wbsNode, processNodeId, realization }) {
    const { versionId, acceptedAt = null, planLabel = '', userRoles = [], orderName = '' } = realization || {};
    // Te same reguły ról co w zakładce: `realization-new-visible-types` i trójka ról z prawem zapisu.
    const isManagerOrAdmin = userRoles.some(r => ['ADMIN', 'MANAGER'].includes(r));
    const readOnly = !userRoles.some(r => ['ADMIN', 'MANAGER', 'LOGISTYK'].includes(r));
    const visibleTypes = isManagerOrAdmin ? LEAF_TYPES : OPEN_LEAF_TYPES;

    const {
        loading, wbsNodes, saveComment, saveOwner, saveAxis, addActual, updateActual, deleteActual,
        actualsOf, cardOf, rowOf, ownerOptions,
    } = useRealizationData({ nodeId: processNodeId, versionId, acceptedAt, isManagerOrAdmin });

    const idx = useMemo(() => buildBranchIndex(wbsNodes, orderName, visibleTypes), [wbsNodes, orderName, visibleTypes]);

    // Węzeł planu realizacji odpowiadający wierszowi WBS (ta sama pozycja w innej wersji).
    const target = useMemo(() => {
        const root = wbsRootOf(wbsNode);
        return wbsNodes.find(n => wbsRootOf(n) === root) || null;
    }, [wbsNodes, wbsNode]);

    // Pozycje kosztowe pod tym węzłem (z nim samym, gdy to liść). Po `parentId`, a nie po
    // `branchId`, żeby liść podwieszony pod innym liściem też trafił do szuflady swojego rodzica.
    const leaves = useMemo(() => {
        if (!target) return [];
        const byId = Object.fromEntries(wbsNodes.map(n => [n.id, n]));
        const under = (n) => {
            const seen = new Set();
            for (let w = n; w && !seen.has(w.id); w = w.parentId ? byId[w.parentId] : null) {
                if (w.id === target.id) return true;
                seen.add(w.id);
            }
            return false;
        };
        return idx.leaves.filter(under);
    }, [idx, wbsNodes, target]);

    const { colFilters, setColFilters, filterOptions, matchesFilters } = useRealizationFilters(leaves, actualsOf, cardOf);
    const shown = useMemo(
        () => (Object.values(colFilters).some(hasColFilter) ? leaves.filter(matchesFilters) : leaves),
        [leaves, colFilters, matchesFilters],
    );

    // Szuflada otwarta na JEDNEJ pozycji (liść) od razu pokazuje jej zakupy — po to się w nią klika.
    const [expanded, setExpanded] = useState(() => new Set());
    const [selected, setSelected] = useState(null);
    useEffect(() => {
        if (leaves.length === 1) setExpanded(prev => (prev.has(leaves[0].id) ? prev : new Set([...prev, leaves[0].id])));
    }, [leaves]);
    const toggleExpanded = (id) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    if (loading) {
        return <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-500" /></div>;
    }
    if (!target) {
        return (
            <p className="py-3 text-sm text-gray-400">
                Tej pozycji nie ma w planie realizacji{planLabel ? ` (${planLabel})` : ''} — prawdopodobnie dodano ją po akceptacji wyceny.
            </p>
        );
    }
    if (!leaves.length) {
        return <p className="py-3 text-sm text-gray-400">Brak pozycji kosztowych do realizacji w tej gałęzi.</p>;
    }

    // `rn-fluid` — skala typografii zakładki Realizacja (`realization-fluid-scale`), bez niej
    // szuflada zakupów i formularz wpisu straciłyby rozmiary pól.
    return (
        <div className="rn-fluid text-gray-200" onClick={e => e.stopPropagation()}>
            {planLabel && <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300/80">{planLabel}</div>}
            <div className="max-h-[70vh] overflow-auto">
                <PositionsTable
                    leaves={shown} rowOf={rowOf} actualsOf={actualsOf}
                    expanded={expanded} onToggleExpanded={toggleExpanded}
                    selected={selected} onSelect={setSelected}
                    readOnly={readOnly}
                    filters={colFilters} filterOptions={filterOptions}
                    onFilterChange={(key, val) => setColFilters(prev => ({ ...prev, [key]: val }))}
                    onClearFilters={() => setColFilters({})}
                    onSaveAxis={saveAxis} onSaveComment={saveComment}
                    onSaveOwner={saveOwner} ownerOptions={ownerOptions}
                    onAddActual={addActual} onUpdateActual={updateActual} onDeleteActual={deleteActual}
                />
            </div>
        </div>
    );
}
