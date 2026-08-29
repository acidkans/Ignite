-- Id zdarzenia w kalendarzu Google zalozonego przy zatwierdzeniu wniosku urlopowego.
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "googleEventId" TEXT;
