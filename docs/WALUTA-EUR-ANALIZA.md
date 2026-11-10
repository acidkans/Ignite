# Waluta zamówienia EUR zamiast PLN — analiza

Stan na 2026-11-10 (gałąź `nowy_UI_Realizacja`, commit `8bbbf58`). Dokument jest analizą — żaden kod nie został zmieniony.

## TL;DR

- W bazie **żadna kwota nie ma waluty**. Wszystkie pola pieniężne (`WbsNode.unitCost/totalCost/unitPrice/totalPrice`, `BudgetLineItem.*`, `LeafActual.unitCost`, `AcceptanceProtocolItem.wartosc`, `MaterialRequirement.budgetedPriceNetto`, `ProductProposal.priceNetto/purchasePriceNetto`, `Material.priceNetto`) to gołe `Float`, które cała aplikacja traktuje jako PLN.
- Waluta + kurs NBP istnieją tylko w dwóch miejscach: `QuickQuoteItem` (`currency`, `exchangeRate`, `rateDate`, `priceOriginalNetto`, `priceNettoPln`) oraz w JSON-ie pozycji oferty z parsera (`Offer.positions[].currency/exchangeRate/priceNettoPln`). Oba kierunki to „obca → PLN”.
- Jest gotowy serwis kursów `ExchangeRatesService.fetchNbpRate(code)` (`apps/backend/src/exchange-rates/exchange-rates.service.ts`), ale pobiera tylko **najnowszy** kurs (bez daty) i tylko w kierunku obca→PLN.
- We froncie waluta jest zaszyta w ~115 miejscach jako tekst „zł”, ~70 jako „PLN” (nagłówki tabel, Excel, PDF), a formatery `fmtPLN`, `fmtPLNFull`, `fmtZl`, `fmtPln` mają w nazwie PLN, ale same nie dopisują symbolu (oprócz `fmtPln` w `UnifiedWbsPanel.jsx:1788`).
- **Rekomendacja: wariant C** — waluta jako pole zamówienia (`ProcessNode.currency`, domyślnie `PLN`), wszystkie istniejące kwoty zostają w tej jednej walucie, a **tylko wpis zakupu (`LeafActual`)** dostaje opcjonalną walutę oryginalną + kurs NBP z dnia poprzedzającego datę zdarzenia, przeliczane przy zapisie do waluty zamówienia. Sumy i agregacje nie zmieniają się wcale. Szacunek: **~4–6 dni** pracy.

---

## 1. Kwoty w `schema.prisma`

| Model | Pola pieniężne | Waluta / kurs | Uwagi |
|---|---|---|---|
| `ProcessNode` (zamówienie, `type='order'`) | brak | brak | naturalne miejsce na walutę zamówienia: jest globalny dla wszystkich wersji, ma `orderStage`, `acceptedVersionId` |
| `ProjectVersion` | brak | brak | |
| `OrderRequirements` | brak | brak | jeden wiersz na wersję (`@@unique([nodeId, versionId])`) — gorsze miejsce na walutę, bo trzeba by ją klonować i pilnować spójności między wersjami |
| `WbsNode` | `unitCost`, `totalCost`, `margin` (%), `discount` (%), `unitPrice`, `totalPrice`; `cost` (String, legacy) | brak | rdzeń wyceny i budżetu, wersjonowany |
| `BudgetLineItem` | `unitCost`, `totalCost`, `margin`, `discount`, `unitPrice`, `totalPrice` | brak | wersjonowany |
| `LeafActual` | `unitCost` (koszt jednostkowy zdarzenia zakupu/wykonania) | brak | **nie** wersjonowany (kluczowany po `wbsRootId`) |
| `AcceptanceProtocolItem` | `wartosc` | brak | protokoły odbioru |
| `MaterialRequirement` | `budgetedPriceNetto`; `offerPositionSnapshot` (JSON z `priceNetto`) | brak | wersjonowany |
| `MaterialRequirementOfferPart` | `snapshot` (JSON, komentarz: „priceNetto (PLN…)”) | brak | |
| `ProductProposal` | `priceNetto`, `purchasePriceNetto` | brak | |
| `Material` (katalog globalny) | `priceNetto` | brak | cena referencyjna, wspólna dla wszystkich zamówień |
| `Offer` | `positions` (JSON) | **tak, w JSON**: `currency`, `exchangeRate`, `rateDate`, `priceNettoPln` | parser przelicza obcą → PLN (`material-requirements.service.ts:2343-2366`) |
| `QuickQuote` / `QuickQuoteItem` | `priceOriginalNetto`, `priceNettoPln`, `priceNettoApi` | **tak**: `currency`, `exchangeRate`, `rateDate` | wzorzec do skopiowania; UI w `QuickQuotesSection.jsx` ma już select PLN/EUR/USD/GBP |

