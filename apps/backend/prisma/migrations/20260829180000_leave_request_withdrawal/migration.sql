-- Wycofanie zatwierdzonego urlopu: prosba pracownika + potwierdzenie przelozonego.
ALTER TYPE "LeaveRequestStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "withdrawalRequestedAt" TIMESTAMP(3);
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "withdrawalDecidedAt" TIMESTAMP(3);
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "withdrawalDecidedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_withdrawalDecidedById_fkey'
  ) THEN
    ALTER TABLE "leave_requests"
      ADD CONSTRAINT "leave_requests_withdrawalDecidedById_fkey"
      FOREIGN KEY ("withdrawalDecidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
