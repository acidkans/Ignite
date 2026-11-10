# Integracja Ignite ↔ kalendarz Microsoft 365 (Office / Outlook) — wytyczne

Stan na 2026-11-10. Dokument jest **wytycznymi do implementacji**. Nic tu nie jest jeszcze zrobione, poza tym, co opisuje sekcja 1.
Powiązane: `docs/INTEGRACJA-MS-TODO.md` (To Do, OAuth, zmienne `MS_*`).

---

## 1. Co już jest w kodzie (punkt wyjścia)

Kalendarz Outlook jest **częściowo zaimplementowany i obecnie uśpiony**:

| Element | Gdzie | Stan |
|---|---|---|
| `back-serwis` `MsCalendarService` (`createEvent` / `updateEvent` / `deleteEvent`) | `apps/backend/src/ms-todo/ms-calendar.service.ts` | działa na `/me/events` tokenem użytkownika |
| `back-funkcja` `toWarsawLocal` + `timeZone: 'Central European Standard Time'` | jw. | strefa obsłużona poprawnie, test: `test/outlook-event-time.cjs` |
| `back-funkcja` `UserTasksService.syncCalendarEvent` | `user-tasks.service.ts` ~581 | zadanie z godziną (`plannedEnd` + `durationMinutes`) → wydarzenie w kalendarzu **odpowiedzialnego**; przepisanie zadania usuwa wydarzenie u poprzedniego właściciela |
| `schema-pole` `UserTask.msEventId`, `UserTask.durationMinutes` | `schema.prisma` ~1920 | są w bazie |
| `back-stala` `SCOPES` | `onedrive/onedrive.service.ts:14` | **bez `Calendars.ReadWrite`** — wycięty w commicie `2c6fea4` (2026-10-31), bo tenant AIRTEL wymaga zgody administratora, a bez niej nie dało się połączyć konta wcale |
| `back-stala` `REFRESH_SCOPES` = `.default offline_access` | jw. | refresh dostaje wszystko, na co aplikacja ma zgodę → po **admin consent** istniejące tokeny prawdopodobnie dostaną kalendarz bez ponownego łączenia (do sprawdzenia na dev, pkt 10) |

Skutek dziś: `syncCalendarEvent` próbuje, dostaje 403, loguje `syncCalendarEvent failed` i zadanie zostaje bez wydarzenia (celowo **bez** ustawiania `needsReauth`, żeby nie zepsuć To Do i OneDrive).

Pozostałe integracje (dla porównania):
- **Poczta** (`mailboxes`, `qa-mail`, `watek-mail`) — idzie przez **IMAP/SMTP**, nie przez Graph. Nie ma tu tokenów do ponownego użycia.
- **Kalendarz urlopowy Google** (`google-calendar.service.ts`, `leave-calendar-cron.service.ts`) — konto serwisowe, wspólny kalendarz, znacznik `IGNITE_EVENT_SOURCE` w `extendedProperties`, cogodzinna rekoncyliacja za przełącznikiem `LeaveCalendarSettings.syncEnabled`. **Ten wzorzec warto skopiować** (znacznik + rekoncyliacja + przełącznik w panelu).

---

## 2. Zakres

Wyłącznie **kalendarz po stronie Office 365** — kalendarz Exchange użytkownika (Outlook web / desktop / telefon) przez Microsoft Graph `/me/events`.
Poza zakresem: Teams (spotkania online, kanały, czaty, obecność), kalendarze grup M365, zaproszenia uczestników.

---

## 3. Co synchronizujemy

| Obiekt Ignite | Do kalendarza czyjego | Kiedy | Kierunek | Faza |
|---|---|---|---|---|
| `schema-model` `UserTask` **z godziną** (`plannedEnd` + `durationMinutes`) | odpowiedzialnego (`userId`) | utworzenie, zmiana, przepisanie, usunięcie | Ignite → Outlook (jest), Outlook → Ignite (nowe: przesunięcie godziny) | F1 / F3 |
| `UserTask` **bez godziny** (tylko termin) | — | — | **nie** do kalendarza; termin już idzie do MS To Do | — |
| `schema-model` `Constraint` (bloker, `dueAt`) | odpowiedzialnego za usunięcie (`ownerId`) | — | **przez jego `UserTask`** (`UserTask.constraintId`) — bloker już tworzy zadanie; nie dublujemy osobnego wydarzenia | F1 (bez dodatkowej pracy) |
| `schema-model` `LeaveRequest` zatwierdzony | **pracownika** (własny kalendarz) | zatwierdzenie, zmiana, anulowanie | Ignite → Outlook | F2 |
| Wydarzenia ręczne w Outlooku | — | — | **nie importujemy** do Ignite (tylko odczyt zajętości, F4) | F4 |

