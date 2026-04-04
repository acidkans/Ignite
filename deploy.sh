#!/bin/bash
set -e
cd /srv/apps/erp
git fetch origin
git reset --hard origin/main
cd apps
docker compose build --no-cache frontend backend
docker compose up -d frontend backend
