-- Oferent produktu na pozycji (karta produktu), odpowiednik product_proposals."supplierId".
-- Rejestruje KTO ZAOFERTOWAŁ produkt — niezależnie od tego, u kogo ostatecznie kupimy
-- (zakup ma własnego dostawcę na leaf_actuals."supplierId").
ALTER TABLE "material_requirements" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

DO $$
BEGIN
    ALTER TABLE "material_requirements"
        ADD CONSTRAINT "material_requirements_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
