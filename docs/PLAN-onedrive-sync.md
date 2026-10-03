# Plan — OneDrive jako źródło plików zamówienia + synchronizacja z aplikacją

Data: 2026-10-03

## Cel

Użytkownik wrzuca pliki do folderu zamówienia na OneDrive (OD). Aplikacja synchronizuje folder:
pobiera kopię na serwer, przypisuje typ dokumentu **po katalogu** i indeksuje dla AI.
Analiza AI czyta tylko z serwera (baza + Qdrant), nigdy z OD w trakcie analizy.

## Ustalenia

- Numeracja katalogów `01/02/03` zostaje.
- Stare katalogi `pliki_finansowe/` i `dokumentacja_projektowa/` **zostają bez zmian** — bez migracji,
  synchronizacja ich nie dotyka, zakładka „Pliki OneDrive” pokazuje je dalej jako „archiwum”.
- Stare pliki w płaskim `uploads/` zostają tam, gdzie są (`storagePath` = sama nazwa pliku działa dalej).
- Założenia do potwierdzenia (domyślne, jeśli brak innej decyzji):
  - `03 Realizacja/Zdjęcia…` — synchronizujemy OD → serwer (podgląd), aplikacja **nie wysyła** filmów 90 MB na OD.
  - `Zamówienia i faktury` — w aplikacji nie ma dziś żadnej obsługi zamówień ani faktur. Katalog zakładamy
    tylko jako miejsce na OD; sync go **pomija** (bez pobierania, bez indeksu, bez widoku w aplikacji).
    Obsługa — osobny temat w przyszłości.

## 1. Struktura katalogów

```
<Nazwa zamówienia>/
├── 01 Dokumenty finansowe/
│   ├── Oferty dostawców/
│   ├── Oferta finansowa/
│   ├── Analiza budżetu/
│   ├── Zamówienia i faktury/
│   ├── Protokoły odbioru/<gałąź>/
│   └── Analizy AI/
├── 02 Dokumentacja projektowa/
│   ├── Dokumentacja klienta/
│   ├── Karty katalogowe/
│   ├── Schematy i rysunki/
│   ├── Zestawienia materiałów/
│   ├── Harmonogram/
│   └── Raporty projektu/
└── 03 Realizacja/
    └── Zdjęcia i dokumentacja z budowy/
```

Jedno źródło prawdy: stała `back-stala` `ORDER_FOLDERS` w `apps/backend/src/onedrive/order-folders.ts`
(klucz → ścieżka, kategoria dokumentu, przetwarzanie). Front dostaje ją z `GET /onedrive/folders`.

| Klucz | Ścieżka | `documentCategory` | Przetwarzanie | Zakładka w aplikacji |
|---|---|---|---|---|
| `supplierOffers` | 01/Oferty dostawców | `financial` | indeks AI + parser ofert (ręczne zatwierdzenie jak dziś) | Pliki finansowe |
| `clientOffer` | 01/Oferta finansowa | `clientOffer` | indeks AI | Pliki finansowe |
| `budget` | 01/Analiza budżetu | `budget` | bez indeksu (XLSX z aplikacji) | Pliki finansowe |
| `invoices` | 01/Zamówienia i faktury | — | **pomijany przez sync** (tylko katalog na OD, brak obsługi w aplikacji) | — |
| `protocols` | 01/Protokoły odbioru | `protocol` | bez indeksu | Pliki finansowe |
| `aiReports` | 01/Analizy AI | `aiReport` | **wykluczony z indeksu** (AI nie czyta własnych raportów) | Pliki finansowe |
| `clientDocs` | 02/Dokumentacja klienta | `standard` | indeks AI (źródło wymagań) | Pliki |
| `datasheets` | 02/Karty katalogowe | `datasheet` | indeks AI | Pliki |
| `schematics` | 02/Schematy i rysunki | `schematic` | indeks AI (PDF) | Pliki |
| `materials` | 02/Zestawienia materiałów | `materials` | bez indeksu | Pliki |
| `schedule` | 02/Harmonogram | `schedule` | bez indeksu | Pliki |
| `reports` | 02/Raporty projektu | `report` | bez indeksu | Pliki |
| `sitePhotos` | 03/Zdjęcia i dokumentacja z budowy | `sitePhoto` | bez indeksu, miniatury z Graph | Pliki |

