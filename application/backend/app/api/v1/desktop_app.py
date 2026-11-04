import io
import os
import zipfile
from datetime import datetime
from fastapi import APIRouter, Response, status
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/desktop", tags=["Desktop Application"])

BATCH_LAUNCHER_SCRIPT = """@echo off
:: =========================================================================
:: CorpSec Payroll & Workforce Management System
:: Windows Desktop Application Launcher & Desktop Shortcut Setup
:: =========================================================================
title CorpSec Payroll & Workforce Management System
color 0B
cls

echo =========================================================================
echo   CORPSEC PAYROLL & WORKFORCE MANAGEMENT SYSTEM
echo   Windows Desktop Application Setup & Launcher
echo =========================================================================
echo.
echo [1/3] Checking browser environment on your machine...

set APP_URL=http://localhost:8000/
set SHORTCUT_CREATED=0

:: Check for Edge or Chrome executable paths
set BROWSER_CMD=
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
    set BROWSER_CMD="%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
) else if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (
    set BROWSER_CMD="%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"
) else if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
    set BROWSER_CMD="%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
) else if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" (
    set BROWSER_CMD="%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"
) else if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" (
    set BROWSER_CMD="%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"
)

echo [2/3] Creating CorpSec Desktop Shortcut on your Windows Desktop...

set VBS_SCRIPT="%TEMP%\\corpsec_create_shortcut_%RANDOM%.vbs"
echo Set oWS = WScript.CreateObject("WScript.Shell") > %VBS_SCRIPT%
echo sDesktop = oWS.SpecialFolders("Desktop") >> %VBS_SCRIPT%
echo Set oLink = oWS.CreateShortcut(sDesktop ^& "\\CorpSec Payroll System.lnk") >> %VBS_SCRIPT%

if defined BROWSER_CMD (
    echo oLink.TargetPath = %BROWSER_CMD% >> %VBS_SCRIPT%
    echo oLink.Arguments = "--app=%APP_URL% --window-size=1440,900" >> %VBS_SCRIPT%
) else (
    echo oLink.TargetPath = "%APP_URL%" >> %VBS_SCRIPT%
)

echo oLink.Description = "CorpSec Payroll & Security Workforce Management Enterprise System" >> %VBS_SCRIPT%
echo oLink.WindowStyle = 1 >> %VBS_SCRIPT%
echo oLink.Save >> %VBS_SCRIPT%

cscript /nologo %VBS_SCRIPT% >nul 2>&1
if exist %VBS_SCRIPT% del /f /q %VBS_SCRIPT%

echo [3/3] Launching CorpSec Desktop Application...
echo.
echo =========================================================================
echo   SUCCESS: CorpSec Desktop Shortcut placed on your Desktop!
echo   Launching CorpSec in native application window...
echo =========================================================================

if defined BROWSER_CMD (
    start "" %BROWSER_CMD% --app=%APP_URL% --window-size=1440,900
) else (
    start "" "%APP_URL%"
)

timeout /t 3 >nul
exit
"""

POWERSHELL_INSTALLER_SCRIPT = """# =========================================================================
# CorpSec Payroll & Workforce Management System
# PowerShell Desktop App Installer
# =========================================================================

$AppUrl = "http://localhost:8000/"
$AppName = "CorpSec Payroll System"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Installing CorpSec Desktop Application on your machine   " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# Locate Desktop Folder
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "$AppName.lnk"

# Detect Edge or Chrome
$BrowserPath = $null
$CandidatePaths = @(
    "${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe",
    "${env:ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe",
    "${env:ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe",
    "${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe",
    "${env:LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe"
)

foreach ($path in $CandidatePaths) {
    if (Test-Path $path) {
        $BrowserPath = $path
        break
    }
}

# Create Desktop Shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)

if ($BrowserPath) {
    $Shortcut.TargetPath = $BrowserPath
    $Shortcut.Arguments = "--app=$AppUrl --window-size=1440,900"
    Write-Host "[OK] Detected native browser: $BrowserPath" -ForegroundColor Green
} else {
    $Shortcut.TargetPath = $AppUrl
}

$Shortcut.Description = "CorpSec Payroll & Workforce Management Enterprise System"
$Shortcut.WindowStyle = 1
$Shortcut.Save()

Write-Host "[OK] Desktop shortcut created at: $ShortcutPath" -ForegroundColor Green
Write-Host "Launching CorpSec Desktop App..." -ForegroundColor Cyan

Start-Process $ShortcutPath
Write-Host "Setup Completed Successfully!" -ForegroundColor Green
"""

