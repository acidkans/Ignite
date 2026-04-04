const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const teams = await prisma.team.findMany({ select: { name: true, createdAt: true } });

    console.log(`Teams (${teams.length}):`);
    teams.forEach(t => console.log(`- ${t.name} (Created: ${t.createdAt.toISOString()})`));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
