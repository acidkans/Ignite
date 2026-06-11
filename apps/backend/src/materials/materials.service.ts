import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
// @anchor materials-service
export class MaterialsService {
    constructor(private readonly prisma: PrismaService) {}

    // ─── KATALOG ──────────────────────────────────────────────────────────────

    /** Wszystkie materiały z katalogu (+ propozycje ręczne / wybrane AI bez wpisu w materials) */
    // @anchor materials-find-all
    async findAll() {
        const [items, manualProposals] = await Promise.all([
            this.prisma.material.findMany({
                select: {
                    id: true, manufacturer: true, model: true, productName: true,
                    dataSheetUrl: true, dataSheetName: true, complianceUrl: true, complianceName: true,
                    type: true, priceNetto: true, productUrl: true, seller: true, imageUrl: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.productProposal.findMany({
                where: {
                    NOT: { manufacturer: '' },
                    OR: [{ isManual: true }, { isSelected: true }],
                },
                select: {
                    id: true, manufacturer: true, model: true, productName: true,
                    priceNetto: true, availability: true, sourceUrl: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        const proposalsMapped = manualProposals.map(p => ({
            id: `proposal:${p.id}`,
            manufacturer: p.manufacturer,
            model: p.model,
            productName: p.productName,
            dataSheetUrl: null,
            dataSheetName: null,
            complianceUrl: null,
            complianceName: null,
            type: 'MATERIAL',
            priceNetto: p.priceNetto,
            seller: null,
            imageUrl: null,
            availability: p.availability,
            productUrl: p.sourceUrl,
        }));

        const seen = new Set<string>();
        return [...items, ...proposalsMapped].filter(m => {
            const key = `${(m.manufacturer || '').toLowerCase()}|${(m.model || '').toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /** Materiały z kartą katalogową (dataSheetUrl wypełniony) */
    // @anchor materials-find-database
    async findDatabase() {
        return this.prisma.material.findMany({
            where: {
                dataSheetUrl: { not: null },
                NOT: { dataSheetUrl: '' },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // @anchor materials-find-one
    async findOne(id: string) {
        const m = await this.prisma.material.findUnique({
            where: { id },
            include: { stock: true },
        });
        if (!m) throw new NotFoundException(`Material ${id} not found`);
        return m;
    }

    // @anchor materials-create
    async create(dto: {
        manufacturer: string;
        model?: string | null;
        productName?: string | null;
        type?: string;
        priceNetto?: number | null;
        seller?: string | null;
        productUrl?: string | null;
        imageUrl?: string | null;
        dataSheetUrl?: string | null;
        dataSheetName?: string | null;
        complianceUrl?: string | null;
        complianceName?: string | null;
    }) {
        return this.prisma.material.create({
            data: {
                manufacturer: dto.manufacturer,
                model: dto.model ?? null,
                productName: dto.productName ?? null,
                type: dto.type ?? 'DEVICE',
                priceNetto: dto.priceNetto ?? undefined,
                seller: dto.seller ?? undefined,
                productUrl: dto.productUrl ?? undefined,
                imageUrl: dto.imageUrl ?? undefined,
                dataSheetUrl: dto.dataSheetUrl ?? undefined,
                dataSheetName: dto.dataSheetName ?? undefined,
                complianceUrl: dto.complianceUrl ?? undefined,
                complianceName: dto.complianceName ?? undefined,
            },
        });
    }

    // @anchor materials-update
    async update(id: string, dto: Partial<{
        manufacturer: string;
        model: string | null;
        productName: string | null;
        type: string;
        priceNetto: number | null;
        seller: string | null;
        productUrl: string | null;
        imageUrl: string | null;
        dataSheetUrl: string | null;
        dataSheetName: string | null;
        complianceUrl: string | null;
        complianceName: string | null;
    }>) {
        await this.findOne(id);
        return this.prisma.material.update({ where: { id }, data: dto as any });
    }

    // @anchor materials-remove
    async remove(id: string) {
        await this.findOne(id);
        return this.prisma.material.delete({ where: { id } });
    }

    // ─── STAN MAGAZYNOWY ──────────────────────────────────────────────────────

    // @anchor materials-find-stock
    async findStock(materialId: string) {
        await this.findOne(materialId);
        return this.prisma.materialStock.findMany({ where: { materialId } });
    }

    // @anchor materials-update-stock
    async updateStock(materialId: string, dto: { quantity: number; location?: string | null }) {
        await this.findOne(materialId);
        const existing = await this.prisma.materialStock.findFirst({ where: { materialId } });
        if (existing) {
            return this.prisma.materialStock.update({
                where: { id: existing.id },
                data: { quantity: dto.quantity, location: dto.location ?? existing.location },
            });
        }
        return this.prisma.materialStock.create({
            data: { materialId, quantity: dto.quantity, location: dto.location ?? null },
        });
    }

    // ─── HISTORIA CEN ─────────────────────────────────────────────────────────

    /** Zaakceptowane propozycje cenowe dla danego materiału (historia cen z projektów) */
    // @anchor materials-find-proposal-history
    async findProposalHistory(materialId: string) {
        await this.findOne(materialId);
        return this.prisma.productProposal.findMany({
            where: {
                isSelected: true,
                materialRequirement: { materialId },
            },
            select: {
                id: true,
                priceNetto: true,
                manufacturer: true,
                model: true,
                productName: true,
                seller: true,
                availability: true,
                createdAt: true,
                materialRequirement: {
                    select: {
                        id: true,
                        node: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ─── IMPORT Z KART KATALOGOWYCH ───────────────────────────────────────────

    /** Upsert produktów z karty katalogowej do tabeli materials */
    // @anchor materials-from-datasheet
    async createFromDatasheet(documentId: string, nodeId: string, items: any[]) {
        const doc = await this.prisma.processNode.findUnique({ where: { id: documentId } });
        if (!doc) throw new NotFoundException('Dokument nie znaleziony');

        const dataSheetUrl = doc.storagePath;
        const dataSheetName = doc.name;
        const validType = (t: string) => ['DEVICE', 'MATERIAL', 'CABLE', 'SOFTWARE', 'SERVICE'].includes(t) ? t : 'DEVICE';

        const results: any[] = [];
        for (const item of items) {
            if (!item.manufacturer) continue;
            const productName = String(item.productName || '').slice(0, 300) || null;
            const manufacturer = String(item.manufacturer).slice(0, 200).toUpperCase();
            const model = item.model ? String(item.model).slice(0, 200) : null;

            const existing = await this.prisma.material.findFirst({ where: { manufacturer, model: model ?? null } });
            const material = existing
                ? await this.prisma.material.update({
                    where: { id: existing.id },
                    data: { productName: productName ?? undefined, dataSheetUrl, dataSheetName },
                })
                : await this.prisma.material.create({
                    data: { manufacturer, model, productName, type: validType(item.type), dataSheetUrl, dataSheetName },
                });
            results.push(material);
        }
        return results;
    }
}
