<#
.SYNOPSIS
    Sync sekcji '## ZMIENNE - indeks' z SLOWNIK.md (repo) do pliku Obsidian.

.DESCRIPTION
    1. Czyta SLOWNIK.md z repo Ignite
    2. Wyciaga sekcje '## ZMIENNE - indeks' (od naglowka do konca pliku)
    3. Wyciaga unikalne tagi z 1. kolumny wszystkich tabel
    4. Generuje frontmatter YAML + statyczny wstep + wkleja indeks 1:1
    5. Nadpisuje plik Obsidian (pelne nadpisanie - bez markerow)
    6. Loguje do %TEMP%\ignite-sync-obsidian.log

.NOTES
    Uruchamiane przez Windows Task Scheduler codziennie o 18:00.
    Konfiguracja taska: setup-task-scheduler.ps1
#>

# @anchor sync-obsidian-script

# Wymus UTF-8 dla calego pipeline
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = 'Stop'

# === Sciezki ===
$RepoRoot     = 'C:\Users\Andrzej\.gemini\antigravity\scratch\Ignite'
$SlownikPath  = Join-Path $RepoRoot 'SLOWNIK.md'
$ObsidianPath = 'G:\Mój dysk\obsidian\vibe_codes\Ignite — zmienne projektu.md'
$LogPath      = Join-Path $env:TEMP 'ignite-sync-obsidian.log'

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$timestamp] [$Level] $Message"
    Add-Content -Path $LogPath -Value $line -Encoding utf8
}

try {
    Write-Log "=== START sync-obsidian.ps1 ==="

    # === Walidacja sciezek ===
    if (-not (Test-Path $SlownikPath)) {
        throw "Nie znaleziono SLOWNIK.md w: $SlownikPath"
    }
    $obsidianDir = Split-Path $ObsidianPath -Parent
    if (-not (Test-Path $obsidianDir)) {
        throw "Nie znaleziono katalogu Obsidian: $obsidianDir"
    }

    # === Czytaj SLOWNIK ===
    $slownik = Get-Content $SlownikPath -Raw -Encoding utf8
    Write-Log "Wczytano SLOWNIK.md - $($slownik.Length) znakow"

    # === Wyciagnij sekcje ZMIENNE - indeks ===
    # Marker to NAGLOWEK H2 (^## ...$), nie inline tekst.
    # W SLOWNIK fraza "## ZMIENNE - indeks" wystepuje tez jako referencja
    # w sekcji TAGI ZMIENNYCH - dlatego trzeba dopasowac do poczatku linii.
    $emDashChar = [char]0x2014
    $markerRegex = [regex]"(?m)^## ZMIENNE $emDashChar indeks\s*$"
    $markerMatch = $markerRegex.Match($slownik)
    if (-not $markerMatch.Success) {
        throw "Nie znaleziono naglowka H2 '## ZMIENNE $emDashChar indeks' w SLOWNIK.md"
    }
    $startIdx = $markerMatch.Index
    $indexSection = $slownik.Substring($startIdx)
    Write-Log "Wyciagnieto sekcje indeksu - $($indexSection.Length) znakow (od pozycji $startIdx)"

    # === Wyciagnij unikalne tagi z tabel ===
    $tagRegex = [regex]'(?m)^\|\s*((?:ui|back|schema)-[a-z\-]+)\s*\|'
    $tags = @()
    foreach ($match in $tagRegex.Matches($indexSection)) {
        $tag = $match.Groups[1].Value
        if ($tags -notcontains $tag) {
            $tags += $tag
        }
    }
    $tags = $tags | Sort-Object
    Write-Log "Znaleziono $($tags.Count) unikalnych tagow"

    # === Zliczanie wpisow per modul ===
    $moduleCounts = [ordered]@{}
    $currentModule = $null
    foreach ($line in ($indexSection -split "`n")) {
        if ($line -match '^### (.+)$') {
            $currentModule = $matches[1].Trim()
            if (-not $moduleCounts.Contains($currentModule)) {
                $moduleCounts[$currentModule] = 0
            }
        } elseif ($line -match '^\|\s*(ui|back|schema)-' -and $currentModule) {
            $moduleCounts[$currentModule]++
        }
    }
    $totalEntries = 0
    foreach ($k in $moduleCounts.Keys) { $totalEntries += $moduleCounts[$k] }
    Write-Log "Lacznie wpisow: $totalEntries w $($moduleCounts.Count) modulach"

    # === Generuj frontmatter ===
    $today = Get-Date -Format 'yyyy-MM-dd'
    $frontmatterTags = @(
        'vibe-code'
        'erp'
        'projekt/Ignite'
        'indeks-zmiennych'
        'status/aktywny'
    ) + $tags
    $frontmatterTagsYaml = ($frontmatterTags | ForEach-Object { "  - $_" }) -join "`n"

    $frontmatter = @"
---
tags:
$frontmatterTagsYaml
created: 2026-05-18
updated: $today
projekt: Ignite
lokalizacja: apps/backend
auto_generated_by: sync-obsidian.ps1
---
"@

    # === Statystyka pokrycia ===
    $coverageLines = @('**Statystyka pokrycia (auto):**')
    foreach ($mod in $moduleCounts.Keys) {
        $coverageLines += "- $mod $([char]0x2014) $($moduleCounts[$mod]) wpisow"
    }
    $coverage = $coverageLines -join "`n"

    # === Statyczny wstep (polski tekst przez here-string) ===
    $emDash = [char]0x2014
    $intro = @"
# Ignite $emDash zmienne projektu

Pelny indeks zaindeksowanych zmiennych projektu Ignite. Kazda zmienna ma tag z taksonomii ``ui- / back- / schema-`` oraz stabilny anchor ``// @anchor`` w kodzie.

**Zrodlo prawdy**: ``SLOWNIK.md`` w repo (``$SlownikPath``) sekcja ``## ZMIENNE $emDash indeks``. Ta notatka jest jego lustrzanym widokiem dla Obsidian Omnisearch.

**Aktualizacja**: plik wygenerowany automatycznie przez ``sync-obsidian.ps1`` $emDash Windows Task Scheduler odpala go codziennie o 18:00. Wszelkie reczne zmiany w tym pliku zostana nadpisane przy nastepnym sync.

$coverage
"@

    # === Statyczne powiazane notatki ===
    $relatedNotes = @"

---

## Powiazane notatki

- [[Ignite $emDash slownik]] $emDash definicje tagow i skroty komunikacyjne
- [[Ignite $emDash zmienne i drzewo firmy]] $emDash modele bazodanowe (pelny opis pol)
- [[Ignite $emDash architektura]]
- [[Ignite $emDash API]]
- [[struktura zmiennych oferty]]
- [[logikaWBS]]
"@

    # === Zloz calosc ===
    $output = $frontmatter + "`n`n" + $intro + "`n`n" + $indexSection.TrimEnd() + $relatedNotes + "`n"

    # === Zapisz ===
    # Set-Content z -Encoding utf8 dodaje BOM w PS 5.1.
    # Aby uniknac BOM, uzywam .NET WriteAllText.
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($ObsidianPath, $output, $utf8NoBom)

    Write-Log "Zapisano: $ObsidianPath - $($output.Length) znakow"
    Write-Log "=== KONIEC sync-obsidian.ps1 (sukces) ==="

} catch {
    Write-Log "BLAD: $_" 'ERROR'
    Write-Log "Stack: $($_.ScriptStackTrace)" 'ERROR'
    Write-Log "=== KONIEC sync-obsidian.ps1 (blad) ==="
    exit 1
}
