import io
import os
import pytest
from starlette.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import date, timedelta

from application.backend.app.models.user import User, UserRole
from application.backend.app.models.client_contract import Client, ClientContract
from application.backend.app.core.security import create_access_token, get_password_hash


def get_admin_token(db: Session) -> str:
    admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
    if not admin:
        admin = User(
            email="admin.contracts@corpsec.co.ke",
            password_hash=get_password_hash("AdminPass123!"),
            full_name="Contracts Admin",
            role=UserRole.ADMIN.value,
            phone="0711002233"
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
    return create_access_token(str(admin.id))


def test_client_contract_pdf_upload_stream_download_and_delete(client: TestClient, db: Session):
    token = get_admin_token(db)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Setup client and contract
    test_client = db.query(Client).filter(Client.name == "Apex Logistics Ltd").first()
    if not test_client:
        test_client = Client(
            client_code="CLT-9999",
            name="Apex Logistics Ltd",
            industry="Logistics & Warehousing",
            physical_address="Mombasa Road, Industrial Area",
            contact_person="James Mwangi",
            phone="0712345678",
            email="jmwangi@apexlogistics.co.ke",
            status="ACTIVE"
        )
        db.add(test_client)
        db.commit()
        db.refresh(test_client)

    unique_suffix = os.urandom(2).hex()
    test_contract = ClientContract(
        client_id=test_client.id,
        contract_ref=f"CTR-TEST-{unique_suffix}",
        title="Apex Depot Comprehensive Security SLA",
        contract_type="ANNUAL",
        billing_frequency="MONTHLY",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=365),
        monthly_charge=145000.0,
        contract_value=1740000.0,
        guards_required=8,
        status="ACTIVE",
        version=1
    )
    db.add(test_contract)
    db.commit()
    db.refresh(test_contract)

    contract_id = test_contract.id

    # 2. Upload signed contract SLA PDF proof
    mock_pdf_content = b"%PDF-1.5 \n1 0 obj<<>>endobj\ntrailer<<>>%%EOF - Signed SLA Apex 2026"
    test_filename = "Apex_Signed_SLA_2026.pdf"
    files = {
        "file": (test_filename, io.BytesIO(mock_pdf_content), "application/pdf")
    }

    upload_res = client.post(
        f"/api/v1/clients/contracts/{contract_id}/upload-document",
        files=files,
        headers=headers
    )
    assert upload_res.status_code == 200, upload_res.text
    data = upload_res.json()
    assert data["document_url"] == f"/api/v1/clients/contracts/{contract_id}/document"
    assert data["document_name"] == test_filename
    assert data["document_size"] == len(mock_pdf_content)

    # Verify DB state
    db.refresh(test_contract)
    assert test_contract.document_url == f"/api/v1/clients/contracts/{contract_id}/document"
    assert test_contract.document_name == test_filename
    assert test_contract.document_size == len(mock_pdf_content)

    # 3. Test inline viewing with Bearer header
    view_res = client.get(
        f"/api/v1/clients/contracts/{contract_id}/document",
        headers=headers
    )
    assert view_res.status_code == 200
    assert view_res.content == mock_pdf_content
    assert "application/pdf" in view_res.headers.get("content-type", "")
    assert "inline" in view_res.headers.get("content-disposition", "")
    assert test_filename in view_res.headers.get("content-disposition", "")

    # 4. Test viewing with ?token= query parameter (for iframe in browser)
    iframe_res = client.get(f"/api/v1/clients/contracts/{contract_id}/document?token={token}")
    assert iframe_res.status_code == 200
    assert iframe_res.content == mock_pdf_content
    assert "inline" in iframe_res.headers.get("content-disposition", "")

    # 5. Test download attachment
    dl_res = client.get(
        f"/api/v1/clients/contracts/{contract_id}/document?download=true",
        headers=headers
    )
    assert dl_res.status_code == 200
    assert dl_res.content == mock_pdf_content
    assert "attachment" in dl_res.headers.get("content-disposition", "")

    # 6. Verify client profile endpoint returns contract document metadata
    profile_res = client.get(f"/api/v1/clients/{test_client.id}/profile", headers=headers)
    assert profile_res.status_code == 200
    p_data = profile_res.json()
    contract_in_profile = next((c for c in p_data["contracts"] if c["id"] == contract_id), None)
    assert contract_in_profile is not None
    assert contract_in_profile["document_url"] == f"/api/v1/clients/contracts/{contract_id}/document"
    assert contract_in_profile["document_name"] == test_filename
    assert contract_in_profile["document_size"] == len(mock_pdf_content)

    # 7. Test document deletion
    del_res = client.delete(
        f"/api/v1/clients/contracts/{contract_id}/document",
        headers=headers
    )
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"

    # DB document fields cleared
    db.refresh(test_contract)
    assert test_contract.document_url is None
    assert test_contract.document_name is None
    assert test_contract.document_size is None

    # Fetching document now yields 404
    not_found_res = client.get(
        f"/api/v1/clients/contracts/{contract_id}/document",
        headers=headers
    )
    assert not_found_res.status_code == 404


def test_client_contract_pdf_frontend_integration():
    with open("application/frontend/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    assert 'id="modal-contract-document-viewer"' in html
    assert 'id="contract-doc-modal-iframe"' in html
    assert 'id="contract-doc-modal-download-btn"' in html
    assert 'id="contract-pdf-quick-upload"' in html
    assert 'id="contract-create-document"' in html
    assert 'id="contract-edit-document"' in html
    assert 'id="contract-edit-doc-status"' in html

    with open("application/frontend/static/js/app.js", "r", encoding="utf-8") as f:
        js = f.read()

    assert "triggerContractUpload" in js
    assert "handleContractQuickFileSelected" in js
    assert "openContractDocumentModal" in js
    assert "closeContractDocumentModal" in js
    assert "upload-document" in js
