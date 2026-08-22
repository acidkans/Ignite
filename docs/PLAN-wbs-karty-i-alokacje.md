# WBS ↔ karty produktowe — stan i co dalej

Dokument przekazania. Stan na **2026-08-22**, produkcja na `v2026.08.22.878`.
Punkt wyjścia: ilość wpisana w kolumnie Ilość w WBS wracała po chwili powiększona o cudzą
alokację (450 → 451). Rozwiązanie tego odsłoniło szerszy problem: kopiowanie liścia niosło
wskaźnik na kartę produktową źródła, więc dwa węzły edytowały jedną kartę.

---

## 1. Zasady bezwzględne — przeczytaj zanim dotkniesz bazy

### Wersja projektu: `isActive`, NIGDY `createdAt DESC`

Każdy projekt trzyma **kilka wersji WBS w tych samych tabelach**, rozróżnianych kolumną
`versionId`. Aplikacja pokazuje wersję z flagą `ProjectVersion.isActive`. Wybór „najnowsza po
`createdAt`" jest BŁĘDNY — w tej sesji kosztował 66 węzłów zmienionych w wersjach, których
użytkownik nie ogląda.

Kontrprzykłady z produkcji:

| projekt | `isActive` | najnowsza po dacie |
|---|---|---|
| RPWIK-Tychy | `pierwszy aktualny` | `trzeci testowy` (o 26 s późniejsza) |
| WZE Zielonki | `pierwsza` | `trzecia versja szafy ZPAS` |

Poprawny filtr:

```sql
AND w."versionId" = (SELECT id FROM project_versions pv
                     WHERE pv."nodeId" = w."nodeId" AND pv."isActive" LIMIT 1)
```

5 projektów ma więcej niż jedną wersję, 34 mają oznaczoną wersję aktywną. **Nigdy nie łącz kart
z jednej wersji z węzłami z innej** — relacja `wbsNodeId` jest `@unique`, więc takie podpięcie
zabiera kartę wersji, w której użytkownik pracuje.

### Zapis do produkcji

1. **Najpierw zrzut**: `ssh gigatel "bash /srv/apps/erp/backup-db.sh"`. Transakcja i suchy
   przebieg nie zastępują punktu przywracania.
2. **Suchy przebieg z `ROLLBACK`**, plan pokazany użytkownikowi, zapis dopiero po jego „tak".
   Wzorzec: `test/tagi-req-migracja.sql` (przełącznik `-v zapis=true`).
3. **Ilości są święte.** Użytkownik ustawił je ręcznie na docelowe i nie życzy sobie zmian.
   Dotyczy to też `MaterialRequirement.quantity` i tworzenia pozycji z ilością — pytaj.
4. **Wersje archiwalne zostawiaj w spokoju.** To zamrożony zapis.

### Nazwy pokazuj dosłownie

W raportach cytuj nazwy z bazy bez upiększania i bez uzupełniania uciętych końcówek. W tej sesji
`jumper 1m 3/8"  Nex-10.f <-> N ` (ze spacją na końcu) zostało pokazane jako
`jumper 1m 3/8" Nex-10.f ↔ Nex-10.m` — użytkownik szukał pozycji, która nie istnieje. Nazwy w tym
projekcie bywają ucięte, z podwójnymi spacjami i wariantami; opakowuj je w `'[' || name || ']'`.

---

## 2. Co jest zrobione i wdrożone

| commit | co |
|---|---|
| `9c4241e` | **v877** — ilość na węźle nie dostaje już sumy alokacji |
| `2a95961` | dzienny backup bazy, procedura odtworzenia, kopia lokalna |
| `73492b8` | **v878** — wklejony liść dostaje własną kartę produktową |

### Naprawione mechanizmy

- **`nodeShareFromDto`** (`material-requirements.service.ts`) — na `WbsNode.quantity` nigdy nie
  trafia `dto.quantity` wprost. Gdy PATCH niesie mapę alokacji, węzeł dostaje swój udział z mapy.
- **Wybór gałęzi „ile alokacji"** idzie po `req.materialId`, nie po id wymagania.
  `WbsNodeMaterial.materialId` wskazuje `materials.id` (migracja `ce75dbe`) — zapytanie po id
  wymagania zwracało zawsze 0 wierszy.
- **`syncMaterialsFromWbsNode`** (`wbs-nodes.service.ts`) używa `updateMany({ where: { materialId } })`.
- **`deepCloneNodeWithMappings`** odcina tagi `req:` i `auto-requirement` przy klonowaniu węzła.
- **`clone-for-wbs`** dopisuje węzłowi tag jego własnej karty (`retagWbsNodeToRequirement`) i
  kopiuje propozycje produktowe (`cloneProposalsForRequirement`).
