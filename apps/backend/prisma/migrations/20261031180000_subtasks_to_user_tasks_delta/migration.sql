-- Ujednolicenie Subtask → UserTask, etap 8: dogranie różnic.
-- Między deployem etapów 2–7 a etapem 8 stare ekrany (Wszystkie zadania, schemat, mobile) dalej
-- zapisywały Subtaski. Ta migracja przenosi to, czego etap 3 nie widział — idempotentnie
-- (po `legacySubtaskId`), więc na bazie bez nowych Subtasków nic nie zmienia.
--
-- 1. Nowe Subtaski aktywnej wersji → user_tasks, te same reguły co etap 3, od razu w formacie Od–Do
--    (Od = pierwszy dzień 8:00, Do = ostatni dzień 9:00 — jak po migracji 20261031150000).
-- 2. Status zmieniony w Subtasku po migracji → zadanie, które od migracji nikt nie edytował
--    (source dalej SUBTASK_MIGRATION, Subtask nowszy od zadania).
-- 3. Przepięcie FK tylko tam, gdzie wiersz nie wskazuje jeszcze żadnego zadania.

WITH active AS (
    SELECT "nodeId", "id" FROM "project_versions" WHERE "isActive" = true
),
src AS (
    SELECT s.*
    FROM "subtasks" s
    LEFT JOIN active a ON a."nodeId" = s."nodeId"
    WHERE ((a."id" IS NOT NULL AND s."versionId" = a."id")
       OR (s."versionId" IS NULL AND NOT EXISTS (
            SELECT 1 FROM "subtasks" s2 WHERE s2."nodeId" = s."nodeId" AND s2."versionId" = a."id")))
      AND NOT EXISTS (SELECT 1 FROM "user_tasks" u WHERE u."legacySubtaskId" = s."id")
),
fallback_owner AS (
    SELECT "id" FROM "users" WHERE lower("email") = 'andrzej@gigatel.app' LIMIT 1
),
dated AS (
    SELECT src.*,
        CASE WHEN COALESCE(src."plannedStart", src."plannedEnd") IS NULL THEN NULL ELSE
            ((COALESCE(src."plannedStart", src."plannedEnd")::date + TIME '08:00')
                AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'UTC' END AS t_start,
        CASE WHEN COALESCE(src."plannedEnd", src."plannedStart") IS NULL THEN NULL ELSE
            ((COALESCE(src."plannedEnd", src."plannedStart")::date + TIME '09:00')
                AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'UTC' END AS t_end
    FROM src
)
INSERT INTO "user_tasks" (
    "id", "userId", "nodeId", "wbsNodeId", "versionId", "title", "description", "status",
    "plannedStart", "plannedEnd", "durationMinutes", "source", "visibilityType", "category", "phase",
    "requirementItemId", "isAiGenerated", "isApproved", "legacySubtaskId", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    COALESCE(d."assignedUserId", (SELECT "id" FROM fallback_owner)),
    d."nodeId", NULL, NULL, d."name", d."description",
    CASE d."status"
        WHEN 'STARTED'   THEN 'IN_PROGRESS'
        WHEN 'ON_HOLD'   THEN 'ON_HOLD'
        WHEN 'FINISHED'  THEN 'DONE'
        WHEN 'DONE'      THEN 'DONE'
        WHEN 'CANCELLED' THEN 'CANCELLED'
        ELSE 'TO_DO'
    END,
    d.t_start, d.t_end,
    CASE WHEN d.t_end IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM (d.t_end - d.t_start)) / 60)::int END,
    'SUBTASK_MIGRATION', d."visibilityType", d."category", d."phase", d."requirementItemId",
    d."isAiGenerated", d."isApproved", d."id", d."createdAt", d."updatedAt"
FROM dated d
WHERE COALESCE(d."assignedUserId", (SELECT "id" FROM fallback_owner)) IS NOT NULL;

UPDATE "user_tasks" t SET
    "status" = CASE s."status"
        WHEN 'STARTED'   THEN 'IN_PROGRESS'
        WHEN 'ON_HOLD'   THEN 'ON_HOLD'
        WHEN 'FINISHED'  THEN 'DONE'
        WHEN 'DONE'      THEN 'DONE'
        WHEN 'CANCELLED' THEN 'CANCELLED'
        ELSE 'TO_DO'
    END,
    "title" = s."name",
    "description" = s."description",
    "updatedAt" = s."updatedAt"
FROM "subtasks" s
WHERE t."legacySubtaskId" = s."id" AND t."source" = 'SUBTASK_MIGRATION' AND s."updatedAt" > t."updatedAt";

UPDATE "budget_line_items" b SET "userTaskId" = t."id"
FROM "user_tasks" t WHERE t."legacySubtaskId" = b."subtaskId" AND b."userTaskId" IS NULL;

UPDATE "schematic_documents" d SET "userTaskId" = t."id"
FROM "user_tasks" t WHERE t."legacySubtaskId" = d."subtaskId" AND d."userTaskId" IS NULL;

UPDATE "schematic_markers" m SET "userTaskId" = t."id"
FROM "user_tasks" t WHERE t."legacySubtaskId" = m."subtaskId" AND m."userTaskId" IS NULL;

UPDATE "material_requirements" r SET "assignedUserTaskId" = t."id"
FROM "user_tasks" t WHERE t."legacySubtaskId" = r."assignedSubtaskId" AND r."assignedUserTaskId" IS NULL;

INSERT INTO "user_task_marker_links" ("id", "userTaskId", "markerId", "createdAt")
SELECT gen_random_uuid()::text, t."id", l."markerId", l."createdAt"
FROM "subtask_marker_links" l
JOIN "user_tasks" t ON t."legacySubtaskId" = l."subtaskId"
ON CONFLICT ("userTaskId", "markerId") DO NOTHING;
