import { WbsNodesService } from '../apps/backend/src/wbs-nodes/wbs-nodes.service';

// Metoda dotyka wyłącznie `prisma`, więc podstawiamy atrapę i testujemy PRAWDZIWY kod serwisu.
// Atrapa trzyma stan w pamięci, żeby dało się sprawdzić, CO zostało zapisane, nie tylko czy wołane.
type Karta = { id: string; wbsNodeId: string | null; wbsNodeAllocations: string | null; quantity?: number };

function stworzAtrape(karty: Karta[], wezly: Array<{ id: string; quantity: number }>) {
    const zapisy: Array<{ id: string; data: any }> = [];
    const prisma: any = {
        wbsNodeMaterial: { updateMany: async () => ({ count: 0 }) },
        materialRequirement: {
            findMany: async ({ where }: any) => {
                // zapytanie o karty dotkniete zmiana wezla
                if (where.OR) {
                    const wezel = where.OR[0].wbsNodeId;
                    return karty.filter(k =>
                        k.wbsNodeId === wezel ||
                        (k.wbsNodeAllocations ?? '').includes(wezel));
                }
                // zapytanie "ktore z tych wezlow maja WLASNA karte"
                const szukane: string[] = where.wbsNodeId?.in ?? [];
                const pomin = where.id?.not;
                return karty
                    .filter(k => k.id !== pomin && k.wbsNodeId && szukane.includes(k.wbsNodeId))
                    .map(k => ({ wbsNodeId: k.wbsNodeId }));
            },
            update: async ({ where, data }: any) => { zapisy.push({ id: where.id, data }); return {}; },
        },
        __karty: karty,
        wbsNode: {
            findMany: async ({ where }: any) =>
                wezly.filter(w => where.id.in.includes(w.id)).map(w => ({ id: w.id, quantity: w.quantity })),
        },
    };
    const svc = new WbsNodesService(prisma, null as any, null as any) as any;
    return { svc, zapisy };
}

const WLASCICIEL = 'a1111111-1111-1111-1111-111111111111';
const WTORNY = 'b2222222-2222-2222-2222-222222222222';
const NIEISTNIEJACY = 'c3333333-3333-3333-3333-333333333333';

