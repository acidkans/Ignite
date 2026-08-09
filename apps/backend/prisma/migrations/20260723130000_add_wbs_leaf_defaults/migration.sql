-- CreateTable: wbs_leaf_defaults — konfigurowalne wartości domyślne liści per zamówienie
CREATE TABLE "wbs_leaf_defaults" (
    "id"        TEXT NOT NULL,
    "nodeId"    TEXT NOT NULL,
    "data"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wbs_leaf_defaults_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wbs_leaf_defaults_nodeId_key" ON "wbs_leaf_defaults"("nodeId");
