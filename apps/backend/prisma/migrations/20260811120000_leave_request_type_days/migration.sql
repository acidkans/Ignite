-- AlterTable: rodzaj_urlopu + dni_urlopu we wniosku
ALTER TABLE "leave_requests" ADD COLUMN "leaveTypeId" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN "daysCount" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "leave_requests_leaveTypeId_idx" ON "leave_requests"("leaveTypeId");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
