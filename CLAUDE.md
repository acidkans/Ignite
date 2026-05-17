Raportując zmiany skracaj odpowiedzi do jednego zdania. Nie pokazuj plików edytowanych w panelu środkowym (nie używaj PathsToReview w notify_user).
Wszystkie skrypty testowe i logi umieszczaj w katalogu /test w korzeniu projektu.
Przed startem serwerów dev zawsze ubijaj procesy na portach, które będą używane (3001, 5173 itp.).
Nigdy nie deployuj na produkcję (git push + ssh deploy) bez wyraźnego potwierdzenia użytkownika. Przed każdym deployem zapytaj: "Czy deployować na produkcję?"
Przed każdym `docker compose build` lub `docker build` sprawdź czy istnieje plik `.dockerignore` w katalogu kontekstu buildu (apps/frontend/.dockerignore, apps/backend/.dockerignore). Jeśli brakuje — odtwórz go z poniższej treści zanim uruchomisz build:
- apps/frontend/.dockerignore: node_modules / dist / .git / *.log
- apps/backend/.dockerignore: node_modules / dist / .env

## CHANGELOG.md — zasady prowadzenia

Dopisuj wpis do CHANGELOG.md NATYCHMIAST po każdej zmianie strukturalnej — zanim przejdziesz do kolejnego kroku. Nie czekaj na koniec sesji.

Co jest zmianą strukturalną (zapisuj):
- dodanie / usunięcie / zmiana pola w schema.prisma
- nowy model lub usunięcie modelu
- nowy endpoint lub zmiana sygnatury istniejącego
- zmiana relacji między modelami

Co NIE jest zmianą strukturalną (pomijaj):
- bugfixy, refaktory, poprawki UI, logi, komentarze w kodzie

Format wpisu:
```
## YYYY-MM-DD — <krótki opis zmiany (= wiadomość commita)>

### schema.prisma
- dodano pole `nazwaPolaTyp` w modelu `NazwaModelu` — krótki opis po co

### architektura / API
- zmieniono / dodano / usunięto — co i dlaczego
```

Zasady:
- Jeden wpis = jeden commit. Dopisuj PRZED wykonaniem commita.
- Dopisuj ZAWSZE na górze pliku (najnowszy wpis pierwszy).
- Używaj prawdziwych nazw pól i modeli z kodu (camelCase jak w Prisma).
