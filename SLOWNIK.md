# Słownik zmiennych projektu Ignite ERP

Dokument do komunikacji między Andrzejem a Claude.
Używaj nazwy z kolumny **Skrót** — Claude będzie wiedział dokładnie co zmienić.

---

## EKSPORTY PDF

| Skrót | Co robi (potocznie) | Funkcja | Plik | Wiersz |
|---|---|---|---|---|
| EKSPORT_OFERTA_PDF | Drukuje ofertę: tabele WBS 1/2/3 + „Jak to chcemy zrobić" (własna strona) + Schemat — znaczniki/Q&A/strony schematów (własna strona) + materiały (własna strona) | `handleExportPDF('oferta')` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 1032 |
| EKSPORT_PROJEKT | Drukuje cały projekt: wymagania + WBS + materiały + Gantt (bez cen/budżetu — bezpieczny dla klienta) | `exportProjectPdf` | `utils/projectPdfExport.js` | 121 |
| EKSPORT_WYMAGANIA | Drukuje zakładkę "Informacje o zamówieniu" | `exportRequirementsPdf` | `utils/requirementsPdfExport.js` | 21 |
| EKSPORT_QA | Generuje PDF z polami do ręcznego wpisania odpowiedzi | `exportQaFormPdf` | `components/shared/wbs/exportQaFormPdf.js` | 68 |
| IMPORT_QA | Wczytuje odpowiedzi z wypełnionego PDF z powrotem do systemu | `importQaFormPdf` | `components/shared/wbs/importQaFormPdf.js` | 3 |

> Usunięto 2026-07-06: `EKSPORT_WBS_PDF` (`handleExportPDF('wbs')`) i `EKSPORT_BUDZET_PDF` (`handleExportPDF('budget')`) — przyciski PDF sekcji Budżet i WBS Tree usunięte (dane poufne: koszty/marże nie mają trafiać poza firmę), oraz `EKSPORT_MATERIALY_PDF` (`exportToPdf` w `WbsMaterialsPanel.jsx`) — funkcja usunięta jako martwy kod po usunięciu przycisku. Zob. CHANGELOG.md 2026-07-06.
>
> Usunięto 2026-07-06: `EKSPORT_STRATEGIA_PDF` (`handleExportPDF('strategy')`) jako osobny przycisk — treść „Jak to chcemy zrobić" dołączona do `EKSPORT_OFERTA_PDF` (za ofertą, przed materiałami, własna strona). Zob. CHANGELOG.md 2026-07-06.

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
| BUDUJ_SEKCJA_SCHEMAT | Buduje HTML sekcji Schemat (tabela znaczników + Q&A z WBS + strony schematów z naniesionymi markerami) — współdzielone przez `EKSPORT_OFERTA_PDF` i eksport PDF w `SchematTab.jsx` | `buildSchematSectionHtml` | `utils/schematPdfExport.js` | 110 |

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

### Moduł MarkerDetailsPanel

#### Frontend (`apps/frontend/src/components/shared/MarkerDetailsPanel.jsx`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stan | extraQuestions | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor extra-questions |
| ui-stan | qaRefreshTick | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor qa-refresh-tick |
| ui-funkcja | handleAddExtraQuestion | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor handle-add-extra-question |
| ui-funkcja | handleExtraQuestionChange | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor handle-extra-question-change |
| ui-funkcja | handleSaveExtraQuestion | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor handle-save-extra-question |
| ui-stan | qaTreeOpen | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor qa-tree-open |
| ui-stan | pendingDrafts | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor pending-drafts |
| ui-funkcja | loadPendingDrafts | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor load-pending-drafts |
| ui-funkcja | saveAttachmentDraft | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor save-attachment-draft |
| ui-stala | displayAttachments | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor display-attachments |
| ui-stala | OUTBOX_RETRY_INTERVAL_MS | apps/frontend/src/hooks/useSyncOutbox.js | @anchor outbox-retry-interval-ms |

### Moduł QaTreeView (wspólny widok Q&A drzewa)

#### Frontend (`apps/frontend/src/components/shared/wbs/QaTreeView.jsx` + sync offline)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-sekcja | QaTreeView | apps/frontend/src/components/shared/wbs/QaTreeView.jsx | @anchor qa-tree-view |
| ui-stan | qaFilter | apps/frontend/src/components/shared/wbs/QaTreeView.jsx | @anchor qa-tree-filter |
| ui-stan | queuedIds | apps/frontend/src/components/shared/wbs/QaTreeView.jsx | @anchor qa-queued-ids |
| ui-funkcja | persistNodeQa | apps/frontend/src/components/shared/wbs/QaTreeView.jsx | @anchor persist-node-qa |
| ui-input | GrowingTextarea | apps/frontend/src/components/shared/wbs/QaTreeView.jsx | @anchor growing-textarea |
| ui-funkcja | enqueueWbsQa | apps/frontend/src/services/repos/outboxRepo.js | @anchor enqueue-wbs-qa |
| ui-funkcja | getPendingByType | apps/frontend/src/services/repos/outboxRepo.js | @anchor get-pending-by-type |
| ui-stala | WBS_QA | apps/frontend/src/services/sync/syncOutbox.js | @anchor wbs-qa-outbox-type |
| ui-stan | qaTreeOpen (SchematTab) | apps/frontend/src/components/shared/SchematTab.jsx | @anchor schemat-qa-tree-open |
| ui-stan | qaTreeOpen (UnifiedWbsPanel) | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor wbs-qa-tree-open |
| ui-funkcja | resolveOfferTokens | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor resolve-offer-tokens |

### Moduł WBS

#### Schema (Prisma — `apps/backend/prisma/schema.prisma`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| schema-model | WbsNode | apps/backend/prisma/schema.prisma | @anchor wbs-node |
| schema-model | WbsNodeMaterial | apps/backend/prisma/schema.prisma | @anchor wbs-node-material |
| schema-model | WbsLeafDefaults | apps/backend/prisma/schema.prisma | @anchor wbs-leaf-defaults-model |
| schema-pole | WbsLeafDefaults.nodeId | apps/backend/prisma/schema.prisma | @anchor wbs-leaf-defaults-node-id |
| schema-pole | WbsLeafDefaults.data | apps/backend/prisma/schema.prisma | @anchor wbs-leaf-defaults-data |
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
| schema-pole | WbsNode.strategy | apps/backend/prisma/schema.prisma | @anchor wbs-node-strategy |
| ui-funkcja | BranchStrategyField | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor branch-strategy-field |
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

#### Backend — wersjonowanie (`common/`, `ai/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-funkcja | normalizeManufacturer | apps/backend/src/common/normalize.util.ts | @anchor normalize-manufacturer |
| back-funkcja | normalizeVersionId | apps/backend/src/common/version.util.ts | @anchor normalize-version-id |
| back-funkcja | resolveVersionId | apps/backend/src/common/version.util.ts | @anchor resolve-version-id |
| back-funkcja | cloneVersionData | apps/backend/src/ai/versioning.service.ts | @anchor clone-version-data |

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
| ui-dropdown | FilterDropdown | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-filter-dropdown |
| ui-tabela | WBSHybridTable | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-hybrid-table |
| ui-funkcja | sumChildrenCost | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor sum-children-cost |
| ui-funkcja | sumChildrenOfferPrice | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor sum-children-offer-price |
| ui-kolumna | wbs-offer-price-cell | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-offer-price-cell |
| ui-input | wbs-margin-input | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-margin-input |
| ui-funkcja | findDepth | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor find-depth |
| ui-funkcja | ensureFuelLeaf | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor ensure-fuel-leaf |
| ui-funkcja | buildDefaultWarrantyBranch | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor build-default-warranty-branch |
| ui-input | wbs-unit-cost-input | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-unit-price-input |
| ui-stan | matReqByWbsId | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor mat-req-by-wbs-id |
| ui-stan | matReqByName | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor mat-req-by-name |
| ui-stan | matReqsLoaded | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor mat-reqs-loaded |
| ui-stan | tableWrapperRef | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor grid-nav-table-ref |
| ui-stan | navRowOrder | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor grid-nav-row-order |
| ui-stala | GRID_COLUMN_ORDER | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor grid-nav-column-order |
| ui-funkcja | handleGridKeyDown | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor handle-grid-key-down |
| ui-modal | QaModal | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor qa-modal |
| ui-stan | qaModalNode | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor qa-modal-node |
| ui-stan | qaBranchNode | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor qa-branch-node |
| ui-modal | QaBranchModal | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor qa-branch-modal |
| ui-stan | addTaskNode | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor add-task-node-state |
| ui-modal | AddTaskModal | apps/frontend/src/components/shared/AddTaskModal.jsx | @anchor add-task-modal |
| ui-funkcja | handleSubmit (AddTaskModal) | apps/frontend/src/components/shared/AddTaskModal.jsx | @anchor add-task-modal-submit |
| ui-funkcja | collectBranchQa | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor collect-branch-qa |
| ui-funkcja | collectBranchStrategyEntries | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor collect-branch-strategy-entries |
| ui-funkcja | composeBranchStrategy | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor compose-branch-strategy |
| ui-funkcja | saveLeafStrategy | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor save-leaf-strategy |
| ui-funkcja | recomposeBranchStrategyAfterDelete | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor recompose-branch-strategy-after-delete |
| ui-stala | canFullscreen | apps/frontend/src/components/shared/SchematTab.jsx | @anchor schemat-can-fullscreen |
| ui-funkcja | handleNodeExpand | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-node-expand-refresh |
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
| ui-funkcja | handleRequirementMerge | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-requirement-merge |
| ui-funkcja | handleExportPDF | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-export-pdf |
| ui-funkcja | validateBudgetPricing | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor validate-budget-pricing |
| ui-funkcja | handleExportBudgetExcel | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-export-budget-excel |
| ui-funkcja | buildWbsTreeDump | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor build-wbs-tree-dump |
| ui-funkcja | handleExportOfertaWbsExcel | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-export-oferta-wbs-excel |
| ui-funkcja | buildMarkdownSheet | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor build-markdown-sheet |
| ui-funkcja | kwotaSlownie | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor kwota-slownie |
| ui-funkcja | handleExportGanttExcel | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-export-gantt-excel |
| ui-funkcja | appendGanttSheet | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor append-gantt-sheet |
| ui-funkcja | buildExcelTimeline | apps/frontend/src/components/shared/wbs/GanttSection.jsx | @anchor build-excel-timeline |
| ui-funkcja | handleGanttDateChange | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-gantt-date-change |
| ui-funkcja | handleMaterialNodeCreated | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-material-node-created |
| ui-funkcja | handleHybridNodesDeleted | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-hybrid-nodes-deleted |
| ui-funkcja | handleMaterialStatusChange | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-material-status-change |
| ui-funkcja | handleGanttDurationChange | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-gantt-duration-change |
| ui-funkcja | handleHybridRequirementsQtyChange | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-hybrid-requirements-qty-change |
| ui-funkcja | handleHybridNodeStatusChange | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor handle-hybrid-node-status-change |
| ui-funkcja | applyLeafDefaults | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor apply-leaf-defaults |
| ui-stan | leafDefaultsOpen | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor leaf-defaults-modal-state |
| ui-stan | leafDefaults | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor leaf-defaults-state |
| ui-funkcja | fetchLeafDefaults | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor fetch-leaf-defaults |
| ui-funkcja | saveLeafDefaultsToServer | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor save-leaf-defaults-to-server |

