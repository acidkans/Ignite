# Plan implementacji: szybkie wyceny (QuickQuote), baseline i kontrola budżetu

Stan: koncepcja zatwierdzona w rozmowie 2026-07-19. Ten dokument jest planem wdrożenia — nic z niego nie zostało jeszcze zaimplementowane.

## Zasady nadrzędne (ustalone w analizie)

1. **Baseline = zaakceptowany snapshot wersji** (`ProjectVersion`), zamrażany kciukiem managera w dropdownie wersji. Żadnych dodatkowych klonów — analiza to zawsze „żywe dane vs zaakceptowany snapshot".
2. **Cena finalna = stan żywej karty produktu** (`MaterialRequirement`). Wypełniana ofertą PDF (istniejący assign) albo ręcznie w ProductCard (istniejący mechanizm produktu + ceny). Bez nowego pojęcia „ceny finalnej" w schemie.
3. **Jeden endpoint porównawczy, wiele widoków**: panel w Logistyce, widok per zamówienie, pasek w ProductCard, tryby zakładki Budżet — to te same trzy liczby (baseline / aktualny / Δ) na różnych poziomach agregacji.
4. **Snapshoty niemutowalne**: po zablokowaniu wyceny i po akceptacji zamówienia zmiany wymagają nowej wersji albo zostawiają ślad w `AuditLog`.
5. **Parser proponuje, człowiek zatwierdza** — dotyczy dostawcy z PDF i przypisań pozycji.

## Faza 0 — fundamenty schematu (schema.prisma)

Jedna migracja, same dodatki (bez zmian istniejących kolumn):

| Zmiana | Szczegóły |
|---|---|
| `schema-model` `Supplier` | `id`, `name`, `nip String? @unique`, adres, kontakt, `apiAdapter String?` (identyfikator adaptera API — null = dostawca tylko PDF-owy), `isActive`, `vatStatus String?`, `verifiedAt DateTime?` |
| `schema-model` `QuickQuote` | `id`, `nodeId` (FK ProcessNode), `name`, `status` (`DRAFT`/`VERIFIED`/`LOCKED`/`BASELINE`/`ARCHIVED`/`EXPIRED`), `parentId` (wersjonowanie jak `MaterialRequirementsList`), `validUntil`, `lockedAt/By`, `createdBy` |
| `schema-model` `QuickQuoteItem` | `quickQuoteId` FK, `materialRequirementId String?` (**onDelete: SetNull** — baseline przeżywa usunięcie wymagania), zdenormalizowany snapshot: `reqName`, `qtyAtCapture`, `unit`; `source` (`API`/`STOCK`/`MANUAL`), `supplierId` FK, `externalRef`, `sourceUrl`, `capturedAt`, `queriedBy`; waluty: `priceOriginalNetto`, `currency`, `exchangeRate`, `rateDate`, `priceNettoPln`; `priceNettoApi` (surowa, niemutowalna) osobno od efektywnej `priceNettoPln` (korekta logistyka) |
| `schema-pole` `Offer.supplierId` | FK do Supplier, `onDelete: SetNull` |
| `schema-pole` `Offer.offerNumber/offerDate/validUntil` | metadane oferty z parsera, potwierdzane w modalu |
| `schema-pole` `ProcessNode.orderStage` | `WYCENA` (default) / `ZAAKCEPTOWANE` / `REALIZACJA` / `ROZLICZONE`; znaczące dla `type='order'` |
| `schema-pole` `ProcessNode.acceptedVersionId` | pointer na zaakceptowany `ProjectVersion` + `acceptedAt`, `acceptedBy`. Pointer = z konstrukcji jedna zaakceptowana wersja |
| `schema-pole` `MaterialRequirement.sourceRequirementId` | id oryginału w klonie wersji — **klucz parowania baseline↔żywe**. Obowiązkowo dopisać do `cloneVersionData` w `versioning.service.ts` (reguła kompletności klonu) |
| `schema-pole` `MaterialRequirement.budgetSource` | `QUICKQUOTE` / `MANUAL` — proweniencja `budgetedPriceNetto` |

Do każdej zmiany: anchory `/// @anchor`, wpisy w SLOWNIK.md, wpis CHANGELOG.md (zmiana strukturalna).

**Uwaga produkcyjna:** przed migracją na prod sprawdzić tabelę-widmo `material_requirements_type_backup` (blokowała `db push` w przeszłości).

## Faza 1 — rejestr dostawców + moduł NIP

