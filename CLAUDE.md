Raportując zmiany skracaj odpowiedzi do jednego zdania. Nie pokazuj plików edytowanych w panelu środkowym (nie używaj PathsToReview w notify_user).
Wszystkie skrypty testowe i logi umieszczaj w katalogu /test w korzeniu projektu.
Przed startem serwerów dev zawsze ubijaj procesy na portach, które będą używane (3001, 5173 itp.).
Gdy użytkownik napisze "deploy" (lub równoważne np. "deployuj"), traktuj to jako wyraźne potwierdzenie i od razu uruchamiaj deploy produkcyjny — NIE pytaj ponownie "Czy deployować na produkcję?". Wymaganie potwierdzenia obowiązuje tylko gdy deploy wynika z kontekstu, nie z bezpośredniej komendy użytkownika.
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

## Tagi zmiennych — taksonomia `ui- / back- / schema-`

Przy każdej zmianie i wytycznej poprzedzaj nazwę zmiennej tagiem typu — to samo co w Obsidianie i w `SLOWNIK.md` sekcja `## TAGI ZMIENNYCH`.

Trzy prefiksy:
- `ui-` — frontend (komponenty, stan, elementy UI)
- `back-` — backend (NestJS, endpointy, serwisy, infra serwera)
- `schema-` — `schema.prisma` (modele, pola, relacje, enumy DB)

| Tag | Kiedy używać |
|-----|--------------|
| `ui-input` | pole tekstowe / liczba / data / textarea |
| `ui-przycisk` | button, link-button |
| `ui-tabela` | tabela danych, AG Grid, lista wierszy |
| `ui-widok` | cała strona / route — LoginPage, DashboardPage |
| `ui-sekcja` | logiczny blok w widoku — UnifiedWbsPanel |
| `ui-panel` | boczny / kontekstowy panel — DynamicSidebar, NodeInfoTab |
| `ui-zakladka` | tab w komponencie zakładkowym — OffersTab, RequirementsTab |
| `ui-modal` | okno dialogowe, popup |
| `ui-formularz` | grupa inputów z submitem |
| `ui-dropdown` | select, autocomplete, menu rozwijane |
| `ui-karta` | card UI — karta produktu, karta węzła |
| `ui-lista` | `<ul>`/`<ol>` bez tabeli — breadcrumb |
| `ui-ikona` | klikalna ikona |
| `ui-kolumna` | kolumna AG Grid (colDef) |
| `ui-wiersz` | typ wiersza — _isProjectItem, _isRequirementLeaf |
| `ui-stan` | useState / useRef — expandedIds |
| `ui-propsy` | props komponentu React |
| `ui-hook` | custom React hook — useWbsData |
| `ui-stala` | const modułowa frontend — PDF_BASE_CSS |
| `ui-funkcja` | helper / handler frontend — buildWbsHtmlTable |
| `ui-typ` | interface / type TS (frontend) |
| `back-endpoint` | route NestJS — GET /wbs-nodes/unified/:nodeId |
| `back-controller` | klasa kontrolera NestJS — WbsNodesController |
| `back-modul` | klasa modułu NestJS — WbsNodesModule |
| `back-serwis` | klasa serwisowa NestJS |
| `back-guard` | guard / dekorator autoryzacji |
| `back-dto` | DTO request/response |
| `back-typ` | interface / type TS (backend) |
| `back-funkcja` | helper / util backend — buildDepths() |
| `back-stala` | const modułowa backend |
| `back-enum` | enum TypeScript (backend, np. NodeType) |
| `back-env` | zmienna środowiskowa — DATABASE_URL |
| `back-skrypt` | skrypt shell — deploy.sh |
| `back-kontener` | serwis Docker |
| `schema-model` | model Prisma — ProcessNode, WbsNode |
| `schema-pole` | pole modelu — WbsNode.totalPrice |
| `schema-relacja` | relacja między modelami |
| `schema-enum` | enum w schema.prisma |
| `schema-json` | struktura JSON w polu tekstowym DB |

### Rozbudowa taksonomii

Jeśli napotkasz zmienną, której nie pasuje żaden istniejący tag:
1. Zaproponuj nowy tag w formacie `ui-<nazwa>` / `back-<nazwa>` / `schema-<nazwa>` (małymi literami, po polsku, jedno słowo)
2. W tym samym commicie dopisz tag do tej tabeli ORAZ do sekcji `## TAGI ZMIENNYCH` w `SLOWNIK.md` z krótkim opisem
3. Użyj nowego taga we wpisie zmiennej

