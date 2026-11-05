# Milestone'y — plan wdrożenia

Branch: `nowy_UI_Realizacja` · plan z 2026-11-05 · kontynuacja `docs/REALIZACJA-MVP-PLAN.md` (etap 4)

## Stan wyjściowy (przed startem tego planu)

- Jest jeden **Harmonogram** zamiast Gantta i Lookahead (`apps/frontend/src/components/shared/harmonogram/`):
  - `Harmonogram.jsx` — widok, wygląd Lookahead, zakres 14 dni / miesiąc / całość, przeciąganie pasków,
  - `HarmonogramPlanowanie.jsx` — wrapper w Planowaniu (start/koniec projektu, eksport Excel/PDF),
  - `harmonogramCzas.js` — logika dat: święta, dni robocze, `buildTasksFromTree`, `ganttDatesByNode`.
- Daty robót = `WbsNode.ganttStart/ganttEnd` (**koniec wyłączny**); w realizacji `planOd/planDo` (`planDo` = ostatni dzień).
- **UWAGA:** praca z 2026-11-05 (Harmonogram, chowany pasek zakładek, kolumny Kokpitu, segment „Pozycja”)
  może być jeszcze niezacommitowana — sprawdź `git status`. W `UnifiedWbsPanel.jsx` i plikach maili są też
  obce, wcześniejsze zmiany użytkownika: commituj tylko swoje fragmenty, i tylko po „tak”.

## Decyzje podjęte

1. Milestone to **typ węzła WBS** (`type = 'milestone'`), nie osobny model.
2. Jest **niekosztowy** (jak `group`): nie wchodzi do wyceny, budżetu, oferty, eksportów, materiałów.
3. Milestone jest **zawsze osobnym węzłem bez dzieci**, dzieckiem gałęzi. Gałąź NIE bywa milestonem.
   Milestone na najwyższym poziomie (pod przedmiotem projektu) = milestone całego zamówienia.
4. Ma wszystko, co daje `wbsNodeId`: wątek, Q&A (`WbsNode.qa`), czat z @wzmiankami, blokery (`Constraint`), zadania.
5. Daty: `ganttStart/ganttEnd` — jeden dzień = romb, kilka dni = romb z „okienkiem”.
6. Baseline: data z zaakceptowanej wersji (`ProcessNode.acceptedVersionId`) — wersje kopiują `WbsNode` same,
   nic nie trzeba dopisywać do `cloneVersionData`, o ile nie dochodzą nowe kolumny (wtedy sprawdzić klon).
7. Status: własny (osiągnięty / nie) — `nodeHasOwnStatus` daje go niekosztowemu węzłowi bez dzieci.
8. Uprawnienia: `CLOSED_LEAF_TYPES` liczone z typów kosztowych → milestone widzi każda rola (tak ma być).

## Do potwierdzenia na starcie nowego czatu

- **Przesunięcie milestone'a:** rekomendacja „zachowaj odstęp” (zależni jadą o tyle samo dni roboczych, w obie
  strony). Alternatywa „tylko wypychaj” (przesuwane tylko kolidujące, wcześniej nikt nie jest ciągnięty).
- Czy potrzebne kolumny `milestoneKind` (CONTRACT | HANDOVER | PAYMENT | PERMIT | INTERNAL) i `invoicePercent`
  już teraz (mała migracja na `WbsNode`), czy później.

## Logika ograniczeń terminów

- **Zależni** = rodzeństwo stojące ZA milestone'em w tej samej gałęzi (kolejność `WbsNode.sortOrder`) wraz z całymi
  poddrzewami. Rodzeństwo PRZED milestone'em jest wolne. Następny milestone w gałęzi zamyka zakres; łańcuch
  kaskaduje (A → jego zależni + milestone B → zależni B).
- **„Nie wcześniej niż”:** zależny startuje najwcześniej w pierwszy dzień roboczy po końcu milestone'a
  (logika dni roboczych/świąt z `harmonogramCzas.js`; gałąź z „pracą w dni wolne” liczy kalendarzowo).
- **Domyślne daty** (węzeł bez zapisanego `ganttStart`): start = max(start projektu, pierwszy dozwolony dzień) —
  wpisać w `buildTasksFromTree`, żeby Planowanie, Realizacja, Kokpit i kontrola kolizji liczyły to samo.