Wniosek: dziś „waluta zamówienia” jest domyślnie PLN wszędzie, a jedyne istniejące pola walutowe zakładają PLN jako walutę docelową (nazwy `priceNettoPln`).

## 2. Waluta zaszyta we froncie

### Formatery (wspólne)

| Funkcja | Plik | Co robi |
|---|---|---|
| `fmtPLN`, `fmtPLNFull` | `apps/frontend/src/components/shared/wbs/wbsConstants.js:328, :346` | liczba `pl-PL` 2 miejsca; **bez** symbolu — symbol dokleja wołający |
| `fmtZl` | `apps/frontend/src/components/shared/wbs/realizationShared.js:177` | j.w.; symbol „zł” doklejany ręcznie |
| `fmtPln` (lokalna) | `UnifiedWbsPanel.jsx:1788` | jedyna, która sama dopisuje `' zł'` |
| `toLocaleString('pl-PL', …)` inline | 43 wystąpienia w `src/` | część to kwoty (np. `DashboardPage.jsx:1385`, `BudgetTable.jsx:645`) |

Dobra wiadomość: skoro formatery nie wstawiają symbolu, liczby same nie wymagają zmian — trzeba zmienić **doklejany tekst** („zł”/„PLN”) na symbol waluty zamówienia. Separator dziesiętny `pl-PL` (`1 234,56 €`) jest poprawny dla polskiego UI i można go zostawić.

### Tekst „zł” w UI (115 wystąpień, ~20 plików)

Największe skupiska: `RealizationNewTab.jsx` (31), `RealizationTab.jsx` (22), `WbsMaterialsPanel.jsx` (11), `realizacja/RealizacjaPanel.jsx` (11: kafle KPI `1613-1621`, wiersze `1500-1503`, nagłówek gałęzi `1434`), `realizationShared.js` (6, w większości komentarze), `UnifiedWbsPanel.jsx` (5), `MaterialRequirementsPanel.jsx`, `BudgetTable.jsx` (4: `780`, `832`), `BudgetModesPanel.jsx`, `MaterialDatabaseTab.jsx`, `ComparisonPanel.jsx` (3), `realizacja/realizacjaShared.js:217, :229` (opisy historii wpisu i protokołu), `DashboardPage.jsx:1386, :1403` (modal akceptacji), `QuickQuotesSection.jsx`, `OffersTab.jsx`, `DocumentViewer.jsx`.

### Tekst „PLN” (≈70 wystąpień)

- `BudgetTable.jsx:427-476` — 9 sum w nagłówku budżetu (`{fmtPLNFull(...)} PLN`).
- `UnifiedWbsPanel.jsx` — placeholder `{wartość oferty}` w szablonach maili/tekstu oferty (`2616`, `4408`, `6730`), badge `6752`, markdown oferty `6510`, nagłówki arkuszy Excel oferty `4431`, `4477`, `4522`, `4571` (`Cena jedn. netto (PLN)`, `Cena netto (PLN)`…), `4650`, `3888` (cash flow), komunikat `3780`.
- `RealizationTab.jsx` (12) i `WBSHybridTable.jsx` (6) — nagłówki kolumn.
- `OfferAiCheckModal.jsx:115`, `WbsMaterialsPanel.jsx:566` (`offerPosPricePln`), `QuickQuotesSection.jsx:267` („Cena netto PLN”), `DocumentViewer.jsx`.

