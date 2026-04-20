import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
    constructor(
        private comments: CommentsService,
        private notifications: NotificationsService,
        private push: PushService,
        private prisma: PrismaService,
    ) {}

    @Get('order/:orderId')
    getByOrder(@Param('orderId') orderId: string) {
        return this.comments.getByOrder(orderId);
    }

    @Get('users')
    async getUsers() {
        return this.prisma.user.findMany({
            where: { isActive: true },
            select: { id: true, firstName: true, lastName: true, userRoles: { select: { role: { select: { name: true } } } } },
            orderBy: { firstName: 'asc' },
        });
    }

    @Post('order/:orderId')
    async create(@Param('orderId') orderId: string, @Body() body: { text: string; requirementId?: string; type?: string; mentionedUserIds?: string[]; replyToId?: string }, @Request() req) {
        const comment = await this.comments.create(orderId, req.user.userId, body);

        const order = await this.prisma.processNode.findUnique({ where: { id: orderId }, select: { name: true } });
        const orderName = order?.name ?? 'zamówienie';
        const author = comment.user;
        const authorName = [author.firstName, author.lastName].filter(Boolean).join(' ') || 'Użytkownik';

        const mentionedIds = body.mentionedUserIds?.filter(id => id !== req.user.userId) ?? [];
        const isMention = mentionedIds.length > 0;
        const isQuestion = body.type === 'QUESTION';

        // Wyznacz odbiorców: @oznaczeni lub (przy pytaniu) wszyscy poza autorem
        let recipientIds: string[];
        if (isMention) {
            recipientIds = mentionedIds;
        } else if (isQuestion) {
            const all = await this.prisma.user.findMany({ where: { isActive: true, id: { not: req.user.userId } }, select: { id: true } });
            recipientIds = all.map(u => u.id);
        } else {
            recipientIds = []; // zwykły komentarz — brak powiadomień push
        }

        const title = isMention
            ? `📌 ${authorName} oznaczył(a) Cię w ${orderName}`
            : isQuestion ? `❓ Pytanie w ${orderName}` : `💬 Komentarz w ${orderName}`;
        const bodyText = `${body.text.slice(0, 100)}${body.text.length > 100 ? '…' : ''}`;

        for (const id of recipientIds) {
            await this.notifications.create(id, isMention ? 'NEW_MENTION' : isQuestion ? 'NEW_QUESTION' : 'NEW_COMMENT', title, bodyText, orderId, body.requirementId);
            await this.push.sendToUser(id, title, bodyText, orderId);
        }

        return comment;
    }

    @Patch(':id/type')
    updateType(@Param('id') id: string, @Body() body: { type: string }) {
        return this.comments.updateType(id, body.type);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.comments.delete(id);
    }
}
