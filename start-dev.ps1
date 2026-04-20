# ERP Dev Starter - uruchamia backend, czeka na port 3001, potem frontend
Write-Host "Stopping existing Node processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Starting backend..." -ForegroundColor Cyan
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\apps\backend'; npm run start" -PassThru

Write-Host "Waiting for backend on port 3001..." -ForegroundColor Cyan
$maxWait = 30
$waited = 0
do {
    Start-Sleep -Seconds 1
    $waited++
    $result = Test-NetConnection -ComputerName 127.0.0.1 -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue
} while (-not $result -and $waited -lt $maxWait)

if ($result) {
    Write-Host "Backend ready! Starting frontend..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\apps\frontend'; npm run dev"
} else {
    Write-Host "ERROR: Backend did not start within ${maxWait}s!" -ForegroundColor Red
    exit 1
}
