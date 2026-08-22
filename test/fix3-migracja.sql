-- Poprawka 3: cofniecie ilosci napompowanych sumowaniem alokacji (bug do v2026.08.22.877).
-- Sygnatura ofiary: ilosc wezla == suma mapy alokacji, ale != wlasny wpis wezla w tej mapie.
-- Wlasny wpis w mapie przechowal wartosc RZECZYWISCIE wpisana przez uzytkownika.
--
-- Proba (domyslnie): psql -f fix3-migracja.sql
-- Zapis:              psql -v zapis=true -f fix3-migracja.sql
\pset pager off
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE plan ON COMMIT DROP AS
WITH base AS (
  SELECT r.id, r.name, r.quantity AS mr_qty_old, r."wbsNodeId" AS own_node, r."nodeId" AS proj,
         r."wbsNodeAllocations"::jsonb AS alloc
  FROM material_requirements r
  WHERE r."wbsNodeAllocations" ~ '^\s*\{'
), agg AS (
  SELECT b.*,
    (SELECT count(*) FROM jsonb_object_keys(b.alloc)) AS n_keys,
    (SELECT COALESCE(sum(CASE WHEN v ~ '^-?[0-9.]+$' THEN v::numeric ELSE 0 END),0)
       FROM jsonb_each_text(b.alloc) AS t(k,v)) AS alloc_sum,
    CASE WHEN b.own_node IS NOT NULL AND (b.alloc ->> b.own_node) ~ '^-?[0-9.]+$'
         THEN (b.alloc ->> b.own_node)::numeric END AS alloc_own
  FROM base b
)
SELECT a.id, a.name, p.name AS projekt, a.own_node,
       w.quantity AS wezel_przed, a.alloc_own AS wezel_po,
       a.mr_qty_old AS wymaganie_przed, nowa.suma AS wymaganie_po,
       a.alloc AS mapa_przed, nowa.mapa AS mapa_po,
       (w."versionId" = p."acceptedVersionId") AS w_baseline
FROM agg a
JOIN wbs_nodes w ON w.id = a.own_node
JOIN process_nodes p ON p.id = a.proj
CROSS JOIN LATERAL (
  -- Zostaja: wlasny wpis (wartosc prawdziwa) oraz wpisy ZGODNE z iloscia swojego wezla
  -- (prawdziwe rozbicie na galezie). Leca: wpisy rozjechane z wezlem i wskazujace na
  -- wezel, ktorego juz nie ma.
  SELECT COALESCE(jsonb_object_agg(t.k, to_jsonb(t.v::numeric)), '{}'::jsonb) AS mapa,
         COALESCE(sum(t.v::numeric), 0) AS suma
  FROM jsonb_each_text(a.alloc) AS t(k,v)
  LEFT JOIN wbs_nodes wk ON wk.id = t.k
  WHERE t.v ~ '^-?[0-9.]+$'
    AND (t.k = a.own_node OR (wk.id IS NOT NULL AND t.v::numeric = wk.quantity))
) nowa
WHERE a.n_keys > 1 AND a.alloc_own IS NOT NULL
  AND w.quantity = a.alloc_sum AND w.quantity <> a.alloc_own
  -- Wezel z ZAAKCEPTOWANEGO baseline'u zostaje nietkniety: zmiana ilosci w zatwierdzonej
  -- wersji rozjezdza baze z dokumentem, ktory moze byc juz u klienta. Taka pozycja wymaga
  -- osobnej, swiadomej decyzji, nie hurtowej migracji.
  AND w."versionId" IS DISTINCT FROM p."acceptedVersionId";

\echo
\echo == PLAN ZMIAN ==
SELECT left(name,32) AS wymaganie, left(projekt,22) AS projekt,
       wezel_przed, wezel_po, wymaganie_przed, wymaganie_po, w_baseline
FROM plan ORDER BY projekt, name;

\echo
\echo == MAPY ALOKACJI PRZED / PO ==
SELECT left(name,26) AS wymaganie, mapa_przed::text, mapa_po::text FROM plan ORDER BY projekt, name;

UPDATE wbs_nodes w
SET quantity = p.wezel_po,
    "totalCost"  = COALESCE(w."unitCost", 0)  * p.wezel_po,
    "totalPrice" = COALESCE(w."unitPrice", 0) * p.wezel_po
FROM plan p WHERE w.id = p.own_node;

UPDATE material_requirements r
SET quantity = p.wymaganie_po,
    "wbsNodeAllocations" = p.mapa_po::text
FROM plan p WHERE r.id = p.id;

\echo
\echo == KONTROLA PO ZAPISIE (wezel = wlasny wpis w mapie = ilosc wymagania przy jednym wpisie) ==
SELECT left(p.name,32) AS wymaganie, w.quantity AS wezel, r.quantity AS wymaganie_ilosc,
       r."wbsNodeAllocations" AS mapa
FROM plan p JOIN wbs_nodes w ON w.id = p.own_node JOIN material_requirements r ON r.id = p.id
ORDER BY p.projekt, p.name;

\if :{?zapis}
\else
  \set zapis false
\endif

\if :zapis
  \echo '>>> ZAPIS — zatwierdzam'
  COMMIT;
\else
  \echo '>>> PROBA — wycofuje (zapis: -v zapis=true)'
  ROLLBACK;
\endif
