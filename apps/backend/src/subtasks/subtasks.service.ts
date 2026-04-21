import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubtaskDto, UpdateSubtaskDto, CreateTemplateDto, VisibilityType } from './dto/subtask.dto';

@Injectable()
export class SubtasksService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateSubtaskDto, user: any) {
        const { saveAsTemplate, ...data } = dto;

        const subtask = await this.prisma.subtask.create({
            data: {
                ...data,
                plannedStart: data.plannedStart ? new Date(data.plannedStart) : null,
                plannedEnd: data.plannedEnd ? new Date(data.plannedEnd) : null,
            },
        });

        if (saveAsTemplate) {
            await this.prisma.subtaskTemplate.upsert({
                where: { name: subtask.name },
                update: { description: subtask.description },
                create: { name: subtask.name, description: subtask.description },
            });
        }

        return subtask;
    }

    async findAllAssignedToMe(user: any) {
        const subtasks = await this.prisma.subtask.findMany({
            where: {
                assignedUserId: user.userId,
                OR: [
                    { versionId: null },
                    { version: { isActive: true } },
                ],
            },
            include: {
                assignedUser: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
                files: true,
                node: {
                    select: { id: true, name: true, type: true, customTypeLabel: true }
                }
            },
            orderBy: { plannedStart: 'asc' },
        });

        // Resolve site coordinates — site may be ancestor OR descendant of the order node
        const nodeIds = [...new Set(subtasks.map(s => s.nodeId))];
        const candidates = new Map<string, { lat: number; lng: number; depth: number }>();

        if (nodeIds.length > 0) {
            // Direction 1: site is an ANCESTOR of the order node
            const asAncestors = await this.prisma.processNodeClosure.findMany({
                where: { descendantId: { in: nodeIds }, ancestor: { type: 'site' } },
                include: { ancestor: { select: { site: { select: { addressLatitude: true, addressLongitude: true } } } } },
                orderBy: { depth: 'asc' },
            });
            for (const e of asAncestors) {
                const lat = (e.ancestor as any).site?.addressLatitude;
                const lng = (e.ancestor as any).site?.addressLongitude;
                if (lat == null || lng == null) continue;
                const cur = candidates.get(e.descendantId);
                if (!cur || e.depth < cur.depth) candidates.set(e.descendantId, { lat, lng, depth: e.depth });
            }

            // Direction 2: site is a DESCENDANT of the order node
            const asDescendants = await this.prisma.processNodeClosure.findMany({
                where: { ancestorId: { in: nodeIds }, descendant: { type: 'site' } },
                include: { descendant: { select: { site: { select: { addressLatitude: true, addressLongitude: true } } } } },
                orderBy: { depth: 'asc' },
            });
            for (const e of asDescendants) {
                const lat = (e.descendant as any).site?.addressLatitude;
                const lng = (e.descendant as any).site?.addressLongitude;
                if (lat == null || lng == null) continue;
                const cur = candidates.get(e.ancestorId);
                if (!cur || e.depth < cur.depth) candidates.set(e.ancestorId, { lat, lng, depth: e.depth });
            }
        }

        const coordMap = new Map<string, { lat: number; lng: number }>();
        for (const [nId, { lat, lng }] of candidates) coordMap.set(nId, { lat, lng });

        return subtasks.map(s => ({
            ...s,
            geoCoords: coordMap.get(s.nodeId) ?? null,
        }));
    }

    async findAllByNode(nodeId: string, user: any, versionId?: string) {
        const vId = (versionId === 'null' || versionId === 'undefined' || !versionId) ? null : versionId;

        const isManager = user.roles.some((r: string) => ['ADMIN', 'MANAGER'].includes(r));
        const isLogistyk = user.roles.some((r: string) => r === 'LOGISTYK');

        const where: any = {
            nodeId,
            versionId: vId ? { in: [vId, null] } : null,
        };

        if (!isManager) {
            if (isLogistyk) {
                where.visibilityType = { in: [VisibilityType.ALL, VisibilityType.LOGISTYK_ONLY, VisibilityType.MANAGER_LOGISTYK] };
            } else {
                where.visibilityType = VisibilityType.ALL;
                where.assignedUserId = user.userId;
            }
        }

        return this.prisma.subtask.findMany({
            where,
            include: {
                assignedUser: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
                files: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async update(id: string, dto: UpdateSubtaskDto) {
        return this.prisma.subtask.update({
            where: { id },
            data: {
                ...dto,
                plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : undefined,
                plannedEnd: dto.plannedEnd ? new Date(dto.plannedEnd) : undefined,
            },
        });
    }

    async batchUpsert(nodeId: string, versionId: string, tasks: any[]) {
        const vId = (versionId === 'null' || versionId === 'undefined' || !versionId) ? null : versionId;

        return this.prisma.$transaction(async (tx) => {
            // 1. Fetch current state
            const currentTasks = await tx.subtask.findMany({ where: { nodeId, versionId: vId } });
            const currentBudgetItems = await tx.budgetLineItem.findMany({ where: { nodeId, versionId: vId } });

            const preservedIds = new Set<string>();
            const savedTasks = [];

            // 2. Process ALL tasks from the payload
            for (const t of tasks) {
                if (!t.name) continue;

                // Attempt to find existing task by ID or by matching segment (item + start date)
                let existing = t.id && !t.id.startsWith('temp_') 
                    ? currentTasks.find(curr => curr.id === t.id)
                    : null;

                if (!existing && t.requirementItemId && t.plannedStart) {
                    const tStartStr = new Date(t.plannedStart).toISOString().split('T')[0];
                    existing = currentTasks.find(curr => 
                        !preservedIds.has(curr.id) && 
                        curr.requirementItemId === t.requirementItemId &&
                        curr.plannedStart?.toISOString().split('T')[0] === tStartStr
                    );
                }

                const subtaskData = {
                    name: t.name,
                    description: t.description ?? (existing?.description || null),
                    status: t.status ?? (existing?.status || 'NEW'),
                    phase: t.phase ?? (existing?.phase || 'INSTAL'),
                    category: t.category ?? (existing?.category || null),
                    requirementItemId: t.requirementItemId ?? (existing?.requirementItemId || null),
                    plannedStart: t.plannedStart ? new Date(t.plannedStart) : (existing?.plannedStart || null),
                    plannedEnd: t.plannedEnd ? new Date(t.plannedEnd) : (existing?.plannedEnd || null),
                    isAiGenerated: t.isAiGenerated ?? (existing?.isAiGenerated || false),
                    isApproved: t.isApproved ?? true,
                    visibilityType: t.visibilityType ?? (existing?.visibilityType || 'ALL'),
                    assignedUserId: t.assignedUserId ?? (existing?.assignedUserId || null),
                    nodeId,
                    versionId: vId,
                };

                let saved;
                if (existing) {
                    saved = await tx.subtask.update({ where: { id: existing.id }, data: subtaskData });
                } else {
                    saved = await tx.subtask.create({ data: subtaskData });
                }
                preservedIds.add(saved.id);
                savedTasks.push(saved);
            }

            // 3. Purge orphaned subtasks (those NOT in the current payload)
            await tx.subtask.deleteMany({
                where: { nodeId, versionId: vId, id: { notIn: Array.from(preservedIds) } }
            });

            // 5. BUDGET RECONCILIATION (Manual for reliability)
            const calculateWorkingDays = (start: Date, end: Date) => {
                let count = 0;
                let cur = new Date(start);
                cur.setHours(12, 0, 0, 0);
                const targetEnd = new Date(end);
                targetEnd.setHours(12, 0, 0, 0);
                while (cur <= targetEnd) {
                    count++;
                    cur.setDate(cur.getDate() + 1);
                }
                return count;
            };

            const itemDaysCounter: Record<string, { days: number, name: string, subtaskId: string }> = {};
            const finalTasks = await tx.subtask.findMany({ where: { nodeId, versionId: vId } });

            for (const st of finalTasks) {
                if (!st.requirementItemId || !st.plannedStart) continue;
                const start = new Date(st.plannedStart);
                const end = st.plannedEnd ? new Date(st.plannedEnd) : start;
                const workingDays = calculateWorkingDays(start, end);
                const reqId = String(st.requirementItemId);
                if (!itemDaysCounter[reqId]) {
                    itemDaysCounter[reqId] = { days: 0, name: st.name, subtaskId: st.id };
                }
                itemDaysCounter[reqId].days += workingDays;
            }

            const allBudgetItems = await tx.budgetLineItem.findMany({ where: { nodeId, versionId: vId } });
            // Cleanup: remove orphans and duplicates consistently
            const activeRequirementIds = Object.keys(itemDaysCounter);
            const processedLinks = new Set<string>();

            // Step A: Process existing items
            for (const b of allBudgetItems) {
                const comment = b.comment || '';
                const uuidMatch = comment.match(/(?:WBS_LINK:|WBS_ITEM_)([a-fA-C0-9-]{36})/i);
                const extractedId = uuidMatch ? uuidMatch[1] : null;

                if (!extractedId) continue; // Manual item, skip

                const commentKey = `WBS_LINK:${extractedId}`;
                const userNotes = comment.replace(/(?:WBS_LINK:|WBS_ITEM_)[a-fA-C0-9-]{36}\s*/gi, '').trim();

                // 1. Delete if it's a duplicate or no longer in WBS
                if (processedLinks.has(commentKey) || !activeRequirementIds.includes(extractedId)) {
                    await tx.budgetLineItem.delete({ where: { id: b.id } });
                    continue;
                }

                // 2. Update existing active item
                const data = itemDaysCounter[extractedId];
                await tx.budgetLineItem.update({
                    where: { id: b.id },
                    data: {
                        description: data.name,
                        quantity: data.days,
                        subtaskId: data.subtaskId,
                        comment: `${commentKey} ${userNotes}`.trim(),
                        totalCost: b.unitCost * data.days,
                        totalPrice: b.unitPrice * data.days,
                    }
                });
                processedLinks.add(commentKey);
            }

            // Step B: Create missing items that are new in WBS
            for (const reqId of activeRequirementIds) {
                const commentKey = `WBS_LINK:${reqId}`;
                if (processedLinks.has(commentKey)) continue;

                const data = itemDaysCounter[reqId];
                await tx.budgetLineItem.create({
                    data: {
                        nodeId,
                        versionId: vId,
                        description: data.name,
                        quantity: data.days,
                        subtaskId: data.subtaskId,
                        unit: 'dni',
                        type: 'WORK',
                        comment: commentKey,
                        unitCost: 0, unitPrice: 0, totalCost: 0, totalPrice: 0, margin: 0, discount: 0
                    } as any
                });
            }

            return tx.subtask.findMany({ where: { nodeId, versionId: vId }, orderBy: { createdAt: 'asc' } });
        });
    }

    async delete(id: string) {
        return this.prisma.subtask.delete({ where: { id } });
    }


    // Templates
    async createTemplate(dto: CreateTemplateDto) {
        return this.prisma.subtaskTemplate.create({ data: dto });
    }

    async findAllTemplates() {
        return this.prisma.subtaskTemplate.findMany({
            orderBy: { name: 'asc' },
        });
    }

    async deleteTemplate(id: string) {
        return this.prisma.subtaskTemplate.delete({ where: { id } });
    }
}