### Eksporty PDF

- `apps/frontend/src/utils/wbsPdfExport.js` — `fmtPLN` + nagłówki `Cena ofertowa (PLN)` w tabelach oferty (`213`, `239`, `285`). Tu wystarczy przekazać kod waluty w opcjach `buildPdfDocument` i podstawić w nagłówkach.
- `apps/frontend/src/utils/projectPdfExport.js:259-260` — sumy budżetu „PLN”.
- `apps/frontend/src/utils/protokolOdbioruExport.js`, `exportQaFormPdf.js` — wystąpienia „zł” do sprawdzenia przy wdrożeniu (część to słowa, nie waluta).
- Backend: `apps/backend/src/ai/offer-ai-report.ts:72` — raport AI „koszt … PLN”.

### Eksporty Excel (ExcelJS)

- `RealizationTab.jsx:1076` — `FMT_PLN = '#,##0.00\ [$zł-415]'`, używany w ~15 miejscach. Odpowiednik dla euro: `'#,##0.00\ [$€-x-euro2]'` albo prościej `'#,##0.00\ "€"'`. Trzeba z tego zrobić funkcję `excelMoneyFmt(currency)`.
- `UnifiedWbsPanel.jsx`, `ComparisonPanel.jsx`, `BudgetModesPanel.jsx` — `numFmt = '#,##0.00'` bez symbolu (OK), ale nagłówki kolumn zawierają „(PLN)”.
- `apps/frontend/src/utils/exportWithoutPrices.js:13, :19` — regexy wykrywające kolumny pieniężne już rozpoznają `EUR`; trzeba dopisać `€` do `NUMERIC_TEXT_RE`.

### Panel realizacji

`apps/frontend/src/components/shared/realizacja/` — `RealizacjaPanel.jsx` (kafle, wiersze, nagłówki gałęzi), `realizacjaShared.js` (teksty historii). Wszystkie przez `fmtZl(...)} zł` — mechaniczna zamiana na `fmtMoney(v, currency)`.

### AI

Prompty generujące WBS/budżet i parser ofert zakładają PLN niejawnie (parser jawnie przelicza na PLN). Przy zamówieniu w EUR prompt musi dostać informację „kwoty w EUR”, a parser przeliczać do waluty zamówienia, nie do PLN.

## 3. Zakupy w obcej walucie (`LeafActual`)

Dziś wpis zakupu ma tylko `qty` + `unitCost` (domyślnie PLN). Przypadek „165€ transport” użytkownik musi przeliczyć ręcznie i zostawić ślad w `comment` — kurs i oryginalna kwota giną.

To jest realna potrzeba niezależnie od waluty zamówienia: zamówienie w PLN dostaje fakturę w EUR, zamówienie w EUR dostaje FV w PLN od polskiego podwykonawcy. Proponowane pola (wzorzec `QuickQuoteItem`):

| Pole | Typ | Znaczenie |
|---|---|---|
| `LeafActual.currency` | `String?` | waluta oryginalna wpisu; `NULL` = waluta zamówienia |
| `LeafActual.unitCostOriginal` | `Float?` | koszt jedn. w walucie oryginalnej |
| `LeafActual.exchangeRate` | `Float?` | kurs użyty do przeliczenia (waluta oryginalna → waluta zamówienia) |
| `LeafActual.rateDate` | `DateTime?` | data tabeli NBP |

`unitCost` zostaje **w walucie zamówienia** (przeliczony przy zapisie) — dzięki temu `realizationOf`, KPI, bilans, Excel i porównanie F5 nie zmieniają się ani o linię.

