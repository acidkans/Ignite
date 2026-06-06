#!/bin/bash
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL env var is required (e.g. export DATABASE_URL=postgres://user:pass@db:5432/erp_db)" >&2
  exit 1
fi

echo "Running prisma db push --accept-data-loss..."
docker run --rm --network apps_internal \
  -e DATABASE_URL="$DATABASE_URL" \
  apps-backend \
  sh -c "npx prisma db push --accept-data-loss"

echo "Done. Restarting backend..."
cd /srv/apps/erp/apps && docker compose restart backend

sleep 8
echo "=== Backend logs ==="
docker logs erp-backend 2>&1 | tail -20
