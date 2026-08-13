-- CreateTable
CREATE TABLE "dependents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dependents_userId_idx" ON "dependents"("userId");

-- AddForeignKey
ALTER TABLE "dependents" ADD CONSTRAINT "dependents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: powiązanie wniosku z podopiecznym (urlop opiekuńczy)
ALTER TABLE "leave_requests" ADD COLUMN "dependentId" TEXT;

-- CreateIndex
CREATE INDEX "leave_requests_dependentId_idx" ON "leave_requests"("dependentId");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "dependents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
