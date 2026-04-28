import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VersioningService {
    private readonly logger = new Logger(VersioningService.name);

    constructor(private prisma: PrismaService) { }

    async createVersion(nodeId: string, label: string, sourceVersionId?: string) {
        this.logger.log(`Creating version ${label} for node ${nodeId} (source: ${sourceVersionId || 'baseline'})`);

        return this.prisma.$transaction(async (tx) => {
            // 1. Check if node exists
            const node = await tx.processNode.findUnique({
                where: { id: nodeId }
            });

            if (!node) throw new NotFoundException('Node not found');

            // 2. Determine source version to clone from
            let sourceVId: string | null = null;
            let sourceNotes: string | null = null;
            if (sourceVersionId && sourceVersionId !== 'null') {
                sourceVId = sourceVersionId;
                const sourceVersion = await tx.projectVersion.findUnique({ where: { id: sourceVersionId }, select: { notes: true } });
                sourceNotes = sourceVersion?.notes ?? null;
            } else {
                const activeVersion = await tx.projectVersion.findFirst({ where: { nodeId, isActive: true } });
                sourceVId = activeVersion?.id ?? null;
                sourceNotes = activeVersion?.notes ?? null;
            }

            // Snapshot to pełny freeze: jeśli źródło to wersja i ma własne wiersze,
            // klonujemy WYŁĄCZNIE jej wiersze (nie scalamy z baseline). Pusta wersja → baseline.
            // Spójne z `getUnifiedTree`.
            const loadSourceRows = async <T extends { id: string }>(
                findMany: (where: any) => Promise<T[]>,
            ): Promise<T[]> => {
                if (sourceVId == null) return findMany({ versionId: null });
                const versioned = await findMany({ versionId: sourceVId });
                if (versioned.length > 0) return versioned;
                return findMany({ versionId: null });
            };

            // 3. Create ProjectVersion
            const newVersion = await tx.projectVersion.create({
                data: {
                    nodeId,
                    label,
                    isActive: true,
                    notes: sourceNotes
                }
            });

            // 4. Clone Subtasks (WBS) with ID mapping
            const subtasks = await loadSourceRows((extra) => tx.subtask.findMany({
                where: { nodeId, ...extra }
            }));

            const subtaskIdMap = new Map<string, string>();

            for (const subtask of subtasks) {
                const newSubtask = await tx.subtask.create({
                    data: {
                        nodeId,
                        versionId: newVersion.id,
                        name: subtask.name,
                        description: subtask.description,
                        plannedStart: subtask.plannedStart,
                        plannedEnd: subtask.plannedEnd,
                        assignedUserId: subtask.assignedUserId,
                        status: subtask.status,
                        visibilityType: subtask.visibilityType,
                        category: subtask.category,
                        phase: subtask.phase,
                        requirementItemId: subtask.requirementItemId,
                        isAiGenerated: subtask.isAiGenerated,
                        isApproved: subtask.isApproved,
                    }
                });
                subtaskIdMap.set(subtask.id, newSubtask.id);
            }

            // 5. Clone WBS Nodes with ID mapping (must happen before BudgetLineItem
            //    so wbsNodeId can be remapped to the new tree)
            const wbsRaw = await loadSourceRows((extra) => tx.wbsNode.findMany({
                where: { nodeId, ...extra },
                orderBy: { sortOrder: 'asc' },
            }));
            const wbsNodes = wbsRaw.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

            const wbsIdMap = new Map<string, string>();

            // First pass: create all nodes without parentId
            for (const wn of wbsNodes) {
                const newId = require('crypto').randomUUID();
                wbsIdMap.set(wn.id, newId);
                await tx.wbsNode.create({
                    data: {
                        id: newId,
                        nodeId,
                        versionId: newVersion.id,
                        parentId: null, // set in second pass
                        name: wn.name,
                        type: wn.type,
                        status: wn.status,
                        owner: wn.owner,
                        resources: wn.resources,
                        cost: wn.cost,
                        tags: wn.tags,
                        qa: wn.qa,
                        sortOrder: wn.sortOrder,
                        budgetType: wn.budgetType,
                        unit: wn.unit,
                        unitCost: wn.unitCost,
                        quantity: wn.quantity,
                        totalCost: wn.totalCost,
                        margin: wn.margin,
                        discount: wn.discount,
                        unitPrice: wn.unitPrice,
                        totalPrice: wn.totalPrice,
                        comment: wn.comment,
                        phase: wn.phase,
                    },
                });
            }

            // Second pass: set parentId references
            for (const wn of wbsNodes) {
                if (wn.parentId && wbsIdMap.has(wn.parentId)) {
                    await tx.wbsNode.update({
                        where: { id: wbsIdMap.get(wn.id)! },
                        data: { parentId: wbsIdMap.get(wn.parentId)! },
                    });
                }
            }

            // 6. Clone Budget Line Items (with subtaskId + wbsNodeId remap)
            const budgetItems = await loadSourceRows((extra) => tx.budgetLineItem.findMany({
                where: { nodeId, ...extra }
            }));

            for (const item of budgetItems) {
                await tx.budgetLineItem.create({
                    data: {
                        nodeId,
                        versionId: newVersion.id,
                        subtaskId: item.subtaskId ? subtaskIdMap.get(item.subtaskId) || null : null,
                        wbsNodeId: item.wbsNodeId ? wbsIdMap.get(item.wbsNodeId) || null : null,
                        type: item.type,
                        description: item.description,
                        unit: item.unit,
                        unitCost: item.unitCost,
                        quantity: item.quantity,
                        totalCost: item.totalCost,
                        margin: item.margin,
                        discount: item.discount,
                        unitPrice: item.unitPrice,
                        totalPrice: item.totalPrice,
                        comment: item.comment,
                    }
                });
            }

            // 7. Clone WBS Node Material allocations
            const wbsMaterials = await tx.wbsNodeMaterial.findMany({
                where: { wbsNodeId: { in: wbsNodes.map(n => n.id) } },
            });

            for (const wm of wbsMaterials) {
                const newWbsId = wbsIdMap.get(wm.wbsNodeId);
                if (newWbsId) {
                    await tx.wbsNodeMaterial.create({
                        data: {
                            wbsNodeId: newWbsId,
                            materialId: wm.materialId,
                            quantity: wm.quantity,
                        },
                    });
                }
            }

            // 8. Clone WbsMarkerLink (powiązania węzłów WBS ze schematicznymi markerami/załącznikami)
            const wbsLinks = await tx.wbsMarkerLink.findMany({
                where: { wbsNodeId: { in: wbsNodes.map(n => n.id) } },
            });

            for (const link of wbsLinks) {
                const newWbsId = wbsIdMap.get(link.wbsNodeId);
                if (!newWbsId) continue;
                try {
                    await tx.wbsMarkerLink.create({
                        data: {
                            wbsNodeId: newWbsId,
                            markerId: link.markerId,
                        },
                    });
                } catch {
                    // Unique (wbsNodeId, markerId) — ignoruj duplikaty
                }
            }

            // 9. Deactivate other versions
            await tx.projectVersion.updateMany({
                where: {
                    nodeId,
                    id: { not: newVersion.id }
                },
                data: { isActive: false }
            });

            // 10. Clone Order Requirements (full carry-over — w tym status oferty).
            // OrderRequirements ma unique (nodeId, versionId), więc bierzemy dokładnie
            // jeden wiersz źródłowy — preferowana wersja, fallback baseline.
            let sourceReq = sourceVId
                ? await tx.orderRequirements.findFirst({ where: { nodeId, versionId: sourceVId } })
                : null;
            if (!sourceReq) {
                sourceReq = await tx.orderRequirements.findFirst({ where: { nodeId, versionId: null } });
            }

            if (sourceReq) {
                await tx.orderRequirements.create({
                    data: {
                        nodeId,
                        versionId: newVersion.id,
                        offerDeadline: sourceReq.offerDeadline,
                        projectStart: sourceReq.projectStart,
                        projectEnd: sourceReq.projectEnd,
                        projectGoal: sourceReq.projectGoal,
                        projectItems: sourceReq.projectItems,
                        wbsDescription: sourceReq.wbsDescription,
                        budgetNotes: sourceReq.budgetNotes,
                        clientContacts: sourceReq.clientContacts,
                        clientProjectManager: sourceReq.clientProjectManager,
                        clientProjectManagerEmail: sourceReq.clientProjectManagerEmail,
                        clientProjectManagerPhone: sourceReq.clientProjectManagerPhone,
                        offerStatus: sourceReq.offerStatus,
                        offerStatusComment: sourceReq.offerStatusComment,
                    }
                });
            }

            return newVersion;
        });
    }

    async getVersions(nodeId: string) {
        return this.prisma.projectVersion.findMany({
            where: { nodeId },
            orderBy: { createdAt: 'desc' }
        });
    }

    async setActiveVersion(versionId: string) {
        const version = await this.prisma.projectVersion.findUnique({ where: { id: versionId } });
        if (!version) throw new NotFoundException('Version not found');

        await this.prisma.$transaction([
            this.prisma.projectVersion.updateMany({
                where: { nodeId: version.nodeId },
                data: { isActive: false }
            }),
            this.prisma.projectVersion.update({
                where: { id: versionId },
                data: { isActive: true }
            })
        ]);

        return version;
    }

    async deleteVersion(versionId: string) {
        const version = await this.prisma.projectVersion.findUnique({ where: { id: versionId } });
        if (!version) throw new NotFoundException('Version not found');

        // Records with versionId will be deleted automatically due to Cascade settings in schema
        return this.prisma.projectVersion.delete({
            where: { id: versionId }
        });
    }
}
