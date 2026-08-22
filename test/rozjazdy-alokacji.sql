\pset pager off
CREATE TEMP VIEW wpisy AS
WITH base AS (
  SELECT r.id, r.name, r.quantity AS mr_qty, r."wbsNodeId" AS own_node, r."nodeId" AS proj, r."versionId" AS wer,
         r."wbsNodeAllocations"::jsonb AS alloc,
         (SELECT count(*) FROM jsonb_object_keys(r."wbsNodeAllocations"::jsonb)) AS n_keys
  FROM material_requirements r WHERE r."wbsNodeAllocations" ~ '^\s*\{'
)
SELECT b.*, t.k AS wezel, (t.k = b.own_node) AS wlasny,
       CASE WHEN t.v ~ '^-?[0-9.]+$' THEN t.v::numeric END AS w_mapie, w.quantity AS w_wezle,
       CASE WHEN w.id IS NULL THEN 'martwy' WHEN (CASE WHEN t.v ~ '^-?[0-9.]+$' THEN t.v::numeric END) = w.quantity THEN 'zgodny' ELSE 'rozjazd' END AS stan
FROM base b, jsonb_each_text(b.alloc) AS t(k,v) LEFT JOIN wbs_nodes w ON w.id = t.k
WHERE b.n_keys > 1
  AND b.wer = (SELECT id FROM project_versions pv WHERE pv."nodeId" = b.proj ORDER BY pv."createdAt" DESC LIMIT 1);

\echo == TYLKO NAJNOWSZA WERSJA — wymagania do posprzatania ==
SELECT left(p.name,16) AS projekt, COALESCE(NULLIF(left(x.name,28),''),'(bez nazwy)') AS wymaganie,
       x.mr_qty AS ilosc_teraz, x.suma_zywych AS po_naprawie, (x.suma_zywych - x.mr_qty) AS roznica,
       x.martwe, x.rozjazdy
FROM (SELECT id, name, mr_qty, proj,
             sum(COALESCE(w_wezle,0)) FILTER (WHERE stan <> 'martwy') AS suma_zywych,
             count(*) FILTER (WHERE stan = 'martwy')  AS martwe,
             count(*) FILTER (WHERE stan = 'rozjazd') AS rozjazdy
      FROM wpisy GROUP BY id, name, mr_qty, proj) x
JOIN process_nodes p ON p.id = x.proj
WHERE x.martwe > 0 OR x.rozjazdy > 0
ORDER BY p.name, abs(x.suma_zywych - x.mr_qty) DESC;

\echo
\echo == 7 ROZJAZDOW: gdzie stoja oba wezly (sciezka galezi) ==
WITH RECURSIVE sciezka AS (
  SELECT id, name, "parentId", name::text AS droga, 0 AS gl FROM wbs_nodes WHERE "parentId" IS NULL
  UNION ALL
  SELECT w.id, w.name, w."parentId", s.droga || ' > ' || w.name, s.gl+1
  FROM wbs_nodes w JOIN sciezka s ON w."parentId" = s.id WHERE s.gl < 12
)
SELECT COALESCE(NULLIF(left(x.name,22),''),'(bez nazwy)') AS wymaganie,
       x.wlasny AS wlasciciel, x.w_mapie AS w_mapie, x.w_wezle AS ilosc_wezla,
       left(s.droga, 78) AS galaz
FROM wpisy x LEFT JOIN sciezka s ON s.id = x.wezel
WHERE x.id IN (SELECT id FROM wpisy WHERE stan = 'rozjazd')
ORDER BY x.name, x.wlasny DESC;
