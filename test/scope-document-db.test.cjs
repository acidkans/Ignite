// Test modelu danych „Opis zakresu prac" na DEV (uruchamiać w kontenerze erp-backend):
//   docker cp test/scope-document-db.test.cjs erp-backend:/usr/src/app/scope-test.cjs && docker exec erp-backend node scope-test.cjs
// Tworzy tymczasowe zamówienie + dostawcę, sprząta po sobie (kaskada po nodeId).
const { PrismaClient } = require('@prisma/client');
const { VersioningService } = require('./dist/ai/versioning.service');
const prisma = new PrismaClient();
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const TAG = `__scope_test_${Date.now()}`;

(async () => {
    let orderId, supplierId;
    try {
        // 1. Supplier.shortCode / logoPath
        const sup = await prisma.supplier.create({ data: { name: `${TAG} Łączpol` } });
        supplierId = sup.id;
        check('Supplier.shortCode domyślnie null', sup.shortCode === null && sup.logoPath === null);
        const sup2 = await prisma.supplier.update({ where: { id: sup.id }, data: { shortCode: 'LAC', logoPath: 'logos/lac.png' } });
        check('Supplier.shortCode/logoPath zapis', sup2.shortCode === 'LAC' && sup2.logoPath === 'logos/lac.png');

        // 2. Zamówienie + WBS z showInScope
        const order = await prisma.processNode.create({ data: { name: TAG, type: 'order' } });
        orderId = order.id;
        const vs = new VersioningService(prisma);
        const v1 = await vs.createVersion(orderId, 'v1');
        const root = await prisma.wbsNode.create({ data: { nodeId: orderId, versionId: v1.id, name: 'Pakiet A' } });
        check('WbsNode.showInScope domyślnie false', root.showInScope === false);
        await prisma.wbsNode.create({ data: { nodeId: orderId, versionId: v1.id, parentId: root.id, name: 'Maszt', showInScope: true, quantity: 3 } });

        // 3. Klon wersji przenosi showInScope
        const v2 = await vs.createVersion(orderId, 'v2', v1.id);
        const cloned = await prisma.wbsNode.findMany({ where: { nodeId: orderId, versionId: v2.id } });
        const mast = cloned.find(n => n.name === 'Maszt');
        check('cloneVersionData kopiuje showInScope', mast?.showInScope === true && cloned.find(n => n.name === 'Pakiet A')?.showInScope === false, `(${cloned.length} węzłów)`);

        // 4. ScopeDocument — domyślne wartości i unikalność nodeId
        const doc = await prisma.scopeDocument.create({ data: { nodeId: orderId, versionId: v2.id } });
        check('ScopeDocument domyślne (30 dni, 24 mies., rev 0, sections {})',
            doc.validityDays === 30 && doc.warrantyMonths === 24 && doc.revision === 0 && JSON.stringify(doc.sections) === '{}' && doc.layoutConfirmed === false);
        let dup = false;
        try { await prisma.scopeDocument.create({ data: { nodeId: orderId } }); } catch (e) { dup = e.code === 'P2002'; }
        check('ScopeDocument.nodeId unikalne', dup);
        const doc2 = await prisma.scopeDocument.update({
            where: { id: doc.id },
            data: { layout: { mode: 'locations', locations: [{ name: 'Lubliniec', wbsNodeIds: [root.id] }], packages: [] }, sections: { goal: '**cel**', packages: { 'Pakiet A': 'opis' } }, revision: { increment: 1 } },
        });
        check('ScopeDocument JSON layout/sections + revision++', doc2.layout.mode === 'locations' && doc2.sections.packages['Pakiet A'] === 'opis' && doc2.revision === 1);
        const viaRel = await prisma.processNode.findUnique({ where: { id: orderId }, include: { scopeDocument: true } });
        check('relacja ProcessNode.scopeDocument', viaRel.scopeDocument?.id === doc.id);

        // 5. OfferNumberCounter — 10 równoległych inkrementów daje unikalne kolejne numery
        const year = 1900 + Math.floor(Math.random() * 50); // rok testowy, nie koliduje z prawdziwym licznikiem
        const nums = await Promise.all(Array.from({ length: 10 }, () =>
            prisma.$queryRaw`INSERT INTO offer_number_counters ("year","lastNumber") VALUES (${year}, 1)
                ON CONFLICT ("year") DO UPDATE SET "lastNumber" = offer_number_counters."lastNumber" + 1 RETURNING "lastNumber"`
                .then(r => r[0].lastNumber)));
        const sorted = [...nums].sort((a, b) => a - b).join(',');
        check('licznik: równoległe numery 1..10 bez duplikatów', sorted === '1,2,3,4,5,6,7,8,9,10', `[${sorted}]`);
        await prisma.offerNumberCounter.delete({ where: { year } });

        // 6. offerNumber unikalny globalnie
        await prisma.scopeDocument.update({ where: { id: doc.id }, data: { offerNumber: `LAC/1/${year}` } });
        const order2 = await prisma.processNode.create({ data: { name: TAG + '_2', type: 'order' } });
        let dupNum = false;
        try { await prisma.scopeDocument.create({ data: { nodeId: order2.id, offerNumber: `LAC/1/${year}` } }); } catch (e) { dupNum = e.code === 'P2002'; }
        check('ScopeDocument.offerNumber unikalny', dupNum);
        await prisma.processNode.delete({ where: { id: order2.id } });

        // 7. Kaskada: usunięcie zamówienia kasuje ScopeDocument
        await prisma.processNode.delete({ where: { id: orderId } });
        orderId = null;
        check('kaskada ProcessNode → ScopeDocument', (await prisma.scopeDocument.count({ where: { id: doc.id } })) === 0);
    } catch (e) {
        fail++; console.log('ERROR', e.message);
    } finally {
        if (orderId) await prisma.processNode.delete({ where: { id: orderId } }).catch(() => {});
        if (supplierId) await prisma.supplier.delete({ where: { id: supplierId } }).catch(() => {});
        await prisma.processNode.deleteMany({ where: { name: { startsWith: TAG } } }).catch(() => {});
        console.log(`\n${ok} PASS, ${fail} FAIL`);
        await prisma.$disconnect();
        process.exit(fail ? 1 : 0);
    }
})();
