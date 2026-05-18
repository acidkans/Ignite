# Słownik zmiennych projektu Ignite ERP

Dokument do komunikacji między Andrzejem a Claude.
Używaj nazwy z kolumny **Skrót** — Claude będzie wiedział dokładnie co zmienić.

---

## EKSPORTY PDF

| Skrót | Co robi (potocznie) | Funkcja | Plik | Wiersz |
|---|---|---|---|---|
| EKSPORT_OFERTA_PDF | Drukuje ofertę z tabelami WBS 1/2/3 | `handleExportPDF('oferta')` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 1032 |
| EKSPORT_WBS_PDF | Drukuje drzewo WBS ze statusami i Q&A | `handleExportPDF('wbs')` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 1032 |
| EKSPORT_BUDZET_PDF | Drukuje tabelę budżetu z kosztami | `handleExportPDF('budget')` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 1032 |
| EKSPORT_STRATEGIA_PDF | Drukuje tekst strategii projektu | `handleExportPDF('strategy')` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 1032 |
| EKSPORT_PROJEKT | Drukuje cały projekt: wymagania + WBS + materiały + Gantt | `exportProjectPdf` | `utils/projectPdfExport.js` | 121 |
| EKSPORT_WYMAGANIA | Drukuje zakładkę "Informacje o zamówieniu" | `exportRequirementsPdf` | `utils/requirementsPdfExport.js` | 21 |
| EKSPORT_QA | Generuje PDF z polami do ręcznego wpisania odpowiedzi | `exportQaFormPdf` | `components/shared/wbs/exportQaFormPdf.js` | 68 |
| IMPORT_QA | Wczytuje odpowiedzi z wypełnionego PDF z powrotem do systemu | `importQaFormPdf` | `components/shared/wbs/importQaFormPdf.js` | 3 |
| EKSPORT_MATERIALY_PDF | Drukuje tabelę materiałów ze zdjęciami | `exportToPdf` | `components/shared/wbs/WbsMaterialsPanel.jsx` | 1572 |

---

## EKSPORTY EXCEL

| Skrót | Co robi (potocznie) | Funkcja | Plik | Wiersz |
|---|---|---|---|---|
| EKSPORT_OFERTA_EXCEL | Eksportuje WBS 1/2/3 oferty do .xlsx (3 zakładki) | `handleExportWbsExcel` | `components/shared/wbs/UnifiedWbsPanel.jsx` | — |
| EKSPORT_MATERIALY_EXCEL | Eksportuje listę materiałów do .xlsx | `exportToExcel` | `components/shared/wbs/WbsMaterialsPanel.jsx` | 1370 |

---

## BAZA PDF (wspólna infrastruktura)

| Skrót | Co robi (potocznie) | Funkcja | Plik | Wiersz |
|---|---|---|---|---|
| BAZA_PDF | Buduje pełny dokument HTML z nagłówkiem powtarzanym na każdej stronie | `buildPdfDocument` | `utils/wbsPdfExport.js` | 84 |
| BAZA_CSS | Wspólne style dla wszystkich PDF | `PDF_BASE_CSS` | `utils/wbsPdfExport.js` | 5 |
| OTWORZ_PDF | Otwiera okno przeglądarki i wywołuje drukowanie | `openPdfBlob` | `utils/wbsPdfExport.js` | 71 |
| POBIERZ_LOGO | Pobiera logo firmy jako base64 | `fetchLogoDataUrl` | `utils/wbsPdfExport.js` | 121 |
| BUDUJ_TABELE_WBS | Buduje HTML tabeli WBS na wybranym poziomie zagłębienia | `buildWbsHtmlTable` | `utils/wbsPdfExport.js` | 142 |

---

## PANELE UI

