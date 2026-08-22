-- Poprawka 5: wezly materialowe BEZ wlasnej karty i BEZ tagu `req:` pozyczaja karte sasiada
-- po NAZWIE (trzeci stopien fallbacku w `WbsMaterialsPanel`). Skutek: propozycja albo producent
-- dopisany przy jednej galezi pojawia sie przy wszystkich o tej samej nazwie.
-- Migracja daje kazdemu takiemu wezlowi WLASNA karte.
--
-- Nazwa, ilosc i jednostka z WEZLA (to jego prawda, nic tam nie zmieniamy).
-- Typ, cena budzetowa, wymagania techniczne, produkt katalogowy i dostawca — z karty, ktora
-- wezel dzis pozycza, wiec po migracji widac to samo co teraz, tylko na swojej karcie.
-- Propozycje produktowe NIE sa kopiowane — powielenie ofert dublowaloby pozycje zakupowe.
--
-- Zakres: TYLKO AMP_5G, wersja aktywna.
-- Proba (domyslnie): psql -f karty-bez-tagu-migracja.sql
-- Zapis:             psql -v zapis=true -f karty-bez-tagu-migracja.sql
\pset pager off
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE plan ON COMMIT DROP AS
WITH bez AS (
  SELECT w.id AS wezel, w.name AS nazwa, w.quantity AS ilosc, w.unit, w.type AS typ_wezla,
         w."nodeId" AS proj, w."versionId" AS wer, w.tags
  FROM wbs_nodes w
  WHERE w."nodeId" = 'd1bb2395-2fd0-4e9e-9760-f722e780224c'
    AND w."versionId" = (SELECT id FROM project_versions pv WHERE pv."nodeId"=w."nodeId" AND pv."isActive" LIMIT 1)
    AND lower(w.type) IN ('material','equipment')
    AND (w.tags IS NULL OR w.tags NOT LIKE '%req:%')
    AND NOT EXISTS (SELECT 1 FROM material_requirements m WHERE m."wbsNodeId" = w.id)
)
SELECT b.*,
       wz.id AS wzorzec, wz.type AS typ_karty, wz.status, wz."technicalSpec",
       wz."materialId", wz."supplierId", wz."budgetedPriceNetto"
FROM bez b
LEFT JOIN LATERAL (
  -- ta sama karta, ktora panel dopina dzis po nazwie; deterministycznie: najpierw ta z wlascicielem
  SELECT m.* FROM material_requirements m
  WHERE m."nodeId" = b.proj AND lower(trim(m.name)) = lower(trim(b.nazwa))
  ORDER BY (m."wbsNodeId" IS NOT NULL) DESC, m."createdAt"
  LIMIT 1
) wz ON true;

\echo
\echo == PLAN: karty do utworzenia ==
SELECT '[' || left(nazwa,30) || ']' AS nowa_karta, ilosc, unit AS jedn,
       COALESCE(typ_karty, lower(typ_wezla)) AS typ,
       COALESCE("budgetedPriceNetto"::text,'—') AS cena,
       CASE WHEN wzorzec IS NULL THEN 'brak wzorca — karta pusta' ELSE 'kopia z karty pozyczanej' END AS zrodlo
FROM plan ORDER BY nazwa, ilosc DESC;

INSERT INTO material_requirements
  (id, "nodeId", "versionId", name, type, quantity, unit, status,
   "technicalSpec", "materialId", "supplierId", "budgetedPriceNetto",
   "wbsNodeId", "wbsNodeIds", "wbsNodeAllocations", "isAiAssigned", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p.proj, p.wer, p.nazwa,
       COALESCE(p.typ_karty, lower(p.typ_wezla)), p.ilosc, COALESCE(p.unit,'szt'),
       COALESCE(p.status,'PENDING'), p."technicalSpec", p."materialId", p."supplierId",
       p."budgetedPriceNetto", p.wezel, to_json(ARRAY[p.wezel])::text,
       json_build_object(p.wezel, p.ilosc)::text, false, now(), now()
FROM plan p;

-- wezel dostaje tag SWOJEJ karty
UPDATE wbs_nodes w
SET tags = NULLIF((SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT e AS x FROM jsonb_array_elements_text(COALESCE(w.tags,'[]')::jsonb) AS e WHERE e NOT LIKE 'req:%'
        UNION ALL SELECT 'req:' || m.id
        UNION ALL SELECT 'auto-requirement') q)::text, '[]')