Kurs NBP:
- Księgowo przyjmuje się kurs średni NBP (tabela A) z **ostatniego dnia roboczego poprzedzającego** dzień zdarzenia (`entryDate`). Endpoint: `GET https://api.nbp.pl/api/exchangerates/rates/a/{code}/{YYYY-MM-DD}/` — zwraca 404 dla weekendów/świąt, więc trzeba cofać się dzień po dniu (max ~7 prób) albo pobrać zakres `…/{od}/{do}/` i wziąć ostatni.
- `fetchNbpRate(code)` trzeba rozszerzyć o parametr `date`.
- Kurs krzyżowy (np. USD → EUR, PLN → EUR): `kurs(USD→PLN) / kurs(EUR→PLN)`; PLN→EUR = `1 / kurs(EUR)`. NBP podaje wszystko względem PLN, więc każdą parę da się policzyć z dwóch zapytań.
- Kurs zamrażamy w wierszu (nie przeliczamy wstecz przy zmianie kursu). Użytkownik może nadpisać kurs ręcznie (kurs z faktury / banku).
- Przy edycji wpisu: zmiana `entryDate` lub waluty → ponowne pobranie kursu.

UI: w formularzu wpisu (`entryFields.js`, `RealizacjaPanel.jsx`, `WbsRealizationDrawer.jsx`) mały select waluty obok kosztu jedn.; gdy ≠ waluta zamówienia — podgląd „165,00 EUR × 4,2512 (NBP 2026-11-07) = 701,45 zł”. Ten sam opis w historii wpisu (`realizacjaShared.js:217`).

## 4. Wersjonowanie, sumy, agregacje

- **Waluta na `ProcessNode`** — pole globalne zamówienia, nie należy do wersji → **nie trzeba** ruszać `cloneVersionData` (`apps/backend/src/ai/versioning.service.ts:107`). Gdyby waluta trafiła do `OrderRequirements` albo `WbsNode` (korzeń), trzeba by ją dopisać do klonu (patrz memory „Wersjonowanie WBS — kompletność klonu”) i pilnować, żeby baseline i wersja żywa nie miały różnych walut — porównanie F5 baseline↔żywe miałoby wtedy sens tylko po przeliczeniu. Dlatego **nie** polecam „pola na węźle głównym WBS”.
- **Nowe pola `LeafActual`** — `LeafActual` z założenia nie jest klonowany, więc też bez zmian w `cloneVersionData`.
- **Sumy w obrębie zamówienia** — skoro wszystkie zapisane kwoty są w jednej walucie zamówienia, `totalCost`, `totalPrice`, `realizationOf`, bilans, KPI, cash flow i protokoły sumują się jak dotąd. Zero zmian w logice agregacji.
- **Agregaty między zamówieniami** — dziś brak ich w backendzie (`orders.service.ts` nie sumuje kwot). Gdyby powstał (dashboard portfela, raport zarządu), musi albo grupować po walucie, albo przeliczać do PLN kursem z dnia raportu.
- **Katalog `Material.priceNetto`** i propozycje (`ProductProposal.priceNetto`) są współdzielone między zamówieniami — przy kopiowaniu ceny z katalogu do zamówienia w EUR trzeba przeliczyć (albo dodać `Material.currency`). Na start: przeliczenie przy kopiowaniu + komunikat.
- **Oferty dostawców (`Offer.positions`)** — parser liczy `priceNettoPln`; przy zamówieniu w EUR trzeba liczyć cenę w walucie zamówienia. Najczyściej: dodać w JSON `priceNettoBase` + `baseCurrency`, zostawiając `priceNettoPln` dla zgodności wstecz; `offerPosPricePln` (`WbsMaterialsPanel.jsx:567`) czyta nowe pole z fallbackiem.
- **QuickQuote** — `priceNettoPln` → analogicznie `priceNettoBase` albo przeliczenie do waluty zamówienia w `quick-quotes.service.ts:433`.
- **Zmiana waluty istniejącego zamówienia** — najbezpieczniej: zmiana dozwolona, dopóki zamówienie nie ma kwot (lub jest w `orderStage = WYCENA`); później tylko przez jawną akcję „Przelicz zamówienie na EUR po kursie X” (modal TAK/NIE, transakcja mnożąca wszystkie pola kwot we wszystkich wersjach + `AuditLog`). Druga opcja to kawał ryzykownej pracy — proponuję ją odłożyć.