Przykład wpisu CHANGELOG z tagami:
```
### wytyczne
- `schema-pole` `WbsNode.depth` — nie jest kolumną w bazie, obliczany w runtime przez `back-funkcja` `buildDepths()`
- `ui-wiersz` `_isProjectItem` — blokuje edycję pól type i requirementsQty na depth=0
- `back-skrypt` `deploy.sh` — uruchamiać tylko po potwierdzeniu użytkownika
```

## SLOWNIK.md — indeks zmiennych z anchorami

Przed KAŻDYM commitem aktualizuj sekcję `## ZMIENNE — indeks` w `SLOWNIK.md`:
- dla każdej NOWEJ zmiennej (funkcja, stan, pole modelu, komponent, endpoint, input, przycisk, tabela itd.) dodaj wiersz: `| <tag> | <nazwa> | <ścieżka pliku> | @anchor <kebab-case-name> |`
- dla każdej PRZEMIANOWANEJ zmiennej zaktualizuj istniejący wiersz (nazwa + anchor)
- dla każdej USUNIĘTEJ zmiennej usuń wiersz

W kodzie nad każdą zaindeksowaną zmienną dodaj komentarz `// @anchor <nazwa>` (w `schema.prisma` użyj `///` jeśli ma to być doc-komentarz, inaczej `//`).

**Anchor** = stabilna kotwica niezależna od numeru wiersza. Format: kebab-case, unikalny globalnie w projekcie, wyprowadzony z nazwy zmiennej (camelCase → kebab-case, `Model.pole` → `model-pole`).

Przykład w kodzie:
```javascript
// @anchor handle-export-pdf
const handleExportPDF = (type) => { ... }
```

```prisma
/// @anchor wbs-node-total-price
totalPrice Float @default(0)
```

Walidację wymusza pre-commit hook (`.githooks/pre-commit`). Skanuje staged pliki `.js/.jsx/.ts/.tsx/.prisma` na obecność nowych `@anchor` i blokuje commit jeśli któryś nie jest w `SLOWNIK.md`. Instalacja jednorazowo po klonie: `git config core.hooksPath .githooks` (instrukcja w `.githooks/README.md`).

### Szczegóły workflow — pułapki i zasady niejawne

**1. Hook nie pilnuje sprzątania po usunięciu zmiennej.**
Gdy usuwasz zmienną z kodu (wraz z jej komentarzem `// @anchor xxx`), musisz RĘCZNIE usunąć odpowiadający wiersz z `SLOWNIK.md` sekcja `## ZMIENNE — indeks`. Hook patrzy tylko na nowo DODANE anchory (znak `+` w diff), więc usunięcie nie wywołuje walidacji. Martwe wpisy w SLOWNIK pęcznieją indeks i prowadzą do błędnych wskaźników do nieistniejącego kodu.

**2. Rename = usunięcie starego anchora + dodanie nowego.**
Renaming zmiennej (np. `handleExportPDF` → `handleExportPdfV2`) wymaga:
- usunięcia starego `// @anchor handle-export-pdf` z kodu
- dodania nowego `// @anchor handle-export-pdf-v2`
- aktualizacji wiersza w SLOWNIK.md (zmiana w istniejącym wierszu, NIE dodawanie nowego obok starego)
- sprawdzenia wszystkich miejsc w kodzie używających starego anchora w komentarzach/dokumentacji

**3. Refactor logiki BEZ zmiany nazwy — nie ruszaj SLOWNIK ani anchora.**
Zmiana wnętrza funkcji, dodanie parametru, zmiana implementacji — wszystko to z zachowaniem nazwy zmiennej — NIE wymaga aktualizacji SLOWNIK.md ani anchora. Hook nie odpali walidacji bo w diff nie ma nowo dodanej linii `@anchor`. Nie marnuj cyklu na zbędną edycję SLOWNIK przy zwykłym refaktorze.

**4. Sync z Obsidianem `Ignite — zmienne projektu.md` jest poza repo.**
Mirror indeksu zmiennych żyje w `G:\Mój dysk\obsidian\vibe_codes\Ignite — zmienne projektu.md` — POZA repo Ignite. Hook tego pliku nie widzi i nie pilnuje. Synchronizuj okresowo (po skończeniu większego modułu lub raz na tydzień) — Claude może to zrobić na życzenie ("zsynchronizuj Obsidian zmienne").

**5. Przy proponowaniu nowego taga — najpierw zapytaj użytkownika.**
Jeśli zmienna nie pasuje do żadnego istniejącego taga z taksonomii `ui-/back-/schema-`, ZANIM dopiszesz nowy tag do tabel — spytaj użytkownika: "Czy pasuje nowy tag `prefiks-nazwa`, czy wolisz użyć istniejącego `X` z innym znaczeniem?". Decyzja o rozszerzeniu taksonomii jest trwała i propaguje się do CLAUDE.md, SLOWNIK.md i Obsidiana — niech user ją świadomie podejmie.
