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
- zmiana układu / wyglądu eksportu PDF (nowe zmienne, nowe tabele, zmiana struktury HTML/CSS)

Co NIE jest zmianą strukturalną (pomijaj):
- bugfixy, refaktory, drobne poprawki UI (kolor, padding, font), logi, komentarze w kodzie

Format wpisu:
```
## YYYY-MM-DD — <krótki opis zmiany (= wiadomość commita)>

### schema.prisma
- dodano pole `nazwaPolaTyp` w modelu `NazwaModelu` — krótki opis po co

### architektura / API
- zmieniono / dodano / usunięto — co i dlaczego

### słownik
- dodano `SKRÓT` — krótki opis co robi, funkcja, plik, wiersz
- zmieniono `SKRÓT` — co się zmieniło
- usunięto `SKRÓT`

### wytyczne
- `NazwaModelu.pole` — zasada której należy przestrzegać przy pracy z tym polem/modułem
```

Sekcję `### słownik` dopisuj gdy modyfikujesz `SŁOWNIK.md` — dodajesz, zmieniasz lub usuwasz skrót. Pomijaj gdy SŁOWNIK.md nie był dotknięty.

Zasady:
- Jeden wpis = jeden commit. Dopisuj PRZED wykonaniem commita.
- Dopisuj ZAWSZE na górze pliku (najnowszy wpis pierwszy).
- Używaj prawdziwych nazw pól i modeli z kodu (camelCase jak w Prisma).
- Sekcję `### wytyczne` dopisuj gdy podczas sesji ustalono nową zasadę. Jeśli sesja nie przyniosła nowych zasad, pomijaj tę sekcję.

Przy każdej zmianie i wytycznej poprzedzaj nazwę zmiennej tagiem typu — to samo co w Obsidianie:

| Tag | Kiedy używać |
|-----|-------------|
| `[model]` | model Prisma — ProcessNode, WbsNode |
| `[pole]` | pole modelu — WbsNode.depth, MaterialRequirement.status |
| `[relacja]` | relacja między modelami |
| `[enum]` | enum TypeScript — NodeType, budgetType |
| `[endpoint]` | endpoint REST — GET /wbs-nodes/unified/:nodeId |
| `[serwis]` | klasa NestJS Service |
| `[guard]` | guard / dekorator autoryzacji |
| `[funkcja]` | funkcja lub metoda — buildDepths() |
| `[typ]` | interfejs / DTO TypeScript |
| `[json]` | struktura JSON w polu tekstowym |
| `[strona]` | komponent strony React |
| `[sekcja]` | komponent sekcji / panelu — UnifiedWbsPanel |
| `[zakladka]` | komponent zakładki — OffersTab |
| `[kolumna]` | kolumna AG Grid |
| `[wiersz]` | typ wiersza — _isProjectItem, _isRequirementLeaf |
| `[hook]` | React hook |
| `[stan]` | zmienna stanu React — expandedIds |
| `[env]` | zmienna środowiskowa — DATABASE_URL |
| `[skrypt]` | skrypt shell — deploy.sh |
| `[kontener]` | serwis Docker |

Przykład wpisu CHANGELOG z tagami:
```
### wytyczne
- [pole] `WbsNode.depth` — nie jest kolumną w bazie, obliczany w runtime przez [funkcja] `buildDepths()`
- [wiersz] `_isProjectItem` — blokuje edycję pól type i requirementsQty na depth=0
- [skrypt] `deploy.sh` — uruchamiać tylko po potwierdzeniu użytkownika
```
