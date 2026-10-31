import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { MsTodoService } from '../ms-todo/ms-todo.service';
import { MsCalendarService, toWarsawLocal } from '../ms-todo/ms-calendar.service';

const IGNITE_LIST_NAME = 'Ignite';

// @anchor to-todo-due
/// Termin dla MS To Do: To Do trzyma samą datę, więc wysyłamy dzień w czasie polskim o północy.
/// Pełne ISO w UTC przesuwało dzień dla godzin blisko północy (np. 00:30 PL = 23:30 UTC dnia wcześniej).
export const toTodoDue = (d: Date) => ({ dateTime: `${toWarsawLocal(d).slice(0, 10)}T00:00:00`, timeZone: 'UTC' });

// @anchor to-todo-body
/// Komentarz zadania (`description`) jako notatka w MS To Do — zwykły tekst, więc nowe linie i punktatory
/// („•", „-") przechodzą 1:1. Pusty komentarz czyści notatkę.
export const toTodoBody = (description: string | null | undefined) => ({ content: description || '', contentType: 'text' });

// @anchor with-warsaw-day
/// Ta sama godzina (czas polski) przeniesiona na inny dzień 'RRRR-MM-DD' — termin z To Do niesie
/// tylko datę, a zadanie z godziną (`durationMinutes`) nie może jej przy synchronizacji zgubić.
export const withWarsawDay = (time: Date, day: string): Date => {
  const local = toWarsawLocal(time);
  const offsetMs = Date.parse(`${local}Z`) - time.getTime();
  return new Date(Date.parse(`${day}T${local.slice(11)}Z`) - offsetMs);
};

// @anchor task-start
/// Początek zadania: `plannedStart` (Od), a dla starszych zadań bez niego — `plannedEnd`.
/// Od niego startuje wydarzenie w Outlooku i dzwoni przypomnienie; `plannedEnd` (Do) to termin
/// (MS To Do, przeterminowanie). Zadanie kilkudniowe: Od i Do w różnych dniach.
export const taskStart = (t: { plannedStart?: Date | null; plannedEnd?: Date | null }) => t.plannedStart ?? t.plannedEnd ?? null;

// @anchor to-todo-reminder
/// Przypomnienie w MS To Do = początek zadania (Od, `taskStart`), w czasie polskim — to samo, co alarm
/// w Ignite. Zadanie bez godziny (`durationMinutes` = null) ma przypomnienie wyłączone.
export const toTodoReminder = (t: { plannedStart?: Date | null; plannedEnd?: Date | null; durationMinutes?: number | null }) => {
  const start = taskStart(t);
  return t.durationMinutes && start
    ? { isReminderOn: true, reminderDateTime: { dateTime: toWarsawLocal(start), timeZone: 'Central European Standard Time' } }
    : { isReminderOn: false };
};

