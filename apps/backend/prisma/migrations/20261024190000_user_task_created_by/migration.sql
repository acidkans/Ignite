-- Autor zadania (kto zlecil); userId pozostaje odpowiedzialnym (kalendarz + MS To Do).
ALTER TABLE "user_tasks" ADD COLUMN "createdById" TEXT;

UPDATE "user_tasks" SET "createdById" = "userId";

ALTER TABLE "user_tasks" ADD CONSTRAINT "user_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
