\pset pager off
\echo == kontrola po migracji: czy zostal wezel z wlasna karta i cudzym tagiem ==
WITH k AS (
  SELECT w.id AS wezel, w.tags,
         (SELECT m.id FROM material_requirements m WHERE m."wbsNodeId" = w.id LIMIT 1) AS wlasna
  FROM wbs_nodes w WHERE w.tags LIKE '%req:%'
    AND w."versionId" = (SELECT id FROM project_versions pv WHERE pv."nodeId" = w."nodeId" ORDER BY pv."createdAt" DESC LIMIT 1)
)
SELECT count(*) AS zle_powinno_byc_0 FROM k
WHERE k.wlasna IS NOT NULL
  AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(k.tags::jsonb) e WHERE e LIKE 'req:%' AND e <> 'req:' || k.wlasna);

\echo
\echo == czy jakis wezel stracil tag i zostal bez karty ==
SELECT count(*) AS wezlow_material_bez_karty_i_bez_tagu
FROM wbs_nodes w
WHERE lower(w.type) IN ('material','equipment')
  AND w.tags NOT LIKE '%req:%'
  AND NOT EXISTS (SELECT 1 FROM material_requirements m WHERE m."wbsNodeId" = w.id)
  AND w."versionId" = (SELECT id FROM project_versions pv WHERE pv."nodeId" = w."nodeId" ORDER BY pv."createdAt" DESC LIMIT 1);

\echo
\echo == kontrolna para z AMP5G ==
SELECT left(w.name,34) AS wezel, w.quantity, w.tags
FROM wbs_nodes w WHERE w.id IN ('77256cc1-29b9-4c33-8aea-a08d4ab7f2a3','646f38e9-7fa3-4638-a9d7-bebd957e7bb2');
