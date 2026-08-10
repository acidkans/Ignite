-- BACKFILL 1 — DRY RUN (tylko SELECT, zero zapisów)
-- Cel: wymagania bez budgetedPriceNetto, powiazane 1:1 z wezlem WBS majacym unitCost > 0.
-- Zakres bezpieczny: wylacznie wersja AKTYWNA wezla + zywy baseline (versionId IS NULL).
-- Wersje historyczne (isActive=false) sa pomijane — to zamrozone snapszoty, nie ruszamy ich.

\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'

\echo == A. KANDYDACI DO BACKFILLU (wezel CMC) ==
select left(m.name, 44) as nazwa,
       m.quantity as ilosc,
       w."unitCost" as cena_z_wbs,
       round((m.quantity * w."unitCost")::numeric, 2) as wartosc,
       w.type as typ,
       case when m."versionId" is null then 'zywe' else 'wersja aktywna' end as warstwa,
       (select count(*) from product_proposals p where p."materialRequirementId" = m.id) as ma_propozycje
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where m."nodeId" = :'node'
  and m."budgetedPriceNetto" is null
  and w."unitCost" > 0
  and lower(coalesce(w.type, '')) <> 'group'
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions where "nodeId" = :'node' and "isActive"))
  and (select count(*) from material_requirements m2 where m2."wbsNodeId" = m."wbsNodeId") = 1
order by 3 desc;

\echo == B. PODSUMOWANIE ZAKRESU ==
select count(*) as pozycji,
       round(sum(m.quantity * w."unitCost")::numeric, 2) as suma_wartosci
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where m."nodeId" = :'node'
  and m."budgetedPriceNetto" is null
  and w."unitCost" > 0
  and lower(coalesce(w.type, '')) <> 'group'
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions where "nodeId" = :'node' and "isActive"))
  and (select count(*) from material_requirements m2 where m2."wbsNodeId" = m."wbsNodeId") = 1;

\echo == C. POMINIETE — bez ceny w WBS, backfill ich nie naprawi ==
select left(m.name, 44) as nazwa,
       case when m."wbsNodeId" is null then 'brak wezla WBS'
            when w.id is null then 'wezel WBS nie istnieje'
            when lower(coalesce(w.type,'')) = 'group' then 'galaz grupujaca'
            when coalesce(w."unitCost", 0) = 0 then 'unitCost = 0'
            else 'wiele wymagan na wezle' end as powod
from material_requirements m
left join wbs_nodes w on w.id = m."wbsNodeId"
where m."nodeId" = :'node'
  and m."budgetedPriceNetto" is null
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions where "nodeId" = :'node' and "isActive"))
  and not (w."unitCost" > 0
           and lower(coalesce(w.type,'')) <> 'group'
           and (select count(*) from material_requirements m2 where m2."wbsNodeId" = m."wbsNodeId") = 1)
order by 2, 1;

\echo == D. SKALA GLOBALNA (wszystkie wezly, tylko liczby) ==
select count(distinct m."nodeId") as zamowien,
       count(*) as pozycji
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where m."budgetedPriceNetto" is null
  and w."unitCost" > 0
  and lower(coalesce(w.type, '')) <> 'group'
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive"))
  and (select count(*) from material_requirements m2 where m2."wbsNodeId" = m."wbsNodeId") = 1;
