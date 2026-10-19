<#
.SYNOPSIS
    Backup atau restore satu database MySQL lewat mysqldump/mysql.

.DESCRIPTION
    Skrip QA (Promt §20.4): prosedur backup/restore harus teruji, bukan hanya
    tertulis di laporan. Backup ditambah tanggal-jam tanpa menimpa backup
    sebelumnya; restore meminta konfirmasi karena menimpa seluruh isi database.

    Contoh:
        ./backup-restore.ps1 -Mode backup                    # database test default
        ./backup-restore.ps1 -Mode backup -DatabaseName bisnis_insight_analytics_db -DatabasePassword "rahasia"
        ./backup-restore.ps1 -Mode restore -File storage/backups/bisnis_insight_test_2026-10-19_0700.sql -Force
#>
param(
    [ValidateSet("backup", "restore")]
    [string]$Mode = "backup",
    [string]$DatabaseName = "bisnis_insight_test",
    [string]$DatabaseHost = "127.0.0.1",
    [string]$DatabasePort = "3306",
    [string]$DatabaseUser = "root",
    [string]$DatabasePassword = "",
    [string]$BackupDir = "..\..\..\storage\backups",
    [string]$File = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Resolve-MySqlClient([string]$name) {
    # Laragon/XAMPP sering tidak memasang klien MySQL di PATH; cari di lokasi
    # umum supaya skrip tetap hidup di mesin developer baru.
    $existing = Get-Command $name -ErrorAction SilentlyContinue
    if ($existing) { return $existing.Source }
    foreach ($root in @("C:\laragon\bin\mysql", "D:\laragon\bin\mysql", "C:\xampp\mysql\bin", "D:\xampp\mysql\bin")) {
        if (Test-Path $root) {
            $hit = Get-ChildItem -Path $root -Recurse -Filter "$name.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($hit) { return $hit.FullName }
        }
    }
    throw "Klien '$name' tidak ditemukan di PATH maupun lokasi Laragon/XAMPP umum."
}

# Backup hidup di repo-root/storage/backups; $PSScriptRoot = apps/backend/scripts.
$BackupDirDefault = "..\..\..\storage\backups"
if ($BackupDir -eq "..\..\storage\backups") { $BackupDir = $BackupDirDefault }

$mysqlClient = Resolve-MySqlClient "mysql"
$mysqldumpClient = if ($Mode -eq "backup") { Resolve-MySqlClient "mysqldump" } else { $null }

$mysqlArgs = @("-h", $DatabaseHost, "-P", $DatabasePort, "-u", $DatabaseUser)
if ($DatabasePassword -ne "") { $mysqlArgs += @("-p$DatabasePassword") }

if ($Mode -eq "backup") {
    $resolvedDir = Join-Path $PSScriptRoot $BackupDir
    if (-not (Test-Path $resolvedDir)) { New-Item -ItemType Directory -Path $resolvedDir | Out-Null }

    $stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
    $target = if ($File -ne "") { $File } else { Join-Path $resolvedDir "${DatabaseName}_${stamp}.sql" }

    Write-Host "==> Backup $DatabaseName -> $target"
    & $mysqldumpClient @mysqlArgs --single-transaction --routines --triggers $DatabaseName | Set-Content -Encoding UTF8 $target
    if ($LASTEXITCODE -ne 0) { throw "mysqldump gagal." }

    $size = (Get-Item $target).Length
    Write-Host "==> Selesai: $target ($([math]::Round($size/1KB, 1)) KB)"
    return
}

# Mode restore
if ($File -eq "") { throw "Mode restore wajib menyertakan -File <path backup>." }
if (-not (Test-Path $File)) { throw "File backup tidak ditemukan: $File" }

if (-not $Force) {
    Write-Host "RESTORE akan MENIMPA seluruh isi database '$DatabaseName' dengan isi $File."
    $continue = Read-Host "Lanjutkan? (y/N)"
    if ($continue -ne "y") { throw "Dibatalkan." }
}

Write-Host "==> Restore $File -> $DatabaseName"
& $mysqlClient @mysqlArgs "-e" "DROP DATABASE IF EXISTS ``$DatabaseName``; CREATE DATABASE ``$DatabaseName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if ($LASTEXITCODE -ne 0) { throw "mysql gagal saat menyiapkan database." }

Get-Content $File -Raw | & $mysqlClient @mysqlArgs $DatabaseName
if ($LASTEXITCODE -ne 0) { throw "mysql gagal saat restore." }

Write-Host "==> Selesai. Verifikasi cepat:"
& $mysqlClient @mysqlArgs "-e" "SELECT COUNT(*) AS tabel FROM information_schema.tables WHERE table_schema = '$DatabaseName';"
