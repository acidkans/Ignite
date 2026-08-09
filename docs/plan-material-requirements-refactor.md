# Plan: Refactor material_requirements → 3 osobne tabele

**Data planu:** 2026-06-11  
**Cel:** Rozdzielenie monolitycznej tabeli `material_requirements` na trzy tabele o czystych odpowiedzialnościach.

---

## Stan realizacji (2026-06-11)

| Krok | Status | Commit |
|---|---|---|
| Krok 10 — naprawa ścieżek plików | ✅ DONE | `8f8cb47` |
| Krok 1 — model `Material` + `MaterialStock` w schemie | ✅ DONE | `8f8cb47` |
| Krok 2 — oczyszczenie `MaterialRequirement` | ✅ DONE | `8f8cb47` |
| Krok 3 — `ProductProposal` bez zmian strukturalnych | ✅ DONE | `8f8cb47` |
| Krok 4 — migracja danych SQL | ✅ DONE | `8f8cb47` |
| Krok 5 — TypeScript serwisów po migracji | ✅ DONE | `ce75dbe` |
| Krok 6 — nowy moduł `materials/` (NestJS) | ⬜ TODO | — |
| Krok 7 — frontend: WbsMaterialsPanel.jsx | ⬜ TODO | — |
| Krok 8 — frontend: MaterialDatabaseTab.jsx | ⬜ TODO | — |
| Krok 9 — testy regresji | ⬜ TODO | — |

### Uwagi do stanu

- **Backend `all-materials` i `database`** — endpointy istnieją nadal pod starymi ścieżkami (`/material-requirements/all-materials`, `/material-requirements/database`), ale ich serwisy już odpytują tabelę `materials` (nie `material_requirements`). Frontend może używać starych URL-i i działa poprawnie.
- **Frontend `priceNetto`** — WbsMaterialsPanel i WbsMaterialRow używają pola `priceNetto` (stara nazwa) zamiast `budgetedPriceNetto`. Backend `PATCH /material-requirements/:id` musi przyjmować oba lub frontend wymaga aktualizacji (Krok 7a).
- **MaterialDatabaseTab** — nadal wywołuje `/material-requirements/database`, `/material-requirements/save-datasheet-items`, `/material-requirements/datasheets` — wszystkie działają bo backend je utrzymuje.

---

## Stan obecny (problem, przed refaktorem)

Tabela `material_requirements` pełniła 3 role jednocześnie:
1. **Wymaganie materiałowe projektu** — "czego potrzebujemy, ile, jakie spec"
2. **Karta produktowa liścia WBS** — przypisana 1:1 przez `wbsNodeId @unique`
3. **Wpis w bazie katalogowej** — rekordy z `dataSheetUrl` + `manufacturer` (samoreferencja przez `materialId`)

---

## Stan docelowy (aktualny schemat)

```
material_requirements   — tylko wymagania projektowe (co, ile, jakie tech) ✅
product_proposals       — kandydaci przejściowi (AI + ręczne)              ✅
materials               — zaakceptowane produkty + import z kart = katalog ✅
material_stock          — stany magazynowe per produkt                     ✅
```

---

## ✅ Krok 1 — Model `Material` w schema.prisma (DONE)

Model `Material` z `@@unique([manufacturer, model])`, FK `dataSheetDocumentId` + `complianceDocumentId` → `ProcessNode`, relacje do `MaterialRequirement[]`, `WbsNodeMaterial[]`, `MaterialStock[]`.

Model `MaterialStock` z FK `materialId` → `Material`.

W `ProcessNode` dodane relacje zwrotne `materialDataSheets` i `materialCompliances`.

---

## ✅ Krok 2 — Zmiany w modelu `MaterialRequirement` (DONE)

**Usunięte** pola katalogowe: `productName`, `manufacturer`, `model`, `dataSheetUrl/Name`, `complianceUrl/Name`, `imageUrl`, `stockStatus`, `priceNetto`, `seller`, `offerNumber`, `productUrl`, `availability`.

**Dodane:** `materialId String?` → FK do `Material` (upsert przy akceptacji propozycji).

**Pozostałe** pola wymaganiowe: `name`, `type`, `quantity`, `unit`, `technicalSpec`, `sourceDocument`, `wbsNodeId`, `assignedSubtaskId`, `isAiAssigned`, `aiConfidence`, `complianceData`, `status`, `budgetedPriceNetto Float?`.

---

## ✅ Krok 3 — ProductProposal (DONE)

Bez zmian strukturalnych. Po `selectProposal()` propozycja zostaje z `isSelected=true` jako historia wyboru.

---

## ✅ Krok 4 — Migracja danych SQL (DONE)

Plik migracyjny w `prisma/migrations/` wykonany w commicie `8f8cb47`:
- Unikalne produkty z `material_requirements` → `materials`
- Przepięcie `material_id` (stara samoreferencja → nowe `materials.id`)
- Usunięcie pól katalogowych z `material_requirements`
- `price_netto` → `budgeted_price_netto`
- Przepięcie FK w `wbs_node_materials`: `MaterialRequirement` → `Material`

---

## ✅ Krok 5 — Backend: material-requirements.service.ts (DONE)

TypeScript serwisów naprawiony po migracji schematu (`ce75dbe`). `prisma generate` wymagane po tej migracji — pamiętać przy kolejnym clone/pull.

Zmiany:
- `selectProposal()` — upsert do `materials`, ustaw `materialRequirement.materialId`
- `saveDatasheetItems()` — tworzy `Material` zamiast `MaterialRequirement`
- `findAllMaterials()` / `findGlobalDatabase()` — query z tabeli `materials`
- `addManualProposal()` — usunięty blok aktualizujący pola katalogowe w `MaterialRequirement`
- `resolveUploadPath()` — obsługuje oba formaty ścieżek (legacy absolutne + nowe relatywne)

