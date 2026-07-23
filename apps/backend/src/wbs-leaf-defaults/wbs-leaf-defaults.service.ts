import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WbsLeafDefaultsService {
    constructor(private prisma: PrismaService) { }

    // Zwraca zapisane wartości domyślne dla zamówienia jako obiekt (JSON.parse) albo
    // {} gdy brak wpisu (nowe zamówienie) — frontend zmerguje to z bazą wyzerowaną.
    async findByNode(nodeId: string): Promise<Record<string, any>> {
        const row = await this.prisma.wbsLeafDefaults.findUnique({ where: { nodeId } });
        if (!row?.data) return {};
        try {
            const parsed = JSON.parse(row.data);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    // Upsert — jeden wiersz na zamówienie.
    async upsert(nodeId: string, data: Record<string, any>): Promise<Record<string, any>> {
        const serialized = JSON.stringify(data ?? {});
        await this.prisma.wbsLeafDefaults.upsert({
            where: { nodeId },
            create: { nodeId, data: serialized },
            update: { data: serialized },
        });
        return data ?? {};
    }
}
