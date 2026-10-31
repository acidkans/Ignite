-- Ujednolicenie Subtask → UserTask, etap 2: pola z Subtaska w user_tasks i FK userTaskId obok starych subtaskId.
-- Kolumny subtaskId zostają do etapu 9 (usunięcie modelu Subtask).
-- AlterTable
ALTER TABLE "budget_line_items" ADD COLUMN     "userTaskId" TEXT;

-- AlterTable
ALTER TABLE "schematic_documents" ADD COLUMN     "userTaskId" TEXT;

-- AlterTable
ALTER TABLE "schematic_markers" ADD COLUMN     "userTaskId" TEXT;

-- AlterTable
ALTER TABLE "material_requirements" ADD COLUMN     "assignedUserTaskId" TEXT;

-- AlterTable
ALTER TABLE "user_tasks" ADD COLUMN     "category" TEXT,
ADD COLUMN     "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isApproved" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "legacySubtaskId" TEXT,
ADD COLUMN     "phase" TEXT,
ADD COLUMN     "requirementItemId" TEXT,
ADD COLUMN     "visibilityType" TEXT NOT NULL DEFAULT 'ALL';

-- CreateTable
CREATE TABLE "user_task_marker_links" (
    "id" TEXT NOT NULL,
    "userTaskId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_task_marker_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_task_marker_links_userTaskId_idx" ON "user_task_marker_links"("userTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "user_task_marker_links_userTaskId_markerId_key" ON "user_task_marker_links"("userTaskId", "markerId");

-- CreateIndex
CREATE INDEX "budget_line_items_userTaskId_idx" ON "budget_line_items"("userTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "user_tasks_legacySubtaskId_key" ON "user_tasks"("legacySubtaskId");

-- AddForeignKey
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_userTaskId_fkey" FOREIGN KEY ("userTaskId") REFERENCES "user_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schematic_documents" ADD CONSTRAINT "schematic_documents_userTaskId_fkey" FOREIGN KEY ("userTaskId") REFERENCES "user_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schematic_markers" ADD CONSTRAINT "schematic_markers_userTaskId_fkey" FOREIGN KEY ("userTaskId") REFERENCES "user_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_task_marker_links" ADD CONSTRAINT "user_task_marker_links_userTaskId_fkey" FOREIGN KEY ("userTaskId") REFERENCES "user_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_task_marker_links" ADD CONSTRAINT "user_task_marker_links_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "schematic_markers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_assignedUserTaskId_fkey" FOREIGN KEY ("assignedUserTaskId") REFERENCES "user_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