Pliki leżące luzem w katalogu zamówienia lub w `01`/`02` (poza podkatalogami) → `standard`, oznaczone
w UI „bez kategorii — przenieś do podkatalogu”.

## 2. Serwer — katalogi per zamówienie

- Nowy root: `UPLOADS_ROOT` (env, domyślnie `/usr/src/app/uploads`), na produkcji wolumen
  `../data/erp/uploads:/usr/src/app/uploads` w `docker-compose.yml` — pliki wychodzą z drzewa repo
  i są backupowane razem z Postgres/Qdrant.
- Nowe pliki: `uploads/<nodeId>/<ścieżka katalogu z ORDER_FOLDERS>/<driveItemId lub uuid>.<ext>`.
  `nodeId`, nie nazwa — rename zamówienia nic nie psuje.
- `storagePath` przechowuje ścieżkę **względną** (`<nodeId>/01 Dokumenty finansowe/...`).
  Stare rekordy z samą nazwą pliku działają bez zmian (`path.join(UPLOADS_ROOT, storagePath)`).
- Jedna funkcja `back-funkcja` `resolveUploadPath(storagePath)` w `apps/backend/src/common/uploads.ts`
  zamiast 10 kopii `path.join(process.cwd(), 'uploads', …)` i stałej `UPLOADS_DIR` w material-requirements.
  Poprawić `documents.service.ts:89` (`path.basename(previousStorage)` zgubiłby podkatalog).

## 3. Schemat bazy

```prisma
model DriveFile {
  id              String   @id @default(uuid())
  nodeId          String                 // zamówienie
  driveId         String
  driveItemId     String   @unique
  folderKey       String?                // klucz z ORDER_FOLDERS; null = poza strukturą
  relativePath    String                 // ścieżka w folderze zamówienia (do UI)
  name            String
  mimeType        String?
  size            Int?
  cTag            String?                // zmiana treści → ponowne przetworzenie
  eTag            String?
  lastModified    DateTime?
  webUrl          String?
  documentId      String?  @unique       // ProcessNode(type='document') po imporcie
  status          String   @default("pending") // pending | downloaded | indexed | skipped | error | deleted
  error           String?
  ignored         Boolean  @default(false)     // usunięty w aplikacji — sync go nie odtwarza
  source          String   @default("onedrive") // onedrive | app (eksport/upload z aplikacji)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  node            ProcessNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  @@index([nodeId, folderKey])
}
```

W `ProcessNode` (zamówienie):
- `oneDriveDeltaLink String?` — token delta query,
- `oneDriveSyncedAt DateTime?`, `oneDriveSyncError String?`,
- `oneDriveFolderIds String?` (`schema-json`: `{ folderKey: driveItemId }`) — id podkatalogów nowej struktury.

Istniejące `oneDriveFinanseId` / `oneDriveDocumentacjaId` zostają (archiwum, eksporty starego typu).

Migracja: `prisma migrate dev` + ręczne psql na dev (wg [[project_prisma_migrations_flow]]).
`DriveFile` nie jest wersjonowany (bez `versionId`) → nie dotyczy `cloneVersionData`.

## 4. Backend

### 4.1 Zakładanie struktury
- `back-funkcja` `ensureOrderFolders(nodeId)` — tworzy brakujące podkatalogi z `ORDER_FOLDERS`
  (`ensureSubfolder`, który już istnieje), zapisuje id do `oneDriveFolderIds`, weryfikuje martwe id.
- Wołane w `setNodeFolder` (nowe powiązania) oraz przyciskiem „Utwórz strukturę katalogów”
  dla zamówień już powiązanych. Stare `pliki_finansowe`/`dokumentacja_projektowa` nie są tworzone dla nowych.

