\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
\set ver  'ed89e3e9-cb7d-4d7e-984c-eca394f53049'
\set prev '7eba39eb-7a3e-42c9-8ece-3621f078989a'

\echo == ceny w kolejnych wersjach wezla ==
select v.label, v."createdAt"::date,
       count(m.*) as reqs,
       count(m."budgetedPriceNetto") as req_price,
       count(*) filter (where exists (select 1 from product_proposals p
              where p."materialRequirementId" = m.id and p."priceNetto" is not null)) as has_proposal_price
from project_versions v join material_requirements m on m."versionId" = v.id
where v."nodeId" = :'node'
group by v.id, v.label, v."createdAt" order by v."createdAt";

\echo == 40 pozycji bez budgetedPriceNetto: czy maja cene w propozycji / unitCost w WBS ==
select left(m.name,42) as name,
       (select count(*) from product_proposals p where p."materialRequirementId"=m.id) as props,
       (select max(p."priceNetto") from product_proposals p where p."materialRequirementId"=m.id) as prop_price,
       w."unitCost" as wbs_unit_cost, w.quantity as wbs_qty, w.type as wbs_type
from material_requirements m
left join wbs_nodes w on w.id = m."wbsNodeId"
where m."nodeId" = :'node' and m."versionId" = :'ver' and m."budgetedPriceNetto" is null
order by 1;

\echo == WBS zaakceptowanej wersji: unitCost pokrycie ==
select type, count(*) as cnt, count(*) filter (where "unitCost" is not null and "unitCost" > 0) as with_cost
from wbs_nodes where "nodeId" = :'node' and "versionId" = :'ver'
group by 1 order by 2 desc;

\echo == poprzednia wersja (-WLZ-CW+easyrack+Schneider) ceny ==
select count(*) as reqs, count("budgetedPriceNetto") as with_price
from material_requirements where "nodeId" = :'node' and "versionId" = :'prev';
