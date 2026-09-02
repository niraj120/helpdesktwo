# Export Production MongoDB to Local
# This script exports data from production MongoDB and imports it to local MongoDB

param(
    [string]$ServerIP = $env:MONGO_HOST,
    [string]$DBName = "sac_helpdesk",
    [string]$Username = "helpdesk-dev",
    [string]$Password = $env:MONGO_PASSWORD,
    [string]$BackupDir = ".\mongodb-backup",
    [string]$SSHUser = "",
    [string]$SSHHost = ""
)

if (-not $Password) {
    Write-Error "Password not supplied. Set $env:MONGO_PASSWORD or pass -Password."
    exit 1
}
if (-not $ServerIP) {
    Write-Error "Server not supplied. Set $env:MONGO_HOST or pass -ServerIP."
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MongoDB Production to Local Replication" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create backup directory
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
    Write-Host "✓ Created backup directory: $BackupDir" -ForegroundColor Green
}

# Check if MongoDB tools are installed
$mongodumpExists = Get-Command mongodump -ErrorAction SilentlyContinue
$mongorestoreExists = Get-Command mongorestore -ErrorAction SilentlyContinue

if (-not $mongodumpExists -or -not $mongorestoreExists) {
    Write-Host "❌ MongoDB Database Tools not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install MongoDB Database Tools from:" -ForegroundColor Yellow
    Write-Host "https://www.mongodb.com/try/download/database-tools" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or use Chocolatey:" -ForegroundColor Yellow
    Write-Host "  choco install mongodb-database-tools" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "Step 1: Export from Production" -ForegroundColor Yellow
Write-Host "==============================" -ForegroundColor Yellow
Write-Host ""

# If SSH tunnel is needed
if ($SSHUser -and $SSHHost) {
    Write-Host "Setting up SSH tunnel..." -ForegroundColor Cyan
    Write-Host "Run this in a separate terminal:" -ForegroundColor Yellow
    Write-Host "  ssh -L 27018:${ServerIP}:27017 ${SSHUser}@${SSHHost}" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Enter when tunnel is ready..." -ForegroundColor Yellow
    Read-Host
    
    $ConnectionString = "mongodb://${Username}:${Password}@localhost:27018/${DBName}?authSource=admin"
    $HostPort = "localhost:27018"
} else {
    $ConnectionString = "mongodb://${Username}:${Password}@${ServerIP}:27017/${DBName}?authSource=admin"
    $HostPort = "${ServerIP}:27017"
}

# Test connection first
Write-Host "Testing connection to production database..." -ForegroundColor Cyan
$testResult = Test-NetConnection -ComputerName $ServerIP -Port 27017 -WarningAction SilentlyContinue

if (-not $testResult.TcpTestSucceeded -and -not ($SSHUser -and $SSHHost)) {
    Write-Host "❌ Cannot connect to $ServerIP`:27017" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible solutions:" -ForegroundColor Yellow
    Write-Host "1. Use SSH tunnel - rerun with -SSHUser and -SSHHost parameters" -ForegroundColor Cyan
    Write-Host "2. Ask admin to whitelist your IP address" -ForegroundColor Cyan
    Write-Host "3. Connect to VPN if required" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Export from production
Write-Host "Exporting database from production..." -ForegroundColor Cyan
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$exportPath = Join-Path $BackupDir "export-$timestamp"

try {
    & mongodump --uri="$ConnectionString" --out="$exportPath"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Export completed successfully!" -ForegroundColor Green
        Write-Host "  Location: $exportPath" -ForegroundColor Gray
    } else {
        Write-Host "❌ Export failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Export error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2: Import to Local MongoDB" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Yellow
Write-Host ""

# Check if local MongoDB is running
$localMongo = Test-NetConnection -ComputerName localhost -Port 27017 -WarningAction SilentlyContinue

if (-not $localMongo.TcpTestSucceeded) {
    Write-Host "❌ Local MongoDB is not running!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start MongoDB:" -ForegroundColor Yellow
    Write-Host "  net start MongoDB" -ForegroundColor Cyan
    Write-Host "Or:" -ForegroundColor Yellow
    Write-Host "  mongod --dbpath=C:\data\db" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "⚠️  WARNING: This will overwrite your local database!" -ForegroundColor Yellow
Write-Host "Database: $DBName" -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Continue? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "Import cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Importing to local MongoDB..." -ForegroundColor Cyan

$localConnectionString = "mongodb://localhost:27017"

try {
    & mongorestore --uri="$localConnectionString" --db="$DBName" --drop "$exportPath\$DBName"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Import completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "❌ Import failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Import error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ Replication Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local MongoDB connection string:" -ForegroundColor Cyan
Write-Host "  mongodb://localhost:27017/$DBName" -ForegroundColor White
Write-Host ""
Write-Host "Backup saved at: $exportPath" -ForegroundColor Gray
