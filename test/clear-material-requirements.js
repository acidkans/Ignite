const { PrismaClient } = require('../apps/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const beforeReq = await prisma.materialRequirement.count();
  const beforeProp = await prisma.productProposal.count();
  const beforeAlloc = await prisma.wbsNodeMaterial.count();

  const delReq = await prisma.materialRequirement.deleteMany({});

  const afterReq = await prisma.materialRequirement.count();
  const afterProp = await prisma.productProposal.count();
  const afterAlloc = await prisma.wbsNodeMaterial.count();

  console.log(JSON.stringify({
    before: {
      material_requirements: beforeReq,
      product_proposals: beforeProp,
      wbs_node_materials: beforeAlloc
    },
    deleted: {
      material_requirements: delReq.count
    },
    after: {
      material_requirements: afterReq,
      product_proposals: afterProp,
      wbs_node_materials: afterAlloc
    }
  }, null, 2));

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
