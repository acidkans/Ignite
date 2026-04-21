/**
 * Audyt powiązań material_requirements <-> wbs_nodes
 * Uruchomienie: node prisma/audit-req-wbs-links.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const reqs = await prisma.materialRequirement.findMany({
        select: {
            id: true,
            name: true,
            nodeId: true,
            wbsNodeId: true,
            wbsNodeIds: true,
            type: true,
        },
    });

    const allWbsIds = new Set(
        (await prisma.wbsNode.findMany({ select: { id: true } })).map(n => n.id)
    );

    const wbsNodeMaterials = await prisma.wbsNodeMaterial.findMany({
        select: { wbsNodeId: true, materialId: true },
    });
    const existingAllocSet = new Set(wbsNodeMaterials.map(r => `${r.materialId}:${r.wbsNodeId}`));

    let withValidFk = 0;
    let orphanedSingle = 0;
    let noWbsAtAll = 0;
    let multiOnly = 0;
    let multiPartiallyValid = 0;
    let alreadyInWbsNodeMaterial = 0;
    let missingFromWbsNodeMaterial = 0;

    const orphanedList = [];
    const multiMissingAlloc = [];

    for (const req of reqs) {
        const hasSingle = !!req.wbsNodeId;
        const multiIds = (() => {
            try { return req.wbsNodeIds ? JSON.parse(req.wbsNodeIds) : []; }
            catch { return []; }
        })();

        if (!hasSingle && multiIds.length === 0) {
            noWbsAtAll++;
            continue;
        }

        if (hasSingle) {
            if (allWbsIds.has(req.wbsNodeId)) {
                withValidFk++;
            } else {
                orphanedSingle++;
                orphanedList.push({ id: req.id, name: req.name, wbsNodeId: req.wbsNodeId });
            }
        }

        if (multiIds.length > 0) {
            const validMulti = multiIds.filter(id => allWbsIds.has(id));
            if (validMulti.length > 0 && !hasSingle) multiOnly++;
            if (validMulti.length > 0) multiPartiallyValid += validMulti.length;

            for (const wbsId of validMulti) {
                const key = `${req.id}:${wbsId}`;
                if (existingAllocSet.has(key)) {
                    alreadyInWbsNodeMaterial++;
                } else {
                    missingFromWbsNodeMaterial++;
                    multiMissingAlloc.push({ reqId: req.id, reqName: req.name, wbsNodeId: wbsId });
                }
            }
        }
    }

    console.log('\n=== AUDYT material_requirements <-> wbs_nodes ===\n');
    console.log(`Łącznie wymagań:                      ${reqs.length}`);
    console.log(`  ✅ z poprawnym wbsNodeId (FK ready): ${withValidFk}`);
    console.log(`  ❌ wbsNodeId orphaned (brak w WBS):  ${orphanedSingle}`);
    console.log(`  ⚪ bez żadnego wbsNodeId:             ${noWbsAtAll}`);
    console.log(`  🔀 tylko wieloalokacja (wbsNodeIds):  ${multiOnly}`);
    console.log(`  🔀 węzłów w wieloalokacjach valid:   ${multiPartiallyValid}`);
    console.log(`\nWbsNodeMaterial (alokacje M:N):`);
    console.log(`  ✅ już istnieją w tabeli:             ${alreadyInWbsNodeMaterial}`);
    console.log(`  ⚠️  brakuje w tabeli (do odbudowy):   ${missingFromWbsNodeMaterial}`);

    if (orphanedList.length > 0) {
        console.log('\n--- Orphaned wbsNodeId (pierwsze 20) ---');
        orphanedList.slice(0, 20).forEach(r =>
            console.log(`  req ${r.id} "${r.name}" -> wbsNode ${r.wbsNodeId} (nie istnieje)`)
        );
    }

    if (multiMissingAlloc.length > 0) {
        console.log('\n--- Brakujące alokacje M:N (pierwsze 20) ---');
        multiMissingAlloc.slice(0, 20).forEach(r =>
            console.log(`  req ${r.reqId} "${r.reqName}" -> wbsNode ${r.wbsNodeId}`)
        );
    }

    console.log('\n=== Gotowość do migracji FK ===');
    const ready = orphanedSingle === 0 && missingFromWbsNodeMaterial === 0;
    if (ready) {
        console.log('✅ Dane gotowe — można dodać FK bez skryptu naprawczego.');
    } else {
        console.log('⚠️  Uruchom fix-req-wbs-fk.js przed dodaniem FK do schematu.');
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
