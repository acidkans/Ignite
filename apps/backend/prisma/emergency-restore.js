const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();

async function main() {
    console.log('Restoring essential data with roles...');

    // 1. Create ADMIN Role
    const adminRole = await prisma.role.upsert({
        where: { name: 'ADMIN' },
        update: {},
        create: { name: 'ADMIN' }
    });
    console.log('Role ADMIN ensured.');

    // 2. Create Users
    const hashedPassword = await argon2.hash('admin');
    const userEmails = ['admin@poz.pl', 'a@poz.pl'];
    const users = [];

    for (const email of userEmails) {
        const user = await prisma.user.upsert({
            where: { email },
            update: { password: hashedPassword },
            create: {
                email,
                password: hashedPassword,
                firstName: email.split('@')[0],
                lastName: 'Systemu'
            }
        });

        // Assign ADMIN role
        await prisma.userRole.upsert({
            where: {
                userId_roleId: {
                    userId: user.id,
                    roleId: adminRole.id
                }
            },
            update: {},
            create: {
                userId: user.id,
                roleId: adminRole.id
            }
        });

        users.push(user);
        console.log(`User ${email} created/updated and assigned ADMIN role.`);
    }

    const primaryUser = users.find(u => u.email === 'a@poz.pl') || users[0];

    // 3. Create Nodes
    const nodes = [
        { id: "2a837f28-9b92-48f6-8939-e0934cc6e403", parentId: null, name: "AMP", type: "area", ownerId: primaryUser.id, customTypeLabel: "KLIENT", address: "ul. Metalurgiczna 1, Poznań", nip: "123-456-78-90", region: "Wielkopolska", contactPerson: "Jan Kowalski" },
        { id: "9e38a137-dc6a-4d71-b230-dab01c5de18f", parentId: "2a837f28-9b92-48f6-8939-e0934cc6e403", name: "Kraków", type: "site", ownerId: primaryUser.id },
        { id: "e608e039-d1d0-432f-801a-c962baf1a0f5", parentId: "2a837f28-9b92-48f6-8939-e0934cc6e403", name: "Dąbrowa", type: "site", ownerId: primaryUser.id },
        { id: "gst4-order-id", parentId: "e608e039-d1d0-432f-801a-c962baf1a0f5", name: "GST4", type: "order", ownerId: primaryUser.id },
        { id: "ce1050ab-0914-4f47-9e64-3c09dea05055", parentId: "9e38a137-dc6a-4d71-b230-dab01c5de18f", name: "kamery walcowania Nawa AB", type: "order", ownerId: primaryUser.id }
    ];

    for (const node of nodes) {
        await prisma.processNode.upsert({
            where: { id: node.id },
            update: node,
            create: node
        });
        console.log(`Node restored: ${node.name}`);

        // Self-loop
        await prisma.processNodeClosure.upsert({
            where: { ancestorId_descendantId: { ancestorId: node.id, descendantId: node.id } },
            update: {},
            create: { ancestorId: node.id, descendantId: node.id, depth: 0 }
        });
    }

    // 4. Manual Closure Rebuild (Simplistic for this static tree)
    const relationships = [
        { anc: "2a837f28-9b92-48f6-8939-e0934cc6e403", desc: "9e38a137-dc6a-4d71-b230-dab01c5de18f", depth: 1 }, // AMP -> Kraków
        { anc: "2a837f28-9b92-48f6-8939-e0934cc6e403", desc: "e608e039-d1d0-432f-801a-c962baf1a0f5", depth: 1 }, // AMP -> Dąbrowa
        { anc: "9e38a137-dc6a-4d71-b230-dab01c5de18f", desc: "ce1050ab-0914-4f47-9e64-3c09dea05055", depth: 1 }, // Kraków -> Order
        { anc: "e608e039-d1d0-432f-801a-c962baf1a0f5", desc: "gst4-order-id", depth: 1 },                   // Dąbrowa -> GST4
        { anc: "2a837f28-9b92-48f6-8939-e0934cc6e403", desc: "ce1050ab-0914-4f47-9e64-3c09dea05055", depth: 2 },  // AMP -> Kraków Order
        { anc: "2a837f28-9b92-48f6-8939-e0934cc6e403", desc: "gst4-order-id", depth: 2 }                   // AMP -> GST4
    ];

    for (const rel of relationships) {
        await prisma.processNodeClosure.upsert({
            where: { ancestorId_descendantId: { ancestorId: rel.anc, descendantId: rel.desc } },
            update: { depth: rel.depth },
            create: { ancestorId: rel.anc, descendantId: rel.desc, depth: rel.depth }
        });
    }

    console.log('Closure table fully restored.');
    console.log('Done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