Zasada nadrzędna (jak przy Google): **Ignite rusza wyłącznie wydarzenia, które sam założył** — oznaczone znacznikiem (pkt 6). Wpisy ludzi zostają nietknięte.

---

## 4. Kierunek synchronizacji

**Etap 1 (F1–F2): jednokierunkowo Ignite → Outlook.** Ignite jest źródłem prawdy. Ręczna zmiana wydarzenia w Outlooku zostaje nadpisana przy następnej zmianie zadania w Ignite; ręczne usunięcie → następna zmiana zakłada wydarzenie od nowa (tak działa już `updateEvent` → 404 → `createEvent`).

**Etap 2 (F3): ograniczony powrót Outlook → Ignite** — tylko dla wydarzeń z naszym znacznikiem i tylko pola:
- `start` / `end` → `UserTask.plannedEnd` + `durationMinutes` (przesunięcie bloku w kalendarzu = przesunięcie zadania),
- usunięcie wydarzenia → **nie** usuwa zadania; zdejmuje tylko godzinę (`durationMinutes = null`, `msEventId = null`) — zadanie dalej żyje w Ignite i To Do,
- tytuł i opis **nie wracają** (źródło: Ignite / To Do; inaczej trzy miejsca edycji tytułu).

Konflikt: wygrywa nowsza zmiana wg `lastModifiedDateTime` z Graph vs `UserTask.updatedAt` (analogicznie do `msLastModified` w To Do).

Urlopy (F2) — **tylko** Ignite → Outlook. Urlop zmienia się wnioskiem w Ignite, nie w kalendarzu.

---

## 5. Uprawnienia Graph — delegated vs application

| | Delegated (token użytkownika) | Application (konto aplikacji, client credentials) |
|---|---|---|
| Co mamy | **tak** — `UserMsToken`, `OneDriveService.getValidToken(userId)` | nie (poza OneDrive `MS_SHARED_ACCOUNT_EMAIL`, które też jest delegated) |
| Zakres | `Calendars.ReadWrite` (+ opcjonalnie `Calendars.Read.Shared` do F4) | `Calendars.ReadWrite` dla **całej organizacji** |
| Wymaga | admin consent w tenancie AIRTEL (tenant tak wymusza) + każdy łączy konto | admin consent + **Application Access Policy** (Exchange Online PowerShell `New-ApplicationAccessPolicy`) ograniczająca dostęp do grupy, inaczej aplikacja może pisać do kalendarza **każdego** w firmie |
| Kto nie ma kalendarza | użytkownik bez połączonego konta | nikt — działa dla każdego z tenanta |
| Ryzyko | małe | duże (szeroki dostęp, sekret aplikacji = klucz do wszystkich kalendarzy) |

**Rekomendacja: delegated**, na istniejących tokenach i istniejącym logowaniu (`GET /onedrive/auth`). Zadania i tak trafiają tylko do osób z połączonym kontem (tak działa To Do). Application rozważyć wyłącznie dla urlopów, jeśli okaże się, że większość pracowników fizycznych nigdy nie połączy konta (otwarte pytanie Q2).

Kroki w Azure (Entra ID → App registrations → aplikacja Ignite):
1. API permissions → Microsoft Graph → Delegated → dodać `Calendars.ReadWrite` (jeśli usunięty).
2. **Grant admin consent for AIRTEL** — bez tego nic dalej nie ma sensu (to powód wyłączenia w `2c6fea4`).
3. Dopiero potem w kodzie przywrócić `Calendars.ReadWrite` w `back-stala` `SCOPES`.

