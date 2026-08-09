-- Split Wycena↔Zakup: role propozycji produktu (niezależne od wersji/akceptacji).
-- isOffer = produkt strony "Wycena" (max jedna na wymaganie, pilnowane w serwisie).
-- isPurchase = produkt strony "Zakup" (max jedna na wymaganie).
-- purchasePriceNetto = cena zakupu gdy ta sama propozycja pełni obie role (Δ = purchasePriceNetto − priceNetto).
ALTER TABLE "product_proposals" ADD COLUMN "isOffer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "product_proposals" ADD COLUMN "isPurchase" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "product_proposals" ADD COLUMN "purchasePriceNetto" DOUBLE PRECISION;
