#!/bin/bash
# Dzienny zrzut produkcyjnej bazy ERP. Uruchamiany z crona uzytkownika `deploy`:
#   30 2 * * * /srv/apps/erp/backup-db.sh >> /srv/apps/erp/backups/cron.log 2>&1
#
# Zasady:
#   - zrzut idzie najpierw do pliku `.part` i dopiero KOMPLETNY dostaje docelowa nazwe.
#     Przerwany dump nie moze zostawic pliku, ktory wyglada na dobry backup;
#   - kazdy zrzut jest sprawdzany: rozmiar powyzej progu i poprawnosc archiwum `gzip -t`.
#     Backup, ktorego nikt nie zweryfikowal, to backup ktorego nie ma;
#   - pierwszy udany zrzut w miesiacu laduje tez w `monthly/` — dzienne wygasaja po 30 dniach,
#     miesieczne trzymaja rok wstecz.
# @anchor backup-db-script
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

CONTAINER=erp-db
DB_USER=erp_user
DB_NAME=erp_db
DEST=/srv/apps/erp/backups
KEEP_DAILY=30          # dni
KEEP_MONTHLY=12        # sztuk
MIN_BYTES=200000       # prog zdrowia zrzutu; baza ma ~17 MB, spakowana ~2 MB

LOG="$DEST/backup.log"
log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }
die() { log "BLAD: $*"; exit 1; }

mkdir -p "$DEST/monthly"

# Jeden zrzut naraz — reczne uruchomienie w trakcie crona nie moze sie z nim zderzyc.
exec 9>"$DEST/.lock"
flock -n 9 || die "inny zrzut w toku — pomijam"

docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 \
    || die "kontener $CONTAINER nie odpowiada"

ts=$(date -u +%Y%m%d_%H%M%S)
out="$DEST/erp_db_$ts.sql.gz"
tmp="$out.part"
trap 'rm -f "$tmp"' EXIT

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
    | gzip -9 > "$tmp" || die "pg_dump nie powiodl sie"

size=$(stat -c %s "$tmp")
[ "$size" -ge "$MIN_BYTES" ] || die "zrzut ma tylko $size B (prog $MIN_BYTES)"
gzip -t "$tmp" 2>/dev/null || die "archiwum uszkodzone"

mv "$tmp" "$out"
trap - EXIT

# Pierwszy udany zrzut w danym miesiacu zostaje na rok. Twardy link, wiec do czasu
# wygasniecia dziennego kopia nie zajmuje drugi raz miejsca.
month=$(date -u +%Y%m)
if ! compgen -G "$DEST/monthly/erp_db_${month}*.sql.gz" > /dev/null; then
    ln "$out" "$DEST/monthly/$(basename "$out")"
    log "zrzut miesieczny: $(basename "$out")"
fi

find "$DEST" -maxdepth 1 -type f -name 'erp_db_[0-9]*.sql.gz' -mtime +"$KEEP_DAILY" -delete
# Zrzuty awaryjne z `restore-db.sh` maja wlasny przedrostek, wiec nie lapie ich wzorzec wyzej.
# Bez tej linii rosnalyby bez konca.
find "$DEST" -maxdepth 1 -type f -name 'erp_db_przed_odtworzeniem_*.sql.gz' -mtime +"$KEEP_DAILY" -delete
# `|| true` bo przy pustym katalogu `ls` konczy sie bledem, a `pipefail` + `set -e`
# przerwalyby skrypt PO udanym zrzucie — czyli cichy falszywy alarm zamiast backupu.
{ ls -1t "$DEST/monthly"/erp_db_[0-9]*.sql.gz 2>/dev/null || true; } | tail -n +$((KEEP_MONTHLY + 1)) | xargs -r rm -f

log "OK: $(basename "$out") ($(numfmt --to=iec "$size")), dziennych: $(ls -1 "$DEST"/erp_db_[0-9]*.sql.gz 2>/dev/null | wc -l)"
