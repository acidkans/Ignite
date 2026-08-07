const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const nodeId = '8de6036d-8ab8-42f0-8664-bf13a7d72571';
    const reqs = await prisma.orderRequirements.findMany({
        where: { nodeId },
        select: { id: true, versionId: true, offerText: true, wbsDescription: true, updatedAt: true }
    });
    for (const r of reqs) {
        const label = r.versionId
            ? (await prisma.projectVersion.findUnique({ where: { id: r.versionId }, select: { label: true } }))?.label
            : 'BASELINE';
        console.log(`\n[${label}] versionId=${r.versionId}`);
        console.log(`  offerText   : ${r.offerText ?? 'null'}`);
        console.log(`  wbsDesc     : ${r.wbsDescription ? r.wbsDescription.substring(0,100) : 'null'}`);
        console.log(`  updatedAt   : ${r.updatedAt}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
