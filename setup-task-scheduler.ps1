<#
.SYNOPSIS
    Configures Windows Task Scheduler - daily Obsidian variables sync at 18:00.

.DESCRIPTION
    Creates task 'Ignite - sync Obsidian zmienne' that runs sync-obsidian.ps1
    daily at 18:00. Wakes computer if asleep.

    Run ONCE after cloning the repo or when you want to change the schedule.
    REQUIRES PowerShell run AS ADMINISTRATOR.

    Script uses ASCII-only task name to avoid PowerShell 5.1 encoding issues
    with the registered task name (em-dash gets mojibaked otherwise).

.NOTES
    To remove the task manually:
        Unregister-ScheduledTask -TaskName 'Ignite - sync Obsidian zmienne' -Confirm:$false

    To check status:
        Get-ScheduledTask -TaskName 'Ignite - sync Obsidian zmienne'
        Get-ScheduledTaskInfo -TaskName 'Ignite - sync Obsidian zmienne'

    To run manually:
        Start-ScheduledTask -TaskName 'Ignite - sync Obsidian zmienne'

    To see log:
        Get-Content "$env:TEMP\ignite-sync-obsidian.log" -Tail 20
#>

#Requires -RunAsAdministrator

# @anchor setup-task-scheduler-script

$ErrorActionPreference = 'Stop'

# === Parameters ===
$TaskName    = 'Ignite - sync Obsidian zmienne'
$ScriptPath  = 'C:\Users\Andrzej\.gemini\antigravity\scratch\Ignite\sync-obsidian.ps1'
$RunTime     = '18:00'
$Description = 'Daily sync of ZMIENNE - indeks section from SLOWNIK.md (Ignite repo) to Obsidian vault. See CLAUDE.md.'

# Validate
if (-not (Test-Path $ScriptPath)) {
    throw "sync-obsidian.ps1 not found at: $ScriptPath"
}

# === Remove ALL old Ignite/Obsidian sync tasks (any naming variant) ===
# This includes the broken mojibake-named task from previous registrations.
$existingTasks = Get-ScheduledTask | Where-Object {
    ($_.TaskName -like '*Ignite*Obsidian*') -or
    ($_.TaskName -like '*sync Obsidian*') -or
    ($_.TaskName -like '*Ignite*sync*')
}

foreach ($t in $existingTasks) {
    Write-Output "Removing old task: '$($t.TaskName)' (path: $($t.TaskPath))"
    Unregister-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath -Confirm:$false
}

# === Define new task ===
$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At $RunTime

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

# === Register ===
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description $Description | Out-Null

Write-Output ""
Write-Output "OK - task created:"
Write-Output "  Name:     $TaskName"
Write-Output "  Script:   $ScriptPath"
Write-Output "  Schedule: daily at $RunTime"
Write-Output ""
Write-Output "Check:        Get-ScheduledTask -TaskName '$TaskName'"
Write-Output "Run now:      Start-ScheduledTask -TaskName '$TaskName'"
Write-Output "Remove:       Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
Write-Output ""
Write-Output "Log file:     $env:TEMP\ignite-sync-obsidian.log"
