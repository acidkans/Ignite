import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '../audit/audit.types';

// @anchor leaf-actuals-user — kształt `req.user` z JwtStrategy, tyle ile potrzeba do uprawnień
export interface ActualsUser {
    userId: string;
    email?: string;
    roles?: string[];
}

// @anchor leaf-actual-input
export interface LeafActualInput {
    wbsNodeId?: string;
    entryDate?: string | Date;
    qty?: number | string;
    unitCost?: number | string;
    comment?: string | null;
    docNumber?: string | null;
    supplierId?: string | null;
}

const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

// @anchor leaf-actuals-service
// Wpisy realizacji liścia WBS (zakup / wykonanie) — strona ZAKUP w porównaniu F5.
// Jeden wpis = jedno zdarzenie w świecie rzeczywistym: dostawa, faktura, dzień ekipy,
// odebrana usługa. Kluczowane po korzeniu klonu liścia (`sourceWbsNodeId ?? id`),
// więc dopisywanie przeżywa utworzenie nowej wersji i nie zależy od tego, którą
// wersję ma się akurat otwartą.
@Injectable()
export class LeafActualsService {
    private readonly logger = new Logger(LeafActualsService.name);

    constructor(private prisma: PrismaService) { }

    private isManager(user?: ActualsUser) {
        return !!user?.roles?.some((r) => ['ADMIN', 'MANAGER'].includes(r));
    }

    // @anchor leaf-actuals-root-of — korzeń klonu liścia; dla wierszy sprzed migracji
    // (sourceWbsNodeId = NULL) korzeniem jest własne id
    private async rootOfWbsNode(wbsNodeId: string) {
        const leaf = await this.prisma.wbsNode.findUnique({
            where: { id: wbsNodeId },
            select: { id: true, nodeId: true, sourceWbsNodeId: true, type: true, name: true },
        });
        if (!leaf) throw new NotFoundException('Liść WBS nie znaleziony');
        return { rootId: leaf.sourceWbsNodeId ?? leaf.id, nodeId: leaf.nodeId, leaf };
    }

