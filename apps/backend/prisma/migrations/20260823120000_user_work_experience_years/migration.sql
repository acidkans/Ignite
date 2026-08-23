-- Ogolny staz pracy pracownika w latach — podstawa wyliczenia wymiaru urlopu.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workExperienceYears" DOUBLE PRECISION;
