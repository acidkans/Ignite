\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
\set ver  'ed89e3e9-cb7d-4d7e-984c-eca394f53049'

\echo == createdAt klonow baseline vs wersja ==
select min("createdAt") as min_c, max("createdAt") as max_c, count(*)
from material_requirements where "nodeId" = :'node' and "versionId" = :'ver';

\echo == sourceRequirementId w INNYCH wersjach tego wezla ==
select v.label, v."createdAt"::date, count(m.*) as reqs, count(m."sourceRequirementId") as with_src
from project_versions v
left join material_requirements m on m."versionId" = v.id
where v."nodeId" = :'node'
group by v.id, v.label, v."createdAt" order by v."createdAt";

\echo == sourceRequirementId globalnie po dacie wersji ==
select date_trunc('day', v."createdAt")::date as d, count(m.*) as reqs, count(m."sourceRequirementId") as with_src
from project_versions v join material_requirements m on m."versionId" = v.id
group by 1 order by 1;

\echo == BASELINE vs ZYWE po nazwie: tylko w baseline ==
select left(b.name,50) as name, b.quantity, b."budgetedPriceNetto"
from material_requirements b
where b."nodeId" = :'node' and b."versionId" = :'ver'
  and not exists (select 1 from material_requirements l
                  where l."nodeId" = :'node' and l."versionId" is null
                    and coalesce(l.name,'') = coalesce(b.name,''))
order by 1;

\echo == BASELINE vs ZYWE po nazwie: tylko zywe (poza baseline) ==
select left(l.name,50) as name, l.quantity, l."budgetedPriceNetto", l."budgetSource"
from material_requirements l
where l."nodeId" = :'node' and l."versionId" is null
  and not exists (select 1 from material_requirements b
                  where b."nodeId" = :'node' and b."versionId" = :'ver'
                    and coalesce(b.name,'') = coalesce(l.name,''))
order by 1;

\echo == pozycje z cena w ZYWYCH a bez ceny w BASELINE (po nazwie) ==
select left(l.name,50) as name, b."budgetedPriceNetto" as baseline_price,
       l."budgetedPriceNetto" as live_price, l."budgetSource"
from material_requirements l
join material_requirements b
  on b."nodeId" = :'node' and b."versionId" = :'ver'
 and coalesce(b.name,'') = coalesce(l.name,'')
where l."nodeId" = :'node' and l."versionId" is null
  and l."budgetedPriceNetto" is not null and b."budgetedPriceNetto" is null
order by 1;
