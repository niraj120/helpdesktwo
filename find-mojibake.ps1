param()
$filepath = "C:\Users\niraj.mishra\OneDrive - Eduspark International Pvt. Ltd\Documents\Final Backup\SAC Helpdesk\frontend\src\pages\DashboardBuilderPage.tsx"
$content = [System.IO.File]::ReadAllLines($filepath, [System.Text.UTF8Encoding]::new($false))

# Find lines with non-ASCII chars (code point > 127) that are in JSX/JS (not comments)
$results = @()
for ($i = 0; $i -lt $content.Length; $i++) {
    $line = $content[$i]
    $trimmed = $line.Trim()
    # Skip pure comment lines and box-drawing chars in separators
    if ($trimmed.StartsWith("//") -or $trimmed.StartsWith("*") -or $trimmed.StartsWith("/*")) { continue }
    foreach ($ch in $line.ToCharArray()) {
        $cp = [int]$ch
        if ($cp -gt 127 -and $cp -lt 0xE000) {  # Non-ASCII, not private use
            $results += [PSCustomObject]@{ Line = $i+1; Content = $line.Trim() }
            break
        }
    }
}
$results | Format-Table -AutoSize
Write-Host "Total lines with non-ASCII (non-comment): $($results.Length)"