// @anchor task-statuses
/// Statusy zadania = kody `EXEC_STATUS_META` z frontu (wbsConstants.js), podzbiór sensowny dla zadania.
export const TASK_STATUSES = ['TO_DO', 'IN_PROGRESS', 'ON_HOLD', 'DONE', 'CANCELLED'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
// @anchor open-task-statuses
/// Zadanie „otwarte” — lista „Do zrobienia”, przypomnienia, przeterminowane.
export const OPEN_TASK_STATUSES: TaskStatus[] = ['TO_DO', 'IN_PROGRESS', 'ON_HOLD'];
// @anchor closed-task-statuses
export const CLOSED_TASK_STATUSES: TaskStatus[] = ['DONE', 'CANCELLED'];

// @anchor normalize-task-status
/// Status z requestu → kod EXEC. `OPEN` to stary kod UserTask (stare klienty, offline outbox) = `TO_DO`.
export const normalizeTaskStatus = (status: string): TaskStatus => {
  if (status === 'OPEN') return 'TO_DO';
  if ((TASK_STATUSES as readonly string[]).includes(status)) return status as TaskStatus;
  throw new BadRequestException(`Nieznany status zadania: ${status}`);
};

// @anchor to-todo-status
/// MS To Do zna tylko notStarted / completed — zamknięte zadanie (wykonane albo odwołane) = completed.
export const toTodoStatus = (status: string) => (CLOSED_TASK_STATUSES as string[]).includes(status) ? 'completed' : 'notStarted';

// @anchor status-filter
/// Filtr listy: OPEN (domyślnie) = otwarte, DONE = zamknięte, ALL = wszystkie (kalendarz zamówienia).
const statusFilter = (status: string | undefined) =>
  status === 'ALL' ? undefined : { in: status === 'DONE' ? CLOSED_TASK_STATUSES : OPEN_TASK_STATUSES };

// @anchor task-visibility-types
export const TASK_VISIBILITY_TYPES = ['ALL', 'MANAGER_ONLY', 'LOGISTYK_ONLY', 'MANAGER_LOGISTYK'] as const;

/** Pola harmonogramu przejęte z dawnego `Subtask`. */
interface TaskScheduleFields {
  visibilityType?: string;
  category?: string | null;
  phase?: string | null;
  requirementItemId?: string | null;
  isAiGenerated?: boolean;
  isApproved?: boolean;
}

export interface CreateUserTaskDto extends TaskScheduleFields {
  title: string;
  description?: string;
  status?: string;
  plannedStart?: Date;
  plannedEnd?: Date;
  /** Ustawione = zadanie ma godzinę i powstaje wydarzenie w kalendarzu Outlook; = minuty od plannedStart do plannedEnd. */
  durationMinutes?: number | null;
  nodeId?: string;
  wbsNodeId?: string;
  /** Odpowiedzialny — domyślnie autor. */
  assigneeUserId?: string;
}

export interface UpdateUserTaskDto extends TaskScheduleFields {
  title?: string;
  description?: string;
  status?: string;
  plannedStart?: Date;
  plannedEnd?: Date;
  durationMinutes?: number | null;
  nodeId?: string;
  wbsNodeId?: string | null;
  /** Przepisanie na innego odpowiedzialnego (może właściciel albo autor). */
  assigneeUserId?: string;
}

// @anchor task-viewer
/// Kto ogląda listę zamówienia — do filtra `visibilityType` (jak dawniej przy Subtaskach).
export interface TaskViewer { userId: string; roles?: string[] }

// @anchor visibility-where
/// ADMIN / MANAGER widzą wszystko; LOGISTYK dodatkowo zadania „logistyk”; reszta tylko ALL.
/// Własne zadania (odpowiedzialny / autor) widać zawsze.
const visibilityWhere = (viewer?: TaskViewer) => {
  if (!viewer) return {};
  const roles = viewer.roles || [];
  if (roles.some(r => r === 'ADMIN' || r === 'MANAGER')) return {};
  const allowed = roles.includes('LOGISTYK') ? ['ALL', 'LOGISTYK_ONLY', 'MANAGER_LOGISTYK'] : ['ALL'];
  return { OR: [{ visibilityType: { in: allowed } }, { userId: viewer.userId }, { createdById: viewer.userId }] };
};

const SCHEDULE_KEYS = ['visibilityType', 'category', 'phase', 'requirementItemId', 'isAiGenerated', 'isApproved'] as const;

// @anchor schedule-data
const scheduleData = (dto: TaskScheduleFields) => {
  const data: any = {};
  for (const k of SCHEDULE_KEYS) if (k in dto) data[k] = (dto as any)[k];
  if (data.visibilityType !== undefined && !(TASK_VISIBILITY_TYPES as readonly string[]).includes(data.visibilityType)) {
    throw new BadRequestException(`Nieznana widoczność zadania: ${data.visibilityType}`);
  }
  return data;
};

const TASK_PERSON_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

// @anchor user-tasks-service
@Injectable()
export class UserTasksService {
  private readonly logger = new Logger(UserTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifSettings: NotificationSettingsService,
    private readonly msTodo: MsTodoService,
    private readonly msCalendar: MsCalendarService,
  ) {}

  // @anchor user-tasks-list
  // Domyślnie otwarte (OPEN_TASK_STATUSES) i nie-usunięte, sortowane po plannedEnd ASC (null na końcu).
  // status='DONE' → zamknięte (najświeższe pierwsze) do podglądu w filtrze „Wykonane".
  async listForUser(userId: string, status: string = 'OPEN') {
    return this.prisma.userTask.findMany({
      where: { userId, status: statusFilter(status), deletedAt: null },
      orderBy: status === 'DONE' ? [{ updatedAt: 'desc' }] : [{ plannedEnd: 'asc' }],
      include: {
        node: { select: { id: true, name: true } },
        // pozycja WBS — kontekst zadania w widoku mobilnym („projekt › pozycja”)
        wbsNode: { select: { id: true, name: true } },
        reminders: {
          where: { sentAt: null },
          orderBy: { remindAt: 'asc' },
          select: { id: true, remindAt: true, recurIntervalMinutes: true, recurEnd: true, sentAt: true },
        },
      },
    });
  }

  // @anchor user-tasks-list-for-wbs-node
  // Zadania WSZYSTKICH użytkowników przypięte do węzła WBS (szuflada „Zadania" w Planowanie/WBS).
  // Otwarte najpierw (po plannedEnd), potem wykonane. Edycja dalej tylko przez właściciela (update/softDelete filtrują po userId).
  async listForWbsNode(wbsNodeId: string) {
    const tasks = await this.prisma.userTask.findMany({
      where: { wbsNodeId, deletedAt: null },
      orderBy: [{ status: 'desc' }, { plannedEnd: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, title: true, description: true, status: true, plannedEnd: true, createdAt: true, userId: true, createdById: true,
        // pola wspólnego TaskModal (edycja z listy zadań węzła)
        nodeId: true, wbsNodeId: true, durationMinutes: true, msEventId: true, visibilityType: true, category: true, phase: true,
        wbsNode: { select: { id: true, name: true } },
        user: { select: TASK_PERSON_SELECT },
        createdBy: { select: TASK_PERSON_SELECT },
        // aktywna seria alarmu cyklicznego — znacznik na przycisku w szufladzie WBS
        reminders: { where: { sentAt: null, recurIntervalMinutes: { not: null } }, select: { id: true } },
      },
    });
    return tasks;
  }

  // @anchor user-tasks-list-for-project
  // Zadania WSZYSTKICH użytkowników w projekcie — kalendarz Planowanie → Zadania i „Wszystkie zadania”
  // (w MS To Do zadanie ma tylko odpowiedzialny). Domyślnie otwarte; status=DONE → zamknięte; status=ALL → wszystkie
  // (kalendarz zamówienia, kolor wg statusu). Widoczność wg `visibilityType` i ról oglądającego.
  // Każde zadanie dostaje `wbsPath` — nazwy gałęzi od top-level do węzła, do grupowania po gałęziach.
  async listForProject(processNodeId: string, status: string = 'OPEN', viewer?: TaskViewer) {
    const tasks = await this.prisma.userTask.findMany({
      where: { nodeId: processNodeId, status: statusFilter(status), deletedAt: null, ...visibilityWhere(viewer) },
      orderBy: status === 'DONE' ? [{ updatedAt: 'desc' }] : [{ plannedEnd: 'asc' }],
      include: {
        node: { select: { id: true, name: true } },
        wbsNode: { select: { id: true, name: true } },
        user: { select: TASK_PERSON_SELECT },
        createdBy: { select: TASK_PERSON_SELECT },
      },
    });
    const paths = await this.wbsPaths(tasks.map(t => t.wbsNodeId).filter(Boolean) as string[]);
    return tasks.map(t => ({ ...t, wbsPath: t.wbsNodeId ? paths.get(t.wbsNodeId) || [] : [] }));
  }

  // @anchor user-tasks-wbs-paths
  // Ścieżki nazw WBS (top-level → węzeł) dla podanych węzłów; rodziców dociąga poziomami.
  private async wbsPaths(ids: string[]): Promise<Map<string, { id: string; name: string }[]>> {
    const byId = new Map<string, { id: string; name: string; parentId: string | null }>();
    let pending = [...new Set(ids)];
    for (let guard = 0; pending.length && guard < 20; guard++) {
      const rows = await this.prisma.wbsNode.findMany({
        where: { id: { in: pending } },
        select: { id: true, name: true, parentId: true },
      });
      rows.forEach(r => byId.set(r.id, r));
      pending = [...new Set(rows.map(r => r.parentId).filter((p): p is string => !!p && !byId.has(p)))];
    }
    const out = new Map<string, { id: string; name: string }[]>();
    for (const id of new Set(ids)) {
      const path: { id: string; name: string }[] = [];
      let cur = byId.get(id);
      while (cur && path.length < 20) { path.unshift({ id: cur.id, name: cur.name }); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
      out.set(id, path);
    }
    return out;
  }

  // @anchor user-tasks-project-team
  // Zespół zamówienia (Team.orderNodeId) — kogo można wskazać jako odpowiedzialnego za zadanie
  // z WBS. To samo źródło co widoczność zamówienia; właściciel zawsze na liście. Tylko aktywni.
  async projectTeam(processNodeId: string) {
    const [node, team] = await Promise.all([
      this.prisma.processNode.findUnique({
        where: { id: processNodeId },
        select: { owner: { select: { ...TASK_PERSON_SELECT, isActive: true } } },
      }),
      this.prisma.team.findUnique({
        where: { orderNodeId: processNodeId },
        select: { users: { select: { ...TASK_PERSON_SELECT, isActive: true } } },
      }),
    ]);
    const map = new Map<string, any>();
    for (const u of [node?.owner, ...(team?.users || [])]) {
      if (u?.id && u.isActive !== false && !map.has(u.id)) map.set(u.id, u);
    }
    return [...map.values()].map(({ isActive, ...u }) => u);
  }

  // @anchor user-tasks-wbs-summary
  // Liczniki zadań (wszystkich użytkowników) per węzeł WBS projektu — kolor ikony „Zadania" w tabeli WBS
  // bez otwierania szuflady. overdue = otwarte z plannedEnd w przeszłości.
  async wbsSummaryForProcessNode(processNodeId: string) {
    const tasks = await this.prisma.userTask.findMany({
      where: { deletedAt: null, wbsNodeId: { not: null }, wbsNode: { nodeId: processNodeId } },
      select: { wbsNodeId: true, status: true, plannedEnd: true },
    });
    const now = new Date();
    const summary: Record<string, { open: number; overdue: number; done: number }> = {};
    for (const t of tasks) {
      const s = (summary[t.wbsNodeId!] ||= { open: 0, overdue: 0, done: 0 });
      if ((CLOSED_TASK_STATUSES as string[]).includes(t.status)) s.done++;
      else {
        s.open++;
        if (t.plannedEnd && t.plannedEnd < now) s.overdue++;
      }
    }
    return summary;
  }

  // @anchor user-tasks-create
  // `userId` = zalogowany autor; odpowiedzialnym jest `assigneeUserId` (domyślnie autor) —
  // do jego MS To Do trafia zadanie i jemu odpala się przypomnienie.
  async create(userId: string, dto: CreateUserTaskDto) {
    // Wskazany odpowiedzialny (także autor sam sobie) musi być w zespole zamówienia; bez wskazania = autor.
    const ownerId = dto.assigneeUserId ? await this.resolveAssignee(dto.assigneeUserId, '', dto.nodeId) : userId;
    const task = await this.prisma.userTask.create({
      data: {
        userId: ownerId,
        createdById: userId,
        title: dto.title,
        description: dto.description,
        status: dto.status ? normalizeTaskStatus(dto.status) : 'TO_DO',
        ...scheduleData(dto),
        plannedStart: dto.plannedStart,
        plannedEnd: dto.plannedEnd,
        durationMinutes: dto.durationMinutes ?? null,
        nodeId: dto.nodeId ?? null,
        wbsNodeId: dto.wbsNodeId ?? null,
        source: 'IGNITE',
      },
    });

    await this.syncReminderForTask(task.id, ownerId, taskStart(task));
    await this.pushNewTaskToGraph(ownerId, task);
    await this.syncCalendarEvent(task.id);
    return task;
  }

  // @anchor user-tasks-resolve-assignee
  // Zadanie z zamówieniem (`processNodeId`) można powierzyć tylko komuś z zespołu zamówienia (`projectTeam`).
  private async resolveAssignee(assigneeUserId: string | undefined, fallback: string, processNodeId?: string | null): Promise<string> {
    if (!assigneeUserId || assigneeUserId === fallback) return fallback;
    const exists = await this.prisma.user.findUnique({ where: { id: assigneeUserId }, select: { id: true } });
    if (!exists) throw new BadRequestException('Nie znaleziono wybranego użytkownika');
    if (processNodeId) {
      const team = await this.projectTeam(processNodeId);
      if (!team.some(u => u.id === assigneeUserId)) {
        throw new BadRequestException('Odpowiedzialnym może być tylko osoba z zespołu zamówienia');
      }
    }
    return assigneeUserId;
  }

  // @anchor user-tasks-find-editable
  // Zadanie, które wolno edytować zalogowanemu: odpowiedzialny albo autor.
  private findEditable(userId: string, taskId: string) {
    return this.prisma.userTask.findFirst({
      where: { id: taskId, deletedAt: null, OR: [{ userId }, { createdById: userId }] },
    });
  }

  // @anchor user-tasks-update
  // Edytować może odpowiedzialny albo autor. Zmiana `assigneeUserId` przenosi zadanie: wpis w MS To Do
  // poprzedniego odpowiedzialnego jest usuwany, nowy powstaje u nowego, przypomnienie przechodzi z nim.
  // Pierwsza edycja zadania zmigrowanego z `subtasks` uruchamia jego sync (`activateMigratedTask`).
  async update(userId: string, taskId: string, dto: UpdateUserTaskDto) {
    const task = await this.findEditable(userId, taskId);
    if (!task) return { count: 0 };

    const { assigneeUserId, ...rest } = dto;
    const data: any = scheduleData(rest);
    for (const k of ['title', 'description', 'status', 'plannedStart', 'plannedEnd', 'durationMinutes', 'nodeId', 'wbsNodeId'] as const) {
      if (k in rest) data[k] = (rest as any)[k];
    }
    if (data.status !== undefined) data.status = normalizeTaskStatus(data.status);
    // JSON niesie daty jako tekst — syncReminderForTask liczy na Date (getHours), więc zamieniamy tutaj.
    for (const k of ['plannedStart', 'plannedEnd'] as const) {
      if (typeof data[k] === 'string') data[k] = data[k] ? new Date(data[k]) : null;
    }

    if (task.source === 'SUBTASK_MIGRATION') {
      const ownerId = assigneeUserId ? await this.resolveAssignee(assigneeUserId, task.userId, data.nodeId ?? task.nodeId) : task.userId;
      await this.prisma.userTask.update({ where: { id: taskId }, data: { ...data, userId: ownerId, source: 'IGNITE' } });
      await this.activateMigratedTask(taskId);
      return { count: 1 };
    }

    const newOwnerId = assigneeUserId ? await this.resolveAssignee(assigneeUserId, task.userId, data.nodeId ?? task.nodeId) : task.userId;
    if (newOwnerId !== task.userId) {
      if (task.msToDoId && task.msListId) {
        try {
          await this.msTodo.deleteTask(task.userId, task.msListId, task.msToDoId);
        } catch (err: any) {
          this.logger.warn(`reassign: delete from MS To Do failed for task ${taskId}: ${err?.message}`);
        }
      }
      await this.deleteCalendarEvent(task);
      await this.prisma.taskReminder.deleteMany({ where: { userTaskId: taskId, sentAt: null } });
      const updated = await this.prisma.userTask.update({
        where: { id: taskId },
        data: { ...data, userId: newOwnerId, msToDoId: null, msListId: null, msListName: null, msEtag: null, msLastModified: null, msEventId: null },
      });
      await this.syncReminderForTask(taskId, newOwnerId, taskStart(updated));
      await this.pushNewTaskToGraph(newOwnerId, updated);
      await this.syncCalendarEvent(taskId);
      return { count: 1 };
    }

    const updated = await this.prisma.userTask.update({ where: { id: taskId }, data });
    if ('plannedEnd' in data || 'plannedStart' in data) {
      await this.syncReminderForTask(taskId, task.userId, taskStart(updated));
    }
    await this.pushUpdateToGraph(task.userId, taskId, data);
    if (['title', 'description', 'plannedStart', 'plannedEnd', 'durationMinutes'].some(k => k in data)) {
      await this.syncCalendarEvent(taskId);
    }
    return { count: 1 };
  }

  // @anchor user-tasks-activate-migrated-task
  // Zadanie z migracji `subtasks` startuje bez MS i bez przypomnień (decyzja 5 planu). Przy pierwszej
  // edycji dostaje to, co każde nowe zadanie — o ile jest otwarte: zamknięte nigdy nie idzie do MS.
  private async activateMigratedTask(taskId: string): Promise<void> {
    const task = await this.prisma.userTask.findUnique({ where: { id: taskId } });
    if (!task || (CLOSED_TASK_STATUSES as string[]).includes(task.status)) return;
    await this.syncReminderForTask(task.id, task.userId, taskStart(task));
    await this.pushNewTaskToGraph(task.userId, task);
    await this.syncCalendarEvent(task.id);
  }

  // @anchor user-tasks-soft-delete
  async softDelete(userId: string, taskId: string) {
    const task = await this.findEditable(userId, taskId);
    if (!task) return { count: 0 };
    const result = await this.prisma.userTask.updateMany({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });

    if (task.msToDoId && task.msListId) {
      try {
        // Token Graph należy do odpowiedzialnego, nie do autora, który usuwa.
        await this.msTodo.updateTask(task.userId, task.msListId, task.msToDoId, { status: 'completed' });
      } catch (err: any) {
        this.logger.warn(`pushDelete failed for task ${taskId}: ${err?.message}`);
      }
    }
    await this.deleteCalendarEvent(task);
    return result;
  }

  // @anchor user-tasks-sync-reminder
  // Tworzy/aktualizuje/usuwa TaskReminder wg początku zadania (`taskStart`). Bez konkretnej godziny (00:00) → alarm o defaultReminderHour.
  // Dotyka WYŁĄCZNIE alarmów jednorazowych (recurIntervalMinutes: null) — serie cykliczne są niezależne od plannedEnd.
  async syncReminderForTask(taskId: string, userId: string, plannedEnd: Date | null | undefined): Promise<void> {
    if (!plannedEnd) {
      await this.prisma.taskReminder.deleteMany({ where: { userTaskId: taskId, sentAt: null, recurIntervalMinutes: null } });
      return;
    }

    const settings = await this.notifSettings.getOrCreate();
    const hasTime = plannedEnd.getHours() !== 0 || plannedEnd.getMinutes() !== 0;
    const remindAt = new Date(plannedEnd);
    if (!hasTime) remindAt.setHours(settings.defaultReminderHour, 0, 0, 0);

    const existing = await this.prisma.taskReminder.findFirst({ where: { userTaskId: taskId, sentAt: null, recurIntervalMinutes: null } });
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

      const payload: any = { title: task.title, status: toTodoStatus(task.status) };
      if (task.description) payload.body = toTodoBody(task.description);
      if (task.plannedEnd) {
        payload.dueDateTime = toTodoDue(task.plannedEnd as Date);
      }
      Object.assign(payload, toTodoReminder(task));

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
      if (dto.description !== undefined) patch.body = toTodoBody(task.description);
      if (dto.status !== undefined) patch.status = toTodoStatus(task.status);
      if ('plannedEnd' in dto) {
        patch.dueDateTime = task.plannedEnd
          ? toTodoDue(task.plannedEnd as Date)
          : null;
      }
      if (['plannedStart', 'plannedEnd', 'durationMinutes'].some(k => k in dto)) {
        Object.assign(patch, toTodoReminder(task));
      }
      if (Object.keys(patch).length === 0) return;

      await this.msTodo.updateTask(userId, task.msListId, task.msToDoId, patch);
    } catch (err: any) {
      this.logger.warn(`pushUpdateToGraph failed for task ${taskId}: ${err?.message}`);
    }
  }

  // @anchor user-tasks-sync-calendar-event
  // Best-effort: zadanie z godziną (taskStart + durationMinutes, czyli Od–Do) = wydarzenie w kalendarzu Outlook
  // ODPOWIEDZIALNEGO. Zmiana tytułu/terminu/czasu trwania przesuwa wydarzenie, zdjęcie godziny je usuwa.
  // Wykonane zadanie zostaje w kalendarzu (ślad, że było zrobione w tym czasie).
  async syncCalendarEvent(taskId: string): Promise<void> {
    const task = await this.prisma.userTask.findUnique({ where: { id: taskId } });
    if (!task || task.source === 'SUBTASK_MIGRATION') return;
    try {
      if (task.deletedAt || !task.plannedEnd || !task.durationMinutes) {
        await this.deleteCalendarEvent(task);
        return;
      }
      const tokenRecord = await this.prisma.userMsToken.findUnique({ where: { userId: task.userId } });
      if (!tokenRecord || tokenRecord.needsReauth) return;
      const settings = await this.notifSettings.getOrCreate();
      if (!settings.msTodoEnabled) return;

      const input = { subject: task.title, body: task.description, start: taskStart(task)!, durationMinutes: task.durationMinutes };
      if (task.msEventId && await this.msCalendar.updateEvent(task.userId, task.msEventId, input)) return;
      const msEventId = await this.msCalendar.createEvent(task.userId, input);
      await this.prisma.userTask.update({ where: { id: taskId }, data: { msEventId } });
    } catch (err: any) {
      this.logger.warn(`syncCalendarEvent failed for task ${taskId}: ${err?.response?.status ?? ''} ${err?.message}`);
    }
  }

  // @anchor user-tasks-delete-calendar-event
  // Usuwa wydarzenie z kalendarza dotychczasowego odpowiedzialnego (jego token) i czyści msEventId.
  private async deleteCalendarEvent(task: { id: string; userId: string; msEventId: string | null }): Promise<void> {
    if (!task.msEventId) return;
    try {
      await this.msCalendar.deleteEvent(task.userId, task.msEventId);
    } catch (err: any) {
      this.logger.warn(`deleteCalendarEvent failed for task ${task.id}: ${err?.message}`);
    }
    await this.prisma.userTask.update({ where: { id: task.id }, data: { msEventId: null } });
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
  // Alerty wymagające wyświetlenia. Jednorazowe: remindAt <= teraz, sentAt=null.
  // Cykliczne (recurIntervalMinutes != null): bieżące wystąpienie liczone z zegara
  // (remindAt=start serii), pokazywane raz per interwał — kursor lastFiredAt zapobiega
  // ponownemu odpaleniu tego samego wystąpienia aż do kolejnego interwału.
  async getDueReminders(userId: string) {
    const now = new Date();
    const rows = await this.prisma.taskReminder.findMany({
      where: {
        userId,
        sentAt: null,
        userTask: { status: { in: OPEN_TASK_STATUSES }, deletedAt: null },
      },
      include: { userTask: { select: { id: true, title: true, plannedEnd: true } } },
      orderBy: { remindAt: 'asc' },
    });

    const due: typeof rows = [];
    const toAdvance: { id: string; at: Date }[] = [];

    for (const r of rows) {
      if (r.recurIntervalMinutes == null) {
        if (r.remindAt.getTime() <= now.getTime()) due.push(r);
        continue;
      }
      // cykliczny: policz bieżące wystąpienie z siatki start + interwał·k
      const start = r.remindAt.getTime();
      if (start > now.getTime()) continue; // seria jeszcze nie ruszyła
      if (r.recurEnd && now.getTime() > r.recurEnd.getTime()) continue; // seria zakończona
      const intervalMs = r.recurIntervalMinutes * 60000;
      const idx = Math.floor((now.getTime() - start) / intervalMs);
      const currentOcc = new Date(start + idx * intervalMs);
      if (r.recurEnd && currentOcc.getTime() > r.recurEnd.getTime()) continue;
      if (!r.lastFiredAt || currentOcc.getTime() > r.lastFiredAt.getTime()) {
        due.push(r);
        toAdvance.push({ id: r.id, at: currentOcc });
      }
    }

    // oznacz wyświetlone wystąpienia cykliczne → znikną do kolejnego interwału
    await Promise.all(
      toAdvance.map((t) =>
        this.prisma.taskReminder.update({ where: { id: t.id }, data: { lastFiredAt: t.at } }),
      ),
    );

    return due;
  }

  // @anchor user-tasks-create-reminder
  // Tworzy alarm dla zadania. intervalMinutes ustawione → seria cykliczna (jeden wiersz-reguła),
  // zastępuje istniejącą serię cykliczną tego zadania. Bez intervalMinutes → alarm jednorazowy o `start`.
  // Ustawić może odpowiedzialny albo zlecający (findEditable), ale alarm zawsze dzwoni u
  // ODPOWIEDZIALNEGO (`task.userId`) — to jego push, jego MS To Do.
  async createReminder(
    userId: string,
    taskId: string,
    dto: { start?: string | Date; end?: string | Date; intervalMinutes?: number },
  ) {
    const task = await this.findEditable(userId, taskId);
    if (!task) return null;
    const ownerId = task.userId;

    const start = dto.start ? new Date(dto.start) : new Date();
    const interval = dto.intervalMinutes ?? null;

    if (interval != null) {
      // jedna aktywna seria cykliczna per zadanie — usuń poprzednią
      await this.prisma.taskReminder.deleteMany({
        where: { userTaskId: taskId, recurIntervalMinutes: { not: null } },
      });
    }

    const reminder = await this.prisma.taskReminder.create({
      data: {
        userTaskId: taskId,
        userId: ownerId,
        remindAt: start,
        recurIntervalMinutes: interval,
        recurEnd: dto.end ? new Date(dto.end) : null,
      },
    });

    // @anchor user-tasks-cyclic-end-as-deadline — seria cykliczna z datą „Do” przesuwa termin zadania
    // na tę datę (plakietka „Dzisiaj/Przeterminowane”, kalendarz i MS To Do liczą termin z plannedEnd).
    if (interval != null && dto.end) {
      const plannedEnd = new Date(dto.end);
      await this.prisma.userTask.update({ where: { id: taskId }, data: { plannedEnd } });
      const t = await this.prisma.userTask.findUnique({ where: { id: taskId } });
      await this.syncReminderForTask(taskId, ownerId, t ? taskStart(t) : plannedEnd);
      await this.pushUpdateToGraph(ownerId, taskId, { plannedEnd });
      await this.syncCalendarEvent(taskId);
    }
    return reminder;
  }

  // @anchor user-tasks-list-reminders
  // Alarmy zadania widzi odpowiedzialny i zlecający (ten sam krąg co edycja zadania).
  async getRemindersForTask(userId: string, taskId: string) {
    if (!(await this.findEditable(userId, taskId))) return [];
    return this.prisma.taskReminder.findMany({
      where: { userTaskId: taskId },
      orderBy: { remindAt: 'asc' },
    });
  }

  // @anchor user-tasks-delete-reminder
  // Usuwa odpowiedzialny (właściciel alarmu) albo zlecający zadania.
  async deleteReminder(userId: string, reminderId: string) {
    return this.prisma.taskReminder.deleteMany({
      where: { id: reminderId, OR: [{ userId }, { userTask: { createdById: userId } }] },
    });
  }

  // @anchor user-tasks-handle-reminder
  // action='dismiss' → sentAt=now (ubija też całą serię cykliczną — kolejne wystąpienia znikają).
  // action='snooze' jednorazowy → nowy remindAt; cykliczny → pomiń bieżące wystąpienie na `minutes`.
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
      if (reminder.recurIntervalMinutes != null) {
        // cykliczny: nie ruszaj startu serii, tylko przesuń kursor „pokazane" w przyszłość
        await this.prisma.taskReminder.update({
          where: { id: reminderId },
          data: { lastFiredAt: new Date(Date.now() + minutes * 60000) },
        });
      } else {
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
  }

  // @anchor user-tasks-templates
  // Szablony zadań (tytuł + komentarz) — model `SubtaskTemplate`, przejęty z modułu `subtasks`.
  listTemplates() {
    return this.prisma.subtaskTemplate.findMany({ orderBy: { name: 'asc' } });
  }

  // @anchor user-tasks-save-template — upsert po nazwie (nazwa szablonu jest unikalna)
  saveTemplate(dto: { name: string; description?: string | null }) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('Szablon wymaga nazwy');
    return this.prisma.subtaskTemplate.upsert({
      where: { name },
      update: { description: dto.description ?? null },
      create: { name, description: dto.description ?? null },
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
