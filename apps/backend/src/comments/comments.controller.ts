import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException, NotFoundException, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { chatImageUploadOptions, CHAT_IMAGE_DIR, CHAT_IMAGE_NAME_RE } from './chat-image.storage';
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
    getByOrder(@Param('orderId') orderId: string, @Query('wbsNodeId') wbsNodeId: string | undefined, @Query('branchOf') branchOf: string | undefined, @Request() req) {
        return this.comments.getByOrder(orderId, wbsNodeId || undefined, branchOf || undefined, req.user?.roles);
    }

    // @anchor get-my-wbs-chat-threads-endpoint
    // Lista wątków czatu gałęzi ze wszystkich zamówień użytkownika (widok „Czat” na telefonie).
    @Get('my-threads')
    getMyThreads(@Request() req) {
        return this.comments.getMyWbsChatThreads(req.user.userId, req.user?.roles);
    }

    // @anchor get-my-chat-orders-endpoint
    // Zamówienia użytkownika (zespół zamówienia) do założenia nowego wątku na telefonie.
    @Get('my-orders')
    getMyChatOrders(@Request() req) {
        return this.comments.getMyChatOrders(req.user.userId);
    }

    // @anchor get-my-chat-nodes-endpoint
    // Węzły WBS ze wszystkich zamówień użytkownika — wyszukiwarka gałęzi przed wyborem zamówienia.
    @Get('my-chat-nodes')
    getMyChatNodes(@Request() req) {
        return this.comments.getMyChatNodes(req.user.userId, req.user?.roles);
    }

    // @anchor get-chat-nodes-endpoint
    // Węzły WBS aktywnej wersji zamówienia (płasko, z depth) — wybór gałęzi dla nowego wątku.
    @Get('order/:orderId/chat-nodes')
    getChatNodes(@Param('orderId') orderId: string, @Request() req) {
        return this.comments.getChatNodes(orderId, req.user?.roles);
    }

    // @anchor get-wbs-chat-summary-endpoint
    @Get('order/:orderId/wbs-summary')
    getWbsSummary(@Param('orderId') orderId: string, @Request() req) {
        return this.comments.getWbsChatSummary(orderId, req.user.userId);
    }

    @Get('users')
    async getUsers() {
        return this.prisma.user.findMany({
            where: { isActive: true },
            select: { id: true, firstName: true, lastName: true, userRoles: { select: { role: { select: { name: true } } } } },
            orderBy: { firstName: 'asc' },
        });
    }

    // @anchor upload-chat-image-endpoint
    // Wysyła jeden obrazek do czatu; zwraca nazwę pliku, którą front dołącza do `images` przy POST wiadomości.
    @Post('order/:orderId/images')
    @UseInterceptors(FileInterceptor('file', chatImageUploadOptions))
    uploadImage(@UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Brak pliku');
        return { fileName: file.filename };
    }

    // @anchor get-chat-image-endpoint
    // Obrazek czatu — za JWT, więc front pobiera go fetch-em jako blob (zwykły <img src> nie wyśle nagłówka).
    @Get('images/:fileName')
    getImage(@Param('fileName') fileName: string, @Res() res: Response) {
        if (!CHAT_IMAGE_NAME_RE.test(fileName)) throw new BadRequestException('Niedozwolona nazwa pliku');
        const full = path.join(CHAT_IMAGE_DIR, fileName);
        if (!fs.existsSync(full)) throw new NotFoundException('Brak obrazka');
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        return res.sendFile(full);
    }

    @Post('order/:orderId')
    // `qaQuestion` — treść pytania Q&A, gdy wiadomość jest odpowiedzią na nie (wątek Realizacji).
    // Nie trafia do bazy: służy tylko powiadomieniu, żeby odbiorca wiedział, na co padła odpowiedź.
    async create(@Param('orderId') orderId: string, @Body() body: { text: string; requirementId?: string; type?: string; mentionedUserIds?: string[]; replyToId?: string; wbsNodeId?: string; images?: string[]; qaQuestion?: string; qaId?: string }, @Request() req) {
        // Obrazki tylko z nazwami nadanymi przez upload — nic spoza uploads/chat/.
        const images = (Array.isArray(body.images) ? body.images : []).filter(n => typeof n === 'string' && CHAT_IMAGE_NAME_RE.test(n));
        const text = (body.text ?? '').trim();
        if (!text && !images.length) throw new BadRequestException('Pusta wiadomość');
        body = { ...body, text, images };
        const comment = await this.comments.create(orderId, req.user.userId, body);

        const order = await this.prisma.processNode.findUnique({ where: { id: orderId }, select: { name: true } });
        const orderName = order?.name ?? 'zamówienie';
        const author = comment.user;
        const authorName = [author.firstName, author.lastName].filter(Boolean).join(' ') || 'Użytkownik';

        const mentionedIds = body.mentionedUserIds?.filter(id => id !== req.user.userId) ?? [];
        const isMention = mentionedIds.length > 0;
        const isQuestion = body.type === 'QUESTION';
        const isBranchChat = !!body.wbsNodeId;

        // Wyznacz odbiorców: czat gałęzi WBS = cały zespół zamówienia (+ @oznaczeni) poza autorem;
        // ogólny czat: @oznaczeni lub (przy pytaniu) wszyscy poza autorem
        let recipientIds: string[];
        if (isBranchChat) {
            const team = await this.prisma.user.findMany({
                where: { isActive: true, id: { not: req.user.userId }, teams: { some: { orderNodeId: orderId } } },
                select: { id: true },
            });
            recipientIds = [...new Set([...team.map(u => u.id), ...mentionedIds])];
        } else if (isMention) {
            recipientIds = mentionedIds;
        } else if (isQuestion) {
            const all = await this.prisma.user.findMany({ where: { isActive: true, id: { not: req.user.userId } }, select: { id: true } });
            recipientIds = all.map(u => u.id);
        } else {
            recipientIds = []; // zwykły komentarz — brak powiadomień push
        }

        const wbsNode = isBranchChat
            ? await this.prisma.wbsNode.findUnique({ where: { id: body.wbsNodeId }, select: { name: true, sourceWbsNodeId: true } })
            : null;
        const wbsNodeName = isBranchChat ? wbsNode?.name ?? 'gałąź' : null;
        // @anchor comment-push-wbs-root — klucz węzła czatu (ten sam w każdej wersji): klik w powiadomienie
        // otwiera Realizację → Kokpit na tym węźle (`Notification.wbsRootId`, push `tab: 'realizacja'`).
        const wbsRootId = isBranchChat ? wbsNode?.sourceWbsNodeId || body.wbsNodeId : undefined;
        // @anchor comment-push-qa-question — odpowiedź na pytanie Q&A: tytuł mówi, że to odpowiedź,
        // a treść niesie pytanie przed odpowiedzią — sama odpowiedź („tak", „200 mm") bez pytania nic nie mówi.
        const qaQuestion = typeof body.qaQuestion === 'string' ? body.qaQuestion.trim() : '';
        const skroc = (s: string, n: number) => `${s.slice(0, n)}${s.length > n ? '…' : ''}`;
        const title = isBranchChat && qaQuestion
            ? `💡 ${authorName} — odpowiedź na pytanie „${wbsNodeName}” w ${orderName}`
            : isBranchChat
            ? `💬 ${authorName} — czat „${wbsNodeName}” w ${orderName}`
            : isMention
            ? `📌 ${authorName} oznaczył(a) Cię w ${orderName}`
            : isQuestion ? `❓ Pytanie w ${orderName}` : `💬 Komentarz w ${orderName}`;
        const tresc = body.text
            ? skroc(body.text, 100)
            : `📷 ${images.length > 1 ? `${images.length} obrazki` : 'obrazek'}`;
        const bodyText = qaQuestion ? `❓ ${skroc(qaQuestion, 120)}\n↳ ${tresc}` : tresc;

        for (const id of recipientIds) {
            const type = mentionedIds.includes(id) ? 'NEW_MENTION' : isQuestion ? 'NEW_QUESTION' : 'NEW_COMMENT';
            await this.notifications.create(id, type, title, bodyText, orderId, body.requirementId, wbsRootId);
            // `watek` = filtr wątku po otwarciu: odpowiedź na pytanie wisi pod wpisem Q&A, reszta w czacie.
            await this.push.sendToUser(id, title, bodyText, orderId, wbsRootId ? { tab: 'realizacja', wbsRootId, watek: qaQuestion ? 'qa' : 'chat' } : undefined);
        }

        return comment;
    }

    // @anchor get-wbs-chat-threads-endpoint
    @Get('order/:orderId/threads')
    getThreads(@Param('orderId') orderId: string) {
        return this.comments.getWbsChatThreads(orderId);
    }

    // @anchor set-wbs-chat-thread-status-endpoint
    // Zamknięcie wątku = archiwum; ponowne otwarcie przywraca go na listę.
    @Patch('order/:orderId/threads/:wbsNodeId')
    setThreadStatus(@Param('orderId') orderId: string, @Param('wbsNodeId') wbsNodeId: string, @Body() body: { status: string }, @Request() req) {
        if (body?.status !== 'ACTIVE' && body?.status !== 'CLOSED') throw new BadRequestException('Status musi być ACTIVE albo CLOSED');
        return this.comments.setWbsChatThreadStatus(orderId, wbsNodeId, body.status, req.user.userId);
    }

    @Post('order/:orderId/mark-read')
    async markAllRead(@Param('orderId') orderId: string, @Query('wbsNodeId') wbsNodeId: string | undefined, @Request() req) {
        if (wbsNodeId) return this.comments.markReadByWbsNode(orderId, wbsNodeId, req.user.userId);
        return this.comments.markAllReadByOrder(orderId, req.user.userId);
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
