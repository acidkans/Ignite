-- Cykliczne alarmy zadań: jedna reguła w jednym wierszu TaskReminder.
-- recurIntervalMinutes NULL = alarm jednorazowy (dotychczasowe zachowanie).
ALTER TABLE "task_reminders" ADD COLUMN "recurIntervalMinutes" INTEGER;
ALTER TABLE "task_reminders" ADD COLUMN "recurEnd" TIMESTAMP(3);
ALTER TABLE "task_reminders" ADD COLUMN "lastFiredAt" TIMESTAMP(3);
