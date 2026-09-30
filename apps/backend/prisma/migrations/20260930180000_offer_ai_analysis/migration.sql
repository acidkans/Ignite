-- Analiza AI „oferta + strategie vs budżet" liczona w tle (patrz `offer-ai-analysis`).
CREATE TABLE IF NOT EXISTS "offer_ai_analyses" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "versionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "result" JSONB,
    "error" TEXT,
    "documentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "offer_ai_analyses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "offer_ai_analyses_nodeId_versionId_createdAt_idx" ON "offer_ai_analyses"("nodeId", "versionId", "createdAt");
