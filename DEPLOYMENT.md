# ERP Deployment Guide

Ten dokument opisuje standardy i procedury wdrażania aplikacji ERP lokalnie (do pracy deweloperskiej) oraz produkcyjnie.

## 🌟 Najlepsze Praktyki (Dual-Mode)

| Cecha | Lokalne (Development) | Produkcyjne |
| :--- | :--- | :--- |
| **Metoda** | **Hybrid Docker** (tylko DB/AI) | **Full Docker** (wszystko) |
| **Zaleta** | Szybki Hot Module Replacement (HMR) | Izolacja i powtarzalność |
| **Plik ENV** | `.env.local` | `.env.server` |

---

## 💻 Lokalny Development (Poza Dockerem)

Zalecamy uruchamianie backendu i frontendu lokalnie, aby zmiany
gdxiew kodzie były widoczne natychmiast.

### 1. Uruchom Bazy Danych (Docker)

Używamy Dockera tylko dla usług, których nie chcemy instalować lokalnie (Postgres, Qdrant):

```powershell
cd apps
docker compose up db vector-db -d
```

### 2. Konfiguracja Środowiska

Skopiuj pliki `.env` jeśli jeszcze ich nie masz:

```powershell
# W katalogu apps/
cp .env.local .env
# W katalogu apps/backend/
cp .env.local .env
```

### 3. Instalacja i Start

Uruchom dwie osobne konsole (lub użyj workflow `/local-dev`):

**Backend:**

```powershell
seed users
cd apps/backend
npm install
npm run start:dev
```

**Frontend:**

```powershell
cd apps/frontend
npm install
npm run dev
```

---

## 🚀 Wdrożenie Produkcyjne (Docker)

Produkcyjnie cała aplikacja (łącznie z Nginx dla frontendu) działa w kontenerach.

### 1. Przygotowanie Serwera

Upewnij się, że masz:

- Docker & Docker Compose
- Traefik (jako Reverse Proxy)

### 2. Uruchomienie Deploya

```markdown
Użyj gotowego skryptu `deploy.sh`, który automatyzuje:

- Seedowanie użytkowników (dla nowej bazy)
```

- Budowanie obrazów
- Migracje bazy danych
- Start kontenerów

```bash
cd /srv/apps/erp
./deploy.sh
```

---

## 🔑 Zarządzanie Sekretami

- **Zawsze** edytuj `.env`, który jest ignorowany przez Gita.
- Szablony `.env.local` i `.env.server` służą do dokumentacji dostępnych zmiennych.
- Lokalnie backend łączy się z `localhost:5433`, w Dockerze z `db:5432`.

## 🛠 Rozwiązywanie Problemów

- **Baza nie wstaje?** Sprawdź logi: `docker compose logs db`.
- **Frontend nie widzi API?** Sprawdź `VITE_API_URL` w `.env`.
- **Zmiany w DB nie działają?** Uruchom `npx prisma generate` lokalnie w katalogu backendu.
