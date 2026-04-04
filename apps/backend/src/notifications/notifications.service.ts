import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
    constructor(private prisma: PrismaService) {}

    async create(userId: string, type: string, title: string, body: string, orderId?: string, requirementId?: string) {
        return this.prisma.notification.create({ data: { userId, type, title, body, orderId: orderId ?? null, requirementId: requirementId ?? null } });
    }

    async getForUser(userId: string) {
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }

    async getUnreadCount(userId: string) {
        return this.prisma.notification.count({ where: { userId, readAt: null } });
    }

    async markRead(userId: string, notificationId?: string) {
        if (notificationId) {
            return this.prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
        }
        return this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    }
}
