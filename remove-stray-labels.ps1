param()
$filepath = "C:\Users\niraj.mishra\OneDrive - Eduspark International Pvt. Ltd\Documents\Final Backup\SAC Helpdesk\frontend\src\pages\DashboardBuilderPage.tsx"
$content = [System.IO.File]::ReadAllLines($filepath, [System.Text.UTF8Encoding]::new($false))

# Remove lines that are ONLY whitespace + "Data Points" or "Widgets" (bare text, no JSX braces)
# These are stray lines inserted by the previous fix script
$newContent = @()
$removed = 0
foreach ($line in $content) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "Data Points" -or $trimmed -eq "Widgets") {
        $removed++
        Write-Host "Removing stray line: '$trimmed'"
        # Skip (don't add to newContent)
    } else {
        $newContent += $line
    }
}

[System.IO.File]::WriteAllLines($filepath, $newContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "Removed $removed stray lines. New total: $($newContent.Length)"
