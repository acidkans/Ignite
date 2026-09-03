-- ============================================================================
-- DRY-RUN sprzatania osi realizacji po zawezeniu PURCHASE_LEAF_TYPES.
-- SAME SELECT-y — nic nie zmienia.
--
-- Kontekst: od 2026-09-03 os ZAKUPU maja wylacznie `material` i `equipment`,
-- a os WYKONANIA — `material`, `equipment`, `work`, `service`. Wartosci zapisane
-- wczesniej na typach, ktore danej osi juz nie maja, ZOSTALY w bazie i przestaly
-- byc pokazywane. Ten skrypt mowi, co dokladnie tam siedzi i co by sie stalo,
-- gdyby to wyczyscic.
--
-- WAZNE: to NIE jest zwykle "wyzeruj kolumne". Czesc tych wartosci to JEDYNY
-- slad realizacji pozycji — usluga z `purchaseStatus = ISSUED` i pustym
-- `execStatus` po skasowaniu kolumny wroci do stanu "nikt jej nie tknal".
-- Dlatego skrypt dzieli wiersze na trzy grupy i tylko dla jednej z nich
-- proponuje kasowanie bez zastanowienia.
--
-- Uruchomienie (dev):
--   docker exec -i erp-db psql -U postgres -d erp_db < test/czyszczenie-osi-zakupu-dryrun.sql
-- Uruchomienie (produkcja, po SSH — patrz reference_server_access):
--   docker exec -i erp-db psql -U erp_user -d erp_db < czyszczenie-osi-zakupu-dryrun.sql
-- ============================================================================

\echo '=== 1. Skala: ile wierszy niesie os, ktorej ich typ juz nie ma ==='
SELECT
  w.type                                AS typ,
  COALESCE(w."purchaseStatus", '—')     AS zakup,
  COALESCE(w."execStatus", '—')         AS wykonanie,
  count(*)                              AS ile
FROM wbs_nodes w
WHERE (w."purchaseStatus" IS NOT NULL AND w.type NOT IN ('material', 'equipment'))
   OR (w."execStatus"     IS NOT NULL AND w.type NOT IN ('material', 'equipment', 'work', 'service'))
GROUP BY 1, 2, 3
ORDER BY 1, 2;

\echo ''
\echo '=== 2. GRUPA A — bezpieczne do skasowania ==='
\echo '    Os wykonania NIESIE JUZ ten sam stan, wiec skasowanie zakupu niczego nie gubi.'
SELECT
  p.name                    AS zamowienie,
  left(w.name, 45)          AS pozycja,
  w.type                    AS typ,
  w."purchaseStatus"        AS zakup_do_skasowania,
  w."execStatus"            AS wykonanie_zostaje
FROM wbs_nodes w
JOIN process_nodes p ON p.id = w."nodeId"
WHERE w.type NOT IN ('material', 'equipment')
  AND w."purchaseStatus" IS NOT NULL
  AND w."execStatus"     IS NOT NULL
ORDER BY p.name, w.name;

\echo ''
\echo '=== 3. GRUPA B — UTRATA INFORMACJI, jesli skasowac wprost ==='
\echo '    `execStatus` pusty, wiec zakup jest JEDYNYM zapisem stanu realizacji.'
\echo '    UWAGA na kolumne `ma_os_wykonania`: przeniesc da sie WYLACZNIE tam, gdzie ta os'
\echo '    w ogole istnieje (praca, usluga). Nocleg, paliwo i pozycja BEZ TYPU nie maja'
\echo '    zadnej osi — tam kasowanie jest jedyna droga, niezaleznie od wartosci.'
\echo '    Kolumna `propozycja_wykonania` pokazuje, na co dalo by sie to przelozyc:'
\echo '      ISSUED / INVOICED / DELIVERED -> DONE          (usluga wydana = wykonana)'
\echo '      PARTIALLY_DELIVERED           -> IN_PROGRESS'
\echo '      CANCELLED                     -> CANCELLED'
\echo '      ORDERED / TO_ORDER            -> (brak)  <-- ta informacja PRZEPADA:'
\echo '                                       os wykonania nie ma kodu "Zlecone".'
SELECT
  p.name                 AS zamowienie,
  left(w.name, 45)       AS pozycja,
  COALESCE(NULLIF(w.type, ''), '(bez typu)') AS typ_realny,
  w."purchaseStatus"     AS zakup_dzis,
  (w.type IN ('work', 'service'))            AS ma_os_wykonania,
  CASE
    WHEN w.type NOT IN ('work', 'service') THEN NULL
    ELSE CASE w."purchaseStatus"
      WHEN 'ISSUED'              THEN 'DONE'
      WHEN 'INVOICED'            THEN 'DONE'
      WHEN 'DELIVERED'           THEN 'DONE'
      WHEN 'PARTIALLY_DELIVERED' THEN 'IN_PROGRESS'
      WHEN 'CANCELLED'           THEN 'CANCELLED'
      ELSE NULL
    END
  END                    AS propozycja_wykonania,
  CASE
    WHEN w.type NOT IN ('work', 'service')             THEN 'TAK — typ nie ma osi wykonania'
    WHEN w."purchaseStatus" IN ('ORDERED', 'TO_ORDER') THEN 'TAK — nie ma kodu na "zlecone"'
    ELSE 'nie'
  END                    AS utrata_informacji,
  (SELECT count(*) FROM leaf_actuals la
    WHERE la."wbsRootId" = COALESCE(w."sourceWbsNodeId", w.id))        AS wpisy_realizacji,
  (SELECT count(*) FROM acceptance_protocol_items i
    WHERE i."wbsRootId" = COALESCE(w."sourceWbsNodeId", w.id))         AS pozycje_protokolow
