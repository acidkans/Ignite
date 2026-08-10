\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
\set ver  'ed89e3e9-cb7d-4d7e-984c-eca394f53049'

\echo == WERSJE WEZLA ==
select v.id, v.label, v."createdAt",
       (select count(*) from material_requirements m where m."versionId" = v.id) as reqs,
       (select count(*) from wbs_nodes w where w."versionId" = v.id) as wbs
from project_versions v
where v."nodeId" = :'node'
order by v."createdAt";

\echo == BASELINE: material_requirements w zaakceptowanej wersji ==
select count(*) as total,
       count("sourceRequirementId") as with_source,
       count("budgetedPriceNetto") as with_price,
       count(*) filter (where "budgetedPriceNetto" is null) as no_price
from material_requirements where "nodeId" = :'node' and "versionId" = :'ver';

\echo == ZYWE: material_requirements versionId IS NULL ==
select count(*) as total,
       count("budgetedPriceNetto") as with_price,
       count(*) filter (where "budgetedPriceNetto" is null) as no_price
from material_requirements where "nodeId" = :'node' and "versionId" is null;

\echo == BASELINE bez ceny, ale zywy odpowiednik MA cene ==
select b.id as baseline_id, left(b.name,45) as name, b.quantity as b_qty,
       b."budgetedPriceNetto" as b_price, l."budgetedPriceNetto" as live_price,
       l."budgetSource" as live_src, b."sourceRequirementId" is not null as paired
from material_requirements b
left join material_requirements l on l.id = b."sourceRequirementId"
where b."nodeId" = :'node' and b."versionId" = :'ver'
  and b."budgetedPriceNetto" is null
order by name;

\echo == BASELINE bez zywego odpowiednika (osierocone) ==
select b.id, left(b.name,45) as name, b."sourceRequirementId", b."budgetedPriceNetto"
from material_requirements b
where b."nodeId" = :'node' and b."versionId" = :'ver'
  and (b."sourceRequirementId" is null
       or not exists (select 1 from material_requirements l where l.id = b."sourceRequirementId"));

\echo == BASELINE: rozklad po typie wezla WBS ==
select coalesce(w.type,'(brak wbsNode)') as wbs_type, count(*) as cnt,
       count(b."budgetedPriceNetto") as with_price
from material_requirements b
left join wbs_nodes w on w.id = b."wbsNodeId"
where b."nodeId" = :'node' and b."versionId" = :'ver'
group by 1 order by 2 desc;
