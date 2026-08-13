-- Korzeń klonu liścia WBS — klucz parowania baseline↔żywe, odpowiednik
-- MaterialRequirement.sourceRequirementId. Świadomie BEZ backfillu: dla historycznych
-- klonów wersji oryginalnego mapowania nie da się odtworzyć, a kod czyta to pole jako
-- `sourceWbsNodeId ?? id`, więc NULL znaczy „sam jestem korzeniem".
ALTER TABLE "wbs_nodes" ADD COLUMN "sourceWbsNodeId" TEXT;

-- Pozycja rozliczona mimo niedowykonania planu — różnica liczy się jako oszczędność,
-- liść wypada z niedokończonych w pokryciu.
ALTER TABLE "wbs_nodes" ADD COLUMN "realizationClosed" BOOLEAN NOT NULL DEFAULT false;

-- Wpisy realizacji liścia: jedno zdarzenie zakupu albo wykonania.
CREATE TABLE "leaf_actuals" (
    "id" TEXT NOT NULL,
    "wbsRootId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "docNumber" TEXT,
    "supplierId" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaf_actuals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leaf_actuals_nodeId_idx" ON "leaf_actuals"("nodeId");
CREATE INDEX "leaf_actuals_wbsRootId_idx" ON "leaf_actuals"("wbsRootId");

ALTER TABLE "leaf_actuals" ADD CONSTRAINT "leaf_actuals_nodeId_fkey"
    FOREIGN KEY ("nodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leaf_actuals" ADD CONSTRAINT "leaf_actuals_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leaf_actuals" ADD CONSTRAINT "leaf_actuals_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Celowo BEZ FK na "wbsRootId": liść bywa usuwany i odtwarzany w kolejnej wersji,
-- a wpis realizacji ma przeżyć — sprzątanie idzie kaskadą po "nodeId".
