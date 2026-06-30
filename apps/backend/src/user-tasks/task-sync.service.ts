import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MsTodoService, MsTodoList, MsTodoTask } from '../ms-todo/ms-todo.service';
import { UserTasksService } from './user-tasks.service';

// @anchor task-sync-service
@Injectable()
export class TaskSyncService {
  private readonly logger = new Logger(TaskSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly msTodo: MsTodoService,
    private readonly userTasks: UserTasksService,
  ) {}

  // @anchor task-sync-single-user
  async syncSingleUser(userId: string): Promise<void> {
    const syncState = await this.prisma.msTodoSyncState.findUnique({ where: { userId } });
    // deltaLinks stored as JSON: { listId: deltaLink }
    const deltaLinksMap: Record<string, string> = syncState?.deltaLink
      ? JSON.parse(syncState.deltaLink)
      : {};

    try {
      const lists = await this.msTodo.fetchLists(userId);

      for (const list of lists) {
        let deltaLink = deltaLinksMap[list.id] as string | undefined;
        let hasMore = true;

        while (hasMore) {
          const page = await this.msTodo.fetchTasksDelta(userId, list.id, deltaLink);
          await this.processDeltaTasks(userId, list, page.tasks);

          if (page.deltaLink) {
            deltaLinksMap[list.id] = page.deltaLink;
          }
          if (page.nextLink) {
            deltaLink = page.nextLink;
          } else {
            hasMore = false;
          }
        }
      }

      await this.msTodo.updateSyncState(userId, {
        deltaLink: JSON.stringify(deltaLinksMap),
        lastSyncAt: new Date(),
        lastSyncError: null,
      });
    } catch (err: any) {
      await this.msTodo.updateSyncState(userId, {
        lastSyncError: err?.message ?? 'Unknown error',
      });
      this.logger.error(`Sync failed for user ${userId}: ${err?.message}`);
    }
  }

  // @anchor task-sync-process-delta
  private async processDeltaTasks(userId: string, list: MsTodoList, tasks: MsTodoTask[]): Promise<void> {
    for (const task of tasks) {
      if ((task as any)['@removed']) {
        await this.prisma.userTask.updateMany({
          where: { msToDoId: task.id, userId },
          data: { deletedAt: new Date() },
        });
        continue;
      }

      const nodeId = await this.resolveNodeId(task.title, list.displayName);
      const msLastModified = task.lastModifiedDateTime ? new Date(task.lastModifiedDateTime) : null;
      const plannedEnd = task.dueDateTime?.dateTime ? new Date(task.dueDateTime.dateTime) : null;
      const status = task.status === 'completed' ? 'DONE' : 'OPEN';
      const msEtag = (task as any)['@odata.etag'] ?? null;

      const existing = await this.prisma.userTask.findUnique({ where: { msToDoId: task.id } });

      if (existing) {
        // Porównujemy z msLastModified (ostatni znany stan MS), NIE z updatedAt — updatedAt jest
        // bumpowane przez Prisma @updatedAt przy każdym .update(), w tym przez sam silnik sync,
        // co dawało fałszywe "DB wygrywa" i zbędne pushe do Graph przy każdym resyncu (echo).
        const msWins = msLastModified && (!existing.msLastModified || msLastModified > existing.msLastModified);
        if (msWins) {
          const updated = await this.prisma.userTask.update({
            where: { id: existing.id },
            data: {
              title: task.title,
              status,
              plannedEnd,
              msEtag,
              msLastModified,
              msListId: list.id,
              msListName: list.displayName,
              nodeId: nodeId ?? existing.nodeId,
              deletedAt: null,
            },
          });
          await this.userTasks.syncReminderForTask(updated.id, userId, updated.plannedEnd);
        } else if (existing.msListId) {
          // DB wygrywa — pushuj do Graph
          await this.pushTaskToGraph(userId, existing, existing.msListId);
        }
      } else {
        const created = await this.prisma.userTask.create({
          data: {
            userId,
            title: task.title,
            status,
            plannedEnd,
            msToDoId: task.id,
            msListId: list.id,
            msListName: list.displayName,
            msEtag,
            msLastModified,
            source: 'MS_TODO',
            nodeId: nodeId ?? null,
          },
        });
        await this.userTasks.syncReminderForTask(created.id, userId, created.plannedEnd);
      }
    }
  }

  // @anchor task-sync-resolve-node-id
  // Auto-pinning: hashtag w tytule (#slug) > slugified nazwa listy
  async resolveNodeId(title: string, listName: string): Promise<string | null> {
    const hashtagMatch = title.match(/#([\w-]+)/);
    if (hashtagMatch) {
      const node = await this.prisma.processNode.findUnique({
        where: { taskListSlug: hashtagMatch[1] },
      });
      if (node) return node.id;
    }

    const listSlug = listName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const node = await this.prisma.processNode.findUnique({ where: { taskListSlug: listSlug } });
    return node?.id ?? null;
  }

  // @anchor task-sync-push-to-graph
  // Pushuje zmiany z DB do MS Graph — best-effort, błędy nie przerywają sync.
  private async pushTaskToGraph(userId: string, task: any, listId: string): Promise<void> {
    try {
      const patch: any = {
        title: task.title,
        status: task.status === 'DONE' ? 'completed' : 'notStarted',
      };
      if (task.plannedEnd) {
        patch.dueDateTime = { dateTime: (task.plannedEnd as Date).toISOString(), timeZone: 'UTC' };
      }
      await this.msTodo.updateTask(userId, listId, task.msToDoId, patch);
    } catch (err: any) {
      this.logger.warn(`pushToGraph failed for task ${task.id}: ${err?.message}`);
    }
  }
}
