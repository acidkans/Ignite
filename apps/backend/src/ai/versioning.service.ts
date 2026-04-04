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

            // 2. Determine source versions to clone from
            let sourceFilter: any;
            let sourceNotes = null;
            if (sourceVersionId && sourceVersionId !== 'null') {
                sourceFilter = { versionId: sourceVersionId };
                const sourceVersion = await tx.projectVersion.findUnique({ where: { id: sourceVersionId }, select: { notes: true } });
                sourceNotes = sourceVersion?.notes;
            } else {
                // Legacy/Fallback: find current active or use baseline
                const activeVersion = await tx.projectVersion.findFirst({
                    where: { nodeId, isActive: true }
                });
                sourceFilter = activeVersion ? { versionId: activeVersion.id } : { versionId: null };
                sourceNotes = activeVersion?.notes;
            }

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
            const subtasks = await tx.subtask.findMany({
                where: { nodeId, ...sourceFilter }
            });

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
                    }
                });
                subtaskIdMap.set(subtask.id, newSubtask.id);
            }

            // 5. Clone Budget Line Items
            const budgetItems = await tx.budgetLineItem.findMany({
                where: { nodeId, ...sourceFilter }
            });

            for (const item of budgetItems) {
                await tx.budgetLineItem.create({
                    data: {
                        nodeId,
                        versionId: newVersion.id,
                        subtaskId: item.subtaskId ? subtaskIdMap.get(item.subtaskId) || null : null,
                        type: item.type,
                        description: item.description,
                        unit: item.unit,
                        unitCost: item.unitCost,
                        quantity: item.quantity,
                        totalCost: item.totalCost,
                        margin: item.margin,
                        unitPrice: item.unitPrice,
                        totalPrice: item.totalPrice,
                        comment: item.comment,
                    }
                });
            }

            // 6. Deactivate other versions
            await tx.projectVersion.updateMany({
                where: {
                    nodeId,
                    id: { not: newVersion.id }
                },
                data: { isActive: false }
            });

            // 5. Clone Order Requirements (including wbsDescription and budgetNotes)
            const sourceReqs = await tx.orderRequirements.findMany({
                where: { nodeId, versionId: sourceFilter.versionId }
            });

            for (const req of sourceReqs) {
                await tx.orderRequirements.create({
                    data: {
                        nodeId,
                        versionId: newVersion.id,
                        offerDeadline: req.offerDeadline,
                        projectStart: req.projectStart,
                        projectEnd: req.projectEnd,
                        projectGoal: req.projectGoal,
                        projectItems: req.projectItems,
                        wbsDescription: req.wbsDescription,
                        budgetNotes: req.budgetNotes,
                        clientContacts: req.clientContacts,
                        clientProjectManager: req.clientProjectManager,
                        clientProjectManagerEmail: req.clientProjectManagerEmail,
                        clientProjectManagerPhone: req.clientProjectManagerPhone,
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
