-- AlterTable: add subtaskId to schematic_markers
ALTER TABLE "schematic_markers" ADD COLUMN "subtaskId" TEXT;

-- AddForeignKey
ALTER TABLE "schematic_markers" ADD CONSTRAINT "schematic_markers_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "subtasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
