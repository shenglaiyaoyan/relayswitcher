$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$tests = @(Get-ChildItem (Join-Path $root 'test') -Filter '*.test.js' | ForEach-Object { $_.FullName })
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed' }
& '.\node_modules\.bin\vite.cmd' build
if ($LASTEXITCODE -ne 0) { throw 'Renderer build failed' }
$tempRoot = if (Test-Path 'C:\Windows\Temp\opencode') { 'C:\Windows\Temp\opencode' } else { [System.IO.Path]::GetTempPath() }
$smokeDir = Join-Path $tempRoot ('rs-release-smoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $smokeDir | Out-Null
try {
  & '.\node_modules\.bin\electron.cmd' . --smoke "--user-data-dir=$smokeDir"
  if ($LASTEXITCODE -ne 0) { throw 'Smoke tests failed' }
} finally {
  Remove-Item -LiteralPath $smokeDir -Recurse -Force
}
& '.\node_modules\.bin\electron-builder.cmd' --win dir --publish never
if ($LASTEXITCODE -ne 0) { throw 'Unpacked build failed' }
& node 'scripts\verify-update-config.cjs' 'release\win-unpacked\resources'
if ($LASTEXITCODE -ne 0) { throw 'Unpacked update configuration missing or invalid' }
& powershell -NoProfile -ExecutionPolicy Bypass -File 'scripts\patch-icon.ps1'
if ($LASTEXITCODE -ne 0) { throw 'EXE icon/version patch failed' }
& '.\node_modules\.bin\electron-builder.cmd' --win nsis --prepackaged 'release/win-unpacked' --publish never
if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
& node 'scripts\verify-release.cjs'
if ($LASTEXITCODE -ne 0) { throw 'Final installer verification failed: do not publish' }
Write-Output 'RELEASE_VERIFIED'
