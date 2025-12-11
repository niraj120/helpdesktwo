# ============================================================================
# Frontend 404 Diagnostic Script
# ============================================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Frontend 404 Diagnostics" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$server = "ubuntu@34.14.157.13"

Write-Host "1. Checking deployed files..." -ForegroundColor Yellow
ssh $server @"
echo '--- Files in /var/www/helpdesk/frontend/ ---'
ls -la /var/www/helpdesk/frontend/
echo ''
echo '--- Checking for index.html ---'
if [ -f /var/www/helpdesk/frontend/index.html ]; then
    echo '✓ index.html exists'
    head -20 /var/www/helpdesk/frontend/index.html
else
    echo '✗ index.html NOT FOUND'
fi
echo ''
echo '--- Checking for _redirects ---'
if [ -f /var/www/helpdesk/frontend/_redirects ]; then
    echo '✓ _redirects exists'
    cat /var/www/helpdesk/frontend/_redirects
else
    echo '✗ _redirects NOT FOUND'
fi
echo ''
echo '--- Checking for .htaccess ---'
if [ -f /var/www/helpdesk/frontend/.htaccess ]; then
    echo '✓ .htaccess exists'
    cat /var/www/helpdesk/frontend/.htaccess
else
    echo '✗ .htaccess NOT FOUND'
fi
"@

Write-Host ""
Write-Host "2. Checking nginx configuration..." -ForegroundColor Yellow
ssh $server @"
echo '--- nginx configuration for helpdesk.hubblehox.ai ---'
if [ -f /etc/nginx/sites-available/helpdesk.hubblehox.ai ]; then
    cat /etc/nginx/sites-available/helpdesk.hubblehox.ai
else
    echo '✗ nginx config NOT FOUND'
fi
echo ''
echo '--- nginx syntax test ---'
sudo nginx -t
"@

Write-Host ""
Write-Host "3. Checking nginx access logs..." -ForegroundColor Yellow
ssh $server @"
echo '--- Last 10 lines of nginx access log ---'
sudo tail -10 /var/log/nginx/access.log
echo ''
echo '--- Last 10 lines of nginx error log ---'
sudo tail -10 /var/log/nginx/error.log
"@

Write-Host ""
Write-Host "4. Testing file permissions..." -ForegroundColor Yellow
ssh $server @"
echo '--- File permissions ---'
ls -la /var/www/helpdesk/frontend/ | head -5
echo ''
echo '--- Owner and group ---'
stat -c 'Owner: %U, Group: %G, Permissions: %a' /var/www/helpdesk/frontend/index.html 2>/dev/null || echo 'index.html not found'
"@

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Diagnostic Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
