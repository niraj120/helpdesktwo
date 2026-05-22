$file = "C:\Users\niraj.mishra\OneDrive - Eduspark International Pvt. Ltd\Documents\Final Backup\SAC Helpdesk\frontend\src\pages\DashboardBuilderPage.tsx"
$content = [System.IO.File]::ReadAllLines($file, [System.Text.UTF8Encoding]::new($false))

# Replace tab label lines (0-indexed: line numbers 1624=idx 1623, 1625=idx 1624, 1627=idx 1626, 1628=idx 1627, 1630=idx 1629, 1631=idx 1630)
# Actual mojibake line indices (check which lines contain the mojibake)
for ($i = 0; $i -lt $content.Length; $i++) {
    if ($content[$i] -match "ðŸ"Š") {
        $content[$i] = '                {"\uD83D\uDCCA"} Data Points'
        Write-Host "Fixed line $($i+1): Data Points tab"
    }
    if ($content[$i] -match "ðŸ§©") {
        $content[$i] = '                {"\uD83E\uDDE9"} Widgets'
        Write-Host "Fixed line $($i+1): Widgets tab"
    }
    if ($content[$i] -match "Æ' Formula") {
        $content[$i] = '                {"\u0192"} Formula'
        Write-Host "Fixed line $($i+1): Formula tab"
    }
}

[System.IO.File]::WriteAllLines($file, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done"
