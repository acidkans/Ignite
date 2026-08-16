-- Producent i model NA WPISIE realizacji: pozycja ma jeden produkt ofertowy, ale zakupów
-- bywa kilka i mogą się różnić (druga dostawa jako zamiennik innej marki). Bez tych pól
-- nie dało się zapisać, co faktycznie przyszło w konkretnej dostawie.
ALTER TABLE "leaf_actuals" ADD COLUMN "manufacturer" TEXT;
ALTER TABLE "leaf_actuals" ADD COLUMN "model" TEXT;

-- Wpisy z backfillu propozycji zakupu dostają produkt tej propozycji — inaczej po
-- migracji wyglądałyby na zakup „nie wiadomo czego", choć dane były w systemie.
UPDATE "leaf_actuals" la
SET "manufacturer" = NULLIF(TRIM(p."manufacturer"), ''),
    "model"        = NULLIF(TRIM(COALESCE(p."model", '')), '')
FROM "product_proposals" p
JOIN "material_requirements" m ON m."id" = p."materialRequirementId"
JOIN "wbs_nodes" w ON w."id" = m."wbsNodeId"
WHERE p."isPurchase" = true
  AND la."wbsRootId" = COALESCE(w."sourceWbsNodeId", w."id")
  AND la."comment" = 'Przeniesione z propozycji zakupu'
  AND la."manufacturer" IS NULL;
