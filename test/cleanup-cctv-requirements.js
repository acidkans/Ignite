/**
 * Cleanup: usuwa auto-utworzone wymagania materiałowe nazwane "cctv"
 * które zostały błędnie stworzone przez auto-sync z węzłów WBS branchowych.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Znajdź wymagania o nazwie "cctv" — to dane z WBS branchy, nie liści
    const junkRequirements = await prisma.materialRequirement.findMany({
        where: { name: 'cctv' },
        select: { id: true, name: true, type: true, createdAt: true },
    });

    console.log(`Found ${junkRequirements.length} "cctv" junk requirements:`);
    junkRequirements.forEach(r => console.log(`  - ${r.id} | ${r.type} | ${r.createdAt}`));

    if (junkRequirements.length > 0) {
        const ids = junkRequirements.map(r => r.id);
        const deleted = await prisma.materialRequirement.deleteMany({
            where: { id: { in: ids } },
        });
        console.log(`Deleted ${deleted.count} junk records.`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
