import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OffersService {
    constructor(private readonly prisma: PrismaService) {}

    async create(nodeId: string, fileName: string, positions: any[], documentId?: string, createdBy?: string) {
        const posJson = JSON.stringify(positions);
        // Upsert — jeśli oferta z tym samym documentId już istnieje, zaktualizuj zamiast tworzyć duplikat
        if (documentId) {
            const existing = await this.prisma.offer.findFirst({ where: { documentId } });
            if (existing) {
                return this.prisma.offer.update({
                    where: { id: existing.id },
                    data: { nodeId, fileName, positions: posJson },
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
            }
        });
    }

    async findAll() {
        const offers = await this.prisma.offer.findMany({ orderBy: { createdAt: 'desc' } });
        return offers.map(o => ({
            ...o,
            positions: (() => { try { return JSON.parse(o.positions); } catch { return []; } })(),
        }));
    }

    async findByNode(nodeId: string) {
        const offers = await this.prisma.offer.findMany({
            where: { nodeId },
            orderBy: { createdAt: 'desc' },
        });
        return offers.map(o => ({
            ...o,
            positions: (() => { try { return JSON.parse(o.positions); } catch { return []; } })(),
        }));
    }

    async delete(id: string) {
        return this.prisma.offer.delete({ where: { id } });
    }
}
