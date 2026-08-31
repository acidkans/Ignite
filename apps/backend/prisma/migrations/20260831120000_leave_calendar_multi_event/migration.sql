-- Wpis w kalendarzu Google rozbity na kilka zdarzen (przerwa na weekend / swieto),
-- skrot pracownika w tytule i etykieta rodzaju urlopu jako dane slownikowe.

ALTER TABLE "leave_requests" ADD COLUMN "googleEventIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "leave_requests" ADD COLUMN "googleSyncedAt" TIMESTAMP(3);
ALTER TABLE "leave_requests" ADD COLUMN "googleSyncError" TEXT;

-- dotychczasowe pojedyncze id trafiaja do listy, zeby nie zgubic powiazania ze zdarzeniem
UPDATE "leave_requests" SET "googleEventIds" = ARRAY["googleEventId"]
 WHERE "googleEventId" IS NOT NULL;

-- Starej kolumny NIE kasujemy tutaj: dev-owa baza jest wspolna dla galezi, a kod na main
-- nadal jej uzywa. Prisma pomija kolumny spoza schematu, wiec zostaje martwa i nieszkodliwa.
-- Do skasowania osobna migracja po merge galezi urlopy.

ALTER TABLE "users" ADD COLUMN "calendarInitials" TEXT;
ALTER TABLE "leave_types" ADD COLUMN "calendarLabel" TEXT;