- `back-modul` `SuppliersModule`: CRUD (`GET/POST/PATCH /suppliers`), dedup po NIP (wpis z istniejącym NIP podpina istniejącego i odświeża dane).
- `back-serwis` `NipLookupService` — klon wzorca `ExchangeRatesService` (NBP): `GET /suppliers/nip-lookup/:nip` → Biała lista podatników VAT (api.mf.gov.pl, REST, bez klucza) → `{name, address, regon, vatStatus}`. Stempel `verifiedAt` + `vatStatus` na dostawcy.
- Furtka: dostawca zagraniczny bez NIP — wolny wpis (name only).
- UI minimalne: dropdown wyboru + tworzenie przez NIP (pełny widok rejestru — później, nie blokuje niczego).

## Faza 2 — dostawca w kanale PDF

- Rozszerzenie promptu parsera ofert (`buildOfferParsePrompt`, material-requirements.service.ts ~1521) o obiekt `supplier {name, nip, address, offerNumber, offerDate, validUntil}`. Instrukcja w prompcie: **dostawca = wystawca oferty, nie adresat**.
- Modal uploadu (istniejący, z b8337d8): match po NIP → potwierdź / „Utwórz dostawcę (VAT czynny)" jednym klikiem; fallback match po nazwie (podpowiedź); prefill numeru/dat.
- `assignOfferPosition` + `autoAssignFromOffer`: dopisać dostawcę do JSON `offerPositionSnapshot` (snapshot samowystarczalny — Offer bywa kasowana).

## Faza 3 — silnik QuickQuote

- `back-modul` `QuickQuotesModule`: CRUD + przejścia statusów; wersjonowanie `parentId` (wzorzec `createNewVersion` z list materiałowych).
- Źródła pozycji:
  - **Magazyn**: kandydat tylko gdy `Σ MaterialStock.quantity ≥ zapotrzebowanie` (pełne pokrycie, bez splitów). Wycena wg `Material.priceNetto`, `source=STOCK` (decyzja biznesowa potwierdzona kierunkowo — cena 0 zafałszowałaby budżet).
  - **API**: interfejs `SupplierGateway` + pierwszy adapter (wybrać dostawcę startowego). Wyniki NIE trafiają do katalogu `Material` (ryzyko duplikatów na `@@unique(manufacturer, model)`) — tylko do `QuickQuoteItem`.
  - **MANUAL**: ręczny wpis logistyka.
- Waluty: zamrożenie kursu NBP w momencie capture (wzorzec 1:1 z kanału PDF — `fetchNbpRate`).
- Przejście `LOCKED`: re-walidacja stanów magazynowych (ochrona przed podwójnym liczeniem między równoległymi szkicami); zapis cen do `budgetedPriceNetto` + `budgetSource=QUICKQUOTE`.
- UI: druga sekcja `CollapsibleSection` (akcent amber — zdefiniowany, nieużywany) w `OffersTab` w Logistyce: „Szybkie wyceny" — tabela nagłówków QQ + edycja pozycji.

## Faza 4 — akceptacja i etapy zamówienia

- `ThumbsUp` w dropdownie wersji (`DashboardPage.jsx` ~592, obok Pencil/RotateCcw/X), widoczny dla managera. Klik → modal potwierdzenia (suma budżetu, skutki) → **jedna transakcja**: `acceptedVersionId` + `acceptedAt/By` + `orderStage=ZAAKCEPTOWANE` + wskazana `QuickQuote`→`BASELINE` + wpis `AuditLog`.
- `ACTIVE ≠ BASELINE`: kciuk nie zmienia wersji aktywnej. Badge „BASELINE" na wierszu wersji obok „ACTIVE".
- Ochrona: `handleDeleteVersion` (front i back) blokuje wersję z pointera; edycja `budgetedPriceNetto` po akceptacji → uprawnienie managera + `AuditLog`.
- Cofnięcie akceptacji: osobna głośna akcja (modal z powodem, AuditLog, powrót `orderStage=WYCENA`) — nie drugi klik w kciuk.

## Faza 5 — endpoint porównawczy + widoki agregujące

