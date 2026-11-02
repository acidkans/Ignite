# Realizacja — nowy UI (MVP)

Branch: `nowy_UI_Realizacja` · start 2026-11-02 · mockup: https://claude.ai/artifact/LMyUHKTx78ULeEXg2PVibJ

## Cel MVP

PM prowadzi tydzień realizacji zamówienia z jednego ekranu: drzewo gałęzi po lewej (zoom na gałąź),
po prawej Kokpit gałęzi albo Macierz pozycji z rozwijanym wątkiem. Bez nowych tabel w bazie.

## Zakres

### Backend
1. `schema-pole` `WbsNode.shortName String?` — krótka nazwa do drzewa i tabel. Pełna `name` zostaje
   w ofercie, protokołach, eksportach. Migracja + `cloneVersionData` + `updateNode` (allowed).
2. `back-endpoint` `POST /orders/:nodeId/start-realization` — `orderStage ZAAKCEPTOWANE → REALIZACJA`,
   tylko ADMIN/MANAGER, wymaga `acceptedVersionId`, wpis `AuditLog` (`START_REALIZATION`).
3. `back-endpoint` `POST /orders/:nodeId/stop-realization` — powrót `REALIZACJA → ZAAKCEPTOWANE` (pomyłka).
4. `revokeAccept` — odmowa przy `orderStage = REALIZACJA` („najpierw cofnij uruchomienie realizacji”).

### Frontend — start realizacji
5. Modal akceptacji: po kciuku krok „Baseline zapisany” z przyciskami **Uruchom realizację** / **Później**.
6. Nagłówek przy zielonym przełączniku wersji: przycisk „Uruchom realizację” (etap ZAAKCEPTOWANE)
   albo chip „REALIZACJA” (z opcją cofnięcia w menu). Po uruchomieniu zamówienie otwiera się na zakładce realizacji.
7. „Cofnij akceptację” w liście wersji wyłączone przy etapie REALIZACJA (z podpowiedzią dlaczego).

### Frontend — widok „Realizacja” (nowa zakładka, stara zostaje jako „Realizacja (tabela)”)
8. Drzewo gałęzi WBS w LEWYM PANELU APLIKACJI (`DynamicSidebar`), pod aktywnym zamówieniem — tylko gdy
   otwarta jest zakładka Realizacja. Środek zostaje na Kokpit/Macierz na całą szerokość. Tylko odczyt
   (struktura zablokowana po baseline), same gałęzie bez pozycji:
   - zoom: klik w gałąź pokazuje jej poddrzewo, ścieżka nad drzewem wraca wyżej,
   - krótkie nazwy (`shortName` → heurystyka skracania), pełna w podpowiedzi, przełącznik „pełne nazwy”,
   - sygnały: pilne wpisy czatu (bloker), otwarte pytania Q&A, zadania po terminie,
   - filtr „tylko z sygnałami”, edycja `shortName` dwuklikiem (jedyna edycja w drzewie).
9. Widok **Macierz**: wiersz = pozycja; droga pozycji (zamówienie → dostawa → montaż → odbiór),
   plan / poniesione / różnica, terminy (dostawa = `entryDate` wpisu FORECAST), sygnały.
   Klik w wiersz rozwija: wątek pozycji · zakup i realizacja (osie edytowalne) · powiązania.
10. Widok **Kokpit**: KPI gałęzi (plan, poniesione + prognoza, zaawansowanie, odebrano, blokery, zadania),
    lista blokerów i otwartych pytań, wątek całej gałęzi z filtrami.
11. Wątek (tylko odczyt + odpowiedź czatem): `Comment` (+ `URGENT` = bloker, `RESOLVED` zamyka),
    `WbsNode.qa`, `QaMail`, `LeafActual`, `UserTask`, `AcceptanceProtocolItem` — po `wbsRootId`/`wbsNodeId`.

## Poza MVP (świadomie)
- generowanie `shortName` przez AI (brak kluczy AI na dev — najpierw heurystyka + ręczna edycja),
- modele Constraint, NodeQuestion, Permit, ChangeOrder, DailyLog,
- widoki Lookahead, Tablica, Rollout, Teren (telefon), kontrola kolizji dostaw, prognoza EAC.

## Kolejność prac
1. Schema + migracja dev (psql + wpis w `_prisma_migrations`), clone, updateNode.
2. Endpointy start/stop realizacji + blokada revoke. Restart `erp-backend`.
3. Przycisk startu w modalu i nagłówku.
4. Hook `useWatekRealizacji` (dane wątku), komponent `RealizacjaPanel` (drzewo + Macierz + Kokpit).
5. Weryfikacja w Chrome na dev, CHANGELOG, SLOWNIK, version.js. Commit dopiero po „tak”.

## Do decyzji później
- czy stara zakładka „Realizacja (tabela)” zostaje po wdrożeniu MVP,
- czy pilny wpis czatu wystarcza jako bloker, czy od razu robimy osobny model z terminem.
