// Podgląd rejestru odbiorów na bazie dev: które pozycje mają wyczerpaną kwotę bez flagi
// `pelny` — czyli te, które przed poprawką dawały się odebrać drugi raz.
//
// Uruchomienie: cd apps/backend && npx ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' ../../test/podglad-rejestr-odbiorow.ts
import { PrismaService } from '../apps/backend/src/prisma/prisma.service';

const p = new PrismaService();
(async () => {
    const items = await p.acceptanceProtocolItem.findMany({
        include: { protocol: { select: { nodeId: true, numer: true, node: { select: { name: true } } } } },
    });
    const byNode = new Map<string, typeof items>();
    for (const it of items) {
        const k = it.protocol.nodeId;
        if (!byNode.has(k)) byNode.set(k, [] as any);
        (byNode.get(k) as any).push(it);
    }
    for (const [nodeId, its] of byNode) {
        console.log('NODE', nodeId, '|', (its as any)[0].protocol.node?.name);
        const agg = new Map<string, { n: string; s: number; p: boolean }>();
        for (const it of its as any) {
            const a = agg.get(it.wbsRootId) ?? { n: it.nazwa, s: 0, p: false };
            a.s = Math.round((a.s + it.wartosc) * 100) / 100;
            a.p = a.p || it.pelny;
            agg.set(it.wbsRootId, a);
        }
        for (const [root, a] of agg) console.log('   ', root, '|', a.n, '| odebrane', a.s, '| pelny', a.p);
    }
    await p.$disconnect();
})();