Dodatkowo: `back-funkcja` `OneDriveService.handleCallback` powinien zapisywać przyznane zakresy (pole `scope` z odpowiedzi tokenu) — pkt 8, `UserMsToken.grantedScopes`. Dzięki temu Ignite wie, czy konto ma kalendarz, zamiast zgadywać po 403.

---

## 6. Mapowanie pól

### `UserTask` → wydarzenie (rozszerzenie dzisiejszego `back-funkcja` `MsCalendarService.payload`)

| Graph `event` | Ignite | Uwagi |
|---|---|---|
| `subject` | `UserTask.title` | opcjonalnie prefiks numeru zamówienia, np. `[Z-123] tytuł` (Q5) |
| `body` (`contentType: 'html'`) | `UserTask.description` + **link do zadania w Ignite** | link = jedyna droga powrotu z Outlooka do kontekstu |
| `start` / `end` | `taskStart(task)` / `+ durationMinutes`, `toWarsawLocal`, `timeZone: 'Central European Standard Time'` | jest |
| `showAs` | `busy` | jest |
| `isReminderOn`, `reminderMinutesBeforeStart` | `true`, 15 | jest; ewentualnie z najbliższego alarmu zadania |
| `categories` | `['Ignite']` | kolorowa kategoria w Outlooku; nie jest znacznikiem (użytkownik może ją zdjąć) |
| `location.displayName` | adres/nazwa obiektu zamówienia (`ProcessNode`) | gdy zadanie jest przypięte do zamówienia |
| `transactionId` | `UserTask.id` | **idempotencja** — powtórzony `POST` po timeoucie nie zrobi duplikatu |
| `singleValueExtendedProperties` | `{ id: 'String {<stały GUID Ignite>} Name IgniteSource', value: 'task:<UserTask.id>' }` | **znacznik** odpowiednik `IGNITE_EVENT_SOURCE` z Google; pozwala odnaleźć wydarzenie gdy `msEventId` zginie i filtrować w F3 |
| status zadania `DONE` | — | wydarzenie zostaje (decyzja z `3c82937`: ślad wykonania) |
| status `CANCELLED` / soft delete | `DELETE /me/events/{id}` | dziś usuwa tylko przy `deletedAt`; `CANCELLED` dopisać |

### `LeaveRequest` → wydarzenie (F2)

| Graph `event` | Ignite | Uwagi |
|---|---|---|
| `subject` | `„Urlop”` / nazwa `LeaveType` | bez szczegółów (np. „opieka”, „L4”) — dane wrażliwe, Q6 |
| `isAllDay` | `true` gdy brak `timeStart`/`timeEnd` | all-day: `start`/`end` = północ–północ, `end` = dzień **po** ostatnim dniu |
| `start`/`end` godzinowe | `dateStart`+`timeStart`, `dateEnd`+`timeEnd` | jak w Google: segmenty przerwane weekendem/świętem — można użyć tej samej funkcji segmentującej z `google-calendar.service.ts` |
| `showAs` | `oof` | Outlook pokazuje „poza biurem” przy planowaniu spotkań — główny zysk |
| `sensitivity` | `private` | Q6 |
| znacznik | `leave:<LeaveRequest.id>` | jw. |

---

## 7. Strefy czasowe

- Zapis: **zawsze** `dateTime` w czasie lokalnym + `timeZone: 'Central European Standard Time'` (Windowsowa nazwa strefy, Graph przyjmuje też IANA `Europe/Warsaw`, ale trzymajmy się tego, co już działa). Nie wysyłać UTC — Outlook pokaże dobrze, ale przy przejściu DST wydarzenia „całodniowe” rozjadą się o dzień.
- Odczyt (F3/F4): nagłówek `Prefer: outlook.timezone="Central European Standard Time"` — Graph zwróci czasy już w czasie polskim; konwersja do `Date` przez odwrotność `toWarsawLocal` (nowa `back-funkcja` `fromWarsawLocal`, test w `test/outlook-event-time.cjs`).
- All-day (urlopy): daty z `toCalendarDate` (jak w Google), **bez** godzin; `end` wyłączny.
- Przy okazji poprawić znane ograniczenie nr 5 z `INTEGRACJA-MS-TODO.md` (termin To Do w UTC) — ta sama funkcja.
- Testy obowiązkowe: zima/lato, 00:30 PL (= poprzedni dzień UTC), noc zmiany czasu (ostatnia niedziela marca/października).

