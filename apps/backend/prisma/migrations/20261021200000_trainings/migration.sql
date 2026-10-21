-- AlterTable
ALTER TABLE "system_notification_settings" ADD COLUMN     "trainingAlertHour" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "trainingAlertIncludeMissing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trainingAlertMode" TEXT NOT NULL DEFAULT 'PROGI',
ADD COLUMN     "trainingAlertStages" JSONB NOT NULL DEFAULT '["ZAAKCEPTOWANE","REALIZACJA"]',
ADD COLUMN     "trainingAlertWarnDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "trainingAlertsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "training_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "validityMonths" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_type_orders" (
    "trainingTypeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "training_type_orders_pkey" PRIMARY KEY ("trainingTypeId","orderId")
);

-- CreateTable
CREATE TABLE "user_trainings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trainingTypeId" TEXT NOT NULL,
    "completedAt" DATE NOT NULL,
    "validUntil" DATE,
    "certificateNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_orders" (
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "user_orders_pkey" PRIMARY KEY ("userId","orderId")
);

-- CreateTable
CREATE TABLE "training_alert_runs" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "items" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error" TEXT,

    CONSTRAINT "training_alert_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_alert_logs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_alert_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_types_name_key" ON "training_types"("name");

-- CreateIndex
CREATE INDEX "training_type_orders_orderId_idx" ON "training_type_orders"("orderId");

-- CreateIndex
CREATE INDEX "user_trainings_trainingTypeId_idx" ON "user_trainings"("trainingTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "user_trainings_userId_trainingTypeId_key" ON "user_trainings"("userId", "trainingTypeId");

-- CreateIndex
CREATE INDEX "user_orders_orderId_idx" ON "user_orders"("orderId");

-- CreateIndex
CREATE INDEX "training_alert_runs_ranAt_idx" ON "training_alert_runs"("ranAt");

-- CreateIndex
CREATE UNIQUE INDEX "training_alert_logs_key_key" ON "training_alert_logs"("key");

-- AddForeignKey
ALTER TABLE "training_type_orders" ADD CONSTRAINT "training_type_orders_trainingTypeId_fkey" FOREIGN KEY ("trainingTypeId") REFERENCES "training_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_type_orders" ADD CONSTRAINT "training_type_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_trainings" ADD CONSTRAINT "user_trainings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_trainings" ADD CONSTRAINT "user_trainings_trainingTypeId_fkey" FOREIGN KEY ("trainingTypeId") REFERENCES "training_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_orders" ADD CONSTRAINT "user_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_orders" ADD CONSTRAINT "user_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