- **Przeciągnięcie zależnego przed milestone:** dociąga do pierwszego dozwolonego dnia + krótki komunikat (`hg-info`).
- **Przesunięcie milestone'a:** zależni przesuwają się wg decyzji wyżej; podgląd na żywo podczas przeciągania.
  W Realizacji NIE ruszamy pozycji z `execStatus` IN_PROGRESS / DONE / HANDED_OVER / INVOICED — konflikt
  oznaczamy na czerwono i pokazujemy kartę w Kokpicie („kolizja z milestone'em”, „Ustaw bloker”), jak kolizje dostaw.
- **Bloker z `impactDays` na milestonie:** nie zmienia planu, liczy prognozę (przerywany cień +N dni na Harmonogramie,
  „prognoza +N dni” w Kokpicie). Plan zmienia tylko świadome przeciągnięcie.
- **Zapis:** jeden endpoint zbiorczy, transakcja, wpis `AuditLog`.

## Kroki (każdy = osobny commit po „tak”)

### M0 — helper kosztowy (bez nowego typu, czysty refaktor)
- `isCostNode(node|type)` na froncie (`wbsConstants.js`) i w backendzie (`common/leaf-types.util.ts`), lustra
  pilnowane jak `test/typy-lustro.test.mjs`. Niekosztowe: `''`, `group`, (od M1) `milestone`.
- Podmienić sprawdzenia `type === 'group'` / `!== 'group'` tam, gdzie znaczą „czy to pozycja kosztowa”
  (~40 miejsc). Pliki z trafieniami: `UnifiedWbsPanel.jsx` (m.in. `validate-budget-pricing`, eksport oferty/budżetu),
  `BudgetModesPanel.jsx`, `WBSHybridTable.jsx`, `wbsConstants.js`, `realizationShared.js`, `utils/wbsPdfExport.js`,
  backend: `common/group-qty.util.ts`, `orders/orders.service.ts`, `scope-documents/scope-documents.service.ts`,
  `wbs-nodes/wbs-nodes.service.ts`. Część trafień dotyczy sum grup (nie „kosztu”) — oceniać każde osobno.
- Weryfikacja: eksport oferty/budżetu (Excel, PDF) i sumy budżetu identyczne przed i po na DURR.

### M1 — typ `milestone` w WBS
- `TYPE_OPTIONS` (+ etykieta, ikona romb), formularz/tabela WBS: chowa ilość, jednostkę, koszt, narzut; pokazuje datę.
- Backend: `updateNode` przyjmuje typ; walidacja „milestone nie ma dzieci” (dodanie dziecka → 400 z komunikatem).
- Wykluczenia: `buildBranchIndex` (`RealizationNewTab.jsx`) nie traktuje milestone'a jako gałęzi; Materiały, Macierz,
  Tablica — bez milestone'ów (albo osobny wiersz, do decyzji przy wdrożeniu).

### M2 — romb na Harmonogramie
- `buildTasksFromTree`: milestone jako zadanie typu `milestone` (1 dzień albo okno start–koniec).
- `Harmonogram.jsx`: romb zamiast paska, przeciąganie (bez rozciągania dla 1-dniowego), legenda, eksport Excel/PDF.
- Realizacja: milestone'y gałęzi widoczne w wierszu gałęzi; klik → szczegóły (wątek, Q&A, blokery).

### M3 — ograniczenia i przesuwanie zależnych
- Funkcja `zaleznyOdMilestone` / `pierwszyDozwolonyDzien` w `harmonogramCzas.js` (czysta, z testem w `/test`).
- Reguła „nie wcześniej niż” w domyślnych datach i przy przeciąganiu.
- `PATCH /wbs-nodes/gantt-dates/batch` `{ items: [{ id, ganttStart, ganttEnd }] }` — transakcja + `AuditLog`.
- Przesunięcie milestone'a → przesunięcie zależnych (wariant z decyzji), podgląd na żywo.

### M4 — Kokpit i prognoza
- Karta „Najbliższe milestone'y”: data planu, baseline, prognoza, poślizg w dniach.
- Kolizje z milestone'em (pozycje rozpoczęte) + „Ustaw bloker”; prognoza z `Constraint.impactDays`.
- Sygnał w drzewie gałęzi (`SidebarBranchTree`) przy zagrożonym milestonie.

## Zasady projektu do pilnowania (CLAUDE.md + memory)

- Po każdej zmianie: `version.js` (`vRRRR.MM.DD.GGMM`, czas z gołego `date`), CHANGELOG (zmiana strukturalna),
  `SLOWNIK.md` + `// @anchor` dla nowych zmiennych (tagi `ui-/back-/schema-`), nowy tag taksonomii → najpierw pytanie.
- Migracja na dev: psql + wpis do `_prisma_migrations`; po zmianie backendu `docker restart erp-backend`.
- Testy w Chrome (claude-in-chrome) na dev (Vite 5174, backend 3005); skrypty i logi testowe w `/test`.
- Bez `window.confirm` — własne modale; bez commita, push i deployu bez wyraźnego „tak”.
