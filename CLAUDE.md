Raportując zmiany skracaj odpowiedzi do jednego zdania. Nie pokazuj plików edytowanych w panelu środkowym (nie używaj PathsToReview w notify_user).
Wszystkie skrypty testowe i logi umieszczaj w katalogu /test w korzeniu projektu.
Przed startem serwerów dev zawsze ubijaj procesy na portach, które będą używane (3001, 5173 itp.).
Nigdy nie deployuj na produkcję (git push + ssh deploy) bez wyraźnego potwierdzenia użytkownika. Przed każdym deployem zapytaj: "Czy deployować na produkcję?"
Przed każdym `docker compose build` lub `docker build` sprawdź czy istnieje plik `.dockerignore` w katalogu kontekstu buildu (apps/frontend/.dockerignore, apps/backend/.dockerignore). Jeśli brakuje — odtwórz go z poniższej treści zanim uruchomisz build:
- apps/frontend/.dockerignore: node_modules / dist / .git / *.log
- apps/backend/.dockerignore: node_modules / dist / .env
