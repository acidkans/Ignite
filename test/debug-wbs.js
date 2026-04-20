const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugWbs() {
    try {
        console.log('=== Searching for Stadion Wiśnicz nodes ===');
        const nodes = await prisma.processNode.findMany({
            where: { name: { contains: 'Stadion' } },
            select: { id: true, name: true, type: true, parentId: true, createdAt: true },
        });
        
        console.log('Found nodes:', JSON.stringify(nodes, null, 2));
        
        for (const node of nodes) {
            console.log(`\n=== Node: ${node.name} (${node.id}) ===`);
            console.log(`Type: ${node.type}`);
            console.log(`ParentId: ${node.parentId}`);
            
            // Check WBS nodes exist
            const wbsCount = await prisma.wbsNode.count({
                where: { nodeId: node.id }
            });
            console.log(`WBS nodes for this node: ${wbsCount}`);
            
            if (node.parentId) {
                const parent = await prisma.processNode.findUnique({
                    where: { id: node.parentId },
                    select: { id: true, name: true, type: true },
                });
                console.log(`Parent: ${parent?.name} (type: ${parent?.type})`);
                
                // Check parent WBS
                if (parent) {
                    const parentWbsCount = await prisma.wbsNode.count({
                        where: { nodeId: parent.id }
                    });
                    console.log(`WBS nodes for parent: ${parentWbsCount}`);
                }
            }
        }
        
        // Test resolveOrderNodeId logic
        console.log('\n=== Testing fallback logic ===');
        const siteNode = nodes.find(n => n.type === 'site');
        if (siteNode) {
            console.log(`Simulating resolveOrderNodeId for ${siteNode.name} (${siteNode.id})...`);
            let currentId = siteNode.id;
            for (let i = 0; i < 10; i++) {
                const node = await prisma.processNode.findUnique({
                    where: { id: currentId },
                    select: { id: true, type: true, parentId: true },
                });
                console.log(`  Step ${i}: ${node?.name} type=${node?.type} parentId=${node?.parentId}`);
                
                if (!node) break;
                if (String(node.type || '').toLowerCase() === 'order') {
                    console.log(`  Found order node: ${node.id}`);
                    break;
                }
                if (!node.parentId) break;
                currentId = node.parentId;
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugWbs();
