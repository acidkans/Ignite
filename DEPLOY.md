# DEPLOY — Ignite ERP

Procedura wdrożeń produkcyjnych. Serwer: **gigatel** (`159.69.212.91`), katalog `/srv/apps/erp`, docker compose w `apps/`, URL **https://erp.gigatel.org**.

## Architektura wdrożenia
- Deploy = `git pull` na serwerze + rebuild/restart kontenerów. Serwer buduje z gałęzi **`main`** → **zawsze `git push origin main` przed deployem**.
- **Backend** (`erp-backend`) bind-mountuje `./backend:/usr/src/app` → zmiany KODU wchodzą przez `git pull` + `tsc` (w command). Pełny rebuild tylko przy zmianie `package.json` (zależności).
- **Frontend** (`erp-frontend`) = nginx serwuje `dist` z obrazu → **wymaga rebuildu** (`--no-cache`) przy każdej zmianie frontu.
- Auto-`prisma db push` przy starcie backendu jest **WYŁĄCZONY** przez `docker-compose.override.yml` (był groźny — patrz niżej).

## ① Zmiana KODU (bez `schema.prisma`) — najczęstsze
1. Lokalnie: `cd apps/backend && npx tsc --noEmit` + test → commit → merge do `main` → `git push origin main`.
2. Serwer: `cd /srv/apps/erp && git pull`
3. Frontend (jeśli dotknięty): `cd apps && docker compose build --no-cache frontend && docker compose up -d frontend`
4. Backend: `docker compose restart backend` (pełny rebuild tylko przy zmianie zależności: `docker compose build backend && docker compose up -d backend`)
5. Weryfikacja: `curl https://erp.gigatel.org/api/health` → `200`

## ② Zmiana SCHEMA (`schema.prisma`)
Auto-`db push` jest wyłączony → schemat synchronizuj **ręcznie i świadomie**:
1. Lokalnie zmień `schema.prisma`, przetestuj `npx prisma db push` na lokalnej bazie.
2. Commit + push + `git pull` na serwerze.
3. **Backup prod**: `docker exec erp-db pg_dump -U erp_user erp_db > ~/backup_$(date +%F).sql`
4. `docker exec erp-backend npx prisma db push` — **najpierw BEZ flagi**; jeśli ostrzega o utracie danych, oceń co dropuje, dopiero wtedy `--accept-data-loss`.
5. `docker compose restart backend` (odpali `prisma generate` + nowy kod) → weryfikacja.

## ③ Migracja DANYCH (skrypt)
1. Skrypt **idempotentny** w `apps/backend/prisma/` (wzór: `migrate-baseline-to-first-version.js`; tryb `--dry`).
2. **Backup prod** → deploy kodu (jeśli migracja zależy od nowego kodu) → `docker exec erp-backend node prisma/<skrypt>.js --dry` (sprawdź liczby) → bez `--dry` → weryfikacja.

## ④ Kopie zapasowe bazy

Trzy warstwy, każda w innym miejscu — awaria jednej nie zabiera pozostałych.

| warstwa | co | gdzie | jak często | ile wstecz |
|---|---|---|---|---|
| serwer, dzienna | `backup-db.sh` z crona `deploy` | `/srv/apps/erp/backups/` | 02:30 UTC (04:30 lato / 03:30 zima) | 30 dni |
| serwer, miesięczna | pierwszy udany zrzut miesiąca, twardy link | `/srv/apps/erp/backups/monthly/` | raz w miesiącu | 12 miesięcy |
| lokalna | `pull-backup.ps1` na komputerze | `%USERPROFILE%\ignite-backups` | ręcznie lub Harmonogram zadań | 14 sztuk |

Zrzut spakowany waży ~760 KB (baza 17 MB), więc rozmiar nie jest ograniczeniem.

**Skrypt zrzutu nie ufa własnemu wynikowi**: pisze do pliku `.part` i dopiero kompletny plik dostaje docelową nazwę, sprawdza rozmiar względem progu i poprawność archiwum przez `gzip -t`. Nieudany zrzut nie zostawia pliku, który wygląda na dobry backup.

**Kopia lokalna** (`pull-backup.ps1`) porównuje SHA256 z sumą po stronie serwera i odrzuca plik, który nie zgadza się po pobraniu. Kopie trzymaj POZA katalogiem repo — zrzuty nie mogą trafić do gita.

Sprawdzenie, czy cron żyje: `ssh gigatel "crontab -l; tail -3 /srv/apps/erp/backups/backup.log"`

