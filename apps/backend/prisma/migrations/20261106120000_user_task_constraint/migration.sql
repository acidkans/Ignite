-- Zadanie blokera: UserTask.constraintId (1:1 z wbs_constraints), zamknięcie jednego zamyka drugie
ALTER TABLE "user_tasks" ADD COLUMN "constraintId" TEXT;
CREATE UNIQUE INDEX "user_tasks_constraintId_key" ON "user_tasks"("constraintId");
ALTER TABLE "user_tasks" ADD CONSTRAINT "user_tasks_constraintId_fkey" FOREIGN KEY ("constraintId") REFERENCES "wbs_constraints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
