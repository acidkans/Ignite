-- KONTROLA przed backfillem ilosci: czy ilosc wymagania to przypadkiem SUMA po kilku galeziach WBS?
-- Jesli tak, ustawienie jej na ilosc jednego wezla zaniza pozycje.
-- Heurystyka: wezly WBS o tej samej nazwie w tej samej wersji.

\echo == Porownanie: ilosc wymagania vs ilosc JEDNEGO wezla vs SUMA wezlow o tej nazwie ==
select left(m.name, 34) as nazwa,
       m.quantity as req,
       w.quantity as wezel,
       s.suma_wezlow,
       s.ile_wezlow,
       case when m.quantity = s.suma_wezlow then 'req = SUMA galezi'
            when m.quantity = w.quantity   then 'zgodne'
            else 'brak wyjasnienia' end as werdykt
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
join lateral (
    select coalesce(sum(w2.quantity), 0) as suma_wezlow, count(*) as ile_wezlow
    from wbs_nodes w2
    where w2."nodeId" = w."nodeId"
      and w2."versionId" is not distinct from w."versionId"
      and lower(trim(coalesce(w2.name, ''))) = lower(trim(coalesce(w.name, '')))
      and lower(coalesce(w2.type, '')) <> 'group'
) s on true
where coalesce(m.quantity, 0) <> coalesce(w.quantity, 0)
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive"))
  and not exists (select 1 from wbs_node_materials wm where wm."materialId" = m.id)
order by 6, 1;

\echo == Podsumowanie werdyktow ==
select case when m.quantity = s.suma_wezlow then 'req = SUMA galezi'
            else 'brak wyjasnienia' end as werdykt,
       count(*)
from material_requirements m
join wbs_nodes w on w.id = m."wbsNodeId"
join lateral (
    select coalesce(sum(w2.quantity), 0) as suma_wezlow
    from wbs_nodes w2
    where w2."nodeId" = w."nodeId"
      and w2."versionId" is not distinct from w."versionId"
      and lower(trim(coalesce(w2.name, ''))) = lower(trim(coalesce(w.name, '')))
      and lower(coalesce(w2.type, '')) <> 'group'
) s on true
where coalesce(m.quantity, 0) <> coalesce(w.quantity, 0)
  and (m."versionId" is null
       or m."versionId" in (select id from project_versions pv where pv."nodeId" = m."nodeId" and pv."isActive"))
  and not exists (select 1 from wbs_node_materials wm where wm."materialId" = m.id)
group by 1 order by 2 desc;
