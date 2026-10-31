# Plan: ujednolicenie Subtask → UserTask

Stan na 2026-10-31. Ustalenia z rozmowy z użytkownikiem; nic z tego planu nie jest jeszcze zaimplementowane
(poza przygotowaniem: wybór godziny `TaskTimePicker`, komentarz wieloliniowy z sync do MS To Do — commit `e4cd3eb`).

## Cel

Jeden model zadania — `UserTask`. `Subtask` (podzadanie harmonogramu) znika: dane migrują do `UserTask`,
formanty z `SubtaskModal` przechodzą do jednego wspólnego modala zadania.

Każde zadanie:
- jest przypięte do **węzła** (wymagane),
- ma **datę i godzinę** (domyślnie 8:00, minuty tylko :00 / :30 — `TaskTimePicker`),
- ma **status** z kodów `EXEC_STATUS_META` (`wbsConstants.js`),
- ma osobę odpowiedzialną, komentarz (wieloliniowy), widoczność.

Synchronizacja zostaje jak dziś dla `UserTask`: MS To Do w dwie strony (tytuł, termin, status, komentarz),
Outlook w jedną stronę (wydarzenie w kalendarzu odpowiedzialnego, gdy zadanie ma godzinę), przypomnienia `TaskReminder`.

## Dane na produkcji (2026-10-31)

| | liczba |
|---|---|
| subtasks | 66 (45 z osobą przypisaną) |
| user_tasks (nieusunięte) | 38, z czego 29 bez `wbsNodeId` |
| budget_line_items z `subtaskId` | 53 |
| subtask_files | 0 |
| subtask_marker_links | 3 |

29 z 38 `UserTask` nie ma węzła WBS — reguła „węzeł wymagany” potrzebuje decyzji, co z nimi (patrz niżej).

## Docelowy przepływ

```
Kalendarz zamówienia (klik w dzień / drag) ─┐
WBS: węzeł → lista zadań → „Dodaj zadanie” ─┼─> JEDEN modal zadania ─> UserTask
MS To Do (#slug w tytule)                   ─┘                            │
Subtask (migracja, znika) ─────────────────────────────────────────────────┤
                                                                           ├─> Kalendarz zamówienia: WSZYSTKIE zadania zamówienia,
                                                                           │   kolor kafelka = status (EXEC_STATUS_META)
                                                                           ├─> MS To Do (2 kierunki)
                                                                           ├─> Outlook osoby (zawsze z godziną)
                                                                           └─> Przypomnienie (Web Push)
```

## Mapowanie pól Subtask → UserTask

| Subtask | UserTask | uwagi |
|---|---|---|
| `name` | `title` | |
| `description` | `description` | w UI „Komentarz” |
| `status` | `status` (kody EXEC) | patrz mapowanie statusów |
| `visibilityType` | **nowe pole** `visibilityType` | ALL / MANAGER_ONLY / LOGISTYK_ONLY / MANAGER_LOGISTYK |
| `plannedStart`, `plannedEnd` | `plannedStart`, `plannedEnd` + `durationMinutes` | brak godziny → 8:00, 60 min |
| `assignedUserId` | `userId` (odpowiedzialny) | bez osoby → decyzja (autor? kierownik zamówienia?) |
| `nodeId` | `nodeId` | zamówienie |
| — | `wbsNodeId` | Subtask nie ma węzła WBS; przypiąć po `requirementItemId` albo do węzła „bez gałęzi” |
| `versionId` | **nowe pole?** | zależy od decyzji o wersjonowaniu |
| `category`, `phase` | **nowe pola** | |
| `requirementItemId` | **nowe pole** | |
| `isAiGenerated`, `isApproved` | **nowe pola** | |
| `files` (SubtaskFile) | relacja do UserTask | na prod 0 plików |
| `budgetItems` (BudgetLineItem.subtaskId) | `BudgetLineItem.userTaskId` | 53 pozycje na prod — przepiąć |
| `schematicMarkers`, `markerLinks`, `SchematicDocument.subtaskId` | relacje do UserTask | 3 linki na prod |
| `materialRequirements` | relacja do UserTask | sprawdzić faktyczną kolumnę FK |
| `SubtaskTemplate` | szablony zadań dla UserTask | przemianować lub zostawić model |

## Mapowanie statusów

| Subtask | UserTask (dziś) | Nowy kod |
|---|---|---|
| NEW, PLANNED | OPEN | `TO_DO` |
| STARTED | — | `IN_PROGRESS` |
| ON_HOLD | — | `ON_HOLD` |
| FINISHED | DONE | `DONE` |
| CANCELLED | — | `CANCELLED` |

MS To Do zna tylko `notStarted` / `completed` → `DONE` = completed, reszta = notStarted
(przy pullu `notStarted` nie może nadpisać `IN_PROGRESS` / `ON_HOLD` na `TO_DO`).

## Etapy

1. **Decyzje** (przed kodem — z użytkownikiem, lista niżej).
2. **Schema**: nowe pola w `UserTask`, nowe FK (`userTaskId`) w BudgetLineItem / SchematicMarker / SchematicDocument / SubtaskMarkerLink / MaterialRequirement / plikach; migracja Prisma (prod stosuje `migrate deploy`, dev ręcznie psql + wpis do `_prisma_migrations`).
   Jeśli zadania mają wersję — dodać do `cloneVersionData` (`backend/src/ai/versioning.service.ts`).
