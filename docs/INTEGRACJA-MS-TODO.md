# Integracja konta Microsoft z Ignite — synchronizacja zadań z MS To Do

Stan na 25.10.2026 (v2026.10.25.1652). Dokument ma dwie części: **dla użytkownika** (jak połączyć konto)
i **dla administratora** (konfiguracja, diagnostyka, ograniczenia).

---

## Część 1 — dla użytkownika

### Co daje połączenie
- Każde zadanie, za które **odpowiadasz** w Ignite (szuflada „Zadania” w WBS, „Moje zadania”, kalendarz),
  pojawia się w **Microsoft To Do** na liście **„Ignite”** (lista tworzy się sama przy pierwszym zadaniu).
- Termin zadania = termin w To Do. Odhaczenie, zmiana tytułu lub terminu działa w obie strony.
- Zadanie dodane w To Do (na dowolnej liście) trafia do Ignite jako Twoje zadanie. Jeśli tytuł zawiera
  `#slug-projektu` albo lista nazywa się jak projekt — przypina się do tego projektu.
- Przez To Do zadania widać też w Samsung Reminder / Outlook / telefonie.

### Jak połączyć (jednorazowo, ok. 1 minuty)
1. W Ignite (przeglądarka na komputerze) w menu bocznym kliknij ikonę **Powiadomienia**
   (podpowiedź: „Powiadomienia (Web Push, Microsoft To Do, alarmy)”) — adres `/notifications`.
2. W sekcji Microsoft kliknij **„Połącz konto Microsoft”**.
3. Zaloguj się **firmowym kontem Microsoft 365** (to samo co Outlook / Teams) i zaakceptuj uprawnienia
   (pliki, profil, zadania).
4. Wrócisz do Ignite z komunikatem „Połączono z Microsoft”. Zmiany z To Do docierają do Ignite
   w najbliższym cyklu synchronizacji — **do ok. 5 minut**. Przycisk **„Wymuś sync”** tylko zleca
   synchronizację i nie skraca tego czasu. Nowe zadania z Ignite trafiają do To Do od razu.

### Ważne zasady
- **Zadanie trafia do To Do odpowiedzialnego**, nie zlecającego. Jeśli zlecasz komuś zadanie, to on musi
  mieć połączone konto — inaczej zadanie jest tylko w Ignite.
- **Zadania utworzone ZANIM połączysz konto nie przechodzą do To Do automatycznie** (patrz Część 2,
  ograniczenie nr 1). Po połączeniu: otwórz takie zadanie i zmień je (np. przepisz na siebie ponownie
  albo utwórz od nowa) — albo poproś administratora o jednorazowe przeniesienie.
- Komentarz do zadania i alarmy cykliczne **zostają w Ignite** (powiadomienia push Ignite), do To Do idzie
  tytuł, status i termin.
- Usunięcie zadania w To Do usuwa je w Ignite. Usunięcie w Ignite **oznacza je w To Do jako ukończone**
  (nie kasuje go).
- Gdy w Ignite pojawi się komunikat o ponownym połączeniu (np. po zmianie uprawnień) — wejdź w
  Powiadomienia → **Rozłącz konto** → **Połącz konto Microsoft**.

---

## Część 2 — dla administratora

### Jak to działa (kod)
| Element | Gdzie | Rola |
|---|---|---|
| Logowanie OAuth Microsoft | `back-serwis` `OneDriveService.getAuthUrl` / `handleCallback` (`onedrive.service.ts`), `GET /onedrive/auth`, `GET /onedrive/callback` | autoryzacja użytkownika, token zapisany zaszyfrowany w `schema-model` `UserMsToken` |
| Zakresy (scope) | `back-stala` `SCOPES` w `onedrive.service.ts` | `Files.ReadWrite offline_access User.Read Tasks.ReadWrite` |
| Nowe zadanie → To Do | `back-funkcja` `pushNewTaskToGraph` (`user-tasks.service.ts`) | przy tworzeniu / przepisaniu zadania na innego odpowiedzialnego; lista „Ignite” find-or-create |
| Zmiana zadania → To Do | `back-funkcja` `pushUpdateToGraph` | tytuł, status, termin |
| To Do → Ignite | `back-serwis` `TaskSyncService.syncSingleUser` (`task-sync.service.ts`), delta query per lista | nowe/zmienione/usunięte zadania z MS; konflikt rozstrzyga `msLastModified` |
| Harmonogram | `NotificationCronService` — cron co minutę, właściwy sync co `SystemNotificationSettings.msTodoSyncIntervalMinutes` | wyłącznik globalny `msTodoEnabled` |
| Status / rozłączenie | `GET /ms-todo/status`, `DELETE /ms-todo/disconnect`, `POST /ms-todo/resync` | ekran `/notifications`; `resync` (`bootstrapSync`) tylko zakłada stan synchronizacji — sam sync robi cron |

### Konfiguracja Azure (App registration)
1. **Azure Portal → Microsoft Entra ID → App registrations** — rejestracja aplikacji Ignite (ta sama co OneDrive).
2. **Authentication → Redirect URI (Web):** `https://erp.gigatel.org/api/onedrive/callback`
   (dla dev dodatkowo adres lokalny, jeśli testujemy OAuth na dev).
3. **API permissions → Microsoft Graph → Delegated:** `Files.ReadWrite`, `offline_access`, `User.Read`,
   `Tasks.ReadWrite`. Najlepiej **Grant admin consent** dla organizacji — użytkownicy nie zobaczą wtedy
   pytania o zgodę.
