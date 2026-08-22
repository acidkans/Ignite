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
| ui-stan | orphanDrafts | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor orphan-drafts |
| ui-funkcja | loadOrphanDrafts | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor load-orphan-drafts |
| ui-funkcja | reassignOrphansHere | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor reassign-orphans-to-marker |
| ui-sekcja | OrphanRecoveryEl | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor orphan-recovery-section |
| ui-modal | ConfirmDeleteModal | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor confirm-delete-modal |
| ui-stan | confirmState | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor marker-confirm-state |
| ui-stan | orphanPanelOpen | apps/frontend/src/components/shared/MarkerDetailsPanel.jsx | @anchor orphan-panel-open |
| ui-widok | OrphanAttachmentsPanel | apps/frontend/src/components/shared/OrphanAttachmentsPanel.jsx | @anchor orphan-attachments-panel |
| ui-funkcja | loadOrphans | apps/frontend/src/components/shared/OrphanAttachmentsPanel.jsx | @anchor load-orphans-panel |
| ui-funkcja | assign | apps/frontend/src/components/shared/OrphanAttachmentsPanel.jsx | @anchor assign-orphan-to-marker |
| ui-stan | selectedOrphanId | apps/frontend/src/components/shared/OrphanAttachmentsPanel.jsx | @anchor orphan-selected-id |
| ui-funkcja | onMarkerRowClick | apps/frontend/src/components/shared/OrphanAttachmentsPanel.jsx | @anchor orphan-row-tap-assign |
| ui-stan | orphanCount | apps/frontend/src/components/Mobile/MobileDashboard.jsx | @anchor mobile-orphan-count |
| ui-stan | orphanCount (MobileHome) | apps/frontend/src/components/Mobile/MobileHome.jsx | @anchor home-orphan-count |
| ui-karta | kafelek niewysłanych zdjęć | apps/frontend/src/components/Mobile/MobileHome.jsx | @anchor mobile-home-tile-orphans |
| back-funkcja | getAllMarkersFlat | apps/backend/src/schematics/schematics.service.ts | @anchor all-markers-flat |
| ui-stala | OUTBOX_RETRY_INTERVAL_MS | apps/frontend/src/hooks/useSyncOutbox.js | @anchor outbox-retry-interval-ms |
| ui-stala | markerIdMap | apps/frontend/src/services/db.js | @anchor marker-id-map |
| ui-funkcja | rememberMarkerId | apps/frontend/src/services/db.js | @anchor remember-marker-id |
| ui-funkcja | resolveMarkerId | apps/frontend/src/services/db.js | @anchor resolve-marker-id |
| ui-funkcja | getOrphanedAttachments | apps/frontend/src/services/repos/outboxRepo.js | @anchor get-orphaned-attachments |
| ui-funkcja | markOrphaned | apps/frontend/src/services/repos/outboxRepo.js | @anchor mark-outbox-orphaned |
| ui-funkcja | reassignOrphanedAttachment | apps/frontend/src/services/repos/outboxRepo.js | @anchor reassign-orphaned-attachment |
| ui-stala | KEEP | apps/frontend/src/services/sync/syncOutbox.js | @anchor outbox-keep |
| ui-stala | WARN_AFTER_RETRIES | apps/frontend/src/services/repos/outboxRepo.js | @anchor warn-after-retries |
| ui-stala | MAX_RETRIES | apps/frontend/src/services/repos/outboxRepo.js | @anchor max-outbox-retries |
| ui-funkcja | bumpRetry | apps/frontend/src/services/repos/outboxRepo.js | @anchor bump-outbox-retry |
| ui-funkcja | getStuckAttachments | apps/frontend/src/services/repos/outboxRepo.js | @anchor get-stuck-attachments |
| ui-funkcja | resetRetries | apps/frontend/src/services/repos/outboxRepo.js | @anchor reset-outbox-retries |
| ui-sekcja | SyncWarningBanner | apps/frontend/src/components/shared/SyncWarningBanner.jsx | @anchor sync-warning-banner |
| ui-funkcja | retryNow | apps/frontend/src/components/shared/SyncWarningBanner.jsx | @anchor sync-warning-retry-now |

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
| back-serwis | ExtraOrderNotifierService | apps/backend/src/notifications/extra-order-notifier.service.ts | @anchor notify-extra-order |
| back-stala | EXTRA_ORDER_STATUS | apps/backend/src/notifications/extra-order-notifier.service.ts | @anchor extra-order-status |
| back-stala | EXTRA_ORDER_NOTIFICATION_TYPE | apps/backend/src/notifications/extra-order-notifier.service.ts | @anchor extra-order-notification-type |
| back-funkcja | resolveOrderNodeId | apps/backend/src/notifications/extra-order-notifier.service.ts | @anchor extra-order-resolve-order-node |
| back-funkcja | logisticiansForOrder | apps/backend/src/notifications/extra-order-notifier.service.ts | @anchor extra-order-logisticians |
| back-funkcja | statusBefore (karta) | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-extra-order-hook |
| back-funkcja | statusBefore (węzeł) | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-node-extra-order-hook |
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
| ui-sekcja | nagłówek sekcji (rozwinięta = stonowana zieleń) | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor section-head |
| ui-sekcja | WbsMaterialsPanel | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-panel |
| ui-sekcja | MaterialRequirementsPanel | apps/frontend/src/components/shared/wbs/MaterialRequirementsPanel.jsx | @anchor material-requirements-panel |
| ui-sekcja | GanttSection | apps/frontend/src/components/shared/wbs/GanttSection.jsx | @anchor gantt-section |
| ui-sekcja | TasksCalendarSection | apps/frontend/src/components/shared/wbs/TasksCalendarSection.jsx | @anchor tasks-calendar-section |
| ui-sekcja | ProjectItemsPanel | apps/frontend/src/components/shared/wbs/ProjectItemsPanel.jsx | @anchor project-items-panel |
| ui-tabela | BudgetTable | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-table |
| ui-funkcja | real (podsumowanie rzeczywiste) | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-real-summary |
| ui-funkcja | purchaseUnitOf | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor purchase-unit-of |
| ui-sekcja | budget-oz-sums (fetch Oferta/Zakup do kafli KPI) | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-table-oz-sums |
| ui-sekcja | budget-kpi-tiles (siatka kafli KPI Budżetu) | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-kpi-tiles |
| ui-stan | showReal (wiersz „Rzeczywiste" tylko po akceptacji baseline) | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-show-real |
| ui-funkcja | filteredSums (podsumowanie wierszy po filtrach) | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-filtered-sums |
| ui-stan | hasActiveFilter (czy jakikolwiek filtr kolumnowy aktywny) | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-has-active-filter |
| ui-sekcja | stopka „Wartość zafiltrowana" tabeli Budżet | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-filtered-footer |
| ui-input | AutoResizeTextarea | apps/frontend/src/components/shared/wbs/AutoResizeTextarea.jsx | @anchor auto-resize-textarea |
| ui-modal | ImageLightbox | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor image-lightbox |
| ui-stan | lightboxOpen | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor requirement-image-lightbox-open |
| ui-kolumna | comment (Komentarz w Materiałach) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-material-row-comment |
| ui-sekcja | OrderMaterialsView | apps/frontend/src/components/shared/LogistykaMaterialListsTab.jsx | @anchor logistyka-order-materials-view |
| back-endpoint | PATCH /material-requirements/proposals/:id/set-offer | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-patch-set-offer |
| back-endpoint | PATCH /material-requirements/proposals/:id/set-purchase | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-patch-set-purchase |
| back-endpoint | PATCH /material-requirements/proposals/:id/clear-purchase | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-patch-clear-purchase |
| back-endpoint | GET /material-requirements/node/:nodeId/budget-sums | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-get-budget-sums |
| back-funkcja | setOffer | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-set-offer |
| back-funkcja | setPurchase | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-set-purchase |
| back-funkcja | materializePurchaseCopy | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-materialize-purchase-copy |
| back-funkcja | clearPurchase | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-clear-purchase |
| back-funkcja | budgetSums | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-budget-sums |
| schema-pole | ProductProposal.isOffer | apps/backend/prisma/schema.prisma | @anchor product-proposal-is-offer |
| schema-pole | ProductProposal.isPurchase | apps/backend/prisma/schema.prisma | @anchor product-proposal-is-purchase |
| schema-pole | ProductProposal.purchasePriceNetto | apps/backend/prisma/schema.prisma | @anchor product-proposal-purchase-price-netto |
| ui-dropdown | FilterDropdown | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-filter-dropdown |
| ui-tabela | WBSHybridTable | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-hybrid-table |
| ui-stala | kolor kręgosłupa szuflady gałęzi | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-branch-spine |
| ui-stala | CSS szuflady rozwiniętej gałęzi | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-drawer-css |
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
| ui-stan | reloadSeq | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor mat-req-reload-seq |
| ui-stan | fetchMatSeq | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor fetch-mat-seq |
| ui-stan | refreshCardsSeq | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor refresh-cards-seq |
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
| ui-propsy | ProductCard.offerLocked | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor product-card-offer-lock |
| ui-karta | ProductCard w rozwinięciu wiersza Materiałów | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-product-card |
| ui-stala | GROUP_SPINE (kręgosłup rozwiniętej pozycji) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor materials-group-spine |
| ui-stala | CARD_SURFACE (płaszczyzna karty produktu) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor materials-card-surface |
| ui-wiersz | domknięcie grupy rozwiniętej pozycji | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor materials-group-cap |
| ui-sekcja | PurchasesBar (pasek „Zakupy / wykonanie") | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor purchases-bar |
| ui-stan | purchasesOpen (zwinięcie sekcji wpisów, localStorage) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-purchases-open |
| ui-funkcja | togglePurchases | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-toggle-purchases |
| ui-funkcja | entriesLabel | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor pl-entries-label |

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
| ui-stala | EXTRA_ORDER | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor status-extra-order |
| ui-stala | WORK_STATUS_LEAF_TYPES | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor work-status-leaf-types |
| ui-stala | WORK_STATUS_LABELS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor work-status-labels |
| ui-stala | WORK_STATUS_META | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor work-status-meta |
| ui-stala | WORK_STATUS_LABEL_TO_CODE | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor work-status-label-to-code |
| ui-stala | DEFAULT_STATUS_NEW | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor default-status-new |
| ui-stala | NEW | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor status-new |
| ui-stan | pendingSectionRef | apps/frontend/src/components/Layout/MainLayout.jsx | @anchor pending-section-ref |
| ui-stan | pendingWbsSection | apps/frontend/src/DashboardPage.jsx | @anchor pending-wbs-section |
| ui-stan | initialSection | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor wbs-initial-section |
| ui-funkcja | pushNavigateListener | apps/frontend/src/components/Layout/MainLayout.jsx | @anchor push-navigate-listener |
| ui-funkcja | pushColdStartNavigate | apps/frontend/src/components/Layout/MainLayout.jsx | @anchor push-cold-start-navigate |
| ui-funkcja | activeToken | apps/frontend/src/App.jsx | @anchor active-token |
| ui-stala | WORK_STRUCT_STATUS_META | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor work-struct-status-meta |
| ui-stala | MATERIAL_STATUS_LABEL_TO_CODE | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor material-status-label-to-code |
| ui-stala | STRUCTURE_COMMON_CELL_CLASS | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor structure-common-cell-class |
| ui-stala | DRAWER (wygląd szuflady rozwiniętego wiersza) | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor expand-drawer |
| ui-funkcja | defaultUnitForType | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor default-unit-for-type |
| ui-funkcja | sanitizeQtyInput | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor sanitize-qty-input |
| ui-funkcja | evalQtyFormula | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor eval-qty-formula |
| ui-funkcja | parsePriceInput | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor parse-price-input |
| ui-funkcja | fmtPLN | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor fmt-pln |
| ui-funkcja | fmtQty | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor fmt-qty |
| ui-funkcja | fmtPct | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor fmt-pct |
| ui-funkcja | fmtPLNFull | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor fmt-pln-full |
| ui-funkcja | fmtPctFull | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor fmt-pct-full |
| ui-funkcja | normKey | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor norm-key |
| ui-funkcja | makeMaterialLookupKey | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor make-material-lookup-key |
| ui-funkcja | parseLocaleNumber | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor parse-locale-number |
| ui-funkcja | normalizeStatusCode | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor normalize-status-code |
| ui-funkcja | usesWorkStatuses | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor uses-work-statuses |
| ui-funkcja | defaultStatusForType | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor default-status-for-type |
| ui-funkcja | statusMetaForType | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor status-meta-for-type |
| ui-funkcja | resolveStatusCode | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor resolve-status-code |
| ui-funkcja | statusLabelForType | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor status-label-for-type |
| ui-funkcja | statusOptionsForType | apps/frontend/src/components/shared/wbs/wbsConstants.js | @anchor status-options-for-type |
| ui-funkcja | structStatusMetaFor | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor struct-status-meta-for |
| ui-funkcja | mkNode | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor mk-node |
| ui-funkcja | rowStatusLabel | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor materials-row-status-label |
| ui-funkcja | getStatusLabel | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor unified-get-status-label |
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
| ui-stala | TOUCH_QUERY | apps/frontend/src/hooks/useDevice.js | @anchor device-touch-query |
| ui-hook | efekt tożsamości dev-trackera | apps/frontend/src/App.jsx | @anchor app-dev-tracker-identity |
| ui-funkcja | przenoszenie węzła palcem (Pointer Events) | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-hybrid-pointer-drag |
| ui-stan | isTouch (WBSHybridTable) | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-hybrid-is-touch |
| ui-stan | isTouch (WbsMaterialsPanel) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-is-touch |

### Skrypty narzędziowe (root repo)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-skrypt | sync-obsidian.ps1 | sync-obsidian.ps1 | @anchor sync-obsidian-script |
| back-skrypt | setup-task-scheduler.ps1 | setup-task-scheduler.ps1 | @anchor setup-task-scheduler-script |
| back-skrypt | backup-db.sh | backup-db.sh | @anchor backup-db-script |
| back-skrypt | restore-db.sh | restore-db.sh | @anchor restore-db-script |
| back-skrypt | pull-backup.ps1 | pull-backup.ps1 | @anchor pull-backup-script |

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
| schema-pole | MaterialRequirement.supplierId (oferent produktu pozycji) | apps/backend/prisma/schema.prisma | @anchor mat-req-supplier-id |
| schema-relacja | MaterialRequirement.supplier | apps/backend/prisma/schema.prisma | @anchor mat-req-supplier |
| schema-relacja | Supplier.materialRequirements | apps/backend/prisma/schema.prisma | @anchor supplier-material-requirements |
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
| schema-pole | ProductProposal.supplierId | apps/backend/prisma/schema.prisma | @anchor product-proposal-supplier-id |
| schema-relacja | ProductProposal.supplier | apps/backend/prisma/schema.prisma | @anchor product-proposal-supplier |
| schema-relacja | Supplier.productProposals | apps/backend/prisma/schema.prisma | @anchor supplier-product-proposals |
| back-funkcja | syncOfferProposalPrice | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-sync-offer-proposal-price |
| back-funkcja | wybór propozycji przy edycji karty (existingProp) | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-existing-proposal-pick |
| back-funkcja | zejście oferenta z karty na propozycję | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-supplier-sync |
| back-funkcja | deduplikacja wyników „Szukaj AI" (dedupKey) | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-search-dedup |
| back-funkcja | syncOfferPriceFromWbsNode | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-sync-offer-price-from-node |
| back-funkcja | syncMaterialsFromWbsNode | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-sync-qty-direct-link |
| back-funkcja | nodeShareFromDto | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-node-share-from-dto |
| back-funkcja | writeWbsNodeQuantity | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-write-wbs-node-quantity |
| back-funkcja | update (gałąź quantity bez alokacji) | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-qty-to-wbs |
| back-funkcja | update (gałąź katalogowa — cena) | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-catalog-price-guard |
| ui-funkcja | syncMaterialRequirementsFromWbsQuantity | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor sync-material-requirements-from-wbs-quantity |

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
| back-funkcja | cloneProposalsForRequirement | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-clone-proposals |
| back-funkcja | retagWbsNodeToRequirement | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-retag-wbs-node |
| ui-funkcja | deepCloneNodeWithMappings | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor deep-clone-node-with-mappings |
| ui-funkcja | isTagDroppedOnClone | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor clone-dropped-tags |
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
| back-stala | SMTP_PROFILES | apps/backend/src/smtp/smtp.service.ts | @anchor smtp-profiles |
| back-funkcja | resolveSmtpProfile | apps/backend/src/smtp/smtp.service.ts | @anchor resolve-smtp-profile |
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
| ui-sekcja | SmtpSettingsPanel | apps/frontend/src/components/shared/SmtpSettingsPanel.jsx | @anchor smtp-settings-panel |
| ui-zakladka | Urlopy SMTP (meta) | apps/frontend/src/LeavesPage.jsx | @anchor leaves-smtp-tab-meta |
| ui-zakladka | Urlopy SMTP | apps/frontend/src/LeavesPage.jsx | @anchor leaves-smtp-tab |
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
| back-funkcja | NotificationCronService.checkAttachmentSilence | apps/backend/src/notification-cron/notification-cron.service.ts | @anchor notification-cron-attachment-silence |
| back-stala | ATTACHMENT_SILENCE_DAYS | apps/backend/src/notification-cron/notification-cron.service.ts | @anchor attachment-silence-days |
| back-stala | ATTACHMENT_BASELINE_DAYS | apps/backend/src/notification-cron/notification-cron.service.ts | @anchor attachment-baseline-days |

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

### Moduł QuickQuote / baseline (Faza 0 — schemat)

#### Schema (Prisma — `apps/backend/prisma/schema.prisma`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| schema-model | Supplier | apps/backend/prisma/schema.prisma | @anchor supplier |
| schema-pole | Supplier.id | apps/backend/prisma/schema.prisma | @anchor supplier-id |
| schema-pole | Supplier.name | apps/backend/prisma/schema.prisma | @anchor supplier-name |
| schema-pole | Supplier.nip | apps/backend/prisma/schema.prisma | @anchor supplier-nip |
| schema-pole | Supplier.address | apps/backend/prisma/schema.prisma | @anchor supplier-address |
| schema-pole | Supplier.contactPerson | apps/backend/prisma/schema.prisma | @anchor supplier-contact-person |
| schema-pole | Supplier.contactEmail | apps/backend/prisma/schema.prisma | @anchor supplier-contact-email |
| schema-pole | Supplier.contactPhone | apps/backend/prisma/schema.prisma | @anchor supplier-contact-phone |
| schema-pole | Supplier.apiAdapter | apps/backend/prisma/schema.prisma | @anchor supplier-api-adapter |
| schema-pole | Supplier.isActive | apps/backend/prisma/schema.prisma | @anchor supplier-is-active |
| schema-pole | Supplier.vatStatus | apps/backend/prisma/schema.prisma | @anchor supplier-vat-status |
| schema-pole | Supplier.verifiedAt | apps/backend/prisma/schema.prisma | @anchor supplier-verified-at |
| schema-relacja | Supplier.offers | apps/backend/prisma/schema.prisma | @anchor supplier-offers |
| schema-relacja | Supplier.quickQuoteItems | apps/backend/prisma/schema.prisma | @anchor supplier-quick-quote-items |
| schema-model | QuickQuote | apps/backend/prisma/schema.prisma | @anchor quick-quote |
| schema-pole | QuickQuote.id | apps/backend/prisma/schema.prisma | @anchor quick-quote-id |
| schema-pole | QuickQuote.nodeId | apps/backend/prisma/schema.prisma | @anchor quick-quote-node-id |
| schema-pole | QuickQuote.name | apps/backend/prisma/schema.prisma | @anchor quick-quote-name |
| schema-pole | QuickQuote.status | apps/backend/prisma/schema.prisma | @anchor quick-quote-status |
| schema-pole | QuickQuote.parentId | apps/backend/prisma/schema.prisma | @anchor quick-quote-parent-id |
| schema-pole | QuickQuote.validUntil | apps/backend/prisma/schema.prisma | @anchor quick-quote-valid-until |
| schema-pole | QuickQuote.lockedAt | apps/backend/prisma/schema.prisma | @anchor quick-quote-locked-at |
| schema-pole | QuickQuote.lockedBy | apps/backend/prisma/schema.prisma | @anchor quick-quote-locked-by |
| schema-pole | QuickQuote.createdBy | apps/backend/prisma/schema.prisma | @anchor quick-quote-created-by |
| schema-relacja | QuickQuote.node | apps/backend/prisma/schema.prisma | @anchor quick-quote-node |
| schema-relacja | QuickQuote.parent | apps/backend/prisma/schema.prisma | @anchor quick-quote-parent |
| schema-relacja | QuickQuote.children | apps/backend/prisma/schema.prisma | @anchor quick-quote-children |
| schema-relacja | QuickQuote.items | apps/backend/prisma/schema.prisma | @anchor quick-quote-items |
| schema-model | QuickQuoteItem | apps/backend/prisma/schema.prisma | @anchor quick-quote-item |
| schema-pole | QuickQuoteItem.id | apps/backend/prisma/schema.prisma | @anchor qq-item-id |
| schema-pole | QuickQuoteItem.quickQuoteId | apps/backend/prisma/schema.prisma | @anchor qq-item-quick-quote-id |
| schema-pole | QuickQuoteItem.materialRequirementId | apps/backend/prisma/schema.prisma | @anchor qq-item-material-requirement-id |
| schema-pole | QuickQuoteItem.reqName | apps/backend/prisma/schema.prisma | @anchor qq-item-req-name |
| schema-pole | QuickQuoteItem.qtyAtCapture | apps/backend/prisma/schema.prisma | @anchor qq-item-qty-at-capture |
| schema-pole | QuickQuoteItem.unit | apps/backend/prisma/schema.prisma | @anchor qq-item-unit |
| schema-pole | QuickQuoteItem.source | apps/backend/prisma/schema.prisma | @anchor qq-item-source |
| schema-pole | QuickQuoteItem.supplierId | apps/backend/prisma/schema.prisma | @anchor qq-item-supplier-id |
| schema-pole | QuickQuoteItem.externalRef | apps/backend/prisma/schema.prisma | @anchor qq-item-external-ref |
| schema-pole | QuickQuoteItem.sourceUrl | apps/backend/prisma/schema.prisma | @anchor qq-item-source-url |
| schema-pole | QuickQuoteItem.capturedAt | apps/backend/prisma/schema.prisma | @anchor qq-item-captured-at |
| schema-pole | QuickQuoteItem.queriedBy | apps/backend/prisma/schema.prisma | @anchor qq-item-queried-by |
| schema-pole | QuickQuoteItem.priceOriginalNetto | apps/backend/prisma/schema.prisma | @anchor qq-item-price-original-netto |
| schema-pole | QuickQuoteItem.currency | apps/backend/prisma/schema.prisma | @anchor qq-item-currency |
| schema-pole | QuickQuoteItem.exchangeRate | apps/backend/prisma/schema.prisma | @anchor qq-item-exchange-rate |
| schema-pole | QuickQuoteItem.rateDate | apps/backend/prisma/schema.prisma | @anchor qq-item-rate-date |
| schema-pole | QuickQuoteItem.priceNettoPln | apps/backend/prisma/schema.prisma | @anchor qq-item-price-netto-pln |
| schema-pole | QuickQuoteItem.priceNettoApi | apps/backend/prisma/schema.prisma | @anchor qq-item-price-netto-api |
| schema-relacja | QuickQuoteItem.quickQuote | apps/backend/prisma/schema.prisma | @anchor qq-item-quick-quote |
| schema-relacja | QuickQuoteItem.materialRequirement | apps/backend/prisma/schema.prisma | @anchor qq-item-material-requirement |
| schema-relacja | QuickQuoteItem.supplier | apps/backend/prisma/schema.prisma | @anchor qq-item-supplier |
| schema-pole | Offer.supplierId | apps/backend/prisma/schema.prisma | @anchor offer-supplier-id |
| schema-pole | Offer.offerNumber | apps/backend/prisma/schema.prisma | @anchor offer-offer-number |
| schema-pole | Offer.offerDate | apps/backend/prisma/schema.prisma | @anchor offer-offer-date |
| schema-pole | Offer.validUntil | apps/backend/prisma/schema.prisma | @anchor offer-valid-until |
| schema-relacja | Offer.supplier | apps/backend/prisma/schema.prisma | @anchor offer-supplier |
| schema-pole | ProcessNode.orderStage | apps/backend/prisma/schema.prisma | @anchor process-node-order-stage |
| schema-pole | ProcessNode.acceptedVersionId | apps/backend/prisma/schema.prisma | @anchor process-node-accepted-version-id |
| schema-pole | ProcessNode.acceptedAt | apps/backend/prisma/schema.prisma | @anchor process-node-accepted-at |
| schema-pole | ProcessNode.acceptedBy | apps/backend/prisma/schema.prisma | @anchor process-node-accepted-by |
| schema-relacja | ProcessNode.acceptedVersion | apps/backend/prisma/schema.prisma | @anchor process-node-accepted-version |
| schema-relacja | ProcessNode.quickQuotes | apps/backend/prisma/schema.prisma | @anchor process-node-quick-quotes |
| schema-relacja | ProjectVersion.acceptedForNodes | apps/backend/prisma/schema.prisma | @anchor project-version-accepted-for-nodes |
| schema-pole | MaterialRequirement.sourceRequirementId | apps/backend/prisma/schema.prisma | @anchor mat-req-source-requirement-id |
| schema-pole | MaterialRequirement.budgetSource | apps/backend/prisma/schema.prisma | @anchor mat-req-budget-source |
| schema-relacja | MaterialRequirement.quickQuoteItems | apps/backend/prisma/schema.prisma | @anchor mat-req-quick-quote-items |

### Moduł Suppliers — rejestr dostawców + NIP (Faza 1)

#### Backend (`apps/backend/src/suppliers/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-modul | SuppliersModule | apps/backend/src/suppliers/suppliers.module.ts | @anchor suppliers-module |
| back-serwis | SuppliersService | apps/backend/src/suppliers/suppliers.service.ts | @anchor suppliers-service |
| back-typ | SupplierUpsertInput | apps/backend/src/suppliers/suppliers.service.ts | @anchor supplier-upsert-input |
| back-funkcja | SuppliersService.findAll | apps/backend/src/suppliers/suppliers.service.ts | @anchor suppliers-find-all |
| back-funkcja | SuppliersService.findOne | apps/backend/src/suppliers/suppliers.service.ts | @anchor suppliers-find-one |
| back-funkcja | SuppliersService.create | apps/backend/src/suppliers/suppliers.service.ts | @anchor suppliers-create |
| back-funkcja | SuppliersService.update | apps/backend/src/suppliers/suppliers.service.ts | @anchor suppliers-update |
| back-funkcja | SuppliersService.resolveWriteData | apps/backend/src/suppliers/suppliers.service.ts | @anchor suppliers-resolve-write-data |
| back-serwis | NipLookupService | apps/backend/src/suppliers/nip-lookup.service.ts | @anchor nip-lookup-service |
| back-typ | NipLookupResult | apps/backend/src/suppliers/nip-lookup.service.ts | @anchor nip-lookup-result |
| back-funkcja | NipLookupService.normalizeNip | apps/backend/src/suppliers/nip-lookup.service.ts | @anchor normalize-nip |
| back-funkcja | NipLookupService.validateNipChecksum | apps/backend/src/suppliers/nip-lookup.service.ts | @anchor validate-nip-checksum |
| back-funkcja | NipLookupService.lookup | apps/backend/src/suppliers/nip-lookup.service.ts | @anchor nip-lookup-fetch |
| back-controller | SuppliersController | apps/backend/src/suppliers/suppliers.controller.ts | @anchor suppliers-controller |
| back-endpoint | GET /suppliers | apps/backend/src/suppliers/suppliers.controller.ts | @anchor suppliers-get-endpoint |
| back-endpoint | GET /suppliers/nip-lookup/:nip | apps/backend/src/suppliers/suppliers.controller.ts | @anchor suppliers-nip-lookup-endpoint |
| back-endpoint | GET /suppliers/:id | apps/backend/src/suppliers/suppliers.controller.ts | @anchor suppliers-get-one-endpoint |
| back-endpoint | POST /suppliers | apps/backend/src/suppliers/suppliers.controller.ts | @anchor suppliers-post-endpoint |
| back-endpoint | PATCH /suppliers/:id | apps/backend/src/suppliers/suppliers.controller.ts | @anchor suppliers-patch-endpoint |

#### Frontend (`apps/frontend/src/components/shared/SupplierPicker.jsx`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-dropdown | SupplierPicker | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker |
| ui-stan | query | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-query |
| ui-stan | createMode | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-create-mode |
| ui-stan | nipInput | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-nip-input |
| ui-stan | freeName | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-free-name |
| ui-stan | nipPreview | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-nip-preview |
| ui-funkcja | fetchSuppliers | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-fetch |
| ui-funkcja | handleNipLookup | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-nip-lookup |
| ui-funkcja | handleCreate | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-create |
| ui-funkcja | clearSupplier | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-clear |
| ui-propsy | SupplierPicker.textClass | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-text-class |
| ui-propsy | SupplierPicker.size (md / sm / xs) | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-size |
| ui-propsy | SupplierPicker.placeholder | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-placeholder |

### Moduł kanał PDF — dostawca w ofercie (Faza 2)

#### Backend

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-funkcja | MaterialRequirementsService.extractParsedOffer | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor extract-parsed-offer |
| back-funkcja | OffersService.create (meta oferty) | apps/backend/src/offers/offers.service.ts | @anchor offer-meta-input |

#### Frontend

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stan | supplierMeta | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-supplier-meta |
| ui-stan | supplier (OfferParsePanel) | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-supplier-selected |
| ui-stan | supplierNotice | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-supplier-notice |
| ui-stan | offerMeta | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-meta |
| ui-funkcja | matchSupplier | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-match-supplier |
| ui-funkcja | createSupplierFromNip | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-create-supplier-from-nip |
| ui-sekcja | blok dostawcy w OfferParsePanel | apps/frontend/src/components/shared/DocumentViewer.jsx | @anchor offer-supplier-block |
| ui-sekcja | badge dostawcy w OffersTable | apps/frontend/src/components/shared/OffersTab.jsx | @anchor offers-table-supplier-badge |
| ui-stala | THEMES (SupplierPicker) | apps/frontend/src/components/shared/SupplierPicker.jsx | @anchor supplier-picker-theme |

### Moduł QuickQuotes — silnik szybkich wycen (Faza 3)

#### Backend (`apps/backend/src/quick-quotes/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-modul | QuickQuotesModule | apps/backend/src/quick-quotes/quick-quotes.module.ts | @anchor quick-quotes-module |
| back-serwis | QuickQuotesService | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-service |
| back-typ | QuickQuoteItemInput | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quote-item-input |
| back-stala | TRANSITIONS | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quote-transitions |
| back-funkcja | QuickQuotesService.list | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-list |
| back-funkcja | QuickQuotesService.get | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-get |
| back-funkcja | QuickQuotesService.create | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-create |
| back-funkcja | QuickQuotesService.update | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-update |
| back-funkcja | QuickQuotesService.remove | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-delete |
| back-funkcja | QuickQuotesService.changeStatus | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-change-status |
| back-funkcja | QuickQuotesService.lock | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-lock |
| back-funkcja | QuickQuotesService.createNewVersion | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-new-version |
| back-funkcja | QuickQuotesService.addItem | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-add-item |
| back-funkcja | QuickQuotesService.updateItem | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-update-item |
| back-funkcja | QuickQuotesService.removeItem | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-remove-item |
| back-funkcja | QuickQuotesService.addStockItems | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-add-stock-items |
| back-funkcja | QuickQuotesService.queryApi | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-query-api |
| back-funkcja | QuickQuotesService.requireEditable | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-require-editable |
| back-funkcja | QuickQuotesService.freezePrice | apps/backend/src/quick-quotes/quick-quotes.service.ts | @anchor quick-quotes-freeze-price |
| back-typ | SupplierGatewayQuery | apps/backend/src/quick-quotes/supplier-gateway.ts | @anchor supplier-gateway-query |
| back-typ | SupplierGatewayResult | apps/backend/src/quick-quotes/supplier-gateway.ts | @anchor supplier-gateway-result |
| back-typ | SupplierGateway (interfejs) | apps/backend/src/quick-quotes/supplier-gateway.ts | @anchor supplier-gateway |
| back-stala | SUPPLIER_GATEWAYS | apps/backend/src/quick-quotes/supplier-gateway.ts | @anchor supplier-gateways-token |
| back-controller | QuickQuotesController | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-controller |
| back-endpoint | GET /quick-quotes | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-get-endpoint |
| back-endpoint | GET /quick-quotes/:id | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-get-one-endpoint |
| back-endpoint | POST /quick-quotes | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-post-endpoint |
| back-endpoint | PATCH /quick-quotes/:id | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-patch-endpoint |
| back-endpoint | DELETE /quick-quotes/:id | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-delete-endpoint |
| back-endpoint | PATCH /quick-quotes/:id/status | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-status-endpoint |
| back-endpoint | POST /quick-quotes/:id/new-version | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-new-version-endpoint |
| back-endpoint | POST /quick-quotes/:id/items | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-post-item-endpoint |
| back-endpoint | PATCH /quick-quotes/:id/items/:itemId | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-patch-item-endpoint |
| back-endpoint | DELETE /quick-quotes/:id/items/:itemId | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-delete-item-endpoint |
| back-endpoint | POST /quick-quotes/:id/items/from-stock | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-stock-endpoint |
| back-endpoint | POST /quick-quotes/:id/items/query-api | apps/backend/src/quick-quotes/quick-quotes.controller.ts | @anchor quick-quotes-query-api-endpoint |

#### Frontend (`apps/frontend/src/components/shared/QuickQuotesSection.jsx`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-sekcja | QuickQuotesSection | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor quick-quotes-section |
| ui-stala | STATUS_STYLES | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-status-styles |
| ui-stala | SOURCE_STYLES | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-source-styles |
| ui-stan | expandedId | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-expanded-id |
| ui-stan | detail | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-detail |
| ui-stan | requirements | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-requirements |
| ui-stan | newItem | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-new-item |
| ui-funkcja | fetchList | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-fetch-list |
| ui-funkcja | fetchDetail | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-fetch-detail |
| ui-funkcja | handleCreate | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-create |
| ui-funkcja | changeStatus | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-change-status |
| ui-funkcja | handleNewVersion | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-new-version |
| ui-funkcja | handleFromStock | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-from-stock |
| ui-funkcja | handleAddItem | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-add-item |
| ui-funkcja | handlePriceEdit | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-update-item-price |
| ui-sekcja | sekcja Szybkie wyceny w OffersTab | apps/frontend/src/components/shared/OffersTab.jsx | @anchor offers-tab-quick-quotes-section |

### Moduł Orders — akceptacja wersji i etapy zamówienia (Faza 4)

#### Backend (`apps/backend/src/orders/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-modul | OrdersModule | apps/backend/src/orders/orders.module.ts | @anchor orders-module |
| back-serwis | OrdersService | apps/backend/src/orders/orders.service.ts | @anchor orders-service |
| back-funkcja | OrdersService.getAcceptance | apps/backend/src/orders/orders.service.ts | @anchor orders-get-acceptance |
| back-funkcja | OrdersService.acceptPreview | apps/backend/src/orders/orders.service.ts | @anchor orders-accept-preview |
| back-funkcja | OrdersService.accept | apps/backend/src/orders/orders.service.ts | @anchor orders-accept |
| back-funkcja | OrdersService.revokeAccept | apps/backend/src/orders/orders.service.ts | @anchor orders-revoke-accept |
| back-controller | OrdersController | apps/backend/src/orders/orders.controller.ts | @anchor orders-controller |
| back-endpoint | GET /orders/:nodeId/acceptance | apps/backend/src/orders/orders.controller.ts | @anchor orders-acceptance-endpoint |
| back-endpoint | GET /orders/:nodeId/accept-preview | apps/backend/src/orders/orders.controller.ts | @anchor orders-accept-preview-endpoint |
| back-endpoint | POST /orders/:nodeId/accept | apps/backend/src/orders/orders.controller.ts | @anchor orders-accept-endpoint |
| back-endpoint | POST /orders/:nodeId/revoke-accept | apps/backend/src/orders/orders.controller.ts | @anchor orders-revoke-accept-endpoint |
| back-funkcja | guard edycji budżetu po akceptacji | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-budget-guard |

#### Frontend (`apps/frontend/src/DashboardPage.jsx`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stan | acceptance | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-acceptance |
| ui-stan | acceptModal | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-accept-modal |
| ui-stan | revokeModal | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-revoke-modal |
| ui-funkcja | fetchAcceptance | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-fetch-acceptance |
| ui-funkcja | openAcceptModal | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-open-accept-modal |
| ui-funkcja | confirmAccept | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-confirm-accept |
| ui-funkcja | confirmRevoke | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-confirm-revoke |
| ui-sekcja | badge BASELINE na wierszu wersji | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-baseline-badge |
| ui-przycisk | kciuk akceptacji wersji | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-thumbs-up |
| ui-przycisk | cofnięcie akceptacji | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-revoke-button |
| ui-stan | baselineAccepted | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-baseline-accepted |
| ui-modal | modal akceptacji wersji | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-accept-version-modal |
| ui-modal | modal cofnięcia akceptacji | apps/frontend/src/DashboardPage.jsx | @anchor dashboard-revoke-accept-modal |

### Moduł Comparison — porównanie baseline vs żywe (Faza 5)

#### Backend (`apps/backend/src/orders/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-funkcja | OrdersService.comparison | apps/backend/src/orders/orders.service.ts | @anchor orders-comparison |
| back-endpoint | GET /orders/:nodeId/comparison | apps/backend/src/orders/orders.controller.ts | @anchor orders-comparison-endpoint |

#### Frontend

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-panel | ComparisonPanel | apps/frontend/src/components/shared/ComparisonPanel.jsx | @anchor comparison-panel |
| ui-stala | DEV_STYLES | apps/frontend/src/components/shared/ComparisonPanel.jsx | @anchor comparison-dev-styles |
| ui-stala | OFFER_CLS / PURCHASE_CLS | apps/frontend/src/components/shared/ComparisonPanel.jsx | @anchor comparison-side-styles |
| ui-wiersz | strona Zakupu bez produktu isPurchase | apps/frontend/src/components/shared/ComparisonPanel.jsx | @anchor comparison-not-purchased |
| ui-kolumna | podsumowanie Δ w nagłówku kolumny | apps/frontend/src/components/shared/ComparisonPanel.jsx | @anchor comparison-delta-summary |
| ui-kolumna | sumy stron Wycena/Zakup w nagłówkach grup | apps/frontend/src/components/shared/ComparisonPanel.jsx | @anchor comparison-side-sums |
| ui-funkcja | fitTableFont | apps/frontend/src/components/shared/ComparisonPanel.jsx | @anchor comparison-fit-font |
| back-funkcja | usuwanie kart bez powiązania WBS w deleteNode | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor delete-node-orphan-cards |
| back-funkcja | buildOffer (strona Wycena) | apps/backend/src/orders/orders.service.ts | @anchor comparison-build-offer |
| back-funkcja | buildPurchase (strona Zakup) | apps/backend/src/orders/orders.service.ts | @anchor comparison-build-purchase |
| ui-funkcja | fetchComparison | apps/frontend/src/components/shared/ComparisonPanel.jsx | @anchor comparison-fetch |
| ui-funkcja | exportExcel (comparison) | apps/frontend/src/components/shared/ComparisonPanel.jsx | @anchor comparison-export-excel |
| ui-sekcja | osadzenie panelu w wycenie BASELINE | apps/frontend/src/components/shared/QuickQuotesSection.jsx | @anchor qq-comparison-embed |
| ui-stan | comparisonKpi | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor materials-comparison-kpi |
| ui-stan | showComparison | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor materials-show-comparison |
| ui-przycisk | chip Δ/pokrycie w nagłówku sekcji Materiały | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor materials-comparison-chip |
| ui-modal | modal panelu porównawczego | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor materials-comparison-modal |

### Moduł Realizacja — etapowe wpisy zakupu i wykonania na liściu WBS

#### Backend (`apps/backend/prisma/schema.prisma`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| schema-model | LeafActual | apps/backend/prisma/schema.prisma | @anchor leaf-actual |
| schema-pole | LeafActual.id | apps/backend/prisma/schema.prisma | @anchor leaf-actual-id |
| schema-pole | LeafActual.wbsRootId | apps/backend/prisma/schema.prisma | @anchor leaf-actual-wbs-root-id |
| schema-pole | LeafActual.nodeId | apps/backend/prisma/schema.prisma | @anchor leaf-actual-node-id |
| schema-pole | LeafActual.entryDate | apps/backend/prisma/schema.prisma | @anchor leaf-actual-entry-date |
| schema-pole | LeafActual.qty | apps/backend/prisma/schema.prisma | @anchor leaf-actual-qty |
| schema-pole | LeafActual.unitCost | apps/backend/prisma/schema.prisma | @anchor leaf-actual-unit-cost |
| schema-pole | LeafActual.comment | apps/backend/prisma/schema.prisma | @anchor leaf-actual-comment |
| schema-pole | LeafActual.docNumber | apps/backend/prisma/schema.prisma | @anchor leaf-actual-doc-number |
| schema-pole | LeafActual.manufacturer | apps/backend/prisma/schema.prisma | @anchor leaf-actual-manufacturer |
| schema-pole | LeafActual.model | apps/backend/prisma/schema.prisma | @anchor leaf-actual-model |
| schema-pole | LeafActual.ean (kod EAN kupionego egzemplarza) | apps/backend/prisma/schema.prisma | @anchor leaf-actual-ean |
| schema-pole | LeafActual.scope (zakres — liście bez karty) | apps/backend/prisma/schema.prisma | @anchor leaf-actual-scope |
| schema-pole | LeafActual.supplierId | apps/backend/prisma/schema.prisma | @anchor leaf-actual-supplier-id |
| schema-pole | LeafActual.authorId | apps/backend/prisma/schema.prisma | @anchor leaf-actual-author-id |
| schema-relacja | LeafActual.node | apps/backend/prisma/schema.prisma | @anchor leaf-actual-node |
| schema-relacja | LeafActual.supplier | apps/backend/prisma/schema.prisma | @anchor leaf-actual-supplier |
| schema-relacja | LeafActual.author | apps/backend/prisma/schema.prisma | @anchor leaf-actual-author |
| schema-pole | WbsNode.sourceWbsNodeId | apps/backend/prisma/schema.prisma | @anchor wbs-node-source-wbs-node-id |
| schema-pole | WbsNode.realizationClosed | apps/backend/prisma/schema.prisma | @anchor wbs-node-realization-closed |
| schema-relacja | ProcessNode.leafActuals | apps/backend/prisma/schema.prisma | @anchor process-node-leaf-actuals |
| schema-relacja | Supplier.leafActuals | apps/backend/prisma/schema.prisma | @anchor supplier-leaf-actuals |
| schema-relacja | User.leafActuals | apps/backend/prisma/schema.prisma | @anchor user-leaf-actuals |

#### Backend (`apps/backend/src/leaf-actuals/`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-serwis | LeafActualsService | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actuals-service |
| back-typ | ActualsUser | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actuals-user |
| back-dto | LeafActualInput | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actual-input |
| back-dto | LeafActualInput.ean | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actual-input-ean |
| back-dto | LeafActualInput.scope | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actual-input-scope |
| back-stala | OPEN_LEAF_TYPES (typy widoczne dla każdej roli) | apps/backend/src/common/leaf-types.util.ts | @anchor open-leaf-types |
| back-funkcja | isOpenLeafType | apps/backend/src/common/leaf-types.util.ts | @anchor is-open-leaf-type |
| back-funkcja | isManagerRoles | apps/backend/src/common/leaf-types.util.ts | @anchor is-manager-roles |
| back-funkcja | filtr roli w dzienniku wpisów | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actuals-role-filter |
| back-funkcja | filtr roli w porównaniu wycena↔zakup | apps/backend/src/orders/orders.service.ts | @anchor comparison-role-filter |
| back-stala | ALL_LEAF_TYPES (komplet typów liści) | apps/backend/src/common/leaf-types.util.ts | @anchor all-leaf-types |
| back-stala | CLOSED_LEAF_TYPES (typy tylko dla managera) | apps/backend/src/common/leaf-types.util.ts | @anchor closed-leaf-types |
| back-funkcja | isClosedLeafType | apps/backend/src/common/leaf-types.util.ts | @anchor is-closed-leaf-type |
| back-funkcja | seesClosedLeaves (rola widzi koszty własne) | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-nodes-sees-closed-leaves |
| back-funkcja | visibleForCaller (filtr drzewa WBS po roli) | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-nodes-visible-for-caller |
| back-funkcja | stripMoney (zerowanie kwot węzła) | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-nodes-strip-money |
| back-funkcja | ochrona ukrytych liści przy zapisie drzewa | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-nodes-save-tree-hidden-guard |
| back-funkcja | rootOfWbsNode | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actuals-root-of |
| back-funkcja | listByOrder | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actuals-list |
| back-funkcja | create (wpis realizacji) | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actuals-create |
| back-funkcja | update (wpis realizacji) | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actuals-update |
| back-funkcja | remove (wpis realizacji) | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actuals-remove |
| back-funkcja | setClosed (rozliczenie pozycji) | apps/backend/src/leaf-actuals/leaf-actuals.service.ts | @anchor leaf-actuals-close |
| back-controller | LeafActualsController | apps/backend/src/leaf-actuals/leaf-actuals.controller.ts | @anchor leaf-actuals-controller |
| back-endpoint | GET /leaf-actuals/order/:nodeId | apps/backend/src/leaf-actuals/leaf-actuals.controller.ts | @anchor leaf-actuals-list-endpoint |
| back-endpoint | POST /leaf-actuals | apps/backend/src/leaf-actuals/leaf-actuals.controller.ts | @anchor leaf-actuals-create-endpoint |
| back-endpoint | PATCH /leaf-actuals/:id | apps/backend/src/leaf-actuals/leaf-actuals.controller.ts | @anchor leaf-actuals-update-endpoint |
| back-endpoint | DELETE /leaf-actuals/:id | apps/backend/src/leaf-actuals/leaf-actuals.controller.ts | @anchor leaf-actuals-remove-endpoint |
| back-endpoint | PATCH /leaf-actuals/close/:wbsNodeId | apps/backend/src/leaf-actuals/leaf-actuals.controller.ts | @anchor leaf-actuals-close-endpoint |
| back-modul | LeafActualsModule | apps/backend/src/leaf-actuals/leaf-actuals.module.ts | @anchor leaf-actuals-module |

#### Frontend (`apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx`)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-stala | TYPE_META (typy liści panelu) | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor wbs-materials-type-meta |
| ui-stala | LEAF_TYPES | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor wbs-materials-leaf-types |
| ui-stala | REAL_STATE (kolory stanu realizacji) | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor realization-state-styles |
| ui-funkcja | wbsRootOf | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor wbs-root-of |
| ui-funkcja | realizationOf | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor realization-of |
| ui-stan | actuals (wpisy realizacji zamówienia) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-actuals |
| ui-kolumna | Zakup / wykonanie (licznik + pasek) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-realization-col |
| ui-funkcja | resync pól wiersza propozycji | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor proposal-row-sync |
| ui-funkcja | zakres odświeżenia po edycji propozycji (silent vs pełne) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor proposal-patch-refresh |
| ui-dropdown | ProposalSupplierPicker (oferent produktu w wierszu propozycji) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor proposal-supplier-picker |
| ui-stala | PROPOSAL_SUPPLIER_AFTER (miejsce kolumny oferenta) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor proposal-supplier-after |
| ui-stala | PROPOSAL_FIELDS.num (pole liczbowe propozycji) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor proposal-field-num |
| ui-stala | NUM_KEYS (pola liczbowe wpisu realizacji) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor realization-entry-num-keys |
| ui-dropdown | Oferent produktu w karcie pozycji | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor product-card-supplier |
| ui-wiersz | RealizationEntryRow | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor realization-entry-row |
| ui-wiersz | osadzenie wierszy wpisów w tabeli | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor realization-entry-rows |
| ui-funkcja | fetchActuals | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor fetch-actuals |
| ui-funkcja | deleteActual | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor delete-actual |
| ui-funkcja | toggleRealizationClosed | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor toggle-realization-closed |
| ui-kolumna | kolumny realizacji w eksporcie Excel | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor materials-export-realization |
| ui-stala | ROW_INPUT (pola wierszy zakupowych) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor realization-row-input |
| ui-stala | ROW_FONT (jeden rozmiar czcionki okien wpisu zakupu) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor realization-row-font |
| ui-funkcja | updateActual (edycja wpisu w miejscu) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor update-actual |

### Moduł Realizacja — zakładka „Tabela realizacji"

#### Wspólne (`apps/frontend/src/components/shared/wbs/realizationShared.js`)

| Tag | Nazwa | Ścieżka | Anchor |
|-----|-------|---------|--------|
| ui-stala | OPEN_LEAF_TYPES (typy widoczne dla każdej roli) | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor realization-open-types |
| ui-funkcja | authHeaders | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor realization-auth-headers |
| ui-funkcja | flattenWbsNodes | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor realization-flatten-wbs-nodes |
| ui-funkcja | getParentPath | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor realization-get-parent-path |
| ui-funkcja | leafNodesOf (liście kosztowe po typie) | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor realization-leaf-nodes-of |
| ui-funkcja | buildCardMap (dopasowanie liść↔wymaganie) | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor realization-resolve-card |
| ui-funkcja | planUnitOf (koszt jedn. z wyceny) | apps/frontend/src/components/shared/wbs/realizationShared.js | @anchor realization-plan-unit-of |

#### Zakładka (`apps/frontend/src/components/shared/RealizationTab.jsx`)

| Tag | Nazwa | Ścieżka | Anchor |
|-----|-------|---------|--------|
| ui-zakladka | RealizationTab | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-tab |
| ui-zakladka | zakładka „Realizacja" w TAB_META | apps/frontend/src/DashboardPage.jsx | @anchor tab-realization |
| ui-zakladka | kolory zakładek wg etapu (po akceptacji baseline) | apps/frontend/src/DashboardPage.jsx | @anchor tab-stage-colors |
| ui-stala | COL_DEFS (kolumny tabeli realizacji) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-col-defs |
| ui-kolumna | Koszt całkowity (wycena / zakup / Δ) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-total-col |
| ui-kolumna | Produkt / zakres | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-product-col |
| ui-funkcja | exportExcel (widok + podsumowanie) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-export-excel |
| ui-funkcja | arkusz „Zakupy" w eksporcie Excel (wpisy zakupu + wymaganie) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-export-purchases |
| ui-kolumna | Cena ofertowa vs cena zakupu (arkusz Zakupy) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-export-purchase-vs-offer |
| ui-input | zakres wpisu (liście bez karty) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-scope |
| ui-kolumna | Status (WbsNode.status, edytowalny) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-status-col |
| ui-funkcja | statusLabel (etykieta statusu liścia) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-status-label |
| ui-stala | STATUS_OPTIONS (kody do wyboru, bez MIXED) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-status-options |
| ui-funkcja | saveStatus (PATCH węzła + karty materiałowej) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-save-status |
| ui-funkcja | patchCard — status idzie też na WbsNode | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor materials-patch-card-status-sync |
| ui-funkcja | wybór wymagania do sync statusu (tag → wbsNodeId) | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-status-req-link |
| ui-kolumna | Komentarz (WbsNode.comment) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-comment-col |
| ui-stan | commentVal (bufor komentarza wiersza) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-row-comment |
| ui-funkcja | saveComment (PATCH + rozgłoszenie) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-save-comment |
| ui-funkcja | focusNextInRow (Enter → następne okno) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-enter-next-field |
| ui-funkcja | selectAllOnFocus (focus zaznacza całą treść pola) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-select-all-on-focus |
| ui-funkcja | setClosed (znacznik „rozliczone" na pozycji) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-set-closed |
| ui-funkcja | deleteActual — ostatni wpis zdejmuje „rozliczone" | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-reopen-on-empty |
| ui-funkcja | reguła kolumny „Δ ilość" (test) | test/test-realization-close-delete.mjs | @anchor realization-delta-qty-rule |
| ui-funkcja | appendEntryComment (dziennik w komentarzu pozycji) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-append-entry-comment |
| ui-hook | listener wbs-comment-changed | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-comment-listener |
| ui-stan | formSeed (produkt do formularza wpisu) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-form-seed |
| ui-funkcja | offerProductOf (produkt z wyceny) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-offer-product |
| ui-funkcja | openEntryForm (pytanie „ten sam produkt?") | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-open-entry-form |
| ui-stan | productConfirm (pytanie o produkt czeka na odpowiedź) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-product-confirm |
| ui-stan | formSeedKey (licznik remountu formularza wpisu) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-form-seed-key |
| ui-funkcja | lab (nagłówek nad polem formularza wpisu) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-field-label |
| ui-kolumna | producent wpisu w kolumnie „Nazwa" | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-line-manufacturer |
| ui-funkcja | resolveProductConfirm (odpowiedź TAK/NIE na pytanie o produkt) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-resolve-product-confirm |
| ui-modal | ProductConfirmModal („ten sam produkt?" z TAK/NIE) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor product-confirm-modal |
| ui-input | koszt jedn. wpisu — bez podpowiedzi ceny | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-form-no-price |
| ui-stala | entryNoun / newEntryLabel / ADD_ENTRY_LABEL (zakup vs wykonanie) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-noun |
| ui-wiersz | RealizationRow | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-row |
| ui-przycisk | „+" dopisania wpisu (lewa strona wiersza) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-add-button |
| ui-wiersz | osadzenie wierszy wpisów w tabeli realizacji | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-tab-entry-rows |
| ui-wiersz | stopka „Razem" (podsumowanie kosztów całkowitych) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-totals-row |
| ui-wiersz | pusty wynik filtra wewnątrz tabeli (nagłówek filtrów zostaje) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-empty-filter-row |
| ui-wiersz | RealizationEntryLine (wpis w dzienniku) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-line |
| ui-formularz | RealizationEntryForm (przycisk „Nowy zakup") | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-form |
| ui-funkcja | submit formularza wpisu (zapis zamyka formularz) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-form-submit |
| ui-stan | brakujace (puste pola wymagane przy zapisie) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-form-missing |
| ui-funkcja | waliduj (cena, producent, model / zakres) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-form-validate |
| ui-stala | BRAK_ETYKIETY (nazwy pól w komunikacie „Uzupełnij lub popraw: …") | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-missing-labels |
| ui-stala | NUMERIC_ENTRY_FIELDS (pola wpisu niosące liczbę: qty, unitCost) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-numeric-fields |
| ui-funkcja | resolveEntryNumber (działanie „=4,3*220" → 946 przed zapisem) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-formula |
| ui-stala | FORMULA_HINT (dymek „można wpisać działanie") | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-formula-hint |
| ui-funkcja | growsWithText (pole tekstowe wpisu rośnie z treścią) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-entry-growing-fields |
| ui-kolumna | dostawcy pozycji — lista, nie skrót „+N" | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-row-suppliers |
| ui-wiersz | listwa domykająca szufladę rozwiniętej pozycji | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-drawer-cap |
| ui-kolumna | koszt całkowity wyceny — pomarańcz strony wyceny | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-total-plan-color |
| ui-panel | RealizationExpandPanel (wymagania techniczne + podgląd + dziennik) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-expand-panel |
| ui-stan | visibleTypes (filtr typów po roli) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-visible-types |
| ui-stan | visibleTypes (filtr typów po roli — panel Materiały) | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-visible-types |
| ui-stan | techPendingRef (niepotwierdzony PATCH wymagań) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-techspec-pending |
| ui-funkcja | fetchActuals | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-fetch-actuals |
| ui-funkcja | refreshCard | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-refresh-card |
| ui-stan | rows (liście + realizacja po filtrach) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-rows |
| ui-stan | totals (sumy widocznych wierszy) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-totals |
| ui-stan | analiza (odchylenia i prognoza per rodzaj kosztów) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-analysis |
| ui-stala | PROG_MIN_UDZIAL (próg wiarygodności prognozy) | apps/frontend/src/components/shared/RealizationTab.jsx | @anchor realization-forecast-min-share |

### Moduł tryby Budżetu — baseline / wykonanie / porównanie (Faza 7)

#### Frontend

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-panel | BudgetModesPanel | apps/frontend/src/components/shared/wbs/BudgetModesPanel.jsx | @anchor budget-modes-panel |
| ui-stala | SOURCE_STYLES (tryby budżetu) | apps/frontend/src/components/shared/wbs/BudgetModesPanel.jsx | @anchor budget-mode-source-styles |
| ui-funkcja | fetchAll (tryby budżetu) | apps/frontend/src/components/shared/wbs/BudgetModesPanel.jsx | @anchor budget-modes-fetch |
| ui-funkcja | sourceOf | apps/frontend/src/components/shared/wbs/BudgetModesPanel.jsx | @anchor budget-mode-source |
| ui-funkcja | savePrice (Wykonanie) | apps/frontend/src/components/shared/wbs/BudgetModesPanel.jsx | @anchor budget-mode-price-edit |
| ui-funkcja | exportComparison | apps/frontend/src/components/shared/wbs/BudgetModesPanel.jsx | @anchor budget-comparison-export |
| ui-sekcja | FragmentGroup (gałąź z sumami) | apps/frontend/src/components/shared/wbs/BudgetModesPanel.jsx | @anchor budget-comparison-group |
| ui-stan | budgetAcceptance | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor budget-acceptance |
| ui-stan | budgetMode | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor budget-mode |
| ui-sekcja | segmented control trybów Budżetu | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor budget-mode-switch |

### Moduł OfferLock (blokada wartości ofertowych po akceptacji baseline)

#### Backend (`apps/backend/src/common/offer-lock.util.ts` + wpięcia)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| back-funkcja | offerLockUtil (moduł reguły blokady) | apps/backend/src/common/offer-lock.util.ts | @anchor offer-lock-util |
| back-funkcja | assertOfferEditable | apps/backend/src/common/offer-lock.util.ts | @anchor assert-offer-editable |
| back-funkcja | pickOfferChanges | apps/backend/src/common/offer-lock.util.ts | @anchor pick-offer-changes |
| back-stala | OFFER_LOCKED_WBS_FIELDS | apps/backend/src/common/offer-lock.util.ts | @anchor offer-locked-wbs-fields |
| back-typ | OfferLockUser | apps/backend/src/common/offer-lock.util.ts | @anchor offer-lock-user |
| back-funkcja | guard budżetu WBS | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-budget-offer-lock |
| back-funkcja | guard pól węzła WBS | apps/backend/src/wbs-nodes/wbs-nodes.service.ts | @anchor wbs-node-offer-lock |
| back-funkcja | assertProposalOfferEditable | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor assert-proposal-offer-editable |
| back-funkcja | guard propozycji isOffer | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor proposal-offer-lock |

#### Frontend (`apps/frontend/src/components/shared/OfferLockGuard.jsx` + wpięcia)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| ui-sekcja | OfferLockGuard | apps/frontend/src/components/shared/OfferLockGuard.jsx | @anchor offer-lock-guard |
| ui-stan | offerLockState | apps/frontend/src/components/shared/OfferLockGuard.jsx | @anchor offer-lock-state |
| ui-funkcja | offerLockRequestFn | apps/frontend/src/components/shared/OfferLockGuard.jsx | @anchor offer-lock-request-fn |
| ui-funkcja | setOfferLockState | apps/frontend/src/components/shared/OfferLockGuard.jsx | @anchor set-offer-lock-state |
| ui-hook | useOfferLock | apps/frontend/src/components/shared/OfferLockGuard.jsx | @anchor use-offer-lock |
| ui-funkcja | guardOfferEdit | apps/frontend/src/components/shared/OfferLockGuard.jsx | @anchor guard-offer-edit |
| ui-funkcja | requestOfferUnlock | apps/frontend/src/components/shared/OfferLockGuard.jsx | @anchor request-offer-unlock |
| ui-funkcja | offerLockInputProps | apps/frontend/src/components/shared/OfferLockGuard.jsx | @anchor offer-lock-input-props |
| ui-stala | OFFER_VALUE_FIELDS | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor offer-value-fields |
| ui-stan | offerLocked (UnifiedWbsPanel) | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor offer-locked |
| ui-funkcja | guard w updateNodeField | apps/frontend/src/components/shared/wbs/UnifiedWbsPanel.jsx | @anchor update-node-field-offer-lock |
| ui-propsy | BudgetTable.offerLocked | apps/frontend/src/components/shared/wbs/BudgetTable.jsx | @anchor budget-table-offer-locked |
| ui-propsy | WBSHybridTable.offerLocked | apps/frontend/src/components/shared/wbs/WBSHybridTable.jsx | @anchor wbs-hybrid-offer-lock |
| ui-propsy | WbsMaterialsPanel.offerLocked | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor wbs-materials-offer-locked |

### Moduł obrazek pozycji (podgląd produktu pozycji)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| schema-pole | MaterialRequirement.imageUrl | apps/backend/prisma/schema.prisma | @anchor mat-req-image-url |
| back-funkcja | uploadImage (pozycja) | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-upload-image |
| back-funkcja | deleteImage (pozycja) | apps/backend/src/material-requirements/material-requirements.service.ts | @anchor mat-req-delete-image |
| back-endpoint | DELETE /material-requirements/:id/image | apps/backend/src/material-requirements/material-requirements.controller.ts | @anchor mat-req-delete-image-endpoint |
| ui-sekcja | RequirementImageBox | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor requirement-image-box |
| ui-ikona | kosz i lupka na kaflu zdjęcia w karcie produktu | apps/frontend/src/components/shared/wbs/WbsMaterialsPanel.jsx | @anchor product-card-image-actions |

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

### Moduł Urlopy (leaves)

| Tag | Nazwa | Plik | Anchor |
|-----|-------|------|--------|
| schema-model | LeaveType | apps/backend/prisma/schema.prisma | @anchor leave-type |
| schema-pole | LeaveType.id | apps/backend/prisma/schema.prisma | @anchor leave-type-id |
| schema-pole | LeaveType.code | apps/backend/prisma/schema.prisma | @anchor leave-type-code |
| schema-pole | LeaveType.name | apps/backend/prisma/schema.prisma | @anchor leave-type-name |
| schema-pole | LeaveType.color | apps/backend/prisma/schema.prisma | @anchor leave-type-color |
| schema-pole | LeaveType.sortOrder | apps/backend/prisma/schema.prisma | @anchor leave-type-sort-order |
| schema-pole | LeaveType.isActive | apps/backend/prisma/schema.prisma | @anchor leave-type-is-active |
| schema-relacja | LeaveType.leaves | apps/backend/prisma/schema.prisma | @anchor leave-type-leaves |
| schema-model | Leave | apps/backend/prisma/schema.prisma | @anchor leave |
| schema-pole | Leave.id | apps/backend/prisma/schema.prisma | @anchor leave-id |
| schema-pole | Leave.userId | apps/backend/prisma/schema.prisma | @anchor leave-user-id |
| schema-pole | Leave.leaveTypeId | apps/backend/prisma/schema.prisma | @anchor leave-leave-type-id |
| schema-pole | Leave.dateFrom | apps/backend/prisma/schema.prisma | @anchor leave-date-from |
| schema-pole | Leave.dateTo | apps/backend/prisma/schema.prisma | @anchor leave-date-to |
| schema-pole | Leave.daysCount | apps/backend/prisma/schema.prisma | @anchor leave-days-count |
| schema-pole | Leave.note | apps/backend/prisma/schema.prisma | @anchor leave-note |
| schema-relacja | Leave.user | apps/backend/prisma/schema.prisma | @anchor leave-user |
| schema-relacja | Leave.leaveType | apps/backend/prisma/schema.prisma | @anchor leave-leave-type |
| schema-pole | User.company | apps/backend/prisma/schema.prisma | @anchor user-company |
| schema-relacja | User.leaves | apps/backend/prisma/schema.prisma | @anchor user-leaves |
| schema-model | LeaveRequest | apps/backend/prisma/schema.prisma | @anchor leave-request |
| schema-pole | LeaveRequest.id | apps/backend/prisma/schema.prisma | @anchor leave-request-id |
| schema-pole | LeaveRequest.userId | apps/backend/prisma/schema.prisma | @anchor leave-request-user-id |
| schema-pole | LeaveRequest.dateStart | apps/backend/prisma/schema.prisma | @anchor leave-request-date-start |
| schema-pole | LeaveRequest.timeStart | apps/backend/prisma/schema.prisma | @anchor leave-request-time-start |
| schema-pole | LeaveRequest.dateEnd | apps/backend/prisma/schema.prisma | @anchor leave-request-date-end |
| schema-pole | LeaveRequest.timeEnd | apps/backend/prisma/schema.prisma | @anchor leave-request-time-end |
| schema-pole | LeaveRequest.officeFrom | apps/backend/prisma/schema.prisma | @anchor leave-request-office-from |
| schema-pole | LeaveRequest.officeTo | apps/backend/prisma/schema.prisma | @anchor leave-request-office-to |
| schema-pole | LeaveRequest.comment | apps/backend/prisma/schema.prisma | @anchor leave-request-comment |
| schema-pole | LeaveRequest.submittedAt | apps/backend/prisma/schema.prisma | @anchor leave-request-submitted-at |
| schema-pole | LeaveRequest.approvedAt | apps/backend/prisma/schema.prisma | @anchor leave-request-approved-at |
| schema-pole | LeaveRequest.remainingY4 | apps/backend/prisma/schema.prisma | @anchor leave-request-remaining-y4 |
| schema-pole | LeaveRequest.remainingY3 | apps/backend/prisma/schema.prisma | @anchor leave-request-remaining-y3 |
| schema-pole | LeaveRequest.remainingY2 | apps/backend/prisma/schema.prisma | @anchor leave-request-remaining-y2 |
| schema-pole | LeaveRequest.remainingY1 | apps/backend/prisma/schema.prisma | @anchor leave-request-remaining-y1 |
| schema-pole | LeaveRequest.remainingCurrentYear | apps/backend/prisma/schema.prisma | @anchor leave-request-remaining-current |
| schema-relacja | LeaveRequest.user | apps/backend/prisma/schema.prisma | @anchor leave-request-user |
| schema-relacja | User.leaveRequests | apps/backend/prisma/schema.prisma | @anchor user-leave-requests |
| back-modul | LeavesModule | apps/backend/src/leaves/leaves.module.ts | @anchor leaves-module |
| back-serwis | LeavesService | apps/backend/src/leaves/leaves.service.ts | @anchor leaves-service |
| back-controller | LeavesController | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-controller |
| back-stala | LEAVE_COMPANIES | apps/backend/src/leaves/leaves.service.ts | @anchor leave-companies |
| back-typ | LeaveAccess | apps/backend/src/leaves/leaves.service.ts | @anchor leave-access-dto |
| back-dto | CreateLeaveDto | apps/backend/src/leaves/leaves.service.ts | @anchor create-leave-dto |
| back-dto | UpdateLeaveDto | apps/backend/src/leaves/leaves.service.ts | @anchor update-leave-dto |
| back-funkcja | LeavesService.resolveAccess | apps/backend/src/leaves/leaves.service.ts | @anchor resolve-leave-access |
| back-funkcja | LeavesService.assertEnabled | apps/backend/src/leaves/leaves.service.ts | @anchor assert-leave-enabled |
| back-funkcja | LeavesService.visibleUserIds | apps/backend/src/leaves/leaves.service.ts | @anchor visible-user-ids |
| back-funkcja | LeavesService.listTypes | apps/backend/src/leaves/leaves.service.ts | @anchor list-leave-types |
| back-funkcja | LeavesService.list | apps/backend/src/leaves/leaves.service.ts | @anchor list-leaves |
| back-funkcja | LeavesService.listEmployees | apps/backend/src/leaves/leaves.service.ts | @anchor list-leave-employees |
| back-funkcja | LeavesService.create | apps/backend/src/leaves/leaves.service.ts | @anchor create-leave |
| back-funkcja | LeavesService.update | apps/backend/src/leaves/leaves.service.ts | @anchor update-leave |
| back-funkcja | LeavesService.remove | apps/backend/src/leaves/leaves.service.ts | @anchor remove-leave |
| back-funkcja | LeavesService.workingDaysBetween | apps/backend/src/leaves/leaves.service.ts | @anchor working-days-between |
| back-endpoint | GET /leaves/access | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-access-endpoint |
| back-endpoint | GET /leaves/types | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-types-endpoint |
| back-endpoint | GET /leaves/employees | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-employees-endpoint |
| back-endpoint | GET /leaves | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-list-endpoint |
| back-endpoint | POST /leaves | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-create-endpoint |
| back-endpoint | PATCH /leaves/:id | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-update-endpoint |
| back-endpoint | DELETE /leaves/:id | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-delete-endpoint |
| schema-pole | LeaveRequest.leaveTypeId | apps/backend/prisma/schema.prisma | @anchor leave-request-leave-type-id |
| schema-pole | LeaveRequest.daysCount | apps/backend/prisma/schema.prisma | @anchor leave-request-days-count |
| schema-relacja | LeaveRequest.leaveType | apps/backend/prisma/schema.prisma | @anchor leave-request-leave-type |
| schema-relacja | LeaveType.requests | apps/backend/prisma/schema.prisma | @anchor leave-type-requests |
| back-serwis | LeaveRequestsService | apps/backend/src/leaves/leave-requests.service.ts | @anchor leave-requests-service |
| back-controller | LeaveRequestsController | apps/backend/src/leaves/leave-requests.controller.ts | @anchor leave-requests-controller |
| back-dto | CreateLeaveRequestDto | apps/backend/src/leaves/leave-requests.service.ts | @anchor create-leave-request-dto |
| back-dto | UpdateLeaveRequestDto | apps/backend/src/leaves/leave-requests.service.ts | @anchor update-leave-request-dto |
| back-funkcja | LeaveRequestsService.workingDaysBetween | apps/backend/src/leaves/leave-requests.service.ts | @anchor working-days-between-requests |
| back-funkcja | LeaveRequestsService.warsawDayKey | apps/backend/src/leaves/leave-requests.service.ts | @anchor warsaw-day-key |
| back-funkcja | LeaveRequestsService.assertRequestFieldsValid | apps/backend/src/leaves/leave-requests.service.ts | @anchor assert-request-fields-valid |
| ui-funkcja | workingDays (modal wniosku) | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor working-days-between-front |
| ui-stan | daysTouched | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor days-touched |
| ui-funkcja | auto przeliczanie dni | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor auto-days-count |
| ui-input | dni urlopu (wniosek) | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor leave-request-days-field |
| ui-stan | showApplicant | apps/frontend/src/components/shared/leaves/LeaveRequestsTab.jsx | @anchor leave-requests-show-applicant |
| back-funkcja | LeaveRequestsService.listOwn | apps/backend/src/leaves/leave-requests.service.ts | @anchor list-own-leave-requests |
| back-funkcja | LeaveRequestsService.listSubordinates | apps/backend/src/leaves/leave-requests.service.ts | @anchor list-subordinate-leave-requests |
| back-funkcja | LeaveRequestsService.create | apps/backend/src/leaves/leave-requests.service.ts | @anchor create-leave-request |
| back-funkcja | LeaveRequestsService.update | apps/backend/src/leaves/leave-requests.service.ts | @anchor update-leave-request |
| back-funkcja | LeaveRequestsService.remove | apps/backend/src/leaves/leave-requests.service.ts | @anchor remove-leave-request |
| back-funkcja | LeaveRequestsService.dashboard | apps/backend/src/leaves/leave-requests.service.ts | @anchor leave-dashboard-summary |
| back-funkcja | LeaveRequestsService.isSupervisorOf | apps/backend/src/leaves/leave-requests.service.ts | @anchor is-supervisor-of |
| back-endpoint | GET /leave-requests/mine | apps/backend/src/leaves/leave-requests.controller.ts | @anchor leave-requests-mine-endpoint |
| back-endpoint | GET /leave-requests/subordinates | apps/backend/src/leaves/leave-requests.controller.ts | @anchor leave-requests-subordinates-endpoint |
| back-endpoint | GET /leave-requests/dashboard | apps/backend/src/leaves/leave-requests.controller.ts | @anchor leave-requests-dashboard-endpoint |
| back-endpoint | POST /leave-requests | apps/backend/src/leaves/leave-requests.controller.ts | @anchor leave-requests-create-endpoint |
| back-endpoint | PATCH /leave-requests/:id | apps/backend/src/leaves/leave-requests.controller.ts | @anchor leave-requests-update-endpoint |
| back-endpoint | DELETE /leave-requests/:id | apps/backend/src/leaves/leave-requests.controller.ts | @anchor leave-requests-delete-endpoint |
| ui-stala | LEAVE_TABS | apps/frontend/src/LeavesPage.jsx | @anchor leaves-tab-meta |
| ui-sekcja | pasek zakladek Urlopy | apps/frontend/src/LeavesPage.jsx | @anchor leaves-tab-selector |
| ui-karta | DraggableCard | apps/frontend/src/components/shared/leaves/DraggableCard.jsx | @anchor draggable-card |
| ui-funkcja | handleMouseDown (DraggableCard) | apps/frontend/src/components/shared/leaves/DraggableCard.jsx | @anchor draggable-card-start |
| ui-stala | CARD_IDS | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-card-ids |
| ui-sekcja | warstwa kart (Moje dane) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-cards-layer |
| ui-przycisk | Nowy wniosek (karta dane osobowe) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor card-new-request-button |
| ui-stan | modalRequest (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-request-modal-state |
| ui-modal | wniosek w Moich danych | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-request-modal |
| ui-karta | karta dane osobowe | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor card-personal-data |
| ui-karta | karta saldo dni | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor card-balance |
| ui-karta | karta wykorzystane dni | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor card-usage |
| ui-przycisk | Szczegoly wg lat (karta wykorzystane) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor card-usage-details-button |
| ui-stan | usageRows (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-usage-rows |
| ui-funkcja | loadUsage (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor load-my-usage |
| ui-karta | karta urlopy z lat poprzednich | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor card-history |
| ui-stan | historyOpen (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-history-open |
| ui-stan | historyYear (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-history-year |
| ui-stan | historyItems (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-history-items |
| ui-stan | historyYears (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-history-years |
| ui-kolumna | kolumny tabeli historii urlopow | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-history-col-defs |
| ui-dropdown | filtr lat w karcie historii | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-history-filter |
| ui-funkcja | fetchLeaveUsage | apps/frontend/src/components/shared/leaves/leaveUsage.js | @anchor fetch-leave-usage |
| ui-funkcja | warsawYear | apps/frontend/src/components/shared/leaves/leaveUsage.js | @anchor warsaw-year |
| schema-pole | Leave.leaveRequestId | apps/backend/prisma/schema.prisma | @anchor leave-leave-request-id |
| schema-relacja | Leave.leaveRequest | apps/backend/prisma/schema.prisma | @anchor leave-leave-request |
| schema-relacja | LeaveRequest.leave | apps/backend/prisma/schema.prisma | @anchor leave-request-leave |
| back-funkcja | synchronizacja wpisu z wnioskiem | apps/backend/src/leaves/leave-requests.service.ts | @anchor sync-leave-from-request |
| schema-model | HolidayDayOff | apps/backend/prisma/schema.prisma | @anchor holiday-day-off |
| schema-pole | HolidayDayOff.id | apps/backend/prisma/schema.prisma | @anchor holiday-day-off-id |
| schema-pole | HolidayDayOff.year | apps/backend/prisma/schema.prisma | @anchor holiday-day-off-year |
| schema-pole | HolidayDayOff.name | apps/backend/prisma/schema.prisma | @anchor holiday-day-off-name |
| schema-pole | HolidayDayOff.approvedAt | apps/backend/prisma/schema.prisma | @anchor holiday-day-off-approved-at |
| schema-pole | HolidayDayOff.approvedById | apps/backend/prisma/schema.prisma | @anchor holiday-day-off-approved-by-id |
| schema-pole | HolidayDayOff.date | apps/backend/prisma/schema.prisma | @anchor holiday-day-off-date |
| schema-pole | HolidayDayOff.approved | apps/backend/prisma/schema.prisma | @anchor holiday-day-off-approved |
| schema-relacja | HolidayDayOff.approvedBy | apps/backend/prisma/schema.prisma | @anchor holiday-day-off-approved-by |
| schema-relacja | User.approvedHolidayDaysOff | apps/backend/prisma/schema.prisma | @anchor user-holiday-days-off |
| back-serwis | HolidaysService | apps/backend/src/leaves/holidays.service.ts | @anchor holidays-service |
| back-stala | POLISH_FIXED_HOLIDAYS | apps/backend/src/leaves/holidays.service.ts | @anchor polish-fixed-holidays |
| back-funkcja | proposalsForYear | apps/backend/src/leaves/holidays.service.ts | @anchor saturday-holidays-for-year |
| back-funkcja | lista dni wolnych za swieta | apps/backend/src/leaves/holidays.service.ts | @anchor list-holiday-days-off |
| back-funkcja | zatwierdzanie dni wolnych | apps/backend/src/leaves/holidays.service.ts | @anchor approve-holiday-days-off |
| back-funkcja | liczba zatwierdzonych dni wolnych | apps/backend/src/leaves/holidays.service.ts | @anchor approved-holiday-days-count |
| back-dto | SaturdayHolidayProposal | apps/backend/src/leaves/holidays.service.ts | @anchor saturday-holiday-proposal |
| back-endpoint | GET /leaves/holidays | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-holidays-get-endpoint |
| back-endpoint | PUT /leaves/holidays | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-holidays-put-endpoint |
| schema-pole | LeaveType.maxDaysPerYear | apps/backend/prisma/schema.prisma | @anchor leave-type-max-days-per-year |
| back-skrypt | seed uzytkownikow — blokada | apps/backend/prisma/seed-users-from-json.js | @anchor seed-users-guard |
| back-funkcja | limit ustawowy dni w roku | apps/backend/src/leaves/leave-requests.service.ts | @anchor assert-statutory-limit |
| back-funkcja | zuzycie dni wg rodzaju urlopu | apps/backend/src/leaves/leave-requests.service.ts | @anchor leave-type-usage |
| back-endpoint | GET /leave-requests/type-usage | apps/backend/src/leaves/leave-requests.controller.ts | @anchor leave-requests-type-usage-endpoint |
| ui-stan | typeUsage (LeaveRequestModal) | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor leave-request-modal-type-usage |
| ui-funkcja | pobranie zuzycia dni (wniosek) | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor fetch-type-usage |
| ui-stan | selectedUsage (LeaveRequestModal) | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor selected-type-usage |
| ui-sekcja | pasek wybrano/zostalo we wniosku | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor leave-request-type-usage-info |
| ui-typ | maxDaysPerYear (leaveUsage) | apps/frontend/src/components/shared/leaves/leaveUsage.js | @anchor leave-usage-max-days |
| ui-kolumna | limit w karcie wykorzystanych dni | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor card-usage-limit |
| back-stala | SATURDAY_HOLIDAY_CODE | apps/backend/src/leaves/leave-requests.service.ts | @anchor saturday-holiday-leave-code |
| back-funkcja | limit wnioskow za swieto w sobote | apps/backend/src/leaves/leave-requests.service.ts | @anchor assert-saturday-holiday-days |
| ui-karta | karta dni wolne za swieta | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor card-holidays |
| ui-tabela | tabela dni wolnych za swieta | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-holidays-table |
| ui-karta | karta zarzadzania dniami wolnymi (admin) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor card-holidays-admin |
| ui-stan | holidays (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-holidays-state |
| ui-funkcja | loadHolidays (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor fetch-my-holidays |
| ui-panel | HolidayAdminPanel | apps/frontend/src/components/shared/leaves/HolidayAdminPanel.jsx | @anchor holiday-admin-panel |
| ui-funkcja | pobranie dni wolnych (admin) | apps/frontend/src/components/shared/leaves/HolidayAdminPanel.jsx | @anchor holiday-admin-load |
| ui-funkcja | zatwierdzenie / cofniecie dnia | apps/frontend/src/components/shared/leaves/HolidayAdminPanel.jsx | @anchor holiday-admin-toggle |
| ui-funkcja | dodanie wlasnego dnia | apps/frontend/src/components/shared/leaves/HolidayAdminPanel.jsx | @anchor holiday-admin-add-custom |
| ui-funkcja | usuniecie wlasnego dnia | apps/frontend/src/components/shared/leaves/HolidayAdminPanel.jsx | @anchor holiday-admin-remove-custom |
| ui-lista | lista dni wolnych (admin) | apps/frontend/src/components/shared/leaves/HolidayAdminPanel.jsx | @anchor holiday-admin-list |
| ui-formularz | wlasny dzien wolny | apps/frontend/src/components/shared/leaves/HolidayAdminPanel.jsx | @anchor holiday-admin-custom-form |
| back-funkcja | dodanie wlasnego dnia wolnego | apps/backend/src/leaves/holidays.service.ts | @anchor add-custom-holiday-day-off |
| back-funkcja | usuniecie wlasnego dnia wolnego | apps/backend/src/leaves/holidays.service.ts | @anchor remove-custom-holiday-day-off |
| ui-stan | isAdmin (DynamicSidebar) | apps/frontend/src/components/Layout/DynamicSidebar.jsx | @anchor sidebar-is-admin |
| ui-przycisk | menu Uzytkownicy (sidebar) | apps/frontend/src/components/Layout/DynamicSidebar.jsx | @anchor sidebar-users-button |
| ui-funkcja | tokenRoles | apps/frontend/src/App.jsx | @anchor token-roles |
| ui-sekcja | AdminRoute | apps/frontend/src/App.jsx | @anchor admin-route |
| back-endpoint | GET /users (lista) | apps/backend/src/users/users.controller.ts | @anchor users-list-endpoint |
| back-endpoint | PATCH /company | apps/backend/src/company/company.controller.ts | @anchor company-update-endpoint |
| back-endpoint | POST /leaves/holidays/custom | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-holidays-custom-post-endpoint |
| back-endpoint | DELETE /leaves/holidays/custom | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-holidays-custom-delete-endpoint |
| ui-typ | currentYearDays (leaveUsage) | apps/frontend/src/components/shared/leaves/leaveUsage.js | @anchor leave-usage-current-year-days |
| ui-typ | items (leaveUsage) | apps/frontend/src/components/shared/leaves/leaveUsage.js | @anchor leave-usage-items |
| ui-karta | karta podopieczni | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor card-dependents |
| ui-stala | GOV_LEAVES_URL | apps/frontend/src/LeavesPage.jsx | @anchor leaves-gov-url |
| ui-ikona | link gov.pl urlopy (naglowek) | apps/frontend/src/LeavesPage.jsx | @anchor link-gov-leaves |
| ui-zakladka | Kalendarz (Urlopy) | apps/frontend/src/components/shared/leaves/LeavesCalendarTab.jsx | @anchor leaves-calendar-tab |
| ui-stala | meta zakladki Kalendarz | apps/frontend/src/LeavesPage.jsx | @anchor leaves-calendar-tab-meta |
| ui-stala | GOOGLE_CALENDAR_CID | apps/frontend/src/components/shared/leaves/LeavesCalendarTab.jsx | @anchor leaves-google-calendar-cid |
| ui-stala | GOOGLE_CALENDAR_URL | apps/frontend/src/components/shared/leaves/LeavesCalendarTab.jsx | @anchor leaves-google-calendar-url |
| ui-stala | GOOGLE_CALENDAR_EMBED_URL | apps/frontend/src/components/shared/leaves/LeavesCalendarTab.jsx | @anchor leaves-google-calendar-embed-url |
| ui-ikona | link kalendarz Google | apps/frontend/src/components/shared/leaves/LeavesCalendarTab.jsx | @anchor link-google-calendar |
| ui-sekcja | osadzony kalendarz Google | apps/frontend/src/components/shared/leaves/LeavesCalendarTab.jsx | @anchor google-calendar-embed |
| ui-tabela | tabela moich urlopow (karta ruchoma) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-table |
| ui-sekcja | filtr rodzajow przy tabeli | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-type-filter |
| ui-funkcja | pomiar karty (DraggableCard) | apps/frontend/src/components/shared/leaves/DraggableCard.jsx | @anchor draggable-card-measure |
| ui-stala | DEFAULT_LAYOUT (Moje dane) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-default-layout |
| ui-stan | layout kart (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-layout-state |
| ui-stan | layoutDirty (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-layout-dirty |
| ui-funkcja | pobranie ukladu kart | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor fetch-my-layout |
| ui-funkcja | handleMeasure (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-measure-card |
| ui-funkcja | handleDragEnd (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-drag-end |
| ui-funkcja | handleSaveLayout (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-save-layout |
| ui-sekcja | pasek zapisu ukladu kart | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-layout-toolbar |
| ui-przycisk | Zapisz polozenie kart | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-save-layout-button |
| ui-stala | GAP siatki kart | apps/frontend/src/components/shared/leaves/cardsLayout.js | @anchor cards-layout-gap |
| ui-funkcja | findFreeSpot | apps/frontend/src/components/shared/leaves/cardsLayout.js | @anchor find-free-spot |
| ui-funkcja | resolveCardOverlaps | apps/frontend/src/components/shared/leaves/cardsLayout.js | @anchor resolve-card-overlaps |
| back-stala | LEAVES_LAYOUT_ENTITY | apps/backend/src/leaves/leaves.service.ts | @anchor leaves-layout-entity-type |
| back-serwis | getLayout (LeavesService) | apps/backend/src/leaves/leaves.service.ts | @anchor get-leaves-layout |
| back-serwis | saveLayout (LeavesService) | apps/backend/src/leaves/leaves.service.ts | @anchor save-leaves-layout |
| back-endpoint | GET /leaves/layout | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-layout-get-endpoint |
| back-endpoint | PUT /leaves/layout | apps/backend/src/leaves/leaves.controller.ts | @anchor leaves-layout-put-endpoint |
| ui-funkcja | fetchSummary (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor fetch-my-summary |
| ui-funkcja | handleResetLayout | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-reset-layout |
| ui-zakladka | MyLeavesTab (Moje dane) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-tab |
| ui-stan | me / meOnly (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-self |
| ui-stan | visibleLeaves (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-visible |
| ui-zakladka | podzakladki rodzajow urlopu | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor leaves-type-subtabs |
| ui-funkcja | fetchLeaves (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor fetch-my-leaves |
| ui-kolumna | kolumny tabeli moich urlopow | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-col-defs |
| ui-zakladka | LeaveRequestsTab (Wnioski / podwladnych) | apps/frontend/src/components/shared/leaves/LeaveRequestsTab.jsx | @anchor leave-requests-tab |
| ui-funkcja | fetchRequests (LeaveRequestsTab) | apps/frontend/src/components/shared/leaves/LeaveRequestsTab.jsx | @anchor fetch-leave-requests |
| ui-funkcja | setDecision (LeaveRequestsTab) | apps/frontend/src/components/shared/leaves/LeaveRequestsTab.jsx | @anchor decide-leave-request-front |
| schema-model | Dependent | apps/backend/prisma/schema.prisma | @anchor dependent |
| schema-pole | Dependent.id | apps/backend/prisma/schema.prisma | @anchor dependent-id |
| schema-pole | Dependent.userId | apps/backend/prisma/schema.prisma | @anchor dependent-user-id |
| schema-pole | Dependent.firstName | apps/backend/prisma/schema.prisma | @anchor dependent-first-name |
| schema-pole | Dependent.lastName | apps/backend/prisma/schema.prisma | @anchor dependent-last-name |
| schema-pole | Dependent.birthDate | apps/backend/prisma/schema.prisma | @anchor dependent-birth-date |
| schema-relacja | Dependent.user | apps/backend/prisma/schema.prisma | @anchor dependent-user |
| schema-relacja | Dependent.requests | apps/backend/prisma/schema.prisma | @anchor dependent-requests |
| schema-relacja | User.dependents | apps/backend/prisma/schema.prisma | @anchor user-dependents |
| schema-pole | LeaveRequest.dependentId | apps/backend/prisma/schema.prisma | @anchor leave-request-dependent-id |
| schema-relacja | LeaveRequest.dependent | apps/backend/prisma/schema.prisma | @anchor leave-request-dependent |
| back-serwis | DependentsService | apps/backend/src/leaves/dependents.service.ts | @anchor dependents-service |
| back-controller | DependentsController | apps/backend/src/leaves/dependents.controller.ts | @anchor dependents-controller |
| back-dto | CreateDependentDto | apps/backend/src/leaves/dependents.service.ts | @anchor create-dependent-dto |
| back-dto | UpdateDependentDto | apps/backend/src/leaves/dependents.service.ts | @anchor update-dependent-dto |
| back-funkcja | DependentsService.list | apps/backend/src/leaves/dependents.service.ts | @anchor list-dependents |
| back-funkcja | DependentsService.create | apps/backend/src/leaves/dependents.service.ts | @anchor create-dependent |
| back-funkcja | DependentsService.update | apps/backend/src/leaves/dependents.service.ts | @anchor update-dependent |
| back-funkcja | DependentsService.remove | apps/backend/src/leaves/dependents.service.ts | @anchor remove-dependent |
| back-funkcja | DependentsService.resolveSubject | apps/backend/src/leaves/dependents.service.ts | @anchor resolve-dependent-subject |
| back-funkcja | LeaveRequestsService.assertDependentValid | apps/backend/src/leaves/leave-requests.service.ts | @anchor assert-dependent-valid |
| back-stala | CARE_LEAVE_CODE | apps/backend/src/leaves/leave-requests.service.ts | @anchor care-leave-code |
| back-endpoint | GET /dependents | apps/backend/src/leaves/dependents.controller.ts | @anchor dependents-list-endpoint |
| back-endpoint | POST /dependents | apps/backend/src/leaves/dependents.controller.ts | @anchor dependents-create-endpoint |
| back-endpoint | PATCH /dependents/:id | apps/backend/src/leaves/dependents.controller.ts | @anchor dependents-update-endpoint |
| back-endpoint | DELETE /dependents/:id | apps/backend/src/leaves/dependents.controller.ts | @anchor dependents-delete-endpoint |
| ui-sekcja | DependentsSection | apps/frontend/src/components/shared/leaves/DependentsSection.jsx | @anchor dependents-section |
| ui-funkcja | fetchDependents (sekcja) | apps/frontend/src/components/shared/leaves/DependentsSection.jsx | @anchor fetch-dependents-section |
| ui-funkcja | handleSave (DependentsSection) | apps/frontend/src/components/shared/leaves/DependentsSection.jsx | @anchor save-dependent |
| ui-formularz | formularz podopiecznego | apps/frontend/src/components/shared/leaves/DependentsSection.jsx | @anchor dependent-draft-form |
| ui-sekcja | pola podopiecznego we wniosku | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor leave-request-dependent-section |
| ui-stan | isCareLeave | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor is-care-leave |
| ui-funkcja | fetchDependents (modal) | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor fetch-dependents |
| ui-stala | CARE_LEAVE_CODE (front) | apps/frontend/src/components/shared/leaves/leavesTheme.js | @anchor care-leave-code-front |
| ui-modal | LeaveRequestModal | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor leave-request-modal |
| ui-zakladka | LeavesDashboardTab | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor leaves-dashboard-tab |
| ui-funkcja | fetchDashboard | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor fetch-leaves-dashboard |
| ui-panel | panel FILTR (Dashboard) | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor dashboard-filter-panel |
| ui-panel | panel szczegoly pracownika | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor dashboard-employee-panel |
| ui-panel | panel saldo dni | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor dashboard-balance-panel |
| ui-panel | panel wnioski pracownika | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor dashboard-requests-panel |
| ui-stala | leavesGridTheme | apps/frontend/src/components/shared/leaves/leavesTheme.js | @anchor leaves-grid-theme |
| ui-stala | leavesDefaultColDef | apps/frontend/src/components/shared/leaves/leavesTheme.js | @anchor leaves-default-col-def |
| ui-funkcja | formatDateTime | apps/frontend/src/components/shared/leaves/leavesTheme.js | @anchor format-leave-datetime |
| ui-widok | LeavesPage | apps/frontend/src/LeavesPage.jsx | @anchor leaves-page |
| ui-modal | LeaveModal | apps/frontend/src/components/shared/LeaveModal.jsx | @anchor leave-modal |
| ui-funkcja | fetchMeta (LeavesPage) | apps/frontend/src/LeavesPage.jsx | @anchor fetch-leaves-meta |
| ui-stala | LEAVE_COMPANIES (front) | apps/frontend/src/utils/leaveCompanies.js | @anchor leave-companies-front |
| ui-przycisk | Urlopy (sidebar) | apps/frontend/src/components/Layout/DynamicSidebar.jsx | @anchor sidebar-urlopy-button |
| ui-stan | leavesEnabled (MainLayout) | apps/frontend/src/components/Layout/MainLayout.jsx | @anchor layout-leaves-enabled |
| ui-kolumna | Firma (UsersPage) | apps/frontend/src/UsersPage.jsx | @anchor users-company-column |
| ui-stan | companyOptions (UsersPage) | apps/frontend/src/UsersPage.jsx | @anchor company-options |
| ui-input | Firma (EditUserModal) | apps/frontend/src/components/shared/EditUserModal.jsx | @anchor edit-user-company-field |
| ui-dropdown | Przełożony (EditUserModal) | apps/frontend/src/components/shared/EditUserModal.jsx | @anchor supervisor-options |
| schema-enum | LeaveRequestStatus | apps/backend/prisma/schema.prisma | @anchor leave-request-status |
| schema-pole | LeaveRequest.status | apps/backend/prisma/schema.prisma | @anchor leave-request-status-field |
| schema-pole | LeaveRequest.rejectedAt | apps/backend/prisma/schema.prisma | @anchor leave-request-rejected-at |
| schema-pole | LeaveRequest.decisionComment | apps/backend/prisma/schema.prisma | @anchor leave-request-decision-comment |
| schema-pole | LeaveRequest.decidedById | apps/backend/prisma/schema.prisma | @anchor leave-request-decided-by-id |
| schema-relacja | LeaveRequest.decidedBy | apps/backend/prisma/schema.prisma | @anchor leave-request-decided-by |
| schema-relacja | LeaveRequest.deductions | apps/backend/prisma/schema.prisma | @anchor leave-request-deductions |
| schema-pole | LeaveType.consumesBalance | apps/backend/prisma/schema.prisma | @anchor leave-type-consumes-balance |
| schema-model | LeaveBalance | apps/backend/prisma/schema.prisma | @anchor leave-balance |
| schema-pole | LeaveBalance.id | apps/backend/prisma/schema.prisma | @anchor leave-balance-id |
| schema-pole | LeaveBalance.userId | apps/backend/prisma/schema.prisma | @anchor leave-balance-user-id |
| schema-pole | LeaveBalance.year | apps/backend/prisma/schema.prisma | @anchor leave-balance-year |
| schema-pole | LeaveBalance.entitlementDays | apps/backend/prisma/schema.prisma | @anchor leave-balance-entitlement-days |
| schema-pole | LeaveBalance.usedDays | apps/backend/prisma/schema.prisma | @anchor leave-balance-used-days |
| schema-relacja | LeaveBalance.user | apps/backend/prisma/schema.prisma | @anchor leave-balance-user |
| schema-model | LeaveDeduction | apps/backend/prisma/schema.prisma | @anchor leave-deduction |
| schema-pole | LeaveDeduction.id | apps/backend/prisma/schema.prisma | @anchor leave-deduction-id |
| schema-pole | LeaveDeduction.leaveRequestId | apps/backend/prisma/schema.prisma | @anchor leave-deduction-request-id |
| schema-pole | LeaveDeduction.year | apps/backend/prisma/schema.prisma | @anchor leave-deduction-year |
| schema-pole | LeaveDeduction.days | apps/backend/prisma/schema.prisma | @anchor leave-deduction-days |
| schema-relacja | LeaveDeduction.leaveRequest | apps/backend/prisma/schema.prisma | @anchor leave-deduction-request |
| schema-relacja | User.leaveBalances | apps/backend/prisma/schema.prisma | @anchor user-leave-balances |
| schema-relacja | User.leaveDecisions | apps/backend/prisma/schema.prisma | @anchor user-leave-decisions |
| back-serwis | LeaveBalancesService | apps/backend/src/leaves/leave-balances.service.ts | @anchor leave-balances-service |
| back-controller | LeaveBalancesController | apps/backend/src/leaves/leave-balances.controller.ts | @anchor leave-balances-controller |
| back-stala | LEAVE_BALANCE_YEARS_BACK | apps/backend/src/leaves/leave-balances.service.ts | @anchor leave-balance-years-back |
| back-typ | LeaveBalanceYear | apps/backend/src/leaves/leave-balances.service.ts | @anchor leave-balance-year-dto |
| back-dto | SetEntitlementDto | apps/backend/src/leaves/leave-balances.service.ts | @anchor set-entitlement-dto |
| back-dto | DecideLeaveRequestDto | apps/backend/src/leaves/leave-requests.service.ts | @anchor decide-leave-request-dto |
| back-funkcja | LeaveBalancesService.window | apps/backend/src/leaves/leave-balances.service.ts | @anchor leave-balance-window |
| back-funkcja | LeaveBalancesService.getBalance | apps/backend/src/leaves/leave-balances.service.ts | @anchor get-leave-balance |
| back-funkcja | LeaveBalancesService.read | apps/backend/src/leaves/leave-balances.service.ts | @anchor read-leave-balance |
| back-funkcja | LeaveBalancesService.setEntitlement | apps/backend/src/leaves/leave-balances.service.ts | @anchor set-leave-entitlement |
| back-funkcja | LeaveBalancesService.assertDaysAvailable | apps/backend/src/leaves/leave-balances.service.ts | @anchor assert-days-available |
| back-funkcja | LeaveBalancesService.applyDeductions | apps/backend/src/leaves/leave-balances.service.ts | @anchor apply-leave-deductions |
| back-funkcja | LeaveBalancesService.revertDeductions | apps/backend/src/leaves/leave-balances.service.ts | @anchor revert-leave-deductions |
| back-funkcja | LeaveBalancesService.isSupervisorOf | apps/backend/src/leaves/leave-balances.service.ts | @anchor balance-is-supervisor-of |
| back-funkcja | LeaveRequestsService.decide | apps/backend/src/leaves/leave-requests.service.ts | @anchor decide-leave-request |
| back-funkcja | LeaveRequestsService.balanceSnapshot | apps/backend/src/leaves/leave-requests.service.ts | @anchor leave-request-balance-snapshot |
| back-funkcja | LeaveRequestsService.consumesBalance | apps/backend/src/leaves/leave-requests.service.ts | @anchor leave-type-consumes-balance-check |
| back-funkcja | LeaveRequestsService.notifySupervisor | apps/backend/src/leaves/leave-requests.service.ts | @anchor notify-supervisor-leave-request |
| back-funkcja | MailService.sendLeaveRequest | apps/backend/src/mail/mail.service.ts | @anchor mail-send-leave-request |
| back-funkcja | MailService.sendLeaveDecision | apps/backend/src/mail/mail.service.ts | @anchor mail-send-leave-decision |
| back-funkcja | formatLeaveDate | apps/backend/src/mail/mail.service.ts | @anchor format-leave-mail-date |
| back-funkcja | LeaveRequestsService.notifyApplicant | apps/backend/src/leaves/leave-requests.service.ts | @anchor notify-applicant-leave-decision |
| back-endpoint | GET /leave-balances | apps/backend/src/leaves/leave-balances.controller.ts | @anchor leave-balances-read-endpoint |
| back-endpoint | PUT /leave-balances/entitlement | apps/backend/src/leaves/leave-balances.controller.ts | @anchor leave-balances-entitlement-endpoint |
| back-endpoint | PATCH /leave-requests/:id/decision | apps/backend/src/leaves/leave-requests.controller.ts | @anchor leave-requests-decision-endpoint |
| ui-stala | LEAVE_REQUEST_STATUSES | apps/frontend/src/components/shared/leaves/leavesTheme.js | @anchor leave-request-statuses |
| ui-funkcja | statusMeta | apps/frontend/src/components/shared/leaves/leavesTheme.js | @anchor leave-request-status-meta |
| ui-kolumna | Status (wnioski) | apps/frontend/src/components/shared/leaves/LeaveRequestsTab.jsx | @anchor leave-requests-status-column |
| ui-stan | balance (LeaveRequestModal) | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor leave-request-modal-balance |
| ui-hook | fetchLeaveBalance | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor fetch-leave-balance |
| ui-stan | consumesBalance (modal) | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor selected-type-consumes-balance |
| ui-stan | balanceBlock | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor leave-request-balance-block |
| ui-sekcja | banner dostępnych dni | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor leave-request-balance-banner |
| ui-sekcja | siatka lat salda (modal) | apps/frontend/src/components/shared/leaves/LeaveRequestModal.jsx | @anchor leave-request-balance-grid |
| ui-funkcja | warsawDayKey (front) | apps/frontend/src/components/shared/leaves/leavesTheme.js | @anchor warsaw-day-key-front |
| ui-sekcja | DpPortal (kalendarz urlopów) | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor leaves-datepicker-portal |
| ui-input | data w filtrze Dashboardu | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor leaves-filter-date-field |
| ui-funkcja | filteredRequests (Dashboard) | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor dashboard-filter-requests |
| ui-stan | balanceYears (Dashboard) | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor dashboard-balance-years |
| ui-stan | canDecide (Dashboard) | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor dashboard-can-decide |
| ui-funkcja | setDecision (Dashboard) | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor dashboard-decide-request |
| ui-funkcja | saveEntitlement | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor dashboard-save-entitlement |
| ui-kolumna | akcje wniosku (Dashboard) | apps/frontend/src/components/shared/leaves/LeavesDashboardTab.jsx | @anchor dashboard-request-actions |
| ui-stan | balanceRows (MyLeavesTab) | apps/frontend/src/components/shared/leaves/MyLeavesTab.jsx | @anchor my-leaves-balance-years |

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

