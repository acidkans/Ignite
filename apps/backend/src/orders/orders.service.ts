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

    // @anchor orders-comparison — serce F5: parowanie LIŚCI WBS zaakceptowanej wersji
    // z liśćmi wersji aktywnej po korzeniu klonu (`sourceWbsNodeId ?? id`).
    // Jednostką porównania jest liść, nie wymaganie materiałowe — praca i usługi nie
    // mają karty produktowej, a mają być rozliczane tak samo jak materiał.
    // „Żywe" = liście AKTYWNEJ wersji (tam trafiają edycje), nie versionId=null —
    // baseline null to legacy sprzed wersjonowania i zawiera nieaktualny zakres.
    // Jeden endpoint — wiele widoków (panel w Logistyce, panel per zamówienie,
    // chip w sekcji Materiały): te same liczby na różnych poziomach agregacji.
    //
    // WYCENA = plan zaakceptowanego snapshotu: dla materiału cena propozycji `isOffer`
    // (fallback `budgetedPriceNetto` karty), dla pracy i usługi `WbsNode.unitCost`.
    // ZAKUP = suma wpisów realizacji (`LeafActual`) żywego liścia; brak wpisów znaczy
    // „jeszcze nie kupione / nie zrobione", a nie „tyle samo co w wycenie". Pozycje
    // materiałowe sprzed wpisów realizacji dostają fallback na propozycję `isPurchase`
    // (źródło `PROPOSAL`), żeby stare zamówienia nie wyzerowały się po wdrożeniu.
    // Odchylenia per wiersz: CENOWE / ILOSCIOWE / NADMIAR / ZAKRES_PLUS.
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
        const leafSelect = {
            id: true, parentId: true, name: true, type: true, unit: true,
            quantity: true, unitCost: true, sortOrder: true,
            sourceWbsNodeId: true, realizationClosed: true,
        };
        const findLeaves = (versionId: string | null) => this.prisma.wbsNode.findMany({
            where: { nodeId, versionId },
            select: leafSelect,
            orderBy: { sortOrder: 'asc' },
        });

        const [baselineAll, liveVersionAll, actuals] = await Promise.all([
            findLeaves(node.acceptedVersionId),
            findLeaves(liveVersionId),
            this.prisma.leafActual.findMany({
                where: { nodeId },
                orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
                select: {
                    id: true, wbsRootId: true, entryDate: true, qty: true, unitCost: true,
                    comment: true, docNumber: true,
                    supplier: { select: { name: true } },
                },
            }),
        ]);

        // Aktywna wersja bez własnych węzłów → drzewo wciąż leży na legacy (null).
        const liveAll = liveVersionAll.length > 0 || liveVersionId == null
            ? liveVersionAll
            : await findLeaves(null);

        // Pozycja = każdy węzeł kosztowy poza `group` i poza korzeniem (przedmiotem
        // projektu) — DOKŁADNIE ta sama reguła co suma budżetu w `acceptPreview`
        // i w trybach Budżetu, więc obie strony porównania sumują ten sam zakres.
        // Świadomie NIE „węzeł bez dzieci": w tym drzewie węzeł z dzieckiem bywa
        // osobną pozycją z własną ceną (kamera z doczepioną licencją), a filtr po
        // bezdzietności gubił jej zakup.
        const onlyPositions = (rows: typeof baselineAll) =>
            rows.filter((r) => r.parentId != null && String(r.type || '').toLowerCase() !== 'group');
        const baselineLeaves = onlyPositions(baselineAll);
        const liveLeaves = onlyPositions(liveAll);

        // Karty materiałowe obu stron (1:1 po wbsNodeId) — nośnik ceny ofertowej
        // materiału i punkt zaczepienia propozycji produktowych.
        const allLeafIds = [...baselineLeaves.map((l) => l.id), ...liveLeaves.map((l) => l.id)];
        const cards = allLeafIds.length ? await this.prisma.materialRequirement.findMany({
            where: { wbsNodeId: { in: allLeafIds } },
            select: { id: true, wbsNodeId: true, budgetedPriceNetto: true, unit: true },
        }) : [];
        const cardByLeaf = new Map(cards.map((c) => [c.wbsNodeId as string, c]));

        const splitProposals = cards.length ? await this.prisma.productProposal.findMany({
            where: {
                materialRequirementId: { in: cards.map((c) => c.id) },
                OR: [{ isOffer: true }, { isPurchase: true }],
            },
            select: {
                materialRequirementId: true, isOffer: true, isPurchase: true,
                priceNetto: true, purchasePriceNetto: true,
                productName: true, manufacturer: true, model: true,
                supplier: { select: { name: true } },
            },
        }) : [];
        const offerByCard = new Map<string, (typeof splitProposals)[number]>();
        const purchaseByCard = new Map<string, (typeof splitProposals)[number]>();
        for (const p of splitProposals) {
            if (p.isOffer && !offerByCard.has(p.materialRequirementId)) offerByCard.set(p.materialRequirementId, p);
            if (p.isPurchase && !purchaseByCard.has(p.materialRequirementId)) purchaseByCard.set(p.materialRequirementId, p);
        }

        // Pozycje wyceny BASELINE (kolumna dostawcy QQ) — klucz: id karty żywego liścia.
        const baselineQqItems = await this.prisma.quickQuoteItem.findMany({
            where: { quickQuote: { nodeId, status: 'BASELINE' }, materialRequirementId: { not: null } },
            select: {
                materialRequirementId: true, priceNettoPln: true, source: true,
                supplier: { select: { id: true, name: true } },
            },
        });
        const qqByCard = new Map(baselineQqItems.map((i) => [i.materialRequirementId as string, i]));

        // Wpisy realizacji wiszą na korzeniu klonu, nie na id wiersza — jedno miejsce
        // dla wszystkich wersji tego samego liścia.
        const actualsByRoot = new Map<string, typeof actuals>();
        for (const a of actuals) {
            if (!actualsByRoot.has(a.wbsRootId)) actualsByRoot.set(a.wbsRootId, []);
            actualsByRoot.get(a.wbsRootId)!.push(a);
        }

        const rootOf = (l: { id: string; sourceWbsNodeId: string | null }) => l.sourceWbsNodeId ?? l.id;
        const norm = (s: string | null) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const byLiveRoot = new Map(liveLeaves.map((l) => [rootOf(l), l]));
        // Fallback dla wersji sprzed `sourceWbsNodeId`: jednoznaczne dopasowanie po nazwie.
        const liveByName = new Map<string, typeof liveLeaves[number] | null>();
        for (const l of liveLeaves) {
            const k = norm(l.name);
            liveByName.set(k, liveByName.has(k) ? null : l);
        }

        const r2 = (x: number) => Math.round(x * 100) / 100;
        const productLabel = (p?: { manufacturer: string; model: string | null; productName: string }) =>
            p ? [p.manufacturer, p.model, p.productName].map((x) => (x || '').trim()).filter(Boolean).join(' ') || null : null;

        // @anchor comparison-build-offer — strona WYCENA liścia baseline: cena produktu
        // `isOffer`, potem cena karty materiałowej, na końcu `unitCost` samego liścia
        // (jedyne źródło dla pracy i usług).
        const buildOffer = (leaf: (typeof baselineLeaves)[number]) => {
            const card = cardByLeaf.get(leaf.id);
            const p = card ? offerByCard.get(card.id) : null;
            const price = p?.priceNetto ?? card?.budgetedPriceNetto ?? (leaf.unitCost || null);
            return {
                qty: leaf.quantity,
                price,
                value: price != null ? r2(leaf.quantity * price) : null,
                supplier: p?.supplier?.name ?? null,
                product: productLabel(p),
            };
        };

        // @anchor comparison-build-purchase — strona ZAKUP żywego liścia: suma wpisów
        // realizacji. Cena to średnia ważona wpisów, bo każdy może mieć własną.
        // Bez wpisów: fallback na propozycję `isPurchase` (materiał sprzed wdrożenia),
        // a gdy i jej nie ma — null, czyli wprost „jeszcze nie kupione / nie zrobione”.
        // Pozycja zamknięta dostaje stronę zakupu ZAWSZE, choćby zerową — rozliczenie
        // jest świadomą decyzją i różnica ma się policzyć jako oszczędność.
        const buildPurchase = (leaf: (typeof liveLeaves)[number]) => {
            const entries = actualsByRoot.get(rootOf(leaf)) ?? [];
            if (entries.length) {
                const qty = r2(entries.reduce((s, e) => s + e.qty, 0));
                const value = r2(entries.reduce((s, e) => s + e.qty * e.unitCost, 0));
                const last = entries[entries.length - 1];
                return {
                    qty,
                    price: qty > 0 ? r2(value / qty) : null,
                    value,
                    supplier: last.supplier?.name ?? null,
                    product: null as string | null,
                    source: 'ENTRIES' as const,
                };
            }
            const card = cardByLeaf.get(leaf.id);
            const p = card ? purchaseByCard.get(card.id) : null;
            const legacyPrice = p ? (p.isOffer ? p.purchasePriceNetto : p.priceNetto) : null;
            if (p && legacyPrice != null) {
                return {
                    qty: leaf.quantity,
                    price: legacyPrice,
                    value: r2(leaf.quantity * legacyPrice),
                    supplier: p.supplier?.name ?? null,
                    product: productLabel(p),
                    source: 'PROPOSAL' as const,
                };
            }
            if (leaf.realizationClosed) {
                return { qty: 0, price: null, value: 0, supplier: null, product: null, source: 'CLOSED' as const };
            }
            return null;
        };

        const entryDto = (e: (typeof actuals)[number]) => ({
            id: e.id, entryDate: e.entryDate, qty: e.qty, unitCost: e.unitCost,
            comment: e.comment, docNumber: e.docNumber, supplier: e.supplier?.name ?? null,
        });

        const pairedLiveIds = new Set<string>();
        const rows: any[] = [];

        // Wiersze sparowane. Liść baseline bez żywego odpowiednika (usunięty w kolejnym
        // snapshocie po akceptacji) wypada z porównania — nie jest już częścią zakresu.
        for (const b of baselineLeaves) {
            const live = byLiveRoot.get(rootOf(b)) ?? liveByName.get(norm(b.name)) ?? null;
            if (!live) continue;
            pairedLiveIds.add(live.id);
            const baseline = buildOffer(b);
            const current = buildPurchase(live);
            const liveCard = cardByLeaf.get(live.id);
            const qq = liveCard ? qqByCard.get(liveCard.id) ?? null : null;

            const deviations: string[] = [];
            if (live.quantity !== b.quantity) deviations.push('ILOSCIOWE');
            // CENOWE tylko gdy OBIE strony mają cenę — pozycja bez ceny wyceny to
            // dziura w ofercie, nie odchylenie cenowe zakupu.
            if (current?.price != null && baseline.price != null && current.price !== baseline.price) deviations.push('CENOWE');
            if (current != null && current.qty > b.quantity + 1e-9) deviations.push('NADMIAR');

            const delta = current?.value != null && baseline.value != null
                ? r2(current.value - baseline.value)
                : null;

            rows.push({
                key: b.id,
                wbsNodeId: live.id,
                baselineWbsNodeId: b.id,
                // id żywej karty materiałowej — tryb Wykonanie w BudgetModesPanel czyta
                // po nim cenę i badge źródła; dla pracy i usług zostaje null
                liveId: liveCard?.id ?? null,
                name: live.name ?? b.name,
                unit: live.unit ?? b.unit,
                type: live.type || b.type || '',
                closed: live.realizationClosed,
                baseline, current,
                entries: (actualsByRoot.get(rootOf(live)) ?? []).map(entryDto),
                qqSupplier: qq ? { name: qq.supplier?.name ?? null, priceNettoPln: qq.priceNettoPln, source: qq.source } : null,
                deviations, delta,
            });
        }

        // Zakres+ (żywe liście spoza baseline)
        for (const live of liveLeaves) {
            if (pairedLiveIds.has(live.id)) continue;
            const current = buildPurchase(live);
            const liveCard = cardByLeaf.get(live.id);
            const qq = liveCard ? qqByCard.get(liveCard.id) ?? null : null;
            rows.push({
                key: live.id,
                wbsNodeId: live.id,
                baselineWbsNodeId: null,
                liveId: liveCard?.id ?? null,
                name: live.name,
                unit: live.unit,
                type: live.type || '',
                closed: live.realizationClosed,
                baseline: null,
                current,
                entries: (actualsByRoot.get(rootOf(live)) ?? []).map(entryDto),
                qqSupplier: qq ? { name: qq.supplier?.name ?? null, priceNettoPln: qq.priceNettoPln, source: qq.source } : null,
                deviations: ['ZAKRES_PLUS'], delta: current?.value ?? null,
            });
        }

        // KPI. Wycena = liście nadal obecne w żywym zakresie (sparowane).
        // Zakup = wyłącznie pozycje z realizacją (wpisy, legacy propozycja albo
        // świadome zamknięcie) — reszta wypada z sumy, inaczej Δ udawałaby zero
        // na czymś, czego jeszcze nie kupiono. Δ = suma kolumny Δ, czyli wyłącznie
        // wiersze z OBIEMA wartościami; Δ% wobec wyceny tych samych wierszy.
        const purchased = rows.filter((r) => r.current?.value != null);
        const comparable = purchased.filter((r) => r.baseline?.value != null);
        const baselineSum = r2(rows.reduce((s, r) => s + (r.baseline?.value ?? 0), 0));
        const currentSum = r2(purchased.reduce((s, r) => s + r.current.value, 0));
        const purchasedOfferSum = r2(comparable.reduce((s, r) => s + r.baseline.value, 0));
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
                // pokrycie liczy pozycje domknięte realizacją — wpisy, legacy zakup
                // albo ręczne zamknięcie; mianownik to cały żywy zakres.
                coveragePriced: purchased.length,
                coverageTotal: liveLeaves.length,
                deviations: {
                    cenowe: countDev('CENOWE'),
                    ilosciowe: countDev('ILOSCIOWE'),
                    nadmiar: countDev('NADMIAR'),
                    zakresPlus: countDev('ZAKRES_PLUS'),
                    zakresMinus: 0,
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
