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
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -Wait
  exit 0
}

if (-not $OrcaPath -or -not (Test-OrcaDir $OrcaPath)) {
  $OrcaPath = Find-OrcaDir
}

$Web = Join-Path $OrcaPath 'resources\web'
$Flutter = Join-Path $Web 'flutter_web'
$Index = Join-Path $Flutter 'index.html'
$Backup = "$Index.model-lab-backup"
$Dest = Join-Path $Flutter 'model-lab'
$OldDest = Join-Path $Web 'model-lab'
$Marker = '<script src="/web/flutter_web/model-lab/plugin.js"></script>'
$OldMarker = '<script src="/web/model-lab/plugin.js"></script>'

Write-Host ''
Write-Host '正在从 Snapmaker Orca 卸载「AI 参数化模型」...' -ForegroundColor White
Write-Host "Orca：$OrcaPath" -ForegroundColor DarkGray

$wasRunning = @(Get-Process snapmaker-orca -ErrorAction SilentlyContinue).Count -gt 0
if (Test-Path $Backup) {
  # 恢复前先确认当前 index.html 仍是插件注入过的版本：Orca 升级覆盖后，旧备份反而会回写旧版页面
  $currentIndex = ''
  if (Test-Path $Index) {
    $currentIndex = [System.IO.File]::ReadAllText($Index, [System.Text.Encoding]::UTF8)
  }
  if ($currentIndex.Contains($Marker) -or $currentIndex.Contains($OldMarker)) {
    Copy-Item $Backup $Index -Force
    Remove-Item $Backup -Force
    Write-Host 'index.html 已从备份恢复。' -ForegroundColor Green
  } else {
    Remove-Item $Backup -Force
    Write-Host '当前 index.html 已不含插件注入（可能被 Orca 升级覆盖），跳过恢复，仅删除备份文件。' -ForegroundColor Yellow
  }
} elseif (Test-Path $Index) {
  $html = [System.IO.File]::ReadAllText($Index, [System.Text.Encoding]::UTF8)
  $changed = $false
  foreach ($m in @($Marker, $OldMarker)) {
    if ($html.Contains($m)) {
      $html = $html.Replace("$m`r`n  ", '').Replace($m, '')
      $changed = $true
    }
  }
  if ($changed) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Index, $html, $utf8NoBom)
    Write-Host '插件脚本标签已移除。' -ForegroundColor Green
  }
}

foreach ($d in @($Dest, $OldDest)) {
  if (Test-Path $d) {
    Remove-Item $d -Recurse -Force
    Write-Host "已删除：$d" -ForegroundColor Green
  }
}

Stop-LocalProxy
Write-Host '本地 AI 代理已停止，开机启动项已移除。' -ForegroundColor Green

Write-Host '卸载完成。' -ForegroundColor Green
if ($wasRunning) {
  Restart-Orca -OrcaPath $OrcaPath
  Write-Host 'Snapmaker Orca 已重启。' -ForegroundColor Green
}
Pause-Close