Cron woła skrypt przez `bash`, nie wprost — bit wykonywalności ginie przy `git reset --hard` na maszynach z `core.filemode=false`, a cicho niedziałający backup jest gorszy niż jego brak.

**Wpis crontaba jest na serwerze, poza repo** — tak samo jak `docker-compose.override.yml`. Przy odtwarzaniu serwera trzeba go dodać ręcznie:
```bash
(crontab -l 2>/dev/null; echo '30 2 * * * bash /srv/apps/erp/backup-db.sh >> /srv/apps/erp/backups/cron.log 2>&1') | crontab -
```

## ⑤ Odtworzenie bazy ze zrzutu

Skrypt: `/srv/apps/erp/restore-db.sh`. **Nie ładuje zrzutu wprost na produkcyjną bazę** — zrzut niesie `DROP`-y, więc ładowanie przerwane w połowie zostawiłoby produkcję w gruzach bez drogi powrotnej. Zamiast tego: ładuje obok, sprawdza, i dopiero sprawną bazę podmienia przez `ALTER DATABASE ... RENAME`. Podmiana jest natychmiastowa, a stara baza zostaje pod nazwą `erp_db_przed_odtworzeniem_<ts>`, dopóki sam jej nie skasujesz.

**Krok 1 — próba** (produkcja nietknięta, można robić kiedykolwiek):
```bash
ssh gigatel "/srv/apps/erp/restore-db.sh wczoraj"
```
Wypisze tabelę porównania: ile wierszy ma produkcja, ile zrzut i jaka jest różnica. To jest moment na decyzję — widzisz dokładnie, co odtworzenie cofnie. Odtworzona baza zostaje obok jako `erp_db_restore` do obejrzenia.

**Krok 2 — przełączenie** (krótka przerwa, backend na kilkanaście sekund w dół):
```bash
ssh gigatel "/srv/apps/erp/restore-db.sh wczoraj --zapis"
```
Skrypt sam: zapisuje stan bieżący do osobnego pliku, zatrzymuje backend, zrywa połączenia, podmienia bazy, startuje backend i sprawdza `/api/health`. Na końcu wypisuje gotowe komendy powrotu i komendę skasowania starej bazy.

Zamiast `wczoraj` można podać `najnowszy` albo ścieżkę do konkretnego pliku. Odtworzenie z kopii lokalnej: najpierw `scp` pliku na serwer do `/srv/apps/erp/backups/`, potem ta sama procedura ze ścieżką.

**Powrót, gdyby odtworzenie okazało się błędem** — stara baza nadal stoi, wystarczy odwrócić rename (dokładne komendy wypisuje sam skrypt po podmianie).

## Zasady stałe
- **Backup prod ZAWSZE przed dotknięciem bazy** (schema lub dane).
- **Zapis wprost do bazy = najpierw `backup-db.sh`.** Transakcja i próba na sucho nie zastępują punktu przywracania.
- **Zrzut niesprawdzony to zrzut, którego nie ma** — procedurę odtworzenia ćwicz w trybie próby, nie przy pierwszej awarii.
- **Skrypty `.ps1` pisz wyłącznie w ASCII.** PowerShell 5.1 czyta plik bez BOM jako Windows-1252, więc myślnik `—` rozpada się na `â€"`, gdzie ostatni bajt to typograficzny cudzysłów zamykający string w połowie linii — skrypt psuje się cicho, w miejscu niezwiązanym z błędem.
- **Kod przed migracją danych** — stary kod + zmigrowana baza = błędne/puste odczyty.
- `--no-cache` przy buildzie frontendu (cache potrafi ukryć zmiany).
- **Nigdy nie seeduj produkcji.**
- Dane prod ≠ dane lokalne — lokalny podgląd (`:5174`) ma własną bazę; nie myl z prod.

## Dlaczego override wyłącza `db push`
**2026-06-10:** `db push` przy starcie backendu wywrócił produkcję (restart-loop, 502), bo w bazie istniała tabela-widmo `material_requirements_type_backup` (backup kolumny `type`, spoza `schema.prisma`) → `db push` chciał ją dropnąć bez `--accept-data-loss` → CMD padał. Rozwiązanie: `/srv/apps/erp/apps/docker-compose.override.yml` z `command: sh -c "npx prisma generate && rm -f tsconfig.tsbuildinfo && npx tsc -p tsconfig.json && node dist/main"` (bez `db push` i seedów). Tabela-widmo została następnie usunięta. **Override jest na serwerze, poza repo** — przy odtwarzaniu serwera trzeba go odtworzyć.
