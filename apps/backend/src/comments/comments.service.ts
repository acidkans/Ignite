import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isClosedLeafType, isManagerRoles } from '../common/leaf-types.util';

@Injectable()
export class CommentsService {
    constructor(private prisma: PrismaService) {}

    private readonly userSelect = {
        id: true, firstName: true, lastName: true,
        userRoles: { select: { role: { select: { name: true } } } },
    };

    // @anchor get-branch-node-names
    // { [id]: nazwa } węzła i WSZYSTKICH jego potomków z tabeli wbs_nodes. Pełna struktura, nie to, co widać
    // w tabeli: front filtruje wiersze wg roli (logistyk widzi tylko sprzęt/materiał), a czat gałęzi ma być
    // wspólny dla całego zespołu zamówienia.
    // Ta sama reguła co drzewo WBS (`wbs-nodes-visible-for-caller`): poza ADMIN/MANAGER liście finansowe
    // (praca, usługa, nocleg, paliwo) wypadają — ich wątki też nie mogą wyciec przez czat.
    async getBranchNodeNames(rootId: string, roles?: string[]): Promise<Record<string, string>> {
        const rows = await this.prisma.$queryRaw<{ id: string; name: string | null; type: string | null; parentId: string | null }[]>`
            WITH RECURSIVE t AS (
                SELECT id, name, type, "parentId" FROM wbs_nodes WHERE id = ${rootId}
                UNION ALL
                SELECT w.id, w.name, w.type, w."parentId" FROM wbs_nodes w JOIN t ON w."parentId" = t.id
            )
            SELECT id, name, type, "parentId" FROM t`;
        let visible = rows;
        if (!isManagerRoles(roles)) {
            // Węzeł zamkniętego typu zostaje tylko jako rodzic widocznych dzieci (jak w drzewie WBS).
            for (;;) {
                const parents = new Set(visible.map(n => n.parentId).filter(Boolean) as string[]);
                const next = visible.filter(n => n.id === rootId || !isClosedLeafType(n.type) || parents.has(n.id));
                if (next.length === visible.length) break;
                visible = next;
            }
        }
        const out: Record<string, string> = {};
        for (const r of visible) out[r.id] = r.name || 'Element WBS';
        return out;
    }

    // wbsNodeId podany = tylko czat tej gałęzi WBS; branchOf = węzeł + wszyscy potomkowie (czat gałęzi głównej,
    // każdy wpis z `wbsNodeName`); brak obu = cały czat zamówienia (z wpisami gałęzi).
    async getByOrder(orderId: string, wbsNodeId?: string, branchOf?: string, roles?: string[]) {
        const names = branchOf ? await this.getBranchNodeNames(branchOf, roles) : null;
        const list = await this.prisma.comment.findMany({
            where: { orderId, ...(names ? { wbsNodeId: { in: Object.keys(names) } } : wbsNodeId ? { wbsNodeId } : {}) },
            orderBy: { createdAt: 'asc' },
            include: {
                user: { select: this.userSelect },
                replyTo: {
                    select: {
                        id: true,
                        text: true,
                        user: { select: this.userSelect },
                    },
                },
                reads: {
                    select: {
                        userId: true,
                        readAt: true,
                        user: { select: { id: true, firstName: true, lastName: true } },
                    },
                },
            },
        });
        return names ? list.map(c => ({ ...c, wbsNodeName: names[c.wbsNodeId as string] ?? null })) : list;
    }

    /**
     * Oznacz wszystkie komentarze w zamówieniu jako przeczytane przez danego użytkownika
     * (poza komentarzami autorstwa tego użytkownika). Idempotentne dzięki @@unique([commentId, userId]).
     */
    async markAllReadByOrder(orderId: string, userId: string) {
        const comments = await this.prisma.comment.findMany({
            where: { orderId, userId: { not: userId } },
            select: { id: true },
        });
        if (comments.length === 0) return { marked: 0 };
        const data = comments.map(c => ({ commentId: c.id, userId }));
        const result = await this.prisma.commentRead.createMany({ data, skipDuplicates: true });
        return { marked: result.count };
    }

