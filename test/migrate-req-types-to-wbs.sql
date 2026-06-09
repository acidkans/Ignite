-- Migracja typów MaterialRequirement: legacy enum -> typy z drzewa WBS
-- Mapowanie MUSI być spójne z:
--   backend  : parseAndValidateItems + getWbsNodeTypes (material-requirements.service.ts)
--   frontend : wbsConstants.wbsTypeFromAny (LEGACY_REQ_TYPE_MAP)
--
--   device   -> equipment
--   cable    -> material
--   software -> service
--   material/service -> tylko lowercase (bez zmiany semantyki)
--   typy WBS (work/fuel/lodging/group/...) -> bez zmian
--
-- Idempotentne: ponowne uruchomienie nie rusza już-zmigrowanych wierszy.
--
-- !!! KOLEJNOSC: uruchamiac RAZEM z deployem nowego frontu (wbsTypeFromAny).
--     Odpalenie PRZED deployem zepsuje etykiety i auto-link dla equipment/service
--     w zywej (starej) aplikacji, bo stary kod oczekuje enuma DEVICE/MATERIAL/...

BEGIN;

UPDATE material_requirements
SET type = CASE lower(coalesce(type, ''))
    WHEN 'device'   THEN 'equipment'
    WHEN 'cable'    THEN 'material'
    WHEN 'software' THEN 'service'
    ELSE lower(coalesce(type, ''))
  END
WHERE type IS NOT NULL
  AND type <> CASE lower(coalesce(type, ''))
    WHEN 'device'   THEN 'equipment'
    WHEN 'cable'    THEN 'material'
    WHEN 'software' THEN 'service'
    ELSE lower(coalesce(type, ''))
  END;

COMMIT;

-- Weryfikacja PO (uruchom osobno):
-- SELECT type, count(*) FROM material_requirements GROUP BY type ORDER BY 2 DESC;
