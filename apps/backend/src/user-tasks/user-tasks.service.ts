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
