-- CreateTable
CREATE TABLE "document_highlights" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "authorId" TEXT,
    "page" INTEGER NOT NULL,
    "rects" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_highlights_documentId_page_idx" ON "document_highlights"("documentId", "page");

-- AddForeignKey
ALTER TABLE "document_highlights" ADD CONSTRAINT "document_highlights_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
