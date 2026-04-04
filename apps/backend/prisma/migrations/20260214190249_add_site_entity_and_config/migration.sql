-- AlterTable
ALTER TABLE "process_nodes" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'private';

-- CreateTable
CREATE TABLE "hardware" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "productionYear" INTEGER NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "hardware_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_permissions" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "userId" TEXT,
    "roleType" TEXT,
    "permission" TEXT NOT NULL,

    CONSTRAINT "node_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "structureType" TEXT,
    "accessDesc" TEXT,
    "additionalDesc" TEXT,
    "drivingDesc" TEXT,
    "shelterType" TEXT,
    "greenfield" BOOLEAN NOT NULL DEFAULT false,
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressZipCode" TEXT,
    "addressCountry" TEXT,
    "addressLatitude" DOUBLE PRECISION,
    "addressLongitude" DOUBLE PRECISION,
    "customData" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_entity_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "user_entity_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "node_permissions_nodeId_userId_key" ON "node_permissions"("nodeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "node_permissions_nodeId_roleType_key" ON "node_permissions"("nodeId", "roleType");

-- CreateIndex
CREATE UNIQUE INDEX "user_entity_configs_userId_entityType_key" ON "user_entity_configs"("userId", "entityType");

-- AddForeignKey
ALTER TABLE "process_nodes" ADD CONSTRAINT "process_nodes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware" ADD CONSTRAINT "hardware_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_permissions" ADD CONSTRAINT "node_permissions_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_permissions" ADD CONSTRAINT "node_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_id_fkey" FOREIGN KEY ("id") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_entity_configs" ADD CONSTRAINT "user_entity_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
