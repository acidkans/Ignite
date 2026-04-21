/**
 * Naprawa alokacji: re-pointuj wbs_node_materials, które wskazują na WbsNode
 * *rodzica* (bez type equipment/material), do dziecka o tym samym name i type
 * equipment/material — ten prawdziwy liść jest shadowem MaterialRequirement.
 *
 * Przypadek: MR "Switch SFP" (08fe2955) ma alokację do CCTV parent (2a9b79f3,
 * qty=1), ale rzeczywisty liść "Switch SFP" (1c7788a5, equipment, qty=111) jest
 * dzieckiem CCTV. Re-pointujemy do 1c7788a5.
 *
 * Strategia:
 *   1. Dla każdego wiersza w wbs_node_materials pobierz WbsNode alokacji.
 *   2. Jeśli ten WbsNode NIE ma type in ('equipment','material'), traktuj go
 *      jako rodzica i szukaj jego dziecka z MATCHING name (= MR.name)
 *      i type in ('equipment','material').
 *   3. Jeśli znaleziono dokładnie jedno takie dziecko — re-point:
 *      wbs_node_materials.wbsNodeId = child.id.
 *   4. Jeśli znaleziono 0 lub >1 — zostaw, zaloguj.
 *
 * Po tym należy uruchomić sync-material-quantities-from-wbs.js.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LEAF_TYPES = new Set(['equipment', 'material']);

async function main() {
    const allocs = await prisma.wbsNodeMaterial.findMany();
    console.log(`Znaleziono ${allocs.length} alokacji wbs_node_materials.`);

    let fixed = 0, ok = 0, ambiguous = 0, missing = 0, errors = 0;

    for (const a of allocs) {
        try {
            const [node, mr] = await Promise.all([
                prisma.wbsNode.findUnique({
                    where: { id: a.wbsNodeId },
                    select: { id: true, name: true, type: true },
                }),
                prisma.materialRequirement.findUnique({
                    where: { id: a.materialId },
                    select: { id: true, name: true },
                }),
            ]);
            if (!node || !mr) { missing++; continue; }

            if (LEAF_TYPES.has(node.type)) { ok++; continue; }

            const kids = await prisma.wbsNode.findMany({
                where: {
                    parentId: node.id,
                    name: mr.name,
                    type: { in: ['equipment', 'material'] },
                },
                select: { id: true, name: true, type: true, quantity: true },
            });

            if (kids.length === 0) {
                console.log(`  [skip] MR "${mr.name}" → parent ${node.name} (${node.type}): brak dziecka-liścia o tej nazwie`);
                missing++; continue;
            }
            if (kids.length > 1) {
                console.log(`  [ambig] MR "${mr.name}" → parent ${node.name}: ${kids.length} dzieci o tej nazwie — pomijam`);
                ambiguous++; continue;
            }

            const target = kids[0];
            const existing = await prisma.wbsNodeMaterial.findUnique({
                where: { wbsNodeId_materialId: { wbsNodeId: target.id, materialId: mr.id } },
            }).catch(() => null);

            if (existing) {
                // Już istnieje alokacja do liścia — usuń błędną (do rodzica)
                await prisma.wbsNodeMaterial.delete({ where: { id: a.id } });
                console.log(`  [dedup] MR "${mr.name}": usunięto alokację do rodzica, zachowano do liścia ${target.id}`);
            } else {
                await prisma.wbsNodeMaterial.update({
                    where: { id: a.id },
                    data: { wbsNodeId: target.id, quantity: target.quantity || 0 },
                });
                console.log(`  [fix] MR "${mr.name}": ${node.id} → ${target.id} (qty ${target.quantity})`);
            }
            fixed++;
        } catch (err) {
            console.error(`  [err] alokacja ${a.id}:`, err.message);
            errors++;
        }
    }

    console.log(`\nGotowe. Naprawiono: ${fixed}, OK (leaf): ${ok}, Pominięto (brak dziecka): ${missing}, Pominięto (wiele dzieci): ${ambiguous}, Błędy: ${errors}.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
