$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
python -m PyInstaller desktop.spec --noconfirm
if ($LASTEXITCODE -ne 0) { throw 'Executable build failed' }
$compiler = Get-Command ISCC.exe -ErrorAction SilentlyContinue
$compilerPath = if ($compiler) { $compiler.Source } else { 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' }
if (-not (Test-Path -LiteralPath $compilerPath)) { throw 'Install Inno Setup 6 before creating the installer.' }
& $compilerPath deploy/windows-installer.iss
if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
Compress-Archive -Path dist/PDF-Atolye -DestinationPath release/PDF-Atolye-Windows-x64.zip -Force
Get-ChildItem release -File | Get-FileHash -Algorithm SHA256 | ForEach-Object { "$($_.Hash.ToLower())  $([IO.Path]::GetFileName($_.Path))" } | Set-Content release/SHA256SUMS.txt