| Skrót | Co robi (potocznie) | Komponent | Plik | Wiersz |
|---|---|---|---|---|
| PANEL_WBS | Główny panel: tabele WBS, budżet, Q&A, Gantt, oferta | `UnifiedWbsPanel` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 72 |
| PANEL_MATERIALY | Panel wymagań materiałowych z kartami produktów | `WbsMaterialsPanel` | `components/shared/wbs/WbsMaterialsPanel.jsx` | 1054 |
| PANEL_WYMAGANIA | Zakładka "Informacje o zamówieniu" z terminami i kontaktami | `RequirementsTab` | `components/shared/RequirementsTab.jsx` | 71 |
| PANEL_INFO_WEZLA | Informacje o wybranym węźle drzewa | `NodeInfoTab` | `components/shared/NodeInfoTab.jsx` | 5 |
| PANEL_OFERTY | Zakładka z listą ofert | `OffersTab` | `components/shared/OffersTab.jsx` | 148 |
| GANTT | Wykres harmonogramu projektu | `GanttSection` | `components/shared/wbs/GanttSection.jsx` | 358 |
| DRZEWO | Lewy panel z hierarchią węzłów projektu | `DynamicSidebar` | `components/Layout/DynamicSidebar.jsx` | 17 |
| LOGOWANIE | Strona logowania i rejestracji | `LoginPage` | `LoginPage.jsx` | 5 |

---

## KONFIGURACJA

| Skrót | Co robi (potocznie) | Gdzie | Wiersz |
|---|---|---|---|
| WERSJA | Numer wersji widoczny na stronie logowania | `LoginPage.jsx` → linia z `v2026.XX.XX.NNN` | 209 |
| STALE | Wspólne etykiety: statusy, jednostki, waluty | `wbsConstants.js` | — |

---

## SERWER I DEPLOY

| Skrót | Co robi |
|---|---|
| DEPLOY | Wgrywa nową wersję na erp.gigatel.org |
| PUSH | Wysyła commit do GitHub |
| COMMIT | Zapisuje zmiany w historii Git |
| PRODUKCJA | Serwer live: https://erp.gigatel.org |
| DEV | Lokalne środowisko: port 5174 |

---

## DANE

| Skrót | Co to |
|---|---|
| WEZEL | Jeden element drzewa WBS |
| WBS1 / WBS2 / WBS3 | Tabele oferty na poziomie 1 / 2 / 3 zagłębienia |
| QA | Para pytanie + odpowiedź przypisana do węzła |
| KARTA_PRODUKTU | Szczegóły materiału: producent, model, zdjęcie, spec |
| OFERTA | Sekcja z tabelami WBS i tekstem ofertowym |

---

## ZASADY KOMUNIKACJI

- Przed zmianą Claude powie co planuje, jaką funkcję/komponent dotknie i w którym wierszu
- Nie robi zmian w więcej niż 1–2 plikach bez zgody
- Po commicie zawsze pyta o merge/push/deploy
- "Zmiany są w pliku" ≠ "działa" — zawsze powie co sprawdzić

---

## TAGI ZMIENNYCH

Każda zmienna w sekcji `## ZMIENNE — indeks` ma tag opisujący typ. Trzy prefiksy:
- `ui-` — frontend (komponenty, stan, elementy UI)
- `back-` — backend (NestJS, endpointy, serwisy, infra serwera)
- `schema-` — `schema.prisma` (modele, pola, relacje, enumy DB)

### Frontend (`ui-`)

| Tag | Co opisuje |
|-----|-----------|
| `ui-input` | pole tekstowe / liczba / data / textarea |
| `ui-przycisk` | button, link-button |
| `ui-tabela` | tabela danych, AG Grid, lista wierszy |
| `ui-widok` | cała strona / route |
| `ui-sekcja` | logiczny blok w widoku |
| `ui-panel` | boczny / kontekstowy panel |
| `ui-zakladka` | tab w komponencie zakładkowym |
| `ui-modal` | okno dialogowe, popup |
| `ui-formularz` | grupa inputów z submitem |
| `ui-dropdown` | select, autocomplete, menu rozwijane |
| `ui-karta` | card UI |
| `ui-lista` | `<ul>`/`<ol>` bez tabeli |
| `ui-ikona` | klikalna ikona |
| `ui-kolumna` | kolumna AG Grid (colDef) |
| `ui-wiersz` | typ wiersza |
| `ui-stan` | useState / useRef |
| `ui-propsy` | props komponentu React |
| `ui-hook` | custom React hook |
| `ui-stala` | const modułowa frontend |
| `ui-funkcja` | helper / handler frontend |
| `ui-typ` | interface / type TS (frontend) |

### Backend (`back-`)

| Tag | Co opisuje |
|-----|-----------|
| `back-endpoint` | route NestJS |
| `back-controller` | klasa kontrolera NestJS |
| `back-modul` | klasa modułu NestJS |
| `back-serwis` | klasa serwisowa NestJS |
| `back-guard` | guard / dekorator autoryzacji |
| `back-dto` | DTO request/response |
| `back-typ` | interface / type TS (backend) |
| `back-funkcja` | helper / util backend |
| `back-stala` | const modułowa backend |
| `back-enum` | enum TypeScript (backend) |
| `back-env` | zmienna środowiskowa |
| `back-skrypt` | skrypt shell |
| `back-kontener` | serwis Docker |

