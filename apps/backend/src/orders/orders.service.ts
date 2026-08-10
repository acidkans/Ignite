import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '../audit/audit.types';
import { resolveVersionId } from '../common/version.util';

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

    // @anchor orders-accept-preview — dane do modala potwierdzenia: pełny koszt całościowy
    // z oferty (Σ unitCost×quantity po całym drzewie WBS wersji, formuła IDENTYCZNA z
    // BudgetTable.calcDerived — akceptacja blokuje CAŁY projekt, nie tylko wycenione materiały)
    // + osobno licznik wycenionych wymagań materiałowych (pricedCount, informacyjnie).
    async acceptPreview(nodeId: string, versionId: string) {
        const version = await this.prisma.projectVersion.findUnique({ where: { id: versionId } });
        if (!version || version.nodeId !== nodeId) throw new BadRequestException('Wersja nie należy do tego węzła');

        const wbsLeaves = await this.prisma.wbsNode.findMany({
            where: { nodeId, versionId, type: { not: 'group' } },
            select: { unitCost: true, quantity: true },
        });
        const budgetSum = wbsLeaves.reduce(
            (s, n) => s + Math.max(0, n.unitCost ?? 0) * Math.max(0, n.quantity ?? 0), 0,
        );

        const reqs = await this.prisma.materialRequirement.findMany({
            where: { nodeId, versionId },
            select: { budgetedPriceNetto: true },
        });
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
    // zaakceptowanej wersji po korzeniu klonu (sourceRequirementId ?? id).
    // „Żywe" = wiersze AKTYWNEJ wersji (tam trafiają edycje), nie versionId=null —
    // baseline null to legacy sprzed wersjonowania i zawiera nieaktualny zakres.
    // Jeden endpoint — wiele widoków (panel w Logistyce, panel per zamówienie,
    // chip w sekcji Materiały): te same liczby na różnych poziomach agregacji.
    // Obie strony to split Wycena↔Zakup z `ProductProposal`, nie to samo pole:
    // WYCENA = propozycja `isOffer` klonu baseline (fallback `budgetedPriceNetto`),
    // ZAKUP = propozycja `isPurchase` żywego wiersza (bez fallbacku — brak produktu
    // zakupowego znaczy „jeszcze nie zakupiony", a nie „tyle samo co w wycenie").
    // Dostawca jest atrybutem propozycji, więc każda strona ma własnego.
    // Odchylenia per wiersz: CENOWE / ILOSCIOWE / ZAKRES_PLUS / ZAKRES_MINUS.
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

        const liveVersionId = await resolveVersionId(this.prisma, nodeId);
        const findLive = (versionId: string | null) => this.prisma.materialRequirement.findMany({
            where: { nodeId, versionId },
            select: { id: true, name: true, unit: true, quantity: true, budgetedPriceNetto: true, budgetSource: true, offerPositionSnapshot: true, sourceRequirementId: true },
            orderBy: { createdAt: 'asc' },
        });

        const [baselineRows, liveVersionRows, baselineQqItems] = await Promise.all([
            this.prisma.materialRequirement.findMany({
                where: { nodeId, versionId: node.acceptedVersionId },
                select: { id: true, name: true, unit: true, quantity: true, budgetedPriceNetto: true, sourceRequirementId: true },
                orderBy: { createdAt: 'asc' },
            }),
            findLive(liveVersionId),
            // Pozycje wyceny BASELINE (kolumny dostawcy QQ) — klucz: id żywego wymagania
            this.prisma.quickQuoteItem.findMany({
                where: { quickQuote: { nodeId, status: 'BASELINE' }, materialRequirementId: { not: null } },
                select: {
                    materialRequirementId: true, priceNettoPln: true, priceOriginalNetto: true,
                    currency: true, exchangeRate: true, source: true,
                    supplier: { select: { id: true, name: true } },
                },
            }),
        ]);

        // Aktywna wersja bez własnych wierszy → dane wciąż leżą na baseline (null).
        const liveRows = liveVersionRows.length > 0 || liveVersionId == null
            ? liveVersionRows
            : await findLive(null);

        // Korzeń klonu — wspólny identyfikator wiersza w całym łańcuchu wersji.
        const rootOf = (r: { id: string; sourceRequirementId: string | null }) => r.sourceRequirementId ?? r.id;
        const byLiveRoot = new Map(liveRows.map((r) => [rootOf(r), r]));
        const qqByLiveId = new Map(baselineQqItems.map((i) => [i.materialRequirementId as string, i]));
        const pairedLiveIds = new Set<string>();
        const rows: any[] = [];

        // Propozycje obu ról splitu: `isOffer` po stronie baseline, `isPurchase` po
        // stronie żywej. Serwis pilnuje max jednej z każdej roli na wymaganie.
        const splitProposals = await this.prisma.productProposal.findMany({
            where: {
                materialRequirementId: { in: [...baselineRows.map((r) => r.id), ...liveRows.map((r) => r.id)] },
                OR: [{ isOffer: true }, { isPurchase: true }],
            },
            select: {
                materialRequirementId: true, isOffer: true, isPurchase: true,
                priceNetto: true, purchasePriceNetto: true,
                productName: true, manufacturer: true, model: true,
                supplier: { select: { name: true } },
            },
        });
        const offerByReq = new Map<string, (typeof splitProposals)[number]>();
        const purchaseByReq = new Map<string, (typeof splitProposals)[number]>();
        for (const p of splitProposals) {
            if (p.isOffer && !offerByReq.has(p.materialRequirementId)) offerByReq.set(p.materialRequirementId, p);
            if (p.isPurchase && !purchaseByReq.has(p.materialRequirementId)) purchaseByReq.set(p.materialRequirementId, p);
        }
        const productLabel = (p?: { manufacturer: string; model: string | null; productName: string }) =>
            p ? [p.manufacturer, p.model, p.productName].map((x) => (x || '').trim()).filter(Boolean).join(' ') || null : null;
        const r2 = (x: number) => Math.round(x * 100) / 100;

        // @anchor comparison-build-offer — strona WYCENA: cena z propozycji `isOffer`,
        // fallback na `budgetedPriceNetto` wymagania (cena wpisana wprost w tabeli
        // Materials nie tworzy propozycji — patrz `product-side-card-offer-price-fallback`).
        const buildOffer = (b: (typeof baselineRows)[number]) => {
            const p = offerByReq.get(b.id);
            const price = p?.priceNetto ?? b.budgetedPriceNetto ?? null;
            return {
                qty: b.quantity,
                price,
                value: price != null ? r2(b.quantity * price) : null,
                supplier: p?.supplier?.name ?? null,
                product: productLabel(p),
            };
        };

        // @anchor comparison-build-purchase — strona ZAKUP: wyłącznie propozycja
        // `isPurchase`; gdy ta sama propozycja pełni obie role, cena zakupu siedzi
        // w `purchasePriceNetto`. Brak propozycji lub ceny → null = „jeszcze nie
        // zakupiony". Fallbacku na cenę wyceny NIE ma — inaczej obie kolumny
        // pokazywałyby to samo i Δ zawsze wychodziłaby zero.
        const buildPurchase = (live: (typeof liveRows)[number]) => {
            const p = purchaseByReq.get(live.id);
            if (!p) return null;
            const price = p.isOffer ? p.purchasePriceNetto : p.priceNetto;
            if (price == null) return null;
            return {
                qty: live.quantity,
                price,
                value: r2(live.quantity * price),
                supplier: p.supplier?.name ?? null,
                product: productLabel(p),
            };
        };

        // Wiersze sparowane. Baseline bez żywego odpowiednika (materiał usunięty
        // w kolejnym snapshocie po akceptacji) — pomijamy całkowicie, nie liczy
        // się już do porównania (nie jest częścią aktualnego zakresu zamówienia).
        for (const b of baselineRows) {
            const live = byLiveRoot.get(rootOf(b));
            if (!live) continue;
            pairedLiveIds.add(live.id);
            const baseline = buildOffer(b);
            const current = buildPurchase(live);
            const qq = qqByLiveId.get(live.id) ?? qqByLiveId.get(rootOf(live)) ?? null;
            const deviations: string[] = [];
            if (live.quantity !== b.quantity) deviations.push('ILOSCIOWE');
            // CENOWE tylko gdy OBIE strony mają cenę — pozycja bez ceny wyceny to
            // dziura w ofercie, nie odchylenie cenowe zakupu.
            if (current && baseline.price != null && current.price !== baseline.price) deviations.push('CENOWE');
            const delta = current?.value != null && baseline.value != null
                ? r2(current.value - baseline.value)
                : null;
            rows.push({
                key: b.id, liveId: live.id, name: live.name ?? b.name, unit: live.unit ?? b.unit,
                baseline, current,
                qqSupplier: qq ? { name: qq.supplier?.name ?? null, priceNettoPln: qq.priceNettoPln, source: qq.source } : null,
                deviations, delta,
            });
        }

        // Zakres+ (żywe wymagania spoza baseline)
        for (const live of liveRows) {
            if (pairedLiveIds.has(live.id)) continue;
            const current = buildPurchase(live);
            const qq = qqByLiveId.get(live.id) ?? qqByLiveId.get(rootOf(live)) ?? null;
            rows.push({
                key: live.id, liveId: live.id, name: live.name, unit: live.unit,
                baseline: null, current,
                qqSupplier: qq ? { name: qq.supplier?.name ?? null, priceNettoPln: qq.priceNettoPln, source: qq.source } : null,
                deviations: ['ZAKRES_PLUS'], delta: current?.value ?? null,
            });
        }

        // KPI. Wycena = tylko materiały nadal obecne w żywych danych (sparowane).
        // Zakup = wyłącznie pozycje z realnym produktem `isPurchase` — pozycje bez
        // zakupu NIE są prognozowane ceną wyceny, tylko wypadają z sumy (inaczej
        // Δ udawałaby zero na czymś, czego jeszcze nie kupiono).
        // Δ = suma kolumny Δ, czyli wyłącznie wiersze z OBIEMA wartościami; Δ%
        // wobec wyceny tych samych wierszy — inaczej porównywałaby ułamek zakupów
        // do pełnego budżetu oferty albo doliczała zakup bez ceny ofertowej.
        const purchased = rows.filter((r) => r.current?.value != null);
        const comparable = purchased.filter((r) => r.baseline?.value != null);
        const baselineSum = r2(rows.reduce((s, r) => {
            if (r.deviations.includes('ZAKRES_MINUS')) return s;
            return s + (r.baseline?.value ?? 0);
        }, 0));
        const currentSum = r2(purchased.reduce((s, r) => s + r.current.value, 0));
        const purchasedOfferSum = r2(comparable.reduce((s, r) => s + r.baseline.value, 0));
        const liveCount = liveRows.length;
        const pricedCount = purchased.length;
        const deltaSum = r2(comparable.reduce((s, r) => s + (r.delta ?? 0), 0));
        const deltaPct = purchasedOfferSum > 0 ? r2((deltaSum / purchasedOfferSum) * 100) : null;
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
                baselineSum, currentSum, purchasedOfferSum, deltaSum, deltaPct,
                coveragePriced: pricedCount, coverageTotal: liveCount,
                deviations: {
                    cenowe: countDev('CENOWE'),
                    ilosciowe: countDev('ILOSCIOWE'),
                    zakresPlus: countDev('ZAKRES_PLUS'),
                    zakresMinus: countDev('ZAKRES_MINUS'),
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
