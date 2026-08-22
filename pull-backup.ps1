<#
.SYNOPSIS
    Sciaga zrzuty produkcyjnej bazy ERP z serwera na ten komputer.

.DESCRIPTION
    Zrzuty na serwerze leza na TYM SAMYM dysku co baza - chronia przed zlym zapisem,
    ale nie przed utrata maszyny. Ten skrypt robi z nich kopie poza serwerem.

    Pobiera brakujace zrzuty (najnowsze -Ile sztuk), kazdy weryfikuje porownaniem
    sumy SHA256 z suma po stronie serwera i dopiero zweryfikowany plik dostaje docelowa
    nazwe. Starsze kopie lokalne kasuje.

.PARAMETER Katalog
    Gdzie trzymac kopie. Domyslnie $env:USERPROFILE\ignite-backups.
    NIE wskazuj katalogu repozytorium - zrzuty nie moga trafic do gita.

.PARAMETER Ile
    Ile najnowszych zrzutow trzymac lokalnie. Domyslnie 14.

.EXAMPLE
    .\pull-backup.ps1
    .\pull-backup.ps1 -Ile 30 -Katalog D:\kopie\ignite
#>
# @anchor pull-backup-script
param(
    [string] $Serwer  = 'gigatel',
    [string] $Zdalny  = '/srv/apps/erp/backups',
    [string] $Katalog = "$env:USERPROFILE\ignite-backups",
    [int]    $Ile     = 14
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Katalog)) { New-Item -ItemType Directory -Path $Katalog -Force | Out-Null }
$log = Join-Path $Katalog 'pull-backup.log'
function Zapisz($tekst) {
    $linia = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $tekst
    Add-Content -Path $log -Value $linia -Encoding utf8
    Write-Host $linia
}

# Lista zdalna: nazwa + suma kontrolna, jednym przejazdem po ssh.
$zdalne = & ssh $Serwer "ls -1t $Zdalny/erp_db_[0-9]*.sql.gz 2>/dev/null | head -$Ile | xargs -r sha256sum"
if ($LASTEXITCODE -ne 0) { Zapisz "BLAD: nie moge odpytac serwera $Serwer"; exit 1 }
if (-not $zdalne)        { Zapisz "BLAD: serwer nie ma zadnych zrzutow w $Zdalny"; exit 1 }

$pobrane = 0
$pominiete = 0
foreach ($wiersz in $zdalne) {
    if ($wiersz -notmatch '^([0-9a-f]{64})\s+(\S+)$') { continue }
    $sumaZdalna = $matches[1]
    $sciezka    = $matches[2]
    $nazwa      = Split-Path $sciezka -Leaf
    $cel        = Join-Path $Katalog $nazwa

    if (Test-Path $cel) {
        $sumaLokalna = (Get-FileHash $cel -Algorithm SHA256).Hash.ToLower()
        if ($sumaLokalna -eq $sumaZdalna) { $pominiete++; continue }
        Zapisz "ponawiam $nazwa - suma lokalna nie zgadza sie ze zdalna"
    }

    # Pobranie idzie do pliku .part; dopiero zgodna suma nadaje nazwe docelowa,
    # zeby przerwany transfer nie udawal poprawnej kopii.
    $tmp = "$cel.part"
    & scp -q "${Serwer}:${sciezka}" $tmp
    if ($LASTEXITCODE -ne 0) {
        if (Test-Path $tmp) { Remove-Item $tmp -Force }
        Zapisz "BLAD: nie pobralem $nazwa"
        continue
    }
    $sumaPobrana = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower()
    if ($sumaPobrana -ne $sumaZdalna) {
        Remove-Item $tmp -Force
        Zapisz "BLAD: $nazwa ma inna sume po pobraniu - odrzucam"
        continue
    }
    Move-Item $tmp $cel -Force
    $rozmiar = '{0:N0} KB' -f ((Get-Item $cel).Length / 1KB)
    Zapisz "pobrany $nazwa ($rozmiar)"
    $pobrane++
}

# Przyciecie lokalnych kopii - trzymamy tylko -Ile najnowszych.
$lokalne = Get-ChildItem $Katalog -Filter 'erp_db_*.sql.gz' | Sort-Object Name -Descending
if ($lokalne.Count -gt $Ile) {
    $doUsuniecia = $lokalne | Select-Object -Skip $Ile
    foreach ($p in $doUsuniecia) { Remove-Item $p.FullName -Force; Zapisz "usuniety stary $($p.Name)" }
}

$maNaDysku = (Get-ChildItem $Katalog -Filter 'erp_db_*.sql.gz').Count
Zapisz "gotowe: pobranych $pobrane, juz bylo $pominiete, kopii lokalnych $maNaDysku ($Katalog)"
