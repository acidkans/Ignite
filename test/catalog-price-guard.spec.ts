import { MaterialRequirementsService } from '../apps/backend/src/material-requirements/material-requirements.service';

// PATCH wymagania dotyka wyłącznie `prisma`, więc podstawiamy atrapę i testujemy PRAWDZIWY
// `update()` serwisu, nie jego kopię. Pozostałe zależności konstruktora nie są w tej ścieżce
// używane — poza `extraOrder`, wołanym dopiero przy statusie „Dodatkowe zamówienie".
const KARTA = 'aaaaaaaa-1111-1111-1111-111111111111';
const MATERIAL = 'bbbbbbbb-2222-2222-2222-222222222222';
const WEZEL_PROC = 'cccccccc-3333-3333-3333-333333333333';

type Wywolanie = { model: string; metoda: string; arg: any };

function atrapa(opcje: { materialId?: string | null; katalogMa?: any; propozycja?: any } = {}) {
    const wywolania: Wywolanie[] = [];
    const rec = (model: string, metoda: string, zwrot: (arg: any) => any) =>
        async (arg: any) => { wywolania.push({ model, metoda, arg }); return zwrot(arg); };

    const wiersz = {
        id: KARTA, nodeId: WEZEL_PROC, name: 'cybant', quantity: 10, unit: 'sztuki',
        budgetedPriceNetto: 5, versionId: null, status: null,
        materialId: opcje.materialId === undefined ? MATERIAL : opcje.materialId,
        proposals: [], material: null, assignedSubtask: null,
    };

    const prisma: any = {
        materialRequirement: {
            findUnique: rec('materialRequirement', 'findUnique', () => wiersz),
            findFirst: rec('materialRequirement', 'findFirst', () => null),
            update: rec('materialRequirement', 'update', (a) => ({ ...wiersz, ...a.data })),
            updateMany: rec('materialRequirement', 'updateMany', () => ({ count: 0 })),
        },
        material: {
            findFirst: rec('material', 'findFirst', () => opcje.katalogMa ?? null),
            update: rec('material', 'update', (a) => ({ id: MATERIAL, ...a.data })),
            create: rec('material', 'create', (a) => ({ id: 'nowy-material', ...a.data })),
        },
        productProposal: {
            findUnique: rec('productProposal', 'findUnique', () => opcje.propozycja ?? null),
            findFirst: rec('productProposal', 'findFirst', () => null),
            findMany: rec('productProposal', 'findMany', () => []),
            updateMany: rec('productProposal', 'updateMany', () => ({ count: 0 })),
            update: rec('productProposal', 'update', (a) => a.data),
            create: rec('productProposal', 'create', (a) => a.data),
        },
        wbsNodeMaterial: {
            findMany: rec('wbsNodeMaterial', 'findMany', () => []),
            update: rec('wbsNodeMaterial', 'update', (a) => a.data),
        },
        // Bez zaakceptowanego baseline `assertOfferEditable` wraca od razu — guard ma własne testy.
        processNode: { findUnique: rec('processNode', 'findUnique', () => ({ acceptedVersionId: null })) },
        auditLog: { create: rec('auditLog', 'create', () => ({})) },
    };

    const serwis = new MaterialRequirementsService(
        prisma, null as any, null as any, null as any, null as any, null as any,
    ) as any;
    return { serwis, wywolania };
}

const zapisyKatalogu = (w: Wywolanie[]) =>
    w.filter((c) => c.model === 'material' && (c.metoda === 'update' || c.metoda === 'create'))
        .map((c) => c.arg.data);
const zapisyPropozycji = (w: Wywolanie[]) =>
    w.filter((c) => c.model === 'productProposal' && (c.metoda === 'update' || c.metoda === 'create'))
        .map((c) => c.arg.data);
const zapisKarty = (w: Wywolanie[]) =>
    w.find((c) => c.model === 'materialRequirement' && c.metoda === 'update')?.arg.data;

