const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@gigatel.app';
    const password = 'password123';

    console.log(`Creating admin user: ${email}`);

    try {
        const hashedPassword = await argon2.hash(password);

        // 1. Find ADMIN role
        const adminRole = await prisma.role.findUnique({
            where: { name: 'ADMIN' }
        });

        if (!adminRole) {
            throw new Error('ADMIN role not found. Run seed.js first.');
        }

        // 2. Create or Update User
        const user = await prisma.user.upsert({
            where: { email },
            update: {
                password: hashedPassword, // Reset password if exists
                firstName: 'Admin',
                lastName: 'User'
            },
            create: {
                email,
                password: hashedPassword,
                firstName: 'Admin',
                lastName: 'User'
            }
        });

        console.log(`User ${user.email} created/updated.`);

        // 3. Assign Role
        // Check if role already assigned
        const existingRole = await prisma.userRole.findUnique({
            where: {
                userId_roleId: {
                    userId: user.id,
                    roleId: adminRole.id
                }
            }
        });

        if (!existingRole) {
            await prisma.userRole.create({
                data: {
                    userId: user.id,
                    roleId: adminRole.id
                }
            });
            console.log('Assigned ADMIN role.');
        } else {
            console.log('User already has ADMIN role.');
        }

        console.log('\n--- Credentials ---');
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        console.log('-------------------');

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
