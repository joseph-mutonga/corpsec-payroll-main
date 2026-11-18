import io
import pytest
from application.backend.app.models.user import User
from application.backend.app.core.security import create_access_token, get_password_hash


@pytest.fixture
def admin_auth_headers(db):
    user = db.query(User).filter(User.role == "ADMIN").first()
    if not user:
        user = User(
            email="test_hist_admin@corpsec.co.ke",
            full_name="History Admin Test",
            role="ADMIN",
            password_hash=get_password_hash("TestPass123!"),
            status="ACTIVE"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


def test_company_document_upload_and_serving(client, admin_auth_headers):
    # 1. Upload a simulated PDF document
    file_content = b"%PDF-1.4 simulated company document test content"
    files = {
        "file": ("PSRA_License_2026.pdf", io.BytesIO(file_content), "application/pdf")
    }
    res = client.post("/api/v1/company/upload-document", headers=admin_auth_headers, files=files)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "success"
    assert "file_url" in data
    assert data["file_name"] == "PSRA_License_2026.pdf"

    # 2. Retrieve document file
    file_url = data["file_url"]
    doc_res = client.get(file_url, headers=admin_auth_headers)
    assert doc_res.status_code == 200
    assert doc_res.content == file_content


def test_company_profile_amendment_and_document(client, admin_auth_headers):
    # Amend profile with document
    payload = {
        "company_name": "CorpSec Kenya Premier Protection Ltd",
        "psra_license_number": "PSRA/2026/A-0099",
        "document_url": "/api/v1/company/documents/test_psra_cert.pdf",
        "document_name": "Official PSRA Compliance Certificate 2026"
    }
    res = client.put("/api/v1/company/profile", headers=admin_auth_headers, json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["official_name"] == "CorpSec Kenya Premier Protection Ltd"
    assert data["document_url"] == "/api/v1/company/documents/test_psra_cert.pdf"
    assert data["document_name"] == "Official PSRA Compliance Certificate 2026"

    # Verify retrieval
    get_res = client.get("/api/v1/company/profile", headers=admin_auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["document_url"] == "/api/v1/company/documents/test_psra_cert.pdf"


def test_company_founding_amendment_and_document(client, admin_auth_headers):
    payload = {
        "founding_date": "2018-03-15",
        "original_location": "Nairobi Industrial Area",
        "initial_guards_count": 16,
        "founder_names": "Col. (Rtd) James Mwangi & Capt. Beatrice Wanjiku",
        "background_story": "Established with deep security heritage and discipline.",
        "document_url": "/api/v1/company/documents/founding_charter_2018.pdf",
        "document_name": "Founding Constitution & Charter"
    }
    res = client.put("/api/v1/company/founding", headers=admin_auth_headers, json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["document_url"] == "/api/v1/company/documents/founding_charter_2018.pdf"
    assert data["document_name"] == "Founding Constitution & Charter"


def test_company_milestone_amendment_and_document(client, admin_auth_headers):
    # 1. Create milestone
    create_payload = {
        "title": "Mombasa Coast Detachment Launch",
        "milestone_date": "2021-04-10",
        "category": "EXPANSION",
        "location": "Mombasa CBD",
        "description": "Opened coastal headquarters and fleet depot.",
        "significance": "Added 80 security officers across Port of Mombasa.",
        "document_url": "/api/v1/company/documents/mombasa_license.pdf",
        "document_name": "Mombasa County Operational Permit"
    }
    res = client.post("/api/v1/company/milestones", headers=admin_auth_headers, json=create_payload)
    assert res.status_code == 201, res.text
    m_id = res.json()["id"]
    assert res.json()["document_url"] == "/api/v1/company/documents/mombasa_license.pdf"

    # 2. Amend milestone
    update_payload = {
        "title": "Mombasa Coast Detachment Major Expansion",
        "significance": "Expanded guard complement to 150 officers and 6 patrol cruisers.",
        "document_url": "/api/v1/company/documents/mombasa_expansion_award.pdf",
        "document_name": "Port Logistics Security Excellence Award"
    }
    put_res = client.put(f"/api/v1/company/milestones/{m_id}", headers=admin_auth_headers, json=update_payload)
    assert put_res.status_code == 200, put_res.text
    updated = put_res.json()
    assert updated["event_title"] == "Mombasa Coast Detachment Major Expansion"
    assert updated["document_name"] == "Port Logistics Security Excellence Award"


def test_company_ownership_amendment_and_document(client, admin_auth_headers):
    # 1. Create governance record
    create_payload = {
        "person_or_entity_name": "Grace W. Nduta",
        "role_title": "MANAGING_DIRECTOR",
        "shareholding_percentage": 25.0,
        "shares_count": 250000,
        "appointment_date": "2018-03-15",
        "status": "ACTIVE",
        "document_url": "/api/v1/company/documents/cr12_grace.pdf",
        "document_name": "CR12 Director Shareholding Certificate"
    }
    res = client.post("/api/v1/company/ownership", headers=admin_auth_headers, json=create_payload)
    assert res.status_code == 201, res.text
    rec_id = res.json()["id"]

    # 2. Amend governance record
    update_payload = {
        "person_or_entity_name": "Grace W. Nduta",
        "role_title": "EXECUTIVE_DIRECTOR",
        "shareholding_percentage": 30.0,
        "document_url": "/api/v1/company/documents/board_resolution_2026.pdf",
        "document_name": "Board Resolution Equity Increase"
    }
    put_res = client.put(f"/api/v1/company/ownership/{rec_id}", headers=admin_auth_headers, json=update_payload)
    assert put_res.status_code == 200, put_res.text
    updated = put_res.json()
    assert updated["shareholding_percentage"] == 30.0
    assert updated["document_name"] == "Board Resolution Equity Increase"


def test_company_recommendation_amendment_and_document(client, admin_auth_headers):
    # 1. Create recommendation
    create_payload = {
        "client_name": "Nairobi Hospital",
        "author_name": "Dr. Florence Kariuki",
        "designation": "Head of Facilities & Safety",
        "rating": 5,
        "recommendation_date": "2026-05-12",
        "recommendation_text": "CorpSec has maintained outstanding vigilance and perimeter discipline for 3 consecutive years.",
        "service_scope": "Hospital static guarding and triage access control",
        "document_url": "/api/v1/company/documents/nairobi_hospital_letter.pdf",
        "document_name": "Nairobi Hospital Official Commendation Letter"
    }
    res = client.post("/api/v1/company/recommendations", headers=admin_auth_headers, json=create_payload)
    assert res.status_code == 201, res.text
    r_id = res.json()["id"]
    assert res.json()["document_name"] == "Nairobi Hospital Official Commendation Letter"

    # 2. Amend recommendation
    update_payload = {
        "recommendation_text": "CorpSec has delivered impeccable security and rapid response without a single incident breach.",
        "rating": 5,
        "document_url": "/api/v1/company/documents/nairobi_hospital_award_2026.pdf",
        "document_name": "Premier Healthcare Safety Certificate"
    }
    put_res = client.put(f"/api/v1/company/recommendations/{r_id}", headers=admin_auth_headers, json=update_payload)
    assert put_res.status_code == 200, put_res.text
    updated = put_res.json()
    assert "impeccable security" in updated["recommendation_text"]
    assert updated["document_name"] == "Premier Healthcare Safety Certificate"


def test_company_service_amendment_and_document(client, admin_auth_headers):
    # 1. Create service
    create_payload = {
        "service_code": "SRV-TEST-VIP",
        "service_name": "Executive Close Protection",
        "category": "PHYSICAL_SECURITY",
        "description": "Armored transit and close protection officers.",
        "sla_standard": "Immediate tactical escort",
        "billing_rate_guideline": "KES 150,000 / month",
        "document_url": "/api/v1/company/documents/vip_sla_spec.pdf",
        "document_name": "Close Protection Standard Operating Procedure"
    }
    res = client.post("/api/v1/company/services", headers=admin_auth_headers, json=create_payload)
    assert res.status_code == 201, res.text
    srv_id = res.json()["id"]
    assert res.json()["document_name"] == "Close Protection Standard Operating Procedure"

    # 2. Amend service
    update_payload = {
        "service_name": "VIP & Diplomatic Close Protection",
        "billing_rate_guideline": "KES 180,000 / month",
        "document_url": "/api/v1/company/documents/diplomatic_vip_spec.pdf",
        "document_name": "Diplomatic Protocol & SLA Brochure"
    }
    put_res = client.put(f"/api/v1/company/services/{srv_id}", headers=admin_auth_headers, json=update_payload)
    assert put_res.status_code == 200, put_res.text
    updated = put_res.json()
    assert updated["service_name"] == "VIP & Diplomatic Close Protection"
    assert updated["billing_rate_guideline"] == "KES 180,000 / month"
    assert updated["document_name"] == "Diplomatic Protocol & SLA Brochure"
