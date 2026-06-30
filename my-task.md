# MS To Do / Samsung Reminder ↔ Ignite — plan integracji zadań

Dokument-handoff. Konceptualne ustalenia zostały zrobione w sesji z 2026-06-30 — niniejszy plik zawiera wszystko czego potrzebuje świeża sesja Claude do dokończenia implementacji bez dodatkowych pytań do użytkownika.

---

## 1. Cel i kontekst

Synchronizacja dwukierunkowa zadań osobistych między **Samsung Reminder** (Android) ↔ **Microsoft To Do** ↔ **Ignite**. Każde zadanie może być opcjonalnie przypięte do węzła WBS w drzewie projektowym. Alarmy z popupami w przeglądarce + Web Push.

**Klucz:** Samsung Reminder syncuje się natywnie z MS To Do (telefon Samsung w ustawieniach konta MS). My nie integrujemy z Samsung bezpośrednio — wszystko idzie przez **MS Graph API → /me/todo**.

Ignite już ma OAuth do MS Graph dla OneDrive (`OneDriveService`, model `UserMsToken`, env `MS_CLIENT_ID/SECRET/TENANT_ID/REDIRECT_URI`, klucz szyfrujący `MS_TOKEN_ENCRYPTION_KEY`).

**Azure jest skonfigurowane** — aplikacja zarejestrowana, OAuth flow działa dla OneDrive. Brakuje tylko **uprawnienia `Tasks.ReadWrite`** (delegated) dla Microsoft Graph w portalu Azure → App registrations → API permissions. Admin consent po dodaniu uprawnienia.

---

## 2. Decyzje projektowe (zatwierdzone)

