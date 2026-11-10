-- Waluta zamówienia (PLN | EUR) i waluta oryginalna wpisu zakupu z kursem NBP.
ALTER TABLE "process_nodes" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'PLN';
ALTER TABLE "leaf_actuals" ADD COLUMN "currency" TEXT;
ALTER TABLE "leaf_actuals" ADD COLUMN "unitCostOriginal" DOUBLE PRECISION;
ALTER TABLE "leaf_actuals" ADD COLUMN "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "leaf_actuals" ADD COLUMN "rateDate" TIMESTAMP(3);
