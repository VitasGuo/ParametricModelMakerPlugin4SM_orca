# Shared helpers for Model Lab Orca install/uninstall scripts.

function Set-ConsoleUtf8 {
    try {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    } catch { }
}

function Test-OrcaDir {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    return Test-Path (Join-Path $Path 'resources\web\flutter_web\index.html')
}

function Find-OrcaDir {
    $candidates = New-Object System.Collections.Generic.List[string]

    # 1) Running process: most reliable.
    $proc = Get-Process snapmaker-orca -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc -and $proc.Path) {
        $candidates.Add((Split-Path -Parent $proc.Path))
    }

    # 2) Uninstall registry entries.
    $regRoots = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($root in $regRoots) {
        Get-ItemProperty $root -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -match 'Snapmaker.*Orca|Orca.*Snapmaker' } |
            ForEach-Object {
                if ($_.InstallLocation) {
                    $candidates.Add(($_.InstallLocation.Trim('"').Trim()))
                }
                if ($_.DisplayIcon) {
                    $icon = $_.DisplayIcon.Trim('"').Split(',')[0].Trim()
                    $dir = Split-Path -Parent $icon
                    if ($dir) { $candidates.Add($dir) }
                }
            }
    }

    # 3) Common install locations.
    $candidates.Add("$env:ProgramFiles\Snapmaker_Orca")
    $candidates.Add("${env:ProgramFiles(x86)}\Snapmaker_Orca")
    $candidates.Add("$env:LOCALAPPDATA\Programs\Snapmaker_Orca")
    $candidates.Add("D:\Program Files\Snapmaker_Orca")
    $candidates.Add("D:\Snapmaker_Orca")
    $candidates.Add("E:\Program Files\Snapmaker_Orca")
    $candidates.Add("E:\Snapmaker_Orca")

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-OrcaDir $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    Write-Host 'Cannot auto-detect Snapmaker Orca installation.' -ForegroundColor Yellow
    Write-Host 'Checked running process, uninstall registry, and common paths.' -ForegroundColor DarkGray
    $entered = Read-Host 'Enter Snapmaker Orca install folder (contains snapmaker-orca.exe)'
    $entered = $entered.Trim('"').Trim()
    if (Test-OrcaDir $entered) {
        return (Resolve-Path $entered).Path
    }
    throw "Invalid Snapmaker Orca path: $entered"
}

function Resolve-NodePath {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    $paths = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
        "$env:APPDATA\nvm\node.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    $nvm = Get-ChildItem "$env:APPDATA\nvm" -Filter node.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($nvm) { return $nvm.FullName }
    throw "Node.js 18+ is required for the local AI proxy. Install it from https://nodejs.org and rerun."
}

function Resolve-NpmPath {
    $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    $cmd = Get-Command npm -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    $paths = @(
        "$env:ProgramFiles\nodejs\npm.cmd",
        "${env:ProgramFiles(x86)}\nodejs\npm.cmd",
        "$env:LOCALAPPDATA\Programs\nodejs\npm.cmd"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    throw "npm not found. Install Node.js 18+ from https://nodejs.org and rerun."
}

function Install-LocalProxy {
    param(
        [Parameter(Mandatory)][string]$ProxySource,
        [Parameter(Mandatory)][string]$NodePath
    )
    $proxyDir = "$env:LOCALAPPDATA\ParametricModelMaker4SM_orca"
    New-Item -ItemType Directory -Force -Path $proxyDir | Out-Null
    $proxyPath = Join-Path $proxyDir 'local-proxy.mjs'
    Copy-Item $ProxySource $proxyPath -Force

    $vbsPath = Join-Path $proxyDir 'start-hidden.vbs'
    $vbs = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """$NodePath"" ""$proxyPath""", 0, False
"@
    [System.IO.File]::WriteAllText($vbsPath, $vbs, [System.Text.Encoding]::Unicode)

    $startup = [Environment]::GetFolderPath('Startup')
    $shortcutPath = Join-Path $startup 'Parametric Model Maker Proxy.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = 'wscript.exe'
    $shortcut.Arguments = "`"$vbsPath`""
    $shortcut.WorkingDirectory = $proxyDir
    $shortcut.Description = 'Parametric Model Maker local AI proxy'
    $shortcut.Save()

    $listening = Get-NetTCPConnection -LocalPort 17329 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listening) {
        # 端口被开发用的旧进程占用时，换成本机安装副本，保证开机启动项与运行进程一致
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($listening.OwningProcess)" -ErrorAction SilentlyContinue
        if (-not $proc -or $proc.CommandLine -notlike "*$proxyPath*") {
            Stop-Process -Id $listening.OwningProcess -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 500
            $listening = $null
        }
    }
    if (-not $listening) {
        Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$vbsPath`"" -WindowStyle Hidden
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Milliseconds 500
            $listening = Get-NetTCPConnection -LocalPort 17329 -State Listen -ErrorAction SilentlyContinue
            if ($listening) { break }
        }
    }
    if (-not $listening) {
        throw "Local proxy did not start on 127.0.0.1:17329. Run: node `"$proxyPath`""
    }
    return $proxyPath
}

function Stop-LocalProxy {
    $listening = Get-NetTCPConnection -LocalPort 17329 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listening) {
        Stop-Process -Id $listening.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
    $startup = [Environment]::GetFolderPath('Startup')
    $shortcutPath = Join-Path $startup 'Parametric Model Maker Proxy.lnk'
    if (Test-Path $shortcutPath) { Remove-Item $shortcutPath -Force }
    $proxyDir = "$env:LOCALAPPDATA\ParametricModelMaker4SM_orca"
    if (Test-Path $proxyDir) { Remove-Item $proxyDir -Recurse -Force }
}

function Restart-Orca {
    param([string]$OrcaPath)
    $proc = Get-Process snapmaker-orca -ErrorAction SilentlyContinue
    if ($proc) {
        foreach ($p in $proc) {
            $p.CloseMainWindow() | Out-Null
        }
        Start-Sleep -Seconds 3
        Get-Process snapmaker-orca -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
    $exe = Join-Path $OrcaPath 'snapmaker-orca.exe'
    if (Test-Path $exe) {
        Start-Process -FilePath $exe -WorkingDirectory $OrcaPath
    }
}

Export-ModuleMember -Function Set-ConsoleUtf8, Test-OrcaDir, Find-OrcaDir, Restart-Orca, Resolve-NodePath, Resolve-NpmPath, Install-LocalProxy, Stop-LocalProxy
