# Run from the project root (the folder that contains netlify.toml):  powershell -ExecutionPolicy Bypass -File .\check-sync.ps1
$manifest = Join-Path $PSScriptRoot 'manifest.txt'
$missing = 0; $differs = 0
foreach ($line in Get-Content $manifest) {
  $i = $line.IndexOf(' '); $h = $line.Substring(0, $i); $p = $line.Substring($i + 1)
  if (-not (Test-Path -LiteralPath $p)) { "MISSING  $p"; $missing++ }
  else { $x = (git hash-object -- $p); if ($x -ne $h) { "DIFFERS  $p"; $differs++ } }
}
"Done. $missing missing, $differs different (of $((Get-Content $manifest).Count) files)."