#### Frontend — stałe i utilsy (`wbsConstants.js`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stala | TASK_CATEGORIES | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor task-categories |
| ui-stala | MODULES | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor modules |
| ui-stala | darkTheme | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor dark-theme |
| ui-stala | TYPE_LABELS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor type-labels |
| ui-stala | TYPE_OPTIONS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor type-options |
| ui-funkcja | wbsTypeFromAny | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor wbs-type-from-any |
| ui-stala | BUDGET_TYPE_LABELS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor budget-type-labels |
| ui-stala | UNIT_OPTIONS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor unit-options |
| ui-stala | MATERIAL_STATUS_LABELS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor material-status-labels |
| ui-stala | STRUCTURE_STATUS_META | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor structure-status-meta |
| ui-stala | MATERIAL_STATUS_LABEL_TO_CODE | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor material-status-label-to-code |
| ui-stala | STRUCTURE_COMMON_CELL_CLASS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor structure-common-cell-class |
| ui-funkcja | defaultUnitForType | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor default-unit-for-type |
| ui-funkcja | sanitizeQtyInput | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor sanitize-qty-input |
| ui-funkcja | evalQtyFormula | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor eval-qty-formula |
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
| ui-stala | LEAF_TYPE_OPTIONS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor leaf-type-options |
| ui-stala | ZERO_LEAF_DEFAULTS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor zero-leaf-defaults |
| ui-funkcja | mergeLeafDefaults | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor merge-leaf-defaults |
| ui-funkcja | getLeafDefaultFrom | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor get-leaf-default-from |

### Moduł Logistyka — Baza materiałów (`apps/frontend/src/components/shared/MaterialDatabaseTab.jsx`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-zakladka | MaterialDatabaseTab | apps/frontend/src/components/shared/MaterialDatabaseTab.jsx | @anchor material-database-tab (brak — komponent domyślny) |
| ui-input | InlineCell | apps/frontend/src/components/shared/MaterialDatabaseTab.jsx | @anchor material-database-inline-cell |
| ui-stan | editingCell | apps/frontend/src/components/shared/MaterialDatabaseTab.jsx | @anchor material-database-editing-cell |
| ui-funkcja | handlePatchField | apps/frontend/src/components/shared/MaterialDatabaseTab.jsx | @anchor material-database-patch-field |
| ui-hook | mat-req-panel-global-update-listener | apps/frontend/src/components/shared/wbs/MaterialRequirementsPanel.jsx | @anchor mat-req-panel-global-update-listener |
| ui-hook | wbs-materials-panel-global-update-listener | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-panel-global-update-listener |
| ui-stan | comboRefs | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor product-card-combo-refs |
| ui-hook | useBeforeUnload | apps/frontend/src/hooks/useBeforeUnload.js | @anchor use-before-unload |

### Skrypty narzędziowe (root repo)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-skrypt | sync-obsidian.ps1 | sync-obsidian.ps1 | @anchor sync-obsidian-script |
| back-skrypt | setup-task-scheduler.ps1 | setup-task-scheduler.ps1 | @anchor setup-task-scheduler-script |

### Moduł Material Requirements

