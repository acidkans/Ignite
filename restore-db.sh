#!/bin/bash
# Odtworzenie produkcyjnej bazy ERP ze zrzutu. Uruchamiac NA SERWERZE.
#
#   ./restore-db.sh wczoraj              # PROBA — odtwarza obok, nic nie przelacza
#   ./restore-db.sh wczoraj --zapis      # przelaczenie produkcji na odtworzona baze
#   ./restore-db.sh najnowszy
#   ./restore-db.sh /srv/apps/erp/backups/erp_db_20260821_023000.sql.gz
#
# Dlaczego nie „zaladuj dump prosto na erp_db":
#   zrzut niesie DROP-y, wiec nieudane ladowanie w polowie zostawia produkcje w gruzach,
#   bez drogi powrotnej. Tutaj zrzut ladowany jest do OSOBNEJ bazy, sprawdzany, i dopiero
#   sprawna baza podmienia produkcyjna przez RENAME — operacja natychmiastowa i odwracalna.
#   Stara baza zostaje pod nazwa `erp_db_przed_odtworzeniem_<ts>` az sam ja skasujesz.
# @anchor restore-db-script
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

CONTAINER=erp-db
DB_USER=erp_user
DB_NAME=erp_db
STAGING=erp_db_restore
DEST=/srv/apps/erp/backups
COMPOSE_DIR=/srv/apps/erp/apps
TABELE_KONTROLNE="wbs_nodes material_requirements process_nodes users product_proposals"

zrodlo=${1:-}
tryb=${2:-proba}
[ -n "$zrodlo" ] || { sed -n '2,15p' "$0"; exit 1; }

psql_() { docker exec -i "$CONTAINER" psql -U "$DB_USER" "$@"; }
licz()  { psql_ -d "$1" -tAc "SELECT count(*) FROM $2" 2>/dev/null || echo BRAK; }

# ── 1. wybor zrzutu ───────────────────────────────────────────────────────────
# `|| true` przy kazdym `ls`: bez trafienia `ls` konczy sie kodem 2, a `set -e` ubilby
# skrypt ZANIM zdazy wypisac, czego nie znalazl. Cicha smierc z kodem 2 to najgorsza
# rzecz, jaka moze spotkac kogos odtwarzajacego baze po awarii.
case "$zrodlo" in
    najnowszy) plik=$(ls -1t "$DEST"/erp_db_[0-9]*.sql.gz 2>/dev/null | head -1 || true) ;;
    wczoraj)   d=$(date -u -d yesterday +%Y%m%d)
               plik=$(ls -1t "$DEST"/erp_db_"$d"_*.sql.gz 2>/dev/null | head -1 || true) ;;
    *)         plik=$zrodlo ;;
esac
if [ -z "${plik:-}" ] || [ ! -f "$plik" ]; then
    echo "BLAD: nie znalazlem zrzutu dla '$zrodlo'"
    echo "Dostepne zrzuty w $DEST:"
    ls -1t "$DEST"/erp_db_[0-9]*.sql.gz 2>/dev/null | head -10 || echo "   (brak)"
    exit 1
fi

echo "== zrzut: $plik ($(numfmt --to=iec "$(stat -c %s "$plik")"), $(date -u -r "$plik" '+%Y-%m-%d %H:%M UTC'))"
gzip -t "$plik" || { echo "BLAD: archiwum uszkodzone — NIE odtwarzam"; exit 1; }
echo "   archiwum zdrowe"

# ── 2. zrzut bezpieczenstwa stanu BIEZACEGO ───────────────────────────────────
# Odtworzenie tez musi byc odwracalne: zanim cokolwiek ruszymy, biezacy stan ma
# wlasny plik. Bez tego powrot z nieudanego odtworzenia jest niemozliwy.
awaryjny="$DEST/erp_db_przed_odtworzeniem_$(date -u +%Y%m%d_%H%M%S).sql.gz"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists | gzip -9 > "$awaryjny"
echo "== stan biezacy zapisany: $(basename "$awaryjny") ($(numfmt --to=iec "$(stat -c %s "$awaryjny")"))"

