# Patch icon/version before the prepackaged NSIS build.
# Keep this script ASCII: Windows PowerShell 5 defaults to the ANSI code page.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'release\win-unpacked\RelaySwitcher.exe'
$ico = Join-Path $root 'build\icon.ico'
$pkg = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $pkg.version

if (-not (Test-Path $exe)) { throw "Missing EXE: $exe; build unpacked first" }
if (-not (Test-Path $ico)) { throw "Missing icon: $ico" }

# Use the pinned dependency, not machine-specific winCodeSign cache.
$rcedit = Join-Path $root 'node_modules\rcedit\bin\rcedit-x64.exe'
if (-not (Test-Path $rcedit)) { throw 'rcedit dependency missing; run npm ci first' }

Write-Host "rcedit : $rcedit"
Write-Host "exe    : $exe"
Write-Host "icon   : $ico"
Write-Host "version: $version"

& $rcedit $exe `
  --set-icon $ico `
  --set-file-version $version `
  --set-product-version $version `
  --set-version-string 'ProductName' 'RelaySwitcher' `
  --set-version-string 'FileDescription' 'RelaySwitcher' `
  --set-version-string 'CompanyName' 'RelaySwitcher'

if ($LASTEXITCODE -ne 0) { throw "rcedit failed: $LASTEXITCODE" }

Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)
$info = (Get-Item $exe).VersionInfo
if (-not $icon -or $info.FileVersion -ne $version -or $info.ProductVersion -ne $version) {
  throw 'EXE icon/version verification failed'
}
Write-Host ("Icon: " + $(if ($icon) { "OK" } else { "missing" }))
Write-Host ("Version: " + $info.FileVersion)
Write-Host ""
Write-Host "Next: electron-builder --win nsis --prepackaged release/win-unpacked"
