# ============================================================================
# Emergency Frontend Fix Script
# ============================================================================
# This script will manually check and fix the frontend deployment issue
# ============================================================================

Write-Host "========================================" -ForegroundColor Red
Write-Host "EMERGENCY FRONTEND FIX" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

# First, let's rebuild locally to confirm our build is correct
Write-Host "Step 1: Rebuilding frontend locally..." -ForegroundColor Yellow
cd frontend

Write-Host "Checking dist folder before build..." -ForegroundColor Gray
if (Test-Path "dist") {
    Remove-Item -Recurse -Force dist
    Write-Host "Cleared old dist folder" -ForegroundColor Gray
}

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Build completed" -ForegroundColor Green
Write-Host ""

Write-Host "Step 2: Verifying build output..." -ForegroundColor Yellow
if (!(Test-Path "dist/index.html")) {
    Write-Host "✗ index.html NOT in dist folder!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ index.html exists" -ForegroundColor Green

if (Test-Path "dist/_redirects") {
    Write-Host "✓ _redirects exists" -ForegroundColor Green
} else {
    Write-Host "✗ _redirects missing" -ForegroundColor Yellow
}

if (Test-Path "dist/.htaccess") {
    Write-Host "✓ .htaccess exists" -ForegroundColor Green
} else {
    Write-Host "✗ .htaccess missing" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 3: Showing index.html content..." -ForegroundColor Yellow
Write-Host "--- First 10 lines of dist/index.html ---" -ForegroundColor Gray
Get-Content "dist/index.html" -Head 10

Write-Host ""
Write-Host "Step 4: Listing all files in dist..." -ForegroundColor Yellow
Get-ChildItem -Path dist -Recurse -File | Select-Object -First 20 | ForEach-Object {
    Write-Host "  $($_.FullName.Replace($PWD, '.'))" -ForegroundColor Gray
}

cd ..

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DIAGNOSIS COMPLETE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The build looks correct locally." -ForegroundColor Yellow
Write-Host ""
Write-Host "POSSIBLE ISSUES ON SERVER:" -ForegroundColor Yellow
Write-Host "1. nginx might have a custom 404 page configured" -ForegroundColor White
Write-Host "2. The root directory might be wrong" -ForegroundColor White
Write-Host "3. File permissions might be incorrect" -ForegroundColor White
Write-Host "4. The nginx config file might not be active" -ForegroundColor White
Write-Host ""
Write-Host "SOLUTION:" -ForegroundColor Green
Write-Host "Run the Bitbucket pipeline again to redeploy:" -ForegroundColor White
Write-Host "  https://bitbucket.org/hubblehox-technologies/helpdesk/pipelines" -ForegroundColor Cyan
Write-Host ""
Write-Host "OR manually check on the server:" -ForegroundColor White
Write-Host "  ssh ubuntu@34.14.157.13" -ForegroundColor Gray
Write-Host "  ls -la /var/www/helpdesk/frontend/" -ForegroundColor Gray
Write-Host "  cat /var/www/helpdesk/frontend/index.html" -ForegroundColor Gray
Write-Host "  cat /etc/nginx/sites-enabled/helpdesk.hubblehox.ai" -ForegroundColor Gray
