-- ============================================================================
-- MIGRACJA WLASCIWA — przenosi stany realizacji ze starej kolumny `status`
-- na osie `purchaseStatus` / `execStatus`.
--
-- URUCHAMIAJ DOPIERO PO PRZEJRZENIU DRY-RUNU:
--   test/migracja-statusy-realizacja-dryrun.sql
--
-- Na produkcji: NAJPIERW BACKUP (backup-db.sh), potem ten skrypt.
--   docker exec -i erp-db psql -U postgres -d erp_db < test/migracja-statusy-realizacja.sql
--
-- Cala migracja siedzi w JEDNEJ transakcji: albo przejdzie w calosci, albo nic.
--
-- Mapowanie (identyczne z dry-runem):
--   ORDERED     -> plan CONFIRMED + zakup ORDERED
--   EXTRA_ORDER -> plan CONFIRMED + zakup ORDERED    (znacznika domowienia nowy model nie ma)
--   IN_STOCK    -> plan CONFIRMED + zakup DELIVERED
--   ISSUED      -> plan CONFIRMED + zakup ISSUED
--   INSTALLED   -> plan CONFIRMED + zakup ISSUED + wykonanie DONE
--   DONE        -> plan CONFIRMED + wykonanie DONE
--   COMPLETED   -> plan CONFIRMED + wykonanie DONE
--   STARTED     -> plan CONFIRMED + wykonanie IN_PROGRESS
--   ON_HOLD     -> plan CONFIRMED + wykonanie ON_HOLD
--   UNFINISHED  -> plan CONFIRMED + wykonanie UNFINISHED
--   CANCELLED   -> plan CONFIRMED + wykonanie CANCELLED
--
-- Dlaczego wszedzie plan CONFIRMED: skoro pozycje zamowiono, wydano albo ekipa ja
-- zaczela, to klient przyjal ja wczesniej. Inaczej po migracji wygladalaby na „Nowa".
-- ============================================================================

BEGIN;

\echo '--- PRZED ---'
SELECT status, count(*) FROM wbs_nodes GROUP BY 1 ORDER BY 2 DESC;

-- ── 1. Osie realizacji na wezlach WBS ──────────────────────────────────────
-- `COALESCE` chroni to, co ktos zdazyl ustawic recznie po wdrozeniu etapu 4:
-- migracja UZUPELNIA puste osie, nigdy nie nadpisuje juz ustawionej wartosci.
UPDATE wbs_nodes SET
  "purchaseStatus" = COALESCE("purchaseStatus", CASE status
      WHEN 'ORDERED'     THEN 'ORDERED'
      WHEN 'EXTRA_ORDER' THEN 'ORDERED'
      WHEN 'IN_STOCK'    THEN 'DELIVERED'
      WHEN 'ISSUED'      THEN 'ISSUED'
      WHEN 'INSTALLED'   THEN 'ISSUED'
    END),
  "execStatus" = COALESCE("execStatus", CASE status
      WHEN 'INSTALLED'  THEN 'DONE'
      WHEN 'DONE'       THEN 'DONE'
      WHEN 'COMPLETED'  THEN 'DONE'
      WHEN 'STARTED'    THEN 'IN_PROGRESS'
      WHEN 'ON_HOLD'    THEN 'ON_HOLD'
      WHEN 'UNFINISHED' THEN 'UNFINISHED'
      WHEN 'CANCELLED'  THEN 'CANCELLED'
    END)
WHERE status IN ('ORDERED','EXTRA_ORDER','IN_STOCK','ISSUED','INSTALLED','DONE',
                 'COMPLETED','STARTED','ON_HOLD','UNFINISHED','CANCELLED');

-- ── 2. Osie z kart materialowych na powiazane wezly ────────────────────────
-- Tylko tam, gdzie karta ma `wbsNodeId`. Karty bez powiazania wypisuje punkt 6
-- dry-runu — ich stanu realizacji nie ma dokad przeniesc.
UPDATE wbs_nodes w SET
  "purchaseStatus" = COALESCE(w."purchaseStatus", CASE m.status
      WHEN 'ORDERED'     THEN 'ORDERED'
      WHEN 'EXTRA_ORDER' THEN 'ORDERED'
      WHEN 'IN_STOCK'    THEN 'DELIVERED'
      WHEN 'ISSUED'      THEN 'ISSUED'
      WHEN 'INSTALLED'   THEN 'ISSUED'
    END),
  "execStatus" = COALESCE(w."execStatus", CASE m.status
      WHEN 'INSTALLED' THEN 'DONE'
      WHEN 'DONE'      THEN 'DONE'
    END)
FROM material_requirements m
WHERE m."wbsNodeId" = w.id
  AND m.status IN ('ORDERED','EXTRA_ORDER','IN_STOCK','ISSUED','INSTALLED','DONE');

