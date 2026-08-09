-- Produkty wybrane na etapie ofertowania (isSelected) powstały zanim istniał split Wycena/Zakup,
-- więc nie mają isOffer — przez to lewy panel BaselineSplitCard był pusty mimo wybranego produktu.
-- Backfill: wybór z etapu oferty = produkt strony „Wycena".
-- Warunek NOT EXISTS chroni wymagania, które mają już jawnie ustawioną inną propozycję jako isOffer.
UPDATE "product_proposals" p
SET "isOffer" = true
WHERE p."isSelected"
  AND NOT p."isOffer"
  AND NOT EXISTS (
    SELECT 1 FROM "product_proposals" o
    WHERE o."materialRequirementId" = p."materialRequirementId" AND o."isOffer"
  );
