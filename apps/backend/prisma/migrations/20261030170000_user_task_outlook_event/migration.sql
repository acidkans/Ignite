-- Godzina zadania + wydarzenie w kalendarzu Outlook odpowiedzialnego.
ALTER TABLE "user_tasks" ADD COLUMN "durationMinutes" INTEGER;
ALTER TABLE "user_tasks" ADD COLUMN "msEventId" TEXT;
