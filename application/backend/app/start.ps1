# Subdirectory forwarder for start.ps1
$rootPath = Resolve-Path "$PSScriptRoot\..\..\..\"
Set-Location $rootPath
& "$rootPath\start.ps1"
