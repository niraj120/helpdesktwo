param()
$filepath = "C:\Users\niraj.mishra\OneDrive - Eduspark International Pvt. Ltd\Documents\Final Backup\SAC Helpdesk\frontend\src\pages\DashboardBuilderPage.tsx"
$content = [System.IO.File]::ReadAllLines($filepath, [System.Text.UTF8Encoding]::new($false))
$fixed = 0
for ($index = 0; $index -lt $content.Length; $index++) {
    $line = $content[$index]
    # Match lines that have non-ASCII chars AND specific words (tab labels)
    if ($line.Length -gt 0) {
        $hasNonAscii = $false
        foreach ($ch in $line.ToCharArray()) {
            if ([int]$ch -gt 127) { $hasNonAscii = $true; break }
        }
        if ($hasNonAscii) {
            if ($line -match 'Data Points') {
                $content[$index] = '                Data Points'
                Write-Host "Fixed Data Points at line $($index+1)"
                $fixed++
            } elseif ($line -match 'Widgets' -and $line -notmatch 'widgetDef' -and $line -notmatch 'setLeftTab') {
                $content[$index] = '                Widgets'
                Write-Host "Fixed Widgets at line $($index+1)"
                $fixed++
            } elseif ($line -match 'Formula' -and $line -notmatch '//' -and $line -notmatch 'formula' -and $line -notmatch 'button') {
                $content[$index] = '                Formula'
                Write-Host "Fixed Formula at line $($index+1)"
                $fixed++
            }
        }
    }
}
[System.IO.File]::WriteAllLines($filepath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Total fixed: $fixed lines"
