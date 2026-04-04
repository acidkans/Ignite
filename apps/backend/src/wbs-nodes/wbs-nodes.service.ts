import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface WbsTreeItem {
    id: string;
    name: string;
    type: string;
    status: string;
    owner: string;
    resources: string;
    cost: string;
    tags: string[];
    children: WbsTreeItem[];
}

@Injectable()
export class WbsNodesService {
    constructor(private prisma: PrismaService) {}

    /**
     * Pobiera drzewo WBS z tabeli relacyjnej i zwraca w formacie JSON blob
     * (kompatybilnym z frontendem).
     * Zwraca null jeśli brak węzłów — caller powinien użyć fallbacku z OrderRequirements.wbsTree.
     */
    async getTree(nodeId: string, versionId?: string): Promise<{ items: WbsTreeItem[] } | null> {
        const vId = this.normalizeVersionId(versionId);

        const nodes = await this.prisma.wbsNode.findMany({
            where: { nodeId, versionId: vId },
            orderBy: { sortOrder: 'asc' },
        });

        if (nodes.length === 0) return null;

        return { items: this.buildTree(nodes, null) };
    }

    /**
     * Zapisuje drzewo WBS z formatu JSON blob do tabeli relacyjnej.
     * Strategia: delete all + insert (atomowe w transakcji).
     * Zachowuje oryginalne UUID z frontendu.
     */
    async saveTree(nodeId: string, versionId: string | undefined, tree: { items: WbsTreeItem[] }): Promise<void> {
        const vId = this.normalizeVersionId(versionId);
        const items = tree?.items || [];

        await this.prisma.$transaction(async (tx) => {
            // Pobierz istniejące węzły żeby zachować pola budżetowe
            const existing = await tx.wbsNode.findMany({
                where: { nodeId, versionId: vId },
                select: {
                    id: true, budgetType: true, unit: true, unitCost: true,
                    quantity: true, totalCost: true, margin: true, discount: true,
                    unitPrice: true, totalPrice: true, comment: true, phase: true,
                },
            });
            const budgetMap = new Map(existing.map(n => [n.id, n]));

            // Zbierz IDs z nowego drzewa
            const newRows = this.flattenForInsert(items, nodeId, vId, null);
            const newIds = new Set(newRows.map(r => r.id));

            // Usuń węzły które nie istnieją w nowym drzewie
            const idsToDelete = existing.filter(n => !newIds.has(n.id)).map(n => n.id);
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
                            owner: row.owner,
                            resources: row.resources,
                            cost: row.cost,
                            tags: row.tags,
                            sortOrder: row.sortOrder,
                        },
                    });
                } else {
                    // Insert nowy węzeł
                    await tx.wbsNode.create({ data: row });
                }
            }
        });
    }

    /**
     * Buduje mapę nodeId → { name, path } dla syncFromMaterials.
     * Zastępuje parsowanie JSON blob w budget.service.ts.
     */
    async getNodeMap(nodeId: string, versionId?: string): Promise<Record<string, { name: string; path: string }>> {
        const vId = this.normalizeVersionId(versionId);
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

    private normalizeVersionId(versionId?: string): string | null {
        return (!versionId || versionId === 'null' || versionId === 'undefined') ? null : versionId;
    }

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
            .map(n => ({
                id: n.id,
                name: n.name,
                type: n.type || '',
                status: n.status || '',
                owner: n.owner || '',
                resources: n.resources || '',
                cost: n.cost || '',
                tags: this.parseTags(n.tags),
                children: this.buildTree(nodes, n.id),
            }));
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
            rows.push({
                id: item.id,
                parentId,
                nodeId,
                versionId,
                name: item.name || '',
                type: item.type || '',
                status: item.status || '',
                owner: item.owner || '',
                resources: item.resources || '',
                cost: item.cost || '',
                tags: Array.isArray(item.tags) && item.tags.length > 0 ? JSON.stringify(item.tags) : null,
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

    // ─── Unified tree (Phase 4) ─────────────────────────────────────────

    /**
     * Zwraca płaską listę węzłów WBS z pełnymi danymi:
     * - pola drzewa (name, type, status, owner)
     * - pola budżetowe (unitCost, quantity, margin, unitPrice, totalPrice)
     * - alokacje materiałowe z cenami
     * - ścieżka w drzewie
     */
    async getUnifiedTree(nodeId: string, versionId?: string) {
        const vId = this.normalizeVersionId(versionId);

        const requestedNodeId = nodeId;
        const fallbackOrderNodeId = await this.resolveOrderNodeId(requestedNodeId);

        console.log(`[WBS] getUnifiedTree: requested=${requestedNodeId}, fallback=${fallbackOrderNodeId}, versionId=${vId}`);

        try {
            // Step 1: Pobierz nodes bez include - najpierw spróbuj requested, potem fallback
            let nodes: any[] = [];
            
            nodes = await this.prisma.wbsNode.findMany({
                where: { nodeId: requestedNodeId, versionId: vId || null },
                orderBy: { sortOrder: 'asc' },
            });
            console.log(`[WBS]   requested node (${requestedNodeId}): found ${nodes.length} nodes`);

            // Fallback do order node jeśli site nie ma nodes
            if (nodes.length === 0 && fallbackOrderNodeId !== requestedNodeId) {
                nodes = await this.prisma.wbsNode.findMany({
                    where: { nodeId: fallbackOrderNodeId, versionId: vId || null },
                    orderBy: { sortOrder: 'asc' },
                });
                console.log(`[WBS]   fallback to parent order (${fallbackOrderNodeId}): found ${nodes.length} nodes`);
            }

            if (nodes.length === 0) {
                console.log(`[WBS]   no nodes found, returning empty items`);
                return { items: [] };
            }

            // Step 2: Pobierz materiały dla wszystkich nodes za jednym razem
            const nodeIds = nodes.map(n => n.id);
            console.log(`[WBS]   fetching materials for ${nodeIds.length} nodes`);
            const allocations = await this.prisma.wbsNodeMaterial.findMany({
                where: { wbsNodeId: { in: nodeIds } },
                include: {
                    material: {
                        select: {
                            id: true, productName: true, manufacturer: true, model: true,
                            unit: true, priceNetto: true, quantity: true, status: true,
                        technicalSpec: true,
                        proposals: {
                            where: { isSelected: true },
                            select: { priceNetto: true, productName: true, manufacturer: true, model: true },
                            take: 1,
                        },
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
                    unit: mat.unit || 'szt',
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
                phase: node.phase,
                // Materials
                materials,
                materialsTotalCost,
                materialsCount: materials.length,
            };
        });

        return { items };
        } catch (err) {
            console.error(`[WBS] ERROR in getUnifiedTree:`, err);
            return { items: [] };
        }
    }

    /**
     * Tworzy nowy węzeł WBS.
     */
    async createNode(data: { nodeId: string; parentId?: string; versionId?: string; name: string; type?: string }) {
        const vId = this.normalizeVersionId(data.versionId);

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
            },
        });
    }

    /**
     * Aktualizuje pola węzła WBS (nazwa, typ, status, owner).
     */
    async updateNode(id: string, data: any) {
        const allowed: Record<string, any> = {};
        for (const key of ['name', 'type', 'status', 'owner', 'resources', 'cost', 'parentId', 'sortOrder']) {
            if (data[key] !== undefined) allowed[key] = data[key];
        }
        return this.prisma.wbsNode.update({ where: { id }, data: allowed });
    }

    /**
     * Usuwa węzeł WBS i rekurencyjnie wszystkie dzieci.
     */
    async deleteNode(id: string) {
        // Zbierz wszystkie ID do usunięcia (węzeł + potomkowie)
        const allIds = await this.collectDescendantIds(id);
        await this.prisma.wbsNode.deleteMany({ where: { id: { in: allIds } } });
        return { deleted: allIds.length };
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
    async updateBudgetFields(id: string, data: any) {
        const unitCost = parseFloat(data.unitCost) || 0;
        const quantity = parseFloat(data.quantity) || 0;
        let margin = parseFloat(data.margin) || 0;
        let discount = parseFloat(data.discount) || 0;
        let unitPrice = parseFloat(data.unitPrice) || 0;

        const totalCost = unitCost * quantity;

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

        const totalPrice = unitPrice * quantity;

        return this.prisma.wbsNode.update({
            where: { id },
            data: {
                budgetType: data.budgetType || data.type || null,
                unit: data.unit || 'szt',
                unitCost,
                quantity,
                totalCost,
                margin,
                discount,
                unitPrice,
                totalPrice,
                comment: data.comment ?? null,
                phase: data.phase ?? null,
            },
        });
    }
}
