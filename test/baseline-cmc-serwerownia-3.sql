\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
\set ver  'ed89e3e9-cb7d-4d7e-984c-eca394f53049'

\echo == czy kolumna sourceRequirementId istnieje na prod ==
select column_name, data_type from information_schema.columns
where table_name = 'material_requirements' and column_name in ('sourceRequirementId','budgetSource','budgetedPriceNetto');

\echo == ostatnie migracje ==
select migration_name, finished_at from _prisma_migrations order by finished_at desc limit 8;

\echo == czy sourceRequirementId ustawiony GDZIEKOLWIEK ==
select count(*) as total_reqs, count("sourceRequirementId") as with_src from material_requirements;

\echo == wersje wezla: isActive ==
select id, label, "isActive", "createdAt" from project_versions where "nodeId" = :'node' order by "createdAt";

\echo == rozklad createdAt klonow w zaakceptowanej wersji ==
select "createdAt"::date as d, count(*), count("budgetedPriceNetto") as with_price
from material_requirements where "nodeId" = :'node' and "versionId" = :'ver'
group by 1 order by 1;

\echo == wiersze dodane do snapszota PO jego utworzeniu ==
select left(name,50) as name, "createdAt", "updatedAt", "budgetedPriceNetto", "wbsNodeId" is not null as has_wbs
from material_requirements
where "nodeId" = :'node' and "versionId" = :'ver' and "createdAt" > '2026-08-04 07:52'
order by "createdAt";

\echo == kiedy zmieniano budgetedPriceNetto w ZYWYCH (updatedAt vs akceptacja) ==
select count(*) filter (where "updatedAt" > '2026-08-09 17:09:51') as updated_after_accept,
       count(*) filter (where "updatedAt" <= '2026-08-09 17:09:51') as updated_before
from material_requirements where "nodeId" = :'node' and "versionId" is null;
