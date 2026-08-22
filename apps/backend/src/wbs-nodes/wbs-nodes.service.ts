import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { isClosedLeafType, isManagerRoles } from '../common/leaf-types.util';
import { resolveVersionId } from '../common/version.util';
import { assertOfferEditable, pickOfferChanges, OfferLockUser } from '../common/offer-lock.util';
import { ExtraOrderNotifierService, EXTRA_ORDER_STATUS } from '../notifications/extra-order-notifier.service';

// @anchor qa-pair
export interface QaPair {
    question: string;
    answer: string;
}

// @anchor wbs-tree-item
export interface WbsTreeItem {
    id: string;
    name: string;
    type: string;
    status: string;
    unit: string;
    owner: string;
    resources: string;
    cost: string;
    comment: string;
    strategy: string;
    tags: string[];
    qa: QaPair[];
    children: WbsTreeItem[];
}

// @anchor wbs-nodes-service
@Injectable()
export class WbsNodesService {
    private readonly logger = new Logger(WbsNodesService.name);

    constructor(
        private prisma: PrismaService,
        private extraOrder: ExtraOrderNotifierService,
        private cls: ClsService,
    ) {}

    // @anchor wbs-nodes-sees-closed-leaves — praca, usługa, nocleg i paliwo to koszty własne
    // firmy. Poza ADMIN/MANAGER nikt ich nie ogląda, a decyduje o tym backend, nie komponent:
    // z tego jednego drzewa żyją WSZYSTKIE widoki liści (WBS, Materiały, Realizacja, Gantt,
    // Schemat, QA, eksporty PDF/Excel), więc zawężenie tutaj zamyka je wszystkie naraz —
    // i przeżywa otwarcie zakładki „Sieć" w przeglądarce.
    private seesClosedLeaves() {
        return isManagerRoles(this.cls.get('user.roles'));
    }

    // @anchor wbs-nodes-visible-for-caller — zdejmuje z płaskiej listy liście zamknięte dla roli.
    // Pętla, a nie jeden filtr: gdyby zamknięty typ miał pod sobą dzieci, wypadnięcie rodzica
    // osierociłoby całe poddrzewo (frontend buduje hierarchię po `parentId` i takie węzły
    // znikają bez śladu). Zostaje więc dopóty, dopóki ma widoczne potomstwo — a gdy ostatnie
    // dziecko wypadnie, wypada i on. Węzeł, który przetrwał wyłącznie jako rodzic, wychodzi
    // z WYZEROWANYMI kwotami (`stripMoney`) — ma trzymać gałąź, a nie pokazywać swój koszt.
    private visibleForCaller<T extends { id: string; parentId?: string | null; type?: string | null }>(nodes: T[]): T[] {
        if (this.seesClosedLeaves()) return nodes;
        let current = nodes;
        for (;;) {
            const parents = new Set(current.map(n => n.parentId).filter(Boolean) as string[]);
            const next = current.filter(n => !isClosedLeafType(n.type) || parents.has(n.id));
            if (next.length === current.length) {
                return next.map(n => (isClosedLeafType(n.type) ? this.stripMoney(n) : n));
            }
            current = next;
        }
    }

    // @anchor wbs-nodes-strip-money — kasuje wszystkie pola kwotowe wiersza. `cost` jest tekstem
    // (stare drzewo trzymało w nim kwotę wpisaną ręcznie), więc czyścimy je razem z liczbami;
    // `quantity` zostaje, bo to ilość, nie pieniądze.
    private stripMoney<T>(node: T): T {
        return {
            ...node,
            cost: '',
            unitCost: 0, totalCost: 0, margin: 0, discount: 0, unitPrice: 0, totalPrice: 0,
        };
    }

    /**
     * Pobiera drzewo WBS z tabeli relacyjnej i zwraca w formacie JSON blob
     * (kompatybilnym z frontendem).
     * Zwraca null jeśli brak węzłów — caller powinien użyć fallbacku z OrderRequirements.wbsTree.
     */
    async getTree(nodeId: string, versionId?: string): Promise<{ items: WbsTreeItem[] } | null> {
        const vId = await resolveVersionId(this.prisma, nodeId, versionId);

        const nodes = await this.prisma.wbsNode.findMany({
            where: { nodeId, versionId: vId },
            orderBy: { sortOrder: 'asc' },
        });

        if (nodes.length === 0) return null;

        return { items: this.buildTree(this.visibleForCaller(nodes), null) };
    }

