$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$version = (Get-Content (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json).version
$outputPath = Join-Path $projectRoot ("customnpc_v{0}.mcaddon" -f $version)

if (Test-Path $outputPath) { Remove-Item -Force $outputPath }

try {
    $zipStream = [System.IO.File]::Create($outputPath)
    $zip = [System.IO.Compression.ZipArchive]::new($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)

    function Add-FilesToZip($zip, $sourceDir, $baseEntry) {
        Get-ChildItem -Path $sourceDir | ForEach-Object {
            $entryName = "$baseEntry/$($_.Name)"
            if ($_.PsIsContainer) {
                Add-FilesToZip $zip $_.FullName $entryName
            } else {
                $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
                $writer = $entry.Open()
                try {
                    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
                    $writer.Write($bytes, 0, $bytes.Length)
                } finally {
                    $writer.Dispose()
                }
            }
        }
    }

    Add-FilesToZip $zip (Join-Path $projectRoot "BP") "BP"
    Add-FilesToZip $zip (Join-Path $projectRoot "RP") "RP"
} finally {
    if ($zip) { $zip.Dispose() }
    if ($zipStream) { $zipStream.Dispose() }
}

Write-Host "Built $outputPath"

& (Join-Path $projectRoot "import.ps1")
