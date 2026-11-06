param(
  [string]$Repo = "DanielNju/stock-managment",
  [string]$Backlog = (Join-Path $PSScriptRoot "stockly-backlog.json"),
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$data = Get-Content -Raw -Path $Backlog | ConvertFrom-Json
$token = $env:GITHUB_TOKEN
$headers = @{ "User-Agent" = "stockly-backlog"; "Accept" = "application/vnd.github+json" }
if ($token) { $headers.Authorization = "Bearer $token" }
$base = "https://api.github.com/repos/$Repo"

function Invoke-GH($Method, $Uri, $Body = $null) {
  $p = @{ Method = $Method; Uri = $Uri; Headers = $headers }
  if ($Body) { $p.Body = ($Body | ConvertTo-Json -Depth 20); $p.ContentType = "application/json" }
  Invoke-RestMethod @p
}

if ($DryRun) { Write-Host "DRY RUN - no API writes" -ForegroundColor Yellow }

# Labels
$existingLabels = @{}
try { (Invoke-GH GET "$base/labels?per_page=100") | ForEach-Object { $existingLabels[$_.name] = $true } } catch { Write-Warning "Could not list labels: $($_.Exception.Message)" }
foreach ($l in $data.labels) {
  if ($existingLabels[$l.name]) { Write-Host "label exists: $($l.name)"; continue }
  if ($DryRun) { Write-Host "would create label: $($l.name)"; continue }
  try { Invoke-GH POST "$base/labels" @{ name=$l.name; color=$l.color; description=$l.description } | Out-Null; Write-Host "created label: $($l.name)" }
  catch { Write-Warning "label $($l.name): $($_.Exception.Message)" }
}

# Milestones
$msMap = @{}
try { (Invoke-GH GET "$base/milestones?state=all&per_page=100") | ForEach-Object { $msMap[$_.title] = $_.number } } catch { Write-Warning "Could not list milestones: $($_.Exception.Message)" }
foreach ($m in $data.milestones) {
  if ($msMap[$m.title]) { Write-Host "milestone exists: $($m.title) (#$($msMap[$m.title]))"; continue }
  if ($DryRun) { Write-Host "would create milestone: $($m.title)"; continue }
  $created = Invoke-GH POST "$base/milestones" @{ title=$m.title; description=$m.description; state=$m.state }
  $msMap[$m.title] = $created.number
  Write-Host "created milestone: $($m.title) (#$($created.number))"
}

# Issues
$existingIssues = @{}
try {
  $page = 1
  while ($true) {
    $batch = Invoke-GH GET "$base/issues?state=all&per_page=100&page=$page"
    if (-not $batch -or $batch.Count -eq 0) { break }
    $batch | Where-Object { -not $_.pull_request } | ForEach-Object { $existingIssues[$_.title] = $_.number }
    $page++
  }
} catch { Write-Warning "Could not list issues: $($_.Exception.Message)" }
foreach ($i in $data.issues) {
  if ($existingIssues[$i.title]) { Write-Host "issue exists: $($i.title) (#$($existingIssues[$i.title]))"; continue }
  $msNum = $msMap[$i.milestone]
  $body = @{ title=$i.title; body=$i.body; labels=$i.labels }
  if ($msNum) { $body.milestone = $msNum }
  if ($DryRun) { Write-Host "would create issue: $($i.title)"; continue }
  $created = Invoke-GH POST "$base/issues" $body
  Write-Host "created issue: $($created.title) (#$($created.number))"
}
Write-Host "Done." -ForegroundColor Green
