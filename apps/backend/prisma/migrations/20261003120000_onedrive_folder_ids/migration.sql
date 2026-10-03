-- Id katalogów struktury zamówienia na OneDrive (ORDER_FOLDERS, patrz docs/PLAN-onedrive-sync.md).
ALTER TABLE "process_nodes" ADD COLUMN IF NOT EXISTS "oneDriveFolderIds" JSONB;
