\pset pager off
\echo == co zmieni sie na kartach przy najblizszej edycji ilosci (regula ostateczna) ==
WITH karty AS (
  SELECT m.id, m.name, m.quantity AS teraz, m."wbsNodeAllocations"::jsonb AS mapa,
         m."wbsNodeId" AS wlasciciel, m."nodeId" AS proj
  FROM material_requirements m
  WHERE m."wbsNodeAllocations" ~ '^\s*\{'
    AND (SELECT count(*) FROM jsonb_object_keys(m."wbsNodeAllocations"::jsonb)) > 1
    AND m."versionId" = (SELECT id FROM project_versions pv WHERE pv."nodeId"=m."nodeId" AND pv."isActive" LIMIT 1)
), po AS (
  SELECT k.*,
    (SELECT COALESCE(sum(CASE WHEN w.id IS NOT NULL THEN w.quantity
                              WHEN t.v ~ '^-?[0-9.]+$' THEN t.v::numeric ELSE 0 END),0)
     FROM jsonb_each_text(k.mapa) AS t(k2,v) LEFT JOIN wbs_nodes w ON w.id = t.k2
     WHERE t.k2 = k.wlasciciel
        OR NOT EXISTS (SELECT 1 FROM material_requirements r
                       WHERE r."wbsNodeId" = t.k2 AND r.id <> k.id)) AS po_naprawie
  FROM karty k
)
SELECT left(p.name,16) AS projekt, '[' || left(po.name,28) || ']' AS pozycja,
       po.teraz, po.po_naprawie, (po.po_naprawie - po.teraz) AS roznica
FROM po JOIN process_nodes p ON p.id = po.proj
WHERE po.teraz <> po.po_naprawie AND po.po_naprawie > 0 ORDER BY p.name, abs(po.po_naprawie - po.teraz) DESC;