### Baza (`schema-`)

| Tag | Co opisuje |
|-----|-----------|
| `schema-model` | model Prisma |
| `schema-pole` | pole modelu |
| `schema-relacja` | relacja między modelami |
| `schema-enum` | enum w schema.prisma |
| `schema-json` | struktura JSON w polu tekstowym DB |

### Rozbudowa

Jeśli zmienna nie pasuje do żadnego taga — zaproponuj nowy w formacie `ui-<nazwa>` / `back-<nazwa>` / `schema-<nazwa>` (małymi literami, po polsku, jedno słowo) i dopisz do odpowiedniej tabeli w tym samym commicie. Synchronizuj z CLAUDE.md.

---

## ZMIENNE — indeks

Indeks wszystkich zaindeksowanych zmiennych projektu. Aktualizowany przed każdym commitem (wymusza to `.githooks/pre-commit`).

Format wiersza: `| tag | nazwa | plik | @anchor <kebab-case-name> |`
Anchor w kodzie: `// @anchor <nazwa>` (lub `/// @anchor` w schema.prisma).

### Moduł WBS

#### Schema (Prisma — `apps/backend/prisma/schema.prisma`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| schema-model | WbsNode | apps/backend/prisma/schema.prisma | @anchor wbs-node |
| schema-model | WbsNodeMaterial | apps/backend/prisma/schema.prisma | @anchor wbs-node-material |
| schema-pole | WbsNode.id | apps/backend/prisma/schema.prisma | @anchor wbs-node-id |
| schema-pole | WbsNode.parentId | apps/backend/prisma/schema.prisma | @anchor wbs-node-parent-id |
| schema-pole | WbsNode.nodeId | apps/backend/prisma/schema.prisma | @anchor wbs-node-node-id |
| schema-pole | WbsNode.versionId | apps/backend/prisma/schema.prisma | @anchor wbs-node-version-id |
| schema-pole | WbsNode.name | apps/backend/prisma/schema.prisma | @anchor wbs-node-name |
| schema-pole | WbsNode.type | apps/backend/prisma/schema.prisma | @anchor wbs-node-type |
| schema-pole | WbsNode.status | apps/backend/prisma/schema.prisma | @anchor wbs-node-status |
| schema-pole | WbsNode.owner | apps/backend/prisma/schema.prisma | @anchor wbs-node-owner |
| schema-pole | WbsNode.resources | apps/backend/prisma/schema.prisma | @anchor wbs-node-resources |
| schema-pole | WbsNode.cost | apps/backend/prisma/schema.prisma | @anchor wbs-node-cost |
| schema-pole | WbsNode.tags | apps/backend/prisma/schema.prisma | @anchor wbs-node-tags |
| schema-pole | WbsNode.qa | apps/backend/prisma/schema.prisma | @anchor wbs-node-qa |
| schema-pole | WbsNode.sortOrder | apps/backend/prisma/schema.prisma | @anchor wbs-node-sort-order |
| schema-pole | WbsNode.budgetType | apps/backend/prisma/schema.prisma | @anchor wbs-node-budget-type |
| schema-pole | WbsNode.unit | apps/backend/prisma/schema.prisma | @anchor wbs-node-unit |
| schema-pole | WbsNode.unitCost | apps/backend/prisma/schema.prisma | @anchor wbs-node-unit-cost |
| schema-pole | WbsNode.quantity | apps/backend/prisma/schema.prisma | @anchor wbs-node-quantity |
| schema-pole | WbsNode.totalCost | apps/backend/prisma/schema.prisma | @anchor wbs-node-total-cost |
| schema-pole | WbsNode.margin | apps/backend/prisma/schema.prisma | @anchor wbs-node-margin |
| schema-pole | WbsNode.discount | apps/backend/prisma/schema.prisma | @anchor wbs-node-discount |
| schema-pole | WbsNode.unitPrice | apps/backend/prisma/schema.prisma | @anchor wbs-node-unit-price |
| schema-pole | WbsNode.totalPrice | apps/backend/prisma/schema.prisma | @anchor wbs-node-total-price |
| schema-pole | WbsNode.comment | apps/backend/prisma/schema.prisma | @anchor wbs-node-comment |
| schema-pole | WbsNode.phase | apps/backend/prisma/schema.prisma | @anchor wbs-node-phase |
| schema-pole | WbsNode.ganttStart | apps/backend/prisma/schema.prisma | @anchor wbs-node-gantt-start |
| schema-pole | WbsNode.ganttEnd | apps/backend/prisma/schema.prisma | @anchor wbs-node-gantt-end |
| schema-relacja | WbsNode.parent | apps/backend/prisma/schema.prisma | @anchor wbs-node-parent |
| schema-relacja | WbsNode.children | apps/backend/prisma/schema.prisma | @anchor wbs-node-children |
| schema-relacja | WbsNode.node | apps/backend/prisma/schema.prisma | @anchor wbs-node-node |
| schema-relacja | WbsNode.version | apps/backend/prisma/schema.prisma | @anchor wbs-node-version |
| schema-relacja | WbsNode.materialAllocations | apps/backend/prisma/schema.prisma | @anchor wbs-node-material-allocations |
| schema-relacja | WbsNode.materialCard | apps/backend/prisma/schema.prisma | @anchor wbs-node-material-card |
| schema-pole | WbsNodeMaterial.wbsNodeId | apps/backend/prisma/schema.prisma | @anchor wbs-node-material-wbs-node-id |
| schema-pole | WbsNodeMaterial.materialId | apps/backend/prisma/schema.prisma | @anchor wbs-node-material-material-id |
| schema-pole | WbsNodeMaterial.quantity | apps/backend/prisma/schema.prisma | @anchor wbs-node-material-quantity |

