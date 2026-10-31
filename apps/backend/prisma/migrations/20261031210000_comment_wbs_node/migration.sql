-- Czat gałęzi WBS: wpis czatu przypięty do węzła WBS (NULL = ogólny czat zamówienia).
ALTER TABLE "comments" ADD COLUMN "wbsNodeId" TEXT;
CREATE INDEX "comments_orderId_wbsNodeId_idx" ON "comments"("orderId", "wbsNodeId");