    // @anchor leaf-actuals-list — wszystkie wpisy zamówienia jednym zapytaniem;
    // frontend grupuje po `wbsRootId`, bo ten sam korzeń obsługuje każdą wersję
    async listByOrder(nodeId: string) {
        return this.prisma.leafActual.findMany({
            where: { nodeId },
            orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
            select: {
                id: true, wbsRootId: true, entryDate: true, qty: true, unitCost: true,
                comment: true, docNumber: true, createdAt: true,
                supplier: { select: { id: true, name: true } },
                author: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });
    }

    // @anchor leaf-actuals-create
    async create(input: LeafActualInput, user?: ActualsUser) {
        if (!input?.wbsNodeId) throw new BadRequestException('wbsNodeId wymagane');
        const qty = num(input.qty);
        if (qty == null || qty <= 0) throw new BadRequestException('Ilość musi być większa od zera');
        const unitCost = num(input.unitCost) ?? 0;

        const { rootId, nodeId, leaf } = await this.rootOfWbsNode(input.wbsNodeId);
        const created = await this.prisma.leafActual.create({
            data: {
                wbsRootId: rootId,
                nodeId,
                entryDate: input.entryDate ? new Date(input.entryDate) : new Date(),
                qty,
                unitCost,
                comment: input.comment?.trim() || null,
                docNumber: input.docNumber?.trim() || null,
                supplierId: input.supplierId || null,
                authorId: user?.userId ?? null,
            },
            select: {
                id: true, wbsRootId: true, entryDate: true, qty: true, unitCost: true,
                comment: true, docNumber: true, createdAt: true,
                supplier: { select: { id: true, name: true } },
                author: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: {
                action: AuditAction.CREATE,
                entity: 'LeafActual',
                entityId: created.id,
                diff: { wbsNodeId: input.wbsNodeId, leaf: leaf.name, qty, unitCost, comment: created.comment },
                userId: user?.userId ?? null,
            },
        });
        this.logger.log(`Wpis realizacji ${qty} × ${unitCost} na liściu „${leaf.name}" (${nodeId}) przez ${user?.email}`);
        return created;
    }

    // @anchor leaf-actuals-update — edytuje autor wpisu, cudzy wyłącznie manager/admin
    async update(id: string, input: LeafActualInput, user?: ActualsUser) {
        const existing = await this.prisma.leafActual.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Wpis nie znaleziony');
        if (existing.authorId && existing.authorId !== user?.userId && !this.isManager(user)) {
            throw new ForbiddenException('Cudzy wpis realizacji może zmienić tylko manager');
        }

        const qty = num(input.qty);
        if (input.qty !== undefined && (qty == null || qty <= 0)) {
            throw new BadRequestException('Ilość musi być większa od zera');
        }
        const unitCost = num(input.unitCost);

        const updated = await this.prisma.leafActual.update({
            where: { id },
            data: {
                ...(qty != null ? { qty } : {}),
                ...(unitCost != null ? { unitCost } : {}),
                ...(input.entryDate !== undefined ? { entryDate: new Date(input.entryDate) } : {}),
                ...(input.comment !== undefined ? { comment: input.comment?.trim() || null } : {}),
                ...(input.docNumber !== undefined ? { docNumber: input.docNumber?.trim() || null } : {}),
                ...(input.supplierId !== undefined ? { supplierId: input.supplierId || null } : {}),
            },
            select: {
                id: true, wbsRootId: true, entryDate: true, qty: true, unitCost: true,
                comment: true, docNumber: true, createdAt: true,
                supplier: { select: { id: true, name: true } },
                author: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });

        await this.prisma.auditLog.create({
            data: {
                action: AuditAction.UPDATE,
                entity: 'LeafActual',
                entityId: id,
                diff: {
                    przed: { qty: existing.qty, unitCost: existing.unitCost, comment: existing.comment },
                    po: { qty: updated.qty, unitCost: updated.unitCost, comment: updated.comment },
                },
                userId: user?.userId ?? null,
            },
        });
        return updated;
    }

    // @anchor leaf-actuals-remove
    async remove(id: string, user?: ActualsUser) {
        const existing = await this.prisma.leafActual.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Wpis nie znaleziony');
        if (existing.authorId && existing.authorId !== user?.userId && !this.isManager(user)) {
            throw new ForbiddenException('Cudzy wpis realizacji może usunąć tylko manager');
        }
        await this.prisma.leafActual.delete({ where: { id } });
        await this.prisma.auditLog.create({
            data: {
                action: AuditAction.DELETE,
                entity: 'LeafActual',
                entityId: id,
                diff: { qty: existing.qty, unitCost: existing.unitCost, comment: existing.comment, wbsRootId: existing.wbsRootId },
                userId: user?.userId ?? null,
            },
        });
        return { ok: true };
    }

    // @anchor leaf-actuals-close — rozliczenie pozycji mimo niedowykonania planu;
    // bez tego pokrycie nigdy nie dobija do 100% i panel przestaje cokolwiek mówić
    async setClosed(wbsNodeId: string, closed: boolean, user?: ActualsUser) {
        const leaf = await this.prisma.wbsNode.findUnique({ where: { id: wbsNodeId }, select: { id: true, name: true } });
        if (!leaf) throw new NotFoundException('Liść WBS nie znaleziony');
        const updated = await this.prisma.wbsNode.update({
            where: { id: wbsNodeId },
            data: { realizationClosed: closed },
            select: { id: true, realizationClosed: true },
        });
        await this.prisma.auditLog.create({
            data: {
                action: AuditAction.UPDATE,
                entity: 'WbsNode',
                entityId: wbsNodeId,
                diff: { realizationClosed: closed, leaf: leaf.name },
                userId: user?.userId ?? null,
            },
        });
        return updated;
    }
}
