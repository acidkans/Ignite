# PLAN — Opis zakresu prac (załącznik do oferty, PDF)

Wzór: `test/5G-Agencja-opis-zakresu-WZOR.pdf`. Cel: dokument zawsze o tej samej strukturze, generowany z drzewa WBS + danych zamówienia, z możliwością edycji przed zapisem.

## Nagłówek

| Pole | Źródło |
|---|---|
| Logo, dane Zamawiającego | kartoteka klienta |
| Inwestor / odbiorca końcowy | wymagania zamówienia |
| Nr oferty | `SKR/n/RRRR` — SKR = skrót klienta (3 litery, bez polskich znaków), n = wspólny licznik firmy, zerowany co rok; nadawany przy pierwszym zapisie PDF, potem stały |
| Wersja dokumentu | 1.0, 1.1… (rośnie przy każdym zapisie) + nazwa wersji WBS |
| Data | data generowania |
| Ważność oferty | pole oferty, domyślnie 30 dni, edytowalne |
| Termin realizacji | `projectStart–projectEnd` z wymagań |
| Kontakt Zamawiający | kontakty zamówienia |
| Kontakt Airtel | kierownik projektu (imię, telefon, e-mail) |

## Sekcje

| # | Sekcja | Źródło | Edycja |
|---|---|---|---|
| 1 | Przedmiot i cel projektu | AI z `projectGoal` (priorytet) + parsowanej dokumentacji zamówienia | tak, tylko w dokumencie (nie nadpisuje `projectGoal`) |
| 2 | Sytuacja wyjściowa i założenia | AI z `WbsNode.strategy` wszystkich gałęzi → wspólne założenia | tak |
| 3 | Struktura zakresu | AI rozpoznaje układ (najwyższe gałęzie = pakiety albo lokalizacje), użytkownik zatwierdza. Lokalizacje → macierz pakiet × lokalizacja (●/—); brak → lista pakietów | zatwierdzenie układu |
| 4 | Opis pakietów prac | AI per pakiet: strategia gałęzi + jej pozycje | tak |
| 5 | Zakres ilościowy | węzły z flagą „pokaż w opisie zakresu”. Lokalizacje → macierz + kolumna Razem; brak → Element / Ilość / j.m. | flaga per węzeł |
| 6 | Dostawy po stronie Airtel | ręcznie per oferta | tak |
| 7 | Poza zakresem / po stronie Zamawiającego | ręcznie per oferta | tak |
| 8 | Organizacja realizacji | szablon + szacowany czas prac (liczony z dni projektu), widoczny w PDF | tak |
| 9 | Dokumentacja i odbiór | szablon; gwarancja domyślnie 24 mies. | tak |
| – | Podpisy | stały blok Zamawiający / Airtel Services | – |

## Przepływ

1. Przycisk „Opis zakresu” w ofercie.
2. AI rozpoznaje układ drzewa → użytkownik zatwierdza/poprawia (pakiety vs lokalizacje).
3. Podgląd z edytorem markdown (jak „Cel projektu”) per sekcja; „wygeneruj ponownie” per sekcja.
4. Zapis: teksty trwale przy ofercie (ponowne generowanie ich nie nadpisuje), PDF do dokumentów zamówienia (jak „Analiza AI oferty”), nadanie nr oferty przy pierwszym zapisie, inkrement wersji.

## Zmiany danych (do zaprojektowania)

- `schema-pole` skrót klienta (3 litery, auto z nazwy bez polskich znaków, edytowalny) w kartotece klienta.
- `schema-pole` flaga „pokaż w opisie zakresu” w `WbsNode` (domyślnie false) + akcja „AI zaproponuj kluczowe pozycje”.
- `schema-model` dokument opisu zakresu per oferta: nr oferty, wersja, ważność, gwarancja, czas prac, układ (pakiety/lokalizacje), teksty sekcji 1, 2, 4, 6, 7, 8, 9.
- `schema-model` / licznik numerów ofert per rok (wspólny dla firmy).
- PDF: szablon serwerowy wzorem `apps/backend/src/ai/offer-ai-report.ts` (PdfService, Chromium).