#### Schema (Prisma — `apps/backend/prisma/schema.prisma`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| schema-model | Material | apps/backend/prisma/schema.prisma | @anchor material |
| schema-pole | Material.id | apps/backend/prisma/schema.prisma | @anchor material-id |
| schema-pole | Material.manufacturer | apps/backend/prisma/schema.prisma | @anchor material-manufacturer |
| schema-pole | Material.model | apps/backend/prisma/schema.prisma | @anchor material-model |
| schema-pole | Material.productName | apps/backend/prisma/schema.prisma | @anchor material-product-name |
| schema-pole | Material.type | apps/backend/prisma/schema.prisma | @anchor material-type |
| schema-pole | Material.dataSheetUrl | apps/backend/prisma/schema.prisma | @anchor material-data-sheet-url |
| schema-pole | Material.dataSheetName | apps/backend/prisma/schema.prisma | @anchor material-data-sheet-name |
| schema-pole | Material.complianceUrl | apps/backend/prisma/schema.prisma | @anchor material-compliance-url |
| schema-pole | Material.complianceName | apps/backend/prisma/schema.prisma | @anchor material-compliance-name |
| schema-pole | Material.imageUrl | apps/backend/prisma/schema.prisma | @anchor material-image-url |
| schema-pole | Material.priceNetto | apps/backend/prisma/schema.prisma | @anchor material-price-netto |
| schema-pole | Material.productUrl | apps/backend/prisma/schema.prisma | @anchor material-product-url |
| schema-pole | Material.seller | apps/backend/prisma/schema.prisma | @anchor material-seller |
| schema-pole | Material.dataSheetDocumentId | apps/backend/prisma/schema.prisma | @anchor material-data-sheet-document-id |
| schema-pole | Material.complianceDocumentId | apps/backend/prisma/schema.prisma | @anchor material-compliance-document-id |
| schema-relacja | Material.dataSheetDocument | apps/backend/prisma/schema.prisma | @anchor material-data-sheet-document |
| schema-relacja | Material.complianceDocument | apps/backend/prisma/schema.prisma | @anchor material-compliance-document |
| schema-relacja | Material.requirements | apps/backend/prisma/schema.prisma | @anchor material-requirements |
| schema-relacja | Material.wbsAllocations | apps/backend/prisma/schema.prisma | @anchor material-wbs-allocations |
| schema-relacja | Material.stock | apps/backend/prisma/schema.prisma | @anchor material-stock |
| schema-model | MaterialStock | apps/backend/prisma/schema.prisma | @anchor material-stock |
| schema-pole | MaterialStock.id | apps/backend/prisma/schema.prisma | @anchor material-stock-id |
| schema-pole | MaterialStock.materialId | apps/backend/prisma/schema.prisma | @anchor material-stock-material-id |
| schema-pole | MaterialStock.quantity | apps/backend/prisma/schema.prisma | @anchor material-stock-quantity |
| schema-pole | MaterialStock.location | apps/backend/prisma/schema.prisma | @anchor material-stock-location |
| schema-relacja | MaterialStock.material | apps/backend/prisma/schema.prisma | @anchor material-stock-material |
| schema-model | MaterialRequirementsList | apps/backend/prisma/schema.prisma | @anchor material-requirements-list |
| schema-pole | MaterialRequirementsList.id | apps/backend/prisma/schema.prisma | @anchor mat-list-id |
| schema-pole | MaterialRequirementsList.nodeId | apps/backend/prisma/schema.prisma | @anchor mat-list-node-id |
| schema-pole | MaterialRequirementsList.name | apps/backend/prisma/schema.prisma | @anchor mat-list-name |
| schema-pole | MaterialRequirementsList.version | apps/backend/prisma/schema.prisma | @anchor mat-list-version |
| schema-pole | MaterialRequirementsList.isLocked | apps/backend/prisma/schema.prisma | @anchor mat-list-is-locked |
| schema-pole | MaterialRequirementsList.lockedBy | apps/backend/prisma/schema.prisma | @anchor mat-list-locked-by |
| schema-pole | MaterialRequirementsList.lockedAt | apps/backend/prisma/schema.prisma | @anchor mat-list-locked-at |
| schema-pole | MaterialRequirementsList.createdBy | apps/backend/prisma/schema.prisma | @anchor mat-list-created-by |
| schema-pole | MaterialRequirementsList.parentId | apps/backend/prisma/schema.prisma | @anchor mat-list-parent-id |
| schema-relacja | MaterialRequirementsList.node | apps/backend/prisma/schema.prisma | @anchor mat-list-node |
| schema-relacja | MaterialRequirementsList.parent | apps/backend/prisma/schema.prisma | @anchor mat-list-parent |
| schema-relacja | MaterialRequirementsList.children | apps/backend/prisma/schema.prisma | @anchor mat-list-children |
| schema-relacja | MaterialRequirementsList.requirements | apps/backend/prisma/schema.prisma | @anchor mat-list-requirements |
| schema-model | MaterialRequirement | apps/backend/prisma/schema.prisma | @anchor material-requirement |
| schema-pole | MaterialRequirement.id | apps/backend/prisma/schema.prisma | @anchor mat-req-id |
| schema-pole | MaterialRequirement.nodeId | apps/backend/prisma/schema.prisma | @anchor mat-req-node-id |
| schema-pole | MaterialRequirement.versionId | apps/backend/prisma/schema.prisma | @anchor mat-req-version-id |
| schema-pole | MaterialRequirement.listId | apps/backend/prisma/schema.prisma | @anchor mat-req-list-id |
| schema-pole | MaterialRequirement.name | apps/backend/prisma/schema.prisma | @anchor mat-req-name |
| schema-pole | MaterialRequirement.materialId | apps/backend/prisma/schema.prisma | @anchor mat-req-material-id |
| schema-pole | MaterialRequirement.type | apps/backend/prisma/schema.prisma | @anchor mat-req-type |
| schema-pole | MaterialRequirement.quantity | apps/backend/prisma/schema.prisma | @anchor mat-req-quantity |
| schema-pole | MaterialRequirement.unit | apps/backend/prisma/schema.prisma | @anchor mat-req-unit |
| schema-pole | MaterialRequirement.technicalSpec | apps/backend/prisma/schema.prisma | @anchor mat-req-technical-spec |
| schema-pole | MaterialRequirement.sourceDocument | apps/backend/prisma/schema.prisma | @anchor mat-req-source-document |
| schema-pole | MaterialRequirement.assignedSubtaskId | apps/backend/prisma/schema.prisma | @anchor mat-req-assigned-subtask-id |
| schema-pole | MaterialRequirement.wbsNodeId | apps/backend/prisma/schema.prisma | @anchor mat-req-wbs-node-id |
| schema-pole | MaterialRequirement.wbsNodeIds | apps/backend/prisma/schema.prisma | @anchor mat-req-wbs-node-ids |
| schema-pole | MaterialRequirement.wbsNodeAllocations | apps/backend/prisma/schema.prisma | @anchor mat-req-wbs-node-allocations |
| schema-pole | MaterialRequirement.isAiAssigned | apps/backend/prisma/schema.prisma | @anchor mat-req-is-ai-assigned |
| schema-pole | MaterialRequirement.aiConfidence | apps/backend/prisma/schema.prisma | @anchor mat-req-ai-confidence |
| schema-pole | MaterialRequirement.complianceData | apps/backend/prisma/schema.prisma | @anchor mat-req-compliance-data |
| schema-pole | MaterialRequirement.availability | apps/backend/prisma/schema.prisma | @anchor mat-req-availability |
| schema-pole | MaterialRequirement.budgetedPriceNetto | apps/backend/prisma/schema.prisma | @anchor mat-req-budgeted-price-netto |
| schema-pole | MaterialRequirement.offerId | apps/backend/prisma/schema.prisma | @anchor mat-req-offer-id |
| schema-pole | MaterialRequirement.offerPositionIdx | apps/backend/prisma/schema.prisma | @anchor mat-req-offer-position-idx |
| schema-pole | MaterialRequirement.offerPositionSnapshot | apps/backend/prisma/schema.prisma | @anchor mat-req-offer-position-snapshot |
| schema-pole | MaterialRequirement.status | apps/backend/prisma/schema.prisma | @anchor mat-req-status |
| schema-relacja | MaterialRequirement.material | apps/backend/prisma/schema.prisma | @anchor mat-req-material |
| schema-relacja | MaterialRequirement.node | apps/backend/prisma/schema.prisma | @anchor mat-req-node |
| schema-relacja | MaterialRequirement.version | apps/backend/prisma/schema.prisma | @anchor mat-req-version |
| schema-relacja | MaterialRequirement.list | apps/backend/prisma/schema.prisma | @anchor mat-req-list |
| schema-relacja | MaterialRequirement.assignedSubtask | apps/backend/prisma/schema.prisma | @anchor mat-req-assigned-subtask |
| schema-relacja | MaterialRequirement.wbsNode | apps/backend/prisma/schema.prisma | @anchor mat-req-wbs-node |
| schema-relacja | MaterialRequirement.proposals | apps/backend/prisma/schema.prisma | @anchor mat-req-proposals |
| schema-model | ProductProposal | apps/backend/prisma/schema.prisma | @anchor product-proposal |
| schema-pole | ProductProposal.id | apps/backend/prisma/schema.prisma | @anchor product-proposal-id |
| schema-pole | ProductProposal.materialRequirementId | apps/backend/prisma/schema.prisma | @anchor product-proposal-material-requirement-id |
| schema-pole | ProductProposal.productName | apps/backend/prisma/schema.prisma | @anchor product-proposal-product-name |
| schema-pole | ProductProposal.manufacturer | apps/backend/prisma/schema.prisma | @anchor product-proposal-manufacturer |
| schema-pole | ProductProposal.model | apps/backend/prisma/schema.prisma | @anchor product-proposal-model |
| schema-pole | ProductProposal.sourceUrl | apps/backend/prisma/schema.prisma | @anchor product-proposal-source-url |
| schema-pole | ProductProposal.priceNetto | apps/backend/prisma/schema.prisma | @anchor product-proposal-price-netto |
| schema-pole | ProductProposal.seller | apps/backend/prisma/schema.prisma | @anchor product-proposal-seller |
| schema-pole | ProductProposal.offerNumber | apps/backend/prisma/schema.prisma | @anchor product-proposal-offer-number |
| schema-pole | ProductProposal.availability | apps/backend/prisma/schema.prisma | @anchor product-proposal-availability |
| schema-pole | ProductProposal.imageUrl | apps/backend/prisma/schema.prisma | @anchor product-proposal-image-url |
| schema-pole | ProductProposal.isManual | apps/backend/prisma/schema.prisma | @anchor product-proposal-is-manual |
| schema-pole | ProductProposal.dataSheetUrl | apps/backend/prisma/schema.prisma | @anchor product-proposal-data-sheet-url |
| schema-pole | ProductProposal.dataSheetName | apps/backend/prisma/schema.prisma | @anchor product-proposal-data-sheet-name |
| schema-pole | ProductProposal.complianceUrl | apps/backend/prisma/schema.prisma | @anchor product-proposal-compliance-url |
| schema-pole | ProductProposal.complianceName | apps/backend/prisma/schema.prisma | @anchor product-proposal-compliance-name |
| schema-pole | ProductProposal.matchScore | apps/backend/prisma/schema.prisma | @anchor product-proposal-match-score |
| schema-pole | ProductProposal.isSelected | apps/backend/prisma/schema.prisma | @anchor product-proposal-is-selected |
| schema-pole | ProductProposal.isRejected | apps/backend/prisma/schema.prisma | @anchor product-proposal-is-rejected |
| schema-relacja | ProductProposal.materialRequirement | apps/backend/prisma/schema.prisma | @anchor product-proposal-material-requirement |

