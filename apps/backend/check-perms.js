const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const permissions = await prisma.permission.findMany();
        console.log('All Permissions in DB:');
        console.log(JSON.stringify(permissions, null, 2));

        const user = await prisma.user.findFirst({
            where: { email: 'a@poz.pl' },
            include: {
                userRoles: {
                    include: {
                        role: {
                            include: {
                                rolePermissions: {
                                    include: {
                                        permission: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!user) {
            console.log('\nUser a@poz.pl NOT FOUND');
        } else {
            console.log(`\nUser: ${user.email} (ID: ${user.id})`);
            console.log('User roles and permissions:');
            user.userRoles.forEach(ur => {
                console.log(`- Role: ${ur.role.name}`);
                ur.role.rolePermissions.forEach(rp => {
                    console.log(`  * Permission: ${rp.permission.name}`);
                });
            });
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