#### Backend (`apps/backend/src/wbs-nodes/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-controller | WbsNodesController | apps/backend/src/wbs-nodes/wbs-nodes.controller.ts | @anchor wbs-nodes-controller |
| back-modul | WbsNodesModule | apps/backend/src/wbs-nodes/wbs-nodes.module.ts | @anchor wbs-nodes-module |
| back-serwis | WbsNodesService | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-nodes-service |
| back-typ | QaPair | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor qa-pair |
| back-typ | WbsTreeItem | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-tree-item |
| back-endpoint | GET /wbs-nodes/unified/:nodeId | apps/backend/src/wbs-nodes/wbs-nodes.controller.ts | @anchor wbs-nodes-unified-get |
| back-endpoint | POST /wbs-nodes/unified/:nodeId | apps/backend/src/wbs-nodes/wbs-nodes.controller.ts | @anchor wbs-nodes-unified-post |
| back-endpoint | POST /wbs-nodes | apps/backend/src/wbs-nodes/wbs-nodes.controller.ts | @anchor wbs-nodes-create |
| back-endpoint | PATCH /wbs-nodes/:id | apps/backend/src/wbs-nodes/wbs-nodes.controller.ts | @anchor wbs-nodes-update |
| back-endpoint | PATCH /wbs-nodes/:id/budget | apps/backend/src/wbs-nodes/wbs-nodes.controller.ts | @anchor wbs-nodes-update-budget |
| back-endpoint | DELETE /wbs-nodes/:id | apps/backend/src/wbs-nodes/wbs-nodes.controller.ts | @anchor wbs-nodes-delete |

#### Frontend — komponenty (`apps/frontend/src/components/shared/wbs/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-sekcja | UnifiedWbsPanel | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor unified-wbs-panel |
| ui-sekcja | WbsMaterialsPanel | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-panel |
| ui-sekcja | MaterialRequirementsPanel | apps/frontend/src/components/shared/wbs/MaterialRequirementsPanel.jsx | @anchor material-requirements-panel |
| ui-sekcja | GanttSection | apps/frontend/src/components/shared/wbs/GanttSection.jsx | @anchor gantt-section |
| ui-sekcja | TasksCalendarSection | apps/frontend/src/components/shared/wbs/TasksCalendarSection.jsx | @anchor tasks-calendar-section |
| ui-sekcja | ProjectItemsPanel | apps/frontend/src/components/shared/wbs/ProjectItemsPanel.jsx | @anchor project-items-panel |
| ui-tabela | BudgetTable | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-table |
| ui-tabela | WBSHybridTable | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-hybrid-table |
| ui-widok | CalendarView | apps/frontend/src/components/shared/wbs/CalendarView.jsx | @anchor calendar-view |
| ui-karta | ProductCard | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor product-card |

