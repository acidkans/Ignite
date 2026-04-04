-- AlterTable
ALTER TABLE "process_nodes" ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "storagePath" TEXT;
