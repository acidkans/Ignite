const { PrismaClient } = require('../apps/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.wbsNode.findMany({
    select: { id: true, nodeId: true, parentId: true, name: true, type: true, tags: true, sortOrder: true, quantity: true },
    orderBy: [{ nodeId: 'asc' }, { sortOrder: 'asc' }],
  });

  const children = new Map();
  for (const r of rows) {
    const pid = r.parentId || '__root__';
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid).push(r);
  }

  const report = [];
  for (const root of (children.get('__root__') || [])) {
    if (String(root.name || '').toLowerCase() !== 'cctv') continue;
    const queue = [{ node: root, depth: 0 }];
    while (queue.length) {
      const { node, depth } = queue.shift();
      let parsedTags = [];
      try { parsedTags = node.tags ? JSON.parse(node.tags) : []; } catch { parsedTags = []; }
      report.push({ id: node.id, depth, name: node.name, type: node.type, qty: node.quantity, tags: parsedTags, parentId: node.parentId });
      const next = (children.get(node.id) || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
      for (const c of next) queue.push({ node: c, depth: depth + 1 });
    }
  }

  const depth1 = report.filter(r => r.depth === 1);
  const dup = {};
  for (const r of depth1) {
    const k = `${r.name}::${r.type}`;
    dup[k] = (dup[k] || 0) + 1;
  }

  console.log(JSON.stringify({
    totalUnderCctv: report.length,
    depth1Count: depth1.length,
    duplicateNamesAtDepth1: Object.entries(dup).filter(([,v]) => v > 1),
    sampleDepth1: depth1.slice(0, 120)
  }, null, 2));

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
