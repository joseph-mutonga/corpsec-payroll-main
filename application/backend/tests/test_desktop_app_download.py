import io
import zipfile
import pytest
from fastapi.testclient import TestClient
from application.backend.app.main import app

client = TestClient(app)


def test_download_windows_batch_launcher():
    res = client.get("/api/v1/desktop/download-launcher")
    assert res.status_code == 200
    assert "CorpSec_Desktop_Launcher.bat" in res.headers.get("Content-Disposition", "")
    assert "@echo off" in res.text
    assert "CorpSec" in res.text
    assert "http://localhost:8000/" in res.text


def test_download_powershell_installer():
    res = client.get("/api/v1/desktop/download-powershell-installer")
    assert res.status_code == 200
    assert "Install_CorpSec_Desktop.ps1" in res.headers.get("Content-Disposition", "")
    assert "$AppUrl" in res.text
    assert "CorpSec Payroll System" in res.text


def test_download_desktop_app_zip_package():
    res = client.get("/api/v1/desktop/download-package")
    assert res.status_code == 200
    assert "application/zip" in res.headers.get("Content-Type", "")
    assert "attachment; filename=\"CorpSec_Desktop_App_Setup_" in res.headers.get("Content-Disposition", "")

    # Validate zip integrity and files
    zip_bytes = io.BytesIO(res.content)
    with zipfile.ZipFile(zip_bytes, "r") as zf:
        namelist = zf.namelist()
        assert "CorpSec_Desktop_Launcher.bat" in namelist
        assert "Install_CorpSec_Desktop.ps1" in namelist
        assert "Start_Local_Server.bat" in namelist
        assert "README_DESKTOP_SETUP.txt" in namelist

        readme = zf.read("README_DESKTOP_SETUP.txt").decode("utf-8")
        assert "CORPSEC PAYROLL & WORKFORCE MANAGEMENT SYSTEM" in readme


def test_desktop_app_info_endpoint():
    res = client.get("/api/v1/desktop/info")
    assert res.status_code == 200
    data = res.json()
    assert data["desktop_supported"] is True
    assert data["pwa_ready"] is True
    assert "windows_launcher" in data["download_urls"]
    assert "complete_bundle_zip" in data["download_urls"]


def test_manifest_and_pwa_readiness():
    res = client.get("/manifest.json")
    assert res.status_code == 200
    data = res.json()
    assert "CorpSec" in data["name"]
    assert data["display"] == "standalone"
    assert len(data["icons"]) > 0

