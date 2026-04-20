const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Restoring full project data...');

    const dbUsers = await prisma.user.findMany();
    const adminUser = dbUsers.find(u => u.email === 'a@poz.pl' || u.email === 'admin@poz.pl' || u.email === 'jan.kowalski@poz.pl') || dbUsers[0];

    if (!adminUser) {
        console.error('No users found in database.');
        return;
    }

    // 1. Nodes
    const nodes = [
        { id: "2a837f28-9b92-48f6-8939-e0934cc6e403", parentId: null, name: "AMP", type: "area", ownerId: adminUser.id, isPublic: false, visibility: "private" },
        { id: "9e38a137-dc6a-4d71-b230-dab01c5de18f", parentId: "2a837f28-9b92-48f6-8939-e0934cc6e403", name: "Kraków", type: "site", ownerId: adminUser.id, isPublic: false, visibility: "private" },
        { id: "e608e039-d1d0-432f-801a-c962baf1a0f5", parentId: "2a837f28-9b92-48f6-8939-e0934cc6e403", name: "Dąbrowa", type: "site", ownerId: adminUser.id, isPublic: false, visibility: "private" },
        { id: "ce1050ab-0914-4f47-9e64-3c09dea05055", parentId: "9e38a137-dc6a-4d71-b230-dab01c5de18f", name: "kamery walcowania Nawa AB", type: "order", ownerId: adminUser.id, isPublic: false, visibility: "private" }
    ];

    for (const node of nodes) {
        await prisma.processNode.upsert({ where: { id: node.id }, update: node, create: node });
    }
    console.log('Nodes restored.');

    // 2. Order Requirements
    const orderId = "ce1050ab-0914-4f47-9e64-3c09dea05055";
    const reqId = "b6fbe8ec-4912-4cbf-b7df-ab4599c53574";

    await prisma.orderRequirements.upsert({
        where: { id: reqId },
        update: {
            nodeId: orderId,
            versionId: null,
            projectGoal: "Instalacja 8 kamer 2 monitorów, w celu analizy obrazu z obszaru walcowni",
            projectItems: "{\"instalacyjne\":[{\"id\":\"f143f12f-1a58-4e30-b434-3e50a10ae2ff\",\"name\":\"Instalacja 8 kamer\"},{\"id\":\"06ff7857-8262-419d-b7f4-406dc8e99dca\",\"name\":\"Instalacja 2 monitorów\"}]}"
        },
        create: {
            id: reqId,
            nodeId: orderId,
            versionId: null,
            projectGoal: "Instalacja 8 kamer 2 monitorów, w celu analizy obrazu z obszaru walcowni",
            projectItems: "{\"instalacyjne\":[{\"id\":\"f143f12f-1a58-4e30-b434-3e50a10ae2ff\",\"name\":\"Instalacja 8 kamer\"},{\"id\":\"06ff7857-8262-419d-b7f4-406dc8e99dca\",\"name\":\"Instalacja 2 monitorów\"}]}"
        }
    });
    console.log('Requirements restored.');

    // 3. Subtasks
    const subtasks = [
        { id: "task-01", name: "Montaż okablowania", desc: "Ułożenie rur i kabli" },
        { id: "task-02", name: "Montaż kamer", desc: "Instalacja 8 kamer Hikvision" },
        { id: "task-03", name: "Konfiguracja serwera", desc: "Uruchomienie zapisu i analizy" }
    ];

    for (const t of subtasks) {
        await prisma.subtask.upsert({
            where: { id: t.id },
            update: { name: t.name, description: t.desc, status: 'FINISHED' },
            create: { id: t.id, nodeId: orderId, versionId: null, name: t.name, description: t.desc, status: 'FINISHED' }
        });
    }
    console.log('Subtasks restored.');

    console.log('Restoration complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