#### Backend (`apps/backend/src/material-requirements/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-controller | MaterialRequirementsController | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor material-requirements-controller |
| back-modul | MaterialRequirementsModule | apps/backend/src/material-requirements/material-requirements.module.ts | @anchor material-requirements-module |
| back-serwis | MaterialRequirementsService | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor material-requirements-service |
| back-funkcja | getWbsNodeTypes | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor get-wbs-node-types |
| back-funkcja | resolveUploadPath | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor resolve-upload-path |
| back-funkcja | getMarkersForWbsNodesBatch | apps/backend/src/schematics/schematics.service.ts | @anchor get-markers-for-wbs-nodes-batch |
| back-endpoint | GET /material-requirements/database | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-get-database |
| back-endpoint | GET /material-requirements/all-materials | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-get-all-materials |
| back-endpoint | GET /material-requirements/usage | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-get-usage |
| back-endpoint | GET /material-requirements/datasheets | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-get-all-datasheets |
| back-endpoint | GET /material-requirements/datasheets/:nodeId | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-get-datasheets-by-node |
| back-endpoint | GET /material-requirements/with-offers | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-get-with-offers |
| back-endpoint | GET /material-requirements/node/:nodeId | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-get-by-node |
| back-endpoint | GET /material-requirements/lists/node/:nodeId | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-get-lists |
| back-endpoint | POST /material-requirements/lists/node/:nodeId/default | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-default-list |
| back-endpoint | POST /material-requirements/lists | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-list |
| back-endpoint | PATCH /material-requirements/lists/:listId | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-patch-list |
| back-endpoint | DELETE /material-requirements/lists/:listId | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-delete-list |
| back-endpoint | POST /material-requirements/lists/:listId/lock | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-lock-list |
| back-endpoint | POST /material-requirements/lists/:listId/new-version | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-new-version |
| back-endpoint | DELETE /material-requirements/node/:nodeId/all | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-delete-by-node |
| back-endpoint | POST /material-requirements/clear-assignments | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-clear-assignments |
| back-endpoint | POST /material-requirements/clone-for-wbs | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-clone-for-wbs |
| back-endpoint | GET /material-requirements/:id | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-get-one |
| back-endpoint | POST /material-requirements/ | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-create |
| back-endpoint | PATCH /material-requirements/:id | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-patch-update |
| back-endpoint | DELETE /material-requirements/:id | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-delete-one |
| back-endpoint | PATCH /material-requirements/:id/offer | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-patch-offer |
| back-endpoint | DELETE /material-requirements/:id/offer | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-delete-offer |
| back-endpoint | POST /offers/:id/auto-assign | apps/backend/src/offers/offers.controller.ts | @anchor offers-post-auto-assign |
| back-endpoint | PATCH /offers/:id/positions | apps/backend/src/offers/offers.controller.ts | @anchor offers-patch-positions |
| back-endpoint | POST /material-requirements/extract/:nodeId | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-extract |
| back-endpoint | POST /material-requirements/:id/evaluate-compliance | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-evaluate-compliance |
| back-endpoint | POST /material-requirements/:id/search-products | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-search-products |
| back-endpoint | POST /material-requirements/:id/proposals | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-post-add-proposal |
| back-endpoint | PATCH /material-requirements/proposals/:proposalId/select | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-patch-select-proposal |
| back-endpoint | PATCH /material-requirements/proposals/:proposalId | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-patch-update-proposal |
| back-endpoint | DELETE /material-requirements/proposals/:proposalId | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-delete-proposal |

#### Backend (`apps/backend/src/materials/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-controller | MaterialsController | apps/backend/src/materials/materials.controller.ts | @anchor materials-controller |
| back-modul | MaterialsModule | apps/backend/src/materials/materials.module.ts | @anchor materials-module |
| back-serwis | MaterialsService | apps/backend/src/materials/materials.service.ts | @anchor materials-service |
| back-funkcja | MaterialsService.findAll | apps/backend/src/materials/materials.service.ts | @anchor materials-find-all |
| back-funkcja | MaterialsService.findDatabase | apps/backend/src/materials/materials.service.ts | @anchor materials-find-database |
| back-funkcja | MaterialsService.findOne | apps/backend/src/materials/materials.service.ts | @anchor materials-find-one |
| back-funkcja | MaterialsService.create | apps/backend/src/materials/materials.service.ts | @anchor materials-create |
| back-funkcja | MaterialsService.update | apps/backend/src/materials/materials.service.ts | @anchor materials-update |
| back-funkcja | MaterialsService.remove | apps/backend/src/materials/materials.service.ts | @anchor materials-remove |
| back-funkcja | MaterialsService.findStock | apps/backend/src/materials/materials.service.ts | @anchor materials-find-stock |
| back-funkcja | MaterialsService.updateStock | apps/backend/src/materials/materials.service.ts | @anchor materials-update-stock |
| back-funkcja | MaterialsService.findProposalHistory | apps/backend/src/materials/materials.service.ts | @anchor materials-find-proposal-history |
| back-funkcja | MaterialsService.createFromDatasheet | apps/backend/src/materials/materials.service.ts | @anchor materials-from-datasheet |
| back-funkcja | MaterialsService.resolveUploadPath | apps/backend/src/materials/materials.service.ts | @anchor materials-resolve-upload-path |
| back-funkcja | MaterialsService.getImageStream | apps/backend/src/materials/materials.service.ts | @anchor materials-get-image-stream |
| back-funkcja | MaterialsService.mergeInto | apps/backend/src/materials/materials.service.ts | @anchor materials-merge-into |
| back-endpoint | GET /materials | apps/backend/src/materials/materials.controller.ts | @anchor materials-get-all |
| back-endpoint | GET /materials/database | apps/backend/src/materials/materials.controller.ts | @anchor materials-get-database |
| back-endpoint | GET /materials/:id | apps/backend/src/materials/materials.controller.ts | @anchor materials-get-one |
| back-endpoint | GET /materials/:id/image | apps/backend/src/materials/materials.controller.ts | @anchor materials-get-image |
| back-endpoint | POST /materials | apps/backend/src/materials/materials.controller.ts | @anchor materials-post-create |
| back-endpoint | PATCH /materials/:id | apps/backend/src/materials/materials.controller.ts | @anchor materials-patch-update |
| back-endpoint | DELETE /materials/:id | apps/backend/src/materials/materials.controller.ts | @anchor materials-delete-one |
| back-endpoint | GET /materials/:id/stock | apps/backend/src/materials/materials.controller.ts | @anchor materials-get-stock |
| back-endpoint | PATCH /materials/:id/stock | apps/backend/src/materials/materials.controller.ts | @anchor materials-patch-stock |
| back-endpoint | GET /materials/:id/proposals | apps/backend/src/materials/materials.controller.ts | @anchor materials-get-proposals |
| back-endpoint | POST /materials/from-datasheet | apps/backend/src/materials/materials.controller.ts | @anchor materials-post-from-datasheet |

#### Frontend (`apps/frontend/src/components/shared/wbs/MaterialRequirementsPanel.jsx`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-sekcja | MaterialRequirementsPanel | apps/frontend/src/components/shared/wbs/MaterialRequirementsPanel.jsx | @anchor material-requirements-panel |
| ui-sekcja | ExpandedDetail | apps/frontend/src/components/shared/wbs/MaterialRequirementsPanel.jsx | @anchor expanded-detail |
| ui-sekcja | ProposalsSection | apps/frontend/src/components/shared/wbs/MaterialRequirementsPanel.jsx | @anchor proposals-section |
| ui-stan | expandedId | apps/frontend/src/components/shared/wbs/MaterialRequirementsPanel.jsx | @anchor expanded-id |
| ui-stan | fields (ExpandedDetail) | apps/frontend/src/components/shared/wbs/MaterialRequirementsPanel.jsx | @anchor expanded-detail-fields |
| ui-stan | newProp | apps/frontend/src/components/shared/wbs/MaterialRequirementsPanel.jsx | @anchor new-prop |

> `ui-stan` `newProp.sourceUrl` — pole „Adres www" w formularzu ręcznego dodania propozycji; zapisywane przez `POST /material-requirements/:id/proposals` (`@anchor mat-req-post-add-proposal`). Mapuje na `schema-pole` `ProductProposal.sourceUrl` (`@anchor product-proposal-source-url`).

### Moduł Mobile (`apps/frontend/src/components/Mobile/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stan | mobileView | apps/frontend/src/App.jsx | @anchor mobile-view-state |
| ui-widok | MobileHome | apps/frontend/src/components/Mobile/MobileHome.jsx | @anchor mobile-home |
| ui-przycisk | mobile-home-tile-tasks | apps/frontend/src/components/Mobile/MobileHome.jsx | @anchor mobile-home-tile-tasks |
| ui-przycisk | mobile-home-tile-tree | apps/frontend/src/components/Mobile/MobileHome.jsx | @anchor mobile-home-tile-tree |
| ui-widok | MobileOrdersTree | apps/frontend/src/components/Mobile/MobileOrdersTree.jsx | @anchor mobile-orders-tree |
| ui-sekcja | TreeNode | apps/frontend/src/components/Mobile/MobileOrdersTree.jsx | @anchor mobile-tree-node |
| ui-panel | mobile-tree-schematic-panel | apps/frontend/src/components/Mobile/MobileOrdersTree.jsx | @anchor mobile-tree-schematic-panel |

### Moduł Layout — DynamicSidebar (`apps/frontend/src/components/Layout/DynamicSidebar.jsx`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stan | dragId | apps/frontend/src/components/Layout/DynamicSidebar.jsx | @anchor sidebar-drag-id |
| ui-stan | dragOverId | apps/frontend/src/components/Layout/DynamicSidebar.jsx | @anchor sidebar-drag-over-id |
| ui-funkcja | handleSidebarMove | apps/frontend/src/components/Layout/DynamicSidebar.jsx | @anchor handle-sidebar-move |
| ui-przycisk | sidebar-firma-button | apps/frontend/src/components/Layout/DynamicSidebar.jsx | @anchor sidebar-firma-button |

