/*
  Warnings:

  - Added the required column `nodeId` to the `budget_line_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "budget_line_items" ADD COLUMN     "nodeId" TEXT NOT NULL,
ALTER COLUMN "versionId" DROP NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
