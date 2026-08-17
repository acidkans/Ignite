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

  // Po ilu dniach ciszy uznajemy, że coś jest zepsute, a nie że po prostu nie ma
  // roboty w terenie. Tydzień przechodzi przez urlop i długi weekend.
  // @anchor attachment-silence-days
  private readonly ATTACHMENT_SILENCE_DAYS = 7;

  // Okno, w którym szukamy dowodu, że wcześniej cokolwiek przychodziło. Bez tego
  // świeża instalacja bez ani jednego załącznika alarmowałaby w kółko.
  // @anchor attachment-baseline-days
  private readonly ATTACHMENT_BASELINE_DAYS = 60;

  // @anchor notification-cron-attachment-silence
  // Codziennie o 7:00 — wykrywanie CISZY w napływie załączników znaczników.
  //
  // Powód istnienia: awaria z 15 lipca 2026 (załączniki przestały dochodzić przez
  // regresję w kolejce offline) żyła MIESIĄC, bo nikt nie zauważył, że zdjęcia
  // przestały przychodzić. Wszystkie inne zabezpieczenia siedzą na telefonie —
  // ten jeden jest po stronie serwera i dlatego zadziała niezależnie od tego, co
  // dokładnie się zepsuło: błąd klienta, proxy, nieudany deploy. Stróż nie może
  // dzielić losu z tym, czego pilnuje.
  @Cron('0 7 * * *')
  async checkAttachmentSilence(): Promise<void> {
    const settings = await this.notifSettings.getOrCreate();
    if (!settings.webPushEnabled) return;

    const dayMs = 24 * 60 * 60 * 1000;
    const silenceFrom = new Date(Date.now() - this.ATTACHMENT_SILENCE_DAYS * dayMs);

    const recent = await this.prisma.markerAttachment.count({
      where: { createdAt: { gte: silenceFrom } },
    });
    if (recent > 0) return; // płynie — nie ma o czym mówić

    // Cisza. Zanim zaalarmujemy: czy wcześniej w ogóle coś przychodziło? Inaczej
    // zgłaszalibyśmy „awarię" na instalacji, która po prostu nie używa załączników.
    const baselineFrom = new Date(Date.now() - this.ATTACHMENT_BASELINE_DAYS * dayMs);
    const baseline = await this.prisma.markerAttachment.count({
      where: { createdAt: { gte: baselineFrom, lt: silenceFrom } },
    });
    if (baseline === 0) return;

    const last = await this.prisma.markerAttachment.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const daysSilent = last
      ? Math.floor((Date.now() - last.createdAt.getTime()) / dayMs)
      : this.ATTACHMENT_SILENCE_DAYS;

    // Alarm w 7. dniu ciszy, potem co tydzień — nie codziennie. Codzienny nag przy
    // awarii ciągnącej się tygodniami uczy adminów odklikiwać powiadomienia bez
    // czytania, czyli psuje kanał, na którym nam zależy.
    if (daysSilent % 7 !== 0) return;

    const admins = await this.prisma.user.findMany({
      where: { isActive: true, userRoles: { some: { role: { name: 'ADMIN' } } } },
      select: { id: true, email: true },
    });
    if (admins.length === 0) {
      this.logger.warn('[AttachmentSilence] cisza wykryta, ale brak aktywnych adminów do powiadomienia');
      return;
    }

    const title = 'Zdjęcia ze znaczników nie przychodzą';
    const body =
      `Od ${daysSilent} dni nie dotarł żaden załącznik znacznika ` +
      `(wcześniej: ${baseline} w ${this.ATTACHMENT_BASELINE_DAYS} dni). Sprawdź synchronizację.`;

    this.logger.warn(`[AttachmentSilence] ${body} — powiadamiam ${admins.length} adminów`);

    for (const admin of admins) {
      try {
        await this.push.sendToUser(admin.id, title, body, undefined, { type: 'SYSTEM_ALERT' });
      } catch (err: any) {
        this.logger.warn(`[AttachmentSilence] push do ${admin.email} nie poszedł: ${err?.message}`);
      }
    }
  }
}