### Moduł Company — „Moja firma" (singleton)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| schema-model | Company | apps/backend/prisma/schema.prisma | @anchor company-id |
| schema-pole | Company.name | apps/backend/prisma/schema.prisma | @anchor company-name |
| schema-pole | Company.number | apps/backend/prisma/schema.prisma | @anchor company-number |
| schema-pole | Company.additionalDesc | apps/backend/prisma/schema.prisma | @anchor company-additional-desc |
| schema-pole | Company.addressStreet | apps/backend/prisma/schema.prisma | @anchor company-address-street |
| schema-pole | Company.addressCity | apps/backend/prisma/schema.prisma | @anchor company-address-city |
| schema-pole | Company.addressZipCode | apps/backend/prisma/schema.prisma | @anchor company-address-zip-code |
| schema-pole | Company.addressCountry | apps/backend/prisma/schema.prisma | @anchor company-address-country |
| schema-pole | Company.addressLatitude | apps/backend/prisma/schema.prisma | @anchor company-address-latitude |
| schema-pole | Company.addressLongitude | apps/backend/prisma/schema.prisma | @anchor company-address-longitude |
| schema-pole | Company.customData | apps/backend/prisma/schema.prisma | @anchor company-custom-data |
| schema-pole | Company.contactEmail | apps/backend/prisma/schema.prisma | @anchor company-contact-email |
| schema-pole | Company.contactFirstName | apps/backend/prisma/schema.prisma | @anchor company-contact-first-name |
| schema-pole | Company.contactLastName | apps/backend/prisma/schema.prisma | @anchor company-contact-last-name |
| schema-pole | Company.contactPhone | apps/backend/prisma/schema.prisma | @anchor company-contact-phone |
| back-stala | SINGLETON_ID | apps/backend/src/company/company.service.ts | @anchor company-singleton-id |
| back-funkcja | CompanyService.get | apps/backend/src/company/company.service.ts | @anchor company-service-get |
| back-funkcja | CompanyService.update | apps/backend/src/company/company.service.ts | @anchor company-service-update |
| back-endpoint | GET/PATCH /company | apps/backend/src/company/company.controller.ts | @anchor back-endpoint-company |
| ui-widok | FirmaPage | apps/frontend/src/FirmaPage.jsx | @anchor firma-page |
| ui-zakladka | tab-site-info-order | apps/frontend/src/DashboardPage.jsx | @anchor tab-site-info-order |
| ui-funkcja | handleFinancialOfferApprove | apps/frontend/src/DashboardPage.jsx | @anchor handle-financial-offer-approve |

### Moduł Dokumentacja — podgląd PDF z highlightami

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-sekcja | PdfPageWithHighlights | apps/frontend/src/components/shared/PdfPageWithHighlights.jsx | @anchor pdf-page-with-highlights |
| ui-stan | hasRendered | apps/frontend/src/components/shared/PdfPageWithHighlights.jsx | @anchor pdf-page-has-rendered |
| ui-stala | placeholderHeight | apps/frontend/src/components/shared/PdfPageWithHighlights.jsx | @anchor pdf-page-placeholder-height |

### Wersja aplikacji

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stala | APP_VERSION | apps/frontend/src/version.js | @anchor app-version |
| schema-model | SmtpSettings | apps/backend/prisma/schema.prisma | @anchor smtp-settings-id |
| schema-pole | SmtpSettings.host | apps/backend/prisma/schema.prisma | @anchor smtp-settings-host |
| schema-pole | SmtpSettings.port | apps/backend/prisma/schema.prisma | @anchor smtp-settings-port |
| schema-pole | SmtpSettings.secure | apps/backend/prisma/schema.prisma | @anchor smtp-settings-secure |
| schema-pole | SmtpSettings.username | apps/backend/prisma/schema.prisma | @anchor smtp-settings-username |
| schema-pole | SmtpSettings.password | apps/backend/prisma/schema.prisma | @anchor smtp-settings-password |
| schema-pole | SmtpSettings.fromEmail | apps/backend/prisma/schema.prisma | @anchor smtp-settings-from-email |
| schema-pole | SmtpSettings.fromName | apps/backend/prisma/schema.prisma | @anchor smtp-settings-from-name |
| schema-pole | SmtpSettings.replyTo | apps/backend/prisma/schema.prisma | @anchor smtp-settings-reply-to |
| schema-pole | SmtpSettings.updatedAt | apps/backend/prisma/schema.prisma | @anchor smtp-settings-updated-at |
| back-stala | SINGLETON_ID (smtp) | apps/backend/src/smtp/smtp.service.ts | @anchor smtp-singleton-id |
| back-funkcja | SmtpService.getRaw | apps/backend/src/smtp/smtp.service.ts | @anchor smtp-service-get-raw |
| back-funkcja | SmtpService.get | apps/backend/src/smtp/smtp.service.ts | @anchor smtp-service-get |
| back-funkcja | SmtpService.update | apps/backend/src/smtp/smtp.service.ts | @anchor smtp-service-update |
| back-funkcja | SmtpService.buildTransport | apps/backend/src/smtp/smtp.service.ts | @anchor smtp-build-transport |
| back-funkcja | SmtpService.sendMail | apps/backend/src/smtp/smtp.service.ts | @anchor smtp-send-mail |
| back-funkcja | SmtpService.sendTest | apps/backend/src/smtp/smtp.service.ts | @anchor smtp-send-test |
| back-controller | SmtpController | apps/backend/src/smtp/smtp.controller.ts | @anchor smtp-controller |
| back-modul | SmtpModule | apps/backend/src/smtp/smtp.module.ts | @anchor smtp-module |
| back-funkcja | PdfService.render | apps/backend/src/pdf/pdf.service.ts | @anchor pdf-render |
| back-controller | PdfController | apps/backend/src/pdf/pdf.controller.ts | @anchor pdf-controller |
| back-modul | PdfModule | apps/backend/src/pdf/pdf.module.ts | @anchor pdf-module |
| back-funkcja | MailService.sendUserConfirmation | apps/backend/src/mail/mail.service.ts | @anchor mail-send-user-confirmation |
| back-funkcja | MailService.sendExport | apps/backend/src/mail/mail.service.ts | @anchor mail-send-export |
| back-funkcja | MailService.getRecipients | apps/backend/src/mail/mail.service.ts | @anchor mail-get-recipients |
| back-controller | MailController | apps/backend/src/mail/mail.controller.ts | @anchor mail-controller |
| back-modul | MailModule | apps/backend/src/mail/mail.module.ts | @anchor mail-module |
| ui-funkcja | exportMail (moduł) | apps/frontend/src/utils/exportMail.js | @anchor export-mail-util |
| ui-funkcja | downloadBlob | apps/frontend/src/utils/exportMail.js | @anchor download-blob |
| ui-funkcja | renderHtmlToPdf | apps/frontend/src/utils/exportMail.js | @anchor render-html-to-pdf |
| ui-funkcja | resolveArtifact | apps/frontend/src/utils/exportMail.js | @anchor resolve-artifact |
| ui-funkcja | inlineImages | apps/frontend/src/utils/exportMail.js | @anchor inline-images |
| ui-funkcja | fetchRecipients | apps/frontend/src/utils/exportMail.js | @anchor fetch-recipients |
| ui-funkcja | sendExport | apps/frontend/src/utils/exportMail.js | @anchor send-export |
| ui-input | RecipientInput | apps/frontend/src/components/shared/RecipientInput.jsx | @anchor recipient-input |
| ui-modal | ExportChoiceModal | apps/frontend/src/components/shared/ExportChoiceModal.jsx | @anchor export-choice-modal |
| ui-widok | SmtpSettingsPage | apps/frontend/src/SmtpSettingsPage.jsx | @anchor smtp-settings-page |
| ui-stan | isAdmin (sidebar) | apps/frontend/src/components/Layout/DynamicSidebar.jsx | @anchor sidebar-is-admin |
| ui-przycisk | Poczta SMTP (sidebar) | apps/frontend/src/components/Layout/DynamicSidebar.jsx | @anchor sidebar-smtp-button |
| ui-przycisk | Powiadomienia (sidebar) | apps/frontend/src/components/Layout/DynamicSidebar.jsx | @anchor sidebar-notifications-button |
| ui-widok | NotificationSettingsPage | apps/frontend/src/NotificationSettingsPage.jsx | @anchor notification-settings-page |
| ui-stan | formularz ustawień powiadomień | apps/frontend/src/NotificationSettingsPage.jsx | @anchor notification-settings-form |
| ui-stan | diagnostyka powiadomień | apps/frontend/src/NotificationSettingsPage.jsx | @anchor notification-settings-diagnostics |
| ui-funkcja | StatusRow (panel powiadomień) | apps/frontend/src/NotificationSettingsPage.jsx | @anchor notification-status-row |
| ui-funkcja | Switch (panel powiadomień) | apps/frontend/src/NotificationSettingsPage.jsx | @anchor notification-switch |
| ui-stan | pendingExport (WBS) | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor pending-export |
| ui-stan | pendingExport (Requirements) | apps/frontend/src/components/shared/RequirementsTab.jsx | @anchor requirements-pending-export |
| ui-stan | pendingExport (DocumentViewer) | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor document-viewer-pending-export |
| ui-stan | pendingExport (DocSidebar) | apps/frontend/src/components/Documentation/DocumentationSidebar.jsx | @anchor doc-sidebar-pending-export |
| ui-funkcja | buildDownloadArtifact | apps/frontend/src/utils/downloadPdfWithHighlights.js | @anchor build-download-artifact |
| ui-stan | docxHtml (DocumentViewer) | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor document-viewer-docx-html |
| ui-stan | xlsxSheets (DocumentViewer) | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor document-viewer-xlsx-sheets |

