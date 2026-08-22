\pset pager off
\echo == stan po migracji: 6 naprawionych wezlow + przeliczone totale ==
SELECT left(r.name,32) AS wymaganie, w.quantity AS wezel, r.quantity AS wymaganie_ilosc,
       w."unitCost", w."totalCost", w."totalPrice", r."wbsNodeAllocations" AS mapa
FROM material_requirements r JOIN wbs_nodes w ON w.id = r."wbsNodeId"
WHERE w.id IN ('77256cc1-29b9-4c33-8aea-a08d4ab7f2a3','585c6288-34cd-42db-86a7-c4bd5646d595',
               '3bec4c13-f786-4ab0-8ba4-3420497f6268','43a8db86-167f-4108-a852-2eabc0c9572f',
               '202805ac-6175-41b0-9c3d-bc092d3514cd','d4c41f48-4ac8-4bdf-984f-3c6ec882afee')
ORDER BY r.name;
\echo
\echo == ile pozycji z sygnatura napompowania zostalo w calej bazie ==
WITH base AS (
  SELECT r."wbsNodeId" AS own_node, r."nodeId" AS proj, r."wbsNodeAllocations"::jsonb AS alloc
  FROM material_requirements r WHERE r."wbsNodeAllocations" ~ '^\s*\{'
), agg AS (
  SELECT b.*, (SELECT count(*) FROM jsonb_object_keys(b.alloc)) AS n_keys,
    (SELECT COALESCE(sum(CASE WHEN v ~ '^-?[0-9.]+$' THEN v::numeric ELSE 0 END),0)
       FROM jsonb_each_text(b.alloc) AS t(k,v)) AS alloc_sum,
    CASE WHEN b.own_node IS NOT NULL AND (b.alloc ->> b.own_node) ~ '^-?[0-9.]+$'
         THEN (b.alloc ->> b.own_node)::numeric END AS alloc_own
  FROM base b
)
SELECT CASE WHEN w."versionId" IS NOT DISTINCT FROM p."acceptedVersionId"
            THEN 'w zaakceptowanym baseline (pominiete swiadomie)' ELSE 'poza baseline (powinno byc 0)' END AS gdzie,
       count(*)
FROM agg a JOIN wbs_nodes w ON w.id = a.own_node JOIN process_nodes p ON p.id = a.proj
WHERE a.n_keys > 1 AND a.alloc_own IS NOT NULL AND w.quantity = a.alloc_sum AND w.quantity <> a.alloc_own
GROUP BY 1;