# ── 3. zaladowanie zrzutu do bazy OBOK produkcyjnej ───────────────────────────
psql_ -d postgres -q -c "DROP DATABASE IF EXISTS $STAGING"
psql_ -d postgres -q -c "CREATE DATABASE $STAGING"
if ! zcat "$plik" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$STAGING" -q > /tmp/restore.out 2>/tmp/restore.err; then
    grep -i error /tmp/restore.err | head -5
    echo "BLAD: ladowanie zrzutu nie powiodlo sie — produkcja NIETKNIETA"; exit 1
fi
if grep -i error /tmp/restore.err | grep -qv 'does not exist'; then
    grep -i error /tmp/restore.err | grep -v 'does not exist' | head -5
    echo "BLAD: bledy w trakcie ladowania — produkcja NIETKNIETA"; exit 1
fi

# ── 4. porownanie: co dokladnie sie zmieni ────────────────────────────────────
echo
printf '%-24s %12s %12s   %s\n' "tabela" "produkcja" "ze zrzutu" "roznica"
for t in $TABELE_KONTROLNE; do
    a=$(licz "$DB_NAME" "$t"); b=$(licz "$STAGING" "$t")
    [ "$b" = BRAK ] && { echo "BLAD: w zrzucie brakuje tabeli $t — produkcja NIETKNIETA"; exit 1; }
    printf '%-24s %12s %12s   %+d\n' "$t" "$a" "$b" "$((b - a))"
done
echo

if [ "$tryb" != "--zapis" ]; then
    echo "== PROBA zakonczona. Odtworzona baza stoi obok jako '$STAGING' — mozesz ja obejrzec:"
    echo "   docker exec -it $CONTAINER psql -U $DB_USER -d $STAGING"
    echo "== przelaczenie produkcji: $0 $zrodlo --zapis"
    exit 0
fi

# ── 5. podmiana ───────────────────────────────────────────────────────────────
stara="${DB_NAME}_przed_odtworzeniem_$(date -u +%Y%m%d_%H%M%S)"
echo "== zatrzymuje backend"
docker compose -f "$COMPOSE_DIR/docker-compose.yml" stop backend

# Polaczenia trzeba zerwac, inaczej RENAME odbije sie o „database is being accessed".
psql_ -d postgres -q -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid<>pg_backend_pid()" >/dev/null
psql_ -d postgres -q -c "ALTER DATABASE $DB_NAME RENAME TO $stara"
psql_ -d postgres -q -c "ALTER DATABASE $STAGING RENAME TO $DB_NAME"
echo "== podmienione: stara baza czeka jako '$stara'"

echo "== startuje backend"
docker compose -f "$COMPOSE_DIR/docker-compose.yml" start backend
sleep 8
kod=$(curl -s -o /dev/null -w '%{http_code}' https://erp.gigatel.org/api/health || echo 000)
echo "== /api/health: $kod"
[ "$kod" = 200 ] || echo "   UWAGA: aplikacja nie odpowiada 200 — sprawdz 'docker logs erp-backend'"

echo
echo "== POWROT, gdyby odtworzenie okazalo sie bledem:"
echo "   docker compose -f $COMPOSE_DIR/docker-compose.yml stop backend"
echo "   docker exec -i $CONTAINER psql -U $DB_USER -d postgres -c \"ALTER DATABASE $DB_NAME RENAME TO ${DB_NAME}_odrzucona\""
echo "   docker exec -i $CONTAINER psql -U $DB_USER -d postgres -c \"ALTER DATABASE $stara RENAME TO $DB_NAME\""
echo "   docker compose -f $COMPOSE_DIR/docker-compose.yml start backend"
echo "== stara baza NIE jest kasowana automatycznie. Gdy potwierdzisz, ze wszystko gra:"
echo "   docker exec -i $CONTAINER psql -U $DB_USER -d postgres -c 'DROP DATABASE $stara'"
