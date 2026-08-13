-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateStart" TIMESTAMP(3) NOT NULL,
    "timeStart" TEXT,
    "dateEnd" TIMESTAMP(3) NOT NULL,
    "timeEnd" TEXT,
    "officeFrom" TIMESTAMP(3),
    "officeTo" TIMESTAMP(3),
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "remainingY4" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingY3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingY2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingY1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingCurrentYear" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_requests_userId_idx" ON "leave_requests"("userId");

-- CreateIndex
CREATE INDEX "leave_requests_dateStart_idx" ON "leave_requests"("dateStart");

-- CreateIndex
CREATE INDEX "leave_requests_submittedAt_idx" ON "leave_requests"("submittedAt");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
