-- Dostawca produktu przypisany do propozycji (wybór po NIP z rejestru Supplier lub wolny wpis po nazwie).
-- Umożliwia wybór dostawcy niezależnie po obu stronach splitu Wycena/Zakup w BaselineSplitCard.
ALTER TABLE "product_proposals" ADD COLUMN "supplierId" TEXT;

ALTER TABLE "product_proposals" ADD CONSTRAINT "product_proposals_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
