-- Poprawka 4: tagi `req:` na wezlach WBS maja wskazywac WLASNA karte produktowa wezla.
-- Kopiuj/wklej niosl tag zrodla ({...n} kopiowal `tags`), wiec wklejony lisc edytowal karte
-- oryginalu. Zakres: TYLKO najnowsza wersja kazdego projektu — wersje archiwalne to zamrozony
-- zapis. Migracja rusza WYLACZNIE tagi: zadnej ilosci, ceny ani tresci karty.
--
-- Wezel BEZ wlasnej karty, ktorego tag wskazuje ZYWA karte innego wezla, zostaje NIETKNIETY:
-- zdjecie tagu odebraloby mu jedyna karte, ktora dzis widzi. Te przypadki wymagaja zalozenia
-- wlasnej karty — osobna decyzja, osobny krok.
--
-- Proba (domyslnie): psql -f tagi-req-migracja.sql
-- Zapis:             psql -v zapis=true -f tagi-req-migracja.sql
\pset pager off
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE plan ON COMMIT DROP AS
WITH kandydaci AS (
  SELECT w.id AS wezel, w.name AS nazwa, w."nodeId" AS proj, w.tags,
         (SELECT m.id FROM material_requirements m WHERE m."wbsNodeId" = w.id LIMIT 1) AS wlasna_karta
  FROM wbs_nodes w
  WHERE w.tags LIKE '%req:%'
    AND w."versionId" = (SELECT id FROM project_versions pv WHERE pv."nodeId" = w."nodeId" ORDER BY pv."createdAt" DESC LIMIT 1)
)
SELECT k.wezel, k.nazwa, k.proj, k.tags AS tagi_przed, k.wlasna_karta,
       CASE WHEN k.wlasna_karta IS NOT NULL THEN 'przepiecie na wlasna karte'
            ELSE 'usuniecie martwego tagu' END AS akcja,
       -- Tagi POZA `req:` zostaja nietkniete, dochodzi jeden poprawny `req:` (albo zaden).
       NULLIF((SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
                 SELECT e AS x FROM jsonb_array_elements_text(k.tags::jsonb) AS e WHERE e NOT LIKE 'req:%'
                 UNION ALL
                 SELECT 'req:' || k.wlasna_karta WHERE k.wlasna_karta IS NOT NULL) q
              )::text, '[]') AS tagi_po
FROM kandydaci k
WHERE
  -- cokolwiek do poprawienia: istnieje tag `req:` inny niz docelowy
  EXISTS (SELECT 1 FROM jsonb_array_elements_text(k.tags::jsonb) AS e
          WHERE e LIKE 'req:%' AND e IS DISTINCT FROM ('req:' || COALESCE(k.wlasna_karta, '')))
  AND (
    k.wlasna_karta IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(k.tags::jsonb) AS e
                   JOIN material_requirements m ON m.id = substring(e FROM 'req:([0-9a-f-]{36})')
                   WHERE e LIKE 'req:%')
  );

\echo
\echo == PLAN ==
SELECT akcja, count(*) AS wezlow FROM plan GROUP BY 1 ORDER BY 2 DESC;
\echo
\echo == PROBKA ==
SELECT left(nazwa,26) AS wezel, left(akcja,26) AS akcja, left(tagi_przed,50) AS przed, left(COALESCE(tagi_po,'NULL'),50) AS po
FROM plan ORDER BY akcja DESC, nazwa LIMIT 6;

UPDATE wbs_nodes w SET tags = p.tagi_po FROM plan p WHERE w.id = p.wezel;

\echo
\echo == KONTROLA po zapisie (najnowsze wersje, per WEZEL) ==
WITH k AS (
  SELECT w.id AS wezel, w.tags,
         (SELECT m.id FROM material_requirements m WHERE m."wbsNodeId" = w.id LIMIT 1) AS wlasna
  FROM wbs_nodes w WHERE w.tags LIKE '%req:%'
    AND w."versionId" = (SELECT id FROM project_versions pv WHERE pv."nodeId" = w."nodeId" ORDER BY pv."createdAt" DESC LIMIT 1)
)
SELECT CASE
  WHEN k.wlasna IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(k.tags::jsonb) e
       WHERE e LIKE 'req:%' AND e <> 'req:' || k.wlasna) THEN 'OK — tag wskazuje wlasna karte'
  WHEN k.wlasna IS NOT NULL THEN 'ZLY — nadal cudzy tag mimo wlasnej karty'
  ELSE 'bez wlasnej karty — zyje na cudzej (poza zakresem)' END AS stan, count(*)
FROM k GROUP BY 1 ORDER BY 2 DESC;

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
