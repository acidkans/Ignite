-- CreateTable
CREATE TABLE "wbs_marker_links" (
    "id" TEXT NOT NULL,
    "wbsNodeId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wbs_marker_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wbs_marker_links_wbsNodeId_markerId_key" ON "wbs_marker_links"("wbsNodeId", "markerId");

-- AddForeignKey
ALTER TABLE "wbs_marker_links" ADD CONSTRAINT "wbs_marker_links_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "schematic_markers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