-- ── 3. Stara kolumna staje sie czystym statusem PLANU ──────────────────────
-- Dopiero TERAZ, gdy stan realizacji siedzi juz na osiach.
UPDATE wbs_nodes SET status = 'CONFIRMED'
WHERE status IN ('ORDERED','EXTRA_ORDER','IN_STOCK','ISSUED','INSTALLED','DONE',
                 'COMPLETED','STARTED','ON_HOLD','UNFINISHED','CANCELLED');

UPDATE material_requirements SET status = 'CONFIRMED'
WHERE status IN ('ORDERED','EXTRA_ORDER','IN_STOCK','ISSUED','INSTALLED','DONE');

-- ── 4. „Oczekuje" to nie stan — to pozycja dopiero utworzona ───────────────
-- Front i tak pokazuje `PENDING` jako „Nowe"; ten UPDATE domyka to w danych,
-- zeby raporty SQL i eksporty nie musialy znac historycznego kodu.
UPDATE wbs_nodes SET status = 'NEW' WHERE status IN ('', 'PENDING');
UPDATE material_requirements SET status = 'NEW' WHERE status IN ('', 'PENDING');

-- ── 5. Domkniecie spojnosci: pozycja z osia realizacji NIE MOZE byc „Nowa" ──
-- Krok 3 czyscil tylko wezly, ktore mialy WLASNY kod realizacyjny. Wezel, ktory dostal
-- os z powiazanej KARTY (krok 2), zostawal z `PENDING` i po kroku 4 wygladal na „Nowy"
-- mimo dostarczonego towaru. Skoro cokolwiek kupiono albo wykonano — klient przyjal
-- pozycje wczesniej, wiec plan to CONFIRMED.
--
-- `REJECTED` swiadomie POMIJAMY: odrzucenie to decyzja czlowieka, a nie stan wynikajacy
-- z dostawy. Pozycja odrzucona z dostarczonym towarem to konflikt w danych zrodlowych —
-- raport ponizej ja wypisuje, zeby ktos spojrzal, zamiast po cichu nadpisac decyzje.
UPDATE wbs_nodes SET status = 'CONFIRMED'
WHERE ("purchaseStatus" IS NOT NULL OR "execStatus" IS NOT NULL)
  AND status IN ('', 'PENDING', 'NEW');

\echo '--- KONFLIKTY: pozycja odrzucona, a ma stan realizacji (do przejrzenia recznie) ---'
SELECT name AS pozycja, type AS typ, "purchaseStatus" AS zakup, "execStatus" AS wykonanie
FROM wbs_nodes
WHERE status = 'REJECTED' AND ("purchaseStatus" IS NOT NULL OR "execStatus" IS NOT NULL);

\echo '--- OSIEROCONE: os ustawiona na typie, ktory jej NIE MA (do przejrzenia) ---'
-- Stara kolumna nie pytala o typ, wiec „Zamowione" trafialo tez na prace wlasna i na
-- pozycje jeszcze nieotypowane. W nowym modelu praca nie ma osi zakupu, a pozycja bez
-- typu nie ma zadnej — taka wartosc siedzi w bazie, ale zaden widok jej nie pokaze.
--
-- NIE zgadujemy, co autor mial na mysli: pozycja BEZ TYPU odzyska widocznosc sama, gdy
-- ktos nada jej typ materialu albo sprzetu. Praca z osia zakupu wymaga decyzji czlowieka.
SELECT w.name AS pozycja, COALESCE(NULLIF(w.type, ''), '(bez typu)') AS typ,
       w."purchaseStatus" AS zakup, w."execStatus" AS wykonanie
FROM wbs_nodes w
WHERE (w."purchaseStatus" IS NOT NULL AND w.type NOT IN ('material','equipment','service','lodging','fuel'))
   OR (w."execStatus" IS NOT NULL AND w.type NOT IN ('material','equipment','work','service'))
ORDER BY w.type, w.name;

\echo '--- PO: statusy planu ---'
SELECT status, count(*) FROM wbs_nodes GROUP BY 1 ORDER BY 2 DESC;

\echo '--- PO: osie realizacji ---'
SELECT "purchaseStatus", "execStatus", count(*)
FROM wbs_nodes
WHERE "purchaseStatus" IS NOT NULL OR "execStatus" IS NOT NULL
GROUP BY 1, 2 ORDER BY 3 DESC;

\echo '--- Kontrola: zaden kod realizacyjny nie zostal w kolumnie planu ---'
SELECT count(*) AS pozostale_kody_realizacyjne
FROM wbs_nodes
WHERE status NOT IN ('NEW','PROPOSAL','CONFIRMED','REJECTED');

-- Zamien na ROLLBACK, jesli chcesz zobaczyc wynik BEZ zapisywania zmian.
COMMIT;
