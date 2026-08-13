-- Wpis urlopowy powiazany z zatwierdzonym wnioskiem (1:1, NULL dla wpisow recznych)
ALTER TABLE "leaves" ADD COLUMN "leaveRequestId" TEXT;

CREATE UNIQUE INDEX "leaves_leaveRequestId_key" ON "leaves"("leaveRequestId");

ALTER TABLE "leaves"
  ADD CONSTRAINT "leaves_leaveRequestId_fkey"
  FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
