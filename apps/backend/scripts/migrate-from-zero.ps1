<#
.SYNOPSIS
    Migrasi dari nol: hapus database (DEFAULT=test), buat ulang, jalankan migrasi
    Prisma sampai bersih, lalu opsi seed.

.DESCRIPTION
    Skrip QA untuk memastikan proyek berjalan dari keadaan kosong
    (Promt §20.4 skenario migrasi). Destructive by design: database yang
    ditunjuk AKAN di-drop. Nama database diwajibkan memuat "test" kecuali
    -AllowProductionName dipakai secara eksplisit, agar tidak pernah menghapus
    data bisnis karena salah ketik.

    Larutan Prisma v7: dilewatkan lewat DATABASE_URL lintas-perintah - TANPA
    `prisma migrate reset` (yang bisa menimpa .env developer).
#>
param(
    [string]$DatabaseName = "bisnis_insight_test",
    [string]$DatabaseHost = "127.0.0.1",
    [string]$DatabasePort = "3306",
    [string]$DatabaseUser = "root",
    [string]$DatabasePassword = "",
    [switch]$Seed,
    [switch]$AllowProductionName,
    [switch]$Yes
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

$mysqlClient = Resolve-MySqlClient "mysql"

if (-not $DatabaseName.Contains("test") -and -not $AllowProductionName) {
    throw "Nama database '$DatabaseName' tidak memuat 'test'. Skrip ini hanya untuk database test; pakai -AllowProductionName kalau Anda benar-benar yakin."
}

Write-Host "==> Target: ${DatabaseHost}:${DatabasePort}/${DatabaseName} (AKAN DIHAPUS)"
if (-not $Yes) {
    $continue = Read-Host "Lanjutkan? (y/N)"
    if ($continue -ne "y") { throw "Dibatalkan." }
}

# Argumen dikirim sebagai array agar aman dari spasi dan karakter khusus.
$mysqlArgs = @("-h", $DatabaseHost, "-P", $DatabasePort, "-u", $DatabaseUser)
if ($DatabasePassword -ne "") { $mysqlArgs += @("-p$DatabasePassword") }

Write-Host "==> Drop + create database"
& $mysqlClient @mysqlArgs "-e" "DROP DATABASE IF EXISTS ``$DatabaseName``; CREATE DATABASE ``$DatabaseName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if ($LASTEXITCODE -ne 0) { throw "mysql gagal." }

Write-Host "==> prisma migrate deploy (database, bukan reset)"
$env:DATABASE_URL = "mysql://${DatabaseUser}:${DatabasePassword}@${DatabaseHost}:${DatabasePort}/${DatabaseName}"
Push-Location $PSScriptRoot/..
try {
    # Lewat cmd /c supaya stderr npm tidak dianggap error-terminating oleh
    # PowerShell 5.1 (npm menulis notice-nya lewat stderr).
    cmd /c "npx prisma migrate deploy 2>&1"
    if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy gagal." }

    if ($Seed) {
        Write-Host "==> Seed data demo"
        node scripts/seed-toko-demo.mjs
        if ($LASTEXITCODE -ne 0) { throw "seed gagal." }
    }
} finally {
    Pop-Location
}

Write-Host "==> Selesai: '$DatabaseName' berdiri dari nol dengan skema terbaru."
