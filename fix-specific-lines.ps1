param()
$filepath = "C:\Users\niraj.mishra\OneDrive - Eduspark International Pvt. Ltd\Documents\Final Backup\SAC Helpdesk\frontend\src\pages\DashboardBuilderPage.tsx"
$c = [System.IO.File]::ReadAllLines($filepath, [System.Text.UTF8Encoding]::new($false))

# Replace specific lines by 0-based index with clean ASCII content

# Line 601 (idx 600): formula preview string with division/multiply symbols
$c[600] = '      ? `${numDp.label} / ${denDp.label}${multiply === 100 ? " x 100%" : ""}`'
Write-Host "Fixed line 601"

# Line 602 (idx 601): em dash fallback string
$c[601] = '      : "-";'
Write-Host "Fixed line 602"

# Line 645 (idx 644): example label with division/multiply symbols
$c[644] = '        Example: <em>Resolution Rate = Resolved Within SLA / Open Tickets x 100</em>'
Write-Host "Fixed line 645"

# Line 700 (idx 699): multiply description with arrow
$c[699] = '              {v === 100 ? "x 100 -> %" : "x 1 -> ratio"}'
Write-Host "Fixed line 700"

# Line 950 (idx 949): close button X symbol
$c[949] = '          x'
Write-Host "Fixed line 950"

# Line 1005 (idx 1004): Multiply display
$c[1004] = '            <div><strong>Multiply:</strong> x {cfg.formula.multiplyBy ?? 100}</div>'
Write-Host "Fixed line 1005"

# Line 1078 (idx 1077): placeholder with ellipsis
$c[1077] = '                placeholder="Enter key name..."'
Write-Host "Fixed line 1078"

# Line 1493 (idx 1492): back arrow button
$c[1492] = '            &lt;'
Write-Host "Fixed line 1493"

# Line 1832 (idx 1831): canvas empty state emoji
$c[1831] = '                <div style={{ fontSize: 36 }}>{"' + [char]0x1F4CA + '"}</div>'
Write-Host "Fixed line 1832"

# Line 1928 (idx 1927): Formula tab label
$c[1927] = '                f'
Write-Host "Fixed line 1928"

# Line 1947 (idx 1946): formula details with division symbol
$c[1946] = '                            ? `${DATA_POINTS.find((d) => d.key === cfg.formula?.numeratorKey)?.label ?? cfg.formula.numeratorKey} / ${DATA_POINTS.find((d) => d.key === cfg.formula?.denominatorKey)?.label ?? cfg.formula.denominatorKey}`'
Write-Host "Fixed line 1947"

# Line 1958 (idx 1957): module label with middle dot separator
$c[1957] = '                          {dp ? MODULE_META[dp.module]?.label : "pre-built"} - {w.visualisationType.replace(/_/g, " ")}'
Write-Host "Fixed line 1958"

# Line 1994 (idx 1993): settings icon
$c[1993] = '              <div style={{ fontSize: 28 }}>{"' + [char]0x2699 + '"}</div>'
Write-Host "Fixed line 1994"

# Also fix VIS_TYPES - find array start
$visStart = -1
for ($i = 0; $i -lt $c.Length; $i++) {
    if ($c[$i] -match '^const VIS_TYPES') { $visStart = $i; break }
}
if ($visStart -ge 0) {
    Write-Host "VIS_TYPES found at line $($visStart+1)"
    $c[$visStart+1] = '  { value: "kpi_tile",     label: "KPI Card",    icon: "' + [char]0x1F4E6 + '", desc: "Large number + trend",       forUnits: ["count", "hours", "percent"] },'
    $c[$visStart+2] = '  { value: "sparkline",    label: "Sparkline",   icon: "' + [char]0x1F4C9 + '", desc: "KPI + mini trend line",      forUnits: ["count", "hours", "percent"] },'
    $c[$visStart+3] = '  { value: "gauge",        label: "Gauge",       icon: "' + [char]0x1F321 + '", desc: "Semicircle gauge 0-100%",    forUnits: ["percent"] },'
    $c[$visStart+4] = '  { value: "progress_bar", label: "Progress",    icon: "==",                  desc: "Horizontal bar fill",         forUnits: ["percent", "count"] },'
    $c[$visStart+5] = '  { value: "bar_chart",    label: "Bar Chart",   icon: "' + [char]0x1F4CA + '", desc: "Vertical / horizontal bars", forUnits: ["list", "count"] },'
    $c[$visStart+6] = '  { value: "line_chart",   label: "Line Chart",  icon: "' + [char]0x1F4C8 + '", desc: "Trend over time",            forUnits: ["list", "count"] },'
    $c[$visStart+7] = '  { value: "pie_chart",    label: "Pie Chart",   icon: "' + [char]0x25CB + '",  desc: "Proportional slices",        forUnits: ["list", "count"] },'
    $c[$visStart+8] = '  { value: "donut_chart",  label: "Donut",       icon: "' + [char]0x25CE + '",  desc: "Pie with centre text",       forUnits: ["list", "count"] },'
    $c[$visStart+9] = '  { value: "table",        label: "Table",       icon: "' + [char]0x1F4CB + '", desc: "Sortable data table",        forUnits: ["list"] },'
    Write-Host "Fixed VIS_TYPES entries"
}

# Also fix fallback icon on the VIS_TYPES.find(...) ?? line
for ($i = 0; $i -lt $c.Length; $i++) {
    $hasNonAscii = $false
    foreach ($ch in $c[$i].ToCharArray()) { if ([int]$ch -gt 127) { $hasNonAscii = $true; break } }
    if ($hasNonAscii -and $c[$i] -match '\?\?') {
        # Replace any non-ASCII after ?? with a safe fallback icon
        $c[$i] = $c[$i] -replace '"[^"]*[^\u0000-\u007F][^"]*"(?=\s*;)', '"?"'
        Write-Host "Fixed fallback icon at line $($i+1): $($c[$i].Trim())"
    }
}

# Fix "Project:" label with mojibake emoji
for ($i = 0; $i -lt $c.Length; $i++) {
    if ($c[$i] -match 'Project:' -and $c[$i] -match '[^\u0000-\u007F]') {
        $c[$i] = $c[$i] -replace '"[^"]*[^\u0000-\u007F][^"]*Project:', '"Project:'
        Write-Host "Fixed Project label at line $($i+1)"
    }
}

[System.IO.File]::WriteAllLines($filepath, $c, [System.Text.UTF8Encoding]::new($false))
Write-Host "All done"
