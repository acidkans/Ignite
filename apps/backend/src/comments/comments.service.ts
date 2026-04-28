import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommentsService {
    constructor(private prisma: PrismaService) {}

    private readonly userSelect = {
        id: true, firstName: true, lastName: true,
        userRoles: { select: { role: { select: { name: true } } } },
    };

    async getByOrder(orderId: string) {
        return this.prisma.comment.findMany({
            where: { orderId },
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

    async create(orderId: string, userId: string, dto: { text: string; requirementId?: string; type?: string; mentionedUserIds?: string[]; replyToId?: string }) {
        return this.prisma.comment.create({
            data: {
                orderId,
                userId,
                text: dto.text,
                requirementId: dto.requirementId ?? null,
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
