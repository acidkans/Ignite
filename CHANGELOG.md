# CHANGELOG — Ignite ERP

Zmiany strukturalne: schemat bazy, architektura, API. Bugfixy i refaktory nie są tu zapisywane.

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
