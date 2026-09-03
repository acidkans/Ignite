-- ============================================================================
-- Sprzatanie osi realizacji po zawezeniu PURCHASE_LEAF_TYPES (2026-09-03).
-- JEDNA TRANSAKCJA — albo przechodzi caly, albo nic.
--
-- Przed uruchomieniem PRZECZYTAJ wynik `czyszczenie-osi-zakupu-dryrun.sql`.
-- Skrypt NIE jest zwyklym "wyzeruj kolumne": najpierw PRZENOSI to, co da sie
-- uratowac, na os wykonania, a dopiero potem kasuje.
--
-- Kolejnosc krokow jest istotna: krok 1 czyta `purchaseStatus`, ktory krok 2
-- kasuje. Odwrocenie ich zgubiloby wszystko, co krok 1 mial przeniesc.
--
-- Uruchomienie (dev):
--   docker exec -i erp-db psql -U postgres -d erp_db < test/czyszczenie-osi-zakupu.sql
-- Uruchomienie (produkcja, po SSH — patrz reference_server_access):
--   docker exec -i erp-db psql -U erp_user -d erp_db < czyszczenie-osi-zakupu.sql
--
-- Cofniecie: `czyszczenie-osi-zakupu-rollback.sql` (wartosci wpisane po ID,
-- wygenerowane ze stanu produkcji sprzed migracji).
-- ============================================================================

BEGIN;

\echo '=== KROK 1: ratujemy stan realizacji uslug i prac (zakup -> wykonanie) ==='
-- Wylacznie tam, gdzie os wykonania jest PUSTA — nie nadpisujemy niczyjej decyzji.
-- ORDERED i TO_ORDER celowo NIE maja odpowiednika: os wykonania nie zna kodu
-- "Zlecone" (swiadoma decyzja z 2026-09-03 — sama os wykonania wystarczy),
-- wiec ta informacja przepada. Fakt zlecenia podwykonawcy zostaje w dostawcy
-- i numerze dokumentu na wpisie realizacji, jesli ktos go tam wpisal.
UPDATE wbs_nodes
SET "execStatus" = CASE "purchaseStatus"
      WHEN 'ISSUED'              THEN 'DONE'
      WHEN 'INVOICED'            THEN 'DONE'
      WHEN 'DELIVERED'           THEN 'DONE'
      WHEN 'PARTIALLY_DELIVERED' THEN 'IN_PROGRESS'
      WHEN 'CANCELLED'           THEN 'CANCELLED'
    END
WHERE type IN ('work', 'service')
  AND "execStatus" IS NULL
  AND "purchaseStatus" IN ('ISSUED', 'INVOICED', 'DELIVERED', 'PARTIALLY_DELIVERED', 'CANCELLED');

\echo '=== KROK 2: kasujemy os ZAKUPU wszedzie poza materialem i sprzetem ==='
UPDATE wbs_nodes
SET "purchaseStatus" = NULL
WHERE type NOT IN ('material', 'equipment')
  AND "purchaseStatus" IS NOT NULL;

\echo '=== KROK 3: kasujemy os WYKONANIA na typach, ktore jej nie maja ==='
-- Nocleg, paliwo i pozycje bez typu. Artefakt backfillu z etapu 4, ktory
-- przepisywal stary `status` na osie nie patrzac na typ liscia.
UPDATE wbs_nodes
SET "execStatus" = NULL
WHERE type NOT IN ('material', 'equipment', 'work', 'service')
  AND "execStatus" IS NOT NULL;

\echo ''
\echo '=== KONTROLA: musi wyjsc 0. Jesli nie — ROLLBACK zamiast COMMIT ==='
SELECT count(*) AS zostalo_do_posprzatania
FROM wbs_nodes w
WHERE (w."purchaseStatus" IS NOT NULL AND w.type NOT IN ('material', 'equipment'))
   OR (w."execStatus"     IS NOT NULL AND w.type NOT IN ('material', 'equipment', 'work', 'service'));

\echo ''
\echo '=== Co zostalo URATOWANE na osi wykonania (usluga/praca) ==='
SELECT p.name AS zamowienie, left(w.name, 45) AS pozycja, w.type AS typ, w."execStatus" AS wykonanie
FROM wbs_nodes w
JOIN process_nodes p ON p.id = w."nodeId"
WHERE w.type IN ('work', 'service') AND w."execStatus" IS NOT NULL
ORDER BY p.name, w.name;

COMMIT;

\echo ''
\echo 'Gotowe. Jesli KONTROLA wyzej pokazala cokolwiek innego niz 0,'
\echo 'uruchom czyszczenie-osi-zakupu-rollback.sql i zglos to.'
