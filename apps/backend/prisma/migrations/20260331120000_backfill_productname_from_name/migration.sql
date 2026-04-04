-- Backfill: kopiuje name → productName gdzie productName jest puste
UPDATE material_requirements
SET "productName" = name
WHERE ("productName" IS NULL OR "productName" = '');

-- Ustaw domyślną wartość dla ewentualnych NULL-i
UPDATE material_requirements
SET "productName" = '—'
WHERE "productName" IS NULL;

-- Zmień productName na NOT NULL
ALTER TABLE material_requirements ALTER COLUMN "productName" SET NOT NULL;

-- Usuń kolumnę name
ALTER TABLE material_requirements DROP COLUMN name;
