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

    // @anchor orders-comparison — serce F5: parowanie żywych wymagań z klonami
    // zaakceptowanej wersji PO sourceRequirementId. Jeden endpoint — wiele widoków
    // (panel w Logistyce, panel per zamówienie, chip w nagłówku): te same liczby
    // baseline / aktualny / Δ na różnych poziomach agregacji.
    // Cena aktualna wg hierarchii: offerPositionSnapshot (FO — finalna z oferty)
    // → budgetedPriceNetto (QQ/MAN wg budgetSource). Odchylenia per wiersz:
    // CENOWE / ILOSCIOWE / ZAKRES_PLUS / ZAKRES_MINUS / KURSOWE.
    async comparison(nodeId: string) {
        const node = await this.prisma.processNode.findUnique({
            where: { id: nodeId },
            select: {
                id: true, name: true, orderStage: true,
                acceptedVersionId: true, acceptedAt: true, acceptedBy: true,
                acceptedVersion: { select: { id: true, label: true } },
            },
        });
        if (!node) throw new NotFoundException('Węzeł nie znaleziony');
        if (!node.acceptedVersionId) return { accepted: false, orderStage: node.orderStage };

        const [baselineRows, liveRows, baselineQqItems] = await Promise.all([
            this.prisma.materialRequirement.findMany({
                where: { nodeId, versionId: node.acceptedVersionId },
                select: { id: true, name: true, unit: true, quantity: true, budgetedPriceNetto: true, sourceRequirementId: true },
                orderBy: { createdAt: 'asc' },
            }),
            this.prisma.materialRequirement.findMany({
                where: { nodeId, versionId: null },
                select: { id: true, name: true, unit: true, quantity: true, budgetedPriceNetto: true, budgetSource: true, offerPositionSnapshot: true },
                orderBy: { createdAt: 'asc' },
            }),
            // Pozycje wyceny BASELINE (kolumny dostawcy QQ) — klucz: id żywego wymagania
            this.prisma.quickQuoteItem.findMany({
                where: { quickQuote: { nodeId, status: 'BASELINE' }, materialRequirementId: { not: null } },
                select: {
                    materialRequirementId: true, priceNettoPln: true, priceOriginalNetto: true,
                    currency: true, exchangeRate: true,
                    supplier: { select: { id: true, name: true } },
                },
            }),
        ]);

        const parseSnap = (s: string | null): any | null => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
        const byLiveId = new Map(liveRows.map((r) => [r.id, r]));
        const qqByLiveId = new Map(baselineQqItems.map((i) => [i.materialRequirementId as string, i]));
        const pairedLiveIds = new Set<string>();
        const rows: any[] = [];

        const buildCurrent = (live: (typeof liveRows)[number]) => {
            const snap = parseSnap(live.offerPositionSnapshot);
            let price: number | null = null;
            let source: string | null = null;
            let supplier: string | null = null;
            if (snap?.priceNetto != null) {
                price = snap.priceNetto;
                source = 'FO';
                supplier = snap.supplier?.name ?? null;
            } else if (live.budgetedPriceNetto != null) {
                price = live.budgetedPriceNetto;
                source = live.budgetSource === 'QUICKQUOTE' ? 'QQ' : 'MAN';
                supplier = qqByLiveId.get(live.id)?.supplier?.name ?? null;
            }
            return {
                qty: live.quantity,
                price,
                value: price != null ? Math.round(live.quantity * price * 100) / 100 : null,
                priceSource: source,
                supplier,
                snap,
            };
        };

        // Wiersze sparowane + zakres− (baseline bez żywego odpowiednika)
        for (const b of baselineRows) {
            const live = b.sourceRequirementId ? byLiveId.get(b.sourceRequirementId) : undefined;
            const baseline = {
                qty: b.quantity,
                price: b.budgetedPriceNetto,
                value: b.budgetedPriceNetto != null ? Math.round(b.quantity * b.budgetedPriceNetto * 100) / 100 : null,
            };
            if (!live) {
                rows.push({ key: b.id, name: b.name, unit: b.unit, baseline, current: null, qqSupplier: null, deviations: ['ZAKRES_MINUS'], delta: null });
                continue;
            }
            pairedLiveIds.add(live.id);
            const { snap, ...current } = buildCurrent(live);
            const qq = qqByLiveId.get(live.id) ?? null;
            const deviations: string[] = [];
            if (live.quantity !== b.quantity) deviations.push('ILOSCIOWE');
            if (current.price != null && baseline.price != null && current.price !== baseline.price) {
                // Kursowe: ta sama cena w walucie oryginalnej co w wycenie BASELINE,
                // różnica wyłącznie z kursu NBP zamrożonego w innym momencie
                const isFx = snap?.currency && snap.currency !== 'PLN'
                    && qq && qq.currency === snap.currency
                    && qq.priceOriginalNetto != null && snap.priceOriginal != null
                    && Math.abs(qq.priceOriginalNetto - snap.priceOriginal) < 0.005
                    && qq.exchangeRate !== snap.exchangeRate;
                deviations.push(isFx ? 'KURSOWE' : 'CENOWE');
            }
            const delta = current.value != null && baseline.value != null
                ? Math.round((current.value - baseline.value) * 100) / 100
                : null;
            rows.push({
                key: b.id, name: live.name ?? b.name, unit: live.unit ?? b.unit,
                baseline, current,
                qqSupplier: qq ? { name: qq.supplier?.name ?? null, priceNettoPln: qq.priceNettoPln } : null,
                deviations, delta,
            });
        }

        // Zakres+ (żywe wymagania spoza baseline)
        for (const live of liveRows) {
            if (pairedLiveIds.has(live.id)) continue;
            const { snap, ...current } = buildCurrent(live);
            const qq = qqByLiveId.get(live.id) ?? null;
            rows.push({
                key: live.id, name: live.name, unit: live.unit,
                baseline: null, current,
                qqSupplier: qq ? { name: qq.supplier?.name ?? null, priceNettoPln: qq.priceNettoPln } : null,
                deviations: ['ZAKRES_PLUS'], delta: current.value,
            });
        }

        // KPI. Prognoza = Σ(aktualna wartość gdzie wyceniona) + Σ(baseline gdzie
        // sparowane ale bez ceny aktualnej); zakres− (usunięty z żywych) nie wchodzi.
        const r2 = (x: number) => Math.round(x * 100) / 100;
        const baselineSum = r2(rows.reduce((s, r) => s + (r.baseline?.value ?? 0), 0));
        const currentSum = r2(rows.reduce((s, r) => s + (r.current?.value ?? 0), 0));
        const forecastSum = r2(rows.reduce((s, r) => {
            if (!r.current) return s; // zakres− — poza prognozą
            return s + (r.current.value ?? r.baseline?.value ?? 0);
        }, 0));
        const liveCount = liveRows.length;
        const pricedCount = rows.filter((r) => r.current?.value != null).length;
        const deltaSum = r2(forecastSum - baselineSum);
        const deltaPct = baselineSum > 0 ? r2((deltaSum / baselineSum) * 100) : null;
        const countDev = (t: string) => rows.filter((r) => r.deviations.includes(t)).length;

        return {
            accepted: true,
            nodeName: node.name,
            orderStage: node.orderStage,
            versionId: node.acceptedVersionId,
            versionLabel: node.acceptedVersion?.label ?? null,
            acceptedAt: node.acceptedAt,
            acceptedBy: node.acceptedBy,
            kpi: {
                baselineSum, currentSum, forecastSum, deltaSum, deltaPct,
                coveragePriced: pricedCount, coverageTotal: liveCount,
                deviations: {
                    cenowe: countDev('CENOWE'),
                    ilosciowe: countDev('ILOSCIOWE'),
                    zakresPlus: countDev('ZAKRES_PLUS'),
                    zakresMinus: countDev('ZAKRES_MINUS'),
                    kursowe: countDev('KURSOWE'),
                },
            },
            rows,
        };
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
