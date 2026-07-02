import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeManufacturer } from '../common/normalize.util';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
// @anchor materials-service
export class MaterialsService {
    constructor(private readonly prisma: PrismaService) {}

    // @anchor materials-resolve-upload-path
    private resolveUploadPath(stored: string): string {
        if (path.isAbsolute(stored)) return stored; // legacy: absolutna ścieżka Docker
        return path.join(process.cwd(), 'uploads', stored);
    }

    // @anchor materials-get-image-stream
    /** Obraz produktu z katalogu (Material.imageUrl — nazwa pliku we wspólnym katalogu uploads) */
    async getImageStream(id: string) {
        const m = await this.findOne(id);
        if (!m.imageUrl) throw new NotFoundException('No image for this material');
        const filePath = this.resolveUploadPath(m.imageUrl);
        if (!fs.existsSync(filePath)) throw new NotFoundException('Image file not found');
        const stream = fs.createReadStream(filePath);
        const ext = path.extname(m.imageUrl).toLowerCase();
        const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
        return { stream, mimeType: mimeMap[ext] || 'application/octet-stream' };
    }

    // ─── KATALOG ──────────────────────────────────────────────────────────────

    /** Wszystkie materiały z katalogu (tylko tabela materials — propozycje nie zaśmiecają katalogu) */
    // @anchor materials-find-all
    async findAll() {
        const items = await this.prisma.material.findMany({
            select: {
                id: true, manufacturer: true, model: true, productName: true,
                dataSheetUrl: true, dataSheetName: true, complianceUrl: true, complianceName: true,
                type: true, priceNetto: true, productUrl: true, seller: true, imageUrl: true,
            },
            where: { manufacturer: { not: '' } },
            orderBy: { createdAt: 'desc' },
        });
        const seen = new Set<string>();
        return items.filter(m => {
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
        const manufacturer = normalizeManufacturer(dto.manufacturer);
        const model = dto.model ?? null;
        // Unikaj 500 z unique constraint (manufacturer, model) — jeśli katalog już ma ten produkt, zaktualizuj go zamiast crashować.
        const existing = await this.prisma.material.findFirst({ where: { manufacturer, model } });
        if (existing) return this.update(existing.id, dto as any);
        return this.prisma.material.create({
            data: {
                manufacturer,
                model,
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
        const current = await this.findOne(id);
        if (dto.manufacturer !== undefined) dto.manufacturer = normalizeManufacturer(dto.manufacturer) ?? '';
        // (manufacturer, model) ma unique constraint w bazie. Normalizacja producenta może sprawić,
        // że edytowany rekord "zderzy się" z już istniejącym katalogowym duplikatem (np. legacy
        // "SCHNEIDER ELECTRIC" normalizuje się do tego samego "Schneider" co inny wiersz) —
        // zamiast wywalać 500, scalamy oba rekordy w jeden.
        if (dto.manufacturer !== undefined || dto.model !== undefined) {
            const finalManufacturer = dto.manufacturer !== undefined ? dto.manufacturer : current.manufacturer;
            const finalModel = dto.model !== undefined ? dto.model : current.model;
            const duplicate = await this.prisma.material.findFirst({
                where: { manufacturer: finalManufacturer, model: finalModel, NOT: { id } },
            });
            if (duplicate) return this.mergeInto(id, duplicate.id, dto);
        }
        return this.prisma.material.update({ where: { id }, data: dto as any });
    }

    // @anchor materials-merge-into
    /** Scala materiał `loserId` w `winnerId`: przepina wszystkie referencje, sumuje ilości, usuwa duplikat. */
    private async mergeInto(loserId: string, winnerId: string, dto: Record<string, any>) {
        await this.prisma.$transaction(async (tx) => {
            await tx.materialRequirement.updateMany({ where: { materialId: loserId }, data: { materialId: winnerId } });

            const loserStock = await tx.materialStock.findMany({ where: { materialId: loserId } });
            for (const s of loserStock) {
                const winnerStock = await tx.materialStock.findFirst({ where: { materialId: winnerId } });
                if (winnerStock) {
                    await tx.materialStock.update({ where: { id: winnerStock.id }, data: { quantity: { increment: s.quantity } } });
                    await tx.materialStock.delete({ where: { id: s.id } });
                } else {
                    await tx.materialStock.update({ where: { id: s.id }, data: { materialId: winnerId } });
                }
            }

            const loserAllocations = await tx.wbsNodeMaterial.findMany({ where: { materialId: loserId } });
            for (const a of loserAllocations) {
                const existing = await tx.wbsNodeMaterial.findFirst({ where: { wbsNodeId: a.wbsNodeId, materialId: winnerId } });
                if (existing) {
                    await tx.wbsNodeMaterial.update({ where: { id: existing.id }, data: { quantity: { increment: a.quantity } } });
                    await tx.wbsNodeMaterial.delete({ where: { id: a.id } });
                } else {
                    await tx.wbsNodeMaterial.update({ where: { id: a.id }, data: { materialId: winnerId } });
                }
            }

            await tx.material.delete({ where: { id: loserId } });

            const { manufacturer, model, ...rest } = dto;
            if (Object.keys(rest).length) await tx.material.update({ where: { id: winnerId }, data: rest });
        });
        return this.findOne(winnerId);
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
            const manufacturer = normalizeManufacturer(String(item.manufacturer).slice(0, 200)) as string;
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
