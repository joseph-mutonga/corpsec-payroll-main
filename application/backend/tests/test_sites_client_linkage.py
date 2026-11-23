import pytest
from starlette.testclient import TestClient
from sqlalchemy.orm import Session
import os

from application.backend.app.models.user import User, UserRole
from application.backend.app.models.client_contract import Client, ClientContract
from application.backend.app.models.site import Site
from application.backend.app.core.security import create_access_token, get_password_hash


def get_admin_headers(db: Session) -> dict:
    admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
    if not admin:
        admin = User(
            email="admin.sites@corpsec.co.ke",
            password_hash=get_password_hash("AdminPass123!"),
            full_name="Sites Admin",
            role=UserRole.ADMIN.value,
            phone="0711990011"
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
    token = create_access_token(str(admin.id))
    return {"Authorization": f"Bearer {token}"}


def test_site_creation_and_client_linkage(client: TestClient, db: Session):
    headers = get_admin_headers(db)

    # 1. Ensure a registered client organization exists in Clients & Contracts
    client_name = "Safeguard Logistics East Africa"
    test_client = db.query(Client).filter(Client.name == client_name).first()
    if not test_client:
        test_client = Client(
            client_code=f"CLT-{os.urandom(2).hex()}",
            name=client_name,
            industry="Logistics",
            physical_address="JKIA Cargo Village, Nairobi",
            contact_person="Mary Wanjiku",
            phone="0722334455",
            status="ACTIVE"
        )
        db.add(test_client)
        db.commit()
        db.refresh(test_client)

    # 2. Create a new site attached to this client organization using client_name
    site_suffix = os.urandom(2).hex()
    site_payload = {
        "site_name": f"JKIA Airside Cargo Bay {site_suffix}",
        "location": "JKIA Airside, Gate 4",
        "client_name": client_name,
        "basic_salary": 16500.0,
        "daily_rate": 1400.0,
        "night_allowance": 250.0,
        "transport_allowance": 150.0,
        "housing_allowance": 200.0
    }

    create_res = client.post("/api/v1/sites", json=site_payload, headers=headers)
    assert create_res.status_code == 201, create_res.text
    site_data = create_res.json()
    assert site_data["site_name"] == site_payload["site_name"]
    assert site_data["client_name"] == client_name
    assert site_data["client_id"] == test_client.id
    assert site_data["client_code"] == test_client.client_code

    site_id = site_data["id"]

    # 3. Verify site retrieval includes resolved client_id and client_code
    get_res = client.get(f"/api/v1/sites/{site_id}", headers=headers)
    assert get_res.status_code == 200
    details = get_res.json()
    assert details["client_id"] == test_client.id
    assert details["client_code"] == test_client.client_code

    # 4. Verify site appears under the Client's profile in Clients & Contracts
    profile_res = client.get(f"/api/v1/clients/{test_client.id}/profile", headers=headers)
    assert profile_res.status_code == 200
    profile_data = profile_res.json()
    attached_sites = profile_data.get("sites", [])
    matching_site = next((s for s in attached_sites if s["id"] == site_id), None)
    assert matching_site is not None, f"Site {site_id} not found in client profile sites"
    assert matching_site["site_name"] == site_payload["site_name"]
    assert matching_site["location"] == site_payload["location"]

    # 5. Create another site attached directly using client_id
    site_payload_2 = {
        "site_name": f"JKIA Terminal 2 Screening {site_suffix}",
        "location": "JKIA Terminal 2",
        "client_id": test_client.id,
        "basic_salary": 17000.0,
        "daily_rate": 1500.0
    }
    create_res_2 = client.post("/api/v1/sites", json=site_payload_2, headers=headers)
    assert create_res_2.status_code == 201, create_res_2.text
    site_data_2 = create_res_2.json()
    assert site_data_2["client_name"] == client_name
    assert site_data_2["client_id"] == test_client.id


def test_site_frontend_elements_for_client_linkage():
    with open("application/frontend/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    # Dropdowns for client selection exist
    assert '<select id="new-site-client"' in html
    assert '<select id="edit-site-client"' in html
    # Link to register new client exists in modal
    assert 'openRegisterClientModal()' in html

    with open("application/frontend/static/js/app.js", "r", encoding="utf-8") as f:
        js = f.read()

    assert "loadClientsForSiteDropdown" in js
    assert "handleNewSiteClientChange" in js
    assert "openAddSiteModal" in js
    assert "openEditSiteModal" in js
