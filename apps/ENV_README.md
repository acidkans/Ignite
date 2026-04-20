# Konfiguracja Zmiennych Środowiskowych

## 📁 Struktura Plików

Projekt używa następujących plików konfiguracyjnych:

```
apps/
├── .env.local          # Konfiguracja lokalna (development)
├── .env.server         # Konfiguracja serwerowa (production)
├── ENV_README.md       # Dokumentacja konfiguracji
└── backend/
    ├── .env.local      # Konfiguracja lokalna backendu
    └── .env.server     # Konfiguracja serwerowa backendu
```

## 🚀 Użycie

### Dla Lokalnego Developmentu

```bash
# W katalogu apps/
cp .env.local .env

# W katalogu apps/backend/
cd backend
cp .env.local .env
```

### Dla Serwera Produkcyjnego

```bash
# W katalogu apps/
cp .env.server .env

# W katalogu apps/backend/
cd backend
cp .env.server .env
```

## 🔑 Kluczowe Różnice

| Parametr        |     `.env.local`        | `.env.server`           |
|----------       |--------------           |---------------          |          
| `DATABASE_URL`  | `localhost:5433`        | `db:5432`               |
| `VECTOR_DB_URL` | `http://localhost:6333` | `http://vector-db:6333` |
| Środowisko      | Lokalne (poza Dockerem) | Docker Compose          |

## ⚠️ Ważne

- **NIE commituj** plików `.env` do repozytorium Git!
- Pliki `.env.local` i `.env.server` są śledzone w Git jako szablony
- Aktywny plik `.env` jest ignorowany przez `.gitignore`

## 📝 Zmienne Środowiskowe

### Baza Danych
- `DATABASE_URL` - URL połączenia z PostgreSQL

### Autentykacja
- `JWT_SECRET` - Sekret dla tokenów JWT

### Email (SMTP)
- `SMTP_HOST` - Host serwera SMTP
- `SMTP_PORT` - Port serwera SMTP
- `SMTP_SECURE` - SSL/TLS (true/false)
- `SMTP_USER` - Użytkownik SMTP
- `SMTP_PASS` - Hasło SMTP
- `SMTP_FROM` - Adres nadawcy

### AI & Vector DB
- `GEMINI_API_KEY` - Klucz API Google Gemini
- `GROQ_API_KEY` - Klucz API Groq
- `VECTOR_DB_URL` - URL bazy wektorowej Qdrant
- `VECTOR_DB_API_KEY` - Klucz API Qdrant
- `AI_MODEL` - Model AI do użycia
- `EMBEDDING_MODEL` - Model embeddingów

### Inne
- `NODE_ENV` - Środowisko (development/production)
- `FRONTEND_URL` - URL frontendu (dla linków w mailach)
- `ADMIN_EMAILS` - Lista emaili administratorów
