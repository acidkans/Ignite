-- Kursor pushy przypomnień: wysyłka push nie gasi już przypomnienia (`sentAt`), tylko zapamiętuje ostatnie
-- wysłane wystąpienie. Seria cykliczna dostaje push co interwał, jednorazowe — raz (i ponownie po odłożeniu).
ALTER TABLE "task_reminders" ADD COLUMN "lastPushedAt" TIMESTAMP(3);