    /**
     * Zapisuje drzewo WBS z formatu JSON blob do tabeli relacyjnej.
     * Strategia: delete all + insert (atomowe w transakcji).
     * Zachowuje oryginalne UUID z frontendu.
     */
    async saveTree(nodeId: string, versionId: string | undefined, tree: { items: WbsTreeItem[] }): Promise<void> {
        const vId = await resolveVersionId(this.prisma, nodeId, versionId);
        const items = tree?.items || [];

        await this.prisma.$transaction(async (tx) => {
            // Pobierz istniejące węzły żeby zachować pola budżetowe
            const existing = await tx.wbsNode.findMany({
                where: { nodeId, versionId: vId },
                select: {
                    id: true, type: true, budgetType: true, unit: true, unitCost: true,
                    quantity: true, totalCost: true, margin: true, discount: true,
                    unitPrice: true, totalPrice: true, comment: true, phase: true,
                },
            });
            const budgetMap = new Map(existing.map(n => [n.id, n]));

            // Zbierz IDs z nowego drzewa
            const newRows = this.flattenForInsert(items, nodeId, vId, null);
            const newIds = new Set(newRows.map(r => r.id));

            // Usuń węzły które nie istnieją w nowym drzewie.
            // @anchor wbs-nodes-save-tree-hidden-guard — „nie ma w drzewie" znaczy „usunięte"
            // TYLKO dla tego, kto to drzewo widział w całości. Nie-manager dostaje z
            // `getUnifiedTree` listę bez liści pracy/usługi/noclegu/paliwa i odsyła ją tu przy
            // każdej edycji struktury — bez tego wyjątku pierwszy zapis logistyka skasowałby
            // wszystkie ukryte przed nim pozycje razem z ich budżetem.
            const seesAll = this.seesClosedLeaves();
            const idsToDelete = existing
                .filter(n => !newIds.has(n.id) && (seesAll || !isClosedLeafType(n.type)))
                .map(n => n.id);
            if (idsToDelete.length > 0) {
                await tx.wbsNode.deleteMany({ where: { id: { in: idsToDelete } } });
            }

            // Upsert: wstaw nowe lub zaktualizuj istniejące (zachowując pola budżetowe)
            for (const row of newRows) {
                const budget = budgetMap.get(row.id);
                if (budget) {
                    // Update — zachowaj pola budżetowe, zaktualizuj pola drzewa
                    await tx.wbsNode.update({
                        where: { id: row.id },
                        data: {
                            parentId: row.parentId,
                            name: row.name,
                            type: row.type,
                            status: row.status,
                            unit: row.unit,
                            owner: row.owner,
                            resources: row.resources,
                            cost: row.cost,
                            comment: row.comment,
                            strategy: row.strategy,
                            tags: row.tags,
                            qa: row.qa,
                            sortOrder: row.sortOrder,
                        },
                    });
                } else {
                    // Insert nowy węzeł (upsert — idempotentne przy równoległych zapisach)
                    await tx.wbsNode.upsert({
                        where: { id: row.id },
                        create: row,
                        update: {
                            parentId: row.parentId,
                            name: row.name,
                            type: row.type,
                            status: row.status,
                            unit: row.unit,
                            owner: row.owner,
                            resources: row.resources,
                            cost: row.cost,
                            comment: row.comment,
                            strategy: row.strategy,
                            tags: row.tags,
                            qa: row.qa,
                            sortOrder: row.sortOrder,
                        },
                    });
                }
            }
        });
    }

    /**
     * Buduje mapę nodeId → { name, path } dla syncFromMaterials.
     * Zastępuje parsowanie JSON blob w budget.service.ts.
     */
    async getNodeMap(nodeId: string, versionId?: string): Promise<Record<string, { name: string; path: string }>> {
        const vId = await resolveVersionId(this.prisma, nodeId, versionId);
        const nodes = await this.prisma.wbsNode.findMany({
            where: { nodeId, versionId: vId },
            orderBy: { sortOrder: 'asc' },
        });

        if (nodes.length === 0) return {};

        const tree = this.buildTree(nodes, null);
        const map: Record<string, { name: string; path: string }> = {};
        this.flattenWithPaths(tree, '', map);
        return map;
    }

    // ─── Private helpers ────────────────────────────────────────────────

    private async resolveOrderNodeId(nodeId: string): Promise<string> {
        let currentId = nodeId;
        for (let i = 0; i < 10; i++) {
            const node = await this.prisma.processNode.findUnique({
                where: { id: currentId },
                select: { id: true, type: true, parentId: true },
            });
            if (!node) break;
            if (String(node.type || '').toLowerCase() === 'order') return node.id;
            if (!node.parentId) break;
            currentId = node.parentId;
        }
        return nodeId;
    }

    private buildTree(nodes: any[], parentId: string | null): WbsTreeItem[] {
        return nodes
            .filter(n => n.parentId === parentId)
            .map(n => {
                const qa = this.parseQa(n.qa);
                const status = n.name === 'PYTANIA OGÓLNE'
                    ? this.computeQaStatus(qa)
                    : (n.status || '');
                return {
                    id: n.id,
                    name: n.name,
                    type: n.type || '',
                    status,
                    unit: n.unit || '',
                    owner: n.owner || '',
                    resources: n.resources || '',
                    cost: n.cost || '',
                    comment: n.comment || '',
                    strategy: n.strategy || '',
                    tags: this.parseTags(n.tags),
                    qa,
                    children: this.buildTree(nodes, n.id),
                };
            });
    }

