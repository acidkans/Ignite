-- Wniosek "Do wyboru za swieto w sobote" wskazuje konkretne swieto zatwierdzone przez admina.
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "holidayDayOffId" TEXT;

CREATE INDEX IF NOT EXISTS "leave_requests_holidayDayOffId_idx" ON "leave_requests"("holidayDayOffId");

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_holidayDayOffId_fkey"
  FOREIGN KEY ("holidayDayOffId") REFERENCES "holiday_days_off"("id") ON DELETE SET NULL ON UPDATE CASCADE;
