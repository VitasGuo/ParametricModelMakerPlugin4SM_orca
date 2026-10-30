param(
  [string]$OrcaPath = '',
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
Import-Module "$PSScriptRoot\install-common.psm1" -Force
Set-ConsoleUtf8

function Pause-Close {
  if (-not $NoPause) { Read-Host '按 Enter 关闭窗口' | Out-Null }
}

trap {
  Write-Host "错误：$($_.Exception.Message)" -ForegroundColor Red
  Pause-Close
  exit 1
}

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 写入 Program Files 需要管理员权限：自动弹 UAC 并以管理员身份重跑本脚本
if (-not (Test-Admin)) {
  Write-Host '需要管理员权限，正在请求 UAC 提权...' -ForegroundColor Yellow
  $argList = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"' + $PSCommandPath + '"')
  )
  if ($OrcaPath) {
    $argList += @('-OrcaPath', ('"' + $OrcaPath + '"'))
  }
  if ($NoPause) { $argList += '-NoPause' }
  $proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -Wait -PassThru
  # 透传提权子进程的退出码：install.bat 的 if errorlevel 1 pause 依赖非零退出码
  exit $proc.ExitCode
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Dist = Join-Path $RepoRoot 'dist'
$PluginSrc = Join-Path $PSScriptRoot 'plugin.js'
$ProxySrc = Join-Path $PSScriptRoot 'local-proxy.mjs'
$Marker = '<script src="/web/flutter_web/model-lab/plugin.js"></script>'
$OldMarker = '<script src="/web/model-lab/plugin.js"></script>'

Write-Host ''
Write-Host '======================================================' -ForegroundColor Cyan
Write-Host '  AI 参数化模型 - Snapmaker Orca 插件安装' -ForegroundColor Cyan
Write-Host '======================================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path $PluginSrc)) {
  throw "缺少 plugin.js：$PluginSrc"
}
if (-not (Test-Path $ProxySrc)) {
  throw "缺少 local-proxy.mjs：$ProxySrc"
}

# 发布包可能不带 dist：缺了就自动装依赖并构建，保证双击即可安装
if (-not (Test-Path (Join-Path $Dist 'index.html'))) {
  Write-Host '[1/6] 未找到 dist，正在自动构建前端...' -ForegroundColor White
  $npmPath = Resolve-NpmPath
  Push-Location $RepoRoot
  try {
    if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
      Write-Host '  npm install...' -ForegroundColor DarkGray
      & $npmPath install
      if ($LASTEXITCODE -ne 0) { throw "npm install 失败（退出码 $LASTEXITCODE）" }
    }
    Write-Host '  npm run build...' -ForegroundColor DarkGray
    & $npmPath run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build 失败（退出码 $LASTEXITCODE）" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host '[1/6] 使用已构建的 dist。' -ForegroundColor White
}
if (-not (Test-Path (Join-Path $Dist 'index.html'))) {
  throw '构建后仍未找到 dist/index.html。'
}

Write-Host '[2/6] 自动查找 Snapmaker Orca...' -ForegroundColor White
if (-not $OrcaPath -or -not (Test-OrcaDir $OrcaPath)) {
  $OrcaPath = Find-OrcaDir
}
if (-not (Test-OrcaDir $OrcaPath)) {
  throw "不是有效的 Snapmaker Orca 安装目录：$OrcaPath"
}

$Web = Join-Path $OrcaPath 'resources\web'
$Flutter = Join-Path $Web 'flutter_web'
$Index = Join-Path $Flutter 'index.html'
$Backup = "$Index.model-lab-backup"
$Dest = Join-Path $Flutter 'model-lab'
$OldDest = Join-Path $Web 'model-lab'

Write-Host "  已找到：$OrcaPath" -ForegroundColor Green
$wasRunning = @(Get-Process snapmaker-orca -ErrorAction SilentlyContinue).Count -gt 0
if ($wasRunning) {
  Write-Host '  Snapmaker Orca 正在运行，安装完成后会自动重启。' -ForegroundColor Yellow
}

Write-Host '[3/6] 配置本地 AI 代理（解决 SenseNova / GLM / OpenAI 的 CORS）...' -ForegroundColor White
$nodePath = Resolve-NodePath
$proxyPath = Install-LocalProxy -ProxySource $ProxySrc -NodePath $nodePath
Write-Host "  Node：$nodePath" -ForegroundColor DarkGray
Write-Host '  代理：http://127.0.0.1:17329/proxy（已加入开机启动）' -ForegroundColor Green

Write-Host '[4/6] 复制静态资源...' -ForegroundColor White
if (Test-Path $Dest) { Remove-Item $Dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Path (Join-Path $Dist '*') -Destination $Dest -Recurse -Force
Copy-Item $PluginSrc (Join-Path $Dest 'plugin.js') -Force
if ((Test-Path $OldDest) -and ($OldDest -ne $Dest)) {
  Remove-Item $OldDest -Recurse -Force
}
Write-Host "  安装到：$Dest" -ForegroundColor Green

Write-Host '[5/6] 注入插件脚本...' -ForegroundColor White
$html = [System.IO.File]::ReadAllText($Index, [System.Text.Encoding]::UTF8)
$hasNewMarker = $html.Contains($Marker)
$hasOldMarker = $html.Contains($OldMarker)
if (-not $hasNewMarker -and -not $hasOldMarker) {
  Copy-Item $Index $Backup -Force
  Write-Host "  已备份：$Backup" -ForegroundColor DarkGray
}
$changed = $false
if ($hasOldMarker) {
  $html = $html.Replace("$OldMarker`r`n  ", '').Replace($OldMarker, '')
  $changed = $true
}
if (-not $html.Contains($Marker)) {
  $bootstrap = '<script src="flutter_bootstrap.js"'
  if ($html.Contains($bootstrap)) {
    $html = $html.Replace($bootstrap, "$Marker`r`n  $bootstrap")
  } else {
    $html = $html.Replace('</body>', "$Marker`r`n</body>")
  }
  $changed = $true
}
if ($changed) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Index, $html, $utf8NoBom)
  Write-Host '  index.html 已注入。' -ForegroundColor Green
} else {
  Write-Host '  index.html 已是最新，跳过。' -ForegroundColor DarkGray
}

Write-Host '[6/6] 校验安装结果...' -ForegroundColor White
$ok = (Test-Path (Join-Path $Dest 'index.html')) -and
      (Test-Path (Join-Path $Dest 'plugin.js')) -and
      ([System.IO.File]::ReadAllText($Index, [System.Text.Encoding]::UTF8).Contains($Marker))
if (-not $ok) { throw '校验失败，请检查文件权限。' }
Write-Host '  校验通过。' -ForegroundColor Green

Write-Host ''
Write-Host '安装完成。' -ForegroundColor Green
Write-Host '打开 Snapmaker Orca，点击左侧栏的「AI 参数化模型」。' -ForegroundColor White
Write-Host "卸载：powershell -ExecutionPolicy Bypass -File `"$PSScriptRoot\uninstall.ps1`"" -ForegroundColor DarkGray
Write-Host ''

if ($wasRunning) {
  Restart-Orca -OrcaPath $OrcaPath
  Write-Host 'Snapmaker Orca 已重启。' -ForegroundColor Green
}

Pause-Close
