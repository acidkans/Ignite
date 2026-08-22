-- Poprawka 4b: 37 wezlow WBS bez wlasnej karty produktowej, zyjacych na cudzej.
-- Dwa rozne przypadki, dwie rozne akcje:
--   C) karta, na ktora wskazuje tag, jest NICZYJA (`wbsNodeId IS NULL`) → podpinamy ja do wezla.
--      Nic nie powstaje, zadna ilosc sie nie zmienia — wezel przejmuje karte, ktorej i tak uzywa.
--   D) karta nalezy do INNEGO wezla → wezel dostaje wlasna kopie. Nazwa, ilosc i jednostka z
--      WEZLA (to jego prawda), reszta z karty, na ktorej dzis zyje — czyli 1:1 z tym, co uzytkownik
--      widzi teraz, a od tej chwili niezaleznie.
-- Wezly typu `group` sa POMIJANE: galaz grupujaca jest agregatorem, nie pozycja materialowa.
-- Propozycje produktowe NIE sa kopiowane — to oferty z cenami i powielenie ich duplikowaloby
-- pozycje po stronie zakupowej. Cena budzetowa karty jest zachowana.
-- Zakres: tylko najnowsza wersja kazdego projektu.
--
-- Proba (domyslnie): psql -f karty-37-migracja.sql
-- Zapis:             psql -v zapis=true -f karty-37-migracja.sql
\pset pager off
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE plan ON COMMIT DROP AS
WITH kandydaci AS (
  SELECT w.id AS wezel, w.name AS nazwa, w.quantity AS ilosc, w.unit, w.type AS typ_wezla,
         w."nodeId" AS proj, w."versionId" AS wer,
         substring(t FROM 'req:([0-9a-f-]{36})') AS req_id
  FROM wbs_nodes w, jsonb_array_elements_text(w.tags::jsonb) AS t
  WHERE w.tags LIKE '%req:%'
    AND w."versionId" = (SELECT id FROM project_versions pv WHERE pv."nodeId" = w."nodeId" ORDER BY pv."createdAt" DESC LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM material_requirements m WHERE m."wbsNodeId" = w.id)
), zlaczone AS (
  -- Zlaczenie PRZED wyborem: wezel z kilkoma tagami `req:` moze miec obok martwego takze zywy.
  -- Wybor przed zlaczeniem gubil takie wezly, gdy trafil na martwy tag.
  SELECT k.*, r.id AS karta, r."wbsNodeId" AS wlasciciel, r.type AS typ_karty, r.status,
         r."technicalSpec", r."materialId", r."supplierId", r."budgetedPriceNetto"
  FROM kandydaci k JOIN material_requirements r ON r.id = k.req_id
)
SELECT DISTINCT ON (wezel) wezel, nazwa, ilosc, unit, typ_wezla, proj, wer, karta, wlasciciel,
       typ_karty, status, "technicalSpec", "materialId", "supplierId", "budgetedPriceNetto",
       CASE WHEN lower(typ_wezla) = 'group' THEN 'pominiete — wezel grupujacy'
            WHEN wlasciciel IS NULL         THEN 'podpiecie istniejacej karty'
            ELSE                                 'utworzenie wlasnej karty' END AS akcja
FROM zlaczone
-- Karta niczyja ma pierwszenstwo: podpiecie nic nie tworzy i nic nie dubluje.
ORDER BY wezel, (wlasciciel IS NULL) DESC, karta;

\echo
\echo == PLAN ==
SELECT akcja, count(*) AS wezlow FROM plan GROUP BY 1 ORDER BY 2 DESC;

\echo
\echo == D: karty do utworzenia ==
SELECT left(p.name,16) AS projekt, left(pl.nazwa,30) AS pozycja, pl.ilosc, pl.unit,
       pl.typ_karty, pl."budgetedPriceNetto" AS cena, (pl."technicalSpec" IS NOT NULL) AS ma_spec
FROM plan pl JOIN process_nodes p ON p.id = pl.proj
WHERE pl.akcja = 'utworzenie wlasnej karty' ORDER BY p.name, pl.nazwa;

-- C) podpiecie: karta niczyja przechodzi na wlasnosc wezla
UPDATE material_requirements m
SET "wbsNodeId" = p.wezel,
    "wbsNodeIds" = to_json(ARRAY[p.wezel])::text,
    "wbsNodeAllocations" = json_build_object(p.wezel, p.ilosc)::text,
    "updatedAt" = now()
FROM plan p WHERE m.id = p.karta AND p.akcja = 'podpiecie istniejacej karty';

-- D) utworzenie wlasnej karty
INSERT INTO material_requirements
  (id, "nodeId", "versionId", name, type, quantity, unit, status,
   "technicalSpec", "materialId", "supplierId", "budgetedPriceNetto",
   "wbsNodeId", "wbsNodeIds", "wbsNodeAllocations", "isAiAssigned", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p.proj, p.wer, p.nazwa, p.typ_karty, p.ilosc, COALESCE(p.unit,'szt'), p.status,
       p."technicalSpec", p."materialId", p."supplierId", p."budgetedPriceNetto",
       p.wezel, to_json(ARRAY[p.wezel])::text, json_build_object(p.wezel, p.ilosc)::text,
       false, now(), now()
FROM plan p WHERE p.akcja = 'utworzenie wlasnej karty';

-- tag wezla ma wskazywac jego wlasna karte
UPDATE wbs_nodes w
SET tags = NULLIF((SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM (
        SELECT e AS x FROM jsonb_array_elements_text(w.tags::jsonb) AS e WHERE e NOT LIKE 'req:%'
        UNION ALL SELECT 'req:' || m.id) q)::text, '[]')
FROM material_requirements m
WHERE m."wbsNodeId" = w.id AND w.id IN (SELECT wezel FROM plan WHERE akcja <> 'pominiete — wezel grupujacy');

\echo
\echo == KONTROLA: wezly nadal bez wlasnej karty (powinny zostac tylko grupujace) ==
SELECT COALESCE(pl.akcja,'?') AS akcja,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM material_requirements m WHERE m."wbsNodeId" = pl.wezel)) AS bez_karty,
       count(*) AS wszystkich
FROM plan pl GROUP BY 1 ORDER BY 1;

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