### Moduł Oferty — panel pozycji z oferty (DocumentViewer)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-modal | OfferParsedChoiceModal | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-parsed-choice-modal |
| ui-stan | choiceOpen (OfferParsePanel) | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-choice-open |
| ui-stan | autoSave (OfferParsePanel) | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-autosave-state |
| ui-funkcja | savePositions (OfferParsePanel) | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-save-positions |
| ui-funkcja | parseNow (OfferParsePanel) | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-parse-now |

### MS To Do connection panel (Etap 10)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stan | ms-todo-connection-state | apps/frontend/src/NotificationSettingsPage.jsx | @anchor ms-todo-connection-state |
| ui-sekcja | ms-todo-connection-panel | apps/frontend/src/NotificationSettingsPage.jsx | @anchor ms-todo-connection-panel |

### Service Worker REMINDER push (Etap 9)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-funkcja | PushService.sendToUser | apps/backend/src/push/push.service.ts | @anchor push-send-to-user |
| ui-funkcja | sw push handler | apps/frontend/src/sw.js | @anchor sw-push-handler |
| ui-funkcja | sw notificationclick | apps/frontend/src/sw.js | @anchor sw-notification-click |
| ui-funkcja | App.jsx SW message handler | apps/frontend/src/App.jsx | @anchor app-sw-message-handler |

### taskListSlug UI + slug-check (Etap 8)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-funkcja | slugify | apps/frontend/src/components/shared/NodeInfoTab.jsx | @anchor node-info-slugify |
| ui-stan | slugStatus | apps/frontend/src/components/shared/NodeInfoTab.jsx | @anchor node-info-slug-status |
| ui-funkcja | handleSlugChange | apps/frontend/src/components/shared/NodeInfoTab.jsx | @anchor node-info-slug-change |
| back-endpoint | GET /process-tree/slug-check | apps/backend/src/process-tree/process-tree.controller.ts | @anchor process-tree-slug-check-endpoint |
| back-funkcja | ProcessTreeService.checkSlugAvailable | apps/backend/src/process-tree/process-tree.service.ts | @anchor process-tree-slug-check |
| back-dto | UpdateNodeDto.taskListSlug | apps/backend/src/process-tree/dto/process-tree.dto.ts | @anchor update-node-dto-task-list-slug |

### TaskReminderToast + alerty (Etap 7)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-modal | TaskReminderToast | apps/frontend/src/components/shared/TaskReminderToast.jsx | @anchor task-reminder-toast |
| ui-funkcja | TaskReminderToast.handleAction | apps/frontend/src/components/shared/TaskReminderToast.jsx | @anchor task-reminder-toast-action |
| ui-stan | dashboard-due-reminders | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-due-reminders |
| back-endpoint | GET /my-tasks/reminders/due | apps/backend/src/user-tasks/user-tasks.controller.ts | @anchor user-tasks-reminders-due-endpoint |
| back-endpoint | PATCH /my-tasks/reminders/:id | apps/backend/src/user-tasks/user-tasks.controller.ts | @anchor user-tasks-reminder-handle-endpoint |
| back-funkcja | UserTasksService.getDueReminders | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-due-reminders |
| back-funkcja | UserTasksService.handleReminder | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-handle-reminder |
| back-funkcja | UserTasksService.createReminder | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-create-reminder |
| back-funkcja | UserTasksService.getRemindersForTask | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-list-reminders |
| back-funkcja | UserTasksService.deleteReminder | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-delete-reminder |
| back-endpoint | DELETE /my-tasks/reminders/:id | apps/backend/src/user-tasks/user-tasks.controller.ts | @anchor user-tasks-reminder-delete-endpoint |
| back-endpoint | GET /my-tasks/:id/reminders | apps/backend/src/user-tasks/user-tasks.controller.ts | @anchor user-tasks-reminders-list-endpoint |
| back-endpoint | POST /my-tasks/:id/reminders | apps/backend/src/user-tasks/user-tasks.controller.ts | @anchor user-tasks-reminder-create-endpoint |
| ui-stala | ALARM_INTERVALS | apps/frontend/src/components/shared/MyTasksModal.jsx | @anchor my-tasks-alarm-interval-options |
| ui-modal | CyclicAlarmEditor | apps/frontend/src/components/shared/MyTasksModal.jsx | @anchor my-tasks-cyclic-alarm-editor |

### MyTasksModal — frontend (Etap 6)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-modal | MyTasksModal | apps/frontend/src/components/shared/MyTasksModal.jsx | @anchor my-tasks-modal-component |
| ui-funkcja | formatDeadline | apps/frontend/src/components/shared/MyTasksModal.jsx | @anchor my-tasks-modal |
| ui-karta | TaskCard | apps/frontend/src/components/shared/MyTasksModal.jsx | @anchor my-tasks-task-card |
| ui-funkcja | MyTasksModal.handleDone | apps/frontend/src/components/shared/MyTasksModal.jsx | @anchor my-tasks-mark-done |
| ui-stan | TaskCard.editingTitle | apps/frontend/src/components/shared/MyTasksModal.jsx | @anchor my-tasks-title-edit |
| ui-funkcja | MyTasksModal.handleRename | apps/frontend/src/components/shared/MyTasksModal.jsx | @anchor my-tasks-rename |
| ui-stan | dashboard-my-tasks-open | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-my-tasks-open |

### Moduł UserTasks + NotificationCron (Etap 4+5)

#### Backend (`apps/backend/src/user-tasks/`, `apps/backend/src/notification-cron/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-modul | UserTasksModule | apps/backend/src/user-tasks/user-tasks.module.ts | @anchor user-tasks-module |
| back-serwis | UserTasksService | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-service |
| back-controller | UserTasksController | apps/backend/src/user-tasks/user-tasks.controller.ts | @anchor user-tasks-controller |
| back-serwis | TaskSyncService | apps/backend/src/user-tasks/task-sync.service.ts | @anchor task-sync-service |
| back-funkcja | TaskSyncService.syncSingleUser | apps/backend/src/user-tasks/task-sync.service.ts | @anchor task-sync-single-user |
| back-funkcja | TaskSyncService.processDeltaTasks | apps/backend/src/user-tasks/task-sync.service.ts | @anchor task-sync-process-delta |
| back-funkcja | TaskSyncService.resolveNodeId | apps/backend/src/user-tasks/task-sync.service.ts | @anchor task-sync-resolve-node-id |
| back-funkcja | TaskSyncService.pushTaskToGraph | apps/backend/src/user-tasks/task-sync.service.ts | @anchor task-sync-push-to-graph |
| back-funkcja | UserTasksService.listForUser | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-list |
| back-funkcja | UserTasksService.create | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-create |
| back-funkcja | UserTasksService.update | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-update |
| back-funkcja | UserTasksService.softDelete | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-soft-delete |
| back-funkcja | UserTasksService.cleanupTrash | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-trash-cleanup |
| back-funkcja | UserTasksService.syncReminderForTask | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-sync-reminder |
| back-funkcja | UserTasksService.pushNewTaskToGraph | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-push-new-to-graph |
| back-funkcja | UserTasksService.pushUpdateToGraph | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-push-update-to-graph |
| back-funkcja | UserTasksService.resolveIgniteListId | apps/backend/src/user-tasks/user-tasks.service.ts | @anchor user-tasks-resolve-ignite-list-id |
| back-endpoint | GET /my-tasks | apps/backend/src/user-tasks/user-tasks.controller.ts | @anchor user-tasks-get-endpoint |
| back-endpoint | POST /my-tasks | apps/backend/src/user-tasks/user-tasks.controller.ts | @anchor user-tasks-create-endpoint |
| back-endpoint | PATCH /my-tasks/:id | apps/backend/src/user-tasks/user-tasks.controller.ts | @anchor user-tasks-update-endpoint |
| back-endpoint | DELETE /my-tasks/:id | apps/backend/src/user-tasks/user-tasks.controller.ts | @anchor user-tasks-delete-endpoint |
| back-modul | NotificationCronModule | apps/backend/src/notification-cron/notification-cron.module.ts | @anchor notification-cron-module |
| back-serwis | NotificationCronService | apps/backend/src/notification-cron/notification-cron.service.ts | @anchor notification-cron-service |
| back-funkcja | NotificationCronService.syncMsTodo | apps/backend/src/notification-cron/notification-cron.service.ts | @anchor notification-cron-ms-todo-sync |
| back-funkcja | NotificationCronService.dispatchReminders | apps/backend/src/notification-cron/notification-cron.service.ts | @anchor notification-cron-reminder-dispatch |
| back-funkcja | NotificationCronService.cleanupTrash | apps/backend/src/notification-cron/notification-cron.service.ts | @anchor notification-cron-trash-cleanup |

