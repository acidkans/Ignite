-- CreateTable
CREATE TABLE "schematic_documents" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schematic_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schematic_markers" (
    "id" TEXT NOT NULL,
    "schematicId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'POINT',
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "x2" DOUBLE PRECISION,
    "y2" DOUBLE PRECISION,
    "pageNumber" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schematic_markers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marker_attachments" (
    "id" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marker_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "schematic_documents" ADD CONSTRAINT "schematic_documents_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schematic_markers" ADD CONSTRAINT "schematic_markers_schematicId_fkey" FOREIGN KEY ("schematicId") REFERENCES "schematic_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marker_attachments" ADD CONSTRAINT "marker_attachments_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "schematic_markers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
