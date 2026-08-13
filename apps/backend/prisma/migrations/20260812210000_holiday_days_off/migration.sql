-- Dni wolne za swieta wypadajace w sobote — propozycje zatwierdzane przez administratora
CREATE TABLE "holiday_days_off" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holiday_days_off_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "holiday_days_off_date_key" ON "holiday_days_off"("date");
CREATE INDEX "holiday_days_off_year_idx" ON "holiday_days_off"("year");

ALTER TABLE "holiday_days_off"
  ADD CONSTRAINT "holiday_days_off_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