### Moduł MsTodo — MS Graph / To Do service

#### Backend (`apps/backend/src/ms-todo/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-modul | MsTodoModule | apps/backend/src/ms-todo/ms-todo.module.ts | @anchor ms-todo-module |
| back-serwis | MsTodoService | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-service |
| back-controller | MsTodoController | apps/backend/src/ms-todo/ms-todo.controller.ts | @anchor ms-todo-controller |
| back-funkcja | MsTodoService.getValidAccessToken | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-get-valid-token |
| back-funkcja | MsTodoService.fetchLists | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-fetch-lists |
| back-funkcja | MsTodoService.fetchTasksDelta | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-fetch-tasks-delta |
| back-funkcja | MsTodoService.createTask | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-create-task |
| back-funkcja | MsTodoService.createList | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-create-list |
| back-funkcja | MsTodoService.updateTask | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-update-task |
| back-funkcja | MsTodoService.deleteTask | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-delete-task |
| back-funkcja | MsTodoService.getStatus | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-get-status |
| back-funkcja | MsTodoService.disconnect | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-disconnect |
| back-funkcja | MsTodoService.bootstrapSync | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-bootstrap-sync |
| back-funkcja | MsTodoService.updateSyncState | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-update-sync-state |
| back-funkcja | MsTodoService.handleGraphError | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-handle-graph-error |
| back-endpoint | GET /ms-todo/status | apps/backend/src/ms-todo/ms-todo.controller.ts | @anchor ms-todo-get-status-endpoint |
| back-endpoint | GET /ms-todo/lists | apps/backend/src/ms-todo/ms-todo.controller.ts | @anchor ms-todo-get-lists-endpoint |
| back-endpoint | DELETE /ms-todo/disconnect | apps/backend/src/ms-todo/ms-todo.controller.ts | @anchor ms-todo-disconnect-endpoint |
| back-endpoint | POST /ms-todo/resync | apps/backend/src/ms-todo/ms-todo.controller.ts | @anchor ms-todo-resync-endpoint |
| schema-pole | UserMsToken.needsReauth | apps/backend/prisma/schema.prisma | @anchor user-ms-token-needs-reauth |
| back-funkcja | MsTodoService.markNeedsReauth | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-mark-needs-reauth |
| back-funkcja | MsTodoService.clearNeedsReauth | apps/backend/src/ms-todo/ms-todo.service.ts | @anchor ms-todo-clear-reauth |

### Moduł UserTask — zadania osobiste

#### Schema (Prisma — `apps/backend/prisma/schema.prisma`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| schema-model | UserTask | apps/backend/prisma/schema.prisma | @anchor user-task |
| schema-pole | UserTask.id | apps/backend/prisma/schema.prisma | @anchor user-task-id |
| schema-pole | UserTask.userId | apps/backend/prisma/schema.prisma | @anchor user-task-user-id |
| schema-pole | UserTask.nodeId | apps/backend/prisma/schema.prisma | @anchor user-task-node-id |
| schema-pole | UserTask.title | apps/backend/prisma/schema.prisma | @anchor user-task-title |
| schema-pole | UserTask.status | apps/backend/prisma/schema.prisma | @anchor user-task-status |
| schema-pole | UserTask.plannedStart | apps/backend/prisma/schema.prisma | @anchor user-task-planned-start |
| schema-pole | UserTask.plannedEnd | apps/backend/prisma/schema.prisma | @anchor user-task-planned-end |
| schema-pole | UserTask.msToDoId | apps/backend/prisma/schema.prisma | @anchor user-task-ms-todo-id |
| schema-pole | UserTask.msListName | apps/backend/prisma/schema.prisma | @anchor user-task-ms-list-name |
| schema-pole | UserTask.msEtag | apps/backend/prisma/schema.prisma | @anchor user-task-ms-etag |
| schema-pole | UserTask.source | apps/backend/prisma/schema.prisma | @anchor user-task-source |
| schema-pole | UserTask.deletedAt | apps/backend/prisma/schema.prisma | @anchor user-task-deleted-at |
| schema-relacja | UserTask.user | apps/backend/prisma/schema.prisma | @anchor user-task-user |
| schema-relacja | UserTask.node | apps/backend/prisma/schema.prisma | @anchor user-task-node |
| schema-relacja | UserTask.reminders | apps/backend/prisma/schema.prisma | @anchor user-task-reminders |
| schema-model | TaskReminder | apps/backend/prisma/schema.prisma | @anchor task-reminder |
| schema-pole | TaskReminder.userTaskId | apps/backend/prisma/schema.prisma | @anchor task-reminder-user-task-id |
| schema-pole | TaskReminder.userId | apps/backend/prisma/schema.prisma | @anchor task-reminder-user-id |
| schema-pole | TaskReminder.remindAt | apps/backend/prisma/schema.prisma | @anchor task-reminder-remind-at |
| schema-pole | TaskReminder.sentAt | apps/backend/prisma/schema.prisma | @anchor task-reminder-sent-at |
| schema-pole | TaskReminder.snoozedFrom | apps/backend/prisma/schema.prisma | @anchor task-reminder-snoozed-from |
| schema-pole | TaskReminder.recurIntervalMinutes | apps/backend/prisma/schema.prisma | @anchor task-reminder-recur-interval-minutes |
| schema-pole | TaskReminder.recurEnd | apps/backend/prisma/schema.prisma | @anchor task-reminder-recur-end |
| schema-pole | TaskReminder.lastFiredAt | apps/backend/prisma/schema.prisma | @anchor task-reminder-last-fired-at |
| schema-model | MsTodoSyncState | apps/backend/prisma/schema.prisma | @anchor ms-todo-sync-state |
| schema-pole | MsTodoSyncState.deltaLink | apps/backend/prisma/schema.prisma | @anchor ms-todo-sync-state-delta-link |
| schema-pole | MsTodoSyncState.lastSyncAt | apps/backend/prisma/schema.prisma | @anchor ms-todo-sync-state-last-sync-at |
| schema-pole | ProcessNode.taskListSlug | apps/backend/prisma/schema.prisma | @anchor process-node-task-list-slug |

### Moduł NotificationSettings

#### Schema (Prisma — `apps/backend/prisma/schema.prisma`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| schema-model | SystemNotificationSettings | apps/backend/prisma/schema.prisma | @anchor notif-settings-id |
| schema-pole | SystemNotificationSettings.defaultReminderHour | apps/backend/prisma/schema.prisma | @anchor notif-settings-default-reminder-hour |
| schema-json | SystemNotificationSettings.snoozePresetsMinutes | apps/backend/prisma/schema.prisma | @anchor notif-settings-snooze-presets |
| schema-pole | SystemNotificationSettings.trashRetentionDays | apps/backend/prisma/schema.prisma | @anchor notif-settings-trash-retention-days |
| schema-pole | SystemNotificationSettings.msTodoSyncIntervalMinutes | apps/backend/prisma/schema.prisma | @anchor notif-settings-ms-todo-sync-interval |
| schema-pole | SystemNotificationSettings.msTodoEnabled | apps/backend/prisma/schema.prisma | @anchor notif-settings-ms-todo-enabled |
| schema-pole | SystemNotificationSettings.webPushEnabled | apps/backend/prisma/schema.prisma | @anchor notif-settings-web-push-enabled |
| schema-pole | SystemNotificationSettings.updatedAt | apps/backend/prisma/schema.prisma | @anchor notif-settings-updated-at |

#### Backend (`apps/backend/src/notification-settings/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-modul | NotificationSettingsModule | apps/backend/src/notification-settings/notification-settings.module.ts | @anchor notif-settings-module |
| back-serwis | NotificationSettingsService | apps/backend/src/notification-settings/notification-settings.service.ts | @anchor notif-settings-service |
| back-stala | SINGLETON_ID (notif) | apps/backend/src/notification-settings/notification-settings.service.ts | @anchor notif-settings-singleton-id |
| back-funkcja | NotificationSettingsService.getOrCreate | apps/backend/src/notification-settings/notification-settings.service.ts | @anchor notif-settings-service-get-or-create |
| back-funkcja | NotificationSettingsService.get | apps/backend/src/notification-settings/notification-settings.service.ts | @anchor notif-settings-service-get |
| back-funkcja | NotificationSettingsService.update | apps/backend/src/notification-settings/notification-settings.service.ts | @anchor notif-settings-service-update |
| back-funkcja | NotificationSettingsService.getStats | apps/backend/src/notification-settings/notification-settings.service.ts | @anchor notif-settings-service-get-stats |
| back-controller | NotificationSettingsController | apps/backend/src/notification-settings/notification-settings.controller.ts | @anchor notif-settings-controller |
| back-endpoint | GET /notification-settings | apps/backend/src/notification-settings/notification-settings.controller.ts | @anchor notif-settings-controller |
| back-endpoint | PATCH /notification-settings | apps/backend/src/notification-settings/notification-settings.controller.ts | @anchor notif-settings-controller |
| back-endpoint | POST /notification-settings/test-push | apps/backend/src/notification-settings/notification-settings.controller.ts | @anchor notif-settings-controller |

