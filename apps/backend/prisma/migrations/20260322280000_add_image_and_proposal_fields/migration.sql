ALTER TABLE "material_requirements" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "product_proposals" ADD COLUMN IF NOT EXISTS "priceNetto" DOUBLE PRECISION;
ALTER TABLE "product_proposals" ADD COLUMN IF NOT EXISTS "seller" TEXT;
ALTER TABLE "product_proposals" ADD COLUMN IF NOT EXISTS "offerNumber" TEXT;
ALTER TABLE "product_proposals" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "product_proposals" ADD COLUMN IF NOT EXISTS "isManual" BOOLEAN NOT NULL DEFAULT false;
