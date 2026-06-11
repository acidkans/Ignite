#!/bin/bash
# Zapisuje aktualny stan lokalnej dev-DB do db/dev-snapshot.sql.gz
# Użycie: bash db/snapshot.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Tworzę snapshot dev-DB..."
docker exec erp-db pg_dump -U postgres erp_db | gzip > "$SCRIPT_DIR/dev-snapshot.sql.gz"
SIZE=$(du -h "$SCRIPT_DIR/dev-snapshot.sql.gz" | cut -f1)
echo "OK — $SIZE zapisane do db/dev-snapshot.sql.gz"
echo "Możesz teraz: git add db/dev-snapshot.sql.gz && git commit -m 'chore: aktualizacja dev snapshot'"
