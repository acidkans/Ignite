-- Opis zakresu prac (załącznik do oferty) — docs/PLAN-opis-zakresu-oferty.md
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "shortCode" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "logoPath" TEXT;
ALTER TABLE "wbs_nodes" ADD COLUMN IF NOT EXISTS "showInScope" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "scope_documents" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "versionId" TEXT,
    "offerNumber" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "warrantyMonths" INTEGER NOT NULL DEFAULT 24,
    "workDuration" TEXT,
    "layout" JSONB,
    "layoutConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sections" JSONB NOT NULL DEFAULT '{}',
    "documentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scope_documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "scope_documents_nodeId_key" ON "scope_documents"("nodeId");
CREATE UNIQUE INDEX IF NOT EXISTS "scope_documents_offerNumber_key" ON "scope_documents"("offerNumber");
DO $$ BEGIN
    ALTER TABLE "scope_documents" ADD CONSTRAINT "scope_documents_nodeId_fkey"
        FOREIGN KEY ("nodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "offer_number_counters" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "offer_number_counters_pkey" PRIMARY KEY ("year")
);
