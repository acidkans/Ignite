-- DropForeignKey
ALTER TABLE "material_requirements" DROP CONSTRAINT IF EXISTS "material_requirements_wbsNodeId_fkey";

-- AddForeignKey (Cascade zamiast SetNull)
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_wbsNodeId_fkey"
    FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
