\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
\set ver  'ed89e3e9-cb7d-4d7e-984c-eca394f53049'

\echo == QuickQuote wezla (revoke przestawia BASELINE -> LOCKED) ==
select id, name, status, "lockedAt"::date,
       (select count(*) from quick_quote_items i where i."quickQuoteId" = q.id) as pozycji
from quick_quotes q where q."nodeId" = :'node' order by q."createdAt";

\echo == Co wejdzie do zamrozonego klonu: wymagania wg typu i kompletnosci ==
select coalesce(nullif(trim(m.type), ''), '(brak typu)') as typ,
       count(*) as sztuk,
       count(m."wbsNodeId") as z_wezlem,
       count(m."budgetedPriceNetto") as z_cena,
       count(*) filter (where coalesce(trim(m.name), '') = '') as bez_nazwy
from material_requirements m
where m."nodeId" = :'node' and m."versionId" = :'ver'
group by 1 order by 2 desc;

\echo == Smieci ktore tez sie zamroza (bez wezla WBS) ==
select coalesce(nullif(left(trim(m.name), 40), ''), '(BEZ NAZWY)') as nazwa,
       m.quantity, m."budgetedPriceNetto" as cena, m.status
from material_requirements m
where m."nodeId" = :'node' and m."versionId" = :'ver' and m."wbsNodeId" is null
order by 1;

\echo == Reszta klonu: wezly WBS i podzadania ==
select (select count(*) from wbs_nodes where "nodeId" = :'node' and "versionId" = :'ver') as wbs_nodes,
       (select count(*) from subtasks where "nodeId" = :'node' and "versionId" = :'ver') as subtasks,
       (select count(*) from product_proposals p join material_requirements m on m.id = p."materialRequirementId"
        where m."nodeId" = :'node' and m."versionId" = :'ver') as propozycji;