### 4.2 Synchronizacja (`back-serwis` `OneDriveSyncService`, nowy plik `onedrive-sync.service.ts`)
1. `GET /drives/{driveId}/items/{folderId}/delta` (pierwszy raz bez tokenu, potem `oneDriveDeltaLink`),
   `$select=id,name,file,folder,parentReference,cTag,eTag,size,lastModifiedDateTime,webUrl,deleted`.
2. Dla każdego pliku: wyliczenie `folderKey` z `parentReference.path` względem folderu zamówienia;
   pomijane: stare `pliki_finansowe/`, `dokumentacja_projektowa/`.
3. Upsert `DriveFile`. Nowy lub zmieniony `cTag` → `status = pending`.
4. `deleted` → `status = deleted`, dokument usuwany z aplikacji i indeksu (jak ręczne usunięcie), lokalna kopia zostaje 30 dni.
5. Zapis nowego `deltaLink`, `oneDriveSyncedAt`.

Kolejka przetwarzania: tabela `DriveFile.status` + `@Interval` co 30 s, max 2 pliki równolegle
(bez nowej zależności — BullMQ dopiero gdy będzie potrzeba):
- pobranie strumieniowe przez `@microsoft.graph.downloadUrl` → `uploads/<nodeId>/<folder>/<driveItemId>.<ext>`
  (bez buforowania w RAM — limit kontenera 1 GB),
- utworzenie/aktualizacja `ProcessNode(type='document')` z `documentCategory` z mapy — wydzielona część
  `processDocument` (`back-funkcja` `upsertDocumentFromFile`) wspólna dla uploadu z UI i sync,
- indeksowanie Qdrant tylko dla folderów z flagą `index: true`,
- błąd → `status = error`, `error`, ponowienie przy następnym sync (max 3 próby).

Wyzwalacze:
- `@Cron` co 15 min dla zamówień z `oneDriveFolderId` i aktywnym statusem,
- przycisk „Synchronizuj teraz” (`POST /onedrive/sync/:nodeId`),
- etap 4: webhook Graph (`/subscriptions`) → natychmiastowy sync.

Token: `getSharedToken()` (konto usługowe) — sync działa bez zalogowanego użytkownika.

Zamówienia archiwalne (pod obszarem „Archiwum”) i rozliczone (`orderStage = ROZLICZONE`) nie są synchronizowane — ani ręcznie, ani automatycznie.

### 4.3 Endpointy (`back-endpoint`)
- `POST /onedrive/sync/:nodeId` — uruchamia sync, zwraca liczniki (nowe/zmienione/usunięte/błędy).
- `GET /onedrive/sync/:nodeId/status` — stan sync + lista `DriveFile` ze statusami.
- `POST /onedrive/structure/:nodeId` — `ensureOrderFolders`.
- `GET /onedrive/folders` — `ORDER_FOLDERS` dla frontu.
- `POST /onedrive/upload` — zmiana sygnatury: `folderKey` (+ opcjonalny `subfolder`) zamiast `category`.
  Stary `category` akceptowany przejściowo (mapowany na stare katalogi) do wydania frontu.

### 4.4 Zapis z aplikacji → OD (eksporty i uploady)
- Eksport: `uploadFile(nodeId, folderKey, …)` → zapis do właściwego podkatalogu, od razu rekord
  `DriveFile(source='app', driveItemId, cTag)` → sync rozpozna plik i nie zaimportuje go drugi raz.
- Upload w zakładkach „Pliki” / „Pliki finansowe”: zapis lokalny + indeks od razu (jak dziś),
  wysyłka na OD w tle do katalogu wynikającego z zakładki. Upload session (`createUploadSession`)
  dla plików > 4 MB.
- Raport „Analiza AI oferty” → dodatkowo do `01/Analizy AI`.
- Usunięcie dokumentu w aplikacji → `DriveFile.ignored = true`; plik na OD **nie jest kasowany**.

### 4.5 Wspólny katalog ofert dostawców (poza zamówieniami)

