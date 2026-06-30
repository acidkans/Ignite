-- AlterTable: ProcessNode — dodanie taskListSlug
ALTER TABLE "process_nodes" ADD COLUMN "taskListSlug" TEXT;
CREATE UNIQUE INDEX "process_nodes_taskListSlug_key" ON "process_nodes"("taskListSlug");

-- CreateTable: user_tasks
CREATE TABLE "user_tasks" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "nodeId"         TEXT,
    "versionId"      TEXT,
    "title"          TEXT NOT NULL,
    "description"    TEXT,
    "status"         TEXT NOT NULL DEFAULT 'OPEN',
    "plannedStart"   TIMESTAMP(3),
    "plannedEnd"     TIMESTAMP(3),
    "msToDoId"       TEXT,
    "msListId"       TEXT,
    "msListName"     TEXT,
    "msEtag"         TEXT,
    "msLastModified" TIMESTAMP(3),
    "source"         TEXT NOT NULL DEFAULT 'IGNITE',
    "deletedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_tasks_msToDoId_key" ON "user_tasks"("msToDoId");
CREATE INDEX "user_tasks_userId_deletedAt_idx" ON "user_tasks"("userId", "deletedAt");
CREATE INDEX "user_tasks_userId_nodeId_idx" ON "user_tasks"("userId", "nodeId");
CREATE INDEX "user_tasks_msToDoId_idx" ON "user_tasks"("msToDoId");

-- CreateTable: task_reminders
CREATE TABLE "task_reminders" (
    "id"          TEXT NOT NULL,
    "userTaskId"  TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "remindAt"    TIMESTAMP(3) NOT NULL,
    "sentAt"      TIMESTAMP(3),
    "snoozedFrom" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_reminders_remindAt_sentAt_idx" ON "task_reminders"("remindAt", "sentAt");
CREATE INDEX "task_reminders_userId_idx" ON "task_reminders"("userId");

-- CreateTable: ms_todo_sync_state
CREATE TABLE "ms_todo_sync_state" (
    "userId"              TEXT NOT NULL,
    "deltaLink"           TEXT,
    "msTodoSyncStartedAt" TIMESTAMP(3),
    "lastSyncAt"          TIMESTAMP(3),
    "lastSyncError"       TEXT,

    CONSTRAINT "ms_todo_sync_state_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey: user_tasks → users
ALTER TABLE "user_tasks" ADD CONSTRAINT "user_tasks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: user_tasks → process_nodes
ALTER TABLE "user_tasks" ADD CONSTRAINT "user_tasks_nodeId_fkey"
    FOREIGN KEY ("nodeId") REFERENCES "process_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: task_reminders → user_tasks
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_userTaskId_fkey"
    FOREIGN KEY ("userTaskId") REFERENCES "user_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ms_todo_sync_state → users
ALTER TABLE "ms_todo_sync_state" ADD CONSTRAINT "ms_todo_sync_state_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
