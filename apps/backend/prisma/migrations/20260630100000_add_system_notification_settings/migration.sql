-- CreateTable
CREATE TABLE "system_notification_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultReminderHour" INTEGER NOT NULL DEFAULT 9,
    "snoozePresetsMinutes" JSONB NOT NULL DEFAULT '[10,30,60]',
    "trashRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "msTodoSyncIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "msTodoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "webPushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_notification_settings_pkey" PRIMARY KEY ("id")
);
