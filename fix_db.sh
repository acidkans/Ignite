#!/bin/bash
set -e

DB_URL="postgres://erp_user:***REMOVED-DB-PASSWORD***@db:5432/erp_db"

echo "Running prisma db push --accept-data-loss..."
docker run --rm --network apps_internal \
  -e DATABASE_URL="$DB_URL" \
  apps-backend \
  sh -c "npx prisma db push --accept-data-loss"

echo "Done. Restarting backend..."
cd /srv/apps/erp/apps && docker compose restart backend

sleep 8
echo "=== Backend logs ==="
docker logs erp-backend 2>&1 | tail -20