3. **Migracja danych** SQL: Subtask → UserTask (statusy, osoby, godzina 8:00), przepięcie FK; backup przed (`test/backup-…`). Zadania migrowane NIE mogą masowo tworzyć wydarzeń w Outlooku / wpisów w To Do przy migracji — zdecydować, czy sync rusza dopiero przy pierwszej edycji.
4. **Backend**: statusy EXEC w `user-tasks.service.ts` i `task-sync.service.ts`, endpointy dla pól z Subtaska, widoczność; endpoint „wszystkie zadania zamówienia” dla kalendarza.
5. **Frontend — jeden modal** (`TaskModal`): tryb tworzenia i edycji, pola z tabeli, `TaskTimePicker`, `AutoResizeTextarea` na komentarz; zastępuje `SubtaskModal`, `UserTaskEditModal` i inline formularz w szufladzie `WBSHybridTable`.
6. **Kalendarz** (`TasksCalendarSection` / `CalendarView`): tylko UserTask, wszystkie zadania zamówienia, kolor wg statusu, godzina na kafelku, drag zachowuje godzinę, klik w dzień = modal z datą.
7. **WBS**: węzeł → lista jego zadań → „Dodaj zadanie” otwiera ten sam modal z wypełnionym węzłem.
8. **Pozostali konsumenci Subtask**: `AllTasksModal`, `SchematTab`/`SchematicViewer`, mobile (`MobileDashboard`, `useCachedSubtasks`, `subtasksRepo`, `db.js`, `syncOutbox`, `prefetch` — offline!), AI (`ai.service`, `budget.service`, `docx.service`, `vector.service`), `process-tree`, `order-requirements`, `material-requirements`, `schematics`.
9. **Usunięcie** modelu `Subtask`, modułu `subtasks`, `SubtaskModal`; sprzątanie anchorów w `SLOWNIK.md`; wpis w `CHANGELOG.md`.

## Decyzje do podjęcia (przed etapem 2)

1. **Wersjonowanie**: Subtask jest klonowany z wersją projektu, UserTask nie. Czy zadania mają się kopiować przy nowej wersji?
2. **Węzeł wymagany**: gdzie przypiąć 29 obecnych UserTask bez `wbsNodeId`, migrowane Subtaski (nie mają węzła WBS) i zadania z MS To Do bez `#slug`?
3. **Subtask bez osoby** (21 na prod): kto zostaje odpowiedzialnym?
4. **Status zadania vs `execStatus` węzła**: osobny (te same kody) czy wspólny z węzłem?
5. **Sync przy migracji**: czy zmigrowane zadania od razu trafiają do MS To Do / Outlooka osób?

## Decyzje (2026-10-31)

1. **Wersjonowanie** — zadania NIE są klonowane z wersją (duplikaty w MS To Do / Outlooku).
   `createVersion` (nowa aktywna wersja) przepina `wbsNodeId` istniejących zadań na nowe węzły przez `wbsIdMap`;
   `createFrozenCopy` i materializacja baseline zadań nie ruszają. Kalendarz pobiera zadania po zamówieniu (`nodeId`),
   niezależnie od wersji. `UserTask.versionId` nieużywane. Migrujemy tylko Subtaski z wersji aktywnej / baseline —
   te z nieaktywnych wersji to kopie (na dev 14 z 63), zostają tylko w backupie.
2. **Węzeł** — w modalu pole wyboru węzła; dla zadania z zamówieniem wymagane przy zapisie. W bazie `wbsNodeId`
   zostaje opcjonalne (zadania osobiste, MS To Do bez `#slug`). Migrowane Subtaski dostają `wbsNodeId = NULL`
   (bez automatycznego dopasowania, bez tworzenia węzłów zbiorczych) — węzeł wybiera się ręcznie w modalu;
   lista / kalendarz oznacza zadania „bez węzła”.
3. **Subtask bez osoby** — odpowiedzialny: andrzej@gigatel.app (ADMIN).
4. **Status** — osobny od `execStatus` węzła, te same kody i kolory (`EXEC_STATUS_META`), podzbiór:
   `TO_DO`, `IN_PROGRESS`, `ON_HOLD`, `DONE`, `CANCELLED`. Bez automatycznej propagacji na węzeł.
5. **Sync przy migracji** — brak masowego syncu: `source = 'SUBTASK_MIGRATION'`, do MS To Do / Outlooka trafiają
   dopiero przy pierwszej edycji; `DONE` / `CANCELLED` nigdy.

## Konsumenci Subtask spoza listy z etapu 8 (weryfikacja 2026-10-31)

Frontend: `uploadQueue.js`, `MarkerDetailsPanel.jsx`, `schematPdfExport.js`, `schematicsRepo.js`, `outboxRepo.js`,
`OrphanAttachmentsPanel.jsx`, `AddNodeModal.jsx`, `DynamicSidebar.jsx`, `App.jsx`, `MobileUserTasks.jsx`, `MobileOrdersTree.jsx`.
FK w `MaterialRequirement` to `assignedSubtaskId`. `SubtaskFile` nigdzie nie jest zapisywany (tylko `include`), na prod 0 wierszy —
nie dostaje następcy, znika w etapie 9. `BudgetLineItem.subtaskId` ma `onDelete: Cascade` — nowe `userTaskId` ma `SetNull`. `requirementItemId` wskazuje pozycję JSON w `OrderRequirement`, nie węzeł WBS.

## Zasady projektu do pamiętania

- Każda nowa zmienna: `// @anchor …` + wiersz w `SLOWNIK.md`; usunięte — usunąć wiersz.
- Zmiany schema / API → wpis w `CHANGELOG.md` przed commitem.
- Nowa kolumna z `versionId` → `cloneVersionData`.
- Po zmianie backendu na dev: `docker restart erp-backend`.
- Bez commitów, merge i deployu bez zgody użytkownika; testy w Chrome.