---

## ⬜ Krok 6 — Backend: nowy MaterialsController + MaterialsService

Stworzyć osobny moduł NestJS `apps/backend/src/materials/`:

```
GET  /materials               — lista wszystkich materiałów w katalogu
GET  /materials/:id           — szczegóły
POST /materials               — ręczne dodanie do katalogu
PATCH /materials/:id          — edycja
DELETE /materials/:id         — usunięcie
GET  /materials/database      — przeniesione z material-requirements/database
GET  /materials/:id/stock     — stan magazynowy produktu
PATCH /materials/:id/stock    — aktualizacja stanu (quantity, location)
GET  /materials/:id/proposals — historia cen z product_proposals dla danego materialId
```

Przenieść z `material-requirements.service.ts` do nowego serwisu:
- `findGlobalDatabase()` → `GET /materials/database`
- `findAllMaterials()` → `GET /materials`
- logikę zarządzania `MaterialStock`

---

## ⬜ Krok 7 — Frontend: WbsMaterialsPanel.jsx

### 7a. `selectProposal(p)`
- `onPatch(req.id, { priceNetto })` → `onPatch(req.id, { budgetedPriceNetto })`
- Po akceptacji: `WbsNode.unitCost = budgetedPriceNetto` via `onWbsNodeUnitCostChange`
- Cross-propagacja po `materialId`: wszystkie `material_requirements` z tym samym `materialId` dostają update `budgetedPriceNetto` + `WbsNode.unitCost`

### 7b. `ProductCard` — pola produktu z `req.material` (nested join)

Pola produktu (`manufacturer`, `model`, `productName`) czytać z `req.material`, edytowalne inline.

Przy onBlur edycji pola w górnej karcie:
```
PATCH /material-requirements/:id { manufacturer, model, productName, ... }
    ↓
backend auto-upsert materials { manufacturer, model, productName }
backend auto-upsert product_proposals { materialRequirementId, materialId, isSelected: true, isManual: true }
material_requirements.materialId = materials.id
```

**Trigger przypisania:** `manufacturer` AND `model` oba niepuste.

Trzy stany liścia:
- `materialId = null`, `budgetedPriceNetto = null` → czyste wymaganie, brak produktu i budżetu
- `materialId = null`, `budgetedPriceNetto > 0` → szacunkowy budżet, brak produktu
- `materialId = uuid` → produkt przypisany z katalogu

### 7c. `ProductCard` — stan magazynowy

Gdy `materialId` ustawiony → pobierz `material_stock` i pokaż w górnej karcie:
```
STAN MAG.
[  12 szt  ]   ← z material_stock.quantity (read-only)
```

Kolory: zielony (≥ quantity), żółty (0 < x < quantity), czerwony (0).

Backend: `GET /material-requirements/:id` rozszerzyć o `include: { material: { include: { stock: true } } }`.

### 7e. `ProposalsSection` — autocomplete z tabeli `materials`

`materialDb` zasilać z `GET /materials` zamiast `GET /material-requirements/all-materials`.

Po wyborze z autocomplete: ustawić `form.materialId = materials.id`.
`POST /:id/proposals` payload dodać `materialId`.

### 7f. `ProposalsSection` — historia cen

Gdy `form.materialId` ustawiony: pobrać `GET /materials/:materialId/proposals` → "Poprzednie ceny: 450 zł (2025-03), 480 zł (2024-11)...".

---

## ⬜ Krok 8 — Frontend: MaterialDatabaseTab.jsx

- `GET /material-requirements/database` → `GET /materials`
- `POST /material-requirements/save-datasheet-items` → `POST /materials/from-datasheet`
- Usunąć filtrowanie po `dataSheetUrl IS NOT NULL` — tabela `materials` zawiera tylko katalog

---

## ⬜ Krok 9 — Testy regresji

- [ ] Dodaj propozycję ręcznie → pojawia się w ProductCard
- [ ] Szukaj AI → propozycje pojawiają się w ProductCard
- [ ] Wybierz propozycję → `materials` dostaje nowy wpis, `material_requirements.materialId` ustawiony, cena → `budgetedPriceNetto`
- [ ] Import karty katalogowej → `materials` dostaje wpisy z `dataSheetUrl`
- [ ] Zakładka "Baza materiałów" → dane z tabeli `materials`
- [ ] Eksport PDF/Excel → koszty WBS z `budgetedPriceNetto`

---

## Ryzyka (pozostałe)

| Ryzyko | Mitygacja |
|---|---|
| `saveDatasheetItems` tworzy duplikaty w `materials` | `@@unique([manufacturer, model])` + upsert — już w schemie |
| PDF eksport pobiera pola bezpośrednio z `MaterialRequirement` | Sprawdzić wszystkie query przed Krokami 7–8 |
| Frontend wysyła `priceNetto` zamiast `budgetedPriceNetto` | Krok 7a — zaktualizować wywołania |
| `materialDb` po stronie frontendu nadal z `all-materials` | Krok 7e + Krok 8 — zmienić endpoint |

---

## Strategia deploymentu (po Krokiem 6–8)

```
1. ssh gigatel
2. docker exec erp-db pg_dump -U erp_user -d erp_db > backup.sql    ← BACKUP
3. git pull
4. docker compose up -d --build backend                              ← nowy moduł materials/
5. docker compose up -d --build frontend                             ← nowy frontend
6. Sprawdź logi: docker logs erp-backend-1 -f
7. Testy regresji (Krok 9)
```

> **Uwaga:** Migracja SQL (Krok 4) została już wykonana na dev. Przed deployem produkcyjnym uruchomić backup + SQL ręcznie przez psql.
