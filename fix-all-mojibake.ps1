param()
$filepath = "C:\Users\niraj.mishra\OneDrive - Eduspark International Pvt. Ltd\Documents\Final Backup\SAC Helpdesk\frontend\src\pages\DashboardBuilderPage.tsx"
$content = [System.IO.File]::ReadAllLines($filepath, [System.Text.UTF8Encoding]::new($false))

# Fix VIS_TYPES - find the array start and replace each entry
$visStart = -1
for ($i = 0; $i -lt $content.Length; $i++) {
    if ($content[$i] -match 'const VIS_TYPES') { $visStart = $i; break }
}
Write-Host "VIS_TYPES starts at line $($visStart+1)"

# Replace the 9 vis type entries (lines visStart+1 to visStart+9)
$content[$visStart+1] = '  { value: "kpi_tile",     label: "KPI Card",    icon: "' + [char]0x1F4E6 + '", desc: "Large number + trend",       forUnits: ["count", "hours", "percent"] },'
$content[$visStart+2] = '  { value: "sparkline",    label: "Sparkline",   icon: "' + [char]0x1F4C9 + '", desc: "KPI + mini trend line",      forUnits: ["count", "hours", "percent"] },'
$content[$visStart+3] = '  { value: "gauge",        label: "Gauge",       icon: "' + [char]0x1F321 + '", desc: "Semicircle gauge 0-100%",    forUnits: ["percent"] },'
$content[$visStart+4] = '  { value: "progress_bar", label: "Progress",    icon: "==>",                  desc: "Horizontal bar fill",        forUnits: ["percent", "count"] },'
$content[$visStart+5] = '  { value: "bar_chart",    label: "Bar Chart",   icon: "' + [char]0x1F4CA + '", desc: "Vertical / horizontal bars", forUnits: ["list", "count"] },'
$content[$visStart+6] = '  { value: "line_chart",   label: "Line Chart",  icon: "' + [char]0x1F4C8 + '", desc: "Trend over time",            forUnits: ["list", "count"] },'
$content[$visStart+7] = '  { value: "pie_chart",    label: "Pie Chart",   icon: "' + [char]0x25CB + '",  desc: "Proportional slices",        forUnits: ["list", "count"] },'
$content[$visStart+8] = '  { value: "donut_chart",  label: "Donut",       icon: "' + [char]0x25CE + '",  desc: "Pie with centre text",       forUnits: ["list", "count"] },'
$content[$visStart+9] = '  { value: "table",        label: "Table",       icon: "' + [char]0x1F4CB + '", desc: "Sortable data table",        forUnits: ["list"] },'

# Fix other mojibake strings - find and replace specific patterns
for ($i = 0; $i -lt $content.Length; $i++) {
    $line = $content[$i]
    # Replace fallback icon "ðŸ"¦" (mojibake for 📦 U+1F4E6)
    if ($line -match 'icon.*[^\u0000-\u007F].*\?\?' -or ($line -match 'getVisIcon\|VIS_TYPES' -and $line -match '[^\u0000-\u007F]')) {
        # Handled below
    }
    # Fix: getDefaultVisIcon fallback ??"..." pattern
    if ($line -match '\?\?\s*"' -and $line -match '[^\u0000-\u007F]') {
        $content[$i] = $line -replace '"[^\u0000-\x7F]+"', '"?"'
        Write-Host "Fixed fallback icon at line $($i+1)"
    }
    # Fix math symbols: Ã· -> / and Ã— -> x and â†' -> -> and â€" -> -
    if ($line -match '[^\u0000-\u007F]' -and ($line -match 'numerator|denomin|Multiply|multiply|formula' -or $line -match 'Saving|nameâ€|keyâ€')) {
        $fixed = $line
        # Replace specific mojibake sequences using char codes
        # Ã· = UTF-8 bytes C3 B7 = U+00F7 (division sign) - but we want "/"
        # Actually in PowerShell, let's just replace the non-ASCII chars we know
        $fixed = $fixed.Replace([char]0x00F7, '/') # division sign
        $fixed = $fixed.Replace([char]0x00D7, 'x') # multiplication sign
        $fixed = $fixed.Replace([char]0x2192, '->') # right arrow
        $fixed = $fixed.Replace([char]0x2014, '-') # em dash
        $fixed = $fixed.Replace([char]0x2026, '...') # ellipsis
        $fixed = $fixed.Replace([char]0x00B7, '.') # middle dot
        if ($fixed -ne $line) {
            $content[$i] = $fixed
            Write-Host "Fixed math/text at line $($i+1)"
        }
    }
}

# Fix remaining mojibake lines individually by searching for specific patterns
for ($i = 0; $i -lt $content.Length; $i++) {
    $line = $content[$i]
    $hasNonAscii = $false
    foreach ($ch in $line.ToCharArray()) {
        if ([int]$ch -gt 127) { $hasNonAscii = $true; break }
    }
    if ($hasNonAscii) {
        # Replace box-drawing chars in section headers (OK to keep - they're comments)
        $trimmed = $line.Trim()
        if ($trimmed.StartsWith('//') -or $trimmed.StartsWith('*') -or $trimmed.StartsWith('/*') -or $trimmed.StartsWith('{/*')) { continue }

        # For all other lines, replace common non-ASCII with safe equivalents
        $fixed = $line
        $fixed = $fixed.Replace([char]0x00F7, '/') # division sign ÷ 
        $fixed = $fixed.Replace([char]0x00D7, 'x') # multiplication x
        $fixed = $fixed.Replace([char]0x2192, '->') # right arrow
        $fixed = $fixed.Replace([char]0x2014, '-') # em dash
        $fixed = $fixed.Replace([char]0x2026, '...') # ellipsis
        $fixed = $fixed.Replace([char]0x00B7, '.') # middle dot
        $fixed = $fixed.Replace([char]0x2190, '<-') # left arrow
        $fixed = $fixed.Replace([char]0x2715, 'x') # cross mark
        $fixed = $fixed.Replace([char]0x2713, '+') # check mark
        $fixed = $fixed.Replace([char]0x0192, 'f') # f with hook (formula ƒ)
        # Middle dot Â·
        $fixed = $fixed.Replace([char]0x00C2, '') # Â prefix of mojibake
        if ($fixed -ne $line) {
            $content[$i] = $fixed
            Write-Host "Fixed line $($i+1)"
        }
    }
}

[System.IO.File]::WriteAllLines($filepath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done"