4. **Certificates & secrets:** client secret — zapisz wartość i **datę wygaśnięcia** (po wygaśnięciu
   logowanie i odświeżanie tokenów przestaje działać dla WSZYSTKICH).
5. **Supported account types:** obecnie aplikacja jest **jednodzierżawowa** (`MS_TENANT_ID` = GUID tenanta
   AIRTEL). Konta z innej organizacji (np. adresy `@europrim.com.pl`, jeśli są w osobnym tenancie M365)
   **nie zalogują się**. Opcje: dodać je jako gości (B2B) do tenanta AIRTEL albo przestawić aplikację na
   wielodzierżawową i ustawić `MS_TENANT_ID=organizations`.

### Zmienne środowiskowe backendu (produkcja — wszystkie ustawione na 25.10.2026)
| Zmienna (`back-env`) | Znaczenie |
|---|---|
| `MS_CLIENT_ID` | Application (client) ID z Azure |
| `MS_CLIENT_SECRET` | client secret (pilnować daty wygaśnięcia) |
| `MS_TENANT_ID` | GUID tenanta (jednodzierżawowa) albo `organizations` / `common` |
| `MS_REDIRECT_URI` | `https://erp.gigatel.org/api/onedrive/callback` — musi być identyczny jak w Azure |
| `MS_TOKEN_ENCRYPTION_KEY` | klucz szyfrowania tokenów w bazie — **nie zmieniać** (zmiana = wszyscy muszą połączyć się od nowa) |
| `MS_SHARED_ACCOUNT_EMAIL` | konto usługowe dla plików zamówień (OneDrive) — **nie dotyczy To Do**, To Do zawsze używa konta danego użytkownika |

Edycja `.env` na serwerze wg protokołu: przed edycją kopia, po edycji odczyt pliku i sprawdzenie, że
żadna zmienna nie zniknęła; potem `docker compose up -d backend`.

### Ustawienia globalne
- `SystemNotificationSettings.msTodoEnabled` — `true` (włączone).
- `SystemNotificationSettings.msTodoSyncIntervalMinutes` — `5` (zakres 1–60).

### Stan na produkcji (25.10.2026)
- Połączone konta: **1** (`andrzej@gigatel.app` → `aromanowicz@AIRTELSPZOO.onmicrosoft.com`), ostatni sync
  bez błędu.
- Otwarte zadania: 9 zsynchronizowanych z To Do, **1 bez To Do** (`tstanislawski@europrim.com.pl` — konto
  niepołączone).
- **Do zrobienia przy wdrażaniu dla zespołu:** każda osoba, która dostaje zadania, łączy konto (Część 1);
  sprawdzić, czy konta `@europrim.com.pl` są w tenancie AIRTEL (pkt 5 konfiguracji Azure).

### Diagnostyka
| Objaw | Sprawdź |
|---|---|
| Zadanie nie pojawia się w To Do | czy **odpowiedzialny** ma wpis w `user_ms_tokens` i `needsReauth = false`; czy `msTodoEnabled = true`; logi backendu: `pushNewTaskToGraph failed` |
| Zmiany z To Do nie wracają | `ms_todo_sync_state.lastSyncAt` / `lastSyncError` dla użytkownika; logi `Sync failed for user` |
| „Brak uprawnień do MS To Do — wymagane ponowne połączenie” | token bez `Tasks.ReadWrite` → użytkownik: Rozłącz → Połącz |
| Nikt nie może się zalogować / odświeżyć | wygasły `MS_CLIENT_SECRET` albo niezgodny `MS_REDIRECT_URI` |
| Błąd 412 w Ignite | brak połączonego konta Microsoft (celowo 412, nie 401 — 401 wylogowuje z Ignite) |

```sql
-- kto ma połączone konto i kiedy był ostatni sync
select u.email, t."msAccountEmail", t."needsReauth", s."lastSyncAt", s."lastSyncError"
from user_ms_tokens t join users u on u.id = t."userId"
left join ms_todo_sync_state s on s."userId" = t."userId";

-- otwarte zadania bez odpowiednika w To Do, per odpowiedzialny
select u.email, count(*) from user_tasks ut join users u on u.id = ut."userId"
where ut."deletedAt" is null and ut.status = 'OPEN' and ut."msToDoId" is null group by u.email;
```

### Znane ograniczenia (kandydaci do poprawy)
1. **Brak dosyłania zaległych zadań.** Zadanie trafia do To Do tylko w chwili utworzenia lub przepisania na
   innego odpowiedzialnego. Jeśli użytkownik połączy konto później (albo push się nie udał, np. chwilowy
   błąd Graph), zadanie zostaje tylko w Ignite. Poprawka: w `syncSingleUser` dosyłać otwarte zadania
   użytkownika z `msToDoId = null` (`source = 'IGNITE'`).
2. **Komentarz nie idzie do To Do** — `UserTask.description` można mapować na `body` zadania w Graph.
3. **Przypomnienie w To Do** — do Graph idzie tylko `dueDateTime`; alarmy (także cykliczne) działają
   wyłącznie jako push Ignite. Ewentualnie mapować najbliższy alarm na `reminderDateTime`.
4. **„Wymuś sync” nic nie przyspiesza** — `POST /ms-todo/resync` nie wywołuje `syncSingleUser`; można
   wołać sync od razu dla tego użytkownika.
5. **Termin wysyłany w UTC** (`timeZone: 'UTC'`) — w To Do termin o północy czasu polskiego może pokazać
   się jako poprzedni dzień; bezpieczniej wysyłać datę z `timeZone: 'Central European Standard Time'`.