---

## 8. Proponowane zmiany w `schema.prisma`

Wszystko opcjonalne (`?`) lub z domyślną wartością — migracja bez ryzyka dla istniejących danych.

```prisma
model UserMsToken {
  /// @anchor user-ms-token-granted-scopes
  /// Zakresy przyznane przy ostatnim logowaniu/odświeżeniu (pole `scope` z odpowiedzi tokenu).
  /// Na tej podstawie Ignite wie, czy konto ma kalendarz — bez zgadywania po 403.
  grantedScopes String?
}

model UserTask {
  /// @anchor user-task-ms-event-last-modified
  /// `lastModifiedDateTime` wydarzenia z Graph — rozstrzyga konflikt w powrocie Outlook → Ignite (F3).
  msEventLastModified DateTime?
}

model LeaveRequest {
  /// @anchor leave-request-ms-event-ids
  /// Id wydarzeń w kalendarzu Outlook PRACOWNIKA (segmenty jak `googleEventIds`).
  msEventIds String[] @default([])
}

/// @anchor ms-calendar-sync-state
/// Stan powrotu Outlook → Ignite per użytkownik (F3). Odpowiednik `MsTodoSyncState`.
model MsCalendarSyncState {
  id                    String    @id @default(uuid())
  userId                String    @unique
  /// @anchor ms-calendar-sync-state-delta-link
  deltaLink             String?   // @odata.deltaLink z /me/calendarView/delta
  lastSyncAt            DateTime?
  lastSyncError         String?
  /// @anchor ms-calendar-sync-state-subscription-id
  subscriptionId        String?   // tylko jeśli wejdą webhooki (pkt 9)
  subscriptionExpiresAt DateTime?
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("ms_calendar_sync_state")
}

model SystemNotificationSettings {
  /// @anchor notif-settings-ms-calendar-enabled
  /// Wyłącznik globalny kalendarza Outlook — osobny od `msTodoEnabled` (dziś kalendarz wisi na fladze To Do).
  msCalendarEnabled       Boolean @default(false)
  /// @anchor notif-settings-ms-calendar-leaves-enabled
  msCalendarLeavesEnabled Boolean @default(false)
}
```

Uwagi:
- `schema-pole` `UserTask.msEventId` już jest — nie dublować.
- `UserTask` jest wersjonowany? Jeśli `UserTask.versionId` jest klonowany w `back-funkcja` `cloneVersionData` — **nie kopiować** `msEventId` do klonu (jedno wydarzenie = jedno zadanie), analogicznie do `msToDoId`.
- Każde nowe pole → `@anchor` + wiersz w `SLOWNIK.md` + wpis w `CHANGELOG.md` (zasady z `CLAUDE.md`).

---

## 9. Webhooki (subskrypcje) vs polling

| | Polling delta (`/me/calendarView/delta`) | Webhook (`POST /subscriptions` na `/me/events`) |
|---|---|---|
| Opóźnienie | interwał crona (np. 5 min) | sekundy |
| Wymaga | nic nowego | publicznego HTTPS endpointu (`https://erp.gigatel.org/api/ms-calendar/webhook`), odpowiedzi na `validationToken`, weryfikacji `clientState`, **odnawiania** subskrypcji (dla wydarzeń maks. ok. 7 dni — sprawdzić aktualny limit w dokumentacji Graph przy implementacji) |
| Dev | działa bez problemu | nie zadziała bez tunelu (dev nie jest publiczny) |
| Spójność z resztą | tak — To Do też jest pollingowe (`TaskSyncService`) | nowy mechanizm |

**Rekomendacja: polling delta**, doklejony do istniejącego cyklu `NotificationCronService` / `TaskSyncService` (ten sam interwał `msTodoSyncIntervalMinutes`, ewentualnie osobny). `calendarView/delta` wymaga okna czasu (`startDateTime`/`endDateTime`) — proponowane: −30 dni … +180 dni. Filtrować po znaczniku Ignite (pkt 6) po stronie Ignite. Webhooki — dopiero gdy 5 minut okaże się za wolne (wątpliwe dla zadań).

