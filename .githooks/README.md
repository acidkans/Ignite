# .githooks

Pre-commit hooki dla projektu Ignite. Versioned (commitowane do repo), więc działają tak samo na każdej maszynie po jednorazowej konfiguracji.

## Instalacja (jednorazowo po klonie repo)

```bash
git config core.hooksPath .githooks
```

Na Windows (Git Bash / WSL) — identycznie. Na czystym PowerShell też zadziała, bo to konfiguracja gita, nie shellu.

Po wykonaniu tej komendy git będzie szukał hooków w `.githooks/` zamiast w `.git/hooks/`.

### Sprawdzenie

```bash
git config --get core.hooksPath
# powinno zwrócić: .githooks
```

### Uprawnienia (Linux/macOS)

Jeśli hook nie odpala (linux/macos), nadaj uprawnienia wykonywania:

```bash
chmod +x .githooks/pre-commit
```

Na Windows uprawnień nie trzeba ustawiać — git uruchamia bash-skrypty przez `sh.exe`.

## Hooki

### `pre-commit` — walidacja `@anchor` w SLOWNIK.md

Blokuje commit jeśli w staged plikach `.js / .jsx / .ts / .tsx / .prisma` pojawia się nowy komentarz `// @anchor <nazwa>`, a w `SLOWNIK.md` brak odpowiadającego wpisu w sekcji `## ZMIENNE — indeks`.

Walidacja patrzy TYLKO na nowo dodane linie (znak `+` w diff staged area), więc legacy kod bez anchorów nie blokuje commitów na nieruszanych plikach.

#### Co zrobić gdy hook blokuje commit

1. Otwórz `SLOWNIK.md`
2. Dodaj wiersz w tabeli `## ZMIENNE — indeks`:
   ```
   | <tag> | <nazwa zmiennej> | <ścieżka pliku> | @anchor <nazwa-anchora> |
   ```
3. `git add SLOWNIK.md`
4. `git commit` ponownie

#### Pomijanie (NIE rób rutynowo)

```bash
git commit --no-verify
```

Zostawione na sytuacje awaryjne (hotfix produkcyjny w środku nocy). Każde użycie powinno być uzupełnione wpisem w SLOWNIK.md przy następnej okazji.
