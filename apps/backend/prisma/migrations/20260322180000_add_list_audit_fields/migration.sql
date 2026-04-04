ALTER TABLE "material_requirements_lists"
  ADD COLUMN "lockedBy" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "createdBy" TEXT;
