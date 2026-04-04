const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
    const usersDataPath = path.join(__dirname, 'users-data.json');
    const usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf-8'));

    console.log(`📋 Wczytano ${usersData.length} użytkowników z users-data.json`);

    // Upewnij się że rola ADMIN istnieje
    let adminRole = await prisma.role.upsert({
        where: { name: 'ADMIN' },
        update: {},
        create: { name: 'ADMIN' },
    });
    console.log(`✅ Rola ADMIN: ${adminRole.id}`);

    // Dodaj lub zaktualizuj użytkowników (upsert - bezpieczne przy wielokrotnym uruchomieniu)
    for (const userData of usersData) {
        const hashedPassword = await argon2.hash(userData.password);

        const user = await prisma.user.upsert({
            where: { email: userData.email },
            update: {
                password: hashedPassword,
                firstName: userData.firstName || null,
                lastName: userData.lastName || null,
                isActive: true,
            },
            create: {
                email: userData.email,
                password: hashedPassword,
                firstName: userData.firstName || null,
                lastName: userData.lastName || null,
                isActive: true,
            },
        });

        // Przypisz rolę ADMIN jeśli jeszcze nie ma
        const existingRole = await prisma.userRole.findFirst({
            where: { userId: user.id, roleId: adminRole.id },
        });
        if (!existingRole) {
            await prisma.userRole.create({
                data: { userId: user.id, roleId: adminRole.id },
            });
        }

        console.log(`✅ Użytkownik: ${user.email} (${user.firstName} ${user.lastName})`);
    }

    console.log(`\n🎉 Gotowe! Zaseedowano ${usersData.length} użytkowników.`);
}

main()
    .catch(e => {
        console.error('❌ Błąd seedowania:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
