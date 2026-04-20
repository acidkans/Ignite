const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim()) : [];

async function main() {
    console.log('Syncing admins for emails:', adminEmails);

    if (adminEmails.length === 0) {
        console.log('No ADMIN_EMAILS defined.');
        return;
    }

    // Find ADMIN role
    const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
    if (!adminRole) {
        console.error('Role ADMIN not found in DB! Make sure you ran seeding.');
        return;
    }

    for (const email of adminEmails) {
        const user = await prisma.user.findUnique({ where: { email } });

        if (user) {
            console.log(`Checking user ${email}...`);

            // Check if already has ADMIN role
            const hasRole = await prisma.userRole.findUnique({
                where: {
                    userId_roleId: {
                        userId: user.id,
                        roleId: adminRole.id
                    }
                }
            });

            if (!hasRole) {
                console.log(`Assigning ADMIN role to ${email}...`);
                await prisma.userRole.create({
                    data: {
                        userId: user.id,
                        roleId: adminRole.id
                    }
                });
                console.log('Done.');
            } else {
                console.log(`User ${email} is already ADMIN.`);
            }
        } else {
            console.log(`User ${email} not found in DB - skipping.`);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