| # | Decyzja | Wybór |
|---|---------|-------|
| 1 | Trigger sync | **1a + 1c** — cron co 5 min + pull przy otwarciu widoku `/my-tasks` |
| 2 | Konflikt | **2a** — last-write-wins po `lastModifiedDateTime` z Graph vs `updatedAt` w DB; bez toastów |
| 3.1 | `msListName` w `UserTask` | **TAK** — przechowujemy nazwę listy MS To Do |
| 3.2 | Mechanizm auto-pinningu | **`ProcessNode.taskListSlug`** — user ręcznie ustawia slug per węzeł |
| 3.3 | Hashtag w tytule | **Hashtag wygrywa nad listą** (`#bramy` w tytule > nazwa listy) |
| 3.4 | Domyślna lista MS To Do („Zadania") | Bez specjalnej obsługi — jak każda inna |
| 3.5 | Przeniesienie zadania między listami w MS To Do | Re-pinning na nowy węzeł (jeśli ma slug-match); odpinanie jeśli nie |
| 3.6 | UI widoku | **Nowa zakładka w sidebarze `/my-tasks`** — cross-project |
| 3.7 | Filtry | Status, lista MS, węzeł, zakres dat |
| 3.8 | Akcje | Edycja inline + „Przypnij do węzła" + checkbox DONE |
| 4 | Bootstrap | **4c** — tylko od momentu połączenia konta MS (bez historii) |
| 5 | Popup alarmu | **5c** — modal blokujący z 3 akcjami: `Odłóż 10/30/60 min`, `Wykonane`, `Otwórz zadanie` |
| 6 | Cykliczność (recurrence) | **6b** — MVP bez tego, na drugą fazę |
| 7 | Statusy zadań | **7a** — tylko `OPEN \| DONE` (Samsung Reminder de facto ma 2 stany) |
| 8 | Usunięcie | **8b** — soft delete (`deletedAt`), kosz 30 dni, potem cron czyści twardo |
| — | Alarmy | **Per-user** (`TaskReminder` z `userId, taskId, remindAt, sentAt`) |
| — | Godzina zadań | **Opcjonalna**, fallback domyślnej godziny alarmu (default 9:00) |
| — | Alarm w UI | **Popup w Ignite** (in-app modal) + Web Push (gdy zakładka nie jest aktywna) |
| — | Slug węzła | Opcjonalny, ręcznie ustawiany (z auto-podpowiedzią z nazwy), unikalny per user |

**Pytania jeszcze otwarte (do potwierdzenia w przyszłej sesji):**

- **A.** Dwa hashtagi w jednym tytule → pierwszy wygrywa? (rekomendacja: tak)
- **B.** Ręczne przypięcie w Ignite → automatycznie dodawać `#slug` do tytułu MS To Do? (rekomendacja: tak)
- **C.** Retroaktywny scan po ustawieniu slug → automat czy modal confirm? (rekomendacja: automat z toastem)
- **D.** Retencja kosza 30 dni — OK? (default w panelu admin)
- **E.** Konflikt — całkowicie cichy czy toast „konflikt, zachowano wersję X"? (rekomendacja: cichy)
- **F.** Przycisk „zaimportuj historyczne" w bootstrap — w MVP czy 2. fazie? (rekomendacja: 2. faza)

---

## 3. Stan na 2026-06-30 (co już zrobione)

### Frontend
- `apps/frontend/src/NotificationSettingsPage.jsx` — **szkielet panelu admin** (route `/notifications`, admin-only). Sekcje: Web Push, MS To Do, Domyślne alarmy (godzina 9:00, retencja, snooze presets 5/10/15/30/60/120 min), info o slugach. Zapis ustawień to **placeholder** (`handleSave` z setTimeoutem), diagnostyka czyta tylko `GET /push/public-key`.
- `apps/frontend/src/components/Layout/DynamicSidebar.jsx` — **kafelek „Powiadomienia"** pod „Poczta SMTP" (admin-only, `@anchor sidebar-notifications-button`).
- `apps/frontend/src/App.jsx` — **route `/notifications`** zarejestrowany.
- `apps/frontend/src/version.js` — bump do `v2026.06.30.620`.
- `CHANGELOG.md`, `SLOWNIK.md` — wpisy dla nowych anchorów.

### Backend
- **Nic.** Cała integracja MS To Do, model `UserTask`, cron, alarmy — do zrobienia.

---

## 4. Roadmap implementacji (kolejność)

### Etap 1 — Backend ustawień powiadomień (1 dzień)

**Cel:** podpiąć panel `/notifications` do realnego zapisu w DB. Wzorzec analogiczny do `SmtpSettings`.

#### Schema (`apps/backend/prisma/schema.prisma`)

```prisma
model SystemNotificationSettings {
  id                          String   @id @default("singleton")
  defaultReminderHour         Int      @default(9)
  snoozePresetsMinutes        Json     @default("[10,30,60]")
  trashRetentionDays          Int      @default(30)
  msTodoSyncIntervalMinutes   Int      @default(5)
  msTodoEnabled               Boolean  @default(true)
  webPushEnabled              Boolean  @default(true)
  updatedAt                   DateTime @updatedAt

  @@map("system_notification_settings")
}
```

#### Moduł `apps/backend/src/notification-settings/`

- `notification-settings.module.ts` — Global module
- `notification-settings.service.ts` — `getOrCreate()`, `update(dto)`, `getStats()` (zlicza `pushSubscription`, `userMsToken`, `taskReminder` pending)
- `notification-settings.controller.ts` — endpointy:
  - `GET /notification-settings` (ADMIN) — zwraca settings + diagnostykę (vapidConfigured, msGraphConfigured, webPushSubscriptions, msConnectedUsers, pendingReminders)
  - `PATCH /notification-settings` (ADMIN) — upsert
  - `POST /notification-settings/test-push` (ADMIN) — wysyła test do bieżącego usera przez `PushService.sendToUser`

#### Frontend
Zamień placeholdery w `NotificationSettingsPage.jsx`:
- `fetchSettings` → `GET /notification-settings`, ustawia `form` i `diag` z jednej odpowiedzi
- `handleSave` → `PATCH /notification-settings`
- `handleTestPush` → `POST /notification-settings/test-push`

CHANGELOG: zmiana strukturalna — nowy model + nowy moduł. SLOWNIK: anchory `notif-settings-service`, `notif-settings-controller`, `system-notification-settings` (schema).

---

### Etap 2 — Schema dla zadań osobistych (1 dzień)

#### `schema.prisma` — nowe modele

```prisma
model UserTask {
  id              String          @id @default(uuid())
  userId          String
  nodeId          String?
  versionId       String?
  title           String
  description     String?
  status          String          @default("OPEN")
  plannedStart    DateTime?
  plannedEnd      DateTime?
  msToDoId        String?         @unique
  msListId        String?
  msListName      String?
  msEtag          String?
  msLastModified  DateTime?
  source          String          @default("IGNITE")
  deletedAt       DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  node            ProcessNode?    @relation(fields: [nodeId], references: [id], onDelete: SetNull)
  reminders       TaskReminder[]

  @@index([userId, deletedAt])
  @@index([userId, nodeId])
  @@index([msToDoId])
  @@map("user_tasks")
}

model TaskReminder {
  id          String   @id @default(uuid())
  userTaskId  String
  userId      String
  remindAt    DateTime
  sentAt      DateTime?
  snoozedFrom DateTime?
  createdAt   DateTime @default(now())
  userTask    UserTask @relation(fields: [userTaskId], references: [id], onDelete: Cascade)

  @@index([remindAt, sentAt])
  @@index([userId])
  @@map("task_reminders")
}

model MsTodoSyncState {
  userId              String   @id
  deltaLink           String?
  msTodoSyncStartedAt DateTime?
  lastSyncAt          DateTime?
  lastSyncError       String?
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("ms_todo_sync_state")
}
```

#### Rozszerzenie istniejących modeli

```prisma
model ProcessNode {
  // ...istniejące pola...
  taskListSlug   String?
  userTasks      UserTask[]

  @@unique([taskListSlug], name: "unique_task_list_slug_per_owner")
}
```

**UWAGA:** unikalność sluga ma być **per właściciel węzła** (czyjego usera widzi to drzewo). Jeśli ProcessNode jest globalny — unikalność globalna. Sprawdzić strukturę uprawnień w obecnej apce; jeśli każdy user widzi swój subtree, dodać `ownerUserId` jako klucz.

```prisma
model User {
  // ...istniejące...
  userTasks         UserTask[]
  taskReminders     TaskReminder[]
  msTodoSyncState   MsTodoSyncState?
}
```

#### Migracja
`npx prisma migrate dev --name add_user_tasks_and_slug` (lokalnie), potem ręczna migracja na proda przez `prisma migrate deploy`.

#### Słownik — anchory do dopisania
- `schema-model` `UserTask`, `TaskReminder`, `MsTodoSyncState`
- `schema-pole` `UserTask.msToDoId`, `UserTask.msListName`, `UserTask.msEtag`, `UserTask.source`, `ProcessNode.taskListSlug`

---

### Etap 3 — Backend MS Graph / To Do (1–2 dni)

#### Azure
**Manualnie:** w `portal.azure.com → App registrations → [Ignite app] → API permissions → Add a permission → Microsoft Graph → Delegated → Tasks.ReadWrite → Grant admin consent`.

#### Moduł `apps/backend/src/ms-todo/`

Wzorowany na `OneDriveService` (`apps/backend/src/onedrive/onedrive.service.ts`).

- `ms-todo.module.ts`
- `ms-todo.service.ts` — kluczowe metody:
  - `getValidAccessToken(userId)` — refresh jeśli expired (reuse logikę z `OneDriveService`)
  - `fetchLists(userId)` → `GET /me/todo/lists`
  - `fetchTasksDelta(userId, deltaLink?)` — `GET /me/todo/lists/delta` lub kontynuacja deltaLink; zwraca `{ value: Task[], '@odata.deltaLink': string }`
  - `createTask(userId, listId, payload)` → `POST /me/todo/lists/{listId}/tasks`
  - `updateTask(userId, listId, taskId, patch)` → `PATCH ...`
  - `deleteTask(userId, listId, taskId)` → `DELETE ...`

#### Scope w OAuth flow

`SCOPES` w `OneDriveService` ma już `Files.ReadWrite offline_access User.Read`. **Dodać `Tasks.ReadWrite`** — zmiana wymaga reauth każdego usera (token bez nowego scope nie pozwoli na `/me/todo`).

Decyzja architektoniczna: czy:
- **(a)** rozszerzyć `OneDriveService.SCOPES` o `Tasks.ReadWrite` (jeden token MS na usera, więcej uprawnień) ← **rekomendowane**
- **(b)** osobny token MS na usera per scope (komplikuje model `UserMsToken`)

Wybór (a) → migracja: dla każdego istniejącego `UserMsToken` ustawić flagę `needsReauth = true`, w UI panel pokazuje banner „uprawnienie do To Do wymaga ponownego połączenia konta MS".

#### Endpointy w `MsTodoController`

- `GET /ms-todo/lists` — proxy do `service.fetchLists` (debug + UI ręcznego mapowania list ↔ węzły)
- `GET /ms-todo/status` — zwraca `{ connected: bool, lastSyncAt, lastSyncError, needsReauth }`
- `POST /ms-todo/disconnect` — usuwa `UserMsToken` + `MsTodoSyncState`
- `POST /ms-todo/resync` (ADMIN i właściciel) — wymusza natychmiastowy sync, ignoruje cron

CHANGELOG: nowy moduł, nowe endpointy. SLOWNIK: nowe anchory `ms-todo-service`, `ms-todo-controller`, `ms-todo-fetch-delta`.

---

### Etap 4 — Cron sync + cron alarmów (1 dzień)

#### Bootstrap `@nestjs/schedule`
Sprawdzić czy `ScheduleModule.forRoot()` jest już w `apps/backend/src/app.module.ts`. Jeśli nie — dodać.

#### Moduł `apps/backend/src/cron/notification-cron.service.ts`

```typescript
@Injectable()
export class NotificationCronService {
  // Sync MS To Do — interwał z SystemNotificationSettings (domyślnie 5 min)
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'ms-todo-sync' })
  async runMsTodoSync() {
    if (this.syncRunning) return;
    this.syncRunning = true;
    try {
      const users = await this.prisma.userMsToken.findMany({
        where: { /* connected + last activity < 30 dni */ },
        select: { userId: true },
      });
      // Rozłożenie po minutach okna (anti-thundering-herd)
      const minute = new Date().getMinutes() % 5;
      const batch = users.filter((_, i) => i % 5 === minute);
      await Promise.all(batch.map(u => this.syncSingleUser(u.userId).catch(e => this.logger.error(e))));
    } finally {
      this.syncRunning = false;
    }
  }

  // Dispatch alarmów
  @Cron('* * * * *', { name: 'reminder-dispatch' })
  async dispatchReminders() {
    const due = await this.prisma.taskReminder.findMany({
      where: { remindAt: { lte: new Date() }, sentAt: null, userTask: { deletedAt: null, status: 'OPEN' } },
      include: { userTask: { include: { node: true } } },
      take: 100,
    });
    for (const r of due) {
      await this.sendReminder(r);
      await this.prisma.taskReminder.update({ where: { id: r.id }, data: { sentAt: new Date() } });
    }
  }

  // Czyszczenie kosza
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'trash-cleanup' })
  async cleanTrash() {
    const settings = await this.prisma.systemNotificationSettings.findFirst();
    if (!settings || settings.trashRetentionDays === 0) return;
    const cutoff = new Date(Date.now() - settings.trashRetentionDays * 86400000);
    await this.prisma.userTask.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  }
}
```

#### `sendReminder(reminder)`
1. Web Push przez `PushService.sendToUser(userId, title, body, ...)` — payload zawiera `userTaskId` i typ `REMINDER`
2. (Opcjonalnie) zapis w `Notification` (in-app)
3. Frontend service worker odbiera push, pokazuje system notification; gdy zakładka aktywna — `postMessage` do app → otwiera modal popup

---

### Etap 5 — Sync logic (1–2 dni)

#### `syncSingleUser(userId)` w `MsTodoService`

```
1. Pobierz lub utwórz MsTodoSyncState (jeśli brak deltaLink → bootstrap)
2. fetchTasksDelta(userId, deltaLink)
3. Dla każdego task w response:
   a. Jeśli @removed → softDelete lokalnie
   b. Jeśli istnieje lokalny UserTask z msToDoId → resolveConflict(local, remote)
   c. Jeśli nowy → upsertFromGraph
4. Push pending changes z lokalnej outbox (UserTask gdzie msLastModified < updatedAt AND msToDoId IS NOT NULL)
5. Zapisz nowy deltaLink + lastSyncAt
6. Jeśli błąd 401/403 → ustaw needsReauth = true na UserMsToken
```

#### `resolveConflict(local, remote)` — last-write-wins

```typescript
if (remote.lastModifiedDateTime > local.updatedAt) {
  // Remote wygrywa — nadpisz lokalnie
  await this.prisma.userTask.update({
    where: { id: local.id },
    data: { ...mapFromGraph(remote), updatedAt: local.updatedAt }, // zachowaj lokalny updatedAt
  });
} else if (local.updatedAt > remote.lastModifiedDateTime) {
  // Local wygrywa — push do Graph w fazie outbox
  this.outboxAdd(local);
}
// else: identyczne, nic
```

#### Mapowanie pól

| MS Graph (todoTask) | UserTask |
|---------------------|----------|
| `id` | `msToDoId` |
| `title` | `title` |
| `body.content` | `description` |
| `status` (`notStarted`/`inProgress`/`completed`/`waitingOnOthers`/`deferred`) | `OPEN` lub `DONE` (mapowanie: `completed → DONE`, reszta → `OPEN`) |
| `dueDateTime.dateTime` (UTC) | `plannedEnd` |
| `startDateTime.dateTime` | `plannedStart` |
| `reminderDateTime.dateTime` | tworzy/aktualizuje `TaskReminder.remindAt` |
| `lastModifiedDateTime` | `msLastModified` |
| (lista parent) | `msListId`, `msListName` |

#### Auto-pinning — `resolveNodeId(task, userId)`

```typescript
async resolveNodeId(title: string, msListName: string, userId: string): Promise<string | null> {
  // 1. Pierwszy hashtag w tytule
  const m = title.match(/#([a-z0-9-]+)/i);
  if (m) {
    const slug = m[1].toLowerCase();
    const node = await this.prisma.processNode.findFirst({
      where: { taskListSlug: slug /* + ownership scope */ },
    });
    if (node) return node.id;
  }
  // 2. Nazwa listy → slugify
  if (msListName) {
    const slug = slugify(msListName); // lowercase, polish chars → ascii, spacje → '-'
    const node = await this.prisma.processNode.findFirst({
      where: { taskListSlug: slug },
    });
    if (node) return node.id;
  }
  return null; // luźne
}
```

#### Push do Graph — `pushToGraph(userTask)`

- Nowe (`msToDoId == null`) → `POST /me/todo/lists/{listId}/tasks`. `listId` = albo listy o pasującej nazwie do sluga węzła, albo defaultowa lista usera (cache w `MsTodoSyncState`).
- Update → `PATCH`. Mapuj pola w drugą stronę.
- Soft delete → `DELETE /me/todo/lists/{listId}/tasks/{taskId}` (po stronie MS twardo, po stronie Ignite został `deletedAt`).

#### Ręczne przypięcie w Ignite → hashtag (przypadek 5 w analizie)

Gdy user w UI klika „Przypnij do węzła":
```typescript
async pinToNode(userTaskId: string, nodeId: string) {
  const node = await this.prisma.processNode.findUnique({ where: { id: nodeId } });
  const task = await this.prisma.userTask.findUnique({ where: { id: userTaskId } });
  let newTitle = task.title;
  if (node.taskListSlug && !task.title.includes(`#${node.taskListSlug}`)) {
    newTitle = `${task.title} #${node.taskListSlug}`;
  }
  await this.prisma.userTask.update({
    where: { id: userTaskId },
    data: { nodeId, title: newTitle, updatedAt: new Date() },
  });
  // Następny cron push do Graph zaktualizuje tytuł
}
```

#### Bootstrap pierwszego sync (decyzja 4c)

```typescript
async bootstrapFirstSync(userId: string) {
  const startedAt = new Date();
  await this.prisma.msTodoSyncState.upsert({
    where: { userId },
    create: { userId, msTodoSyncStartedAt: startedAt },
    update: { msTodoSyncStartedAt: startedAt, deltaLink: null },
  });
  // Pierwszy delta — ale filtrujemy lokalnie po createdDateTime >= startedAt
  // (Graph nie ma filtra createdDateTime na delta endpoint, więc filtrujemy w aplikacji)
}
```

---

### Etap 6 — Widok `/my-tasks` + sekcja na węźle (2 dni)

#### Strona `apps/frontend/src/MyTasksPage.jsx`

Komponent:
- Header z liczbami: `127 zadań · 12 otwartych · 3 alarmy aktywne`
- Pasek filtrów: status (chips OPEN/DONE/ALL), dropdown listy MS, autocomplete węzła, date range, search box po tytule
- Tabela:
  - Kolumny: ☑ status | Tytuł | 🔗 Węzeł (link do widoku węzła) | 📅 plannedEnd | 🔔 reminder | Lista MS | Akcje
  - Edycja inline tytułu (dwuklik), `plannedEnd` (datetime-local), `reminder` (datetime-local + checkbox „włączony")
  - Akcja `📌 Przypnij` → modal z autocomplete węzłów WBS
  - Checkbox status OPEN→DONE → optimistic update
- Floating button `+ Dodaj zadanie` → tworzy luźne w Ignite (potem cron pchnie do MS)

Route: `apps/frontend/src/App.jsx` → `<Route path="/my-tasks" element={<MyTasksPage />} />`. Sidebar: nowy kafelek pod sekcją „Drzewo Zamówień" lub w głównej części menu.

#### Endpointy backendu

- `GET /my-tasks` — `?status=&listName=&nodeId=&from=&to=&search=&page=&limit=` — paginacja, exclude `deletedAt != null` (chyba że `?trash=1`)
- `POST /my-tasks` — create
- `PATCH /my-tasks/:id` — update (tytuł, plannedEnd, status, nodeId)
- `DELETE /my-tasks/:id` — soft delete (`deletedAt = NOW()`)
- `POST /my-tasks/:id/pin` — `{ nodeId }` — wywoła `pinToNode`
- `POST /my-tasks/:id/snooze` — `{ minutes }` — `UPDATE TaskReminder SET remindAt = NOW() + interval, sentAt = NULL`

#### Sekcja na węźle (Subtask vs UserTask)

`apps/frontend/src/components/shared/wbs/TasksCalendarSection.jsx` aktualnie pokazuje `Subtask` (model zaprojektowane do projektowych podzadań WBS). **Decyzja:** czy w widoku węzła pokazujemy razem `Subtask` + `UserTask`, czy osobne zakładki?

Rekomendacja: **osobne zakładki** w panelu węzła:
- „Podzadania" (Subtask — projektowe, AI-generowane, status NEW/IN_PROGRESS/DONE, przypisane do roli)
- „Moje zadania" (UserTask — osobiste, sync z MS To Do)

Wymaga dorobienia komponentu `WbsUserTasksSection.jsx` analogicznego do `TasksCalendarSection.jsx`, ale wołającego `GET /my-tasks?nodeId=<X>` zamiast `/subtasks`.

#### Mobile

`apps/frontend/src/components/Mobile/MobileDashboard.jsx` ma sekcję „Moje Zadania" — sprawdzić czy obecnie wyświetla `Subtask`. Jeśli tak, dodać przełącznik tab albo merge. Najprościej: dodać sekcję `Moje zadania osobiste` w mobile home pod istniejącą.

---

### Etap 7 — Popup alarmu w przeglądarce (1 dzień)

#### Komponent `apps/frontend/src/components/shared/ReminderPopupModal.jsx`

```jsx
// Modal blokujący na środku (z-index 200+), z dźwiękiem (Audio API)
// Props: { task: UserTask, onSnooze: (minutes) => void, onDone: () => void, onOpenTask: () => void, onDismiss: () => void }
```

Trzy akcje (decyzja 5c):
- `Odłóż 10 min` / `Odłóż 30 min` / `Odłóż 60 min` (lub presety z `SystemNotificationSettings.snoozePresetsMinutes`) → `POST /my-tasks/:id/snooze`
- `Wykonane` → `PATCH /my-tasks/:id { status: 'DONE' }`
- `Otwórz zadanie` → navigate do `/my-tasks?id=<X>` z scroll-to (lub bezpośrednio do widoku węzła jeśli `nodeId`)

#### Triggerowanie popupu

W `App.jsx` (poziom root, zalogowany user):

```jsx
useEffect(() => {
  if (!token) return;
  const handler = (e) => {
    if (e.data?.type === 'REMINDER_DUE' && e.data.userTaskId) {
      // pokaż modal
    }
  };
  navigator.serviceWorker?.addEventListener('message', handler);
  return () => navigator.serviceWorker?.removeEventListener('message', handler);
}, [token]);
```

Service worker (gdy aktywna zakładka) → forwarduje do app przez `postMessage`. Gdy zakładka nieaktywna → standard Web Push notification.

Polling fallback (gdy push nie zadziała): co 60 sek frontend pyta `GET /my-tasks/due-now` → jeśli coś jest, pokazuje modal.

---

### Etap 8 — UI dla `taskListSlug` (1 dzień)

#### Edycja w `ProcessTreePage.jsx`

Dla każdego węzła w drzewie (admin / właściciel), w panelu szczegółów dodać:
- Input `Slug listy zadań` z walidacją: regex `^[a-z0-9-]+$`, autocomplete z auto-generacją z nazwy (`slugify(node.name)`)
- Podpowiedź pod polem: `Tak będzie nazywała się lista w MS To Do i tak będziesz oznaczać zadania: #${slug}`
- Walidacja unikalności (async, po blur): `GET /process-tree/check-slug?slug=X&excludeNodeId=Y`

