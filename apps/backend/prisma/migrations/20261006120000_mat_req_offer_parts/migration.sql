-- Pozycja ofertowana w częściach: wymaganie złożone z kilku pozycji ofert lub z całej oferty
CREATE TABLE IF NOT EXISTS "material_requirement_offer_parts" (
    "id" TEXT NOT NULL,
    "materialRequirementId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "positionIdx" INTEGER,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "snapshot" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "material_requirement_offer_parts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "material_requirement_offer_parts_materialRequirementId_idx" ON "material_requirement_offer_parts"("materialRequirementId");
CREATE INDEX IF NOT EXISTS "material_requirement_offer_parts_offerId_idx" ON "material_requirement_offer_parts"("offerId");
DO $$ BEGIN
    ALTER TABLE "material_requirement_offer_parts" ADD CONSTRAINT "material_requirement_offer_parts_materialRequirementId_fkey"
        FOREIGN KEY ("materialRequirementId") REFERENCES "material_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
