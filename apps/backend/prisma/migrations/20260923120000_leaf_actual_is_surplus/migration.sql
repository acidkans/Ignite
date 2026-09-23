-- Znacznik zakupu nadmiarowego (ponad ilosc z wyceny) na wpisie realizacji. Ustawiany recznie
-- w karcie pozycji; eksport Excel liczy taki wpis bez wartosci ofertowej (patrz `leaf-actual-is-surplus`).
ALTER TABLE "leaf_actuals" ADD COLUMN IF NOT EXISTS "isSurplus" BOOLEAN NOT NULL DEFAULT false;
