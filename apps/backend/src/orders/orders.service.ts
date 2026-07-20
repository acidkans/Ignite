import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '../audit/audit.types';

// @anchor orders-service
// Akceptacja wersji zamówienia (baseline) + etapy zamówienia (Faza 4).
// ACTIVE ≠ BASELINE: akceptacja NIE zmienia wersji aktywnej — to pointer
// ProcessNode.acceptedVersionId wskazuje zamrożony snapshot do porównań (F5).
@Injectable()
export class OrdersService {
    private readonly logger = new Logger(OrdersService.name);

    constructor(
        private prisma: PrismaService,
        private cls: ClsService,
    ) { }

    // @anchor orders-get-acceptance — stan akceptacji węzła (badge BASELINE, etap).
    async getAcceptance(nodeId: string) {
        const node = await this.prisma.processNode.findUnique({
            where: { id: nodeId },
            select: {
                id: true,
                orderStage: true,
                acceptedVersionId: true,
                acceptedAt: true,
                acceptedBy: true,
                acceptedVersion: { select: { id: true, label: true } },
            },
        });
        if (!node) throw new NotFoundException('Węzeł nie znaleziony');
        return node;
    }

    // @anchor orders-accept-preview — dane do modala potwierdzenia: suma budżetu
    // wymagań wskazanej wersji + zamrożone wyceny (kandydatki na BASELINE).
    async acceptPreview(nodeId: string, versionId: string) {
        const version = await this.prisma.projectVersion.findUnique({ where: { id: versionId } });
        if (!version || version.nodeId !== nodeId) throw new BadRequestException('Wersja nie należy do tego węzła');

        const reqs = await this.prisma.materialRequirement.findMany({
            where: { nodeId, versionId },
            select: { quantity: true, budgetedPriceNetto: true },
        });
        const budgetSum = reqs.reduce((s, r) => s + (r.budgetedPriceNetto != null ? r.budgetedPriceNetto * r.quantity : 0), 0);
        const pricedCount = reqs.filter((r) => r.budgetedPriceNetto != null).length;

        const lockedQuickQuotes = await this.prisma.quickQuote.findMany({
            where: { nodeId, status: 'LOCKED' },
            select: { id: true, name: true, lockedAt: true, _count: { select: { items: true } } },
            orderBy: { lockedAt: 'desc' },
        });

        return {
            versionLabel: version.label,
            requirementsCount: reqs.length,
            pricedCount,
            budgetSum: Math.round(budgetSum * 100) / 100,
            lockedQuickQuotes,
        };
    }

    // @anchor orders-accept — kciuk managera: JEDNA transakcja — pointer
    // acceptedVersionId + acceptedAt/By + orderStage=ZAAKCEPTOWANE + wskazana
    // QuickQuote→BASELINE + wpis AuditLog. Kciuk NIE zmienia wersji aktywnej.
    async accept(nodeId: string, versionId: string, quickQuoteId: string | null | undefined, userEmail?: string) {
        const node = await this.prisma.processNode.findUnique({
            where: { id: nodeId },
            select: { id: true, acceptedVersionId: true },
        });
        if (!node) throw new NotFoundException('Węzeł nie znaleziony');
        if (node.acceptedVersionId) {
            throw new BadRequestException('Zamówienie ma już zaakceptowaną wersję — najpierw cofnij akceptację');
        }
        const version = await this.prisma.projectVersion.findUnique({ where: { id: versionId } });
        if (!version || version.nodeId !== nodeId) throw new BadRequestException('Wersja nie należy do tego węzła');

        if (quickQuoteId) {
            const qq = await this.prisma.quickQuote.findUnique({ where: { id: quickQuoteId } });
            if (!qq || qq.nodeId !== nodeId) throw new BadRequestException('Wycena nie należy do tego węzła');
            if (qq.status !== 'LOCKED') throw new BadRequestException(`Wycena ma status ${qq.status} — na BASELINE można wskazać tylko LOCKED`);
        }

        const userId = this.cls.get('user.id') ?? null;
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.processNode.update({
                where: { id: nodeId },
                data: {
                    acceptedVersionId: versionId,
                    acceptedAt: new Date(),
                    acceptedBy: userEmail ?? null,
                    orderStage: 'ZAAKCEPTOWANE',
                },
                select: { id: true, orderStage: true, acceptedVersionId: true, acceptedAt: true, acceptedBy: true },
            });
            if (quickQuoteId) {
                await tx.quickQuote.update({ where: { id: quickQuoteId }, data: { status: 'BASELINE' } });
            }
            await tx.auditLog.create({
                data: {
                    action: AuditAction.ACCEPT,
                    entity: 'ProcessNode',
                    entityId: nodeId,
                    diff: { versionId, versionLabel: version.label, quickQuoteId: quickQuoteId ?? null },
                    userId,
                },
            });
            this.logger.log(`Zaakceptowano wersję ${version.label} (${versionId}) dla węzła ${nodeId} przez ${userEmail}`);
            return updated;
        });
    }

    // @anchor orders-revoke-accept — cofnięcie akceptacji: osobna głośna akcja
    // z obowiązkowym powodem (AuditLog), powrót orderStage=WYCENA,
    // BASELINE wycen węzła wraca do LOCKED. NIE jest to drugi klik w kciuk.
    async revokeAccept(nodeId: string, reason: string, userEmail?: string) {
        if (!reason?.trim()) throw new BadRequestException('Powód cofnięcia akceptacji jest wymagany');
        const node = await this.prisma.processNode.findUnique({
            where: { id: nodeId },
            select: { id: true, acceptedVersionId: true, acceptedBy: true, acceptedAt: true },
        });
        if (!node) throw new NotFoundException('Węzeł nie znaleziony');
        if (!node.acceptedVersionId) throw new BadRequestException('Zamówienie nie ma zaakceptowanej wersji');

        const userId = this.cls.get('user.id') ?? null;
        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.processNode.update({
                where: { id: nodeId },
                data: {
                    acceptedVersionId: null,
                    acceptedAt: null,
                    acceptedBy: null,
                    orderStage: 'WYCENA',
                },
                select: { id: true, orderStage: true, acceptedVersionId: true },
            });
            await tx.quickQuote.updateMany({
                where: { nodeId, status: 'BASELINE' },
                data: { status: 'LOCKED' },
            });
            await tx.auditLog.create({
                data: {
                    action: AuditAction.REVOKE_ACCEPT,
                    entity: 'ProcessNode',
                    entityId: nodeId,
                    diff: {
                        reason: reason.trim(),
                        previousVersionId: node.acceptedVersionId,
                        previousAcceptedBy: node.acceptedBy,
                        previousAcceptedAt: node.acceptedAt,
                    },
                    userId,
                },
            });
            this.logger.log(`Cofnięto akceptację węzła ${nodeId} przez ${userEmail}; powód: ${reason.trim()}`);
            return updated;
        });
    }
}
