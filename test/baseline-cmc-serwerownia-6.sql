\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'

\echo == licencja enterprise: wszystkie wymagania o tej nazwie ==
select m.id, m."versionId", m."wbsNodeId", m."budgetedPriceNetto", m."createdAt"
from material_requirements m
where m."nodeId" = :'node' and m.name ilike '%licencja enterprise%';

\echo == propozycje tych wymagan ==
select p."materialRequirementId", p.id, p.manufacturer, p.model, p."priceNetto",
       p."purchasePriceNetto", p."isOffer", p."isPurchase", p."isSelected"
from product_proposals p
join material_requirements m on m.id = p."materialRequirementId"
where m."nodeId" = :'node' and m.name ilike '%licencja enterprise%'
order by p."materialRequirementId", p."createdAt";

\echo == duplikaty wymagan po wbsNodeId w wersji aktywnej ==
select "wbsNodeId", count(*) from material_requirements
where "nodeId" = :'node' and "wbsNodeId" is not null
group by 1 having count(*) > 1;

\echo == ile wymagan wersji ma >0 propozycji ==
select count(*) filter (where props > 0) as with_props, count(*) as total
from (select m.id, (select count(*) from product_proposals p where p."materialRequirementId"=m.id) as props
      from material_requirements m
      where m."nodeId" = :'node' and m."versionId" = 'ed89e3e9-cb7d-4d7e-984c-eca394f53049') t;
