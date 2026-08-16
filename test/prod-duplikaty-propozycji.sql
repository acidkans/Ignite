-- Duplikaty ProductProposal na produkcji — analiza i sprzątanie.
-- Grupa duplikatu = ten sam (materialRequirementId, producent, model) bez względu na wielkość liter.
--
-- Zasada: w grupie zostaje rekord NAJBOGATSZY (rola Wycena → rola Zakup → wybrany → dostawca →
-- zdjęcie → cena → najstarszy). Kasujemy wyłącznie rekordy, które nie niosą NICZEGO własnego:
-- bez ról, bez dostawcy, bez zdjęcia, bez plików i z ceną pustą albo równą tej, która zostaje.
-- Dzięki temu pary Wycena/Zakup (spadek po splicie — jedyny nośnik ceny zakupu) są nietykalne.

-- ── 1. Kandydaci do usunięcia (DRY RUN — sam odczyt) ──────────────────────────
WITH ranked AS (
    SELECT p.*,
           row_number() OVER (
               PARTITION BY p."materialRequirementId", lower(p.manufacturer), lower(coalesce(p.model, ''))
               ORDER BY (p."isOffer")::int DESC, (p."isPurchase")::int DESC, (p."isSelected")::int DESC,
                        (p."supplierId" IS NOT NULL)::int DESC, (p."imageUrl" IS NOT NULL)::int DESC,
                        (p."priceNetto" IS NOT NULL)::int DESC, p."createdAt" ASC
           ) AS rn,
           first_value(p."priceNetto") OVER (
               PARTITION BY p."materialRequirementId", lower(p.manufacturer), lower(coalesce(p.model, ''))
               ORDER BY (p."isOffer")::int DESC, (p."isPurchase")::int DESC, (p."isSelected")::int DESC,
                        (p."supplierId" IS NOT NULL)::int DESC, (p."imageUrl" IS NOT NULL)::int DESC,
                        (p."priceNetto" IS NOT NULL)::int DESC, p."createdAt" ASC
           ) AS cena_rekordu_ktory_zostaje
    FROM product_proposals p
)
SELECT id, "materialRequirementId", manufacturer, model, "priceNetto", "isSelected", "createdAt"
FROM ranked
WHERE rn > 1
  AND NOT "isOffer" AND NOT "isPurchase"
  AND "supplierId" IS NULL AND "imageUrl" IS NULL
  AND "dataSheetUrl" IS NULL AND "complianceUrl" IS NULL
  AND ("priceNetto" IS NULL OR "priceNetto" IS NOT DISTINCT FROM cena_rekordu_ktory_zostaje)
ORDER BY manufacturer, model, "createdAt";

-- ── 2. Usunięcie (URUCHAMIAĆ DOPIERO PO KOPII: \copy … TO 'backup.csv' CSV HEADER) ──
-- DELETE FROM product_proposals WHERE id IN ( <ID-ki z zapytania wyżej> );

-- ── 3. Kontrola niezmiennika „jedna wybrana propozycja na wymaganie" ──────────
-- SELECT "materialRequirementId", count(*) FROM product_proposals
-- WHERE "isSelected" GROUP BY 1 HAVING count(*) > 1;
