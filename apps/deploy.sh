#!/bin/bash

# Skrypt wdrożeniowy ERP - uruchamia całą aplikację w kontenerach Docker
# Frontend, Backend, PostgreSQL w osobnych kontenerach

set -e  # Zatrzymaj przy błędzie

# Kolory
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Sprawdź czy jesteśmy w katalogu /srv/apps/erp
if [ ! -f "docker-compose.yml" ]; then
    error "Nie znaleziono docker-compose.yml. Upewnij się, że jesteś w katalogu /srv/apps/erp"
    exit 1
fi

log "Rozpoczynam wdrożenie aplikacji ERP..."

# 1. Sprawdź czy plik .env istnieje
if [ ! -f ".env" ]; then
    warn "Brak pliku .env - tworzę z domyślnymi wartościami"
    cat > .env << 'EOF'
# Database
DB_USER=erp_user
DB_PASSWORD=changeme_erp_password
DB_NAME=erp_db
DATABASE_URL=postgresql://erp_user:changeme_erp_password@db:5432/erp_db

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Node
NODE_ENV=production
PORT=3000

# Frontend
VITE_API_URL=https://erp.gigatel.org/api
EOF
    warn "UWAGA: Zmień hasła i JWT_SECRET w pliku .env przed uruchomieniem produkcyjnym!"
fi

success "Plik .env gotowy"

# 2. Utwórz katalog na dane bazy (jeśli nie istnieje)
log "Tworzenie katalogu na dane PostgreSQL..."
mkdir -p /srv/data/erp/postgres
success "Katalog /srv/data/erp/postgres utworzony"

# 3. Zatrzymaj stare kontenery (jeśli istnieją)
log "Zatrzymywanie starych kontenerów..."
docker compose down 2>/dev/null || true
success "Stare kontenery zatrzymane"

# 4. Zbuduj obrazy Docker
log "Budowanie obrazów Docker..."
docker compose build --no-cache
success "Obrazy Docker zbudowane"

# 5. Uruchom kontenery
log "Uruchamianie kontenerów..."
docker compose up -d
success "Kontenery uruchomione"

# 6. Poczekaj na uruchomienie bazy danych
log "Oczekiwanie na uruchomienie PostgreSQL..."
sleep 10

# Sprawdź czy baza jest gotowa
for i in {1..30}; do
    if docker exec erp-db pg_isready -U ${DB_USER:-erp_user} > /dev/null 2>&1; then
        success "PostgreSQL gotowy"
        break
    fi
    if [ $i -eq 30 ]; then
        error "PostgreSQL nie odpowiada po 30 sekundach"
        exit 1
    fi
    echo -n "."
    sleep 1
done

# 7. Uruchom migracje Prisma
log "Uruchamianie migracji bazy danych..."
docker exec erp-backend npx prisma migrate deploy
success "Migracje wykonane"

# 8. Opcjonalnie: Seed danych (użytkownicy, role)
if [ -f "backend/prisma/seed.ts" ] || [ -f "backend/prisma/seed.js" ]; then
    log "Inicjalizacja danych (seed)..."
    docker exec erp-backend npx prisma db seed || warn "Seed nie powiódł się (może już istnieją dane)"
fi

# 9. Sprawdź status kontenerów
log "Status kontenerów:"
docker compose ps

# 10. Sprawdź logi
log "Ostatnie logi backendu:"
docker logs erp-backend --tail 20

# 11. Test healthcheck
log "Testowanie endpointów..."
sleep 5

# Test backend API
if curl -f -s http://localhost:3000/api/health > /dev/null; then
    success "Backend API odpowiada (http://localhost:3000/api/health)"
else
    warn "Backend API nie odpowiada jeszcze - może potrzebować więcej czasu"
fi

# 12. Podsumowanie
echo ""
echo "========================================="
success "Wdrożenie zakończone!"
echo "========================================="
echo ""
echo "📦 Uruchomione kontenery:"
echo "  - erp-db (PostgreSQL 15)"
echo "  - erp-backend (NestJS API)"
echo "  - erp-frontend (Nginx + React)"
echo ""
echo "🌐 Dostęp:"
echo "  - Frontend: https://erp.gigatel.org"
echo "  - Backend API: https://erp.gigatel.org/api"
echo "  - Health Check: https://erp.gigatel.org/api/health"
echo ""
echo "📊 Przydatne komendy:"
echo "  - Logi: docker compose logs -f"
echo "  - Status: docker compose ps"
echo "  - Restart: docker compose restart"
echo "  - Stop: docker compose down"
echo ""
echo "📁 Dane bazy: /srv/data/erp/postgres"
echo ""
