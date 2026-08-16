-- Przeniesienie dotychczasowych zakupów do wpisów realizacji: każda propozycja
-- `isPurchase` z ceną staje się PIERWSZYM wpisem swojego liścia. Bez tego panel
-- pokazywałby „0 / N · 0%" na pozycjach, które są już kupione (cena siedziała
-- wyłącznie w propozycji), a licznik i Δ ilość startowałyby od zera.
--
-- Ilość = ilość z wyceny liścia — dokładnie to założenie robiło dotąd porównanie
-- (`buildPurchase` brał `live.quantity`). Jeśli w rzeczywistości kupiono inaczej,
-- poprawia się to edycją wpisu; teraz w ogóle jest gdzie.
--
-- Cena wg reguły backendu, NIE frontendu: propozycja pełniąca obie role bierze
-- `purchasePriceNetto`, a gdy go nie ma — nie jest zakupem (nie podstawiamy ceny
-- ofertowej, bo wtedy migracja wymyśliłaby zakup, którego nie było).
--
-- Idempotentna: `DISTINCT ON` po korzeniu klonu (jeden wpis na liść) + pominięcie
-- liści, które mają już jakikolwiek wpis realizacji.
INSERT INTO "leaf_actuals" (
    "id", "wbsRootId", "nodeId", "entryDate", "qty", "unitCost",
    "comment", "docNumber", "supplierId", "authorId", "createdAt", "updatedAt"
)
SELECT DISTINCT ON (COALESCE(w."sourceWbsNodeId", w."id"))
    gen_random_uuid(),
    COALESCE(w."sourceWbsNodeId", w."id"),
    m."nodeId",
    p."createdAt",
    w."quantity",
    CASE WHEN p."isOffer" THEN p."purchasePriceNetto" ELSE p."priceNetto" END,
    'Przeniesione z propozycji zakupu',
    NULLIF(TRIM(COALESCE(p."offerNumber", '')), ''),
    p."supplierId",
    NULL,
    now(),
    now()
FROM "product_proposals" p
JOIN "material_requirements" m ON m."id" = p."materialRequirementId"
JOIN "wbs_nodes" w ON w."id" = m."wbsNodeId"
WHERE p."isPurchase" = true
  AND (CASE WHEN p."isOffer" THEN p."purchasePriceNetto" ELSE p."priceNetto" END) IS NOT NULL
  AND w."quantity" > 0
  AND NOT EXISTS (
      SELECT 1 FROM "leaf_actuals" la
      WHERE la."wbsRootId" = COALESCE(w."sourceWbsNodeId", w."id")
  )
ORDER BY COALESCE(w."sourceWbsNodeId", w."id"), p."createdAt" ASC;
