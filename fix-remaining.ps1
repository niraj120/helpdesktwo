param()
$filepath = "C:\Users\niraj.mishra\OneDrive - Eduspark International Pvt. Ltd\Documents\Final Backup\SAC Helpdesk\frontend\src\pages\DashboardBuilderPage.tsx"
$c = [System.IO.File]::ReadAllLines($filepath, [System.Text.UTF8Encoding]::new($false))

# Fix line 1516 (idx 1515): broken span with project label
$c[1515] = '            <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>Project:</span>'
Write-Host "Fixed line 1516: Project label span"

# Fix line 1812 (idx 1811): folder emoji before project name display
# Original: emoji {projects.find(...)?.name ?? selectedProjectId}
# Just remove the emoji prefix
$c[1811] = '                  {projects.find((p) => p._id === selectedProjectId)?.name ?? selectedProjectId}'
Write-Host "Fixed line 1812: project name display"

# Fix VIS_TYPES entries that still have mojibake icons (idx 344+1 to 344+9)
# Find VIS_TYPES start
$visStart = -1
for ($i = 0; $i -lt $c.Length; $i++) {
    if ($c[$i] -match '^const VIS_TYPES') { $visStart = $i; break }
}
Write-Host "VIS_TYPES at line $($visStart+1)"
# Replace all 9 entries with ASCII icon text (no emojis)
$c[$visStart+1] = '  { value: "kpi_tile",     label: "KPI Card",    icon: "#",   desc: "Large number + trend",       forUnits: ["count", "hours", "percent"] },'
$c[$visStart+2] = '  { value: "sparkline",    label: "Sparkline",   icon: "~",   desc: "KPI + mini trend line",      forUnits: ["count", "hours", "percent"] },'
$c[$visStart+3] = '  { value: "gauge",        label: "Gauge",       icon: "O",   desc: "Semicircle gauge 0-100%",    forUnits: ["percent"] },'
$c[$visStart+4] = '  { value: "progress_bar", label: "Progress",    icon: "=",   desc: "Horizontal bar fill",        forUnits: ["percent", "count"] },'
$c[$visStart+5] = '  { value: "bar_chart",    label: "Bar Chart",   icon: "||",  desc: "Vertical / horizontal bars", forUnits: ["list", "count"] },'
$c[$visStart+6] = '  { value: "line_chart",   label: "Line Chart",  icon: "/\\", desc: "Trend over time",            forUnits: ["list", "count"] },'
$c[$visStart+7] = '  { value: "pie_chart",    label: "Pie Chart",   icon: "O",   desc: "Proportional slices",        forUnits: ["list", "count"] },'
$c[$visStart+8] = '  { value: "donut_chart",  label: "Donut",       icon: "o",   desc: "Pie with centre text",       forUnits: ["list", "count"] },'
$c[$visStart+9] = '  { value: "table",        label: "Table",       icon: "[]",  desc: "Sortable data table",        forUnits: ["list"] },'
Write-Host "Fixed VIS_TYPES with ASCII icons"

[System.IO.File]::WriteAllLines($filepath, $c, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done"
