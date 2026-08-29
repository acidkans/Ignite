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

### Kalendarz Google (moduł Urlopy — zapis zatwierdzonych urlopów)
- `GOOGLE_CALENDAR_ID` - adres kalendarza urlopowego (domyślnie `airtel.urlopy@gmail.com`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - adres konta serwisowego z Google Cloud (`...@....iam.gserviceaccount.com`)
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` - klucz prywatny konta serwisowego, w jednej linii ze znakami `
`
- `GOOGLE_CALENDAR_IMPERSONATE` - opcjonalnie, tylko dla Google Workspace z delegacją ogólnodomenową

Bez `GOOGLE_SERVICE_ACCOUNT_EMAIL` i `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` integracja jest wyłączona —
moduł Urlopy działa normalnie, po prostu nic nie trafia do kalendarza.

Konfiguracja po stronie Google (jednorazowo):
1. Google Cloud Console → nowy projekt → włącz **Google Calendar API**
2. IAM → Konta usługi → utwórz konto serwisowe → Klucze → nowy klucz JSON
3. Z pliku JSON weź `client_email` i `private_key` do zmiennych powyżej
4. W kalendarzu `airtel.urlopy@gmail.com` → Ustawienia → Udostępnij określonym osobom →
   dodaj adres konta serwisowego z uprawnieniem **„Wprowadzanie zmian w wydarzeniach"**

### Inne
- `NODE_ENV` - Środowisko (development/production)
- `FRONTEND_URL` - URL frontendu (dla linków w mailach)
- `ADMIN_EMAILS` - Lista emaili administratorów