README_TEXT = """=========================================================================
CORPSEC PAYROLL & WORKFORCE MANAGEMENT SYSTEM - DESKTOP SETUP
=========================================================================

Thank you for downloading the CorpSec Enterprise Desktop Application package.

WHAT'S INCLUDED:
1. CorpSec_Desktop_Launcher.bat:
   Double-click this file anytime to immediately create a Windows Desktop shortcut
   and open CorpSec in standalone application mode (frameless, high-speed desktop window).

2. Install_CorpSec_Desktop.ps1:
   PowerShell installer for Windows system administrators.

3. Start_Local_Server.bat:
   Helper script to start the local FastAPI / Python application server if running offline.

QUICK START INSTRUCTIONS:
1. Ensure the CorpSec application server is running (default: http://localhost:8000).
2. Double-click 'CorpSec_Desktop_Launcher.bat'.
3. A shortcut named 'CorpSec Payroll System' will appear on your Windows Desktop.
4. Double-click the shortcut anytime to open the application!

SYSTEM REQUIREMENTS:
- Operating System: Windows 10, Windows 11, Windows Server 2016+
- Browser Engine: Microsoft Edge or Google Chrome (installed on 99% of Windows machines)
- Memory: 2 GB RAM minimum
- Disk Space: 50 MB

TECHNICAL SUPPORT:
Email: support@corpsec.co.ke
Website: https://corpsec.co.ke
"""

START_SERVER_BAT = """@echo off
title CorpSec Application Server
color 0A
echo Starting CorpSec Payroll Backend Server on http://localhost:8000 ...
cd /d "%~dp0"
if exist application\\venv\\Scripts\\python.exe (
    application\\venv\\Scripts\\python.exe -m uvicorn application.backend.app.main:app --host 0.0.0.0 --port 8000 --reload
) else if exist venv\\Scripts\\python.exe (
    venv\\Scripts\\python.exe -m uvicorn application.backend.app.main:app --host 0.0.0.0 --port 8000 --reload
) else (
    python -m uvicorn application.backend.app.main:app --host 0.0.0.0 --port 8000 --reload
)
pause
"""


@router.get("/download-launcher")
def download_windows_launcher():
    """
    Download the standalone Windows Desktop Launcher (.bat) that creates a desktop shortcut
    and launches CorpSec in native application mode.
    """
    return Response(
        content=BATCH_LAUNCHER_SCRIPT,
        media_type="application/x-bat",
        headers={
            "Content-Disposition": 'attachment; filename="CorpSec_Desktop_Launcher.bat"',
            "Cache-Control": "no-cache",
        }
    )


@router.get("/download-powershell-installer")
def download_powershell_installer():
    """
    Download the PowerShell Desktop Shortcut installer script.
    """
    return Response(
        content=POWERSHELL_INSTALLER_SCRIPT,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="Install_CorpSec_Desktop.ps1"',
            "Cache-Control": "no-cache",
        }
    )


@router.get("/download-package")
def download_complete_desktop_package():
    """
    Generate and stream a complete ready-to-use Desktop Application ZIP package
    including launchers, installers, server scripts, and documentation.
    """
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("CorpSec_Desktop_Launcher.bat", BATCH_LAUNCHER_SCRIPT)
        zf.writestr("Install_CorpSec_Desktop.ps1", POWERSHELL_INSTALLER_SCRIPT)
        zf.writestr("Start_Local_Server.bat", START_SERVER_BAT)
        zf.writestr("README_DESKTOP_SETUP.txt", README_TEXT)

    zip_buffer.seek(0)

    filename = f"CorpSec_Desktop_App_Setup_{datetime.now().strftime('%Y%m%d')}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        }
    )


@router.get("/info")
def get_desktop_app_info():
    """
    Returns application system info, version, and platform installation options.
    """
    return {
        "app_name": "CorpSec Payroll & Workforce Management System",
        "version": "1.0.0",
        "desktop_supported": True,
        "pwa_ready": True,
        "platforms": ["Windows 10/11", "macOS", "Linux", "Android"],
        "download_urls": {
            "windows_launcher": "/api/v1/desktop/download-launcher",
            "powershell_installer": "/api/v1/desktop/download-powershell-installer",
            "complete_bundle_zip": "/api/v1/desktop/download-package",
            "pwa_manifest": "/manifest.json"
        }
    }