- **Martwe wywołania `syncAllocationsToRelational` zdjęte** — podawały id wymagania do kolumny
  trzymającej `materials.id`, `create` leciał na klucz obcy pod `.catch(() => {})`.

### Migracje danych wykonane na produkcji

| kiedy | co | zakres |
|---|---|---|
| 12:0x | cofnięcie napompowanych ilości | 6 węzłów AMP_5G |
| 13:00 | przepięcie tagów `req:` na własne karty | 209 węzłów |
| 13:14 | podpięcie kart niczyich + utworzenie własnych | 21 + 15 |

Z tego **66 zmian tagów, 2 nowe karty i 1 podpięcie trafiły w nieaktywne wersje RPWIK-Tychy
i WZE Zielonki**. Użytkownik zdecydował: to tematy archiwalne, zostawić. Ich wersje aktywne nie
zostały przetworzone i tak zostaje.

### Testy

```bash
cd apps/backend && npx jest --rootDir ../.. --testRegex "test/.*\.spec\.ts$"
```

`test/node-share-from-dto.spec.ts` (7) i `test/clone-for-wbs.spec.ts` (9) — instancjonują prawdziwy
serwis z atrapą prisma, więc testują kod, nie jego kopię.

---

## 3. Otwarte — AMP_5G (priorytet)

`nodeId = d1bb2395-2fd0-4e9e-9760-f722e780224c`, jedna wersja `pierwszy`, aktywna.
Stan: **zero kart dzielonych przez dwa węzły**. Własną kartę ma 101 węzłów — 94 typu
`material`, 4 `work`, 3 `equipment`.

### 3.1 Cztery pozycje niewidoczne w Materiałach

Węzły z ilością w WBS, bez karty i bez obecności w mapie alokacji jakiejkolwiek karty:

| węzeł | ilość |
|---|---|
| `Trasy kablowe BAKS KSC200H120/3` | 40 metry |
| `cybant` | 120 sztuki |
| `rura rhdp 25` | 60 sztuki |
| `zapinki do cybantów` | 120 sztuki |

Założenie karty tworzy wiersz z ilością — **wymaga zgody użytkownika**.

### 3.2 Pięć kart z ilością rozjechaną z gałęziami

| pozycja | karta | suma gałęzi |
|---|---|---|
| `cybant` | 351 | 675 (325 + 350) |
| `łączniki tras kablowych  LKUSPH120` | 41 | 80 (40 + 40) |
| `drabinka kablowa` ×3 | 3 | 1 (każdy węzeł ma 1) |

Przy pierwszych dwóch to resztka starej sumy `1 + …`. Przy drabinkach odwrotnie: karta trzyma 3
z pozycji źródłowej, węzły mają po 1. Cztery inne karty zbiorcze są poprawne (`zapinki` 675,
`konstrukcja pod RRH` 9, `mufa łącząca rhdp` 38, `mufa światłowodowa` 2).

Najprostsza droga bez skryptu: wpisać ilość ponownie na wierszu WBS — kaskada
`syncMaterialsFromWbsNode` przepisze ją na kartę.

---

## 4. Otwarte — reszta

**Zapis uboczny na `Material.priceNetto`.** PATCH wymagania stempluje przy okazji cenę katalogową
produktu dla całej firmy, którą czyta QuickQuote przy wycenie z magazynu
(`quick-quotes.service.ts:332`). Frontend karty jej nie czyta. Do zdjęcia — katalog ma własną
drogę zapisu przez moduł Materiały. Skutek uboczny: QuickQuote zacznie pomijać materiały bez
świadomie ustawionej ceny.

**Auto-propagacja `technicalSpec`.** `update()` wpisuje spec do wszystkich kart o tej samej nazwie
w projekcie, które mają puste pole. Jedna edycja dotyka cudzych wierszy — wbrew zasadzie
niezależności pozycji. Decyzja użytkownika: zostawić czy zdjąć.

**Węzeł typu `group` z martwym tagiem** — `rozprowadzenie sieci LAN`. Gałąź grupująca nie jest
pozycją materiałową, więc karty nie dostała; tag można zdjąć.

**CMC- Serwerownia, `osłona gumowa krawędzi korytek`.** Węzeł ma 30, prawda to 20, ale siedzi
w **zaakceptowanym baseline**. Zmiana rozjeżdża bazę z ofertą, która mogła pójść do klienta.
Czeka na decyzję.

**Wymagania bez nazwy: 592 w 19 projektach.** Najwięcej WZE Zielonki (230), dalej Hala Sportowa
Zielona Góra (43), CMC- Serwerownia (27), Stadion Wiśnicz (20). Pozycja bez nazwy jest bezużyteczna
w Materiałach i eksportach. WZE jest archiwalne, ale CMC i Stadion nie — tam warto zajrzeć.

