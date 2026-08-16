# ERP Dev Starter - backend (3001) + frontend (5174) w dwoch osobnych oknach.
# Uruchamianie: skrot "Ignite dev" z pulpitu/paska zadan albo recznie:
#   powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
# Wszystkie wywolania npm ida przez npm.cmd - shim npm.ps1 blokuje ExecutionPolicy.
# UWAGA: plik trzymamy w czystym ASCII. PowerShell 5.1 czyta .ps1 bez BOM jako ANSI,
# wiec polskie znaki i myslniki "em dash" rozsypuja sie na znaki, ktore parser bierze
# za cudzyslowy - skrypt przestaje sie parsowac.

$root = $PSScriptRoot

# Porty zwalniamy PO PORCIE, nie po nazwie procesu: dawne "Stop-Process -Name node"
# ubijalo takze node'y innych projektow i edytora.
foreach ($port in 3001, 5174) {
    $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $pids) {
        Write-Host "Zwalniam port ${port}: ubijam proces $processId" -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Seconds 1

Write-Host "Start backendu (3001)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\apps\backend'; npm.cmd run start:dev"

Write-Host "Czekam az backend odpowie na 3001..." -ForegroundColor Cyan
$waited = 0
do {
    Start-Sleep -Seconds 1
    $waited++
    $up = Test-NetConnection -ComputerName 127.0.0.1 -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue
} while (-not $up -and $waited -lt 90)

if (-not $up) {
    Write-Host "BLAD: backend nie wstal w ${waited}s - zajrzyj do okna backendu." -ForegroundColor Red
    Read-Host "Enter zamyka to okno"
    exit 1
}

# Port frontendu (5174) siedzi w vite.config.js jako strictPort - nie podajemy go tu drugi raz.
Write-Host "Backend gotowy po ${waited}s. Start frontendu (5174)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\apps\frontend'; npm.cmd run dev"

Write-Host ""
Write-Host "Gotowe - aplikacja: http://localhost:5174   API: http://localhost:3001" -ForegroundColor Green
Start-Sleep -Seconds 3
