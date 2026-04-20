const { PrismaClient } = require('../apps/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

function parseTags(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function shouldDropByTags(tags) {
  return (tags || []).some((tag) => {
    const t = String(tag || '');
    return t === 'auto-requirement' || t === 'auto-product' || t.startsWith('req:');
  });
}

function pruneTreeItems(items) {
  let removed = 0;
  const next = [];
  for (const item of items || []) {
    const tags = Array.isArray(item?.tags) ? item.tags : [];
    if (shouldDropByTags(tags)) {
      removed += 1;
      continue;
    }
    const childResult = pruneTreeItems(item.children || []);
    const cloned = childResult.removed > 0 ? { ...item, children: childResult.items } : item;
    next.push(cloned);
    removed += childResult.removed;
  }
  return { items: next, removed };
}

(async () => {
  const beforeWbsNodes = await prisma.wbsNode.count();

  const taggedRows = await prisma.wbsNode.findMany({
    select: { id: true, tags: true },
  });

  const idsToDelete = taggedRows
    .filter((row) => shouldDropByTags(parseTags(row.tags)))
    .map((row) => row.id);

  const delWbs = idsToDelete.length
    ? await prisma.wbsNode.deleteMany({ where: { id: { in: idsToDelete } } })
    : { count: 0 };

  const orderReqs = await prisma.orderRequirements.findMany({
    where: { wbsTree: { not: null } },
    select: { id: true, wbsTree: true },
  });

  let updatedTrees = 0;
  let removedFromTrees = 0;

  for (const rec of orderReqs) {
    let parsed = null;
    try { parsed = JSON.parse(rec.wbsTree || '{"items":[]}'); } catch { parsed = { items: [] }; }
    const beforeItems = Array.isArray(parsed?.items) ? parsed.items : [];
    const pruned = pruneTreeItems(beforeItems);
    if (pruned.removed > 0) {
      removedFromTrees += pruned.removed;
      parsed.items = pruned.items;
      await prisma.orderRequirements.update({
        where: { id: rec.id },
        data: { wbsTree: JSON.stringify(parsed) },
      });
      updatedTrees += 1;
    }
  }

  const afterWbsNodes = await prisma.wbsNode.count();

  console.log(JSON.stringify({
    before: { wbs_nodes: beforeWbsNodes },
    deleted: { wbs_nodes: delWbs.count },
    order_requirements_updated: updatedTrees,
    removed_from_wbsTree_blobs: removedFromTrees,
    after: { wbs_nodes: afterWbsNodes }
  }, null, 2));

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