**Backup — trzy dodatki.** Zrzuty leżą na tym samym dysku co baza (chronią przed złym zapisem,
nie przed utratą serwera); kopia lokalna `pull-backup.ps1` odpalana ręcznie, można wpiąć
w Harmonogram zadań; nieobjęte `kpricer-db` i `task-tracker-db`; przełączenie `--zapis`
w `restore-db.sh` nie było ćwiczone na żywej bazie (sam mechanizm rename sprawdzony na bazach
roboczych).

---

## 5. Model danych — czego nie widać z kodu

### Dwa łącza węzeł ↔ karta, nie jedno

- `MaterialRequirement.wbsNodeId` — relacja **1:1, `@unique`**, właściciel karty.
- Tag `req:<id>` w `WbsNode.tags` — **wskaźnik**, używany m.in. przez ProductCard.

Te dwa mogą się rozjechać i to była istota problemu. Tag jest wskaźnikiem, nie wartością, więc
kopiowanie węzła przez spread przenosi go tak samo jak wartość — każde nowe pole tego typu trzeba
świadomie odciąć albo przemapować. Wzorzec przemapowania: `versioning.service.ts` krok 9b.

### Karta może obejmować kilka gałęzi

`wbsNodeAllocations` to JSON `{nodeId: ilość}`. Karta zbiorcza ma ilość równą **sumie gałęzi**,
a każdy węzeł trzyma swój udział. Właścicielem przez `wbsNodeId` jest tylko jeden z nich —
pozostałe to gałęzie wtórne i brak karty NIE jest u nich błędem.

Pole jest oznaczone `@deprecated` (miało je zastąpić `WbsNodeMaterial`), ale **jest żywe i czytane**.
Z 325 wpisów w mapach wielowęzłowych 264 zgadzało się z ilością swojego węzła — to nie są śmieci.

### Trzy różne ceny

| pole | właściciel | znaczenie |
|---|---|---|
| `budgetedPriceNetto` | `MaterialRequirement` | cena tej pozycji — źródło prawdy przy odczycie |
| `priceNetto` | `ProductProposal` | cena jednej oferty |
| `priceNetto` | `Material` | cena katalogowa produktu (czyta QuickQuote) |

Odczyt karty: `r.budgetedPriceNetto ?? p.priceNetto`.

### `WbsNodeMaterial.materialId` to `materials.id`

Nie id wymagania. Po migracji `ce75dbe` dwa wywołania w `material-requirements.service.ts` nadal
podawały id wymagania i cicho padały pod `.catch(() => {})`. **Nie owijaj zapisów w puste catche** —
to one utrzymały niedokończoną migrację przy życiu i przekierowały zapis ilości w złą gałąź.

---

## 6. Narzędzia

| plik | do czego |
|---|---|
| `backup-db.sh` | dzienny zrzut, cron `deploy` 02:30 UTC, 30 dziennych + 12 miesięcznych |
| `restore-db.sh` | odtworzenie ze zrzutu; domyślnie PRÓBA, przełącza `--zapis` |
| `pull-backup.ps1` | kopia zrzutów na komputer lokalny, weryfikacja SHA256 |
| `test/tagi-req-migracja.sql` | wzorzec migracji z przełącznikiem `-v zapis=true` |
| `test/rozjazdy-alokacji.sql` | analiza rozjazdów map alokacji |
| `DEPLOY.md` sekcje ④ ⑤ | runbook kopii i odtworzenia |

Skrypty `.ps1` pisz **wyłącznie w ASCII** — PowerShell 5.1 czyta plik bez BOM jako Windows-1252,
więc `—` rozpada się na `â€"`, gdzie ostatni bajt to typograficzny cudzysłów domykający string
w połowie linii. Skrypt psuje się cicho, w miejscu niezwiązanym z błędem.

---

## 7. Błędy tej sesji, których nie powtarzaj

1. **Wersja po `createdAt` zamiast `isActive`** — 66 węzłów zmienionych w wersjach testowych.
   Objaw był taki, że użytkownik nie widział u siebie pozycji, o których raportowałem.
2. **Nazwa uzupełniona z pamięci** zamiast zacytowana z bazy — raport wskazywał pozycję,
   która nie istnieje.
3. **Zapis do produkcji bez świeżego zrzutu** przy pierwszej migracji ilości. Na serwerze nie było
   wtedy żadnego backupu automatycznego; najnowszy pochodził sprzed dwóch miesięcy.
4. **Liczenie tagów zamiast węzłów** — plan migracji pomijał węzły mające obok poprawnego tagu
   także martwy, bo `DISTINCT ON` wybierał tag przed złączeniem.
