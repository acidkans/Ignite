-- AlterTable
ALTER TABLE "order_requirements" ADD COLUMN     "clientContacts" TEXT,
ADD COLUMN     "clientProjectManager" TEXT,
ADD COLUMN     "clientProjectManagerEmail" TEXT,
ADD COLUMN     "clientProjectManagerPhone" TEXT;

-- AlterTable
ALTER TABLE "process_nodes" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "customTypeLabel" TEXT,
ADD COLUMN     "nip" TEXT,
ADD COLUMN     "region" TEXT;
