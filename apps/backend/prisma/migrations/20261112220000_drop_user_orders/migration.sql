-- Kolumna „Zamówienia” w Szkoleniach usunięta: o zamówieniach pracownika decyduje zespół zamówienia
-- (Team.orderNodeId). Na produkcji 2 wiersze, oba dublowały zespół.
-- DropForeignKey
ALTER TABLE "user_orders" DROP CONSTRAINT "user_orders_userId_fkey";

-- DropForeignKey
ALTER TABLE "user_orders" DROP CONSTRAINT "user_orders_orderId_fkey";

-- DropTable
DROP TABLE "user_orders";
