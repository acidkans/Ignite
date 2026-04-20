// Dodaje tag 'auto-requirement' do węzłów WBS które:
// - mają typ 'material' lub 'equipment'
// - MAJĄ rodzica (nie są węzłami głównymi)
// - ich id pojawia się jako paraentId w wbsNodeAllocations jakiegokolwiek wymagania
const { PrismaClient } = require('../apps/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // Pobierz wszystkie wymagania z wbsNodeAllocations
  const reqs = await prisma.materialRequirement.findMany({
    where: { wbsNodeAllocations: { not: null } },
    select: { id: true, wbsNodeAllocations: true }
  });

  // Zbierz ID węzłów które są "celami" przypisania
  const targetNodeIds = new Set();
  for (const r of reqs) {
    try {
      const alloc = JSON.parse(r.wbsNodeAllocations || '{}');
      for (const nid of Object.keys(alloc)) targetNodeIds.add(nid);
    } catch {}
  }
  console.log('Wezly docelowe przypisania:', targetNodeIds.size);

  // Pobierz dzieci tych węzłów (węzły stworzone przez handleRequirementAssignToWbs)
  const childNodes = await prisma.wbsNode.findMany({
    where: {
      parentId: { in: Array.from(targetNodeIds) },
      type: { in: ['material', 'equipment'] },
    },
    select: { id: true, name: true, type: true, tags: true, parentId: true }
  });
  console.log('Potomne wezly material/equipment:', childNodes.length);

  let updated = 0;
  for (const node of childNodes) {
    let tags = [];
    try { tags = JSON.parse(node.tags || '[]'); } catch {}
    if (!tags.includes('auto-requirement')) {
      tags.push('auto-requirement');
      await prisma.wbsNode.update({
        where: { id: node.id },
        data: { tags: JSON.stringify(tags) }
      });
      updated++;
      console.log('  Tag dodany:', node.id.slice(0,8), node.name);
    }
  }
  console.log('Zaktualizowano:', updated, 'wezlow');
  await prisma.$disconnect();
})().catch(async e => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
