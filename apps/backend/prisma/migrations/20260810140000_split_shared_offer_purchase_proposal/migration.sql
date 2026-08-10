-- Kciuk „produkt z Wyceny → Zakup" flagował dotąd TĘ SAMĄ propozycję (isOffer + isPurchase na jednym
-- rekordzie), więc split pokazywał po obu stronach jeden wiersz: usunięcie albo edycja produktu po
-- stronie Zakupu kasowała produkt Wyceny. Od teraz każda strona ma własny rekord — te dane trzeba
-- rozdzielić wstecz.
--
-- 1) Dla każdej propozycji pełniącej obie role powstaje kopia zakupowa (isPurchase, bez isOffer)
--    z ceną zakupu jako `priceNetto`. Pola plikowe (imageUrl, dataSheet*, compliance*) NIE są
--    kopiowane — dwa rekordy wskazywałyby jeden plik na dysku.
INSERT INTO "product_proposals" (
  id, "materialRequirementId", "productName", manufacturer, model, "sourceUrl",
  "priceNetto", seller, "offerNumber", availability, "isManual", "matchScore",
  "isSelected", "isRejected", "isOffer", "isPurchase", "purchasePriceNetto", "supplierId", "createdAt"
)
SELECT
  gen_random_uuid(), p."materialRequirementId", p."productName", p.manufacturer, p.model, p."sourceUrl",
  COALESCE(p."purchasePriceNetto", p."priceNetto"), p.seller, p."offerNumber", p.availability, true, p."matchScore",
  false, false, false, true, NULL, p."supplierId", NOW()
FROM "product_proposals" p
WHERE p."isOffer" AND p."isPurchase";

-- 2) Rekord ofertowy zostaje wyłącznie produktem Wyceny; `purchasePriceNetto` traci rację bytu
--    (miało sens tylko przy współdzielonym rekordzie — cena zakupu siedzi teraz w kopii).
UPDATE "product_proposals"
SET "isPurchase" = false, "purchasePriceNetto" = NULL
WHERE "isOffer" AND "isPurchase";
