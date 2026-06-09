/**
 * Jednorazowy skrypt migracji: materializacja baseline (versionId = null) jako
 * realna wersja "pierwszy" dla każdego zamówienia (ProcessNode type = ORDER).
 *
 * Po przejściu na model "eager" (każde zamówienie ma realną wersję od startu)
 * istniejące zamówienia wciąż trzymają treść na baseline null. Ten skrypt dla
 * każdego ORDER bez żadnej ProjectVersion:
 *   1. tworzy ProjectVersion { label: 'pierwszy', isActive: true },
 *   2. przepisuje versionId: null -> pierwszy.id w 4 tabelach TREŚCI:
 *      WbsNode, Subtask, BudgetLineItem, MaterialRequirement.
 *
 * NIE rusza OrderRequirements — tam versionId=null to celowy rekord GLOBALNY
 * (cross-version: offerStatus, projectGoal, projectItems, clientContacts).
 *
 * Idempotentny: zamówienia, które mają już jakąkolwiek ProjectVersion, są pomijane.
 *
 * Uruchomienie (podgląd):  node prisma/migrate-baseline-to-first-version.js --dry
 * Uruchomienie (zapis):    node prisma/migrate-baseline-to-first-version.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY = process.argv.includes('--dry');

async function main() {
    console.log(`\n=== migrate-baseline-to-first-version ${DRY ? '(DRY RUN — bez zapisu)' : '(ZAPIS)'} ===\n`);

    // Pobierz wszystkie węzły i odfiltruj zamówienia po type (case-insensitive),
    // spójnie z resolveOrderNodeId, gdzie porównanie idzie przez toLowerCase().
    const allNodes = await prisma.processNode.findMany({ select: { id: true, name: true, type: true } });
    const orders = allNodes.filter((n) => String(n.type || '').toLowerCase() === 'order');
    console.log(`Znaleziono ${orders.length} zamówień (ORDER) na ${allNodes.length} węzłów łącznie.`);

    let migrated = 0;
    let skippedHasVersion = 0;
    let createdEmpty = 0;
    const totals = { wbs: 0, sub: 0, bud: 0, mat: 0 };

    for (const order of orders) {
        const versionCount = await prisma.projectVersion.count({ where: { nodeId: order.id } });
        if (versionCount > 0) {
            skippedHasVersion++;
            continue;
        }

        const counts = {
            wbs: await prisma.wbsNode.count({ where: { nodeId: order.id, versionId: null } }),
            sub: await prisma.subtask.count({ where: { nodeId: order.id, versionId: null } }),
            bud: await prisma.budgetLineItem.count({ where: { nodeId: order.id, versionId: null } }),
            mat: await prisma.materialRequirement.count({ where: { nodeId: order.id, versionId: null } }),
        };
        const total = counts.wbs + counts.sub + counts.bud + counts.mat;
        if (total === 0) createdEmpty++;

        console.log(
            `→ "${order.name}" (${order.id.slice(0, 8)}) — WBS:${counts.wbs} Subtask:${counts.sub} Budget:${counts.bud} Material:${counts.mat}`
        );

        if (DRY) continue;

        await prisma.$transaction(async (tx) => {
            const fv = await tx.projectVersion.create({
                data: { nodeId: order.id, label: 'pierwszy', isActive: true },
            });
            await tx.wbsNode.updateMany({ where: { nodeId: order.id, versionId: null }, data: { versionId: fv.id } });
            await tx.subtask.updateMany({ where: { nodeId: order.id, versionId: null }, data: { versionId: fv.id } });
            await tx.budgetLineItem.updateMany({ where: { nodeId: order.id, versionId: null }, data: { versionId: fv.id } });
            await tx.materialRequirement.updateMany({ where: { nodeId: order.id, versionId: null }, data: { versionId: fv.id } });
        });

        migrated++;
        totals.wbs += counts.wbs;
        totals.sub += counts.sub;
        totals.bud += counts.bud;
        totals.mat += counts.mat;
    }

    console.log(`\n--- Podsumowanie ---`);
    console.log(`Pominięto (mają już wersję):     ${skippedHasVersion}`);
    if (DRY) {
        console.log(`Do migracji (zamówień):          ${orders.length - skippedHasVersion}`);
        console.log(`\n(DRY RUN — nic nie zapisano. Uruchom bez --dry, aby wykonać.)`);
    } else {
        console.log(`Zmigrowano (zamówień):           ${migrated}  (w tym pustych: ${createdEmpty})`);
        console.log(`Przepisano wierszy → "pierwszy": WBS:${totals.wbs} Subtask:${totals.sub} Budget:${totals.bud} Material:${totals.mat}`);
    }
    console.log(``);
}

main()
    .catch((e) => {
        console.error('BŁĄD migracji:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
