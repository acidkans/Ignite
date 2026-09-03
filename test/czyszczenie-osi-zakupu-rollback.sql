-- ============================================================================
-- ROLLBACK sprzatania osi realizacji (`czyszczenie-osi-zakupu.sql`).
-- JEDNA TRANSAKCJA. Przywraca DOKLADNIE stan sprzed migracji.
--
-- Wartosci sa wpisane PO ID, nie liczone regula — regula nie potrafilaby odtworzyc
-- tego, co migracja skasowala, bo po niej w bazie nie ma juz sladu po `ORDERED`.
-- Stan zrzucony z PRODUKCJI 2026-09-03, przed uruchomieniem migracji (7 wierszy).
--
-- UWAGA: na innej bazie niz ta produkcja skrypt nie znajdzie tych ID i nie zrobi
-- nic (0 zaktualizowanych wierszy) — to jest zamierzone zachowanie, nie blad.
--
-- Uruchomienie (produkcja, po SSH):
--   docker exec -i erp-db psql -U erp_user -d erp_db < czyszczenie-osi-zakupu-rollback.sql
-- ============================================================================

BEGIN;

\echo '=== Przywracam stan sprzed migracji (7 wierszy) ==='

-- usluga „Weryfikacja oraz integracja systemów VESDA z…"
UPDATE wbs_nodes SET "purchaseStatus" = 'ORDERED',             "execStatus" = NULL
WHERE id = '190b6e75-8878-477a-b900-2c8350d8c5c8';

-- usluga „Montaż całego systemu systemu wentylacji"
UPDATE wbs_nodes SET "purchaseStatus" = 'ORDERED',             "execStatus" = NULL
WHERE id = '64aec326-c12e-41e4-8234-a6f213895a94';

-- usluga „montaż BMS"
UPDATE wbs_nodes SET "purchaseStatus" = 'PARTIALLY_DELIVERED', "execStatus" = 'IN_PROGRESS'
WHERE id = '6642898d-5928-41a8-a100-c246a98b01db';

-- usluga „Doposażenie drzwi serwerowni w samozamykacze"
UPDATE wbs_nodes SET "purchaseStatus" = 'INVOICED',            "execStatus" = 'DONE'
WHERE id = 'a4cf6b13-a039-4481-8046-c1a6042bd420';

-- usluga „Mulczerowanie" (zamowienie „Budowa")
UPDATE wbs_nodes SET "purchaseStatus" = 'ISSUED',              "execStatus" = NULL
WHERE id = 'b54c08bf-03d4-46b0-8d98-6fdece89d129';

-- usluga „Rozbudowa systemu przeciwpożarowego Schrack…"
UPDATE wbs_nodes SET "purchaseStatus" = 'ORDERED',             "execStatus" = NULL
WHERE id = 'e8cae396-3b52-43d5-80c1-6059c433d943';

-- paliwo „Paliwo"
UPDATE wbs_nodes SET "purchaseStatus" = NULL,                  "execStatus" = 'DONE'
WHERE id = 'fa011bd6-f44d-4480-8788-87233b7bb4cb';

\echo ''
\echo '=== KONTROLA: musi wyjsc 7 (tyle wierszy bylo przed migracja) ==='
SELECT count(*) AS przywrocone
FROM wbs_nodes w
WHERE (w."purchaseStatus" IS NOT NULL AND w.type NOT IN ('material', 'equipment'))
   OR (w."execStatus"     IS NOT NULL AND w.type NOT IN ('material', 'equipment', 'work', 'service'));

COMMIT;
