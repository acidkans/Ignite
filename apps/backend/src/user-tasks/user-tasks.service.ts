import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.userTask.create({
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
  }

  // @anchor user-tasks-update
  async update(userId: string, taskId: string, dto: UpdateUserTaskDto) {
    return this.prisma.userTask.updateMany({
      where: { id: taskId, userId, deletedAt: null },
      data: dto,
    });
  }

  // @anchor user-tasks-soft-delete
  async softDelete(userId: string, taskId: string) {
    return this.prisma.userTask.updateMany({
      where: { id: taskId, userId },
      data: { deletedAt: new Date() },
    });
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
