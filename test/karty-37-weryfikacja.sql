\pset pager off
\echo == czy zostal wezel bez wlasnej karty (poza grupujacymi) ==
SELECT COALESCE(w.type,'?') AS typ, count(*)
FROM wbs_nodes w
WHERE w.tags LIKE '%req:%'
  AND w."versionId" = (SELECT id FROM project_versions pv WHERE pv."nodeId" = w."nodeId" ORDER BY pv."createdAt" DESC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM material_requirements m WHERE m."wbsNodeId" = w.id)
GROUP BY 1;

\echo
\echo == czy jakas karta jest nadal dzielona przez dwa wezly (tag) ==
WITH tagi AS (
  SELECT w.id AS wezel, substring(t FROM 'req:([0-9a-f-]{36})') AS req_id
  FROM wbs_nodes w, jsonb_array_elements_text(w.tags::jsonb) AS t
  WHERE w.tags LIKE '%req:%'
    AND w."versionId" = (SELECT id FROM project_versions pv WHERE pv."nodeId" = w."nodeId" ORDER BY pv."createdAt" DESC LIMIT 1)
)
SELECT count(*) AS kart_dzielonych FROM (
  SELECT req_id FROM tagi WHERE req_id IS NOT NULL GROUP BY req_id HAVING count(DISTINCT wezel) > 1) x;

\echo
\echo == kontrolna para z AMP5G: kazdy wezel ma teraz swoja karte ==
SELECT left(w.name,30) AS wezel, w.quantity AS ilosc_wezla, w.tags,
       m.id AS karta, m.quantity AS ilosc_karty
FROM wbs_nodes w LEFT JOIN material_requirements m ON m."wbsNodeId" = w.id
WHERE w.id IN ('77256cc1-29b9-4c33-8aea-a08d4ab7f2a3','646f38e9-7fa3-4638-a9d7-bebd957e7bb2');
