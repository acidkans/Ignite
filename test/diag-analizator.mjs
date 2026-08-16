// Diagnostyka zgłoszenia: „w Materiałach liść analizator ma dwa wpisy, w Realizacji jeden".
// Oba widoki grupują wpisy tak samo (`wbsRootOf` = sourceWbsNodeId ?? id), więc rozjazd może
// pochodzić TYLKO z innego zbioru węzłów — czyli z innej wersji WBS pod spodem. Skrypt czyta
// bazę wprost i pokazuje, na jakich korzeniach wiszą wpisy i który węzeł je „widzi".
//
//   node test/diag-analizator.mjs [fraza]
import { createRequire } from 'module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const fraza = process.argv[2] || 'analiz';
const rootOf = (n) => n.sourceWbsNodeId ?? n.id;

const nodes = await prisma.wbsNode.findMany({
    where: { name: { contains: fraza, mode: 'insensitive' } },
    select: {
        id: true, name: true, type: true, nodeId: true, versionId: true,
        sourceWbsNodeId: true, quantity: true, unit: true, realizationClosed: true,
    },
    orderBy: { name: 'asc' },
});
console.log(`\n=== Węzły WBS pasujące do „${fraza}" (${nodes.length}) ===`);
for (const n of nodes) {
    console.log(`  ${n.name} [${n.type}] node=${n.nodeId?.slice(0, 8)} wersja=${n.versionId?.slice(0, 8) ?? 'LEGACY(null)'} id=${n.id.slice(0, 8)} korzeń=${rootOf(n).slice(0, 8)} ilość=${n.quantity}${n.unit || ''}${n.realizationClosed ? ' ROZLICZONY' : ''}`);
}

const roots = [...new Set(nodes.map(rootOf))];
const ids = [...new Set(nodes.map((n) => n.id))];
const actuals = await prisma.leafActual.findMany({
    where: { OR: [{ wbsRootId: { in: roots } }, { wbsRootId: { in: ids } }] },
    orderBy: [{ entryDate: 'asc' }],
    select: { id: true, wbsRootId: true, entryDate: true, qty: true, unitCost: true, comment: true, docNumber: true, nodeId: true },
});
console.log(`\n=== Wpisy realizacji na tych korzeniach (${actuals.length}) ===`);
for (const a of actuals) {
    console.log(`  ${a.entryDate.toISOString().slice(0, 10)}  ${a.qty} × ${a.unitCost} zł  korzeń=${a.wbsRootId.slice(0, 8)}  ${a.docNumber || ''} ${a.comment || ''}`);
}

console.log('\n=== Który węzeł zobaczy które wpisy ===');
for (const n of nodes) {
    const mine = actuals.filter((a) => a.wbsRootId === rootOf(n));
    console.log(`  ${n.name} (wersja ${n.versionId?.slice(0, 8) ?? 'LEGACY'}) → ${mine.length} wpis(ów), Σ ${mine.reduce((s, a) => s + a.qty * a.unitCost, 0).toFixed(2)} zł`);
}

// Wersje zamówienia — który widok na której stoi.
const nodeIds = [...new Set(nodes.map((n) => n.nodeId).filter(Boolean))];
for (const id of nodeIds) {
    const proc = await prisma.processNode.findUnique({ where: { id }, select: { name: true, acceptedVersionId: true } });
    const versions = await prisma.projectVersion.findMany({
        where: { nodeId: id },
        select: { id: true, label: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });
    console.log(`\n=== Wersje zamówienia „${proc?.name}" ===`);
    for (const v of versions) {
        console.log(`  ${v.id.slice(0, 8)} ${v.label} [wersja]${v.id === proc?.acceptedVersionId ? '  ← zaakceptowana (baseline)' : ''}`);
    }

    // Wszystkie wpisy zamówienia z rozwiązaniem korzenia na węzeł — po nich widać, czy któryś
    // wpis wisi na korzeniu, którego żaden węzeł bieżącej wersji nie widzi.
    const all = await prisma.leafActual.findMany({
        where: { nodeId: id },
        orderBy: [{ entryDate: 'asc' }],
        select: { id: true, wbsRootId: true, entryDate: true, qty: true, unitCost: true, docNumber: true, comment: true },
    });
    const rootNodes = await prisma.wbsNode.findMany({
        where: { OR: [{ id: { in: all.map((a) => a.wbsRootId) } }, { sourceWbsNodeId: { in: all.map((a) => a.wbsRootId) } }] },
        select: { id: true, name: true, type: true, versionId: true, sourceWbsNodeId: true },
    });
    console.log(`\n=== Wszystkie wpisy realizacji zamówienia (${all.length}) ===`);
    for (const a of all) {
        const widzi = rootNodes.filter((n) => (n.sourceWbsNodeId ?? n.id) === a.wbsRootId);
        const nazwa = widzi[0]?.name ?? '??? (korzeń bez węzła)';
        const wersje = widzi.map((n) => n.versionId?.slice(0, 8) ?? 'LEGACY').join(', ') || '—';
        console.log(`  ${a.entryDate.toISOString().slice(0, 10)}  ${a.qty} × ${a.unitCost} zł  „${nazwa}"  widoczny w wersjach: ${wersje}`);
    }
}

await prisma.$disconnect();
