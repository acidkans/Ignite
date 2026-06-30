import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TaskSyncService } from '../user-tasks/task-sync.service';
import { UserTasksService } from '../user-tasks/user-tasks.service';
import { PushService } from '../push/push.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';

// @anchor notification-cron-service
@Injectable()
export class NotificationCronService {
  private readonly logger = new Logger(NotificationCronService.name);
  private syncRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskSync: TaskSyncService,
    private readonly userTasks: UserTasksService,
    private readonly push: PushService,
    private readonly notifSettings: NotificationSettingsService,
  ) {}

  // @anchor notification-cron-ms-todo-sync
  // Domyślnie co 5 minut — interwał nadpisywany przez SystemNotificationSettings.msTodoSyncIntervalMinutes
  @Cron('*/5 * * * *')
  async syncMsTodo(): Promise<void> {
    if (this.syncRunning) return;
    const settings = await this.notifSettings.getOrCreate();
    if (!settings.msTodoEnabled) return;

    this.syncRunning = true;
    try {
      const tokens = await this.prisma.userMsToken.findMany({
        where: { needsReauth: false },
        select: { userId: true },
      });
      this.logger.log(`[MsTodoSync] starting for ${tokens.length} users`);

      for (const { userId } of tokens) {
        try {
          await this.taskSync.syncSingleUser(userId);
        } catch (err: any) {
          this.logger.warn(`[MsTodoSync] user ${userId} failed: ${err?.message}`);
        }
      }
    } finally {
      this.syncRunning = false;
    }
  }

  // @anchor notification-cron-reminder-dispatch
  // Co minutę: sprawdź przeterminowane alerty i wyślij push notification
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchReminders(): Promise<void> {
    const settings = await this.notifSettings.getOrCreate();
    if (!settings.webPushEnabled) return;

    const due = await this.prisma.taskReminder.findMany({
      where: { remindAt: { lte: new Date() }, sentAt: null },
      include: { userTask: { select: { title: true, userId: true } } },
    });

    for (const reminder of due) {
      const { title, userId } = reminder.userTask;
      try {
        await this.push.sendToUser(userId, '🔔 Przypomnienie', title, undefined, {
          type: 'REMINDER',
          reminderId: reminder.id,
        });
        await this.prisma.taskReminder.update({
          where: { id: reminder.id },
          data: { sentAt: new Date() },
        });
      } catch (err: any) {
        this.logger.warn(`[Reminder] push failed for ${reminder.id}: ${err?.message}`);
      }
    }

    if (due.length > 0) {
      this.logger.log(`[Reminder] dispatched ${due.length} reminders`);
    }
  }

  // @anchor notification-cron-trash-cleanup
  // Codziennie o 3:00 — czyść kosz wg SystemNotificationSettings.trashRetentionDays
  @Cron('0 3 * * *')
  async cleanupTrash(): Promise<void> {
    const settings = await this.notifSettings.getOrCreate();
    const count = await this.userTasks.cleanupTrash(settings.trashRetentionDays);
    if (count > 0) {
      this.logger.log(`[TrashCleanup] usunięto ${count} zadań z kosza`);
    }
  }
}
