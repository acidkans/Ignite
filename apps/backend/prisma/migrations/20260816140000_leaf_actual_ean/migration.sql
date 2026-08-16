-- Kod EAN NA WPISIE realizacji. Producent i model bywają wpisane różnie przy każdej dostawie
-- („Janitza" vs „JANITZA electronics"), więc po nich nie da się pewnie stwierdzić, czy druga
-- dostawa to ten sam towar. EAN identyfikuje egzemplarz jednoznacznie.
-- TEXT, nie liczba: EAN-13 miewa wiodące zera i wychodzi poza bezpieczny zakres liczb w JS.
ALTER TABLE "leaf_actuals" ADD COLUMN "ean" TEXT;
