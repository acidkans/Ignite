# Słownik zmiennych projektu Ignite ERP

Dokument do komunikacji między Andrzejem a Claude.
Używaj nazwy z kolumny **Skrót** — Claude będzie wiedział dokładnie co zmienić.

---

## EKSPORTY PDF

| Skrót | Co robi (potocznie) | Funkcja | Plik | Wiersz |
|---|---|---|---|---|
| EKSPORT_OFERTA_PDF | Drukuje ofertę z tabelami WBS 1/2/3 | `handleExportPDF('oferta')` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 1032 |
| EKSPORT_WBS_PDF | Drukuje drzewo WBS ze statusami i Q&A | `handleExportPDF('wbs')` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 1032 |
| EKSPORT_BUDZET_PDF | Drukuje tabelę budżetu z kosztami | `handleExportPDF('budget')` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 1032 |
| EKSPORT_STRATEGIA_PDF | Drukuje tekst strategii projektu | `handleExportPDF('strategy')` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 1032 |
| EKSPORT_PROJEKT | Drukuje cały projekt: wymagania + WBS + materiały + Gantt | `exportProjectPdf` | `utils/projectPdfExport.js` | 121 |
| EKSPORT_WYMAGANIA | Drukuje zakładkę "Informacje o zamówieniu" | `exportRequirementsPdf` | `utils/requirementsPdfExport.js` | 21 |
| EKSPORT_QA | Generuje PDF z polami do ręcznego wpisania odpowiedzi | `exportQaFormPdf` | `components/shared/wbs/exportQaFormPdf.js` | 68 |
| IMPORT_QA | Wczytuje odpowiedzi z wypełnionego PDF z powrotem do systemu | `importQaFormPdf` | `components/shared/wbs/importQaFormPdf.js` | 3 |
| EKSPORT_MATERIALY_PDF | Drukuje tabelę materiałów ze zdjęciami | `exportToPdf` | `components/shared/wbs/WbsMaterialsPanel.jsx` | 1572 |

---

## EKSPORTY EXCEL

| Skrót | Co robi (potocznie) | Funkcja | Plik | Wiersz |
|---|---|---|---|---|
| EKSPORT_OFERTA_EXCEL | Eksportuje WBS 1/2/3 oferty do .xlsx (3 zakładki) | `handleExportWbsExcel` | `components/shared/wbs/UnifiedWbsPanel.jsx` | — |
| EKSPORT_MATERIALY_EXCEL | Eksportuje listę materiałów do .xlsx | `exportToExcel` | `components/shared/wbs/WbsMaterialsPanel.jsx` | 1370 |

---

## BAZA PDF (wspólna infrastruktura)

| Skrót | Co robi (potocznie) | Funkcja | Plik | Wiersz |
|---|---|---|---|---|
| BAZA_PDF | Buduje pełny dokument HTML z nagłówkiem powtarzanym na każdej stronie | `buildPdfDocument` | `utils/wbsPdfExport.js` | 84 |
| BAZA_CSS | Wspólne style dla wszystkich PDF | `PDF_BASE_CSS` | `utils/wbsPdfExport.js` | 5 |
| OTWORZ_PDF | Otwiera okno przeglądarki i wywołuje drukowanie | `openPdfBlob` | `utils/wbsPdfExport.js` | 71 |
| POBIERZ_LOGO | Pobiera logo firmy jako base64 | `fetchLogoDataUrl` | `utils/wbsPdfExport.js` | 121 |
| BUDUJ_TABELE_WBS | Buduje HTML tabeli WBS na wybranym poziomie zagłębienia | `buildWbsHtmlTable` | `utils/wbsPdfExport.js` | 142 |

---

## PANELE UI

| Skrót | Co robi (potocznie) | Komponent | Plik | Wiersz |
|---|---|---|---|---|
| PANEL_WBS | Główny panel: tabele WBS, budżet, Q&A, Gantt, oferta | `UnifiedWbsPanel` | `components/shared/wbs/UnifiedWbsPanel.jsx` | 72 |
| PANEL_MATERIALY | Panel wymagań materiałowych z kartami produktów | `WbsMaterialsPanel` | `components/shared/wbs/WbsMaterialsPanel.jsx` | 1054 |
| PANEL_WYMAGANIA | Zakładka "Informacje o zamówieniu" z terminami i kontaktami | `RequirementsTab` | `components/shared/RequirementsTab.jsx` | 71 |
| PANEL_INFO_WEZLA | Informacje o wybranym węźle drzewa | `NodeInfoTab` | `components/shared/NodeInfoTab.jsx` | 5 |
| PANEL_OFERTY | Zakładka z listą ofert | `OffersTab` | `components/shared/OffersTab.jsx` | 148 |
| GANTT | Wykres harmonogramu projektu | `GanttSection` | `components/shared/wbs/GanttSection.jsx` | 358 |
| DRZEWO | Lewy panel z hierarchią węzłów projektu | `DynamicSidebar` | `components/Layout/DynamicSidebar.jsx` | 17 |
| LOGOWANIE | Strona logowania i rejestracji | `LoginPage` | `LoginPage.jsx` | 5 |

---

## KONFIGURACJA

| Skrót | Co robi (potocznie) | Gdzie | Wiersz |
|---|---|---|---|
| WERSJA | Numer wersji widoczny na stronie logowania | `LoginPage.jsx` → linia z `v2026.XX.XX.NNN` | 209 |
| STALE | Wspólne etykiety: statusy, jednostki, waluty | `wbsConstants.js` | — |

---

## SERWER I DEPLOY

| Skrót | Co robi |
|---|---|
| DEPLOY | Wgrywa nową wersję na erp.gigatel.org |
| PUSH | Wysyła commit do GitHub |
| COMMIT | Zapisuje zmiany w historii Git |
| PRODUKCJA | Serwer live: https://erp.gigatel.org |
| DEV | Lokalne środowisko: port 5174 |

---

## DANE

| Skrót | Co to |
|---|---|
| WEZEL | Jeden element drzewa WBS |
| WBS1 / WBS2 / WBS3 | Tabele oferty na poziomie 1 / 2 / 3 zagłębienia |
| QA | Para pytanie + odpowiedź przypisana do węzła |
| KARTA_PRODUKTU | Szczegóły materiału: producent, model, zdjęcie, spec |
| OFERTA | Sekcja z tabelami WBS i tekstem ofertowym |

---

## ZASADY KOMUNIKACJI

- Przed zmianą Claude powie co planuje, jaką funkcję/komponent dotknie i w którym wierszu
- Nie robi zmian w więcej niż 1–2 plikach bez zgody
- Po commicie zawsze pyta o merge/push/deploy
- "Zmiany są w pliku" ≠ "działa" — zawsze powie co sprawdzić
