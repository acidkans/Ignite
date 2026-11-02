-- Rejestr blokerów realizacji (Constraint) — po wbsRootId, poza klonem wersji
CREATE TABLE "wbs_constraints" (
    "id" TEXT NOT NULL,
    "processNodeId" TEXT NOT NULL,
    "wbsRootId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "ownerId" TEXT,
    "dueAt" TIMESTAMP(3),
    "impactDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wbs_constraints_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wbs_constraints_processNodeId_idx" ON "wbs_constraints"("processNodeId");
CREATE INDEX "wbs_constraints_wbsRootId_idx" ON "wbs_constraints"("wbsRootId");
ALTER TABLE "wbs_constraints" ADD CONSTRAINT "wbs_constraints_processNodeId_fkey" FOREIGN KEY ("processNodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wbs_constraints" ADD CONSTRAINT "wbs_constraints_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
