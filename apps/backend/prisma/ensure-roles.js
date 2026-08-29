// @anchor ensure-roles-script
// Idempotentny upsert samych rol systemowych (bez uzytkownikow i danych) —
// do uruchomienia po dodaniu nowej roli, takze na produkcji.
// Uzycie: node apps/backend/prisma/ensure-roles.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ROLES = ['ADMIN', 'MANAGER', 'USER', 'LOGISTYK', 'DAK'];

async function main() {
    for (const name of ROLES) {
        await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
        console.log(`Role ensured: ${name}`);
    }
    const all = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    console.log('Role w bazie:', all.map(r => r.name).join(', '));
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
