-- Przelacznik synchronizacji kalendarza urlopowego: cron rusza dopiero po jego wlaczeniu
-- przez administratora (domyslnie wylaczony na czas rownoleglej pracy z AppSheet).

CREATE TABLE "leave_calendar_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastRunSummary" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leave_calendar_settings_pkey" PRIMARY KEY ("id")
);
