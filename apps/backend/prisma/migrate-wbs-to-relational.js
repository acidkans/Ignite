/**
 * Jednorazowy skrypt migracji: parsuje wbsTree JSON blob z OrderRequirements
 * i wstawia węzły do tabeli wbs_nodes.
 *
 * Uruchomienie: node prisma/migrate-wbs-to-relational.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function flattenTree(items, nodeId, versionId, parentId) {
    const rows = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const id = item.id;
        if (!id) continue;

        rows.push({
            id,
            parentId,
            nodeId,
            versionId,
            name: item.name || '',
            type: item.type || '',
            status: item.status || '',
            owner: item.owner || '',
            resources: item.resources || '',
            cost: item.cost || '',
            tags: Array.isArray(item.tags) && item.tags.length > 0 ? JSON.stringify(item.tags) : null,
            sortOrder: i,
        });

        if (item.children?.length) {
            rows.push(...flattenTree(item.children, nodeId, versionId, id));
        }
    }
    return rows;
}

async function main() {
    // Pobierz wszystkie OrderRequirements z niepustym wbsTree
    const records = await prisma.orderRequirements.findMany({
        where: { wbsTree: { not: null } },
        select: { id: true, nodeId: true, versionId: true, wbsTree: true },
    });

    console.log(`Znaleziono ${records.length} rekordów OrderRequirements z wbsTree`);

    let totalNodes = 0;
    let migratedRecords = 0;

    for (const record of records) {
        let tree;
        try {
            tree = JSON.parse(record.wbsTree);
        } catch {
            console.warn(`  Pominięto ${record.id} — nieprawidłowy JSON`);
            continue;
        }

        const items = tree.items || [];
        if (items.length === 0) continue;

        const versionId = record.versionId || null;
        const rows = flattenTree(items, record.nodeId, versionId, null);

        if (rows.length === 0) continue;

        // Sprawdź czy węzły już istnieją (idempotentność)
        const existingCount = await prisma.wbsNode.count({
            where: { nodeId: record.nodeId, versionId },
        });

        if (existingCount > 0) {
            console.log(`  Pominięto ${record.nodeId} — ${existingCount} węzłów już istnieje`);
            continue;
        }

        // Wstaw parent-first (top-down order zachowany przez flattenTree)
        for (const row of rows) {
            await prisma.wbsNode.create({ data: row });
        }

        totalNodes += rows.length;
        migratedRecords++;
        console.log(`  ${record.nodeId}: ${rows.length} węzłów`);
    }

    console.log(`\nMigracja zakończona: ${migratedRecords} projektów, ${totalNodes} węzłów`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
