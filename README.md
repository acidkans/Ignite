# Ignite ERP

System ERP do zarządzania projektami inwestycyjnymi w branży telekomunikacyjnej / instalacyjnej — od oferty, przez WBS i wymagania materiałowe, aż po dokumentację techniczną z OCR i schematy obiektów.

Stack: **NestJS + Prisma + PostgreSQL** (backend), **React + Vite + AG Grid** (frontend), **Qdrant** (wektorowa baza dla AI), **Docker Compose** (orkiestracja).

---

## Główne moduły

- **WBS (Work Breakdown Structure)** — drzewiasta struktura projektu (`ProcessNode` + `WbsNode`) z dziedziczeniem wymagań w dół drzewa, hot-pricing, obliczaniem głębokości w runtime.
- **Wymagania materiałowe** — panel `MaterialRequirementsPanel3` z agregacją na poziomie `WbsNode`, obsługą wielu materiałów na jeden węzeł, technicznymi specyfikacjami z aliasów AI.
- **Oferty / Budżet / Materiały celowe** — eksporty PDF generowane przez wspólny pipeline `buildPdfDocument` + `openPdfBlob` (`wbsPdfExport.js`), z walidacją cen przed eksportem oferty i budżetu.
- **Dokumentacja techniczna** — upload PDF/obrazów, podgląd z wirtualizacją stron (`PdfPageWithHighlights` + `IntersectionObserver`), warstwa highlightów, ekstrakcja chunków przez `parser-service`.
- **Schematy obiektów** — desktopowy panel kafelkowy znacznika + mobilny widok „Drzewo Zamówień ze schematami”, z synchronizacją widoczności między urządzeniami.
- **Mobile** — ekran startowy z 2 kafelkami, licznik pytań auto-odświeżany po zapisie, schemat jako bottom-sheet.
- **Firma (singleton)** — `/firma` jako pojedynczy rekord `Company` (id=`singleton`) używany do globalnych wyliczeń (np. domyślny adres źródłowy do kalkulacji paliwa).
- **AI / RAG** — integracja z Google Generative AI + HuggingFace, embeddingi w Qdrant, mailer (`@nestjs-modules/mailer`).

---

## Architektura

```
apps/
├── backend/         # NestJS — REST API, Prisma ORM, auth (JWT + Passport)
│   ├── prisma/      # schema.prisma (39 modeli) + migracje
│   └── uploads/     # pliki użytkowników (PDF, obrazy)
├── frontend/        # React + Vite + AG Grid Enterprise + react-pdf + pdf-lib
├── parser-service/  # mikrousługa parsująca PDF do chunków dla RAG
└── docker-compose.yml  # postgres, qdrant, backend, frontend
```

---

## Quick start (dev)

```powershell
# 1. Bazy danych (Postgres + Qdrant) w Dockerze
cd apps
docker compose up db vector-db -d

# 2. Backend (port 3001)
cd backend
npm install
npx prisma migrate dev
npm run start:dev

# 3. Frontend (Vite dev na 5174, Docker na 5173)
cd ../frontend
npm install
npm run dev
```

Pełna instrukcja deploymentu (lokalnie hybrydowo + produkcja Full Docker) — patrz [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## Konwencje projektu

Projekt ma trzy „żywe” dokumenty w korzeniu, które MUSZĄ być aktualizowane wraz z kodem:

| Plik | Co | Kiedy aktualizować |
|------|----|---------------------|
| [`CHANGELOG.md`](CHANGELOG.md) | Zmiany strukturalne (schema, API, eksporty PDF) | Przed każdym commitem zmiany strukturalnej |
| [`SLOWNIK.md`](SLOWNIK.md) | Indeks zmiennych z anchorami (`@anchor xxx`) | Przy dodaniu / rename / usunięciu zmiennej zaindeksowanej |
| [`CLAUDE.md`](CLAUDE.md) | Instrukcje dla AI: taksonomia tagów `ui-/back-/schema-`, workflow | Gdy ustalono nową zasadę |

Pre-commit hook (`.githooks/pre-commit`) waliduje obecność nowych `@anchor` w `SLOWNIK.md` i blokuje commit jeśli są niezaindeksowane. Instalacja po klonie:

```bash
git config core.hooksPath .githooks
```

### Taksonomia tagów zmiennych

Każda zaindeksowana zmienna ma prefix:
- `ui-*` — frontend (komponenty, hooki, kolumny AG Grid, panele, modale)
- `back-*` — backend (endpointy, serwisy, DTO, skrypty)
- `schema-*` — `schema.prisma` (modele, pola, relacje, enumy)

Pełna lista tagów: `CLAUDE.md` sekcja „Tagi zmiennych”.

---

## Wersjonowanie

Wersja produkcyjna wyświetlana jest w `LoginPage.jsx` w formacie `vYYYY.MM.DD.NNN` i inkrementowana przy każdej zmianie kodu.

---

## Licencja

Projekt wewnętrzny — gigatel.app. Wszelkie prawa zastrzeżone.
