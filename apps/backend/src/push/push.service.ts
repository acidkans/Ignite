import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class PushService implements OnModuleInit {
    private readonly logger = new Logger(PushService.name);

    constructor(private prisma: PrismaService, private config: ConfigService) {}

    onModuleInit() {
        const subject = this.config.get('VAPID_EMAIL');
        const publicKey = this.config.get('VAPID_PUBLIC_KEY');
        const privateKey = this.config.get('VAPID_PRIVATE_KEY');
        if (subject && publicKey && privateKey) {
            webpush.setVapidDetails(subject, publicKey, privateKey);
        } else {
            this.logger.warn('VAPID keys not configured — push notifications disabled');
        }
    }

    getPublicKey() {
        return { publicKey: this.config.get('VAPID_PUBLIC_KEY') };
    }

    async subscribe(userId: string, dto: { endpoint: string; p256dh: string; auth: string }) {
        return this.prisma.pushSubscription.upsert({
            where: { endpoint: dto.endpoint },
            update: { p256dh: dto.p256dh, auth: dto.auth },
            create: { userId, endpoint: dto.endpoint, p256dh: dto.p256dh, auth: dto.auth },
        });
    }

    async unsubscribe(endpoint: string) {
        return this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
    }

    async sendToUser(userId: string, title: string, body: string, orderId?: string) {
        const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
        this.logger.log(`[Push] sendToUser=${userId} subs=${subs.length} title="${title}"`);

        if (subs.length === 0) {
            this.logger.warn(`[Push] Brak subskrypcji dla userId=${userId}`);
            return;
        }

        const payload = JSON.stringify({ title, body, orderId });

        for (const sub of subs) {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload,
                );
                this.logger.log(`[Push] OK → ${sub.endpoint.slice(0, 60)}…`);
            } catch (err: any) {
                this.logger.warn(`[Push] BŁĄD statusCode=${err.statusCode} msg=${err.message}`);
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
                    this.logger.warn(`[Push] Subskrypcja wygasła — usunięto`);
                }
            }
        }
    }
}
