import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertOrderRequirementsDto } from './dto/order-requirements.dto';
import { WbsNodesService } from '../wbs-nodes/wbs-nodes.service';

@Injectable()
export class OrderRequirementsService {
    constructor(
        private prisma: PrismaService,
        private wbsNodes: WbsNodesService,
    ) { }

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

    async findByNodeId(nodeId: string, versionId?: string) {
        if (!nodeId) return null;
        const effectiveNodeId = await this.resolveOrderNodeId(nodeId);
        // 1. Try global version first
        const global = await this.prisma.orderRequirements.findFirst({
            where: { nodeId: effectiveNodeId, versionId: null },
        });
        const record = global || await this.prisma.orderRequirements.findFirst({
            where: { nodeId: effectiveNodeId },
            orderBy: { updatedAt: 'desc' },
        });

        if (!record) return null;

        // 2. Spróbuj zbudować wbsTree z tabeli relacyjnej WbsNode (źródło prawdy)
        try {
            const relationalTree = await this.wbsNodes.getTree(effectiveNodeId, versionId);
            if (relationalTree) {
                return { ...record, wbsTree: JSON.stringify(relationalTree) };
            }
        } catch (e) {
            console.error('WbsNode read failed, falling back to blob:', e?.message);
        }

        // 3. Fallback: zwróć oryginalny blob z OrderRequirements
        return record;
    }

    async upsert(dto: UpsertOrderRequirementsDto) {
        const { nodeId, ...data } = dto;
        const effectiveNodeId = await this.resolveOrderNodeId(nodeId);
        const vId = (dto.versionId === 'null' || dto.versionId === 'undefined' || !dto.versionId) ? null : dto.versionId;

        // Verify node exists
        const node = await this.prisma.processNode.findUnique({ where: { id: effectiveNodeId } });
        if (!node) throw new NotFoundException(`Node ${effectiveNodeId} not found`);

        const result = await this.prisma.$transaction(async (tx) => {
            // Requirements are ALWAYS global for the node
            const existing = await tx.orderRequirements.findFirst({
                where: { nodeId: effectiveNodeId, versionId: null }
            });

            const requirementFields: any = {};
            if (data.offerDeadline !== undefined) requirementFields.offerDeadline = data.offerDeadline ? new Date(data.offerDeadline) : null;
            if (data.projectStart !== undefined) requirementFields.projectStart = data.projectStart ? new Date(data.projectStart) : null;
            if (data.projectEnd !== undefined) requirementFields.projectEnd = data.projectEnd ? new Date(data.projectEnd) : null;
            if (data.projectGoal !== undefined) requirementFields.projectGoal = data.projectGoal;
            if (data.projectItems !== undefined) requirementFields.projectItems = data.projectItems;
            if (data.wbsDescription !== undefined) requirementFields.wbsDescription = data.wbsDescription;
            if (data.clientProjectManager !== undefined) requirementFields.clientProjectManager = data.clientProjectManager;
            if (data.clientProjectManagerPhone !== undefined) requirementFields.clientProjectManagerPhone = data.clientProjectManagerPhone;
            if (data.clientProjectManagerEmail !== undefined) requirementFields.clientProjectManagerEmail = data.clientProjectManagerEmail;
            if (data.clientContacts !== undefined) requirementFields.clientContacts = data.clientContacts;
            if (data.offerStatus !== undefined) requirementFields.offerStatus = data.offerStatus;
            if (data.offerStatusComment !== undefined) requirementFields.offerStatusComment = data.offerStatusComment;
            if (data.wbsTree !== undefined) requirementFields.wbsTree = data.wbsTree;

            // Handle Name Synchronization if projectItems changed
            if (data.projectItems !== undefined && existing?.projectItems) {
                try {
                    const oldItemsJson = JSON.parse(existing.projectItems || '{}');
                    const newItemsJson = JSON.parse(data.projectItems || '{}');

                    const oldItemsMap = new Map();
                    Object.values(oldItemsJson).forEach((list: any) => {
                        (list || []).forEach((item: any) => {
                            if (item.id && item.name) oldItemsMap.set(item.id, item.name);
                        });
                    });

                    const newItemsList: any[] = [];
                    Object.values(newItemsJson).forEach((list: any) => {
                        (list || []).forEach((item: any) => {
                            if (item.id && item.name) newItemsList.push(item);
                        });
                    });

                    for (const item of newItemsList) {
                        const oldName = oldItemsMap.get(item.id);
                        if (oldName && oldName !== item.name) {
                            // 1. Sync all subtasks named after this item or linked via requirementItemId
                            // Update by requirementItemId is most reliable
                            await tx.subtask.updateMany({
                                where: { nodeId: effectiveNodeId, requirementItemId: item.id },
                                data: { name: item.name }
                            });

                            // 2. Sync subtasks that might match the old name exactly but lack the ID (legacy)
                            await tx.subtask.updateMany({
                                where: { nodeId: effectiveNodeId, name: oldName, requirementItemId: null },
                                data: { name: item.name }
                            });

                            // 3. Sync Budget Items linked to these subtasks
                            // Find all subtasks for this item ID across all versions
                            const relatedSubtasks = await tx.subtask.findMany({
                                where: { nodeId: effectiveNodeId, requirementItemId: item.id },
                                select: { id: true }
                            });

                            const subtaskIds = relatedSubtasks.map(s => s.id);

                            if (subtaskIds.length > 0) {
                                // Update budget items that match the old description exactly
                                await tx.budgetLineItem.updateMany({
                                    where: { subtaskId: { in: subtaskIds }, description: oldName },
                                    data: { description: item.name }
                                });
                            }
                        }
                    }

                    // Handle Deletions: if an item was in oldItemsMap but is NOT in newItemsList, delete its Subtasks
                    const newItemsIds = new Set(newItemsList.map(item => item.id));
                    const deletedItemIds = Array.from(oldItemsMap.keys()).filter(id => !newItemsIds.has(id));

                    if (deletedItemIds.length > 0) {
                        // Thanks to onDelete: Cascade on schema, deleting Subtasks will automatically delete BudgetLineItems
                        await tx.subtask.deleteMany({
                            where: { nodeId: effectiveNodeId, requirementItemId: { in: deletedItemIds } }
                        });
                        console.log(`Usunięto osierocone Subtaski dla usuniętych z listy przedmiotów projektu.`);
                    }

                } catch (e) {
                    console.error('Failed to sync item names or deletions:', e);
                }
            }

            if (existing) {
                return tx.orderRequirements.update({
                    where: { id: existing.id },
                    data: requirementFields
                });
            } else {
                return tx.orderRequirements.create({
                    data: {
                        nodeId: effectiveNodeId,
                        versionId: null,
                        ...requirementFields
                    },
                });
            }
        });

        // Dual-write: jeśli wbsTree został zapisany, zsynchronizuj do tabeli relacyjnej WbsNode
        if (data.wbsTree !== undefined) {
            try {
                const tree = JSON.parse(data.wbsTree || '{"items":[]}');
                await this.wbsNodes.saveTree(effectiveNodeId, undefined, tree);
            } catch (e) {
                console.error('WbsNode dual-write failed (non-blocking):', e?.message);
            }
        }

        return result;
    }
}
