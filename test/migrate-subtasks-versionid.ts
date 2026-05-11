/**
 * Migracja: przypisz versionId do wszystkich subtasków z versionId = null
 *
 * Dla każdego węzła:
 *   - jeśli ma aktywną wersję → użyj jej
 *   - jeśli ma jakąś wersję (nieaktywną) → użyj pierwszej
 *   - jeśli nie ma żadnej → stwórz "pierwsza_wersja" z isActive=true
 *
 * Uruchomienie (z katalogu apps/backend):
 *   npx ts-node ../../test/migrate-subtasks-versionid.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const baseline = await prisma.subtask.findMany({
        where: { versionId: null },
        select: { id: true, nodeId: true },
    });

    if (baseline.length === 0) {
        console.log('Brak subtasków z versionId = null. Nic do zrobienia.');
        return;
    }

    console.log(`Znaleziono ${baseline.length} subtasków bez versionId.`);

    const byNode = new Map<string, string[]>();
    for (const s of baseline) {
        if (!byNode.has(s.nodeId)) byNode.set(s.nodeId, []);
        byNode.get(s.nodeId)!.push(s.id);
    }

    console.log(`Dotyczy ${byNode.size} węzłów.`);

    let created = 0;
    let assigned = 0;

    for (const [nodeId, subtaskIds] of byNode.entries()) {
        let version = await prisma.projectVersion.findFirst({
            where: { nodeId, isActive: true },
        });

        if (!version) {
            version = await prisma.projectVersion.findFirst({
                where: { nodeId },
                orderBy: { createdAt: 'asc' },
            });
        }

        if (!version) {
            version = await prisma.projectVersion.create({
                data: {
                    nodeId,
                    label: 'pierwsza_wersja',
                    isActive: true,
                },
            });
            created++;
            console.log(`  [CREATE] węzeł ${nodeId} → nowa wersja "${version.label}" (${version.id})`);
        } else {
            console.log(`  [USE]    węzeł ${nodeId} → wersja "${version.label}" (${version.id})`);
        }

        await prisma.subtask.updateMany({
            where: { id: { in: subtaskIds } },
            data: { versionId: version.id },
        });

        assigned += subtaskIds.length;
    }

    console.log(`\nGotowe.`);
    console.log(`  Nowych wersji utworzonych: ${created}`);
    console.log(`  Subtasków zaktualizowanych: ${assigned}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
