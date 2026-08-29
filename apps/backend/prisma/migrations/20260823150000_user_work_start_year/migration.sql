-- Rok i miesiac rozpoczecia pracy — zrodlo prawdy dla stazu (staz liczony w runtime co miesiac).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workStartYear" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workStartMonth" INTEGER;
