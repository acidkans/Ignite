const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const userCount = await prisma.user.count();
    const teamCount = await prisma.team.count();
    const users = await prisma.user.findMany({
        take: 5,
        select: { email: true, createdAt: true, teams: { select: { name: true } } }
    });

    console.log(`Users: ${userCount}`);
    console.log(`Teams: ${teamCount}`);
    console.log('Sample Users:');
    users.forEach(u => {
        console.log(`- ${u.email} (Created: ${u.createdAt.toISOString()}) [Teams: ${u.teams.map(t => t.name).join(', ')}]`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
