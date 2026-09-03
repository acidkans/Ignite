## 2026-09-02 — Statusy etap 4: realizacja dostaje własne osie — zakup i wykonanie

### schema.prisma
- dodano pole `purchaseStatus` w modelu `WbsNode` — droga TOWARU albo ZLECENIA: TO_ORDER | ORDERED | DELIVERED | ISSUED | INVOICED | CANCELLED. NULL = oś nie dotyczy tego liścia (praca własna) albo pozycja nie weszła jeszcze do realizacji.
- dodano pole `execStatus` w modelu `WbsNode` — droga ROBOTY: TO_DO | IN_PROGRESS | ON_HOLD | DONE | HANDED_OVER | CANCELLED. Dla materiału i sprzętu czyta się jako MONTAŻ („Zainstalowane" zamiast „Wykonane"); NULL dla noclegu i paliwa.
- migracja `20260902120000_wbs_realization_statuses` — obie kolumny NULLABLE, BEZ backfillu. Stare stany realizacji zapisane w `status` zostają tam nietknięte; ich przeniesienie to osobna, świadoma decyzja.

### architektura / API
- `back-endpoint` `PATCH /wbs-nodes/:id` przyjmuje `purchaseStatus` i `execStatus`; `GET /wbs-nodes/unified/:nodeId` je zwraca.
- `ui-kolumna` `Status zakupu` i `Status wykonania` w zakładce Realizacja — dropdowny widoczne tylko dla typów, których dana oś dotyczy (`hasPurchaseAxis` / `hasExecAxis`); pozostałe pokazują „—". Kolumna `Status oferty` jest tam READ-ONLY: status planu przenosi się z wyceny, ale zmienia się go w Strukturze projektu.
- `ui-funkcja` `saveAxis` — zapis osi realizacji osobnym PATCH-em, niezależnie od statusu planu. Zmiana w planowaniu nie kasuje już stanu zakupu ani montażu.
- `ui-modal` `protokol-modal-wybor-statusu` — po zapisaniu odbioru protokół przestawia stan realizacji: praca i usługa dostają `execStatus = DONE` automatycznie, a dla materiału i sprzętu pytamy, czy protokół był odbiorem DOSTAWY (`purchaseStatus = DELIVERED`) czy MONTAŻU (`execStatus = DONE`) — z samego dokumentu tego nie widać.

### słownik
- dodano `PURCHASE_STATUS_META`, `EXEC_STATUS_META`, `PURCHASE_LEAF_TYPES`, `EXEC_LEAF_TYPES`, `hasPurchaseAxis`, `hasExecAxis`, `usesMontageLabels`, `execStatusLabel`, `isRealizationOpen`, `DEFAULT_PURCHASE_STATUS`, `DEFAULT_EXEC_STATUS` — `wbsConstants.js`
- dodano `saveAxis`, `purchaseStatusLabel`, `execStatusLabelOf` — `RealizationTab.jsx`
- dodano `wyborStatusu`, `patchStatusWezla`, `poOdbiorzeUstawStatusy`, `zastosujWyborStatusu` — `ProtokolOdbioruModal.jsx`
- dodano `WbsNode.purchaseStatus`, `WbsNode.execStatus` — `schema.prisma`

### migracja danych
- `test/migracja-statusy-realizacja-dryrun.sql` — DRY-RUN (same SELECT): pokazuje, które pozycje niosą stan realizacji w starej kolumnie, co dostaną na osiach, ile kart materiałowych nie ma powiązania z węzłem (ich stan zakupu nie ma dokąd trafić) i które pozycje były „Dodatkowym zamówieniem".
- `test/migracja-statusy-realizacja.sql` — migracja właściwa w JEDNEJ transakcji: przenosi stany na osie (`COALESCE`, więc nie nadpisuje tego, co ktoś ustawił ręcznie po wdrożeniu), potem czyści starą kolumnę do czterech kodów planu i zamienia `PENDING`/`''` na `NEW`.
- Stan dev przed migracją: 18 węzłów WBS (11 `IN_STOCK`, 3 `ORDERED`, 2 `EXTRA_ORDER`, 2 `ISSUED`) i 32 karty z powiązaniem; 17 kart BEZ `wbsNodeId` straci stan realizacji, 4 pozycje `EXTRA_ORDER` stracą znacznik domówienia (nowy model go nie ma).
- `ui-stala` `EXEC_STATUS_META` — dołożony kod `UNFINISHED` („Niedokończone" / „Montaż niedokończony"), żeby stary robociznowy stan miał dokąd trafić przy migracji.

### wytyczne
- `schema-pole` `WbsNode.purchaseStatus` / `WbsNode.execStatus` — NULL znaczy „oś nie dotyczy tego typu ALBO pozycja nie weszła do realizacji". To inna informacja niż „Do zamówienia" i nie wolno jej backfillować hurtem.
- Kody osi realizacji MUSZĄ być rozłączne z kodami planu (`PLAN_STATUS_CODES`) — inaczej jeden odczyt nie wie, o którym etapie mówi. Pilnuje tego `test/status-agregacja.test.mjs`.
- Wersjonowanie: oba nowe pola dopisz do `cloneVersionData` w `versioning.service.ts`, zanim powstanie kolejna wersja wyceny.
- `HANDED_OVER` („Odebrane") ustawia protokół odbioru, nie użytkownik ręcznie.

## 2026-09-02 — Statusy etap 3: planowanie kończy się na zaakceptowane / odrzucone

### architektura / API
- `ui-stala` `PLAN_STATUS_META` — jedna lista statusów ETAPU PLANU dla WSZYSTKICH typów liści: Nowe → Zaproponowane → Zaakceptowane / Odrzucone. Wcześniej planowanie pokazywało dwa pełne słowniki realizacyjne: magazynowy nad materiałem i sprzętem („Zamówione", „Na magazynie", „Wydane", „Zainstalowane") i robociznowy nad pracą, usługą, noclegiem i paliwem („Rozpoczęte", „Wstrzymane", „Zakończone", „Nieskończone", „Odwołane"). Oba opisują świat, który zaczyna się PO akceptacji oferty.
- `ui-funkcja` `planStatusFromAny` — kod planistyczny do POKAZANIA dla pozycji, która w bazie ma kod realizacyjny. Pusty / `PENDING` / `NEW` → Nowe; `PROPOSAL` → Zaproponowane; `REJECTED` → Odrzucone; wszystko pozostałe (`ORDERED`, `IN_STOCK`, `ISSUED`, `INSTALLED`, `STARTED`, `COMPLETED`…) → Zaakceptowane, bo skoro pozycję zamówiono albo ekipa ją zaczęła, klient przyjął ją wcześniej. Wyłącznie ODCZYT — nic z tego nie idzie do bazy.
- `ui-sekcja` `StatusSelect` (WBSHybridTable) i kolumna „Status oferty" w `WbsMaterialsPanel` — obie listy zawężone do czterech kodów planu. Miejsce ZAPISU bez zmian: materiał i sprzęt piszą do `MaterialRequirement.status`, praca, usługa, nocleg i paliwo do `WbsNode.status`.
- `ui-funkcja` `getInheritedMaterialStatus` (widok Budżet, eksporty) — materiał przestaje dziedziczyć status z alokacji magazynowych; w planie ma status swojej pozycji, tak samo jak praca.
- Agregacja gałęzi liczy na kodach planu — plakietka mówi „Nowe 58" zamiast dawnego „Nowe 34, Oczekuje 24" (dwa słowa na jeden stan).
- Zakładka Realizacja zostaje nietknięta: pełne słowniki magazynowy i robociznowy działają tam bez zmian.

### wytyczne
- `schema-pole` `WbsNode.status` — nadal JEDNA kolumna na oba etapy. Zapis z planowania nadpisuje kod realizacyjny (pozycja „Zamówiona" przestawiona w planie na „Nowe" traci ślad zamówienia). Rozdział na osobne pole `planStatus` to następny krok — do czasu jego wdrożenia nie zmieniaj statusu w planowaniu pozycji, która jest już w realizacji.
- Etap planu = decyzja handlowa (czy klient to bierze). Etap realizacji = stan rzeczy i robót. Nowy status dokładaj do właściwego słownika, nigdy do obu.

## 2026-09-02 — Statusy etap 2: jeden słownik typów dla WBS, wymagań i katalogu

### schema.prisma
- `schema-pole` `Material.type` — komentarz opisuje teraz typy WBS (material | equipment | work | service | lodging | fuel) zamiast starego enuma DEVICE | MATERIAL | CABLE | SOFTWARE | SERVICE. Kolumna bez zmian typu — zmienia się to, co do niej wolno zapisać.
- `schema-pole` `MaterialRequirement.type` — jw. Dane były już przemigrowane (material 1334, equipment 508, service 160, work 22 na dev); rozjeżdżał się wyłącznie kod, który nadal stemplował nowe wpisy kodem `DEVICE`.

### architektura / API
- `back-funkcja` `normalizeLeafType` — jedno wejście sprowadzające dowolny typ (stary enum, typ WBS, dowolna wielkość liter z importu) do kanonicznego typu liścia. Odpowiednik `wbsTypeFromAny` z frontu; jedyne celowe rozejście to `group` (typ węzła drzewa, nie pozycji kosztowej).
- `back-stala` `DEFAULT_CATALOG_TYPE` = `equipment` — typ nadawany produktowi katalogu i pozycji wyciągniętej przez AI, gdy typu nie da się rozpoznać. Dokładnie to znaczyło dawne `DEVICE`.
- `back-serwis` `MaterialRequirementsService` / `MaterialsService` — pięć miejsc zapisujących `'DEVICE'` (parser kart katalogowych, import z oferty, tworzenie produktu z propozycji, dwie whitelisty walidacyjne) zapisuje teraz typ kanoniczny. Prompt AI prosi o `material|equipment|service|work` zamiast starego enuma.
- Migracja danych katalogu: `test/migracja-typy-katalogu.sql` (DEVICE→equipment, MATERIAL→material, CABLE→material, SOFTWARE→service). Wykonana na dev — 88 wierszy; na produkcji URUCHAMIAĆ ŚWIADOMIE, po backupie.

### słownik
- dodano `LEGACY_REQ_TYPE_MAP` (backend), `normalizeLeafType`, `DEFAULT_CATALOG_TYPE` — `apps/backend/src/common/leaf-types.util.ts`

### wytyczne
- `schema-pole` `Material.type` / `MaterialRequirement.type` / `WbsNode.type` — jeden słownik dla wszystkich trzech. Każde wejście z zewnątrz (import, AI, formularz) przepuszczaj przez `normalizeLeafType`; nigdy nie zapisuj kodu ze starego enuma.
- Nowy typ liścia dopisuje się w DWÓCH miejscach naraz: `ALL_LEAF_TYPES` (backend) i `TYPE_OPTIONS` (front). Zgodności pilnuje `test/typy-lustro.test.mjs`.

## 2026-09-02 — Statusy etap 1: gałąź nie ma własnego statusu (wylicza go z pozycji)

### architektura / API
- `back-endpoint` `PATCH /wbs-nodes/:id` — odrzuca (400) zapis pola `status` na węźle, który własnego statusu nie ma: przedmiot projektu (`parentId = null`) i gałąź grupująca z dziećmi. Pozycja kosztowa z dziećmi (np. „Avigilon + licencje") status ZACHOWUJE — kosztowo jest liściem, tak samo jak w `leafNodesOf()`.
- `ui-sekcja` `AggregatedStatusBadge` — w drzewie WBS gałąź pokazuje plakietkę READ-ONLY z wartością wyliczoną z pozycji poddrzewa (jeden wspólny kod → ten kod, więcej niż jeden → „Mieszany", brak pozycji → „Brak"); tooltip niesie rozbicie („Nowe 12, Zamówione 8"). Dropdown statusu zostaje wyłącznie na pozycjach.
- `ui-funkcja` `buildAggregatedStatusMap` — te same wyliczone statusy dla danych PŁASKICH (widok Budżet, eksporty Excel/PDF). Bez tego tabela pokazywałaby status wyliczony, a plik obok — starą wartość z bazy.
- Dane NIE są migrowane: statusy zapisane wcześniej na gałęziach zostają w bazie, przestają być tylko pokazywane i zapisywane. Czyszczenie wchodzi dopiero z etapem rozdziału `planStatus` / `realizationStatus`.

### słownik
- dodano `nodeHasOwnStatus`, `collectOwnStatusCodes`, `aggregateBranchStatus`, `summarizeStatusCodes`, `buildAggregatedStatusMap` — `apps/frontend/src/components/shared/wbs/wbsConstants.js`
- dodano `AggregatedStatusBadge` — `apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx`
- dodano `aggregatedStatusByNodeId` — `apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx`
- dodano `isCostLeafType`, `nodeHasOwnStatus` (backend) — `apps/backend/src/common/leaf-types.util.ts`
- dodano guard zapisu statusu gałęzi — `apps/backend/src/wbs-nodes/wbs-nodes.service.ts`

### wytyczne
- `schema-pole` `WbsNode.status` — na gałęzi grupującej i na przedmiocie projektu jest polem MARTWYM: nie czytaj go i nie zapisuj, wartość liczy się z pozycji poddrzewa.
- `ui-funkcja` `nodeHasOwnStatus` — jedyne miejsce decydujące, kto ma własny status; backendowy odpowiednik (`backend-node-has-own-status`) musi mówić to samo, inaczej front chowa dropdown, a API dalej przyjmuje zapis.
- Agregacja zatrzymuje się na pierwszym węźle z własnym statusem — podpozycje pozycji kosztowej nie wchodzą do sumy gałęzi wyżej.

## 2026-09-01 — Po ujednoliceniu materiałów eksport startuje od nowa (świeże dane)

### architektura / API
- `ui-funkcja` `startGuardedExcelExport` — jeden punkt startu eksportów Excel przechodzących przez bramki (rozjazd jednostek/typów, braki wyceny); zastępuje logikę wklejoną w trzy `onClick`.
- `ui-stan` `queuedExport` + efekt ponawiający — „Ujednolić i eksportuj" przerywa bieżący przebieg i uruchamia go ponownie po odświeżeniu `wbsData`. Wcześniej `makeArtifact` przekazany do `ExportChoiceModal` domykał się nad starym stanem, więc mimo poprawki do pliku szły przedpoprawkowe typy i jednostki.

### wytyczne
- `ui-funkcja` `openExport` — `makeArtifact` zamraża stan z chwili wywołania; po każdej zmianie danych, która ma trafić do pliku, przerwij przebieg i wywołaj eksport ponownie zamiast kontynuować istniejący.

## 2026-09-01 — Rozjazd jednostek/typów wykrywany na wszystkich liściach WBS

### architektura / API
- `ui-funkcja` `validateMaterialConsistency` — reguła obejmowała tylko liście typu Materiał/Sprzęt, więc ta sama nazwa raz jako `material`, raz jako `work` (przypadek „kabel" na dev) przechodziła bez ostrzeżenia. Teraz sprawdzane są WSZYSTKIE liście (bez gałęzi grupujących i węzłów z dziećmi), a selektor typu w modalu oferuje pełne `LEAF_TYPE_OPTIONS` zamiast pary Materiał/Sprzęt.

### wytyczne
- konflikt liczony jest per nazwa liścia (case-insensitive) w obrębie zlecenia i wersji — ta sama nazwa z różną jednostką LUB różnym typem; gałęzie i węzły z dziećmi nigdy nie wchodzą do porównania.

## 2026-09-01 — Ujednolicanie jednostek/typów materiałów wprost w modalu eksportu

### architektura / API
- `ui-funkcja` `handleUnifyMaterialConflicts` — w modalu rozjazdu można wybrać docelową jednostkę (i typ, gdy się różni) i zapisać ją na wszystkich pozycjach konfliktu bez wracania do `WBSHybridTable`. Zapis idzie przez `ui-funkcja` `updateNodeField`, więc ciągnie tę samą synchronizację do kart materiałowych co ręczna edycja; ilości NIE są przeliczane.
- `ui-modal` `material-conflict-modal` — dropdown „Ujednolić do" per konflikt (jednostki obecne w projekcie + `UNIT_OPTIONS`), oznaczenie „← zmieni się" przy pozycjach do zmiany, przyciski „Ujednolić i eksportuj" / „Eksportuj mimo to" / „Anuluj — poprawię"; domyślny wariant = ten z największej liczby pozycji (remis → większa łączna ilość).

### słownik
- dodano `handleUnifyMaterialConflicts`, `materialUnifyChoices`, `materialUnifying` — `apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx`

### wytyczne
- ujednolicenie zmienia wyłącznie etykietę jednostki/typ — nigdy nie przeliczaj przy nim ilości; przeliczenie metrów na sztuki wymaga decyzji człowieka.

## 2026-09-01 — Ostrzeżenie o rozjeździe jednostek/typów materiałów przed eksportem

### architektura / API
- `ui-funkcja` `validateMaterialConsistency` — wykrywa liście typu Materiał/Sprzęt o tej samej nazwie (case-insensitive), ale różnej jednostce lub różnym typie. To one rozbijają klucz agregacji `typ||nazwa||wymagania||jednostka` w arkuszu `Materiały (agregacja)` na kilka wierszy (przypadek: korytko 250 „metry" osobno od 100 „sztuki").
- `ui-funkcja` `guardMaterialConsistencyBeforeExport` + `ui-modal` `material-conflict-modal` — ostrzeżenie (nie blokada) przed eksportami „Tabele oferty (Excel)", „Analiza projektu (Excel)" i „Materiały (Excel)": lista konfliktów z ilością, jednostką, typem i ścieżką WBS oraz wybór „Eksportuj mimo to" / „Anuluj — poprawię".

### słownik
- dodano `validateMaterialConsistency`, `guardMaterialConsistencyBeforeExport`, `askMaterialConflict`, `materialConflictPrompt`, modal `material-conflict-modal` — `apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx`

### wytyczne
- rozjazd jednostek jest ostrzeżeniem, nie błędem — ta sama nazwa w różnych jednostkach bywa zamierzona; nigdy nie scalaj takich pozycji automatycznie w agregacji, bo sumowałoby to metry ze sztukami.

## 2026-09-01 — Eksport bez cen: pozycje o cenie 0 zostają w arkuszach oferty

### architektura / API
- `ui-funkcja` `handleExportOfertaWbsExcel` — arkusze `Oferta-podział na Typy`, `WBS1 - Zakresy`, `WBS2 - Składowe`, `WBS3 - Szczegóły` filtrowały pozycje warunkiem `price <= 0`, więc w eksporcie „bez cen" wypadały dokładnie te liście, dla których ten eksport powstaje (z 26 materiałów do WBS3 wchodził 1). Filtr działa teraz tylko poza trybem „bez cen".
- `ui-funkcja` `buildWbsHtmlTable` — nowy parametr `opts.includeZeroPriced` (domyślnie false); PDF oferty w trybie „bez cen" przekazuje `true`, dzięki czemu tabele `{tabela wbs1..3}` pokazują pełny zakres.

### wytyczne
- każdy nowy arkusz/tabela oferty odsiewająca pozycje po cenie MUSI respektować `ui-stan` `exportNoPricesRef` — inaczej eksport bez cen wychodzi niekompletny.

## 2026-09-01 — Eksport oferty/budżetu „bez cen" zamiast twardej blokady przy brakach wyceny

### architektura / API
- nowy plik `apps/frontend/src/utils/exportWithoutPrices.js` — post-processing artefaktu eksportu: `ui-funkcja` `stripPricesFromWorkbook` (ExcelJS) i `ui-funkcja` `stripPricesFromHtml` (HTML PDF-a) usuwają WSZYSTKIE wartości i formuły pieniężne (kolumny wg nagłówka `ui-stala` `MONEY_HEADER_RE`, wiersze etykieta→wartość, sumy „Razem"). Nic się nie przelicza — komórki są puste, nie zerowe.
- `ui-funkcja` `validateBudgetPricing` — nadal wykrywa braki (koszt jedn. = 0 lub narzut = 0), ale NIE przerywa już eksportu; decyzję podejmuje użytkownik w `ui-modal` `pricing-gap-modal` („Eksportuj bez cen" / „Anuluj — uzupełnię ceny").
- `ui-funkcja` `guardPricingBeforeExport` — wspólna bramka dla eksportów PDF (oferta/budżet/pełny projekt), „Tabele oferty (Excel)" i „Analiza projektu (Excel)"; ustawia `ui-stan` `exportNoPricesRef` dla builderów.
- `ui-funkcja` `appendBudgetSheet` — w trybie „bez cen" buduje arkusz normalnie (zamiast zwracać `ok:false`); wartości znikają dopiero przy zapisie pliku.
- eksport bez cen dostaje znacznik w nazwie pliku (`_BEZ-CEN`, `ui-funkcja` `noPricesFilename`) i czerwony pasek ostrzegawczy w PDF (`ui-funkcja` `noPricesBannerHtml`, `ui-stala` `NO_PRICES_NOTE`).

### słownik
- dodano `stripPricesFromWorkbook`, `stripPricesFromHtml`, `noPricesFilename`, `noPricesBannerHtml`, `MONEY_HEADER_RE`, `NO_PRICES_NOTE` — `apps/frontend/src/utils/exportWithoutPrices.js`
- dodano `guardPricingBeforeExport`, `askPricingGap`, `exportNoPricesRef`, `pricingGapPrompt`, modal `pricing-gap-modal` — `apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx`

### wytyczne
- `ui-stan` `exportNoPricesRef` — eksporty spoza bramki (Q&A, harmonogram, materiały, pełny PDF projektu) MUSZĄ zerować tę flagę przed `openExport`, żeby nie odziedziczyć trybu „bez cen" po poprzednim eksporcie.
- nowe kolumny/arkusze z wartościami nie wymagają zmian w sanitizerze pod warunkiem, że nagłówek zawiera słowo pieniężne (cena/koszt/narzut/rabat/wartość/zysk/kwota) — inaczej dopisz wzorzec do `MONEY_HEADER_RE`.

## 2026-09-01 — WBS: gałąź „Koszty ogólne" zamiast „Zarządzanie projektem"/„Gwarancja 24m", narzut na automatycznym Paliwie

### architektura / API
- `back-serwis` `ProcessTreeService.create` — gałąź domyślna nowego zlecenia zmieniła nazwę z `Zarządzanie projektem` na `Koszty ogólne`; dołożone liście `Dokumentacja powykonawcza` (work, pakiet), `Wizyta gwarancyjna` (work, dni, ilość 2) i `Logistyka` (work, pakiet) — obok istniejących `Zarządzanie projektem`, `Wizja lokalna`, `Paliwo`. Mirror `OrderRequirements.wbsTree` zaktualizowany o te same węzły.
- `ui-tabela` `WBSHybridTable` — usunięta gałąź `Gwarancja 24m` zakładana przy każdym nowym przedmiocie projektu (`buildDefaultWarrantyBranch`); wizyta gwarancyjna żyje teraz raz na zlecenie w `Koszty ogólne`.
- `ui-funkcja` `buildFuelLeaf` — nowy builder liścia `Paliwo`: bierze jednostkę, cenę i NARZUT z modalu „Domyślne wartości" (`leafDefaults.fuel`), fallback `kilometry` / `0,70 zł`. Wcześniej narzut nie był wypełniany i automatycznie dodane paliwo wchodziło do oferty z pustym narzutem.

### słownik
- dodano `buildFuelLeaf` — builder liścia Paliwo z wartościami domyślnymi, `apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx`, `@anchor build-fuel-leaf`
- usunięto `buildDefaultWarrantyBranch`

### wytyczne
- `ui-funkcja` `buildFuelLeaf` — każdy automatycznie dodawany liść Paliwo MUSI przechodzić przez ten builder, żeby dostać narzut z domyślnych; nie twórz go inline.
- `back-serwis` `ProcessTreeService.create` — liście `Koszty ogólne` powstają przed zapisem `wbs-leaf-defaults` zlecenia, więc nie mają narzutu z modalu; użytkownik ustawia go ręcznie lub przez „Domyślne wartości".

## 2026-09-01 — Schemat: przypisywanie znacznika do liści drzewa WBS

### architektura / API
- `ui-funkcja` `flattenWbsNodes` (MarkerDetailsPanel) — zwraca teraz `depth`, `parentId`, `hasChildren` i znormalizowany `type`; wycina podgałęzie typu `fuel` i `lodging`
- panel znacznika renderuje rozwijane drzewo WBS zamiast samych korzeni — znacznik można przypiąć do dowolnego liścia
- dropdown „+ Nowe wymaganie" listuje całe drzewo (wcięcia wg poziomu), nie tylko gałęzie najwyższego poziomu

- ten sam mechanizm w `SchematTab.jsx` (panel znacznika w widoku desktopowym Schemat) — tam trafia klik w znacznik na schemacie

### słownik
- dodano `schemat-wbs-hidden-marker-types`, `schemat-flatten-wbs-nodes`, `schemat-expanded-wbs`, `schemat-toggle-wbs-expand`, `schemat-visible-wbs-nodes` — drzewo WBS w panelu znacznika SchematTab
- dodano `wbs-hidden-marker-types` — lista typów WBS nieprzypisywalnych do znaczników (paliwo, nocleg)
- dodano `expanded-wbs`, `toggle-wbs-expand`, `visible-wbs-nodes`, `render-wbs-rows`, `flatten-wbs-nodes` — stan i render drzewa WBS w MarkerDetailsPanel

### wytyczne
- `ui-stan` `expandedWbs` — po wczytaniu `wbsLinks` gałęzie nadrzędne przypisanych węzłów rozwijają się automatycznie, inaczej istniejące przypisania do liści są niewidoczne

## 2026-08-31 — urlopy: rozklad urlopow na miesiace (raport placowy dla DAK)

### architektura / API
- dodano `back-endpoint` `GET /leaves/monthly-breakdown?from=YYYY-MM&to=YYYY-MM` — kazdy urlop dotykajacy okna z rozpiska ile dni przypada na ktory miesiac; brak parametrow = miesiac poprzedni. Dostep wylacznie dla rol z `LEAVE_VIEW_ALL_ROLES` (ADMIN, DAK), bo to dane placowe calej firmy
- dodano `back-funkcja` `monthlyBreakdown()`, `splitDaysIntoMonths()`, `monthRange()`, `previousMonthKey()`, `monthKey()` w `LeavesService`
- dodano `back-dto` `MonthlyBreakdownRow` i `MonthlyBreakdownResult`
- dodano `ui-modal` `LeaveMonthlyBreakdownModal` — tabela raportu z filtrem miesiecy i eksportem do Excela
- dodano `ui-funkcja` `buildLeaveMonthlyWorkbook()` / `downloadLeaveMonthlyExcel()` w nowym pliku `apps/frontend/src/utils/leaveMonthlyExcel.js`
- dodano `ui-sekcja` `dashboard-monthly-breakdown-card` w zakladce Dashboard — przycisk otwierajacy raport

### wytyczne
- `back-funkcja` `splitDaysIntoMonths()` — rozbicie miesieczne trzyma sie zapisanego `Leave.daysCount`, NIE przeliczonych dni roboczych. Dni robocze (pn-pt) sluza wylacznie jako wagi podzialu, a reszta z zaokraglen ladu je w ostatnim miesiacu. Powod: DAK liczy wyplaty z wymiaru zapisanego na wpisie — raport nie moze pokazywac innej sumy niz sam wpis
- `back-funkcja` `monthlyBreakdown()` — urlop wchodzacy w okno tylko czescia dni pokazuje w tabeli WYLACZNIE miesiace z okna; suma kolumn miesiecy bywa wtedy mniejsza niz kolumna „Dni razem". Wiersze z `mismatch = true` (urlop godzinowy, wpis reczny) sa podswietlone i wymagaja recznej weryfikacji
- `ui-funkcja` `buildLeaveMonthlyWorkbook()` — sumy w kolumnach miesiecy to zywe formule `SUM()`, zgodnie z zasada eksportow Excel

## 2026-08-31 — saldo urlopowe: pula za rok biezacy liczona ze stazu, reczna edycja na zadanie

### architektura / API
- dodano `back-endpoint` `POST /leave-balances/entitlement/recalculate` — podstawia do puli roku biezacego wymiar wyliczony ze stazu (art. 154 par. 1 KP), z bariera „nigdy ponizej juz wykorzystanych dni"
- dodano `back-funkcja` `recalculateFromExperience()` i `back-dto` `RecalculateEntitlementDto` w `LeaveBalancesService`
- `ui-input` pula za rok biezacy w panelu „Dni jeszcze do wybrania" jest domyslnie zablokowany; odblokowuje go przycisk „Edytuj recznie". Lata wsteczne (urlop zalegly) pozostaja edytowalne jak dotad
- dodano naglowki kolumn (rok / przysluguje / zostalo) w panelu salda dni

### slownik
- dodano `dashboard-balance-head`, `dashboard-manual-entitlement`, `dashboard-current-balance-year`, `dashboard-recalculate-entitlement`, `dashboard-entitlement-actions`
- dodano `recalculate-entitlement-dto`, `recalculate-entitlement-from-experience`, `leave-balances-recalculate-endpoint`

### wytyczne
- `schema-pole` `LeaveBalance.entitlementDays` — wyliczenie ze stazu NIE dzieje sie automatycznie po uzupelnieniu daty rozpoczecia pracy. Powod: model nie odroznia wiersza wpisanego przez kadre od zmaterializowanego przez `applyDeductions()` przy zatwierdzaniu wniosku, wiec automat kasowalby reczne korekty. Przeliczenie uruchamia administrator przyciskiem „Przelicz ze stazu"
- `back-funkcja` `defaultEntitlementDays()` — fallback ze stazu dziala WYLACZNIE gdy brak wiersza za rok biezacy; pierwszy zatwierdzony wniosek materializuje wiersz i fallback przestaje dzialac na zawsze

## 2026-08-31 — urlopy: jedna karta „Przegląd urlopowy", koniec przeciągalnych kart

### architektura / API
- usunieto `back-endpoint` `GET /leaves/layout` i `PUT /leaves/layout` — uklad kart zakladki „Moje dane" przestal istniec, wiec nie ma czego zapisywac
- usunieto `back-funkcja` `getLayout()` i `saveLayout()` z `LeavesService` oraz `back-stala` `LEAVES_LAYOUT_ENTITY` (`leaves-cards-layout`)
- usunieto `ui-karta` `DraggableCard.jsx` i `ui-funkcja` `resolveCardOverlaps()` (`cardsLayout.js`) — pliki bez zadnych uzyc po scaleniu kart
- scalono karty zakladki „Moje dane" w jeden panel: cztery sekcje w rzedzie (dane osobowe z podopiecznymi, saldo, wykorzystane dni, swieta w sobote) plus tabela „Moje urlopy" na pelnej szerokosci pod nimi
- przeniesiono `ui-sekcja` `HolidayAdminPanel` z zakladki „Moje dane" do zakladki „Dashboard" (obok panelu synchronizacji kalendarza, nadal tylko ADMIN)

### slownik
- usunieto `draggable-card`, `draggable-card-start`, `draggable-card-offset-ref`, `draggable-card-measure`, `cards-layout-gap`, `resolve-card-overlaps`
- usunieto `leaves-layout-get-endpoint`, `leaves-layout-put-endpoint`, `leaves-layout-entity-type`, `get-leaves-layout`, `save-leaves-layout`
- usunieto `my-leaves-default-layout`, `my-leaves-card-ids`, `my-leaves-layout-state`, `my-leaves-layout-dirty`, `my-leaves-cards-layer`, `my-leaves-layout-toolbar`, `my-leaves-save-layout-button`, `my-leaves-save-layout`, `my-leaves-reset-layout`, `my-leaves-measure-card`, `my-leaves-drag-end`, `fetch-my-layout`, `card-dependents`, `card-holidays-admin`
- dodano `card-overview` — karta „Przeglad urlopowy" skupiajaca wszystkie sekcje zakladki „Moje dane"
- dodano `my-leaves-section` — podpanel sekcji wewnatrz tej karty (wspolna wysokosc w rzedzie)
- dodano `card-personal-dependents-section` — podopieczni wewnatrz karty danych osobowych
- dodano `dashboard-holidays-admin-panel` — zarzadzanie dniami wolnymi w zakladce Dashboard

### wytyczne
- `back-endpoint` `/leaves/layout` — wiersze `UserEntityConfig` z `entityType = 'leaves-cards-layout'` zostaja w bazie jako martwe dane; nie czyscimy ich migracja, bo nic ich nie odczytuje

## 2026-08-31 — kalendarz Google: zatwierdzone urlopy w formacie AppSheet, pasek przerywany dniami wolnymi

### schema.prisma
- usunieto pole `googleEventId` w modelu `LeaveRequest` — jeden wniosek moze dac kilka zdarzen, wiec pojedyncze id przestalo wystarczac (kolumna w bazie zostaje martwa do czasu merge galezi `urlopy`, kod jej nie uzywa)
- dodano pole `googleEventIds` (`String[]`) w modelu `LeaveRequest` — lista zdarzen kalendarza zalozonych dla wniosku
- dodano pole `googleSyncedAt` w modelu `LeaveRequest` — kiedy stan kalendarza ostatnio zgodzil sie z wnioskiem
- dodano pole `googleSyncError` w modelu `LeaveRequest` — komunikat ostatniego nieudanego zapisu, podstawa do ponowienia
- dodano pole `calendarInitials` w modelu `User` — reczny skrot do tytulu wydarzenia, rozwiazuje kolizje trzyznakowych skrotow
- dodano pole `calendarLabel` w modelu `LeaveType` — tekst po mysliku w tytule wydarzenia, zmienialny bez deployu
- dodano model `LeaveCalendarSettings` (singleton) — przelacznik `syncEnabled` plus slad ostatniego przebiegu automatu (`lastRunAt`, `lastRunSummary`)
- migracje `20260831120000_leave_calendar_multi_event`, `20260831150000_leave_calendar_settings`

### architektura / API
- `GoogleCalendarService.upsertLeaveEvent` zastapiony przez `syncLeaveEvents` — przyjmuje liste segmentow i doprowadza kalendarz do stanu z wniosku: aktualizuje istniejace zdarzenia, zaklada brakujace, kasuje nadmiarowe po skroceniu urlopu
- kazde zdarzenie Ignite dostaje `extendedProperties.private.source=ignite` — rekoncyliacja rusza wylacznie wlasne wpisy, reczne (spotkania, wyjazdy, „HO") zostaja nietkniete
- tytul wydarzenia w formacie zastanym po AppSheet: `AWL-urlop` (pierwsza litera imienia + dwie nazwiska, bez kropki, etykieta rodzaju po mysliku)
- opis wydarzenia obciety do liczby dni i noty o zrodle — kalendarz oglada cala firma, komentarz z wniosku przy „L4" bywa informacja o zdrowiu
- zakres wniosku tniemy na ciagle bloki dni roboczych — weekend i swieto ustawowe przerywaja pasek, bo Google nie umie zrobic dziury w srodku zdarzenia calodniowego
- urlop wypoczynkowy z godzinami zapisuje sie jako zdarzenie godzinowe w `Europe/Warsaw` zamiast calodniowego
- dodano `POST /leave-requests/calendar/resync?months=N` (ADMIN) — reczna rekoncyliacja kalendarza z baza, zwraca liczbe sprawdzonych, poprawionych i bledow
- home office („HO" w kalendarzu, 19 wpisow w 2026) swiadomie poza modulem — brak rodzaju urlopu w bazie, wpisy robione recznie
- dodano `back-serwis` `LeaveCalendarCronService` — cogodzinna rekoncyliacja kalendarza z baza, uruchamiana wylacznie gdy administrator wlaczy przelacznik (domyslnie OFF, bo rownolegly zapis z AppSheet mnozylby wpisy)
- dodano `GET /leave-requests/calendar/sync` i `PATCH /leave-requests/calendar/sync` (ADMIN) — odczyt i przelaczanie synchronizacji; stan trzymany w bazie, wiec przezywa restart kontenera i nie wymaga deployu
- dodano `ui-panel` `CalendarSyncPanel` w zakladce Dashboard modulu Urlopy (tylko ADMIN) — przelacznik automatu, przycisk jednorazowego przebiegu i wynik ostatniej synchronizacji
- dodano `test/gcal-resync.js` — rekoncyliacja z linii polecen, domyslnie tylko raport, zapis po `--zapisz`

- dodano `apps/frontend/src/components/shared/leaves/polishHolidays.js` — lista dni ustawowo wolnych po stronie frontendu (swieta stale + ruchome liczone od Wielkanocy), blizniacza do `HolidaysService.holidayKeys()`
- bezpieczniki dat we wniosku urlopowym: data „od" pozniejsza niz „do" pociaga „do" za soba; dzien wolny w polu „od" przesuwa wybor na najblizszy dzien roboczy, a w polu „do" cofa na poprzedni. Zapis nie jest blokowany — pole robi sie czerwone z wyjasnieniem, co i dlaczego zostalo zmienione

### słownik
- usunieto `google-calendar-upsert-leave-event`, `google-calendar-find-event-id`, `google-calendar-delete-leave-event`, `leave-request-google-event-id`
- dodano `google-calendar-sync-leave-events`, `google-calendar-find-event-ids`, `google-calendar-delete-event`, `google-calendar-delete-leave-events`, `google-calendar-source-marker`, `google-calendar-event-segment`, `google-calendar-sync-result` — nowe API serwisu kalendarza
- dodano `leave-request-google-event-ids`, `leave-request-google-synced-at`, `leave-request-google-sync-error`, `user-calendar-initials`, `leave-type-calendar-label` — nowe pola schematu
- dodano `calendar-labels`, `calendar-initials-length`, `build-calendar-initials`, `calendar-event-summary`, `calendar-event-description`, `calendar-event-segments`, `resync-google-calendar` — logika tytulu i segmentow w module Urlopy
- dodano `easter-sunday`, `polish-holiday-keys` — swieta ruchome potrzebne do przerywania paska
- dodano `leave-requests-calendar-resync-endpoint`, `leave-requests-calendar-sync-status-endpoint`, `leave-requests-calendar-sync-toggle-endpoint` — endpointy rekoncyliacji i przelacznika
- dodano `calendar-resync-result`, `calendar-sync-status`, `set-calendar-sync`, `calendar-sync-is-enabled`, `reconcile-calendar` — obsluga przelacznika i wspolny rdzen rekoncyliacji
- dodano `leave-calendar-settings`, `leave-calendar-settings-id`, `leave-calendar-sync-enabled`, `leave-calendar-last-run-at`, `leave-calendar-last-run-summary`, `leave-calendar-updated-by-id` — model ustawien
- dodano `leave-calendar-cron-service`, `leave-calendar-cron-run`, `leave-calendar-cron-months-back` — cron rekoncyliacji
- dodano `calendar-sync-panel`, `format-sync-date`, `fetch-calendar-sync-status`, `toggle-calendar-sync`, `run-calendar-sync-now`, `calendar-sync-toggle-button`, `calendar-sync-run-now-button`, `dashboard-calendar-sync-panel`, `dashboard-is-admin` — panel administratora w Dashboardzie

### wytyczne
- `schema-pole` `LeaveRequest.googleEventIds` — kolejnosc id odpowiada kolejnosci segmentow; przy zmianie logiki ciecia zakresu zawsze przepuszczaj wniosek przez `syncLeaveEvents`, nie zapisuj id recznie
- `back-stala` `IGNITE_EVENT_SOURCE` — kazde zdarzenie zapisywane do wspolnego kalendarza musi niesc ten znacznik; bez niego rekoncyliacja uzna wpis za reczny i go nie ruszy, a duplikatu nie wykryje
- `back-funkcja` `calendarSegments` — dni wolne biora sie z `HolidaysService.holidayKeys()` (swieta stale + ruchome liczone od Wielkanocy), a nie z samego weekendu; ta sama lista ma obowiazywac wszedzie, gdzie liczymy dni robocze
- `back-funkcja` `calendarDescription` — do opisu wydarzenia nie wpisujemy komentarza wniosku ani danych osobowych; kalendarz jest wspolny dla calej firmy
- `back-serwis` `LeaveCalendarCronService` — automatu nie wlaczac, dopoki AppSheet pisze do tego samego kalendarza; przelacznik istnieje wlasnie po to, zeby wlaczenie bylo swiadoma decyzja po migracji
- `back-env` `GOOGLE_CALENDAR_ID` — dev MUSI wskazywac osobny kalendarz testowy; przy wspolnym adresie kazde zatwierdzenie wniosku na dev laduje w firmowym kalendarzu
- synchronizacja jest jednokierunkowa: baza jest zrodlem prawdy, skasowanie wydarzenia w Google nie unieważnia urlopu (automat je odtworzy) — urlop odwoluje sie decyzja w aplikacji
- dev na Dockerze: zmiana kodu = `docker restart erp-backend`, zmiana `.env` = `docker compose up -d backend` (restart nie doczytuje `env_file`)
- konto serwisowe kalendarza wymaga uprawnienia „Wprowadzaj zmiany i wyswietlaj wszystkie szczegoly wydarzen" — wariant „wydarzenia prywatne jako zajete" zaslania szczegoly i psuje rekoncyliacje

## 2026-08-31 — adnotacja o rozbieżnościach edytowalna, mail eksportu archiwizuje na OneDrive (v2026.08.31.942)

### architektura / API
- `ui-sekcja` `ExportChoiceModal` — wysyłka mailem po udanym `sendExport` wgrywa TEN SAM artefakt przez `uploadToOneDrive` (kategoria i podkatalog jak w przycisku OneDrive). Wcześniej trzy akcje modala były rozłączne i protokół wysłany mailem nie trafiał do teczki projektu.
- `ui-stan` `adnotacjaReczna` w `ProtokolOdbioruModal` — adnotacja o rozjeździe oferta↔odbiór jest polem edytowalnym; do dokumentu wchodzi wersja ręczna, a `Przywróć wyliczoną` wraca do treści liczonej z kwot.

### słownik
- dodano `export-choice-mail-na-od` — archiwizacja maila na OneDrive, ExportChoiceModal.jsx
- dodano `protokol-adnotacja-reczna` — ręcznie poprawiona treść adnotacji o rozbieżnościach
- dodano `protokol-adnotacja-finalna` — treść adnotacji faktycznie doklejana do uwag dokumentu

### wytyczne
- `ui-sekcja` `ExportChoiceModal` — każda ścieżka wysyłki dokumentu na zewnątrz musi archiwizować plik na OneDrive; błąd uploadu nie unieważnia wysłanego maila, tylko dopisuje ostrzeżenie.

## 2026-08-30 — role systemowe: brak wiersza DAK na produkcji

### architektura / API
- brak zmian w kodzie — na produkcji brakowalo wiersza `DAK` w tabeli `roles`, przez co zapis uzytkownika z ta rola konczyl sie bledem `Roles DAK not found` (users.service.ts, `update`). Naprawione uruchomieniem `apps/backend/prisma/ensure-roles.js` na kontenerze erp-backend

### wytyczne
- `back-skrypt` `ensure-roles.js` — po KAZDYM dodaniu nowej roli w kodzie odpalic na produkcji zaraz po deployu: `docker exec -w /usr/src/app erp-backend node prisma/ensure-roles.js`. Rola dodana tylko w UI i w logice uprawnien nie istnieje w tabeli `roles`, a `users.service.ts` rzuca `Roles <NAZWA> not found` przy zapisie uzytkownika. Skrypt jest idempotentny i dotyka WYLACZNIE slownika rol — nie jest seedem danych, wiec nie lamie zasady „zadnego seedowania na produkcji"

## 2026-08-30 — protokoly: lista wystawionych i bilans kwotowy w jednej karcie

### architektura / API
- bez zmian w API — zmiana ukladu modalu protokolu odbioru

### slownik
- zmieniono `protokol-lista-wystawionych` — karta obejmuje teraz zwijana liste protokolow ORAZ bilans pod nia
- zmieniono `protokol-pasek-podsumowania` — bilans stoi wewnatrz karty protokolow, pod lista; widoczny takze bez zadnego protokolu

## 2026-08-30 — protokoly: blokada pola kwoty odcieta od domkniecia pozycji

### architektura / API
- bez zmian w API — poprawka wylacznie w modalu protokolu odbioru

### slownik
- usunieto `protokol-domknij-reczne` — jeden przelacznik odpowiadal za dwie rozne rzeczy
- dodano `protokol-kwota-odblokowana` — pozycje z odblokowanym polem kwoty (sama blokada pola)
- dodano `protokol-domkniecie-czesciowe` — jawna zgoda na zamkniecie pozycji na nizszej kwocie
- dodano `protokol-pelna-kwota-of` — czy pozycja idzie za cala pozostala kwote
- dodano `protokol-kwota-zablokowana-of` — czy pole kwoty jest zablokowane
- dodano `protokol-domknij-nizsza` — przycisk „domknij mimo nizszej kwoty"

### wytyczne
- `ui-funkcja` `pelnyOf` — domkniecie pozycji wynika WYLACZNIE z pelnej kwoty albo z jawnego przelacznika `domknieciaCzesciowe`; stan blokady pola kwoty nie ma prawa go dotykac
- `ui-przycisk` `protokol-blokada-kwoty` — powrot do odbioru calej pozycji kasuje wpisana kwote i zgode na domkniecie czesciowe

## 2026-08-30 — onedrive: jedno konto MS dla calej aplikacji, samonaprawa folderu kategorii

### architektura / API
- operacje plikowe OneDrive (upload, lista, pobranie, przegladanie folderow, wiazanie folderu) korzystaja z JEDNEGO konta Microsoft — `getSharedToken()` zamiast tokenu zalogowanego uzytkownika. Konto wskazuje `MS_SHARED_ACCOUNT_EMAIL`, bez zmiennej brany jest najstarszy podpiety token
- `getValidToken(userId)` zostaje bez zmian dla MS To Do (prywatne zadania uzytkownika)
- `GET /onedrive/status` zwraca teraz stan konta WSPOLNEGO + pola `shared` i `own`
- id folderow `pliki_finansowe` / `dokumentacja_projektowa` sa weryfikowane przed uzyciem i odtwarzane po nazwie, gdy Graph zwroci 404 (folder skasowany albo odtworzony recznie na OneDrive dostaje nowe id)

### slownik
- dodano `onedrive-shared-token` — token wspolnego konta MS dla operacji plikowych, onedrive.service.ts
- dodano `onedrive-token-from-record` — odswiezanie access tokenu z wpisu w bazie, onedrive.service.ts
- dodano `onedrive-ensure-category-folder` — weryfikacja i odtworzenie folderu kategorii, onedrive.service.ts
- dodano `MS_SHARED_ACCOUNT_EMAIL` — adres uzytkownika ERP z podpietym kontem uslugowym OneDrive

### wytyczne
- `back-serwis` `OneDriveService` — kazda NOWA operacja na plikach zamowienia ma isc przez `getSharedToken()`; `getValidToken(userId)` tylko dla rzeczy prywatnych uzytkownika (MS To Do)
- `schema-pole` `ProcessNode.oneDriveFinanseId` — traktowac jako cache, nie zrodlo prawdy: id moze wskazywac na skasowany folder, zawsze przez `ensureCategoryFolder`

## 2026-08-30 — protokoly: podsumowanie kwotowe odbiorow i reset formularza po wystawieniu

### architektura / API
- bez zmian w API — podsumowanie liczone na froncie z danych, ktore modal juz pobiera (`/acceptance-protocols/:nodeId/status`)

### slownik
- dodano `protokol-reset-formularza` — czysci tresc protokolu przy kazdym otwarciu modalu, ProtokolOdbioruModal.jsx
- dodano `protokol-podsumowanie` — bilans plan / odebrane / pozostalo liczony po wierszach tabeli, ProtokolOdbioruModal.jsx
- dodano `protokol-pasek-podsumowania` — sekcja UI z bilansem i paskiem procentowym, ProtokolOdbioruModal.jsx

### wytyczne
- `ui-funkcja` `resetFormularza` — modal protokolu nie jest odmontowywany po zamknieciu (steruje nim `open`), wiec kazde nowe pole formularza trzeba dopisac takze tutaj, inaczej przeniesie sie do kolejnego protokolu
- `ui-funkcja` `podsumowanie` — `odebrane` przycinane do planu pozycji, zeby protokol na kwote wyzsza od oferty nie wypychal paska ponad 100%

## 2026-08-30 — protokół: strony Zamawiający/Wykonawca, NIP w kontaktach zamówienia

### schema.prisma
- dodano pole `clientProjectManagerNip` w modelu `OrderRequirements` — NIP firmy PM-a zamówienia; sam klucz, bo nazwę, adres i status VAT trzyma rejestr firm. Migracja `20260830140000_order_contacts_nip`. Dopisane do `cloneVersionData` w `versioning.service.ts`
- NIP dodatkowych kontaktów siedzi w JSON-ie `clientContacts` (pole `nip`) — bez zmiany schematu

### architektura / API
- protokół dostał dwa wiersze NAD „Dotyczy Umowy nr.": nagłówki „Zamawiający / Ordering party" i „Wykonawca / Contractor", pod nimi nazwa, adres i NIP każdej strony. Braki drukują się jako „—", żeby było widać, czego nie uzupełniono
- `ProtokolOdbioruDto` dostał `zamawiajacy` i `wykonawca` typu `ProtokolStronaDto` (nazwa, adres, nip)
- „Zamawiający" bierze się z singletona `Company` (nazwa + adres + `number`, które w panelu firmy jest opisane jako „np. NIP, REGON, kod"). „Wykonawca" składa się z trzech źródeł: etykieta właściciela gałęzi WBS („Firma — Imię Nazwisko") mówi kto, kontakt zamówienia dokłada NIP, rejestr firm pełną nazwę i adres
- sekcja „Kontakty" w zakładce „Informacje o zamówieniu" ma pole NIP przy PM-ie i przy każdym dodatkowym kontakcie; siatka z 4 na 5 kolumn. Wyjście z pola woła `POST /suppliers`, które dociąga dane z Białej listy VAT i zapisuje firmę w rejestrze (dedup po NIP). Nazwa firmy podstawia się tylko do PUSTEGO pola — ręcznie wpisany skrót zostaje
- `UsersService.findByRole` zwraca `company` (z poprzedniego wpisu) — bez zmian tutaj

- `stronaWykonawcy` dopasowuje firmę czterema drogami po kolei: kontakt zamówienia o tej samej firmie → wpis rejestru o zbieżnej NAZWIE → wpis rejestru, którego OSOBA KONTAKTOWA to właściciel gałęzi → jedyny kontakt z NIP-em. Trzeci krok jest niezbędny dla jednoosobowych działalności: Biała lista zna „Elnets" jako „TADEUSZ LIBUSZEWSKI", więc bez niego wypadały z protokołu
- dane firm zamówienia CMC uzupełnione skryptem `test/uzupelnij-firmy-cmc.ts` (9 firm w rejestrze + NIP-y w kontaktach wszystkich wersji zamówienia); skrypt pobiera NIP-y z Białej listy przy każdym uruchomieniu i robi backup kontaktów przed zapisem

### słownik
- dodano `order-requirements-pm-nip`, `acceptance-protocol-party-dto`, `acceptance-protocol-parties-rows`
- dodano `protokol-osoba-wlasciciela` — osoba z etykiety właściciela gałęzi
- dodano `protokol-norm-nip`, `protokol-firma-wlasciciela`, `protokol-strona-zamawiajacego`, `protokol-strona-wykonawcy`, `protokol-strony`, `protokol-strony-danych`
- dodano `requirements-nip-lookup`, `requirements-nip-status`

### wytyczne
- `schema-model` `Supplier` — JEDEN rejestr firm dla całej aplikacji: dostawcy materiałów i wykonawcy robót to ten sam wpis, kluczowany NIP-em (`nip` unique, dedup w `SuppliersService.create`). Nie zakładać drugiej tabeli na kontrahentów — przypisanie roli robi relacja, nie osobny byt. Nazwa modelu została historyczna
- `schema-pole` `OrderRequirements.clientProjectManagerNip` — w zamówieniu trzymamy WYŁĄCZNIE NIP. Nazwa i adres firmy mają jedno źródło (rejestr firm + Biała lista); kopiowanie ich do zamówienia rozjeżdża dane przy pierwszej zmianie w rejestrze

## 2026-08-30 — protokół odbioru: częściowy z wartości, blokada kwoty jako kłódka, DW do działu DAK

### architektura / API
- rodzaj odbioru idzie za KWOTĄ: kwota niższa od pozostałej oferty ustawia „częściowy" zawsze, także po ręcznym wyborze; przycisk „Całościowy" jest wtedy nieaktywny z wyjaśnieniem w dymku. Ręczny wybór zostaje tylko przy pełnej kwocie, a „Zakres nie odebrany" nie podlega wyliczeniu. Poprzednia reguła patrzyła na przełącznik domknięcia, więc pozycja zamknięta na 60% oferty przechodziła jako odbiór całościowy
- przycisk blokady kwoty mówi, CO ZROBI: przy pełnej (zablokowanej) kwocie „Odblokuj pozycję", po odblokowaniu pomarańczowy „Zablokuj pozycję". Zastąpił zielone „Zamknij pozycję", które przy zablokowanym polu czytało się jak polecenie zamknięcia czegoś już zamkniętego
- różnica wobec oferty pokazywana przy KAŻDEJ kwocie innej niż ofertowa (wcześniej tylko przy pozycji domkniętej), z dopiskiem, czy różnica wraca do puli („zostanie do odbioru"), czy przepada („pozycja domknięta"); nadwyżka nadal na czerwono
- `ExportChoiceModal` dostał pole „DW (do wiadomości)" (`defaultCc`) — `sendExport` i `POST /mail/send-export` obsługiwały `cc` od początku, brakowało tylko pola w formularzu
- protokół odbioru wypełnia DW adresem DAK-a Airtel Services (`GET /users/by-role/DAK` + filtr po `User.company`) — protokół jest podstawą faktury, więc księgowość dostaje kopię bez proszenia. Rolę DAK ma po jednej osobie w każdej spółce grupy, więc bez filtra kopia szła też do Airtel Systems; brak trafienia na spółkę → cały dział. Pole zostaje edytowalne
- `UsersService.findByRole` zwraca dodatkowo `company` — bez tego nie da się odróżnić DAK-ów poszczególnych spółek

### słownik
- dodano `protokol-pelna-wartosc` — czy protokół bierze 100% oferty ruszonych gałęzi
- dodano `protokol-blokada-kwoty`, `protokol-roznica-kwoty` — przycisk kłódki i różnica wobec oferty
- dodano `protokol-dak-odbiorcy`, `protokol-dak-spolka` — adresy DW z roli DAK zawężone do spółki
- dodano `users-find-by-role` — lista użytkowników roli wraz z firmą
- dodano `export-choice-cc` — stan pola DW w modalu eksportu

### wytyczne
- `ui-stan` `pelnaWartosc` — „całościowy" liczy się z KWOT, nie z przełącznika domknięcia. Domknięcie mówi „nie wracamy po resztę", a nie „odebrano całość oferty" — te dwa pojęcia nie mogą się skleić z powrotem
- `ui-przycisk` `protokol-blokada-kwoty` — etykieta przycisku nazywa AKCJĘ (co się stanie po kliknięciu), nie stan pola. Ta sama zasada obowiązuje przy każdym przełączniku blokującym input w tym modalu

## 2026-08-30 — protokół odbioru: tytuł „prac", opis zakresu zwinięty w tabelę wartości

### architektura / API
- tytuł dokumentu (PDF i DOCX) zmieniony z „PROTOKÓŁ ODBIORU ROBÓT" na „PROTOKÓŁ ODBIORU PRAC" — angielskie „COMMISIONING PROTOCOL" (z literówką ze wzoru Airtela) zostaje bez zmian
- usunięty punkt „Opis zakresu robót"; tabela wartości przeniesiona na jego miejsce (nad rodzaj i wynik odbioru) i przemianowana na „Opis i wartość odbieranego zakresu / Description and value of commissioned scope" — dwa punkty wymieniały te same pozycje, jeden z kwotami, drugi bez
- usunięte `ProtokolSekcjaDto` i pole `ProtokolOdbioruDto.sekcje` wraz z generatorem `opisZakresu()` (DOCX) i renderem `zakres` (HTML) — po zwinięciu punktu nie miały już odbiorcy. `buildSekcjeIWartosci` zwraca `{ wartosci, suma, branches }`
- z `PROTOKOL_CSS` wypadły martwe klasy `.pr-sec` i `.pr-poz`; `.pr-poz-row` (wcięcie liścia w tabeli wartości) zostaje
- nagłówek modala i tooltip przycisku w `RealizationTab` mówią teraz „Protokół odbioru prac"

### słownik
- usunięto `acceptance-protocol-section-dto` — `ProtokolSekcjaDto` nie istnieje
- usunięto `acceptance-protocol-scope-paragraphs` — `opisZakresu()` nie istnieje

### wytyczne
- `back-dto` `ProtokolOdbioruDto` — opis odbieranego zakresu żyje WYŁĄCZNIE w `wartosci` (gałąź → liście z kwotami). Nie wracać do osobnej listy nazw bez kwot: dwa źródła tych samych pozycji rozjeżdżały się przy każdej zmianie zaznaczenia

## 2026-08-30 — protokół odbioru: wynik odbioru, zakres nie odebrany, opis bez numeracji WBS

### architektura / API
- `ProtokolOdbioruDto.wynik` (`POZYTYWNY` | `NEGATYWNY`) — nowa oś, niezależna od `odbior`: rodzaj mówi ILE odebrano, wynik mówi JAK. Renderowany jako wiersz dwóch pól wyboru pod rodzajem odbioru, w PDF (`buildProtokolBodyHtml`) i w DOCX (`wierszWynikuOdbioru`)
- trzecia opcja rodzaju odbioru zmieniona z „Nie dotyczy / Not applicable" na „Zakres nie odebrany z uwagi na wady/braki / Scope not accepted due to defects/deficiencies" — wybór tej opcji w modalu przestawia wynik na negatywny (podpowiedź, nie blokada)
- blok wyboru (rodzaj + wynik odbioru) przeniesiony NAD tabelę „Wartość odbieranego zakresu" — kwotę czyta się po tym, czy roboty przeszły, a nie przed
- `ProtokolSekcjaDto.nr` usunięty — nagłówki w „Opisie zakresu robót" idą bez numeru gałęzi z drzewa WBS (odbierający widział „4." bez pozycji 1–3). Kolejność sekcji nadal bierze się z `branchIndex`
- tabela wyboru w PDF stoi na `<colgroup>` sześciu kolumn: rodzaj odbioru zajmuje po 2, wynik po 3, więc oba wiersze dzielą jedną siatkę `table-layout: fixed`

### słownik
- dodano `acceptance-protocol-result` — typ `OdbiorWynik`, `acceptance-protocol.dto.ts`
- dodano `acceptance-protocol-result-row` — wiersz wyniku odbioru w DOCX, `acceptance-protocols.service.ts`
- dodano `protokol-wynik-odbioru` — stan wyniku odbioru w modalu, `ProtokolOdbioruModal.jsx`

### wytyczne
- `back-dto` `ProtokolOdbioruDto.wynik` — wynik i rodzaj odbioru to DWA niezależne pola; odbiór częściowy bywa pozytywny, całościowy da się zakwestionować. Nie sklejać ich w jedno pole ani nie wyprowadzać jednego z drugiego w renderze
- `ui-stan` `wynik` — sprzężenie „nie odebrany → negatywny" żyje TYLKO w handlerze przycisku rodzaju odbioru. Ma być nadpisywalne ręcznie, więc nie przenosić go do `useEffect`

## 2026-08-30 — protokoły: wysyłka mailem z podpowiedzianym adresatem, tematem i treścią

### architektura / API
- `GET /users/profile` zwraca dodatkowo `firstName`, `lastName`, `phone` — pola dopisane do obiektu z `JwtStrategy.validate()`, więc jadą z każdym `req.user` bez dodatkowego zapytania do bazy (rekord użytkownika jest tam już wczytany). Potrzebne do podpisu pod mailem z protokołem
- `ExportChoiceModal` przyjmuje `defaultTo`, `defaultSubject`, `defaultMessage` — wartości startowe formularza maila, wszystkie pola zostają edytowalne. Reset formularza zawężony do momentu OTWARCIA modala: wcześniej zależał też od `title` i `defaultFilename`, a przy dynamicznej treści kasowałby tekst w trakcie pisania
- protokół odbioru podpowiada mail: adresat = osoby odpowiedzialne za odbierany zakres (te same, co nad kreską „Przedstawiciel Podwykonawcy"), temat = numer protokołu, treść = standardowa formuła z datą odbioru i podpisem zalogowanego użytkownika
- adres właściciela odzyskiwany po nazwisku z `GET /mail/recipients/:nodeId`, bo `WbsNode.owner` trzyma tylko ETYKIETĘ z listy wyboru („Firma — Imię Nazwisko"), nie klucz obcy. Brak trafienia zostawia puste pole „Do"
- pozycja odebrana w całości nie jest już wygaszana przezroczystością (`opacity-40`) — zostaje przekreślenie i czytelny tekst; kwota odebrana ponad ofertę wyświetla się na czerwono
- „Zamknij pozycję" blokuje pole kwoty odbioru — zamknięcie znaczy „tyle i koniec". Odbiór częściowy wymaga ODZNACZENIA przełącznika, dzięki czemu stan pola idzie dokładnie za tym, co pokazuje przycisk
- pola dat w protokole (data odbioru + trzy daty podpisu) to kalendarz `react-datepicker` zamiast wpisywania tekstu — ten sam wzorzec co w urlopach: portal `ignite-dp` z ciemnym motywem, format `dd.MM.yyyy`, wartość pusta dozwolona
- daty podpisu podwykonawcy i inspektora startują PUSTE (Airtel nadal z dzisiejszą). W chwili wystawiania dokumentu nikt nie wie, kiedy tamci podpiszą; PDF i DOCX drukują wtedy „Data —" do wypełnienia długopisem
- dodano `.ignite-dp-field` w `index.css` — wrapper `react-datepicker` jest inline-block, więc bez tego input z `w-full` nie rozciąga się na kolumnę; przy okazji ciemny krzyżyk czyszczenia daty

### słownik
- dodano `protokol-email-wlasciciela` — etykieta właściciela gałęzi → adres e-mail, `ProtokolOdbioruModal.jsx`
- dodano `protokol-profil`, `protokol-kontakty`, `protokol-pobierz-mail-dane` — dane do podpisu i książka adresowa zamówienia
- dodano `protokol-mail-domyslni`, `protokol-mail-tresc` — domyślny adresat i domyślna treść maila
- dodano `protokol-nadwyzka` — czy odebrano ponad ofertę (sygnał czerwonej czcionki)
- zmieniono `protokol-pozycja-domknieta` — opis „wyszarzona" → „przekreślona"

### wytyczne
- `ui-funkcja` `emailWlasciciela` — `WbsNode.owner` to etykieta, NIE relacja do `User`. Każde mapowanie właściciela na konto/adres musi iść przez dopasowanie nazwiska i znosić brak trafienia; nie zakładaj, że właściciel ma konto w systemie
- `ui-propsy` `defaultMessage` — podpowiedzi `ExportChoiceModal` wolno czytać TYLKO przy otwarciu modala. Wciągnięcie ich do zależności `useEffect` kasuje tekst pisany przez użytkownika przy każdym przeliczeniu zakresu
- `ui-input` `protokol-kwota-zablokowana` — blokada pola idzie za `pelnyOf(r)`, czyli za stanem przycisku, a NIE za samym ręcznym domknięciem. Rozjazd tych dwóch dawałby przycisk pokazujący „zamknięte" nad polem, które nadal da się edytować
- `ui-input` `protokol-pole-daty` — kalendarz w modalu MUSI iść przez `popperContainer` (portal), bo formularz protokołu scrolluje się w `overflow-y-auto`, który przyciąłby rozwinięty kalendarz. Portal siedzi w drzewie Reacta pod kartą modala, więc kliknięcie w dzień nie dochodzi do backdropu i nie zamyka modala

## 2026-08-30 — protokoły: pozycja z wyczerpaną kwotą zamknięta na froncie i na backendzie

### architektura / API
- `POST /acceptance-protocols/:nodeId/record` odrzuca (400) protokół zawierający pozycję domkniętą INNYM protokołem — komunikat wskazuje nazwę pozycji i numer protokołu, który ją zamknął. Ponowny eksport tego samego numeru nie blokuje sam siebie (filtr po `numer`, nie po id), więc upsert działa jak dotąd
- `zapiszOdbior` przepuszcza komunikat backendu zamiast samego kodu HTTP — bez tego odbierający widział „nie udało się zapisać odbioru (400)" bez powodu
- modal protokołu zamyka pozycję nie tylko flagą `pelny` z rejestru, ale też przy WYCZERPANIU kwoty (odebrano cały plan albo więcej). Wcześniej protokół wystawiony na pełną kwotę bez zaznaczenia „domyka" zostawiał pozycję z zerem do odbioru, a mimo to klikalną — dało się ją odebrać drugi raz na dowolną kwotę
- wyszarzona pozycja pokazuje kwotę ODEBRANĄ, nie plan; dymek podaje numery protokołów, kwotę wobec planu i drogę odwrotu (wycofanie protokołu)
- przełącznik „domyka" przy pozycji nazywa się teraz „Zamknij pozycję"
- testy: `test/test-protokol-blokada.mjs` — 12 przypadków na `pozycjaZamknieta`; `test/test-protokol-rejestr.ts` rozszerzony o 4 przypadki blokady. Wszystkie przechodzą

### słownik
- dodano `protokol-zamknieta` — reguła „pozycja niedostępna do odbioru" wyjęta z komponentu do czystej funkcji w utilu

### wytyczne
- `ui-funkcja` `pozycjaZamknieta` — o dostępności pozycji do odbioru decyduje TA JEDNA funkcja. Warunek `odebrane > 0` jest w niej konieczny: bez niego pozycja bez wyceny (plan = 0) byłaby zamknięta, zanim ktokolwiek ją tknął
- blokada odbioru musi stać po OBU stronach — front wyszarza, backend odrzuca. Sam front nie wystarczy: rejestr bywa nieodświeżony, a drugi odbiór tej samej roboty to podwójna płatność

## 2026-08-30 — protokoły: lista wystawionych z wycofaniem, zapis wprost na OneDrive, adnotacja o różnicy dla każdej pozycji

### architektura / API
- modal protokołu pokazuje listę wystawionych protokołów zamówienia (numer, data, rodzaj odbioru, suma, autor) z przyciskiem „cofnij"; wycofanie kasuje WPIS w rejestrze i zwraca pozycje do puli, plik na OneDrive zostaje
- przycisk „Generuj na OneDrive" wgrywa dokument wprost do podpiętego folderu zamówienia: `pliki_finansowe/<nazwa gałęzi>` — i dopiero ten zapis odkłada odbiór w rejestrze. Pobranie i mail zostały pod osobnym przyciskiem „Pobierz / wyślij"
- dodano `uploadToOneDrive` w `apps/frontend/src/utils/exportMail.js` — jedna implementacja uploadu dla modala eksportu i dla przycisku w protokole
- adnotacja o różnicy wobec oferty liczy się dla KAŻDEJ odbieranej pozycji, nie tylko domykanej — akceptacja bywa wystawiona na inną kwotę już w pierwszym protokole. Pozycja pozostawiona otwarta dostaje dopisek o reszcie do odbioru, żeby „odbiór niższy od oferty" nie czytało się jak rabat
- logika różnic wyjęta z komponentu do czystych funkcji `budujRoznice` / `tekstRoznic`; test `test/test-protokol-roznice.mjs` — 8 przypadków, wszystkie przechodzą

### słownik
- dodano `protokol-fetch-protokoly`, `protokol-usun`, `protokol-buduj-roznice`, `upload-to-onedrive`
- dodano `protokol-wystawione`, `protokol-odswiez-rejestr`, `protokol-na-onedrive`, `protokol-wycofaj`, `protokol-lista-wystawionych`, `protokol-wycofaj-potwierdzenie`

### wytyczne
- `ui-funkcja` `protokol-buduj-roznice` — tekst dokumentu składany w czystych funkcjach w utilu, nie w `useMemo` komponentu. Inaczej nie da się go pokryć testem, a przy pierwszym zgłoszeniu „nie pojawiła się adnotacja" zostaje zgadywanie
- testy porównujące sformatowane kwoty budują oczekiwania TYM SAMYM formaterem co kod — `toLocaleString('pl-PL')` daje różny separator tysięcy w Node bez pełnego ICU i w przeglądarce, więc kwota wpisana w test na sztywno wywraca go na jednym z tych środowisk

## 2026-08-30 — rejestr odbiorów: co odebrane zostaje odebrane, kwoty edytowalne, adnotacja o różnicy wobec oferty

### schema.prisma
- dodano model `AcceptanceProtocolRecord` — nagłówek wystawionego protokołu odbioru (`numer`, `data`, `odbior`, `authorId`). Klucz unikalny `nodeId + numer`: powtórny eksport tego samego protokołu nadpisuje wpis zamiast podwajać odebrane kwoty
- dodano model `AcceptanceProtocolItem` — ile z danego liścia odebrano danym protokołem (`wbsRootId`, `nazwa`, `wartosc`, `pelny`)
- dodano relację `ProcessNode.acceptanceProtocols` oraz `User.acceptanceProtocols`
- migracja `20260830120000_acceptance_protocols`

### architektura / API
- dodano `GET /acceptance-protocols/:nodeId/status` — ile z której pozycji już odebrano i czy jest domknięta
- dodano `POST /acceptance-protocols/:nodeId/record` — zapis wystawionego protokołu (upsert po `nodeId + numer`, pozycje wymieniane w transakcji)
- dodano `GET /acceptance-protocols/:nodeId` oraz `DELETE /acceptance-protocols/:nodeId/:protocolId` — lista i wycofanie zapisu
- `ExportChoiceModal` dostał props `onExported` — wołany po UDANYM eksporcie (pobranie, mail, OneDrive). Protokół zapisuje odbiór dopiero wtedy; podgląd niczego nie odbiera
- modal protokołu pokazuje pozycje odebrane w całości jako wyszarzone i nieklikalne, a przy pozycjach ruszonych — ile już odebrano i ile zostaje
- kwota odbioru pozycji jest edytowalna i NIE jest ograniczona wyceną: akceptacja bywa wystawiona na inną kwotę niż oferta
- doszedł przełącznik „domyka" per pozycja — odbiór za kwotę niższą od oferty (rabat, korekta zakresu) też zamyka pozycję
- różnica między ofertą a kwotą odbioru domykanych pozycji dokleja się automatycznie do „Innych uwag" protokołu, z rozbiciem na pozycje i sumą
- test `test/test-protokol-rejestr.ts` — 8 przypadków na bazie dev (zapis, brak podwojenia przy powtórnym eksporcie, domknięcie w drugim protokole, wycofanie, kaskada)

### słownik
- dodano `acceptance-protocol-record`, `acceptance-protocol-item` wraz z polami i relacjami — modele rejestru odbiorów
- dodano `acceptance-protocols-status`, `acceptance-protocols-record`, `acceptance-protocols-list`, `acceptance-protocols-remove` i odpowiadające im endpointy
- dodano `acceptance-protocol-record-dto`, `acceptance-protocol-status-dto`
- dodano `protokol-fetch-status`, `protokol-wbs-root-of`, `protokol-pozostalo`, `protokol-zapisz-odbior` — warstwa klienta rejestru
- dodano `protokol-status-odbioru`, `protokol-kwoty-reczne`, `protokol-domknij-reczne`, `protokol-pozostalo-of`, `protokol-domkniete-of`, `protokol-kwota-odbioru`, `protokol-pelny-of`, `protokol-adnotacja-roznic`, `protokol-tekst-roznic`, `protokol-po-eksporcie`, `protokol-pozycja-domknieta`, `protokol-kwota-input` — stan i obsługa w modalu

### wytyczne
- `schema-model` `AcceptanceProtocolRecord`, `AcceptanceProtocolItem` — kluczowane po `nodeId` i `wbsRootId`, ŚWIADOMIE bez `versionId`, tak samo jak `LeafActual`. Odbiór zdarzył się w świecie rzeczywistym i NIE wchodzi do `cloneVersionData` w `versioning.service.ts`
- `schema-pole` `AcceptanceProtocolItem.pelny` — domknięcie pozycji trzymamy jako FLAGĘ, nie wyliczamy z porównania kwot. Późniejsza zmiana wyceny nie ma prawa otworzyć podpisanego odbioru
- `schema-pole` `AcceptanceProtocolItem.nazwa` — nazwa liścia kopiowana w chwili odbioru. Protokół jest dokumentem, nie widokiem: zmiana nazwy pozycji w WBS nie może zmienić treści podpisanego papieru
- `ui-funkcja` `protokol-po-eksporcie` — odbiór zapisujemy dopiero gdy dokument OPUŚCI aplikację. Zapis przy generowaniu podglądu zamykałby pozycje przy każdym zerknięciu na wydruk
- `ui-funkcja` `protokol-kwota-odbioru` — kwoty odbioru NIE obcinamy do wyceny. Dokument ma nieść to, na co opiewa akceptacja; rozjazd z ofertą opisuje adnotacja w uwagach, a nie ciche zaokrąglenie w dół

## 2026-08-30 — protokoły odbioru robót z liści WBS (PDF + DOCX, archiwum na OneDrive)

### architektura / API
- dodano moduł `apps/backend/src/acceptance-protocols/` — generator protokołu odbioru robót odwzorowujący formularz Airtela („protokół odbioru technicznego.docx"). Dokument budowany OD ZERA biblioteką `docx` (już w zależnościach), a nie podmianą tekstu w szablonie: opis zakresu i tabela wartości mają zmienną liczbę wierszy
- dodano `POST /acceptance-protocols/docx` — protokół jako plik Word z danych przysłanych przez front
- dodano `apps/frontend/src/utils/protokolOdbioruExport.js` — ten sam kształt danych renderowany do HTML, a dalej do PDF przez istniejące `buildPdfDocument` + `POST /pdf/render`. Jedno źródło treści dla obu wyjść
- dodano `apps/frontend/src/components/shared/wbs/ProtokolOdbioruModal.jsx` — wybór odbieranych liści WBS + pytania o pola, których w bazie nie ma (umowa, wady, uwagi, załączniki, przedstawiciele)
- zmieniono sygnaturę `OneDriveService.uploadFile` — doszedł opcjonalny `subfolder`; `POST /onedrive/upload` przyjmuje go w `FormData`. Protokoły lądują w `pliki_finansowe/<nazwa gałęzi WBS>`
- zmieniono `ExportChoiceModal` — nowy props `oneDriveSubfolder`, komunikat po zapisie pokazuje pełną ścieżkę
- dodano `apps/frontend/public/podpis-airtel.png` — skan podpisu przedstawiciela Airtel wyjęty z oryginalnego formularza, wklejany do protokołu automatycznie
- protokół NIE jest zapisywany w bazie — jedynym archiwum jest OneDrive
- zmieniono `PDF_BASE_CSS` i `buildPdfDocument` w `apps/frontend/src/utils/wbsPdfExport.js` — `@page` ma teraz margines 0, a marginesy dokumentu daje padding wewnątrz `.outer-wrap` (nagłówek tabeli powtarza się na każdej stronie, doszła pusta stopka-rozpórka). Chrome drukuje własny nagłówek i stopkę w marginesie strony, więc przy zerowym marginesie znika z wydruku adres `blob:http://localhost:5174/…`, data i numer strony. Dotyczy WSZYSTKICH eksportów PDF aplikacji
- rozbito wspólną datę podpisu na trzy osobne — `dataPodpisuAirtel`, `dataPodpisuPodwykonawcy`, `dataPodpisuInspektora`. Data stoi nad podpisem w kolumnie danego uczestnika, bo każda strona podpisuje protokół kiedy indziej
- skan podpisu skaluje się do 80% szerokości kolumny, wysokość z proporcji pliku. Miejsce na podpis rezerwuje KAŻDA kolumna, także ta bez skanu — inaczej kreski pod podpisami stoją na różnych wysokościach
- przycięto `apps/frontend/public/podpis-airtel.png` do zawartości (361x137 → 318x58) — plik miał wokół podpisu przezroczysty margines, przez co obrazek rozciągnięty na 80% kolumny dawał widoczny podpis na jakieś 60%
- tabela „Wartość odbieranego zakresu" schodzi do POZIOMU LIŚCIA — gałąź niesie podsumę, pod nią stoją pojedyncze pozycje z własnymi kwotami. `ProtokolWartoscDto` dostało pole `pozycje`
- przedstawiciel podwykonawcy podpowiada się właścicielem odbieranej gałęzi (`WbsNode.owner` węzła top-level, z zejściem do właścicieli zaznaczonych liści gdy gałąź go nie ma). Podpowiedź wchodzi TYLKO gdy wartość jest niepusta i ustępuje ręcznej edycji
- usunięto `przedstawicielPodwykonawcy` z pól pamiętanych w przeglądarce — ma teraz własne źródło danych, a zapamiętane nazwisko wjeżdżałoby do protokołu dotyczącego innej gałęzi i innego wykonawcy
- domyślny numer protokołu to `Protokół odbioru prac -{zamówienie} {gałąź} {data}` — myślnik przykleja się do nazwy zamówienia bez spacji, tak jak w numerach wpisywanych dotąd ręcznie

### słownik
- dodano `acceptance-protocols-module`, `acceptance-protocols-controller`, `acceptance-protocols-service`, `acceptance-protocols-build-docx` — moduł generatora DOCX
- dodano `acceptance-protocol-dto`, `acceptance-protocol-section-dto`, `acceptance-protocol-value-row-dto`, `acceptance-protocol-payload-dto` — kształt protokołu wspólny dla PDF i DOCX
- dodano `acceptance-protocol-data-url-to-buffer`, `acceptance-protocol-label-row`, `acceptance-protocol-value-table`, `acceptance-protocol-scope-paragraphs`, `acceptance-protocol-signature` — klocki dokumentu Word
- dodano `onedrive-ensure-subfolder` — podkatalog „załóż albo znajdź"
- dodano `protokol-odbioru-export`, `protokol-fmt-zl`, `protokol-fmt-data`, `protokol-branch-of`, `protokol-branch-index`, `protokol-build-sections`, `protokol-default-number`, `protokol-filename`, `protokol-fetch-data-url`, `protokol-css`, `protokol-lab-cell`, `protokol-build-body-html`, `protokol-build-html`, `protokol-open-pdf`, `protokol-make-docx`, `protokol-make-pdf` — warstwa danych i renderowania po stronie frontu
- dodano `protokol-odbioru-modal`, `protokol-remembered-fields`, `protokol-modal-groups`, `protokol-auto-number`, `protokol-auto-odbior`, `realization-protokol-open` — modal i jego podpięcie w zakładce Realizacja
- dodano `acceptance-protocol-signature-dates`, `protokol-signature-fields` — osobna data podpisu dla każdego uczestnika
- dodano `acceptance-protocol-signature-size` — wyliczany rozmiar skanu podpisu w DOCX
- dodano `protokol-branch-owners`, `protokol-selected-owners`, `protokol-auto-podwykonawca` — właściciel gałęzi jako przedstawiciel podwykonawcy

### wytyczne
- `ui-funkcja` `buildSekcjeIWartosci` — wartość w protokole liczy się funkcją `planValueOf` przekazaną z `RealizationTab`, nie własną formułą. Kwota w dokumencie ma się zgadzać co do grosza z kolumną planu, na którą patrzy odbierający
- `ui-funkcja` `protokol-branch-index` — numer sekcji opisu zakresu to pozycja gałęzi w CAŁYM zamówieniu, nie kolejność w protokole. Wzór z 21.08.2026 zaczyna się od „2.", bo gałąź pierwsza nie była odbierana; renumerowanie od 1 zrywa zgodność z ofertą
- `ui-stala` `PROTOKOL_CSS` — wnętrze template literal: backticki w komentarzach CSS kończą string i wywracają build. Zdarzyło się raz, kosztowało jeden przebieg
- `back-funkcja` `ensureSubfolder` — do powtarzalnego zakładania katalogu NIE używać `createFolder`: ma `conflictBehavior: 'rename'`, więc drugi zapis tworzy „nazwa 1", trzeci „nazwa 2"
- literówka „COMMISIONING PROTOCOL" jest w oryginalnym formularzu Airtela i zostaje w generowanych dokumentach — zgodność znakowa z wzorem obiegającym u klienta jest ważniejsza niż poprawność pisowni
- `ui-funkcja` `protokol-fetch-data-url` — obrazki wklejane do dokumentów trzymamy PRZYCIĘTE do zawartości. Przezroczysty margines w pliku nie jest widoczny w podglądzie assetu, a w dokumencie zjada procenty szerokości i wygląda jak błąd skalowania
- `ui-stala` `PDF_BASE_CSS` — marginesy strony trzymamy w paddingu `.outer-wrap`, NIE w `@page { margin }`. Niezerowy margines `@page` to dla Chrome miejsce na jego własny nagłówek i stopkę, przez co w każdym wydruku z przeglądarki lądował adres `blob:…`

## 2026-08-29 — eksport/import użytkowników w Excelu, autoodświeżanie co 5 min, luźniejszy język komunikatów

### architektura / API
- dodano `apps/frontend/src/utils/usersExcel.js` — jedna definicja struktury arkusza użytkowników, wspólna dla eksportu i importu (kolumny, mapa nagłówek→pole, role)
- dodano `apps/frontend/src/components/shared/ImportUsersModal.jsx` — import XLSX dwoma przebiegami: najpierw zakładanie kont (`POST /users`), potem uzupełnianie danych i powiązań (`PATCH /users/:id`), żeby przełożony mógł powstać w tym samym pliku co jego podwładni
- dodano `apps/frontend/src/hooks/useAutoRefresh.js` — cykliczne odświeżanie danych co 5 min, wstrzymane gdy karta przeglądarki jest schowana
- podpięto autoodświeżanie w `UsersPage`, `LeavesPage`, `LeaveRequestsTab`, `LeavesDashboardTab`, `MyLeavesTab`
- przepisano komunikaty modułu Urlopy (backend + frontend) na drugą osobę i mniej formalny ton

### słownik
- dodano `normalize-key`, `user-role-labels`, `user-role-by-label`, `users-excel-columns`, `users-excel-header-map`, `export-users-workbook`, `parse-users-workbook` — struktura i obsługa arkusza użytkowników
- dodano `import-users-modal`, `run-users-import` — modal importu i sam przebieg wczytywania
- dodano `users-import-modal-state`, `handle-export-users`, `users-export-button`, `users-import-button`, `users-auto-refresh` — obsługa w `UsersPage`
- dodano `use-auto-refresh`, `auto-refresh-interval-ms` — hook autoodświeżania
- dodano `leaves-meta-auto-refresh`, `leaves-auto-refresh-note`, `leave-requests-auto-refresh`, `leaves-dashboard-auto-refresh`, `my-leaves-auto-refresh` — autoodświeżanie w module Urlopy

### wytyczne
- komunikaty dla użytkownika piszemy w drugiej osobie i mniej formalnie („Masz już wniosek na ten termin — sprawdź kalendarz” zamiast „Termin nachodzi na inny wniosek tego pracownika”). Dotyczy walidacji backendu, blokad w formularzach i tekstów pomocniczych w UI
- `use-auto-refresh` — odświeżanie w tle nigdy nie ustawia spinnera ani nie kasuje danych z ekranu przy błędzie sieci; każda funkcja pobierająca dane dostaje parametr `silent`
- struktura arkusza użytkowników żyje wyłącznie w `users-excel-columns` — eksport i import czytają ją z jednego miejsca, nowa kolumna = jeden wpis w tej tablicy

## 2026-08-29 — feat(urlopy): wycofanie zatwierdzonego urlopu za zgodą przełożonego (v2026.08.29.917)

### schema.prisma

- dodano wartość `WITHDRAWN` w enumie `LeaveRequestStatus` — urlop był zatwierdzony, ale pracownik poprosił o wycofanie, a przełożony to potwierdził
- dodano pole `withdrawalRequestedAt` w modelu `LeaveRequest` — kiedy pracownik poprosił o wycofanie. Wniosek zostaje `APPROVED` do czasu decyzji, więc sama prośba niczego nie cofa
- dodano pola `withdrawalDecidedAt`, `withdrawalDecidedById` w modelu `LeaveRequest` oraz relację `withdrawalDecidedBy` / `User.leaveWithdrawalDecisions` — kto i kiedy rozpatrzył prośbę (osobno od `decidedById`, który zatwierdzał sam urlop)
- migracja `20260829180000_leave_request_withdrawal`

### architektura / API

- **`POST /leave-requests/:id/withdrawal` — pracownik prosi o wycofanie WŁASNEGO zatwierdzonego urlopu.** Zatwierdzonego urlopu nie da się usunąć samodzielnie (`remove` przepuszcza właściciela tylko przy `PENDING`), a to była jedyna droga. Prośba wymaga statusu `APPROVED`, nie może się dublować i przyjmuje opcjonalny powód, który trafia do maila
- **`PATCH /leave-requests/:id/withdrawal` — decyzja przełożonego albo administratora.** Potwierdzenie idzie tą samą ścieżką co wyjście ze stanu APPROVED: `revertDeductions` oddaje dni do puli, wpis `Leave` znika, `syncGoogleCalendar` kasuje zdarzenie i zeruje `googleEventId`, status przechodzi na `WITHDRAWN`. Odmowa czyści samą prośbę — urlop zostaje w mocy
- **`GET /leave-requests/withdrawal-link?token=` — przycisk z maila, bez logowania.** Osobny endpoint i osobny rodzaj tokenu (`kind: 'WITHDRAWAL'` w `LeaveDecisionTokenPayload`), żeby podpis decyzji o wniosku nie działał na wycofanie i odwrotnie. Brak pola `kind` = stary token = `DECISION`, więc linki wysłane wcześniej nadal działają. Te same trzy warunki tożsamości co przy decyzji o wniosku
- **`sendLeaveWithdrawalRequest` — mail do przełożonego z przyciskiem „Wycofaj zatwierdzony urlop {imię nazwisko}".** Nazwisko jest w treści przycisku, bo przełożony może mieć w skrzynce kilka takich próśb naraz. Drugi przycisk „Zostaw urlop" zamyka ścieżkę odmowy bez wchodzenia do aplikacji
- **`sendLeaveWithdrawalDecision`** — mail do pracownika z rozstrzygnięciem i skutkami (dni wróciły do puli / urlop zostaje w mocy)
- **`renderResult` w `LeaveDecisionLinkController`** — wspólna strona wyniku dla obu przycisków z maila, wcześniej wklejona w `decisionLink`

### słownik

- dodano `requestWithdrawal`, `decideWithdrawal`, `withdrawByToken`, `notifySupervisorWithdrawalRequest`, `notifyApplicantWithdrawalDecision`, `leave-withdrawal-link-urls`, `RequestWithdrawalDto`, `DecideWithdrawalDto`, `sendLeaveWithdrawalRequest`, `sendLeaveWithdrawalDecision`, trzy endpointy wycofania, `renderResult`, cztery pola i dwie relacje wycofania w schemacie, `LeaveWithdrawalModal`, `isWithdrawalPending`, `requestWithdrawal (front)`, `decideWithdrawal (front)`

### wytyczne

- `schema-pole` `LeaveRequest.withdrawalRequestedAt` — wypełnione pole przy statusie `APPROVED` znaczy „prośba czeka na decyzję", a NIE „urlop wycofany". Każde miejsce liczące nieobecności ma traktować taki urlop jak obowiązujący, dopóki status nie zmieni się na `WITHDRAWN`
- `back-typ` `LeaveDecisionTokenPayload.kind` — dokładając nowy rodzaj przycisku w mailu dodaj nową wartość `kind` i osobny endpoint. Nigdy nie rozszerzaj znaczenia istniejącego tokenu: jeden podpis ma otwierać dokładnie jedną akcję

## 2026-08-29 — feat(urlopy): mail do przełożonego po wycofaniu wniosku przez pracownika (v2026.08.29.916)

### architektura / API

- **`MailService.sendLeaveRequestWithdrawn` — wycofanie wniosku zawiadamia przełożonego.** Domknięcie drugiej strony powiadomień przy `DELETE /leave-requests/:id`: gdy kasuje właściciel, mail idzie do przełożonego; gdy kasuje ktoś inny, do wnioskodawcy (`notifyApplicantDeleted`). Przełożony ma w skrzynce wiadomość z przyciskami Zatwierdź / Odrzuć, które po usunięciu wniosku prowadzą do „Wniosek nie istnieje" — mail mówi wprost, że te linki są już martwe i że nie trzeba nic robić
- **`notifySupervisorWithdrawn`** — adresatem jest `User.supervisorId` wnioskodawcy, ten sam, który dostał pierwotne powiadomienie o złożeniu wniosku. Brak przełożonego albo adresu = brak maila. Przy wniosku wcześniej zatwierdzonym treść dodaje, że dni wróciły do puli, a wpis zniknął z kalendarza

### słownik

- dodano `MailService.sendLeaveRequestWithdrawn`, `notifySupervisorWithdrawn`

## 2026-08-29 — feat(urlopy): mail do wnioskodawcy po usunięciu jego wniosku (v2026.08.29.915)

### architektura / API

- **`MailService.sendLeaveRequestDeleted` — usunięcie wniosku zawiadamia wnioskodawcę.** Dotąd `DELETE /leave-requests/:id` kasowało wniosek bez śladu: pracownik widział tylko, że pozycja zniknęła z listy, bez informacji kto i dlaczego. Usunięcie nie jest odrzuceniem — nie zostawia statusu ani uzasadnienia, więc mail jest jedynym nośnikiem tej informacji
- **`notifyApplicantDeleted` — powiadomienie tylko gdy kasuje ktoś inny.** Właściciel kasujący własny wniosek maila nie dostaje. Przy wniosku wcześniej zatwierdzonym mail mówi wprost, że dni wróciły do puli i wpis zniknął z kalendarza urlopowego. Best-effort — błąd SMTP nie cofa usunięcia
- **`remove` czyta wniosek z `REQUEST_INCLUDE`** — potrzebne dane pracownika i rodzaju urlopu do treści maila

### słownik

- dodano `MailService.sendLeaveRequestDeleted`, `notifyApplicantDeleted`

## 2026-08-29 — fix(urlopy): pula dni liczona ze stażu, gdy administrator jej nie wpisał (v2026.08.29.914)

### architektura / API

- **`defaultEntitlementDays` — wymiar urlopu ze stażu jako źródło puli.** Dotąd saldo brało się wyłącznie z wierszy `leave_balances`, zakładanych ręcznie przez `PUT /leave-balances/entitlement`. Pracownik bez wpisanej puli miał `0 − 0 = 0` dni i nie mógł złożyć ŻADNEGO wniosku konsumującego saldo — mimo widocznego w UsersPage wyliczonego wymiaru. Na dev dotyczyło to 6 z 8 aktywnych pracowników modułu. Brak wiersza na rok bieżący oznacza teraz wymiar z `calculateLeaveEntitlement` (20/26 dni wg art. 154 §1 KP)
- **`fallbackYear` — podstawianie tylko za rok bieżący.** Lata wsteczne w oknie salda zostają zerami: pula z lat minionych to urlop zaległy, którego wysokość zna kadra i wpisuje ręcznie. Automatyczne wypełnienie całego okna dałoby 5 × 26 dni z powietrza
- **Ręcznie wpisana pula ma pierwszeństwo.** Fallback działa wyłącznie przy BRAKU wiersza, więc jawnie ustawione przez administratora 0 zostaje zerem
- **`applyDeductions` używa tego samego fallbacku i materializuje wiersz.** Bez tego wniosek przechodziłby walidację na puli wyliczonej, a przy odejmowaniu dni trafiał na zero i zatwierdzenie by się wywracało. Zakładany wiersz dostaje wyliczony wymiar, więc saldo przestaje być liczone w locie i zgadza się z tym, co pracownik widział składając wniosek

### słownik

- dodano `defaultEntitlementDays`, `fallbackYear`

### wytyczne

- `back-funkcja` `defaultEntitlementDays` — powiązanie „na żądanie" z pulą wypoczynkowego jest zamierzone i zgodne z art. 167² KP: 4 dni na żądanie mieszczą się W RAMACH wymiaru urlopu wypoczynkowego. `NA_ZADANIE.consumesBalance` ma zostać `true`, a `maxDaysPerYear = 4` pilnuje limitu rocznego. Odłączenie dałoby pracownikowi 26 + 4 dni
- `schema-pole` `LeaveBalance.entitlementDays` — wiersz w bazie jest nadrzędny wobec wyliczenia ze stażu. Dokładając nowe miejsce czytające pulę, użyj tego samego fallbacku co `getBalance`, inaczej walidacja i odejmowanie dni rozjadą się między sobą

## 2026-08-29 — feat(urlopy): blokada nachodzących nieobecności tego samego pracownika (v2026.08.29.912)

### architektura / API

- **`assertNoSelfOverlap` — ten sam pracownik nie może mieć dwóch nieobecności w tym samym terminie.** Walidacja wpięta w `create` (nowy wniosek) i w `update` (zmiana dat, z pominięciem edytowanego wniosku przez `excludeRequestId`). Kolizję liczymy względem wniosków `PENDING` i `APPROVED` — nierozpatrzony też blokuje, inaczej dwa równoległe wnioski przeszłyby oba. Komunikat błędu nazywa kolidujący wniosek: rodzaj, okres i stan
- **`findOverlappingAbsences` przestaje wycinać wnioskodawcę.** Dotąd warunek `userId: { not: request.userId }` ukrywał najważniejszą możliwą kolizję — własną nieobecność pracownika w tym samym terminie. Nowe wnioski blokuje już walidacja, ale dane sprzed blokady takie pary mają, więc przełożony musi je widzieć. Wiersze własne idą na górę listy, są wyróżnione w mailu i poprzedzone ostrzeżeniem „dwa urlopy tej samej osoby naraz"

### słownik

- dodano `assertNoSelfOverlap`
- zmieniono `OverlappingAbsence` — doszło pole `self` (nieobecność samego wnioskodawcy)

### wytyczne

- `back-funkcja` `assertNoSelfOverlap` — blokada obejmuje WSZYSTKIE rodzaje nieobecności, także L4 nachodzące na zaplanowany urlop wypoczynkowy. Jeśli taki przypadek ma być dopuszczalny (choroba przerywa urlop), wyjątek trzeba dodać jawnie po kodzie rodzaju, a nie przez rozluźnienie warunku dat

## 2026-08-29 — feat(urlopy): kolizje urlopów w mailu, powiadomienie managerów i zapis do kalendarza Google (v2026.08.29.911)

### schema.prisma

- dodano pole `googleEventId` w modelu `LeaveRequest` — id zdarzenia założonego we wspólnym kalendarzu Google przy zatwierdzeniu wniosku. NULL = brak zdarzenia (wniosek nierozpatrzony, integracja wyłączona albo API odmówiło)
- migracja `20260829120000_leave_request_google_event_id`

### architektura / API

- **Sekcja „W tym samym czasie nieobecni" w mailu z wnioskiem.** `findOverlappingAbsences` zbiera wnioski `PENDING` i `APPROVED`, których okres nachodzi na wnioskowany (`dateStart <= cudzy koniec AND dateEnd >= cudzy start`), z wyłączeniem samego wnioskodawcy i bieżącego wniosku. Zakres to wszystkie firmy z `LEAVE_COMPANIES` — Airtel Systems, Airtel Services i LinkedTeam działają jako jedna grupa obsadowa. Pusta lista też się renderuje: „w tym terminie nikt inny nie jest nieobecny" jest informacją tak samo istotną jak kolizja
- **`MailService.sendLeaveApprovalBroadcast` — zatwierdzony urlop osoby kluczowej idzie do managerów.** Wyzwalają go role z `LEAVE_BROADCAST_TRIGGER_ROLES` (LOGISTYK, MANAGER); odbiorcami są aktywni użytkownicy z rolą z `LEAVE_MANAGER_ROLES` w firmach `LEAVE_COMPANIES`, bez wnioskodawcy i bez osoby podejmującej decyzję — oboje już wiedzą. Mail niesie to samo zestawienie kolizji, co wniosek
- **`GoogleCalendarModule` / `GoogleCalendarService` — zapis zatwierdzonych urlopów do wspólnego kalendarza.** Dotąd kalendarz `airtel.urlopy@gmail.com` był tylko do odczytu (iframe w zakładce „Kalendarz"). Uwierzytelnienie kontem serwisowym: JWT RS256 podpisany `crypto` → token OAuth2 → REST Calendar v3 przez `axios`, bez nowej zależności npm. Zdarzenia całodniowe, data końca +1 dzień (Google traktuje ją jako wyłączną), daty liczone w `Europe/Warsaw`
- **Cykl życia zdarzenia w kalendarzu.** `decide` → APPROVED zakłada/aktualizuje zdarzenie i zapisuje `googleEventId`; wyjście z APPROVED kasuje zdarzenie i zeruje pole. `update` zatwierdzonego wniosku przestawia termin zdarzenia zamiast tworzyć drugie. `remove` kasuje zdarzenie po usunięciu wniosku. Zdarzenie skasowane ręcznie w kalendarzu (404/410) jest zakładane od nowa; `leaveRequestId` w `extendedProperties` pozwala je odnaleźć bez zapisanego id
- **Integracja bez kompletu zmiennych środowiskowych jest wyłączona.** `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (opcjonalnie `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_IMPERSONATE`) — bez nich `isEnabled()` zwraca false i wszystkie metody są no-opem. Instrukcja konfiguracji po stronie Google w `apps/ENV_README.md`

### słownik

- dodano `OverlappingAbsence`, `formatLeaveDay`, `overlappingBlock`, `sendLeaveRequest.overlapping`, `MailService.sendLeaveApprovalBroadcast`, `LEAVE_BROADCAST_TRIGGER_ROLES`, `LEAVE_MANAGER_ROLES`, `findOverlappingAbsences`, `syncGoogleCalendar`, `notifyManagers`, `GoogleCalendarService`, `GoogleCalendarModule`, `DEFAULT_CALENDAR_ID`, `GoogleLeaveEventParams`, `toCalendarDate`, `addDays`, `isEnabled`, `accessToken`, `eventBody`, `upsertLeaveEvent`, `findEventId`, `deleteLeaveEvent`, `LeaveRequest.googleEventId`

### wytyczne

- `back-serwis` `GoogleCalendarService` — wszystkie metody są best-effort i nie rzucają wyjątków. Zapis do kalendarza nigdy nie może cofnąć ani zablokować decyzji o urlopie, która jest już w bazie; awarie idą do logu, nie do użytkownika
- `back-funkcja` `toCalendarDate` — nie używaj `toISOString().slice(0,10)` dla dat kalendarzowych. Daty urlopowe siedzą w bazie o północy UTC i przy dodatnim offsecie Warszawy naiwna konwersja przesuwa dzień
- `schema-pole` `LeaveRequest.googleEventId` — jedyne źródło powiązania wniosku ze zdarzeniem. Każda ścieżka zmieniająca status na inny niż APPROVED musi je wyczyścić razem z kasowaniem zdarzenia, inaczej kolejne zatwierdzenie odtworzy zdarzenie w starym terminie
- `back-stala` `LEAVE_BROADCAST_TRIGGER_ROLES` — lista ról, których nieobecność jest informacją dla kierownictwa. Rozszerzając ją pamiętaj, że rola musi istnieć w tabeli `roles` (patrz `ensure-roles.js`)

## 2026-08-29 — feat(users): rola DAK z podglądem urlopów wszystkich i rozpoczęcie pracy zamiast ręcznego stażu (v2026.08.29.910)

### schema.prisma

- dodano pole `workStartYear` w modelu `User` — rok rozpoczęcia pracy (z zaliczonymi okresami nauki)
- dodano pole `workStartMonth` w modelu `User` — miesiąc rozpoczęcia pracy (1–12), brak = styczeń. Razem z rokiem jest źródłem prawdy dla stażu, który liczy się w runtime i rośnie co miesiąc
- migracja `20260823150000_user_work_start_year`

### architektura / API

- **Rola `DAK` (dział administracyjno-księgowy) w uprawnieniach użytkownika.** Wybierana w `AddUserModal` i `EditUserModal`, etykieta zostaje skrótem — pełna nazwa tylko w tooltipie
- **`LeaveAccess.canViewAll` — nowa flaga oddzielająca podgląd od decyzji.** ADMIN i DAK widzą w module Urlopy wszystkich pracowników (`visibleUserIds` → null, `GET /leave-requests/dashboard?userId=` dla dowolnego pracownika, `GET /leave-balances?userId=`), ale rozpatrywanie wniosków i edycja wpisów dalej wiszą na `canEdit` (ADMIN) albo byciu przełożonym. `canDecideSubject` liczy się teraz z `canEdit`, nie ze `scope === 'ALL'`
- **`enabled` w `resolveAccess` uwzględnia role podglądowe** — DAK wchodzi do modułu niezależnie od firmy, tak jak ADMIN
- **`calculateWorkExperienceMonths` / `calculateWorkExperienceYears`** — staż liczony z roku i miesiąca rozpoczęcia pracy. `GET /users` zwraca wyliczony staż (`workExperienceYears`, `workExperienceMonths`) i wymiar urlopu; ręcznie wpisany staż z bazy służy już tylko jako fallback dla pracowników bez daty rozpoczęcia
- **`PATCH /users/:id` przyjmuje `workStartYear` i `workStartMonth`** — walidacja (rok 1950–bieżący, miesiąc 1–12), przeliczenie stażu przy każdej zmianie, wyczyszczenie roku kasuje też miesiąc i wyliczony staż
- **`apps/backend/prisma/ensure-roles.js`** — idempotentny upsert samych ról systemowych (ADMIN, MANAGER, USER, LOGISTYK, DAK), bez danych użytkowników. Do uruchomienia po dodaniu nowej roli, także na produkcji

### słownik

- dodano `LEAVE_VIEW_ALL_ROLES`, `LeaveAccess.canViewAll`, `calculateWorkExperienceMonths`, `calculateWorkExperienceYears`, `user-update-work-start-date`, `ensure-roles.js`, `User.workStartYear`, `User.workStartMonth`, `calculateWorkExperienceMonths (front)`, `calculateWorkExperienceYears (front)`, `formatWorkExperience (front)`, `ROLE_OPTIONS (EditUserModal)`, `MONTH_OPTIONS (EditUserModal)`, `edit-user-work-start-field`, `edit-user-experience-preview`, `users-work-start-column`, `dashboard-can-pick-employee`

### wytyczne

- `back-typ` `LeaveAccess.canViewAll` — flaga daje wyłącznie podgląd. Nowy warunek „widzi cudze dane" opieraj na niej, a nie na `scope === 'ALL'`; `scope === 'ALL'` i `canEdit` zostawiaj tam, gdzie chodzi o zmianę danych albo decyzję o wniosku
- `back-stala` `LEAVE_VIEW_ALL_ROLES` — dokładając rolę do tej listy dodaj ją też w `ensure-roles.js` i w `seed.js`, inaczej PATCH użytkownika poleci na `Roles ... not found` (role są wierszami w tabeli `roles`, nie enumem)
- `schema-pole` `User.workExperienceYears` — nie jest już polem do ręcznej edycji, gdy pracownik ma `workStartYear`. Trzymana wartość to fallback dla danych historycznych; do wyliczeń zawsze bierz wynik `calculateWorkExperienceYears`

## 2026-08-23 — feat(urlopy): przyciski Zatwierdź / Odrzuć w mailu do przełożonego (v2026.08.23.908)

### architektura / API

- **`LeaveDecisionTokenService` — podpisany token decyzji.** HMAC-SHA256 na `JWT_SECRET`, bez wpisu w bazie. Payload niesie `requestId`, `deciderId`, `deciderEmail`, `decision` i `exp` (14 dni). Akcja siedzi w podpisie, nie w parametrze URL — podmiana `APPROVED` na `REJECTED` unieważnia token
- **`GET /leave-requests/decision-link?token=` — publiczny endpoint bez `JwtAuthGuard`.** Przełożony klika z klienta pocztowego, gdzie nie ma sesji aplikacji. Zwraca stronę HTML z wynikiem, nie JSON
- **`decideByToken` — trzy warunki tożsamości sprawdzane na bieżąco:** konto decydenta istnieje, adres wpisany w podpis to nadal adres tego konta, a konto jest nadal przełożonym wnioskodawcy. Zmiana adresu albo przełożonego unieważnia wszystkie wcześniej wysłane linki. Dalej idzie ta sama ścieżka co `PATCH /:id/decision` — odjęcie dni z puli, wpis urlopowy, mail zwrotny
- **Jednorazowość z logiki, nie z bazy.** Link działa tylko dopóki wniosek ma status `PENDING`; drugie kliknięcie pokazuje „Wniosek już rozpatrzony" i niczego nie zmienia
- **`sendLeaveRequest` — dwa przyciski w mailu** (zielony Zatwierdź, czerwony Odrzuć) plus nota o 14-dniowej ważności. Bez `approveUrl`/`rejectUrl` mail wygląda jak dotąd

### słownik

- dodano `LeaveDecisionTokenService`, `LeaveDecisionTokenPayload`, `LEAVE_DECISION_TOKEN_TTL_DAYS`, `issue`, `verify`, `LeaveDecisionLinkController`, `GET /leave-requests/decision-link`, `decideByToken`, `decision-token-identity-check`, `leave-decision-link-urls`, `mail-leave-decision-buttons`

### wytyczne

- `back-controller` `LeaveDecisionLinkController` — jedyny kontroler modułu Urlopy bez `JwtAuthGuard`. Nie dokładaj do niego endpointów: wszystko, co tu trafi, jest dostępne bez logowania
- `back-funkcja` `decideByToken` — nie rzuca wyjątków na zły token. Przełożony ma zobaczyć czytelną stronę, a nie surowe 401; wszystkie odmowy zwracają ten sam komunikat, żeby nie podpowiadać, który element tokenu jest nie tak
- `back-typ` `LeaveDecisionTokenPayload` — dokładając pole do payloadu pamiętaj, że stare linki w skrzynkach nadal je pominą. `verify` musi odrzucać brak pola, inaczej stary token przechodzi z pustą wartością

## 2026-08-23 — feat(urlopy): jedna tabela urlopów w „Moje dane" z kolumną komentarza (v2026.08.23.906)

### architektura / API

- **Karta „Moje urlopy" (filtr po rodzaju) usunięta.** Jej rolę przejmuje dawna „Urlopy z lat poprzednich" — pokazywana domyślnie, bez przycisku pokaż/ukryj, z tytułem „Moje urlopy" i filtrem po roku zamiast zakładek rodzaju. Rodzaj urlopu jest kolumną, więc jedna tabela pokazuje wszystkie wpisy naraz
- **Nowa kolumna „Komentarz".** Źródło: `Leave.note`, do którego przy zatwierdzeniu wniosku przepisywany jest `LeaveRequest.comment`. `fetchLeaveUsage` niesie teraz `note` w pozycjach
- **`DEFAULT_LAYOUT` — usunięta karta `tabela`, `historia` przejmuje jej miejsce** (x 0, y 620, 1120×520). Zapisany wcześniej układ użytkownika zachowuje starą pozycję karty `historia`; przywraca go przycisk resetu układu

### słownik

- dodano `my-leaves-history-comment-column`, `leave-usage-item-note`
- usunięto `my-leaves-visible`, `my-leaves-col-defs`, `my-leaves-history-open`, `fetch-my-leaves`, `my-leaves-table`, `my-leaves-type-filter`, `card-usage-details-button`

### wytyczne

- `ui-kolumna` `my-leaves-history-comment-column` — czyta `note` z wpisu urlopowego, nie `comment` z wniosku. Wpis założony ręcznie przez administratora nie ma powiązanego wniosku, więc sięganie po `leaveRequest.comment` dawałoby puste komórki

## 2026-08-23 — feat(urlopy): wniosek za święto w sobotę wskazuje konkretne święto (v2026.08.23.903)

### schema.prisma

- dodano pole `holidayDayOffId` (String?) w modelu `LeaveRequest` — za które święto wypadające w sobotę odbierany jest dzień wolny; wymagane dla rodzaju `ZA_SWIETO_SOB`, dla pozostałych zawsze NULL
- dodano relację `LeaveRequest.holidayDayOff` → `HolidayDayOff` (onDelete: SetNull) oraz odwrotną `HolidayDayOff.requests`
- migracja `20260823140000_leave_request_holiday_day_off` — kolumna, indeks i FK

### architektura / API

- **`assertHolidayDayOffValid` — święto obowiązkowe i tylko z listy admina.** Brak wskazania → 400; święto niezatwierdzone przez administratora → 400; święto już odebrane przez tego pracownika (wniosek PENDING albo APPROVED) → 400 z datą i nazwą. Dla innych rodzajów urlopu przekazanie `holidayDayOffId` jest odrzucane
- **`GET /leave-requests/holiday-days?userId=&year=&requestId=`** — zatwierdzone święta w sobotę na dany rok z flagą `used` (czy ten pracownik już odebrał za nie dzień). `requestId` wyłącza z liczenia edytowany wniosek
- **`HolidayDayOff.id` wystawiony w `GET /leaves/holidays`.** Lista propozycji niosła dotąd samą datę; wniosek wskazuje święto po id, więc `SaturdayHolidayProposal` dostał pole `id` (null dopóki admin nie podjął decyzji)
- **LeaveRequestModal — sekcja „Za które święto".** Widoczna tylko dla rodzaju `ZA_SWIETO_SOB`, lista ładowana dla roku z daty rozpoczęcia; jedno wolne święto wybierane automatycznie, odebrane pozycje wyszarzone. Zapis zablokowany bez wskazania święta
- **LeaveRequestsTab — kolumna „Za święto"** z datą i nazwą święta

### słownik

- dodano `LeaveRequest.holidayDayOffId`, `assertHolidayDayOffValid`, `holidayDaysForRequest`, `listApprovedForUser`, `GET /leave-requests/holiday-days`
- dodano `SATURDAY_HOLIDAY_CODE` (front), `isSaturdayHolidayLeave`, `holidayDays`, `leave-request-holiday-field`, `leave-requests-holiday-column`

### wytyczne

- `schema-pole` `LeaveRequest.holidayDayOffId` — jedno święto = jeden wniosek na pracownika. Limit roczny liczony dotąd sumą dni (`assertSaturdayHolidayDaysAvailable`) zostaje jako druga bariera, ale źródłem prawdy o tym, co już odebrano, jest powiązanie ze świętem
- `back-funkcja` `assertHolidayDayOffValid` — sprawdza `approved`, nie samą obecność wiersza. Wiersz `HolidayDayOff` powstaje też przy cofnięciu zatwierdzenia, więc brak flagi = dzień nie przysługuje

## 2026-08-23 — feat(urlopy): kalendarz bez godzin dla urlopów pełnodniowych, pełne godziny dla godzinowych (v2026.08.23.902)

### schema.prisma

- dodano pole `allowsHourly` (Boolean, default false) w modelu `LeaveType` — czy wniosek tego rodzaju dzieli się na godziny. Migracja `20260823130000_leave_type_allows_hourly` ustawia `true` wyłącznie dla `WYPOCZYNKOWY`

### architektura / API

- **Podstawa prawna per rodzaj — `HOURLY_LEAVE_CODES`.** `WYPOCZYNKOWY` godzinowy (art. 154² §4 KP — wymiar godzinowy odpowiadający części dobowego wymiaru czasu pracy). Pełnodniowe: `NA_ZADANIE` (art. 167² — część urlopu wypoczynkowego, ale udzielana na dzień), `OPIEKA` (art. 173¹ §3 — „udziela się w dni, które są dla pracownika dniami pracy"), `BEZPLATNY` (art. 174 — w dniach), `ZA_SWIETO_SOB` (art. 130 §2 — cały dzień wolny), `L4` (zwolnienie w dniach kalendarzowych)
- **`assertHoursValid` — dla rodzaju godzinowego wyłącznie pełne godziny.** `timeStart`/`timeEnd` musi pasować do `HH:00`, inaczej 400. Sprawdzane w `POST` i `PATCH /leave-requests/:id`
- **LeaveRequestModal — `datetime-local` rozbity na kalendarz + wybór godziny.** Rodzaj pełnodniowy: sam `input[type=date]`, wniosek zapisywany jako 00:00–23:59 z `timeStart`/`timeEnd` = null. Rodzaj godzinowy: kalendarz + `select` z 24 pełnymi godzinami, minuty niedostępne. Przełączenie rodzaju normalizuje już wpisane wartości

### słownik

- dodano `LeaveType.allowsHourly`, `HOURLY_LEAVE_CODES`, `assertHoursValid` — podział wniosku na godziny
- dodano `allowsHourly`, `HOUR_OPTIONS`, `setDayPart`, `leave-request-date-fields` w `LeaveRequestModal.jsx`

### wytyczne

- `schema-pole` `LeaveType.allowsHourly` — źródło prawdy w runtime. `back-stala` `HOURLY_LEAVE_CODES` tylko dokumentuje podstawę prawną i wartość startową migracji; zmiana stałej nie zmienia zachowania bez migracji albo UPDATE-u
- `ui-input` `leave-request-date-fields` — nigdy nie wracamy do `datetime-local`: pozwala wpisać dowolne minuty, których backend nie przyjmie dla urlopu godzinowego, a dla pełnodniowego są bezsensowne

## 2026-08-23 — feat(urlopy): urlop opiekuńczy wymaga uzasadnienia w komentarzu (v2026.08.23.901)

### architektura / API

- **`assertCommentValid` — komentarz obowiązkowy dla rodzajów z ustawowym wymogiem uzasadnienia.** Dziś lista to wyłącznie `OPIEKA` (art. 173¹ §5 KP). Pusty komentarz albo krótszy niż 20 znaków → 400 z treścią wymogu. Sprawdzane w `POST /leave-requests` i w `PATCH /leave-requests/:id` (zmiana rodzaju albo komentarza nie może zostawić wniosku bez uzasadnienia)
- **Pozostałe rodzaje sprawdzone — bez wymogu komentarza.** `WYPOCZYNKOWY` (art. 152), `NA_ZADANIE` (art. 167²), `BEZPLATNY` (art. 174 — wniosek pisemny, ale ustawa nie żąda przyczyny), `ZA_SWIETO_SOB` (art. 130 §2), `L4` (zwolnienie lekarskie, nie wniosek pracownika)
- **LeaveRequestModal — istniejące pole komentarza zmienia rolę przy opiece.** Ten sam input (bez nowego modala): etykieta „Uzasadnienie" z gwiazdką, `textarea` zamiast jednolinijkowego pola, podpowiedź z wymogami art. 173¹ §5 i przykład wpisu. Przycisk zapisu zablokowany dopóki uzasadnienie nie spełnia warunku

### słownik

- dodano `assertCommentValid`, `LEAVE_TYPES_REQUIRING_COMMENT`, `LEAVE_COMMENT_MIN_LENGTH`, `CARE_LEAVE_COMMENT_HINT` — walidacja uzasadnienia, `leave-requests.service.ts` + lustra w `leavesTheme.js`
- dodano `commentRequired`, `commentBlock`, `leave-request-comment-field` — wymuszenie uzasadnienia w `LeaveRequestModal.jsx`

### wytyczne

- `back-stala` `LEAVE_TYPES_REQUIRING_COMMENT` — lista kodów, nie flaga na `LeaveType`. Wymóg wynika z ustawy, nie z konfiguracji administratora, więc nie może być wyklikany w UI
- `back-funkcja` `assertCommentValid` — imienia i nazwiska osoby wymagającej opieki NIE szukamy w komentarzu, niesie je `LeaveRequest.dependentId`. Komentarz pokrywa wyłącznie przyczynę i stopień pokrewieństwa / adres
- `ui-input` `leave-request-comment-field` — to jedno pole dla wszystkich rodzajów urlopu; przy opiece zmienia się etykieta i walidacja, nie powstaje osobny formularz

## 2026-08-23 — feat(urlopy): staż pracy pracownika i wyliczany wymiar urlopu (v2026.08.23.900)

### schema.prisma

- dodano pole `workExperienceYears` (Float?) w modelu `User` — ogólny staż pracy w latach (zatrudnienie + zaliczone okresy nauki), podstawa wyliczenia wymiaru urlopu wypoczynkowego

### architektura / API

- **`calculateLeaveEntitlement` — wymiar urlopu z Kodeksu pracy art. 154 §1.** Staż < 10 lat → 20 dni, staż ≥ 10 lat → 26 dni. Brak podanego stażu zwraca `null`, żeby UI nie pokazywał wyliczenia z powietrza
- **`GET /users` zwraca wirtualne pole `leaveEntitlementDays`.** Liczone w locie z `workExperienceYears`, nie trzymane w bazie — zmiana stażu od razu zmienia wymiar, bez migracji danych
- **`PATCH /users/:id` przyjmuje `workExperienceYears`.** Wartość z gridu (string, przecinek dziesiętny) normalizowana do liczby, pusta = `null`, ujemna odrzucana jako 400
- **UsersPage — dwie nowe kolumny.** „Staż pracy (lata)" edytowalna wyłącznie dla firm z modułem Urlopy (Airtel Services, Airtel Systems, LinkedTeam) i tylko dla ADMIN/MANAGER; „Wymiar urlopu (dni)" nieedytowalna, liczona po stronie frontu tym samym wzorem co backend

### słownik

- dodano `calculateLeaveEntitlement` — wymiar urlopu ze stażu, `leaves.service.ts` + lustro w `leaveCompanies.js`
- dodano `LEAVE_ENTITLEMENT_THRESHOLD_YEARS`, `LEAVE_ENTITLEMENT_DAYS_BELOW`, `LEAVE_ENTITLEMENT_DAYS_ABOVE` — progi z art. 154 §1
- dodano `User.workExperienceYears` — staż pracy w latach
- dodano kolumny `users-work-experience-column`, `users-leave-entitlement-column` w `UsersPage.jsx`

### wytyczne

- `schema-pole` `User.workExperienceYears` — trzymamy staż, nie wymiar urlopu. Wymiar zawsze liczony funkcją, nigdy zapisywany w bazie, żeby próg 10 lat nie rozjechał się między rekordami
- `back-funkcja` `calculateLeaveEntitlement` — nie uwzględnia proporcji dla niepełnego etatu (art. 154 §2). Obsługa niepełnych etatów wymaga osobnego pola z wymiarem etatu i jest świadomie poza tą zmianą
- `ui-kolumna` `users-work-experience-column` — staż edytowalny tylko dla firm z `LEAVE_COMPANIES`; dla pozostałych obie kolumny zostają puste, bo moduł Urlopy ich nie dotyczy

## 2026-08-23 — feat(wbs): zatwierdzenie podpowiedzianej nazwy przepisuje ustawienia bliźniaka (v2026.08.23.899)

### architektura / API

- **`applyTwinDefaults` — nazwa zatwierdzona = ustawienia przepisane.** Gdy nazwa liścia (z podpowiedzi albo wpisana ręcznie) pokrywa się z pozycją już obecną w drzewie, węzeł dostaje jej typ, jednostkę, cenę jednostkową i narzut. Wypełniamy WYŁĄCZNIE pola puste — nic wpisanego ręcznie nie jest nadpisywane. Skopiowany typ pociąga te same skutki co wybór z listy: `work` zakłada liść Paliwo, `material`/`equipment` zakłada kartę produktową
- **`pickTwinDefaults` — wartość najczęstsza, pole po polu.** Przy kilku bliźniakach każde pole głosowane osobno, wartości puste (typ '', jednostka '', cena 0, narzut 0) nie biorą udziału. Jeden bliźniak z niedokończoną konfiguracją nie psuje wtedy podpowiedzi dla pozostałych
- **`twinFlash` — podświetlenie przepisanych komórek na 2 s.** Cena i typ nie mogą zmienić się bezgłośnie po wyjściu z pola nazwy

### słownik

- dodano `pickTwinDefaults` — ustawienia bliźniaka do przepisania, `wbsNameSuggest.js`
- dodano `applyTwinDefaults` — nałożenie ustawień na węzeł, `WBSHybridTable.jsx`
- dodano `twinFlash`, `twinFlashClass` — podświetlenie przepisanych pól, `WBSHybridTable.jsx`
- zmieniono `buildNameSuggestionPool` — wpis puli niesie teraz `twins[]` (typ, jednostka, cena, narzut każdego nosiciela nazwy)

### wytyczne

- `ui-funkcja` `applyTwinDefaults` — kopiuj tylko do pól pustych i NIGDY do `unitCost`/`margin` przy `offerLocked`. `unit === 'sztuki'` traktuj jako puste (wartość startowa nowego węzła), tak samo jak robi to podpowiadacz jednostki przy zmianie typu
- `ui-stan` `nameSuggestionPool` — memo przelicza się przy każdej zmianie drzewa, bo `items` dostaje nową tożsamość przy każdym znaku. Zmierzone 1,5 ms dla 2751 węzłów, więc świadomie bez dodatkowego debounce'u

## 2026-08-23 — fix(materialy): PATCH karty z producentem i modelem nie kończy się już 500 (v2026.08.23.898)

### architektura / API

- **`PATCH /material-requirements/:id` wywalał się 500**, gdy karta niosła producenta i model, a wymaganie nie miało jeszcze propozycji tej pary. Gałąź tworząca propozycję podawała `productName: pn ?? undefined`, a `ProductProposal.productName` jest w schemacie WYMAGANE — Prisma odbijała `Argument `productName` is missing` (`PrismaClientValidationError`). Front dostawał 500, propozycja nie powstawała, a ProductCard wracał wyzerowany. To ta sama pułapka co w `addManual` po stronie frontu (v897), tyle że na drugiej drodze zapisu — kartą, nie formularzem „Dodaj ręcznie"
- **`mat-req-proposal-name-fallback` — nazwa składa się sama**, tak jak `composeProposalName` na froncie: wpisana ręcznie → nazwa z upsertowanego `Material` dla pary producent+model → złożenie „PRODUCENT MODEL"

### słownik

- dodano `mat-req-proposal-name-fallback` — składanie nazwy handlowej nowej propozycji tworzonej z karty, `material-requirements.service.ts`

### wytyczne

- `schema-pole` `ProductProposal.productName` — pole jest wymagane, więc **żadna ścieżka tworząca propozycję nie ma prawa podać tu `undefined`**. Producent i model wystarczą do zapisu; nazwę handlową składa się z nich (front: `composeProposalName`, backend: `mat-req-proposal-name-fallback`). Wzorzec `x ?? undefined` na wymaganym polu Prismy to nie „pomiń pole", tylko błąd walidacji w runtime

## 2026-08-23 — fix(materialy): ręczna propozycja zapisuje się od producenta i modelu (v2026.08.23.897)

### architektura / API

- **`addManual` nie kończy się już cichym `return`** — `ProductProposal.productName` jest w schemacie WYMAGANE, więc bez nazwy handlowej propozycja nie ma prawa powstać, ale dotąd przycisk „Dodaj" po prostu nic nie robił i nic tego nie tłumaczyło. Naturalna droga wpisywania to producent → model (lista zawężona producentem) → zapis, a ona z założenia zostawia nazwę handlową pustą
- **`composeProposalName` — nazwa handlowa składa się sama**: najpierw nazwa z katalogu materiałów dla pary producent+model, w drugiej kolejności złożenie „PRODUCENT MODEL". Wpisana ręcznie ma pierwszeństwo. Logika wyodrębniona do `proposalName.js`, bez Reacta, żeby dała się odpalić w Node
- **`manualError` — komunikat pod formularzem** zamiast ciszy, gdy brakuje producenta
- **Migracja produkcyjna (AMP_5G):** 9 węzłów materiałowych bez własnej karty i bez tagu `req:` pożyczało kartę sąsiada przez fallback po NAZWIE w `WbsMaterialsPanel` — propozycja dodana przy jednej gałęzi pojawiała się przy wszystkich o tej samej nazwie. Każdy dostał własną kartę (nazwa, ilość i jednostka z węzła; cena, wymagania techniczne, produkt i dostawca z karty pożyczanej). Przeliczono też 5 kart-wzorców, żeby usamodzielniona gałąź nie liczyła się dwa razy: `cybant` 675→325, `zapinki do cybantów` 675→325, `mufa łącząca rhdp` 38→10, `mufa światłowodowa 48j` 2→1, `łączniki kątowe` 41→1. Po migracji sumy się domykają: `cybant` 795 w WBS i 795 na kartach
- **Test:** `test/test-proposal-name.mjs` — 9 sprawdzeń składania nazwy

### słownik

- dodano `compose-proposal-name` — `composeProposalName`, składanie nazwy handlowej propozycji, `proposalName.js`
- dodano `manual-proposal-name-fallback` — gałąź zapisu ręcznej propozycji bez nazwy handlowej, `WbsMaterialsPanel.jsx`
- dodano `manual-proposal-error` — `manualError`, komunikat pod formularzem ręcznej propozycji, `WbsMaterialsPanel.jsx`

### wytyczne

- `ui-formularz` — **nigdy nie kończ zapisu cichym `return`.** Brak wymaganego pola ma dać komunikat przy formularzu; martwy przycisk jest nie do zdiagnozowania z zewnątrz i wygląda jak awaria backendu
- `ui-panel` `WbsMaterialsPanel` — dopasowanie węzeł↔karta ma trzeci stopień: **po NAZWIE**. Węzeł bez własnej karty pokazuje wtedy kartę sąsiada i edycja na jednym widać na wszystkich. Każdy węzeł materiałowy musi mieć własną kartę, inaczej fallback skleja pozycje o tej samej nazwie

## 2026-08-22 — fix(wbs): karta zbiorcza liczy się z rzeczywistych ilości gałęzi (v2026.08.22.896)

### architektura / API

- **`syncMaterialsFromWbsNode` szuka KAŻDEJ karty wymieniającej ten węzeł**, nie tylko tej posiadanej przez niego przez relację 1:1. Karta może obejmować kilka gałęzi WBS (`wbsNodeAllocations`), a właścicielem jest tylko jedna z nich — dwie dziury z tego wynikające, obie widoczne w AMP_5G: edycja gałęzi WTÓRNEJ nie ruszała karty w ogóle (`updateMany({ where: { wbsNodeId } })` trafia wyłącznie w kartę właściciela, a tabela `WbsNodeMaterial` jest dla większości pozycji pusta), a edycja WŁAŚCICIELA nadpisywała sumę ilością jednej gałęzi — karta `cybant` pokazywała 325 przy mapie `{…:1, …:350}`, gałąź 350 wypadła z zakupów
- **Suma liczona z RZECZYWISTYCH ilości węzłów z mapy, nie z wartości w mapie** — nieaktualne wpisy same się goją
- **Gałąź mająca WŁASNĄ kartę nie jest doliczana** — jej ilość jest już policzona po tamtej stronie. Bez tego `Przełącznica 48j` doliczałaby `Przełącznicę SC/PC` i rosłaby z 1 na 3, dając 9 sztuk w Materiałach przy 7 w WBS
- **Trzy bezpieczniki:** właściciel zostaje w sumie nawet gdy mapa go nie wymienia; wpis na nieistniejący węzeł zachowuje dotychczasową wartość (usunięcie obniżyłoby ilość zakupową po cichu, przy okazji niepowiązanej edycji); karta bez właściciela, której wszystkie gałęzie mają własne karty, zostaje NIETKNIĘTA — bez tego 12 pozycji w CMC spadłoby do zera
- **Test:** `test/sync-materials-from-wbs-node.spec.ts` — 9 sprawdzeń na atrapie prisma, w tym obie regresje i wszystkie trzy bezpieczniki

### wytyczne

- `back-funkcja` `syncMaterialsFromWbsNode` — zmiana ilości na węźle dotyka KAŻDEJ karty, która ten węzeł wymienia. Relacja 1:1 `wbsNodeId` wskazuje tylko właściciela; gałąź wtórna nie ma własnej karty i nie da się jej znaleźć po tej relacji
- `schema-pole` `MaterialRequirement.wbsNodeAllocations` — wpis na węzeł, który MA własną kartę, jest śladem po nieaktualnym powiązaniu (najczęściej po kopiuj/wklej gałęzi). Nie wliczaj go — to podwójne liczenie w zakupach

## 2026-08-22 — feat(wbs): autouzupełnianie nazwy liścia z nazw już użytych w drzewie (v2026.08.22.895)

### architektura / API

- **`WbsNameAutocomplete` — kolumna Nazwa podpowiada jak Excel.** Po wpisaniu ≥3 znaków, które są prefiksem nazwy istniejącej już w tym samym drzewie WBS, pole dopisuje resztę nazwy i ZAZNACZA dopisany ogon. Dalsze pisanie nadpisuje zaznaczenie, Backspace/Delete je kasuje, Escape wraca do wpisanego prefiksu, a Enter / Tab / strzałka w prawo / wyjście z pola zatwierdzają. Podpowiedź działa tylko przy dopisywaniu na końcu tekstu — edycja w środku istniejącej nazwy jest nietknięta
- **`wbsNameSuggest.js` — czysta logika dopasowania, bez Reacta.** Rozdzielona od komponentu, żeby dała się odpalić w Node; `test/test-name-autocomplete.mjs` sprawdza ją na 855 prawdziwych nazwach z bazy dev (185 unikalnych)
- **`AutoResizeTextarea` przyjmuje `inputRef`** — dostęp do elementu DOM dla `setSelectionRange`. Zwykłe `ref` nie przechodzi przez `{...rest}` komponentu funkcyjnego

### słownik

- dodano `WbsNameAutocomplete` — pole nazwy węzła WBS z podpowiedzią, `WbsNameAutocomplete.jsx`, `@anchor wbs-name-autocomplete`
- dodano `buildNameSuggestionPool` — pula nazw z drzewa, posortowana wg częstości użycia, `wbsNameSuggest.js`
- dodano `findNameSuggestion` — pierwsza nazwa z puli zaczynająca się od prefiksu, `wbsNameSuggest.js`
- dodano `normalizeNameKey` — klucz porównania nazw (wielkość liter + spacje), `wbsNameSuggest.js`
- dodano `MIN_PREFIX` — próg 3 znaków, poniżej którego nie podpowiadamy, `wbsNameSuggest.js`
- dodano `nameSuggestionPool` — memo puli w `WBSHybridTable.jsx`

### wytyczne

- `ui-funkcja` `findNameSuggestion` — dopasowanie jest DOSŁOWNYM prefiksem (różni się tylko wielkością liter i spacjami). Świadomie bez fuzzy: podpowiedź wstawiana automatycznie w pole musi być pewna. Dopasowanie rozmyte to osobny krok, z pytaniem do użytkownika, nie z cichym wstawieniem
- `ui-input` `WbsNameAutocomplete` — zaznaczenie ogona nakładaj OD RAZU na DOM w `onChange`, nie tylko w `useLayoutEffect`. Gdy podpowiedź równa się dotychczasowej wartości pola, React nie przerysowuje (ten sam stan), efekt nie odpala i ogon zostaje niezaznaczony
- `ui-stan` `nameSuggestionPool` — licz w `useMemo` po `items`, nigdy przy każdym znaku: drzewa mają 2–3 tys. węzłów

## 2026-08-22 — fix(materialy): cichy błąd zapisu produktu katalogowego zostawia ślad (v2026.08.22.894)

### architektura / API

- **`material.update` w gałęzi katalogowej `update()` loguje błąd zamiast go połykać** — `.catch(() => {})` zamienione na `.catch(e => logger.warn(...))`. Zapis pozycji nadal nie wywraca się przez błąd pól katalogowych, ale przestaje milczeć. To ta sama klasa błędu, która przez pół roku utrzymywała martwe `syncAllocationsToRelational` i przekierowała zapis ilości w złą gałąź

### schema.prisma

- opisano `MaterialRequirement.wbsNodeIds` i `wbsNodeAllocations` — zdjęta myląca adnotacja `@deprecated`. Migracja do `WbsNodeMaterial` nigdy nie została dokończona, oba pola są żywe i czytane; `wbsNodeAllocations` jest źródłem prawdy dla rozbicia pozycji na gałęzie
- opisano `WbsNodeMaterial.materialId` — trzyma `materials.id`, NIE id `MaterialRequirement`. Bez tego rozróżnienia dwa miejsca w `material-requirements` pytały złą przestrzeń id: zapytania zwracały 0 wierszy, zapisy leciały na klucz obcy pod pustym `.catch`

### wytyczne

- `schema-pole` `MaterialRequirement.wbsNodeAllocations` — pole opisuje ROZBICIE pozycji na gałęzie WBS. Ilość wymagania to SUMA tej mapy, każdy węzeł trzyma swój udział, a właścicielem przez relację 1:1 jest tylko jeden z nich. **Brak własnej karty na gałęzi wtórnej NIE jest błędem** i nie należy jej tam zakładać
- `back-serwis` — `.catch(() => {})` przy zapisie do bazy jest zakazane. Gdy błąd nie ma wywracać operacji, łap go do `logger.warn` z id rekordu. Ciche pomijanie zapisów ukryło w tym projekcie dwie niedokończone migracje

## 2026-08-22 — Eksport tabel oferty: czytelność arkuszy Plan działania / Oferta / Q&A (v2026.08.22.891)

### architektura / API
- `ui-funkcja` `buildMarkdownSheet` (UnifiedWbsPanel) — wiersze tekstowe (nagłówki, listy, akapity) nie dostają już jawnej wysokości; przy `wrapText` Excel auto-dopasowuje wysokość do zawiniętej treści.
- linia zakończona dwukropkiem („Konwektory RRH Installation:") jest pogrubiana jako etykieta pozycji, komentarz pod nią zostaje zwykłą czcionką; nagłówki `####`–`######` traktowane jak `###` zamiast wpadać do akapitu.
- pusty wiersz separujący pozycje ma normalną wysokość (wcześniej `height = 4`, co dawało zawężone paski), a ciąg pustych linii Markdown zwija się do jednego wiersza.
- nowy parametr `opts.skipBlankRows` — arkusz „Oferta" generowany bez pustych wierszy, „Plan działania" z nimi.
- arkusz „Q&A" — wiersze bez jawnej wysokości, Excel dopasowuje ją do najdłuższej z kolumn (ścieżka / pytanie / odpowiedź) zamiast liczyć tylko z odpowiedzi.

### wytyczne
- `ui-funkcja` `buildMarkdownSheet` — dla komórek z `wrapText` nie ustawiać `row.height`; jawna wysokość ucina zawinięty tekst.

## 2026-08-22 — Arkusz „Zakupy": cena ofertowa i porównanie z ceną zakupu (v2026.08.22.885)

### architektura / API
- `ui-kolumna` arkusz „Zakupy" — dodano `Cena ofertowa` (`planUnitOf`: karta produktowa, a dla liści bez karty `WbsNode.unitCost`), `Δ jedn.` (`zakup − oferta`), `Δ %` (`Δ jedn. ÷ cena ofertowa`) i `Δ wartość` (`ilość × Δ jedn.`); kolumnę `Koszt jedn.` przemianowano na `Cena zakupu`, `Wartość` na `Wartość zakupu`. Wszystkie porównania to żywe formuły, stopka sumuje wartość zakupu i Δ wartość.
- wiersz bez ceny ofertowej zostawia komórki porównania puste i nie wchodzi do sumy Δ.

### słownik
- dodano `realization-export-purchase-vs-offer` — kolumny porównania ceny ofertowej z ceną zakupu w arkuszu Zakupy, RealizationTab.jsx

## 2026-08-22 — Eksport Realizacji: arkusz „Zakupy" z kolumną wymagania (v2026.08.22.884)

### architektura / API
- `ui-funkcja` `exportExcel` (RealizationTab) — dodano trzeci arkusz „Zakupy": jeden wiersz na wpis `LeafActual`, wyłącznie dla liści kupowanych (materiał, sprzęt, nocleg, paliwo — praca i usługa to wykonanie). Kolumny: Wymaganie, Przedmiot projektu, Pozycja, Typ, Data zakupu, Producent, Model, Kod EAN, Dostawca, Dokument, Ilość, Jedn., Koszt jedn., Wartość (formuła `ilość × koszt jedn.`), Kupujący, Komentarz; stopka z SUM.
- pierwsza kolumna „Wymaganie" niesie `MaterialRequirement.name` dopasowane do liścia przez `buildCardMap`; liść bez karty produktowej dostaje „—".

### słownik
- dodano `realization-export-purchases` — arkusz „Zakupy" w eksporcie Excel zakładki Realizacja, RealizationTab.jsx

### wytyczne
- `ui-funkcja` `exportExcel` — arkusz „Zakupy" rozbija wpisy, arkusz „Realizacja" je agreguje do pozycji; przy zmianie kolumn wpisu aktualizować oba.

## 2026-08-22 — feat(excel): Podsumowanie per główne gałęzie w analizie projektu (v2026.08.22.883)

### układ eksportu

- **Arkusz `Podsumowanie` — nowa tabela „Podsumowanie per główne gałęzie"** (między tabelą per typ a tabelą per osoba odpowiedzialna). Kolumny identyczne z tabelą per typ: `Główna gałąź` / `Koszt` / `Przychód` / `Zysk` / `Marża %`. Jeden wiersz na przedmiot (węzeł depth=0, kolumna `Zakres` w arkuszu `Budżet`), sortowanie malejąco po koszcie, wiersz `Razem` na `SUBTOTAL(9,…)`.
- **Wartości liczone formułami z arkusza `Budżet`, nie stałymi z aplikacji** — `Koszt`/`Przychód` = `SUMIF` po kolumnie `Zakres`, pozycje bez zakresu (`(puste)`) przez `SUMPRODUCT((TRIM(zakres)="")*…)`; `Zysk`/`Marża %` = formuły z sąsiednich komórek.

### architektura / API

- **`appendBudgetSheet` — `ref.cols` zwraca dodatkowo `subjectName`** (litera kolumny `Zakres`), żeby `Podsumowanie` mogło adresować ją w `SUMIF`/`SUMPRODUCT`.

## 2026-08-22 — feat(excel): Podsumowanie liczone formułami z arkusza Budżet + sumy na górze (v2026.08.22.882)

### architektura / API

- **Eksport „Analiza projektu do Excel" — arkusz `Podsumowanie` nie zawiera już stałych liczb z aplikacji.** Wszystkie kwoty są formułami czytającymi arkusz `Budżet`: koszt całkowity i przychód przed rabatami = `SUM` po zakresie pozycji, tabele „per typ" i „per osoba odpowiedzialna" = `SUMIF` po kolumnach `Typ` / `Osoba odpowiedzialna`, „Liczba dni pracy" = `SUMPRODUCT` po typie `Praca` i jednostce dniowej. Edycja pozycji w arkuszu `Budżet` przelicza całe podsumowanie w pliku, bez ponownego eksportu z aplikacji.
- **Wiersze bez etykiety (`—` w typie, `(puste)` w osobie odpowiedzialnej) liczone przez `SUMPRODUCT((TRIM(zakres)="")*…)`** — `SUMIF` nie dopasowuje pustych komórek.
- **Rabat całościowy ma jedno źródło prawdy.** `Budżet!B1` jest formułą `='Podsumowanie'!$B$7`, a `Budżet!E1` = `MAX(0, Razem cena ofertowa − rabat)`. Zmiana rabatu procentowego/kwotowego w `Podsumowanie!B5`/`B6` przelicza oba arkusze.
- **`appendBudgetSheet(workbook, opts)`** — nowy parametr `opts.discountRef` (adres komórki z rabatem całościowym; bez niego rabat zapisywany jako stała) oraz nowe pole `ref` w zwracanym obiekcie: geometria arkusza (litery kolumn, pierwszy/ostatni wiersz danych, wiersz sum) do budowania formuł w innych zakładkach.

### układ eksportu

- **Arkusz `Budżet` — wiersz „Razem" przeniesiony z dołu tabeli na górę.** Nowy układ: wiersz 1 = rabat całościowy, wiersz 2 = „Razem" (`SUBTOTAL(9,…)` po zakresie danych, respektuje autofiltr), wiersz 3 = nagłówek, dane od wiersza 4. Zamrożony podział przesunięty na 3 wiersze, autofiltr od wiersza 3.

### wytyczne

- `ui-funkcja` `appendBudgetSheet` — układ wierszy arkusza `Budżet` (1 rabat / 2 Razem / 3 nagłówek / 4+ dane) jest kontraktem dla formuł w `Podsumowaniu`; przy zmianie układu aktualizuj stałe `DISCOUNT_ROW`/`TOTALS_ROW`/`HEADER_ROW`/`FIRST_DATA_ROW` i zwracane `ref`, nigdy nie wpisuj numerów wierszy na sztywno w innych zakładkach.
- `ui-funkcja` `appendBudgetSheet` — po zmianie układu wierszy re-import budżetu wymaga wskazania wiersza nagłówka **3** (a nie 2) w oknie importu; pole jest wybierane ręcznie przez użytkownika.
- `Podsumowanie` — sumy celowo używają `SUM` (cały projekt), a nie `SUBTOTAL`; autofiltr w arkuszu `Budżet` nie zmienia podsumowania.

## 2026-08-22 — fix(budzet): rzeczywiste = zakupy, ukryte bez baseline + sumy zafiltrowane (v2026.08.22.881)

### architektura / API

- **`GET /material-requirements/node/:nodeId/budget-sums` zwraca `purchaseDelta` i `purchasedCount`** — `purchaseDelta` to Σ (cena zakupu − cena ofertowa) × ilość, liczona WYŁĄCZNIE po pozycjach z propozycją `isPurchase`. Front dolicza tę różnicę do kosztu ofertowego z WBS zamiast podmieniać całą podstawę kosztu materiałów na `sumZakup`
- **Kafle KPI „Rzeczywiste" liczą teraz zakupy, nie drugi wariant oferty** — poprzednia formuła brała koszt materiałów z `MaterialRequirement × ProductProposal`, a ofertowy z `WbsNode.unitCost × quantity`. Dwa różne źródła dawały rozjazd nawet przy ZEROWEJ liczbie zakupów: na produkcji AMP_5G (`d1bb2395…`, wersja „pierwszy", 0 propozycji `isPurchase`) kafel Koszt pokazywał 16 377 PLN różnicy z trzech powodów — 76 ze 131 wymagań bez propozycji `isOffer` spadało na `budgetedPriceNetto` (8 679 PLN), `budgetSums` ignorował `wbsNodeAllocations` i liczył pełne `r.quantity` (5 804 PLN), a 4 wiersze WBS typu material/equipment nie miały w ogóle powiązanego wymagania (1 895 PLN). Teraz brak zakupów ⇒ rzeczywiste == oferta
- **Wiersz „Rzeczywiste" znika przed akceptacją baseline** — backend zwracał `accepted` od początku, ale front nigdy go nie czytał. Bez `ProcessNode.acceptedVersionId` nie ma czego porównywać, więc cztery kafle (koszt/przychód/zysk/marża) pokazują sam wiersz „Oferta"
- **Nowa stopka tabeli Budżet „Wartość zafiltrowana"** — przyklejona do dołu, sumuje ilość, koszt całkowity i cenę ofertową z wierszy widocznych po filtrach kolumnowych, plus licznik `N z M poz.`. Bez filtrów pokrywa się z kaflem KPI „Oferta"
- **Test:** `test/budget-kpi-harness.html` — 21 sprawdzeń na żywym komponencie w dev serwerze (mock `budget-sums`): brak baseline ⇒ jeden wiersz, baseline + zero zakupów ⇒ rzeczywiste == oferta co do grosza, `purchaseDelta` przenosi się 1:1 na kafel, stopka ma tyle komórek co nagłówek (13), filtr dokłada trzeci wiersz kursywą 8px/12px wobec 10px/14px i znika po wyczyszczeniu
- **Trzeci wiersz „Zafiltrowane" w czterech kaflach KPI** (koszt / przychód / zysk / marża) — kursywa, czcionka o 2px mniejsza od reszty kafla (etykieta 8px zamiast 10px, wartość 12px zamiast 14px). Pokazuje się tylko przy aktywnym filtrze kolumnowym; bez filtrów powielałby wiersz „Oferta". Liczony tą samą funkcją `calcSummary` co „Oferta", więc po wyczyszczeniu filtrów obie liczby zgadzają się co do grosza. Kafle pokazują przychód PO rabacie globalnym, stopka tabeli — sumę kolumny „Cena ofert." przed rabatem, bo stopka musi się zgadzać z tym, co widać w wierszach

### słownik

- dodano `budget-show-real` — warunek widoczności wiersza „Rzeczywiste" w kaflach KPI, `BudgetTable.jsx`
- dodano `budget-filtered-sums` — sumy ilości/kosztu/ceny z wierszy po filtrach, `BudgetTable.jsx`
- dodano `budget-filtered-footer` — stopka `<tfoot>` „Wartość zafiltrowana", `BudgetTable.jsx`

### wytyczne

- `ui-sekcja` `budget-kpi-tiles` — wiersz „Rzeczywiste" ZAWSZE liczy się jako korekta wartości ofertowej o realne zakupy, nigdy jako niezależna suma z drugiego źródła. Ofertę i rzeczywiste wolno zestawiać tylko wtedy, gdy obie liczby wychodzą z tej samej podstawy — inaczej kafel pokazuje różnicę w jakości danych, nie w pieniądzach
- `back-funkcja` `budgetSums` — `sumWycena`/`sumZakup` nie respektują `wbsNodeAllocations` (biorą pełne `MaterialRequirement.quantity`), więc nie nadają się do zestawiania z sumami WBS. Do porównań z budżetem używaj `purchaseDelta`

## 2026-08-22 — fix(materialy): cena katalogowa produktu tylko z modulu Materialy (v2026.08.22.879)

### architektura / API

- **`PATCH /material-requirements/:id` nie zapisuje już `Material.priceNetto`** — cena wpisana w karcie pozycji jest ceną TEJ pozycji (leci na `budgetedPriceNetto`), a nie ceną katalogową produktu wspólną dla całej firmy. Zapis szedł z trzech miejsc w `update()`: aktualizacji istniejącego wpisu katalogu i tworzenia nowego w gałęzi „producent + model", oraz z `matPatch` w gałęzi forwardowania pól katalogowych. Edycja ceny w jednym projekcie przestawiała cenę produktu widzianą przez wszystkie pozostałe
- **Skutek dla QuickQuote:** `addStockItems` czyta `Material.priceNetto` przy wycenie z magazynu. Materiały, które ceny nie mają ustawionej świadomie przez moduł Materiały, będą pomijane z powodem `brak ceny katalogowej materiału` — pozycja trafia na listę `skipped`, nie do wyceny po fałszywej cenie
- **`selectProposal` też nie zasiewa katalogu ceną** — akceptacja propozycji tworzyła NOWY wpis `materials` z ceną tej jednej oferty. Nie nadpisywała istniejącej, więc nie fałszowała cudzych projektów, ale ponieważ produkty wchodzą do katalogu głównie przez pracę na projektach, tą drogą powstawała większość cen katalogowych. Na produkcji 47 ze 106 wycenionych materiałów ma cenę co do grosza równą propozycji ze swojej pozycji. Wpis rodzi się teraz bez ceny — tak samo jak przy `assignOfferPosition` i upsercie z ekstrakcji AI, które nigdy jej nie zapisywały
- **Katalog zachowuje własną drogę zapisu** — `materials-create` / `materials-update` w module Materiały. Bez zmian: propozycja produktowa nadal dostaje cenę z karty (`mat-req-sync-offer-proposal-price`), bo to nośnik ceny dla splitu Wycena/Zakup
- **Test:** `test/catalog-price-guard.spec.ts` — 9 sprawdzeń na atrapie prisma: obie gałęzie katalogowe `update()`, pozycja bez materiału, `budgetedPriceNetto`, propozycja oraz `selectProposal` (nowy wpis bez ceny, istniejący nietknięty, cena nadal na pozycji)

### słownik

- dodano `mat-req-catalog-price-guard` — granica między ceną pozycji a ceną katalogową produktu, `material-requirements.service.ts`

### wytyczne

- `schema-pole` `Material.priceNetto` — to cena katalogowa produktu dla CAŁEJ firmy, jedyna droga zapisu prowadzi przez moduł Materiały. Żaden przepływ projektowy (karta pozycji, wybór propozycji, przypisanie pozycji z oferty) nie ma prawa jej stemplować — cena projektu mieszka w `MaterialRequirement.budgetedPriceNetto`, cena oferty w `ProductProposal.priceNetto`
- `back-funkcja` uruchamianie testów backendu: `cd apps/backend && npx jest --roots "<abs>/test"`. `ts-jest` leży w `apps/backend/node_modules`, więc podmiana `--rootDir` na korzeń repo psuje rozwiązywanie transformera — wskazuj katalog testów przez `--roots`

## 2026-08-22 — docs(wbs): karty dla węzłów bez własnej + wytyczne do dalszej pracy

### architektura / API

- **Migracja produkcyjna:** 21 kart „niczyich" (`wbsNodeId IS NULL`) podpiętych do węzłów, które i tak z nich korzystały, oraz 15 nowych kart dla węzłów żyjących na cudzej. Nazwa, ilość i jednostka z węzła; typ, cena budżetowa, wymagania techniczne, produkt katalogowy i dostawca skopiowane z karty, na której węzeł dotąd żył. Propozycje produktowe NIE kopiowane — powielenie ofert dublowałoby pozycje po stronie zakupowej. Węzły typu `group` pominięte
- **`docs/PLAN-wbs-karty-i-alokacje.md`** — dokument przekazania: zasady pracy z bazą produkcyjną, stan wdrożenia, otwarte punkty per projekt, model danych (dwa łącza węzeł↔karta, alokacje wielogałęziowe, trzy różne ceny) i błędy sesji do niepowtarzania

### wytyczne

- `schema-pole` `ProjectVersion.isActive` — **bieżącą wersję projektu wyznacza `isActive`, NIGDY `createdAt DESC`.** Projekt trzyma kilka wersji WBS w tych samych tabelach, rozróżnianych `versionId`, a aplikacja pokazuje tę z flagą. W tej sesji wybór po dacie skierował 66 zmian tagów, 2 nowe karty i 1 podpięcie do wersji testowych (RPWIK-Tychy `trzeci testowy`, WZE Zielonki `trzecia versja szafy ZPAS`). Objaw: użytkownik nie widzi u siebie pozycji, o których raportuje asystent
- `schema-relacja` `MaterialRequirement.wbsNodeId` — jest `@unique`, więc podpięcie karty z jednej wersji do węzła z innej ZABIERA kartę wersji, w której użytkownik pracuje. Każde zapytanie łączące karty z węzłami musi trzymać się jednej wersji
- W raportach cytuj nazwy z bazy dosłownie — bez upiększania i bez uzupełniania uciętych końcówek. Nazwy w tym projekcie bywają ucięte, z podwójnymi spacjami i wariantami; opakowuj je w `'[' || name || ']'`

## 2026-08-22 — fix(wbs): wklejony liść dostaje własną kartę produktową (v2026.08.22.878)

### architektura / API

- **Klonowanie węzła nie kopiuje już tagów `req:` ani `auto-requirement`** — `deepCloneNodeWithMappings` robił `{ ...n, id: newId }`, więc tag ze wskaźnikiem na kartę ŹRÓDŁA jechał ze spreadem. Wklejony liść edytował kartę oryginału: wymagania techniczne, status i dostawca lądowały na pozycji, z której kopiowano. Nowy helper `isTagDroppedOnClone` odcina oba tagi przy klonowaniu
- **`clone-for-wbs` dopisuje węzłowi tag jego WŁASNEJ karty** — nowa metoda `retagWbsNodeToRequirement`, odpowiednik kroku 9b z wersjonowania (`versioning.service.ts` remapuje `req:` przy klonowaniu wersji; kopiuj/wklej tego kroku nie miało). Wskaźnik jest poprawny niezależnie od tego, którą drogą klon powstał
- **`clone-for-wbs` kopiuje propozycje produktowe razem z kartą** — nowa metoda `cloneProposalsForRequirement`. Dotąd klon dostawał kartę z ceną budżetową, ale bez propozycji `isOffer`, która tę cenę niesie: pozycja wyglądała na wycenioną w tabeli i pustą w widoku Wycena/Zakup. Na produkcji 135 klonów, źródło miało oferty w 35 przypadkach, klon w 5
- **`handlePasteCloned` kasuje debounce zapisu drzewa po `clone-for-wbs`** — serwer dopisuje wtedy tagi, których lokalne drzewo jeszcze nie zna, więc zapis z debounce'u cofnąłby jego robotę
- **Migracja produkcyjna:** 209 węzłów w najnowszych wersjach projektów przepiętych na własne karty. Zakres: wyłącznie tagi — żadnej ilości, ceny ani treści karty. Wersje archiwalne nietknięte (zamrożony zapis). Węzeł BEZ własnej karty, którego tag wskazuje żywą kartę innego węzła, zostawiony świadomie — zdjęcie tagu odebrałoby mu jedyną kartę, jaką widzi (37 przypadków)
- **Test:** `test/clone-for-wbs.spec.ts` — 9 sprawdzeń obu nowych metod na atrapie prisma

### słownik

- dodano `clone-dropped-tags` — `isTagDroppedOnClone`, tagi odcinane przy klonowaniu węzła, `WBSHybridTable.jsx`
- dodano `deep-clone-node-with-mappings` — `deepCloneNodeWithMappings`, klon gałęzi z mapowaniem id, `WBSHybridTable.jsx`
- dodano `mat-req-clone-proposals` — `cloneProposalsForRequirement`, propozycje jadą z klonowaną kartą, `material-requirements.service.ts`
- dodano `mat-req-retag-wbs-node` — `retagWbsNodeToRequirement`, węzeł dostaje tag własnej karty, `material-requirements.service.ts`

### wytyczne

- `ui-funkcja` `deepCloneNodeWithMappings` — **tag jest WSKAŹNIKIEM, nie wartością.** Kopiowanie węzła przez spread przenosi wskaźniki tak samo jak wartości, więc każde nowe pole typu `req:<id>` w `tags` trzeba świadomie odciąć albo przemapować. Wzorzec: `versioning.service.ts` krok 9b
- `back-endpoint` `POST /material-requirements/clone-for-wbs` — kopia pozycji ma być 1:1 w momencie wklejenia i w pełni niezależna PO nim. Wspólny może zostać produkt katalogowy (`Material`), nigdy pola karty ani propozycje

## 2026-08-22 — ops(backup): dzienny zrzut bazy, procedura odtworzenia i kopia lokalna

### architektura / API

- **`backup-db.sh` — dzienny zrzut produkcyjnej bazy z crona `deploy` (02:30 UTC)**, retencja 30 dziennych + 12 miesięcznych (twardy link, więc miesięczny nie zajmuje miejsca drugi raz). Zrzut pisany do `.part` i dopiero kompletny dostaje docelową nazwę; przed przyjęciem sprawdzany na rozmiar i `gzip -t`. `flock` przeciw nakładaniu się przebiegów. Do tej pory produkcja nie miała ŻADNEGO backupu automatycznego — najnowszy zrzut na serwerze był z 11 czerwca
- **`restore-db.sh` — odtworzenie bazy ze zrzutu bez ładowania go wprost na produkcję.** Zrzut niesie `DROP`-y, więc przerwane ładowanie zostawiłoby produkcję w gruzach bez drogi powrotnej. Skrypt ładuje do bazy obok, porównuje liczby wierszy w tabelach kontrolnych i dopiero sprawną bazę podmienia przez `ALTER DATABASE ... RENAME`. Stara baza zostaje jako `erp_db_przed_odtworzeniem_<ts>` do ręcznego skasowania. Tryb domyślny to PRÓBA — przełącza dopiero `--zapis`
- **`pull-backup.ps1` — kopia zrzutów na komputer lokalny**, z weryfikacją SHA256 względem sumy po stronie serwera i pobieraniem do `.part`. Zrzuty na serwerze leżą na tym samym dysku co baza, więc chronią przed złym zapisem, ale nie przed utratą maszyny
- **`DEPLOY.md` — sekcje ④ (kopie zapasowe) i ⑤ (odtworzenie)** z pełnym runbookiem i komendą odtworzenia wpisu crontaba przy stawianiu serwera od zera

### słownik

- dodano `backup-db-script` — `backup-db.sh`, dzienny zrzut bazy, korzeń repo
- dodano `restore-db-script` — `restore-db.sh`, odtworzenie bazy ze zrzutu, korzeń repo
- dodano `pull-backup-script` — `pull-backup.ps1`, kopia zrzutów na komputer lokalny, korzeń repo

### wytyczne

- `back-skrypt` `backup-db.sh` — cron woła go przez `bash`, nie wprost. Bit wykonywalności ginie przy `git reset --hard` na maszynach z `core.filemode=false`, a cicho niedziałający backup jest gorszy niż jego brak
- **Zapis wprost do produkcyjnej bazy = najpierw zrzut.** Transakcja i próba na sucho nie zastępują punktu przywracania — pokazała to migracja ilości z v877, puszczona bez świeżego backupu
- **Zrzut niesprawdzony to zrzut, którego nie ma** — procedurę odtworzenia ćwicz w trybie próby, nie przy pierwszej awarii
- Pliki PowerShell (`.ps1`) pisz WYŁĄCZNIE w ASCII. PowerShell 5.1 czyta plik bez BOM jako Windows-1252, więc `—` (`E2 80 94`) rozpada się na `â€"`, gdzie bajt `94` to typograficzny cudzysłów domykający string w połowie linii. Skrypt psuje się cicho, w miejscu niezwiązanym z błędem

## 2026-08-22 — fix(wbs): ilość na wierszu WBS nie rośnie o cudzą alokację (v2026.08.22.877)

### architektura / API

- **`PATCH /material-requirements/:id` nigdy nie wpisuje `dto.quantity` wprost na węzeł WBS** — `MaterialRequirement.quantity` to SUMA wszystkich gałęzi, na które pozycja jest rozbita, a węzeł ma dostać wyłącznie swój udział. Nowy prywatny guard `nodeShareFromDto` czyta udział z mapy `wbsNodeAllocations` przysłanej w tym samym PATCH-u; gdy mapy nie ma — ilość dotyczy tego jednego węzła; gdy mapa jest, ale bez tego węzła — węzeł zostaje nietknięty. Bez tego wpisane 450 wracało do tabeli jako 451, bo w mapie wisiał obcy wpis o wartości 1
- **Wybór gałęzi „ile alokacji" idzie po `req.materialId`, nie po id wymagania** — kolumna `WbsNodeMaterial.materialId` wskazuje `materials.id` (migracja `ce75dbe`), więc zapytanie po id wymagania zwracało zawsze 0 wierszy i KAŻDY zapis ilości wpadał w gałąź „bez alokacji", niezależnie od faktycznego rozbicia na gałęzie
- **`syncMaterialsFromWbsNode` faktycznie dowozi ilość do wymagania rozbitego na gałęzie** — `materialRequirement.update({ where: { id: materialId } })` (id materiału w polu id wymagania) nie trafiało w żaden wiersz, a `.catch(() => {})` połykał `P2025`; teraz `updateMany({ where: { materialId } })`
- **Frontend przestał zapisywać ilość drugą, przeciwną drogą** — `syncMaterialRequirementsFromWbsQuantity` obsługuje już wyłącznie DOPIĘCIE wymagania-sieroty (bez relacji 1:1 `wbsNodeId`) i wysyła ilość wprost, nigdy sumy. Wymaganie spięte z tym węzłem dostaje ilość kaskadą po `PATCH /wbs-nodes/:id/budget`; wymaganie spięte z innym węzłem zostaje nietknięte, żeby nie ukraść go sąsiadowi (klon wiersza kopiuje tag `req:`)
- **Dual-write `syncAllocationsToRelational` zdjęty z obu wywołań** — oba podawały id wymagania do kolumny trzymającej `materials.id`, więc `create` leciał na klucz obcy pod `.catch(() => {})`. Funkcja zostaje jako referencja z opisem warunków powrotu
- **Test:** `test/node-share-from-dto.spec.ts` — 7 sprawdzeń guardu, w tym regresja AMP5G (mapa `{obcy: 1, ten: 450}` + `quantity 451` → na węzeł idzie 450)

### słownik

- dodano `mat-req-node-share-from-dto` — `nodeShareFromDto`, udział pojedynczego węzła w ilości wymagania, `material-requirements.service.ts`
- dodano `sync-material-requirements-from-wbs-quantity` — `syncMaterialRequirementsFromWbsQuantity`, dopięcie wymagania-sieroty do węzła WBS, `UnifiedWbsPanel.jsx`

### wytyczne

- `schema-pole` `MaterialRequirement.wbsNodeAllocations` — pole jest `@deprecated` i NIE jest wiarygodne: potrafi trzymać wpisy węzłów, które dawno mają własną ilość. Nie licz z niego sum, które trafią na `WbsNode.quantity`
- `back-funkcja` `nodeShareFromDto` — jedyna droga zamiany ilości z PATCH-a wymagania na wartość dla węzła WBS. Nowy zapis na `WbsNode.quantity` z poziomu `material-requirements` MUSI przejść przez ten guard
- `schema-pole` `WbsNodeMaterial.materialId` — trzyma `materials.id`, NIE id wymagania. Każde zapytanie do tej tabeli z poziomu `material-requirements` idzie przez `req.materialId`
- `back-serwis` — nie owijaj zapisów w `.catch(() => {})`. Trzy ciche połykacze utrzymały niedokończoną migrację `ce75dbe` przy życiu przez pół roku i to one przekierowały zapis ilości w złą gałąź

## 2026-08-20 — feat(realizacja): pola tekstowe w wierszu zakupu rosną razem z treścią (v2026.08.20.876)

### architektura / API

- **Pola TEKSTOWE wpisu realizacji renderują się jako `AutoResizeTextarea`, nie `input`** — komentarz, producent, model, EAN, numer dokumentu i zakres rosną do wysokości treści, więc cały wpis widać naraz. Kolumny są wąskie, a jednolinijkowy `input` chował nadmiar za krawędzią: żeby przeczytać własny komentarz, trzeba było przewijać tekst kursorem wewnątrz pola. Dotyczy obu miejsc: wiersza zapisanego wpisu (`RealizationEntryLine`) i formularza nowego zakupu (`RealizationEntryForm`)
- **Jednolinijkowe zostają wyłącznie pola o z góry znanej długości** — data i liczby (ilość, koszt jedn.). Decyduje o tym jedna funkcja `growsWithText`, więc nowe pole wpisu jest domyślnie rosnące, a wyjątek trzeba dopisać świadomie
- **Enter dalej idzie do następnego okna wiersza, nie łamie linii** — `onKey` robi `preventDefault`, więc zamiana `input` na `textarea` nie zmienia trasy klawiatury. Tekst zawija się sam i tak rośnie pole
- **`AutoResizeTextarea` składa `onFocus` wołającego z własnym przeliczeniem wysokości** — dotąd `{...rest}` szedł na końcu i po cichu podmieniał handler, więc pole otwarte na już wpisanej treści (wpisy realizacji zaznaczają całą treść na focus) zostawałoby jednolinijkowe
- **Test:** `test/test-realization-render.mjs` — doszły 3 sprawdzenia (tekst wchodzi do textarei jako zawartość, pola tekstowe są textareami, data i liczby zostają `input`ami)

### słownik

- dodano `realization-entry-growing-fields` — `growsWithText`, które pola wpisu rosną z treścią, `RealizationTab.jsx`

### wytyczne

- `ui-input` — **pole tekstowe w tabeli ma rosnąć z treścią**, nie chować jej za krawędzią: używaj `AutoResizeTextarea`, a jednolinijkowy `input` zostawiaj wyłącznie dla wartości o z góry znanej długości (data, liczba, kod). Dotyczy każdej edytowalnej kolumny tekstowej, nie tylko komentarza
- `ui-propsy` `AutoResizeTextarea` — handlery przekazywane przez `{...rest}` NADPISUJĄ własne handlery komponentu (spread stoi na końcu). Każdy nowy handler, który komponent obsługuje sam, wyciągaj do destrukturyzacji i składaj ręcznie

## 2026-08-20 — feat(realizacja): pole kosztu jedn. i ilości w karcie zakupu przyjmuje działania matematyczne (v2026.08.20.875)

### architektura / API

- **Pola liczbowe wpisu realizacji (`qty`, `unitCost`) liczą DZIAŁANIE** — „=4,3*220" zapisuje się jako 946. Liczy je `parsePriceInput` z `wbsConstants`, czyli ta sama droga co w Budżecie i panelu Materiały — ten sam zapis znaczy w całej aplikacji to samo. Dotyczy OBU miejsc: formularza nowego zakupu i edycji zapisanego wpisu w dzienniku
- **Do backendu idzie WYNIK, nie zapis działania** — `LeafActualsService` czyta liczby `parseFloat`em, więc surowe „=4,3*220" dawało `NaN`: przy cenie ciche `unitCost = 0`, przy ilości odrzucony zapis („Ilość musi być większa od zera"). Formularz (`resolveEntryNumber` w `submit`) i wiersz wpisu (`commit`) rozwiązują działanie PRZED wysłaniem, więc backend zostaje bez zmian
- **Niedokończone działanie („=4,3*") nie zapisuje się w ogóle** — tekst zostaje w polu do poprawki, zamiast zamienić się w 0 zł. W formularzu pole podświetla się na czerwono, a komunikat mówi teraz „Uzupełnij lub popraw: …", bo pole bywa niepuste, tylko nieprzeliczalne
- **Podgląd „Wartość" liczy się na bieżąco z działania** — kwota pod ilością × kosztem pokazuje wynik jeszcze przed zapisem, więc widać, co się właśnie policzyło
- **Dymek nad polem** (`FORMULA_HINT`) mówi o możliwości wpisania działania — kolumna jest wąska, a podpowiedź w placeholderze zasłaniałaby wpisywaną treść
- **Test:** `test/test-realization-formula.mjs` — 16 sprawdzeń: parser (`=4.3* 220` → 946, przecinek dziesiętny, nawiasy, dzielenie, zero jako cena, niedokończone działanie → `null`) oraz droga wartości w `RealizationTab`

### słownik

- dodano `realization-entry-numeric-fields` — `NUMERIC_ENTRY_FIELDS`, pola wpisu niosące liczbę (`qty`, `unitCost`), `RealizationTab.jsx`
- dodano `realization-entry-formula` — `resolveEntryNumber`, zamiana działania na wynik przed zapisem, `RealizationTab.jsx`
- dodano `realization-formula-hint` — `FORMULA_HINT`, dymek nad polem liczbowym wpisu, `RealizationTab.jsx`
- zmieniono `realization-missing-labels` — komunikat to teraz „Uzupełnij lub popraw: …"

### wytyczne

- `ui-input` — każde pole przepuszczone przez `sanitizeQtyInput` MUSI po drugiej stronie przejść przez `parsePriceInput` przed wysłaniem. Sanitizer świadomie przepuszcza „=" i znaki matematyczne, więc bez przeliczenia surowy zapis działania dolatuje do backendu, gdzie `parseFloat` robi z niego `NaN` → zapisane 0

## 2026-08-19 — fix(materialy): zdjecie pozycji wraca na liste + kosz i lupka na kaflu karty produktu (v2026.08.19.874)

### architektura / API

- **`findByNode` gubiło zdjęcie POZYCJI** — mapper listy spłaszczał `imageUrl: item.material?.imageUrl ?? null`, czyli brał wyłącznie obrazek katalogowy i wyrzucał `MaterialRequirement.imageUrl`. Panel Materiały karmi karty właśnie z tej listy, a kafel zdjęcia pobiera obrazek dopiero, gdy `card.imageUrl` jest niepuste — więc zdjęcie wgrane do pozycji bez materiału z katalogu NIE pokazywało się w karcie produktu. Teraz kolejność jest ta sama co w `findOne`: własny obrazek pozycji → katalogowy
- **Kafel zdjęcia w `ProductCard` został bez zmian** (klik = wybór pliku, najechanie + Ctrl+V = wklejenie, ten sam efekt pobierania) — doszły do niego tylko dwa przyciski widoczne po najechaniu: lupka otwiera `ImageLightbox` w pełnej rozdzielczości, kosz kasuje obrazek pozycji (katalogowy zostaje i wraca jako fallback). Wcześniejsza próba podmiany całego kafla na `RequirementImageBox` (v873) została wycofana
- **`ImageLightbox` zatrzymuje klik w tło** — portal ląduje w `body`, ale zdarzenia Reacta bąbelkują po drzewie KOMPONENTÓW, a lightbox renderuje się wewnątrz klikalnego kafla: bez `stopPropagation` zamknięcie podglądu otwierało okno wyboru pliku

### słownik

- dodano `product-card-image-actions` — kosz i lupka na kaflu zdjęcia karty produktu, `WbsMaterialsPanel.jsx`

### wytyczne

- `back-funkcja` `findByNode` — mapper listy i `findOne` MUSZĄ spłaszczać te same pola w tej samej kolejności. Rozjazd między nimi jest niewidoczny w testach endpointu (oba zwracają 200) i wychodzi dopiero jako puste pole w UI, bo front kieruje się wartością z listy
- `ui-ikona` `product-card-image-actions` — każdy przycisk na kaflu zdjęcia MUSI mieć `e.stopPropagation()`: klik w kafel jest podpięty pod otwarcie okna wyboru pliku

## 2026-08-19 — fix(uprawnienia): logistyk nie widzi liści innych niż materiał i sprzęt w ŻADNYM widoku (v2026.08.19.872)

### architektura / API

- **Filtr siedzi w `WbsNodesService`, nie w komponentach** — `getUnifiedTree` i `getTree` przepuszczają odpowiedź przez `visibleForCaller()`, które dla ról spoza ADMIN/MANAGER zdejmuje liście typu `work`, `service`, `lodging`, `fuel`. Z tego jednego drzewa żyją WSZYSTKIE widoki liści (WBS/Planowanie, WBS/Materiały, Realizacja, Gantt, QA, Schemat, Dokumentacja, Listy materiałowe logistyka, eksporty PDF i Excel), więc zawężenie w jednym miejscu zamyka je naraz — i przeżywa zakładkę „Sieć" w narzędziach deweloperskich, czego filtr w przeglądarce nie potrafi
- **`CLOSED_LEAF_TYPES` liczone z różnicy `ALL_LEAF_TYPES` − `OPEN_LEAF_TYPES`**, nie wpisane ręcznie: nowy typ liścia jest domyślnie zamknięty. Pominięcie go w `OPEN_LEAF_TYPES` ma znaczyć „nie pokazuj", a nie „pokaż wszystkim"
- **Węzeł zamkniętego typu, który ma widoczne dzieci, ZOSTAJE — ale z wyzerowanymi kwotami** (`stripMoney`). Usunięcie go osierociłoby materiały pod nim: frontend buduje hierarchię po `parentId` i takie poddrzewo znika bez śladu. Filtr chodzi w pętli, więc gdy wypadnie ostatnie widoczne dziecko, wypada i rodzic
- **`saveTree` nie kasuje tego, czego autor zapisu nie widział** — strategia zapisu to „usuń wszystko, czego nie ma w przysłanym drzewie", a nie-manager dostaje drzewo bez ukrytych liści i odsyła je przy każdej edycji struktury. Bez tego wyjątku PIERWSZY zapis logistyka skasowałby całą pracę, usługi, noclegi i paliwo razem z ich budżetem
- **Brak roli w kontekście = widok zawężony** (fail-closed) — `seesClosedLeaves()` czyta role z CLS (`user.roles`, ustawiane przez `JwtAuthGuard`); pusty kontekst daje widok najwęższy, nie najszerszy
- **`WbsMaterialsPanel` dostał prop `userRoles`** i buduje `matNodes` z `OPEN_LEAF_TYPES` — zawężenie po stronie UI zostaje jako druga warstwa (ten sam wzorzec co `visibleTypes` w `RealizationTab`). Rolę podają obie drogi wejścia do panelu: `UnifiedWbsPanel` (zakładka „Planowanie") i `LogistykaMaterialListsTab` (obszar Logistyka)
- **Bez zmian, bo już filtrowały po roli:** `/orders/:id/comparison` (`comparison-role-filter`), `/leaf-actuals/order/:nodeId` (`leaf-actuals-role-filter`), zakładka Realizacja
- **Test:** `test/wbs-role-filter.test.mjs` — 16 sprawdzeń na prawdziwym `WbsNodesService` z `dist/` (atrapy Prisma i CLS): widoczność dla managera/logistyka/pracownika, grupy i osierocenia, zerowanie kwot, oba kierunki `saveTree`

### słownik

- dodano `ALL_LEAF_TYPES`, `CLOSED_LEAF_TYPES`, `isClosedLeafType` — `common/leaf-types.util.ts`
- dodano `wbs-nodes-sees-closed-leaves`, `wbs-nodes-visible-for-caller`, `wbs-nodes-strip-money`, `wbs-nodes-save-tree-hidden-guard` — `wbs-nodes.service.ts`
- dodano `wbs-materials-visible-types` — filtr typów liści po roli w panelu Materiały, `WbsMaterialsPanel.jsx`

### wytyczne

- `back-funkcja` `saveTree` — zapis metodą „skasuj wszystko, czego nie ma w przysłanym drzewie" MUSI pytać, ile z tego drzewa autor zapisu w ogóle widział. Każde nowe zawężenie odpowiedzi `getUnifiedTree` po roli wymaga bliźniaczego wyjątku w `idsToDelete`, inaczej zawężenie zamienia się w kasowanie danych
- `back-stala` `CLOSED_LEAF_TYPES` — nowy typ liścia dopisuj do `ALL_LEAF_TYPES` (i do `LEAF_TYPES` w `realizationShared.js`). Do `OPEN_LEAF_TYPES` tylko wtedy, gdy świadomie ma go oglądać każda rola
- `ui-propsy` `WbsMaterialsPanel.userRoles` — brak propa znaczy „rola nieznana", a nie „manager": domyślne `[]` daje widok zawężony. Nowe osadzenie panelu musi świadomie podać role, inaczej pokaże mniej, a nie więcej

## 2026-08-18 — fix(auth): rola czytana z tokenu TEJ karty, nie ostatniego logowania w profilu (v2026.08.18.871)

### architektura / API

- **`activeToken()`** w `App.jsx` — jedno miejsce, z ktorego straznik tras administracyjnych i wylogowanie biora token. Kolejnosc `sessionStorage` → `localStorage`, czyli ta sama co w calej reszcie aplikacji (16 plikow)
- **Objaw:** admin klikal „Uzytkownicy" i dostawal „Brak dostepu", mimo ze wszystkie zapytania do API szly poprawnie jako admin. `tokenRoles()` czytalo `localStorage` PRZED `sessionStorage`, a `localStorage` jest wspolny dla calego profilu przegladarki i logowanie zapisuje do OBU magazynow. Wystarczylo zalogowac sie na drugie konto w sasiednim oknie, zeby okno admina zaczelo raportowac cudza role
- **Ten sam blad w `doLogout`** — wylogowanie zdejmowalo subskrypcje push tego, kto zalogowal sie ostatni, a nie tej karty. Oraz w `MobileDashboard`, gdzie odwrocona kolejnosc decydowala, czyje zadania sie ladują
- Backend nie byl w to zamieszany: JWT niesie `roles` poprawnie, a straznik po stronie serwera dziala niezaleznie — to byla wylacznie zla tozsamosc po stronie UI

### slownik

- dodano `activeToken` — token biezacej karty, jedno zrodlo dla straznika i wylogowania, `App.jsx`

### wytyczne

- `ui-funkcja` `activeToken` — token czytaj ZAWSZE `sessionStorage` przed `localStorage`. `sessionStorage` jest per-karta i niesie tozsamosc TEGO okna, `localStorage` jest wspolny dla profilu i niesie tozsamosc ostatniego logowania gdziekolwiek. Odwrotna kolejnosc daje bledy, ktore wygladaja jak problem z uprawnieniami w bazie, a sa problemem z tym, czyj token wlasnie przeczytano

## 2026-08-18 — feat(powiadomienia): push do logistyka o pierwszym „Dodatkowym zamowieniu" w zamowieniu (v2026.08.18.870)

### architektura / API

- **`ExtraOrderNotifierService`** (`notifications/extra-order-notifier.service.ts`) — gdy pozycja WCHODZI w status `EXTRA_ORDER`, logistycy zamowienia dostaja push i wpis w dzwonku. Wolany z dwoch miejsc, bo status ma dwie drogi zapisu: `MaterialRequirementsService.update/create` (karta) i `WbsNodesService.updateNode` (wezel WBS)
- **RAZ NA ZAMOWIENIE, nie raz na pozycje.** Domowienie idzie zwykle seria — brakło dziesieciu rzeczy z jednej dostawy — i push per pozycja zamienilby kanal w spam, ktorego logistyk przestanie czytac. Progiem jest istniejacy wpis `Notification` typu `EXTRA_ORDER` dla tego `orderId`, wiec przezywa restart backendu BEZ dokladania kolumny do schematu. Ten sam warunek zalatwia przy okazji podwojny zapis z UI: drugie zadanie widzi juz wpis
- **Reaguje na WEJSCIE w status, nie na stan zastany** — `statusBefore` czytany przed zapisem. UI zapisuje pole statusu przy okazji innych zmian, wiec bez tego kazdy zapis pozycji, ktora juz ma ten status, generowalby powiadomienie
- **Brak odbiorcow to NIE jest „wyslane"** — gdy nikt nie pasuje, swiadomie nie powstaje wpis progowy. Inaczej prog zamknalby sie na zamowieniu, o ktorym nikt sie nie dowiedzial, i pozniejsze nadanie uprawnien logistykowi juz nic by nie dalo. W logu zostaje ostrzezenie z id zamowienia
- **Odbiorca: „LOGISTYK z dostepem do wezla lub jego przodka, bezposrednio ALBO przez zespol".** Gałąź zespolowa nie jest ozdobnikiem — zmierzone na bazie dev (`test/extra-order-recipients.mjs`): reguła liczaca wylacznie `NodePermission.userId` dawala **0/34** zamowien z odbiorca, bo user-owe wpisy na zamowieniach to prawie wylacznie kontakty zewnetrzne (rola USER) z `addProjectContact`, a etatowy logistyk ma dostep przez zespol („Services", „Systems"). Z zespolami: **23/34**. Pozostale 11 zamowien siedzi pod obszarami, ktorych zespoly nie obejmuja — te nie powiadomia nikogo i mowi o tym log
- **Globalny wylacznik `SystemNotificationSettings.webPushEnabled` gasi WYLACZNIE pusha** — wpis w dzwonku zostaje, bo to osobny kanal i wylaczenie Web Push nie znaczy „nie informuj mnie w ogole"
- **Link prowadzi do WBS → Materialy tego zamowienia.** Payload niesie `tab: 'unified'` i `section: 'materials'`; service worker przenosi je do `notification.data`, przekazuje w `NAVIGATE_TO_ORDER` przy otwartej aplikacji i doklada do query przy zimnym starcie
- **Dwie dziury w nawigacji push zaslepione przy okazji** — obie sprzed tej zmiany: (1) `App.jsx` rozglaszal zdarzenie `push-navigate-order`, ktorego NIKT nie sluchal, wiec klikniecie w push przy otwartej aplikacji dawalo tylko focus i zostawialo uzytkownika tam, gdzie byl; (2) `openWindow('/?orderId=…')` przy zimnym starcie prowadzil donikad, bo zaden kod nie czytal tego parametru
- **Poprawiona zakladka w dzwonku** — `MainLayout` ustawial `tab: 'materials'` dla powiadomien o pozycji, a takiej zakladki w `DashboardPage` nie ma (sa `requirements`, `unified`, `materialLists`, `offers`, `realization`, …). `setActiveTab` dostawal nazwe, ktorej nikt nie renderuje. Teraz `unified` + sekcja `materials`
- **Bez migracji bazy** — nowy typ powiadomienia to zwykly string w `Notification.type`, a odbiorcow liczymy z istniejacych `NodePermission`, `ProcessNodeClosure` i przynaleznosci do zespolu

### slownik

- dodano `ExtraOrderNotifierService` — powiadomienie o dodatkowym zamowieniu, `extra-order-notifier.service.ts`
- dodano `EXTRA_ORDER_STATUS` — kod statusu wyzwalajacego, `extra-order-notifier.service.ts`
- dodano `EXTRA_ORDER_NOTIFICATION_TYPE` — typ wpisu i zarazem prog deduplikacji, `extra-order-notifier.service.ts`
- dodano `resolveOrderNodeId` — wspinaczka do wezla `type='order'`, `extra-order-notifier.service.ts`
- dodano `logisticiansForOrder` — odbiorcy: rola + uprawnienie wlasne lub zespolowe, `extra-order-notifier.service.ts`
- dodano `mat-req-extra-order-hook` — wykrycie wejscia w status na karcie, `material-requirements.service.ts`
- dodano `wbs-node-extra-order-hook` — wykrycie wejscia w status na wezle, `wbs-nodes.service.ts`
- dodano `pendingSectionRef` — sekcja do rozwiniecia po nawigacji, `MainLayout.jsx`
- dodano `pushNavigateListener` — obsluga klikniecia w push przy otwartej aplikacji, `MainLayout.jsx`
- dodano `pushColdStartNavigate` — obsluga klikniecia przy zamknietej aplikacji, `MainLayout.jsx`
- dodano `pendingWbsSection` — sekcja przekazywana do panelu WBS, `DashboardPage.jsx`
- dodano `initialSection` — sekcja rozwijana raz po wejsciu z powiadomienia, `UnifiedWbsPanel.jsx`

### wytyczne

- `back-funkcja` `logisticiansForOrder` — regule „kto jest przypisany do wezla" WERYFIKUJ na danych, zanim ja zakodujesz. Wersja po samym `NodePermission.userId` kompilowala sie, przechodzila typy i dawala zero odbiorcow na wszystkich 34 zamowieniach; feature milczalby, a nikt by nie wiedzial dlaczego. Uprawnienia user-owe na zamowieniach to w tym systemie kontakty zewnetrzne, dostep etatowy idzie przez zespol
- `back-serwis` `ExtraOrderNotifierService` — prog „raz na X" opieraj na wpisie, ktory i tak powstaje (`Notification`), a nie na pamieci procesu ani nowej kolumnie. Pamiec ginie przy restarcie, kolumna wymaga migracji na produkcji
- `back-serwis` `ExtraOrderNotifierService` — gdy nie ma do kogo wyslac, NIE zamykaj progu. Zapisany prog bez dostarczonej wiadomosci to cicha strata: pozniejsza naprawa uprawnien nic juz nie odblokuje
- `ui-funkcja` `pushNavigateListener` — powiadomienie musi niesc CEL (`tab`, `section`), nie tylko identyfikator obiektu. Sam `orderId` otwiera zamowienie na ostatnio ogladanej zakladce, czyli prowadzi donikad w polowie przypadkow

## 2026-08-18 — feat(status): osobna lista statusow dla lisci praca / usluga / nocleg / paliwo + status startowy „Nowy" dla wszystkich (v2026.08.18.869)

### architektura / API

- **Statusy pozycji rozdzielone na DWA rozlaczne slowniki.** Dotad wszystkie liscie — od switcha po dzien pracy ekipy — dzielily jedna liste materialowa (Oczekuje → Propozycja → Potwierdzone → Zamowione → Na magazynie → Wydane → Zainstalowane). Ta lista opisuje droge TOWARU przez zakup i magazyn; robocizna, usluga obca, nocleg i paliwo zadnej z tych faz nie maja. Nie da sie „zamowic na magazyn" dnia pracy ani „wydac z magazynu" przejechanych kilometrow
- **Nowy slownik dla `work`, `service`, `lodging`, `fuel`** — szesc kodow, w tej kolejnosci: `NEW` „Nowe", `STARTED` „Rozpoczete", `ON_HOLD` „Wstrzymane", `COMPLETED` „Zakonczone", `UNFINISHED` „Nieskonczone", `CANCELLED` „Odwolane". Trzy ostatnie celowo sie nie sklejaja: „Zakonczone" = plan wykonany, „Nieskonczone" = przerwane przed meta, „Odwolane" = nigdy nie ruszylo
- **`NEW` to status startowy KAZDEJ nowej pozycji — takze materialu i sprzetu.** Snapshot bez zaakceptowanego baseline to zamowienie, w ktorym pozycje dopiero powstaly. Materialowe „Oczekuje" mowilo tam co innego — „czeka na oferte dostawcy", czyli ktos juz ruszyl — i bylo nieprawda przez pierwsze tygodnie zycia kazdej pozycji. `defaultStatusForType` zwraca `NEW` dla wszystkich typow, a `mkNode` bierze typ i pyta o status wlasnie ja, wiec automatyczny lisc Paliwo i galaz gwarancyjna tez rodza sie jako nowe
- **`NEW` to JEDYNY kod wspolny obu slownikom.** „Dopiero powstala" znaczy to samo nad switchem i nad dniem pracy ekipy, wiec rozdzielanie tego na dwa kody kazaloby kazdemu odczytowi pytac o typ, zanim odpowie „czy to nowe". Rozni sie tylko etykieta, bo rozni sie rodzaj rzeczownika: **„Nowy"** materiał i sprzet, **„Nowe"** praca, usluga, nocleg i paliwo. Pozostale kody pozostaja rozlaczne — inaczej jedna wartosc w kolumnie `WbsNode.status` znaczylaby dwie rzeczy zaleznie od typu wiersza
- **Karta materialowa (`MaterialRequirement`) tez startuje jako `NEW`.** W panelu Materialy kolumna Status nad materialem i sprzetem edytuje status KARTY, nie wezla — bez tej zmiany swiezo utworzony lisc pokazywalby „Nowy" w WBS i „Oczekuje" w Materialach. Objete wszystkie trzy sciezki tworzenia: reczna (`create`), klon listy i ekstrakcja AI. Status nadawany w KODZIE, nie kolumnowym `@default` — zmiana defaultu w schemacie wymaga migracji na produkcji, a kazda sciezka i tak przechodzi przez ten kod
- **Jedno zrodlo prawdy, cztery konsumentow.** `wbsConstants` oddaje `statusMetaForType` / `statusOptionsForType` / `statusLabelForType` / `resolveStatusCode`; WBS, Realizacja, Materialy i eksporty pytaja o mape wlasciwa dla typu zamiast trzymac wlasna kopie. Poprzednim razem to wlasnie piata kopia listy kazala drukowac surowy kod zamiast nazwy
- **Bez migracji bazy i bez ruszania produkcyjnych rekordow.** `WbsNode.status` to `String` bez enuma i bez whitelisty w backendzie, a nowe kody sa rozlaczne z materialowymi. Lisc pracy, ktory ma dzis w bazie `PENDING` albo `ORDERED`, POKAZUJE sie jako „Nowe" (`resolveStatusCode`), a dopiero reczna zmiana utrwala kod z nowego slownika
- **Kolumna „Status" w panelu Materialy przestala byc martwa nad ta czworka.** Material i sprzet edytuja status KARTY (`MaterialRequirement.status`), praca / usluga / nocleg / paliwo — status WEZLA (`WbsNode.status`), bo karty nie maja i do tej pory widnialo tam „—". Szukajka, filtr kolumny, sortowanie i eksport XLS ida przez wspolne `rowStatusLabel`, wiec widza dokladnie to, co komorka
- **Eksport budzetu XLS drukowal surowy kod** w kolumnie Status („PENDING" jechalo do klienta) — teraz etykiete, przez `getStatusLabel` swiadome typu
- `normalizeStatusCode` czyta etykiety OBU slownikow, wiec import z arkusza rozumie „Rozpoczete" tak samo jak „Zamowione"
- Testy: `test/status-work-leaves.mjs` 80/80 (czysty node, bez backendu), `test/status-dropdowns.html` 20/20 w przegladarce — w tym PRAWDZIWY `StatusSelect` z `type="work"` i wartoscia `ORDERED` z bazy, ktory renderuje szesc opcji i pokazuje „Nowe". Backend `tsc --noEmit` czysty, `vite build` przechodzi

### slownik

- dodano `NEW` — status startowy kazdej nowej pozycji, „Nowy" po stronie materialowej, `wbsConstants.js`
- dodano `WORK_STATUS_LEAF_TYPES` — typy lisci objete nowym slownikiem, `wbsConstants.js`
- dodano `WORK_STATUS_LABELS` — szesc etykiet, jedno zrodlo, `wbsConstants.js`
- dodano `WORK_STATUS_META` — etykiety + kolory, kolejnosc opcji w dropdownie, `wbsConstants.js`
- dodano `WORK_STATUS_LABEL_TO_CODE` — etykieta → kod przy imporcie, `wbsConstants.js`
- dodano `DEFAULT_STATUS_NEW` — stan startowy liscia niematerialnego, `wbsConstants.js`
- dodano `usesWorkStatuses` — czy typ liscia idzie nowym slownikiem, `wbsConstants.js`
- dodano `defaultStatusForType` — status nowo tworzonej pozycji, `wbsConstants.js`
- dodano `statusMetaForType` — mapa statusow wlasciwa dla typu, `wbsConstants.js`
- dodano `resolveStatusCode` — obcy kod z bazy → „Nowe", bez zapisu, `wbsConstants.js`
- dodano `statusLabelForType` — etykieta dla komorki, filtra i eksportu, `wbsConstants.js`
- dodano `statusOptionsForType` — kody do wyboru w dropdownie, `wbsConstants.js`
- dodano `WORK_STRUCT_STATUS_META` — plakietkowa kopia slownika w tabeli WBS, `WBSHybridTable.jsx`
- dodano `structStatusMetaFor` — plakietki wlasciwe dla typu liscia, `WBSHybridTable.jsx`
- dodano `mkNode` — nowy wezel WBS, typ decyduje o statusie startowym, `WBSHybridTable.jsx`
- dodano `rowStatusLabel` — etykieta statusu wiersza: karta albo wezel, `WbsMaterialsPanel.jsx`
- dodano `getStatusLabel` — etykieta statusu swiadoma typu pozycji, `UnifiedWbsPanel.jsx`

### wytyczne

- `ui-stala` `WORK_STATUS_LABELS` — kody nowego slownika MUSZA pozostac rozlaczne z materialowymi. `WbsNode.status` to jedna kolumna `String` bez enuma; powtorzony kod znaczylby dwie rozne rzeczy zaleznie od typu wiersza i nie dalby sie odczytac z samej bazy
- `ui-funkcja` `resolveStatusCode` — KAZDY odczyt statusu liscia (komorka, filtr, sortowanie, PDF, XLS) idzie przez slownik wlasciwy dla typu. Pominiecie choc jednego miejsca wypuszcza surowy kod z bazy na ekran albo do arkusza u klienta — dokladnie to zdarzylo sie przy `EXTRA_ORDER`
- `ui-funkcja` `resolveStatusCode` — zmiana slownika statusow rozwiazywana w ODCZYCIE, nie migracja bazy. Dane produkcyjne zostaja nietkniete, a pierwszy reczny wybor utrwala nowy kod; migracja zapisalaby domysl narzedzia jako decyzje uzytkownika
- `ui-stala` `NEW` — kod wspolny obu slownikom, ale etykieta osobna per slownik. Wspolny kod dlatego, ze „dopiero powstala" nie zalezy od typu pozycji; osobna etykieta dlatego, ze polszczyzna zalezy („Nowy" materiał, „Nowe" praca). Kazdy nowy status wspoldzielony miedzy slownikami wymaga tego samego uzasadnienia — inaczej wracamy do jednej listy dla wszystkiego
- `schema-pole` `MaterialRequirement.status` — status startowy nadawaj w KODZIE serwisu, nie kolumnowym `@default`. Kolumnowy default wymaga migracji na produkcji, a i tak nie zadziala, bo kazda sciezka tworzenia karty przekazuje status jawnie. `@default("PENDING")` w schemacie zostaje jako martwy zapis — nie sugerowac sie nim przy czytaniu kodu

## 2026-08-17 — feat(monitoring): serwer wykrywa cisze w naplywie zalacznikow i alarmuje adminow push (v2026.08.17.867)

### architektura / API

- **`NotificationCronService.checkAttachmentSilence()`** — codziennie o 7:00 sprawdza `marker_attachments`. Jesli przez `ATTACHMENT_SILENCE_DAYS` (7) nie dotarl ANI JEDEN zalacznik, a w poprzedzajacych `ATTACHMENT_BASELINE_DAYS` (60) cos przychodzilo — push do wszystkich aktywnych uzytkownikow z rola ADMIN
- **Powod istnienia:** awaria z 15 lipca zyla MIESIAC, bo nikt nie zauwazyl, ze zdjecia przestaly przychodzic. Wszystkie pozostale zabezpieczenia (banner, licznik prob, kafelek osieroconych) siedza na TELEFONIE — ten jeden jest po stronie serwera i dlatego zadziala niezaleznie od tego, co sie zepsulo: blad klienta, proxy, nieudany deploy. Stroz nie moze dzielic losu z tym, czego pilnuje
- **Warunek baseline** chroni przed alarmowaniem na instalacji, ktora po prostu nie uzywa zalacznikow — bez niego swieza baza krzyczalaby codziennie
- **Alarm w 7. dniu ciszy, potem co tydzien** (`mod(dniCiszy, 7) = 0`), nie codziennie. Codzienny nag przy awarii ciagnacej sie tygodniami uczy adminow odklikiwac powiadomienia bez czytania, czyli psuje kanal, na ktorym nam zalezy
- **Bez zmian w schemacie** — reuzywa istniejacego `SystemNotificationSettings.webPushEnabled` jako globalnego wylacznika, wiec zadnej migracji na produkcji
- Zweryfikowane na danych z prawdziwego incydentu: symulacja detektora dzien po dniu na oknie 16.07–17.08 pokazuje alarm **23 lipca** (8 dni po awarii, zamiast miesiaca) i przypomnienia 30.07, 06.08, 13.08

### slownik

- dodano `notification-cron-attachment-silence` — detektor ciszy w naplywie zalacznikow, `notification-cron.service.ts`
- dodano `attachment-silence-days` — prog ciszy w dniach, `notification-cron.service.ts`
- dodano `attachment-baseline-days` — okno dowodu, ze wczesniej cos przychodzilo, `notification-cron.service.ts`

### wytyczne

- `back-funkcja` `checkAttachmentSilence` — monitoring przeplywu danych MUSI stac po stronie serwera, nie klienta. Sygnal wysylany przez aplikacje, ktora sama moze byc zepsuta, milczy dokladnie wtedy, kiedy jest najbardziej potrzebny
- `back-funkcja` `checkAttachmentSilence` — kazdy detektor ciszy potrzebuje warunku baseline (czy wczesniej w ogole cos bylo) oraz ograniczenia czestotliwosci przypomnien. Bez pierwszego alarmuje na pustej instalacji, bez drugiego uczy adminow ignorowac alerty

## 2026-08-17 — feat(mobile): ostrzezenie „zdjecia nie wysylaja sie" + limit prob w kolejce (v2026.08.17.866)

### architektura / API

- **Pole `retries` w wpisie outboxa wreszcie cokolwiek robi.** `enqueue()` zapisywalo `retries: 0` od poczatku istnienia kolejki i NIC tego nigdy nie czytalo ani nie zwiekszalo — w calym froncie bylo to jedyne wystapienie tego slowa. Teraz kazda nieudana proba wywoluje `bumpRetry()`, ktory podbija licznik i zapamietuje `lastError` oraz `lastTriedAt`
- **`SyncWarningBanner`** w obu widokach mobilnych (`MobileHome`, `MobileDashboard`). Po `WARN_AFTER_RETRIES` (3, czyli ~3 min przy syncu co 60 s) mowi wprost, ze zdjecia nie ida na serwer, pokazuje liczbe plikow, liczbe prob i ostatni blad, oraz uspokaja, ze pliki sa bezpieczne na telefonie i nie wolno kasowac aplikacji. Przycisk „Ponow" zeruje licznik i odpala sync od razu
- **Offline nie jest awaria** — bez sieci banner jest szary i mowi „czekaja na zasieg, nic nie ginie", zamiast straszyc czerwonym alertem technika w terenie bez zasiegu
- **Limit prob domyka druga dziure z tej samej rodziny.** Zalacznik wskazujacy na REALNE, ale skasowane id markera lecial dotad w kolko: pelne zdjecie na serwer co 60 s, w nieskonczonosc, bez sladu dla uzytkownika — flaga `orphaned` lapala wylacznie martwe `temp_`. Po `MAX_RETRIES` (6) wpis jest oznaczany `orphaned`, znika z petli i trafia do kafelka „Niewyslane zdjecia" razem z reszta
- Powod istnienia tego wszystkiego: zdjecie, ktore NIE przechodzi, wygladalo dokladnie tak samo jak zdjecie czekajace na zasieg — ⏳ przy miniaturze i cisza. Blad z 15 lipca zyl miesiac wlasnie dlatego, ze nic nie odrozniało jednego od drugiego

### slownik

- dodano `warn-after-retries` — prog ostrzezenia uzytkownika, `outboxRepo.js`
- dodano `max-outbox-retries` — prog trwalego zablokowania wpisu, `outboxRepo.js`
- dodano `bump-outbox-retry` — licznik nieudanych prob + ostatni blad, `outboxRepo.js`
- dodano `get-stuck-attachments` — zalaczniki po progu ostrzezenia, `outboxRepo.js`
- dodano `reset-outbox-retries` — zerowanie licznika przy recznym ponowieniu, `outboxRepo.js`
- dodano `sync-warning-banner` — ostrzezenie o braku synchronizacji, `SyncWarningBanner.jsx`
- dodano `sync-warning-retry-now` — reczne ponowienie z bannera, `SyncWarningBanner.jsx`

### wytyczne

- `ui-funkcja` `syncOutbox` — kazda nieudana proba MUSI zostawic slad w wpisie (`retries`, `lastError`). Bez tego nie da sie odroznic „czeka na zasieg" od „leci w kolko i nigdy nie przejdzie", a to jest dokladnie ta roznica, ktora ukryla awarie zalacznikow na miesiac
- `ui-sekcja` `SyncWarningBanner` — brak sieci to NIE jest awaria i nie moze wygladac jak awaria. Czerwony alert w terenie bez zasiegu uczy technika ignorowac ostrzezenia
- `ui-stala` `MAX_RETRIES` — kazdy typ wpisu kolejki, ktory moze trwale nie przejsc, potrzebuje limitu prob. Wieczny retry to zmarnowany transfer z telefonu i cisza tam, gdzie powinien byc komunikat

## 2026-08-17 — fix(mobile): kafelek niewyslanych zdjec na ekranie wyboru widoku (v2026.08.17.865)

### architektura / API

- **Wejscie do panelu przypisania przeniesione na `MobileHome`** — ekran „Wybierz widok". Licznik osieroconych siedzial dotad wylacznie w naglowku „Moich Zadan", czyli trzeba bylo wejsc w widok, ktory z przypisywaniem zdjec nie ma nic wspolnego, i wypatrzyc male czerwone kolko przy ikonie odswiezania. Teraz na ekranie wejsciowym stoi pelnowymiarowy kafelek „Niewyslane zdjecia" z liczba w plakietce, obok „Moich Zadan" i „Drzewa Zamowien"
- Kafelek pokazuje sie **wylacznie gdy jest co przypisac** — przy pustej kolejce ekran wyglada jak dotad. Licznik odswieza sie co 10 s oraz na zdarzeniach `attachment-orphaned` i `attachment-synced`, wiec znika sam po wyslaniu ostatniego zdjecia
- Wskaznik w naglowku `MobileDashboard` zostaje — te same dane, dwa wejscia

### slownik

- dodano `home-orphan-count` — licznik osieroconych na ekranie wyboru widoku, `MobileHome.jsx`
- dodano `mobile-home-tile-orphans` — kafelek „Niewyslane zdjecia", `MobileHome.jsx`

### wytyczne

- `ui-karta` `mobile-home-tile-orphans` — zadanie, ktore nie nalezy do zadnego widoku (jak przypisanie zaleglych zdjec), ma wejscie na ekranie wyboru widoku, nie doklejone do przypadkowego widoku. Plakietka przy ikonie w naglowku cudzego widoku jest nie do znalezienia

## 2026-08-17 — feat(schemat): panel recznego przypisania osieroconych zalacznikow drag&drop (v2026.08.17.864)

### architektura / API

- **`GET /schematics/markers/all`** — plaska lista WSZYSTKICH znacznikow w systemie z nazwa zamowienia. Schematy wisza zawsze na wezle `type='order'` (sprawdzone na produkcji: 75 schematow, 173 znaczniki, wszystkie na `order`), wiec nazwa zamowienia to jeden join — bez chodzenia po `process_node_closure`. Zwraca `id, name, note, subtaskId, nodeId, orderId, orderName, schematicName, attachmentsCount, createdAt`
- **`OrphanAttachmentsPanel`** — pelnoekranowy panel: pasek osieroconych zdjec u gory, lista znaczników pogrupowana po zamowieniu nizej, szukajka po nazwie zamowienia / znacznika / schematu. Osierocone zdjecie nie niesie ZADNEJ informacji o swoim znaczniku (jedynym lacznikiem byl martwy `temp_` id), wiec zamiast zgadywac oddajemy wybor uzytkownikowi
- **Dwie drogi przypisania**, bo panel zyje na telefonie: przeciagniecie zdjecia na znacznik ORAZ tap w zdjecie + tap w znacznik. Celowanie kciukiem w wiersz dlugiej listy podczas ciagniecia jest meczace — dwa tapniecia sa pewniejsze
- **Przeciaganie palcem na Pointer Events**, jak przenoszenie wezlow w `WBSHybridTable`: HTML5 drag&drop nie dostaje z dotyku zadnych zdarzen. Prog 6 px (samo dotkniecie kafelka nie zaczyna gestu — bez tego kazdy tap podnosilby zdjecie), `touch-action: none` na kafelku, auto-przewijanie listy przy krawedziach, podglad zdjecia pod palcem. Mysz zostaje na natywnym DnD
- **Wskaznik na pulpicie mobilnym** — czerwony licznik osieroconych obok istniejacego licznika kolejki, otwiera panel. Liczony osobno od `pendingCount`, bo osierocone wpisy same z siebie NIGDY nie zejda z kolejki i zawyzalyby licznik "do wyslania" bez konca
- Sekcja odzysku w `MarkerDetailsPanel` dostala przycisk otwierajacy panel; dotychczasowe "przypisz wszystkie tutaj" zostaje jako skrot

### slownik

- dodano `all-markers-flat` — plaska lista znacznikow z nazwa zamowienia, `schematics.service.ts`
- dodano `orphan-attachments-panel` — panel recznego przypisania, `OrphanAttachmentsPanel.jsx`
- dodano `load-orphans-panel` — wczytanie osieroconych z IndexedDB, `OrphanAttachmentsPanel.jsx`
- dodano `assign-orphan-to-marker` — przypisanie i wysylka, `OrphanAttachmentsPanel.jsx`
- dodano `orphan-selected-id` — zaznaczone zdjecie w trybie dwoch tapniec, `OrphanAttachmentsPanel.jsx`
- dodano `orphan-row-tap-assign` — tap w wiersz znacznika przypisuje, `OrphanAttachmentsPanel.jsx`
- dodano `orphan-panel-open` — otwarcie panelu ze szczegolow znacznika, `MarkerDetailsPanel.jsx`
- dodano `mobile-orphan-count` — licznik osieroconych na pulpicie, `MobileDashboard.jsx`

### wytyczne

- `ui-widok` `OrphanAttachmentsPanel` — panel MUSI dzialac na telefonie, bo osierocone zdjecia leza w IndexedDB urzadzenia, ktore je zrobilo. IndexedDB jest per-urzadzenie i per-domena, wiec z desktopu nie ma do nich fizycznego dostepu. Kazdy gest projektowany pod dotyk, nie pod mysz
- `ui-funkcja` `onCardPointerDown` — gest dotykowy w tym projekcie idzie na Pointer Events z progiem 6 px. HTML5 drag&drop nie dostaje z palca zadnych zdarzen, a bez progu tap nie da sie odroznic od poczatku przeciagania
- `back-endpoint` `GET /schematics/markers/all` — dwa segmenty w sciezce, wiec nie koliduje z jednosegmentowym `@Get(':id')` w tym samym kontrolerze. Kazdy nowy `markers/*` GET trzymac dwusegmentowo

## 2026-08-17 — feat(status): status „Dodatkowe zamówienie" w WBS, Realizacji i Materiałach (v2026.08.17.863)

### architektura / API

- **Nowy status pozycji `EXTRA_ORDER` — „Dodatkowe zamówienie"**, do wyboru w kolumnie Status we wszystkich trzech widokach: WBS (`WBSHybridTable`), Realizacja (`RealizationTab`) i Materiały (`WbsMaterialsPanel`). Na liście stoi zaraz po `ORDERED`, kolor fuksja (jedyny wolny odcień — fiolet, cyjan, szmaragd i limonka są już zajęte przez sąsiednie statusy). Osobny kod, a nie powtórne `ORDERED`, bo inaczej nie da się odróżnić pozycji zamówionej raz od takiej, która pochłonęła drugi zakup
- **Bez migracji bazy** — `WbsNode.status` i `MaterialRequirement.status` to `String`, nie enum, a backend nie ma whitelisty statusów (brak `IsIn`/`IsEnum` w DTO). Nowy kod przechodzi obiema ścieżkami zapisu jako zwykły string; potwierdzone testem na dev (HTTP 200 na `PATCH /wbs-nodes/:id` i `PATCH /material-requirements/:id`)
- **Pięć kopii mapy etykiet statusów zastąpione jednym źródłem** (`MATERIAL_STATUS_LABELS`): `UnifiedWbsPanel` (eksport PDF, arkusz „Zamówienie", eksport XLS), `WbsMaterialsPanel` (eksport XLS) i `projectPdfExport`. Każda kopia miała własne 7 statusów i zatrzymała się przed `DONE`/`INSTALLED` — drukowały surowy kod zamiast nazwy, a nowy status trafiłby do PDF jako `EXTRA_ORDER`. Zakładka „Baza materiałów" (`MaterialDatabaseTab`, tylko odczyt) czyta ten sam status i dostała etykietę oraz kolor
- **`StatusSelect` i `STRUCT_STATUS_META` eksportowane nazwanym eksportem** z `WBSHybridTable` — harness `test/status-dropdowns.html` renderuje PRAWDZIWY select widoku WBS, nie jego kopię; kopia przeszłaby test także wtedy, gdyby lista w komponencie się rozjechała
- **Poprawiona literówka `STRUCTURE_STATUS_META.ORDERED`**: „Zamowione" → „Zamówione". Kolumna Status w Realizacji pokazywała tę samą pozycję pod inną nazwą niż WBS i Materiały

### testy

- `test/status-extra-order-sync.js` — odtwarza sekwencję żądań każdego z trzech widoków na prawdziwej pozycji (dev, „Przychodnia Bojków" / „Rack 19""), po każdej czyta OBIE kolumny i endpoint `/wbs-nodes/unified/:nodeId`. Na koniec przywraca stan sprzed testu. 9/9 OK
- `test/status-dropdowns.html` — sprawdza, że kod jest na liście wyboru w trzech widokach, że wszystkie trzy nazywają go tak samo, że etykieta jest w mapie eksportów i że `MIXED` nadal nie da się wybrać ręcznie. 9/9 OK

### słownik

- dodano `status-extra-order` — status „Dodatkowe zamówienie" (`EXTRA_ORDER`), `wbsConstants.js`

### wytyczne

- `ui-stala` `STRUCTURE_STATUS_META` / `STRUCT_STATUS_META` / `STATUS_META` — lista statusów żyje w TRZECH tablicach (osobne formaty stylu: klasa tekstu, klasa badge'a, ikona). Nowy status dopisujemy do wszystkich trzech w jednym commicie i pod tym samym kodem ORAZ tą samą etykietą — status jedzie między widokami jako goły string, więc rozjazd kodu daje w drugim widoku surowy kod zamiast nazwy, a rozjazd etykiety pokazuje tę samą pozycję pod dwiema nazwami
- `ui-stala` `MATERIAL_STATUS_LABELS` — etykiety statusów do eksportów bierzemy STĄD, nigdy przez lokalną kopię mapy. Każda kopia zatrzymuje się na statusach z dnia, w którym powstała

## 2026-08-17 — fix(status): status pozycji zapisywany na obu polach we wszystkich trzech widokach (v2026.08.17.862)

### architektura / API

- **status pozycji mieszka w DWÓCH kolumnach** — `MaterialRequirement.status` (czyta go panel Materiały) i `WbsNode.status` (czytają go `WBSHybridTable` i zakładka Realizacja). Panel Materiały zapisywał WYŁĄCZNIE kartę, więc status ustawiony w Materiałach nie docierał do pozostałych dwóch widoków. Wyglądało to na różnicę między użytkownikami — manager ustawia status z drzewa WBS (tamten zapis szedł na oba pola), logistyk z panelu Materiały — ale rozstrzyga MIEJSCE edycji, nie rola ani uprawnienia
- **`patchCard` w `WbsMaterialsPanel`** przy zmianie `status` wysyła teraz też `PATCH /wbs-nodes/:id` na wszystkie węzły przypięte do tej karty (jedna karta bywa dopasowana do kilku liści przez fallback po nazwie)
- **`WBSHybridTable`** szuka wymagania do synchronizacji najpierw po tagu `req:<id>`, a gdy go nie ma — po `MaterialRequirement.wbsNodeId`. Wcześniej ścieżka była wyłącznie tagowa i 15 pozycji na produkcji (stare węzły bez taga) nie przenosiło statusu do Materiałów. Fallback po NAZWIE celowo pominięty przy zapisie — przy odczycie dopasowuje, przy zapisie ostemplowałby kartę innej pozycji o tej samej nazwie
- **`saveStatus` w `RealizationTab`** rozlicza oba zapisy osobno: nieudany zapis węzła cofa wartość w tabeli, nieudany zapis karty ZOSTAWIA ją (jest prawdziwa) i mówi wprost, że panel Materiały może pokazywać starą wartość

### stan produkcji

- w chwili poprawki 131 z 976 par węzeł↔karta miało rozjechane statusy; dominujący wzorzec to „karta ma realny status (IN_STOCK / ORDERED / CONFIRMED), węzeł pusty albo PENDING", czyli ślad po edycjach z panelu Materiały
- **rozjazd naprawiony jednorazowym UPDATE na bazie produkcyjnej** (decyzja użytkownika co do kierunku): zamówienie `CMC- Serwerownia ZDC1-K9_2026` — 40 węzłów wzięło status z karty (panel Materiały jako źródło prawdy), pozostałe 13 zamówień — 91 par ustawionych na `PENDING` po obu stronach. Po migracji 0 rozjazdów na 976 par
- migracja objęła WYŁĄCZNIE pary już rozjechane; wiersze, w których węzeł i karta się zgadzały, zostały nietknięte
- stan sprzed migracji zrzucony do `test/status-rozjazd-backup-2026-08-17.txt` (poza repo) — 6 pozycji w CMC straciło status obecny tylko na węźle (`IN_STOCK`, `PROPOSAL`, `ISSUED` ×2, `CONFIRMED`), bo reguła „z Materiałów" działa w obie strony

### wytyczne

- `schema-pole` `WbsNode.status` / `MaterialRequirement.status` — dopóki status żyje w dwóch kolumnach, KAŻDA ścieżka zapisu musi ustawiać obie. Nowy widok pokazujący status zaczyna od pytania, którą kolumnę czyta i czy jego zapis trafia w drugą
- `ui-funkcja` `wbs-status-req-link` — fallback po nazwie jest dobry do ODCZYTU (dopasowanie węzeł↔karta), nigdy do ZAPISU: dwie pozycje o tej samej nazwie w różnych gałęziach dostałyby cudzy status

## 2026-08-17 — fix(marker): usuwanie znacznika i załącznika przez modal React zamiast window.confirm (v2026.08.17.861)

### architektura / API

- **`ConfirmDeleteModal`** — modal potwierdzenia w `MarkerDetailsPanel.jsx` zastępuje oba `window.confirm` (usunięcie znacznika, usunięcie załącznika). Natywne okno ma nieedytowalne OK/Anuluj, nie pozwala nazwać przycisków TAK/NIE ani powiedzieć CO dokładnie zniknie, a na mobile bywa tłumione przez przeglądarkę w trybie PWA
- **Komunikat mówi o konkretnym obiekcie**, nie o abstrakcyjnym „załączniku": nazwa pliku / nazwa znacznika w treści, a dla załącznika jeszcze niewysłanego osobne ostrzeżenie, że plik czeka w kolejce i przepadnie bezpowrotnie (na serwerze go nie ma, więc nie da się go odzyskać)
- **Focus startuje na NIE**, nie na TAK — odruchowe Enter/spacja nie kasuje danych. Enter = TAK, Escape = NIE, klik w tło = NIE, klik w treść modala nic nie robi
- `handleDeleteMarker` / `handleDeleteAttachment` rozdzielone na „zapytaj" (otwiera modal) i `doDeleteMarker` / `doDeleteAttachment` (wykonuje) — logika kasowania bez zmian
- `ConfirmDeleteModal` eksportowany nazwanym eksportem, żeby dało się go wyrenderować w podglądzie `test/confirm-delete-modal.html` bez montowania całego panelu

### słownik

- dodano `confirm-delete-modal` — modal potwierdzenia usunięcia (TAK/NIE), `MarkerDetailsPanel.jsx`
- dodano `marker-confirm-state` — stan otwartego potwierdzenia, `MarkerDetailsPanel.jsx`

### wytyczne

- `ui-modal` `ConfirmDeleteModal` — w potwierdzeniu operacji nieodwracalnej focus MUSI startować na przycisku odmowy. Przy focusie na TAK odruchowy Enter kasuje dane bez przeczytania komunikatu
- `ui-modal` `ConfirmDeleteModal` — treść nazywa konkretny obiekt (nazwa pliku / znacznika) i skutek. „Usunąć załącznik?" nie daje użytkownikowi żadnej podstawy do decyzji, gdy na ekranie jest kilkanaście miniatur

## 2026-08-17 — fix(schemat): załączniki znacznika nie trafiały na serwer od 2026-07-15 (v2026.08.17.860)

### architektura / API

- **Regresja z `ec6135a` (2026-07-15, „upload załączników outbox-first")**: od tego commitu KAŻDE zdjęcie szło przez kolejkę outbox, co odsłoniło błąd, który wcześniej omijała bezpośrednia wysyłka online. Ostatni załącznik w bazie produkcyjnej: **2026-07-15 05:22**, commit: 07:33 tego samego dnia. Zero nowych załączników przez miesiąc, przy dalej działającym zapisie znaczników
- **Przyczyna**: znacznik utworzony offline dostaje `temp_<uuid>`. Po syncu `ADD_MARKER` serwer nadaje realne id, ale `SchematicViewer` odświeżał otwarty panel wyłącznie przez dopasowanie `m.id === selectedMarker.id` — po podmianie takie id już nie istnieje, więc panel zostawał z martwym `temp_` id. Zdjęcie dodane w tym panelu lądowało w kolejce jako `markerId: temp_…`, a jedyny mechanizm podmiany temp→real siedział w handlerze `ADD_MARKER`, który był już usunięty z outboxa. Efekt: POST na `/schematics/markers/temp_…/attachments` → FK violation → **HTTP 500 co 60 s w nieskończoność**, plik zostawał w IndexedDB (widoczny na telefonie, nieobecny na serwerze)
- **`markerIdMap`** — nowy store Dexie (`db.version(4)`) trzymający mapowanie `temp_<uuid>` → realne id markera. Zapisywany przy syncu `ADD_MARKER`, przeżywa usunięcie wpisu z outboxa. `ADD_ATTACHMENT` tłumaczy `temp_` id tuż przed wysyłką, więc załącznik zakolejkowany JUŻ PO zsynchronizowaniu markera trafia na właściwy rekord
- **`SchematicViewer` przepina otwarty panel**: zdarzenie `schematic-synced` niesie teraz `tempId` i `realId`, a handler jawnie podmienia `selectedMarker` na realny znacznik. Kolejne zdjęcia od razu dostają prawidłowe id
- **Pętla synca czyta wpis ze świeża** tuż przed wysyłką (`db.outbox.get`) zamiast polegać na snapshocie sprzed przetwarzania. Wcześniej podmiana temp→real zapisana przez `ADD_MARKER` w tej samej iteracji nie była widoczna i pierwsza próba zawsze kończyła się 500
- **Osierocone załączniki** (brak mapowania i brak wpisu `ADD_MARKER` w kolejce) są znakowane `orphaned` i zdejmowane z pętli synca — koniec z dobijaniem serwera błędami 500. Plik zostaje nietknięty w IndexedDB
- **Panel odzysku w znaczniku**: sekcja „Niewysłane zdjęcia (N)" z miniaturami osieroconych plików i przyciskiem „Przypisz do tego znacznika". Nie da się zgadnąć właściciela automatycznie, więc wybór należy do użytkownika; po przypisaniu pliki idą na serwer normalnym syncem
- **Brak draftu przy wpisie `ADD_ATTACHMENT`** loguje teraz `console.error` zamiast cicho kasować wpis z kolejki — utrata pliku przestaje być niewidoczna
- `vite.config.js` — `server.fs.allow` obejmuje `/test`, żeby harnessy testowe z korzenia repo dało się uruchomić na dev serwerze (tylko tryb dev, bez wpływu na build)

### słownik

- dodano `marker-id-map` — store Dexie z mapą temp→real id markera, `services/db.js`
- dodano `remember-marker-id` — zapis mapowania po syncu `ADD_MARKER`, `services/db.js`
- dodano `resolve-marker-id` — tłumaczenie `temp_` id na realne przed wysyłką, `services/db.js`
- dodano `get-orphaned-attachments` — lista osieroconych załączników, `services/repos/outboxRepo.js`
- dodano `mark-outbox-orphaned` — zdjęcie wpisu z pętli synca bez kasowania pliku, `services/repos/outboxRepo.js`
- dodano `reassign-orphaned-attachment` — ręczne przypisanie do wskazanego markera, `services/repos/outboxRepo.js`
- dodano `outbox-keep` — sentinel zatrzymujący wpis w kolejce mimo braku błędu, `services/sync/syncOutbox.js`
- dodano `orphan-drafts` — stan osieroconych draftów w panelu, `MarkerDetailsPanel.jsx`
- dodano `load-orphan-drafts` — wczytanie osieroconych draftów z IndexedDB, `MarkerDetailsPanel.jsx`
- dodano `reassign-orphans-to-marker` — handler przycisku „Przypisz do tego znacznika", `MarkerDetailsPanel.jsx`
- dodano `orphan-recovery-section` — sekcja odzysku niewysłanych zdjęć, `MarkerDetailsPanel.jsx`

### wytyczne

- `ui-funkcja` `processItem` — każdy typ wpisu outboxa odwołujący się do encji tworzonej offline MUSI tłumaczyć `temp_` id na realne tuż przed wysyłką, a nie liczyć na podmianę wykonaną przez inny wpis kolejki. Wpis-źródło mapowania (`ADD_MARKER`) znika z outboxa po swoim syncu i od tej chwili nie ma już czego podmieniać
- `ui-funkcja` `syncOutbox` — wpis czytamy z bazy tuż przed wysyłką. Snapshot listy pobrany na starcie pętli nie widzi zmian zapisanych przez wcześniejsze iteracje tej samej pętli
- `ui-funkcja` `syncOutbox` — wpis, który zawsze zwróci ten sam błąd (martwy klucz obcy), NIE może zostawać w pętli retry. Znakujemy `orphaned` i oddajemy użytkownikowi, inaczej klient bije w serwer 500-kami co 60 s bez końca
- `ui-stan` `selectedMarker` — komponent trzymający encję po ID musi mieć jawną ścieżkę przepięcia przy podmianie `temp_`→real. Efekt synchronizujący po `m.id === prev.id` nigdy nie trafi, bo stare ID przestaje istnieć
- `ui-funkcja` `processItem` — cichy `return` przy brakującym drafcie kasuje wpis z kolejki razem z plikiem. Każde porzucenie danych użytkownika loguj głośno

## 2026-08-17 — feat(realizacja): edytowalna kolumna „Status" w tabeli Realizacja (v2026.08.17.859)

### architektura / API

- **kolumna „Status" w `RealizationTab`** czyta `WbsNode.status` z tego samego `/wbs-nodes/unified/:nodeId`, z którego bierze się reszta wiersza — żadnego nowego zapytania ani pola. To ten sam status, który w Strukturze projektu (`WBSHybridTable`) stoi w kolumnie „Status"
- **edytowalna na miejscu**: `<select>` zapisuje przez `PATCH /wbs-nodes/:id` (`status` jest na liście dozwolonych pól w `updateNode`), a dla liścia z kartą materiałową leci DRUGI zapis na `PATCH /material-requirements/:id` — tak samo jak robi to WBS przez `handleHybridNodeStatusChange`. Bez niego kolumna „Status oferty" w panelu Materiały (czyta `MaterialRequirement.status`) zostawałaby ze starą wartością
- nieudany zapis cofa wartość w tabeli i mówi o tym wprost — inaczej widok twierdzi, że status się zmienił, a po przeładowaniu wraca stary
- etykiety i kolory z `STRUCTURE_STATUS_META` (`wbsConstants.js`) — wspólne z WBS i panelem Materiały, bez własnej kopii słownika statusów
- kolumna wchodzi w filtr kolumnowy, sortowanie i wyszukiwarkę globalną tabeli; eksport Excel zostaje bez zmian
- edycja podlega roli: `readOnly` (spoza ADMIN / MANAGER / LOGISTYK) blokuje `<select>`, tak jak resztę pól tabeli

### słownik

- dodano `realization-status-col` — kolumna „Status" w tabeli Realizacja, `RealizationTab.jsx`
- dodano `realization-status-label` — etykieta statusu liścia dla komórki, filtra i sortowania, `RealizationTab.jsx`
- dodano `realization-status-options` — kody statusów do wyboru (bez `MIXED`), `RealizationTab.jsx`
- dodano `realization-save-status` — zapis statusu: węzeł WBS + karta materiałowa, `RealizationTab.jsx`

### wytyczne

- `ui-funkcja` `saveStatus` — zmiana `WbsNode.status` liścia z kartą materiałową MUSI iść na oba pola (węzeł + `MaterialRequirement.status`). Dwa widoki czytają status z dwóch różnych miejsc, więc zapis w jedno z nich rozjeżdża Realizację z panelem Materiały
- `ui-funkcja` `statusLabel` — komórka, filtr kolumny i sortowanie MUSZĄ czytać etykietę z tej jednej funkcji; osobne wyliczanie labelki w każdym z tych miejsc rozjeżdża filtr z tym, co widać w tabeli
- `ui-kolumna` `realization-status-col` — status spoza `STRUCTURE_STATUS_META` (dane sprzed ujednolicenia kodów, np. `NEW`) zostaje na liście `<select>` jako własna opcja. Bez tego przeglądarka pokazuje pierwszą opcję z listy i wiersz kłamie o tym, co jest w bazie

## 2026-08-16 — chore(deploy): deploy przycina cache buildów po wystawieniu kontenerów

### architektura / API

- **`deploy.sh` kończy się `docker builder prune -f --reserved-space 10GB`**: build leci z `--no-cache`, ale warstwy pośrednie i tak lądują w cache'u i nic ich stamtąd nie usuwa — przy dzisiejszym tempie deployów urosło to do **112,9 GB i zajęło 83% dysku serwera** (26 GB wolnego). Jednorazowe wyczyszczenie odzyskało 104 GB, dysk zszedł do 11%. `--reserved-space` to w Dockerze 29 następca wycofanego `--keep-storage`
- sprzątanie idzie PO `docker compose up`, żeby nie opóźniać wystawienia aplikacji, i ma `|| true` mimo `set -e` — nieudane czyszczenie nie może wywrócić deployu, który się już udał
- deploy kończy się wypisaniem stanu dysku (`df -h /`)

### wytyczne

- `back-skrypt` `deploy.sh` — cache buildów jest wspólny dla CAŁEGO demona Dockera, nie per projekt: przycięcie w deployu ERP dotyka też kpricera, task-trackera i airtela. Przy `--no-cache` bez znaczenia, ale ich pierwszy build po deployu ERP będzie wolniejszy
- `back-skrypt` — krok sprzątający po udanym wdrożeniu zawsze z `|| true`; inaczej `set -e` zamienia nieudane porządki w nieudany deploy

## 2026-08-16 — chore(deploy): `deploy.sh` wykonuje się zawsze na serwerze

### architektura / API

- **`deploy.sh` sam przerzuca się na serwer**: uruchomiony lokalnie sprawdza, czy istnieje `/srv/apps/erp`, i jeśli nie — loguje się przez `ssh gigatel` i woła sam siebie po tamtej stronie. Po drugiej stronie katalog już jest, więc idzie prosto w deploy i rekurencji nie ma. Wcześniej trzeba było pamiętać, żeby odpalić go NA serwerze: przesłanie treści z Windowsa do powłoki serwera (`ssh gigatel 'bash -s' < deploy.sh`) niosło windowsowe końce linii i wywalało się na pierwszej komendzie (`set: - : invalid option`, `cd: /srv/apps/erp\r`)
- **cały skrypt objęty klamrą `{ … }`**: bash wczytuje taki blok w całości przed wykonaniem. Bez tego `git reset --hard origin/main` podmieniał w trakcie deployu plik samego skryptu, a bash doczytywałby dalsze linie już z nowej wersji, licząc od starego offsetu w pliku
- **`.gitattributes`: `*.sh text eol=lf`** — skrypty powłoki zostają w linuksowym formacie także w kopii roboczej na Windowsie. Repozytorium i serwer zawsze miały LF; CR dokładał lokalnie `core.autocrlf=true` przy checkoucie
- deploy raportuje teraz, gdzie się wykonuje (`hostname`), na jakim commicie stanął (`git log -1`) i w jakim stanie są kontenery (`docker compose ps`)

### wytyczne

- `back-skrypt` `deploy.sh` — uruchamiać przez `bash deploy.sh` z katalogu repo; skrypt sam decyduje, czy potrzebne jest `ssh`. Nie przesyłać jego treści strumieniem (`bash -s < deploy.sh`) — to jedyny sposób, w jaki lokalne końce linii trafiają do powłoki serwera
- `back-skrypt` — skrypt, który w trakcie działania aktualizuje własne repo (`git pull` / `git reset --hard`), musi być objęty klamrą `{ … }` z `exit 0` na końcu, inaczej bash może wykonać sklejkę starej i nowej wersji

## 2026-08-16 — style(wbs): jedna płaszczyzna szuflady w trzech widokach, zielony nagłówek sekcji (v2026.08.16.854)

### architektura / API

- **cała szuflada rozwiniętej pozycji na JEDNEJ płaszczyźnie** (`expand-drawer`): `DRAWER.surface` obowiązuje teraz od wiersza, który rozwinięto, przez kartę / panel, pasek zakupów, wpisy realizacji aż po formularz nowego wpisu. Wcześniej każdy kawałek miał własne tło (`bg-blue-500/[0.12]`, `bg-black/20`, `bg-black/25`, `bg-teal-500/[0.06]`) i jedno rozwinięcie czytało się jak cztery osobne bloki. Hover w środku szuflady dokłada się bielą (`DRAWER.hoverRow`), nie czernią — czerń zmieniała odcień płaszczyzny
- **szuflada domknięta pełną listwą, nie krawędzią** (`DRAWER.cap`, `materials-group-cap`, `realization-drawer-cap`, `wbs-drawer-css`): 4 px w kolorze kręgosłupa zamiast 1–2 px `border-bottom`. Cienka krawędź ginęła między wierszami tabeli i nie było widać, gdzie grupa się kończy. Realizacja domknięcia w ogóle nie miała — teraz rysuje je zawsze jako ostatni wiersz fragmentu, niezależnie od tego, które sekcje się pokazały
- **kręgosłup biegnie przez wpisy zakupu** w Realizacji i w Materiałach (`DRAWER.spine`) — 3 px w kolorze akcentu zamiast wcześniejszych 2 px / półprzezroczystego turkusu, więc pas jest ciągły od wiersza pozycji po listwę domykającą
- **nagłówek rozwiniętej sekcji odcięty kolorem** (`section-head`): stonowana, lekko przezroczysta zieleń plus grubsza krawędź od spodu. Rozwinięta sekcja miała `bg-[#0b0f17]`, czyli to samo ciemne tło co tabela pod spodem — nagłówek tonął we własnej treści i przy przewijaniu nie było wiadomo, którą sekcję się ogląda. Zieleń kładziona warstwą `background-image` na nieprzezroczystej bazie, bo nagłówek jest `sticky` i treść nie może przez niego prześwitywać
- **koszt całkowity wyceny na pomarańczowo** (`realization-total-plan-color`): kolor niesie STRONĘ, nie kolumnę — pomarańcz to wycena (tak jak „Koszt jedn. wyceny"), czerwień zakup (tak jak „Koszt jedn. zakupu"). Obie liczby w komórce były czerwone i różnił je tylko odcień. Ta sama zmiana w stopce „Razem"
- **Δ w kolumnie kosztu całkowitego powiększona** do stopnia kwot nad nią (wiersz `text-sm`, stopka `text-base`, obie pogrubione) — była najdrobniejszą liczbą w kolumnie, a to o nią chodzi w całym porównaniu

### słownik

- dodano `realization-drawer-cap` — listwa domykająca szufladę pozycji, `RealizationTab.jsx`
- dodano `realization-total-plan-color` — pomarańcz kosztu całkowitego wyceny, `RealizationTab.jsx`
- dodano `section-head` — nagłówek sekcji w `UnifiedWbsPanel.jsx`
- zmieniono `expand-drawer` — `DRAWER` dostał `hoverRow` i `cap`, `accent.*.row` zastąpione przez `accent.*.cap`

### wytyczne

- `ui-sekcja` — rozwinięty blok (szuflada, sekcja) trzyma JEDNO tło na całej wysokości. Odrębne kawałki wyróżniać akcentem, kręgosłupem albo etykietą, nie własnym odcieniem tła — kilka odcieni w jednym rozwinięciu czyta się jak kilka osobnych widoków
- `ui-sekcja` — domknięcie bloku rysować pełną listwą (≥ 3 px, kolor akcentu), nie krawędzią 1–2 px: krawędź ginie między wierszami tabeli
- `ui-sekcja` — tło elementu `sticky` musi mieć nieprzezroczystą bazę; przezroczysty akcent kłaść osobną warstwą (`background-image`), inaczej treść prześwituje przy przewijaniu
- `ui-kolumna` — w kolumnach zestawiających plan z wykonaniem kolor oznacza STRONĘ (pomarańcz = wycena, czerwień = zakup), nie kolumnę. Dwie liczby tej samej barwy w jednej komórce są nie do rozróżnienia

## 2026-08-16 — feat(realizacja): lista dostawców, zapis zamyka formularz, walidacja wpisu (v2026.08.16.853)

### architektura / API

- **kolumna „Dostawca" wymienia wszystkich, każdego w osobnym wierszu komórki** (`realization-row-suppliers`): skrót „IT-Planet +1" ukrywał, u kogo się kupowało — żeby zobaczyć drugiego dostawcę, trzeba było rozwijać pozycję. To dana rozliczeniowa, nie szczegół. Nazwy dostawców są krótkie, więc lista mieści się w kolumnie
- **zapis wpisu ZAMYKA formularz** (`realization-entry-form-submit`): wcześniej po udanym zapisie podstawiał się kolejny pusty wiersz „na wszelki wypadek" i pod pozycją wisiał formularz, którego nikt nie zamawiał. Kolejną dostawę dopisuje się i tak przyciskiem „+", więc nic to nie oszczędzało
- **przycisk zapisu nazywa się „Zapisz zakup"** (`ADD_ENTRY_LABEL`), nie „Dodaj zakup" — po zmianie wyżej kończy czynność, zamiast zapowiadać następną
- **zapis wpisu waliduje pola rozliczeniowe** (`realization-entry-form-validate`, `realization-entry-form-missing`, `realization-missing-labels`): ilość, koszt jedn. oraz producent + model (a na liściach bez karty — zakres) muszą być wypełnione, inaczej zapis się zatrzymuje, puste pola dostają czerwoną obwódkę, kursor skacze do pierwszego z nich (namierzany po `data-entry-key`), a przy przycisku zapisu staje „Uzupełnij: …" wymieniające je z nazwy. Zakup bez ceny nie wchodzi do porównania z wyceną, a bez producenta i modelu nie wiadomo, CO kupiono. Cena jest sprawdzana na WYPEŁNIENIE, nie na wartość dodatnią — zakup za 0 zł (wymiana gwarancyjna, gratis) ma prawo wejść do rozliczenia, byle wpisanym zerem

### słownik

- dodano `realization-row-suppliers` — lista dostawców pozycji, `RealizationTab.jsx`
- dodano `realization-entry-form-submit` — zapis wpisu zamykający formularz, `RealizationTab.jsx`
- dodano `realization-entry-form-validate` — walidacja formularza wpisu, `RealizationTab.jsx`
- dodano `realization-entry-form-missing` — stan pustych pól wymaganych, `RealizationTab.jsx`
- dodano `realization-missing-labels` — nazwy pól w komunikacie „Uzupełnij: …", `RealizationTab.jsx`

### wytyczne

- `ui-kolumna` — skrótu „pierwszy +N" nie stosować do danych rozliczeniowych (dostawca, numer dokumentu). Licznik mówi ILE, a pytanie brzmi KTÓRZY; jeśli wartości są krótkie, wymienić je w osobnych wierszach komórki
- `ui-formularz` — po zapisie nie podstawiać kolejnego pustego formularza. Otwarte pole wygląda jak niedokończona robota, a wejście w kolejny wpis jest jednym kliknięciem
- `ui-formularz` — pola kwotowe walidować na WYPEŁNIENIE, nie na wartość dodatnią. Zero bywa prawdziwą wartością rozliczeniową (gratis, gwarancja); regułę „> 0" trzymać tylko tam, gdzie zero nie jest zdarzeniem (ilość)

## 2026-08-16 — feat(realizacja): kod EAN na wpisie, producent w osobnej kolumnie, osobne pytanie o dostawcę (v2026.08.16.851)

### schema.prisma

- dodano pole `ean` w modelu `LeafActual` (`leaf-actual-ean`) — kod EAN kupionego egzemplarza. Producent i model bywają wpisane różnie przy każdej dostawie („Janitza" vs „JANITZA electronics"), więc po nich nie da się pewnie stwierdzić, czy druga dostawa to ten sam towar. `TEXT`, nie liczba: EAN-13 miewa wiodące zera i wychodzi poza bezpieczny zakres liczb w JS. Migracja `20260816140000_leaf_actual_ean`

### architektura / API

- **`POST /leaf-actuals` i `PATCH /leaf-actuals/:id` przyjmują `ean`** (`leaf-actual-input-ean`); pole wchodzi też do wszystkich trzech `select` serwisu, więc wraca w liście wpisów zamówienia
- **producent przeniesiony do kolumny „Nazwa"** (`realization-entry-line-manufacturer`): w wierszach wpisu kolumna była pusta, a para producent + model wciśnięta w jedną komórkę „Produkt" robiła z niej najwęższe miejsce w wierszu. Pod „Produktem" zostaje model, pod nim EAN. Ten sam podział w formularzu i w zapisanych wpisach, więc pola pokrywają się w pionie. Filtry kolumn poszły za układem: „Nazwa" szuka też po producencie wpisu, „Produkt" po modelu, EAN-ie i zakresie
- **nagłówki nad polami formularza nowego wpisu** (`realization-field-label`): nagłówki tabeli są przyklejone u góry, a formularz otwiera się w środku długiej listy — bez podpisu przy samym polu nie widać, co się wypełnia. Tylko w formularzu; nad zapisanymi wpisami powtarzałyby się w każdym wierszu
- **pytanie o dostawcę oddzielone od pytania o produkt** (`product-confirm-modal`): modal ma teraz dwa kroki — „ten sam produkt?", a po „tak" „ten sam dostawca?". Produkt i dostawca to osobne decyzje: ten sam miernik bywa kupiony u innego dostawcy, a ten sam dostawca dowozi zamiennik. Jedno „tak" na oba naraz wpisywało do zakupu dostawcę, którego nikt nie potwierdził. Po „nie" na produkt o dostawcę nie pytamy — przy zamienniku wycena nie ma czego podpowiedzieć
- **remount formularza wpisu na liczniku** (`realization-form-seed-key`) zamiast na kształcie seeda: `blank()` czyta seed wyłącznie przy inicjalizacji stanu, więc ta sama odpowiedź co poprzednio nie zmieniała `key` i podpowiedź nie wchodziła do już otwartego formularza

### słownik

- dodano `leaf-actual-ean` — pole EAN na wpisie realizacji, `schema.prisma`
- dodano `leaf-actual-input-ean` — EAN w DTO wpisu, `leaf-actuals.service.ts`
- dodano `realization-entry-line-manufacturer` — producent w kolumnie „Nazwa", `RealizationTab.jsx`
- dodano `realization-field-label` — nagłówek nad polem formularza, `RealizationTab.jsx`
- dodano `realization-form-seed-key` — licznik remountu formularza wpisu, `RealizationTab.jsx`

### wytyczne

- `ui-modal` — podpowiadanie danych z wyceny do zakupu rozbijać na tyle pytań, ile jest niezależnych decyzji. Produkt i dostawca zmieniają się osobno, więc jedno „tak" nie może przepisywać obu. Dane rozliczeniowe wchodzą do wpisu wyłącznie po świadomym potwierdzeniu — tak samo jak cena, której nie podpowiadamy nigdy
- `schema-pole` `LeafActual.ean` — kody kreskowe trzymać jako `TEXT`. EAN-13 i GTIN mają wiodące zera (ginące w typie liczbowym) i przekraczają `Number.MAX_SAFE_INTEGER`
- `ui-formularz` — pola formularza otwieranego w środku długiej tabeli potrzebują własnych nagłówków. Nagłówki tabeli są przyklejone u góry ekranu, a placeholder znika po wpisaniu pierwszego znaku

## 2026-08-16 — feat(realizacja): własny modal „ten sam produkt?" z przyciskami TAK / NIE (v2026.08.16.850)

### architektura / API

- **`window.confirm` zastąpiony komponentem `ProductConfirmModal`** (`product-confirm-modal`): natywne okno przeglądarki ma nieedytowalne etykiety OK / Anuluj — jedyny sposób na TAK / NIE to własny modal. Styl zgodny z resztą aplikacji (`ExportChoiceModal`): overlay `bg-[#05070bcc]`, karta `bg-[#0b0f17]`, produkt z wyceny w wyróżnionej ramce. Enter = TAK, Esc = NIE, autofocus na „Tak" — zachowanie okna systemowego zostaje
- **pytanie stało się asynchroniczne** (`realization-product-confirm`, `realization-resolve-product-confirm`): `openEntryForm` nie ustawia już `formNodeId` od razu, tylko odkłada `{ nodeId, offer, opis }` do stanu; formularz wpisu montuje się DOPIERO po odpowiedzi. Inaczej mignąłby pusty, a zaraz potem przemontował się z danymi z wyceny (zmiana `key`). Ścieżka bez produktu w wycenie otwiera formularz natychmiast, jak dotąd

### słownik

- dodano `realization-product-confirm` — stan oczekującego pytania o produkt, `RealizationTab.jsx`
- dodano `realization-resolve-product-confirm` — rozwiązanie pytania TAK/NIE, `RealizationTab.jsx`
- dodano `product-confirm-modal` — modal pytania o produkt, `RealizationTab.jsx`

### wytyczne

- `ui-modal` — NIE używać `window.confirm`, `window.alert` ani `window.prompt`. Zawsze własny modal React: natywne okna mają nieedytowalne, angielskie etykiety przycisków i systemowy wygląd obcy ciemnemu UI. Wzorzec: overlay `fixed inset-0 z-[140] bg-[#05070bcc] backdrop-blur-sm`, karta `max-w-md rounded-2xl border border-white/10 bg-[#0b0f17]`, Enter = potwierdzenie, Esc = odrzucenie
- `ui-modal` — zamiana `window.confirm` na modal zmienia kod z synchronicznego na asynchroniczny. Wszystko, co po odpowiedzi ma się wydarzyć, przenieść do callbacka rozwiązującego; stan otwierany PRZED pytaniem trzeba przejrzeć, bo `window.confirm` blokował render, a modal nie

## 2026-08-16 — fix(realizacja): pusty wynik filtra nie zabiera całej tabeli (v2026.08.16.849)

### architektura / API

- **komunikat „Brak pozycji pasujących do filtra" przeniesiony do `<tbody>`** (`realization-empty-filter-row`): wcześniej pusty wynik podmieniał CAŁĄ tabelę na komunikat, więc znikał też nagłówek z polami filtrów — filtr dało się cofnąć tylko przeładowaniem widoku. Teraz nagłówek i pola filtrów zostają, a komunikat siedzi w wierszu `colSpan` z przyciskiem „Wyczyść filtry kolumn"; gdy działa wyszukiwarka strony (`searchQuery`, prop), komunikat wypisuje szukaną frazę, bo tego pola tabela nie kontroluje
- **stan „brak pozycji kosztowych" odcięty od stanu filtra**: tabela chowa się tylko przy `leaves.length === 0` (nic do filtrowania), stopka „Razem" chowa się przy pustym wyniku

### słownik

- dodano `realization-empty-filter-row` — pusty wynik filtra wewnątrz tabeli, `RealizationTab.jsx`

### wytyczne

- `ui-tabela` — pusty wynik filtrowania NIGDY nie może zastępować tabeli razem z nagłówkiem. Kontrolki, które doprowadziły do pustego wyniku, muszą zostać na ekranie, inaczej użytkownik nie ma czym cofnąć filtra. Komunikat idzie w wiersz `colSpan`, nie zamiast `<table>`

## 2026-08-16 — feat(realizacja): analiza wykonania budżetu w eksporcie Excel (v2026.08.16.848)

### architektura / API

- **arkusz „Podsumowanie" jako pierwsza zakładka** (`realization-export-excel`): kolejność bierze się z kolejności `addWorksheet`, więc oba arkusze zakładane są na początku, a wypełniane niżej. Formuły `Realizacja!…` adresują po nazwie, więc kolejność arkuszy ich nie dotyczy
- **narracyjna sekcja „Analiza"** (`realization-analysis`): kilka zdań budowanych z liczb — ile budżetu zrealizowano, na ilu pozycjach ruszyła realizacja, czy na nich jesteśmy do przodu czy przekraczamy, rozkład taniej/drożej. Każde zdanie w scalonej komórce A:F z `wrapText`. Sekcja podaje wynik, nie metodę liczenia
- **tabela „Prognoza wydatków"**: osobny wiersz na każdy rodzaj kosztów (`Rodzaj kosztów | Wycena | Wykonanie | % wykonania | Prognoza | Δ do oferty`) zamknięty wierszem `Razem` liczonym formułami `SUM` — prognoza całego budżetu
- **próg wiarygodności prognozy** (`realization-forecast-min-share`, `PROG_MIN_UDZIAL = 0.1`): dopóki wykonanie rodzaju kosztów nie osiągnie 10% jego wyceny, prognoza zostaje na 100% wyceny zamiast iść za odchyleniem (próg domykający — równe 10% już wystarcza). Przy paru wpisach odchylenie nie opisuje rynku, tylko przypadek — praca wyceniona na 67 311 zł z jednym wpisem na 100 zł dawała prognozę 3 365,55 zł i 64 tys. „oszczędności" wziętej z powietrza. Pod tabelą wiersz wymieniający rodzaje trzymane na 100%, żeby taka pozycja nie wyglądała na błąd rachunku
- **prognoza liczona OSOBNO dla każdego rodzaju kosztów**: współczynnik `realRuszone / planRuszone` wyznaczany per typ i mnożony przez CAŁY plan tego typu; rodzaj bez żadnych wydatków wchodzi po 100% wyceny (wsp. 1). Globalny współczynnik przenosił rabat z materiału na robociznę — inny rynek, inne odchylenie. Test `test/test-realization-excel-format.mjs` przypadek B pokazuje rozjazd: per typ 13 000 zł wobec 10 000 zł globalnie
- **„Porównanie globalne" liczone w plus**: `Wartość niezrealizowanego budżetu ofertowego` = wycena − realizacja, `Procentowa realizacja budżetu` = realizacja ÷ wycena. Wcześniej obie pozycje pokazywały wartość ujemną (−401 113,68 zł i −98,5%) mimo nazw sugerujących wielkość dodatnią
- **format walutowy PLN** (`#,##0.00\ [$zł-415]`) na wszystkich kwotach w obu arkuszach; kolumny ilościowe zostają bez formatu (ogólne), bo jednostka siedzi w osobnej kolumnie
- **opis zakresu wymienia rodzaje kosztów**: „cały zakres zamówienia" albo „część zakresu — rodzaje kosztów: Materiał, Sprzęt" zamiast programistycznego „wszystkie typy liści"
- **długie teksty w scalonych komórkach**: wartości opisowe (zamówienie, zakres, fraza, filtry) scalone B:F, zdania Analizy A:F, oba z `wrapText` i jawną wysokością wiersza — Excel NIE auto-dopasowuje wysokości wiersza ze scaloną komórką, więc tekst urywał się w połowie zdania. Wysokość liczona z długości tekstu przy założeniu ~83% nominalnej szerokości scalenia (łamanie idzie po słowach); pilnuje tego `test/test-realization-excel-wysokosc.mjs`
- nazwa pliku eksportu: `{nazwa zamówienia}_analiza finansowa realizacji projektu.xlsx`
- przycisk eksportu Excel przeniesiony z prawej krawędzi nagłówka na lewo, obok tytułu „Tabela realizacji"; stopka tabeli realizacji o 2px większa niż wiersze (13/16px wobec 11/14px)

### słownik

- dodano `realization-analysis` — odchylenia i prognoza per rodzaj kosztów, `RealizationTab.jsx`

### wytyczne

- `ui-stan` `analiza` — prognozy wykonania NIE liczyć jednym globalnym współczynnikiem. Odchylenie z materiału nie ma prawa schodzić na pracę czy usługę; rodzaj bez wydatków zakładać po 100% wyceny, bo brak danych nie jest powodem, żeby obiecywać oszczędność
- `ui-stala` `PROG_MIN_UDZIAL` — każda ekstrapolacja odchylenia potrzebuje progu minimalnej próbki. Bez niego jeden wpis na 100 zł przy wycenie 67 tys. „prognozuje" 64 tys. oszczędności. Gdy próg blokuje ekstrapolację, wynik trzeba opisać w arkuszu — inaczej prognoza równa wycenie wygląda na niepoliczoną
- `ui-funkcja` `exportExcel` — formaty liczbowe w arkuszu „Podsumowanie" ustawiać PER KOMÓRKA, nie przez `getColumn().numFmt`. Kolumny niosą różne znaczenia w różnych sekcjach: D to `% wykonania` w tabeli prognozy i `Wycena` w rozbiciu po typie — format kolumnowy zamienia procent na złotówki
- `ui-funkcja` `exportExcel` — teksty w eksportach i w UI bez slangu WBS („liść", „gałąź"). Do użytkownika mówimy językiem zarządzania projektem: pozycja, rodzaj kosztów, zakres
- `ui-funkcja` `exportExcel` — zdania budowane z liczb muszą mieć osobny wariant dla stanów granicznych (zero realizacji, wycena 0 zł, budżet przekroczony). Podstawianie wartości do jednego szablonu daje „zrealizowano — budżetu" i kwoty ujemne tam, gdzie z nazwy mają być dodatnie
- `ui-funkcja` `exportExcel` — polska odmiana liczebników: po przyimku „z" zawsze dopełniacz („z 4 pozycji"), a w wyliczeniach unikać orzeczenia, bo przy zmiennej liczbie każda forma („wypadła / wypadły / wypadło") będzie błędna dla pozostałych przypadków

## 2026-08-16 — feat(materialy): rozwinięta pozycja czytelnie odcięta od tabeli (v2026.08.16.843)

### architektura / API

- **kręgosłup grupy** (`materials-group-spine`, `materials-card-surface`, `materials-group-cap`): rozwinięty liść to jeden blok — 3 px pionowy pasek biegnie przez wiersz pozycji, kartę produktu, pasek zakupów i wpisy realizacji, a domyka go pasek tej samej grubości. Karta dostała własną, jaśniejszą płaszczyznę `#182236` zamiast `bg-black/20`, która różniła się od wiersza tabeli o kilka procent krycia bieli. Niebieski, bo to strona wyceny — turkus zostaje dla zakupu/realizacji
- **jeden rozmiar tekstu w rozwiniętej pozycji** (`realization-row-font`): pola karty, wiersze propozycji i wiersze wpisów zakupowych mają `text-xs`; wcześniej wpisy szły w `text-[22px]`, a propozycje w `text-[10px]`
- `SupplierPicker` — „Dodaj po NIP" i „Wolny wpis (bez NIP)" nad listą dostawców, zaraz pod polem szukania; przy dłuższej liście były poza ekranem
- „Szukaj AI" i „Dodaj ręcznie" przy nagłówku „Propozycje produktów" zamiast przy prawej krawędzi karty
- **działania matematyczne w polach ceny i ilości** (`parse-price-input`): „=1200*1.23" zapisuje 1476. Objęte: koszt jedn. propozycji i formularza „Dodaj ręcznie", koszt jedn. karty produktu, kolumna „Koszt jedn. oferty", ilość i koszt jedn. wpisu zakupu. Wcześniej `sanitizeQtyInput` wpuszczał „=" do wszystkich tych pól, ale liczyła je TYLKO kolumna ilości — w pozostałych formuła po prostu nie zapisywała się, bez żadnego komunikatu. Testy: `test/test-price-formula.mjs` (19 przypadków, w tym `=12*alert(1)` → 12, czyli brak injectionu)

### słownik

- dodano `materials-group-spine` — kręgosłup rozwiniętej pozycji, `WbsMaterialsPanel.jsx`
- dodano `materials-card-surface` — płaszczyzna karty produktu, `WbsMaterialsPanel.jsx`
- dodano `materials-group-cap` — domknięcie grupy rozwiniętej pozycji, `WbsMaterialsPanel.jsx`
- dodano `parse-price-input` — wpis z pola ceny/ilości na liczbę, `wbsConstants.js`
- dodano `proposal-field-num` — flaga pola liczbowego propozycji, `WbsMaterialsPanel.jsx`
- dodano `realization-entry-num-keys` — pola liczbowe wpisu realizacji, `WbsMaterialsPanel.jsx`

### wytyczne

- `ui-stala` `GROUP_SPINE` — każda nowa sekcja dopinana pod rozwiniętym liściem (karta, pasek zakupów, wpisy) musi dostać ten sam kręgosłup, inaczej wypada z grupy wizualnie mimo że należy do pozycji
- `ui-wiersz` `materials-group-cap` — domknięcie renderuj ZAWSZE jako ostatni element fragmentu, nigdy jako `border-b` konkretnej sekcji: które sekcje się pokażą, zależy od `accepted` i `purchasesOpen`
- `ui-funkcja` `sanitizeQtyInput` ↔ `ui-funkcja` `parsePriceInput` — chodzą parą. Pole, które wpuszcza „=" przy wpisywaniu, MUSI liczyć formułę przy zapisie; sam `sanitizeQtyInput` daje pole, w którym da się napisać działanie, a zapis po cichu przepada

## 2026-08-16 — fix(materialy): karta pozycji i wybrana propozycja trzymają jeden oferent i jeden koszt (v2026.08.16.842)

### architektura / API

- **oferent karty schodzi na propozycję będącą produktem karty** (`mat-req-supplier-sync` w `update()`): cel wybierany kolejnością `isOffer` → `isSelected` → najstarsza, czyli tą samą co `mat-req-existing-proposal-pick`. Kopia zakupowa (`isPurchase`) i konkurencyjne oferty od innych firm zostają nietknięte — każda trzyma własnego oferenta, bo to osobne oferty
- **i w drugą stronę**: `updateProposal` przenosi oferenta na pozycję, gdy zmieniana propozycja jest produktem karty (`isOffer` albo `isSelected`); `selectProposal` i `setOffer` przenoszą go razem z ceną przy wyborze produktu. Propozycja BEZ oferenta nie kasuje oferenta karty — brak danych to nie jest informacja „nikt"
- bez tego pole rozjeżdżało się zależnie od tego, w którym z dwóch okien akurat kliknięto, choć oba opisują ten sam produkt

### poprawki

- **`ProposalRow` nadąża za zmianami przychodzącymi z zewnątrz** (`proposal-row-sync`). Stan pól wiersza zasiewał się wyłącznie przy zmianie `p.id`, więc edycja w karcie pozycji — która po stronie backendu schodzi na wybraną propozycję — nie miała jak wejść do inputa. Objaw zgłoszony przez użytkownika: karta pokazuje koszt jedn. `5000`, wiersz propozycji zostaje pusty. **W bazie obie wartości były równe od początku** (`material_requirements.budgetedPriceNetto = 5000` i `product_proposals.priceNetto = 5000` — sprawdzone na dev w `test/diag-oferent-sync.mjs`), więc to była wyłącznie warstwa widoku, nie utrata danych
- resync nadpisuje TYLKO te pola, których wartość przyszła inna niż poprzednio z propsów. To, co użytkownik właśnie wpisuje (różni się od propsów, ale propsy się nie zmieniły), zostaje nietknięte aż do zapisu na blurze — inaczej odświeżenie w trakcie pisania kasowałoby wpisywaną cenę

### słownik

- dodano `proposal-row-sync` — resync pól wiersza propozycji, `WbsMaterialsPanel.jsx`
- dodano `mat-req-supplier-sync` — zejście oferenta z karty na propozycję, `material-requirements.service.ts`

### wytyczne

- `ui-wiersz` `ProposalRow` — pola wiersza są stanem lokalnym zapisywanym na blurze, więc KAŻDE nowe pole edytowalne dopisuj do `incoming` w `proposal-row-sync`. Zasiew tylko po `[p.id]` cicho zamraża wartość: dane w bazie są poprawne, a ekran pokazuje stare
- `schema-pole` `MaterialRequirement.supplierId` ↔ `schema-pole` `ProductProposal.supplierId` — dwa okna na JEDNO pole, dopóki propozycja jest produktem karty. Zmieniając jedną stronę, sprawdź czy druga nadal się synchronizuje; rozjazd wolno mieć wyłącznie propozycjom, które produktem karty nie są

## 2026-08-16 — feat(materialy): „Oferent produktu" na pozycji i na każdej propozycji (v2026.08.16.841)

### schema.prisma

- dodano pole `supplierId` w modelu `MaterialRequirement` (`mat-req-supplier-id`) — oferent produktu POZYCJI, czyli kto nam ją zaofertował. Odpowiednik istniejącego `ProductProposal.supplierId`, tylko o poziom wyżej: karta produktu ma jeden produkt wiodący, a propozycji bywa kilka, każda od innej firmy
- dodano relację `MaterialRequirement.supplier` → `Supplier` (`mat-req-supplier`, `onDelete: SetNull`) i odwrotną `Supplier.materialRequirements` (`supplier-material-requirements`)
- migracja `20260816120000_mat_req_supplier` — `ADD COLUMN IF NOT EXISTS` + FK w bloku `DO $$` łapiącym `duplicate_object`, żeby powtórne wykonanie na bazie z ręcznie dołożoną kolumną nie wywracało deploya

### architektura / API

- **„Oferent produktu" to NIE dostawca zakupu** — rejestruje, kto przysłał ofertę, i nie przesądza, u kogo kupimy. Dostawcę zakupu zapisuje wpis realizacji (`LeafActual.supplierId`) i te dwa pola wolno mieć różne; dopiero razem odpowiadają na „kto ofertował" i „u kogo kupiliśmy"
- **pole jest w dwóch miejscach naraz**: w karcie pozycji (`product-card-supplier`, pisze `MaterialRequirement.supplierId`) i w każdym wierszu propozycji (`proposal-supplier-picker`, pisze `ProductProposal.supplierId`). Oba stoją między „Nazwa handlowa" a „Koszt jedn." (`PROPOSAL_SUPPLIER_AFTER`) — wiersz czyta się „ten produkt, od tej firmy, za tyle"
- **`POST /material-requirements/:id/proposals` przyjmuje `supplierId`** — kontroler i `addManualProposal` przepuszczają oferenta wybranego już w formularzu „Dodaj ręcznie" (dotąd trzeba było zapisać propozycję i dopiero potem wskazać, kto ją przysłał); odpowiedź dostała `include: { supplier: true }`, czyli ten sam kształt co `updateProposal`
- **`PATCH /material-requirements/:id` przyjmuje `supplierId`** — leci do kolumny przez `...rest`, dopisany do typu DTO
- **klon wersji przenosi oferenta pozycji** — `cloneVersionData` kopiuje `MaterialRequirement.supplierId` (propozycje swojego oferenta niosły już wcześniej). Bez tego snapshot wersji gubiłby autorstwo oferty
- **przywrócone to, co zniknęło ze splitem** (v839): `ProductProposal.supplierId` został wtedy w schemacie i backendzie, ale stracił UI razem z `ProductSideCard`, przez co „Dostawca wyceny" w `ComparisonPanel` zaczął się wypełniać pustką. Teraz znów jest gdzie go wpisać
- **`SupplierPicker` dostał `size`** (`md` / `sm` / `xs`, `supplier-picker-size`) i `placeholder` (`supplier-picker-placeholder`). Rozmiar zmienia WYŁĄCZNIE gęstość triggera — lista, NIP z Białej listy VAT, wolny wpis i czyszczenie działają identycznie, bo to ten sam wybór dostawcy co przy zakupie. Placeholder mówi „Kto zaofertował…" / „Oferent produktu…", żeby pole nie udawało dostawcy zakupu

### słownik

- dodano `mat-req-supplier-id`, `mat-req-supplier`, `supplier-material-requirements` — oferent na pozycji, `schema.prisma`
- dodano `proposal-supplier-picker`, `proposal-supplier-after`, `product-card-supplier` — pola oferenta w panelu, `WbsMaterialsPanel.jsx`
- dodano `supplier-picker-size`, `supplier-picker-placeholder` — nowe propsy `SupplierPicker.jsx`

### wytyczne

- `schema-pole` `MaterialRequirement.supplierId` i `schema-pole` `ProductProposal.supplierId` — to OFERENCI, nie dostawcy zakupu. Nie używaj ich do rozliczenia zakupu ani nie synchronizuj z `LeafActual.supplierId`: rozjazd między nimi jest informacją („ofertował A, kupiliśmy u B"), a nie błędem do naprawienia
- `ui-dropdown` `SupplierPicker` — nowe miejsce użycia dobiera `size` do sąsiednich pól, nie dokłada własnych klas triggera. Gdyby zabrakło rozmiaru, dopisz go do `SIZES`, żeby gęstości nie rozjeżdżały się po komponentach

## 2026-08-16 — feat(materialy): panel Materiały pokazuje tylko zapisane wpisy zakupu, bez wiersza dopisywania (v2026.08.16.840)

### architektura / API

- **`RealizationAddRow` usunięty z `WbsMaterialsPanel.jsx`**. Rozwinięta sekcja „Zakupy / wykonanie" pokazywała pod jednym kupionym materiałem drugi wiersz — pusty formularz z datą dzisiejszą, ilością 1 i skopiowanym producentem — który czytał się jak druga, niedokończona dostawa. Materiały są zestawieniem tego, co faktycznie kupiono, więc zostają w nich wyłącznie `RealizationEntryRow` (nadal w pełni edytowalne w miejscu, z kasowaniem wpisu). Dopisywanie zdarzeń żyje w zakładce Realizacja (`RealizationEntryForm`) — oba ekrany i tak pisały do tych samych `LeafActual`
- **`addActual` (`add-actual`) usunięty z panelu** — panel nie woła już `POST /leaf-actuals`; endpoint bez zmian, wywołuje go `RealizationTab`
- **przycisk „Rozlicz" / „Rozliczone" przeniesiony do `PurchasesBar`** — siedział w kolumnie `status` skasowanego wiersza, a to jedyne miejsce w Materiałach, z którego dało się oznaczyć pozycję jako rozliczoną. Zastępuje dotychczasowy sam znacznik „rozliczone" na pasku; w trybie podglądu (`readOnly`) zostaje sam znacznik. Pasek przestał być jednym wielkim `<button>` (przycisk rozliczenia nie może być zagnieżdżony w przycisku zwijania) — jest `<div>` z przyciskiem zwijania po lewej i rozliczeniem po prawej
- **pasek dostaje KAŻDY liść, także bez karty produktowej** (praca, usługa, nocleg, paliwo) — dotąd `purchasesShown = card ? purchasesOpen : true` pokazywał ich wpisy od razu, bo nie było nad czym zwijać. Bez wiersza dopisywania taki liść bez zdarzeń rozwijał się w nic; teraz zawsze widać podsumowanie i „Rozlicz"

### słownik

- usunięto `realization-add-row` (`RealizationAddRow`) i `add-actual` (`addActual`) — oba zniknęły z `WbsMaterialsPanel.jsx`

### wytyczne

- `ui-sekcja` `WbsMaterialsPanel` — dopisywanie wpisów realizacji NIE wraca do Materiałów. Nowe pola wpisu dodawaj w `RealizationTab` (wiersz wpisu + formularz) i w `RealizationEntryRow` w Materiałach (edycja istniejącego), ale bez formularza dopisywania w panelu

## 2026-08-16 — refactor(materialy): koniec splitu Wycena/Zakup — w karcie pozycji zostaje sam ProductCard (v2026.08.16.839)

### architektura / API — „Szukaj AI" deduplikuje

- **`POST /material-requirements/:id/search-products` nie dokłada drugiego rekordu tego samego produktu** (`mat-req-search-dedup`). Klucz jak przy edycji karty: producent + model bez względu na wielkość liter, w obrębie wymagania. Dedup działa w dwie strony — wobec propozycji już zapisanych i wewnątrz jednej odpowiedzi modelu (potrafi zwrócić ten sam model trzy razy, tak powstał `Hirschmann CA 3 LD ×3`)
- **istniejąca propozycja jest tylko UZUPEŁNIANA** o puste pola (link, `matchScore`, nazwa handlowa). Cena, role Wycena/Zakup, wybór i pliki to dorobek użytkownika — wyszukiwarka ich nie nadpisuje
- **endpoint zwraca KOMPLET propozycji wymagania**, nie tylko świeżo zapisane. Front podstawia odpowiedź wprost pod listę (`setProposals(data)`), więc przy dedupie zwrócenie samych nowych rekordów kasowałoby z ekranu te, które już tam były (przy okazji znika stary efekt „po wyszukaniu lista pokazuje tylko 3 nowe pozycje do czasu odświeżenia")
- diagnostyka duplikatów na produkcji: `test/prod-duplikaty-propozycji.sql` — zapytanie kandydatów do usunięcia (zostaje rekord najbogatszy, kasowane są wyłącznie kopie bez ról, dostawcy, zdjęcia, plików i bez własnej ceny)
- **sprzątnięte na produkcji (2026-08-16)**: 235 → 224 propozycji, usuniętych 11 czystych kopii po wcześniejszym zrzucie do `test/prod-propozycje-duplikaty-backup.csv`. Zostały 3 grupy „po dwa rekordy" — pary Wycena/Zakup (Avigilion 4800/4355, Schneider —/184,54, Baks 2,60/4,19), świadomie nietknięte, bo niosą cenę zakupu i dostawcę. Po sprzątaniu: zero wymagań z dwiema propozycjami `isSelected`, `isOffer` albo `isPurchase`. Bazy dev nie ruszano

### architektura / API — kolory eksportów i etapu zamówienia

- **jeden kolor na format eksportu w całej aplikacji**: Excel niebieski, PDF czerwony. Przemalowane: „Excel" w `ComparisonPanel` i `BudgetModesPanel` (emerald), „Excel" w zakładce Realizacja (emerald), „Analiza projektu do Excel" (green) i „Excel" w sekcji Materiały (emerald); „Q&A PDF" (blue), „PDF tej zakładki" w `RequirementsTab` (purple), oba „Eksport PDF" w `SchematTab` (emerald). Kolor niesie teraz format, a nie sekcję, w której przycisk stoi
- **`import` budżetu z Excela zostaje zielony** — nie jest eksportem, a jedyny przycisk wciągający dane do aplikacji nie powinien wyglądać jak wynoszący je na zewnątrz. Tak samo bez zmian „Karta katalogowa (PDF)" w karcie produktu — to podgląd cudzego pliku, nie eksport naszych danych
- **zakładki niosą etap zamówienia po akceptacji baseline** (`tab-stage-colors`): „planowanie" zielenieje (etap zamknięty — wycena stała się zobowiązaniem), „Realizacja" robi się pomarańczowa (etap bieżący). Przed akceptacją zostają jak były (cyan / teal). Kolor widać też na zakładce nieaktywnej (`idleColor`), bo to znacznik stanu zamówienia, nie podświetlenie wyboru

### architektura / API — propozycje produktów: skąd biorą się duplikaty

- **`mat-req-existing-proposal-pick`** — przy edycji produktu w karcie wyszukiwanie istniejącej propozycji (po producencie i modelu) nie miało `orderBy`, więc przy dwóch rekordach tego samego produktu Postgres zwracał dowolny: edycja potrafiła trafić w **kopię zakupową zamiast w produkt wyceny**. Kolejność ustalona: produkt wyceny → wybrany → najstarszy
- **wpis zakupu NIE tworzy propozycji** — `leaf-actuals.service.ts` nie dotyka `product_proposals`, więc dopisywanie zakupów w Realizacji nie może mnożyć produktów w karcie. Pary „ten sam produkt dwa razy" widoczne w karcie to **spadek po splicie**: kciuk „produkt Wyceny → Zakup" zakładał osobny rekord (`materializePurchaseCopy`, sam w sobie deduplikujący — powtórny klik nadpisywał kopię)

### architektura / API — układ rozwiniętego wiersza

- **kolejność w rozwinięciu liścia odwrócona: karta produktu na górze, wpisy zakupu pod nią**. Dotąd wiersze realizacji stały NAD kartą, więc rozwinięcie zaczynało się od zakupów, choć czyta się je dopiero po tym, co miało być kupione
- **nowy `PurchasesBar`** (`purchases-bar`) — pasek „Zakupy / wykonanie" pod kartą: przełącznik sekcji wpisów i zarazem jej podsumowanie (Σ wpisów wobec planu, liczba wpisów w polskiej odmianie przez `entriesLabel`, wartość zakupu, znacznik „rozliczone"). Sekcja jest **domyślnie zwinięta** (`wbs-materials-purchases-open`, pamiętana w `localStorage` pod `wbsPurchasesOpen`), bo rozwinięcie wiersza służy najpierw karcie, a wpisy dopisuje się świadomie
- **klik w kolumnę „Zakup / wykonanie" otwiera wiersz RAZEM z sekcją wpisów** (`onOpenPurchases`) — licznik jest skrótem do zakupów, więc nie może kończyć się na rozwinięciu samej karty; kolejny klik na otwartym wierszu zwija sekcję
- **liść bez karty produktowej (praca, usługa) nie dostaje paska** — nie ma nad czym zwijać, więc jego wpisy pokazują się od razu po rozwinięciu wiersza (`purchasesShown`)

### architektura / API

- **`BaselineSplitCard` i `ProductSideCard` usunięte** z `WbsMaterialsPanel.jsx`. Rozwinięcie liścia — i w zakładce Materiały (`wbs-materials-product-card`), i w drzewie WBS (`MaterialReqExpandPanel` w `WBSHybridTable.jsx`) — pokazuje teraz jedną kartę produktu `ProductCard` z wyszukiwarką AI, czyli dokładnie to, co dawała strona „Wycena" splitu. Podział procesu: **Wycena** = logistyk dobiera propozycje materiałowe w `wbs.materials`, **Realizacja** = wpisuje konkretne kupione materiały. Skoro zakup ma własne wiersze wpisów, druga kolumna karty nie miała już czego trzymać
- **wiersze realizacji w panelu Materiały zostają bez zmian** — `RealizationEntryRow`, `RealizationAddRow`, licznik „Zakup / wykonanie" i kolumny `baselineOnly` działają jak dotąd; karta produktu wraca pod nie jako stały (nie zwijany) blok
- **`ProductCard` przejmuje blokadę baseline** (`product-card-offer-lock`) — dotąd zamrożenie po akceptacji miała tylko strona „Wycena" splitu. Pole „Koszt jedn.", wybór propozycji (`select` ustawia `isOffer` i cenę) oraz przypięcie/odpięcie pozycji z oferty przechodzą przez modal `OfferLockGuard`; bez tego użytkownik dostawał surowe 403 z `assertOfferEditable`
- **`ProductProposal.isPurchase` / `purchasePriceNetto` zostają w schemacie i w backendzie** — endpointy `set-purchase` / `clear-purchase` i sumy `budget-sums` nie są ruszane, bo czytają je `ComparisonPanel` i kafle Budżetu; zniknął tylko UI, który je ustawiał ręcznie w splicie. Skutek do świadomego przyjęcia: **dostawca produktu wyceny (`ProductProposal.supplierId`) nie ma już własnego pola** — `SupplierPicker` stał wyłącznie w `ProductSideCard`. Dostawcę wpisuje się teraz przy wpisie realizacji; w `ComparisonPanel` kolumna „Dostawca wyceny" pozostanie pusta dla pozycji wycenianych po tej zmianie

### słownik

- usunięto `baseline-split-card`, `baseline-split-open`, `baseline-split-qty`, `baseline-split-techspec-pending`, `baseline-split-copy-to-purchase`, `baseline-split-copy-supplier-to-purchase`, `product-side-card`, `product-side-card-lock`, `product-side-card-pending-writes`, `product-side-card-ensure-proposal`, `product-side-card-fork-purchase`, `product-side-card-supplier-change`, `product-side-card-price-formula`, `product-side-card-delete-product`, `product-side-card-search-ai`, `product-side-card-offer-price-fallback`
- usunięto martwą sekcję „Moduł split ProductCard — baseline vs żywa karta (Faza 6)" — wszystkie jej anchory (`split-*` w `WBSHybridTable.jsx`) zniknęły z kodu już przy wprowadzeniu `BaselineSplitCard` (v718), a wpisy zostały w indeksie
- dodano `product-card-offer-lock` — props `ProductCard.offerLocked` + `lockProps`, oraz `wbs-materials-product-card` — miejsce osadzenia karty w rozwiniętym wierszu Materiałów
- dodano `purchases-bar` (`PurchasesBar`), `wbs-materials-purchases-open` (`purchasesOpen`), `wbs-materials-toggle-purchases` (`togglePurchases`), `pl-entries-label` (`entriesLabel`)
- dodano `tab-stage-colors` (kolory zakładek wg etapu), `mat-req-existing-proposal-pick` (wybór propozycji przy edycji karty) i `mat-req-search-dedup` (deduplikacja wyników „Szukaj AI")

### wytyczne

- `ui-karta` `ProductCard` — jedyna karta produktu w projekcie; osadzana w rozwinięciu wiersza Materiałów i w rozwinięciu liścia drzewa WBS. Nie dokładać do niej strony „zakupowej" — zakup żyje we wpisach realizacji (`LeafActual`)
- `ui-sekcja` `PurchasesBar` — rozwinięty wiersz liścia ma stałą kolejność: karta produktu (wycena) → pasek zakupów → wpisy. Nowe elementy rozwinięcia dokładać zgodnie z tą osią czasu, nie nad kartą
- `ui-przycisk` eksporty — kolor niesie FORMAT: Excel = niebieski (`blue-500/10` + `blue-300`), PDF = czerwony (`red-500/10` + `red-300`). Nowy przycisk eksportu bierze kolor z formatu, nie z palety swojej sekcji
- `schema-model` `ProductProposal` — każda ścieżka tworząca propozycję musi najpierw sprawdzić, czy wymaganie nie ma już tego producenta i modelu (klucz: producent + model, case-insensitive). Robi to `searchProducts` (`mat-req-search-dedup`) i edycja karty; przy szukaniu rekordu do nadpisania stosować `orderBy` preferujący `isOffer`, nigdy „pierwszy z brzegu". Sprzątając duplikaty NIGDY nie kasować rekordu z rolą `isOffer`/`isPurchase`, z dostawcą, zdjęciem albo własną ceną — para Wycena/Zakup to jedyny nośnik ceny zakupu sprzed wpisów realizacji
- `schema-pole` `ProductProposal.isPurchase` — od tej wersji ustawiany wyłącznie przez backend (kopie, migracje danych), nie ma UI, który by go zmieniał. Konsumenci (`ComparisonPanel`, `budget-sums`, `purchaseUnitOf`) mają traktować brak produktu zakupu jako normalny stan i sięgać po wpisy realizacji

## 2026-08-15 — feat(realizacja): filtr roli w backendzie, panel porównawczy w zakładce, zakres wpisu dla liści bez karty (v2026.08.15.833)

### architektura / API — filtr po roli PO STRONIE BACKENDU

- **`GET /orders/:nodeId/comparison` zwraca wiersze zależnie od roli** (`comparison-role-filter`) — manager i admin dostają wszystkie typy liści, każda inna rola wyłącznie materiał i sprzęt. KPI (sumy, Δ, pokrycie, liczniki odchyleń) liczą się już z wierszy, które rola faktycznie dostała: na zamówieniu CMC manager widzi 80 pozycji i 415 327,68 zł wyceny, logistyk 37 pozycji i 229 150,68 zł
- **`GET /leaf-actuals/order/:nodeId` filtruje dziennik tak samo** (`leaf-actuals-role-filter`) — wpisy z liści pracy, usługi, noclegu i paliwa nie wychodzą poza managera. Typ bierzemy ze WSZYSTKICH klonów korzenia i wymagamy, żeby każdy był otwarty: przetypowanie pozycji w nowej wersji ma zamykać wpis, nie otwierać
- wspólne `OPEN_LEAF_TYPES` / `isOpenLeafType` / `isManagerRoles` w `common/leaf-types.util.ts` — jedna lista dla obu endpointów, lustro `OPEN_LEAF_TYPES` z `realizationShared.js`
- zawężenie w komponentach ZOSTAJE (zakładka Realizacja, `ComparisonPanel`) — backend egzekwuje, front nie pokazuje pustych kolumn; nowy test `test/test-role-filter.mjs` sprawdza obie warstwy na żywym API dla tokenu admina i logistyka
- **`GET /wbs-nodes/unified/:nodeId` celowo BEZ filtra** — stoi na nim edytor struktury WBS i sumy budżetu, więc wycięcie z niego węzłów zmieniałoby hierarchię i kwoty planu, nie tylko widoczność kosztów własnych

### architektura / API — eksport Excel z zakładki Realizacja

- **przycisk „Excel" w nagłówku tabeli realizacji** (`realization-export-excel`) — eksportuje DOKŁADNIE to, co widać: wiersze po wyszukiwarce, filtrach kolumn i sortowaniu, zawężone rolą (praca, usługa, nocleg i paliwo wchodzą wyłącznie u managera). Arkusz „Realizacja" ma komplet kolumn ekranu plus znacznik `Rozliczone`
- nazewnictwo stron: **„zakup" tylko tam, gdzie faktycznie się kupuje** — kolumny i wiersze zbiorcze obejmujące wszystkie typy liści mówią „realizacja" (`Koszt jedn. realizacji`, `Koszt całk. realizacji`, kolumna `Realizacja` w rozbiciu po typie), bo pracy i usługi się nie kupuje
- **drugi arkusz „Podsumowanie"** — globalne porównanie (koszt całkowity wyceny, realizacji, Δ, Δ%), pokrycie (pozycje w widoku, rozliczone, udział rozliczonych, liczba wpisów), rozbicie po typie pozycji oraz metryczka widoku: zamówienie, data, stan baseline, użyte filtry i **zakres widoku** („wszystkie typy liści" / „materiały i sprzęt bez kosztów własnych"). Bez tej linijki nie dałoby się później odpowiedzieć, czy w pliku nie ma robocizny, bo jej nie było, czy dlatego, że rola jej nie widziała
- żywe formuły zgodnie z zasadą eksportów: Δ ilość `=I−G`, wartość wyceny `=G*K`, Δ wartość `=N−M`, sumy `SUM`, a rozbicie po typie przez `SUMIF`/`COUNTIF`/`COUNTIFS` po arkuszu „Realizacja". Koszt zakupu zostaje wartością — to suma wpisów o różnych cenach, nie iloczyn
- **`ComparisonPanel` NIE trafia do zakładki Realizacja** — próbnie osadzony, zdjęty jako klon tabeli, która stoi obok. Komponent zostaje bez zmian tam, gdzie był (Planowanie, Szybkie wyceny); wraz z nim wycofane `visibleTypes` i `kpiOf`, bo zawężanie po stronie przeglądarki zastąpił filtr w backendzie

### schema.prisma

- dodano pole `scope` w modelu `LeafActual` — zakres TEGO zdarzenia dla liści bez karty produktowej (praca, usługa, nocleg, paliwo). Kolumna „Produkt" była dla nich martwa: nad robocizną nie ma czego wpisać w „producenta", a rodzaj wykonanej pracy nigdzie nie siadał. Jedno wolne pole zamiast pary producent + model — przy pracy nie ma czego rozbijać na markę i typ. Migracja `20260815120000_leaf_actual_scope`, kolumna nullowalna, bez backfillu

### architektura / API

- **kolumna „Produkt" → „Produkt / zakres"** w zakładce Realizacja. Wiersz wpisu pokazuje producenta i model tam, gdzie liść ma kartę (materiał, sprzęt), a jedno pole „zakres" dla pozostałych typów; ten sam przełącznik steruje polem nr dokumentu (`hasDoc` → `hasCard` w `RealizationEntryLine` i `RealizationEntryForm`). W wierszu POZYCJI kolumna pokazuje wtedy zakresy zebrane z wpisów, tak jak dostawca i dokument
- to samo w panelu Materiały (`RealizationAddRow`, `RealizationEntryRow`) — oba widoki piszą do tych samych wpisów, więc pole musi być w obu, inaczej zakres dałoby się wpisać tylko z jednego ekranu
- `scope` wchodzi do wyszukiwarki nagłówka i do filtra kolumny „Produkt / zakres" — filtr sięga i po produkt z wyceny, i po zakres z wpisów, bo kolumna jest jedna
- **eksport XLSX wpisów realizacji nadal wypisuje producenta i model** — dla pracy i usług te kolumny zostają puste, zakres do arkusza jeszcze nie wchodzi

### architektura / API — poprawki z tej samej sesji

- **usunięcie OSTATNIEGO wpisu zdejmuje z pozycji znacznik `realizationClosed`** (`realization-reopen-on-empty` w `deleteActual`). Zgłoszony objaw: po rozliczeniu pozycji i skasowaniu jej wpisu kolumna „Δ ilość" pokazywała wartość UJEMNĄ (minus cały plan), pasek stał na 100%, a wiersz nadal był podpisany „rozliczone" — czytało się to jak błąd danych. Skoro kasujemy zdarzenie, na którym stało rozliczenie, wracamy do stanu „nic się nie wydarzyło". Znacznik zdejmowany jest ze WSZYSTKICH klonów liścia (wpisy wiszą po korzeniu `sourceWbsNodeId`, flaga po węźle wersji); świadome „rozliczam mimo braku dostawy" nadal ustawia przycisk „Rozlicz"
- `setClosed(node, closed)` wydzielone z `toggleClosed` — ten sam PATCH `/leaf-actuals/close/:id` wołają teraz przełącznik i automatyczne wznowienie po usunięciu wpisu
- **cała kolumna „Koszt całkowity" na czerwono** — wycena jaśniejszym odcieniem (`text-red-300`), faktyczny zakup mocniejszym (`text-red-400`), tak samo w wierszu pozycji, w wierszu wpisu i w stopce „Razem". Δ zostaje kolorowana wg znaku (teal przy oszczędności, czerwień przy przekroczeniu), bo niesie ocenę, a nie kwotę
- **wejście w pole wpisu zaznacza CAŁĄ jego treść** (`selectAllOnFocus`) — myszą tak samo jak Enterem z pola obok. Wpisy poprawia się przez nadpisanie, więc klik stawiający kursor w środku wartości wymuszał ręczne kasowanie
- **przycisk zapisu wpisu nazwany czynnością** — „dopisz" → „Dodaj zakup" (`ADD_ENTRY_LABEL`), jedna etykieta nad KAŻDYM typem liścia. Rozróżnienie zakup/wykonanie zostaje w etykiecie nad datą (`newEntryLabel`). `thisEntryPhrase` usunięty, bo po zmianie treści pytania nie miał już użycia
- **nowa treść pytania o produkt z wyceny**: „Czy zakupiłeś ten sam co wyceniany produkt? / Wypełnić dane zakupionego produktu danymi z wyceny?". Modal pojawia się wyłącznie nad materiałem i sprzętem (praca i usługa nie mają karty produktowej, więc `offerProductOf` zwraca `null`), więc treść mówi wprost o zakupie i nie potrzebuje wariantu dla wykonania
- nowy test `test/test-realization-close-delete.mjs` — przechodzi po API całą drogę zgłoszenia (wpis → „Rozlicz" → usunięcie wpisu → wznowienie) i sprawdza stan po każdym kroku; sprząta po sobie. `test/test-realization-render.mjs` sprawdza dodatkowo kolory strony zakupu i to, że pozycja bez wpisów nie pokazuje ujemnej „Δ ilość" ani podpisu „rozliczone"

### słownik

- dodano `open-leaf-types`, `is-open-leaf-type`, `is-manager-roles`, `comparison-role-filter`, `leaf-actuals-role-filter`, `realization-export-excel`, `realization-comparison-section`, `realization-comparison-toggle`, `leaf-actual-scope`, `leaf-actual-input-scope`, `realization-product-col`, `realization-entry-scope`, `realization-select-all-on-focus`, `realization-set-closed`, `realization-reopen-on-empty`, `realization-delta-qty-rule`
- zmieniono `realization-entry-noun` — `thisEntryPhrase` zastąpiony przez `addEntryLabel`

### wytyczne

- `ui-funkcja` `deleteActual` — pozycja bez ani jednego wpisu nie może zostać „rozliczona" automatycznie. Znacznik `realizationClosed` ma pochodzić z decyzji użytkownika, nie zostawać po skasowanych danych; inaczej wiersz pokazuje pełne wykonanie i ujemną Δ wobec planu
- `schema-pole` `WbsNode.realizationClosed` — siedzi na WĘŹLE wersji, a wpisy `LeafActual` po KORZENIU klonu (`sourceWbsNodeId ?? id`). Każda operacja masowa na flagach musi iść po wszystkich węzłach danego korzenia, nie po pojedynczym `node.id`
- `schema-pole` `LeafActual.scope` — wypełniamy WYŁĄCZNIE dla liści bez karty produktowej (`TYPE_META[type].hasCard === false`). Materiał i sprzęt trzymają produkt w `manufacturer` + `model`; mieszanie tych trzech pól w jednym wierszu zabiera możliwość raportu po producencie
- `back-stala` `OPEN_LEAF_TYPES` — lista żyje w dwóch miejscach (`common/leaf-types.util.ts` i `realizationShared.js`) i MUSI mówić to samo. Dodanie typu liścia widocznego dla wszystkich ról wymaga zmiany w obu plikach naraz
- `back-endpoint` dane realizacji — każdy nowy endpoint oddający koszty liści (dziennik, porównanie, eksport) filtruje po roli SAM. Zawężenie w komponencie jest wygodą użytkownika, nie zabezpieczeniem
- `ui-funkcja` `exportExcel` w Realizacji — eksport bierze `rows`, czyli stan PO filtrach i sortowaniu, nigdy surowej listy liści. Arkusz ma odpowiadać ekranowi, a metryczka „Zakres widoku" ma mówić, czego w pliku nie ma
- `ui-zakladka` `RealizationTab` i `ui-sekcja` `WbsMaterialsPanel` — piszą do tych samych `LeafActual`. Nowe pole wpisu dodawaj w OBU naraz (wiersz istniejącego wpisu, wiersz dopisywania, `addActual`), inaczej dane da się wprowadzić tylko z jednego ekranu

## 2026-08-15 — fix(realizacja): martwy `commentRef` w formularzu wpisu, test renderu obejmuje podkomponenty (v2026.08.15.826)

### architektura / API

- **naprawiony drugi biały ekran** — przy przenoszeniu komentarza wpisu spod kolumny „Nazwa" pod „Komentarz" została stara referencja `ref: commentRef`, choć `commentRef` był w tym samym commicie przemianowany na `firstFieldRef`. `RealizationEntryForm` wywalał się z `ReferenceError: commentRef is not defined` przy każdym otwarciu formularza
- **`RealizationRow`, `RealizationEntryLine`, `RealizationEntryForm`, `RealizationExpandPanel` i `COL_DEFS` wyeksportowane** — wyłącznie na potrzeby `test/test-realization-render.mjs`. Renderują się dopiero po rozwinięciu pozycji albo po otwarciu formularza, więc SSR samej zakładki nigdy do nich nie docierał; oba białe ekrany siedziały właśnie tam. Poza testem nic ich nie importuje, zakładka nadal wychodzi domyślnym eksportem
- test renderu pokrywa teraz każdy podkomponent osobno (wiersz pozycji w trybie edycji i podglądu, wiersz wpisu, formularz dla zakupu z produktem z wyceny i dla wykonania bez produktu, rozwinięcie z kartą i bez) oraz sprawdza na wyrenderowanym HTML-u zachowania z ostatnich zmian: liczbę okien `data-entry-field` (trasa Entera), PUSTY koszt jedn. w nowym wpisie, przepisanie producenta i modelu z wyceny, autora i nr dokumentu w wierszu wpisu. Zweryfikowany na żywym błędzie — po tymczasowym przywróceniu `commentRef` test wywala się z tym samym `ReferenceError`
- **poprawiony rodzaj gramatyczny etykiet** — nagłówek formularza sklejał `nowy ${entryNoun(type)}`, co nad pozycjami typu praca i usługa dawało „nowy wykonanie"; tak samo pytanie o produkt mówiło „Czy ten wykonanie…". Rzeczownik (`entryNoun`, prefiks linii w komentarzu pozycji) jest teraz oddzielony od form z zaimkiem i przymiotnikiem: `newEntryLabel` → „Nowy zakup" / „Nowe wykonanie", `thisEntryPhrase` → „ten zakup" / „to wykonanie"

### wytyczne

- `ui-zakladka` `RealizationTab` — podkomponentów renderujących się warunkowo (rozwinięcie, formularz) nie pokrywa SSR całej zakładki, bo bez DOM-u `useEffect` nie odpala i widok zatrzymuje się na spinnerze. Każdy taki podkomponent ma mieć własny przypadek w `test/test-realization-render.mjs` — inaczej błąd w nim wychodzi dopiero jako biały ekran u użytkownika
- `ui-stala` `entryNoun` — to SAM rzeczownik, do prefiksu linii komentarza. Do tekstu z zaimkiem lub przymiotnikiem używaj `newEntryLabel` albo `thisEntryPhrase`; „zakup" jest rodzaju męskiego, „wykonanie" nijakiego, więc sklejanie ich z jedną formą zawsze psuje połowę przypadków

## 2026-08-15 — fix(realizacja): pusta strona na zakładce Realizacja + test renderu (v2026.08.15.825)

### architektura / API

- **naprawiona pusta strona** — `appendEntryComment` miał `saveComment` w tablicy zależności `useCallback`, a `saveComment` było zadeklarowane 67 linii NIŻEJ w ciele komponentu. Tablica zależności jest wyliczana w trakcie renderu, więc `const` wpadał w martwą strefę i każdy render kończył się `ReferenceError: Cannot access 'saveComment' before initialization` — biały ekran. `saveComment` przeniesione ponad `appendEntryComment`
- nowy test `test/test-realization-render.mjs` — renderuje `RealizationTab` i `WbsMaterialsPanel` przez `renderToString` (react-dom/server) na bundlu z esbuilda. Łapie DOKŁADNIE tę klasę błędów, której `vite build` nie widzi: martwą strefę `const`, brakujące importy komponentów i wyjątki w ciele komponentu. Zweryfikowany na żywym błędzie — po tymczasowym przywróceniu złej kolejności test się wywala z tym samym `ReferenceError`
- test renderuje `WbsMaterialsPanel` z `externalWbsNodes` (ten props omija stan ładowania, więc powstaje prawdziwa tabela z wierszami) i sprawdza, że wyniesienie `TYPE_META`, `realizationOf`, `getParentPath`, `REAL_STATE` i formaterów do `realizationShared.js` nie rozwaliło panelu: wiersze pozycji, ścieżka rodzica, kolumny realizacji przy `accepted`, podpis „rozliczone" i format kwot `pl-PL`

### wytyczne

- `ui-zakladka` komponenty React — `vite build` NIE wykrywa użycia stałej przed deklaracją w ciele komponentu; to przechodzi build i daje biały ekran dopiero w przeglądarce. Po każdej zmianie w `RealizationTab` albo `WbsMaterialsPanel` uruchamiaj `node test/test-realization-render.mjs`. Praktyczna zasada: `useCallback`/`useMemo` deklaruj w kolejności zależności — funkcja używana w tablicy zależności innej musi stać wyżej

## 2026-08-15 — feat(realizacja): Enter przechodzi po oknach wiersza, komentarz wpisu w dzienniku pozycji (v2026.08.15.824)

### architektura / API

- **Enter przechodzi do kolejnego okna wiersza zakupu** zamiast kończyć edycję (`focusNextInRow`). Kolejność bierze się z DOM-u, więc idzie dokładnie za kolejnością kolumn i nie ma osobnej listy do utrzymania przy dodawaniu kolumny; pola oznaczone są `data-entry-field`. Na ostatnim oknie Enter zapisuje wpis (formularz) albo robi blur, czyli commit pola (istniejący wpis). Kursor po otwarciu formularza startuje w PIERWSZYM oknie (data), nie w komentarzu — inaczej Enter zapisywałby wpis od razu, bo komentarz jest teraz ostatni
- **komentarz wiersza zakupu przeniesiony pod kolumnę „Komentarz"** (był pod „Nazwą"). To ta sama treść, która dopisuje się do komentarza pozycji, więc musi stać w tej samej pionowej linii. Kolumna „Nazwa" zostaje w wierszu wpisu pusta
- **komentarz nowego wpisu dopisuje się do komentarza POZYCJI** (`appendEntryComment`) jako osobna linia `zakup: <treść>` — dla pracy i usług `wykonanie: <treść>`, zgodnie z `entryNoun`. Idzie przez `saveComment`, więc od razu trafia do `WbsNode.comment` i rozgłasza `wbs-comment-changed`: ta sama treść jest widoczna w WBS, w panelu Materiały i na markerze schematu, bez wchodzenia w rozwinięcie pozycji
- dopisywanie działa WYŁĄCZNIE przy dodaniu wpisu, nigdy przy jego późniejszej edycji — komentarz pozycji jest dziennikiem tego, co się wydarzyło, a nie kopią bieżącej treści wpisu. Poprawka wpisu po fakcie nie przepisuje historii i nie dokleja drugiej linii

### słownik

- dodano `realization-enter-next-field`, `realization-append-entry-comment`

### wytyczne

- `ui-funkcja` `focusNextInRow` — nowe okno w wierszu zakupu musi dostać atrybut `data-entry-field`, inaczej wypadnie z trasy Entera. Kolejności nie utrzymujemy w kodzie: wynika z kolejności `COL_DEFS`, bo `querySelectorAll` idzie po DOM-ie
- `ui-funkcja` `appendEntryComment` — komentarz pozycji jest DZIENNIKIEM zdarzeń, nie lustrem ostatniego wpisu. Dopisujemy przy tworzeniu, nigdy przy edycji ani przy usuwaniu; nie parsujemy tych linii z powrotem na wpisy

## 2026-08-15 — feat(realizacja): kolumna Komentarz, pytanie o produkt z wyceny, cena bez podpowiedzi (v2026.08.15.823)

### architektura / API

- **kolumna `comment` „Komentarz"** w tabeli realizacji — to samo pole `WbsNode.comment` co kolumna „Komentarz" w `WBSHybridTable` i w panelu Materiały, ta sama `AutoResizeTextarea`, zapis na blur przez `PATCH /wbs-nodes/:id`. Filtrowalna i sortowalna jak reszta kolumn
- **synchronizacja komentarza obustronna** — dotąd `WBSHybridTable`, `MarkerDetailsPanel`, `SchematTab` i panel Materiały tylko ROZGŁASZAŁY `wbs-comment-changed`, a Materiały nie słuchały wcale. Zakładka Realizacja robi oba kierunki: `saveComment` wysyła PATCH i rozgłasza zdarzenie (dociera do markera schematu i wiersza WBS), a `realization-comment-listener` przyjmuje zmiany z tamtych widoków i aktualizuje wiersz bez przeładowania tabeli. Bufor `commentVal` z `commentFocus` pilnuje, żeby komentarz zmieniony równolegle w WBS nie skasował tego, co się właśnie pisze
- **pytanie „ten sam produkt co w wycenie?" przy nowym wpisie** — `openEntryForm` sprawdza, czy pozycja ma produkt po stronie wyceny (`offerProductOf`: propozycja `isOffer`, fallback na produkt katalogowy wymagania). Jeśli tak, pyta przed otwarciem formularza: „OK" przepisuje producenta, model i dostawcę z wyceny, „Anuluj" zostawia pola puste (zamiennik wpisuje się ręcznie). Bez produktu po stronie wyceny pytania nie ma — formularz otwiera się pusty. Na produkcji dotyczy 19 z 37 kart (17 z opisem produktu)
- **koszt jedn. nowego wpisu NIE jest podpowiadany** — dotąd wchodziła cena z poprzedniego wpisu, a przy pierwszym z wyceny. Wpis zapisywał się wtedy kwotą, której nikt nie przeczytał, a to są dane rozliczeniowe idące do `AuditLog`. Teraz pole zostaje puste także przy odpowiedzi „ten sam produkt" — cena musi być wpisana świadomie. Ilość dalej podpowiada brakującą do planu (to nie jest kwota)
- wiersz wpisu trzyma swój komentarz pod kolumną „Nazwa" (jak dotąd); kolumna „Komentarz" należy do POZYCJI, nie do pojedynczej dostawy, więc w wierszach wpisów zostaje pusta
- test `test/test-realization-tab.mjs` rozszerzony o round-trip `PATCH /wbs-nodes {comment}` z przywróceniem oryginalnej wartości oraz o sprawdzenie, że propozycje `isOffer` niosą producenta, model i dostawcę w relacji

### słownik

- dodano `realization-comment-col`, `realization-row-comment`, `realization-save-comment`, `realization-comment-listener`, `realization-form-seed`, `realization-offer-product`, `realization-open-entry-form`, `realization-entry-form-no-price`

### wytyczne

- `ui-input` `unitCost` wpisu realizacji — pole ceny w formularzu nowego wpisu NIGDY nie jest wypełniane domyślną wartością (ani z wyceny, ani z poprzedniej dostawy). Kwota trafia do `AuditLog` i do rozliczenia zamówienia, więc musi przejść przez świadomą decyzję. Podpowiadać wolno tylko dane opisowe: producenta, model, dostawcę — i to po potwierdzeniu
- `ui-hook` `wbs-comment-changed` — każdy nowy widok pokazujący `WbsNode.comment` ma robić OBA kierunki: rozgłaszać po zapisie i nasłuchiwać cudzych zmian. Sam dispatch bez listenera zostawia widok ze starym komentarzem do przeładowania

## 2026-08-15 — feat(realizacja): wspólna kolejność kolumn, koszt całkowity i „+" po lewej (v2026.08.15.822)

### architektura / API

- **wpisy realizacji renderują się jako wiersze POTOMNE tabeli głównej** (`RealizationEntryLine`, `RealizationEntryForm` mapują po tej samej liście `COL_DEFS` co wiersz pozycji), a nie w osobnej pod-tabeli w rozwinięciu. Kolejność kolumn jest wspólna z definicji, nie z ręcznego dopasowania: data pod „Przedmiot projektu", komentarz pod „Nazwą", producent i model pod „Produktem", dostawca pod „Dostawcą", nr FV/PZ pod „Dokumentem", ilość pod „Zakup / wykonanie", koszt jedn. pod „Koszt jedn. zakupu", wartość pod „Kosztem całkowitym". Kolumny planu (`qty`, `deltaQty`, `price`) zostają w wierszu wpisu puste
- to samo naprawia **przypisywanie dostawcy po NIP** w zakładce Realizacja: `SupplierPicker` (wybór z rejestru, „Dodaj po NIP" z Białej listy VAT, wolny wpis bez NIP) renderuje listę jako `absolute` w `relative`, więc w poprzedniej, zagnieżdżonej pod-tabeli z `overflow-x-auto` dropdown był przycinany. Po przeniesieniu wpisów do tabeli głównej działa tak samo jak w panelu Materiały — kod pickera jest jeden i wspólny, nie było czego duplikować
- **przycisk dopisania wpisu przeniesiony na lewo** — sam „+" obok strzałki rozwijania w pierwszej kolumnie wiersza (`realization-add-button`), zamiast etykietowanego przycisku po prawej. Etykieta powtarzałaby się w każdym wierszu; rodzaj zdarzenia („Nowy zakup" / „Nowe wykonanie") niesie tooltip
- **nowa kolumna `total` „Koszt całkowity"** — koszt całkowity pozycji po stronie wyceny i po stronie zakupu, z odchyleniem pod spodem, w jednej kolumnie zamiast trzech osobnych (`planValue`, `realValue`, `deltaValue` usunięte). Sortowanie po tej kolumnie idzie odchyleniem — to pytanie, które się jej zadaje
- **stopka „Razem"** (`realization-totals-row`) — podsumowanie kosztów całkowitych wyceny i zakupów dla wszystkich WIDOCZNYCH wierszy (po filtrach), przyklejona do dołu tabeli. `sticky` siedzi na komórkach, nie na `<tfoot>` — przyklejanie samego elementu grupującego nie jest wspierane spójnie między przeglądarkami
- nowe kolumny `product` (produkt z wyceny), `supplier` i `doc` (dostawca i numery dokumentów z wpisów realizacji, zwinięte do „pierwszy +N") — potrzebne, żeby wiersz wpisu miał pod czym umieścić swoje pola; typ pozycji zszedł z osobnej kolumny pod nazwę
- rozwinięcie pozycji (`RealizationExpandPanel`) zostaje nagłówkiem: wymagania techniczne, podgląd produktu i przycisk „Rozlicz". Wpisy są pod nim, w tabeli głównej

### słownik

- dodano `realization-total-col`, `realization-add-button`, `realization-tab-entry-rows`, `realization-totals-row`
- usunięto (scalone w `realization-total-col`) — kolumny `planValue`, `realValue`, `deltaValue` nie mają już osobnych wpisów

### wytyczne

- `ui-stala` `COL_DEFS` — wiersz wpisu realizacji mapuje po TEJ SAMEJ liście kolumn co wiersz pozycji. Nowa kolumna = jeden `case` w `RealizationEntryLine` i w `RealizationEntryForm`; nie wolno renderować wpisów w osobnej tabeli, bo kolejność natychmiast się rozjeżdża
- `ui-sekcja` `SupplierPicker` — lista rozwija się jako `absolute`, więc nie wolno go osadzać w kontenerze z `overflow-hidden`/`overflow-x-auto`; dropdown zostaje wtedy przycięty i wygląda jakby wyboru dostawcy w ogóle nie było

## 2026-08-15 — feat(realizacja): zakładka Realizacja z płaską tabelą wszystkich liści (v2026.08.15.821)

### architektura / API

- nowa zakładka **Realizacja** (`RealizationTab`) na węźle `type=order`, obok „planowanie". Zawiera sekcję **Tabela realizacji**: płaska lista WSZYSTKICH liści kosztowych zamówienia z porównaniem zakupu do wyceny. Nie zakłada ani nie edytuje kart produktowych — służy wyłącznie rozliczaniu tego, co się wydarzyło. Bez `BaselineSplitCard`: realizacja nie zmienia wyceny
- kolumny tabeli (`COL_DEFS`) czytają się parami „plan → wykonanie": `parent`, `name`, `type`, `qty`, `realization` (Σ wpisów / plan z paskiem), `deltaQty`, `price`, `purchasePrice`, `planValue`, `realValue`, `deltaValue`, `actions`. Sortowanie po każdej, filtr per kolumna i zmiana szerokości — jak w panelu Materiały
- **filtr w nagłówku strony działa** — `searchQuery` z `DashboardPage` sięga nazwy, ścieżki, typu, produktu, wymagań technicznych i komentarza pozycji ORAZ treści WPISÓW (nr FV/PZ, dostawca, producent, model, komentarz), bo pozycję szuka się najczęściej po numerze faktury. Placeholder wyszukiwarki dla `activeTab='realization'`: „Szukaj po pozycji, produkcie, dostawcy, nr FV…"
- **nowy zakup jako przycisk** (`RealizationEntryForm`), nie stale widoczny wiersz: tabela czyta się jako zestawienie, a dopisywanie jest świadomą czynnością. Przycisk siedzi w kolumnie `actions` wiersza i w nagłówku dziennika w rozwinięciu; nazwa zależy od typu liścia — „Nowy zakup" dla materiału i sprzętu, „Nowe wykonanie" dla pracy i usługi. Enter zapisuje i zostawia formularz otwarty z kursorem w komentarzu. Domyślna ilość = brakująca do planu (nie sztywna 1)
- rozwinięcie wiersza (`RealizationExpandPanel`) zostawia **rozwijalne wymagania techniczne** (edytowalne, PATCH `/material-requirements/:id`) i **podgląd produktu** (`RequirementImageBox`, wklejanie Ctrl+V) — przy dopisywaniu zakupu trzeba wiedzieć, co miało być kupione. Pod spodem dziennik wpisów jako osobna tabela z własnymi nagłówkami (data, komentarz, dostawca, dokument, producent, model, ilość, koszt jedn., wartość), edytowalny w miejscu, oraz przycisk „Rozlicz"
- **liście inne niż materiał i sprzęt widoczne tylko dla managera** — `OPEN_LEAF_TYPES` = `['material','equipment']`; praca, usługa, nocleg i paliwo to koszty własne firmy i pokazują się wyłącznie roli ADMIN/MANAGER. Filtr działa na etapie budowania listy liści, więc pozycje nie wchodzą też do sum w nagłówku ani do wyszukiwarki. Na danych produkcyjnych: 80 pozycji dla managera, 37 dla logistyka
- zakładka niewidoczna dla pracownika (`cond: isOrder && !isWorker`); dopisywać może ADMIN/MANAGER/LOGISTYK (jak `@Roles` w `LeafActualsController`), reszta ma widok „tylko podgląd"
- nowy moduł `realizationShared.js` — meta typów, statusów i cała arytmetyka realizacji (`realizationOf`, `purchaseUnitOf`, `wbsRootOf`, `planUnitOf`, `leafNodesOf`, `buildCardMap`, `REAL_STATE`, formatery) wyjęte z `WbsMaterialsPanel` do wspólnego pliku. Oba widoki liczą z tych samych wpisów `LeafActual` — dwie kopie `realizationOf` znaczyłyby, że jeden ekran pokazuje inne pokrycie niż drugi
- `RequirementImageBox` wyeksportowany z `WbsMaterialsPanel` (podgląd produktu współdzielony z zakładką Realizacja)
- backend bez zmian — zakładka stoi na gotowym module `leaf-actuals` (`GET /leaf-actuals/order/:nodeId`, `POST`, `PATCH`, `DELETE`, `PATCH /close/:wbsNodeId`)
- test `test/test-realization-tab.mjs` — smoke warstwy danych: komplet pól w `/wbs-nodes/unified`, dopasowanie liść↔wymaganie, brak osieroconych wpisów, sumy nagłówka i średnia ważona kosztu zakupu

### słownik

- dodano `realization-tab`, `tab-realization`, `realization-col-defs`, `realization-entry-noun`, `realization-row`, `realization-entry-line`, `realization-entry-form`, `realization-expand-panel`, `realization-visible-types`, `realization-techspec-pending`, `realization-fetch-actuals`, `realization-refresh-card`, `realization-rows`, `realization-totals` — moduł Realizacja
- dodano `realization-open-types`, `realization-auth-headers`, `realization-flatten-wbs-nodes`, `realization-get-parent-path`, `realization-leaf-nodes-of`, `realization-resolve-card`, `realization-plan-unit-of` — `realizationShared.js`
- zmieniono ścieżkę `wbs-materials-type-meta`, `wbs-materials-leaf-types`, `realization-state-styles`, `realization-of`, `wbs-root-of`, `purchase-unit-of` — przeniesione do `realizationShared.js`

### wytyczne

- `ui-funkcja` `leafNodesOf` — „liść kosztowy" to węzeł Z TYPEM z `LEAF_TYPES`, **nie** węzeł bez dzieci. W realnych danych typowane pozycje bywają rodzicami innych pozycji i niosą własny koszt (np. „Avigilon … + licencje" `type=equipment`, `unitCost=4800`, z dzieckiem „licencja ACC7" `type=equipment`, `unitCost=1092`). Filtrowanie po bezdzietności wycięłoby 4 pozycje razem z ich zakupami — jedna z nich ma już wpis na 4355 zł. Każdy nowy widok realizacji bierze zbiór pozycji z `leafNodesOf`, nigdy z własnego `!node.children?.length`
- `ui-funkcja` `realizationOf` — jedyne źródło liczb realizacji; nowy widok importuje je z `realizationShared.js`, nie kopiuje. Dwie kopie rozjeżdżają pokrycie między ekranami
- `ui-stala` `OPEN_LEAF_TYPES` — widoczność typów liści po roli rozstrzyga się na etapie budowania listy pozycji, nie w renderze wiersza; inaczej ukryte pozycje nadal wchodziłyby do sum i do wyszukiwarki

## 2026-08-14 — fix(ui): Szukaj AI tylko po stronie Wyceny, jeden rozmiar czcionki w wierszach zakupu

### architektura / API
- `SupplierPicker` przyjmuje props `textClass` (domyślnie `text-sm`) — rozmiar czcionki triggera, pola szukania i listy. Bez tego dropdown dostawcy w wierszu wpisu zakupu odstawał (14 px) od pól obok (24 px)
- `ProductSideCard` — przycisk „Szukaj AI" renderuje się wyłącznie dla `side="offer"`; strona Zakupu bierze produkt kciukiem z Wyceny albo wpisem ręcznym
- wiersze wpisów zakupu (`RealizationEntryRow`, `RealizationAddRow`) mają jeden rozmiar czcionki we wszystkich oknach wpisu — `ROW_FONT` = 22 px, czyli największy dotychczasowy (24 px) minus 2 px. Obejmuje pola, dropdown dostawcy, wartość wpisu, autora, etykietę „nowy zakup / nowe wykonanie" oraz przyciski „dopisz" i „Rozlicz"; z przycisków zszedł `tracking-widest`, bo rozstrzelony napis przy 22 px nie mieścił się w kolumnie

### słownik
- dodano `realization-row-font` — wspólny rozmiar czcionki okien wpisu zakupu, `WbsMaterialsPanel.jsx`
- dodano `product-side-card-search-ai` — przycisk „Szukaj AI" (tylko strona Wyceny), `WbsMaterialsPanel.jsx`
- dodano `supplier-picker-text-class` — props `textClass`, `SupplierPicker.jsx`

### wytyczne
- `ui-stala` `ROW_FONT` — każde nowe okno wpisu w wierszach zakupu bierze rozmiar stąd, nie z własnej klasy `text-*`; rozmiary w tych wierszach mają być identyczne

## 2026-08-13 — feat(realizacja): etapowe wpisy zakupu i wykonania na liściu WBS (każdy typ)

### schema.prisma
- dodano model `LeafActual` (tabela `leaf_actuals`) — jeden wiersz = jedno zdarzenie zakupu albo wykonania: `entryDate`, `qty`, `unitCost`, `comment`, `docNumber`, `supplierId`, `authorId`. Kluczowany po `wbsRootId` (korzeń klonu liścia), NIE po id wiersza WBS — dzięki temu wpisy przeżywają utworzenie nowej wersji i świadomie NIE są klonowane w `cloneVersionData` (zakup zdarzył się raz w świecie rzeczywistym i nie należy do żadnej wersji). Bez FK na `wbsRootId`, bo liść bywa usuwany i odtwarzany; sprzątanie idzie kaskadą po `nodeId`
- dodano pole `sourceWbsNodeId` w modelu `WbsNode` — korzeń klonu liścia, odpowiednik `MaterialRequirement.sourceRequirementId`; klucz parowania baseline↔żywe dla WBS. Bez backfillu: kod czyta je jako `sourceWbsNodeId ?? id`, więc NULL znaczy „sam jestem korzeniem"
- dodano pole `realizationClosed` w modelu `WbsNode` — pozycja rozliczona mimo niedowykonania planu; różnica przestaje być brakiem i liczy się jako oszczędność, a liść wypada z niedokończonych w pokryciu
- dodano relacje `ProcessNode.leafActuals`, `Supplier.leafActuals`, `User.leafActuals`
- migracja `20260813150000_leaf_actuals`
- dodano pola `manufacturer` i `model` w modelu `LeafActual` — producent i model NA WPISIE, nie na pozycji: pozycja ma jeden produkt ofertowy (`ProductProposal isOffer`), a zakupów bywa kilka i mogą być zamiennikami. Migracja `20260813170000_leaf_actual_product` przepisuje produkt z propozycji `isPurchase` do wpisów z backfillu
- migracja `20260813160000_backfill_leaf_actuals` — przeniesienie dotychczasowych zakupów: każda propozycja `isPurchase` z ceną staje się PIERWSZYM wpisem swojego liścia (ilość = ilość z wyceny, data = `createdAt` propozycji, dostawca i nr oferty z propozycji, autor pusty). Bez tego pozycje już kupione pokazywałyby „0 / N · 0%". Cena wg reguły backendu (propozycja pełniąca obie role bierze `purchasePriceNetto`; brak → nie jest zakupem), idempotentna — jeden wpis na korzeń klonu i tylko dla liści bez wpisów. Na produkcji obejmie 13 z 16 propozycji zakupu (3 bez ceny zostają „jeszcze nie kupione")

### architektura / API
- nowy moduł `leaf-actuals` — `GET /leaf-actuals/order/:nodeId`, `POST /leaf-actuals`, `PATCH /leaf-actuals/:id`, `DELETE /leaf-actuals/:id`, `PATCH /leaf-actuals/close/:wbsNodeId`. Dopisywać może ADMIN/MANAGER/LOGISTYK; cudzy wpis edytuje i kasuje wyłącznie manager (pilnuje serwis, bo to zależy od autora, nie od samej roli). Każda operacja idzie do `AuditLog` — to dane rozliczeniowe
- `OrdersService.comparison` przebudowany z wymagań materiałowych na **liście WBS**: parowanie baseline↔żywe po `sourceWbsNodeId ?? id` (fallback po jednoznacznej nazwie dla wersji sprzed migracji), liść = węzeł bez dzieci. Praca i usługi wchodzą do porównania bez karty produktowej — plan biorą z `WbsNode.unitCost`, materiał i sprzęt dalej z propozycji `isOffer` / `budgetedPriceNetto`
- strona ZAKUP w porównaniu = suma wpisów `LeafActual` (cena to średnia ważona, bo każdy wpis ma własną). Brak wpisów → fallback na propozycję `isPurchase` (`source: 'PROPOSAL'`), żeby zamówienia sprzed wdrożenia nie wyzerowały się; brak i tego → `null`, czyli wprost „jeszcze nie kupione / nie zrobione"
- nowe odchylenie `NADMIAR` (kupione/wykonane więcej niż w planie) — osobne od `ILOSCIOWE`, które opisuje zmianę zakresu w wycenie. `ZAKRES_MINUS` zawsze 0: liść baseline bez żywego odpowiednika wypada z porównania
- wiersz porównania niesie teraz `wbsNodeId`, `baselineWbsNodeId`, `liveId` (id żywej karty materiałowej), `type`, `closed` i listę `entries`; `key` to id liścia baseline, nie wymagania — `BudgetModesPanel` grupuje po `baselineWbsNodeId`
- `WbsMaterialsPanel` pokazuje liście typu `work` i `service` obok `material` i `equipment` (`LEAF_TYPES`) — praca i usługa nie mają karty produktowej, więc rozwinięcie idzie prosto do wpisów, bez zakładania `MaterialRequirement`
- `WbsMaterialsPanel` — trzy nowe kolumny widoczne po akceptacji baseline: `realization` (licznik „Σ wpisów / plan" z paskiem i procentem), `deltaQty`, `deltaValue`; `purchasePrice` pokazuje teraz średnią ważoną z wpisów (fallback: propozycja `isPurchase`) i jest read-only, bo wynika z wpisów
- wpisy realizacji renderują się jako wiersze potomne liścia (`RealizationEntryRow`) z wierszem dopisywania na końcu (`RealizationAddRow`): data, komentarz, ilość, koszt jedn., dla materiału i sprzętu dodatkowo nr FV/PZ. Enter zapisuje i zostawia kursor w komentarzu; domyślki — data dziś, koszt jedn. z poprzedniego wpisu (przy pierwszym z wyceny), ilość 1
- wiersz wpisu realizacji jest w całości edytowalny w miejscu (data, komentarz, dostawca przez `SupplierPicker`, nr FV/PZ, ilość, producent, model, koszt jedn.) — zapis na blur, tylko zmienione pole; wartość wpisu liczy się na bieżąco. Czcionka w wierszach zakupowych 2× względem tabeli pozycji, bo to w nich się pracuje
- strona ZAKUP w porównaniu bierze produkt z ostatniego wpisu, który go ma (kolejne dostawy bywają zamiennikami); pełną historię niesie lista `entries`
- karta produktowa (`BaselineSplitCard`) zwija się razem z wymaganiami technicznymi, stan pamiętany w `localStorage`, domyślnie ZWINIĘTA — po wprowadzeniu wpisów rozwinięcie wiersza służy przede wszystkim zakupom
- eksport Excel z panelu Materiały: kolumny `Zakup / wykonanie`, `Koszt jedn. zakupu`, `Wartość realizacji`, `Δ ilość`, `Δ wartość`, `Rozliczone` (Δ jako żywe formuły) + nowy arkusz `Realizacja (wpisy)` z dziennikiem dostaw i wykonania
- `GET /wbs-nodes/unified/:nodeId` zwraca dodatkowo `sourceWbsNodeId` i `realizationClosed` — bez nich panel nie znałby korzenia klonu (wpisy trafiałyby pod złe id po utworzeniu wersji) ani stanu rozliczenia po przeładowaniu
- `WbsMaterialsPanel` dla liści bez karty (praca, usługa, nocleg, paliwo): kolumna „Koszt jedn. oferty" pokazuje `WbsNode.unitCost` (to z niego liczy się Δ wartość), a w kolumnie „Produkt" znika przycisk „Utwórz kartę" — zakładanie wymagań materiałowych na robociźnie nie ma sensu

### słownik
- dodano `leaf-actual` — model wpisu realizacji liścia, `schema.prisma`
- dodano `leaf-actuals-service` / `leaf-actuals-controller` / `leaf-actuals-module` — moduł CRUD wpisów, `apps/backend/src/leaf-actuals/`
- dodano `wbs-node-source-wbs-node-id`, `wbs-node-realization-closed` — nowe pola `WbsNode`, `schema.prisma`
- dodano `realization-of`, `wbs-root-of`, `realization-state-styles` — liczenie i kolory stanu realizacji, `WbsMaterialsPanel.jsx`
- dodano `realization-entry-row`, `realization-add-row`, `wbs-materials-realization-col` — wiersze wpisów i kolumna licznika, `WbsMaterialsPanel.jsx`
- dodano `fetch-actuals`, `add-actual`, `delete-actual`, `toggle-realization-closed` — operacje na wpisach, `WbsMaterialsPanel.jsx`
- dodano `wbs-materials-type-meta`, `wbs-materials-leaf-types`, `wbs-materials-actuals`, `materials-export-realization` — typy liści i eksport, `WbsMaterialsPanel.jsx`

### wytyczne
- `back-funkcja` `onlyPositions` w `comparison()` — pozycja porównania to każdy węzeł kosztowy poza `group` i poza korzeniem, DOKŁADNIE jak suma budżetu w `acceptPreview`. Nie filtrować po „węzeł bez dzieci": w tym drzewie węzeł z dzieckiem bywa osobną pozycją z własną ceną (kamera z doczepioną licencją) i taki filtr gubił jej zakup
- `schema-model` `LeafActual` — kluczować po `wbsRootId`, nigdy po id liścia; wpisy NIE wchodzą do `cloneVersionData` (wyjątek od zasady kompletności klonu: to fakt świata rzeczywistego, nie część wersji)
- `schema-pole` `WbsNode.sourceWbsNodeId` — ustawiać w klonie jako `sourceWbsNodeId ?? id`; każdy nowy kod parujący wersje WBS ma używać tego pola, nie nazwy węzła
- `ui-kolumna` `purchasePrice` — nie edytować wprost: to średnia ważona wpisów. Zmiana ceny zakupu = edycja albo dopisanie wpisu
- `back-endpoint` `PATCH /leaf-actuals/close/:wbsNodeId` — jedyna droga do `realizationClosed`; celowo poza `PATCH /wbs-nodes/:id`, bo to decyzja rozliczeniowa z wpisem do `AuditLog`
- jednostka zakupu = jednostka wyceny (1:1) — jeśli kiedyś dojdzie zakup w innej jednostce (bęben vs metry), przelicznik ma trafić na wpis, nie na liść

## 2026-08-13 — feat(materiały): kolumna Komentarz w widoku Materiały, Logistyka na tym samym panelu

### architektura / API
- `LogistykaMaterialListsTab` renderuje `WbsMaterialsPanel` zamiast `MaterialRequirementsPanel` — zakładka Logistyki jest teraz skrótem do widoku WBS/Materiały, z rozwijanym `BaselineSplitCard` (Wycena/Zakup), którego stara lista nie miała
- nowy `OrderMaterialsView` pobiera `GET /orders/:id/acceptance` per zamówienie i montuje `OfferLockGuard` — poza UnifiedWbsPanel nikt nie ustawiał stanu blokady, więc kliknięcie w zamrożone pole nie miało jak pokazać modala
- `AutoResizeTextarea` wyciągnięte z `WBSHybridTable.jsx` do własnego pliku — współdzielone przez obie tabele; import z WBSHybridTable do WbsMaterialsPanel zrobiłby cykl (WBSHybridTable już importuje stamtąd `BaselineSplitCard`)
- `COL_DEFS` w `WbsMaterialsPanel` — nowa kolumna `comment` (Komentarz) z sortowaniem, filtrem kolumnowym i wyszukiwaniem globalnym; zapis przez istniejący `PATCH /wbs-nodes/:id`
- etykieta zakładki Logistyki: „Listy Materiałowe" → „Materiały" (id zakładki `materialLists` bez zmian — zostaje w localStorage użytkowników)
- `ImageLightbox` — pełny podgląd zdjęcia produktu z kafelka `RequirementImageBox` (176×86 px `object-contain` gubi szczegóły zrzutów z kart katalogowych): tryb „dopasuj" i „1:1" z przewijaniem, wymiary w px, pobranie pliku, zamykanie Esc/kliknięciem w tło. Otwiera go osobna ikona „⤢" w rogu kafelka — klik w kafelek dalej wybiera plik, Ctrl+V dalej wkleja ze schowka

### słownik
- dodano `auto-resize-textarea` — textarea rosnąca do treści, `AutoResizeTextarea.jsx`
- dodano `image-lightbox` — modal pełnego podglądu zdjęcia produktu, `WbsMaterialsPanel.jsx`
- dodano `requirement-image-lightbox-open` — stan otwarcia lightboxa w `RequirementImageBox`, `WbsMaterialsPanel.jsx`
- dodano `wbs-material-row-comment` — edytowalna komórka Komentarz w `WbsMaterialRow`, `WbsMaterialsPanel.jsx`
- dodano `logistyka-order-materials-view` — wrapper widoku Materiały dla zamówienia, `LogistykaMaterialListsTab.jsx`

### wytyczne
- `ui-kolumna` `comment` — to samo pole `WbsNode.comment` co kolumna Komentarz w WBSHybridTable; po zapisie wysyłać `wbs-comment-changed`, bo `MarkerDetailsPanel` i `SchematTab` trzymają na tym evencie swoją kopię komentarza
- `ui-kolumna` `comment` — nie jest wartością ofertową, więc `offerLocked` (akceptacja baseline) jej nie zamraża; blokada dotyczy tylko Ilości i Kosztu jedn. oferty
- handlery `onBlur` w tabelach czytają wartość z `e.target.value`, nie ze stanu — blur potrafi wypaść w tym samym tasku co ostatnia zmiana i domknięcie ma wtedy starą wartość
- `ui-modal` `ImageLightbox` — renderowany przez `createPortal` do `body` i oznaczony `data-guard-ignore`; kafelek siedzi w komórce tabeli z `overflow:auto`, więc modal w drzewie komponentu zostałby przycięty

### znane błędy (nie naprawione tą zmianą)
- `back-serwis` `material-requirements.service.ts` — zapis obrazka idzie do stałej `UPLOADS_DIR = '/usr/src/app/uploads'` (ścieżka kontenera), a odczyt przez `resolveUploadPath()` do `process.cwd()/uploads`. W Dockerze obie wskazują to samo, ale przy backendzie odpalonym natywnie (`npm run start:dev`) upload zwraca 201 i zapisuje `imageUrl` w bazie, a `GET /:id/image` daje 404 — plik ląduje w `C:\usr\src\app\uploads`. Dotyczy też `uploadDatasheet`/`uploadCompliance`, jeśli używają tej samej stałej

## 2026-08-13 — chore(bezpieczenstwo): seed użytkowników poza startem kontenera

### architektura / API
- `apps/backend/Dockerfile.dev` CMD: usunięto `node prisma/seed-users-from-json.js` (odpalany dotąd warunkiem `NODE_ENV != production`, a compose ustawia `NODE_ENV: development`) — skrypt robi `upsert` po e-mailu, więc nadpisywał hasła istniejących kont danymi z repo
- `prisma/users-data.json` usunięty ze śledzenia i dopisany do `apps/backend/.gitignore` — trzymał hasło jawnym tekstem; wzorzec formatu w `prisma/users-data.example.json`
- `seed-users-from-json.js` — brak pliku danych kończy się czytelnym błędem i `exit 1` zamiast wyjątku `ENOENT`
- w CMD zostaje `seed.js` (same `upsert` ról i uprawnień — idempotentny)

### wytyczne
- `back-skrypt` `seed-users-from-json.js` — nigdy w komendzie startowej kontenera; uruchamiać ręcznie: `docker exec erp-backend node prisma/seed-users-from-json.js`
- produkcja jest osobnym bytem: na serwer trafia wyłącznie kod i migracje, dane pracowników wprowadzane są tam u źródła; lokalna baza służy wyłącznie testom

## 2026-08-13 — chore(deploy): backend stosuje migracje zamiast `prisma db push`

### architektura / API
- `apps/backend/Dockerfile.dev` CMD: `npx prisma db push` → `npx prisma migrate deploy`
- powód: `db push` wyliczał zmiany z różnicy schematu, więc pomijał dane zapisane w migracjach (m.in. `INSERT INTO leave_types` i limity `maxDaysPerYear`), a przy rozjeździe schematu albo przerywał start kontenera, albo — uruchomiony z `--accept-data-loss` przez `fix_db.sh` / `npm run db:init` — kasował kolumny i tabele
- stan produkcji przed zmianą: `_prisma_migrations` = 68 wpisów, pending = 8 migracji urlopowych; 13 wpisów w bazie nie ma plików w repo (skasowane historycznie) — `migrate deploy` ich nie sprawdza, bo nie wykrywa dryfu

### wytyczne
- `back-kontener` backend — zmiany schematu na produkcję trafiają wyłącznie przez pliki `prisma/migrations`; `db push` zostaje narzędziem lokalnym, `fix_db.sh` i `npm run db:init` (obie z `--accept-data-loss`) tylko po dumpie bazy

## 2026-08-13 — feat(urlopy): ustawowe limity dni dla rodzajów urlopu

### schema.prisma
- dodano pole `maxDaysPerYear` (Int?) w modelu `LeaveType` — ustawowy limit dni w roku kalendarzowym; NULL = brak limitu albo limit liczony osobno
- migracja `20260813070000_leave_type_max_days` ustawia: `NA_ZADANIE` = 4 (art. 167(2) k.p.), `OPIEKA` = 5 (art. 173(1) k.p.)

### architektura / API
- `POST /leave-requests` — nowa walidacja `assertStatutoryLimit`: suma dni wniosków `PENDING` + `APPROVED` z danego roku nie może przekroczyć `maxDaysPerYear`
- `GET /leaves/types` zwraca `maxDaysPerYear`; karta „Wykorzystane dni" pokazuje `wykorzystane / limit` dla rodzajów z limitem
- źródło liczb: gov.pl „Urlopy i zwolnienia od pracy" — wypoczynkowy 20/26 dni wg stażu, na żądanie 4, opiekuńczy 5, siła wyższa 2 dni / 16 godzin, opieka nad dzieckiem art. 188 2 dni / 16 godzin, bezpłatny bez limitu

- dodano `GET /leave-requests/type-usage?userId=&year=` — dla każdego rodzaju urlopu: `used`, `pending`, `limit`, `remaining`, `source`; limit bierze się z puli `LeaveBalance` (wypoczynkowy), `LeaveType.maxDaysPerYear` (limit ustawowy) albo zatwierdzonych `HolidayDayOff`
- modal wniosku pokazuje pod wyborem rodzaju: ile dni wybrano w roku, ile z tego oczekuje na decyzję i ile zostało (albo „bez limitu rocznego")

### wytyczne
- `back-funkcja` `typeUsage` — jedyne miejsce liczące „ile zostało" dla wniosku; przy nowym rodzaju limitu rozszerzać ten serwis, nie liczyć na froncie
- `schema-pole` `LeaveType.maxDaysPerYear` — trzymać tu wyłącznie limity ustawowe stałe w roku; limit `WYPOCZYNKOWY` wynika z `LeaveBalance` (pula z zaległymi latami), a `ZA_SWIETO_SOB` z liczby zatwierdzonych `HolidayDayOff` — obu nie dublować w tym polu

## 2026-08-12 — feat(uprawnienia): Użytkownicy i Firma tylko dla administratora

### architektura / API
- `POST /users`, `PATCH /users/:id`, `DELETE /users/:id` — zawężone z `ADMIN, MANAGER` do `ADMIN`
- `PATCH /company` — dodany `RolesGuard` + `@Roles('ADMIN')`; `GET /company` zostaje dla wszystkich zalogowanych, bo nagłówki eksportów biorą stąd dane firmy
- `GET /users` bez zmian: ADMIN i MANAGER widzą pełną listę (przypisania zadań, urlopy), pozostali wyłącznie siebie
- sidebar: pozycje „Użytkownicy" i „Firma" renderowane tylko przy roli ADMIN
- trasy `/users` i `/firma` owinięte w `AdminRoute` — wejście po URL bez roli ADMIN pokazuje „Brak dostępu"

### wytyczne
- `ui-sekcja` `AdminRoute` — strażnik tylko dla wygody UI; każdy nowy endpoint administracyjny musi mieć własny `@Roles('ADMIN')` po stronie backendu

## 2026-08-12 — feat(urlopy): dni wolne za święta wypadające w sobotę

### schema.prisma
- dodano model `HolidayDayOff` (`year`, `date` unique, `name`, `approved`, `approvedAt`, `approvedById`) — decyzja administratora o dniu wolnym za święto wypadające w sobotę; propozycje liczy backend, wiersz powstaje przy decyzji
- dodano relację `User.approvedHolidayDaysOff` ↔ `HolidayDayOff.approvedBy`
- migracja `20260812210000_holiday_days_off`

### architektura / API
- dodano `HolidaysService` — `POLISH_FIXED_HOLIDAYS` (9 świąt o stałej dacie) i wyliczanie propozycji: tylko one mogą wypaść w sobotę, święta ruchome są przypięte do dnia tygodnia
- dodano `GET /leaves/holidays?year=` — lista propozycji na rok wraz ze stanem decyzji i liczbą zatwierdzonych dni (dla każdego użytkownika modułu)
- dodano `PUT /leaves/holidays` (ADMIN) — `dates` to komplet zatwierdzonych dat dla roku; wszystko spoza listy wraca do stanu propozycji
- `POST /leave-requests` — wniosek rodzaju `ZA_SWIETO_SOB` przechodzi tylko do wysokości dni zatwierdzonych na dany rok, pomniejszonych o wnioski `PENDING`/`APPROVED`; brak zatwierdzonych dni = 400

- dodano `POST /leaves/holidays/custom` i `DELETE /leaves/holidays/custom?date=` (ADMIN) — własny dzień wolny poza kalendarzem świąt (od razu zatwierdzony) i jego usunięcie; dnia z kalendarza świąt nie można usunąć, tylko odznaczyć
- `PUT /leaves/holidays` obejmuje też dni dodane ręcznie — odznaczenie daty jest cofnięciem zatwierdzenia
- zarządzanie dniami wolnymi przeniesione z modala do osobnej karty „Dni wolne — zarządzanie", renderowanej tylko przy `access.canEdit`

### wytyczne
- `schema-model` `HolidayDayOff` — brak wiersza znaczy „propozycja niezatwierdzona"; nie zakładać wierszy seedem, tworzy je wyłącznie decyzja administratora
- `back-stala` `POLISH_FIXED_HOLIDAYS` — lista świąt ruchomych jest tu zbędna z definicji; dopisywać wyłącznie święta o stałej dacie

## 2026-08-12 — fix(urlopy): zatwierdzony wniosek zakłada wpis urlopowy

### schema.prisma
- dodano pole `leaveRequestId` (String?, `@unique`) w modelu `Leave` — wpis powstały z zatwierdzonego wniosku; NULL dla wpisów zakładanych ręcznie
- dodano relację `Leave.leaveRequest` ↔ `LeaveRequest.leave` (1:1, `onDelete: Cascade`) — usunięcie wniosku kasuje wygenerowany wpis
- migracja `20260812200000_leave_from_request`

### architektura / API
- `PATCH /leave-requests/:id/decision` — zatwierdzenie wniosku robi teraz `upsert` wpisu w `Leave` (daty, dni, komentarz jako notatka); wyjście ze stanu `APPROVED` (odrzucenie / cofnięcie) kasuje ten wpis. Wcześniej zatwierdzenie ruszało wyłącznie `LeaveBalance`, przez co tabela „Moje urlopy" i liczniki wykorzystanych dni zostawały puste
- wniosek bez `leaveTypeId` nie generuje wpisu — nie ma z czego ustalić rodzaju urlopu

### wytyczne
- `schema-pole` `Leave.leaveRequestId` — wpisy z wniosków rozpoznajemy po tym polu; nie kasować ich ręcznie, robi to zmiana statusu wniosku

## 2026-08-12 — feat(urlopy): kalendarz Google, karty „Moje dane" i zapis układu kart per użytkownik

### architektura / API
- dodano `GET /leaves/layout` i `PUT /leaves/layout` — układ kart zakładki „Moje dane" zapisywany per użytkownik w `UserEntityConfig` pod `entityType = 'leaves-cards-layout'` (bez zmian w schema.prisma)
- dodano zakładkę `Kalendarz` w module Urlopy — wspólny kalendarz Google (embed + link `cid`), bez ograniczeń uprawnień
- tabela „Moje urlopy" w „Moje dane" jest teraz tylko do odczytu (kolumny `dateFrom`, `dateTo`) — usunięto usuwanie wpisu, edycję komórek i modal edycji z tej zakładki

### słownik
- dodano `leaves-layout-entity-type`, `get-leaves-layout`, `save-leaves-layout`, `leaves-layout-get-endpoint`, `leaves-layout-put-endpoint` — zapis układu kart per użytkownik
- dodano `my-leaves-default-layout`, `my-leaves-layout-state`, `my-leaves-drag-end`, `my-leaves-save-layout`, `resolve-card-overlaps`, `find-free-spot` — sterowany układ kart i odsuwanie przykrytych kart
- dodano `leaves-calendar-tab`, `leaves-google-calendar-url`, `leaves-gov-url` — kalendarz Google i link do gov.pl
- usunięto `draggable-card-storage-key`, `reset-leaves-card-positions`, `on-my-leave-cell-changed`, `my-leaves-add-entry-button` — pozycje kart nie leżą już w localStorage, tabela jest read-only

### wytyczne
- `ui-stan` `layout` (MyLeavesTab) — pozycje kart są sterowane z góry; `DraggableCard` niczego nie zapisuje sam, zmiany wracają przez `onDragEnd` i lądują na serwerze dopiero po „Zapisz położenie kart"
- `back-endpoint` `PUT /leaves/layout` — payload to surowy JSON układu; walidacja kluczy po stronie frontu (`CARD_IDS`), backend trzyma go bez interpretacji

## 2026-08-12 — feat(urlopy): pula dni urlopowych, status wniosku i mail do przełożonego

### schema.prisma
- dodano enum `LeaveRequestStatus` (`PENDING` / `APPROVED` / `REJECTED`) — cykl życia wniosku
- dodano pole `status` w modelu `LeaveRequest` — status wniosku, backfill z `approvedAt`
- dodano pole `rejectedAt` w modelu `LeaveRequest` — data odrzucenia
- dodano pole `decisionComment` w modelu `LeaveRequest` — uzasadnienie decyzji przełożonego
- dodano pole `decidedById` + relacja `decidedBy` w modelu `LeaveRequest` — kto rozpatrzył wniosek
- dodano pole `consumesBalance` w modelu `LeaveType` — czy rodzaj urlopu pomniejsza pulę dni (seed: `WYPOCZYNKOWY`, `NA_ZADANIE`)
- dodano model `LeaveBalance` (`userId`, `year`, `entitlementDays`, `usedDays`, unique `[userId, year]`) — jedno źródło prawdy o dostępnych dniach urlopu, wiersz na rok
- dodano model `LeaveDeduction` (`leaveRequestId`, `year`, `days`) — rozksięgowanie zatwierdzonego wniosku na roczne pule, umożliwia cofnięcie decyzji
- dodano relacje `User.leaveBalances` i `User.leaveDecisions`

### architektura / API
- dodano `LeaveBalancesService` + `GET /leave-balances` i `PUT /leave-balances/entitlement` — odczyt salda (swojego zawsze, cudzego dla ADMIN / przełożonego) i ustawianie puli dni przez ADMIN
- okno lat salda liczone dynamicznie: `rok bieżący − 4 … rok bieżący` (`LEAVE_BALANCE_YEARS_BACK`); front renderuje listę lat z backendu zamiast zaszytych `remainingY1..Y4`
- `POST /leave-requests` — blokada 400, gdy pula dni pusta albo wniosek przekracza dostępne dni (tylko rodzaje z `consumesBalance`)
- `POST /leave-requests` — pola `remaining*` przestały być wejściem z formularza; backend zapisuje w nich migawkę salda z chwili złożenia
- dodano `PATCH /leave-requests/:id/decision` — zatwierdzenie / odrzucenie / cofnięcie decyzji; zatwierdzenie odejmuje dni od NAJSTARSZEGO rocznika, wyjście ze stanu `APPROVED` oddaje je do tych samych lat
- `DELETE /leave-requests/:id` — usunięcie zatwierdzonego wniosku oddaje dni do puli (kaskada sama tego nie robi)
- `GET /leave-requests/dashboard` — `balance` zwraca listę lat z pulą i pozostałymi dniami zamiast pól `remainingY*`; doszła flaga `canDecideSubject`
- dodano `MailService.sendLeaveRequest` — po złożeniu wniosku mail do przełożonego wnioskodawcy (best-effort, brak SMTP nie blokuje zapisu)
- dodano `MailService.sendLeaveDecision` — po rozpatrzeniu wniosku mail do wnioskodawcy z rozstrzygnięciem, autorem decyzji i uzasadnieniem; cofnięcie decyzji (`PENDING`) nie wysyła nic
- `EditUserModal` — konto z rolą ADMIN może zostać wskazane jako własny przełożony (pozostali nadal nie mają siebie na liście)
- `smtp_settings` obsługuje profile — wiersz `singleton` (globalny) i nowy `leaves` (moduł Urlopy); `GET/PATCH /smtp` oraz `POST /smtp/test` przyjmują `?profile=`, domyślnie globalny
- `SmtpService.sendMail` / `buildTransport` / `sendTest` przyjmują profil; profil bez wypełnionego hosta cofa się do globalnego, globalny bez hosta — do env `SMTP_*`
- maile modułu Urlopy (`sendLeaveRequest`, `sendLeaveDecision`) wychodzą przez profil `leaves`
- `SmtpSettingsPage` rozbite na `SmtpSettingsPanel` (wspólny UI edycji) + cienki wrapper; nowa zakładka „Urlopy SMTP" w module Urlopy, widoczna tylko dla ADMIN
- `LeaveRequestsTab` i `LeavesDashboardTab` — kolumna Status (oczekuje / zatwierdzony / odrzucony) oraz przyciski Akceptuj / Odrzuć / Cofnij dla przełożonego i ADMIN
- `LeavesDashboardTab` — ADMIN edytuje pulę dni za dany rok bezpośrednio w panelu salda

### słownik
- dodano wpisy modeli `LeaveBalance`, `LeaveDeduction`, enumu `LeaveRequestStatus`, serwisu `LeaveBalancesService`, endpointów salda i decyzji oraz zmiennych UI statusu i salda
- zmieniono `approve-leave-request` → `decide-leave-request-front` — `setApproval` zastąpione przez `setDecision`

### wytyczne
- `schema-model` `LeaveBalance` — jedyne źródło prawdy o dostępnych dniach; pola `LeaveRequest.remaining*` to wyłącznie migawka do wydruku formularza, nie licz z nich salda
- `back-funkcja` `applyDeductions` — każde odjęcie dni musi zapisać rozbicie w `LeaveDeduction`, inaczej cofnięcie decyzji nie odda dni do właściwych lat
- `schema-pole` `LeaveType.consumesBalance` — walidacja puli i odejmowanie dni dotyczą wyłącznie rodzajów z tą flagą; L4, bezpłatny i opieka nie ruszają salda
- `back-funkcja` `notifySupervisor` — powiadomienia mailowe modułu Urlopy są best-effort; błąd SMTP nie może wywracać zapisu wniosku
- `back-stala` `SMTP_PROFILES` — nowy profil poczty = nowa pozycja w tej stałej i wiersz w `smtp_settings`; nigdy nie twórz wierszy o dowolnym id, `resolveSmtpProfile` odrzuca nieznane wartości do profilu globalnego

## 2026-08-11 — feat(urlopy): dni wniosku bez weekendów, wymagany rodzaj urlopu i daty

### architektura / API
- `LeaveRequestsService.calendarDaysBetween` zastąpione przez `workingDaysBetween` — soboty i niedziele w zakresie nie są liczone do dni urlopu
- dodano `LeaveRequestsService.warsawDayKey` — granice dni wyznaczane w strefie Europe/Warsaw; liczenie po UTC przesuwało zakres o dobę, bo UI wysyła lokalną północ jako 22:00Z
- dodano `LeaveRequestsService.assertRequestFieldsValid` — `leaveTypeId`, `dateStart` i `dateEnd` obowiązkowe przy tworzeniu; przy edycji nie można ich wyczyścić ani odwrócić zakresu
- `LeaveRequestModal` — rodzaj urlopu oznaczony gwiazdką i walidowany przed wysyłką; licznik dni pomija weekendy, podpis pola informuje o regule

### wytyczne
- `back-funkcja` `workingDaysBetween` — reguła dni roboczych obowiązuje teraz i we wnioskach, i we wpisach `Leave`; święta ustawowe nie są jeszcze uwzględniane, bo brak słownika dni wolnych
- `schema-pole` `LeaveRequest.leaveTypeId` — w bazie pozostaje nullable (stare wnioski), ale API nie pozwala już utworzyć ani zapisać wniosku bez rodzaju urlopu
- `back-funkcja` `warsawDayKey` — każda arytmetyka dni na `LeaveRequest` musi iść przez ten helper, nigdy po `getUTCDate()` na surowej dacie z żądania

## 2026-08-11 — feat(urlopy): dni wniosku liczone z zakresu dat, widok Wnioski dla admina

### architektura / API
- dodano `LeaveRequestsService.calendarDaysBetween` — dni urlopu liczone jako dni kalendarzowe z dniem początkowym i końcowym włącznie (11.08 00:00 → 12.08 23:59 = 2 dni)
- `POST /leave-requests` — `daysCount` wyliczany z zakresu dat, gdy nie podano go jawnie
- `PATCH /leave-requests/:id` — zmiana `dateStart`/`dateEnd` bez jawnego `daysCount` przelicza liczbę dni z nowego zakresu
- `GET /leave-requests/mine` — dla roli ADMIN zwraca wnioski wszystkich pracowników, dla pozostałych wyłącznie własne
- `LeaveRequestsTab` — kolumny wnioskującego (Imię Nazwisko, Email, Firma) pokazywane w zakładce podwładnych oraz w „Wnioskach" admina
- `LeaveRequestModal` — pole „Dni urlopu" wypełnia się automatycznie przy zmianie dat; ręczna edycja wyłącza automat, przycisk „przelicz z dat" go przywraca

### wytyczne
- `back-funkcja` `calendarDaysBetween` — liczone są dni kalendarzowe, więc weekendy i święta wchodzą do sumy; wpisy `Leave` nadal używają `workingDaysBetween` (dni robocze) — te dwie reguły są celowo różne
- `back-endpoint` `GET /leave-requests/mine` — nazwa endpointu jest historyczna; dla ADMIN zwraca wszystkie wnioski, zakres rozstrzyga backend po `scope`

## 2026-08-11 — fix(urlopy): jeden przycisk Nowy wniosek w karcie danych osobowych

### architektura / API
- usunięty przycisk przenoszący z „Moich danych” do zakładki Wnioski — zmiana zakładki nie była tym, czego oczekiwał użytkownik
- przycisk „Dodaj wpis urlopu” przemianowany na „Nowy wniosek” i otwiera `LeaveRequestModal` bezpośrednio w zakładce Moje dane (bez przeskoku), z pracownikiem ustawionym na zalogowanego i bez możliwości zmiany
- dodawanie wpisu do tabeli urlopów przeniesione nad tabelę jako „+ Dodaj wpis do tabeli” (tylko ADMIN) — inaczej zniknikęłoby wejście do `LeaveModal`
- `MyLeavesTab` nie przyjmuje już propsa `onNewRequest`

### wytyczne
- `ui-przycisk` `card-new-request-button` — „Nowy wniosek” zawsze otwiera modal wniosku w miejscu; przejścia między zakładkami nie używamy jako reakcji na przycisk akcji

## 2026-08-11 — feat(urlopy): Moje dane jako przeciągalne karty z pełnym saldem lat

### architektura / API
- dodano `DraggableCard` — karta przenoszona myszką za nagłówek, pozycja zapamiętywana w `localStorage` (klucz `leaves-card-pos-<id>`), przycisk „Ułóż karty od nowa” czyści zapis
- `MyLeavesTab` przebudowany na trzy karty: dane osobowe (z akcjami Nowy wniosek / Dodaj wpis), saldo dni na lata, podopieczni; tabela urlopów leży domyślnie pod kartami
- `MyLeavesTab` pobiera `GET /leave-requests/dashboard` — stąd „pozostało mi do wybrania”, „wybrany w tym roku” i rozbicie na lata (bieżący − 4)
- `DependentsSection` zwężona: lista wierszy zamiast kafli, formularz rozwijany dopiero po „+ Dodaj podopiecznego”, bez wybieraka pracownika; raportuje liczbę podopiecznych do karty danych osobowych

### wytyczne
- `ui-karta` `DraggableCard` — pozycje kart są per przeglądarka (localStorage), nie per użytkownik w bazie; czyszczenie cache przywraca układ domyślny
- `ui-zakladka` `MyLeavesTab` — saldo dni pochodzi z ostatniego wniosku użytkownika (pola `remaining*`), a nie z wyliczenia z wymiaru urlopu; do policzenia go realnie brakuje pola `dni_urlopu_na_rok`

## 2026-08-11 — fix(urlopy): zakładka Moje dane zawężona do zalogowanego użytkownika

### architektura / API
- `GET /leaves/employees` — pytający zawsze trafia na listę pracowników, nawet jeśli jego firma nie jest w `LEAVE_COMPANIES` (ADMIN bez firmy mógł nie zobaczyć samego siebie)
- `MyLeavesTab` — siatka wpisów filtrowana do `currentUserId`; usunięty przełącznik „Tylko moje wpisy” oraz kolumny Pracownik i Firma (zbędne przy jednej osobie)
- `MyLeavesTab` — dodany nagłówek tożsamości (imię, nazwisko, email, firma); sekcja Podopieczni bez wybieraka pracownika
- `LeaveModal` — nowy props `defaultUserId`, dzięki czemu „Dodaj wpis” w Moich danych od razu wskazuje zalogowanego

### wytyczne
- `ui-zakladka` `MyLeavesTab` — zakładka „Moje dane” pokazuje wyłącznie dane zalogowanego użytkownika, także adminowi; cudze wpisy należy oglądać w zakładkach wniosków i Dashboard

## 2026-08-11 — feat(urlopy): podopieczni i urlop opiekuńczy

### schema.prisma
- dodano model `Dependent` (tabela `dependents`) — podopieczny użytkownika: `firstName`, `lastName`, `birthDate`, FK `userId` (onDelete Cascade)
- dodano relację `User.dependents` (1:N) — każdy użytkownik może mieć wielu podopiecznych
- dodano pole `LeaveRequest.dependentId` + relację `LeaveRequest.dependent` (onDelete SetNull) — wniosek wskazuje, na kogo brany jest urlop opiekuńczy
- migracja `20260811130000_add_dependents`

### architektura / API
- dodano `DependentsController` + `DependentsService` w `LeavesModule`
- dodano `GET /dependents?userId=`, `POST /dependents`, `PATCH /dependents/:id`, `DELETE /dependents/:id`
- `LeaveRequestsService` waliduje wnioski: rodzaj o kodzie `OPIEKA` wymaga `dependentId`, a wskazany podopieczny musi należeć do wnioskodawcy
- `LeaveRequestModal` — pola podopiecznego pojawiają się tylko dla rodzaju Opieka: przy jednym podopiecznym dane pokazują się od razu, przy wielu najpierw dropdown wyboru
- `DependentsSection` — zarządzanie podopiecznymi w zakładce „Moje dane” (dodaj / edytuj / usuń)

### słownik
- dodano wiersze modelu `Dependent`, serwisu, endpointów i komponentów podopiecznych

### wytyczne
- `schema-pole` `LeaveRequest.dependentId` — wymagane wyłącznie dla rodzaju o kodzie `OPIEKA`; dla pozostałych rodzajów zapisywane jest `null`, także gdy front coś przyśle
- `back-stala` `CARE_LEAVE_CODE` — rozpoznanie urlopu opiekuńczego idzie po `LeaveType.code`, nigdy po nazwie; stała lustrzana w `leavesTheme.js`
- `back-funkcja` `DependentsService.resolveSubject` — cudzych podopiecznych czyta i edytuje tylko ADMIN albo bezpośredni przełożony pracownika

## 2026-08-11 — feat(urlopy): widok zakładkowy (Moje dane / Wnioski / Wnioski podwładnych / Dashboard)

### schema.prisma
- dodano pole `leaveTypeId` w modelu `LeaveRequest` — rodzaj_urlopu, FK do istniejącego słownika `LeaveType` (opcjonalne, onDelete SetNull)
- dodano pole `daysCount` w modelu `LeaveRequest` — dni_urlopu, Float default 1
- dodano relacje `LeaveRequest.leaveType` i `LeaveType.requests`
- migracja `20260811120000_leave_request_type_days`

### architektura / API
- dodano `LeaveRequestsController` + `LeaveRequestsService` w `LeavesModule`
- dodano `GET /leave-requests/mine`, `GET /leave-requests/subordinates`, `GET /leave-requests/dashboard?userId=`, `POST /leave-requests`, `PATCH /leave-requests/:id`, `DELETE /leave-requests/:id`
- `LeavesPage` przebudowany na pasek zakładek w stylu WBS: Moje dane, Wnioski, Wnioski moich podwładnych, Dashboard; zakładka podwładnych ukryta przy scope SELF
- zakładki rodzajów urlopu zeszły poziom niżej — są teraz podzakładkami w `MyLeavesTab`, z przełącznikiem „Tylko moje wpisy”
- `LeaveRequestModal` odwzorowuje formularz źródłowy (Imię Nazwisko, rodzaj_urlopu, data_od, data_do, komentarz, dni_urlopu) + sekcja rozwijana z obecnością w biurze i saldem dni
- `LeavesDashboardTab` — cztery panele: FILTR, szczegóły pracownika, saldo dni do wybrania, wnioski wybranego pracownika

### słownik
- dodano wiersze modułu wniosków (serwis, controller, endpointy) i komponentów zakładek; usunięto martwe wpisy po refaktorze `LeavesPage`

### wytyczne
- `back-endpoint` `PATCH /leave-requests/:id` — `approvedAt` może ustawić wyłącznie bezpośredni przełożony autora albo ADMIN; autor nie zatwierdza własnego wniosku
- `schema-model` `LeaveRequest` — po zatwierdzeniu (`approvedAt`) autor traci prawo edycji i usunięcia; zmiany może wprowadzać już tylko przełożony lub ADMIN
- `back-endpoint` `GET /leave-requests/dashboard` — parametr `userId` dopuszczalny tylko dla ADMIN albo bezpośredniego przełożonego wskazanego pracownika

## 2026-08-11 — feat(urlopy): tabela wniosków urlopowych (LeaveRequest)

### schema.prisma
- dodano model `LeaveRequest` (tabela `leave_requests`) — wniosek urlopowy pracownika
- dodano pola: `dateStart`/`timeStart`, `dateEnd`/`timeEnd`, `officeFrom`/`officeTo` (w biurze od/do), `comment`, `submittedAt` (data złożenia), `approvedAt` (data zatwierdzenia), `createdAt` (timestamp)
- dodano pola salda dni pozostałych do wybrania: `remainingY4` (zaległy sprzed 4 lat), `remainingY3`, `remainingY2`, `remainingY1` (sprzed roku), `remainingCurrentYear` (z tego roku) — typ Float, default 0
- dodano relację `User.leaveRequests` (1:N do `LeaveRequest`, onDelete Cascade)
- migracja `20260811110000_add_leave_requests` + indeksy na `userId`, `dateStart`, `submittedAt`

### słownik
- dodano wiersze modelu `LeaveRequest` w sekcji `### Moduł Urlopy (leaves)`

### wytyczne
- `schema-pole` `LeaveRequest.timeStart` / `timeEnd` — godziny trzymane jako `String` w formacie "HH:mm", osobno od pól datowych; nie łączyć ich z `dateStart`/`dateEnd` w bazie
- `schema-pole` `LeaveRequest.remainingY4`..`remainingCurrentYear` — to migawka salda dni **jeszcze do wybrania** w chwili składania wniosku, nie liczba dni wnioskowanych

## 2026-08-11 — feat(urlopy): moduł Urlopy — słownik rodzajów, wpisy per pracownik, gating po firmie

### schema.prisma
- dodano model `LeaveType` — słownik rodzajów urlopu (`code`, `name`, `color`, `sortOrder`, `isActive`); jeden wiersz = jedna zakładka w widoku Urlopy
- dodano model `Leave` — wpis urlopowy pracownika (`userId`, `leaveTypeId`, `dateFrom`, `dateTo`, `daysCount`, `note`)
- dodano relację `User.leaves` (1:N do `Leave`, onDelete Cascade)
- dodano relację `Leave.leaveType` (N:1 do `LeaveType`, onDelete Restrict)
- pole `User.company` istniało wcześniej — otrzymało anchor `user-company` i jest teraz edytowalne z UI
- migracja `20260811100000_add_leaves` zakłada obie tabele i seeduje 6 rodzajów urlopu: Wypoczynkowy, L4, Bezpłatny, Opieka, Na żądanie, Do wyboru za święto w sobotę

### architektura / API
- dodano `LeavesModule` (`apps/backend/src/leaves/`) zarejestrowany w `AppModule`
- dodano `GET /leaves/access` — zwraca `{ enabled, canEdit, scope, company }`; `enabled` gdy user ma firmę z `LEAVE_COMPANIES` albo rolę ADMIN
- dodano `GET /leaves/types`, `GET /leaves/employees`, `GET /leaves?leaveTypeId=`, `POST /leaves`, `PATCH /leaves/:id`, `DELETE /leaves/:id`
- `JwtStrategy.validate` zwraca dodatkowo `company` w `req.user`
- frontend: nowy widok `/urlopy` (`LeavesPage`) z zakładkami per rodzaj urlopu i edycją inline w AG Grid, modal `LeaveModal` w stylu `EditUserModal`
- sidebar System: przycisk „Urlopy" renderowany tylko gdy `GET /leaves/access` zwróci `enabled: true`
- `UsersPage`: nowa kolumna „Firma" (edycja inline, agSelectCellEditor), `EditUserModal`: pole Firma z podpowiedziami

### słownik
- dodano sekcję `### Moduł Urlopy (leaves)` — modele, endpointy, serwis, widok, modal, kolumna Firma

### wytyczne
- `back-stala` `LEAVE_COMPANIES` — lista firm z modułem Urlopy żyje w `leaves.service.ts` i jest lustrzana w `apps/frontend/src/utils/leaveCompanies.js`; zmiana w jednym miejscu wymaga zmiany w drugim
- `back-endpoint` `GET /leaves` — widoczność danych rozstrzyga wyłącznie backend (`scope`): ADMIN → wszyscy, przełożony → on + bezpośredni podwładni, pracownik → tylko on; frontend nie filtruje
- `schema-model` `Leave` — zapis/edycja/usuwanie wyłącznie dla roli ADMIN (`canEdit`); przełożony i pracownik mają dostęp tylko do odczytu

# CHANGELOG — Ignite ERP

Zmiany strukturalne: schemat bazy, architektura, API. Bugfixy i refaktory nie są tu zapisywane.

---

## 2026-08-10 — feat(dashboard): akceptacja baseline sygnalizowana kolorem przełącznika wersji

### architektura / API
- usunięty chip `ZAAKCEPTOWANE` z headera (`dashboard-order-stage-badge`) — etap zamówienia (`acceptance.orderStage`) nie jest już nigdzie renderowany w headerze
- `ui-stan` `baselineAccepted` — przełącznik wersji (snapshotu) i jego rozwijana lista są zielone (emerald) zamiast niebieskich, gdy zamówienie ma zaakceptowany baseline; szczegóły akceptacji (wersja · kto · kiedy) przeniesione do tooltipa przycisku, żeby nie zginęły razem z chipem

### słownik
- usunięto `dashboard-order-stage-badge` — chip zniknął z headera
- dodano `dashboard-baseline-accepted` — `baselineAccepted` w `DashboardPage.jsx`

---

## 2026-08-10 — fix(materials): kciuk kopiuje produkt Wyceny do Zakupu jako OSOBNY wpis

### architektura / API
- `back-funkcja` `setPurchase` — `PATCH /material-requirements/proposals/:id/set-purchase` wywołane na propozycji `isOffer` nie flaguje już tego samego rekordu, tylko zakłada jego kopię (`materializePurchaseCopy`) i to jej nadaje rolę `isPurchase`. Dotąd jeden `ProductProposal` pełnił obie role, więc split pokazywał po obu stronach TEN SAM wiersz: edycja albo usunięcie produktu po stronie Zakupu kasowała produkt Wyceny
- `back-funkcja` `materializePurchaseCopy` — kopia produktu ofertowego do osobnej propozycji zakupowej. Gdy strona Zakup ma już swój (nieofertowy) rekord, kopia go nadpisuje w miejscu, więc powtórne kliknięcie kciuka nie mnoży propozycji. Cena startowa zakupu = `purchasePriceNetto ?? priceNetto` oferty; z rekordu ofertowego schodzi `isPurchase` i `purchasePriceNetto`. Pola plikowe (`imageUrl`, `dataSheet*`, `compliance*`) NIE są kopiowane — dwa rekordy wskazywałyby jeden plik na dysku
- `back-funkcja` `setOffer` i `selectProposal` — kierunek odwrotny domknięty: propozycja przejmująca rolę „Wycena" oddaje rolę „Zakup" własnej kopii
- `ui-funkcja` `deleteProduct` (`ProductSideCard`) — nowy przycisk „Usuń produkt" na każdej stronie splitu; kasuje wyłącznie propozycję tej strony (stary, współdzielony wpis traci tylko rolę Zakupu przez `clear-purchase`)
- `ui-karta` `BaselineSplitCard` — plakietka `= produkt z wyceny` zamieniona na ostrzegawcze `wspólny wpis z wyceną`; oznacza wyłącznie dane sprzed rozdzielenia ról

### migracje
- `20260810140000_split_shared_offer_purchase_proposal` — rozdziela istniejące propozycje pełniące obie role: kopia zakupowa z ceną `COALESCE(purchasePriceNetto, priceNetto)`, rekord ofertowy traci `isPurchase` i `purchasePriceNetto`

### słownik
- dodano `mat-req-materialize-purchase-copy` — `materializePurchaseCopy` w `material-requirements.service.ts`
- dodano `product-side-card-delete-product` — `deleteProduct` w `WbsMaterialsPanel.jsx`

### wytyczne
- `schema-pole` `ProductProposal.isOffer` / `isPurchase` — jeden rekord = jedna rola. Żadna ścieżka nie może ustawić obu flag na tej samej propozycji; produkt wspólny dla obu stron powstaje przez kopię, nie przez współdzielenie wiersza. Inaczej usunięcie/edycja po jednej stronie splitu niszczy drugą
- `schema-pole` `ProductProposal.purchasePriceNetto` — pole legacy, obsługuje wyłącznie wpisy sprzed rozdzielenia ról; nowe ceny zakupu idą w `priceNetto` propozycji zakupowej

---

## 2026-08-10 — feat(orders): czcionka panelu porównawczego dopasowywana do szerokości

### architektura / API
- `ui-funkcja` `fitTableFont` — czcionka tabeli porównania dobierana pomiarem: start od 16px, zejście proporcją `szerokość panelu / szerokość treści`, dolna granica 9px. Kilka przebiegów, bo zawijanie tekstu nie skaluje się liniowo. Przeliczenie po zmianie danych i przez `ResizeObserver` na kontenerze, więc panel dopasowuje się też przy zmianie rozmiaru okna
- wszystkie rozmiary WEWNĄTRZ tabeli (czcionki pomocnicze, `max-w` kolumn, padding poziomy) przeliczone z px na `em` — inaczej ~200px stałego paddingu z 11 kolumn nie schodziło razem z fontem i tabela nie mieściła się w węższych osadzeniach. Pasek KPI nad tabelą zostaje w px, nie skaluje się

### słownik
- dodano `comparison-fit-font` — `fitTableFont` w `ComparisonPanel.jsx`

### wytyczne
- `ui-funkcja` `comparison-fit-font` — nowe elementy w tabeli porównania wymiaruj w `em`, nie w px; wartość w px nie zmniejszy się razem z czcionką i przywróci poziomy suwak

---

## 2026-08-10 — fix(wbs): usunięcie węzła kasuje kartę materiałową, gdy traci ostatnie powiązanie

### architektura / API
- `back-funkcja` `deleteNode` — karta materiałowa, której po usunięciu węzłów nie zostaje ŻADNE powiązanie WBS, jest teraz usuwana zamiast odczepiana (`wbsNodeId: null`, `quantity: 0`). Odczepiona karta była widmem: panel Materiały kluczuje po `wbsNodeId`, więc znikała z UI i nie dało się jej otworzyć ani skasować, ale nadal liczyła się w porównaniu Wycena↔Zakup. Karta przypisana do kilku węzłów przeżywa usunięcie części z nich — zostaje przepięta na pozostałe, z przeliczonymi `wbsNodeIds` i `wbsNodeAllocations`
- `DELETE /wbs-nodes/:id` zwraca dodatkowo `deletedRequirements` — ile kart poszło razem z węzłami
- kasowanie karty zdejmuje kaskadą jej `ProductProposal`; `QuickQuoteItem.materialRequirementId` ma `SetNull`, więc zamrożone wyceny baseline przeżywają

### słownik
- dodano `delete-node-orphan-cards` — usuwanie osieroconych kart w `deleteNode`

### wytyczne
- `back-funkcja` `deleteNode` — karta materiałowa bez `wbsNodeId` jest nieosiągalna w UI (panel Materiały kluczuje wyłącznie po tym polu), więc „zachowanie" jej przy usuwaniu węzła jest pozorną ochroną — nie zostawiaj takich wierszy

---

## 2026-08-10 — feat(orders): sumy Wycena / Zakup / Δ przeniesione do nagłówków kolumn

### architektura / API
- pasek KPI panelu porównawczego oddał sumy do nagłówka tabeli: Δ trafiła do nagłówka kolumny Δ (zamiast samej litery), a sumy stron nad kolumny „Wartość". W pasku zostały tylko etykieta baseline, licznik `zakupione n/m`, chipy odchyleń i akcje
- z nagłówków grup zniknęły opisy „Wycena (ilość · cena · wartość · dostawca)" / „Zakup (…)" — powielały wiersz podnagłówków; strony rozróżnia teraz kolor podnagłówków (pomarańcz = Wycena, czerwień = Zakup)
- `ui-modal` `materials-comparison-modal` — szerokość `max-w-5xl` → `max-w-[72vw]`, wysokość `85vh` → `92vh`; tabela porównania `max-h-70vh` → `78vh`; czcionka panelu +4px

### słownik
- dodano `comparison-delta-summary` — `deltaSummary` w `ComparisonPanel.jsx`
- dodano `comparison-side-sums` — sumy stron w nagłówkach grup kolumn

### wytyczne
- `ui-kolumna` `comparison-delta-summary`, `comparison-side-sums` — każda suma stoi w nagłówku kolumny (grupy), którą sumuje, i nigdzie indziej; jedno miejsce prawdy, żeby wartość nie rozjechała się z sumowaną kolumną

---

## 2026-08-10 — feat(suppliers): usunięcie dostawcy i powrót pola do pustego

### architektura / API
- `ui-dropdown` `SupplierPicker` — dwie drogi wyczyszczenia wyboru: krzyżyk przy wybranej wartości i pozycja „— bez dostawcy —" na szczycie listy. Obie wołają `onChange(null)`, pole wraca do „Wybierz dostawcę…". Wcześniej kontrakt `onChange(supplier | null)` deklarował null, ale żadna ścieżka UI go nie wywoływała — raz wybranego dostawcy nie dało się zdjąć
- `PATCH /material-requirements/proposals/:proposalId` z `{"supplierId": null}` czyści `ProductProposal.supplierId` (relacja `onDelete: SetNull`) — bez zmian w backendzie, ścieżka działała, brakowało tylko wywołania z UI
- `ui-funkcja` `supplierChange` w `ProductSideCard` nie zakłada już pustej propozycji, gdy czyszczony jest dostawca na pozycji bez produktu

### słownik
- dodano `supplier-picker-clear` — `clearSupplier` w `SupplierPicker.jsx`

### wytyczne
- `ui-dropdown` `SupplierPicker` — po akceptacji baseline zdjęcie dostawcy po stronie Wyceny przechodzi przez `assertProposalOfferEditable` (guard oferty, manager może odblokować); strona Zakupu czyści się bez przeszkód

---

## 2026-08-10 — feat(orders): panel porównawczy to split Wycena↔Zakup, nie dwie kopie tej samej ceny

### architektura / API
- `GET /orders/:nodeId/comparison` — obie strony pochodzą teraz z `ProductProposal`, nie z jednego `MaterialRequirement.budgetedPriceNetto`. Lewa (WYCENA) = propozycja `isOffer` klonu baseline, fallback na `budgetedPriceNetto` wymagania. Prawa (ZAKUP) = propozycja `isPurchase` żywego wiersza; gdy ta sama propozycja pełni obie role, cena zakupu to `purchasePriceNetto`. Wcześniej obie kolumny czytały to samo pole i pokazywały identyczne liczby
- strona Zakupu **nie ma fallbacku** na cenę wyceny — brak produktu `isPurchase` daje `current: null` (UI: „jeszcze nie zakupiony"), a pozycja wypada z sum. Usunięto `kpi.forecastSum` (prognozował zakup ceną wyceny)
- `kpi.deltaSum` = suma kolumny Δ, czyli wyłącznie wiersze mające OBIE wartości; nowe `kpi.purchasedOfferSum` to ich wycena i mianownik `deltaPct`. `coveragePriced` znaczy teraz „ile pozycji ma produkt zakupu"
- wiersz zwraca `baseline.supplier` / `baseline.product` i `current.supplier` / `current.product` — dostawca jest atrybutem propozycji, więc każda strona ma własnego
- odchylenie `KURSOWE` usunięte: `ProductProposal` nie ma waluty ani kursu, więc detekcja była nieosiągalna. `CENOWE` odpala tylko gdy obie strony mają cenę
- `ui-sekcja` `BudgetModesPanel` — żywe wymagania czyta z aktywnej wersji (`versionId` niepuste, fallback na `null`) zamiast wyłącznie `versionId=null`; tryb Wykonanie liczy cenę i wartość z samego wymagania, nie ze strony Zakup porównania

### słownik
- dodano `comparison-build-offer`, `comparison-build-purchase` — budowa stron Wycena/Zakup w `OrdersService.comparison`
- dodano `comparison-side-styles`, `comparison-not-purchased` — kolory stron (Wycena pomarańczowa, Zakup czerwony) i komórka „jeszcze nie zakupiony"
- usunięto `comparison-source-styles` — badge źródła ceny (FO/QQ/MAN) nie dotyczy strony Zakupu

### wytyczne
- `schema-pole` `ProductProposal.purchasePriceNetto` — czytaj cenę zakupu jako `isOffer ? purchasePriceNetto : priceNetto`; jedna propozycja może pełnić obie role splitu i wtedy `priceNetto` należy do WYCENY
- `back-funkcja` `OrdersService.comparison` — strona Zakupu nigdy nie dostaje fallbacku na cenę wyceny; brak zakupu ma zostać widoczny jako brak, nie jako zero-odchylenie

---

## 2026-08-10 — fix(orders): porównanie baseline↔żywe czyta aktywną wersję zamiast legacy baseline

### architektura / API
- `GET /orders/:nodeId/comparison` — „żywe dane" to teraz wiersze AKTYWNEJ wersji (`resolveVersionId`), a nie `versionId=null`. Baseline null to legacy sprzed wersjonowania i niósł nieaktualny zakres (materiały wycofane w kolejnych snapshotach wracały do porównania jako `ZAKRES_PLUS`). Fallback na `null` zostaje, gdy aktywna wersja nie ma własnych wierszy
- parowanie baseline↔żywe po korzeniu klonu `sourceRequirementId ?? id` po obu stronach zamiast jednostronnego `baseline.sourceRequirementId → live.id`. Poprzednia wersja nie parowała nic, gdy `sourceRequirementId` był NULL (dane sprzed wprowadzenia pola) → `baselineSum` wychodził 0 zł
- panel porównawczy przeniesiony z nagłówka zamówienia (DashboardPage) do nagłówka sekcji **Materiały** w `UnifiedWbsPanel`

### słownik
- zmieniono `materials-comparison-kpi`, `materials-show-comparison`, `materials-comparison-chip`, `materials-comparison-modal` — przeniesione z `DashboardPage.jsx` (dawne `dashboard-*`) do `UnifiedWbsPanel.jsx`
- usunięto `dashboard-fetch-comparison-kpi`

### wytyczne
- `back-funkcja` `OrdersService.comparison` — „żywe dane" wymagań materiałowych czytaj przez `resolveVersionId`, nigdy na sztywno `versionId: null`; ten drugi to legacy sprzed wersjonowania
- `schema-pole` `MaterialRequirement.sourceRequirementId` — jest NULL w danych sprzed wprowadzenia pola; każde parowanie klon↔oryginał licz jako `sourceRequirementId ?? id` (korzeń łańcucha), inaczej stare projekty nie sparują się wcale

---

## 2026-08-10 — feat(orders,materials): akceptacja baseline blokuje wartości ofertowe + podgląd produktu w splicie (v2026.08.10.770)

### schema.prisma
- dodano pole `imageUrl` w modelu `MaterialRequirement` — print screen / zdjęcie POZYCJI, wspólne dla obu stron splitu Wycena/Zakup. Osobne od `Material.imageUrl`: katalog jest globalny (jeden zrzut podmieniałby zdjęcie produktu we wszystkich projektach), a obrazek pozycji musi działać zanim wybrany zostanie jakikolwiek produkt katalogowy

### migracje
- `20260810120000_add_image_url_to_material_requirement` — kolumna `imageUrl` na `material_requirements`

### architektura / API
- dodano `back-funkcja` `assertOfferEditable` + `back-funkcja` `pickOfferChanges` (`common/offer-lock.util.ts`) — jedna reguła blokady wartości ofertowych po akceptacji baseline dla całego backendu: brak akceptacji → przechodzi bez śladu, manager/admin → przechodzi z wpisem w `AuditLog`, reszta → 403. Zastępuje lokalny guard F4 obsługujący samo `budgetedPriceNetto`
- `back-endpoint` `PATCH /wbs-nodes/:id/budget` i `PATCH /wbs-nodes/:id` przyjmują `req.user` i przepuszczają przez guard zmiany `unitCost`, `margin`, `discount`, `quantity`, `unitPrice` oraz zerowanie wyceny przy zmianie typu liścia na `group` — blokada obejmuje WSZYSTKIE typy liści (praca, usługa, paliwo, nocleg), nie tylko materiał/sprzęt
- `back-endpoint` `PATCH /material-requirements/:id` — guard rozszerzony z `priceNetto` na `quantity`; `PATCH /material-requirements/proposals/:id`, `.../set-offer`, `.../select`, `PATCH|DELETE /material-requirements/:id/offer` — guard odpala gdy propozycja pełni rolę `isOffer` (strona „Zakup" i `purchasePriceNetto` pozostają wolne)
- `back-funkcja` `uploadImage` zapisuje obrazek na `MaterialRequirement.imageUrl` zamiast `Material.imageUrl`; wcześniej pozycja bez `materialId` dostawała 400 („Brak przypisanego materiału"). Odczyt (`getImageStream`, flatten w `findOne`) czyta własny obrazek pozycji, a gdy go brak — spada na katalogowy
- dodano `back-endpoint` `DELETE /material-requirements/:id/image` — kasuje obrazek pozycji (katalogowy wraca jako fallback)
- `back-funkcja` `cloneVersionData` przenosi `MaterialRequirement.imageUrl` do klonu wersji
- dodano `ui-sekcja` `OfferLockGuard` (`components/shared/OfferLockGuard.jsx`) — module-store blokady + modal: manager odblokowuje edycję na czas sesji, użytkownik bez uprawnień dostaje komunikat. `ui-funkcja` `guardOfferEdit` wołana w lejkach zapisu (`updateNodeField`, `saveBudgetField`, `applyLeafDefaults`, `patchField`/`priceBlur`/`supplierChange` w `ProductSideCard`), `ui-funkcja` `offerLockInputProps` wpinana w pola ofertowe `BudgetTable`, `WBSHybridTable` i `WbsMaterialsPanel`
- `ui-sekcja` `BaselineSplitCard` — nowe pole „Podgląd produktu" obok zwężonego okna „Wymagania techniczne (wspólne)": klik = wybór pliku, najechanie + Ctrl+V = wklejenie zrzutu ze schowka (`ui-sekcja` `RequirementImageBox`), kosz na hoverze usuwa obrazek

### słownik
- dodano `offer-lock-util`, `assert-offer-editable`, `pick-offer-changes`, `offer-locked-wbs-fields`, `offer-lock-user` — backendowa reguła blokady
- dodano `offer-lock-guard`, `guard-offer-edit`, `use-offer-lock`, `set-offer-lock-state`, `offer-lock-input-props`, `request-offer-unlock`, `offer-lock-state`, `offer-lock-request-fn`, `offer-value-fields`, `offer-locked`, `update-node-field-offer-lock`, `budget-table-offer-locked`, `wbs-hybrid-offer-lock`, `wbs-materials-offer-locked`, `product-side-card-lock` — blokada po stronie UI
- dodano `mat-req-image-url`, `mat-req-upload-image`, `mat-req-delete-image`, `mat-req-delete-image-endpoint`, `requirement-image-box` — obrazek pozycji
- dodano `wbs-budget-offer-lock`, `wbs-node-offer-lock`, `proposal-offer-lock`, `assert-proposal-offer-editable` — punkty wpięcia guardu

### wytyczne
- akceptacja baseline blokuje WARTOŚCI, nie STRUKTURĘ — dodawanie i usuwanie liści, nazwy, komentarze, statusy i cała strona „Zakup" zostają edytowalne. Każdy nowy endpoint zapisujący nośnik ceny/ilości ofertowej musi zawołać `assertOfferEditable`, inaczej powstaje obejście blokady
- `ui-funkcja` `guardOfferEdit` — wołaj PRZED optimistic update, nie po; odrzucona zmiana zostawałaby inaczej na ekranie do najbliższego odświeżenia
- `schema-pole` `MaterialRequirement.imageUrl` — obrazek pozycji ma pierwszeństwo nad `Material.imageUrl`; katalogowy zostaje wyłącznie jako fallback odczytu (nie zapisujemy już zrzutów do katalogu globalnego)

## 2026-08-10 — fix(wbs): ilość synchronizowana relacją 1:1, nie tabelą alokacji (v2026.08.10.769)

### architektura / API
- `back-funkcja` `syncMaterialsFromWbsNode` przy braku wiersza w `WbsNodeMaterial` spada na relację `MaterialRequirement.wbsNodeId` i zapisuje tam ilość. Wcześniej kończyła się na `if (allocs.length === 0) return`, więc dla ~81% pozycji ilość z WBS nie docierała do wymagania
- `back-endpoint` `PATCH /material-requirements/:id` z polem `quantity` przy braku alokacji kieruje zapis na powiązany `schema-model` `WbsNode` (`back-funkcja` `writeWbsNodeQuantity`), a wymaganie dostaje odbicie — zamiast zapisu wyłącznie po stronie wymagania
- `back-funkcja` `writeWbsNodeQuantity` przelicza `schema-pole` `WbsNode.totalCost` i `WbsNode.totalPrice` przy każdej zmianie ilości; wcześniej zapis ilości zostawiał totale nieprzeliczone
- `ui-sekcja` `BaselineSplitCard` liczy ilość z węzła WBS (`ui-propsy` `wbsNode.quantity`), czyli z tej samej wartości co kolumna „Ilość" rozwiniętego wiersza; `WBSHybridTable` przekazuje `quantity` w propsie `wbsNode`

### wytyczne
- `schema-pole` `WbsNode.quantity` — jedyne źródło prawdy dla ilości; `MaterialRequirement.quantity` jest jego odbiciem. Każda ścieżka zapisu ilości musi trafiać najpierw na węzeł
- `ui-sekcja` `BaselineSplitCard` jest rozwinięciem wiersza tabeli Materials — każda liczba w splicie musi pochodzić z tego samego nośnika co odpowiadająca jej kolumna wiersza

## 2026-08-10 — feat(materials): dwukierunkowa propagacja ceny jednostkowej + działania matematyczne w splicie (v2026.08.10.768)

### architektura / API
- `back-endpoint` `PATCH /material-requirements/:id` z polem `priceNetto` dodatkowo synchronizuje propozycję `isOffer` (`back-funkcja` `syncOfferProposalPrice`) — cena wpisana w kolumnie „Koszt jedn. oferty" tworzy/aktualizuje nośnik ceny, zamiast zostawiać pustą stronę „Wycena" w `ui-sekcja` `BaselineSplitCard`
- `back-endpoint` `PATCH /wbs-nodes/:id` (pola budżetowe) propaguje `schema-pole` `WbsNode.unitCost` → `schema-pole` `MaterialRequirement.budgetedPriceNetto` → propozycja `isOffer` (`back-funkcja` `syncOfferPriceFromWbsNode`). Do tej pory przepływ był jednokierunkowy i koszt jednostkowy wpisany w budżecie WBS nie wracał do widoku Materials
- `ui-sekcja` `BaselineSplitCard` — pola „Koszt jedn." i „Koszt zakupu" przyjmują wyrażenia matematyczne po `=` (`ui-funkcja` `evalQtyFormula`), z podglądem wyniku; do bazy trafia wyłącznie liczba

### wytyczne
- cena materiału ma trzy nośniki — `ProductProposal(isOffer).priceNetto`, `MaterialRequirement.budgetedPriceNetto`, `WbsNode.unitCost`. Każda nowa ścieżka zapisu ceny musi domykać wszystkie trzy, inaczej rozjazd zamraża się w snapszocie wersji i przechodzi do baseline przy akceptacji
- `schema-pole` `MaterialRequirement.sourceRequirementId` — jedyny klucz parowania baseline↔żywe w `back-funkcja` `comparison`; klon wersja→wersja musi wskazywać na żywy wiersz (`versionId = null`), nie na klon poprzedniej wersji

## 2026-08-09 — fix(materials): BaselineSplitCard — koniec restartu widoku i cofania wartości przy wypełnianiu pól (v2026.08.09.766)

### architektura / API
- `ui-funkcja` `refreshCards` (WbsMaterialsPanel) i `ui-funkcja` `reloadCard` (WBSHybridTable) przyjmują opcję `{ silent: true }` — odświeżają samą kartę, bez `onWbsUpdate` / `onMaterialReqUpdated`. Edycja pola tekstowego propozycji nie zmienia budżetu, a wcześniej każde opuszczone pole ciągnęło pełne przeładowanie drzewa WBS, listy wymagań, `/materials` i `/offers` (19 zapytań na 4 pola → 9)
- `ui-funkcja` `priceBlur` czeka teraz na `onPropagatePrice` przed odświeżeniem; `ui-funkcja` `handlePropagatePrice` czeka na `onNodeFieldSave`. Wcześniej zapisy szły fire-and-forget i odczyt wyprzedzał własny PATCH

### wytyczne
- `ui-funkcja` `onRefresh` w `BaselineSplitCard` / `ProductSideCard` — wołaj z `{ silent: true }` dla pól, które nie zmieniają budżetu (producent, model, nazwa, dostępność, adres WWW, dostawca, wymagania techniczne). Pełne odświeżenie zostaw dla ceny i zmian ról Wycena/Zakup
- każdy `useEffect` synchronizujący lokalny stan pola z danymi z serwera musi mieć bufor „zapis w locie" (`pendingRef`) — bez niego spóźniony odczyt cofa świeżo wpisaną wartość; objaw widoczny tylko przy realnym opóźnieniu sieci, na localhoście nie występuje
- każdy `fetch` odświeżający listę/kartę potrzebuje licznika sekwencji — odpowiedzi wracają w innej kolejności niż wysłane i starsza nadpisuje nowszą

## 2026-08-09 — fix(materials): produkty z etapu ofertowania nie trafiały na stronę „Wycena" splitu (v2026.08.09.765)

### architektura / API
- `back-funkcja` `selectProposal` — wybór produktu na etapie ofertowania ustawia teraz także `isOffer` (i zdejmuje `isOffer` z rodzeństwa). Wcześniej ustawiał wyłącznie `isSelected`, a `BaselineSplitCard` szuka produktu po `isOffer` — przez to po akceptacji baseline lewy panel „Wycena" był pusty mimo wybranego wcześniej produktu, który lądował dopiero na liście „lub wybierz istniejącą propozycję"
- `back-funkcja` `cloneVersionData` — klon `ProductProposal` przenosi teraz `isOffer`, `isPurchase`, `purchasePriceNetto` i `supplierId`. Bez tego snapshot wersji gubił role splitu Wycena/Zakup oraz dostawcę

### migracje
- `20260809150000_backfill_is_offer_from_is_selected` — backfill 57 istniejących propozycji: `isSelected` bez `isOffer` → `isOffer = true` (pomija wymagania mające już jawnie wskazaną propozycję ofertową)
- `20260809151000_dedupe_is_offer_per_requirement` — legacy duplikaty (dwa identyczne rekordy propozycji) dostały po backfillu obie flagę; zostaje najstarsza, reszta traci `isOffer`

### wytyczne
- `schema-pole` `ProductProposal.isOffer` — jedyne źródło prawdy o produkcie strony „Wycena". Każda ścieżka wyboru produktu (`selectProposal`, `setOffer`, tworzenie propozycji z `ProductSideCard`) MUSI ustawić tę flagę, inaczej produkt jest niewidoczny w splicie. `isSelected` zostaje jako flaga legacy/katalogowa
- `back-funkcja` `cloneVersionData` — potwierdzenie istniejącej zasady: każda nowa kolumna `ProductProposal` musi zostać dopisana do klonu, inaczej znika w snapshotach wersji

## 2026-08-09 — feat(materials): pola produktu zawsze widoczne w ProductSideCard, propozycja tworzona niejawnie (v2026.08.09.764)

### architektura / API
- `ProductSideCard` (obie strony splitu Wycena/Zakup) pokazuje teraz zawsze pełny zestaw pól (Producent/Model/Nazwa handlowa/Koszt/Dostępność/Adres WWW/Dostawca), niezależnie od tego czy strona ma już przypisaną propozycję — wcześniej pusty stan pokazywał tylko dostawcę i przyciski AI/ręcznie
- nowa funkcja `ensureProposal` — pierwsza edycja dowolnego pola (albo wybór dostawcy) na stronie bez produktu tworzy propozycję z aktualnie wypełnionych pól i przypisuje ją do roli tej strony (`set-offer`/`set-purchase`); deduplikowana przez `creatingRef` żeby szybkie Tab przez kilka pól nie stworzyło kilku propozycji naraz
- usunięto mini-formularz „Dodaj ręcznie"/„Inny produkt" (zbędny — pola są teraz zawsze edytowalne wprost)

### słownik
- dodano `product-side-card-ensure-proposal`
- usunięto `product-side-card-pick-supplier-only` (scalone z `ensureProposal`/`supplierChange`)

## 2026-08-09 — feat(materials): osobny kciuk kopiujący dostawcę Wycena→Zakup w BaselineSplitCard (v2026.08.09.761)

### architektura / API
- `BaselineSplitCard.copySupplierToPurchase` — nowy przycisk (kciuk) przy polu „Dostawca" strony Wycena, niezależny od kciuka kopiującego cały produkt: kopiuje wyłącznie `supplierId` do propozycji strony Zakup; jeśli Zakup nie ma jeszcze żadnej propozycji, tworzy pustą (jak przy wyborze dostawcy bez produktu) i przypisuje ją do roli Zakup

### słownik
- dodano `baseline-split-copy-supplier-to-purchase`

## 2026-08-09 — feat(materials): wybór potencjalnego dostawcy (oferenta) zanim wybrano produkt w BaselineSplitCard (v2026.08.09.760)

### architektura / API
- `ProductSideCard` (stan „Brak produktu") pozwala teraz wybrać dostawcę zanim jeszcze wybrano/dodano produkt — tworzy pustą propozycję (`productName`/`manufacturer` = '') z ustawionym `supplierId` i przypisuje ją do roli tej strony (`set-offer`/`set-purchase`)
- kciuk „kopiuj Wycena → Zakup" (`copyOfferToPurchase`) przenosi dostawcę automatycznie — operuje na tej samej propozycji (ta sama kolumna `supplierId`), bez dodatkowej logiki

### słownik
- dodano `product-side-card-pick-supplier-only` — handler wyboru dostawcy bez wybranego produktu

## 2026-08-09 — feat(materials): wybór dostawcy produktu po obu stronach BaselineSplitCard (v2026.08.09.759)

### schema.prisma
- dodano pole `supplierId` w modelu `ProductProposal` — FK do `Supplier` (SetNull), niezależny dostawca produktu dla każdej strony splitu Wycena/Zakup
- dodano relację `ProductProposal.supplier` → `Supplier` oraz odwrotną `Supplier.productProposals`

### architektura / API
- `PATCH /material-requirements/proposals/:proposalId` przyjmuje teraz `supplierId` (string | null) w DTO `updateProposal`; zwraca propozycję z dołączoną relacją `supplier`
- `GET /material-requirements/node/:nodeId` i `GET /material-requirements/:id` dołączają teraz `proposals.supplier` (wcześniej `proposals: true` bez relacji)

### słownik
- dodano `product-proposal-supplier-id`, `product-proposal-supplier`, `supplier-product-proposals` — nowe pole/relacje w schema.prisma
- dodano `product-side-card-supplier-change` — handler wyboru dostawcy w `ProductSideCard` (`WbsMaterialsPanel.jsx`)

### wytyczne
- `schema-pole` `ProductProposal.supplierId` — dostawca jest atrybutem propozycji (produktu), nie wymagania; strona Wycena i strona Zakup mogą mieć różnych dostawców nawet gdy to ta sama propozycja (rzadki przypadek — wtedy pole jest współdzielone)
- `ui-funkcja` `supplierChange` w `ProductSideCard` — używa istniejącego `SupplierPicker` (wyszukiwanie po NIP z Białej listy VAT + wolny wpis po nazwie), bez duplikowania logiki wyboru dostawcy

## 2026-08-09 — fix(orders): modal akceptacji baseline liczy pełny koszt WBS zamiast tylko wycenionych materiałów (v2026.08.09.756)

### architektura / API
- `back-funkcja` `OrdersService.acceptPreview` (`GET /orders/:nodeId/accept-preview`) — `budgetSum` liczony teraz z Σ `unitCost×quantity` po wszystkich liściach drzewa WBS wersji (`type != 'group'`), formuła identyczna z `BudgetTable.calcDerived`/`summary.totalCost`. Wcześniej sumował wyłącznie `MaterialRequirement.budgetedPriceNetto×quantity` — pomijał liście `work`/`service`/`lodging`/`fuel` i wymagania bez przypisanej ceny, przez co modal akceptacji pokazywał wielokrotnie zaniżoną liczbę względem zakładki Budżet (np. 102 653 zł vs 415 070 zł realnego kosztu). `pricedCount`/`requirementsCount` (wycenione materiały) zostają bez zmian jako osobna, informacyjna metryka

### wytyczne
- `back-endpoint` `orders-accept-preview` — akceptacja blokuje CAŁY projekt (wszystkie typy liści WBS), więc podgląd budżetu przed akceptacją musi liczyć z pełnego drzewa WBS, nie tylko z tabeli `MaterialRequirement` — przy kolejnych zmianach formuły kosztu w `BudgetTable.calcDerived` aktualizować oba miejsca

---

## 2026-08-09 — feat(wbs): split Wycena↔Zakup w Materiałach + kafle Oferta/Rzeczywiste w Budżecie (v2026.07.20.718)

### schema.prisma
- dodano pole `isOffer Boolean` w modelu `ProductProposal` — flaguje propozycję jako produkt strony „Wycena" (max jedna na wymaganie)
- dodano pole `isPurchase Boolean` w modelu `ProductProposal` — flaguje propozycję jako produkt strony „Zakup" (max jedna na wymaganie)
- dodano pole `purchasePriceNetto Float?` w modelu `ProductProposal` — cena zakupu gdy ta sama propozycja pełni obie role (Δ = purchasePriceNetto − priceNetto)

### architektura / API
- `back-endpoint` `PATCH /material-requirements/proposals/:id/set-offer` — ustawia propozycję jako produkt strony Wycena
- `back-endpoint` `PATCH /material-requirements/proposals/:id/set-purchase` — ustawia propozycję jako produkt strony Zakup (init `purchasePriceNetto` = `priceNetto` gdy ta sama propozycja pełni obie role)
- `back-endpoint` `PATCH /material-requirements/proposals/:id/clear-purchase` — zdejmuje flagę Zakup (offer nietknięty)
- `back-endpoint` `GET /material-requirements/node/:nodeId/budget-sums` — sumy Σ wyceny (`priceNetto` propozycji `isOffer`) i Σ zakupu (`purchasePriceNetto ?? priceNetto` propozycji `isPurchase`), każda × ilość wymagania
- `ui-sekcja` `BaselineSplitCard` (`WbsMaterialsPanel.jsx`) — rozwinięcie wiersza materiału na dwie kolumny: `ProductSideCard` Wycena (propozycja `isOffer`) / Zakup (propozycja `isPurchase`), kciuk kopiujący produkt Wyceny do Zakupu; backend `set-offer`/`set-purchase` pilnuje że dodanie produktu po stronie Zakup nigdy nie ustawia `isOffer` (Wycena nietknięta)
- `ui-tabela` kolumny Materiałów: `Koszt jedn.` → `Koszt jedn. oferty`; po akceptacji baseline dochodzi `Koszt jedn. zakupu` (`purchaseUnitOf`) — wartość tylko dla liści z realnym kosztem zakupu, reszta puste
- `ui-sekcja` kafle KPI `BudgetTable` (Koszt/Przychód/Zysk/Marża): każdy kafel dostał drugi wiersz „Rzeczywiste" obok „Oferta" — Rzeczywisty koszt podmienia koszt liści typ `material`/`equipment` na Σ cen zakupu (`sumZakup` z `budget-sums`), przychód pozostaje ofertowy (cena dla klienta stała); usunięto liczniki wierszy i blok „częściowy" (filtr), Rabat % i zł scalone w jeden kafel

### wytyczne
- `back-endpoint` `mat-req-patch-set-purchase` — dodanie/wybór produktu po stronie Zakup nie może ustawiać `isOffer`; separacja ról pilnowana w serwisie, UI nie powinno dublować blokady zamrażaniem pól (psuje dodawanie produktu gdy liść nie ma jeszcze żadnej propozycji)

---

## 2026-07-20 — feat(quickquote): Faza 7 — tryby zakładki Budżet: baseline / wykonanie / porównanie (v2026.07.20.717)

### architektura / API
- `back-funkcja` `OrdersService.comparison` — `qqSupplier` rozszerzony o `source` pozycji wyceny BASELINE (API/STOCK/MANUAL) — mapowanie na badge MAG w trybie Wykonanie
- dodano `ui-panel` `BudgetModesPanel` (wbs/BudgetModesPanel.jsx) + `ui-sekcja` segmented control w sekcji Budżet (`UnifiedWbsPanel`), **widoczny wyłącznie po akceptacji wersji** (wcześniej zakładka bez zmian): tryby `Budżet (żywy)` (dotychczasowa `BudgetTable` bez zmian — funkcjonalność zachowana) / `Budżet (baseline)` / `Wykonanie` / `Porównanie`
- tryb **Budżet (baseline)**: tabela z drzewa WBS zaakceptowanej wersji (`GET /wbs-nodes/unified/:id?versionId=`) — read-only z kłódką, kolumny i formuła ceny ofertowej 1:1 z `BudgetTable.calcDerived`, sumy kosztów i cen ofertowych
- tryb **Wykonanie**: żywe wymagania z ceną wg hierarchii: `FO` (finalna z oferty, komórka read-only) / `FO✎` (skorygowana ręcznie) / `QQ` (z wyceny — edytowalna) / `MAG` (pozycja STOCK wyceny) / `MAN`; edycja ceny przechodzi przez guard F4 (po akceptacji manager + AuditLog)
- tryb **Porównanie**: wiersze pogrupowane gałęziami baseline WBS (kolejność drzewa, nagłówki gałęzi z sumami OBU kolumn), pary kosztów + Δ + **marża plan → efektywna** (cena ofertowa zamrożona w baseline z `calcDerived` klonu WBS; koszt żywy → erozja marży per wiersz w p.p., czerwień przy erozji); liczby wyłącznie z `GET /orders/:id/comparison`
- eksport Excel trybu Porównanie (`budget-comparison-export`): baseline jako wartości stałe, koszt aktualny / Δ / marża efektywna jako **żywe formuły**, sumy gałęzi jako `SUM(...)`; istniejące walidacje cen eksportów oferty/budżetu nietknięte (eksport porównania analityczny — bez blokady)

### słownik
- dodano sekcję „Moduł tryby Budżetu — baseline / wykonanie / porównanie (Faza 7)" — anchory `budget-modes-*`, `budget-mode-*`, `budget-comparison-*`, `budget-acceptance`

### wytyczne
- `ui-panel` `BudgetModesPanel` — tryb Porównanie i Wykonanie czytają liczby z `orders/comparison` (wiersz po `liveId`); baseline liczony z klonów WBS formułą `calcDerived` — przy zmianie formuły budżetu aktualizować oba miejsca
- `ui-sekcja` segmented control Budżetu — tryb `live` (dotychczasowa tabela) musi pozostać dostępny po akceptacji; baseline read-only NIE zastępuje edycji żywego budżetu

## 2026-07-20 — feat(quickquote): Faza 6 — split ProductCard: baseline (kłódka) vs żywa karta (v2026.07.20.716)

### architektura / API
- `back-funkcja` `OrdersService.comparison` — wiersze rozszerzone o `liveId` (id żywego wymagania; null dla zakres−) — klucz dla widoków per-karta (F6) do znalezienia swojego wiersza bez powtarzania logiki parowania
- `ui-sekcja` split w `MaterialReqExpandPanel` (WBSHybridTable.jsx), aktywny tylko gdy zamówienie ma zaakceptowany baseline: domyślnie **zwinięty pasek** „Wycena X · Final Y · Δ badge" (liczby z `GET /orders/:id/comparison` — te same co w panelu i chipie); po rozwinięciu split 50/50: lewo — `ProductCard` klonu z wersji baseline (`readOnly`, kłódka, dostawca z snapshotu FO lub wyceny BASELINE, odczyt), prawo — żywa karta (istniejący picker produktu + `handlePropagatePrice` → `unitCost` WBS) + panel dostawcy (`SupplierPicker` dark: rejestr / NIP-autofill / wolny wpis)
- przyciski **na linii podziału** (absolute, left:50%, bez osobnej kolumny): kciuk (teal) — kopiuje CAŁĄ pozycję z baseline (produkt + snapshot dostawcy + cena → Δ=0; disabled gdy brak odpowiednika w baseline); strzałka (amber) — kopiuje tylko dane produktu i otwiera panel dostawcy; nadpisanie wypełnionej prawej strony z potwierdzeniem; zmiana ceny po akceptacji przechodzi przez guard F4 (AuditLog automatycznie)
- dostawca żywej karty zapisywany przez merge do JSON `offerPositionSnapshot` (`split-set-live-supplier`) — snapshot pozostaje samowystarczalny, pozostałe pola nietknięte
- tooltippy rozróżniają kciuk „pozycji" (kopiowanie z baseline) od kciuka „snapshotu" (akceptacja wersji, F4)
- zamówienie bez baseline: karta renderuje się jak dotąd (pełna szerokość, bez paska) — zero zmian w dotychczasowym flow

### słownik
- dodano sekcję „Moduł split ProductCard — baseline vs żywa karta (Faza 6)" — anchory `split-*`

### wytyczne
- `ui-funkcja` `handleCopyAll` — kopiuje też `offerId`/`offerPositionIdx`/`offerPositionSnapshot` 1:1; NIE budować snapshotu od nowa (utrata pól walutowych = fałszywe odchylenie KURSOWE)
- pasek i split czytają liczby WYŁĄCZNIE z `orders/comparison` (wiersz po `liveId`) — bez lokalnego liczenia Δ

## 2026-07-20 — feat(quickquote): Faza 5 — endpoint porównawczy baseline↔żywe + widoki agregujące (v2026.07.20.715)

### architektura / API
- dodano `back-endpoint` `GET /orders/:nodeId/comparison` (`OrdersService.comparison`): parowanie żywych `MaterialRequirement` z klonami zaakceptowanej wersji **po `sourceRequirementId`**; cena aktualna wg hierarchii `offerPositionSnapshot` (źródło `FO`) → `budgetedPriceNetto` (`QQ`/`MAN` wg `budgetSource`); dołącza kolumny dostawcy z pozycji wyceny BASELINE i ze snapshotu oferty; `{accepted:false}` gdy brak baseline
- KPI odpowiedzi: `baselineSum`, `currentSum`, **`forecastSum` = Σ(aktualna wartość gdzie wyceniona) + Σ(baseline gdzie sparowane bez ceny aktualnej)** (zakres− poza prognozą), `deltaSum`/`deltaPct`, pokrycie `coveragePriced/coverageTotal`, rozkład odchyleń per wiersz: **CENOWE / ILOSCIOWE / ZAKRES_PLUS / ZAKRES_MINUS / KURSOWE** (kursowe = ta sama cena w walucie oryginalnej, różny kurs NBP)
- dodano `ui-panel` `ComparisonPanel` (components/shared/ComparisonPanel.jsx) — pasek KPI + tabela wierszy (baseline | aktualnie ze źródłem ceny i dostawcą | Δ | badges odchyleń) + eksport Excel: **kolumny Δ i wartości aktualne jako żywe formuły, baseline jako wartości stałe**
- osadzenia (wszystkie z jednego endpointu): rozwinięcie wyceny BASELINE w sekcji „Szybkie wyceny" (`qq-comparison-embed`), chip „Δ +x% · pokrycie n/m" w nagłówku zamówienia (`dashboard-comparison-chip`, kolor wg znaku Δ) → klik otwiera `ui-modal` z pełnym panelem per zamówienie
- powiadomienie PM przy przekroczeniu progu Δ% — ODŁOŻONE (otwarta decyzja nr 3: wartość progu i czy w ogóle na start)

### słownik
- dodano sekcję „Moduł Comparison — porównanie baseline vs żywe (Faza 5)" — anchory `orders-comparison`, `comparison-*`, `qq-comparison-embed`, `dashboard-comparison-*`

### wytyczne
- `back-funkcja` `OrdersService.comparison` — JEDYNE źródło liczb baseline/aktualny/Δ; kolejne widoki (F6 split ProductCard, F7 tryby Budżetu) konsumują ten endpoint zamiast liczyć po swojemu
- odchylenie KURSOWE rozpoznawane tylko gdy pozycja BASELINE wyceny i snapshot FO mają tę samą walutę i cenę oryginalną — przy zmianie logiki walut aktualizować oba końce (freezePrice w QQ i snapshot w assignOfferPosition)

## 2026-07-20 — feat(quickquote): Faza 4 — akceptacja wersji (baseline) i etapy zamówienia (v2026.07.20.713)

### architektura / API
- dodano `back-modul` `OrdersModule` (apps/backend/src/orders/): `GET /orders/:nodeId/acceptance` (stan akceptacji), `GET /orders/:nodeId/accept-preview?versionId=` (suma budżetu wersji + zamrożone wyceny do modala), `POST /orders/:nodeId/accept` i `POST /orders/:nodeId/revoke-accept` — oba tylko `@Roles('ADMIN','MANAGER')` (RolesGuard)
- `back-funkcja` `OrdersService.accept` — JEDNA transakcja: `acceptedVersionId` + `acceptedAt/By` + `orderStage=ZAAKCEPTOWANE` + wskazana `QuickQuote` (tylko LOCKED) → `BASELINE` + wpis `AuditLog` (`ACCEPT`); ACTIVE ≠ BASELINE — kciuk NIE zmienia wersji aktywnej
- `back-funkcja` `OrdersService.revokeAccept` — cofnięcie akceptacji: osobna głośna akcja z OBOWIĄZKOWYM powodem; transakcja: pointer wyczyszczony, `orderStage=WYCENA`, wyceny BASELINE węzła wracają do LOCKED, `AuditLog` (`REVOKE_ACCEPT` z powodem i poprzednim pointerem)
- rozszerzono `back-enum` `AuditAction` o `ACCEPT` i `REVOKE_ACCEPT` (audit.types.ts)
- `back-funkcja` `VersioningService.deleteVersion` — blokada usunięcia wersji wskazywanej przez `ProcessNode.acceptedVersionId` (baseline usuwalny dopiero po cofnięciu akceptacji); analogiczna blokada w `handleDeleteVersion` na froncie
- `back-funkcja` `MaterialRequirementsService.update` — nowy guard (`mat-req-budget-guard`): edycja `budgetedPriceNetto` (pole `priceNetto` z frontu) w zamówieniu po akceptacji wymaga roli ADMIN/MANAGER i zostawia wpis `AuditLog` (old→new); sygnatura `PATCH /material-requirements/:id` przekazuje teraz `req.user` do serwisu
- `ui-przycisk` kciuk (`ThumbsUp`, teal) w dropdownie wersji (DashboardPage, obok Pencil/RotateCcw/X, tylko manager/admin) → `ui-modal` potwierdzenia z sumą budżetu wersji, licznikiem wycenionych wymagań i wyborem zamrożonej wyceny na BASELINE; badge „BASELINE" na wierszu wersji obok „ACTIVE"; chip etapu zamówienia przy dropdownie po akceptacji; cofnięcie akceptacji = osobny przycisk (`Undo2`, amber) z modalem powodu

### słownik
- dodano sekcję „Moduł Orders — akceptacja wersji i etapy zamówienia (Faza 4)" — anchory `orders-*`, `mat-req-budget-guard`, `dashboard-acceptance`, `dashboard-accept-*`, `dashboard-revoke-*`, `dashboard-baseline-badge`, `dashboard-thumbs-up`, `dashboard-order-stage-badge`

### wytyczne
- `schema-pole` `ProcessNode.acceptedVersionId` — zmieniać WYŁĄCZNIE przez `OrdersService.accept/revokeAccept` (transakcja + AuditLog); żadnych bezpośrednich update'ów pointera z innych serwisów
- `back-funkcja` `OrdersService.revokeAccept` — uprawnienie ADMIN+MANAGER (otwarta decyzja nr 4 domknięta domyślnie tak; zawężenie do samego ADMIN = zmiana dekoratora `@Roles` na endpointzie)
- `ui-modal` modal akceptacji — kciuk zawsze przez modal potwierdzenia (suma budżetu + skutki); nie dodawać „szybkiej" akceptacji jednym klikiem

## 2026-07-19 — feat(quickquote): Faza 3 — silnik szybkich wycen (magazyn / API / MANUAL, blokada, wersjonowanie) (v2026.07.19.710)

### architektura / API
- dodano `back-modul` `QuickQuotesModule` (apps/backend/src/quick-quotes/): CRUD wycen + pozycji — `GET/POST /quick-quotes`, `GET/PATCH/DELETE /quick-quotes/:id`, `PATCH /quick-quotes/:id/status`, `POST /quick-quotes/:id/new-version`, `POST/PATCH/DELETE .../items[/:itemId]`, `POST .../items/from-stock`, `POST .../items/query-api`
- przejścia statusów wg `back-stala` `TRANSITIONS` (DRAFT↔VERIFIED→LOCKED→ARCHIVED; EXPIRED→DRAFT); `BASELINE` nadawany wyłącznie w Fazie 4 (akceptacja); mutacje nagłówka/pozycji tylko w `DRAFT` (`requireEditable`); DELETE tylko dla szkiców
- `back-funkcja` `QuickQuotesService.lock` — przejście `LOCKED` w transakcji: (1) re-walidacja pokrycia magazynowego pozycji STOCK z odjęciem rezerwacji innych LOCKED/BASELINE wycen (ochrona przed podwójnym liczeniem między równoległymi szkicami), (2) zapis najtańszej ceny per wymaganie do `budgetedPriceNetto` + `budgetSource=QUICKQUOTE`, (3) stempel `lockedAt/lockedBy`
- `back-funkcja` `addStockItems` — kandydaci z magazynu tylko przy PEŁNYM pokryciu (Σ `MaterialStock.quantity` ≥ zapotrzebowanie, bez splitów), wycena wg `Material.priceNetto` (brak ceny/0 → skip z powodem); idempotentne
- `back-funkcja` `freezePrice` — zamrożenie kursu NBP w momencie capture (wzorzec 1:1 z kanału PDF, `fetchNbpRate`); edycja ceny oryginalnej = nowy capture; bezpośrednia edycja `priceNettoPln` = korekta logistyka (`priceNettoApi` nigdy nie nadpisywane)
- dodano `back-typ` `SupplierGateway` (supplier-gateway.ts) — interfejs adaptera API dostawcy + token DI `SUPPLIER_GATEWAYS` (pusta lista; pierwszy adapter po wyborze dostawcy startowego — otwarta decyzja); `queryApi` zapisuje wyniki wyłącznie do `QuickQuoteItem` (surowa cena w `priceNettoApi`), nigdy do katalogu `Material`
- dodano `ui-sekcja` `QuickQuotesSection` — trzecia sekcja `CollapsibleSection` (akcent amber) „Szybkie wyceny" w `OffersTab`: tabela nagłówków QQ (status badge, licznik pozycji, akcje wg statusu), rozwijana tabela pozycji z inline-edycją ceny PLN (tylko DRAFT), dodawanie MANUAL (dropdown wymagań + `SupplierPicker` dark + waluta z NBP), przycisk „Z magazynu", suma wartości

### słownik
- dodano sekcję „Moduł QuickQuotes — silnik szybkich wycen (Faza 3)" — komplet anchorów `quick-quotes-*`, `supplier-gateway*`, `qq-*`, `offers-tab-quick-quotes-section`

### wytyczne
- `back-funkcja` `QuickQuotesService.lock` — jedyne miejsce zapisu `budgetSource=QUICKQUOTE`; nowe źródła cen budżetowych mają ustawiać własny `budgetSource`, nie nadpisywać QQ po cichu
- `back-typ` `SupplierGateway` — nowe adaptery API dostawców rejestrować w `QuickQuotesModule` pod tokenem `SUPPLIER_GATEWAYS` z `adapterId` = `Supplier.apiAdapter`; wyniki API NIGDY nie trafiają do katalogu `Material`
- `schema-pole` `QuickQuoteItem.qtyAtCapture` — przy pozycjach STOCK to wielkość rezerwacji magazynu liczona w `lock`; nie zmieniać po zamrożeniu

## 2026-07-19 — feat(quickquote): Faza 2 — dostawca w kanale PDF (parser + modal + snapshoty) (v2026.07.19.709)

### architektura / API
- zmieniono kształt odpowiedzi `back-endpoint` `POST /material-requirements/parse-offer`: z tablicy pozycji na obiekt `{supplier, positions}` — `supplier` to wystawca oferty z parsera (`{name, nip, address, offerNumber, offerDate, validUntil}`); zapisane pozycje i strukturalne formaty Excel zwracają `supplier: null`; frontend obsługuje oba kształty
- rozszerzono prompt parsera ofert (`buildOfferParsePrompt`) o obiekt `supplier` z instrukcją: **dostawca = WYSTAWCA oferty, nie adresat** (nabywca/zamawiający); daty wyłącznie ISO YYYY-MM-DD
- dodano `back-funkcja` `extractParsedOffer` — wspólna ekstrakcja odpowiedzi AI (format obiektowy + fallback tablicowy), używana przez ścieżkę PDF i AI-fallback Excel; test jednostkowy w `test/test-extract-parsed-offer.js`
- zmieniono sygnaturę `back-endpoint` `POST /offers` — nowe opcjonalne pola `supplierId`, `offerNumber`, `offerDate`, `validUntil`; `OffersService.create` zapisuje metadane tylko gdy przekazane (approve bez meta nie kasuje wcześniejszego dostawcy); `GET /offers` i `GET /offers/node/:nodeId` dołączają relację `supplier {id, name, nip, vatStatus}`
- `assignOfferPosition` + `autoAssignFromOffer` — do JSON `offerPositionSnapshot` dopisywane `supplier {id, name, nip}` i `offerNumber` (snapshot samowystarczalny — przeżywa usunięcie Offer)
- `ui-sekcja` blok dostawcy w `OfferParsePanel` (DocumentViewer.jsx): match wykrytego wystawcy po NIP z rejestrem (auto-wybór), fallback po nazwie (podpowiedź „Użyj"), przycisk „Utwórz dostawcę z NIP (Biała lista VAT)" jednym klikiem, `SupplierPicker` (wariant dark) + prefill numeru/dat oferty; meta trafia do POST /offers przy „Zatwierdź dane oferty"
- `ui-dropdown` `SupplierPicker` — nowy prop `dark` (zestawy klas `THEMES`) dla ciemnych paneli ofert

### słownik
- dodano sekcję „Moduł kanał PDF — dostawca w ofercie (Faza 2)" — anchory `extract-parsed-offer`, `offer-meta-input`, `offer-supplier-*`, `offer-match-supplier`, `offer-create-supplier-from-nip`, `offers-table-supplier-badge`, `supplier-picker-theme`

### wytyczne
- `offerPositionSnapshot` — snapshot MUSI pozostać samowystarczalny (dostawca, numer oferty, ceny, kurs); nie zastępować odczytem z relacji Offer, bo Offer bywa kasowana
- prompt parsera ofert — przy każdej modyfikacji zachować instrukcję rozróżnienia wystawca/adresat; regresja tu oznacza podpinanie klienta jako dostawcy
- dev Docker nie ma skonfigurowanego `back-env` `AI_MODEL` ani kluczy AI — parsowanie ofert w dev wymaga uzupełnienia `apps/backend/.env` (test promptu z żywym modelem wykonać po konfiguracji)

## 2026-07-19 — feat(quickquote): Faza 1 — rejestr dostawców + moduł NIP (Biała lista VAT) (v2026.07.19.708)

### architektura / API
- dodano `back-modul` `SuppliersModule` (apps/backend/src/suppliers/): CRUD dostawców — `back-endpoint` `GET /suppliers`, `GET /suppliers/:id`, `POST /suppliers`, `PATCH /suppliers/:id`
- `back-funkcja` `SuppliersService.create` — dedup po NIP: wpis z istniejącym NIP podpina istniejącego dostawcę i odświeża jego dane (bez duplikatu); furtka dla dostawcy zagranicznego bez NIP (wolny wpis, wystarczy `name`)
- dodano `back-serwis` `NipLookupService` — klon wzorca `ExchangeRatesService` (NBP): `back-endpoint` `GET /suppliers/nip-lookup/:nip` → Biała lista podatników VAT (wl-api.mf.gov.pl, REST, bez klucza) → `{nip, name, address, regon, vatStatus}`; walidacja sumy kontrolnej NIP przed strzałem; przy create/update z NIP dane z Białej listy nadpisują przekazane + stempel `vatStatus`/`verifiedAt`
- dodano `ui-dropdown` `SupplierPicker` (components/shared/SupplierPicker.jsx) — reużywalny dropdown wyboru dostawcy z wyszukiwaniem + tworzenie przez NIP (prefill z Białej listy, podgląd statusu VAT) lub wolny wpis; do osadzenia w modalu uploadu oferty (F2) i panelu dostawcy ProductCard (F6)

### słownik
- dodano sekcję „Moduł Suppliers — rejestr dostawców + NIP (Faza 1)" — anchory `suppliers-*`, `nip-lookup-*`, `normalize-nip`, `validate-nip-checksum`, `supplier-picker*`

### wytyczne
- `back-serwis` `NipLookupService` — jedyne źródło danych z Białej listy VAT; nowe miejsca potrzebujące danych podatnika używają `lookup()`, nie własnych fetchy
- `back-funkcja` `SuppliersService.create` — NIE tworzyć dostawców bezpośrednio przez `prisma.supplier.create` w innych modułach; zawsze przez `SuppliersService.create` (dedup po NIP musi obowiązywać globalnie — F2 parser też z tego korzysta)

## 2026-07-19 — feat(quickquote): Faza 0 — fundamenty schematu dla szybkich wycen, baseline i kontroli budżetu (v2026.07.19.707)

### schema.prisma
- dodano `schema-model` `Supplier` — rejestr dostawców: `nip String? @unique` (null = zagraniczny/wolny wpis), `apiAdapter` (identyfikator adaptera API, null = dostawca tylko PDF-owy), `vatStatus` + `verifiedAt` (stempel weryfikacji w Białej liście VAT), dane adresowo-kontaktowe, `isActive`
- dodano `schema-model` `QuickQuote` — nagłówek szybkiej wyceny: `nodeId` FK ProcessNode (Cascade), `status` (`DRAFT`/`VERIFIED`/`LOCKED`/`BASELINE`/`ARCHIVED`/`EXPIRED`), `parentId` (wersjonowanie wzorcem `MaterialRequirementsList`), `validUntil`, `lockedAt/lockedBy`, `createdBy`
- dodano `schema-model` `QuickQuoteItem` — pozycja wyceny: `materialRequirementId` FK z **onDelete: SetNull** (baseline przeżywa usunięcie wymagania), zdenormalizowany snapshot (`reqName`, `qtyAtCapture`, `unit`), źródło (`source` `API`/`STOCK`/`MANUAL`, `supplierId`, `externalRef`, `sourceUrl`, `capturedAt`, `queriedBy`), waluty (`priceOriginalNetto`, `currency`, `exchangeRate`, `rateDate`, `priceNettoPln`) oraz `priceNettoApi` (surowa cena źródła, niemutowalna) osobno od efektywnej `priceNettoPln`
- dodano pola `schema-pole` `Offer.supplierId` (FK Supplier, SetNull), `Offer.offerNumber`, `Offer.offerDate`, `Offer.validUntil` — metadane oferty z parsera potwierdzane w modalu
- dodano `schema-pole` `ProcessNode.orderStage` (`WYCENA` default / `ZAAKCEPTOWANE` / `REALIZACJA` / `ROZLICZONE`; znaczące dla `type='order'`) oraz `ProcessNode.acceptedVersionId` + `acceptedAt` + `acceptedBy` — pointer na zaakceptowany `ProjectVersion` (baseline); relacja nazwana `AcceptedVersion`, SetNull
- dodano `schema-pole` `MaterialRequirement.sourceRequirementId` — id żywego oryginału w klonie wersji, klucz parowania baseline↔żywe
- dodano `schema-pole` `MaterialRequirement.budgetSource` (`QUICKQUOTE`/`MANUAL`) — proweniencja `budgetedPriceNetto`

### architektura / API
- `back-funkcja` `cloneVersionData` (versioning.service.ts) — klon wymagań wypełnia `sourceRequirementId`: klon z baseline dostaje `id` oryginału, klon wersji z wersji dziedziczy istniejący pointer (`?? mr.id`); `budgetSource` przenoszony 1:1 (reguła kompletności klonu)

### słownik
- dodano sekcję „Moduł QuickQuote / baseline (Faza 0 — schemat)" — komplet anchorów nowych modeli i pól: `supplier*`, `quick-quote*`, `qq-item-*`, `offer-supplier-id`, `offer-offer-number`, `offer-offer-date`, `offer-valid-until`, `process-node-order-stage`, `process-node-accepted-version-id/-at/-by`, `mat-req-source-requirement-id`, `mat-req-budget-source`

### wytyczne
- `schema-pole` `MaterialRequirement.sourceRequirementId` — NIE nadpisywać po utworzeniu klonu; to jedyny klucz parowania wierszy baseline z żywymi w endpointzie porównawczym (Faza 5)
- `schema-pole` `QuickQuoteItem.priceNettoApi` — niemutowalna surowa cena ze źródła; korekty logistyka wyłącznie w `priceNettoPln`
- `schema-model` `Supplier` — wyniki zapytań API dostawców NIE trafiają do katalogu `Material` (ryzyko duplikatów na `@@unique(manufacturer, model)`) — tylko do `QuickQuoteItem`

---

## 2026-08-08 — Eksport Excel: suma dni pracy w Podsumowaniu + auto-Q&A tylko przy nieodpowiedzianych (v2026.08.08.754)

### architektura / API
- `ui-funkcja` eksport „Analiza projektu do Excel" (`UnifiedWbsPanel`) — w arkuszu „Podsumowanie", sekcja „Budżet projektu", dodano wiersz 11 „Liczba dni pracy" (A11/B11) = suma ilości wszystkich liści typu `work` z jednostką dni (`dni`/`dzień`); sekcja „Podsumowanie per typ" i kolejne przesunięte o wiersz w dół (dynamiczne `addRow`, formuły niezmienione)
- `ui-stan` `qaTreeOpen` (`UnifiedWbsPanel`) — auto-otwarcie `QaTreeView` przy pierwszym wejściu w sesji tylko gdy istnieje pytanie bez odpowiedzi; puste Q&A i w pełni odpowiedziane nie wyskakują

### wytyczne
- `ui-funkcja` eksport Excel „Podsumowanie" — górny blok (wiersze 3–11) ma stałe referencje `B3`–`B10` w formułach; nowe wiersze dodawać POD nimi, a sekcje per-typ/per-osoba trzymać na `addRow`/`rowCount` żeby przesuwały się same

---

## 2026-08-07 — Alarmy cykliczne UserTask (jeden wiersz-reguła, toasty z zegara) (v2026.08.07.752)

### schema.prisma
- dodano pole `recurIntervalMinutes Int?` w modelu `TaskReminder` — interwał serii cyklicznej w minutach; `null` = alarm jednorazowy (dotychczasowe zachowanie)
- dodano pole `recurEnd DateTime?` w modelu `TaskReminder` — koniec okna serii, po tej dacie alarm nie odpala
- dodano pole `lastFiredAt DateTime?` w modelu `TaskReminder` — kursor ostatniego wyświetlonego wystąpienia, zapobiega ponownemu odpaleniu tego samego wystąpienia w obrębie interwału

### architektura / API
- `back-funkcja` `UserTasksService.getDueReminders` — dla alarmów cyklicznych bieżące wystąpienie liczone z zegara (`remindAt` = start, siatka `start + interwał·k`), zwracane raz per interwał; zaznacza `lastFiredAt`. Jednorazowe bez zmian.
- `back-funkcja` `UserTasksService.createReminder` — nowy: tworzy alarm dla zadania; `intervalMinutes` → seria cykliczna (jeden wiersz-reguła), zastępuje poprzednią serię tego zadania
- `back-funkcja` `UserTasksService.handleReminder` — `dismiss` na alarmie cyklicznym ubija całą serię (`sentAt`); `snooze` cykliczny przesuwa tylko `lastFiredAt` (nie rusza startu serii)
- `back-funkcja` `UserTasksService.syncReminderForTask` — auto-sync z `plannedEnd` dotyka wyłącznie alarmów jednorazowych (`recurIntervalMinutes: null`), nie kasuje serii cyklicznych
- dodano `back-endpoint` `POST /my-tasks/:id/reminders`, `GET /my-tasks/:id/reminders`, `DELETE /my-tasks/reminders/:id`
- `ui-modal` `CyclicAlarmEditor` w `MyTasksModal` — ustawianie serii (od/do + interwał 30 min/1 h/2 h/1 dzień), podgląd liczby wystąpień; badge „Cykl" na karcie zadania

### słownik
- dodano `TaskReminder.recurIntervalMinutes`, `TaskReminder.recurEnd`, `TaskReminder.lastFiredAt` — pola serii cyklicznej
- dodano `UserTasksService.createReminder / getRemindersForTask / deleteReminder` oraz 3 endpointy alarmów
- dodano `CyclicAlarmEditor`, `ALARM_INTERVALS` (frontend)

### wytyczne
- `schema-pole` `TaskReminder.recurIntervalMinutes` — dyskryminator: `null` = alarm jednorazowy (auto-sync z `plannedEnd`), ustawione = seria cykliczna. Każda operacja auto-sync MUSI filtrować `recurIntervalMinutes: null`, by nie skasować serii.
- `back-funkcja` `getDueReminders` — cykliczne wystąpienia liczone z zegara, NIE materializowane jako wiersze; jeden `TaskReminder` = cała seria. Rozdzielczość odpalania = interwał pollingu 60 s.

## 2026-08-06 — Sterowanie statusem subtasków (harmonogram) w AllTasksModal (v2026.08.06.751)

### architektura / API
- `ui-modal` `AllTasksModal` — subtaski (harmonogram) mają teraz chip statusu (Nowy/Zaplanowany/W trakcie/Zakończony/Wstrzymany/Anulowany) i akcję odznaczenia: checkbox → `PATCH /subtasks/:id { status:'FINISHED' }` (`all-tasks-subtask-status`), a w filtrze „Wykonane" przycisk „Zaplanuj" → `status:'NEW'`. Wcześniej akcja była tylko dla UserTasków.

### wytyczne
- `schema-pole` `Subtask.status` — „wykonane" subtaska = `FINISHED` (spójne z `CalendarView` które po `FINISHED` rysuje styl zakończonego); UserTask używa `DONE`. Dwa różne pola statusu dla dwóch typów zadań.

---

## 2026-08-06 — Przycisk „Pokaż zadania" w nagłówku Struktury projektu (obok Q&A) + samowystarczalny AllTasksModal (v2026.08.06.750)

### architektura / API
- `ui-modal` `AllTasksModal` — przerobiony na samowystarczalny: pobiera własne dane po `nodeId`/`versionId` (`all-tasks-fetch-open`: `GET /subtasks/node/:id` + `GET /my-tasks`); props uproszczone do `{ nodeId, versionId, onChanged, onClose }`. `onChanged` powiadamia rodzica po done/restore.
- `ui-przycisk` „Pokaż zadania" (`UnifiedWbsPanel`, `unified-all-tasks-open`) — w nagłówku sekcji „Struktura projektu" obok przycisku Q&A; otwiera ten sam modal co „Pełna lista" w zakładce Zadania.

---

## 2026-08-06 — Filtr „Wykonane" w modalu pełnej listy + powrót zadania do statusu zaplanowane (v2026.08.06.749)

### architektura / API
- `back-endpoint` `GET /my-tasks` — dodany opcjonalny query `?status=OPEN|DONE` (`back-serwis` `listForUser(userId, status)`); domyślnie OPEN (bez zmian dla istniejących wywołań), `DONE` → wykonane sortowane po `updatedAt desc`. Zasila filtr „Wykonane".
- `ui-modal` `AllTasksModal` — nowy filtr „Wykonane" (leniwy fetch `?status=DONE`) pokazujący wykonane UserTaski (+ Subtaski `status=FINISHED`) z zielonym badge; przycisk „Zaplanuj" (`all-tasks-restore`) przywraca UserTask do `status:'OPEN'` przez `PATCH /my-tasks/:id` i odświeża kalendarz.

### wytyczne
- `schema-pole` `UserTask.status` — `listForUser` domyślnie filtruje `OPEN`; wykonane pobiera się jawnie `?status=DONE`. Zmiana statusu przez `PATCH /my-tasks/:id { status }` synchronizuje też MS To Do (`completed`/`notStarted`).

---

## 2026-08-06 — Zadania węzłów (UserTask) w kalendarzu zakładki Zadania + modal pełnej listy + dzwonek due (v2026.08.06.748)

### architektura / API
- `ui-funkcja` `CalendarView` (`calendar-render-user-task`) — kalendarz renderuje dwa typy zadań: Subtaski (harmonogram, kolor kategorii, resize) i UserTaski (zadania węzłów, bursztyn, checkbox „zrobione", drag do przełożenia terminu). Nowe propsy: `userTasks`, `onUserTaskDone`, `onUserTaskReschedule`, `onUserTaskClick`.
- `ui-sekcja` `TasksCalendarSection` — nakłada moje UserTaski (`GET /my-tasks`) na kalendarz z togglem zakresu „Ten projekt / Wszystkie moje" (filtr po zbiorze węzłów WBS z `GET /wbs-nodes/unified/:id`). Reschedule → `PATCH /my-tasks/:id { plannedEnd }`, done → `PATCH /my-tasks/:id { status:'DONE' }`.
- `ui-modal` `AllTasksModal` (`all-tasks-modal`) — pełna lista obu typów zadań w formacie „Q&A całe drzewo": grupowanie po gałęzi top-level WBS (UserTaski) + osobna grupa „Harmonogram — podzadania" (Subtaski), sticky nagłówki, szukajka + filtr daty (Przeterminowane/Dziś/Tydzień/Później).
- `ui-panel` `DueTasksBell` (`due-tasks-bell`) — trwały dzwonek wypadających zadań w górnej belce (badge = liczba due z `GET /my-tasks/reminders/due`), dropdown z akcjami done/drzemka 1h; uzupełnia ulotny `TaskReminderToast`.

### wytyczne
- `schema-pole` `UserTask.nodeId` — wskazuje na `WbsNode` (indywidualny węzeł drzewa), NIE na `ProcessNode`; `Subtask.nodeId` wskazuje na `ProcessNode` (order/projekt). Dlatego w kalendarzu/modalu oba typy trzyma się rozdzielnie i UserTaski grupuje po gałęzi WBS, a Subtaski w osobnej grupie projektu.

---

## 2026-08-05 — wbs: statusy liści — dodane „Wykonane"/„Zainstalowane", „Mieszany" tylko jako status zbiorczy (v2026.08.05.746)

### architektura / API
- `ui-stala` `MATERIAL_STATUS_LABELS` / `STRUCTURE_STATUS_META` (`wbsConstants.js`) — dodane statusy `DONE` („Wykonane") i `INSTALLED` („Zainstalowane"); round-trip label↔code działa przez `MATERIAL_STATUS_LABEL_TO_CODE`
- `ui-dropdown` `StatusSelect` (`WBSHybridTable.jsx`) — opcja „Mieszany" (MIXED) usunięta z listy wyboru (filtr `code !== 'MIXED'`); MIXED pozostaje w `STRUCT_STATUS_META` wyłącznie do wyświetlania obliczanego statusu zbiorczego gałęzi
- `ui-modal` `QaModal` (`WBSHybridTable.jsx`) — szerokość zwężona `w-3/4` → `w-[37.5%]`

### wytyczne
- `ui-dropdown` `StatusSelect` — MIXED to status obliczany (agregacja różnych statusów materiałów w gałęzi, `getInheritedMaterialStatus`), nigdy zapisywany na węźle; nie dodawać go z powrotem do wybieralnych opcji

## 2026-07-24 — wbs/budżet: eksport Excel — nagłówki zakładki „Budżet" (Zakres/Podzakres/Pozycja/Narzut) (v2026.07.24.734)

### architektura / API
- eksport Excel (`UnifiedWbsPanel.jsx`, `handleExportBudgetExcel` → `BUDGET_COLUMNS`) — nagłówki kolumn zakładki „Budżet" przemianowane: „Przedmiot"→„Zakres", „Podgałąź"→„Podzakres", „Nazwa"→„Pozycja", „Marża (%)"→„Narzut (%)". Klucze kolumn (`subjectName`/`parentName`/`name`/`margin`) i formuły bez zmian; import mapuje po wybranej kolumnie, nie po tekście nagłówka, więc reimport działa
- kolumna `margin` w zakładce „Budżet" liczy `cena = koszt × (1 + margin/100)` — to narzut od kosztu, stąd nazwa „Narzut" (spójna z `BudgetTable.jsx`); arkusze „Podsumowanie" (per typ / per osoba / marża po rabatach) liczą `Zysk/Przychód` = prawdziwa marża od przychodu i pozostają nazwane „Marża"

### wytyczne
- eksport Excel budżetu — rozróżniaj: kolumna zakładki „Budżet" = `ui-kolumna` narzut od kosztu („Narzut %"); arkusze podsumowań = marża od przychodu (`Zysk/Przychód`, „Marża %"). Nie ujednolicaj nazw między tymi arkuszami

## 2026-07-24 — wbs/strategia: usunięcie globalnej strategii projektu, pola strategii gałęzi/liści rosną z tekstem (v2026.07.24.733)

### architektura / API
- `ui-sekcja` sekcja „Jak to chcemy zrobić" (`UnifiedWbsPanel.jsx`) — usunięty globalny edytor strategii całego projektu (`ui-input` `wbsDescription` + `MarkdownEditor`). Zostają wyłącznie `ui-input` `BranchStrategyField` (strategie gałęzi) oraz strategie liści edytowane w tabeli WBS
- `ui-input` `BranchStrategyField` — textarea auto-resize: `rows=1` + wysokość dopasowana do `scrollHeight` (rośnie z tekstem), `ResizeObserver` przelicza po rozwinięciu sekcji; usunięty `resize-y` i stały `rows=2`
- eksport PDF (`UnifiedWbsPanel.jsx`, `handleExportPDF` → `strategyHtml`) — usunięty blok globalnej strategii („Opis wyceny" + `getStrategyText`); sekcja renderuje się tylko gdy istnieją strategie gałęzi (`branchStrategiesHtml`)
- eksport Excel (`handleExportOfertaWbsExcel` → arkusz „Strategia") — usunięty nagłówek „Opis wyceny" z globalną strategią; arkusz zawiera tylko „Strategie gałęzi"
- usunięte martwe funkcje/stan po globalnej strategii: `ui-funkcja` `getStrategyText`, `saveStrategy`, `handleStrategySave`, stan `wbsDescription`, `strategySaving`, `strategySaved`, refy `strategyLoadedRef`, `strategySaveTimeout`

### słownik
- usunięto `handleStrategySave` — funkcja debounce zapisu globalnej strategii projektu (już nie istnieje)

### wytyczne
- `ui-sekcja` strategia WBS — strategia istnieje wyłącznie na poziomie gałęzi (`schema-pole` `WbsNode.strategy` top-level) i liści (`WbsNode.strategy` potomków); nie ma już strategii całego projektu. Eksporty PDF/Excel czytają tylko `n.strategy` per węzeł

## 2026-07-24 — wbs/oferta: eksport PDF — rysunki Schematu na jednej stronie, nagłówek „Opis Zakresów", pogrubione nazwy liści (v2026.07.24.732)

### architektura / API
- eksport PDF (`schematPdfExport.js`, `SCHEMAT_SECTION_CSS`) — `.sch-page` height 257mm → 235mm, żeby rysunek Schematu mieścił się na jednej stronie (powtarzany nagłówek dokumentu w thead zabierał ~25mm i wypychał obraz na drugą stronę)
- eksport PDF (`UnifiedWbsPanel.jsx`, `handleExportPDF` → `branchStrategiesHtml`) — nagłówek sekcji strategii per gałąź zmieniony z „Strategie gałęzi" na „Opis Zakresów"
- eksport PDF (`branchStrategiesHtml`) — strategia gałęzi odtwarzana z liści (`collectLeafStrategyEntries`), nazwa liścia pogrubiona (`.branch-leaf-name`) tak jak w widoku WBS na stronie, zamiast płaskiego tekstu złożenia

### wytyczne
- `ui-stala` `SCHEMAT_SECTION_CSS` `.sch-page` — wysokość musi uwzględniać powtarzany nagłówek dokumentu (thead), nie tylko marginesy strony; zbyt duża wartość wypycha rysunek na kolejną stronę

## 2026-07-23 — feat(wbs): wartości domyślne liści per zamówienie — nowe zamówienie wyzerowane

### schema.prisma
- dodano model `WbsLeafDefaults` (`nodeId @unique`, `data` JSON) — konfigurowalne wartości domyślne liści budżetowych osobne dla KAŻDEGO zamówienia; brak wpisu = nowe zamówienie = baza wyzerowana

### architektura / API
- nowy moduł `back-modul` `WbsLeafDefaultsModule` z `back-endpoint` `GET /wbs-leaf-defaults/:nodeId` (zwraca zapis lub `{}`) i `PUT /wbs-leaf-defaults/:nodeId` (upsert po nodeId)
- `wartości domyślne liści` przeniesione z globalnego localStorage na backend per zamówienie; `ui-funkcja` `getLeafDefault`/`loadLeafDefaults`/`saveLeafDefaults` + stała `WBS_DEFAULTS_STORAGE_KEY` USUNIĘTE, zastąpione czystymi helperami `mergeLeafDefaults`/`getLeafDefaultFrom` operującymi na obiekcie pobranym z API
- `ui-stala` `SEED_LEAF_DEFAULTS` (fabryczne, fuel 0,70, qty 1) zastąpione `ZERO_LEAF_DEFAULTS` (wszystko 0, jednostka wg typu) — baza nowego zamówienia
- `WBSHybridTable.jsx` — nowy prop `leafDefaults`; zmiana typu liścia czyta `getLeafDefaultFrom(leafDefaults, type)` zamiast globalnego `getLeafDefault(type)`

### słownik
- dodano `zero-leaf-defaults`, `merge-leaf-defaults`, `get-leaf-default-from` (wbsConstants.js); `leaf-defaults-state`, `fetch-leaf-defaults`, `save-leaf-defaults-to-server` (UnifiedWbsPanel.jsx); `wbs-leaf-defaults-model`, `wbs-leaf-defaults-node-id`, `wbs-leaf-defaults-data` (schema.prisma)
- usunięto `wbs-defaults-storage-key`, `seed-leaf-defaults`, `load-leaf-defaults`, `save-leaf-defaults`, `get-leaf-default`

### wytyczne
- `schema-model` `WbsLeafDefaults` — kluczowany po `nodeId` (zamówienie), NIE po `versionId`; wersjonowanie WBS nie klonuje tego wpisu (defaulty wspólne dla wszystkich wersji zamówienia)
- `ui-funkcja` `mergeLeafDefaults` — zawsze scala zapis z bazą `ZERO_LEAF_DEFAULTS`; brak/uszkodzony wpis → sama baza wyzerowana

## 2026-07-23 — feat(wbs): złożenie strategii — nazwa pozycji bold, strategia od nowego wiersza (v2026.07.23.728)

### architektura / API
- `ui-funkcja` `collectBranchStrategyEntries` (WBSHybridTable.jsx) — zbiera wypełnione komórki strategii potomków jako `[{ id, name, strategy }]`; baza renderu (bold nazwa w gridzie) i złożenia utrwalanego na top-level
- `ui-funkcja` `composeBranchStrategy` (WBSHybridTable.jsx) — nowy format utrwalanego złożenia: `nazwa:` a strategia od nowego wiersza, wpisy rozdzielone pustą linią (wcześniej `nazwa: strategia` w jednej linii)
- komórka Strategia top-level w gridzie: renderuje nazwę pozycji `font-bold`, a jej strategię w osobnym wierszu poniżej

### słownik
- dodano `ui-funkcja` `collectBranchStrategyEntries` — WBSHybridTable.jsx, @anchor collect-branch-strategy-entries

## 2026-07-23 — feat(wbs): strategia edytowana na elementach, składana na węźle top-level (v2026.07.23.727)

### architektura / API
- `ui-funkcja` `composeBranchStrategy` (WBSHybridTable.jsx) — składa strategię całej gałęzi z wypełnionych komórek potomków (liście + węzły pośrednie), format `nazwa: strategia` linia na węzeł; węzeł top-level pomija sam siebie
- `ui-funkcja` `saveLeafStrategy` (WBSHybridTable.jsx) — zapis strategii na węźle-elemencie utrwala własną wartość, po czym przelicza złożenie gałęzi i utrwala je na polu `strategy` węzła top-level (depth 0), skąd czytają je eksporty PDF/Excel; puste złożenie nie nadpisuje istniejącej strategii top-level
- kolumna Strategia w gridzie WBS: edytowalna na węzłach `depth>0` (liście / pośrednie), read-only złożenie na `depth===0` (wcześniej odwrotnie — edycja tylko na top-level)

### słownik
- dodano `ui-funkcja` `composeBranchStrategy` — WBSHybridTable.jsx, @anchor compose-branch-strategy
- dodano `ui-funkcja` `saveLeafStrategy` — WBSHybridTable.jsx, @anchor save-leaf-strategy

### wytyczne
- `schema-pole` `WbsNode.strategy` — na węźle top-level jest wartością POCHODNĄ (złożenie z potomków przez `composeBranchStrategy`), nie edytuj jej ręcznie; edycja odbywa się na węzłach `depth>0`

## 2026-07-21 — fix(oferta): szablony wstawiają surowe tokeny {zmienne} zamiast zamrożonych wartości — auto-aktualizacja (v2026.07.21.718)

### architektura / API
- `ui-funkcja` `resolveOfferTokens` (UnifiedWbsPanel.jsx) — zastępuje dawny `resolvedPresets`; „WSTAW SZABLON" wstawia teraz surowy token `{wartość oferty}` / `{tabela wbs1}` itd., a nie wyliczoną wartość. Rozwijanie tokenów następuje wyłącznie w podglądzie edytora i przy eksporcie PDF, więc treść oferty auto-aktualizuje się przy zmianie wyceny
- `ui-propsy` `resolveTokens` (MarkdownEditor.jsx) — opcjonalna funkcja rozwijająca tokeny; używana tylko w `renderHtml` (podgląd), pole edycji zawsze trzyma surowy tekst

### słownik
- dodano `resolve-offer-tokens` — rozwija tokeny {zmienne} oferty na żywe wartości, UnifiedWbsPanel.jsx

### wytyczne
- `ui-funkcja` `resolveOfferTokens` — zmienne oferty (`{wartość oferty}`, `{tabela wbs1}`, `{nazwa projektu}`…) przechowuj w treści ZAWSZE jako surowe tokeny; rozwijaj je dopiero przy renderze (podgląd / PDF), nigdy przy wstawianiu do pola — inaczej wartość się „zamraża" i nie odświeża

## 2026-07-15 — feat(oferty): edycja zapisanych pozycji oferty z autozapisem + modal wyboru zamiast auto-parsowania (v2026.07.15.702)

### architektura / API
- zmieniono sygnaturę `back-endpoint` `POST /material-requirements/parse-offer` — nowy opcjonalny parametr body `force: boolean`; `force=true` pomija zapisane `schema-pole` `ProcessNode.parsedPositions` i wymusza faktyczne ponowne parsowanie (wcześniej przycisk „Parsuj ponownie" zwracał zapisane pozycje i nigdy nie parsował od nowa)
- `back-funkcja` `getDocuments` (documents.service.ts) — odczyt `parsedPositions` najpierw jako czysty JSON (tak zapisuje `approveParsedPositions`), base64 tylko jako fallback dla starych rekordów; wcześniej dekodowanie wyłącznie base64 zawsze kończyło się `null`
- `ui-sekcja` `OfferParsePanel` (DocumentViewer.jsx) — przy wejściu na już sparsowany dokument nie parsuje automatycznie; pokazuje `ui-modal` `OfferParsedChoiceModal` z wyborem: edycja zapisanych pozycji lub ponowne parsowanie. Edycje pól (cena, ilość, producent itd.) zapisanych pozycji zapisują się automatycznie (debounce 800 ms + flush przy zamknięciu podglądu). Pola `quantity`/`priceNetto` konwertowane na liczby, `priceNettoPln` przeliczany przy edycji ceny w walucie obcej

### słownik
- dodano `offer-parsed-choice-modal` — modal wyboru edycja/ponowne parsowanie, DocumentViewer.jsx
- dodano `offer-choice-open` — stan otwarcia modala wyboru, DocumentViewer.jsx
- dodano `offer-autosave-state` — stan autozapisu (idle/saving/saved/error), DocumentViewer.jsx
- dodano `offer-save-positions` — funkcja PATCH pozycji do `/documents/:id/parsed-positions`, DocumentViewer.jsx
- dodano `offer-parse-now` — funkcja parsowania oferty (z parametrem force), DocumentViewer.jsx

### wytyczne
- `schema-pole` `ProcessNode.parsedPositions` — zapisywany ZAWSZE jako czysty JSON string (nie base64); przy odczycie w nowych miejscach parsować bezpośrednio `JSON.parse`
- `ui-sekcja` `OfferParsePanel` — autozapis edycji działa tylko gdy pozycje są już w bazie (`hasStoredRef`); świeżo sparsowane pozycje trafiają do bazy dopiero po „Zatwierdź dane oferty", żeby wymuszone parsowanie nie nadpisywało zapisanych danych przed zatwierdzeniem

## 2026-07-15 — feat(schemat): upload załączników markera outbox-first — wysyłka zawsze przez globalny sync w tle (v2026.07.15.701)

### architektura / API
- `ui-funkcja` `uploadFile` (MarkerDetailsPanel) przeprojektowana na outbox-first: plik ZAWSZE najpierw trafia do IndexedDB (`saveAttachmentDraft` — draft + wpis outbox `ADD_ATTACHMENT`), niezależnie od stanu sieci; bezpośredni POST do API usunięty. Przy dostępnej sieci sync odpalany jest natychmiast (`syncOutbox`), bez czekania na 60-sekundowy interwał. Wysyłka działa w tle na poziomie aplikacji — wyjście z panelu, zwinięcie apki na mobile ani reload strony w trakcie wysyłania nie gubi pliku

### wytyczne
- `ui-funkcja` `uploadFile` (MarkerDetailsPanel) — upload załączników wyłącznie outbox-first; NIE przywracać bezpośredniego POST z komponentu: request żyje tylko tak długo jak strona, a na mobile przełączenie aplikacji w trakcie wysyłania ubija go bez śladu

## 2026-07-15 — fix(schemat): załączniki markera nie giną przy słabym zasięgu — fallback do outboxa + pending z IndexedDB w UI (v2026.07.15.700)

### architektura / API
- upload załącznika markera (`MarkerDetailsPanel.uploadFile`): błąd sieci w ścieżce „online" (fetch rzuca — słaby zasięg, stale probe `isOnline`) nie gubi już pliku — plik spada do kolejki offline (`attachmentDrafts` + outbox `ADD_ATTACHMENT`) przez nową `ui-funkcja` `saveAttachmentDraft`; alert zostaje tylko dla odpowiedzi HTTP !ok (serwer odpowiedział — retry i tak by padł)
- pending załączniki są teraz czytane z IndexedDB przy montowaniu panelu (`ui-funkcja` `loadPendingDrafts` → `ui-stan` `pendingDrafts`) i renderowane w gridzie z badge ⏳ — przetrwają reload strony / ubicie karty przez mobile; usunięcie pending kasuje wpis z outboxa i draft, pobranie idzie z lokalnego blob URL
- `useSyncOutbox`: sync outboxa odpala się cyklicznie co 60 s (`ui-stala` `OUTBOX_RETRY_INTERVAL_MS`), nie tylko przy zmianie token/isOnline — pojedynczy nieudany sync nie zostawia kolejki wiszącej w nieskończoność

### słownik
- dodano `pending-drafts`, `load-pending-drafts`, `save-attachment-draft`, `display-attachments` — obsługa pending załączników w MarkerDetailsPanel.jsx
- dodano `outbox-retry-interval-ms` — interwał retry syncu w useSyncOutbox.js

### wytyczne
- `ui-funkcja` `uploadFile` (MarkerDetailsPanel) — każda nowa ścieżka uploadu plików z terenu MUSI przy błędzie sieci spadać do kolejki offline zamiast alertować i porzucać plik; `isOnline` z `useNetwork` jest optymistyczne (probe co 30 s) i nie gwarantuje, że POST przejdzie
- `ui-stan` `pendingDrafts` — źródłem prawdy o niewysłanych załącznikach jest IndexedDB (outbox + attachmentDrafts), nigdy stan w pamięci ani blob URL-e z eventów — te giną przy reloadzie

## 2026-07-14 — feat(wbs): wspólny widok Q&A całego drzewa (QaTreeView) z kolejką offline (v2026.07.14.699)

### architektura / API
- dodano `ui-sekcja` `QaTreeView` (`apps/frontend/src/components/shared/wbs/QaTreeView.jsx`) — jeden edytowalny widok wszystkich pytań/odpowiedzi całego drzewa WBS, wspólny dla mobile (pełny ekran) i desktopu (modal 3/4); grupowanie po gałęziach top-level, filtry (wszystkie / z pytaniami / bez odpowiedzi, domyślnie mobile: bez odpowiedzi), wyszukiwarka; zapis per węzeł onBlur przez `PATCH /wbs-nodes/:id { qa }`
- dodano typ outbox `WBS_QA` w `syncOutbox.js` — zapis Q&A wykonany offline (lub gdy PATCH padnie) trafia do kolejki Dexie (`db.outbox`) z dedupe latest-wins per węzeł (`enqueueWbsQa` w `outboxRepo.js`) i synchronizuje się automatycznie po odzyskaniu sieci; po syncu event `wbs-qa-synced`
- drzewo Q&A cache'owane w meta KV Dexie (klucz `qaTree:{nodeId}:{versionId}`) — widok otwiera się offline na ostatnio pobranych danych, edycje offline nadpisują cache (write-through)
- nowy kafelek „Q&A drzewa" w `MarkerDetailsPanel` (siatka mobilna i desktopowa) otwiera `QaTreeView`
- desktopowe wejścia w zakładce „Schemat" (`SchematTab.jsx`, v2026.07.14.698): przycisk „Q&A" w pasku narzędzi obok „Eksport PDF" oraz przycisk „Q&A drzewa" w lokalnym panelu szczegółów znacznika (prop `onOpenQaTree` — lokalny panel SchematTab to inny komponent niż współdzielony `MarkerDetailsPanel`)

### słownik
- dodano `qa-tree-view` — komponent widoku, QaTreeView.jsx
- dodano `qa-tree-filter`, `qa-queued-ids`, `persist-node-qa` — stan filtrów, znaczniki kolejki offline i zapis węzła w QaTreeView.jsx
- dodano `qa-tree-open` — stan otwarcia widoku w MarkerDetailsPanel.jsx
- dodano `enqueue-wbs-qa`, `get-pending-by-type` — kolejkowanie Q&A w outboxRepo.js
- dodano `wbs-qa-outbox-type` — obsługa typu WBS_QA w syncOutbox.js
- dodano `schemat-qa-tree-open` — stan otwarcia QaTreeView w SchematTab.jsx

### wytyczne
- `ui-funkcja` `persistNodeQa` — zapisy Q&A z widoków zbiorczych zawsze przez PATCH pojedynczego węzła z fallbackiem do outboxa (`enqueueWbsQa`); nie wysyłać całego drzewa (konflikt z debounce zapisu WBSHybridTable)
- `ui-funkcja` `enqueueWbsQa` — przy kolejkowaniu zapisu tego samego węzła starszy wpis w outboxie musi zostać usunięty (latest-wins), inaczej sync nadpisze nowszą edycję starszą

## 2026-07-13 — Dokumentacja/Pliki finansowe: naprawa podglądu .docx w DocumentViewer (v2026.07.13.698)

### architektura / API
- `back-endpoint` `GET /documents/download/:id/:filename` — nowa trasa (`apps/backend/src/documents/documents.controller.ts`), deleguje do istniejącej `downloadDocument`; `:filename` jest ignorowany serwerowo, służy wyłącznie do dołożenia rozszerzenia pliku (np. `.docx`) na końcu URL

### wytyczne
- `ui-funkcja` `DocumentViewer` (isOffice) — podgląd .docx/.doc/.xlsx/.pptx idzie przez zewnętrzny Microsoft Office Online Viewer (`view.officeapps.live.com/op/embed.aspx?src=...`), który wymaga aby przekazany URL kończył się rozpoznawalnym rozszerzeniem, inaczej zwraca „nie możemy otworzyć tego obiektu"; dlatego `fileUrl` przekazywany do `DocumentViewer` musi być budowany jako `/documents/download/:id/:encodedFileName`, nigdy samo `/documents/download/:id`

## 2026-07-09 — WBS: nagłówek „Oferta" + wstępne zdanie jako zwykły akapit w eksporcie Excel/PDF (v2026.07.09.696)

### architektura / API
- `ui-funkcja` `handleExportOfertaWbsExcel` (arkusz „Oferta") — dodano nagłówek H1 „Oferta"; wstępne zdanie „W odpowiedzi na zapytanie..." (wpisywane jako markdown H1 przez snippet „Wstęp") jest teraz demotowane do zwykłego akapitu, bo tę rolę nagłówka przejęła nowa sekcja
- eksport PDF (`UnifiedWbsPanel.jsx`, sekcja oferty) — dodano `section-header` „Oferta"; to samo demotowanie wstępnego zdania z H1 na akapit

## 2026-07-09 — WBS: nagłówek „Opis wyceny" dla strategii ogólnej w eksporcie Excel/PDF (v2026.07.09.695)

### architektura / API
- `ui-funkcja` `handleExportOfertaWbsExcel` (arkusz „Strategia") — dodano nagłówek H1 „Opis wyceny" przed tekstem ogólnej strategii (wcześniej sekcja nie miała żadnego nagłówka, tylko „Strategie gałęzi" dla gałęzi)
- eksport PDF (`UnifiedWbsPanel.jsx`, sekcja strategii) — nagłówek zmieniony z „Jak to chcemy zrobić" na „Opis wyceny", spójnie z Excelem

## 2026-07-08 — WBS: kolumna Narzut % w WBSHybridTable (v2026.07.08.689)

### architektura / API
- `ui-kolumna` `narzut` — nowa edytowalna kolumna Narzut % między „Koszt jedn." a „Cena ofert." w `WBSHybridTable` (tylko manager); edytuje pole `margin` liścia/węzła z kosztem, dla `depth=0` i `type=group` pokazuje „—"

### słownik
- dodano `wbs-margin-input` — input Narzut % w WBSHybridTable, edytuje `node.margin`, plik `apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx`

### wytyczne
- `ui-input` `wbs-margin-input` — kolumna Narzut % dostępna tylko dla `isManager`; musi być w `GRID_COLUMN_ORDER` i colgroup pod tym samym warunkiem co `cena_netto`

---

## 2026-07-08 — OneDrive: podgląd plików w apce (nie tylko lista) (v2026.07.08.687)

### architektura / API
- `back-endpoint` `GET /onedrive/content/:nodeId?itemId=&token=` — strumieniuje treść pliku z OneDrive do przeglądarki przez backend; publiczny na poziomie guarda (react-pdf/`<img>` nie wysyłają nagłówka Authorization), JWT weryfikowany ręcznie z query param `token`
- `back-serwis` `OneDriveService.downloadFile` — pobiera pre-autoryzowany `@microsoft.graph.downloadUrl` z Graph i strumieniuje go dalej (omija problem Bearera przy redirectcie `/content`)
- `back-modul` `OneDriveModule` — dodano `JwtModule` (weryfikacja tokenu w kontrolerze)
- `ui-sekcja` `OneDriveFilesSection` — klik w nazwę pliku otwiera `DocumentViewer` w modalu (PDF/obraz/office/tekst renderowane tak samo jak pliki z bazy); wcześniej lista OneDrive miała tylko link „otwórz w OneDrive"

### słownik
- dodano `back-serwis` `downloadFile` (OneDrive) — strumieniowanie treści pliku z OneDrive
- dodano `back-endpoint` `GET /onedrive/content/:nodeId` — endpoint podglądu treści OneDrive
- dodano `ui-stan` `preview` (OneDriveFilesSection) — aktualnie podglądany plik OneDrive

### wytyczne
- `back-endpoint` `onedrive-content-endpoint` — treść plików OneDrive MUSI iść przez backend (strumień), nie przez `@microsoft.graph.downloadUrl` bezpośrednio w przeglądarce — te URL-e nie zwracają nagłówków CORS, więc react-pdf/fetch je zablokuje

---

## 2026-07-07 — Eksport: strategie per gałąź w PDF i Excel (sekcja „Jak to chcemy zrobić")

### architektura / API
- `ui-funkcja` `handleExportPDF` (`UnifiedWbsPanel.jsx`) — sekcja „Jak to chcemy zrobić" renderuje pod globalną strategią blok „Strategie gałęzi": strategia (`strategy`) każdego węzła top-level (`depth === 0`), sortowana wg `sortOrder`
- eksport Excel — arkusz „Strategia" dokleja strategie per gałąź jako markdown (`# Strategie gałęzi` + `## <nazwa>`), obok globalnego tekstu strategii

---

## 2026-07-07 — WBS: strategia per gałąź (kolumna `strategy`, top-level)

### schema.prisma
- dodano pole `strategy String?` w modelu `WbsNode` — strategia realizacji gałęzi; Postgres `text` (bez limitu 256 znaków). Migracja `20260707120000_add_strategy_to_wbs_node`

### architektura / API
- `back-serwis` `WbsNodesService` — `strategy` obsłużone w `buildTree`, `flattenForInsert`, obu ścieżkach `saveTree`, `getUnifiedTree` oraz w liście dozwolonych pól `updateNode` (PATCH `/wbs-nodes/:id`)
- `back-serwis` `versioning.service.ts` — `strategy` kopiowane przy klonowaniu wersji (`wbsNode.create`)
- `ui-kolumna` `strategia` (`WBSHybridTable.jsx`) — nowa kolumna drzewa WBS; edytowalna tylko dla węzłów `depth === 0`, głębsze pokazują `—`
- `ui-funkcja` `BranchStrategyField` (`UnifiedWbsPanel.jsx`) — pole strategii gałęzi w zakładce „Jak to chcemy zrobić", lista pod globalnym edytorem (tylko gałęzie top-level)
- `ui-funkcja` `buildWbsHtmlTable` (`wbsPdfExport.js`) — tabela oferty depth=1 dostaje kolumnę „Strategia" (gdy któraś gałąź ma treść)
- eksport Excel oferty — kolumna „Strategia" w arkuszach „Drzewo WBS" i „WBS1 - Zakresy"

### słownik
- dodano `schema-pole` `WbsNode.strategy` — pole strategii gałęzi
- dodano `ui-funkcja` `BranchStrategyField` — pole strategii gałęzi w zakładce Strategia

### wytyczne
- `schema-pole` `WbsNode.strategy` — edytowalne i eksportowane TYLKO dla węzłów top-level (`depth === 0`); głębsze węzły ignorują to pole. Nowa kolumna z `versionId` → dodana do klonu w `versioning.service.ts`

## 2026-07-07 — WBS/Budżet: przycisk „Domyślne wartości" + auto-wartości nowych liści

### architektura / API
- `ui-stala` `SEED_LEAF_DEFAULTS` (`wbsConstants.js`) — fabryczne wartości domyślne każdego typu liścia (`unit`, `unitCost`, `margin`, `quantity`); baza modalu i nadpisań w localStorage
- `ui-funkcja` `loadLeafDefaults` / `saveLeafDefaults` / `getLeafDefault` (`wbsConstants.js`) — odczyt/zapis konfigurowalnych domyślnych z localStorage (klucz `WBS_DEFAULTS_STORAGE_KEY`), z fallbackiem do seed
- `ui-stala` `LEAF_TYPE_OPTIONS` (`wbsConstants.js`) — lista typów liści (TYPE_OPTIONS bez `group` i pustego), kolejność wierszy modalu
- `ui-funkcja` `applyLeafDefaults` (`UnifiedWbsPanel.jsx`) — po otypowaniu liścia zapisuje `unit` (endpoint drzewa) oraz `unitCost/quantity/margin` jednym PATCH-em `/wbs-nodes/:id/budget`, z optymistyczną aktualizacją drzewa/budżetu
- `ui-modal` `leafDefaultsOpen` (`UnifiedWbsPanel.jsx`) — modal edycji domyślnych wartości, przycisk „Domyślne wartości" obok „Import budżetu z Excel" w nagłówku sekcji Budżet
- `WBSHybridTable.jsx` — nowy prop `onApplyLeafDefaults`; zmiana typu na liść czyta `getLeafDefault(type)` i stosuje wartości domyślne (jednostka kablowa/światłowodowa z `suggestDefaultUnit` ma priorytet). Defaulty tylko dla ŚWIEŻEGO liścia (poprzedni typ pusty) — retype istniejącego liścia nie kasuje cen, zmienia tylko jednostkę
- `back-serwis` `WbsNodesService.flattenForInsert` — ścieżka create nowego węzła przenosi z drzewa również `margin` (jak `unitCost`), by domyślna marża świeżego liścia utrwaliła się od razu „w locie" (unified POST). `quantity` nadal celowo nieprzenoszona

### wytyczne
- `ui-funkcja` `applyLeafDefaults` — pola budżetowe (`unitCost`, `margin`, `quantity`) zapisywać ZAWSZE łącznie przez `/budget`, nie pojedynczo przez endpoint drzewa (drzewo nie przelicza `unitPrice`/`totalPrice`)
- `back-serwis` `flattenForInsert` — nowe pole budżetowe przenoszone z drzewa dla nowych węzłów dodawaj tu ORAZ upewnij się, że ścieżka `update` (istniejące węzły) go NIE nadpisuje (zachowanie edycji)
- domyślne wartości pozycji stosują się przy KAŻDEJ zmianie typu (nowe i istniejące) dla pozycji innych niż materiał/sprzęt (te wyceniane indywidualnie przez wymagania materiałowe); ilość jest zachowywana; edycja w tabeli po zmianie nadal możliwa. Uwaga: „tylko nowe" dotyczy WYŁĄCZNIE braku retroaktywnej propagacji zmiany domyślnej z modalu — nie zmiany typu pozycji
- domyślne wartości liści są globalne per przeglądarka (localStorage), nie per-projekt — świadomy wybór, brak zmiany w schemacie

## 2026-07-07 — dodanie sekcji „Schemat" do eksportu PDF Oferty (przed sekcją Materiały)

### architektura / API
- `ui-funkcja` `buildSchematSectionHtml` (`utils/schematPdfExport.js`, nowy plik) — wydzielona z `SchematTab.jsx`/`exportMarkersToPdf` logika budowy sekcji Schemat (tabela znaczników, Q&A z WBS, strony schematów PDF/obrazów z naniesionymi markerami — render przez `pdfjs` na canvas), teraz reużywalna. `SchematTab.jsx` pozostaje bez zmian (własna kopia logiki, nienaruszona)
- `back-funkcja` `handleExportPDF('oferta')` (`UnifiedWbsPanel.jsx`) — dodano `schematHtml` (renderowane gdy `show('oferta')`), wywołuje `buildSchematSectionHtml` z `pageBreakBefore: true` i `sectionTitle: 'Schemat'` — pozycja w dokumencie: za „Jak to chcemy zrobić", przed sekcją Materiały
- `ui-stala` `SCHEMAT_SECTION_CSS` (`utils/schematPdfExport.js`) — style sekcji (`.sch-table`, `.qa-*`, `.sch-page`) dołączone do `<style>` bloku eksportu Oferty

### wytyczne
- `back-funkcja` `buildSchematSectionHtml` — jeśli w danym node'zie nie ma żadnych schematów/znaczników, zwraca `{ html: '', isEmpty: true }` — sekcja po prostu nie pojawia się w PDF, bez pustej strony

## 2026-07-06 — dodanie arkusza „Strategia" do eksportu Excel „Eksport tabel oferty"

### architektura / API
- `ui-funkcja` `handleExportOfertaWbsExcel` (`UnifiedWbsPanel.jsx`) — wydzielono `buildMarkdownSheet(sheetName, text, emptyMessage)`, wspólny parser Markdown→Excel używany teraz przez dwa arkusze tekstowe zamiast jednego
- `ui-funkcja` `buildMarkdownSheet` — nowy drugi arkusz „Strategia" (po „Założenia") z treścią sekcji „Jak to chcemy zrobić" (`getStrategyText()`), analogicznie do arkusza „Założenia” (tekst Oferty)

### wytyczne
- `ui-funkcja` `buildMarkdownSheet` — wysokość wiersza nagłówków H1/H2/H3 liczona dynamicznie z długości tekstu (`wrapHeight`), nie stała — stała wysokość przy długiej linii Markdown (np. tytuł i zdanie w jednej linii, bez podziału Enterem) powodowała wizualne nachodzenie tekstu na kolejne, puste wiersze arkusza

## 2026-07-06 — sekcja „Jak to chcemy zrobić" dołączona do eksportu PDF Oferty (własna strona), zamiast osobnego eksportu

### architektura / API
- `back-funkcja` `handleExportPDF` (`UnifiedWbsPanel.jsx`) — `strategyHtml` renderuje się teraz gdy `show('strategy') || show('oferta')` (wcześniej tylko `show('strategy')`), więc treść „Jak to chcemy zrobić" jest automatycznie dołączana do eksportu PDF Oferty — pozycja w dokumencie: za ofertą, przed materiałami (kolejność już istniała w szablonie HTML)
- `ui-przycisk` — dodano `page-break-before: always` do sekcji strategii gdy renderowana w ramach Oferty (`show('oferta')`), tak żeby zaczynała się od nowej strony — analogicznie do już istniejącego łamania strony przed sekcją Materiały
- `ui-przycisk` — usunięty osobny przycisk „PDF" z nagłówka sekcji „Jak to chcemy zrobić" oraz przycisk PDF w jej wewnętrznym edytorze markdown (`onExportPDF`) — eksport treści strategii dostępny jest teraz wyłącznie przez eksport Oferty

### wytyczne
- `back-funkcja` `handleExportPDF('strategy')` nie ma już wywołań w kodzie — jeśli w przyszłości trzeba przywrócić samodzielny eksport strategii, wystarczy dodać z powrotem przycisk wywołujący `handleExportPDF('strategy')`, logika `show()` już to obsłuży

## 2026-07-06 — usunięcie przycisków eksportu PDF sekcji Budżet/Materiały/WBS Tree (dane poufne)

### architektura / API
- `ui-przycisk` — usunięty pojedynczy przycisk „PDF" z nagłówka sekcji Budżet (`renderSection('budget', ...)`, `UnifiedWbsPanel.jsx`) — eksport z cenami/marżami jest poufny, nie ma trafiać poza firmę. Zostaje eksport Excel + import Excel
- `ui-przycisk` — usunięty pojedynczy przycisk „PDF" z nagłówka sekcji WBS Tree (`renderSection('wbs-hybrid', ...)`) — z tego samego powodu. „Q&A PDF" i „PDF wszystkie sekcje" (bez cen/marż — patrz `projectPdfExport.js`) zostają dostępne z tego nagłówka, warunek ich renderowania rozdzielony od `onExport` sekcji
- `ui-przycisk` — usunięty przycisk „Materiały PDF" z nagłówka sekcji Materiały (`WbsMaterialsPanel.jsx`) wraz z całą funkcją `exportToPdf` i propem `onExportPdfReady` (martwy kod po usunięciu jedynego wywołania) — zostaje eksport Excel
- `back-funkcja` `handleExportPDF('budget')` i `handleExportPDF('wbs')` nie są już wywoływane znikąd — usunięte powiązane gałęzie budowy HTML (`wbsHtml`, `budgetHtml`, `_budgetSummaryHtml`, `buildTreeRows`, `renderQaCell`) jako martwy kod; funkcja działa teraz tylko dla `oferta`/`strategy`/`gantt` (eksporty klienckie, bez cen)

### wytyczne
- `ui-przycisk` — eksport PDF z danymi poufnymi (koszt jednostkowy, marża, cena) ma przycisk WYŁĄCZNIE tam, gdzie dokument jest jawnie oznaczony jako wewnętrzny (np. dawny Budżet/PDF) — nigdy nie dodawaj generycznego przycisku „PDF" do sekcji przez wspólny `renderSection(..., onExport, ...)` bez sprawdzenia czy budowany HTML zawiera kolumny cenowe
- `ui-przycisk` „PDF wszystkie sekcje" i „Q&A PDF" w `renderSection` są renderowane niezależnie od `onExport` (nie od sekcji z jedną, dedykowaną eksportu) — to globalne akcje niepowiązane z poufnością konkretnej sekcji, więc nie powinny znikać razem z usunięciem przycisku PDF danej sekcji

## 2026-07-05 — fix(export-excel): dopasowanie pozycji po Gałąź 1 + Pozycja (z wykrywaniem kolizji) + wspólny układ kolumn tabel „per typ"/„per pozycja"

### architektura / API
- `ui-funkcja` `handleExportBudgetExcel` (tabela „Porównanie per pozycja") — kolumna „Pozycja (ścieżka)" (jeden sklejony string) zastąpiona kolumnami „Gałąź 1"…„Gałąź N" (od najwyższej gałęzi WBS) + „Pozycja" (sama nazwa liścia), tylko do wglądu/filtrowania
- **fix:** `computeLeafByPath` robił `chain.slice(1)` zakładając że trzeba obciąć „zbędny root projektu" z listy przodków — ale taki węzeł NIGDY nie jest częścią `items` (projekt to `ProcessNode`, osobna tabela; `WbsNode.parentId=null` oznacza tu NAJWYŻSZĄ GAŁĄŹ, np. „Instalacje elektryczne" — `wbs-nodes.service.ts getUnifiedTree` pyta po `WbsNode.nodeId`, nie po `ProcessNode.id`). Efekt: kolumna „Gałąź 1" wychodziła pusta / cała ścieżka przesunięta o jeden poziom w dół, najwyższa gałąź znikała z eksportu. `slice(1)` usunięty — `parts` to teraz pełny `chain` bez obcinania
- dopasowanie pozycji między snapszotami domyślnie po **Gałąź 1 (główna gałąź) + Pozycja** (`shortKey`), nie po pełnej ścieżce — odporne na zmianę nazw/przenoszenie w poziomach POŚREDNICH (Gałąź 2..N) między snapszotami. Wykrywanie kolizji: jeśli w OBRĘBIE JEDNEGO snapszotu ta sama para Gałąź1+Pozycja odpowiada dwóm różnym pełnym ścieżkom (naprawdę różne, jednocześnie istniejące pozycje w różnych podgrupach) — dla TYCH pozycji fallback do dopasowania po pełnej ścieżce + nowa widoczna kolumna „Uwaga" z ostrzeżeniem i żółte podświetlenie wiersza, żeby użytkownik zweryfikował ręcznie. Rename między snapszotami (różne pełne ścieżki w RÓŻNYCH snapszotach) nie liczy się jako kolizja i merguje się bezpiecznie
- dopasowanie (short key lub pełna ścieżka przy kolizji) idzie przez UKRYTĄ kolumnę hash (prosty 32-bit hash, zawsze krótki), nie przez tekst — nawet pojedynczy poziom hierarchii bywa opisową nazwą > 255 znaków (limit kryterium `SUMIFS`/`COUNTIFS`)
- `computeLeafByPath` — zwraca teraz `{ cost, revenue, parts }` (tablica nazw poziomów bez roota); `parts` używane do budowy czytelnych kolumn Gałąź/Pozycja i do wyliczenia short/full key, nie bezpośrednio do dopasowania w Excelu
- tabele „Porównanie per typ" i „Porównanie per pozycja" mają teraz WSPÓLNY układ kolumn: `nBranchCols` (puste dla „per typ") → Typ/Pozycja → 12 kolumn metryk (Koszt/Przychód/Zysk/Marża% A/B/Δ) — ten sam snapszot (np. Koszt A) jest w tej samej kolumnie w obu tabelach, `nBranchCols` liczone raz przed budową obu tabel

### wytyczne
- Excel `SUMIFS`/`COUNTIFS` ucina/nie dopasowuje kryterium tekstowego dłuższego niż ~255 znaków — dotyczy to KAŻDEGO pojedynczego kryterium, nie tylko sklejonej wieloznakowej ścieżki; pojedynczy poziom hierarchii z opisową nazwą węzła (typowe w realnych projektach WBS) też może przekroczyć limit. Do dopasowania obiektów po zmiennej, potencjalnie długiej nazwie używaj krótkiego hasha (np. prosty 32-bit hash → base36) jako kryterium `SUMIFS`, nigdy surowego tekstu — czytelny tekst zostaw wyłącznie w kolumnach do wglądu/filtrowania
- gdy dwie tabele w tym samym arkuszu porównują te same snapszoty kolumnowo, licz wspólny offset kolumn (np. `nBranchCols`) RAZ, przed budową którejkolwiek z tabel, i użyj go w obu — inaczej metryki tego samego snapszotu wylądują w różnych kolumnach między tabelami
- dopasowywanie obiektów między wersjami po „luźnym" kluczu (np. główna gałąź + nazwa, żeby przetrwać rename poziomów pośrednich) wymaga wykrywania kolizji: sprawdzaj czy klucz jest jednoznaczny W OBRĘBIE JEDNEGO zbioru danych (jednego snapszotu), nie globalnie — globalna kontrola myli rename (bezpieczny) z prawdziwą kolizją (różne obiekty o tej samej nazwie); przy kolizji nie sumuj po cichu, oznacz widocznym ostrzeżeniem i cofnij się do precyzyjnego klucza
- `WbsNode.parentId=null` ≠ „to jest root projektu, obetnij go" — `WbsNode` i `ProcessNode` to osobne tabele, projekt (`ProcessNode`) nigdy nie pojawia się jako wiersz w zapytaniach po `WbsNode.nodeId`; `parentId=null` na `WbsNode` to zwykły najwyższy poziom drzewa WBS, nie sentinel do odfiltrowania
- test budowany na RĘCZNIE podanych fixture'ach (np. gotowe `parts: [...]`) nie wykrywa bugów w funkcji, która te dane WYLICZA (tu: `partsOf`/`chain.slice`) — jeśli logika ma krok transformacji danych wejściowych, dodaj osobny test na SYNTETYCZNYM wejściu w kształcie realnych danych (surowe `items` z `parentId`), nie tylko na już-przetworzonym wyniku

---

## 2026-07-05 — feat(export-excel): tabele „Porównanie per typ" i „Porównanie per pozycja" z wyborem snapszotów w Excelu

### architektura / API
- `ui-funkcja` `handleExportBudgetExcel` (arkusz `Porównanie`) — dodano sekcję „Porównanie per typ" pod istniejącą tabelą ogólną: kolumny grupowane per metryka (Koszt A/B/Δ, Przychód A/B/Δ, Zysk A/B/Δ, Marża% A/B/Δ), jeden wiersz na typ (`work`/`service`/`material`/`fuel`/...) + `Razem`; poniżej dodano analogiczną sekcję „Porównanie per pozycja (liście budżetu)" — te same dwa dropdowny Snapshot A/B, ale wiersz na każdy pojedynczy liść budżetu zamiast na typ
- `computeSummaryFromItems` (lokalna funkcja w `handleExportBudgetExcel`) — zwraca teraz dodatkowo `byType` (koszt/przychód zagregowane per typ, per snapszot); `versionSummaries` niesie też `createdAt` snapszotu i `leafByPath` (koszt/przychód per pojedynczy liść budżetu)
- nowa lokalna funkcja `computeLeafByPath` — dopasowuje ten sam liść budżetu między snapszotami po ścieżce nazw (root → ... → liść), bo id-ki liści są nowe w każdym klonie wersji (`versioning.service.ts`)
- wybór dwóch porównywanych snapszotów odbywa się w samym Excelu — dwie listy rozwijane (data validation) „Snapshot A"/„Snapshot B" nad tabelą „Porównanie per typ", współdzielone przez obie tabele; wartości liczone formułami `SUMIFS` względem bloków danych źródłowych (Snapshot × Typ, i osobno Snapshot × Pozycja) dopisanych niżej w tym samym arkuszu; domyślnie Snapshot A = najnowszy (lewe kolumny), Snapshot B = drugi najnowszy (prawe kolumny) — najnowszy zawsze skrajnie z lewej, tak jak w tabeli ogólnej powyżej
- kolumna Δ zawsze liczy nowszy−starszy niezależnie od kolejności wyboru w dropdownach — pomocnicza komórka „Kolejność" (`IF(INDEX/MATCH dat...)`) ustala znak
- nagłówki kolumn A/B obu tabel to formuły `={dropdown}&"_koszt"` itd. — nazwa kolumny podąża za wybranym snapszotem zamiast statycznego „Koszt A"/„Koszt B"
- oba bloki danych źródłowych (Snapshot × Typ, Snapshot × Pozycja) mają teraz `row.hidden = true` — dane zasilają formuły `SUMIFS`, ale nie zaśmiecają widoku; `autoFilter` arkusza (jeden na cały arkusz — limit Excela) trafia na tabelę z największą liczbą wierszy (zwykle „Porównanie per pozycja")
- nad tabelą „Porównanie per typ" dodano wiersz legendy (scalone komórki A:M) — formuła nazywa aktualnie wybrany nowszy/starszy snapszot niezależnie od tego, który jest w dropdownie A/B, np. „Δ = v3 (nowszy) minus v2 (starszy) — dodatnia Δ = wzrost, ujemna = spadek"; dotyczy obu tabel (per typ i per pozycja), bo współdzielą te same dropdowny

### wytyczne
- eksport Excel — gdy tabela ma być sterowana wyborem użytkownika już w pliku (nie w UI aplikacji przed eksportem), użyj wzorca: blok danych źródłowych (surowe wartości per kombinacja kryteriów) + komórki z data validation (lista) + formuły `SUMIFS`/`INDEX`/`MATCH` odwołujące się do wyboru w tych komórkach
- eksport Excel — przy wielu tabelach porównujących snapszoty kolumnowo: najnowszy snapszot zawsze skrajnie z lewej, kolejne w prawo
- dopasowywanie tego samego obiektu (liścia budżetu) między wersjami — nie licz po `id` (nowe przy każdym klonie), tylko po stabilnym kluczu jak ścieżka nazw w hierarchii
- eksport Excel — bloki danych źródłowych (pomocnicze, zasilające formuły `SUMIFS`) ukrywaj wierszami (`row.hidden = true`), nigdy nie usuwaj — usunięcie zepsułoby formuły w tabelach widocznych, które się do nich odwołują
- eksport Excel — Excel dopuszcza tylko jeden `autoFilter` na arkusz; gdy arkusz ma wiele widocznych tabel, filtr dostaje ta z największą liczbą wierszy (priorytet, nie suma) — nie próbuj wymuszać filtra na każdej tabeli przez `autoFilter`, do tego trzeba by Tabel Excela (ListObject), które wymagają statycznego tekstu w nagłówku (nie formuły) — konflikt z żywymi nagłówkami „{snapshot}_metryka"

## 2026-07-03 — refactor(wbs): batch endpoint markerów WBS + usunięcie martwego eksportu PDF w WBSHybridTable

### architektura / API
- dodano `POST /schematics/wbs-node-markers/batch` — przyjmuje `{ wbsNodeIds: string[] }`, zwraca mapę `wbsNodeId → link[]` jednym zapytaniem; zastępuje N pojedynczych `GET /schematics/wbs-node-markers/:id` wywoływanych przez `WBSHybridTable` i `UnifiedWbsPanel` (drzewo 200 węzłów robiło 200 fetchy co 30s)
- usunięto martwy, nigdy nie wywoływany `handleExportPdf` z `WBSHybridTable.jsx` (inline HTML, bez escapowania, niezgodny z zasadą `wbsPdfExport.js`)

### słownik
- dodano `back-funkcja` `getMarkersForWbsNodesBatch` — `schematics.service.ts`, grupuje `wbsMarkerLink` po `wbsNodeId`
- dodano `ui-stan` `matReqsLoaded` — `WBSHybridTable.jsx`, blokuje auto-create karty materiałowej (`MaterialReqExpandPanel`) dopóki pierwszy fetch `material-requirements/node/:id` się nie zakończy (zapobiega ghost-requirements)

### wytyczne
- `MaterialReqExpandPanel` auto-create karty materiałowej — zawsze gate'ować flagą "dane rodzica załadowane", inaczej rozwinięcie panelu przed zakończeniem fetcha tworzy duplikat wymagania

## 2026-07-02 — feat(export-excel): kolumna „Rabat (%)" eksportowana tylko gdy niezerowa

### architektura / API
- `ui-funkcja` `appendBudgetSheet` (arkusz `Budżet` w eksporcie Analiza projektu do Excel) — kolumna `Rabat (%)` (`discount`) pomijana, gdy żadna pozycja nie ma rabatu ≠ 0; formuły `unitOfferPrice`/`offerPrice` warunkowo tracą czynnik `(1 − rabat)`

### wytyczne
- eksport Excel — kolumnę danych bez żadnej wartości ≠ 0 (jak `Rabat (%)`) pomijaj w arkuszu; formuły odwołujące się do tej kolumny muszą warunkowo pomijać jej czynnik

## 2026-07-02 — feat(export-excel): usunięcie metryki „Liczba wierszy" + filtry na wszystkich tabelach

### architektura / API
- `ui-funkcja` `handleExportBudgetExcel` (Analiza projektu do Excel) — usunięto metrykę „Liczba wierszy" z arkusza `Porównanie` oraz z bloku podsumowania w arkuszu `Podsumowanie`; skorygowano przesunięte referencje `numFmt` (B4–B11 → B3–B10)
- dodano `autoFilter` na arkuszu `Porównanie` (macierz wskaźników) i `Drzewo WBS` (filtr obejmuje nagłówek + dane, bez wiersza „Razem") — pozostałe arkusze danych (`Budżet`, `Q&A`, `Materiały (agregacja)`, `Materiały`, `Zamówienie (agregacja)`, WBS1–3, `Gałęzie grupujące`) miały filtr już wcześniej

### wytyczne
- eksport Excel — każdy arkusz z pojedynczą tabelą danych ma mieć `autoFilter` na wierszu nagłówka; arkusze z wieloma stosowanymi tabelami (`Podsumowanie`, `Cash flow`) pozostają bez filtra — Excel dopuszcza tylko jeden `autoFilter` na arkusz

## 2026-07-02 — feat(dashboard): kursy EUR/USD z NBP w nagłówku + formuły w kolumnie Koszt jedn. WBS

### architektura / API
- dodano moduł `back-modul` `ExchangeRatesModule` z `back-serwis` `ExchangeRatesService` — pobiera kursy NBP raz dziennie o północy (`@Cron EVERY_DAY_AT_MIDNIGHT`) + przy starcie, cache w pamięci dla EUR i USD
- dodano `back-endpoint` `GET /exchange-rates` — zwraca `{ EUR: {rate,date}, USD: {rate,date} }` do nagłówka Dashboardu
- przeniesiono logikę `back-funkcja` `fetchNbpRate` z `MaterialRequirementsService` do `ExchangeRatesService` (jedno źródło) — import ofert reużywa jej przez wstrzyknięty serwis, bez duplikacji
- `ui-sekcja` nagłówek Dashboardu: obok daty dodano kontener kursów NBP (ten sam rozmiar), prawy blok przycisków przesunięty do prawej krawędzi (`ml-auto`)

### słownik
- dodano `back-serwis` `exchange-rates-service`, `back-funkcja` `fetch-nbp-rate` / `exchange-rates-cron` / `exchange-rates-get`, `back-stala` `exchange-rates-cache`, `back-controller` `exchange-rates-controller`, `back-endpoint` `exchange-rates-endpoint`, `back-modul` `exchange-rates-module`
- dodano `ui-stan` `dashboard-exchange-rates`, `ui-sekcja` `dashboard-exchange-rates-box`

### wytyczne
- `back-funkcja` `fetchNbpRate` — jedyne źródło kursu NBP; każde nowe użycie kursu wstrzykuje `ExchangeRatesService`, nie kopiuje wywołania `api.nbp.pl`

---

## 2026-07-02 — fix(materials): 500 na PATCH z powodu duplikatów producenta + brakujący endpoint obrazu karty katalogowej

### architektura / API
- dodano `back-endpoint` `GET /materials/:id/image` — obraz produktu z katalogu (Material.imageUrl), analogicznie do `mat-req-get-image`
- rozszerzono `back-endpoint` `PATCH /materials/:id` i `POST /materials` o scalanie duplikatów: gdy znormalizowany `manufacturer`+`model` koliduje z unique constraint na istniejącym rekordzie, zamiast 500 scala oba materiały (`MaterialsService.mergeInto`) — przepina `MaterialRequirement.materialId`, `MaterialStock`, `WbsNodeMaterial`, usuwa duplikat

### słownik
- dodano `back-endpoint` `materials-get-image` — GET /materials/:id/image
- dodano `back-funkcja` `materials-get-image-stream` — strumień obrazu materiału z uploads
- dodano `back-funkcja` `materials-resolve-upload-path` — rozwiązanie ścieżki pliku (legacy absolutna vs relatywna)
- dodano `back-funkcja` `materials-merge-into` — scalanie duplikatu materiału w istniejący rekord

### wytyczne
- `back-funkcja` `normalizeManufacturer` — MUSI być używana przy KAŻDYM zapisie `Material.manufacturer` (create/update/import z karty katalogowej/AI). Przed tą poprawką część ścieżek zapisu robiła surowe `.toUpperCase()` całego stringa, co tworzyło w bazie duplikaty tego samego producenta w różnych formatach (np. `SCHNEIDER` / `SCHNEIDER ELECTRIC` / `Schneider`) i łamało cross-filtering w `ProductCard` oraz powodowało 500 na `PATCH /materials/:id` przy kolizji unique constraint `(manufacturer, model)`
- `ui-funkcja` `getFilteredSuggestions` (WbsMaterialsPanel.jsx, ProductCard) — filtruj sugestie TYLKO po polach nadrzędnych w hierarchii manufacturer → model → productName (patrz `AC_UPSTREAM`), nigdy po polach podrzędnych — inaczej nieaktualna wartość w polu "w dół" hierarchii błędnie blokuje sugestie w polu "w górę"
- `ui-funkcja` `handlePatchMaterial`/`handlePatchField` (MaterialDatabaseTab.jsx) — zawsze sprawdzaj `res.ok` po PATCH przed aktualizacją lokalnego stanu; optymistyczny update bez sprawdzenia statusu maskuje realne błędy zapisu

## 2026-07-01 — feat(offers): przypisanie cen ofertowych w ProductCard + parsowanie Excel

### schema.prisma
- dodano pole `schema-pole` `offerId String?` w modelu `MaterialRequirement` — FK do Offer (nullable)
- dodano pole `schema-pole` `offerPositionIdx Int?` w modelu `MaterialRequirement` — indeks pozycji w Offer.positions[]
- dodano pole `schema-pole` `offerPositionSnapshot String?` w modelu `MaterialRequirement` — JSON snapshot {lp, name, priceNetto, unit, wbsPath}

### architektura / API
- dodano `back-endpoint` `PATCH /material-requirements/:id/offer` — przypisuje pozycję oferty do wymagania
- dodano `back-endpoint` `DELETE /material-requirements/:id/offer` — usuwa przypisanie, przywraca ręczną edycję ceny
- dodano `back-endpoint` `POST /offers/:id/auto-assign` — bulk matchowanie po wbsPath i name, przypisuje ceny do MaterialRequirements
- rozszerzono `back-endpoint` `POST /material-requirements/parse-offer` o obsługę plików xlsx/xls: wykrywa arkusz "Materiały" (nasz eksport) lub "Zamówienie (agregacja)", parsuje bezpośrednio bez AI; nieznany format fallback do AI przez CSV

### słownik
- dodano `schema-pole` `offerId` — FK do Offer w MaterialRequirement
- dodano `schema-pole` `offerPositionIdx` — indeks pozycji oferty
- dodano `schema-pole` `offerPositionSnapshot` — snapshot JSON ceny z oferty
- dodano `back-endpoint` `offers-post-auto-assign` — auto-assign po wbsPath
- dodano `back-endpoint` `mat-req-patch-offer` — przypisanie pozycji oferty
- dodano `back-endpoint` `mat-req-delete-offer` — usunięcie przypisania

### wytyczne
- `schema-pole` `offerPositionSnapshot` — jest warstwą nadpisującą `budgetedPriceNetto`; gdy ustawiony, frontend pokazuje cenę z snapshotu (locked); usunięcie przypisania nie zeruje `budgetedPriceNetto`
- `back-endpoint` `auto-assign` — nie nadpisuje już przypisanych pozycji (warunek `offerId: null`); matchuje po `name` (insensitive) w obrębie tego samego `nodeId`

---

## 2026-06-30 — fix(backend): MS To Do sync — TaskReminder, push IGNITE→Graph, fix echo konfliktów (v2026.06.30.630)

### architektura / API
- dodano `back-funkcja` `UserTasksService.syncReminderForTask` — tworzy/aktualizuje/usuwa `TaskReminder` wg `plannedEnd`; brak konkretnej godziny (00:00) → alarm o `SystemNotificationSettings.defaultReminderHour`; wołane z `UserTasksService.create`, `UserTasksService.update` (gdy zmienia się `plannedEnd`) oraz z `TaskSyncService.processDeltaTasks` (obie ścieżki: nowy task z MS i "MS wygrywa" update) — wcześniej `TaskReminder` nie był nigdzie tworzony, więc cały system alertów (cron `dispatchReminders`) był martwy mimo gotowego UI
- dodano `back-funkcja` `UserTasksService.pushNewTaskToGraph` + `UserTasksService.resolveIgniteListId` — nowe zadanie utworzone w IGNITE jest teraz pushowane do MS Graph (find-or-create listy "Ignite" w MS To Do), zapisuje `msToDoId`/`msListId`/`msListName`/`msEtag`/`msLastModified` na utworzonym `UserTask`; best-effort, błędy nie blokują tworzenia zadania lokalnie
- dodano `back-funkcja` `UserTasksService.pushUpdateToGraph` — `UserTasksService.update` pushuje zmiany `title`/`status`/`plannedEnd` do Graph gdy zadanie ma już `msToDoId`+`msListId`
- `UserTasksService.softDelete` — gdy zadanie ma `msToDoId`+`msListId`, oznacza je jako `completed` w MS Graph (symetria z lokalnym soft-delete)
- dodano `back-funkcja` `MsTodoService.createList` — POST `/me/todo/lists`, używane przez find-or-create listy "Ignite"
- naprawiono `back-funkcja` `TaskSyncService.processDeltaTasks` — porównanie konfliktu zmienione z `msLastModified > existing.updatedAt` na `msLastModified > existing.msLastModified`; `updatedAt` jest bumpowane przez Prisma `@updatedAt` przy KAŻDYM `.update()`, w tym przez sam silnik sync, co dawało fałszywe "DB wygrywa" i zbędne pushe do Graph przy każdym resyncu ("echo")

### wytyczne
- `back-funkcja` `UserTasksService.syncReminderForTask` — wołać zawsze po każdej zmianie `plannedEnd` zadania (create/update/sync z MS), inaczej `TaskReminder` rozjeżdża się z faktycznym terminem
- `schema-pole` `UserTask.updatedAt` — NIE używać jako wskaźnika "ostatnia zmiana ze strony MS" w logice konfliktów; do tego służy `UserTask.msLastModified`, bo `updatedAt` bumpuje też sam silnik sync

---

## 2026-06-30 — feat(ui): MS To Do connection panel w NotificationSettingsPage (Etap 10) (v2026.06.30.629)

### architektura / API
- dodano `ui-sekcja` MS To Do connection panel w `NotificationSettingsPage` — status połączenia (connected/email/needsReauth), last sync time + error, przyciski: Połącz, Połącz ponownie (gdy needsReauth), Wymuś sync, Rozłącz
- sekcja pobiera `GET /ms-todo/status` przy montowaniu; Connect → redirect na `GET /onedrive/auth-url`; Disconnect → `DELETE /ms-todo/disconnect`; Resync → `POST /ms-todo/resync`

### wytyczne
- `ui-sekcja` `ms-todo-connection-panel` — po ponownym podłączeniu konta (`handleCallback` w OneDriveService) trzeba wywołać `MsTodoService.clearNeedsReauth(userId)` — zaimplementowane, ale callback jest w `/onedrive/callback` i automatycznie reset

---

## 2026-06-30 — feat(sw): Web Push REMINDER — action buttons snooze, SW delegate do okna (Etap 9) (v2026.06.30.628)

### architektura / API
- rozszerzono `back-funkcja` `PushService.sendToUser` o `extra?: Record<string, any>` — dodatkowe pola w payload JSON (używane dla `type: 'REMINDER'`, `reminderId`)
- `NotificationCronService.dispatchReminders` teraz przesyła `{ type: 'REMINDER', reminderId }` w payloadzie push
- `apps/frontend/src/sw.js` — `push` handler: REMINDER pokazuje 3 action buttons (snooze-10, snooze-30, dismiss); `notificationclick` deleguje akcję do okna przez `postMessage`
- `App.jsx` — listener SW `SNOOZE_REMINDER` / `DISMISS_REMINDER` → PATCH `/my-tasks/reminders/:id` + emit `reminder-handled` CustomEvent
- `DashboardPage` — listener `reminder-handled` usuwa reminder z lokalnego stanu toast

### wytyczne
- `back-serwis` `PushService.sendToUser` — parametr `extra` mergowany bezpośrednio do JSON payload; kolizja kluczy z `title`/`body`/`orderId` jest cichym nadpisaniem — używaj tylko unikalnych kluczy (`type`, `reminderId`)
- SW nie ma dostępu do JWT — akcje snooze/dismiss delegowane przez `postMessage` do okna aplikacji (App.jsx) które ma token w sessionStorage

---

## 2026-06-30 — feat(ui): taskListSlug w NodeInfoTab — auto-slugify + walidacja unikalności (Etap 8) (v2026.06.30.627)

### architektura / API
- dodano `back-endpoint` `GET /process-tree/slug-check?slug=&excludeNodeId=` — sprawdza czy slug jest wolny (excludeNodeId dla edycji własnego sluga)
- rozszerzono `back-dto` `UpdateNodeDto` o `taskListSlug?: string | null`
- rozszerzono `back-funkcja` `getNodeInfo` select o `taskListSlug`
- dodano sekcję "Integracja zadań (MS To Do)" w `NodeInfoTab` — input auto-slugify + debounce 400ms + status wolny/zajęty/sprawdzam

### wytyczne
- `ui-input` `taskListSlug` — wartość zawsze auto-slugified (lowercase, hyphens, strip diacritics); przesyłana jako `null` gdy puste (a nie empty string) przez `|| null` w PATCH body

---

## 2026-06-30 — feat(ui): TaskReminderToast + endpointy alertów (Etap 7) (v2026.06.30.626)

### architektura / API
- dodano `back-endpoint` `GET /my-tasks/reminders/due` — alerty z `remindAt <= now` i `sentAt=null` dla usera
- dodano `back-endpoint` `PATCH /my-tasks/reminders/:id` — action: dismiss (sentAt=now) lub snooze (nowy remindAt, snoozedFrom=stary)
- dodano `ui-modal` `TaskReminderToast` (`apps/frontend/src/components/shared/TaskReminderToast.jsx`) — toast po lewej pod ikoną kalendarza; snooze 10/30/60 min lub dismiss
- dodano `ui-stan` `dashboard-due-reminders` w `DashboardPage` — polling co 60s, usuwanie po dismiss

### wytyczne
- `back-endpoint` `GET /my-tasks/reminders/due` — filtr: `userTask.status=OPEN`, `deletedAt=null`; nie zwraca przypomnień dla usuniętych zadań
- `ui-modal` `TaskReminderToast` — wyświetla tylko pierwsze przypomnienie z listy; reszta sygnalizowana licznikiem (+N); użytkownik rozpatruje po kolei

---

## 2026-06-30 — feat(ui): MyTasksModal — modal zadań osobistych kliknięciem kalendarza (Etap 6) (v2026.06.30.625)

### architektura / API
- dodano `ui-modal` `MyTasksModal` (`apps/frontend/src/components/shared/MyTasksModal.jsx`) — szkło-morfizm, karty zadań OPEN sortowane plannedEnd ASC, oznaczanie jako DONE jednym kliknięciem
- dodano `ui-stan` `dashboard-my-tasks-open` w `DashboardPage` — otwiera modal kliknięciem kontenera kalendarza (lewy górny róg headera)

### wytyczne
- `ui-modal` `MyTasksModal` — backdrop kliknięcie zamyka modal; kliknięcie na kartę zadania nie zamyka
- `ui-modal` `MyTasksModal` — fetch `GET /my-tasks` przy każdym otwarciu modalu; brak cache — zawsze świeże dane

---

## 2026-06-30 — feat(tasks): cron sync + logika sync dwukierunkowa (Etap 4+5) (v2026.06.30.624)

### architektura / API
- dodano `back-modul` `UserTasksModule` (`apps/backend/src/user-tasks/`) — CRUD zadań osobistych + logika sync
- dodano `back-serwis` `UserTasksService` — listForUser (OPEN, sorted plannedEnd ASC), create, update, softDelete, cleanupTrash
- dodano `back-serwis` `TaskSyncService` — syncSingleUser (delta per-lista jako JSON w deltaLink), processDeltaTasks, resolveNodeId (hashtag > slugified listName), pushTaskToGraph (best-effort)
- dodano `back-endpoint` `GET /my-tasks` — lista OPEN zadań usera (sortowane plannedEnd ASC, null na końcu)
- dodano `back-endpoint` `POST /my-tasks` — utwórz zadanie (source=IGNITE)
- dodano `back-endpoint` `PATCH /my-tasks/:id` — edytuj zadanie
- dodano `back-endpoint` `DELETE /my-tasks/:id` — soft delete
- dodano `back-modul` `NotificationCronModule` — 3 cron-joby: `*/5 * * * *` sync MS To Do, co minutę dispatch reminder push, `0 3 * * *` czyść kosz

### wytyczne
- `back-serwis` `TaskSyncService.resolveNodeId` — hashtag `#slug` w tytule zadania wygrywa nad slugified nazwą listy; diacrityki normalizowane przez NFD + strip combining marks
- `back-serwis` `TaskSyncService.pushTaskToGraph` — best-effort (błąd logowany jako `warn`, nie przerywa sync)
- `back-serwis` `MsTodoSyncState.deltaLink` — przechowuje JSON `{ listId: deltaLink }` dla inkrementalnego delta per-lista; nie jest to jeden globalny deltaLink
- `back-serwis` `NotificationCronService.syncRunning` — mutex-flaga blokuje równoległe uruchomienie sync jeśli poprzedni cron jeszcze trwa

---

## 2026-06-30 — feat(ms-todo): MS Graph / To Do service — MsTodoModule, needsReauth, Tasks.ReadWrite scope (v2026.06.30.623)

### schema.prisma
- dodano pole `schema-pole` `UserMsToken.needsReauth Boolean @default(false)` — flaga wymuszająca reauth po dodaniu scope `Tasks.ReadWrite`; istniejące tokeny migracja ustawia na `true`

### architektura / API
- dodano `back-modul` `MsTodoModule` (`apps/backend/src/ms-todo/`) — wrappery Graph API: `fetchLists`, `fetchTasksDelta`, `createTask`, `updateTask`, `deleteTask`; importuje `OneDriveModule` dla `getValidToken`
- dodano `back-endpoint` `GET /ms-todo/status` — { connected, needsReauth, lastSyncAt, lastSyncError }
- dodano `back-endpoint` `GET /ms-todo/lists` — lista list MS To Do (debug / mapowanie slugów)
- dodano `back-endpoint` `DELETE /ms-todo/disconnect` — usuwa UserMsToken + MsTodoSyncState
- dodano `back-endpoint` `POST /ms-todo/resync` — placeholder, właściwa logika w Etap 5
- rozszerzono `back-stala` `SCOPES` w `OneDriveService` o `Tasks.ReadWrite`

### wytyczne
- `back-serwis` `MsTodoService.handleGraphError` — 401/403 z Graph API → `needsReauth=true` + `UnauthorizedException`; nie rzucaj surowego błędu axios na zewnątrz
- `schema-pole` `UserMsToken.needsReauth` — czyszczone przez `clearNeedsReauth(userId)` po pomyślnym OAuth callback; produkcja: wywołaj w `OneDriveService.handleCallback` po upsert tokenu

---

## 2026-06-30 — feat(tasks): schema zadań osobistych — UserTask, TaskReminder, MsTodoSyncState, taskListSlug (v2026.06.30.622)

### schema.prisma
- dodano model `UserTask` — zadanie osobiste usera (sync MS To Do); pola: `userId`, `nodeId?`, `title`, `status` (OPEN/DONE), `plannedStart?`, `plannedEnd?`, `msToDoId?` (unique), `msListId?`, `msListName?`, `msEtag?`, `msLastModified?`, `source` (IGNITE/MS_TODO), `deletedAt?` (soft delete)
- dodano model `TaskReminder` — alarm do zadania: `userTaskId` (FK cascade), `userId`, `remindAt`, `sentAt?`, `snoozedFrom?`
- dodano model `MsTodoSyncState` — stan sync per user: `deltaLink?`, `msTodoSyncStartedAt?`, `lastSyncAt?`, `lastSyncError?`
- dodano pole `schema-pole` `ProcessNode.taskListSlug String? @unique` — slug do auto-pinningu zadań z MS To Do
- dodano relacje `User.userTasks[]`, `User.msTodoSyncState?`

### wytyczne
- `schema-pole` `ProcessNode.taskListSlug` — globalnie unikalne (nullable = wiele NULLi OK); edycja per-węzeł w panelu węzła (Etap 8); auto-pinning: hashtag w tytule zadania `#slug` > nazwa listy MS To Do slugified
- `schema-pole` `UserTask.source` — wartości: `IGNITE` (utworzone w Ignite) lub `MS_TODO` (zaimportowane z Graph)
- `schema-model` `TaskReminder.userId` — denormalizowane pole (brak FK do `users`), tylko do szybkiego query crona bez joinów
- `schema-model` `UserTask.deletedAt` — soft delete; kosz 30 dni czyszczony przez cron (retencja z `SystemNotificationSettings.trashRetentionDays`)

---

## 2026-06-30 — feat(notifications): backend ustawień powiadomień — SystemNotificationSettings + moduł NestJS (v2026.06.30.621)

### schema.prisma
- dodano model `SystemNotificationSettings` — singleton (id="singleton") z polami: `schema-pole` `defaultReminderHour Int`, `snoozePresetsMinutes Json`, `trashRetentionDays Int`, `msTodoSyncIntervalMinutes Int`, `msTodoEnabled Boolean`, `webPushEnabled Boolean`

### architektura / API
- dodano `back-modul` `NotificationSettingsModule` (Global) z `back-serwis` `NotificationSettingsService` i `back-controller` `NotificationSettingsController`
- dodano `back-endpoint` `GET /notification-settings` — zwraca ustawienia + diagnostykę (vapidConfigured, msGraphConfigured, webPushSubscriptions, msConnectedUsers, pendingReminders)
- dodano `back-endpoint` `PATCH /notification-settings` — upsert ustawień
- dodano `back-endpoint` `POST /notification-settings/test-push` — wysyła Web Push do bieżącego admina przez PushService
- podpięto `ui-widok` `NotificationSettingsPage` do realnego API (zastąpiono placeholdery fetchSettings/handleSave/handleTestPush)

### słownik
- dodano `notif-settings-module` — GlobalModule NotificationSettings
- dodano `notif-settings-controller` — kontroler ADMIN GET/PATCH/POST test-push
- dodano `notif-settings-service` — serwis getOrCreate/get/update/getStats
- dodano `system-notification-settings` — model Prisma (singleton)
- dodano `notif-settings-fetch` — fetchSettings w NotificationSettingsPage (teraz GET /notification-settings)
- dodano `notif-settings-handle-save` — handleSave (teraz PATCH /notification-settings)
- dodano `notif-settings-handle-test-push` — handleTestPush (teraz POST /notification-settings/test-push)

### wytyczne
- `schema-model` `SystemNotificationSettings` — singleton id="singleton", wzorzec jak SmtpSettings i Company; `back-serwis` `NotificationSettingsService.getOrCreate()` tworzy wiersz przy pierwszym odczycie

---

## 2026-06-30 — feat(notifications): panel admin powiadomień (Web Push + MS To Do) — szkielet UI

### architektura / API
- dodano `ui-widok` `NotificationSettingsPage` (`/notifications`, admin-only) — globalne ustawienia powiadomień Ignite: status VAPID/Web Push, sync z Microsoft To Do (Samsung Reminder), domyślne ustawienia alarmów (godzina, retencja kosza, snooze presets), info o auto-pinningu po slug węzła. Szkielet UI bez backendu — diagnostyka czyta `GET /push/public-key`, zapis ustawień to placeholder do podłączenia w kolejnej iteracji
- dodano `ui-przycisk` `sidebar-notifications-button` — kafelek "Powiadomienia" w DynamicSidebar pod "Poczta SMTP", widoczny tylko dla admina
- dodano route `/notifications` w `App.jsx`

### słownik
- dodano `sidebar-notifications-button` — kafelek admin w sidebarze pod SMTP
- dodano `notification-settings-page` — panel admin powiadomień
- dodano `notification-settings-form` — stan formularza (defaultReminderHour, snoozePresetsMinutes, trashRetentionDays, msTodoSyncIntervalMinutes, msTodoEnabled, webPushEnabled)
- dodano `notification-settings-diagnostics` — stan read-only (vapidConfigured, webPushSubscriptions, msGraphConfigured, msConnectedUsers, pendingReminders)
- dodano `notification-status-row`, `notification-switch` — helpery UI

### wytyczne
- `ui-widok` `NotificationSettingsPage` — szkielet wyłącznie frontend, zapis ustawień jeszcze nie podłączony do backendu. Po akceptacji UI dorobimy `back-modul` `NotificationSettingsModule` z modelem `SystemNotificationSettings` (singleton, analogicznie do `SmtpSettings`) i endpointami `GET/PATCH /notification-settings` + ewentualnie `POST /notification-settings/test-push`
- `ui-widok` `NotificationSettingsPage` — sluggi węzłów (`ProcessNode.taskListSlug`) świadomie NIE są edytowalne z tego panelu — edycja per-węzeł w Zarządzaniu Drzewem; panel pokazuje tylko zasadę działania (auto-pinning po slugu listy MS To Do oraz `#slug` w tytule)

---

## 2026-06-25 — fix(productcard): availability persists + Wybierz odświeża pola

### schema.prisma
- dodano pole `availabilityString?` w modelu `MaterialRequirement` — dostępność wpisana w ProductCard zapisywana bezpośrednio na wymaganiu (niezależnie od propozycji)

### słownik
- dodano `mat-req-availability` — `MaterialRequirement.availability`, schema.prisma

### wytyczne
- `schema-pole` `MaterialRequirement.availability` — pole transient (czas dostawy), nie jest kopią z `Material`; zapisywane bezpośrednio na wymaganiu (a nie tylko na wybranej propozycji), żeby przetrwać brak zaznaczonej propozycji

---

## 2026-06-16 — feat(mail): konfiguracja SMTP w panelu + eksporty „wyślij mailem / pobierz" z podpowiedziami adresów

### schema.prisma
- dodano `schema-model` `SmtpSettings` (singleton `id="singleton"`, `@@map("smtp_settings")`) — konfiguracja serwera poczty wychodzącej z panelu admina. Pola `schema-pole`: `host`, `port` (Int? @default 587), `secure` (Bool), `username`, `password`, `fromEmail`, `fromName`, `replyTo`, `updatedAt`. Źródło prawdy dla wysyłki maili (fallback do env `SMTP_*`).

### architektura / API
- dodano `back-modul` `SmtpModule` (Global) + `back-serwis` `SmtpService` (transport nodemailer z DB, fallback env) + `back-controller` `SmtpController`:
  - `back-endpoint` `GET /smtp` (ADMIN) — zwraca ustawienia BEZ hasła (`hasPassword: bool`)
  - `back-endpoint` `PATCH /smtp` (ADMIN) — upsert; puste `password` zachowuje istniejące
  - `back-endpoint` `POST /smtp/test` (ADMIN) — wysyłka testowa
- aktywowano `back-modul` `MailModule` (wcześniej nieimportowany — martwy kod); `back-serwis` `MailService` wysyła przez `SmtpService` zamiast env `MailerModule`:
  - `back-endpoint` `POST /mail/send-export` (multipart, multer) — wysyła przesłany plik jako załącznik maila
  - `back-endpoint` `GET /mail/recipients/:nodeId` — zagregowane adresy: owner, uprawnieni (użytkownicy+zespoły), kontakt klienta (`OrderRequirements`), lokalizacja (`Site`), firma (`Company`), aktywny zespół
- dodano `back-modul` `PdfModule` + `back-serwis` `PdfService` (Puppeteer/Chromium) + `back-endpoint` `POST /pdf/render` — HTML→PDF tym samym silnikiem co druk przeglądarki

### zmiana układu eksportu PDF
- wszystkie eksporty (Oferta/Budżet/Wymagania/Pełny projekt/Materiały/Q&A/Excel/dokumenty) przechodzą przez `ui-modal` `ExportChoiceModal` — wybór „Pobierz na urządzenie / Wyślij mailem" + `ui-input` `RecipientInput` z podpowiedziami adresów. Raporty-wydruki HTML renderowane do PDF przez `POST /pdf/render` (identyczny plik dla pobrania i maila); generatory zwracają artefakt (`{blob}`/`{html}`) zamiast pobierać/drukować bezpośrednio.
- infra: Chromium (apk) dodany do `back-skrypt` `Dockerfile`/`Dockerfile.dev` backendu (+ `PUPPETEER_*` env); `mem_limit` backendu 512m→1g.

### wytyczne
- `schema-pole` `SmtpSettings.password` — write-only: `GET /smtp` nigdy nie zwraca hasła (tylko `hasPassword`), a puste pole przy `PATCH` zachowuje dotychczasowe.
- `back-serwis` `SmtpService.buildTransport` — jedyne źródło transportu maili w aplikacji; DB ma priorytet, env to fallback.
- `ui-funkcja` `resolveArtifact` (`exportMail.js`) — normalizuje wynik generatora eksportu: `{html}` renderuje na PDF przez backend (po `inlineImages`), `{blob}` zwraca wprost. Każdy nowy przycisk eksportu ma zwracać artefakt i przechodzić przez `ExportChoiceModal`, nie pobierać/drukować samodzielnie.
- `back-serwis` `PdfService.render` — świeża instancja Chromium na render (sporadyczne eksporty); NIE używać flagi `--single-process` (wywala `page.pdf()` → TargetCloseError). Puppeteer ładowany przez natywny dynamiczny `import()` (ESM-only; Node 18 na prod nie wspiera `require()` ESM → ERR_REQUIRE_ESM). Raporty HTML zależą od backendu (eksport tych raportów nie działa offline).

---

## 2026-06-15 — fix(wbs): jednostka węzła nie resetuje się sama przy edycji ilości / przeładowaniu

### architektura / API
- zmieniono `back-endpoint` `PATCH /wbs-nodes/:id/budget` (`back-serwis` `updateBudgetFields`) — z pełnego replace na **partial merge**: pola nieprzysłane przez callera (`unit`, `unitCost`, `margin`, `discount`, `unitPrice`, `comment`, `phase`, `budgetType`) są czytane z istniejącego wiersza zamiast zerowane/defaultowane. Usunięto `unit: data.unit || 'sztuki'`, które przy zapisie samej ilości resetowało jednostkę na 'sztuki'.

### wytyczne
- `back-serwis` `updateBudgetFields` — endpoint jest teraz odporny na zapisy częściowe: bez pól cenowych (np. sama `quantity`) zachowuje istniejące ceny i tylko przeskalowuje totale; pola cenowe przeliczane 1:1 jak wcześniej tylko gdy przysłane. Nie trzeba już wysyłać kompletu pól.
- `ui-funkcja` `refreshWbsNodes` — nie nadpisuje pola węzła, którego PATCH jest w toku (`pendingFieldSaves` Map<nodeId,Set<field>> rejestrowana w `updateNodeField`); zapobiega cofaniu świeżo wybranej jednostki przez focus/visibilitychange/expand-refresh ścigający się z zapisem.

---

## 2026-06-11 — fix(materials): forward availability/productUrl do propozycji; dedup katalogu z proposals

### architektura / API
- zmieniono `back-endpoint` `GET /materials` — usunięto propozycje z listy sugestii (tylko tabela `materials`); dodano dedup po `manufacturer|model`
- zmieniono `back-endpoint` `PATCH /material-requirements/:id` — gdy brak manufacturer+model: availability, productUrl, seller, priceNetto, dataSheetUrl, complianceUrl forward do wybranej propozycji i powiązanego materiału

---

## 2026-06-11 — fix(materials): Krok 7b — auto-upsert Material+Proposal przy wypełnieniu producent+model w ProductCard

### architektura / API
- zmieniono `back-endpoint` `PATCH /material-requirements/:id` — gdy dto zawiera `manufacturer` i `model`: auto-upsert `Material`, twórz/aktualizuj wybraną `ProductProposal` (isManual=true, isSelected=true), ustaw `materialRequirement.materialId`

### wytyczne
- `back-serwis` `MaterialRequirementsService.update()` — Krok 7b: warunek auto-upsert to `manufacturer && model` OBOJE niepuste; samo manufacturer bez model nie tworzy propozycji
- `ui-funkcja` `onBlur`/`onKeyDown` combo w `ProductCard` — przy Enter i blur wysyłamy WSZYSTKIE aktualnie wypełnione pola katalogowe razem (nie jedno po jednym), żeby backend widział pary manufacturer+model

---

## 2026-06-11 — feat(materials): nowy moduł MaterialsModule + aktualizacja frontendu (Kroki 6–8)

### architektura / API
- dodano `back-modul` `MaterialsModule` (`apps/backend/src/materials/`) — osobny moduł NestJS dla katalogu materiałów, niezależny od `MaterialRequirementsModule`
- dodano `back-endpoint` `GET /materials` — katalog + propozycje ręczne/AI (zastępuje `/material-requirements/all-materials`)
- dodano `back-endpoint` `GET /materials/database` — materiały z kartą katalogową
- dodano `back-endpoint` `POST /materials/from-datasheet` — upsert z karty katalogowej (zastępuje `/material-requirements/save-datasheet-items`)
- dodano endpointy CRUD `/materials`, `/materials/:id/stock`, `/materials/:id/proposals`
- `ui-funkcja` `fetchMaterialDb` (WbsMaterialsPanel) — zmieniono endpoint z `/material-requirements/all-materials` → `/materials` (Krok 7e)
- `ui-zakladka` `MaterialDatabaseTab` — zmieniono endpoint z `/material-requirements/database` → `/materials` i `/material-requirements/save-datasheet-items` → `/materials/from-datasheet` (Krok 8)

---

## 2026-06-11 — refactor(materials): fix TypeScript po migracji — serwisy backendowe (Krok 5)

### architektura / API
- `back-serwis` `MaterialRequirementsService`: przepisano `findAllWithOffers`, `findDatasheetItems`, `findAllDatasheetItems`, `findGlobalDatabase`, `findMaterialUsage`, `findAllMaterials`, `findAllByNode`, `createNewVersion` — usunięto referencje do skasowanych pól katalogowych; zapytania przełączone na tabelę `materials`
- `back-serwis` `VersioningService`: usunięto kopiowanie pól katalogowych przy klonowaniu `MaterialRequirement`; `materialId` zachowywane (FK do `Material`, nie self-ref)
- brak błędów `tsc --noEmit`, backend startuje na porcie 3000

---

## 2026-06-11 — refactor(materials): rozdzielenie material_requirements → materials + material_stock (Kroki 10 + 1-4)

### schema.prisma
- dodano model `schema-model` `Material` (`@@map("materials")`) — baza katalogowa zaakceptowanych produktów; `@@unique([manufacturer, model])` (dwa partial indeksy dla obsługi NULL model)
- dodano model `schema-model` `MaterialStock` (`@@map("material_stock")`) — stan magazynowy produktów; relacja N:1 do Material
- usunięto z `MaterialRequirement` pola katalogowe: `productName`, `manufacturer`, `model`, `stockStatus`, `dataSheetUrl/Name`, `complianceUrl/Name`, `seller`, `offerNumber`, `availability`, `productUrl`, `imageUrl`
- przemianowano `schema-pole` `MaterialRequirement.priceNetto` → `budgetedPriceNetto` — cena zabudżetowana do kalkulacji kosztów WBS (nie jest ceną referencyjną produktu)
- zmieniono `schema-pole` `MaterialRequirement.materialId` — FK ze samoreferencji (`material_requirements.id`) na `materials.id`
- usunięto relację `MaterialRequirement.requirements` (samoreferencja) i `MaterialRequirement.wbsAllocations`
- zmieniono `schema-relacja` `WbsNodeMaterial.material` — FK z `MaterialRequirement` → `Material`
- dodano w `ProcessNode` relacje zwrotne: `materialDataSheets Material[] @relation("MaterialDataSheet")` i `materialCompliances Material[] @relation("MaterialCompliance")`

### architektura / API
- `back-funkcja` `resolveUploadPath()` — helper w MaterialRequirementsService; obsługuje oba formaty ścieżek pliku: absolutna Docker (`/usr/src/app/uploads/...`) i relatywna (`{uuid}.pdf`)
- naprawiono `uploadFile()` i `uploadImage()` — zapisują teraz relatywną nazwę pliku (`fileName`) zamiast absolutnej ścieżki Docker (`filePath`)
- naprawiono `saveDatasheetItems()` — `dataSheetUrl = doc.storagePath` (relatywna) zamiast `path.join(UPLOADS_DIR, storagePath)` (absolutna)
- naprawiono `getDatasheetStream()`, `getComplianceStream()`, `getImageStream()` — używają `resolveUploadPath()` (obsługa legacy absolutnych ścieżek)
- naprawiono `isDatasheetFile()` w `MaterialDatabaseTab.jsx` — primary filter `documentCategory === 'datasheet'`, fallback na nazwę pliku
- SQL migracja dev (`test/migration-materials-refactor.sql`): CREATE TABLE materials/material_stock, INSERT 203 wierszy katalogowych, DROP kolumn katalogowych z material_requirements, RENAME priceNetto→budgetedPriceNetto, przepięcie FK w wbs_node_materials

### słownik
- dodano `Material` — nowy model bazy katalogowej produktów (przeniesiony z material_requirements)
- dodano `MaterialStock` — stan magazynowy na produkt
- dodano `resolveUploadPath` — helper obsługi ścieżek plików (legacy abs + nowa relatywna)
- zmieniono `MaterialRequirement.materialId` — teraz FK do `materials.id` (nie samoreferencja)
- zmieniono `MaterialRequirement.priceNetto` → `budgetedPriceNetto`
- usunięto z MaterialRequirement: `productName`, `manufacturer`, `model`, `stockStatus`, `dataSheetUrl`, `dataSheetName`, `complianceUrl`, `complianceName`, `seller`, `offerNumber`, `availability`, `productUrl`, `imageUrl`
- usunięto relacje: `MaterialRequirement.requirements`, `MaterialRequirement.wbsAllocations`

### wytyczne
- `schema-model` `Material.dataSheetUrl` — pole legacy na czas migracji; docelowo serwować przez `GET /documents/download/:dataSheetDocumentId`; `resolveUploadPath()` obsługuje oba formaty przy streamowaniu
- `schema-pole` `MaterialRequirement.budgetedPriceNetto` — cena zabudżetowana wymagania (niezależna od `Material.priceNetto`); to ją propagować do `WbsNode.unitCost` w logice kosztów WBS
- `schema-relacja` `WbsNodeMaterial.material` → `Material` — przy migracji usunięto 349 wierszy wbs_node_materials bez odpowiednika w materials (wymagania bez przypisanego produktu) i 11 duplikatów

## 2026-06-11 — fix(contacts) + feat(excel): usuwanie kontaktu po wyczyszczeniu, VAT/brutto w WBS3, kwota słownie

### architektura / API
- `ui-funkcja` `selectUserForContact` — naprawiono stale closure: `handleSave` wywoływana z jawnym `overrideContacts` zamiast przez timeout z zamkniętą closurą; `??` zamiast `||` przy phone/company (null z bazy nie nadpisuje już pustego pola)
- `ui-funkcja` `handleContactNameChange` — wyczyszczenie pola "Imię i Nazwisko" usuwa cały kontakt z listy i zapisuje
- zmiana układu eksportu Excel "Eksport tabel oferty" (WBS3 Szczegóły): 5 kolumn → 8; dodano F=VAT 23%, G=Wartość brutto, H=Kwota podatku VAT
- arkusz "Podsumowanie" w eksporcie tabel oferty: nowy wiersz "Kwota słownie (netto)" pod sumą

### słownik
- dodano `kwota-slownie` — helper konwertujący kwotę PLN na tekst słowny po polsku (do milionów, właściwa odmiana)

## 2026-06-09 — Eager versioning: wersja „pierwszy" od startu + migracja baseline→pierwszy

### architektura / API
- `back-serwis` `ProcessTreeService.create` — każde nowe zamówienie (ORDER) rodzi się z realną `ProjectVersion` o etykiecie `pierwszy` (aktywną); startowe węzły WBS i subtaski idą na jej `versionId`, nie na baseline `null`. Wcześniej dane startowe leżały na `versionId=null`, a UI pokazywał fantomową „pierwszy" (fallback `|| 'pierwszy'`) — utworzenie pierwszej wersji wyglądało jak ZMIANA NAZWY istniejącej zamiast dodania drugiej.
- `back-funkcja` `resolveVersionId` (`common/version.util.ts`) — nowy resolver: zapytania bez `versionId` rozwiązują się do AKTYWNEJ wersji węzła (fallback do `null` gdy brak aktywnej). Wpięty w `WbsNodesService` (getTree, getUnifiedTree, getNodeMap, saveTree, createNode), `MaterialRequirementsService` (findAllByNode, extractFromDocuments) i `SubtasksService` (findAllByNode, batchUpsert). Bez tego po migracji wywołania bez `versionId` czytałyby pusty baseline.
- `back-serwis` `VersioningService.createVersion` — klonowanie wydzielone do `cloneVersionData`; przy pierwszej wersji baseline jest materializowany jako „pierwszy" (siatka bezpieczeństwa dla zamówień sprzed eager).
- skrypt `apps/backend/prisma/migrate-baseline-to-first-version.js` — jednorazowa migracja: dla każdego ORDER bez wersji tworzy „pierwszy" i przepisuje `versionId: null → pierwszy` w `WbsNode`, `Subtask`, `BudgetLineItem`, `MaterialRequirement`. `OrderRequirements` POMINIĘTY (rekord globalny cross-version). Idempotentny, tryb `--dry`.

### słownik
- dodano `back-funkcja` `resolveVersionId`, `normalizeVersionId` (`common/version.util.ts`)
- dodano `back-funkcja` `cloneVersionData` (`ai/versioning.service.ts`)

### wytyczne
- `schema-pole` `*.versionId = null` ma TRZY role: (1) baseline treści (`WbsNode`/`Subtask`/`BudgetLineItem`/`MaterialRequirement`) — migrowalny do „pierwszy"; (2) rekord GLOBALNY cross-version w `OrderRequirements` (offerStatus, projectGoal, projectItems, clientContacts) — NIGDY nie migrować ani nie przepisywać; (3) auto-taski baseline chronione guardem w `batchUpsert`. Przepisując baseline pomijaj `OrderRequirements`.
- `back-funkcja` `resolveVersionId` — każdy NOWY czytnik/zapis danych wersjonowanych (WBS/budżet/materiały/subtaski) MUSI rozwiązywać brak `versionId` do aktywnej wersji przez ten util, nie twardo do `null`.

---

## 2026-06-09 — Scalanie duplikatów wymagań w koszyku (drag&drop liść→liść)

### architektura / API
- `ui-funkcja` `handleRequirementMerge` — nowy handler w `UnifiedWbsPanel`: przeciągnięcie nieprzypisanego liścia źródłowego na docelowy w koszyku scala wymagania techniczne (unikalne linie `technicalSpec`) do celu. Cel zachowuje nazwę i ilość, źródłowe `MaterialRequirement` jest usuwane (`DELETE /material-requirements/:id`). Ręczna, kontrolowana alternatywa dla automatycznej deduplikacji AI (która nie wykrywa parafraz tej samej pozycji). W koszyku dodano też rozwijany podgląd `technicalSpec` per chip (UI).

### słownik
- dodano `ui-funkcja` `handleRequirementMerge` — scalanie duplikatów wymagań w koszyku przez drag&drop.

### wytyczne
- `ui-funkcja` `handleRequirementMerge` — scala po liniach `technicalSpec` (split `\n`, dedup unikalnych); cel = chip, na który upuszczono (zachowuje nazwę i ilość), źródło usuwane. Ilości NIE są sumowane — ta sama pozycja opisana w kilku fragmentach nie ma być liczona wielokrotnie.

---

## 2026-06-09 — Fix: wymagania techniczne liścia WBS w ProductCard (powiązanie po tagu `req:`)

### architektura / API
- `ui-tabela` `WBSHybridTable` — mapa `matReqByWbsId` indeksuje wymagania także po `MaterialRequirement.id` (nie tylko po `wbsNodeId`). Węzeł-liść rozwiązuje swoje wymaganie NAJPIERW po tagu `req:<id>` (rzeczywiste powiązanie liść↔wymaganie), a dopiero potem fallback po `wbsNodeId`. Wcześniej `wbsNodeId` wymagania wskazywał gałąź-rodzica (cel dropa), nie liść — więc `ProductCard` liścia nie znajdował wymagania i pokazywał puste „Wymagania techniczne" mimo poprawnie zapisanego `technicalSpec` w bazie.
- Skutek: po „Wyciągnij z dokumentacji" + przeciągnięciu liścia na gałąź rozwinięcie `ProductCard` (sześciokąt w drzewie WBS oraz sekcja `wbsunified/materials`) pokazuje zapisany `technicalSpec`. Diagnoza potwierdzona danymi prod: 250/269 wymagań AI miało `technicalSpec`, a 233/253 (92%) miało `wbsNodeId = NULL`.

### słownik
- dodano `ui-stan` `matReqByWbsId` — mapa node→wymaganie w `WBSHybridTable` (klucz: `wbsNodeId` ORAZ `MaterialRequirement.id`).

### wytyczne
- `ui-tabela` `WBSHybridTable` — powiązanie węzła-liścia WBS z `MaterialRequirement` realizuje tag węzła `req:<id>`, a NIE skalarny `wbsNodeId` (ten wskazuje gałąź-rodzica = cel dropa). Każdy lookup wymagania dla liścia MUSI najpierw sprawdzić tag `req:`, potem dopiero fallback po `wbsNodeId`.

---

## 2026-06-09 — Typy pozycji ekstrakcji pobierane dynamicznie z drzewa WBS

### architektura / API
- `back-funkcja` `getWbsNodeTypes()` — nowa metoda w `MaterialRequirementsService` zwracająca distinct `type` z `wbs_nodes` (single source of truth). `extractFromDocuments` używa tej listy w prompcie AI oraz przy walidacji, zamiast hardcode `DEVICE|MATERIAL|CABLE|SOFTWARE|SERVICE`.
- `back-funkcja` `parseAndValidateItems` — sygnatura rozszerzona o `allowedTypes: string[]`; whitelist typów liczona dynamicznie, fallback `material`.
- `ui-funkcja` `wbsTypeFromAny(type)` — nowy normalizator w `wbsConstants` (legacy enum → typ WBS). Zastąpił hardcode `['MATERIAL','DEVICE']` / `typeMap` / lokalne mapy etykiet w `UnifiedWbsPanel`, `MaterialRequirementsPanel`, `WbsMaterialsPanel`, `WBSHybridTable`, `MaterialDatabaseTab`, `projectPdfExport`. Usunięto `WBS_TYPE_TO_REQ`. `MaterialRequirement.type` przechodzi na taksonomię WBS (`material/equipment/service/...`).
- Migracja danych: `test/migrate-req-types-to-wbs.sql` (~1088 wierszy: `DEVICE→equipment`, `CABLE→material`, `SOFTWARE→service`, reszta lowercase) — uruchamiać RAZEM z deployem nowego frontu.
- Skutek: dodanie nowego typu w WBS (`wbs_nodes.type` / `TYPE_OPTIONS`) automatycznie obejmuje import — bez edycji backendu. Wyekstrahowane pozycje mają odtąd typy WBS (np. `material`, `service`), nie stary enum.

### słownik
- dodano `back-funkcja` `getWbsNodeTypes` — distinct typy z drzewa WBS dla ekstrakcji.
- dodano `ui-funkcja` `wbsTypeFromAny` — normalizator legacy enum → typ WBS (`wbsConstants.js`).

### wytyczne
- `back-funkcja` `getWbsNodeTypes` — lista dozwolonych typów pozycji jest pochodną drzewa WBS (`wbs_nodes.type`); NIE wprowadzać równoległego hardcode typów w backendzie.
- `ui-funkcja` `wbsTypeFromAny` — JEDYNE źródło mapowania legacy→WBS we froncie; MUSI być spójne z backendem i `test/migrate-req-types-to-wbs.sql`. Etykiety PL pozostają w `wbsConstants.TYPE_LABELS`.

---

## 2026-05-25 — Wirtualizacja stron PDF w podglądzie dokumentacji

### architektura / API
- `ui-sekcja` `PdfPageWithHighlights` — wprowadzono lazy rendering pojedynczej strony PDF przez `IntersectionObserver` z buforem `rootMargin: 500px 0px`. Strona renderuje `<Page>` z `react-pdf` dopiero gdy jej wrapper zbliża się do viewportu; do tego momentu zajmuje miejsce w scrollu jako placeholder o proporcjach A4 (`width × 1.414`). Raz wyrenderowana strona pozostaje (`hasRendered=true`) — scroll w górę nie powoduje re-rendera canvasu.
- Skutek: otwarcie dokumentu 93-stronicowego skraca się z ~60s do <2s (pierwsze 2-3 strony widoczne od razu, reszta dorenderowuje się przy scrollu). Naprawia regresję w panelu `DocumentationSidebar` i `DocumentViewer` — obydwa konsumują ten sam komponent strony.

### słownik
- dodano `ui-sekcja` `PdfPageWithHighlights` — komponent strony PDF z warstwą highlightów (`apps/frontend/src/components/shared/PdfPageWithHighlights.jsx`).
- dodano `ui-stan` `hasRendered` — flaga sterująca lazy renderem `<Page>`, ustawiana przez `IntersectionObserver`.
- dodano `ui-stala` `placeholderHeight` — wysokość placeholdera A4 (`width × 1.414`) rezerwującego miejsce w scrollu zanim strona zostanie wyrenderowana.

### wytyczne
- `ui-sekcja` `PdfPageWithHighlights` — wrapper MUSI mieć explicit `width` i rezerwowaną `minHeight` (placeholder), inaczej wszystkie wrapery byłyby wysokości 0, `IntersectionObserver` odpaliłby się dla wszystkich stron jednocześnie i wirtualizacja przestałaby działać. Klasa Tailwinda `w-fit` jest tu zakazana.

---

## 2026-05-25 — Zakładka „Informacje o lokalizacji" w węzłach typ=order (pierwsza)

### architektura / API
- `back-serwis` `SiteService.findOne` — auto-create pustego rekordu `Site` rozszerzony z `type==='site'` na `type==='site' OR type==='order'`. Pozwala węzłom zamówień dzielić ten sam komponent edycyjny co lokalizacje.
- `ui-zakladka` `tab-site-info-order` w `DashboardPage` — nowa zakładka „Informacje o Lokalizacji" dla `activeNode.type === 'order'`, renderowana PRZED zakładką „Informacje o Zamówieniu" (pierwsza w kolejności). Współdzieli komponent `SiteInfoTab` z węzłami `type=site`.
- `setActiveTab('siteInfo')` ustawia nowy state — nie jest dodawany do `tabOrder` (zakładka jest fixed pre-reorderable, analogicznie do `requirements`).

### słownik
- dodano `ui-zakladka` `tab-site-info-order` — `apps/frontend/src/DashboardPage.jsx`, zakładka „Informacje o Lokalizacji" dla węzła `order`.

### wytyczne
- `back-serwis` `SiteService.findOne` — dodając nowy typ węzła który ma używać `Site` jako modelu danych, dodaj go do warunku `node.type === ...`. Inne typy dostają 404.
- `ui-zakladka` `tab-site-info-order` — pozycja „pierwsza" osiągana przez renderowanie buttona PRZED zakładką `requirements` w JSX; nie ma to wpływu na reorderable `tabOrder`.

---

## 2026-05-25 — Sidebar/System: zakładka „Firma" + singleton Company

### schema.prisma
- dodano `schema-model` `Company` (table `companies`) — singleton `id="singleton"`, pola 1:1 z `Site` (`name`, `number`, `additionalDesc`, `addressStreet/City/ZipCode/Country/Latitude/Longitude`, `customData`, `contactEmail/FirstName/LastName/Phone`) bez pól specyficznych dla lokalizacji terenowej (`structureType`, `accessDesc`, `drivingDesc`, `shelterType`, `greenfield`) i bez relacji do `ProcessNode`.

### architektura / API
- `back-endpoint` `GET/PATCH /company` — singleton dla wszystkich userów; GET auto-tworzy pusty wiersz jeśli brak (`CompanyService.get`).
- `back-serwis` `CompanyService` w `apps/backend/src/company/` — `get()` + `update()` operują wyłącznie na rekordzie o id `singleton`.
- `CompanyModule` zarejestrowany w `app.module.ts`.
- `ui-widok` `FirmaPage` (`/firma`) — formularz mirror `SiteInfoTab` (sekcje: Podstawowe Informacje, Adres, Osoba Kontaktowa, współrzędne Lat/Long), bez `nodeId` — pobiera dane z `/company`.
- `ui-przycisk` „Firma" w sekcji System w `DynamicSidebar` — nawigacja do `/firma`.

### słownik
- dodano `schema-model` `Company` + pola (patrz SLOWNIK „Moduł Company").
- dodano `back-stala` `SINGLETON_ID`, `back-funkcja` `CompanyService.get` / `CompanyService.update`, `back-endpoint` `GET/PATCH /company`.
- dodano `ui-widok` `FirmaPage`, `ui-przycisk` `sidebar-firma-button`.

### wytyczne
- `schema-model` `Company` — JEDEN wiersz w bazie. NIE twórz pluralnych endpointów (lista/CRUD); singleton zachowuje semantykę „moja firma → wyliczenia globalne".
- `back-funkcja` `CompanyService.get` — auto-create przy pierwszym GET; front nie obsługuje 404.
- Wyliczenia bazujące na danych firmy podpinaj przez fetch `/company` (np. domyślny adres źródłowy do kalkulacji kilometrów paliwa).

---

## 2026-05-25 — Auto-podzadania w gałęzi „Zarządzanie projektem"

### architektura / API
- `back-serwis` `ProcessTreeService.create` — gałąź `Zarządzanie projektem` tworzona dla każdego nowego zlecenia (ORDER) ma teraz trzy liście zamiast jednego: `Zarządzanie projektem` (`type=work`, `unit=pakiet`), `Wizja lokalna` (`type=work`, `unit=dni`, `quantity=1`), `Paliwo` (`type=fuel`, `unit=kilometry`, `unitCost=0.7`, bez ilości).
- liść `Zarządzanie` przemianowany na `Zarządzanie projektem` (mgmtLeaf) — `sortOrder=0`; `Wizja lokalna` — `sortOrder=1`; `Paliwo` — `sortOrder=2`. Wszystkie trzy są pod tym samym `parentId = mgmtBranch.id` i odzwierciedlone w polu `OrderRequirements.wbsTree` (JSON children).

### wytyczne
- `back-serwis` `ProcessTreeService.create` — domyślny komplet liści gałęzi `Zarządzanie projektem` definiowany jest WYŁĄCZNIE w transakcji `create` (zarówno DB jak i JSON wbsTree). Zmiana zestawu wymaga synchronicznej edycji obu list, inaczej panel struktury rozjedzie się z DB.

---

## 2026-05-25 — WBSHybrid: nowy projekt → auto-gałąź „Gwarancja 24m"

### architektura / API
- `ui-funkcja` `handleAddTopLevel` w `WBSHybridTable.jsx` — każdy nowo dodany przedmiot projektu (top-level w drzewie WBS) dostaje od razu gałąź `Gwarancja 24m` (`type=group`) z dwoma liśćmi: `Wizyta gwarancyjna` (`type=work`, `unit=dni`, `quantity=2`) oraz `Paliwo` (`type=fuel`, `unit=kilometry`, `unitCost=0.7`, bez ilości).
- nowa funkcja pomocnicza `buildDefaultWarrantyBranch` buduje to poddrzewo z `mkNode` — pojedyncze źródło prawdy.

### słownik
- dodano `ui-funkcja` `buildDefaultWarrantyBranch` — buduje domyślną gałąź gwarancyjną dla nowego przedmiotu projektu w WBSHybridTable, plik `apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx`.

### wytyczne
- `ui-tabela` `WBSHybridTable` — każdy nowy przedmiot projektu MUSI mieć preinstalowaną gałąź `Gwarancja 24m` z podgałęziami `Wizyta gwarancyjna` (2 dni) i `Paliwo` (bez ilości). Zmiana defaultów wymaga edycji `buildDefaultWarrantyBranch`.

---

## 2026-05-25 — Drag & drop węzłów w DynamicSidebar (wariant A: into)

### architektura / API
- wykorzystano istniejący `back-endpoint` `PATCH /process-tree/:id/move` (`MoveNodeDto { newParentId }`) do przenoszenia węzłów drzewa z poziomu sidebara — bez zmian backendu
- dodano w `DynamicSidebar` obsługę natywnego HTML5 drag&drop: każdy węzeł (area/field/order/site) można przeciągnąć i upuścić na dowolny inny węzeł → staje się jego dzieckiem
- po udanym move wywoływany jest `onReloadTree` (= `fetchTree` z `MainLayout`) — drzewo się odświeża

### słownik
- dodano `ui-stan` `sidebar-drag-id` — id aktualnie przeciąganego węzła
- dodano `ui-stan` `sidebar-drag-over-id` — id węzła pod kursorem (cel dropu)
- dodano `ui-funkcja` `handle-sidebar-move` — wywołuje PATCH /process-tree/:id/move

### wytyczne
- `ui-sekcja` `DynamicSidebar` — drag&drop dostępny TYLKO dla ADMIN/MANAGER (warunek `canManageTree`); pozostali użytkownicy mają `draggable={false}` i bez handlerów
- `back-endpoint` `PATCH /process-tree/:id/move` — walidacje cyklu (self / descendant via closure table) są po stronie backendu; frontend tylko blokuje drop na samego siebie i pokazuje `alert()` przy błędzie z API
- kolejność rodzeństwa w sidebarze NIE jest sterowana drag&dropem — `ProcessNode` nie ma pola `sortOrder`. D&D zmienia tylko relację parent-child

---

## 2026-05-22 — Eksport budżetu: Podsumowanie per typ + Cash flow per liść kotwiczący

### architektura / API
- `ui-funkcja` `handleExportBudgetExcel` arkusz „Podsumowanie" — sekcja „Podsumowanie per typ" agreguje koszty per typ bez rozróżniania jednostek (kolumny: Typ, Koszt, Przychód, Zysk, Marża %); zlikwidowane kolumny Jednostka i Ilość.
- `ui-funkcja` `handleExportBudgetExcel` arkusz „Cash flow" — sekcja A (oś czasu) pivot per właściciel × miesiąc z miesiącami w kolumnach + ew. „Bez harmonogramu". Sekcja B przebudowana: jeden wiersz per liść kotwiczący (zadanie pracy/usługi z datą Gantta) z zagregowanymi kosztami osobowymi i materiałowymi dziedziczącymi datę z tego liścia; rozbite kolumny Koszt osobowy / Koszt materiałowy / Razem; pozycje bez kotwicy doklejone z czerwonym tłem.
- `back-funkcja` `WbsNodesService.flattenForInsert` — przenosi `unitCost` z drzewa do bazy przy TWORZENIU nowego węzła (`create: row`); aktualizacja istniejących węzłów dalej nie rusza pól budżetowych. Pozwala auto-liściowi Paliwo z `ensureFuelLeaf` zachować 0,70 przy pierwszym zapisie.
- Auto-tworzone liście (`Paliwo` z `ensureFuelLeaf`, `Zarządzanie` z `ProcessTreeService.create`) dostają komentarz „utworzony automatycznie" dla łatwej identyfikacji.

### wytyczne
- `appendBudgetSheet` kolumna „Podgałąź" — gdy węzeł nie ma gałęzi pośredniej (siedzi pod przedmiotem), powtarzaj nazwę samego węzła zamiast pustego pola.

---

## 2026-05-22 — Auto-węzły WBS: liść Paliwo + gałąź Zarządzanie projektem

### architektura / API
- `back-serwis` `ProcessTreeService.create` — przy tworzeniu zlecenia (type=ORDER) tworzy dodatkowo gałąź `Zarządzanie projektem` z liściem `Zarządzanie` (typ work, jednostka pakiet, właściciel = użytkownik Michał Ranik), analogicznie do gałęzi `PYTANIA OGÓLNE`
- `ui-funkcja` `ensureFuelLeaf` w `WBSHybridTable` — zmiana typu węzła na `work` automatycznie dodaje pod-liść `Paliwo` (typ fuel, jednostka kilometry, koszt 0,70); pomija gdy liść Paliwo już istnieje

### słownik
- dodano `ensureFuelLeaf` — auto-dodawanie liścia Paliwo do gałęzi typ=praca, plik `WBSHybridTable.jsx`

### wytyczne
- `ui-wiersz` typ=`work` w `WBSHybridTable` — gałąź pracy zawsze ma liść Paliwo; deduplikacja po `type === 'fuel'`

---

## 2026-05-22 — Arkusz Harmonogram (Gantt) w eksporcie oferty

### architektura / API
- wyodrębniono `ui-funkcja` `appendGanttSheet(workbook)` — wspólna logika budowania arkusza „Harmonogram" + „Dni_wolne" z siatką Gantta
- `handleExportGanttExcel` korzysta teraz z `appendGanttSheet` zamiast inline'owego kodu
- `handleExportOfertaWbsExcel` dokłada arkusz „Harmonogram" — eksport oferty zawiera teraz pełny Gantt

### słownik
- dodano `appendGanttSheet` — buduje arkusz Gantta w przekazanym workbooku, współdzielony przez eksport harmonogramu i oferty

---

## 2026-05-22 — Eksport budżetu: układ kolumn arkusza „Budżet"

### architektura / API
- `ui-funkcja` `appendBudgetSheet` — w arkuszu „Budżet" przeniesiono kolumny „Ilość" i „Jednostka" przed „Koszt jednostkowy". Przed „Cena ofertowa" dodano kolumnę „Jednostkowa cena ofertowa" = koszt jednostkowy × narzut × (1 − rabat); brak narzutu ⇒ 0 (spójnie z „Cena ofertowa"). Litery kolumn w formułach Excela (`totalCost`, `unitOfferPrice`, `offerPrice`, `SUBTOTAL`) wyznaczane dynamicznie przez `budgetColLetter` — odporne na zmianę układu kolumn.

---

## 2026-05-22 — Eksport Gantta do Excel: kolumna gałęzi depth=0

### architektura / API
- `ui-funkcja` `handleExportGanttExcel` — w arkuszu „Harmonogram" dodano kolumnę „Gałąź (przedmiot)" (depth=0) jako pierwszą kolumnę (A), przed „Zadanie". Wartość = nazwa najwyższego przodka węzła (bez `parentId`), wyznaczana przez `depth0BranchName`. Pozwala filtrować zadania tej samej gałęzi przez autofiltr. Litery kolumn dat/dni (`COL_START`/`COL_END`/`COL_DAYS`) wyznaczane dynamicznie — formuły NETWORKDAYS/SUBTOTAL odporne na zmianę układu kolumn.

### wytyczne
- `ui-funkcja` `handleExportGanttExcel` — formuły Excela odwołujące się do kolumn bazowych muszą używać liter z `sheet.getColumn(key).letter`, nigdy literałów `B`/`C`/`D` — dodanie kolumny bazowej je przesuwa.

---

## 2026-05-22 — Eksport budżetu: arkusz „Cash flow"

### architektura / API
- `ui-funkcja` `handleExportBudgetExcel` — nowy arkusz „Cash flow": płatności rozłożone w czasie wg harmonogramu Gantta. Data płatności pozycji = ostatni dzień zadania + 1 dzień + 30 dni terminu (= +31 dni kalendarzowych). Materiały bez własnego paska Gantta dziedziczą datę zakończenia najbliższego zadania-przodka typu praca/usługa. Arkusz ma trzy sekcje: oś czasu (agregacja miesięczna — koszty materiałowe / osobowe / razem / skumulowane), listę pozycji źródłowych oraz sekcję „Kontrola spójności" (koszt całkowity budżetu rozbity na część rozłożoną w czasie i część poza osią czasu). Źródłem pozycji jest ten sam zbiór wierszy co arkusz „Budżet" (`appendBudgetSheet`) — komplet liści zagwarantowany, gałęzie `group` pomijane. Kwoty = koszt netto (`totalCost`). Pozycje bez powiązanego zadania w harmonogramie trafiają do wiersza „(brak daty w harmonogramie)" i są wyróżnione czerwonym tłem + wierszem ostrzegawczym.
- `ui-funkcja` `getExcelData` (`GanttSection.jsx`) — wiersze danych eksportu Gantta zawierają teraz pole `id` (id węzła WBS), by umożliwić powiązanie zadań z kosztami budżetu.

---

## 2026-05-22 — Eksport budżetu: agregacja per osoba odpowiedzialna

### architektura / API
- `ui-funkcja` `handleExportBudgetExcel` — w arkuszu „Podsumowanie" usunięto szczegółową tabelę „Podział liści — materiały i sprzęt wg osób" (blok per osoba z wierszami liści). Zastąpiona zagregowaną tabelą „Podsumowanie per osoba odpowiedzialna": jeden wiersz na właściciela (Koszt / Cena ofertowa / Zysk / Marża %), liczone po wszystkich gałęziach budżetu. Wiersze bez właściciela trafiają do wiersza „(puste)".

---

## 2026-05-22 — Eksport oferty WBS: arkusz „Gałęzie grupujące"

### architektura / API
- `ui-funkcja` `handleExportOfertaWbsExcel` — nowy arkusz „Gałęzie grupujące": dla każdego węzła `type='group'` suma cen ofertowych całego poddrzewa (kolumny Gałąź grupująca / Ścieżka / Cena ofertowa). Wiersz Razem sumuje tylko gałęzie najwyższego poziomu, by nie liczyć podwójnie gałęzi zagnieżdżonych.

---

## 2026-05-22 — Walidacja cen przed eksportem oferty/budżetu + spójna logika sum

### architektura / API
- `ui-funkcja` `handleExportOfertaWbsExcel` oraz `ui-funkcja` `buildWbsHtmlTable` (`wbsPdfExport.js`) — gałęzie grupujące (`type='group'`) wykluczone z sum cen ofertowych przez `localPriceOf` (zwraca 0 dla `group`), spójnie z `appendBudgetSheet`. Usuwa rozbieżność budżet vs oferta (gałąź grupująca z własnym narzutem zawyżała sumę oferty).
- `ui-funkcja` `buildWbsHtmlTable` — formuła ceny ofertowej wyrównana z eksportem Excel: brak narzutu ⇒ cena 0 (wcześniej błędnie zwracała koszt).
- `ui-funkcja` `handleExportPDF` — eksport sekcji `oferta` / `budget` / `all` blokowany, gdy jakakolwiek pozycja liściowa ma zerowy koszt jednostkowy lub zerowy narzut.
- `ui-funkcja` `validateBudgetPricing` — nowa, wspólna walidacja pozycji liściowych (koszt jedn. > 0, narzut > 0); używana przez `appendBudgetSheet` i `handleExportPDF`.

### słownik
- dodano `validate-budget-pricing` — walidacja cen pozycji liściowych przed eksportem, `UnifiedWbsPanel.jsx`

### wytyczne
- `ui-funkcja` `validateBudgetPricing` — każdy eksport zawierający ceny (oferta, budżet — Excel i PDF) musi przez nią przejść; pozycja z ceną 0 lub bez narzutu blokuje eksport.
- `schema-pole` `WbsNode.type='group'` — gałęzie grupujące nigdy nie wnoszą własnej ceny do sum eksportowych; ich wartość to suma dzieci.

---

## 2026-05-22 — Eksport budżetu: arkusz „Drzewo WBS" + odkryty arkusz Dni_wolne

### architektura / API
- `ui-funkcja` `handleExportBudgetExcel` — nowy arkusz „Drzewo WBS": pełny zrzut hierarchii WBS (wszystkie węzły, wcięcie wg poziomu) z kolumnami Koszt jednostkowy / Koszt całkowity / Cena ofertowa / Zysk; gałęzie mają koszt i cenę zrolowane z dzieci przez `buildWbsTreeDump`, liście biorą `WbsNode.totalCost`/`totalPrice`.
- `ui-funkcja` `handleExportGanttExcel` — arkusz `Dni_wolne` (lista świąt dla `NETWORKDAYS`) zmieniony z `veryHidden` na widoczny.
- `ui-funkcja` `appendBudgetSheet` — kolumna C „Podgałąź" w arkuszu „Budżet" pokazuje pełną ścieżkę gałęzi pośrednich (przodkowie bez depth=0 i bez samego węzła, złączeni „ › ") zamiast tylko bezpośredniego rodzica.

### słownik
- dodano `build-wbs-tree-dump` — buduje zrzut drzewa WBS z kosztami zrolowanymi na gałęziach, `UnifiedWbsPanel.jsx`

---

## 2026-05-22 — Model dat domkniętych w Gancie (koniec = ostatni dzień zadania)

### architektura / API
- `ui-sekcja` `GanttSection` — daty zadań traktowane jako domknięte: kolumna „Do" w tabeli pokazuje i przyjmuje OSTATNI dzień zadania (wcześniej dzień po). Konwersja przez `inclusiveEnd` przy wyświetlaniu i `+1 dzień` przy zapisie w `applyDateChange`. Wewnętrzny model i baza bez zmian.
- `ui-funkcja` `handleExportGanttExcel` / `getExcelData` — eksport Excel zgodny z modelem domkniętym: „Data do" = ostatni dzień zadania (`task.end − 1`), kolumna D = `NETWORKDAYS(B,C)` / `C-B+1` (obie daty włączne).

### wytyczne
- `schema-pole` `WbsNode.ganttEnd` — w bazie oraz w tablicy `tasks` przekazywanej do biblioteki Gantta pozostaje datą WYKLUCZAJĄCĄ (dzień po ostatnim dniu zadania). Domknięcie („koniec = ostatni dzień") to wyłącznie warstwa prezentacji/edycji — konwertuj `inclusiveEnd` / `+1` na granicy UI, nie zmieniaj modelu wewnętrznego.

---

## 2026-05-22 — Eksport Excel harmonogramu: siatka timeline z kolorowanymi komórkami

### architektura / API
- `ui-funkcja` `handleExportGanttExcel` — eksport arkusza „Harmonogram" dostał po prawej siatkę timeline: kolumny grupowane wg aktualnego widoku Gantta (dzień/tydzień/miesiąc). Komórki kolorowane jak na wykresie — niebieski `#1d4ed8` = dzień roboczy zadania, szary = weekend/święto, zielony/czerwony nagłówek = marker startu/końca projektu. Dodano też kolumnę „Komentarz" (do edycji w pliku); kolumny bazowe zamrożone (`xSplit`).
- `ui-funkcja` `buildExcelTimeline` — nowy helper modułowy w `GanttSection.jsx`: buduje macierz dzień-po-dniu (uwzględnia `branchWorkOnHolidays`) i grupuje dni w kolumny wg `viewMode`; zwracany przez `getExcelData` w polu `timeline`.
- `ui-funkcja` `handleExportGanttExcel` — kolumna D „Dni robocze" jest formułą Excela liczoną z dat (`NETWORKDAYS` / `C-B`); święta trafiają do ukrytego arkusza `Dni_wolne`.

### słownik
- dodano `build-excel-timeline` — helper budujący siatkę timeline do eksportu Excel, `GanttSection.jsx`

### wytyczne
- `ui-funkcja` `getExcelData` — pole `timeline` w zwracanych danych zależy od aktualnego `viewMode` Gantta; eksport Excel odwzorowuje rozdzielczość kolumn z widoku w aplikacji.

---

## 2026-05-21 — Gantt: zamrożony nagłówek i tabela, rozciągalne paski, przyklejony suwak

### architektura / API
- `ui-sekcja` `GanttSection` — tabela zadań zamrożona przy przewijaniu poziomym (timeline `_CZjuD` jest własnym kontenerem przewijania), nagłówek dat zamrożony u góry przy przewijaniu pionowym (sticky-klon nakładany na widok), własny poziomy suwak przyklejony do dołu widoku; wbudowany suwak gantt-task-react (`_2k9Ys`) ukryty.

### wytyczne
- `ui-funkcja` `buildTasksFromTree` — węzeł renderuje się jako pasek (zadanie) gdy jego typ to praca/usługa, NIEZALEŻNIE od tego czy ma dzieci; tylko węzeł innego typu z dziećmi (np. `group`) jest czysto grupującą gałęzią bez paska. Decyduje typ węzła, nie obecność dzieci.
- `ui-funkcja` `buildTasksFromTree` — praca/usługa z jednostką inną niż `dni` startuje jako pasek 1-dniowy, rozciągalny; resize takiego paska zapisuje wyłącznie `schema-pole` `WbsNode.ganttStart`/`ganttEnd` i NIE zmienia `WbsNode.quantity` ani `WbsNode.unit` (blokuje to flaga `_canUpdateDuration = isWorkType && isDayUnit`).
- `ui-funkcja` `nodeDurationDays` — praca z jednostką `dni` i quantity>0 dostaje pasek o długości = quantity dni roboczych; typy pakiet/komplet używają quantity jako dni (min 1).
- `ui-funkcja` `exportPdf` / `ui-funkcja` `getGanttHtml` — nakładki widoku Gantta (`.ignite-gantt-sticky-header`, `.ignite-gantt-hscroll`) muszą być usuwane z klonu DOM przed serializacją, inaczej trafią do eksportu PDF/HTML.

---

## 2026-05-21 — usunięcie martwego eksportu „Eksport oferty" (handleExportOfertaExcel)

### architektura / API
- `ui-funkcja` `handleExportOfertaExcel` — usunięta: funkcja eksportu oferty do Excel (arkusze Oferta + Materiały) była martwym kodem od momentu usunięcia przycisku „Eksport oferty" z sekcji Budżet; zastąpiona przez `handleExportOfertaWbsExcel`.

### słownik
- usunięto `handle-export-oferta-excel` — `ui-funkcja` `handleExportOfertaExcel` w `UnifiedWbsPanel.jsx`

---

## 2026-05-21 — analiza projektu do Excel: tabela liści wg osób w arkuszu Podsumowanie

### architektura / API
- `ui-funkcja` `handleExportBudgetExcel` — etykieta przycisku zmieniona z „Eksport budżetu do Excel" na „Analiza projektu do Excel".
- `ui-funkcja` `handleExportBudgetExcel` — arkusz „Podsumowanie" pod tabelą „Podsumowanie per typ" zyskuje sekcję „Podział liści — materiały i sprzęt wg osób": pogrupowane po polu `schema-pole` `WbsNode.owner`, dla każdej osoby osobne bloki Materiały i Sprzęt (liście typu `material`/`equipment` bez podgałęzi) z kolumnami Podgałąź / Nazwa / Ilość / Jednostka / Koszt całościowy / Cena ofertowa / Zysk, wierszem podsumy bloku oraz zbiorczym wierszem „Razem osoba" (koszt, cena ofertowa, zysk = cena − koszt).

---

## 2026-05-21 — kolumna Podgałąź (ścieżka pośrednia) w arkuszu Materiały

### architektura / API
- `ui-funkcja` `handleExportOfertaWbsExcel` — arkusz „Materiały": kolumna C („Pełna ścieżka WBS" → „Podgałąź") zawiera ścieżkę gałęzi pośrednich bez przedmiotu (depth=0) i bez własnego segmentu wiersza (`segmenty.slice(1,-1)`); umożliwia filtrowanie po dowolnym poziomie gałęzi.

---

## 2026-05-21 — kolumna Typ w arkuszach WBS1/2/3 eksportu oferty

### architektura / API
- `ui-funkcja` `handleExportOfertaWbsExcel` — arkusze WBS1/WBS2/WBS3 mają nową kolumnę „Typ" (Materiał, Praca, Grupujący…) wyprowadzoną z typu węzła reprezentowanego przez wiersz (d1/d2/d3); kolumna „Cena ofertowa" przesunięta o jedną pozycję, `SUBTOTAL`/`autoFilter` zaktualizowane.

---

## 2026-05-21 — przywrócenie zapisu dat Gantta do bazy

### architektura / API
- `ui-funkcja` `handleGanttDateChange` (UnifiedWbsPanel) — przywrócony zapis `ganttStart`/`ganttEnd` przez `PATCH /wbs-nodes/{id}` przy każdym drag/resize/datepicker; wiring (`onGanttDateChange`) zgubiony przy wcześniejszym merge'u, przez co rozszerzenie paska wracało do poprzedniej wartości. Backend (schema + `wbs-nodes.service`) cały czas obsługiwał te pola.

### słownik
- dodano `ui-funkcja` `handleGanttDateChange` — zapis dat paska Gantta do bazy, `UnifiedWbsPanel.jsx`, `@anchor handle-gantt-date-change`

---

## 2026-05-21 — eksport harmonogramu Gantt do Excel

### architektura / API
- `ui-funkcja` `handleExportGanttExcel` (UnifiedWbsPanel) — eksport harmonogramu do XLSX: arkusz „Harmonogram" z kolumnami Zadanie / Data od / Data do / Dni robocze, wiersz „Razem" z `SUBTOTAL(9,…)`, kolejność wierszy = kolejność tasków.
- `ui-sekcja` `GanttSection` — nowy prop `onExcelDataReady` udostępniający funkcję `getExcelData` (taski + sumaryczna liczba dni roboczych); analogiczny do `onExportReady`/`onGetHtmlReady`.
- sekcja Gantt w panelu unified ma przycisk „Eksport do Excel" obok eksportu PDF.

### słownik
- dodano `ui-funkcja` `handleExportGanttExcel` — eksport harmonogramu Gantt do XLSX, `UnifiedWbsPanel.jsx`, `@anchor handle-export-gantt-excel`

---

## 2026-05-21 — eksport tabel oferty: SUBTOTAL, arkusz Podsumowanie, koszt gałęzi grupującej

### architektura / API
- `ui-funkcja` `handleExportOfertaWbsExcel` — wiersze „Razem" we wszystkich arkuszach (WBS1/2/3, Budżet, Materiały) używają formuły Excela `SUBTOTAL(9,…)` zamiast statycznej sumy / `SUM`, dla kolumn koszt całościowy i cena ofertowa — suma reaguje na filtrowanie.
- `ui-funkcja` `handleExportOfertaWbsExcel` — usunięto arkusz „Budżet" z tego eksportu (`appendBudgetSheet` służy już tylko do walidacji pozycji); dodano jako pierwszy arkusz „Podsumowanie" agregujący ceny ofertowe wg typu gałęzi (`TYPE_LABELS`).
- `ui-funkcja` `handleExportOfertaWbsExcel` — arkusz „Materiały" sortowany wg kolejności w drzewie WBS (DFS po `sortOrder`) zamiast alfabetycznie; dodano wiersz „Razem"; nagłówek kolumny „Cena ofertowa / ilość" zmieniony na „Cena jedn.".
- `ui-funkcja` `sumChildrenCost` (WBSHybridTable) — koszt gałęzi typu `group` = suma kosztów dzieci (liść = `unitCost × quantity`); w panelu WBS kolumna „Koszt jedn." dla gałęzi grupującej pokazuje tę sumę read-only.
- zmiana układu eksportu oferty PDF — tekst sekcji „Oferta" (`.offer-text`) wyrównany do szerokości (`text-align: justify`) zamiast dziedziczyć wyśrodkowanie z komórki; dane w tabelach pozostają wyśrodkowane.

### słownik
- dodano `ui-funkcja` `sumChildrenCost` — rekurencyjna suma kosztów dzieci węzła WBS, `WBSHybridTable.jsx`, `@anchor sum-children-cost`

### wytyczne
- `schema-pole` `WbsNode.unit` — dla węzłów typu `group` jednostka jest zawsze `pakiet` (ustawiana przy zmianie typu, nieedytowalna w panelu WBS)
- wiersze „Razem" w eksportach Excel — używać `SUBTOTAL(9,zakres)`, nie `SUM`, żeby sumy reagowały na filtry kolumn

---

## 2026-05-21 — PWA: baner aktualizacji zamiast cichego reloadu

### architektura / API
- `back-skrypt` `sw.js` — usunięto natychmiastowe `self.skipWaiting()`; nowy SW czeka, aktywuje się dopiero po wiadomości `SKIP_WAITING` z aplikacji. `activate` robi tylko `clients.claim()` (usunięto broadcast `SW_UPDATED`).
- `ui-funkcja` `showSwUpdateBanner` (main.jsx) — gdy wykryty zostanie czekający SW (`registration.waiting` lub `updatefound`→`installed` przy istniejącym kontrolerze), pokazuje stały baner „Dostępna nowa wersja" z przyciskiem „Odśwież". Klik → `SKIP_WAITING` → `controllerchange` → jednorazowy `location.reload()`.

### wytyczne
- aktualizacje PWA — nigdy cichy auto-reload w trakcie pracy; nowa wersja zawsze przez baner akceptowany przez użytkownika. Eliminuje niespójny cache i utratę kontekstu.

---

## 2026-05-21 — walidacja i filtrowanie eksportów Excel + kolejność gałęzi WBS

### architektura / API
- `ui-funkcja` `handleExportBudgetExcel` — przed eksportem waliduje pozycje liściowe (bez podgałęzi): jeśli któraś ma `unitCost = 0` lub `margin = 0`, eksport jest wstrzymany, a alert wymienia nazwy pozycji do uzupełnienia. Gałęzie zbiorcze pomijane (koszt = suma dzieci).
- arkusze danych eksportów Excel otrzymały `autoFilter` (nagłówek + wiersze danych, bez wiersza „Razem"): Budżet, Q&A (`handleExportBudgetExcel`), Oferta (`handleExportOfertaExcel`), WBS1/WBS2/WBS3 (`handleExportOfertaWbsExcel`).
- `ui-funkcja` `handleExportOfertaWbsExcel` — arkusze WBS1/2/3 sortują gałęzie wg kolejności w panelu WBS (DFS po `sortOrder`) zamiast alfabetycznie; dodano helper `wbsOrderIndex`/`wbsOrd`.
- `ui-funkcja` `appendBudgetSheet` — nowy współdzielony helper budujący arkusz „Budżet" (walidacja + pozycje WBS z kosztami) w przekazanym workbooku; zwraca `{ ok, empty, invalidRows, rows, summary, qaSheetRows }`. Używany przez `handleExportBudgetExcel` (zrefaktoryzowany) oraz `handleExportOfertaWbsExcel` — eksport tabel WBS zawiera teraz arkusz „Budżet" z tą samą walidacją.
- model ceny ofertowej ujednolicony we wszystkich eksportach: `qty × unitCost = totalCost`, `totalCost × (1+narzut%) = cena ofertowa`, rabat naliczany per gałąź (`× (1−rabat%)`); brak narzutu ⇒ cena ofertowa 0. Wiersz „Razem" w arkuszach Budżet i Oferta = suma cen ofertowych pozycji (przed rabatem całościowym).
- globalny rabat budżetu (`budgetDiscountPercent`/`budgetDiscountAmount`) nie jest już wliczany do „Razem". Arkusz Budżet: pole rabatu całościowego w 1. wierszu (`Rabat całościowy` + `Cena ofertowa po rabacie całościowym`), nagłówek tabeli w 2. wierszu, dane od 3.; `autoFilter` od wiersza 2, `frozen ySplit:2`. Arkusz Oferta: rabat całościowy jako wiersze pod „Razem".

### wytyczne
- eksporty Excel — arkusze tabelaryczne zawsze z `autoFilter`; kolejność wierszy/gałęzi musi odpowiadać kolejności w panelu WBS (DFS po `sortOrder`), nie alfabetycznej.
- `ui-funkcja` `appendBudgetSheet` — jedyne źródło budowy arkusza „Budżet"; każdy nowy eksport potrzebujący budżetu woła ten helper, nie duplikuje logiki.
- cena ofertowa — jedyna formuła: `totalCost × (1+narzut%) × (1−rabat%)` per gałąź, brak narzutu ⇒ 0. Rabaty wyłącznie na poziomie gałęzi; globalny rabat budżetu to osobna pozycja, nigdy wliczana w sumę pozycji.

---

## 2026-05-21 — obustronna synchronizacja ceny zakupu WBS ↔ ProductCard ↔ Materials

### architektura / API
- `ui-funkcja` `propagatePriceNetto` (WbsMaterialsPanel) — po zapisie `priceNetto` w `material-requirements` propaguje teraz w drugą stronę do budżetu WBS: dla każdego dotkniętego węzła wywołuje `onWbsNodeUnitCostChange(wbsNodeId, priceNetto)` → `WbsNode.unitCost`. Zachowany Wariant A (dopasowanie po nazwie węzła).
- `ui-propsy` `onWbsNodeUnitCostChange` (WbsMaterialsPanel) — nowy prop, podpięty w UnifiedWbsPanel do `updateNodeField(nid, 'unitCost', price)`; zastąpił nieużywany prop `onWbsNodeCostPatched`.
- `ui-funkcja` `MaterialReqExpandPanel` (WBSHybridTable) — ProductCard otrzymuje realny `onPropagatePrice` → `onNodeFieldSave(node.id, 'unitCost', price)` zamiast wcześniejszego no-opa, który gubił edycję ceny.
- usunięto martwy kod: `handleWbsNodeCostPatched`, `patchNodeInTree` (UnifiedWbsPanel) oraz nieużywany prop `onProductCardPriceChange` przekazywany do WBSHybridTable.

### wytyczne
- `ui-funkcja` `updateNodeField` — jedyna ścieżka zapisu `unitCost`: patchuje `/wbs-nodes/:id/budget`, propaguje `priceNetto` do `material-requirements` i odświeża. Każdy nowy punkt edycji ceny zakupu (WBS, ProductCard, Budget) musi przez nią przechodzić, nie patchować budżetu bezpośrednio.
- `back-endpoint` `PATCH /wbs-nodes/:id/budget` — pełny replace pól budżetowych (brakujące pola → 0/null). Zawsze wysyłać komplet `unitCost/quantity/margin/discount`, nigdy pojedyncze pole.

---

## 2026-05-20 — arkusz Materiały w handleExportOfertaWbsExcel z cenami ofertowymi

### architektura / API
- `ui-funkcja` `handleExportOfertaWbsExcel` — dodano arkusz "Materiały" (pełny eksport szczegółów: Typ, Przedmiot projektu, ścieżka WBS, pozycja, ilość, jednostka, wymagania techniczne, producent/model/nazwa handlowa, status, dostępność, propozycje) obok arkuszy WBS1/WBS2/WBS3.
- dodano kolumny `Cena ofertowa / ilość` = `WbsNode.unitPrice` (cena ofertowa jednostkowa) oraz `Cena ofertowa łącznie` = `WbsNode.totalPrice` — wartości czytane wprost z pól węzła WBS (źródło prawdy, te same co tabela WBS), bez przeliczania.
- arkusz "Materiały": kolumny przestawione (ceny ofertowe po Jednostce), usunięto kolumny propozycji (Prop. *), zmieniono nagłówki "Przedmiot projektu"→"Zakres" i "Pozycja przedmiotu"→"Nazwa", dodano kolumny `www` i `screenshot`.
- kolumna `www` = `selectedProposal.sourceUrl` lub `MaterialRequirement.productUrl` (karta bez propozycji); `screenshot` = osadzony obraz z `GET /material-requirements/proposals/:id/image` (propozycja) lub `GET /material-requirements/:id/image` (karta).

---

## 2026-05-20 — odświeżanie danych przy rozwinięciu sekcji WBS

### architektura / API
- `ui-funkcja` `handleNodeExpand` — callback wywoływany przy rozwinięciu węzła w WBSHybridTable (tylko przy otwieraniu, nie zamykaniu); debounce 200ms; wywołuje `refreshWbsNodes()` → GET unified endpoint → patch `unitCost/unitPrice/totalCost/totalPrice` w wbsTree ze świeżych danych DB
- `back-endpoint` `GET /wbs-nodes/unified/:nodeId` — już istniejący endpoint, teraz wywoływany również przy expand

### słownik
- dodano `ui-funkcja` `handleNodeExpand` — handler przekazywany jako `onNodeExpand` do WBSHybridTable; debounce 200ms chroni przed wielokrotnym requestem przy szybkim rozwijaniu

---

## 2026-05-20 — kolumna Cena netto w WBS dla managera z propagacją do budżetu i materiałów

### architektura / API
- `back-endpoint` `PATCH /wbs-nodes/:id` rozszerzony o pole `unitPrice` w liście dozwolonych pól (zabezpieczenie na przyszłość)
- `ui-input` "Cena netto" w WBS pokazuje i edytuje `WbsNode.unitCost` (ten sam field co "Koszt jedn." w budżecie) — nie `unitPrice`; edycja trafia przez `PATCH /wbs-nodes/:id/budget` z pełnym kontekstem `{unitCost, quantity, margin, discount}` → budżet przelicza `unitPrice`, `totalCost`, `totalPrice` spójnie
- propagacja `unitCost` → `MaterialRequirement.priceNetto` dla węzłów typ=`equipment`/`material` — realizowana w `updateNodeField` w `UnifiedWbsPanel.jsx`
- optymistyczna aktualizacja `wbsData` po edycji WBS obejmuje pola pochodne (`unitPrice`, `totalCost`, `totalPrice`) — BudgetTable wykrywa zmianę `unitCost` w `editableFields` i resetuje `syncVersion` (odświeżenie inputów)

### słownik
- dodano `ui-input` `wbs-unit-cost-input` — input "Cena netto" w WBSHybridTable, widoczny tylko dla `isManager`, edytowalny inline, wywołuje `onNodeFieldSave` z polem `unitCost`

### wytyczne
- `ui-input` `wbs-unit-cost-input` — "Cena netto" w WBS = `WbsNode.unitCost`; taki sam field jak "Koszt jedn." w BudgetTable — obie sekcje powinny zawsze pokazywać tę samą wartość; edycja przez `/budget` endpoint, nie przez tree endpoint

---

## 2026-05-18 — automatyczny sync indeksu zmiennych do Obsidiana

### słownik
- nowa sekcja `### Skrypty narzędziowe (root repo)` w SLOWNIK.md `## ZMIENNE — indeks`
- 2 wpisy: `back-skrypt sync-obsidian.ps1` + `back-skrypt setup-task-scheduler.ps1`

### infrastruktura
- nowy skrypt `sync-obsidian.ps1` — parsuje sekcję `## ZMIENNE — indeks` z SLOWNIK.md i nadpisuje `G:\Mój dysk\obsidian\vibe_codes\Ignite — zmienne projektu.md` (pełne nadpisanie, frontmatter generowany z unikalnych tagów)
- nowy skrypt `setup-task-scheduler.ps1` (ASCII-only, wymaga Admin) — rejestruje task `Ignite - sync Obsidian zmienne` w Windows Task Scheduler, codziennie o 18:00
- log syncu: `%TEMP%\ignite-sync-obsidian.log`

### wytyczne
- skrypt `sync-obsidian.ps1` musi mieć UTF-8 BOM (zawiera polskie znaki w ścieżkach i markerach — `Mój dysk`, em-dash w nazwie pliku Obsidian, marker `## ZMIENNE — indeks`). PS 5.1 bez BOM czyta jako Windows-1252 = mojibake
- `setup-task-scheduler.ps1` ASCII-only — nazwa taska `Ignite - sync Obsidian zmienne` (zwykły dash) zamiast em-dasha, żeby uniknąć mojibake w nazwie zarejestrowanego taska (em-dash w PS 5.1 bez BOM rejestruje się jako `Ignite â— sync ...`)
- ręczne zmiany w `Ignite — zmienne projektu.md` w Obsidianie zostaną NADPISANE przy następnym sync (18:00) — to plik auto-generowany

---

## 2026-05-18 — CLAUDE.md: doprecyzowanie workflow @anchor (5 luk)

### wytyczne
- hook NIE pilnuje sprzątania w SLOWNIK po usunięciu zmiennej — usuwanie ręczne
- rename = usuń stary `// @anchor` z kodu + dodaj nowy + zaktualizuj wiersz w SLOWNIK (nie dublować)
- refactor logiki BEZ zmiany nazwy — nie ruszać SLOWNIK ani anchora (hook się nie odpali)
- mirror `Ignite — zmienne projektu.md` w Obsidianie poza repo — synchronizacja ręczna, hook nie widzi
- propozycja nowego taga → ZANIM dopiszesz, spytaj użytkownika "czy nowy `prefiks-nazwa`, czy istniejący tag z innym znaczeniem"

---

## 2026-05-18 — taksonomia tagów zmiennych + indeks `@anchor`

### słownik
- nowa taksonomia tagów `ui- / back- / schema-` w SLOWNIK.md i CLAUDE.md (zastępuje stary schemat `[w nawiasach]`)
- 39 tagów + 2 nowe wprowadzone przez rozbudowę: `back-controller`, `back-modul`
- nowa sekcja `## TAGI ZMIENNYCH` w SLOWNIK.md z pełną taksonomią
- nowa sekcja `## ZMIENNE — indeks` w SLOWNIK.md — indeks zaindeksowanych zmiennych projektu (tag | nazwa | plik | @anchor)
- zaindeksowany moduł WBS: 87 wpisów (schema 37, backend 11, komponenty 10, handlery `UnifiedWbsPanel` 16, `wbsConstants` 24)

### wytyczne
- konwencja `@anchor <kebab-case-name>` w kodzie nad każdą zaindeksowaną zmienną (`//` w JS/TS, `///` w schema.prisma)
- format anchora: kebab-case, unikalny globalnie, wyprowadzony z nazwy zmiennej (`camelCase` → `kebab-case`, `Model.pole` → `model-pole`)
- pre-commit hook `.githooks/pre-commit` — blokuje commit jeśli w staged plikach `.js/.jsx/.ts/.tsx/.prisma` pojawia się NOWY `@anchor` (znak `+` w diff) bez wpisu w SLOWNIK.md
- instalacja hooka po klonie: `git config core.hooksPath .githooks` (jednorazowo)
- rozbudowa taksonomii: nowy tag w formacie `ui-<nazwa>` / `back-<nazwa>` / `schema-<nazwa>` dopisywany do CLAUDE.md ORAZ SLOWNIK.md w tym samym commicie
- aktualizacja sekcji `## ZMIENNE — indeks` w SLOWNIK.md PRZED każdym commitem zawierającym nową/zmienioną/usuniętą zmienną

---

## 2026-05-17 — eksport PDF oferty: tabele WBS + powtarzający się nagłówek

### eksport PDF
- [sekcja] `UnifiedWbsPanel` — nowe zmienne `{tabela wbs1}`, `{tabela wbs2}`, `{tabela wbs3}` w treści oferty; usunięto `{tabela wbs}` (bez numeru)
- [funkcja] `buildWbsHtmlTable(depth)` — generuje HTML tabeli dla głębokości 1/2/3; wiersz "Razem" w `<tbody>` (nie `<tfoot>`) aby nie powtarzał się przy przełamaniu
- [sekcja] `offerHtmlContent` — treść oferty dzielona po placeholderach `{tabela wbsN}` i zastępowana tabelami HTML
- [strona] HTML eksportu — struktura oparta na zewnętrznej tabeli (`outer-wrap`) z `<thead>` = nagłówek dokumentu; Chrome powtarza `<thead>` automatycznie na każdej stronie
- [strona] `resolvedPresets` — usunięto ekspansję `{tabela wbs*}` z presetów, żeby DB przechowywała placeholder, nie markdown

### wytyczne
- [funkcja] `buildWbsHtmlTable` — wiersz sumy musi być w `<tbody>`, nie `<tfoot>`; `<tfoot>` powtarza się na każdej stronie w Chrome
- [strona] eksport PDF — nagłówek dokumentu powtarzany przez `<thead>` zewnętrznej tabeli, nie przez `position:fixed` (które koliduje z powtórzonym `<thead>` tabel wewnętrznych)

---

## 2026-05-17 — dokumentacja stanu bazowego projektu

### schema.prisma — stan bazowy

- Model `ProcessNode` — drzewo firmy: `type` enum `area|field|order|site`
- Model `ProcessNodeClosure` — tabela domknięcia dla szybkich zapytań przodek/potomek
- Model `WbsNode` — drzewo WBS wewnątrz zlecenia, pola budżetowe: `unitCost`, `quantity`, `totalCost`, `margin`, `discount`, `unitPrice`, `totalPrice`
- Model `WbsNodeMaterial` — alokacja materiału do węzła WBS (many-to-many z `quantity`)
- Model `MaterialRequirement` — wymaganie materiałowe; pole `wbsNodeId` @unique (karta produktowa 1:1 z WbsNode)
- Model `MaterialRequirementsList` — lista wymagań z wersjonowaniem (`parentId` FK do siebie)
- Model `Subtask` — zadania; pola `isAiGenerated`, `isApproved`, `requirementItemId`
- Model `ProjectVersion` — wersje projektu; `isActive: Boolean`
- Model `OrderRequirements` — wymagania ofertowe; `clientProjectManager`, `offerStatus`, `wbsTree`
- Model `Site` — dane lokalizacji 1:1 z ProcessNode; `customData: Json`
- Model `SchematicMarker` — markery na schemacie; typ `POINT|LINE`, pola `x,y,x2?,y2?`
- Model `WbsMarkerLink` / `SubtaskMarkerLink` — powiązania markera z WbsNode i Subtask
- Model `DocumentHighlight` — zaznaczenia w dokumentach PDF; `rects: Json`, `color`
- Model `ProductProposal` — propozycje produktów AI/ręczne; `matchScore`, `isSelected`, `isRejected`
- Model `Comment` — komentarze do zleceń; `type: NOTE|QUESTION|RESOLVED|URGENT`, `mentionedUserIds[]`
- Model `Notification` / `PushSubscription` — powiadomienia push

### wytyczne
- `WbsNode.depth` — nie jest kolumną w bazie, obliczany w runtime przez `buildDepths(null, 0)` w `wbs-nodes.service.ts`
- `WbsNode.phase` — tylko trzy wartości: `PRZED` | `INSTAL` | `PO`
- `WbsNode` depth=0 i depth=1 — auto-expand przy każdym fetch; nie zmieniać bez wyraźnej prośby
- `_isProjectItem` (depth=0) — zablokowana edycja pól `type` i `requirementsQty`
- `WbsNode.status` dla type=`material`/`equipment` — nie edytować ręcznie, dziedziczony z materiałów
- `wbsFallbackRequirements` — wyświetlane gdy brak `MaterialRequirement` w bazie; read-only (`isLocked=true`)
- `onDrop` / `onDragOver` — zawsze ignoruj wiersze z prefiksem `__req__:` jako target drag & drop
- `deploy.sh` — nigdy nie uruchamiaj bez wyraźnego potwierdzenia użytkownika ("Czy deployować na produkcję?")
