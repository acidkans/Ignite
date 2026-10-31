-- Ujednolicenie Subtask → UserTask, etap 9: usunięcie starego modelu.
-- Wcześniej (ten sam deploy, migracja 20261031180000) dogrywane są Subtaski zmienione po etapie 3.
-- Kolejność ma znaczenie: najpierw zdjęte FK i kolumny `subtaskId` / `assignedSubtaskId`, dopiero potem
-- DROP TABLE — żadnego DELETE na `subtasks`, więc `onDelete: Cascade` z budżetu i schematów nie odpala.
-- Znikają: Subtaski zamrożonych wersji (kopie, decyzja 1 — nie migrowane), `subtask_files` (puste na prod),
-- `subtask_marker_links` (przeniesione do `user_task_marker_links`). `subtask_templates` zostaje — szablony zadań.
-- Źródło do odtworzenia: backup sprzed deployu (/srv/apps/erp/backups).

-- DropForeignKey
ALTER TABLE "subtasks" DROP CONSTRAINT "subtasks_assignedUserId_fkey";

-- DropForeignKey
ALTER TABLE "subtasks" DROP CONSTRAINT "subtasks_nodeId_fkey";

-- DropForeignKey
ALTER TABLE "subtasks" DROP CONSTRAINT "subtasks_versionId_fkey";

-- DropForeignKey
ALTER TABLE "budget_line_items" DROP CONSTRAINT "budget_line_items_subtaskId_fkey";

-- DropForeignKey
ALTER TABLE "subtask_files" DROP CONSTRAINT "subtask_files_subtaskId_fkey";

-- DropForeignKey
ALTER TABLE "schematic_documents" DROP CONSTRAINT "schematic_documents_subtaskId_fkey";

-- DropForeignKey
ALTER TABLE "schematic_markers" DROP CONSTRAINT "schematic_markers_subtaskId_fkey";

-- DropForeignKey
ALTER TABLE "subtask_marker_links" DROP CONSTRAINT "subtask_marker_links_subtaskId_fkey";

-- DropForeignKey
ALTER TABLE "subtask_marker_links" DROP CONSTRAINT "subtask_marker_links_markerId_fkey";

-- DropForeignKey
ALTER TABLE "material_requirements" DROP CONSTRAINT "material_requirements_assignedSubtaskId_fkey";

-- AlterTable
ALTER TABLE "budget_line_items" DROP COLUMN "subtaskId";

-- AlterTable
ALTER TABLE "schematic_documents" DROP COLUMN "subtaskId";

-- AlterTable
ALTER TABLE "schematic_markers" DROP COLUMN "subtaskId";

-- AlterTable
ALTER TABLE "material_requirements" DROP COLUMN "assignedSubtaskId";

-- DropTable
DROP TABLE "subtasks";

-- DropTable
DROP TABLE "subtask_files";

-- DropTable
DROP TABLE "subtask_marker_links";