## 5. Warianty

### A. Waluta zamówienia, bez walut per wpis

`ProcessNode.currency String @default("PLN")` + wspólny formater i kontekst React. Użytkownik wybiera EUR przy zakładaniu zamówienia i wpisuje wszystkie kwoty w EUR. Zakup w innej walucie przelicza ręcznie (jak dziś).

- ✅ najmniej pracy, zero zmian w agregacjach i wersjonowaniu
- ❌ „165€ transport” w zamówieniu PLN dalej przeliczany ręcznie, brak śladu kursu

### B. Waluta per każda kwota

`currency` + `exchangeRate` przy każdym polu kwoty (`WbsNode`, `BudgetLineItem`, `LeafActual`, `MaterialRequirement`, `ProductProposal`, protokoły…), sumowanie przez przeliczenie.

- ✅ maksymalna elastyczność
- ❌ każda suma w kodzie (front i back, dziesiątki miejsc w `UnifiedWbsPanel`, `WBSHybridTable`, `realizationShared`, `useRealizationData`, eksporty) musi przeliczać; kłopot z kursem dla kwot planowanych (z którego dnia?); dużo nowych pól do `cloneVersionData`; wysokie ryzyko rozjazdów sum. **Nie polecam.**

### C. (rekomendowany) A + waluta oryginalna tylko na wpisie zakupu

Wariant A plus pola walutowe na `LeafActual` (sekcja 3). Planowanie (wycena, budżet) odbywa się w jednej walucie zamówienia; rzeczywiste zakupy mogą przyjść w dowolnej walucie i są przeliczane kursem NBP przy zapisie, z zachowaniem oryginału.

- ✅ pokrywa oba przypadki użytkownika (całe zamówienie w EUR + pojedynczy zakup w obcej walucie)
- ✅ sumy, KPI, wersjonowanie bez zmian logicznych
- ✅ reużywa istniejący wzorzec `QuickQuoteItem` + `ExchangeRatesService`
- ❌ trzeba rozszerzyć `fetchNbpRate` o datę i kurs krzyżowy

## 6. Plan wdrożenia wariantu C i lista plików

**Backend**
1. `apps/backend/prisma/schema.prisma` — `ProcessNode.currency String @default("PLN")`; `LeafActual.currency`, `unitCostOriginal`, `exchangeRate`, `rateDate`. Migracja (dev: ręczny psql + wpis do `_prisma_migrations`, prod: `migrate deploy`).
2. `apps/backend/src/exchange-rates/exchange-rates.service.ts` — `fetchNbpRate(code, date?)` z cofaniem do dnia roboczego, `getRate(from, to, date)` z kursem krzyżowym; cache per (kod, data).
3. `apps/backend/src/exchange-rates/exchange-rates.controller.ts` — `GET /exchange-rates/rate?from=EUR&to=PLN&date=…` do podglądu w formularzu.
4. `apps/backend/src/leaf-actuals/leaf-actuals.service.ts` (+ moduł: import `ExchangeRatesModule`) — przy create/update: jeśli `currency` ≠ waluta zamówienia → pobierz kurs, policz `unitCost`; audit diff z polami walutowymi.
5. Endpoint zmiany waluty zamówienia (np. w `orders`/`process-tree`) — `PATCH` z blokadą, gdy zamówienie ma kwoty.
6. `material-requirements.service.ts:2343-2366` (parser ofert) i `quick-quotes.service.ts:~433` — przeliczenie do waluty zamówienia zamiast PLN.
7. `apps/backend/src/ai/offer-ai-report.ts:72` + prompty w `ai.service.ts` — waluta zamówienia w tekście.

