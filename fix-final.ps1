param()
$filepath = "C:\Users\niraj.mishra\OneDrive - Eduspark International Pvt. Ltd\Documents\Final Backup\SAC Helpdesk\frontend\src\pages\DashboardBuilderPage.tsx"
$c = [System.IO.File]::ReadAllLines($filepath, [System.Text.UTF8Encoding]::new($false))

# Line 666 (idx 665): division sign used as separator icon
$c[665] = '      <div style={{ textAlign: "center", fontSize: 18, color: "#9ca3af", margin: "-4px 0" }}>/</div>'
Write-Host "Fixed line 666"

# Line 1013 (idx 1012): WIDTH label with em dash range
$c[1012] = '              <label style={{ fontSize: 10, color: "#9ca3af", display: "block", marginBottom: 3 }}>WIDTH (cols 1-12)</label>'
Write-Host "Fixed line 1013"

# Line 1022 (idx 1021): HEIGHT label with em dash range
$c[1021] = '              <label style={{ fontSize: 10, color: "#9ca3af", display: "block", marginBottom: 3 }}>HEIGHT (rows 1-6)</label>'
Write-Host "Fixed line 1022"

# Line 1501 (idx 1500): Dashboard name placeholder
$c[1500] = '            placeholder="Dashboard name..."'
Write-Host "Fixed line 1501"

# Line 1591 (idx 1590): Saving text
$c[1590] = '              {saving ? "Saving..." : "Save Draft"}'
Write-Host "Fixed line 1591"

# Line 1653 (idx 1652): fallback icon in module meta lookup
$c[1652] = '                  const src = MODULE_META[source as DataModule] ?? { label: source, icon: "?", color: "#9ca3af" };'
Write-Host "Fixed line 1653"

# Line 1678 (idx 1677): expand/collapse arrows (down/right triangles)
$c[1677] = '                        <span style={{ color: "#9ca3af" }}>{expandedDP[source] ? "v" : ">"}</span>'
Write-Host "Fixed line 1678"

# Line 1725 (idx 1724): expand/collapse arrows for widget modules
$c[1724] = '                      <span style={{ color: "#9ca3af" }}>{expandedModules[module] ? "v" : ">"}</span>'
Write-Host "Fixed line 1725"

# Line 1797 (idx 1796): back arrow in some nav/button
$c[1796] = '                  ? "<"'
Write-Host "Fixed line 1797 (back arrow context)"

[System.IO.File]::WriteAllLines($filepath, $c, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done"
