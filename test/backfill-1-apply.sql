-- BACKFILL 1 — APPLY (wezel CMC- Serwerownia ZDC1-K9_2026)
-- Kryteria identyczne z dry-runem: budgetedPriceNetto IS NULL, wezel WBS 1:1 z unitCost > 0,
-- typ != group, warstwa = wersja aktywna lub zywy baseline. Historycznych wersji nie dotyka.
-- Zwraca liste zmienionych wierszy — sluzy za log i podstawe rollbacku.

\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'

begin;

update material_requirements m
set "budgetedPriceNetto" = w."unitCost"
from wbs_nodes w
where w.id = m."wbsNodeId"
  and m."nodeId" = :'node'
  and m."budgetedPriceNetto" is null
  and w."unitCost" > 0
  and lower(coalesce(w.type, '')) <> 'group'
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions where "nodeId" = :'node' and "isActive"))
  and (select count(*) from material_requirements m2 where m2."wbsNodeId" = m."wbsNodeId") = 1
returning m.id, left(m.name, 44) as nazwa, m."budgetedPriceNetto" as nowa_cena;

commit;

\echo == KONTROLA PO ZAPISIE: pokrycie cen w zaakceptowanej wersji ==
select count(*) as wymagan,
       count("budgetedPriceNetto") as z_cena,
       count(*) filter (where "budgetedPriceNetto" is null) as bez_ceny
from material_requirements
where "nodeId" = :'node'
  and "versionId" = 'ed89e3e9-cb7d-4d7e-984c-eca394f53049';
