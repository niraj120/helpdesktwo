# Setup Local MongoDB Database for Development
# This script initializes your local database with schema and sample data

param(
    [string]$DBName = "sac_helpdesk",
    [switch]$SkipMongoDB
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Local Database Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

# Step 1: Check MongoDB is running
if (-not $SkipMongoDB) {
    Write-Host "Checking MongoDB..." -ForegroundColor Yellow
    $mongoRunning = Test-NetConnection -ComputerName localhost -Port 27017 -WarningAction SilentlyContinue

    if (-not $mongoRunning.TcpTestSucceeded) {
        Write-Host "   MongoDB is not running!" -ForegroundColor Red
        Write-Host ""
        Write-Host "   Starting MongoDB service..." -ForegroundColor Cyan
        
        try {
            Start-Service MongoDB -ErrorAction Stop
            Write-Host "   MongoDB started successfully" -ForegroundColor Green
            Start-Sleep -Seconds 2
        } catch {
            Write-Host "   Could not start MongoDB service" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "   Please start MongoDB manually:" -ForegroundColor Yellow
            Write-Host "     net start MongoDB" -ForegroundColor Cyan
            Write-Host "   Or:" -ForegroundColor Yellow
            Write-Host "     mongod --dbpath=C:\data\db" -ForegroundColor Cyan
            Write-Host ""
            exit 1
        }
    } else {
        Write-Host "   MongoDB is running" -ForegroundColor Green
    }
    Write-Host ""
}

# Step 2: Check if MongoDB tools are available
Write-Host "Checking MongoDB tools..." -ForegroundColor Yellow
$mongoExists = Get-Command mongosh -ErrorAction SilentlyContinue

if (-not $mongoExists) {
    Write-Host "   mongosh not found (optional)" -ForegroundColor Yellow
} else {
    Write-Host "   mongosh available" -ForegroundColor Green
}
Write-Host ""

# Step 3: Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeExists = Get-Command node -ErrorAction SilentlyContinue

if (-not $nodeExists) {
    Write-Host "   Node.js not found!" -ForegroundColor Red
    Write-Host "   Please install Node.js first" -ForegroundColor Yellow
    exit 1
}

$nodeVersion = node --version
Write-Host "   Node.js $nodeVersion" -ForegroundColor Green
Write-Host ""

# Step 4: Install backend dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
Push-Location backend

if (-not (Test-Path "node_modules")) {
    Write-Host "   Installing packages..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   npm install failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
} else {
    Write-Host "   Dependencies already installed" -ForegroundColor Green
}

Pop-Location
Write-Host ""

# Step 5: Update .env file
Write-Host "Updating backend .env..." -ForegroundColor Yellow
$envPath = "backend\.env"

if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    
    # Check if already using local MongoDB
    if ($envContent -match "MONGODB_URI=mongodb://localhost:27017/$DBName") {
        Write-Host "   Already configured for local MongoDB" -ForegroundColor Green
    } else {
        # Backup existing .env
        Copy-Item $envPath "$envPath.backup" -Force
        Write-Host "   Backed up existing .env" -ForegroundColor Green
        
        # Update MONGODB_URI
        $envContent = $envContent -replace "MONGODB_URI=.*", "MONGODB_URI=mongodb://localhost:27017/$DBName"
        $envContent = $envContent -replace "NODE_ENV=.*", "NODE_ENV=development"
        Set-Content $envPath $envContent
        
        Write-Host "   Updated .env for local database" -ForegroundColor Green
    }
} else {
    Write-Host "   .env file not found, creating..." -ForegroundColor Yellow
    @"
# Local Development Configuration
NODE_ENV=development
PORT=5000

# Local MongoDB
MONGODB_URI=mongodb://localhost:27017/$DBName

# JWT
JWT_SECRET=your-local-dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Email (optional for local dev)
EMAIL_ENABLED=false
"@ | Set-Content $envPath
    Write-Host "   Created .env file" -ForegroundColor Green
}
Write-Host ""

# Step 6: Run initialization script
Write-Host "Initializing database..." -ForegroundColor Yellow
Write-Host "   Running init-local-database.js..." -ForegroundColor Cyan
Write-Host ""

$env:MONGODB_URI = "mongodb://localhost:27017/$DBName"
Push-Location backend
node scripts/init-local-database.js
$initResult = $LASTEXITCODE
Pop-Location

if ($initResult -ne 0) {
    Write-Host ""
    Write-Host "Database initialization failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Local Database Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Connection String:" -ForegroundColor Cyan
Write-Host "   mongodb://localhost:27017/$DBName" -ForegroundColor White
Write-Host ""
Write-Host "Test Credentials:" -ForegroundColor Cyan
Write-Host "   Admin:   admin@sachelpdesk.com / Admin@123" -ForegroundColor White
Write-Host "   Agent:   agent@sachelpdesk.com / Admin@123" -ForegroundColor White
Write-Host "   Student: student@sachelpdesk.com / Admin@123" -ForegroundColor White
Write-Host ""
Write-Host "Start Development:" -ForegroundColor Cyan
Write-Host "   cd backend && npm run dev" -ForegroundColor White
Write-Host "   cd frontend && npm run dev" -ForegroundColor White
Write-Host ""