Katalog wybierany przez użytkownika (admin/manager/logistyk) w Logistyce → zakładka **Oferty** →
„Wybierz katalog OneDrive” (ten sam picker `browseFolders` co przy zamówieniu). Struktura:

```
<wybrany katalog>/
├── <Dostawca>/
│   ├── cennik_2026.pdf              ← oferta ogólna dostawcy
│   └── <Nazwa zamówienia>/
│       └── oferta_123.pdf           ← oferta dostawcy dla konkretnego zamówienia
└── <Dostawca>/ …
```

Ustawienie — `schema-model` `OneDriveSettings` (singleton, jak `SmtpSettings`):
`sharedOffersDriveId`, `sharedOffersFolderId`, `sharedOffersFolderName`, `sharedOffersDeltaLink`,
`sharedOffersSyncedAt`, `sharedOffersSyncError`.

Rozpoznawanie (sync, ta sama delta + kolejka co w 4.2):
- **Poziom 1 = dostawca.** Dopasowanie nazwy katalogu do `Supplier.name` (bez wielkości liter, polskich znaków,
  form prawnych „Sp. z o.o.”, „S.A.”). Trafienie zapamiętane w nowym polu `schema-pole` `Supplier.oneDriveFolderId`
  — rename katalogu nie zrywa powiązania. Brak trafienia → status „nieprzypisany dostawca”, użytkownik
  wybiera dostawcę z listy albo zakłada nowego (raz, potem działa z `oneDriveFolderId`).
- **Poziom 2 = zamówienie.** Dopasowanie nazwy podkatalogu do nazwy zamówienia (`ProcessNode` typu zamówienia)
  lub `oneDriveFolderName`. Trafienie zapamiętane w `DriveFile.orderNodeId`. Brak trafienia → „nieprzypisane
  zamówienie”, wybór ręczny z listy.
- Plik bezpośrednio w katalogu dostawcy → oferta ogólna: dokument w obszarze Logistyka (`documentCategory = 'offer'`,
  zakładka Oferty), `Offer.supplierId` ustawione z góry.
- Plik w podkatalogu zamówienia → oferta zamówienia: dokument przypięty do zamówienia (`documentCategory = 'financial'`,
  zakładka Pliki finansowe), z dostawcą z góry.
- Parser i zatwierdzanie pozycji — ręcznie, jak dziś; dostawca podpowiedziany z katalogu.

Zmiany w `DriveFile`: `nodeId` → węzeł, pod którym ląduje dokument (zamówienie albo obszar Logistyka),
nowe pola `scope` (`order` | `sharedOffers`), `supplierId String?`, `orderNodeId String?`.

Katalog zamówienia `01/Oferty dostawców` **zostaje** — oba źródła zasilają tę samą zakładkę Pliki finansowe.
Duplikat (ten sam plik w obu miejscach) wykrywany po `file.hashes.quickXorHash`: drugi egzemplarz dostaje
`status = skipped` z odnośnikiem do pierwszego, bez ponownego parsowania i indeksu.

Kopie na serwerze: `uploads/_shared/offers/<supplierId>/<driveItemId>.<ext>`.

Endpointy (`back-endpoint`):
- `GET/PUT /onedrive/shared-offers` — odczyt/ustawienie katalogu,
- `POST /onedrive/shared-offers/sync` — sync teraz,
- `GET /onedrive/shared-offers/unmatched` — nieprzypisani dostawcy / zamówienia,
- `POST /onedrive/shared-offers/match` — ręczne przypisanie katalogu do `Supplier` lub zamówienia.

## 5. Frontend

- `ExportChoiceModal`: prop `oneDriveFolderKey` zamiast `oneDriveCategory`; ścieżka w komunikacie z `ORDER_FOLDERS`.
  Mapowanie eksportów:

  | Eksport | `folderKey` |
  |---|---|
  | Analiza projektu / budżet (też „same koszty”) | `budget` |
  | Oferta dla klienta (PDF/XLSX) | `clientOffer` |
  | Materiały XLSX | `materials` |
  | Harmonogram XLSX | `schedule` |
  | PDF sekcji / wszystkie sekcje / Informacje o zamówieniu / Q&A | `reports` |
  | Protokół odbioru | `protocols` + podkatalog gałęzi |
  | Dokument z DocumentViewer / DocumentationSidebar | katalog wg `documentCategory` dokumentu |