#### Frontend (`apps/frontend/src/NotificationSettingsPage.jsx`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-funkcja | fetchSettings | apps/frontend/src/NotificationSettingsPage.jsx | @anchor notif-settings-fetch |
| ui-funkcja | handleSave | apps/frontend/src/NotificationSettingsPage.jsx | @anchor notif-settings-handle-save |
| ui-funkcja | handleTestPush | apps/frontend/src/NotificationSettingsPage.jsx | @anchor notif-settings-handle-test-push |

### Moduł ExchangeRates (kursy NBP)

#### Backend (`apps/backend/src/exchange-rates/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-serwis | ExchangeRatesService | apps/backend/src/exchange-rates/exchange-rates.service.ts | @anchor exchange-rates-service |
| back-stala | cache | apps/backend/src/exchange-rates/exchange-rates.service.ts | @anchor exchange-rates-cache |
| back-funkcja | refresh (cron) | apps/backend/src/exchange-rates/exchange-rates.service.ts | @anchor exchange-rates-cron |
| back-funkcja | getRates | apps/backend/src/exchange-rates/exchange-rates.service.ts | @anchor exchange-rates-get |
| back-funkcja | fetchNbpRate | apps/backend/src/exchange-rates/exchange-rates.service.ts | @anchor fetch-nbp-rate |
| back-controller | ExchangeRatesController | apps/backend/src/exchange-rates/exchange-rates.controller.ts | @anchor exchange-rates-controller |
| back-endpoint | GET /exchange-rates | apps/backend/src/exchange-rates/exchange-rates.controller.ts | @anchor exchange-rates-endpoint |
| back-modul | ExchangeRatesModule | apps/backend/src/exchange-rates/exchange-rates.module.ts | @anchor exchange-rates-module |

#### Frontend (`apps/frontend/src/DashboardPage.jsx`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stan | exchangeRates | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-exchange-rates |
| ui-sekcja | kontener kursów NBP | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-exchange-rates-box |
| back-serwis | downloadFile (OneDrive) | apps/backend/src/onedrive/onedrive.service.ts | @anchor onedrive-download-file |
| back-endpoint | GET /onedrive/content/:nodeId | apps/backend/src/onedrive/onedrive.controller.ts | @anchor onedrive-content-endpoint |
| ui-stan | preview (OneDriveFilesSection) | apps/frontend/src/components/shared/OneDriveFilesSection.jsx | @anchor onedrive-files-preview |
| ui-funkcja | fileIcon (PropertyPreview) | apps/frontend/src/components/shared/PropertyPreview.jsx | @anchor property-preview-file-icon |

### Moduł SnapshotEditGuard (blokada edycji nieaktywnego snapszota)

#### Frontend (`apps/frontend/src/components/shared/SnapshotEditGuard.jsx` + wpięcie w DashboardPage)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stan | snapshotGuardState | apps/frontend/src/components/shared/SnapshotEditGuard.jsx | @anchor snapshot-guard-state |
| ui-funkcja | snapshotGuardConfirmFn | apps/frontend/src/components/shared/SnapshotEditGuard.jsx | @anchor snapshot-guard-confirm-fn |
| ui-funkcja | setSnapshotGuardState | apps/frontend/src/components/shared/SnapshotEditGuard.jsx | @anchor set-snapshot-guard-state |
| ui-funkcja | guardSnapshotEdit | apps/frontend/src/components/shared/SnapshotEditGuard.jsx | @anchor guard-snapshot-edit |
| ui-funkcja | isEditableTarget | apps/frontend/src/components/shared/SnapshotEditGuard.jsx | @anchor is-editable-target |
| ui-sekcja | SnapshotEditGuard | apps/frontend/src/components/shared/SnapshotEditGuard.jsx | @anchor snapshot-edit-guard |
| ui-funkcja | requestConfirm (SnapshotEditGuard) | apps/frontend/src/components/shared/SnapshotEditGuard.jsx | @anchor snapshot-guard-request-confirm |
| ui-funkcja | resolve (SnapshotEditGuard) | apps/frontend/src/components/shared/SnapshotEditGuard.jsx | @anchor snapshot-guard-resolve |
| ui-stan | isInactiveSnapshot | apps/frontend/src/DashboardPage.jsx | @anchor is-inactive-snapshot |
| ui-stan | contentRef (DashboardPage) | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-content-ref |
| ui-funkcja | getUserTasksForDate | apps/frontend/src/components/shared/wbs/CalendarView.jsx | @anchor calendar-user-tasks-for-date |
| ui-funkcja | renderUserTask | apps/frontend/src/components/shared/wbs/CalendarView.jsx | @anchor calendar-render-user-task |
| ui-stan | userTasks (TasksCalendarSection) | apps/frontend/src/components/shared/wbs/TasksCalendarSection.jsx | @anchor tasks-calendar-user-tasks |
| ui-stan | taskScope | apps/frontend/src/components/shared/wbs/TasksCalendarSection.jsx | @anchor tasks-calendar-scope |
| ui-stan | allTasksOpen | apps/frontend/src/components/shared/wbs/TasksCalendarSection.jsx | @anchor tasks-calendar-all-modal |
| ui-funkcja | fetchUserTasks | apps/frontend/src/components/shared/wbs/TasksCalendarSection.jsx | @anchor tasks-calendar-fetch-user-tasks |
| ui-funkcja | markUserTaskDone | apps/frontend/src/components/shared/wbs/TasksCalendarSection.jsx | @anchor tasks-calendar-user-task-done |
| ui-funkcja | rescheduleUserTask | apps/frontend/src/components/shared/wbs/TasksCalendarSection.jsx | @anchor tasks-calendar-user-task-reschedule |
| ui-sekcja | toolbar zadań (zakres/legenda/pełna lista) | apps/frontend/src/components/shared/wbs/TasksCalendarSection.jsx | @anchor tasks-calendar-toolbar |
| ui-modal | AllTasksModal | apps/frontend/src/components/shared/wbs/AllTasksModal.jsx | @anchor all-tasks-modal |
| ui-funkcja | fetchOpen (AllTasksModal) | apps/frontend/src/components/shared/wbs/AllTasksModal.jsx | @anchor all-tasks-fetch-open |
| ui-funkcja | fetch wykonanych (AllTasksModal) | apps/frontend/src/components/shared/wbs/AllTasksModal.jsx | @anchor all-tasks-fetch-done |
| ui-stan | AllTasksModal.editKey | apps/frontend/src/components/shared/wbs/AllTasksModal.jsx | @anchor all-tasks-title-edit |
| ui-funkcja | AllTasksModal.renameRow | apps/frontend/src/components/shared/wbs/AllTasksModal.jsx | @anchor all-tasks-rename |
| ui-stan | allTasksOpen (UnifiedWbsPanel) | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor unified-all-tasks-open |
| ui-funkcja | handleRestore (AllTasksModal) | apps/frontend/src/components/shared/wbs/AllTasksModal.jsx | @anchor all-tasks-restore |
| ui-funkcja | setSubtaskStatus (AllTasksModal) | apps/frontend/src/components/shared/wbs/AllTasksModal.jsx | @anchor all-tasks-subtask-status |
| ui-panel | DueTasksBell | apps/frontend/src/components/shared/DueTasksBell.jsx | @anchor due-tasks-bell |
| ui-funkcja | markDone (DueTasksBell) | apps/frontend/src/components/shared/DueTasksBell.jsx | @anchor due-tasks-bell-done |
| ui-funkcja | snooze (DueTasksBell) | apps/frontend/src/components/shared/DueTasksBell.jsx | @anchor due-tasks-bell-snooze |

<!-- Następne moduły do dodania:
- offers (apps/backend/src/offers/)
- order-requirements (apps/backend/src/order-requirements/)
- process-tree (apps/backend/src/process-tree/)
- subtasks (apps/backend/src/subtasks/)
- frontend pages (LoginPage, Dashboard, itd.)
- frontend tabs (RequirementsTab, OffersTab, NodeInfoTab)
- utils/wbsPdfExport.js (buildPdfDocument, openPdfBlob, fetchLogoDataUrl, buildWbsHtmlTable, PDF_BASE_CSS)
- utils/projectPdfExport.js (exportProjectPdf)
- utils/requirementsPdfExport.js (exportRequirementsPdf)
-->

