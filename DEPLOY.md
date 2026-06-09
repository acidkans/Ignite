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

## Zasady stałe
- **Backup prod ZAWSZE przed dotknięciem bazy** (schema lub dane).
- **Kod przed migracją danych** — stary kod + zmigrowana baza = błędne/puste odczyty.
- `--no-cache` przy buildzie frontendu (cache potrafi ukryć zmiany).
- **Nigdy nie seeduj produkcji.**
- Dane prod ≠ dane lokalne — lokalny podgląd (`:5174`) ma własną bazę; nie myl z prod.

## Dlaczego override wyłącza `db push`
**2026-06-10:** `db push` przy starcie backendu wywrócił produkcję (restart-loop, 502), bo w bazie istniała tabela-widmo `material_requirements_type_backup` (backup kolumny `type`, spoza `schema.prisma`) → `db push` chciał ją dropnąć bez `--accept-data-loss` → CMD padał. Rozwiązanie: `/srv/apps/erp/apps/docker-compose.override.yml` z `command: sh -c "npx prisma generate && rm -f tsconfig.tsbuildinfo && npx tsc -p tsconfig.json && node dist/main"` (bez `db push` i seedów). Tabela-widmo została następnie usunięta. **Override jest na serwerze, poza repo** — przy odtwarzaniu serwera trzeba go odtworzyć.
