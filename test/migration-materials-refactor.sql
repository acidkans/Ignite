-- =============================================================================
-- Migracja: material_requirements → materials + material_stock
-- Plan: docs/plan-material-requirements-refactor.md
-- Data: 2026-06-11
-- UWAGA: kolumny Prisma są camelCase (bez @map na polach)
-- =============================================================================

BEGIN;

-- ─── CREATE TABLE materials ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
    id                      TEXT          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    manufacturer            TEXT          NOT NULL,
    model                   TEXT,
    "productName"           TEXT,
    type                    TEXT          NOT NULL,
    "dataSheetUrl"          TEXT,
    "dataSheetName"         TEXT,
    "complianceUrl"         TEXT,
    "complianceName"        TEXT,
    "imageUrl"              TEXT,
    "priceNetto"            DOUBLE PRECISION,
    "productUrl"            TEXT,
    seller                  TEXT,
    "dataSheetDocumentId"   TEXT,
    "complianceDocumentId"  TEXT,
    "createdAt"             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unikalność: dwa indeksy żeby obsłużyć NULL model
CREATE UNIQUE INDEX IF NOT EXISTS "materials_manufacturer_model_key"
    ON materials (manufacturer, model)
    WHERE model IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "materials_manufacturer_null_model_key"
    ON materials (manufacturer)
    WHERE model IS NULL;

-- ─── CREATE TABLE material_stock ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_stock (
    id          TEXT           NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "materialId" TEXT          NOT NULL,
    quantity    DECIMAL(65,30) NOT NULL,
    location    TEXT,
    "updatedAt" TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "material_stock_materialId_fkey"
        FOREIGN KEY ("materialId") REFERENCES materials(id) ON DELETE CASCADE
);

-- ─── FK materiałów do process_nodes ───────────────────────────────────────
ALTER TABLE materials
    ADD CONSTRAINT "materials_dataSheetDocumentId_fkey"
    FOREIGN KEY ("dataSheetDocumentId") REFERENCES process_nodes(id) ON DELETE SET NULL;

ALTER TABLE materials
    ADD CONSTRAINT "materials_complianceDocumentId_fkey"
    FOREIGN KEY ("complianceDocumentId") REFERENCES process_nodes(id) ON DELETE SET NULL;

-- ─── 4a. Wstaw unikalne produkty katalogowe do materials ──────────────────
-- Tylko rekordy które SĄ kartami katalogowymi (manufacturer ustawiony, brak samoreferencji)
INSERT INTO materials (
    manufacturer, model, "productName", type,
    "dataSheetUrl", "dataSheetName",
    "complianceUrl", "complianceName",
    "imageUrl", "priceNetto", "productUrl", seller,
    "createdAt", "updatedAt"
)
SELECT
    UPPER(manufacturer),
    model,
    "productName",
    type,
    "dataSheetUrl",
    "dataSheetName",
    "complianceUrl",
    "complianceName",
    "imageUrl",
    "priceNetto",
    "productUrl",
    seller,
    "createdAt",
    "updatedAt"
FROM material_requirements
WHERE manufacturer IS NOT NULL
  AND "materialId" IS NULL
ON CONFLICT DO NOTHING;

-- ─── 4e. Przepnij wbs_node_materials → materials (PRZED DROP COLUMN) ─────
-- Musi być przed 4c, bo 4c usuwa manufacturer/model z material_requirements!
ALTER TABLE wbs_node_materials ADD COLUMN IF NOT EXISTS "materialCatalogId" TEXT;

UPDATE wbs_node_materials
SET "materialCatalogId" = m.id
FROM materials m, material_requirements mr
WHERE mr.id = wbs_node_materials."materialId"
  AND UPPER(mr.manufacturer) = m.manufacturer
  AND (mr.model = m.model OR (mr.model IS NULL AND m.model IS NULL));

-- Diagnostyka i czyszczenie
DO $$
DECLARE unmapped INTEGER;
BEGIN
    SELECT COUNT(*) INTO unmapped FROM wbs_node_materials WHERE "materialCatalogId" IS NULL;
    IF unmapped > 0 THEN
        RAISE NOTICE '% wierszy wbs_node_materials bez odpowiednika w materials — zostaną usunięte', unmapped;
    END IF;