describe('syncMaterialsFromWbsNode — karta zbiorcza liczy się z rzeczywistych ilości węzłów', () => {
    const kartaZbiorcza = (): Karta => ({
        id: 'karta-1', wbsNodeId: WLASCICIEL,
        wbsNodeAllocations: JSON.stringify({ [WLASCICIEL]: 325, [WTORNY]: 350 }),
    });

    it('regresja: edycja GAŁĘZI WTÓRNEJ aktualizuje kartę (dotąd nie robiła nic)', async () => {
        const { svc, zapisy } = stworzAtrape([kartaZbiorcza()],
            [{ id: WLASCICIEL, quantity: 325 }, { id: WTORNY, quantity: 400 }]);
        await svc.syncMaterialsFromWbsNode(WTORNY, 400);
        expect(zapisy).toHaveLength(1);
        expect(zapisy[0].data.quantity).toBe(725);
        expect(JSON.parse(zapisy[0].data.wbsNodeAllocations)).toEqual({ [WLASCICIEL]: 325, [WTORNY]: 400 });
    });

    it('regresja: edycja WŁAŚCICIELA nie kasuje sumy gałęzi', async () => {
        const { svc, zapisy } = stworzAtrape([kartaZbiorcza()],
            [{ id: WLASCICIEL, quantity: 300 }, { id: WTORNY, quantity: 350 }]);
        await svc.syncMaterialsFromWbsNode(WLASCICIEL, 300);
        expect(zapisy[0].data.quantity).toBe(650);
    });

    it('karta jednowęzłowa dostaje ilość węzła wprost', async () => {
        const { svc, zapisy } = stworzAtrape(
            [{ id: 'karta-2', wbsNodeId: WLASCICIEL, wbsNodeAllocations: null }],
            [{ id: WLASCICIEL, quantity: 42 }]);
        await svc.syncMaterialsFromWbsNode(WLASCICIEL, 42);
        expect(zapisy[0].data.quantity).toBe(42);
    });

    it('mapa nie zna węzła, ale karta jest jego — węzeł dochodzi do sumy', async () => {
        const { svc, zapisy } = stworzAtrape(
            [{ id: 'karta-3', wbsNodeId: WLASCICIEL, wbsNodeAllocations: JSON.stringify({ [WTORNY]: 10 }) }],
            [{ id: WLASCICIEL, quantity: 5 }, { id: WTORNY, quantity: 10 }]);
        await svc.syncMaterialsFromWbsNode(WLASCICIEL, 5);
        expect(zapisy[0].data.quantity).toBe(15);
    });

    it('wpis na nieistniejący węzeł zostaje z dotychczasową wartością — bez cichego obniżenia ilości', async () => {
        const { svc, zapisy } = stworzAtrape(
            [{ id: 'karta-4', wbsNodeId: WLASCICIEL,
               wbsNodeAllocations: JSON.stringify({ [WLASCICIEL]: 10, [NIEISTNIEJACY]: 7 }) }],
            [{ id: WLASCICIEL, quantity: 20 }]);
        await svc.syncMaterialsFromWbsNode(WLASCICIEL, 20);
        expect(zapisy[0].data.quantity).toBe(27);
        expect(JSON.parse(zapisy[0].data.wbsNodeAllocations)[NIEISTNIEJACY]).toBe(7);
    });

    it('zepsuty JSON mapy nie wywraca zapisu — karta dostaje ilość węzła', async () => {
        const { svc, zapisy } = stworzAtrape(
            [{ id: 'karta-5', wbsNodeId: WLASCICIEL, wbsNodeAllocations: '{to-nie-json' }],
            [{ id: WLASCICIEL, quantity: 9 }]);
        await svc.syncMaterialsFromWbsNode(WLASCICIEL, 9);
        expect(zapisy[0].data.quantity).toBe(9);
    });

    it('węzeł bez żadnej karty — żadnego zapisu', async () => {
        const { svc, zapisy } = stworzAtrape([], [{ id: WLASCICIEL, quantity: 1 }]);
        await svc.syncMaterialsFromWbsNode(WLASCICIEL, 1);
        expect(zapisy).toHaveLength(0);
    });

    it('gałąź z WŁASNĄ kartą nie jest doliczana — bez podwójnego liczenia', async () => {
        const { svc, zapisy } = stworzAtrape(
            [{ id: 'karta-6', wbsNodeId: WLASCICIEL,
               wbsNodeAllocations: JSON.stringify({ [WLASCICIEL]: 1, [WTORNY]: 2 }) },
             { id: 'karta-wtornego', wbsNodeId: WTORNY, wbsNodeAllocations: null }],
            [{ id: WLASCICIEL, quantity: 1 }, { id: WTORNY, quantity: 2 }]);
        await svc.syncMaterialsFromWbsNode(WLASCICIEL, 1);
        const zapisKarty6 = zapisy.find(z => z.id === 'karta-6');
        expect(zapisKarty6.data.quantity).toBe(1);
        expect(JSON.parse(zapisKarty6.data.wbsNodeAllocations)).toEqual({ [WLASCICIEL]: 1 });
    });

    it('właściciel zostaje w sumie nawet gdy mapa opisuje tylko cudzą gałąź', async () => {
        const { svc, zapisy } = stworzAtrape(
            [{ id: 'karta-7', wbsNodeId: WLASCICIEL, wbsNodeAllocations: JSON.stringify({ [WTORNY]: 200 }) },
             { id: 'karta-wtornego', wbsNodeId: WTORNY, wbsNodeAllocations: null }],
            [{ id: WLASCICIEL, quantity: 200 }, { id: WTORNY, quantity: 200 }]);
        await svc.syncMaterialsFromWbsNode(WLASCICIEL, 200);
        const z = zapisy.find(x => x.id === 'karta-7');
        expect(z.data.quantity).toBe(200);
    });

    it('bezpiecznik: karta bez wlasciciela, ktorej wszystkie galezie maja wlasne karty, zostaje nietknieta', async () => {
        const { svc, zapisy } = stworzAtrape(
            [{ id: 'karta-8', wbsNodeId: null,
               wbsNodeAllocations: JSON.stringify({ [WLASCICIEL]: 200, [WTORNY]: 200 }) },
             { id: 'karta-a', wbsNodeId: WLASCICIEL, wbsNodeAllocations: null },
             { id: 'karta-b', wbsNodeId: WTORNY, wbsNodeAllocations: null }],
            [{ id: WLASCICIEL, quantity: 200 }, { id: WTORNY, quantity: 200 }]);
        await svc.syncMaterialsFromWbsNode(WLASCICIEL, 200);
        expect(zapisy.find(z => z.id === 'karta-8')).toBeUndefined();
    });

    it('idempotencja: drugie wywołanie z tą samą ilością nic nie zmienia', async () => {
        const wezly = [{ id: WLASCICIEL, quantity: 325 }, { id: WTORNY, quantity: 400 }];
        const { svc, zapisy } = stworzAtrape([kartaZbiorcza()], wezly);
        await svc.syncMaterialsFromWbsNode(WTORNY, 400);
        await svc.syncMaterialsFromWbsNode(WTORNY, 400);
        expect(zapisy[0].data.quantity).toBe(zapisy[1].data.quantity);
        expect(zapisy[0].data.wbsNodeAllocations).toBe(zapisy[1].data.wbsNodeAllocations);
    });
});
