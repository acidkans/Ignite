-- CreateTable
CREATE TABLE "wbs_node_materials" (
    "id" TEXT NOT NULL,
    "wbsNodeId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "wbs_node_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wbs_node_materials_wbsNodeId_materialId_key" ON "wbs_node_materials"("wbsNodeId", "materialId");

-- AddForeignKey
ALTER TABLE "wbs_node_materials" ADD CONSTRAINT "wbs_node_materials_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wbs_node_materials" ADD CONSTRAINT "wbs_node_materials_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "material_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
