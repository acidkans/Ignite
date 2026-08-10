-- BACKFILL 2 — DRY RUN (tylko SELECT). Wyrownanie ilosci: WbsNode.quantity -> MaterialRequirement.quantity.
-- Zasada ustalona z uzytkownikiem: WbsNode.quantity jest jedynym zrodlem prawdy dla ilosci.
-- Zakres: wersje AKTYWNE + zywy baseline. Wersje historyczne (zamrozone snapszoty) pomijane.
-- Pozycje rozdzielone na kilka galezi (alokacje w wbs_node_materials) pomijane — tam ilosc
-- wymagania jest suma alokacji, a nie ilosc jednego wezla.

\echo == A. CMC — pozycja po pozycji ==
select left(m.name, 40) as nazwa,
       m.quantity as bylo,
       w.quantity as bedzie,
       w."unitCost" as cena,
       round(((w.quantity - m.quantity) * coalesce(w."unitCost", 0))::numeric, 2) as zmiana_wartosci
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where m."nodeId" = '219f64a5-515e-45a3-b1c0-0ded85e2a85d'
  and coalesce(m.quantity, 0) <> coalesce(w.quantity, 0)
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive"))
  and not exists (select 1 from wbs_node_materials wm where wm."materialId" = m.id)
order by abs((w.quantity - m.quantity) * coalesce(w."unitCost", 0)) desc;

\echo == B. Rozklad po zamowieniach ==
select left(pn.name, 46) as zamowienie, count(*) as pozycji
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
join process_nodes pn on pn.id = m."nodeId"
where coalesce(m.quantity, 0) <> coalesce(w.quantity, 0)
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive"))
  and not exists (select 1 from wbs_node_materials wm where wm."materialId" = m.id)
group by 1 order by 2 desc;

\echo == C. Suma globalna ==
select count(*) as pozycji, count(distinct m."nodeId") as zamowien
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where coalesce(m.quantity, 0) <> coalesce(w.quantity, 0)
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive"))
  and not exists (select 1 from wbs_node_materials wm where wm."materialId" = m.id);

\echo == D. POMINIETE — maja alokacje, ilosc wymagania = suma galezi ==
select left(m.name, 40) as nazwa, m.quantity as req_ilosc, w.quantity as wbs_ilosc,
       (select count(*) from wbs_node_materials wm where wm."materialId" = m.id) as alokacji
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
where coalesce(m.quantity, 0) <> coalesce(w.quantity, 0)
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive"))
  and exists (select 1 from wbs_node_materials wm where wm."materialId" = m.id)
order by 1;
