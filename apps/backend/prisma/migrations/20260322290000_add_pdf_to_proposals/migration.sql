ALTER TABLE "product_proposals" ADD COLUMN IF NOT EXISTS "dataSheetUrl" TEXT;
ALTER TABLE "product_proposals" ADD COLUMN IF NOT EXISTS "dataSheetName" TEXT;
ALTER TABLE "product_proposals" ADD COLUMN IF NOT EXISTS "complianceUrl" TEXT;
ALTER TABLE "product_proposals" ADD COLUMN IF NOT EXISTS "complianceName" TEXT;
