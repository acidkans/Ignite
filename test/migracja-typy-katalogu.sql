-- Wyrównanie typów katalogu materiałów (materials.type) do typów WBS.
-- Ten sam słownik co WbsNode.type i MaterialRequirement.type:
--   material | equipment | work | service | lodging | fuel
--
-- Mapowanie legacy (identyczne z LEGACY_REQ_TYPE_MAP w leaf-types.util.ts i wbsConstants.js):
--   DEVICE   -> equipment
--   MATERIAL -> material
--   CABLE    -> material   (kabel to materiał)
--   SOFTWARE -> service    (licencja to usługa)
--   SERVICE  -> service
--
-- Uruchomienie na dev:
--   docker exec -i erp-db psql -U postgres -d erp_db < test/migracja-typy-katalogu.sql
-- Na produkcji URUCHAMIAĆ WYŁĄCZNIE po świadomej decyzji (backup przed).

BEGIN;

SELECT type, count(*) AS przed FROM materials GROUP BY 1 ORDER BY 2 DESC;

UPDATE materials SET type = 'equipment' WHERE lower(type) = 'device';
UPDATE materials SET type = 'material'  WHERE lower(type) = 'material' AND type <> 'material';
UPDATE materials SET type = 'material'  WHERE lower(type) = 'cable';
UPDATE materials SET type = 'service'   WHERE lower(type) = 'software';
UPDATE materials SET type = 'service'   WHERE lower(type) = 'service' AND type <> 'service';

SELECT type, count(*) AS po FROM materials GROUP BY 1 ORDER BY 2 DESC;

COMMIT;
