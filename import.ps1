$ErrorActionPreference = "Stop"

$mojangPath = "$env:LocalAppData\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang"
$projectName = "customnpc"

# Use relative paths from the script's directory
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$bpSource = Join-Path $PSScriptRoot "BP"
$rpSource = Join-Path $PSScriptRoot "RP"
$version = (Get-Content (Join-Path $PSScriptRoot "package.json") -Raw | ConvertFrom-Json).version

$bpDest = Join-Path $mojangPath "development_behavior_packs\$projectName"
$rpDest = Join-Path $mojangPath "development_resource_packs\$projectName"
$installedBpDest = Join-Path $mojangPath "behavior_packs\自定义NPC_v$version"
$installedRpDest = Join-Path $mojangPath "resource_packs\自定义NPC资源包_v$version"

function Copy-Pack($source, $dest) {
    if (-not (Test-Path $source)) {
        throw "Source path not found: $source"
    }

    if (Test-Path $dest) {
        Remove-Item -Recurse -Force $dest
    }
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Copy-Item -Path "$source\*" -Destination $dest -Recurse -Force
    Write-Host "Successfully imported $source to $dest"
}

function Update-MatchingPacks($source, $packsRoot, $uuid) {
    if (-not (Test-Path $packsRoot)) {
        return
    }

    Get-ChildItem -Path $packsRoot -Directory | ForEach-Object {
        $manifestPath = Join-Path $_.FullName "manifest.json"
        if ((Test-Path $manifestPath) -and ((Get-Content $manifestPath -Raw) -match $uuid)) {
            Copy-Pack $source $_.FullName
        }
    }
}

Copy-Pack $bpSource $bpDest
Copy-Pack $rpSource $rpDest
Update-MatchingPacks $bpSource (Join-Path $mojangPath "behavior_packs") "f127bcc0-501f-43c7-9690-60a3c4233666"
Update-MatchingPacks $rpSource (Join-Path $mojangPath "resource_packs") "dc139b08-b19d-4c8a-894c-59be26ae7110"
Copy-Pack $bpSource $installedBpDest
Copy-Pack $rpSource $installedRpDest
