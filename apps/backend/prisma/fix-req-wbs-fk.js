/**
 * Naprawa powiązań material_requirements <-> wbs_nodes przed dodaniem FK:
 *  1. Orphaned wbsNodeId (węzeł nie istnieje) → null
 *  2. Brakujące rekordy WbsNodeMaterial z wbsNodeIds JSON → tworzy
 *
 * Uruchomienie: node prisma/fix-req-wbs-fk.js
 * Tryb dry-run (tylko raport, bez zmian): node prisma/fix-req-wbs-fk.js --dry
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry');

async function main() {
    console.log(DRY ? '\n[DRY RUN — brak zmian w DB]\n' : '\n[TRYB ZAPISU]\n');

    const reqs = await prisma.materialRequirement.findMany({
        select: { id: true, name: true, wbsNodeId: true, wbsNodeIds: true, wbsNodeAllocations: true },
    });

    const allWbsNodes = await prisma.wbsNode.findMany({ select: { id: true } });
    const allWbsIds = new Set(allWbsNodes.map(n => n.id));

    const existingAllocs = await prisma.wbsNodeMaterial.findMany({
        select: { wbsNodeId: true, materialId: true },
    });
    const existingAllocSet = new Set(existingAllocs.map(r => `${r.materialId}:${r.wbsNodeId}`));

    let fixedOrphaned = 0;
    let createdAllocs = 0;

    for (const req of reqs) {
        // 1. Napraw orphaned wbsNodeId
        if (req.wbsNodeId && !allWbsIds.has(req.wbsNodeId)) {
            console.log(`  ORPHAN null: req "${req.name}" (${req.id}) wbsNodeId=${req.wbsNodeId}`);
            if (!DRY) {
                await prisma.materialRequirement.update({
                    where: { id: req.id },
                    data: { wbsNodeId: null },
                });
            }
            fixedOrphaned++;
        }

        // 2. Odbuduj WbsNodeMaterial z wbsNodeIds JSON
        let multiIds = [];
        try { multiIds = req.wbsNodeIds ? JSON.parse(req.wbsNodeIds) : []; } catch { }

        let allocMap = {};
        try { allocMap = req.wbsNodeAllocations ? JSON.parse(req.wbsNodeAllocations) : {}; } catch { }

        for (const wbsId of multiIds) {
            if (!allWbsIds.has(wbsId)) continue; // pomiń orphaned
            const key = `${req.id}:${wbsId}`;
            if (existingAllocSet.has(key)) continue;

            const quantity = parseFloat(allocMap[wbsId]) || 1;
            console.log(`  CREATE WbsNodeMaterial: req "${req.name}" -> wbsNode ${wbsId} qty=${quantity}`);
            if (!DRY) {
                await prisma.wbsNodeMaterial.create({
                    data: { wbsNodeId: wbsId, materialId: req.id, quantity },
                });
            }
            existingAllocSet.add(key);
            createdAllocs++;
        }
    }

    console.log(`\n=== Wynik ===`);
    console.log(`  Orphaned wbsNodeId → null: ${fixedOrphaned}`);
    console.log(`  Nowe WbsNodeMaterial:       ${createdAllocs}`);
    if (DRY) console.log('\n  (dry-run: żadne zmiany nie zostały zapisane)');
    else console.log('\n  ✅ Gotowe. Można teraz dodać FK do schematu Prisma.');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
