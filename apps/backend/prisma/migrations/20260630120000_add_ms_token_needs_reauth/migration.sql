-- AlterTable: user_ms_tokens — flaga wymagająca reautoryzacji (nowy scope Tasks.ReadWrite)
ALTER TABLE "user_ms_tokens" ADD COLUMN "needsReauth" BOOLEAN NOT NULL DEFAULT false;

-- Istniejące tokeny nie mają scope Tasks.ReadWrite — wymuszamy reauth
UPDATE "user_ms_tokens" SET "needsReauth" = true;