describe('mat-req-catalog-price-guard — PATCH pozycji nie stempluje ceny katalogowej', () => {
    it('pola katalogowe schodzą na materiał, ale cena już nie', async () => {
        const { serwis, wywolania } = atrapa();
        await serwis.update(KARTA, { priceNetto: 99, productName: 'Cybant 4.8x300', seller: 'Elektro-Hurt' });
        const zapisy = zapisyKatalogu(wywolania);
        expect(zapisy.length).toBeGreaterThan(0);
        for (const d of zapisy) {
            expect(d).not.toHaveProperty('priceNetto');
        }
        expect(zapisy[0]).toMatchObject({ productName: 'Cybant 4.8x300', seller: 'Elektro-Hurt' });
    });

    it('istniejący wpis katalogu przy producent+model nie dostaje ceny projektu', async () => {
        const { serwis, wywolania } = atrapa({ katalogMa: { id: MATERIAL } });
        await serwis.update(KARTA, { manufacturer: 'Acme', model: 'CB-300', priceNetto: 77 });
        const zapisy = zapisyKatalogu(wywolania);
        expect(zapisy.length).toBeGreaterThan(0);
        for (const d of zapisy) expect(d).not.toHaveProperty('priceNetto');
    });

    it('nowy wpis katalogu powstaje bez ceny — ma ją ustawić moduł Materiały', async () => {
        const { serwis, wywolania } = atrapa({ katalogMa: null });
        await serwis.update(KARTA, { manufacturer: 'Acme', model: 'CB-300', priceNetto: 77 });
        const utworzone = wywolania.filter((c) => c.model === 'material' && c.metoda === 'create').map((c) => c.arg.data);
        expect(utworzone).toHaveLength(1);
        expect(utworzone[0]).not.toHaveProperty('priceNetto');
        expect(utworzone[0]).toMatchObject({ manufacturer: 'Acme', model: 'CB-300', type: 'DEVICE' });
    });

    it('pozycja bez przypisanego materiału nie tworzy zapisu do katalogu', async () => {
        const { serwis, wywolania } = atrapa({ materialId: null });
        await serwis.update(KARTA, { priceNetto: 99, productName: 'Cybant 4.8x300' });
        expect(zapisyKatalogu(wywolania)).toHaveLength(0);
    });

    it('cena z karty nadal ląduje na budgetedPriceNetto pozycji', async () => {
        const { serwis, wywolania } = atrapa();
        await serwis.update(KARTA, { priceNetto: 99 });
        const d = zapisKarty(wywolania);
        expect(d.budgetedPriceNetto).toBe(99);
        expect(d).not.toHaveProperty('priceNetto');
    });

    it('propozycja produktu nadal dostaje cenę — zdjęcie dotyczy tylko katalogu', async () => {
        const { serwis, wywolania } = atrapa();
        await serwis.update(KARTA, { priceNetto: 99, productName: 'Cybant 4.8x300' });
        const zPropozycji = zapisyPropozycji(wywolania).filter((d) => 'priceNetto' in d);
        expect(zPropozycji.length).toBeGreaterThan(0);
        expect(zPropozycji.every((d) => d.priceNetto === 99)).toBe(true);
    });
});

describe('selectProposal — akceptacja propozycji nie zasiewa katalogu ceną oferty', () => {
    const PROPOZYCJA = 'dddddddd-4444-4444-4444-444444444444';
    const oferta = {
        id: PROPOZYCJA, materialRequirementId: KARTA, isSelected: false, isPurchase: false,
        manufacturer: 'Acme', model: 'CB-300', productName: 'Cybant 4.8x300',
        priceNetto: 12.5, seller: 'Elektro-Hurt', sourceUrl: 'https://przyklad.pl/cb-300',
        supplierId: 'sup-1', dataSheetUrl: null, dataSheetName: null, imageUrl: null,
    };

    it('nowy wpis katalogu powstaje bez ceny', async () => {
        const { serwis, wywolania } = atrapa({ propozycja: oferta, katalogMa: null });
        await serwis.selectProposal(PROPOZYCJA);
        const utworzone = wywolania.filter((c) => c.model === 'material' && c.metoda === 'create').map((c) => c.arg.data);
        expect(utworzone).toHaveLength(1);
        expect(utworzone[0]).not.toHaveProperty('priceNetto');
        expect(utworzone[0]).toMatchObject({ manufacturer: 'Acme', model: 'CB-300', seller: 'Elektro-Hurt' });
    });

    it('istniejący wpis katalogu zostaje nietknięty', async () => {
        const { serwis, wywolania } = atrapa({ propozycja: oferta, katalogMa: { id: MATERIAL } });
        await serwis.selectProposal(PROPOZYCJA);
        expect(zapisyKatalogu(wywolania)).toHaveLength(0);
    });

    it('cena oferty nadal ląduje na budgetedPriceNetto pozycji', async () => {
        const { serwis, wywolania } = atrapa({ propozycja: oferta, katalogMa: null });
        await serwis.selectProposal(PROPOZYCJA);
        const d = zapisKarty(wywolania);
        expect(d).toMatchObject({ budgetedPriceNetto: 12.5, supplierId: 'sup-1' });
    });
});
