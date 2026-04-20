
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Rebuilding ProcessNodeClosure table...');

    // 1. Clear existing closure table
    await prisma.processNodeClosure.deleteMany({});
    console.log('Cleared existing closure entries.');

    // 2. Fetch all nodes
    const nodes = await prisma.processNode.findMany();
    console.log(`Found ${nodes.length} nodes.`);

    // 3. Rebuild closure for each node
    for (const node of nodes) {
        // 3.1 Self-loop
        await prisma.processNodeClosure.create({
            data: {
                ancestorId: node.id,
                descendantId: node.id,
                depth: 0
            }
        });

        // 3.2 Ancestors
        let current = node;
        let depth = 1;

        while (current.parentId) {
            const parent = nodes.find(n => n.id === current.parentId);
            if (!parent) break;

            await prisma.processNodeClosure.create({
                data: {
                    ancestorId: parent.id,
                    descendantId: node.id,
                    depth: depth
                }
            });

            current = parent;
            depth++;
        }
    }

    console.log('Closure table rebuilt successfully!');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
