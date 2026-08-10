\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
\set ver  'ed89e3e9-cb7d-4d7e-984c-eca394f53049'

\echo == powiazanie wymagan z oferta (wersja zaakceptowana) ==
select count(*) as reqs,
       count("offerId") as with_offer,
       count("offerPositionSnapshot") as with_snapshot,
       count("budgetedPriceNetto") as with_price,
       count("budgetSource") as with_budget_source
from material_requirements where "nodeId" = :'node' and "versionId" = :'ver';

\echo == propozycje w wersji zaakceptowanej: role ==
select count(*) as props,
       count(*) filter (where p."isOffer") as is_offer,
       count(*) filter (where p."isPurchase") as is_purchase,
       count(*) filter (where p."isSelected") as is_selected,
       count(*) filter (where p."priceNetto" is not null) as with_price
from product_proposals p
join material_requirements m on m.id = p."materialRequirementId"
where m."nodeId" = :'node' and m."versionId" = :'ver';

\echo == wymagania z propozycja isOffer ==
select left(m.name,42) as name, m."budgetedPriceNetto" as req_price,
       p."priceNetto" as offer_price, p."isOffer", p."isPurchase", p."isSelected"
from material_requirements m
join product_proposals p on p."materialRequirementId" = m.id
where m."nodeId" = :'node' and m."versionId" = :'ver'
order by 1;

\echo == oferty tego wezla ==
select id, "offerNumber", status, "createdAt"::date,
       (select count(*) from material_requirements m where m."offerId" = o.id) as linked_reqs
from offers o where o."nodeId" = :'node' order by o."createdAt";