FROM wbs_nodes w
JOIN process_nodes p ON p.id = w."nodeId"
WHERE w.type NOT IN ('material', 'equipment')
  AND w."purchaseStatus" IS NOT NULL
  AND w."execStatus"     IS NULL
ORDER BY p.name, w.name;

\echo ''
\echo '=== 4. GRUPA C — os WYKONANIA na typie, ktory jej nie ma ==='
\echo '    Nocleg, paliwo i pozycje BEZ TYPU. Wartosc jest artefaktem migracji z etapu 4'
\echo '    (backfill przepisal stary `status` na osie, nie patrzac na typ liscia).'
\echo '    Jesli sa wpisy realizacji — koszt i tak jest rozliczony i kod nic nie wnosi.'
SELECT
  p.name              AS zamowienie,
  left(w.name, 45)    AS pozycja,
  w.type              AS typ,
  w."execStatus"      AS wykonanie_do_skasowania,
  w."realizationClosed" AS rozliczone,
  (SELECT count(*) FROM leaf_actuals la
    WHERE la."wbsRootId" = COALESCE(w."sourceWbsNodeId", w.id))  AS wpisy_realizacji
FROM wbs_nodes w
JOIN process_nodes p ON p.id = w."nodeId"
WHERE w.type NOT IN ('material', 'equipment', 'work', 'service')
  AND w."execStatus" IS NOT NULL
ORDER BY p.name, w.name;

\echo ''
\echo '=== 5. Podsumowanie: ile wierszy rusza kazdy krok migracji ==='
SELECT 'A. zakup skasowany (wykonanie juz to niesie)' AS krok, count(*) AS wierszy
FROM wbs_nodes w
WHERE w.type NOT IN ('material','equipment') AND w."purchaseStatus" IS NOT NULL AND w."execStatus" IS NOT NULL
UNION ALL
SELECT 'B1. zakup PRZENIESIONY na os wykonania', count(*)
FROM wbs_nodes w
WHERE w.type NOT IN ('material','equipment') AND w."execStatus" IS NULL
  AND w."purchaseStatus" IN ('ISSUED','INVOICED','DELIVERED','PARTIALLY_DELIVERED','CANCELLED')
  AND w.type IN ('work','service')
UNION ALL
SELECT 'B2. zakup skasowany BEZ przeniesienia (ORDERED — informacja przepada)', count(*)
FROM wbs_nodes w
WHERE w.type IN ('work','service') AND w."execStatus" IS NULL
  AND w."purchaseStatus" IN ('ORDERED','TO_ORDER')
UNION ALL
SELECT 'B3. zakup skasowany — typ BEZ osi wykonania (nocleg/paliwo/bez typu)', count(*)
FROM wbs_nodes w
WHERE w.type NOT IN ('material','equipment','work','service') AND w."purchaseStatus" IS NOT NULL
UNION ALL
SELECT 'C. wykonanie skasowane (nocleg/paliwo)', count(*)
FROM wbs_nodes w
WHERE w.type NOT IN ('material','equipment','work','service') AND w."execStatus" IS NOT NULL;

\echo ''
\echo '    Kubelki A/B1/B2/B3/C sa ROZLACZNE — ich suma musi sie zgadzac z punktem 6.'
\echo '    (Nie zgadzala sie w pierwszej wersji skryptu: wiersz bez typu ze statusem ORDERED'
\echo '     wpadal i do B2, i do B3, przez co suma wychodzila o jeden za duzo.)'

\echo ''
\echo '=== 6. Kontrola: po migracji ZADEN wiersz nie powinien tu wyjsc ==='
\echo '    (dzis wychodza wszystkie z punktu 1 — to jest wlasnie to, co migracja sprzata)'
SELECT count(*) AS wierszy_do_posprzatania
FROM wbs_nodes w
WHERE (w."purchaseStatus" IS NOT NULL AND w.type NOT IN ('material', 'equipment'))
   OR (w."execStatus"     IS NOT NULL AND w.type NOT IN ('material', 'equipment', 'work', 'service'));
