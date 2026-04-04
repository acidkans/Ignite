/**
 * Jednorazowy skrypt migracji: parsuje wbsNodeAllocations JSON z MaterialRequirement
 * i wstawia wiersze do tabeli wbs_node_materials.
 *
 * WYMAGA: wcześniejsze uruchomienie migrate-wbs-to-relational.js (tabela wbs_nodes musi mieć dane)
 *
 * Uruchomienie: node prisma/migrate-allocations-to-relational.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const materials = await prisma.materialRequirement.findMany({
        where: { wbsNodeAllocations: { not: null } },
        select: { id: true, wbsNodeAllocations: true },
    });

    console.log(`Znaleziono ${materials.length} materiałów z wbsNodeAllocations`);

    // Pobierz zbiór istniejących wbs_nodes IDs
    const allWbsNodes = await prisma.wbsNode.findMany({ select: { id: true } });
    const validWbsIds = new Set(allWbsNodes.map(n => n.id));

    // Sprawdź istniejące alokacje (idempotentność)
    const existingCount = await prisma.wbsNodeMaterial.count();
    if (existingCount > 0) {
        console.log(`Tabela wbs_node_materials już zawiera ${existingCount} wierszy — pomijam migrację`);
        return;
    }

    let created = 0;
    let skipped = 0;

    for (const mat of materials) {
        let allocations;
        try {
            allocations = JSON.parse(mat.wbsNodeAllocations);
        } catch {
            console.warn(`  Pominięto ${mat.id} — nieprawidłowy JSON`);
            continue;
        }

        for (const [wbsNodeId, quantity] of Object.entries(allocations)) {
            if (!validWbsIds.has(wbsNodeId)) {
                skipped++;
                continue;
            }

            try {
                await prisma.wbsNodeMaterial.create({
                    data: {
                        wbsNodeId,
                        materialId: mat.id,
                        quantity: Number(quantity) || 1,
                    },
                });
                created++;
            } catch (e) {
                // Duplicate — skip
                skipped++;
            }
        }
    }

    console.log(`\nMigracja zakończona: ${created} alokacji utworzonych, ${skipped} pominiętych`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
