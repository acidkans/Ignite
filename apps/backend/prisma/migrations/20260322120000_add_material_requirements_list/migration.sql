-- CreateTable
CREATE TABLE "material_requirements_lists" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_requirements_lists_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "material_requirements_lists" ADD CONSTRAINT "material_requirements_lists_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requirements_lists" ADD CONSTRAINT "material_requirements_lists_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "material_requirements_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "material_requirements" ADD COLUMN "listId" TEXT;

-- AddForeignKey
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_listId_fkey" FOREIGN KEY ("listId") REFERENCES "material_requirements_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
