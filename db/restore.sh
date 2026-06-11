#!/bin/bash
# Przywraca dev-DB z db/dev-snapshot.sql.gz
# Użycie: bash db/restore.sh
# UWAGA: usuwa i odtwarza całą bazę erp_db
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SNAPSHOT="$SCRIPT_DIR/dev-snapshot.sql.gz"

if [ ! -f "$SNAPSHOT" ]; then
  echo "Błąd: nie znaleziono $SNAPSHOT"
  exit 1
fi

# Sprawdź czy kontener DB działa
if ! docker inspect erp-db &>/dev/null; then
  echo "Błąd: kontener erp-db nie działa. Uruchom: cd apps && docker compose up -d db"
  exit 1
fi

echo "Przywracam dev-DB z $SNAPSHOT..."
echo "  [1/3] Przerywam połączenia..."
docker exec erp-db psql -U postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='erp_db' AND pid <> pg_backend_pid();" \
  >/dev/null 2>&1 || true

echo "  [2/3] Usuwam i odtwarzam bazę..."
docker exec erp-db psql -U postgres -c "DROP DATABASE IF EXISTS erp_db;" >/dev/null
docker exec erp-db psql -U postgres -c "CREATE DATABASE erp_db OWNER postgres;" >/dev/null

echo "  [3/3] Wgrywam dane..."
gunzip -c "$SNAPSHOT" | docker exec -i erp-db psql -U postgres erp_db >/dev/null

echo "OK — baza przywrócona. Zrestartuj backend jeśli był uruchomiony."
