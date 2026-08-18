/**
 * Diagnostyka odbiorców powiadomienia „Dodatkowe zamówienie".
 *
 * Odtwarza DOKŁADNIE zapytania z `ExtraOrderNotifierService` na żywej bazie i pokazuje,
 * ile zamówień faktycznie ma logistyka z uprawnieniem. Reguła „LOGISTYK z wpisem
 * w NodePermission na zamówieniu lub jego przodku" jest tania w kodzie, ale bezużyteczna,
 * jeśli nikt tych uprawnień nie nadaje — a wtedy feature milczy i nikt nie wie dlaczego.
 * Ten skrypt odpowiada na to pytanie danymi, nie domysłem.
 *
 * Uruchomienie (baza dev na 5433):
 *   node test/extra-order-recipients.mjs
 */

import { PrismaClient } from '../apps/backend/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function logisticiansForOrder(orderNodeId) {
    const ancestors = await prisma.processNodeClosure.findMany({
        where: { descendantId: orderNodeId },
        select: { ancestorId: true },
    });
    const nodeIds = Array.from(new Set([orderNodeId, ...ancestors.map(a => a.ancestorId)]));
    return prisma.user.findMany({
        where: {
            isActive: true,
            userRoles: { some: { role: { name: 'LOGISTYK' } } },
            OR: [
                { nodePermissions: { some: { nodeId: { in: nodeIds } } } },
                { teams: { some: { nodePermissions: { some: { nodeId: { in: nodeIds } } } } } },
            ],
        },
        select: { id: true, email: true },
    });
}

async function main() {
    const allLogisticians = await prisma.user.findMany({
        where: { isActive: true, userRoles: { some: { role: { name: 'LOGISTYK' } } } },
        select: { id: true, email: true },
    });
    console.log(`Aktywni logistycy w bazie: ${allLogisticians.length}`);
    for (const u of allLogisticians) {
        const perms = await prisma.nodePermission.count({ where: { userId: u.id } });
        console.log(`  ${u.email} — wpisów w NodePermission: ${perms}`);
    }

    const orders = await prisma.processNode.findMany({
        where: { type: 'order' },
        select: { id: true, name: true },
        orderBy: { createdAt: 'desc' },
    });
    console.log(`\nZamówienia: ${orders.length}`);

    let covered = 0;
    const uncovered = [];
    for (const o of orders) {
        const rec = await logisticiansForOrder(o.id);
        if (rec.length > 0) {
            covered++;
            if (covered <= 10) console.log(`  ✓ „${o.name}" → ${rec.map(r => r.email).join(', ')}`);
        } else {
            uncovered.push(o.name);
        }
    }

    console.log(`\nZamówień z logistykiem: ${covered}/${orders.length}`);
    if (uncovered.length) {
        console.log(`Bez logistyka (pierwsze 10): ${uncovered.slice(0, 10).map(n => `„${n}"`).join(', ')}`);
    }

    const already = await prisma.notification.count({ where: { type: 'EXTRA_ORDER' } });
    console.log(`\nIstniejące wpisy typu EXTRA_ORDER (próg „raz na zamówienie"): ${already}`);

    const extraOrderNodes = await prisma.wbsNode.count({ where: { status: 'EXTRA_ORDER' } });
    const extraOrderCards = await prisma.materialRequirement.count({ where: { status: 'EXTRA_ORDER' } });
    console.log(`Pozycje już w statusie „Dodatkowe zamówienie": WbsNode=${extraOrderNodes}, MaterialRequirement=${extraOrderCards}`);
    console.log('(te NIE wyzwolą powiadomienia — hook reaguje na WEJŚCIE w status, nie na stan zastany)');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
