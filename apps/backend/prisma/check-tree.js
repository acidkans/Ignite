const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.processNode.count();
    console.log(`Total ProcessNodes: ${count}`);

    if (count > 0) {
        const nodes = await prisma.processNode.findMany({
            take: 5,
            select: { id: true, name: true, type: true }
        });
        console.log('Sample nodes:', nodes);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