Throttling: obsłużyć `429` / `503` z nagłówkiem `Retry-After` (dziś `MsCalendarService` tego nie robi); przy masowym dosyłaniu (backfill) — kolejka po jednym użytkowniku, ewentualnie `$batch` (max 20 żądań).

---

## 10. Endpointy (propozycja)

| Tag | Endpoint | Rola |
|---|---|---|
| `back-endpoint` | `GET /ms-calendar/status` | czy konto ma `Calendars.ReadWrite` (`grantedScopes`), ostatni sync, błąd — do ekranu „Moje konto” / `/notifications` |
| `back-endpoint` | `POST /ms-calendar/resync` | **od razu** woła sync dla bieżącego użytkownika (nie powtarzać błędu nr 4 z To Do: „Wymuś sync nic nie przyspiesza”) |
| `back-endpoint` | `POST /ms-calendar/backfill` (ADMIN) | jednorazowo zakłada wydarzenia dla otwartych zadań z godziną bez `msEventId` (po admin consent i po połączeniu kont) |
| `back-endpoint` | `GET /ms-calendar/availability?userIds=&from=&to=` | F4: zajętość ekipy (`POST /me/calendar/getSchedule`) przy przypisywaniu zadań w Realizacji |
| `back-endpoint` | `POST /ms-calendar/webhook` (publiczny, bez JWT) | tylko jeśli wejdą webhooki |

Kody błędów: brak połączonego konta / brak zgody na kalendarz → **412**, nigdy 401 (frontend wylogowuje na 401).

Nowy `back-modul` `MsCalendarModule` — wydzielić `MsCalendarService` z `ms-todo` (dziś leży w `ms-todo/`) przy okazji F1 albo zostawić i tylko dopisać kontroler; decyzja implementacyjna.

---

## 11. Zmienne środowiskowe

| Tag | Zmienna | Dev | Prod | Znaczenie |
|---|---|---|---|---|
| `back-env` | `MS_CALENDAR_SYNC_CRON` | `false` (gitignorowany override, jak `TRAINING_ALERTS_CRON`) | `true` | wyłącza cron powrotu Outlook → Ignite i backfill |
| `back-env` | `MS_CALENDAR_EVENT_DEFAULT_TZ` | — | — | **nie dodawać**; strefa na sztywno w kodzie (jedna firma, jedna strefa) |
| `back-env` | `MS_GRAPH_WEBHOOK_URL`, `MS_GRAPH_WEBHOOK_CLIENT_STATE` | — | tylko jeśli webhooki | publiczny URL i sekret weryfikacji powiadomień |

Istniejące `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`, `MS_REDIRECT_URI`, `MS_TOKEN_ENCRYPTION_KEY` — bez zmian. Edycja `.env` wg protokołu (kopia → edycja → odczyt i sprawdzenie, że nic nie zginęło).

Uwaga dev: push wydarzeń (`syncCalendarEvent`) nie jest cronem — działa przy każdej zmianie zadania. Na dev chronić go globalną flagą `msCalendarEnabled = false` w bazie dev albo testować wyłącznie na koncie testowym, żeby nie śmiecić w prawdziwych kalendarzach.

---

## 12. Kolejność wdrożenia

**F0 — zgoda (bez kodu)**
1. Admin AIRTEL: `Calendars.ReadWrite` delegated + **Grant admin consent** w Entra.
2. Na dev, na jednym koncie: sprawdzić, czy refresh `.default` daje token z `Calendars.ReadWrite` **bez** ponownego łączenia (`POST /me/events` testowo).

