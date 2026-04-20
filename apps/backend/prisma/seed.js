const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Seed roles
    const roles = ['ADMIN', 'MANAGER', 'USER'];
    const roleRecords = {};

    for (const roleName of roles) {
        const role = await prisma.role.upsert({
            where: { name: roleName },
            update: {},
            create: { name: roleName }
        });
        roleRecords[roleName] = role;
        console.log(`Role ensured: ${role.name}`);
    }

    // Seed permissions
    const permissions = ['TREE_VIEW', 'TREE_EDIT', 'FILE_READ', 'FILE_UPLOAD', 'USER_READ', 'USER_EDIT'];
    const permissionRecords = {};

    for (const permName of permissions) {
        const permission = await prisma.permission.upsert({
            where: { name: permName },
            update: {},
            create: { name: permName }
        });
        permissionRecords[permName] = permission;
        console.log(`Permission ensured: ${permission.name}`);
    }

    // Assign permissions to ADMIN role
    const adminPermissions = ['TREE_VIEW', 'TREE_EDIT', 'FILE_READ', 'FILE_UPLOAD', 'USER_READ', 'USER_EDIT'];

    for (const permName of adminPermissions) {
        await prisma.rolePermission.upsert({
            where: {
                roleId_permissionId: {
                    roleId: roleRecords['ADMIN'].id,
                    permissionId: permissionRecords[permName].id,
                }
            },
            update: {},
            create: {
                roleId: roleRecords['ADMIN'].id,
                permissionId: permissionRecords[permName].id,
            }
        });
    }

    console.log('ADMIN role has all permissions');

    // Assign TREE_VIEW to MANAGER
    await prisma.rolePermission.upsert({
        where: {
            roleId_permissionId: {
                roleId: roleRecords['MANAGER'].id,
                permissionId: permissionRecords['TREE_VIEW'].id,
            }
        },
        update: {},
        create: {
            roleId: roleRecords['MANAGER'].id,
            permissionId: permissionRecords['TREE_VIEW'].id,
        }
    });

    // Assign TREE_EDIT to MANAGER (Added)
    await prisma.rolePermission.upsert({
        where: {
            roleId_permissionId: {
                roleId: roleRecords['MANAGER'].id,
                permissionId: permissionRecords['TREE_EDIT'].id,
            }
        },
        update: {},
        create: {
            roleId: roleRecords['MANAGER'].id,
            permissionId: permissionRecords['TREE_EDIT'].id,
        }
    });

    console.log('MANAGER role has TREE_VIEW permission');

    // Assign USER_READ to MANAGER
    await prisma.rolePermission.upsert({
        where: {
            roleId_permissionId: {
                roleId: roleRecords['MANAGER'].id,
                permissionId: permissionRecords['USER_READ'].id,
            }
        },
        update: {},
        create: {
            roleId: roleRecords['MANAGER'].id,
            permissionId: permissionRecords['USER_READ'].id,
        }
    });

    // Assign USER_EDIT to MANAGER (Added for Team Management)
    await prisma.rolePermission.upsert({
        where: {
            roleId_permissionId: {
                roleId: roleRecords['MANAGER'].id,
                permissionId: permissionRecords['USER_EDIT'].id,
            }
        },
        update: {},
        create: {
            roleId: roleRecords['MANAGER'].id,
            permissionId: permissionRecords['USER_EDIT'].id,
        }
    });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
