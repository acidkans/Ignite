-- Podzial wniosku na godziny zalezy od rodzaju urlopu.
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "allowsHourly" BOOLEAN NOT NULL DEFAULT false;

-- Kodeks pracy art. 154(2) par. 4 — wypoczynkowego mozna udzielic w wymiarze godzinowym
-- odpowiadajacym czesci dobowego wymiaru czasu pracy. Pozostale rodzaje udzielane w dniach.
UPDATE "leave_types" SET "allowsHourly" = true WHERE "code" = 'WYPOCZYNKOWY';