#### Frontend — handlery `UnifiedWbsPanel.jsx`

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-funkcja | handleWbsExtract | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-wbs-extract |
| ui-funkcja | handleBudgetImportFileChange | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-budget-import-file-change |
| ui-funkcja | handleSaveHybridWBS | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-save-hybrid-wbs |
| ui-funkcja | handlePasteCloned | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-paste-cloned |
| ui-funkcja | handleRequirementAssignToWbs | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-requirement-assign-to-wbs |
| ui-funkcja | handleStrategySave | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-strategy-save |
| ui-funkcja | handleExportPDF | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-export-pdf |
| ui-funkcja | handleExportBudgetExcel | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-export-budget-excel |
| ui-funkcja | handleExportOfertaExcel | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-export-oferta-excel |
| ui-funkcja | handleExportOfertaWbsExcel | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-export-oferta-wbs-excel |
| ui-funkcja | handleMaterialNodeCreated | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-material-node-created |
| ui-funkcja | handleHybridNodesDeleted | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-hybrid-nodes-deleted |
| ui-funkcja | handleMaterialStatusChange | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-material-status-change |
| ui-funkcja | handleGanttDurationChange | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-gantt-duration-change |
| ui-funkcja | handleHybridRequirementsQtyChange | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-hybrid-requirements-qty-change |
| ui-funkcja | handleHybridNodeStatusChange | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-hybrid-node-status-change |

#### Frontend — stałe i utilsy (`wbsConstants.js`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stala | TASK_CATEGORIES | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor task-categories |
| ui-stala | MODULES | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor modules |
| ui-stala | darkTheme | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor dark-theme |
| ui-stala | TYPE_LABELS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor type-labels |
| ui-stala | TYPE_OPTIONS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor type-options |
| ui-stala | BUDGET_TYPE_LABELS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor budget-type-labels |
| ui-stala | UNIT_OPTIONS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor unit-options |
| ui-stala | MATERIAL_STATUS_LABELS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor material-status-labels |
| ui-stala | STRUCTURE_STATUS_META | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor structure-status-meta |
| ui-stala | MATERIAL_STATUS_LABEL_TO_CODE | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor material-status-label-to-code |
| ui-stala | STRUCTURE_COMMON_CELL_CLASS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor structure-common-cell-class |
| ui-funkcja | defaultUnitForType | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor default-unit-for-type |
| ui-funkcja | fmtPLN | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor fmt-pln |
| ui-funkcja | fmtQty | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor fmt-qty |
| ui-funkcja | fmtPct | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor fmt-pct |
| ui-funkcja | fmtPLNFull | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor fmt-pln-full |
| ui-funkcja | fmtPctFull | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor fmt-pct-full |
| ui-funkcja | normKey | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor norm-key |
| ui-funkcja | makeMaterialLookupKey | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor make-material-lookup-key |
| ui-funkcja | parseLocaleNumber | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor parse-locale-number |
| ui-funkcja | normalizeStatusCode | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor normalize-status-code |
| ui-funkcja | isLeafNode | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor is-leaf-node |
| ui-funkcja | buildHierarchy | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor build-hierarchy |
| ui-funkcja | flattenHierarchy | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor flatten-hierarchy |

### Skrypty narzędziowe (root repo)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-skrypt | sync-obsidian.ps1 | sync-obsidian.ps1 | @anchor sync-obsidian-script |
| back-skrypt | setup-task-scheduler.ps1 | setup-task-scheduler.ps1 | @anchor setup-task-scheduler-script |

<!-- Następne moduły do dodania:
- material-requirements (apps/backend/src/material-requirements/)
- offers (apps/backend/src/offers/)
- order-requirements (apps/backend/src/order-requirements/)
- process-tree (apps/backend/src/process-tree/)
- subtasks (apps/backend/src/subtasks/)
- frontend pages (LoginPage, Dashboard, itd.)
- frontend layout (DynamicSidebar)
- frontend tabs (RequirementsTab, OffersTab, NodeInfoTab)
- utils/wbsPdfExport.js (buildPdfDocument, openPdfBlob, fetchLogoDataUrl, buildWbsHtmlTable, PDF_BASE_CSS)
- utils/projectPdfExport.js (exportProjectPdf)
- utils/requirementsPdfExport.js (exportRequirementsPdf)
-->

