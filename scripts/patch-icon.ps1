# 打包后补图标/版本信息。
#
# electron-builder.yml 里 win.signAndEditExecutable 为 false 时,生成的 exe 不带
# 自定义图标和版本信息(原因见该文件注释)。本脚本用 rcedit 补上,然后需要
# 用 `npx electron-builder --win nsis --prepackaged release/win-unpacked`
# 从打好补丁的目录重新生成安装包,否则装进去的还是旧 exe。
#
# 用法(仓库根目录):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/patch-icon.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'release\win-unpacked\RelaySwitcher.exe'
$ico = Join-Path $root 'build\icon.ico'
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version

if (-not (Test-Path $exe)) { throw "找不到 $exe —— 先跑 npx electron-builder --win nsis" }
if (-not (Test-Path $ico)) { throw "找不到 $ico" }

# rcedit 来自 electron-builder 的 winCodeSign 缓存,任取一份可用的
$cacheRoot = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign'
$rcedit = Get-ChildItem $cacheRoot -Recurse -Filter 'rcedit-x64.exe' -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $rcedit) { throw "找不到 rcedit-x64.exe(在 $cacheRoot 下),先跑一次 electron-builder 生成缓存" }

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

if ($LASTEXITCODE -ne 0) { throw "rcedit 失败,退出码 $LASTEXITCODE" }

Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)
$info = (Get-Item $exe).VersionInfo
Write-Host ("图标: " + $(if ($icon) { "OK" } else { "缺失" }))
Write-Host ("版本: " + $info.FileVersion)
Write-Host ""
Write-Host "下一步: npx electron-builder --win nsis --prepackaged release/win-unpacked"
