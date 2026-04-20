const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function run() {
    const vs = await prisma.projectVersion.findMany({
        where: { nodeId: 'ce1050ab-0914-4f47-9e64-3c09dea05055' },
        orderBy: { createdAt: 'asc' }
    });

    let out = '';
    vs.forEach(v => {
        out += `Label: ${v.label} | Created: ${v.createdAt.toISOString()} | ID: ${v.id}\n`;
    });

    fs.writeFileSync('output.txt', out);
    console.log('Done. Check output.txt');
    process.exit();
}

run();
