# Import MongoDB backup to local database
# Use this if you already have a backup file/folder

param(
    [Parameter(Mandatory=$false)]
    [string]$BackupPath,
    [string]$DBName = "sac_helpdesk",
    [string]$LocalConnectionString = "mongodb://localhost:27017"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MongoDB Backup Import" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# If no backup path provided, look in mongodb-backup folder
if (-not $BackupPath) {
    $backupFolder = ".\mongodb-backup"
    if (Test-Path $backupFolder) {
        $backups = Get-ChildItem -Path $backupFolder -Filter "*.tar.gz" | Sort-Object LastWriteTime -Descending
        if ($backups.Count -gt 0) {
            Write-Host "Found backup files:" -ForegroundColor Cyan
            for ($i = 0; $i -lt $backups.Count; $i++) {
                Write-Host "  [$i] $($backups[$i].Name) ($('{0:N2}' -f ($backups[$i].Length / 1MB)) MB)" -ForegroundColor Gray
            }
            Write-Host ""
            $selection = Read-Host "Select backup number (0-$($backups.Count - 1))"
            $BackupPath = $backups[[int]$selection].FullName
        } else {
            Write-Host "No .tar.gz backup files found in $backupFolder" -ForegroundColor Yellow
            $BackupPath = Read-Host "Enter backup path"
        }
    } else {
        $BackupPath = Read-Host "Enter backup path (file or folder)"
    }
}

# Check if it's a tar.gz file that needs extraction
if ($BackupPath -match "\.tar\.gz$") {
    Write-Host "Extracting compressed backup..." -ForegroundColor Cyan
    $extractPath = ".\mongodb-backup\extracted"
    if (-not (Test-Path $extractPath)) {
        New-Item -ItemType Directory -Path $extractPath | Out-Null
    }
    
    # Extract using tar (available in Windows 10+)
    tar -xzf "$BackupPath" -C "$extractPath"
    
    if ($LASTEXITCODE -eq 0) {
        # Find the extracted folder
        $extractedFolders = Get-ChildItem -Path $extractPath -Directory
        if ($extractedFolders.Count -gt 0) {
            $BackupPath = $extractedFolders[0].FullName
            Write-Host "✓ Extracted to: $BackupPath" -ForegroundColor Green
        }
    } else {
        Write-Host "❌ Extraction failed!" -ForegroundColor Red
        exit 1
    }
}

# Check if backup path exists
if (-not (Test-Path $BackupPath)) {
    Write-Host "❌ Backup path not found: $BackupPath" -ForegroundColor Red
    exit 1
}

# Check if mongorestore is installed
$mongorestoreExists = Get-Command mongorestore -ErrorAction SilentlyContinue

if (-not $mongorestoreExists) {
    Write-Host "❌ mongorestore not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install MongoDB Database Tools from:" -ForegroundColor Yellow
    Write-Host "https://www.mongodb.com/try/download/database-tools" -ForegroundColor Yellow
    exit 1
}

# Check if local MongoDB is running
$localMongo = Test-NetConnection -ComputerName localhost -Port 27017 -WarningAction SilentlyContinue

if (-not $localMongo.TcpTestSucceeded) {
    Write-Host "❌ Local MongoDB is not running!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start MongoDB first." -ForegroundColor Yellow
    exit 1
}

Write-Host "⚠️  WARNING: This will overwrite your local database!" -ForegroundColor Yellow
Write-Host "Database: $DBName" -ForegroundColor Yellow
Write-Host "Source: $BackupPath" -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Continue? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "Import cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Importing backup to local MongoDB..." -ForegroundColor Cyan

try {
    # Check if backup path is a directory with database folder or direct database folder
    if (Test-Path (Join-Path $BackupPath $DBName)) {
        $importPath = Join-Path $BackupPath $DBName
    } else {
        $importPath = $BackupPath
    }
    
    & mongorestore --uri="$LocalConnectionString" --db="$DBName" --drop "$importPath"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Import completed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Local MongoDB connection string:" -ForegroundColor Cyan
        Write-Host "  mongodb://localhost:27017/$DBName" -ForegroundColor White
    } else {
        Write-Host "❌ Import failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Import error: $_" -ForegroundColor Red
    exit 1
}
