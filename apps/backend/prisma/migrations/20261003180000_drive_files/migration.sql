-- Synchronizacja folderu zamówienia z OneDrive (etap 2, docs/PLAN-onedrive-sync.md).
ALTER TABLE "process_nodes" ADD COLUMN IF NOT EXISTS "oneDriveDeltaLink" TEXT;
ALTER TABLE "process_nodes" ADD COLUMN IF NOT EXISTS "oneDriveSyncedAt" TIMESTAMP(3);
ALTER TABLE "process_nodes" ADD COLUMN IF NOT EXISTS "oneDriveSyncError" TEXT;

CREATE TABLE IF NOT EXISTS "drive_files" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,
    "driveItemId" TEXT NOT NULL,
    "parentItemId" TEXT,
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "folderKey" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "cTag" TEXT,
    "lastModified" TIMESTAMP(3),
    "webUrl" TEXT,
    "documentId" TEXT,
    "storagePath" TEXT,
    "processedTag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'onedrive',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "drive_files_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "drive_files_driveItemId_key" ON "drive_files"("driveItemId");
CREATE INDEX IF NOT EXISTS "drive_files_nodeId_status_idx" ON "drive_files"("nodeId", "status");
CREATE INDEX IF NOT EXISTS "drive_files_documentId_idx" ON "drive_files"("documentId");
DO $$ BEGIN
    ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
