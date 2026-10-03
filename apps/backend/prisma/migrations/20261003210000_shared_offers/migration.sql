-- Wspólny katalog ofert dostawców na OneDrive (etap 5, docs/PLAN-onedrive-sync.md).
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "oneDriveFolderId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_oneDriveFolderId_key" ON "suppliers"("oneDriveFolderId");

ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'order';
ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "orderNodeId" TEXT;
ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "hash" TEXT;
CREATE INDEX IF NOT EXISTS "drive_files_scope_status_idx" ON "drive_files"("scope", "status");
CREATE INDEX IF NOT EXISTS "drive_files_hash_idx" ON "drive_files"("hash");

CREATE TABLE IF NOT EXISTS "onedrive_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "sharedOffersFolderId" TEXT,
    "sharedOffersDriveId" TEXT,
    "sharedOffersFolderName" TEXT,
    "sharedOffersDeltaLink" TEXT,
    "sharedOffersSyncedAt" TIMESTAMP(3),
    "sharedOffersSyncError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "onedrive_settings_pkey" PRIMARY KEY ("id")
);
