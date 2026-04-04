/*
  Warnings:

  - A unique constraint covering the columns `[nodeId,versionId]` on the table `order_requirements` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "order_requirements" ADD COLUMN     "wbsDescription" TEXT;

-- AlterTable
ALTER TABLE "subtasks" ADD COLUMN     "category" TEXT,
ADD COLUMN     "phase" TEXT,
ADD COLUMN     "requirementItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "order_requirements_nodeId_versionId_key" ON "order_requirements"("nodeId", "versionId");