- `back-endpoint` `GET /orders/:nodeId/comparison`: parowanie żywych `MaterialRequirement` z klonami zaakceptowanej wersji **po `sourceRequirementId`**; dołącza `QuickQuoteItem` (kolumny dostawcy QQ) i `offerPositionSnapshot` (final). Zwraca wiersze + KPI: suma baseline, koszt aktualny, **prognoza = Σ(final gdzie jest) + Σ(baseline gdzie brak)**, pokrycie, rozkład odchyleń per wiersz: **cenowe / ilościowe / zakresowe (zakres+ i zakres−) / kursowe**.
- Widoki (wszystkie z tego endpointu):
  - panel pełny w Logistyce (rozwinięcie wiersza QQ w sekcji „Szybkie wyceny"),
  - ten sam panel per zamówienie (osadzenie jak `LogistykaMaterialListsTab` osadza panel materiałów),
  - chip w nagłówku zamówienia: „Δ +4,3% · pokrycie 3/5",
  - opcjonalnie: powiadomienie do PM przy przekroczeniu progu Δ% (istniejący model `Notification`).
- Eksport Excel: kolumny Δ jako żywe formuły; baseline jako wartości stałe.

## Faza 6 — split ProductCard

- Rozwinięty liść WBS (`WBSHybridTable` — istniejące gniazdo ProductCard): domyślnie **zwinięty pasek** „Wycena X · Final Y · Δ badge"; po rozwinięciu split:
  - lewo: karta z `versionId=acceptedVersionId` (read-only, kłódka) + rozwijany panel dostawcy (odczyt),
  - prawo: żywa karta — istniejący picker produktu z bazy + cena (`handlePropagatePrice` już pcha do `unitCost` WBS) + panel dostawcy (rejestr / NIP-autofill / wolny wpis).
- Przyciski **na linii podziału** (position:absolute, left:50%, bez osobnej kolumny):
  - kciuk (teal): kopiuje całą pozycję — produkt+dostawca+cena, Δ=0; disabled gdy baseline pusty,
  - strzałka (amber): kopiuje tylko dane produktu, otwiera panel dostawcy.
  - Nadpisanie wypełnionej prawej strony — z potwierdzeniem; po akceptacji — AuditLog.
- Tooltippy rozróżniają kciuk „pozycja" od kciuka „snapshot" (ta sama metafora, dwie skale).

## Faza 7 — tryby zakładki Budżet

- Segmented control (widoczny po akceptacji; wcześniej zakładka bez zmian):
  1. **Budżet (baseline)** — `BudgetTable` z danych zaakceptowanej wersji, read-only,
  2. **Wykonanie** — żywe dane: final gdzie przypisane (komórka read-only, badge `FO`/`FO✎`), fallback QQ (edytowalne, badge `QQ`), magazyn `MAG`,
  3. **Porównanie** — pary kosztów + Δ + **marża plan → efektywna** (cena ofertowa zamrożona w baseline, koszt żywy → erozja marży per wiersz), wiersze gałęzi z sumami obu kolumn (kolejność drzewa już jest w BudgetTable).
- Eksport Excel trybu Porównanie z żywymi formułami; obowiązują istniejące walidacje cen przy eksporcie oferty/budżetu.

## Faza 8 (później) — scorecard dostawców

Z danych faz 1–7 wychodzi za darmo: średnie Δ% cena API vs finalna per dostawca, odsetek zakupów u dostawcy z wyceny. Silnik najtańszej opcji może ważyć wiarygodnością. Nie planować przed zebraniem danych z 2–3 przetargów.

## Kolejność i zależności

```
F0 (schema) → F1 (Supplier/NIP) → F2 (PDF supplier)
F0 → F3 (QuickQuote)            → F4 (akceptacja) → F5 (comparison) → F6 (ProductCard)
                                                                    → F7 (Budżet)
```

F1+F2 można robić równolegle z F3. F5 wymaga F3+F4. F6 i F7 niezależne od siebie, oba po F5.

Szacunek względny: F0=S, F1=M, F2=M, F3=L (adapter API = największa niewiadoma), F4=M, F5=L, F6=L, F7=M.

## Otwarte decyzje (do potwierdzenia przed daną fazą)

1. Pierwszy dostawca z adapterem API (F3) — który i jaki protokół (REST/GraphQL)?
2. Wycena pozycji magazynowych wg `Material.priceNetto` (F3) — potwierdzić biznesowo.
3. Próg Δ% dla powiadomień PM (F5) — wartość i czy w ogóle na start.
4. Cofnięcie akceptacji — kto ma uprawnienie (tylko admin? manager?).

## Konwencje przy realizacji (repo)

- Każda faza = commity z wpisami CHANGELOG.md (sekcje schema/architektura/słownik/wytyczne), anchory + SLOWNIK.md przed commitem, wersja w LoginPage.jsx po zmianach, testy w `/test`, weryfikacja w Chrome.
- Nowe modele z `versionId` → obowiązkowo do `cloneVersionData` (versioning.service.ts).
- Bez commitów i deployów bez wyraźnej zgody.