- `OneDriveFilesSection`: drzewo nowej struktury + sekcja „Archiwum” (stare katalogi), status synchronizacji,
  przycisk „Synchronizuj teraz”, przy plikach status (`pobrany / zaindeksowany / błąd`).
- Dashboard (wiązanie folderu): po wyborze folderu automatycznie `ensureOrderFolders`;
  dla zamówień powiązanych wcześniej przycisk „Utwórz strukturę katalogów”.
- Zakładki „Pliki” / „Pliki finansowe” pokazują dokumenty z sync tak samo jak wgrane ręcznie
  (+ ikonka OD i link `webUrl`). Parser ofert dla `supplierOffers` uruchamiany ręcznie jak dziś.

## 6. Etapy

| # | Zakres | Efekt |
|---|---|---|
| 1 | `ORDER_FOLDERS`, `ensureOrderFolders`, `resolveUploadPath`, wolumen `uploads`, `GET /onedrive/folders`, `POST /onedrive/structure` | Struktura katalogów zakładana na OD, porządek ścieżek na serwerze |
| 2 | `DriveFile` + pola sync w `ProcessNode`, `OneDriveSyncService` (delta + kolejka), `POST /onedrive/sync`, UI „Synchronizuj teraz” | Pliki wrzucone na OD pojawiają się w aplikacji i w indeksie AI |
| 3 | Eksporty i uploady na `folderKey`, rekord `DriveFile(source='app')`, upload session | Eksporty lądują w nowych katalogach bez duplikatów po sync |
| 4 | Cron 15 min, webhook Graph, sprzątanie kopii usuniętych plików po 30 dniach | Synchronizacja automatyczna |
| 5 | `OneDriveSettings`, `Supplier.oneDriveFolderId`, sync wspólnego katalogu ofert (dostawca → zamówienie), UI wyboru katalogu i przypisań w Logistyce → Oferty, dedup po hash | Oferty dostawców z jednego wspólnego katalogu trafiają do Logistyki albo do zamówienia |

Każdy etap = osobny commit, wpis w `CHANGELOG.md`, nowe anchory w `SLOWNIK.md`, bump wersji w `LoginPage.jsx`.

## 7. Ryzyka

- **Limity Graph (429)** — delta zamiast listowania, respektowanie `Retry-After`, max 2 równoległe pobrania.
- **Token konta usługowego** — wygaśnięcie refresh tokenu zatrzymuje sync; komunikat w UI + `oneDriveSyncError`.
- **Webhook wymaga publicznego HTTPS** — `erp.gigatel.org` za Cloudflare; subskrypcje odnawiać co ≤ 3 dni (dlatego dopiero etap 4, cron jako zapas).
- **Pliki wrzucane w trakcie kopiowania** — plik z `size = 0` lub bez `file.hashes` pomijany do następnego sync.
- **Duże zdjęcia/filmy z budowy** — bez indeksu, pobieranie tylko na żądanie (miniatury z Graph `thumbnails`).
- **Zmiana nazwy/przeniesienie pliku na OD** — delta zwraca nowy `parentReference` → aktualizacja `folderKey` i `documentCategory`, bez ponownego indeksu, jeśli `cTag` bez zmian.

## 8. Testy (`/test`)

- `test/onedrive-sync/` — testy jednostkowe mapowania ścieżka → `folderKey`, obsługi `deleted`, zmiany `cTag`.
- Dev: zamówienie testowe z folderem OD, wrzucenie po 1 pliku do każdego podkatalogu → weryfikacja
  rekordów `DriveFile`, `ProcessNode.documentCategory`, punktów w Qdrant; eksport z aplikacji → brak duplikatu po sync.
