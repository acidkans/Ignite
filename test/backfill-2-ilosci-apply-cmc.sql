-- BACKFILL 2 — APPLY, wylacznie wezel CMC- Serwerownia ZDC1-K9_2026.
-- Zasada: WbsNode.quantity jest zrodlem prawdy; MaterialRequirement.quantity dostaje jego odbicie.
-- Kryteria identyczne z dry-runem. RETURNING zwraca stara i nowa wartosc — to podstawa rollbacku.

\set node '219f64a5-515e-45a3-b1c0-0ded85e2a85d'

begin;

with target as (
    select m.id, m.quantity as stara, w.quantity as nowa, left(m.name, 38) as nazwa
    from material_requirements m
    join wbs_nodes w on w.id = m."wbsNodeId"
    where m."nodeId" = :'node'
      and coalesce(m.quantity, 0) <> coalesce(w.quantity, 0)
      and (m."versionId" is null
           or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive"))
      and not exists (select 1 from wbs_node_materials wm where wm."materialId" = m.id)
)
update material_requirements m
set quantity = t.nowa
from target t
where t.id = m.id
returning m.id, t.nazwa, t.stara, m.quantity as nowa;

commit;

\echo == KONTROLA PO ZAPISIE: pozostale rozjazdy na CMC ==
select count(*) as sparowanych,
       count(*) filter (where coalesce(m.quantity,0) <> coalesce(w.quantity,0)) as rozjazd
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where m."nodeId" = :'node'
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive"));
