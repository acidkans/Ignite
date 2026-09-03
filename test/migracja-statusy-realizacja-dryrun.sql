-- ============================================================================
-- DRY-RUN migracji statusow realizacji. SAME SELECT-y — nic nie zmienia.
--
-- Kontekst: do etapu 4 wszystkie trzy etapy zycia pozycji jechaly jedna kolumna
-- `wbs_nodes.status`. Po rozdziale kolumna zostaje ETAPEM PLANU, a realizacja ma
-- wlasne osie (`purchaseStatus`, `execStatus`). Stany realizacji zapisane w starej
-- kolumnie NIE przenosza sie same — front pokazuje je w planie jako "Zaakceptowane",
-- ale zakladka Realizacja ich nie widzi i pokazuje "Do zamowienia".
--
-- Uruchomienie:
--   docker exec -i erp-db psql -U postgres -d erp_db < test/migracja-statusy-realizacja-dryrun.sql
-- Na produkcji (po SSH, patrz reference_server_access):
--   docker exec -i <kontener-db> psql -U <user> -d <baza> < migracja-statusy-realizacja-dryrun.sql
-- ============================================================================

\echo '=== 1. Co jest dzis w bazie (wbs_nodes) ==='
SELECT status, count(*) AS ile
FROM wbs_nodes GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '=== 2. Co jest dzis w bazie (material_requirements) ==='
SELECT status, count(*) AS ile
FROM material_requirements GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '=== 3. wbs_nodes — pozycje NIOSACE stan realizacji (te migracja rusza) ==='
\echo '    status_po = plan, zakup_po / wykonanie_po = nowe osie'
SELECT
  w.name AS pozycja,
  w.type AS typ,
  w.status AS status_dzis,
  'CONFIRMED' AS status_po,
  CASE w.status
    WHEN 'ORDERED'     THEN 'ORDERED'
    WHEN 'EXTRA_ORDER' THEN 'ORDERED'
    WHEN 'IN_STOCK'    THEN 'DELIVERED'
    WHEN 'ISSUED'      THEN 'ISSUED'
    WHEN 'INSTALLED'   THEN 'ISSUED'
  END AS zakup_po,
  CASE w.status
    WHEN 'INSTALLED'  THEN 'DONE'
    WHEN 'DONE'       THEN 'DONE'
    WHEN 'COMPLETED'  THEN 'DONE'
    WHEN 'STARTED'    THEN 'IN_PROGRESS'
    WHEN 'ON_HOLD'    THEN 'ON_HOLD'
    WHEN 'UNFINISHED' THEN 'UNFINISHED'
    WHEN 'CANCELLED'  THEN 'CANCELLED'
  END AS wykonanie_po
FROM wbs_nodes w
WHERE w.status IN ('ORDERED','EXTRA_ORDER','IN_STOCK','ISSUED','INSTALLED','DONE',
                   'COMPLETED','STARTED','ON_HOLD','UNFINISHED','CANCELLED')
ORDER BY w.status, w.name;

\echo ''
\echo '=== 4. Ile wierszy wbs_nodes zmieni migracja (podsumowanie) ==='
SELECT status AS status_dzis, count(*) AS ile
FROM wbs_nodes
WHERE status IN ('ORDERED','EXTRA_ORDER','IN_STOCK','ISSUED','INSTALLED','DONE',
                 'COMPLETED','STARTED','ON_HOLD','UNFINISHED','CANCELLED')
GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '=== 5. material_requirements — karty niosace stan realizacji ==='
\echo '    Osie siedza na WEZLE WBS, wiec karta bez wbsNodeId nie ma dokad ich przeniesc.'
SELECT
  CASE WHEN m."wbsNodeId" IS NULL THEN 'BEZ powiazania z wezlem — stan realizacji PRZEPADNIE'
       ELSE 'ma wbsNodeId — stan przeniesie sie na wezel' END AS los,
  m.status AS status_dzis,
  count(*) AS ile
FROM material_requirements m
WHERE m.status IN ('ORDERED','EXTRA_ORDER','IN_STOCK','ISSUED','INSTALLED','DONE')
GROUP BY 1, 2 ORDER BY 1, 3 DESC;

\echo ''
\echo '=== 6. Karty BEZ wbsNodeId niosace stan realizacji — lista do przejrzenia ==='
\echo '    Dla nich migracja ustawi tylko status planu (CONFIRMED); stan zakupu zniknie.'
SELECT m.name AS wymaganie, m.type AS typ, m.status AS status_dzis
FROM material_requirements m
WHERE m."wbsNodeId" IS NULL
  AND m.status IN ('ORDERED','EXTRA_ORDER','IN_STOCK','ISSUED','INSTALLED','DONE')
ORDER BY m.status, m.name;

\echo ''
\echo '=== 7. UWAGA: pozycje z EXTRA_ORDER („Dodatkowe zamowienie") ==='
\echo '    Nowy model nie ma znacznika domowienia — te pozycje dostana ORDERED,'
\echo '    a informacja „to bylo domowienie" zostanie TYLKO w tym wydruku.'
SELECT 'wbs_nodes' AS zrodlo, name AS pozycja, type AS typ FROM wbs_nodes WHERE status = 'EXTRA_ORDER'
UNION ALL
SELECT 'material_requirements', name, type FROM material_requirements WHERE status = 'EXTRA_ORDER'
ORDER BY 1, 2;

\echo ''
\echo '=== 8. Pozycje, ktore NIE beda ruszone (przechodza czysto jako plan) ==='
SELECT
  CASE
    WHEN status IN ('', 'NEW', 'PENDING') THEN 'plan: Nowe'
    WHEN status = 'PROPOSAL'  THEN 'plan: Zaproponowane'
    WHEN status = 'CONFIRMED' THEN 'plan: Zaakceptowane'
    WHEN status = 'REJECTED'  THEN 'plan: Odrzucone'
  END AS status_po,
  count(*) AS ile
FROM wbs_nodes
WHERE status IN ('', 'NEW', 'PENDING', 'PROPOSAL', 'CONFIRMED', 'REJECTED')
GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '=== 9. Kontrola: czy kolumny osi w ogole istnieja i czy sa juz uzywane ==='
SELECT
  count(*) FILTER (WHERE "purchaseStatus" IS NOT NULL) AS z_osia_zakupu,
  count(*) FILTER (WHERE "execStatus" IS NOT NULL)     AS z_osia_wykonania,
  count(*)                                             AS wszystkich
FROM wbs_nodes;

\echo ''
\echo 'DRY-RUN zakonczony. Nic nie zostalo zmienione.'
\echo 'Migracja wlasciwa: test/migracja-statusy-realizacja.sql'
