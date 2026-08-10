\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
\set ver  'ed89e3e9-cb7d-4d7e-984c-eca394f53049'

\echo == 23 SIEROTY (wersja aktywna = baseline), pelny obraz ==
select coalesce(nullif(left(trim(m.name), 38), ''), '(BEZ NAZWY)') as nazwa,
       m.type as typ,
       m.quantity as ilosc,
       m."budgetedPriceNetto" as cena,
       coalesce(length(trim(m."technicalSpec")), 0) as spec_znakow,
       (select count(*) from product_proposals p where p."materialRequirementId" = m.id) as propozycji,
       m."offerId" is not null as z_oferty,
       m."assignedSubtaskId" is not null as ma_podzadanie,
       m."createdAt"::date as utworzone,
       m."updatedAt"::date as zmienione
from material_requirements m
where m."nodeId" = :'node' and m."versionId" = :'ver' and m."wbsNodeId" is null
order by (m."budgetedPriceNetto" is null), 1;

\echo == Czy ktorys jest podpiety tagiem req: do wezla WBS tej wersji ==
select coalesce(nullif(left(trim(m.name), 38), ''), '(BEZ NAZWY)') as nazwa,
       (select count(*) from wbs_nodes w
        where w."nodeId" = :'node' and w."versionId" = :'ver' and w.tags like '%' || m.id || '%') as tagow
from material_requirements m
where m."nodeId" = :'node' and m."versionId" = :'ver' and m."wbsNodeId" is null
order by 2 desc, 1;

\echo == Czy istnieje wezel WBS o tej samej nazwie (kandydat na podpiecie zamiast usuniecia) ==
select coalesce(nullif(left(trim(m.name), 38), ''), '(BEZ NAZWY)') as nazwa,
       w.id as kandydat_wezel, w.quantity as wezel_ilosc, w."unitCost" as wezel_cena,
       (select count(*) from material_requirements m2 where m2."wbsNodeId" = w.id) as wezel_juz_zajety
from material_requirements m
join wbs_nodes w on w."nodeId" = :'node' and w."versionId" = :'ver'
     and lower(trim(coalesce(w.name, ''))) = lower(trim(coalesce(m.name, '')))
     and lower(coalesce(w.type, '')) <> 'group'
where m."nodeId" = :'node' and m."versionId" = :'ver' and m."wbsNodeId" is null
  and coalesce(trim(m.name), '') <> ''
order by 1;