    // @anchor mark-read-by-wbs-node
    // Jak markAllReadByOrder, ale tylko wpisy czatu jednej gałęzi WBS.
    async markReadByWbsNode(orderId: string, wbsNodeId: string, userId: string) {
        const comments = await this.prisma.comment.findMany({
            where: { orderId, wbsNodeId, userId: { not: userId } },
            select: { id: true },
        });
        if (comments.length === 0) return { marked: 0 };
        const data = comments.map(c => ({ commentId: c.id, userId }));
        const result = await this.prisma.commentRead.createMany({ data, skipDuplicates: true });
        return { marked: result.count };
    }

    // @anchor get-wbs-chat-threads
    // { [wbsNodeId]: { status, closedAt, closedBy } } — tylko wątki z zapisanym statusem; brak = ACTIVE.
    async getWbsChatThreads(orderId: string) {
        const rows = await this.prisma.wbsChatThread.findMany({ where: { orderId } });
        const closerIds = [...new Set(rows.map(r => r.closedById).filter(Boolean))] as string[];
        const users = closerIds.length
            ? await this.prisma.user.findMany({ where: { id: { in: closerIds } }, select: { id: true, firstName: true, lastName: true } })
            : [];
        const nameOf = (id?: string | null) => {
            const u = users.find(x => x.id === id);
            return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : null;
        };
        const out: Record<string, { status: string; closedAt: Date | null; closedBy: string | null }> = {};
        for (const r of rows) out[r.wbsNodeId] = { status: r.status, closedAt: r.closedAt, closedBy: nameOf(r.closedById) };
        return out;
    }

    // @anchor set-wbs-chat-thread-status
    // Zamyka (CLOSED → archiwum) albo otwiera ponownie (ACTIVE) wątek jednego węzła.
    async setWbsChatThreadStatus(orderId: string, wbsNodeId: string, status: 'ACTIVE' | 'CLOSED', userId: string) {
        const closed = status === 'CLOSED';
        const data = { status, closedAt: closed ? new Date() : null, closedById: closed ? userId : null };
        return this.prisma.wbsChatThread.upsert({
            where: { orderId_wbsNodeId: { orderId, wbsNodeId } },
            create: { orderId, wbsNodeId, ...data },
            update: data,
        });
    }

    // @anchor get-wbs-chat-summary
    // { [wbsNodeId]: { total, unread } } dla zalogowanego — koloruje ikonę czatu w wierszach WBS.
    // unread = cudze wpisy bez CommentRead tego użytkownika.
    async getWbsChatSummary(orderId: string, userId: string) {
        const rows = await this.prisma.comment.findMany({
            where: { orderId, wbsNodeId: { not: null } },
            select: { wbsNodeId: true, userId: true, reads: { where: { userId }, select: { id: true } } },
        });
        const summary: Record<string, { total: number; unread: number }> = {};
        for (const r of rows) {
            const s = (summary[r.wbsNodeId as string] ??= { total: 0, unread: 0 });
            s.total++;
            if (r.userId !== userId && r.reads.length === 0) s.unread++;
        }
        return summary;
    }

    async create(orderId: string, userId: string, dto: { text: string; requirementId?: string; type?: string; mentionedUserIds?: string[]; replyToId?: string; wbsNodeId?: string; images?: string[] }) {
        return this.prisma.comment.create({
            data: {
                orderId,
                userId,
                text: dto.text,
                images: dto.images ?? [],
                requirementId: dto.requirementId ?? null,
                wbsNodeId: dto.wbsNodeId ?? null,
                type: dto.type ?? 'NOTE',
                mentionedUserIds: dto.mentionedUserIds ?? [],
                replyToId: dto.replyToId ?? null,
            },
            include: {
                user: { select: this.userSelect },
                replyTo: {
                    select: {
                        id: true,
                        text: true,
                        user: { select: this.userSelect },
                    },
                },
            },
        });
    }

    async updateType(commentId: string, type: string) {
        return this.prisma.comment.update({ where: { id: commentId }, data: { type } });
    }

    async delete(commentId: string) {
        return this.prisma.comment.delete({ where: { id: commentId } });
    }
}
