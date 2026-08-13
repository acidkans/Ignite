-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: rodzaje urlopu konsumujące pulę dni
ALTER TABLE "leave_types" ADD COLUMN "consumesBalance" BOOLEAN NOT NULL DEFAULT false;
UPDATE "leave_types" SET "consumesBalance" = true WHERE "code" IN ('WYPOCZYNKOWY', 'NA_ZADANIE');

-- AlterTable: status wniosku + ślad decyzji
ALTER TABLE "leave_requests" ADD COLUMN "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "leave_requests" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "leave_requests" ADD COLUMN "decisionComment" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN "decidedById" TEXT;

-- Backfill: wnioski z datą zatwierdzenia dostają status APPROVED
UPDATE "leave_requests" SET "status" = 'APPROVED' WHERE "approvedAt" IS NOT NULL;

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: pula dni urlopowych per pracownik i rok
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitlementDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_userId_year_key" ON "leave_balances"("userId", "year");

-- CreateIndex
CREATE INDEX "leave_balances_userId_idx" ON "leave_balances"("userId");

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: rozksięgowanie zatwierdzonego wniosku na roczne pule
CREATE TABLE "leave_deductions" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_deductions_leaveRequestId_idx" ON "leave_deductions"("leaveRequestId");

-- AddForeignKey
ALTER TABLE "leave_deductions" ADD CONSTRAINT "leave_deductions_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
