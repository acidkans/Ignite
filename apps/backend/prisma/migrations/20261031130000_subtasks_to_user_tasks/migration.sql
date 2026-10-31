-- Ujednolicenie Subtask → UserTask, etap 3: migracja danych.
-- Plan i decyzje: docs/PLAN-UJEDNOLICENIE-ZADAN.md.
--
-- Na produkcji PRZED deployem: /srv/apps/erp/backup-db.sh (pełny zrzut). Tabela `subtasks`
-- zostaje nietknięta do etapu 9, więc do tego czasu źródło jest też w samej bazie.
-- Podgląd bez zapisu: test/migracja-zadan-dryrun.sql.
--
-- 1. Statusy istniejących user_tasks → kody EXEC_STATUS_META (OPEN → TO_DO, DONE zostaje).
-- 2. Subtaski z wersji AKTYWNEJ zamówienia (albo baseline, gdy aktywna nie ma własnych wierszy —
--    ta sama reguła co `loadSourceRows` w versioning.service.ts) → user_tasks.
--    Subtaski zamrożonych wersji to kopie — nie migrują.
--    Odpowiedzialny: assignedUserId, a bez osoby andrzej@gigatel.app (decyzja 3).
--    wbsNodeId = NULL — węzeł wybiera się ręcznie w modalu (decyzja 2).
--    Termin: dzień kalendarzowy plannedEnd (albo plannedStart), 8:00 czasu polskiego, 60 min.
--    source = SUBTASK_MIGRATION, bez msToDoId / msEventId i bez TaskReminder — zero syncu do MS
--    i zero powiadomień przy migracji (decyzja 5).
-- 3. Przepięcie FK (budżet, schematy, znaczniki, materiały) na migrowane zadania.
--    Wiersze wskazujące na Subtaski zamrożonych wersji zostają z userTaskId = NULL.

UPDATE "user_tasks" SET "status" = 'TO_DO' WHERE "status" = 'OPEN';
ALTER TABLE "user_tasks" ALTER COLUMN "status" SET DEFAULT 'TO_DO';

WITH active AS (
    SELECT "nodeId", "id" FROM "project_versions" WHERE "isActive" = true
),
src AS (
    SELECT s.*
    FROM "subtasks" s
    LEFT JOIN active a ON a."nodeId" = s."nodeId"
    WHERE (a."id" IS NOT NULL AND s."versionId" = a."id")
       OR (s."versionId" IS NULL AND NOT EXISTS (
            SELECT 1 FROM "subtasks" s2 WHERE s2."nodeId" = s."nodeId" AND s2."versionId" = a."id"))
),
fallback_owner AS (
    SELECT "id" FROM "users" WHERE lower("email") = 'andrzej@gigatel.app' LIMIT 1
)
INSERT INTO "user_tasks" (
    "id", "userId", "nodeId", "wbsNodeId", "versionId", "title", "description", "status",
    "plannedStart", "plannedEnd", "durationMinutes", "source", "visibilityType", "category", "phase",
    "requirementItemId", "isAiGenerated", "isApproved", "legacySubtaskId", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    COALESCE(src."assignedUserId", (SELECT "id" FROM fallback_owner)),
    src."nodeId",
    NULL,
    NULL,
    src."name",
    src."description",
    CASE src."status"
        WHEN 'STARTED'   THEN 'IN_PROGRESS'
        WHEN 'ON_HOLD'   THEN 'ON_HOLD'
        WHEN 'FINISHED'  THEN 'DONE'
        WHEN 'DONE'      THEN 'DONE'
        WHEN 'CANCELLED' THEN 'CANCELLED'
        ELSE 'TO_DO'
    END,
    -- Prisma trzyma DateTime jako UTC bez strefy. Dzień bierzemy z UTC — formularz Subtaska zapisywał
    -- dni jako 12:00 / 23:59:59 UTC, więc czas polski przesunąłby koniec dnia na następny. 8:00 polskiego → UTC.
    CASE WHEN src."plannedStart" IS NULL THEN NULL ELSE
        ((src."plannedStart"::date + TIME '08:00')
            AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'UTC' END,
    CASE WHEN COALESCE(src."plannedEnd", src."plannedStart") IS NULL THEN NULL ELSE
        ((COALESCE(src."plannedEnd", src."plannedStart")::date + TIME '08:00')
            AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'UTC' END,
    CASE WHEN COALESCE(src."plannedEnd", src."plannedStart") IS NULL THEN NULL ELSE 60 END,
    'SUBTASK_MIGRATION',
    src."visibilityType",
    src."category",
    src."phase",
    src."requirementItemId",
    src."isAiGenerated",
    src."isApproved",
    src."id",
    src."createdAt",
    src."updatedAt"
FROM src
-- Bez osoby i bez konta fallback (baza bez andrzej@gigatel.app) — nie ma komu przypisać.
WHERE COALESCE(src."assignedUserId", (SELECT "id" FROM fallback_owner)) IS NOT NULL;

UPDATE "budget_line_items" b SET "userTaskId" = t."id"
FROM "user_tasks" t WHERE t."legacySubtaskId" = b."subtaskId";

UPDATE "schematic_documents" d SET "userTaskId" = t."id"
FROM "user_tasks" t WHERE t."legacySubtaskId" = d."subtaskId";

UPDATE "schematic_markers" m SET "userTaskId" = t."id"
FROM "user_tasks" t WHERE t."legacySubtaskId" = m."subtaskId";

UPDATE "material_requirements" r SET "assignedUserTaskId" = t."id"
FROM "user_tasks" t WHERE t."legacySubtaskId" = r."assignedSubtaskId";

INSERT INTO "user_task_marker_links" ("id", "userTaskId", "markerId", "createdAt")
SELECT gen_random_uuid()::text, t."id", l."markerId", l."createdAt"
FROM "subtask_marker_links" l
JOIN "user_tasks" t ON t."legacySubtaskId" = l."subtaskId"
ON CONFLICT ("userTaskId", "markerId") DO NOTHING;
