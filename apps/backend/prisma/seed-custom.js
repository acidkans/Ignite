const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    const dataPath = path.join(__dirname, 'users-data.json');

    if (!fs.existsSync(dataPath)) {
        console.error('File users-data.json not found!');
        process.exit(1);
    }

    const usersData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    console.log(`Found ${usersData.length} users to import...`);

    // Role Alias Mapping
    const roleAliases = {
        'ADMINISTRATOR': 'ADMIN',
        'MANAGER': 'MANAGER',
        'USER': 'USER',
        'PRACOWNIK': 'USER'
    };

    for (const userData of usersData) {
        try {
            // 1. Ensure Role
            let roleName = userData.role ? userData.role.toUpperCase() : 'USER';
            if (roleAliases[roleName]) {
                roleName = roleAliases[roleName];
            }

            const role = await prisma.role.findUnique({ where: { name: roleName } });

            if (!role) {
                console.warn(`Role ${roleName} not found for user ${userData.email}. Skipping.`);
                continue;
            }

            // 2. Ensure Team (if provided)
            let teamId = null;
            if (userData.team) {
                const team = await prisma.team.upsert({
                    where: { name: userData.team },
                    update: {},
                    create: { name: userData.team }
                });
                teamId = team.id;
                console.log(`Team ${userData.team} ensured.`);
            }

            // 3. Create/Update User
            const hashedPassword = await argon2.hash(userData.password);

            const user = await prisma.user.upsert({
                where: { email: userData.email },
                update: {
                    password: hashedPassword,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    teams: teamId ? { set: [{ id: teamId }] } : undefined
                },
                create: {
                    email: userData.email,
                    password: hashedPassword,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    teams: teamId ? { connect: [{ id: teamId }] } : undefined
                }
            });

            // 4. Assign Role
            await prisma.userRole.upsert({
                where: {
                    userId_roleId: {
                        userId: user.id,
                        roleId: role.id
                    }
                },
                update: {},
                create: {
                    userId: user.id,
                    roleId: role.id
                }
            });

            console.log(`User ${userData.email} imported successfully.`);

        } catch (error) {
            console.error(`Error importing user ${userData.email}:`, error.message);
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
