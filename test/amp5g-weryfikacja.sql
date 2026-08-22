\pset pager off
\echo == czy jakas karta jest jeszcze dzielona przez dwa wezly (tag lub nazwa) ==
SELECT
 (SELECT count(*) FROM wbs_nodes w
  WHERE w."nodeId"='d1bb2395-2fd0-4e9e-9760-f722e780224c'
    AND lower(w.type) IN ('material','equipment')
    AND NOT EXISTS (SELECT 1 FROM material_requirements m WHERE m."wbsNodeId"=w.id)) AS wezlow_bez_wlasnej_karty,
 (SELECT count(*) FROM (
    SELECT m."wbsNodeAllocations" FROM material_requirements m
    WHERE m."nodeId"='d1bb2395-2fd0-4e9e-9760-f722e780224c' AND m."wbsNodeAllocations" ~ '^\s*\{'
      AND (SELECT count(*) FROM jsonb_object_keys(m."wbsNodeAllocations"::jsonb)) > 1) x) AS kart_wielogalezowych;

\echo
\echo == suma cybant i zapinek: wezly vs karty ==
SELECT w.name, sum(w.quantity) AS suma_w_wbs,
       (SELECT sum(m.quantity) FROM material_requirements m
        WHERE m."nodeId"=w."nodeId" AND lower(trim(m.name))=lower(trim(w.name))) AS suma_na_kartach
FROM wbs_nodes w
WHERE w."nodeId"='d1bb2395-2fd0-4e9e-9760-f722e780224c' AND w.name IN ('cybant','zapinki do cybantów')
GROUP BY w.name, w."nodeId";
