\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
\set ver  'ed89e3e9-cb7d-4d7e-984c-eca394f53049'

\echo == A. CMC, wersja zaakceptowana: ilosc wymagania vs ilosc wezla WBS ==
select left(m.name, 40) as nazwa,
       w.quantity as wbs_ilosc,
       m.quantity as req_ilosc,
       case when coalesce(w.quantity,0) = 0 then null
            else round((m.quantity / w.quantity)::numeric, 3) end as krotnosc
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where m."nodeId" = :'node' and m."versionId" = :'ver'
  and coalesce(m.quantity, 0) <> coalesce(w.quantity, 0)
order by 1;

\echo == B. CMC: skala ==
select count(*) as sparowanych,
       count(*) filter (where coalesce(m.quantity,0) <> coalesce(w.quantity,0)) as rozjazd
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where m."nodeId" = :'node' and m."versionId" = :'ver';

\echo == C. GLOBALNIE: skala rozjazdu (wersje aktywne + zywe) ==
select count(*) as sparowanych,
       count(*) filter (where coalesce(m.quantity,0) <> coalesce(w.quantity,0)) as rozjazd,
       count(distinct m."nodeId") filter (where coalesce(m.quantity,0) <> coalesce(w.quantity,0)) as zamowien
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where m."versionId" is null
   or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive");

\echo == D. Czy tabela alokacji wbs_node_materials w ogole zyje ==
select (select count(*) from wbs_node_materials) as alokacji,
       (select count(*) from material_requirements where "wbsNodeId" is not null) as wymagan_z_wezlem;

\echo == E. Rozklad krotnosci (czy to zawsze x2) ==
select round((m.quantity / w.quantity)::numeric, 3) as krotnosc, count(*)
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where w.quantity > 0 and coalesce(m.quantity,0) <> coalesce(w.quantity,0)
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive"))
group by 1 order by 2 desc limit 12;
