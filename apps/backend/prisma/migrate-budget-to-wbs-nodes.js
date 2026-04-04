/**
 * Jednorazowy skrypt migracji: kopiuje dane budżetowe z BudgetLineItem
 * do pól budżetowych na WbsNode (dla wpisów WORK / EXTERNAL_SERVICE).
 *
 * WYMAGA: wcześniejsze uruchomienie migrate-wbs-to-relational.js (tabela wbs_nodes musi mieć dane)
 *
 * Uruchomienie: node prisma/migrate-budget-to-wbs-nodes.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Pobierz BudgetLineItems z wbsNodeId (powiązane z WBS)
    const budgetItems = await prisma.budgetLineItem.findMany({
        where: {
            wbsNodeId: { not: null },
            type: { not: 'MATERIAL' }, // MATERIAL items are computed from WbsNodeMaterial
        },
    });

    console.log(`Znaleziono ${budgetItems.length} pozycji budżetowych WORK/SERVICE do migracji`);

    let updated = 0;
    let skipped = 0;

    for (const item of budgetItems) {
        // Sprawdź czy WbsNode istnieje
        const node = await prisma.wbsNode.findUnique({
            where: { id: item.wbsNodeId },
            select: { id: true, budgetType: true },
        });

        if (!node) {
            skipped++;
            continue;
        }

        // Pomiń jeśli już ma dane budżetowe
        if (node.budgetType) {
            skipped++;
            continue;
        }

        await prisma.wbsNode.update({
            where: { id: item.wbsNodeId },
            data: {
                budgetType: item.type,
                unit: item.unit || 'szt',
                unitCost: item.unitCost || 0,
                quantity: item.quantity || 1,
                totalCost: item.totalCost || 0,
                margin: item.margin || 0,
                discount: item.discount || 0,
                unitPrice: item.unitPrice || 0,
                totalPrice: item.totalPrice || 0,
                comment: item.comment || null,
            },
        });
        updated++;
    }

    console.log(`\nMigracja zakończona: ${updated} węzłów zaktualizowanych, ${skipped} pominiętych`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
