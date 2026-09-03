import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '../audit/audit.types';
import { resolveVersionId } from '../common/version.util';
import { isManagerRoles, isOpenLeafType } from '../common/leaf-types.util';
import { isRejectedPlan, planStatusFromAny, rejectedNodeIds } from '../common/plan-status.util';
import { VersioningService } from '../ai/versioning.service';

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
        private versioning: VersioningService,
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
    //
    // Pozycje ODRZUCONE (`planStatusFromAny` = REJECTED) wypadają z sumy i wracają osobno
    // (`rejectedCount`, `rejectedSum`): modal ma pokazać kwotę TEGO, co wchodzi do baseline,
    // a nie całej wersji. Dawniej trzeba było skopiować snapshot i wykasować z niego odrzucone
    // liście, żeby kciuk zamroził właściwy zakres — statusy załatwiają to bez kasowania.
    async acceptPreview(nodeId: string, versionId: string) {
        const version = await this.prisma.projectVersion.findUnique({ where: { id: versionId } });
        if (!version || version.nodeId !== nodeId) throw new BadRequestException('Wersja nie należy do tego węzła');

        // Czytamy WSZYSTKIE węzły wersji, także gałęzie grupujące: bez nich `rejectedNodeIds`
        // nie doszłoby po łańcuchu do poddrzewa odrzuconej pozycji.
        const allNodes = await this.prisma.wbsNode.findMany({
            where: { nodeId, versionId },
            select: { id: true, parentId: true, type: true, status: true, unitCost: true, quantity: true },
        });
        const rejectedIds = rejectedNodeIds(allNodes);
        const wbsLeaves = allNodes.filter((n) => String(n.type || '').toLowerCase() !== 'group');
        const value = (n: { unitCost: number | null; quantity: number | null }) =>
            Math.max(0, n.unitCost ?? 0) * Math.max(0, n.quantity ?? 0);
        const rejectedLeaves = wbsLeaves.filter((n) => rejectedIds.has(n.id));
        const budgetSum = wbsLeaves.filter((n) => !rejectedIds.has(n.id)).reduce((s, n) => s + value(n), 0);
        const rejectedSum = Math.round(rejectedLeaves.reduce((s, n) => s + value(n), 0) * 100) / 100;
        // Ile pozycji kciuk przestawi na „Zaakceptowane" — ten sam zakres wierszy co masowy
        // zapis w `accept` (pozycje wersji poza korzeniem i poza gałęzią porządkową).
        const toConfirmCount = wbsLeaves.filter(
            (n) => n.parentId != null && planStatusFromAny(n.status) !== 'CONFIRMED' && !rejectedIds.has(n.id),
        ).length;

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
            rejectedCount: rejectedLeaves.length,
            rejectedSum,
            toConfirmCount,
            // Nazwa kopii, którą kciuk zamrozi — modal ma powiedzieć wprost, co powstanie,
            // zanim manager kliknie. Liczona tą samą funkcją, która jej potem użyje.
            snapshotLabel: await this.snapshotLabelFor(nodeId, version.label),
            lockedQuickQuotes,
        };
    }

    // @anchor orders-accept — kciuk managera: JEDNA transakcja — pointer
    // acceptedVersionId + acceptedAt/By + orderStage=ZAAKCEPTOWANE + wskazana
    // QuickQuote→BASELINE + masowe domknięcie statusów planu + wpis AuditLog.
    // Kciuk NIE zmienia wersji aktywnej.
    //
    // Kciuk = AKCEPTACJA CAŁEJ WYCENY: każda pozycja wersji, której klient nie odrzucił,
    // przechodzi na `CONFIRMED`. Bez tego zaakceptowana oferta zostawiała pozycje na „Nowe"
    // i „Zaproponowane", a `axisGateOf` trzymał obie osie realizacji za bramką „Czeka na
    // akceptację" — trzeba było przeklikać status pozycja po pozycji.
    //
    // BASELINE TO KOPIA, nie akceptowana wersja: kciuk zamraża `„<etykieta wersji> zaakceptowany"`
    // — pełny klon, z którego WYKASOWANE są pozycje odrzucone razem z poddrzewami. Zamrożony
    // snapshot ma zawierać wyłącznie to, co klient kupił, i to bez polegania na filtrze
    // przy odczycie: eksport, porównanie i każde następne narzędzie czytające baseline widzą
    // czysty zakres. Ręczne kopiowanie wersji i kasowanie z niej odrzuconych gałęzi przed
    // kciukiem — dotychczasowa procedura — robi się teraz samo, w tej samej transakcji.
    // Wersja akceptowana ZOSTAJE nietknięta (razem z odrzuconymi pozycjami): to historia
    // tego, co poszło do klienta.
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

        // Wersja AKTYWNA — czytamy poza transakcją, bo to zwykły odczyt wskaźnika. Baseline
        // bywa inną wersją niż aktywna (ACTIVE ≠ BASELINE), a realizację prowadzi się na
        // wierszach ŻYWYCH: to ICH status otwiera osie zakupu i wykonania, więc domknięcie
        // decyzji musi dosięgnąć obu stron.
        const liveVersionId = await resolveVersionId(this.prisma, nodeId);

        const snapshotLabel = await this.snapshotLabelFor(nodeId, version.label);

        const userId = this.cls.get('user.id') ?? null;
        // Timeout podniesiony ponad domyślne 5 s Prisma: w jednej transakcji siedzi pełny klon
        // wersji (WBS, karty materiałowe, propozycje, wymagania zamówienia) plus przycięcie
        // i statusy. Rozbicie na dwie transakcje zostawiałoby przy błędzie albo kopię bez
        // wskaźnika baseline, albo wskaźnik na niedokończoną kopię.
        return this.prisma.$transaction(async (tx) => {
            // 1. Zamrożona KOPIA akceptowanej wersji — nieaktywna, więc praca dalej idzie
            //    na wersji, która była aktywna przed kciukiem.
            const snapshot = await this.versioning.createFrozenCopy(tx, nodeId, versionId, snapshotLabel);

            // 2. Przycięcie kopii: kasujemy pozycje ODRZUCONE. Kasujemy tylko korzenie —
            //    `WbsNode.parent` ma `onDelete: Cascade`, więc podpozycje i karty materiałowe
            //    (`MaterialRequirement.wbsNode`, też Cascade) lecą razem z rodzicem. To jest
            //    moment, w którym snapshot przestaje zawierać cokolwiek odrzuconego.
            const snapshotRows = await tx.wbsNode.findMany({
                where: { nodeId, versionId: snapshot.id },
                select: { id: true, parentId: true, type: true, status: true },
            });
            const removedIds = rejectedNodeIds(snapshotRows);
            const rejectedRoots = snapshotRows.filter((r) => isRejectedPlan(r.status)).map((r) => r.id);
            if (rejectedRoots.length) {
                await tx.wbsNode.deleteMany({ where: { id: { in: rejectedRoots } } });
            }

            // 3. Wszystko, co w kopii zostało, jest z definicji zaakceptowane.
            const snapshotPositionIds = snapshotRows
                .filter((r) => !removedIds.has(r.id) && r.parentId != null && String(r.type || '').toLowerCase() !== 'group')
                .map((r) => r.id);
            if (snapshotPositionIds.length) {
                await tx.wbsNode.updateMany({
                    where: { id: { in: snapshotPositionIds } }, data: { status: 'CONFIRMED' },
                });
            }

            const updated = await tx.processNode.update({
                where: { id: nodeId },
                data: {
                    acceptedVersionId: snapshot.id,
                    acceptedAt: new Date(),
                    acceptedBy: userEmail ?? null,
                    orderStage: 'ZAAKCEPTOWANE',
                },
                select: { id: true, orderStage: true, acceptedVersionId: true, acceptedAt: true, acceptedBy: true },
            });
            if (quickQuoteId) {
                await tx.quickQuote.update({ where: { id: quickQuoteId }, data: { status: 'BASELINE' } });
            }

            // Zakres wierszy IDENTYCZNY z `onlyPositions` w `comparison` i z licznikiem
            // w `acceptPreview`: pozycja to węzeł kosztowy poza korzeniem i poza gałęzią
            // porządkową. Gałąź statusu nie ma — jej plakietkę wylicza się z pozycji pod nią.
            const positionSelect = { id: true, parentId: true, type: true, status: true, sourceWbsNodeId: true } as const;
            const flipped: { id: string; from: string }[] = [];
            // Pozycja = ten sam filtr co `onlyPositions` w `comparison` i licznik w `acceptPreview`;
            // odrzucone (razem z poddrzewami) odpadają — kciuk ich nie dotyka.
            const positionsOf = <T extends { id: string; parentId: string | null; type: string | null; status: string | null }>(rows: T[]) => {
                const rejected = rejectedNodeIds(rows);
                return rows.filter((r) => r.parentId != null
                    && String(r.type || '').toLowerCase() !== 'group'
                    && !rejected.has(r.id));
            };
            const needsConfirm = (row: { status: string | null }) => planStatusFromAny(row.status) !== 'CONFIRMED';

            const baselineAll = await tx.wbsNode.findMany({ where: { nodeId, versionId }, select: positionSelect });
            const baselinePositions = positionsOf(baselineAll);
            for (const p of baselinePositions.filter(needsConfirm)) {
                flipped.push({ id: p.id, from: planStatusFromAny(p.status) });
            }

            // Parowanie z wersją żywą po korzeniu klonu (`sourceWbsNodeId ?? id`) — tak samo
            // jak w `comparison`. Pozycja dopisana do wersji żywej PO snapshocie zostaje bez
            // zmian: akceptacja starszego snapshotu nie obejmuje zakresu, którego on nie zna.
            if (liveVersionId !== versionId) {
                const roots = new Set(baselinePositions.map((p) => p.sourceWbsNodeId ?? p.id));
                const liveAll = await tx.wbsNode.findMany({
                    where: { nodeId, versionId: liveVersionId }, select: positionSelect,
                });
                for (const l of positionsOf(liveAll)) {
                    if (!roots.has(l.sourceWbsNodeId ?? l.id) || !needsConfirm(l)) continue;
                    flipped.push({ id: l.id, from: planStatusFromAny(l.status) });
                }
            }

            if (flipped.length) {
                await tx.wbsNode.updateMany({
                    where: { id: { in: flipped.map((f) => f.id) } },
                    data: { status: 'CONFIRMED' },
                });
            }

            await tx.auditLog.create({
                data: {
                    action: AuditAction.ACCEPT,
                    entity: 'ProcessNode',
                    entityId: nodeId,
                    diff: {
                        // `versionId` to wersja AKCEPTOWANA (ta, którą wskazał manager),
                        // `snapshotVersionId` to zamrożona kopia, na którą patrzy baseline.
                        // Cofnięcie akceptacji szuka po `versionId`, więc kolejność pól nie
                        // jest kosmetyczna — patrz `statusesToRestore`.
                        versionId, versionLabel: version.label, quickQuoteId: quickQuoteId ?? null,
                        snapshotVersionId: snapshot.id, snapshotLabel,
                        removedRejected: removedIds.size,
                        // Zapisujemy LISTĘ przestawionych pozycji z ich poprzednim statusem, nie
                        // sam licznik: cofnięcie akceptacji przywraca dokładnie te wiersze i te
                        // wartości. Reguła („wszystko na NEW") zrównałaby „Nowe" z „Zaproponowane"
                        // i skasowała wiedzę o tym, co poszło do klienta.
                        confirmed: flipped,
                    },
                    userId,
                },
            });
            this.logger.log(
                `Zaakceptowano wersję ${version.label} (${versionId}) dla węzła ${nodeId} przez ${userEmail}`
                + ` — snapshot „${snapshotLabel}" (${snapshot.id}), wycięto ${removedIds.size} odrzuconych,`
                + ` ${flipped.length} pozycji na CONFIRMED`,
            );
            return {
                ...updated,
                confirmedCount: flipped.length,
                snapshotLabel,
                removedRejected: removedIds.size,
            };
        }, { timeout: 120_000, maxWait: 20_000 });
    }

    // @anchor orders-snapshot-label — etykieta zamrożonej kopii: etykieta akceptowanej wersji
    // + „ zaakceptowany". Kolizję rozbijamy licznikiem, a nie nadpisaniem: po cofnięciu
    // akceptacji poprzednia kopia ZOSTAJE w liście wersji (jest zapisem tego, co raz już
    // zaakceptowano), więc druga akceptacja tej samej wersji musi dostać własną nazwę.
    private async snapshotLabelFor(nodeId: string, sourceLabel: string) {
        const base = `${String(sourceLabel || 'wersja').trim()} zaakceptowany`;
        const taken = new Set(
            (await this.prisma.projectVersion.findMany({ where: { nodeId }, select: { label: true } }))
                .map((v) => v.label),
        );
        if (!taken.has(base)) return base;
        for (let i = 2; i < 100; i++) {
            const candidate = `${base} (${i})`;
            if (!taken.has(candidate)) return candidate;
        }
        return `${base} (${Date.now()})`;
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
            id: true, parentId: true, name: true, type: true, unit: true, status: true,
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
                    comment: true, docNumber: true, manufacturer: true, model: true,
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
        // Pozycja ODRZUCONA nie jest zakresem po ŻADNEJ ze stron: w baseline nie ma jej czego
        // rozliczać, a w wersji żywej nie jest „zakresem+" — nikt jej nie zamawiał. Filtr stoi
        // w jednym miejscu, więc wypada naraz z wierszy, z sum KPI i z mianownika pokrycia.
        const onlyPositions = (rows: typeof baselineAll) => {
            const rejected = rejectedNodeIds(rows);
            return rows.filter((r) => r.parentId != null
                && String(r.type || '').toLowerCase() !== 'group'
                && !rejected.has(r.id));
        };
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
                // Produkt strony ZAKUP bierzemy z ostatniego wpisu, który go ma —
                // kolejne dostawy bywają zamiennikami i liczy się to, co przyszło
                // ostatnio; pełną historię niesie lista `entries`.
                const withProduct = [...entries].reverse().find((e) => (e.manufacturer || e.model));
                return {
                    qty,
                    price: qty > 0 ? r2(value / qty) : null,
                    value,
                    supplier: last.supplier?.name ?? null,
                    product: withProduct
                        ? [withProduct.manufacturer, withProduct.model].map((x) => (x || '').trim()).filter(Boolean).join(' ') || null
                        : null,
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
            manufacturer: e.manufacturer, model: e.model,
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
        // @anchor comparison-role-filter — praca, usługa, nocleg i paliwo to koszty własne firmy:
        // poza managerem nikt ich nie ogląda. Filtr siedzi TU, a nie tylko w komponencie — to
        // odpowiedź endpointu wychodzi na zewnątrz, a zawężenie po stronie przeglądarki zdejmuje
        // się narzędziami deweloperskimi. Sumy i pokrycie liczą się już z tego, co zostało.
        const isManager = isManagerRoles(this.cls.get('user.roles'));
        const visibleRows = isManager ? rows : rows.filter((r) => isOpenLeafType(r.type));
        const visibleLive = isManager ? liveLeaves : liveLeaves.filter((l) => isOpenLeafType(l.type));

        const purchased = visibleRows.filter((r) => r.current?.value != null);
        const comparable = purchased.filter((r) => r.baseline?.value != null);
        const baselineSum = r2(visibleRows.reduce((s, r) => s + (r.baseline?.value ?? 0), 0));
        const currentSum = r2(purchased.reduce((s, r) => s + r.current.value, 0));
        const purchasedOfferSum = r2(comparable.reduce((s, r) => s + r.baseline.value, 0));
        const deltaSum = r2(comparable.reduce((s, r) => s + (r.delta ?? 0), 0));
        const deltaPct = purchasedOfferSum > 0 ? r2((deltaSum / purchasedOfferSum) * 100) : null;
        const countDev = (t: string) => visibleRows.filter((r) => r.deviations.includes(t)).length;

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
                coverageTotal: visibleLive.length,
                deviations: {
                    cenowe: countDev('CENOWE'),
                    ilosciowe: countDev('ILOSCIOWE'),
                    nadmiar: countDev('NADMIAR'),
                    zakresPlus: countDev('ZAKRES_PLUS'),
                    zakresMinus: 0,
                },
            },
            rows: visibleRows,
        };
    }

    // @anchor orders-revoke-accept — cofnięcie akceptacji: osobna głośna akcja
    // z obowiązkowym powodem (AuditLog), powrót orderStage=WYCENA,
    // BASELINE wycen węzła wraca do LOCKED. NIE jest to drugi klik w kciuk.
    //
    // Cofnięcie zdejmuje też masowe `CONFIRMED` z kciuka — tak samo jak cofnięcie zakupu
    // cofa oś wykonania: etap, który się nie wydarzył, nie może zostawiać po sobie otwartych
    // bramek realizacji. Zdejmujemy WYŁĄCZNIE to, co zapisał ten konkretny kciuk
    // (`AuditLog.diff.confirmed`), i tylko tam, gdzie nikt tego potem nie ruszył.
    async revokeAccept(nodeId: string, reason: string, userEmail?: string) {
        if (!reason?.trim()) throw new BadRequestException('Powód cofnięcia akceptacji jest wymagany');
        const node = await this.prisma.processNode.findUnique({
            where: { id: nodeId },
            select: { id: true, acceptedVersionId: true, acceptedBy: true, acceptedAt: true },
        });
        if (!node) throw new NotFoundException('Węzeł nie znaleziony');
        if (!node.acceptedVersionId) throw new BadRequestException('Zamówienie nie ma zaakceptowanej wersji');

        const restore = await this.statusesToRestore(nodeId, node.acceptedVersionId);

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
            // Przywracamy poprzedni status grupami (`NEW`, `PROPOSAL`) — dwa zapytania zamiast
            // jednego na pozycję.
            for (const [status, ids] of restore.byStatus) {
                await tx.wbsNode.updateMany({ where: { id: { in: ids } }, data: { status } });
            }
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
                        revertedCount: restore.revertedCount,
                        keptCount: restore.keptCount,
                    },
                    userId,
                },
            });
            this.logger.log(
                `Cofnięto akceptację węzła ${nodeId} przez ${userEmail}; powód: ${reason.trim()}`
                + ` — cofnięto ${restore.revertedCount} statusów, zostawiono ${restore.keptCount}`,
            );
            return { ...updated, revertedCount: restore.revertedCount, keptCount: restore.keptCount };
        });
    }

    // @anchor orders-statuses-to-restore — które pozycje cofnąć ze stanu `CONFIRMED` zapisanego
    // przez kciuk. Źródłem prawdy jest wpis `ACCEPT` w AuditLog tej właśnie wersji: bez niego
    // (akceptacja sprzed wdrożenia masowego domknięcia) nie ma czego cofać i nie zgadujemy.
    //
    // Pozycji NIE ruszamy, gdy:
    //   - ktoś zmienił jej status po akceptacji (dziś nie jest `CONFIRMED`) — nowsza decyzja
    //     człowieka jest ważniejsza niż odtworzenie stanu sprzed kciuka,
    //   - ruszyła już realizacja (`purchaseStatus` albo `execStatus`) — to FAKTY (zamówione,
    //     dostarczone, zaczęte), a cofnięcie planu zatrzasnęłoby nad nimi bramkę `axisGateOf`
    //     i schowało oś, na której coś się realnie wydarzyło.
    private async statusesToRestore(nodeId: string, acceptedVersionId: string) {
        const empty = { byStatus: [] as [string, string[]][], revertedCount: 0, keptCount: 0 };
        const entry = await this.prisma.auditLog.findFirst({
            where: { action: AuditAction.ACCEPT, entity: 'ProcessNode', entityId: nodeId },
            orderBy: { createdAt: 'desc' },
            select: { diff: true },
        });
        const diff = (entry?.diff ?? null) as
            { versionId?: string; snapshotVersionId?: string; confirmed?: { id: string; from: string }[] } | null;
        // Wpis pasuje do TEJ akceptacji, gdy wskaźnik `acceptedVersionId` pokazuje na jej
        // zamrożoną kopię (`snapshotVersionId`). Fallback na `versionId` obsługuje akceptacje
        // sprzed wdrożenia kopii — tam baseline wskazywał wprost na akceptowaną wersję.
        const matches = diff?.snapshotVersionId
            ? diff.snapshotVersionId === acceptedVersionId
            : diff?.versionId === acceptedVersionId;
        if (!diff || !matches || !Array.isArray(diff.confirmed) || !diff.confirmed.length) {
            return empty;
        }

        const fromById = new Map(diff.confirmed.map((c) => [c.id, c.from]));
        const rows = await this.prisma.wbsNode.findMany({
            where: { id: { in: [...fromById.keys()] } },
            select: { id: true, status: true, purchaseStatus: true, execStatus: true },
        });
        const byStatus = new Map<string, string[]>();
        let kept = 0;
        for (const r of rows) {
            const from = fromById.get(r.id);
            const touched = planStatusFromAny(r.status) !== 'CONFIRMED' || r.purchaseStatus || r.execStatus;
            if (!from || touched) { kept += 1; continue; }
            if (!byStatus.has(from)) byStatus.set(from, []);
            byStatus.get(from)!.push(r.id);
        }
        const reverted = [...byStatus.values()].reduce((s, ids) => s + ids.length, 0);
        // Pozycje skasowane po akceptacji już nie istnieją — nie są ani cofnięte, ani zostawione.
        return { byStatus: [...byStatus.entries()], revertedCount: reverted, keptCount: kept };
    }
}
