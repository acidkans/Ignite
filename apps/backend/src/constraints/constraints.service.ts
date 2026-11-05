import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '../audit/audit.types';

// @anchor constraints-user — kształt `req.user` z JwtStrategy
export interface ConstraintsUser {
    userId: string;
    email?: string;
    roles?: string[];
}

// @anchor constraint-input
export interface ConstraintInput {
    wbsNodeId?: string; // wiersz bieżącej wersji — serwis wylicza z niego wbsRootId
    kind?: string;
    title?: string;
    note?: string | null;
    ownerId?: string | null;
    dueAt?: string | Date | null;
    impactDays?: number | string | null;
    status?: string;
    sourceType?: string | null;
    sourceId?: string | null;
}

// @anchor constraint-kinds — rodzaje blokera (`Constraint.kind`); nieznany = 400
export const CONSTRAINT_KINDS = ['MATERIAL', 'PERMIT', 'ACCESS', 'CLIENT', 'CREW', 'TECH', 'OTHER'] as const;
const STATUSES = ['OPEN', 'CLOSED'];
// QA = para z WbsNode.qa, COMMENT = wpis czatu, COLLISION = wpis dostawy (LeafActual FORECAST) kolidujący z robotami
// MILESTONE = kolizja pozycji z milestone'em (Kokpit Realizacji), `sourceId` = `${msId}:${pozycjaId}`.
const SOURCE_TYPES = ['QA', 'COMMENT', 'COLLISION', 'MILESTONE'];

const SELECT = {
    id: true, processNodeId: true, wbsRootId: true, kind: true, title: true, note: true,
    ownerId: true, dueAt: true, impactDays: true, status: true, sourceType: true, sourceId: true,
    createdById: true, closedAt: true, closedById: true, createdAt: true, updatedAt: true,
    owner: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

const oneOf = (v: unknown, allowed: readonly string[], label: string) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const s = String(v).toUpperCase();
    if (!allowed.includes(s)) throw new BadRequestException(`Nieznana wartość ${label}: ${v}`);
    return s;
};
const dateOf = (v: unknown) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const d = new Date(v as any);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Zła data terminu');
    return d;
};
const intOf = (v: unknown) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) throw new BadRequestException('Wpływ w dniach musi być liczbą');
    return n;
};

// @anchor constraints-service
// Rejestr blokerów realizacji. Klucz pozycji = korzeń klonu (`sourceWbsNodeId ?? id`), jak
// w `LeafActual` — bloker przeżywa nowe wersje i nie wchodzi do `cloneVersionData`.
@Injectable()
export class ConstraintsService {
    private readonly logger = new Logger(ConstraintsService.name);

    constructor(private prisma: PrismaService) { }

    private isManager(user?: ConstraintsUser) {
        return !!user?.roles?.some((r) => ['ADMIN', 'MANAGER'].includes(r));
    }

    private async audit(action: AuditAction, id: string, diff: any, user?: ConstraintsUser) {
        await this.prisma.auditLog.create({
            data: { action, entity: 'Constraint', entityId: id, diff, userId: user?.userId ?? null },
        });
    }

    // @anchor constraints-list — wszystkie blokery zamówienia (otwarte i zamknięte)
    listByOrder(processNodeId: string) {
        return this.prisma.constraint.findMany({
            where: { processNodeId },
            orderBy: [{ status: 'desc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
            select: SELECT,
        });
    }

    // @anchor constraints-create
    async create(processNodeId: string, input: ConstraintInput, user?: ConstraintsUser) {
        const title = String(input?.title || '').trim();
        if (!title) throw new BadRequestException('Opis blokera jest wymagany');
        if (!input?.wbsNodeId) throw new BadRequestException('wbsNodeId wymagane');
        const node = await this.prisma.wbsNode.findUnique({
            where: { id: input.wbsNodeId },
            select: { id: true, nodeId: true, sourceWbsNodeId: true, name: true },
        });
        if (!node) throw new NotFoundException('Węzeł WBS nie znaleziony');
        if (node.nodeId !== processNodeId) throw new BadRequestException('Węzeł należy do innego zamówienia');

        const created = await this.prisma.constraint.create({
            data: {
                processNodeId,
                wbsRootId: node.sourceWbsNodeId ?? node.id,
                kind: oneOf(input.kind, CONSTRAINT_KINDS, 'rodzaju') ?? 'OTHER',
                title,
                note: input.note?.trim() || null,
                ownerId: input.ownerId || null,
                dueAt: dateOf(input.dueAt) ?? null,
                impactDays: intOf(input.impactDays) ?? null,
                sourceType: oneOf(input.sourceType, SOURCE_TYPES, 'źródła') ?? null,
                sourceId: input.sourceId || null,
                createdById: user?.userId ?? null,
            },
            select: SELECT,
        });
        await this.audit(AuditAction.CREATE, created.id, { wbsNodeId: node.id, node: node.name, title, kind: created.kind }, user);
        this.logger.log(`Bloker „${title}" na „${node.name}" (${processNodeId}) przez ${user?.email}`);
        return created;
    }

    // @anchor constraints-update — edycja pól i zamknięcie/otwarcie (status OPEN | CLOSED)
    async update(id: string, input: ConstraintInput, user?: ConstraintsUser) {
        const existing = await this.prisma.constraint.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Bloker nie znaleziony');
        const status = oneOf(input.status, STATUSES, 'statusu');
        const data: any = {
            kind: oneOf(input.kind, CONSTRAINT_KINDS, 'rodzaju') ?? undefined,
            title: input.title !== undefined ? (String(input.title).trim() || existing.title) : undefined,
            note: input.note !== undefined ? (input.note?.trim() || null) : undefined,
            ownerId: input.ownerId !== undefined ? (input.ownerId || null) : undefined,
            dueAt: dateOf(input.dueAt),
            impactDays: intOf(input.impactDays),
        };
        if (status && status !== existing.status) {
            data.status = status;
            data.closedAt = status === 'CLOSED' ? new Date() : null;
            data.closedById = status === 'CLOSED' ? (user?.userId ?? null) : null;
        }
        const updated = await this.prisma.constraint.update({ where: { id }, data, select: SELECT });
        await this.audit(AuditAction.UPDATE, id, { input }, user);
        return updated;
    }

    // @anchor constraints-remove — usuwa autor albo manager; zwykle wystarcza zamknięcie
    async remove(id: string, user?: ConstraintsUser) {
        const existing = await this.prisma.constraint.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Bloker nie znaleziony');
        if (existing.createdById && existing.createdById !== user?.userId && !this.isManager(user)) {
            throw new ForbiddenException('Cudzy bloker może usunąć tylko manager');
        }
        await this.prisma.constraint.delete({ where: { id } });
        await this.audit(AuditAction.DELETE, id, { title: existing.title, wbsRootId: existing.wbsRootId }, user);
        return { ok: true };
    }
}
