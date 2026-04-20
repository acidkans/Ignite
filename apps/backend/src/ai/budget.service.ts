import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BudgetService {
    private readonly logger = new Logger(BudgetService.name);

    constructor(private prisma: PrismaService) { }

    async getBudget(versionId: string) {
        return this.prisma.budgetLineItem.findMany({
            where: { versionId },
            include: { subtask: { select: { id: true, name: true } } }
        });
    }

    async addLineItem(versionId: string, data: any) {
        const totalCost = data.unitCost * data.quantity;
        const unitPrice = data.unitCost * (1 + data.margin / 100);
        const totalPrice = unitPrice * data.quantity;

        return this.prisma.budgetLineItem.create({
            data: {
                versionId,
                type: data.type,
                description: data.description,
                unit: data.unit,
                unitCost: data.unitCost,
                quantity: data.quantity,
                totalCost,
                margin: data.margin,
                unitPrice,
                totalPrice,
                subtaskId: data.subtaskId,
                comment: data.comment
            } as any
        });
    }

    async updateLineItem(id: string, data: any) {
        // Recalculate if totals are not provided
        const unitCost = data.unitCost;
        const quantity = data.quantity;
        const margin = data.margin;

        const totalCost = unitCost * quantity;
        const unitPrice = unitCost * (1 + margin / 100);
        const totalPrice = unitPrice * quantity;

        return this.prisma.budgetLineItem.update({
            where: { id },
            data: {
                ...data,
                totalCost,
                unitPrice,
                totalPrice
            }
        });
    }

    async deleteLineItem(id: string) {
        return this.prisma.budgetLineItem.delete({ where: { id } });
    }
}