**F1 — uruchomienie istniejącego pushu zadań**
1. Przywrócić `Calendars.ReadWrite` w `SCOPES`, zapisywać `grantedScopes`.
2. Osobna flaga `msCalendarEnabled` (zamiast `msTodoEnabled` w `syncCalendarEvent`).
3. Znacznik `singleValueExtendedProperties`, `transactionId`, `categories: ['Ignite']`, link do Ignite w treści, usuwanie przy `CANCELLED`, obsługa `429`.
4. Status w „Moje konto” + `POST /ms-calendar/backfill`.
5. Migracja Prisma: dev ręcznie (psql + wpis w `_prisma_migrations`), prod przez `migrate deploy`.
6. Dev → test na koncie testowym → prod z `msCalendarEnabled = false` → włączyć w panelu → backfill.

**F2 — urlopy w kalendarzu pracownika** (`showAs: oof`) za `msCalendarLeavesEnabled`; włączyć dopiero razem z odcięciem AppSheet (ta sama pułapka duplikatów co w Google, patrz `LeaveCalendarSettings.syncEnabled`).

**F3 — powrót Outlook → Ignite** (polling delta, `MsCalendarSyncState`, `MS_CALENDAR_SYNC_CRON`).

**F4 — zajętość ekipy** przy planowaniu w Realizacji (`getSchedule`).

Każda faza: wersja w `version.js`, wpis w `CHANGELOG.md`, `SLOWNIK.md`, commit dopiero po zgodzie.

---

## 13. Ryzyka

1. **Bez admin consent nic nie ruszy** — i ponowne dopisanie scope'u przed zgodą znowu zablokuje logowanie wszystkim (powtórka `2c6fea4`). Kolejność F0 → F1 jest twarda.
2. **Single-tenant**: konta spoza AIRTEL (`@europrim.com.pl`) nie dostaną wydarzeń — jak przy To Do.
3. **Duplikaty** przy ponowieniu po timeoucie albo po utracie `msEventId` — rozwiązuje `transactionId` + znacznik.
4. **Zaproszenia (attendees) wychodzą mailem z Exchange** — łatwo niechcący wysłać zaproszenie do klienta. Ignite **nigdy** nie ustawia `attendees` (wydarzenie tylko w kalendarzu właściciela).
5. **Nadpisywanie ręcznych zmian** w Outlooku w etapie 1 — użytkownicy muszą wiedzieć, że godzinę zmienia się w Ignite (do F3).
6. **Dane wrażliwe** w urlopach (rodzaj urlopu, opieka, L4) — w kalendarzu tylko „Urlop” + `private`.
7. **Przepisanie zadania**: wydarzenie usuwa się tokenem poprzedniego właściciela; jeśli jego konto ma `needsReauth`, stare wydarzenie zostaje u niego (dziś: tylko log). Do rozważenia: lista „osieroconych” wydarzeń do sprzątnięcia przy ponownym połączeniu.
8. **Wygaśnięcie `MS_CLIENT_SECRET`** wyłącza naraz OneDrive, To Do i kalendarz.
9. **Wydarzenia cykliczne** nie są obsługiwane (zadania Ignite nie są cykliczne) — w F3 ignorować `seriesMaster`/`occurrence`.

---

## 14. Otwarte pytania do użytkownika

- **Q1.** Czy administrator AIRTEL da **admin consent** na `Calendars.ReadWrite` (i ewentualnie `Calendars.Read.Shared` dla F4)?
- **Q2.** Urlopy w kalendarzu Outlook pracownika: wystarczy delegated (tylko osoby z połączonym kontem), czy chcemy application permission z Application Access Policy, żeby objąć wszystkich?
- **Q3.** Czy przesunięcie bloku w Outlooku ma przesuwać zadanie w Ignite (F3), czy wystarczy jednokierunkowo?
- **Q4.** Czy potrzebny jest **wspólny kalendarz projektu/zamówienia** (np. współdzielony kalendarz Outlook), np. z terminami dostaw i blokerów dla całej ekipy — czy tylko osobiste kalendarze?
- **Q5.** Format tytułu wydarzenia: sam tytuł zadania czy z numerem/nazwą zamówienia?
- **Q6.** Urlop w kalendarzu: tylko „Urlop” (prywatne), czy z rodzajem?
- **Q7.** Czy zadania **bez godziny** (sam termin) mają trafiać do kalendarza jako wydarzenia całodniowe, czy zostają tylko w To Do (rekomendacja: tylko To Do)?
