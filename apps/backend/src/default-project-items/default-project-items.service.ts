import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DefaultProjectItemsService {
    constructor(private prisma: PrismaService) { }

    findAll() {
        return this.prisma.defaultProjectItem.findMany({
            orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    }

    create(data: { category: string; name: string; description?: string; sortOrder?: number }) {
        return this.prisma.defaultProjectItem.create({ data });
    }

    async update(id: string, data: { category?: string; name?: string; description?: string; sortOrder?: number }) {
        try {
            return await this.prisma.defaultProjectItem.update({ where: { id }, data });
        } catch (e: any) {
            if (e.code === 'P2025') throw new NotFoundException(`Item ${id} not found`);
            throw e;
        }
    }

    async remove(id: string) {
        try {
            return await this.prisma.defaultProjectItem.delete({ where: { id } });
        } catch (e: any) {
            if (e.code === 'P2025') throw new NotFoundException(`Item ${id} not found`);
            throw e;
        }
    }
}
