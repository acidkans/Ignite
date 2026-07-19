import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OffersService {
    constructor(private readonly prisma: PrismaService) {}

    // @anchor offer-meta-input — metadane oferty z parsera (F2), potwierdzane w modalu uploadu
    // (dostawca z rejestru + numer/daty oferty).
    async create(
        nodeId: string,
        fileName: string,
        positions: any[],
        documentId?: string,
        createdBy?: string,
        meta?: { supplierId?: string | null; offerNumber?: string | null; offerDate?: string | null; validUntil?: string | null },
    ) {
        const posJson = JSON.stringify(positions);
        // Metadane nadpisywane tylko gdy przekazane (approve bez meta nie kasuje wcześniejszego dostawcy)
        const metaData: Record<string, any> = {};
        if (meta?.supplierId !== undefined) metaData.supplierId = meta.supplierId;
        if (meta?.offerNumber !== undefined) metaData.offerNumber = meta.offerNumber;
        if (meta?.offerDate !== undefined) metaData.offerDate = meta.offerDate ? new Date(meta.offerDate) : null;
        if (meta?.validUntil !== undefined) metaData.validUntil = meta.validUntil ? new Date(meta.validUntil) : null;

        // Upsert — jeśli oferta z tym samym documentId już istnieje, zaktualizuj zamiast tworzyć duplikat
        if (documentId) {
            const existing = await this.prisma.offer.findFirst({ where: { documentId } });
            if (existing) {
                return this.prisma.offer.update({
                    where: { id: existing.id },
                    data: { nodeId, fileName, positions: posJson, ...metaData },
                });
            }
        }
        return this.prisma.offer.create({
            data: {
                nodeId,
                fileName,
                positions: posJson,
                documentId: documentId || null,
                createdBy: createdBy || null,
                ...metaData,
            }
        });
    }

    async findAll() {
        const offers = await this.prisma.offer.findMany({
            orderBy: { createdAt: 'desc' },
            include: { supplier: { select: { id: true, name: true, nip: true, vatStatus: true } } },
        });
        return offers.map(o => ({
            ...o,
            positions: (() => { try { return JSON.parse(o.positions); } catch { return []; } })(),
        }));
    }

    async findByNode(nodeId: string) {
        const offers = await this.prisma.offer.findMany({
            where: { nodeId },
            orderBy: { createdAt: 'desc' },
            include: { supplier: { select: { id: true, name: true, nip: true, vatStatus: true } } },
        });
        return offers.map(o => ({
            ...o,
            positions: (() => { try { return JSON.parse(o.positions); } catch { return []; } })(),
        }));
    }

    async delete(id: string) {
        return this.prisma.offer.delete({ where: { id } });
    }

    async updatePositions(id: string, positions: any[]) {
        return this.prisma.offer.update({
            where: { id },
            data: { positions: JSON.stringify(positions) },
        });
    }
}
