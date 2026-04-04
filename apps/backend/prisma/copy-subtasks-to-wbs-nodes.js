/**
 * Jednorazowy skrypt COPY-ONLY: kopiuje dane z tabeli subtasks do wbs_nodes.
 * Nie usuwa i nie modyfikuje rekordow w subtasks.
 *
 * Uzycie:
 *   node prisma/copy-subtasks-to-wbs-nodes.js
 *   node prisma/copy-subtasks-to-wbs-nodes.js --dry-run
 *   node prisma/copy-subtasks-to-wbs-nodes.js --nodeId=<NODE_ID>
 *   node prisma/copy-subtasks-to-wbs-nodes.js --nodeId=<NODE_ID> --versionId=<VERSION_ID|null>
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const out = {
    dryRun: false,
    nodeId: null,
    versionId: undefined,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }

    if (arg.startsWith('--nodeId=')) {
      out.nodeId = arg.slice('--nodeId='.length) || null;
      continue;
    }

    if (arg.startsWith('--versionId=')) {
      out.versionId = arg.slice('--versionId='.length);
    }
  }

  return out;
}

function normalizeVersionId(versionId) {
  if (versionId === undefined) return undefined;
  if (!versionId || versionId === 'null' || versionId === 'undefined') return null;
  return versionId;
}

function mapSubtaskType(subtask) {
  const category = String(subtask.category || '').toLowerCase();

  if (category.includes('material')) return 'material';
  if (category.includes('sprzet') || category.includes('equipment')) return 'equipment';
  if (category.includes('uslug') || category.includes('service')) return 'service';

  return 'work';
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const normalizedVersionId = normalizeVersionId(opts.versionId);

  const where = {
    ...(opts.nodeId ? { nodeId: opts.nodeId } : {}),
    ...(normalizedVersionId !== undefined ? { versionId: normalizedVersionId } : {}),
  };

  console.log('Start COPY subtasks -> wbs_nodes');
  console.log(`Tryb: ${opts.dryRun ? 'DRY-RUN' : 'WRITE'}`);
  console.log(`Filtr nodeId: ${opts.nodeId || 'ALL'}`);
  console.log(`Filtr versionId: ${normalizedVersionId === undefined ? 'ALL' : String(normalizedVersionId)}`);

  const subtasks = await prisma.subtask.findMany({
    where,
    orderBy: [
      { nodeId: 'asc' },
      { versionId: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      nodeId: true,
      versionId: true,
      name: true,
      status: true,
      assignedUserId: true,
      category: true,
      phase: true,
      description: true,
    },
  });

  console.log(`Znaleziono subtaskow: ${subtasks.length}`);

  if (subtasks.length === 0) {
    console.log('Brak danych do skopiowania.');
    return;
  }

  const existingIds = new Set(
    (
      await prisma.wbsNode.findMany({
        where: {
          id: { in: subtasks.map((s) => s.id) },
        },
        select: { id: true },
      })
    ).map((n) => n.id),
  );

  let copied = 0;
  let skippedExisting = 0;

  for (let i = 0; i < subtasks.length; i++) {
    const s = subtasks[i];

    if (existingIds.has(s.id)) {
      skippedExisting++;
      continue;
    }

    const data = {
      id: s.id,
      parentId: null,
      nodeId: s.nodeId,
      versionId: s.versionId || null,
      name: s.name || '(bez nazwy)',
      type: mapSubtaskType(s),
      status: s.status || '',
      owner: s.assignedUserId || '',
      resources: '',
      cost: '',
      tags: null,
      sortOrder: i,
      phase: s.phase || null,
      comment: s.description || null,
    };

    if (!opts.dryRun) {
      await prisma.wbsNode.create({ data });
    }

    copied++;
  }

  console.log('Koniec COPY subtasks -> wbs_nodes');
  console.log(`Skopiowane: ${copied}`);
  console.log(`Pominiete (juz istnialy): ${skippedExisting}`);
}

main()
  .catch((e) => {
    console.error('Blad migracji:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
