const { PrismaClient } = require('../apps/backend/node_modules/@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

(async () => {
  // 1. Wymagania z imageUrl gdzie plik nie istnieje
  const withImages = await prisma.materialRequirement.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, imageUrl: true, nodeId: true, name: true }
  });
  console.log('=== Wymagania z imageUrl:', withImages.length);
  let missingFiles = 0;
  for (const r of withImages) {
    const exists = r.imageUrl ? fs.existsSync(r.imageUrl) : false;
    if (!exists) {
      missingFiles++;
      if (missingFiles <= 5) console.log('  BRAK PLIKU:', r.id.slice(0,8), r.name, r.imageUrl);
    }
  }
  console.log('  Brakujace pliki:', missingFiles, '/', withImages.length);

  // 2. Propozycje z imageUrl gdzie plik nie istnieje
  const proposals = await prisma.productProposal.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, imageUrl: true }
  });
  console.log('\n=== Propozycje z imageUrl:', proposals.length);
  let missingProposals = 0;
  for (const p of proposals) {
    const exists = fs.existsSync(p.imageUrl);
    if (!exists) missingProposals++;
  }
  console.log('  Brakujace pliki propozycji:', missingProposals, '/', proposals.length);

  // 3. Alokacje do nieistniejacych wezlow WBS
  const allocated = await prisma.materialRequirement.findMany({
    where: { wbsNodeAllocations: { not: null } },
    select: { id: true, name: true, wbsNodeAllocations: true }
  });
  const allNodeIds = new Set((await prisma.wbsNode.findMany({ select: { id: true } })).map(n => n.id));
  let orphanAllocs = 0;
  const orphanSample = [];
  for (const r of allocated) {
    try {
      const alloc = JSON.parse(r.wbsNodeAllocations || '{}');
      for (const nodeId of Object.keys(alloc)) {
        if (!allNodeIds.has(nodeId)) {
          orphanAllocs++;
          if (orphanSample.length < 5) orphanSample.push({ req: r.id, nodeId });
        }
      }
    } catch {}
  }
  console.log('\n=== Alokacje do nieistniejacych wezelow WBS:', orphanAllocs);
  orphanSample.forEach(o => console.log('  req:', o.req.slice(0,8), '-> node:', o.nodeId.slice(0,8)));

  // 4. Liczba wezlow WBS
  const nodeCount = await prisma.wbsNode.count();
  console.log('\n=== Wezly WBS:', nodeCount);

  // 5. Kto uruchamia fetchRequirements? Sprawdz refreshKey loop
  // → to jest logika frontendowa, nie danych

  await prisma.$disconnect();
})().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
