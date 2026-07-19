import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { SUPPLIER_GATEWAYS, SupplierGateway, SupplierGatewayQuery } from './supplier-gateway';

// @anchor quick-quote-item-input
// Wejście pozycji wyceny (MANUAL / wynik API). Ceny w walucie oryginalnej —
// przeliczenie na PLN robi serwis (zamrożenie kursu NBP w momencie capture).
export type QuickQuoteItemInput = {
    materialRequirementId?: string | null;
    reqName?: string | null;
    qtyAtCapture?: number | null;
    unit?: string | null;
    supplierId?: string | null;
    externalRef?: string | null;
    sourceUrl?: string | null;
    priceOriginalNetto?: number | null;
    currency?: string | null;
    priceNettoPln?: number | null; // bezpośrednia korekta logistyka (nadpisuje przeliczenie)
};

// @anchor quick-quote-transitions
// Dozwolone przejścia statusów. BASELINE nadawany wyłącznie przez akceptację
// snapshotu wersji (Faza 4) — nie przez ten endpoint.
const TRANSITIONS: Record<string, string[]> = {
    DRAFT: ['VERIFIED', 'ARCHIVED', 'EXPIRED'],
    VERIFIED: ['DRAFT', 'LOCKED', 'ARCHIVED', 'EXPIRED'],
    LOCKED: ['ARCHIVED'],
    BASELINE: ['ARCHIVED'],
    ARCHIVED: [],
    EXPIRED: ['DRAFT'],
};

// @anchor quick-quotes-service
@Injectable()
export class QuickQuotesService {
    private readonly logger = new Logger(QuickQuotesService.name);
    private readonly gatewayMap = new Map<string, SupplierGateway>();

    constructor(
        private prisma: PrismaService,
        private exchangeRates: ExchangeRatesService,
        @Optional() @Inject(SUPPLIER_GATEWAYS) gateways: SupplierGateway[] | null,
    ) {
        for (const g of gateways ?? []) this.gatewayMap.set(g.adapterId, g);
    }

    private readonly itemInclude = {
        supplier: { select: { id: true, name: true, nip: true, vatStatus: true } },
        materialRequirement: { select: { id: true, name: true, quantity: true, unit: true, materialId: true } },
    };

    // @anchor quick-quotes-list — nagłówki wycen (dla węzła albo globalnie w Logistyce).
    list(nodeId?: string) {
        return this.prisma.quickQuote.findMany({
            where: nodeId ? { nodeId } : {},
            orderBy: { createdAt: 'desc' },
            include: {
                node: { select: { id: true, name: true } },
                _count: { select: { items: true } },
            },
        });
    }

    // @anchor quick-quotes-get
    async get(id: string) {
        const qq = await this.prisma.quickQuote.findUnique({
            where: { id },
            include: {
                node: { select: { id: true, name: true } },
                items: { include: this.itemInclude, orderBy: { createdAt: 'asc' } },
            },
        });
        if (!qq) throw new NotFoundException('Wycena nie znaleziona');
        return qq;
    }

    // @anchor quick-quotes-create
    async create(nodeId: string, name: string, createdBy?: string) {
        const node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
        if (!node) throw new NotFoundException('Węzeł nie znaleziony');
        return this.prisma.quickQuote.create({
            data: { nodeId, name, createdBy: createdBy ?? null },
        });
    }

