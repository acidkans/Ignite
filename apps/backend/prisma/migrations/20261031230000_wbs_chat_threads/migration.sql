-- Czat gałęzi WBS: status wątku (ACTIVE / CLOSED = archiwum). Brak wiersza = wątek aktywny.
CREATE TABLE "wbs_chat_threads" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "wbsNodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wbs_chat_threads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wbs_chat_threads_orderId_wbsNodeId_key" ON "wbs_chat_threads"("orderId", "wbsNodeId");