    private flattenForInsert(
        items: WbsTreeItem[],
        nodeId: string,
        versionId: string | null,
        parentId: string | null,
    ): any[] {
        const rows: any[] = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const qaArr = Array.isArray(item.qa) ? item.qa : [];
            const status = item.name === 'PYTANIA OGÓLNE'
                ? this.computeQaStatus(qaArr)
                : (item.status || '');
            // unitCost przenoszony z drzewa tylko dla NOWYCH węzłów (ścieżka create).
            // quantity CELOWO nie jest przenoszona — klon przez Kopiuj/Wklej ma dostać
            // nową ilość do uzupełnienia (Prisma @default(1)), nie ilość ze źródłowej gałęzi.
            // Aktualizacja istniejących węzłów używa jawnych pól i nie rusza budżetu.
            const ucRaw = (item as any).unitCost;
            const ucNum = (ucRaw === '' || ucRaw == null) ? undefined : Number(ucRaw);
            const unitCost = Number.isFinite(ucNum) ? ucNum : undefined;
            // margin — jak unitCost — przenoszony z drzewa tylko dla NOWYCH węzłów (ścieżka create),
            // żeby domyślna marża typu liścia (modal „Domyślne wartości") utrwaliła się od razu.
            const mRaw = (item as any).margin;
            const mNum = (mRaw === '' || mRaw == null) ? undefined : Number(mRaw);
            const margin = Number.isFinite(mNum) ? mNum : undefined;
            rows.push({
                id: item.id,
                parentId,
                nodeId,
                versionId,
                name: item.name || '',
                type: item.type || '',
                status,
                unit: item.unit || '',
                owner: item.owner || '',
                resources: item.resources || '',
                cost: item.cost || '',
                comment: item.comment || '',
                strategy: item.strategy || null,
                tags: Array.isArray(item.tags) && item.tags.length > 0 ? JSON.stringify(item.tags) : null,
                qa: Array.isArray(item.qa) && item.qa.length > 0 ? JSON.stringify(item.qa) : null,
                unitCost,
                margin,
                sortOrder: i,
            });
            if (item.children?.length) {
                rows.push(...this.flattenForInsert(item.children, nodeId, versionId, item.id));
            }
        }
        return rows;
    }

    private flattenWithPaths(items: WbsTreeItem[], parentPath: string, map: Record<string, { name: string; path: string }>) {
        for (const item of items) {
            const path = parentPath ? `${parentPath} › ${item.name}` : item.name;
            map[item.id] = { name: item.name, path };
            if (item.children?.length) {
                this.flattenWithPaths(item.children, path, map);
            }
        }
    }

    private parseTags(raw: string | null): string[] {
        if (!raw) return [];
        try { return JSON.parse(raw); } catch { return []; }
    }

    private parseQa(raw: string | null): QaPair[] {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map((p) => ({
                question: String(p?.question ?? ''),
                answer: String(p?.answer ?? ''),
            }));
        } catch { return []; }
    }

    private computeQaStatus(qa: QaPair[]): string {
        if (!qa || qa.length === 0) return '';
        return qa.every(p => String(p.answer || '').trim() !== '') ? 'CONFIRMED' : 'PENDING';
    }

    // ─── Unified tree (Phase 4) ─────────────────────────────────────────

    /**
     * Zwraca płaską listę węzłów WBS z pełnymi danymi:
     * - pola drzewa (name, type, status, owner)
     * - pola budżetowe (unitCost, quantity, margin, unitPrice, totalPrice)
     * - alokacje materiałowe z cenami
     * - ścieżka w drzewie
     */
    async getUnifiedTree(nodeId: string, versionId?: string) {
        const requestedNodeId = nodeId;
        const fallbackOrderNodeId = await this.resolveOrderNodeId(requestedNodeId);
        const vId = await resolveVersionId(this.prisma, fallbackOrderNodeId, versionId);

        try {
            const fetchNodesForCandidate = async (candidateNodeId: string) => {
                if (vId) {
                    // Snapshot ma własne UUID-y, nie da się scalić z baseline po `id`.
                    // Jeżeli wersja ma własne wiersze → zwróć tylko je (pełny freeze).
                    // Jeżeli wersja jest pusta → fallback do baseline.
                    const versionRows = await this.prisma.wbsNode.findMany({
                        where: { nodeId: candidateNodeId, versionId: vId },
                        orderBy: { sortOrder: 'asc' },
                    });
                    if (versionRows.length > 0) return versionRows;
                }

                return this.prisma.wbsNode.findMany({
                    where: { nodeId: candidateNodeId, versionId: null },
                    orderBy: { sortOrder: 'asc' },
                });
            };

            // Step 1: try requested node first; for site, fallback to parent order.
            let nodes: any[] = await fetchNodesForCandidate(requestedNodeId);

            if (nodes.length === 0 && fallbackOrderNodeId !== requestedNodeId) {
                nodes = await fetchNodesForCandidate(fallbackOrderNodeId);
            }

            if (nodes.length === 0) {
                return { items: [] };
            }

            // Zawężenie po roli PRZED liczeniem ścieżek, głębokości i alokacji — inaczej
            // logistyk dostałby w odpowiedzi ceny liści, których nie ma prawa oglądać.
            nodes = this.visibleForCaller(nodes);
            if (nodes.length === 0) {
                return { items: [] };
            }

            // Step 2: Pobierz materiały dla wszystkich nodes za jednym razem
            const nodeIds = nodes.map(n => n.id);
            const allocations = await this.prisma.wbsNodeMaterial.findMany({
                where: { wbsNodeId: { in: nodeIds } },
                include: {
                    material: {
                        select: {
                            id: true, productName: true, manufacturer: true, model: true,
                            priceNetto: true, productUrl: true, imageUrl: true,
                        },
                    },
            },
        });
        const allocByNodeId = new Map();
        allocations.forEach(a => {
            if (!allocByNodeId.has(a.wbsNodeId)) allocByNodeId.set(a.wbsNodeId, []);
            allocByNodeId.get(a.wbsNodeId).push(a);
        });
        
        // Dołącz materiały do nodes
        nodes.forEach(node => {
            node.materialAllocations = allocByNodeId.get(node.id) || [];
        });

        if (nodes.length === 0) return { items: [] };

        // Buduj ścieżki
        const pathMap: Record<string, string> = {};
        const buildPaths = (parentId: string | null, parentPath: string) => {
            const children = nodes.filter(n => n.parentId === parentId);
            for (const node of children) {
                const path = parentPath ? `${parentPath} › ${node.name}` : node.name;
                pathMap[node.id] = path;
                buildPaths(node.id, path);
            }
        };
        buildPaths(null, '');

        // Buduj depth map
        const depthMap: Record<string, number> = {};
        const buildDepths = (parentId: string | null, depth: number) => {
            const children = nodes.filter(n => n.parentId === parentId);
            for (const node of children) {
                depthMap[node.id] = depth;
                buildDepths(node.id, depth + 1);
            }
        };
        buildDepths(null, 0);

        // Zwróć płaską listę z wzbogaconymi danymi
        const items = nodes.map(node => {
            const materials = node.materialAllocations.map(alloc => {
                const mat = alloc.material;
                const selectedProposal = mat.proposals?.[0];
                const price = selectedProposal?.priceNetto ?? mat.priceNetto ?? 0;
                return {
                    allocationId: alloc.id,
                    materialId: mat.id,
                    productName: selectedProposal?.productName || mat.productName || '',
                    manufacturer: selectedProposal?.manufacturer || mat.manufacturer || '',
                    model: selectedProposal?.model || mat.model || '',
                    unit: mat.unit || 'sztuki',
                    priceNetto: price,
                    quantity: alloc.quantity,
                    totalPrice: price * alloc.quantity,
                    status: mat.status,
                };
            });

            const materialsTotalCost = materials.reduce((sum, m) => sum + m.totalPrice, 0);

            return {
                id: node.id,
                parentId: node.parentId,
                name: node.name,
                type: node.type,
                status: node.status,
                owner: node.owner,
                path: pathMap[node.id] || node.name,
                depth: depthMap[node.id] ?? 0,
                sortOrder: node.sortOrder,
                // Budget fields
                budgetType: node.budgetType,
                unit: node.unit,
                unitCost: node.unitCost,
                quantity: node.quantity,
                totalCost: node.totalCost,
                margin: node.margin,
                discount: node.discount,
                unitPrice: node.unitPrice,
                totalPrice: node.totalPrice,
                comment: node.comment,
                strategy: node.strategy,
                phase: node.phase,
                ganttStart: node.ganttStart ? node.ganttStart.toISOString() : null,
                ganttEnd: node.ganttEnd ? node.ganttEnd.toISOString() : null,
                // Realizacja: korzeń klonu (po nim wiszą wpisy `LeafActual`) i flaga
                // rozliczenia pozycji — panel Materiały liczy z nich licznik i Δ.
                sourceWbsNodeId: node.sourceWbsNodeId,
                realizationClosed: node.realizationClosed,
                // Materials
                materials,
                materialsTotalCost,
                materialsCount: materials.length,
                tags: this.parseTags(node.tags),
                qa: this.parseQa(node.qa),
            };
        });

        return { items };
        } catch {
            return { items: [] };
        }
    }

    /**
     * Tworzy nowy węzeł WBS.
     */
    async createNode(data: { nodeId: string; parentId?: string; versionId?: string; name: string; type?: string; tags?: string[] }) {
        const vId = await resolveVersionId(this.prisma, data.nodeId, data.versionId);

        // Oblicz sortOrder — ostatni wśród rodzeństwa
        const siblings = await this.prisma.wbsNode.findMany({
            where: { nodeId: data.nodeId, versionId: vId, parentId: data.parentId || null },
            orderBy: { sortOrder: 'desc' },
            take: 1,
        });
        const sortOrder = siblings.length > 0 ? siblings[0].sortOrder + 1 : 0;

        return this.prisma.wbsNode.create({
            data: {
                nodeId: data.nodeId,
                versionId: vId,
                parentId: data.parentId || null,
                name: data.name,
                type: data.type || '',
                sortOrder,
                tags: data.tags?.length ? JSON.stringify(data.tags) : undefined,
            },
        });
    }

    /**
     * Aktualizuje pola węzła WBS (nazwa, typ, status, owner, quantity).
     * Gdy quantity się zmienia, synchronizuje powiązane MaterialRequirement
     * (jedno źródło prawdy: WbsNode.quantity → WbsNodeMaterial → MaterialRequirement).
     */
    async updateNode(id: string, data: any, user?: OfferLockUser) {
        const allowed: Record<string, any> = {};
        for (const key of ['name', 'type', 'status', 'owner', 'resources', 'cost', 'parentId', 'sortOrder', 'comment', 'strategy', 'unit', 'unitPrice']) {
            if (data[key] !== undefined) allowed[key] = data[key];
        }
        if (data.ganttStart !== undefined) {
            allowed.ganttStart = data.ganttStart ? new Date(data.ganttStart) : null;
        }
        if (data.ganttEnd !== undefined) {
            allowed.ganttEnd = data.ganttEnd ? new Date(data.ganttEnd) : null;
        }
        let quantityChanged = false;
        if (data.quantity !== undefined) {
            const q = parseFloat(data.quantity);
            if (Number.isFinite(q) && q >= 0) {
                allowed.quantity = q;
                quantityChanged = true;
            }
        }
        if (data.tags !== undefined) {
            allowed.tags = Array.isArray(data.tags) && data.tags.length > 0
                ? JSON.stringify(data.tags)
                : null;
        }
        if (data.qa !== undefined) {
            const cleaned = Array.isArray(data.qa)
                ? data.qa.map((p: any) => ({
                    question: String(p?.question ?? ''),
                    answer: String(p?.answer ?? ''),
                }))
                : [];
            allowed.qa = cleaned.length > 0 ? JSON.stringify(cleaned) : null;
        }
        // Gałąź grupująca nie trzyma własnej ceny — jej wartość to suma dzieci.
        // Przy zmianie typu na 'group' zerujemy pola cenowe, inaczej stara cena
        // (z czasu, gdy węzeł był typu work/material/…) dubluje się z sumą dzieci
        // w eksportach oferty/budżetu.
        if (String(allowed.type || '').toLowerCase() === 'group') {
            allowed.unitCost = 0;
            allowed.totalCost = 0;
            allowed.margin = 0;
            allowed.discount = 0;
            allowed.unitPrice = 0;
            allowed.totalPrice = 0;
        }

        // @anchor wbs-node-offer-lock — ta sama blokada co na `/budget`: ilość i cena jednostkowa
        // idą też tędy (edycja z drzewa, drag paska Gantta), a zmiana typu na `group` po cichu
        // zeruje całą wycenę węzła — po akceptacji baseline wszystkie trzy drogi wymagają zgody.
        if (allowed.quantity !== undefined || allowed.unitPrice !== undefined
            || String(allowed.type || '').toLowerCase() === 'group') {
            const existing = await this.prisma.wbsNode.findUnique({
                where: { id },
                select: { nodeId: true, quantity: true, unitCost: true, margin: true, discount: true, unitPrice: true },
            });
            if (existing) {
                const changes = pickOfferChanges(existing, allowed);
                // Etykieta dla dziennika: sama zmiana typu na `group` nie jest polem cenowym,
                // ale to ona zeruje wycenę węzła — bez tego wpis w AuditLog nie tłumaczyłby, skąd zera.
                if (String(allowed.type || '').toLowerCase() === 'group'
                    && ((existing.unitCost ?? 0) !== 0 || (existing.unitPrice ?? 0) !== 0)) {
                    changes.type = { old: 'leaf', new: 'group (zerowanie wyceny węzła)' } as any;
                }
                await assertOfferEditable(this.prisma, {
                    processNodeId: existing.nodeId,
                    user,
                    entity: 'WbsNode',
                    entityId: id,
                    changes,
                });
            }
        }

        // @anchor wbs-node-extra-order-hook — status sprzed zapisu: powiadamiamy o WEJŚCIU
        // w „Dodatkowe zamówienie", nie o każdym zapisie pozycji, która ten status już ma.
        // Druga droga zapisu tego samego statusu (karta materiałowa) woła to samo — próg
        // „raz na zamówienie" w `ExtraOrderNotifierService` łapie oba wywołania.
        const statusBefore = allowed.status !== undefined
            ? (await this.prisma.wbsNode.findUnique({ where: { id }, select: { status: true } }))?.status ?? null
            : null;

        let updated;
        try {
            updated = await this.prisma.wbsNode.update({ where: { id }, data: allowed });
        } catch (e: any) {
            if (e?.code === 'P2025') throw new NotFoundException(`WbsNode ${id} not found`);
            throw e;
        }

        if (quantityChanged) {
            await this.syncMaterialsFromWbsNode(id, allowed.quantity).catch(() => {});
        }

        if (allowed.status === EXTRA_ORDER_STATUS && statusBefore !== EXTRA_ORDER_STATUS) {
            await this.extraOrder.notify({
                processNodeId: updated.nodeId,
                positionName: updated.name,
            }).catch(() => {});
        }

        return updated;
    }

    /**
     * Synchronizuje MaterialRequirement.quantity z WbsNode.quantity.
     * `WbsNode.quantity` jest źródłem prawdy, `MaterialRequirement.quantity` jego odbiciem.
     *
     * Karta może obejmować KILKA gałęzi WBS (`wbsNodeAllocations`), a właścicielem przez relację 1:1
     * `wbsNodeId` jest tylko jedna z nich. Dlatego zmiana ilości na węźle dotyka każdej karty, która
     * wymienia ten węzeł — nie tylko tej, którą węzeł posiada.
     *
     * @anchor wbs-sync-qty-direct-link
     * Dwie dziury, które ta funkcja miała wcześniej, obie widoczne w AMP_5G:
     *   - edycja gałęzi WTÓRNEJ nie ruszała karty w ogóle. `updateMany({ where: { wbsNodeId } })`
     *     trafia wyłącznie w kartę posiadaną przez węzeł, a gałąź wtórna z definicji jej nie ma;
     *     tabela `WbsNodeMaterial`, która miała to obsłużyć, jest dla większości pozycji pusta;
     *   - edycja WŁAŚCICIELA nadpisywała sumę ilością jednej gałęzi. Karta `cybant` pokazywała 325
     *     (tyle co właściciel) przy mapie `{…:1, …:350}` — gałąź 350 wypadła z zakupów.
     *
     * Suma liczona jest z RZECZYWISTYCH ilości węzłów wymienionych w mapie, nie z wartości w mapie —
     * dzięki temu nieaktualne wpisy same się goją. Wyjątek: wpis wskazujący węzeł, którego już nie ma,
     * zostaje z dotychczasową wartością. Usunięcie go obniżyłoby ilość zakupową po cichu, przy okazji
     * niepowiązanej edycji; to osobna decyzja, nie efekt uboczny zapisu ilości.
     */
    private async syncMaterialsFromWbsNode(wbsNodeId: string, newQuantity: number) {
        // Tabela relacyjna pozostaje żywa dla rozbić zakładanych przez `selectProposal`.
        await this.prisma.wbsNodeMaterial.updateMany({
            where: { wbsNodeId },
            data: { quantity: newQuantity },
        });

        const affected = await this.prisma.materialRequirement.findMany({
            where: { OR: [{ wbsNodeId }, { wbsNodeAllocations: { contains: wbsNodeId } }] },
            select: { id: true, wbsNodeId: true, wbsNodeAllocations: true },
        });
        if (affected.length === 0) return;

        for (const req of affected) {
            let alloc: Record<string, unknown> = {};
            try {
                const parsed = req.wbsNodeAllocations ? JSON.parse(req.wbsNodeAllocations) : null;
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) alloc = parsed;
            } catch { alloc = {}; }

            const keys = Object.keys(alloc);
            // Karta bez mapy (albo z mapą, która nie zna tego węzła, a węzeł jest jej właścicielem)
            // opisuje jedną pozycję — jej ilość to wprost ilość węzła.
            if (keys.length === 0) {
                await this.prisma.materialRequirement.update({
                    where: { id: req.id },
                    data: { quantity: newQuantity },
                });
                continue;
            }
            if (!keys.includes(wbsNodeId)) {
                if (req.wbsNodeId !== wbsNodeId) continue; // mapa nie zna węzła i nie jest jego kartą
                keys.push(wbsNodeId);
            }

            const nodes = await this.prisma.wbsNode.findMany({
                where: { id: { in: keys } },
                select: { id: true, quantity: true },
            });
            const realne = new Map(nodes.map(n => [n.id, n.quantity ?? 0]));

            // Gałąź, która ma WŁASNĄ kartę, nie należy do tej karty — jej ilość jest już policzona
            // po tamtej stronie. Wpis to ślad po nieaktualnym powiązaniu i wliczenie go dawałoby
            // podwójne liczenie w zakupach (`Przełącznica 48j` doliczałaby `Przełącznicę SC/PC`).
            // Właściciel karty zostaje ZAWSZE, nawet gdy mapa go nie wymienia — inaczej karta,
            // której mapa opisuje wyłącznie cudze gałęzie, spadłaby do zera.
            const zWlasnaKarta = new Set(
                (await this.prisma.materialRequirement.findMany({
                    where: { wbsNodeId: { in: keys.filter(k => k !== req.wbsNodeId) }, id: { not: req.id } },
                    select: { wbsNodeId: true },
                })).map(r => r.wbsNodeId as string),
            );

            const nextAlloc: Record<string, number> = {};
            for (const k of keys) {
                if (zWlasnaKarta.has(k)) continue;
                if (realne.has(k)) nextAlloc[k] = realne.get(k) as number;
                else nextAlloc[k] = parseFloat(String(alloc[k])) || 0; // węzeł zniknął — wartość zostaje
            }

            // Bezpiecznik: karta bez właściciela, której WSZYSTKIE gałęzie mają własne karty,
            // zostałaby z pustą mapą i ilością 0. Cicha zerówka na pozycji zakupowej jest gorsza
            // niż podwójne liczenie — taki wpis wymaga człowieka, nie efektu ubocznego edycji
            // sąsiedniego węzła. Zostawiamy kartę nietkniętą.
            if (Object.keys(nextAlloc).length === 0) continue;

            const total = Object.values(nextAlloc).reduce((s, v) => s + v, 0);

            await this.prisma.materialRequirement.update({
                where: { id: req.id },
                data: { quantity: total, wbsNodeAllocations: JSON.stringify(nextAlloc) },
            });
        }
    }

    /**
     * Usuwa węzeł WBS i rekurencyjnie wszystkie dzieci.
     * Czyści powiązane WbsNodeMaterial i aktualizuje MaterialRequirement.
     */
    async deleteNode(id: string) {
        const allIds = await this.collectDescendantIds(id);

        // 1. Znajdź alokacje powiązane z usuwanym węzłami
        const allocs = await this.prisma.wbsNodeMaterial.findMany({
            where: { wbsNodeId: { in: allIds } },
            select: { materialId: true, wbsNodeId: true },
        });

        // 2. Usuń WbsNodeMaterial dla tych węzłów
        if (allocs.length > 0) {
            await this.prisma.wbsNodeMaterial.deleteMany({ where: { wbsNodeId: { in: allIds } } });

            // 3. Dla każdego dotkniętego materiału — przelicz alokacje
            const affectedIds = [...new Set(allocs.map(a => a.materialId))];
            for (const materialId of affectedIds) {
                const remaining = await this.prisma.wbsNodeMaterial.findMany({ where: { materialId } });
                if (remaining.length === 0) {
                    await this.prisma.materialRequirement.update({
                        where: { id: materialId },
                        data: { wbsNodeId: null, wbsNodeIds: null, wbsNodeAllocations: null, quantity: 0 },
                    }).catch(() => {});
                } else {
                    const total = remaining.reduce((s, a) => s + (a.quantity || 0), 0);
                    await this.prisma.materialRequirement.update({
                        where: { id: materialId },
                        data: {
                            quantity: total,
                            wbsNodeAllocations: JSON.stringify(Object.fromEntries(remaining.map(a => [a.wbsNodeId, a.quantity]))),
                            wbsNodeIds: JSON.stringify(remaining.map(a => a.wbsNodeId)),
                            wbsNodeId: remaining[0].wbsNodeId,
                        },
                    }).catch(() => {});
                }
            }
        }

        // 4. Karty materiałowe usuwanych węzłów: przepnij na pozostałe alokacje,
        // a gdy nie zostaje żadna — USUŃ kartę razem z węzłem.
        // @anchor delete-node-orphan-cards — samo odczepienie (`wbsNodeId: null`,
        // `quantity: 0`) zostawiało kartę-widmo: panel Materiały kluczuje po
        // `wbsNodeId`, więc taka karta znikała z UI, ale wciąż liczyła się w
        // porównaniu Wycena↔Zakup i nie dało się jej już otworzyć ani skasować.
        // Kaskada zdejmuje też ProductProposal; QuickQuoteItem ma SetNull, więc
        // zamrożone wyceny baseline przeżywają.
        const allIdsSet = new Set(allIds);
        const legacyMats = await this.prisma.materialRequirement.findMany({
            where: { wbsNodeId: { in: allIds } },
            select: { id: true, wbsNodeIds: true, wbsNodeAllocations: true },
        });
        const orphanedIds: string[] = [];
        for (const mat of legacyMats) {
            let ids: string[] = [];
            try { ids = JSON.parse(mat.wbsNodeIds || '[]'); } catch {}
            const nextIds = ids.filter(i => !allIdsSet.has(i));
            if (nextIds.length === 0) { orphanedIds.push(mat.id); continue; }
            let nextAlloc: Record<string, number> = {};
            try { const a = JSON.parse(mat.wbsNodeAllocations || '{}'); for (const k of Object.keys(a)) { if (!allIdsSet.has(k)) nextAlloc[k] = a[k]; } } catch {}
            await this.prisma.materialRequirement.update({
                where: { id: mat.id },
                data: {
                    wbsNodeId: nextIds[0],
                    wbsNodeIds: JSON.stringify(nextIds),
                    wbsNodeAllocations: Object.keys(nextAlloc).length ? JSON.stringify(nextAlloc) : null,
                },
            }).catch(() => {});
        }
        if (orphanedIds.length > 0) {
            await this.prisma.materialRequirement.deleteMany({ where: { id: { in: orphanedIds } } });
            this.logger.log(`deleteNode(${id}): usunięto ${orphanedIds.length} kart materiałowych bez pozostałych powiązań WBS`);
        }

        // 5. Usuń węzły WBS
        await this.prisma.wbsNode.deleteMany({ where: { id: { in: allIds } } });
        return { deleted: allIds.length, deletedRequirements: orphanedIds.length };
    }

    private async collectDescendantIds(id: string): Promise<string[]> {
        const ids = [id];
        const children = await this.prisma.wbsNode.findMany({
            where: { parentId: id },
            select: { id: true },
        });
        for (const child of children) {
            ids.push(...await this.collectDescendantIds(child.id));
        }
        return ids;
    }

    /**
     * Aktualizuje pola budżetowe na pojedynczym węźle WBS.
     */
    async updateBudgetFields(id: string, data: any, user?: OfferLockUser) {
        // Partial update: gdy caller przysyła tylko część pól (np. samą `quantity`
        // z edycji ilości w WBS), pozostałe pola budżetu (unit, unitCost, margin,
        // discount, comment, phase) NIE są zerowane — czytamy je z istniejącego wiersza.
        // Wcześniej był pełny replace, m.in. `unit: data.unit || 'sztuki'` resetował
        // jednostkę na 'sztuki' przy zapisie samej ilości (bug: jednostki same się zmieniały).
        const existing = await this.prisma.wbsNode.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException(`WbsNode ${id} not found`);

        // @anchor wbs-budget-offer-lock — po akceptacji baseline pola cenowe i ilość są
        // zamrożone dla KAŻDEGO typu liścia; przechodzi tylko manager (z wpisem w AuditLog).
        await assertOfferEditable(this.prisma, {
            processNodeId: existing.nodeId,
            user,
            entity: 'WbsNode',
            entityId: id,
            changes: pickOfferChanges(existing, data),
        });

        const has = (k: string) => data[k] !== undefined && data[k] !== null && data[k] !== '';
        const sentPricing = has('unitCost') || has('margin') || has('discount') || has('unitPrice');

        const quantity = has('quantity') ? (parseFloat(data.quantity) || 0) : (existing.quantity ?? 0);

        let unitCost: number;
        let margin: number;
        let discount: number;
        let unitPrice: number;

        if (sentPricing) {
            // Pełny zestaw pól cenowych — przeliczanie zachowane 1:1 jak wcześniej.
            unitCost = parseFloat(data.unitCost) || 0;
            margin = parseFloat(data.margin) || 0;
            discount = parseFloat(data.discount) || 0;
            unitPrice = parseFloat(data.unitPrice) || 0;

            if (unitCost > 0) {
                if (unitPrice > 0 && margin === 0) {
                    margin = ((unitPrice / unitCost) - 1) * 100;
                } else if (margin !== 0) {
                    unitPrice = unitCost * (1 + margin / 100);
                }
            } else if (margin !== 0) {
                unitPrice = unitCost * (1 + margin / 100);
            }

            if (discount > 0) {
                unitPrice = unitPrice * (1 - discount / 100);
            }
        } else {
            // Zapis bez pól cenowych (np. sama ilość) — zachowaj istniejące ceny,
            // tylko przeskaluj totale nową ilością.
            unitCost = existing.unitCost ?? 0;
            margin = existing.margin ?? 0;
            discount = existing.discount ?? 0;
            unitPrice = existing.unitPrice ?? 0;
        }

        // Gałąź grupująca nie ma własnej ceny — jej wartość to suma dzieci.
        // Nawet jeśli caller przyśle pola cenowe, dla type='group' wymuszamy zera,
        // spójnie z updateNode i eksportami (localPriceOf zwraca 0 dla group).
        const effectiveType = String(data.type ?? existing.type ?? '').toLowerCase();
        if (effectiveType === 'group') {
            unitCost = 0; margin = 0; discount = 0; unitPrice = 0;
        }

        const totalCost = unitCost * quantity;
        const totalPrice = unitPrice * quantity;

        const updateData: any = {
            unitCost,
            quantity,
            totalCost,
            margin,
            discount,
            unitPrice,
            totalPrice,
        };
        if (data.budgetType !== undefined || data.type !== undefined) {
            updateData.budgetType = data.budgetType || data.type || null;
        }
        if (has('unit')) updateData.unit = data.unit;
        if (data.comment !== undefined) updateData.comment = data.comment ?? null;
        if (data.phase !== undefined) updateData.phase = data.phase ?? null;

        const updated = await this.prisma.wbsNode.update({
            where: { id },
            data: updateData,
        });

        // Sync: WbsNode.quantity → WbsNodeMaterial → MaterialRequirement
        await this.syncMaterialsFromWbsNode(id, quantity).catch(() => {});

        // Sync: WbsNode.unitCost → MaterialRequirement.budgetedPriceNetto → propozycja isOffer
        if (sentPricing && effectiveType !== 'group') {
            await this.syncOfferPriceFromWbsNode(id, unitCost).catch(() => {});
        }

        return updated;
    }

    // @anchor wbs-sync-offer-price-from-node — brakujący kierunek przepływu ceny. Do tej pory
    // cena szła tylko propozycja → wymaganie → WbsNode.unitCost; edycja kosztu jednostkowego
    // w budżecie WBS nie wracała do wymagania, więc widok Materials pokazywał „—" mimo w pełni
    // wycenionego WBS (i taki rozjazd zamrażał się w snapszocie przy akceptacji baseline).
    // Synchronizuje tylko wymaganie powiązane 1:1 (`MaterialRequirement.wbsNodeId`) — pozycje
    // rozdzielone na wiele gałęzi zostawiamy, bo tam cena nie jest własnością jednego węzła.
    private async syncOfferPriceFromWbsNode(wbsNodeId: string, unitCost: number) {
        if (!(unitCost > 0)) return;
        const req = await this.prisma.materialRequirement.findFirst({
            where: { wbsNodeId },
            select: { id: true, budgetedPriceNetto: true },
        });
        if (!req || req.budgetedPriceNetto === unitCost) return;

        await this.prisma.materialRequirement.update({
            where: { id: req.id },
            data: { budgetedPriceNetto: unitCost },
        });

        const offer = await this.prisma.productProposal.findFirst({
            where: { materialRequirementId: req.id, isOffer: true },
            select: { id: true, priceNetto: true },
        });
        if (offer) {
            if (offer.priceNetto !== unitCost) {
                await this.prisma.productProposal.update({ where: { id: offer.id }, data: { priceNetto: unitCost } });
            }
            return;
        }
        const candidate = await this.prisma.productProposal.findFirst({
            where: { materialRequirementId: req.id, isSelected: true, isPurchase: false },
            select: { id: true },
        });
        if (candidate) {
            await this.prisma.productProposal.update({
                where: { id: candidate.id },
                data: { isOffer: true, priceNetto: unitCost },
            });
            return;
        }
        await this.prisma.productProposal.create({
            data: {
                materialRequirementId: req.id,
                productName: '', manufacturer: '',
                isManual: true, isOffer: true, priceNetto: unitCost,
            },
        });
    }
}
