-- Protokoly odbioru robot: naglowek dokumentu + pozycje z odebranymi kwotami.
-- Bez versionId — odbior zdarzyl sie w swiecie rzeczywistym i nie nalezy do wersji wyceny,
-- wiec NIE wchodzi do cloneVersionData.

CREATE TABLE IF NOT EXISTS "acceptance_protocols" (
  "id"        TEXT NOT NULL,
  "nodeId"    TEXT NOT NULL,
  "numer"     TEXT NOT NULL,
  "data"      TEXT NOT NULL,
  "odbior"    TEXT NOT NULL,
  "authorId"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "acceptance_protocols_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "acceptance_protocol_items" (
  "id"         TEXT NOT NULL,
  "protocolId" TEXT NOT NULL,
  "wbsRootId"  TEXT NOT NULL,
  "nazwa"      TEXT NOT NULL,
  "wartosc"    DOUBLE PRECISION NOT NULL,
  "pelny"      BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "acceptance_protocol_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "acceptance_protocols_nodeId_numer_key" ON "acceptance_protocols"("nodeId", "numer");
CREATE INDEX IF NOT EXISTS "acceptance_protocols_nodeId_idx" ON "acceptance_protocols"("nodeId");
CREATE INDEX IF NOT EXISTS "acceptance_protocol_items_protocolId_idx" ON "acceptance_protocol_items"("protocolId");
CREATE INDEX IF NOT EXISTS "acceptance_protocol_items_wbsRootId_idx" ON "acceptance_protocol_items"("wbsRootId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acceptance_protocols_nodeId_fkey') THEN
    ALTER TABLE "acceptance_protocols"
      ADD CONSTRAINT "acceptance_protocols_nodeId_fkey"
      FOREIGN KEY ("nodeId") REFERENCES "process_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acceptance_protocols_authorId_fkey') THEN
    ALTER TABLE "acceptance_protocols"
      ADD CONSTRAINT "acceptance_protocols_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acceptance_protocol_items_protocolId_fkey') THEN
    ALTER TABLE "acceptance_protocol_items"
      ADD CONSTRAINT "acceptance_protocol_items_protocolId_fkey"
      FOREIGN KEY ("protocolId") REFERENCES "acceptance_protocols"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
