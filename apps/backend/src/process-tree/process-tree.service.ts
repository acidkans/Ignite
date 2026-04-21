import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNodeDto, UpdateNodeDto, MoveNodeDto, NodeType } from './dto/process-tree.dto';
import { writeFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class ProcessTreeService {
    constructor(private prisma: PrismaService) { }

    /**
     * Create a new node and update closure table
     */
    async create(dto: CreateNodeDto, user?: any) {
        return this.prisma.$transaction(async (tx) => {
            // Create the node
            const node = await tx.processNode.create({
                data: {
                    name: dto.name,
                    type: dto.type,
                    parentId: dto.parentId || null,
                    ownerId: user?.userId,  // Set ownerId from user
                },
            });

            // Default Team Permission if user has a team? 
            // User didn't ask for auto-assign, but manual assignment in settings.
            // So leaving as is.

            // Self-loop (depth 0)
            await tx.processNodeClosure.create({
                data: {
                    ancestorId: node.id,
                    descendantId: node.id,
                    depth: 0,
                },
            });

            // If has parent, copy parent's ancestors
            if (dto.parentId) {
                await tx.$executeRaw`
          INSERT INTO process_node_closure ("ancestorId", "descendantId", depth)
          SELECT "ancestorId", ${node.id}, depth + 1
          FROM process_node_closure
          WHERE "descendantId" = ${dto.parentId}
        `;
            }

            // Auto-create "Wizja lokalna" subtask for every new order
            if (dto.type === NodeType.ORDER) {
                await tx.subtask.create({
                    data: {
                        nodeId: node.id,
                        name: 'Wizja lokalna',
                        assignedUserId: node.ownerId || null,
                        plannedStart: node.createdAt,
                        plannedEnd: node.createdAt,
                        status: 'NEW',
                    },
                });
            }

            return node;
        });
    }

    /**
     * Get all root nodes (no parent) with full tree
     */
    async getRoots(user?: any) {
        const roots = await this.prisma.processNode.findMany({
            where: { parentId: null },
            include: {
                owner: true,
                permissions: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        // Load full tree for each root
        const treeResults = await Promise.all(
            roots.map(root => this.getNodeWithDescendants(root.id, user, false))
        );

        // Filter roots (and their trees) if they are not visible
        return treeResults.filter(node => node !== null);
    }

    /**
     * Get full tree starting from a node (or all roots if no id)
     */
    async getTree(rootId?: string, user?: any) {
        if (rootId) {
            return this.getNodeWithDescendants(rootId, user, false);
        }
        return this.getRoots(user);
    }

    /**
     * Get basic node info (lightweight, no relations)
     */
    async getNodeInfo(id: string) {
        const node = await this.prisma.processNode.findUnique({
            where: { id },
            select: { id: true, name: true, customTypeLabel: true, address: true, nip: true, region: true, contactPerson: true, type: true },
        });
        if (!node) throw new NotFoundException(`Node ${id} not found`);
        return node;
    }

    /**
     * Get single node with its direct children
     */
    async getNode(id: string, user?: any, bypassAuth: boolean = false) {
        const node = await this.prisma.processNode.findUnique({
            where: { id },
            include: {
                children: true,
                parent: true,
                owner: true,
                permissions: {
                    include: { user: true },
                },
            },
        });

        if (!node) {
            throw new NotFoundException(`Node ${id} not found`);
        }

        // Check permissions
        if (!bypassAuth && !this.canSee(node, user)) {
            // If strict check failed, check ancestors for inherited permissions?
            // This is needed for direct access to a child node (not via tree recursion).
            // Optimization: Only check ancestors if strict check fails.
            const hasInheritedAccess = await this.checkAncestorAccess(node.id, user);
            if (!hasInheritedAccess) {
                throw new ForbiddenException('You do not have permission to access this node');
            }
        }

        return node;
    }

    /**
     * Get node with all descendants (recursive)
     */
    private async getNodeWithDescendants(nodeId: string, user?: any, parentVisible: boolean = false) {
        let node;
        try {
            // If parent is visible, we bypass auth for child (inheritance)
            node = await this.getNode(nodeId, user, parentVisible);
        } catch (e) {
            if (e instanceof ForbiddenException) return null;
            console.error(`[ProcessTreeService] Error in getNode(${nodeId}):`, e);
            throw e;
        }

        // Recursively load children and filter them
        if (node.children && node.children.length > 0) {
            const childrenWithDescendants = await Promise.all(
                node.children.map((child) => this.getNodeWithDescendants(child.id, user, true)) // Pass true because we see 'node'
            );
            // Filter out nulls (nodes the user cannot see)
            return {
                ...node,
                children: childrenWithDescendants.filter(c => c !== null)
            };
        }

        return node;
    }

    private canSee(node: any, user?: { userId: string, roles: string[], teamIds?: string[] }) {
        if (!user) return true; // Internal calls
        if (!node.visibility) return true; // No visibility set = public

        // Public nodes visible to all
        if (node.visibility === 'public' || node.isPublic) return true;

        // Private nodes: only owner and admins
        if (node.visibility === 'private') {
            if (user.roles?.includes('ADMIN')) return true;
            return node.ownerId === user.userId;
        }

        // Team visibility
        if (node.visibility === 'team') {
            if (user.roles?.includes('ADMIN')) return true;
            if (node.ownerId === user.userId) return true;
            if (user.teamIds && user.teamIds.length > 0 && node.permissions?.some((p: any) => user.teamIds.includes(p.teamId))) return true;
            return false;
        }

        return true;
    }

    private canEdit(node: any, user?: { userId: string, roles: string[], teamIds?: string[] }) {
        if (!user) return true;
        if (user.roles?.includes('ADMIN')) return true;
        if (node.ownerId === user.userId) return true;

        // Sprawdź jawne uprawnienia EDIT lub ADMIN w NodePermission
        if (node.permissions && Array.isArray(node.permissions)) {
            const editPerms = ['EDIT', 'ADMIN'];

            const hasUserEditPerm = node.permissions.some((p: any) =>
                p.userId === user.userId && editPerms.includes(p.permission)
            );
            if (hasUserEditPerm) return true;

            const hasRoleEditPerm = node.permissions.some((p: any) =>
                p.roleType && user.roles?.includes(p.roleType) && editPerms.includes(p.permission)
            );
            if (hasRoleEditPerm) return true;

            if (user.teamIds && user.teamIds.length > 0) {
                const hasTeamEditPerm = node.permissions.some((p: any) =>
                    user.teamIds.includes(p.teamId) && editPerms.includes(p.permission)
                );
                if (hasTeamEditPerm) return true;
            }
        }

        return false;
    }

    /**
     * Get breadcrumb path from node to root
     */
    async getPath(nodeId: string, user?: any) {
        const path = await this.prisma.$queryRaw<Array<{ id: string; name: string; type: string; depth: number }>>`
      SELECT n.id, n.name, n.type, c.depth
      FROM process_nodes n
      JOIN process_node_closure c ON n.id = c."ancestorId"
      WHERE c."descendantId" = ${nodeId}
      ORDER BY c.depth DESC
    `;

        return path;
    }

    /**
     * Update node properties
     */
    async update(id: string, dto: UpdateNodeDto, user?: any) {
        const node = await this.prisma.processNode.findUnique({
            where: { id },
            include: { permissions: true },
        });

        if (!node) {
            throw new NotFoundException(`Node ${id} not found`);
        }

        if (user && !this.canEdit(node, user)) {
            throw new ForbiddenException('You do not have permission to edit this node');
        }

        return this.prisma.processNode.update({
            where: { id },
            data: dto,
        });
    }

    /**
     * Move node to new parent (rebuild closure paths)
     */
    async move(id: string, dto: MoveNodeDto, user?: any) {
        const { newParentId } = dto;

        // Validation: cannot move to self or descendant
        if (id === newParentId) {
            throw new BadRequestException('Cannot move node to itself');
        }

        // Check ownership (cannot move nodes you don't own)
        const node = await this.prisma.processNode.findUnique({
            where: { id },
            include: { permissions: true },
        });
        if (!node) throw new NotFoundException(`Node ${id} not found`);

        if (user && !this.canEdit(node, user)) {
            throw new ForbiddenException('You do not have permission to move this node');
        }

        const isDescendant = await this.prisma.processNodeClosure.findFirst({
            where: {
                ancestorId: id,
                descendantId: newParentId,
            },
        });

        if (isDescendant) {
            throw new BadRequestException('Cannot move node to its own descendant');
        }

        return this.prisma.$transaction(async (tx) => {
            // Delete old closure paths (except self-loops)
            await tx.$executeRaw`
        DELETE FROM process_node_closure
        WHERE "descendantId" IN (
          SELECT "descendantId" 
          FROM process_node_closure 
          WHERE "ancestorId" = ${id}
        )
        AND "ancestorId" IN (
          SELECT "ancestorId" 
          FROM process_node_closure 
          WHERE "descendantId" = ${id} 
          AND depth > 0
        )
      `;

            // Update parent reference
            await tx.processNode.update({
                where: { id },
                data: { parentId: newParentId },
            });

            // Rebuild closure paths for new parent
            await tx.$executeRaw`
        INSERT INTO process_node_closure ("ancestorId", "descendantId", depth)
        SELECT p."ancestorId", c."descendantId", p.depth + c.depth + 1
        FROM process_node_closure p, process_node_closure c
        WHERE p."descendantId" = ${newParentId} 
        AND c."ancestorId" = ${id}
      `;

            return tx.processNode.findUnique({
                where: { id },
                include: { parent: true },
            });
        });
    }

    /**
     * Delete node and all descendants
     */
    async delete(id: string, user?: any) {
        const node = await this.prisma.processNode.findUnique({
            where: { id },
            include: { permissions: true },
        });

        if (!node) {
            throw new NotFoundException(`Node ${id} not found`);
        }

        if (user && !this.canEdit(node, user)) {
            throw new ForbiddenException('You do not have permission to delete this node');
        }

        return this.prisma.$transaction(async (tx) => {
            // Get all descendants (including self)
            const descendants = await tx.processNodeClosure.findMany({
                where: { ancestorId: id },
                select: { descendantId: true },
            });

            const descendantIds = descendants.map((d) => d.descendantId);

            // Delete closure entries
            await tx.processNodeClosure.deleteMany({
                where: {
                    OR: [
                        { ancestorId: { in: descendantIds } },
                        { descendantId: { in: descendantIds } },
                    ],
                },
            });

            // Delete nodes
            await tx.processNode.deleteMany({
                where: { id: { in: descendantIds } },
            });

            return { deleted: descendantIds.length };
        });
    }

    /**
     * Update node permissions
     */
    async updateNodePermissions(nodeId: string, dto: any, user?: any) {
        // Sprawdź czy wywołujący ma prawo zmieniać uprawnienia (właściciel lub ADMIN)
        if (user) {
            const node = await this.prisma.processNode.findUnique({
                where: { id: nodeId },
                include: { permissions: true },
            });
            if (!node) throw new NotFoundException(`Node ${nodeId} not found`);
            if (!this.canEdit(node, user)) {
                throw new ForbiddenException('You do not have permission to manage permissions for this node');
            }
        }

        return this.prisma.$transaction(async (tx) => {
            // Update node fields
            const updates: any = {};
            if (dto.isPublic !== undefined) updates.isPublic = dto.isPublic;
            if (dto.visibility) updates.visibility = dto.visibility;
            if (dto.ownerId) updates.ownerId = dto.ownerId;

            if (Object.keys(updates).length > 0) {
                await tx.processNode.update({
                    where: { id: nodeId },
                    data: updates,
                });
            }

            // Clear existing permissions
            await tx.nodePermission.deleteMany({
                where: { nodeId },
            });

            // Add user-specific permissions
            if (dto.userPermissions && dto.userPermissions.length > 0) {
                await tx.nodePermission.createMany({
                    data: dto.userPermissions.map((up) => ({
                        nodeId,
                        userId: up.userId,
                        permission: up.permission,
                    })),
                });
            }

            // Add role-specific permissions
            if (dto.rolePermissions && dto.rolePermissions.length > 0) {
                await tx.nodePermission.createMany({
                    data: dto.rolePermissions.map((rp) => ({
                        nodeId,
                        roleType: rp.roleType,
                        permission: rp.permission,
                    })),
                });
            }

            // Add team-specific permissions
            if (dto.teamPermissions && dto.teamPermissions.length > 0) {
                await tx.nodePermission.createMany({
                    data: dto.teamPermissions.map((tp) => ({
                        nodeId,
                        teamId: tp.teamId,
                        permission: tp.permission,
                    })),
                });
            }

            return tx.processNode.findUnique({
                where: { id: nodeId },
                include: { permissions: { include: { user: true } } },
            });
        });
    }

    /**
     * Get node permissions
     */
    async getNodePermissions(nodeId: string) {
        return this.prisma.processNode.findUnique({
            where: { id: nodeId },
            include: {
                owner: true,
                permissions: {
                    include: { user: true, team: true },
                },
            },
        });
    }

    private async checkAncestorAccess(nodeId: string, user?: { userId: string, roles: string[], teamIds?: string[] }): Promise<boolean> {
        if (!user) return true;

        // Find all ancestors
        const ancestors = await this.prisma.processNodeClosure.findMany({
            where: { descendantId: nodeId, depth: { gt: 0 } }, // ancestors only
            include: {
                ancestor: {
                    include: {
                        permissions: true
                    }
                }
            }
        });

        // Check if any ancestor grants access
        for (const record of ancestors) {
            const node = record.ancestor;
            if (this.canSee(node, user)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Bulk update permissions
     */
    async bulkUpdatePermissions(dto: any) {
        const updates: any = {};
        if (dto.isPublic !== undefined) updates.isPublic = dto.isPublic;
        if (dto.visibility) updates.visibility = dto.visibility;

        await this.prisma.processNode.updateMany({
            where: { id: { in: dto.nodeIds } },
            data: updates,
        });

        return { updated: dto.nodeIds.length };
    }

    /**
     * Get all descendant IDs for a given node (including self)
     */
    async takeSnapshot() {
        console.log('[Snapshot] Starting database snapshot...');
        
        const [users, roles, userRoles, nodes, closure, requirements, budgetItems, versions, subtasks, teams, nodePermissions] = await Promise.all([
            this.prisma.user.findMany(),
            this.prisma.role.findMany(),
            this.prisma.userRole.findMany(),
            this.prisma.processNode.findMany(),
            this.prisma.processNodeClosure.findMany(),
            this.prisma.orderRequirements.findMany(),
            this.prisma.budgetLineItem.findMany(),
            this.prisma.projectVersion.findMany(),
            this.prisma.subtask.findMany(),
            this.prisma.team.findMany(),
            this.prisma.nodePermission.findMany(),
        ]);

        const scriptContent = `
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();

async function main() {
    console.log('Restoring database from emergency snapshot...');

    // 1. Roles
    const roles = ${JSON.stringify(roles, null, 8)};
    for (const item of roles) {
        await prisma.role.upsert({ where: { id: item.id }, update: item, create: item });
    }
    console.log('Roles restored.');

    // 2. Teams
    const teams = ${JSON.stringify(teams, null, 8)};
    for (const item of teams) {
        await prisma.team.upsert({ where: { id: item.id }, update: item, create: item });
    }
    console.log('Teams restored.');

    // 3. Users
    const users = ${JSON.stringify(users, null, 8)};
    for (const item of users) {
        await prisma.user.upsert({ where: { id: item.id }, update: item, create: item });
    }
    console.log('Users restored.');

    // 4. UserRoles
    const userRoles = ${JSON.stringify(userRoles, null, 8)};
    for (const item of userRoles) {
        await prisma.userRole.upsert({ 
            where: { userId_roleId: { userId: item.userId, roleId: item.roleId } }, 
            update: item, 
            create: item 
        });
    }
    console.log('User roles restored.');

    // 5. Nodes
    const nodes = ${JSON.stringify(nodes, null, 8)};
    for (const item of nodes) {
        await prisma.processNode.upsert({ where: { id: item.id }, update: item, create: item });
    }
    console.log('Nodes restored.');

    // 6. Closure Table
    const closure = ${JSON.stringify(closure, null, 8)};
    for (const item of closure) {
        await prisma.processNodeClosure.upsert({ 
            where: { ancestorId_descendantId: { ancestorId: item.ancestorId, descendantId: item.descendantId } }, 
            update: item, 
            create: item 
        });
    }
    console.log('Closure table restored.');

    // 7. Node Permissions (ACL)
    const nodePermissions = ${JSON.stringify(nodePermissions, null, 8)};
    for (const item of nodePermissions) {
        await prisma.nodePermission.upsert({ 
            where: { id: item.id }, 
            update: item, 
            create: item 
        });
    }
    console.log('Node permissions restored.');

    // 8. Versions
    const versions = ${JSON.stringify(versions, null, 8)};
    for (const item of versions) {
        await prisma.projectVersion.upsert({ 
            where: { nodeId_label: { nodeId: item.nodeId, label: item.label } }, 
            update: item, 
            create: item 
        });
    }
    console.log('Versions restored.');

    // 9. Order Requirements
    const requirements = ${JSON.stringify(requirements, null, 8)};
    for (const item of requirements) {
        await prisma.orderRequirements.upsert({ where: { id: item.id }, update: item, create: item });
    }
    console.log('Requirements restored.');

    // 10. Budget Line Items
    const budgetItems = ${JSON.stringify(budgetItems, null, 8)};
    for (const item of budgetItems) {
        await prisma.budgetLineItem.upsert({ where: { id: item.id }, update: item, create: item });
    }
    console.log('Budget items restored.');

    // 11. Subtasks
    const subtasks = ${JSON.stringify(subtasks, null, 8)};
    for (const item of subtasks) {
        await prisma.subtask.upsert({ where: { id: item.id }, update: item, create: item });
    }
    console.log('Subtasks restored.');

    console.log('Database restoration complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
`;

        const filePath = join(process.cwd(), 'prisma', 'emergency-restore.js');
        writeFileSync(filePath, scriptContent);
        console.log('[Snapshot] Saved to ' + filePath);
        
        return { 
            success: true, 
            message: 'Database snapshot saved to emergency-restore.js',
            stats: {
                users: users.length,
                nodes: nodes.length,
                budgetItems: budgetItems.length
            }
        };
    }

    async getAllDescendantIds(nodeId: string): Promise<string[]> {
        const closure = await this.prisma.processNodeClosure.findMany({
            where: { ancestorId: nodeId },
            select: { descendantId: true }
        });
        return closure.map(c => c.descendantId);
    }
}