    // @anchor quick-quotes-update — edycja nagłówka; zablokowana po LOCKED/BASELINE.
    async update(id: string, data: { name?: string; validUntil?: string | null }) {
        const qq = await this.requireQuote(id);
        this.requireEditable(qq);
        return this.prisma.quickQuote.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.validUntil !== undefined
                    ? { validUntil: data.validUntil ? new Date(data.validUntil) : null }
                    : {}),
            },
        });
    }

    // @anchor quick-quotes-delete — tylko szkice; zamrożone wyceny są śladem audytowym.
    async remove(id: string) {
        const qq = await this.requireQuote(id);
        if (qq.status !== 'DRAFT') throw new BadRequestException('Usunąć można tylko wycenę w statusie DRAFT');
        return this.prisma.quickQuote.delete({ where: { id } });
    }

    // @anchor quick-quotes-change-status — przejścia statusów wg TRANSITIONS;
    // LOCKED = transakcja: re-walidacja magazynu + zapis cen do budżetu wymagań.
    async changeStatus(id: string, status: string, userId?: string) {
        const qq = await this.requireQuote(id);
        const allowed = TRANSITIONS[qq.status] ?? [];
        if (!allowed.includes(status)) {
            throw new BadRequestException(`Przejście ${qq.status} → ${status} niedozwolone`);
        }
        if (status === 'LOCKED') return this.lock(qq.id, userId);
        return this.prisma.quickQuote.update({ where: { id }, data: { status } });
    }

    // @anchor quick-quotes-lock — zamrożenie wyceny: (1) re-walidacja pokrycia
    // magazynowego pozycji STOCK z odjęciem rezerwacji innych LOCKED/BASELINE wycen
    // (ochrona przed podwójnym liczeniem między równoległymi szkicami), (2) zapis
    // najtańszej ceny per wymaganie do budgetedPriceNetto + budgetSource=QUICKQUOTE.
    private async lock(id: string, userId?: string) {
        return this.prisma.$transaction(async (tx) => {
            const qq = await tx.quickQuote.findUnique({
                where: { id },
                include: { items: { include: { materialRequirement: { select: { id: true, materialId: true, name: true } } } } },
            });
            if (!qq) throw new NotFoundException('Wycena nie znaleziona');

            // (1) Re-walidacja magazynu dla pozycji STOCK
            const stockItems = qq.items.filter((i) => i.source === 'STOCK');
            const errors: string[] = [];
            for (const item of stockItems) {
                const materialId = item.materialRequirement?.materialId;
                if (!materialId) {
                    errors.push(`„${item.reqName ?? '?'}" — brak powiązania z materiałem (wymaganie usunięte?)`);
                    continue;
                }
                const stockAgg = await tx.materialStock.aggregate({
                    where: { materialId },
                    _sum: { quantity: true },
                });
                const total = Number(stockAgg._sum.quantity ?? 0);
                // Rezerwacje: pozycje STOCK innych zamrożonych wycen na ten sam materiał
                const reserved = await tx.quickQuoteItem.findMany({
                    where: {
                        id: { not: item.id },
                        source: 'STOCK',
                        quickQuote: { status: { in: ['LOCKED', 'BASELINE'] } },
                        materialRequirement: { materialId },
                    },
                    select: { qtyAtCapture: true },
                });
                const reservedQty = reserved.reduce((s, r) => s + (r.qtyAtCapture ?? 0), 0);
                const need = item.qtyAtCapture ?? 0;
                if (need > total - reservedQty) {
                    errors.push(`„${item.reqName ?? '?'}" — magazyn ${total}, zarezerwowane ${reservedQty}, potrzeba ${need}`);
                }
            }
            if (errors.length) {
                throw new BadRequestException(`Magazyn nie pokrywa pozycji: ${errors.join('; ')}`);
            }

            // (2) Najtańsza cena per wymaganie → budżet wymagania
            const byReq = new Map<string, number>();
            for (const item of qq.items) {
                const reqId = item.materialRequirementId;
                if (!reqId || item.priceNettoPln == null) continue;
                const prev = byReq.get(reqId);
                if (prev === undefined || item.priceNettoPln < prev) byReq.set(reqId, item.priceNettoPln);
            }
            for (const [reqId, price] of byReq.entries()) {
                await tx.materialRequirement.update({
                    where: { id: reqId },
                    data: { budgetedPriceNetto: price, budgetSource: 'QUICKQUOTE' },
                });
            }

            return tx.quickQuote.update({
                where: { id },
                data: { status: 'LOCKED', lockedAt: new Date(), lockedBy: userId ?? null },
            });
        });
    }

    // @anchor quick-quotes-new-version — wersjonowanie wzorcem list materiałowych:
    // nowy szkic z parentId wskazującym źródło + kopia pozycji (capturedAt zachowane
    // jako ślad pierwotnego capture; ponowne zapytania nadpisują świadomie).
    async createNewVersion(id: string, createdBy?: string) {
        const source = await this.get(id);
        return this.prisma.$transaction(async (tx) => {
            const clone = await tx.quickQuote.create({
                data: {
                    nodeId: source.nodeId,
                    name: source.name,
                    status: 'DRAFT',
                    parentId: source.id,
                    validUntil: source.validUntil,
                    createdBy: createdBy ?? null,
                },
            });
            for (const item of source.items) {
                await tx.quickQuoteItem.create({
                    data: {
                        quickQuoteId: clone.id,
                        materialRequirementId: item.materialRequirementId,
                        reqName: item.reqName,
                        qtyAtCapture: item.qtyAtCapture,
                        unit: item.unit,
                        source: item.source,
                        supplierId: item.supplierId,
                        externalRef: item.externalRef,
                        sourceUrl: item.sourceUrl,
                        capturedAt: item.capturedAt,
                        queriedBy: item.queriedBy,
                        priceOriginalNetto: item.priceOriginalNetto,
                        currency: item.currency,
                        exchangeRate: item.exchangeRate,
                        rateDate: item.rateDate,
                        priceNettoPln: item.priceNettoPln,
                        priceNettoApi: item.priceNettoApi,
                    },
                });
            }
            return clone;
        });
    }

    // ─── POZYCJE ──────────────────────────────────────────────────────────────

    // @anchor quick-quotes-add-item — ręczna pozycja (MANUAL); przy walucie obcej
    // zamrożenie kursu NBP w momencie capture (wzorzec 1:1 z kanału PDF).
    async addItem(quickQuoteId: string, input: QuickQuoteItemInput, userId?: string) {
        const qq = await this.requireQuote(quickQuoteId);
        this.requireEditable(qq);

        // Snapshot wymagania (nazwa/ilość/jednostka) — chyba że nadpisane w input
        let req: { id: string; name: string | null; quantity: number; unit: string } | null = null;
        if (input.materialRequirementId) {
            req = await this.prisma.materialRequirement.findUnique({
                where: { id: input.materialRequirementId },
                select: { id: true, name: true, quantity: true, unit: true },
            });
            if (!req) throw new NotFoundException('Wymaganie nie znalezione');
        }

        const priced = await this.freezePrice(input.priceOriginalNetto ?? null, input.currency);
        if (input.priceNettoPln != null) priced.priceNettoPln = input.priceNettoPln;

        return this.prisma.quickQuoteItem.create({
            data: {
                quickQuoteId,
                source: 'MANUAL',
                queriedBy: userId ?? null,
                materialRequirementId: req?.id ?? null,
                reqName: input.reqName ?? req?.name ?? null,
                qtyAtCapture: input.qtyAtCapture ?? req?.quantity ?? null,
                unit: input.unit ?? req?.unit ?? null,
                supplierId: input.supplierId ?? null,
                externalRef: input.externalRef ?? null,
                sourceUrl: input.sourceUrl ?? null,
                ...priced,
            },
            include: this.itemInclude,
        });
    }

    // @anchor quick-quotes-update-item — edycja pozycji w szkicu; zmiana ceny
    // oryginalnej/waluty = nowy capture kursu; bezpośrednia edycja priceNettoPln
    // to korekta logistyka (priceNettoApi nigdy nie jest nadpisywane).
    async updateItem(quickQuoteId: string, itemId: string, input: QuickQuoteItemInput) {
        const qq = await this.requireQuote(quickQuoteId);
        this.requireEditable(qq);
        const item = await this.prisma.quickQuoteItem.findUnique({ where: { id: itemId } });
        if (!item || item.quickQuoteId !== quickQuoteId) throw new NotFoundException('Pozycja nie znaleziona');

        const data: Record<string, any> = {};
        for (const key of ['materialRequirementId', 'reqName', 'qtyAtCapture', 'unit', 'supplierId', 'externalRef', 'sourceUrl'] as const) {
            if (input[key] !== undefined) data[key] = input[key];
        }
        const priceChanged = input.priceOriginalNetto !== undefined || input.currency !== undefined;
        if (priceChanged) {
            const priced = await this.freezePrice(
                input.priceOriginalNetto !== undefined ? input.priceOriginalNetto : item.priceOriginalNetto,
                input.currency !== undefined ? input.currency : item.currency,
            );
            Object.assign(data, priced, { capturedAt: new Date() });
        }
        if (input.priceNettoPln !== undefined) data.priceNettoPln = input.priceNettoPln;

        return this.prisma.quickQuoteItem.update({ where: { id: itemId }, data, include: this.itemInclude });
    }

    // @anchor quick-quotes-remove-item
    async removeItem(quickQuoteId: string, itemId: string) {
        const qq = await this.requireQuote(quickQuoteId);
        this.requireEditable(qq);
        const item = await this.prisma.quickQuoteItem.findUnique({ where: { id: itemId } });
        if (!item || item.quickQuoteId !== quickQuoteId) throw new NotFoundException('Pozycja nie znaleziona');
        return this.prisma.quickQuoteItem.delete({ where: { id: itemId } });
    }

    // @anchor quick-quotes-add-stock-items — kandydaci z magazynu: wymaganie kwalifikuje
    // się tylko przy PEŁNYM pokryciu (Σ MaterialStock.quantity ≥ zapotrzebowanie, bez
    // splitów); wycena wg Material.priceNetto (cena 0/null zafałszowałaby budżet — skip).
    async addStockItems(quickQuoteId: string, userId?: string) {
        const qq = await this.requireQuote(quickQuoteId);
        this.requireEditable(qq);

        const requirements = await this.prisma.materialRequirement.findMany({
            where: { nodeId: qq.nodeId, versionId: null, materialId: { not: null } },
            include: { material: { include: { stock: true } } },
        });
        const existing = await this.prisma.quickQuoteItem.findMany({
            where: { quickQuoteId, source: 'STOCK' },
            select: { materialRequirementId: true },
        });
        const already = new Set(existing.map((e) => e.materialRequirementId));

        let added = 0;
        const skipped: { name: string; reason: string }[] = [];
        for (const req of requirements) {
            if (already.has(req.id)) continue; // idempotentnie — nie duplikuj kandydatów
            const total = (req.material?.stock ?? []).reduce((s, r) => s + Number(r.quantity), 0);
            if (total < req.quantity) {
                skipped.push({ name: req.name ?? req.id, reason: `magazyn ${total} < zapotrzebowanie ${req.quantity}` });
                continue;
            }
            const price = req.material?.priceNetto ?? null;
            if (price == null || price <= 0) {
                skipped.push({ name: req.name ?? req.id, reason: 'brak ceny katalogowej materiału' });
                continue;
            }
            await this.prisma.quickQuoteItem.create({
                data: {
                    quickQuoteId,
                    materialRequirementId: req.id,
                    reqName: req.name,
                    qtyAtCapture: req.quantity,
                    unit: req.unit,
                    source: 'STOCK',
                    queriedBy: userId ?? null,
                    priceOriginalNetto: price,
                    currency: 'PLN',
                    priceNettoPln: price,
                },
            });
            added++;
        }
        return { added, skipped };
    }

    // @anchor quick-quotes-query-api — zapytanie do adaptera API dostawcy
    // (SupplierGateway). Wyniki trafiają wyłącznie do QuickQuoteItem (source=API,
    // surowa cena w priceNettoApi) — nigdy do katalogu Material.
    async queryApi(
        quickQuoteId: string,
        body: { supplierId: string; materialRequirementId?: string | null; query?: string },
        userId?: string,
    ) {
        const qq = await this.requireQuote(quickQuoteId);
        this.requireEditable(qq);
        const supplier = await this.prisma.supplier.findUnique({ where: { id: body.supplierId } });
        if (!supplier) throw new NotFoundException('Dostawca nie znaleziony');
        if (!supplier.apiAdapter) throw new BadRequestException(`Dostawca „${supplier.name}" nie ma adaptera API (tylko kanał PDF)`);
        const gateway = this.gatewayMap.get(supplier.apiAdapter);
        if (!gateway) throw new BadRequestException(`Adapter „${supplier.apiAdapter}" nie jest zarejestrowany w systemie`);

        let req: { id: string; name: string | null; quantity: number; unit: string } | null = null;
        if (body.materialRequirementId) {
            req = await this.prisma.materialRequirement.findUnique({
                where: { id: body.materialRequirementId },
                select: { id: true, name: true, quantity: true, unit: true },
            });
            if (!req) throw new NotFoundException('Wymaganie nie znalezione');
        }
        const queryText = body.query?.trim() || req?.name;
        if (!queryText) throw new BadRequestException('query lub materialRequirementId wymagane');

        const results = await gateway.search({ query: queryText } as SupplierGatewayQuery);
        const created = [];
        for (const r of results) {
            const priced = await this.freezePrice(r.priceNetto, r.currency);
            created.push(await this.prisma.quickQuoteItem.create({
                data: {
                    quickQuoteId,
                    materialRequirementId: req?.id ?? null,
                    reqName: req?.name ?? r.name,
                    qtyAtCapture: req?.quantity ?? null,
                    unit: req?.unit ?? null,
                    source: 'API',
                    supplierId: supplier.id,
                    externalRef: r.externalRef ?? null,
                    sourceUrl: r.sourceUrl ?? null,
                    queriedBy: userId ?? null,
                    ...priced,
                    priceNettoApi: r.priceNetto, // surowa cena źródła — niemutowalna
                },
                include: this.itemInclude,
            }));
        }
        return created;
    }

    // ─── POMOCNICZE ───────────────────────────────────────────────────────────

    private async requireQuote(id: string) {
        const qq = await this.prisma.quickQuote.findUnique({ where: { id } });
        if (!qq) throw new NotFoundException('Wycena nie znaleziona');
        return qq;
    }

    // @anchor quick-quotes-require-editable — mutacje pozycji/nagłówka tylko w DRAFT.
    private requireEditable(qq: { status: string }) {
        if (qq.status !== 'DRAFT') {
            throw new BadRequestException(`Wycena w statusie ${qq.status} — edycja możliwa tylko w DRAFT`);
        }
    }

    // @anchor quick-quotes-freeze-price — zamrożenie kursu NBP w momencie capture;
    // PLN przechodzi 1:1. Zwraca komplet pól walutowych pozycji.
    private async freezePrice(priceOriginalNetto: number | null | undefined, currency: string | null | undefined) {
        const cur = (currency || 'PLN').toUpperCase();
        if (priceOriginalNetto == null) {
            return { priceOriginalNetto: null, currency: cur, exchangeRate: null, rateDate: null, priceNettoPln: null };
        }
        if (cur === 'PLN') {
            return { priceOriginalNetto, currency: cur, exchangeRate: null, rateDate: null, priceNettoPln: priceOriginalNetto };
        }
        const rate = await this.exchangeRates.fetchNbpRate(cur);
        if (!rate) throw new BadRequestException(`Brak kursu NBP dla waluty ${cur}`);
        return {
            priceOriginalNetto,
            currency: cur,
            exchangeRate: rate.rate,
            rateDate: new Date(rate.date),
            priceNettoPln: Math.round(priceOriginalNetto * rate.rate * 100) / 100,
        };
    }
}
