/**
 * Migracja jednorazowa — wariant B: WBS jest jedynym źródłem prawdy dla quantity.
 *
 * Dla każdego MaterialRequirement:
 *   - jeśli ma alokacje (wbs_node_materials) → ustaw WbsNodeMaterial.quantity = WbsNode.quantity
 *     dla każdej alokacji. Następnie przelicz MaterialRequirement.quantity = sum(WbsNodeMaterial.quantity)
 *     i zapisz wbsNodeAllocations JSON zgodny z tabelą relacyjną.
 *   - jeśli nie ma alokacji, ale ma wbsNodeAllocations JSON → parsuj i traktuj każdy klucz
 *     jako wbsNodeId, stwórz WbsNodeMaterial (jeśli WBS node istnieje), ustaw quantity z WbsNode.
 *   - jeśli nie ma ani jednego, ani drugiego — zostaw bez zmian (legacy standalone).
 *
 * Po migracji: WBS, Budget, Materials pokazują te same liczby.
 *
 * Uruchomienie:
 *   docker exec -it ignite-backend-1 node /usr/src/app/../../test/sync-material-quantities-from-wbs.js
 * Lub (z gospodarza, jeśli DB localhost):
 *   node test/sync-material-quantities-from-wbs.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const reqs = await prisma.materialRequirement.findMany({
        select: { id: true, name: true, quantity: true, wbsNodeAllocations: true, wbsNodeId: true },
    });

    console.log(`Znaleziono ${reqs.length} wymagań materiałowych.`);

    let touched = 0;
    let skipped = 0;
    let errors = 0;

    for (const r of reqs) {
        try {
            // 1. Istniejące alokacje w tabeli relacyjnej
            let allocs = await prisma.wbsNodeMaterial.findMany({ where: { materialId: r.id } });

            // 2. Jeśli brak — spróbuj odtworzyć z JSON (legacy)
            if (allocs.length === 0 && r.wbsNodeAllocations) {
                try {
                    const parsed = JSON.parse(r.wbsNodeAllocations);
                    const entries = Object.entries(parsed).filter(([, q]) => parseFloat(q) > 0);
                    if (entries.length > 0) {
                        const validNodes = await prisma.wbsNode.findMany({
                            where: { id: { in: entries.map(([id]) => id) } },
                            select: { id: true },
                        });
                        const valid = new Set(validNodes.map(n => n.id));
                        for (const [wbsNodeId] of entries) {
                            if (!valid.has(wbsNodeId)) continue;
                            await prisma.wbsNodeMaterial.create({
                                data: { wbsNodeId, materialId: r.id, quantity: 0 },
                            }).catch(() => {});
                        }
                        allocs = await prisma.wbsNodeMaterial.findMany({ where: { materialId: r.id } });
                    }
                } catch {}
            }

            // 3. Jeśli brak legacy — spróbuj wbsNodeId single
            if (allocs.length === 0 && r.wbsNodeId) {
                const node = await prisma.wbsNode.findUnique({ where: { id: r.wbsNodeId }, select: { id: true } });
                if (node) {
                    await prisma.wbsNodeMaterial.create({
                        data: { wbsNodeId: r.wbsNodeId, materialId: r.id, quantity: 0 },
                    }).catch(() => {});
                    allocs = await prisma.wbsNodeMaterial.findMany({ where: { materialId: r.id } });
                }
            }

            if (allocs.length === 0) {
                skipped++;
                continue;
            }

            // 4. Pobierz aktualne WbsNode.quantity dla każdej alokacji — WBS wygrywa
            const wbsIds = allocs.map(a => a.wbsNodeId);
            const wbsNodes = await prisma.wbsNode.findMany({
                where: { id: { in: wbsIds } },
                select: { id: true, quantity: true },
            });
            const wbsQtyMap = Object.fromEntries(wbsNodes.map(n => [n.id, n.quantity || 0]));

            // 5. Update każdej alokacji do WbsNode.quantity
            for (const a of allocs) {
                const target = wbsQtyMap[a.wbsNodeId] ?? 0;
                if (a.quantity !== target) {
                    await prisma.wbsNodeMaterial.update({
                        where: { id: a.id },
                        data: { quantity: target },
                    });
                }
            }

            // 6. Przelicz MaterialRequirement.quantity + wbsNodeAllocations
            const refreshed = await prisma.wbsNodeMaterial.findMany({ where: { materialId: r.id } });
            const total = refreshed.reduce((sum, a) => sum + (a.quantity || 0), 0);
            const allocJson = JSON.stringify(
                Object.fromEntries(refreshed.map(a => [a.wbsNodeId, a.quantity])),
            );

            const before = r.quantity;
            if (before !== total || r.wbsNodeAllocations !== allocJson) {
                await prisma.materialRequirement.update({
                    where: { id: r.id },
                    data: { quantity: total, wbsNodeAllocations: allocJson },
                });
                console.log(`  [${r.id}] ${r.name}: ${before} → ${total} (${refreshed.length} alokacji)`);
                touched++;
            } else {
                skipped++;
            }
        } catch (err) {
            console.error(`  [${r.id}] ${r.name}: BŁĄD —`, err.message);
            errors++;
        }
    }

    console.log(`\nGotowe. Zaktualizowano: ${touched}, Pominięto: ${skipped}, Błędy: ${errors}.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
