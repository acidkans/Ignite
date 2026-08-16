// Diagnostyka: czy koszt jedn. i oferent z karty pozycji schodzą na propozycję produktu.
// Czyta bazę dev wprost (bez API), żeby odróżnić „backend nie zapisał" od „front nie odświeżył".
//
//   node test/diag-oferent-sync.mjs [fraza]
import { PrismaClient } from '../apps/backend/node_modules/@prisma/client/index.js';

const fraza = process.argv[2] || 'UMG 96RM';
const prisma = new PrismaClient();

const reqs = await prisma.materialRequirement.findMany({
    where: { OR: [{ name: { contains: fraza, mode: 'insensitive' } }, { proposals: { some: { model: { contains: fraza, mode: 'insensitive' } } } }] },
    include: { proposals: { orderBy: { createdAt: 'asc' } }, supplier: true, material: true },
    take: 5,
});

if (reqs.length === 0) console.log(`Brak wymagań pasujących do „${fraza}"`);

for (const r of reqs) {
    console.log(`\n── wymaganie ${r.id}`);
    console.log(`   nazwa                : ${r.name}`);
    console.log(`   budgetedPriceNetto   : ${r.budgetedPriceNetto}`);
    console.log(`   supplierId           : ${r.supplierId} ${r.supplier ? `(${r.supplier.name})` : ''}`);
    console.log(`   materialId           : ${r.materialId}`);
    for (const p of r.proposals) {
        console.log(`   • propozycja ${p.id}`);
        console.log(`     isSelected=${p.isSelected} isOffer=${p.isOffer} isPurchase=${p.isPurchase}`);
        console.log(`     priceNetto=${p.priceNetto} purchasePriceNetto=${p.purchasePriceNetto} supplierId=${p.supplierId}`);
        console.log(`     ${p.manufacturer} / ${p.model} / ${p.productName}`);
    }
}

// Selektor z `mat-req-supplier-sync`: którą propozycję backend uzna za „produkt karty"
// i to na nią zejdzie oferent wpisany w karcie pozycji. Sprawdzane na żywych danych, bo
// wymagania z kopią zakupową mają po kilka rekordów tego samego produktu.
console.log('\n── selektor „produkt karty" (mat-req-supplier-sync)');
for (const r of reqs) {
    const target = await prisma.productProposal.findFirst({
        where: { materialRequirementId: r.id, OR: [{ isOffer: true }, { isSelected: true }] },
        orderBy: [{ isOffer: 'desc' }, { isSelected: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, isOffer: true, isSelected: true, isPurchase: true },
    });
    console.log(`   ${r.id} → ${target ? `${target.id} (isOffer=${target.isOffer} isSelected=${target.isSelected} isPurchase=${target.isPurchase})` : 'BRAK — oferent zostaje tylko na pozycji'}`);
}

await prisma.$disconnect();