**Frontend**
8. Nowy `apps/frontend/src/utils/money.js` — `fmtMoney(v, cur)`, `currencySymbol(cur)`, `excelMoneyFmt(cur)`; kontekst/hook `useOrderCurrency()` (waluta z wybranego zamówienia).
9. Zamiana „zł”/„PLN” na symbol z kontekstu: `realizacja/RealizacjaPanel.jsx`, `realizacja/realizacjaShared.js`, `RealizationTab.jsx`, `RealizationNewTab.jsx` (jeśli wciąż w użyciu), `wbs/BudgetTable.jsx`, `wbs/BudgetModesPanel.jsx`, `wbs/UnifiedWbsPanel.jsx` (UI + nagłówki Excel + placeholder `{wartość oferty}`), `wbs/WBSHybridTable.jsx`, `wbs/WbsMaterialsPanel.jsx`, `wbs/MaterialRequirementsPanel.jsx`, `wbs/OfferAiCheckModal.jsx`, `ComparisonPanel.jsx`, `MaterialDatabaseTab.jsx`, `QuickQuotesSection.jsx`, `OffersTab.jsx`, `DocumentViewer.jsx`, `DashboardPage.jsx`.
10. Eksporty: `utils/wbsPdfExport.js`, `utils/projectPdfExport.js`, `utils/protokolOdbioruExport.js`, `utils/exportWithoutPrices.js` (`€` w regexie), `FMT_PLN` w `RealizationTab.jsx`.
11. Formularz wpisu zakupu: `wbs/entryFields.js`, `realizacja/RealizacjaPanel.jsx`, `wbs/WbsRealizationDrawer.jsx` — select waluty + podgląd przeliczenia; historia wpisu pokazuje oryginał i kurs.
12. Ustawienie waluty zamówienia — w `NodeInfoTab.jsx` / modalu tworzenia zamówienia (select PLN/EUR, zablokowany gdy są kwoty).

**Dokumentacja (wg CLAUDE.md)**: wpis w `CHANGELOG.md` (schema + API), wiersze w `SLOWNIK.md` z anchorami (`process-node-currency`, `leaf-actual-currency`, `leaf-actual-unit-cost-original`, `leaf-actual-exchange-rate`, `leaf-actual-rate-date`, `fmt-money`, `use-order-currency`, `excel-money-fmt`, …), wytyczna: „`schema-pole` `LeafActual.unitCost` — zawsze w walucie zamówienia; oryginał w `unitCostOriginal`”.

Nazwy `fmtPLN`/`fmtZl` można zostawić (formatują samą liczbę) albo w drugim kroku przemianować — rename pociąga zmianę anchorów i wierszy w SLOWNIK, więc nie warto robić tego razem z funkcjonalnością.

## 7. Szacunek pracy

| Zakres | Czas |
|---|---|
| Schema + migracja + `ProcessNode.currency` + endpoint ustawienia | 0,5 d |
| `ExchangeRatesService` z datą i kursem krzyżowym + testy | 0,5 d |
| `LeafActual` waluta: backend + formularz + historia | 1 d |
| Formater + kontekst + zamiana ~185 miejsc „zł”/„PLN” w UI | 1–1,5 d |
| Eksporty PDF/Excel + placeholder `{wartość oferty}` + raport AI | 0,5–1 d |
| Parser ofert, QuickQuote, katalog materiałów → waluta zamówienia | 0,5–1 d |
| Testy ręczne zamówienia w EUR (wycena → budżet → realizacja → eksporty), CHANGELOG/SLOWNIK | 0,5 d |
| **Razem wariant C** | **~4,5–6 dni** |
| Wariant A (bez walut na wpisie) | ~3–4 dni |
| Opcjonalnie: akcja „przelicz istniejące zamówienie” | +1–1,5 d |

## 8. Otwarte pytania do użytkownika

1. Czy zmiana waluty ma dotyczyć tylko nowych zamówień, czy trzeba przeliczyć któreś istniejące?
2. Kurs dla wpisu zakupu: NBP z dnia poprzedzającego `entryDate` (reguła podatkowa) czy z dnia wpisu? Czy dopuszczamy ręczne nadpisanie kursem z faktury?
3. Czy katalog materiałów (`Material.priceNetto`) ma dostać własną walutę, czy wystarczy przeliczenie przy kopiowaniu do zamówienia?
4. Czy potrzebne są zestawienia przekrojowe (wiele zamówień) — jeśli tak, w jakiej walucie raportować?
