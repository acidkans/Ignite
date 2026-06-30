import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { OneDriveService } from '../onedrive/onedrive.service';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface MsTodoList {
  id: string;
  displayName: string;
  isOwner: boolean;
  wellknownListName: string | null;
}

export interface MsTodoTask {
  id: string;
  title: string;
  status: string; // 'notStarted' | 'completed'
  importance: string;
  reminderDateTime?: { dateTime: string; timeZone: string };
  dueDateTime?: { dateTime: string; timeZone: string };
  createdDateTime: string;
  lastModifiedDateTime: string;
  '@odata.etag'?: string;
}

export interface MsTodoDeltaResult {
  tasks: MsTodoTask[];
  deltaLink: string | null;
  nextLink: string | null;
}

// @anchor ms-todo-service
@Injectable()
export class MsTodoService {
  private readonly logger = new Logger(MsTodoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneDrive: OneDriveService,
  ) {}

  // @anchor ms-todo-get-valid-token
  async getValidAccessToken(userId: string): Promise<string> {
    return this.oneDrive.getValidToken(userId);
  }

  // @anchor ms-todo-fetch-lists
  async fetchLists(userId: string): Promise<MsTodoList[]> {
    const token = await this.getValidAccessToken(userId);
    try {
      const res = await axios.get(`${GRAPH_BASE}/me/todo/lists`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { $top: 200 },
      });
      return (res.data.value ?? []).map((l: any) => ({
        id: l.id,
        displayName: l.displayName,
        isOwner: l.isOwner ?? true,
        wellknownListName: l.wellknownListName ?? null,
      }));
    } catch (err) {
      await this.handleGraphError(userId, err);
    }
  }

  // @anchor ms-todo-fetch-tasks-delta
  // Pobiera delta zadań dla jednej listy. Gdy deltaLink=null, startuje pełny fetch.
  async fetchTasksDelta(userId: string, listId: string, deltaLink?: string): Promise<MsTodoDeltaResult> {
    const token = await this.getValidAccessToken(userId);
    const url = deltaLink ?? `${GRAPH_BASE}/me/todo/lists/${listId}/tasks/delta`;
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: deltaLink ? undefined : { $top: 200 },
      });
      const data = res.data;
      return {
        tasks: data.value ?? [],
        deltaLink: data['@odata.deltaLink'] ?? null,
        nextLink: data['@odata.nextLink'] ?? null,
      };
    } catch (err) {
      await this.handleGraphError(userId, err);
    }
  }

  // @anchor ms-todo-create-task
  async createTask(userId: string, listId: string, payload: Partial<MsTodoTask>): Promise<MsTodoTask> {
    const token = await this.getValidAccessToken(userId);
    try {
      const res = await axios.post(
        `${GRAPH_BASE}/me/todo/lists/${listId}/tasks`,
        payload,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      return res.data;
    } catch (err) {
      await this.handleGraphError(userId, err);
    }
  }

  // @anchor ms-todo-update-task
  async updateTask(userId: string, listId: string, taskId: string, patch: Partial<MsTodoTask>): Promise<MsTodoTask> {
    const token = await this.getValidAccessToken(userId);
    try {
      const res = await axios.patch(
        `${GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}`,
        patch,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      return res.data;
    } catch (err) {
      await this.handleGraphError(userId, err);
    }
  }

  // @anchor ms-todo-delete-task
  async deleteTask(userId: string, listId: string, taskId: string): Promise<void> {
    const token = await this.getValidAccessToken(userId);
    try {
      await axios.delete(`${GRAPH_BASE}/me/todo/lists/${listId}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      await this.handleGraphError(userId, err);
    }
  }

  // @anchor ms-todo-get-status
  async getStatus(userId: string): Promise<{
    connected: boolean;
    msAccountEmail?: string;
    needsReauth: boolean;
    lastSyncAt: Date | null;
    lastSyncError: string | null;
  }> {
    const [token, syncState] = await Promise.all([
      this.prisma.userMsToken.findUnique({ where: { userId } }),
      this.prisma.msTodoSyncState.findUnique({ where: { userId } }),
    ]);
    if (!token) return { connected: false, needsReauth: false, lastSyncAt: null, lastSyncError: null };
    return {
      connected: true,
      msAccountEmail: token.msAccountEmail ?? undefined,
      needsReauth: token.needsReauth,
      lastSyncAt: syncState?.lastSyncAt ?? null,
      lastSyncError: syncState?.lastSyncError ?? null,
    };
  }

  // @anchor ms-todo-disconnect
  async disconnect(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.msTodoSyncState.deleteMany({ where: { userId } }),
      this.prisma.userMsToken.deleteMany({ where: { userId } }),
    ]);
  }

  // @anchor ms-todo-mark-needs-reauth
  // Wywoływane ręcznie po wymuszonym relogu (np. zmiana scope'u w Azure).
  async markNeedsReauth(userId: string): Promise<void> {
    await this.prisma.userMsToken.updateMany({ where: { userId }, data: { needsReauth: true } });
  }

  // @anchor ms-todo-clear-reauth
  // Wywoływane przez OneDriveService.handleCallback po pomyślnym relogu.
  async clearNeedsReauth(userId: string): Promise<void> {
    await this.prisma.userMsToken.updateMany({ where: { userId }, data: { needsReauth: false } });
  }

  // @anchor ms-todo-bootstrap-sync
  // Inicjuje rekord MsTodoSyncState dla nowego użytkownika.
  async bootstrapSync(userId: string): Promise<void> {
    await this.prisma.msTodoSyncState.upsert({
      where: { userId },
      create: { userId, msTodoSyncStartedAt: new Date() },
      update: {},
    });
  }

  // @anchor ms-todo-update-sync-state
  async updateSyncState(userId: string, data: {
    deltaLink?: string;
    lastSyncAt?: Date;
    lastSyncError?: string | null;
  }): Promise<void> {
    await this.prisma.msTodoSyncState.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  // @anchor ms-todo-handle-graph-error
  private async handleGraphError(userId: string, err: any): Promise<never> {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      await this.prisma.userMsToken.updateMany({ where: { userId }, data: { needsReauth: true } });
      throw new UnauthorizedException(
        'Brak uprawnień do MS To Do — wymagane ponowne połączenie konta Microsoft (Tasks.ReadWrite)'
      );
    }
    this.logger.error(`Graph API error for user ${userId}: ${err?.message}`, err?.response?.data);
    throw err;
  }
}
