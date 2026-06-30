import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

// @anchor notif-settings-singleton-id
const SINGLETON_ID = 'singleton';

// @anchor notif-settings-service
@Injectable()
export class NotificationSettingsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // @anchor notif-settings-service-get-or-create
  async getOrCreate() {
    const existing = await this.prisma.systemNotificationSettings.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (existing) return existing;
    return this.prisma.systemNotificationSettings.create({ data: { id: SINGLETON_ID } });
  }

  // @anchor notif-settings-service-get
  async get() {
    const settings = await this.getOrCreate();
    const diag = await this.getStats();
    return { ...settings, diag };
  }

  // @anchor notif-settings-service-update
  async update(dto: any) {
    const { id: _id, updatedAt: _ua, diag: _d, ...data } = dto || {};
    if (data.defaultReminderHour !== undefined) data.defaultReminderHour = Number(data.defaultReminderHour);
    if (data.trashRetentionDays !== undefined) data.trashRetentionDays = Number(data.trashRetentionDays);
    if (data.msTodoSyncIntervalMinutes !== undefined) data.msTodoSyncIntervalMinutes = Number(data.msTodoSyncIntervalMinutes);
    await this.prisma.systemNotificationSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });
    return this.get();
  }

  // @anchor notif-settings-service-get-stats
  async getStats() {
    const vapidConfigured = !!(
      this.config.get('VAPID_PUBLIC_KEY') &&
      this.config.get('VAPID_PRIVATE_KEY') &&
      this.config.get('VAPID_EMAIL')
    );
    const msGraphConfigured = !!(
      this.config.get('MS_CLIENT_ID') &&
      this.config.get('MS_CLIENT_SECRET')
    );
    const [webPushSubscriptions, msConnectedUsers] = await Promise.all([
      this.prisma.pushSubscription.count(),
      this.prisma.userMsToken.count(),
    ]);
    return {
      vapidConfigured,
      msGraphConfigured,
      webPushSubscriptions,
      msConnectedUsers,
      pendingReminders: null, // TaskReminder — Etap 2
    };
  }
}
