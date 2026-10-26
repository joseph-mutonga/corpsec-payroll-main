# CorpSec Payroll System - Local Startup Script
# Usage: .\start.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting CorpSec Payroll System" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Activate virtual environment
$venvPath = "application\venv\Scripts\Activate.ps1"
if (Test-Path $venvPath) {
    Write-Host "Activating virtual environment..." -ForegroundColor Yellow
    & $venvPath
} else {
    Write-Host "WARNING: Virtual environment not found at application\venv" -ForegroundColor Red
    Write-Host "Make sure you have created it previously." -ForegroundColor Red
}

Write-Host ""
Write-Host "Starting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Gray
Write-Host ""

# Start the server
python -m uvicorn application.backend.app.main:app --host 0.0.0.0 --port 8000 --reload
