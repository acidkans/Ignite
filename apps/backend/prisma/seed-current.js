
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding from exported state...');

  // 1. Roles
  for (const role of [
    {
      "id": "0f50470e-15d1-484b-9f61-7d1160f5adae",
      "name": "ADMIN"
    },
    {
      "id": "fc9a260b-1fd9-4d6f-aace-95a69ffc4dc2",
      "name": "MANAGER"
    },
    {
      "id": "8e1f66b8-2b00-4ab8-9949-620153ce95dc",
      "name": "USER"
    }
  ]) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role
    });
  }

  // 2. Teams
  for (const team of []) {
    await prisma.team.upsert({
      where: { id: team.id },
      update: {},
      create: team
    });
  }

  // 3. Users (tylko produkcyjni — usunięto konta testowe: admin@poz.pl, a@poz.pl, a@kat.pl, b@chor.pl, c@gor.pl)
  for (const user of []) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user
    });
  }

  // 4. User Roles
  const userRoles = [];
  for (const ur of userRoles) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: ur.userId, roleId: ur.roleId } },
      update: {},
      create: ur
    });
  }

  // 5. Process Nodes (Topological sort or handle parents carefully)
  const nodes = [
    {
      "id": "2a837f28-9b92-48f6-8939-e0934cc6e403",
      "parentId": null,
      "name": "AMP",
      "type": "area",
      "ownerId": "4847b560-611e-4a09-ab9f-1dc82c639547",
      "isPublic": false,
      "visibility": "private",
      "createdAt": "2026-02-22T18:15:04.169Z",
      "updatedAt": "2026-02-22T18:15:04.169Z",
      "site": null,
      "hardware": [],
      "orderRequirements": null
    },
    {
      "id": "9e38a137-dc6a-4d71-b230-dab01c5de18f",
      "parentId": "2a837f28-9b92-48f6-8939-e0934cc6e403",
      "name": "Kraków",
      "type": "site",
      "ownerId": "4847b560-611e-4a09-ab9f-1dc82c639547",
      "isPublic": false,
      "visibility": "private",
      "createdAt": "2026-02-22T18:15:18.268Z",
      "updatedAt": "2026-02-22T18:15:18.268Z",
      "site": null,
      "hardware": [],
      "orderRequirements": null
    },
    {
      "id": "e608e039-d1d0-432f-801a-c962baf1a0f5",
      "parentId": "2a837f28-9b92-48f6-8939-e0934cc6e403",
      "name": "Dąbrowa",
      "type": "site",
      "ownerId": "4847b560-611e-4a09-ab9f-1dc82c639547",
      "isPublic": false,
      "visibility": "private",
      "createdAt": "2026-02-22T18:15:29.215Z",
      "updatedAt": "2026-02-22T18:15:29.215Z",
      "site": null,
      "hardware": [],
      "orderRequirements": null
    },
    {
      "id": "ce1050ab-0914-4f47-9e64-3c09dea05055",
      "parentId": "9e38a137-dc6a-4d71-b230-dab01c5de18f",
      "name": "kamery walcowania Nawa AB",
      "type": "order",
      "ownerId": "4847b560-611e-4a09-ab9f-1dc82c639547",
      "isPublic": false,
      "visibility": "private",
      "createdAt": "2026-02-22T18:15:44.520Z",
      "updatedAt": "2026-02-22T18:15:44.520Z",
      "site": null,
      "hardware": [],
      "orderRequirements": {
        "id": "b6fbe8ec-4912-4cbf-b7df-ab4599c53574",
        "nodeId": "ce1050ab-0914-4f47-9e64-3c09dea05055",
        "offerDeadline": "2026-02-22T22:00:00.000Z",
        "projectStart": "2026-03-16T00:00:00.000Z",
        "projectEnd": "2026-04-10T00:00:00.000Z",
        "projectGoal": "Instalacja 8 kamer 2 monitorów, w celu analizy obrazu z obszaru walcowni",
        "projectItems": "{\"instalacyjne\":[{\"id\":\"f143f12f-1a58-4e30-b434-3e50a10ae2ff\",\"name\":\"Instalacja 8 kamer\",\"description\":\"kamery kupuje Airtel, AMP konfiguruje\"},{\"id\":\"06ff7857-8262-419d-b7f4-406dc8e99dca\",\"name\":\"Instalacja 2 monitorów\",\"description\":\"monitory kupije AMP\"}],\"organizacyjne\":[{\"id\":\"70d85e5a-618f-4d3c-b585-0458be4f1e08\",\"name\":\"Dokumentcja wykonawcza\",\"description\":\"\"},{\"id\":\"e7c14b06-0181-4d50-b4e2-051a175dce14\",\"name\":\"Dokumentacja BHP\",\"description\":\"przygotowuje Arek Tarnawski\"},{\"id\":\"e447fb26-b641-4488-9d5e-3ce339bef467\",\"name\":\"Egzaminy Złote Zasady\",\"description\":\"\"}]}",
        "createdAt": "2026-02-22T18:18:22.556Z",
        "updatedAt": "2026-02-22T18:18:22.556Z"
      }
    }
  ];
  // Sort by parentId: null first
  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.parentId === null && b.parentId !== null) return -1;
    if (a.parentId !== null && b.parentId === null) return 1;
    return 0;
  });

  for (const node of sortedNodes) {
    const { site, hardware, orderRequirements, ...nodeData } = node;
    await prisma.processNode.upsert({
      where: { id: node.id },
      update: nodeData,
      create: nodeData
    });

    if (site) {
      await prisma.site.upsert({
        where: { id: site.id },
        update: site,
        create: site
      });
    }

    if (hardware && hardware.length > 0) {
      for (const hw of hardware) {
        await prisma.hardware.upsert({
          where: { id: hw.id },
          update: hw,
          create: hw
        });
      }
    }

    if (orderRequirements) {
      await prisma.orderRequirements.upsert({
        where: { id: orderRequirements.id },
        update: orderRequirements,
        create: orderRequirements
      });
    }
  }

  console.log('Seed completed successfully!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
