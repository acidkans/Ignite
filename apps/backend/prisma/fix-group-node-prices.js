// Jednorazowe czyszczenie: gałęzie grupujące (type='group') nie mają własnej
// ceny — ich wartość to suma dzieci. Węzły, które kiedyś były typu work/material/…
// (miały cenę), a potem zmieniono im typ na 'group', trzymają rezydualne pola
// cenowe, które dublują się z sumą dzieci w eksportach oferty/budżetu.
// Ten skrypt zeruje unitCost/totalCost/margin/discount/unitPrice/totalPrice
// dla wszystkich węzłów type='group'.
//
// Uruchom z katalogu apps/backend:  node prisma/fix-group-node-prices.js
// Dry-run (tylko podgląd):          node prisma/fix-group-node-prices.js --dry
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY = process.argv.includes('--dry');

async function main() {
    const affected = await prisma.wbsNode.findMany({
        where: {
            type: 'group',
            OR: [
                { unitCost: { not: 0 } },
                { totalCost: { not: 0 } },
                { margin: { not: 0 } },
                { discount: { not: 0 } },
                { unitPrice: { not: 0 } },
                { totalPrice: { not: 0 } },
            ],
        },
        select: { id: true, name: true, unitCost: true, totalPrice: true, margin: true },
    });

    console.log(`Gałęzie grupujące z rezydualną ceną: ${affected.length}`);
    affected.forEach(n => {
        console.log(`- ${n.name} (id=${n.id})  unitCost=${n.unitCost} totalPrice=${n.totalPrice} margin=${n.margin}`);
    });

    if (DRY) {
        console.log('\n[DRY RUN] Nic nie zmieniono. Uruchom bez --dry aby wyzerować.');
        return;
    }
    if (affected.length === 0) {
        console.log('Brak węzłów do naprawy.');
        return;
    }

    const res = await prisma.wbsNode.updateMany({
        where: { id: { in: affected.map(n => n.id) } },
        data: { unitCost: 0, totalCost: 0, margin: 0, discount: 0, unitPrice: 0, totalPrice: 0 },
    });
    console.log(`\nWyzerowano ${res.count} węzłów type='group'.`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
