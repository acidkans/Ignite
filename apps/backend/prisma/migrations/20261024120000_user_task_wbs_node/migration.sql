-- Zadanie przypiete do liscia/galezi WBS (szuflada "Zadania" w Planowanie/WBS).
ALTER TABLE "user_tasks" ADD COLUMN "wbsNodeId" TEXT;

CREATE INDEX "user_tasks_wbsNodeId_idx" ON "user_tasks"("wbsNodeId");

ALTER TABLE "user_tasks" ADD CONSTRAINT "user_tasks_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
