import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { MsTodoService } from '../ms-todo/ms-todo.service';

const IGNITE_LIST_NAME = 'Ignite';

export interface CreateUserTaskDto {
  title: string;
  description?: string;
  plannedStart?: Date;
  plannedEnd?: Date;
  nodeId?: string;
}

export interface UpdateUserTaskDto {
  title?: string;
  description?: string;
  status?: 'OPEN' | 'DONE';
  plannedStart?: Date;
  plannedEnd?: Date;
  nodeId?: string;
}

// @anchor user-tasks-service
@Injectable()
export class UserTasksService {
  private readonly logger = new Logger(UserTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifSettings: NotificationSettingsService,
    private readonly msTodo: MsTodoService,
  ) {}

  // @anchor user-tasks-list
  // Zwraca tylko OPEN i nie-usunięte, sortowane po plannedEnd ASC (null na końcu)
  async listForUser(userId: string) {
    return this.prisma.userTask.findMany({
      where: { userId, status: 'OPEN', deletedAt: null },
      orderBy: [{ plannedEnd: 'asc' }],
      include: {
        node: { select: { id: true, name: true } },
        reminders: { where: { sentAt: null }, orderBy: { remindAt: 'asc' }, take: 1 },
      },
    });
  }

  // @anchor user-tasks-create
  async create(userId: string, dto: CreateUserTaskDto) {
    const task = await this.prisma.userTask.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        plannedStart: dto.plannedStart,
        plannedEnd: dto.plannedEnd,
        nodeId: dto.nodeId ?? null,
        source: 'IGNITE',
      },
    });

    await this.syncReminderForTask(task.id, userId, task.plannedEnd);
    await this.pushNewTaskToGraph(userId, task);
    return task;
  }

  // @anchor user-tasks-update
  async update(userId: string, taskId: string, dto: UpdateUserTaskDto) {
    const result = await this.prisma.userTask.updateMany({
      where: { id: taskId, userId, deletedAt: null },
      data: dto,
    });

    if (result.count > 0) {
      if ('plannedEnd' in dto) {
        await this.syncReminderForTask(taskId, userId, dto.plannedEnd ?? null);
      }
      await this.pushUpdateToGraph(userId, taskId, dto);
    }
    return result;
  }

  // @anchor user-tasks-soft-delete
  async softDelete(userId: string, taskId: string) {
    const task = await this.prisma.userTask.findFirst({ where: { id: taskId, userId } });
    const result = await this.prisma.userTask.updateMany({
      where: { id: taskId, userId },
      data: { deletedAt: new Date() },
    });

    if (task?.msToDoId && task.msListId) {
      try {
        await this.msTodo.updateTask(userId, task.msListId, task.msToDoId, { status: 'completed' });
      } catch (err: any) {
        this.logger.warn(`pushDelete failed for task ${taskId}: ${err?.message}`);
      }
    }
    return result;
  }

  // @anchor user-tasks-sync-reminder
  // Tworzy/aktualizuje/usuwa TaskReminder wg plannedEnd. Bez konkretnej godziny (00:00) → alarm o defaultReminderHour.
  async syncReminderForTask(taskId: string, userId: string, plannedEnd: Date | null | undefined): Promise<void> {
    if (!plannedEnd) {
      await this.prisma.taskReminder.deleteMany({ where: { userTaskId: taskId, sentAt: null } });
      return;
    }

    const settings = await this.notifSettings.getOrCreate();
    const hasTime = plannedEnd.getHours() !== 0 || plannedEnd.getMinutes() !== 0;
    const remindAt = new Date(plannedEnd);
    if (!hasTime) remindAt.setHours(settings.defaultReminderHour, 0, 0, 0);

    const existing = await this.prisma.taskReminder.findFirst({ where: { userTaskId: taskId, sentAt: null } });
    if (existing) {
      if (existing.remindAt.getTime() !== remindAt.getTime()) {
        await this.prisma.taskReminder.update({
          where: { id: existing.id },
          data: { remindAt, snoozedFrom: null },
        });
      }
    } else {
      await this.prisma.taskReminder.create({ data: { userTaskId: taskId, userId, remindAt } });
    }
  }

  // @anchor user-tasks-push-new-to-graph
  // Best-effort: nowe zadanie IGNITE → lista "Ignite" w MS To Do (find-or-create listy).
  private async pushNewTaskToGraph(userId: string, task: any): Promise<void> {
    try {
      const tokenRecord = await this.prisma.userMsToken.findUnique({ where: { userId } });
      if (!tokenRecord || tokenRecord.needsReauth) return;

      const settings = await this.notifSettings.getOrCreate();
      if (!settings.msTodoEnabled) return;

      const listId = await this.resolveIgniteListId(userId);
      if (!listId) return;

      const payload: any = { title: task.title, status: task.status === 'DONE' ? 'completed' : 'notStarted' };
      if (task.plannedEnd) {
        payload.dueDateTime = { dateTime: (task.plannedEnd as Date).toISOString(), timeZone: 'UTC' };
      }

      const created = await this.msTodo.createTask(userId, listId, payload);
      await this.prisma.userTask.update({
        where: { id: task.id },
        data: {
          msToDoId: created.id,
          msListId: listId,
          msListName: IGNITE_LIST_NAME,
          msEtag: (created as any)['@odata.etag'] ?? null,
          msLastModified: created.lastModifiedDateTime ? new Date(created.lastModifiedDateTime) : new Date(),
        },
      });
    } catch (err: any) {
      this.logger.warn(`pushNewTaskToGraph failed for task ${task.id}: ${err?.message}`);
    }
  }

  // @anchor user-tasks-push-update-to-graph
  private async pushUpdateToGraph(userId: string, taskId: string, dto: UpdateUserTaskDto): Promise<void> {
    try {
      const task = await this.prisma.userTask.findUnique({ where: { id: taskId } });
      if (!task?.msToDoId || !task.msListId) return;

      const patch: any = {};
      if (dto.title !== undefined) patch.title = dto.title;
      if (dto.status !== undefined) patch.status = dto.status === 'DONE' ? 'completed' : 'notStarted';
      if ('plannedEnd' in dto) {
        patch.dueDateTime = task.plannedEnd
          ? { dateTime: (task.plannedEnd as Date).toISOString(), timeZone: 'UTC' }
          : null;
      }
      if (Object.keys(patch).length === 0) return;

      await this.msTodo.updateTask(userId, task.msListId, task.msToDoId, patch);
    } catch (err: any) {
      this.logger.warn(`pushUpdateToGraph failed for task ${taskId}: ${err?.message}`);
    }
  }

  // @anchor user-tasks-resolve-ignite-list-id
  // Find-or-create listy "Ignite" w MS To Do — cel synchronizacji dla zadań tworzonych w IGNITE.
  private async resolveIgniteListId(userId: string): Promise<string | null> {
    try {
      const lists = await this.msTodo.fetchLists(userId);
      const existing = lists.find((l) => l.displayName === IGNITE_LIST_NAME);
      if (existing) return existing.id;
      return await this.msTodo.createList(userId, IGNITE_LIST_NAME);
    } catch (err: any) {
      this.logger.warn(`resolveIgniteListId failed for user ${userId}: ${err?.message}`);
      return null;
    }
  }

  // @anchor user-tasks-due-reminders
  // Alerty wymagające wyświetlenia — remindAt <= teraz, sentAt=null, zadanie OPEN
  async getDueReminders(userId: string) {
    return this.prisma.taskReminder.findMany({
      where: {
        userId,
        remindAt: { lte: new Date() },
        sentAt: null,
        userTask: { status: 'OPEN', deletedAt: null },
      },
      include: { userTask: { select: { id: true, title: true, plannedEnd: true } } },
      orderBy: { remindAt: 'asc' },
    });
  }

  // @anchor user-tasks-handle-reminder
  // action='dismiss' → sentAt=now; action='snooze' → nowy remindAt, snoozedFrom=stary remindAt
  async handleReminder(userId: string, reminderId: string, action: 'dismiss' | 'snooze', minutes?: number) {
    const reminder = await this.prisma.taskReminder.findFirst({
      where: { id: reminderId, userId },
    });
    if (!reminder) return;

    if (action === 'dismiss') {
      await this.prisma.taskReminder.update({
        where: { id: reminderId },
        data: { sentAt: new Date() },
      });
    } else if (action === 'snooze' && minutes) {
      await this.prisma.taskReminder.update({
        where: { id: reminderId },
        data: {
          snoozedFrom: reminder.remindAt,
          remindAt: new Date(Date.now() + minutes * 60000),
          sentAt: null,
        },
      });
    }
  }

  // @anchor user-tasks-trash-cleanup
  // Usuwa fizycznie zadania przebywające w koszu dłużej niż retentionDays dni.
  async cleanupTrash(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.userTask.deleteMany({
      where: { deletedAt: { lte: cutoff } },
    });
    return result.count;
  }
}
