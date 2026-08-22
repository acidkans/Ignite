import { MaterialRequirementsService } from '../apps/backend/src/material-requirements/material-requirements.service';

// Obie metody dotykają wyłącznie `prisma`, więc podstawiamy atrapę i testujemy PRAWDZIWY kod
// serwisu, nie jego kopię. Pozostałe zależności konstruktora nie są w tych ścieżkach używane.
function serwis(prisma: any) {
    return new MaterialRequirementsService(
        prisma, null as any, null as any, null as any, null as any, null as any,
    ) as any;
}

const WEZEL = 'a1111111-1111-1111-1111-111111111111';
const KARTA_ZRODLA = 'b2222222-2222-2222-2222-222222222222';
const KARTA_KLONU = 'c3333333-3333-3333-3333-333333333333';

describe('retagWbsNodeToRequirement — wklejony węzeł wskazuje WŁASNĄ kartę', () => {
    const atrapa = (tags: string | null) => {
        const zapisy: any[] = [];
        const prisma = {
            wbsNode: {
                findUnique: async () => (tags === undefined ? null : { tags }),
                update: async (arg: any) => { zapisy.push(arg); return {}; },
            },
        };
        return { prisma, zapisy };
    };
    const tagiPo = (zapisy: any[]) => JSON.parse(zapisy[0].data.tags);

    it('podmienia tag karty źródła na tag własnej karty', async () => {
        const { prisma, zapisy } = atrapa(JSON.stringify([`req:${KARTA_ZRODLA}`, 'auto-requirement']));
        await serwis(prisma).retagWbsNodeToRequirement(WEZEL, KARTA_KLONU);
        expect(tagiPo(zapisy)).toEqual([`req:${KARTA_KLONU}`, 'auto-requirement']);
    });

    it('nie gubi pozostałych tagów węzła', async () => {
        const { prisma, zapisy } = atrapa(JSON.stringify(['pilne', `req:${KARTA_ZRODLA}`, 'strefa-A']));
        await serwis(prisma).retagWbsNodeToRequirement(WEZEL, KARTA_KLONU);
        expect(tagiPo(zapisy)).toEqual(['pilne', 'strefa-A', `req:${KARTA_KLONU}`, 'auto-requirement']);
    });

    it('nigdy nie zostawia dwóch tagów req: na jednym węźle', async () => {
        const { prisma, zapisy } = atrapa(JSON.stringify([`req:${KARTA_ZRODLA}`, 'req:stary-drugi']));
        await serwis(prisma).retagWbsNodeToRequirement(WEZEL, KARTA_KLONU);
        expect(tagiPo(zapisy).filter((t: string) => t.startsWith('req:'))).toEqual([`req:${KARTA_KLONU}`]);
    });

    it('węzeł bez tagów i z zepsutym JSON-em dostaje poprawny tag', async () => {
        for (const wejscie of [null, 'to-nie-json', JSON.stringify({ nie: 'tablica' })]) {
            const { prisma, zapisy } = atrapa(wejscie);
            await serwis(prisma).retagWbsNodeToRequirement(WEZEL, KARTA_KLONU);
            expect(tagiPo(zapisy)).toEqual([`req:${KARTA_KLONU}`, 'auto-requirement']);
        }
    });

    it('nieistniejący węzeł — żadnego zapisu', async () => {
        const zapisy: any[] = [];
        const prisma = { wbsNode: { findUnique: async () => null, update: async (a: any) => { zapisy.push(a); } } };
        await serwis(prisma).retagWbsNodeToRequirement(WEZEL, KARTA_KLONU);
        expect(zapisy).toHaveLength(0);
    });
});

describe('cloneProposalsForRequirement — oferty jadą razem z kartą', () => {
    const propozycje = [
        { id: 'p1', materialRequirementId: KARTA_ZRODLA, productName: 'Kabel X', manufacturer: 'Acme',
          priceNetto: 12.5, isOffer: true, isSelected: true, supplierId: 's1',
          createdAt: new Date(), updatedAt: new Date() },
        { id: 'p2', materialRequirementId: KARTA_ZRODLA, productName: 'Kabel Y', manufacturer: 'Beta',
          priceNetto: 14, isOffer: false, isSelected: false, supplierId: 's2',
          createdAt: new Date(), updatedAt: new Date() },
    ];
    const atrapa = (zrodlowe: any[]) => {
        const zapisy: any[] = [];
        const prisma = {
            productProposal: {
                findMany: async () => zrodlowe,
                create: async (arg: any) => { zapisy.push(arg.data); return {}; },
            },
        };
        return { prisma, zapisy };
    };

    it('kopiuje wszystkie propozycje na nową kartę', async () => {
        const { prisma, zapisy } = atrapa(propozycje);
        await serwis(prisma).cloneProposalsForRequirement(KARTA_ZRODLA, KARTA_KLONU);
        expect(zapisy).toHaveLength(2);
        expect(zapisy.every(z => z.materialRequirementId === KARTA_KLONU)).toBe(true);
    });

    it('propozycja isOffer — nośnik ceny wyceny — nie ginie', async () => {
        const { prisma, zapisy } = atrapa(propozycje);
        await serwis(prisma).cloneProposalsForRequirement(KARTA_ZRODLA, KARTA_KLONU);
        const oferta = zapisy.find(z => z.isOffer);
        expect(oferta).toBeDefined();
        expect(oferta.priceNetto).toBe(12.5);
        expect(oferta.supplierId).toBe('s1');
    });

    it('nie przenosi id ani znaczników czasu źródła', async () => {
        const { prisma, zapisy } = atrapa(propozycje);
        await serwis(prisma).cloneProposalsForRequirement(KARTA_ZRODLA, KARTA_KLONU);
        for (const z of zapisy) {
            expect(z.id).toBeUndefined();
            expect(z.createdAt).toBeUndefined();
            expect(z.updatedAt).toBeUndefined();
        }
    });

    it('karta bez propozycji — żadnego zapisu', async () => {
        const { prisma, zapisy } = atrapa([]);
        await serwis(prisma).cloneProposalsForRequirement(KARTA_ZRODLA, KARTA_KLONU);
        expect(zapisy).toHaveLength(0);
    });
});