FROM material_requirements m
WHERE m."wbsNodeId" = w.id AND w.id IN (SELECT wezel FROM plan);

-- Przeliczenie kart-wzorcow: galaz, ktora wlasnie dostala WLASNA karte, wypada z mapy wzorca.
-- Bez tego jej ilosc liczylaby sie dwa razy — raz na nowej karcie, raz w sumie starej. Ta sama
-- regula co w kaskadzie `syncMaterialsFromWbsNode`: galaz z wlasna karta nie jest doliczana.
UPDATE material_requirements m
SET quantity = w.suma, "wbsNodeAllocations" = w.mapa, "updatedAt" = now()
FROM (
  SELECT m2.id,
         COALESCE((SELECT jsonb_object_agg(t.k, to_jsonb(t.v::numeric))
                   FROM jsonb_each_text(m2."wbsNodeAllocations"::jsonb) AS t(k,v)
                   WHERE t.v ~ '^-?[0-9.]+$'
                     AND NOT EXISTS (SELECT 1 FROM material_requirements r
                                     WHERE r."wbsNodeId" = t.k AND r.id <> m2.id)), '{}'::jsonb)::text AS mapa,
         COALESCE((SELECT sum(t.v::numeric)
                   FROM jsonb_each_text(m2."wbsNodeAllocations"::jsonb) AS t(k,v)
                   WHERE t.v ~ '^-?[0-9.]+$'
                     AND NOT EXISTS (SELECT 1 FROM material_requirements r
                                     WHERE r."wbsNodeId" = t.k AND r.id <> m2.id)), 0) AS suma
  FROM material_requirements m2
  WHERE m2."nodeId" = 'd1bb2395-2fd0-4e9e-9760-f722e780224c'
    AND m2."wbsNodeAllocations" ~ '^\s*\{'
) w
WHERE m.id = w.id AND w.suma > 0 AND m.quantity <> w.suma;

\echo
\echo == KONTROLA: karty-wzorce po przeliczeniu ==
SELECT '[' || left(m.name,26) || ']' AS karta, m.quantity, m."wbsNodeAllocations" AS mapa
FROM material_requirements m
WHERE m."nodeId"='d1bb2395-2fd0-4e9e-9760-f722e780224c'
  AND m.name IN ('cybant','zapinki do cybantów','mufa łącząca rhdp','mufa światłowodowa 48j szczelna')
ORDER BY m.name, m.quantity DESC;

\echo
\echo == KONTROLA: czy zostal w AMP_5G wezel materialowy bez wlasnej karty ==
SELECT count(*) AS bez_karty_powinno_byc_0
FROM wbs_nodes w
WHERE w."nodeId"='d1bb2395-2fd0-4e9e-9760-f722e780224c'
  AND lower(w.type) IN ('material','equipment')
  AND w."versionId" = (SELECT id FROM project_versions pv WHERE pv."nodeId"=w."nodeId" AND pv."isActive" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM material_requirements m WHERE m."wbsNodeId" = w.id);

\echo
\echo == KONTROLA: cybant — kazda galaz ma teraz swoja karte ==
SELECT w.quantity AS ilosc_wezla, m.id AS karta, m.quantity AS ilosc_karty
FROM wbs_nodes w LEFT JOIN material_requirements m ON m."wbsNodeId" = w.id
WHERE w."nodeId"='d1bb2395-2fd0-4e9e-9760-f722e780224c' AND w.name='cybant' ORDER BY w.quantity DESC;

\if :{?zapis}
\else
  \set zapis false
\endif
\if :zapis
  \echo '>>> ZAPIS'
  COMMIT;
\else
  \echo '>>> PROBA — wycofuje (zapis: -v zapis=true)'
  ROLLBACK;
\endif
