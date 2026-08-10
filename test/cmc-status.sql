\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
\set ver  'ed89e3e9-cb7d-4d7e-984c-eca394f53049'

\echo == 1. ILOSCI: rozjazd wymaganie vs wezel WBS ==
select count(*) as sparowanych,
       count(*) filter (where coalesce(m.quantity,0) <> coalesce(w.quantity,0)) as rozjazd
from material_requirements m join wbs_nodes w on w.id = m."wbsNodeId"
where m."nodeId" = :'node'
  and (m."versionId" is null or m."versionId" = :'ver');

\echo == 2. CENY: pokrycie w wersji zaakceptowanej ==
select count(*) as wymagan,
       count("budgetedPriceNetto") as z_cena,
       count(*) filter (where "budgetedPriceNetto" is null and "wbsNodeId" is not null) as bez_ceny_z_wezlem,
       count(*) filter (where "budgetedPriceNetto" is null and "wbsNodeId" is null) as bez_ceny_sieroty
from material_requirements where "nodeId" = :'node' and "versionId" = :'ver';

\echo == 3. CENY: propozycja isOffer vs cena wymagania ==
select count(*) as isoffer, count(*) filter (where p."priceNetto" is distinct from m."budgetedPriceNetto") as rozjazd
from product_proposals p join material_requirements m on m.id = p."materialRequirementId"
where m."nodeId" = :'node' and m."versionId" = :'ver' and p."isOffer";

\echo == 4. TOTALE WBS: czy totalCost = unitCost * quantity ==
select count(*) as lisci,
       count(*) filter (where abs(coalesce("totalCost",0) - coalesce("unitCost",0)*coalesce(quantity,0)) > 0.01) as rozjazd
from wbs_nodes where "nodeId" = :'node' and "versionId" = :'ver' and lower(coalesce(type,'')) <> 'group';

\echo == 5. PAROWANIE baseline<->zywe ==
select count(*) as baseline_wierszy, count("sourceRequirementId") as sparowanych
from material_requirements where "nodeId" = :'node' and "versionId" = :'ver';

\echo == 6. SNAPSZOT: czy zaakceptowana wersja jest wciaz aktywna ==
select label, "isActive", "createdAt"::date from project_versions where id = :'ver';

\echo == 7. SIEROTY: wymagania bez wezla WBS w wersji zaakceptowanej ==
select count(*) from material_requirements where "nodeId" = :'node' and "versionId" = :'ver' and "wbsNodeId" is null;
