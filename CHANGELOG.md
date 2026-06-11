# CHANGELOG — Ignite ERP

Zmiany strukturalne: schemat bazy, architektura, API. Bugfixy i refaktory nie są tu zapisywane.

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