END $$;

-- Usuń wiersze bez zmapowanego materiału (wymagania bez przypisanego produktu katalogowego)
DELETE FROM wbs_node_materials WHERE "materialCatalogId" IS NULL;

-- Deduplikuj: jeśli (wbsNodeId, materialCatalogId) powtarza się, zachowaj jeden wiersz
DELETE FROM wbs_node_materials w1
USING wbs_node_materials w2
WHERE w1.id > w2.id
  AND w1."wbsNodeId" = w2."wbsNodeId"
  AND w1."materialCatalogId" = w2."materialCatalogId";

-- Nowy unique index — usuń stary przed DROP COLUMN
DROP INDEX IF EXISTS "wbs_node_materials_wbsNodeId_materialId_key";

ALTER TABLE wbs_node_materials DROP CONSTRAINT IF EXISTS "wbs_node_materials_materialId_fkey";
ALTER TABLE wbs_node_materials DROP COLUMN "materialId";
ALTER TABLE wbs_node_materials RENAME COLUMN "materialCatalogId" TO "materialId";

ALTER TABLE wbs_node_materials
    ADD CONSTRAINT "wbs_node_materials_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES materials(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX "wbs_node_materials_wbsNodeId_materialId_key"
    ON wbs_node_materials ("wbsNodeId", "materialId");

-- ─── 4b. Zaktualizuj materialId w material_requirements ───────────────────
-- Samoreferencje (wymaganie → katalog) → nowe materials.id
ALTER TABLE material_requirements DROP CONSTRAINT IF EXISTS "material_requirements_materialId_fkey";

UPDATE material_requirements
SET "materialId" = m.id
FROM materials m
WHERE material_requirements."materialId" IS NOT NULL
  AND UPPER((SELECT mr2.manufacturer FROM material_requirements mr2 WHERE mr2.id = material_requirements."materialId")) = m.manufacturer
  AND (
      (SELECT mr2.model FROM material_requirements mr2 WHERE mr2.id = material_requirements."materialId") = m.model
      OR (
          (SELECT mr2.model FROM material_requirements mr2 WHERE mr2.id = material_requirements."materialId") IS NULL
          AND m.model IS NULL
      )
  );

ALTER TABLE material_requirements
    ADD CONSTRAINT "material_requirements_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES materials(id) ON DELETE SET NULL;

-- ─── 4c. Usuń pola katalogowe z material_requirements ─────────────────────
ALTER TABLE material_requirements
    DROP COLUMN IF EXISTS manufacturer,
    DROP COLUMN IF EXISTS model,
    DROP COLUMN IF EXISTS "productName",
    DROP COLUMN IF EXISTS "dataSheetUrl",
    DROP COLUMN IF EXISTS "dataSheetName",
    DROP COLUMN IF EXISTS "complianceUrl",
    DROP COLUMN IF EXISTS "complianceName",
    DROP COLUMN IF EXISTS "imageUrl",
    DROP COLUMN IF EXISTS "stockStatus",
    DROP COLUMN IF EXISTS seller,
    DROP COLUMN IF EXISTS "offerNumber",
    DROP COLUMN IF EXISTS "productUrl",
    DROP COLUMN IF EXISTS availability;

-- ─── 4d. Rename priceNetto → budgetedPriceNetto ───────────────────────────
ALTER TABLE material_requirements RENAME COLUMN "priceNetto" TO "budgetedPriceNetto";

-- ─── 4b-1. Naprawa dataSheetDocumentId przez storagePath ──────────────────
UPDATE materials m
SET "dataSheetDocumentId" = pn.id
FROM process_nodes pn
WHERE m."dataSheetUrl" IS NOT NULL
  AND m."dataSheetDocumentId" IS NULL
  AND (
      m."dataSheetUrl" LIKE '%' || pn."storagePath"
      OR m."dataSheetUrl" = pn."storagePath"
  )
  AND pn."storagePath" IS NOT NULL;

COMMIT;
