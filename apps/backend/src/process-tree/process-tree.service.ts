import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNodeDto, UpdateNodeDto, MoveNodeDto, NodeType } from './dto/process-tree.dto';
import { writeFileSync } from 'fs';
import { join } from 'path';

// @anchor child-order — kolejność rodzeństwa w drzewie: sortOrder (drag&drop w belce), remis → data utworzenia
const CHILD_ORDER: { sortOrder?: 'asc'; createdAt?: 'asc' }[] = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

@Injectable()
export class ProcessTreeService {
    constructor(private prisma: PrismaService) { }

    /**
     * Create a new node and update closure table
     */
    async create(dto: CreateNodeDto, user?: any) {
        return this.prisma.$transaction(async (tx) => {
            // Create the node
            const isOrder = dto.type === NodeType.ORDER;
            const node = await tx.processNode.create({
                data: {
                    name: dto.name,
                    type: dto.type,
                    parentId: dto.parentId || null,
                    ownerId: user?.userId,  // Set ownerId from user
                    // Zamówienie: widoczność wyłącznie z zespołu zamówienia (albo publiczne).
                    ...(isOrder ? { visibility: dto.isPublic ? 'public' : 'team', isPublic: !!dto.isPublic } : {}),
                },
            });

            if (isOrder) {
                await this.createOrderTeam(tx, node.id, node.name, [user?.userId, ...(dto.teamUserIds || [])]);
            }

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

            // Auto-create "Wizja lokalna" task (UserTask) for every new order
            if (dto.type === NodeType.ORDER) {
                // Eager: każde zamówienie rodzi się z realną wersją "pierwszy" (aktywną).
                // Cała treść (WBS) idzie na tę wersję zamiast na baseline null.
                // OrderRequirements pozostaje globalny (versionId=null) — pola wspólne dla
                // wszystkich wersji (offerStatus, projectGoal, projectItems, clientContacts).
                const firstVersion = await tx.projectVersion.create({
                    data: { nodeId: node.id, label: 'pierwszy', isActive: true },
                });
                const versionId = firstVersion.id;
                // Odpowiedzialny = zakładający zamówienie. Bez syncu do MS przy tworzeniu (zapis w transakcji) —
                // trafi do To Do / Outlooka przy pierwszej edycji.
                if (node.ownerId) {
                    await tx.userTask.create({
                        data: {
                            userId: node.ownerId,
                            createdById: node.ownerId,
                            nodeId: node.id,
                            title: 'Wizja lokalna',
                            plannedEnd: node.createdAt,
                            status: 'TO_DO',
                            source: 'IGNITE',
                        },
                    });
                }
                const pytaniaNode = await tx.wbsNode.create({
                    data: {
                        nodeId: node.id,
                        versionId: versionId,
                        name: 'PYTANIA OGÓLNE',
                        status: '',
                        sortOrder: 0,
                    },
                });

                // Gałąź "Koszty ogólne" (wcześniej "Zarządzanie projektem") — tworzona
                // dla każdego nowego zlecenia, analogicznie do "PYTANIA OGÓLNE".
                // Zbiera koszty nieprzypisane do przedmiotu projektu: zarządzanie,
                // wizję lokalną, paliwo, dokumentację powykonawczą, wizytę
                // gwarancyjną i logistykę.
                // Właściciel liści zostaje pusty — przypisuje go użytkownik w WBS.
                const mgmtBranch = await tx.wbsNode.create({
                    data: {
                        nodeId: node.id,
                        versionId: versionId,
                        name: 'Koszty ogólne',
                        status: '',
                        sortOrder: 1,
                    },
                });
                const mgmtLeaf = await tx.wbsNode.create({
                    data: {
                        nodeId: node.id,
                        versionId: versionId,
                        parentId: mgmtBranch.id,
                        name: 'Zarządzanie projektem',
                        type: 'work',
                        status: '',
                        unit: 'pakiet',
                        owner: '',
                        comment: 'utworzony automatycznie',
                        sortOrder: 0,
                    },
                });
                // Liść "Wizja lokalna" — praca, 1 dzień, dla każdego nowego zlecenia
                const wizjaLeaf = await tx.wbsNode.create({
                    data: {
                        nodeId: node.id,
                        versionId: versionId,
                        parentId: mgmtBranch.id,
                        name: 'Wizja lokalna',
                        type: 'work',
                        status: '',
                        unit: 'dni',
                        quantity: 1,
                        owner: '',
                        comment: 'utworzony automatycznie',
                        sortOrder: 1,
                    },
                });
                // Liść "Paliwo" — kilometry, bez ceny i ilości: cenę, narzut i km (2 × odległość)
                // nadaje zapis modalu „Domyślne wartości" (apply-fuel-defaults w UnifiedWbsPanel)
                const paliwoLeaf = await tx.wbsNode.create({
                    data: {
                        nodeId: node.id,
                        versionId: versionId,
                        parentId: mgmtBranch.id,
                        name: 'Paliwo',
                        type: 'fuel',
                        status: '',
                        unit: 'kilometry',
                        comment: 'utworzony automatycznie',
                        sortOrder: 2,
                    },
                });
                // Liść "Dokumentacja powykonawcza" — praca rozliczana pakietowo
                const dokumentacjaLeaf = await tx.wbsNode.create({
                    data: {
                        nodeId: node.id,
                        versionId: versionId,
                        parentId: mgmtBranch.id,
                        name: 'Dokumentacja powykonawcza',
                        type: 'work',
                        status: '',
                        unit: 'pakiet',
                        comment: 'utworzony automatycznie',
                        sortOrder: 3,
                    },
                });
                // Liść "Wizyta gwarancyjna" — praca, 2 dni (budżet gwarancyjny 24m)
                const gwarancjaLeaf = await tx.wbsNode.create({
                    data: {
                        nodeId: node.id,
                        versionId: versionId,
                        parentId: mgmtBranch.id,
                        name: 'Wizyta gwarancyjna',
                        type: 'work',
                        status: '',
                        unit: 'dni',
                        quantity: 2,
                        comment: 'utworzony automatycznie',
                        sortOrder: 4,
                    },
                });
                // Liść "Logistyka" — praca rozliczana pakietowo
                const logistykaLeaf = await tx.wbsNode.create({
                    data: {
                        nodeId: node.id,
                        versionId: versionId,
                        parentId: mgmtBranch.id,
                        name: 'Logistyka',
                        type: 'work',
                        status: '',
                        unit: 'pakiet',
                        comment: 'utworzony automatycznie',
                        sortOrder: 5,
                    },
                });

                // Utwórz OrderRequirements z wbsTree żeby gałęzie pojawiły się w panelu struktury
                await tx.orderRequirements.create({
                    data: {
                        nodeId: node.id,
                        versionId: null,
                        wbsTree: JSON.stringify({
                            items: [
                                {
                                    id: pytaniaNode.id,
                                    name: 'PYTANIA OGÓLNE',
                                    type: '',
                                    status: '',
                                    unit: '',
                                    owner: '',
                                    resources: '',
                                    cost: '',
                                    comment: '',
                                    tags: [],
                                    qa: [],
                                    children: [],
                                },
                                {
                                    id: mgmtBranch.id,
                                    name: 'Koszty ogólne',
                                    type: '',
                                    status: '',
                                    unit: '',
                                    owner: '',
                                    resources: '',
                                    cost: '',
                                    comment: '',
                                    tags: [],
                                    qa: [],
                                    children: [
                                        {
                                            id: mgmtLeaf.id,
                                            name: 'Zarządzanie projektem',
                                            type: 'work',
                                            status: '',
                                            unit: 'pakiet',
                                            owner: '',
                                            resources: '',
                                            cost: '',
                                            comment: 'utworzony automatycznie',
                                            tags: [],
                                            qa: [],
                                            children: [],
                                        },
                                        {
                                            id: wizjaLeaf.id,
                                            name: 'Wizja lokalna',
                                            type: 'work',
                                            status: '',
                                            unit: 'dni',
                                            quantity: 1,
                                            owner: '',
                                            resources: '',
                                            cost: '',
                                            comment: 'utworzony automatycznie',
                                            tags: [],
                                            qa: [],
                                            children: [],
                                        },
                                        {
                                            id: paliwoLeaf.id,
                                            name: 'Paliwo',
                                            type: 'fuel',
                                            status: '',
                                            unit: 'kilometry',
                                            owner: '',
                                            resources: '',
                                            cost: '',
                                            comment: 'utworzony automatycznie',
                                            tags: [],
                                            qa: [],
                                            children: [],
                                        },
                                        {
                                            id: dokumentacjaLeaf.id,
                                            name: 'Dokumentacja powykonawcza',
                                            type: 'work',
                                            status: '',
                                            unit: 'pakiet',
                                            owner: '',
                                            resources: '',
                                            cost: '',
                                            comment: 'utworzony automatycznie',
                                            tags: [],
                                            qa: [],
                                            children: [],
                                        },
                                        {
                                            id: gwarancjaLeaf.id,
                                            name: 'Wizyta gwarancyjna',
                                            type: 'work',
                                            status: '',
                                            unit: 'dni',
                                            quantity: 2,
                                            owner: '',
                                            resources: '',
                                            cost: '',
                                            comment: 'utworzony automatycznie',
                                            tags: [],
                                            qa: [],
                                            children: [],
                                        },
                                        {
                                            id: logistykaLeaf.id,
                                            name: 'Logistyka',
                                            type: 'work',
                                            status: '',
                                            unit: 'pakiet',
                                            owner: '',
                                            resources: '',
                                            cost: '',
                                            comment: 'utworzony automatycznie',
                                            tags: [],
                                            qa: [],
                                            children: [],
                                        },
                                    ],
                                },
                            ],
                        }),
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
            orderBy: CHILD_ORDER,
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
            select: { id: true, name: true, customTypeLabel: true, address: true, nip: true, region: true, contactPerson: true, type: true, taskListSlug: true },
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
                children: { orderBy: CHILD_ORDER },
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
            // If parent is visible, we bypass auth for child (inheritance) — z wyjątkiem zamówienia:
            // jego widoczność bierze się WYŁĄCZNIE z jego zespołu (can-see-order), nie z folderu.
            node = await this.getNodeForTree(nodeId, user, parentVisible);
        } catch (e) {
            if (e instanceof ForbiddenException) {
                // @anchor tree-folder-passthrough — niewidoczny folder i tak pokazuje się jako
                // ścieżka do zamówień, których zespół obejmuje użytkownika (bez reszty dzieci).
                return this.getFolderPassthrough(nodeId, user);
            }
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

    private async getNodeForTree(nodeId: string, user: any, parentVisible: boolean) {
        const bare = await this.prisma.processNode.findUnique({ where: { id: nodeId }, select: { type: true } });
        const bypass = parentVisible && bare?.type !== NodeType.ORDER;
        if (bypass || !user) return this.getNode(nodeId, user, bypass);
        const node = await this.prisma.processNode.findUnique({
            where: { id: nodeId },
            include: { children: { orderBy: CHILD_ORDER }, parent: true, owner: true, permissions: { include: { user: true } } },
        });
        if (!node) throw new NotFoundException(`Node ${nodeId} not found`);
        if (!this.canSee(node, user)) throw new ForbiddenException('You do not have permission to access this node');
        return node;
    }

    private async getFolderPassthrough(nodeId: string, user: any) {
        const node = await this.prisma.processNode.findUnique({
            where: { id: nodeId },
            include: { children: { orderBy: CHILD_ORDER }, parent: true, owner: true, permissions: { include: { user: true } } },
        });
        if (!node || node.type === NodeType.ORDER || !node.children?.length) return null;
        const kids = (await Promise.all(node.children.map(c => this.getNodeWithDescendants(c.id, user, false))))
            .filter(c => c !== null);
        if (kids.length === 0) return null;
        return { ...node, children: kids, _passthrough: true };
    }

    private canSee(node: any, user?: { userId: string, roles: string[], teamIds?: string[] }) {
        if (!user) return true; // Internal calls

        // @anchor can-see-order — zamówienie widzi WYŁĄCZNIE: ADMIN, właściciel, członek zespołu
        // zamówienia (jego jedyne uprawnienie w NodePermission), albo wszyscy gdy publiczne.
        // Bez dziedziczenia z folderu i bez uprawnień bezpośrednich na osobę.
        if (node.type === NodeType.ORDER) {
            if (user.roles?.includes('ADMIN')) return true;
            if (node.visibility === 'public' || node.isPublic) return true;
            if (node.ownerId === user.userId) return true;
            return !!(user.teamIds?.length && node.permissions?.some((p: any) => p.teamId && user.teamIds.includes(p.teamId)));
        }

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
        // Zamówienie: uprawnienia z zespołu zamówienia — członek edytuje.
        if (node.type === NodeType.ORDER) return this.canSee(node, user);

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
    // @anchor process-tree-slug-check
    async checkSlugAvailable(slug: string, excludeNodeId?: string): Promise<{ available: boolean }> {
        const existing = await this.prisma.processNode.findUnique({ where: { taskListSlug: slug } });
        const available = !existing || existing.id === excludeNodeId;
        return { available };
    }

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

        const updated = await this.prisma.processNode.update({
            where: { id },
            data: dto,
        });
        if (node.type === NodeType.ORDER && dto.name && dto.name !== node.name) {
            const team = await this.prisma.team.findUnique({ where: { orderNodeId: id } });
            if (team) {
                await this.prisma.team.update({ where: { id: team.id }, data: { name: await this.uniqueTeamName(this.prisma, dto.name, id, team.id) } });
            }
        }
        return updated;
    }

    // ── Zespół zamówienia ────────────────────────────────────────────────────
    // @anchor unique-team-name — Team.name jest unikalne; zamówienia o tej samej nazwie
    // (albo zespół działowy o tej nazwie) dostają dopisek z początkiem id zamówienia.
    private async uniqueTeamName(db: any, name: string, orderNodeId: string, excludeTeamId?: string): Promise<string> {
        const base = (name || 'Zamówienie').trim();
        const clash = await db.team.findFirst({
            where: { name: { equals: base, mode: 'insensitive' }, ...(excludeTeamId ? { NOT: { id: excludeTeamId } } : {}) },
            select: { id: true },
        });
        return clash ? `${base} (${orderNodeId.slice(0, 8)})` : base;
    }

    // @anchor create-order-team — zespół zamówienia + jedyne uprawnienie węzła (VIEW dla zespołu).
    private async createOrderTeam(db: any, orderNodeId: string, name: string, userIds: (string | undefined)[]) {
        const ids = [...new Set(userIds.filter(Boolean) as string[])];
        const team = await db.team.create({
            data: {
                name: await this.uniqueTeamName(db, name, orderNodeId),
                orderNodeId,
                users: { connect: ids.map(id => ({ id })) },
            },
        });
        await db.nodePermission.create({ data: { nodeId: orderNodeId, teamId: team.id, permission: 'VIEW' } });
        return team;
    }

    // @anchor ensure-order-team — zespół zamówienia; brak (np. zamówienie sprzed migracji
    // utworzone inną drogą) = tworzony z samym właścicielem.
    async ensureOrderTeam(orderNodeId: string) {
        const existing = await this.prisma.team.findUnique({ where: { orderNodeId } });
        if (existing) return existing;
        const node = await this.prisma.processNode.findUnique({ where: { id: orderNodeId }, select: { id: true, name: true, type: true, ownerId: true } });
        if (!node || node.type !== NodeType.ORDER) throw new NotFoundException('To nie jest zamówienie');
        return this.createOrderTeam(this.prisma, node.id, node.name, [node.ownerId || undefined]);
    }

    private async assertOrderAccess(orderNodeId: string, user: any) {
        const node = await this.prisma.processNode.findUnique({ where: { id: orderNodeId }, include: { permissions: true } });
        if (!node) throw new NotFoundException(`Node ${orderNodeId} not found`);
        if (user && !this.canSee(node, user)) throw new ForbiddenException('Nie należysz do zespołu tego zamówienia');
        return node;
    }

    // @anchor get-order-team
    async getOrderTeam(orderNodeId: string, user?: any) {
        const node = await this.assertOrderAccess(orderNodeId, user);
        const team = await this.ensureOrderTeam(orderNodeId);
        const members = await this.prisma.user.findMany({
            where: { teams: { some: { id: team.id } } },
            select: { id: true, email: true, firstName: true, lastName: true, phone: true, company: true, isActive: true },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });
        return { teamId: team.id, name: team.name, ownerId: node.ownerId, isPublic: node.visibility === 'public' || node.isPublic, members };
    }

    // @anchor set-order-team — pełna lista członków (właściciel zawsze zostaje) + publiczność.
    async setOrderTeam(orderNodeId: string, dto: { userIds: string[]; isPublic?: boolean }, user?: any) {
        const node = await this.assertOrderAccess(orderNodeId, user);
        const team = await this.ensureOrderTeam(orderNodeId);
        const ids = [...new Set([...(dto.userIds || []), node.ownerId].filter(Boolean) as string[])];
        await this.prisma.team.update({ where: { id: team.id }, data: { users: { set: ids.map(id => ({ id })) } } });
        if (dto.isPublic !== undefined) {
            await this.prisma.processNode.update({
                where: { id: orderNodeId },
                data: { isPublic: dto.isPublic, visibility: dto.isPublic ? 'public' : 'team' },
            });
        }
        return this.getOrderTeam(orderNodeId, user);
    }

    /**
     * Move node to new parent (rebuild closure paths)
     */
    async move(id: string, dto: MoveNodeDto, user?: any) {
        const position = dto.position ?? 'inside';
        if (dto.targetId === id) {
            throw new BadRequestException('Cannot move node relative to itself');
        }

        // Rodzic docelowy: przed/po targetId → rodzic targetId (null = najwyższy poziom)
        let newParentId: string | null = dto.newParentId ?? null;
        if (dto.targetId) {
            const target = await this.prisma.processNode.findUnique({ where: { id: dto.targetId }, select: { id: true, parentId: true } });
            if (!target) throw new NotFoundException(`Node ${dto.targetId} not found`);
            newParentId = position === 'inside' ? target.id : target.parentId;
        }

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

        if (newParentId) {
            const isDescendant = await this.prisma.processNodeClosure.findFirst({
                where: {
                    ancestorId: id,
                    descendantId: newParentId,
                },
            });

            if (isDescendant) {
                throw new BadRequestException('Cannot move node to its own descendant');
            }
        }

        const parentChanged = node.parentId !== newParentId;

        return this.prisma.$transaction(async (tx) => {
            // @anchor move-node-reorder — nowa kolejność rodzeństwa: przenoszony węzeł przed/po targetId,
            // przy „inside” na koniec listy dzieci
            const siblings = await tx.processNode.findMany({
                where: { parentId: newParentId, id: { not: id } },
                select: { id: true },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            });
            const orderedIds = siblings.map(s => s.id);
            const targetIdx = dto.targetId && position !== 'inside' ? orderedIds.indexOf(dto.targetId) : -1;
            if (targetIdx === -1) orderedIds.push(id);
            else orderedIds.splice(position === 'after' ? targetIdx + 1 : targetIdx, 0, id);
            for (let i = 0; i < orderedIds.length; i++) {
                await tx.processNode.update({ where: { id: orderedIds[i] }, data: { sortOrder: i } });
            }

            if (!parentChanged) {
                return tx.processNode.findUnique({ where: { id }, include: { parent: true } });
            }

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

            // Rebuild closure paths for new parent (najwyższy poziom = brak przodków)
            if (newParentId) await tx.$executeRaw`
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

    /**
     * Add a user as a project contact (direct NodePermission with VIEW).
     * Body: { userId } to link existing user, or { email, firstName, lastName, phone?, company? } to create new.
     */
    async addProjectContact(nodeId: string, dto: any) {
        let userId: string = dto.userId;

        if (!userId) {
            // Create new external contact with auto-generated password
            const crypto = require('crypto');
            const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
            if (existing) {
                userId = existing.id;
            } else {
                const argon2 = require('argon2');
                const hashed = await argon2.hash(crypto.randomBytes(20).toString('hex'));
                const role = await this.prisma.role.findUnique({ where: { name: 'USER' } });
                const user = await this.prisma.user.create({
                    data: {
                        email: dto.email,
                        password: hashed,
                        firstName: dto.firstName || null,
                        lastName: dto.lastName || null,
                        phone: dto.phone || null,
                        company: dto.company || null,
                        ...(role ? { userRoles: { create: { roleId: role.id } } } : {}),
                    },
                });
                userId = user.id;
            }
        }

        // „Dodaj do zespołu" = członek zespołu zamówienia (jedyne źródło widoczności).
        const team = await this.ensureOrderTeam(nodeId);
        await this.prisma.team.update({ where: { id: team.id }, data: { users: { connect: { id: userId } } } });

        return this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, firstName: true, lastName: true, phone: true, company: true },
        });
    }

    async removeProjectContact(nodeId: string, userId: string) {
        const node = await this.prisma.processNode.findUnique({ where: { id: nodeId }, select: { ownerId: true } });
        if (node?.ownerId === userId) return { ok: false, reason: 'Autora zamówienia nie można usunąć z zespołu' };
        const team = await this.prisma.team.findUnique({ where: { orderNodeId: nodeId } });
        if (team) await this.prisma.team.update({ where: { id: team.id }, data: { users: { disconnect: { id: userId } } } });
        // Stare uprawnienie bezpośrednie (sprzed zespołów zamówień) — sprzątamy przy okazji.
        await this.prisma.nodePermission.deleteMany({ where: { nodeId, userId } });
        return { ok: true };
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

        // Węzeł wewnątrz zamówienia (lokalizacja, dokument): rozstrzyga WYŁĄCZNIE najbliższe
        // zamówienie nad nim — folder powyżej nie daje dostępu do cudzego zamówienia.
        const orderAncestor = ancestors
            .filter(r => r.ancestor.type === NodeType.ORDER)
            .sort((a, b) => a.depth - b.depth)[0];
        if (orderAncestor) return this.canSee(orderAncestor.ancestor, user);

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
        
        const [users, roles, userRoles, nodes, closure, requirements, budgetItems, versions, userTasks, teams, nodePermissions] = await Promise.all([
            this.prisma.user.findMany(),
            this.prisma.role.findMany(),
            this.prisma.userRole.findMany(),
            this.prisma.processNode.findMany(),
            this.prisma.processNodeClosure.findMany(),
            this.prisma.orderRequirements.findMany(),
            this.prisma.budgetLineItem.findMany(),
            this.prisma.projectVersion.findMany(),
            this.prisma.userTask.findMany(),
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

    // 11. User tasks (zadania)
    const userTasks = ${JSON.stringify(userTasks, null, 8)};
    for (const item of userTasks) {
        await prisma.userTask.upsert({ where: { id: item.id }, update: item, create: item });
    }
    console.log('User tasks restored.');

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
