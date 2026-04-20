-- Add offer fields to material_requirements
ALTER TABLE "material_requirements" ADD COLUMN IF NOT EXISTS "priceNetto" DOUBLE PRECISION;
ALTER TABLE "material_requirements" ADD COLUMN IF NOT EXISTS "seller" TEXT;
ALTER TABLE "material_requirements" ADD COLUMN IF NOT EXISTS "offerNumber" TEXT;
