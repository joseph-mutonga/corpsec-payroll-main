import os
import io
import pytest
from starlette.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.models.user import User, UserRole
from application.backend.app.models.document import CompanyDocument
from application.backend.app.models.audit import AuditLog
from application.backend.app.core.security import create_access_token, get_password_hash


def get_auth_headers(user_id: int) -> dict:
    token = create_access_token(str(user_id))
    return {"Authorization": f"Bearer {token}"}


def test_documents_vault_password_verification(client: TestClient, db: Session):
    # 1. Create an admin user with known password
    admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
    if not admin:
        admin = User(
            email="vault.admin@corpsec.co.ke",
            password_hash=get_password_hash("VaultSecretPass2026!"),
            full_name="Vault Admin",
            role=UserRole.ADMIN.value,
            phone="0711998877"
        )
        db.add(admin)
        db.commit()
    else:
        admin.password_hash = get_password_hash("VaultSecretPass2026!")
        db.commit()

    token = create_access_token(str(admin.id))
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Test incorrect password rejected (400 Bad Request)
    bad_res = client.post(
        "/api/v1/documents/verify-vault-password",
        json={"password": "WrongPasswordXYZ"},
        headers=headers
    )
    assert bad_res.status_code == 400
    assert "Incorrect password" in bad_res.json()["detail"]

    # Verify audit log recorded failed attempt
    audit_fail = db.query(AuditLog).filter(
        AuditLog.user_id == admin.id,
        AuditLog.action == "VAULT_UNLOCK_FAILED"
    ).order_by(AuditLog.id.desc()).first()
    assert audit_fail is not None

    # 3. Test correct account password succeeds
    ok_res = client.post(
        "/api/v1/documents/verify-vault-password",
        json={"password": "VaultSecretPass2026!"},
        headers=headers
    )
    assert ok_res.status_code == 200
    assert ok_res.json()["verified"] is True

    # Verify audit log recorded successful attempt
    audit_ok = db.query(AuditLog).filter(
        AuditLog.user_id == admin.id,
        AuditLog.action == "VAULT_UNLOCK_SUCCESS"
    ).order_by(AuditLog.id.desc()).first()
    assert audit_ok is not None

    # 4. Test master vault password fallback succeeds (e.g. corpsec2026)
    master_res = client.post(
        "/api/v1/documents/verify-vault-password",
        json={"password": "corpsec2026"},
        headers=headers
    )
    assert master_res.status_code == 200
    assert master_res.json()["verified"] is True


def test_company_document_inline_view(client: TestClient, db: Session):
    admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
    token = create_access_token(str(admin.id))
    headers = {"Authorization": f"Bearer {token}"}

    # Upload test document
    sample_bytes = b"%PDF-1.4 Mock Legal Document Content for Inline Preview"
    files = {
        "file": ("corporate_policy_2026.pdf", io.BytesIO(sample_bytes), "application/pdf")
    }
    data = {
        "title": "Corporate Safety & Armory SOP 2026",
        "category": "Company Policies & SOPs",
        "confidentiality_level": "RESTRICTED",
        "description": "Standard operating guidelines for security arms and personnel."
    }

    upload_res = client.post(
        "/api/v1/documents/upload",
        data=data,
        files=files,
        headers=headers
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    # 1. Inline viewing with Bearer token
    view_res = client.get(f"/api/v1/documents/{doc_id}/view", headers=headers)
    assert view_res.status_code == 200
    assert view_res.content == sample_bytes
    assert "inline" in view_res.headers.get("content-disposition", "")
    assert "corporate_policy_2026.pdf" in view_res.headers.get("content-disposition", "")
    assert view_res.headers.get("content-type") == "application/pdf"

    # 2. Inline viewing with ?token= query parameter (for iframe / new window)
    view_token_res = client.get(f"/api/v1/documents/{doc_id}/view?token={token}")
    assert view_token_res.status_code == 200
    assert view_token_res.content == sample_bytes
    assert "inline" in view_token_res.headers.get("content-disposition", "")


def test_documents_vault_and_viewer_frontend_integrity():
    with open("application/frontend/static/js/app.js", "r", encoding="utf-8") as f:
        app_js = f.read()

    # Password gate verification checks - enforced anytime documents section is entered
    assert "window.isAuthorizedForDocumentEntryOnce" in app_js
    assert "openDocumentsVaultModal" in app_js
    assert "handleDocumentsVaultAuthSubmit" in app_js
    assert "lockCompanyDocumentsVault" in app_js
    assert "viewCompanyDocument" in app_js
    assert "closeViewDocumentModal" in app_js

    # Table includes View action button
    assert "viewCompanyDocument(${doc.id})" in app_js

    with open("application/frontend/index.html", "r", encoding="utf-8") as f:
        index_html = f.read()

    # Modal elements exist
    assert 'id="modal-documents-vault-auth"' in index_html
    assert 'id="vault-password-input"' in index_html
    assert 'id="modal-view-document"' in index_html
    assert 'id="viewer-content-body"' in index_html
    assert 'lockCompanyDocumentsVault()' in index_html
