#!/bin/sh
set -e

echo "🔧 [Entrypoint] Sprawdzanie node_modules..."
if [ ! -d "node_modules/@nestjs/mapped-types" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  echo "📦 [Entrypoint] Instalowanie zależności npm..."
  npm install
else
  echo "✅ [Entrypoint] node_modules są aktualne."
fi

echo "🗄️  [Entrypoint] Generowanie Prisma Client..."
npx prisma generate

echo "🔄 [Entrypoint] Aplikowanie migracji bazy danych..."
npx prisma migrate deploy

echo "🌱 [Entrypoint] Seedowanie użytkowników z users-data.json..."
node prisma/seed-users-from-json.js

echo "🚀 [Entrypoint] Uruchamianie backendu..."
exec "$@"
