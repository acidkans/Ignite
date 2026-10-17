-- Status wpisu realizacji zamiast znacznika isSurplus: planowy / pozaplanowy / prognozowany.
-- Dotychczasowe wpisy z isSurplus = true staja sie pozaplanowe, reszta planowa.
CREATE TYPE "LeafActualStatus" AS ENUM ('PLANNED', 'UNPLANNED', 'FORECAST');

ALTER TABLE "leaf_actuals" ADD COLUMN "status" "LeafActualStatus" NOT NULL DEFAULT 'PLANNED';

UPDATE "leaf_actuals" SET "status" = 'UNPLANNED' WHERE "isSurplus" = true;

ALTER TABLE "leaf_actuals" DROP COLUMN "isSurplus";
