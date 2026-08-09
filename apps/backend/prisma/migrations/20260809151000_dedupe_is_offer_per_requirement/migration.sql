-- Legacy duplikaty propozycji (ta sama nazwa/producent, wstawione podwójnie) miały obie isSelected,
-- więc backfill isOffer ustawił isOffer na obu — łamiąc regułę „max jedna isOffer na wymaganie".
-- Zostawiamy najstarszą propozycję, z pozostałych zdejmujemy flagę.
UPDATE "product_proposals" p
SET "isOffer" = false
WHERE p."isOffer"
  AND p.id <> (
    SELECT o.id FROM "product_proposals" o
    WHERE o."materialRequirementId" = p."materialRequirementId" AND o."isOffer"
    ORDER BY o."createdAt" ASC, o.id ASC
    LIMIT 1
  );
