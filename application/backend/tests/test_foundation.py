from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.site import Site


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "CORPSEC PAYROLL" in response.text or "online" in response.text


def test_health_check_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"


def test_database_models(db):
    # Test User model insertion and query with unique email
    user = User(
        email="new_test_admin@corpsec.co.ke",
        phone="0711998877",
        password_hash="fake_hash",
        role=UserRole.ADMIN.value,
        status=UserStatus.ACTIVE.value
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    assert user.id is not None
    assert user.email == "new_test_admin@corpsec.co.ke"
    assert user.role == "ADMIN"
    
    # Test Site model insertion and query with unique site name
    site = Site(
        site_name="Nakuru Branch",
        location="Nakuru",
        client_name="Nakuru Commercial Ltd",
        daily_rate=1400.0,
        night_allowance=200.0,
        transport_allowance=100.0,
        housing_allowance=150.0
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    
    assert site.id is not None
    assert site.site_name == "Nakuru Branch"
    assert site.daily_rate == 1400.0
