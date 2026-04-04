-- Add materialId, name, and stockStatus columns to MaterialRequirement
ALTER TABLE "MaterialRequirement" ADD COLUMN "materialId" TEXT;
ALTER TABLE "MaterialRequirement" ADD COLUMN "name" TEXT;
ALTER TABLE "MaterialRequirement" ADD COLUMN "stockStatus" DECIMAL(65,30);

-- Add foreign key constraint for materialId (self-referencing)
ALTER TABLE "MaterialRequirement" ADD CONSTRAINT "MaterialRequirement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "MaterialRequirement" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Make productName nullable since it will be optional when materialId is set
ALTER TABLE "MaterialRequirement" ALTER COLUMN "productName" DROP NOT NULL;
