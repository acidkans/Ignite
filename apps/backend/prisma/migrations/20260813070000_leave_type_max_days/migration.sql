-- Ustawowy limit dni w roku kalendarzowym dla rodzaju urlopu (Kodeks pracy)
ALTER TABLE "leave_types" ADD COLUMN "maxDaysPerYear" INTEGER;

-- urlop na żądanie — 4 dni w roku (art. 167(2) k.p.)
UPDATE "leave_types" SET "maxDaysPerYear" = 4 WHERE "code" = 'NA_ZADANIE';

-- urlop opiekuńczy — 5 dni w roku (art. 173(1) k.p.)
UPDATE "leave_types" SET "maxDaysPerYear" = 5 WHERE "code" = 'OPIEKA';