#### Retroaktywny scan (decyzja: automat z toastem)

W endpoincie `PATCH /process-tree/:id` jeśli `taskListSlug` się zmieniło:

```typescript
if (oldSlug !== newSlug && newSlug) {
  const updated = await this.prisma.userTask.updateMany({
    where: {
      userId: ownerUserId,
      nodeId: null,
      OR: [
        { msListName: { equals: newSlug, mode: 'insensitive' } },
        { title: { contains: `#${newSlug}` } },
      ],
    },
    data: { nodeId: node.id },
  });
  return { node, retroactivePinned: updated.count };
}
```

Frontend pokazuje toast: `${retroactivePinned} zadań przypięto do węzła ${node.name}`.

---

### Etap 9 — Web Push subscription dla user-tasks (0.5 dnia)

Sprawdzić czy frontend ma już flow „włącz powiadomienia". W `App.jsx` widzę `usePushSubscription(token)` — to już istnieje dla zamówień. Trzeba:
- Sprawdzić czy `usePushSubscription` requestuje permission `Notification.requestPermission()`
- Jeśli tak — bez zmian
- Jeśli nie — dodać przycisk „Włącz powiadomienia" w panelu `/notifications` (per-user, nie admin) albo w profilu usera

Service worker (`apps/frontend/public/sw.js` lub gdzie żyje) — dorobić obsługę typu `REMINDER`:

```js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  if (data.type === 'REMINDER') {
    // notification z akcjami
    event.waitUntil(self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      data: { userTaskId: data.userTaskId },
      actions: [
        { action: 'snooze-10', title: 'Odłóż 10 min' },
        { action: 'done', title: 'Wykonane' },
      ],
    }));
    // do otwartej zakładki:
    self.clients.matchAll({ type: 'window' }).then(cls => cls.forEach(c => c.postMessage({ type: 'REMINDER_DUE', userTaskId: data.userTaskId })));
  }
});
```

---

### Etap 10 — UI łączenia konta MS dla To Do (0.5 dnia)

W panelu `/notifications` (lub w profilu usera) — przycisk `Połącz konto Microsoft (To Do)`:
- Jeśli `UserMsToken` istnieje i ma scope `Tasks.ReadWrite` → pokazuj `Połączono: <msAccountEmail>` + przycisk `Rozłącz`
- Jeśli brak / brak scope → przycisk `Połącz` → redirect do `GET /onedrive/auth-url` (po rozszerzeniu scope)
- Po połączeniu — automatyczny pierwszy `bootstrapFirstSync(userId)` (decyzja 4c)

---

## 5. Plan rollout produkcyjny

1. **Etapy 1–4** ⇒ merge do main, deploy na dev. Test: panel admin zapisuje ustawienia, cron syncuje 1 testowego usera.
2. **Etapy 5–6** ⇒ deploy na dev. Test: pełen flow Samsung → MS → Ignite → widok `/my-tasks`. Edge cases (hashtag, lista, konflikt).
3. **Etapy 7–9** ⇒ deploy na dev. Test: alarm o 9:00 budzi popup + push.
4. **Etap 10** ⇒ deploy na dev. Test: nowy user łączy konto, widzi import.
5. Po pełnej weryfikacji na dev — deploy na prod.

**Każdy etap:** osobny commit + wpis CHANGELOG + bump wersji w `version.js` + aktualizacja SLOWNIK.md.

---

## 6. Edge cases do uwzględnienia w testach (przypadki 1–15 z analizy)

Pełna lista w sesji 2026-06-30 — najważniejsze:

- Dwa hashtagi w tytule → pierwszy wygrywa
- Ręczne przypięcie w Ignite dodaje hashtag do tytułu (nie zmienia listy MS)
- Przeniesienie zadania między listami w MS → re-pinning (chyba że hashtag w tytule blokuje)
- Bootstrap → tylko zadania utworzone od `msTodoSyncStartedAt`
- Soft delete → kosz 30 dni → cron czyści
- Konflikt last-write-wins → cichy
- Konflikt slugów → 409 z czytelnym komunikatem
- Offline → `syncOutbox` (już mamy) buforuje zmiany, leci przy reconnect
- Snooze → aktualizacja `TaskReminder.remindAt` + `reminderDateTime` w Graph

---

## 7. Plik testowy

W `/test/ms-todo-sync.test.js` (zgodnie z konwencją projektu — logi i testy w `/test`):
- Mock MS Graph response (delta z 5 zadaniami: 1 nowe, 1 update, 1 delete, 1 z hashtagiem, 1 z listy o pasującym slugu)
- Test auto-pinningu
- Test soft delete
- Test konfliktu (local newer vs remote newer)
- Test snooze (`POST /my-tasks/:id/snooze`)

---

## 8. Lista plików do utworzenia / edycji (skrót)

**Nowe:**
- `apps/backend/prisma/migrations/<timestamp>_add_user_tasks_and_slug/` (z `prisma migrate dev`)
- `apps/backend/src/notification-settings/{module,service,controller}.ts`
- `apps/backend/src/ms-todo/{module,service,controller}.ts`
- `apps/backend/src/cron/notification-cron.{module,service}.ts`
- `apps/backend/src/user-tasks/{module,service,controller,dto}.ts`
- `apps/frontend/src/MyTasksPage.jsx`
- `apps/frontend/src/components/shared/ReminderPopupModal.jsx`
- `apps/frontend/src/components/shared/wbs/WbsUserTasksSection.jsx`
- `apps/frontend/src/hooks/useMyTasks.js`
- `test/ms-todo-sync.test.js`

**Edycja:**
- `apps/backend/prisma/schema.prisma` — nowe modele + `taskListSlug`
- `apps/backend/src/app.module.ts` — rejestracja nowych modułów + `ScheduleModule.forRoot()`
- `apps/backend/src/onedrive/onedrive.service.ts` — dodać scope `Tasks.ReadWrite` w `SCOPES` (rekomendacja a)
- `apps/frontend/src/NotificationSettingsPage.jsx` — podpiąć fetch/save do realnego API
- `apps/frontend/src/App.jsx` — route `/my-tasks` + obsługa `REMINDER_DUE`
- `apps/frontend/src/components/Layout/DynamicSidebar.jsx` — kafelek `Moje zadania` (nie tylko admin)
- `apps/frontend/src/ProcessTreePage.jsx` — input `taskListSlug`
- `apps/frontend/public/sw.js` (lub odpowiednik) — obsługa typu `REMINDER`
- `CHANGELOG.md` + `SLOWNIK.md` + `version.js` — przy każdym etapie

---

## 9. Ryzyka i decyzje do potwierdzenia w przyszłej sesji

1. **Unikalność `taskListSlug`** — globalna czy per-user? Zależy od modelu uprawnień ProcessNode. Sprawdzić w `wbs-nodes.service.ts` jak jest implementowane scoping.
2. **Scope `Tasks.ReadWrite` w istniejącym `UserMsToken`** — istniejący userzy będą musieli ponownie autoryzować (token bez scope nie zadziała na `/me/todo`). Dodać banner UI.
3. **Konflikt z istniejącym `Subtask`** — czy w widoku węzła pokazujemy oba (osobne zakładki) czy tylko `UserTask` w nowym kontekście. Rekomendacja: osobne zakładki.
4. **Mobile UX** — jak `MyTasksPage` ma wyglądać na telefonie. `MobileDashboard` ma już sekcję „Moje Zadania" dla Subtask — koegzystencja.
5. **MS To Do lists ownership** — listy MS są per konto Microsoft. Jeśli kilku userów Ignite ma to samo konto MS (dziwne ale możliwe), będą widzieć te same zadania. Rozważyć walidację unikalności `UserMsToken.msAccountEmail`.
6. **Recurrence (decyzja 6b — pomijamy)** — cykliczne zadania w MS To Do generują serię instancji. Pierwsza sesja zsynchronizuje tylko najbliższą instancję. Druga faza dodaje pełne wsparcie `recurrence` z MS Graph.
7. **Webhook subscription (1b — nie w MVP)** — gdyby user kiedyś chciał sub-sekundowy sync, dorobić `MsGraphSubscription` model i webhook endpoint zgodnie z opisem z sesji.

---

## 10. Estymacja

| Etap | Czas | Zależności |
|------|------|-----------|
| 1 — Backend ustawień | 1 dzień | — |
| 2 — Schema | 1 dzień | — |
| 3 — MS Graph service | 1–2 dni | Azure scope dodany |
| 4 — Crons | 1 dzień | 2, 3 |
| 5 — Sync logic | 1–2 dni | 4 |
| 6 — Widok `/my-tasks` | 2 dni | 5 |
| 7 — Popup + Web Push | 1 dzień | 6 |
| 8 — UI slug | 1 dzień | 2 |
| 9 — Service worker | 0.5 dnia | 7 |
| 10 — UI łączenia konta MS | 0.5 dnia | 3 |

**Suma: 10–12 dni roboczych.** Można rozbić na 3 sprinty po ~4 dni.

---

## 11. Pierwsza komenda w następnej sesji

Powiedz świeżemu Claude'owi:

> Przeczytaj `my-task.md` w korzeniu Ignite — kontekst integracji MS To Do / Samsung Reminder. Zaczynamy od **Etapu 1: Backend ustawień powiadomień**. Wykonaj sekcję 4.1 z `my-task.md` w całości: model `SystemNotificationSettings`, moduł `notification-settings`, podpięcie panelu `/notifications` do realnego API. Pamiętaj o regułach z `CLAUDE.md` (CHANGELOG, SLOWNIK, version bump, anchory).
