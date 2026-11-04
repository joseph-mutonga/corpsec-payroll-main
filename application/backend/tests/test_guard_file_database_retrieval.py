import pytest
from datetime import date
from starlette.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.user import User, UserRole
from application.backend.app.core.security import create_access_token


def get_auth_headers(user_id: int = 1) -> dict:
    token = create_access_token(str(user_id))
    return {"Authorization": f"Bearer {token}"}


def test_guard_file_backend_database_retrieval(client: TestClient, db: Session):
    headers = get_auth_headers(1)

    # 1. Setup Site & Shift
    site = Site(
        site_name="Personnel File Test Site",
        location="Westlands, Nairobi",
        client_name="Test Enterprise Ltd",
        daily_rate=750.0,
        basic_salary=19500.0
    )
    db.add(site)
    db.commit()

    shift = Shift(
        name="Standard Day Shift",
        shift_type="DAY",
        start_time="06:00",
        end_time="18:00",
        is_night_shift=False
    )
    db.add(shift)
    db.commit()

    # 2. Setup Guard with database education and emergency fields
    guard = Guard(
        employee_number="CS-FILE99",
        full_name="Samson Kiprono",
        national_id="33445566",
        phone="0733445566",
        email="samson.kiprono@corpsec.co.ke",
        gender="Male",
        date_of_birth=date(1993, 4, 12),
        primary_site_id=site.id,
        shift_id=shift.id,
        hire_date=date(2023, 2, 1),
        basic_salary=19500.0,
        education_level="Diploma in Security & Risk Management",
        emergency_contact_name="Mercy Kiprono (Spouse)",
        emergency_contact_phone="0711223344",
        blood_group="B+",
        next_of_kin="Mercy Kiprono",
        status="ACTIVE"
    )
    db.add(guard)
    db.commit()

    # 3. Add attendance record for this guard
    att = Attendance(
        guard_id=guard.id,
        site_id=site.id,
        shift_id=shift.id,
        shift_date=date(2026, 11, 1),
        regular_hours=12.0,
        overtime_hours=2.0,
        status="PRESENT",
        notes="Shift completed punctually"
    )
    db.add(att)

    # 4. Add payroll record for this guard
    period = PayrollPeriod(
        year=2026,
        month=10,
        period_name="October 2026",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 31),
        status="CONFIRMED"
    )
    db.add(period)
    db.commit()

    payroll_rec = PayrollRecord(
        payroll_period_id=period.id,
        guard_id=guard.id,
        days_worked=26,
        regular_hours=208.0,
        overtime_hours=10.0,
        basic_pay=19500.0,
        overtime_pay=1200.0,
        gross_pay=20700.0,
        nssf_deduction=1080.0,
        shif_deduction=569.25,
        housing_levy_deduction=310.5,
        paye_deduction=1200.0,
        total_deductions=3159.75,
        net_pay=17540.25,
        status="CONFIRMED"
    )
    db.add(payroll_rec)
    db.commit()

    # 5. Fetch Guard Detail Endpoint
    res = client.get(f"/api/v1/guards/{guard.id}", headers=headers)
    assert res.status_code == 200, res.text
    g_data = res.json()
    assert g_data["full_name"] == "Samson Kiprono"
    assert g_data["education_level"] == "Diploma in Security & Risk Management"
    assert g_data["emergency_contact_name"] == "Mercy Kiprono (Spouse)"
    assert g_data["emergency_contact_phone"] == "0711223344"
    assert g_data["blood_group"] == "B+"
    assert g_data["next_of_kin"] == "Mercy Kiprono"
    assert g_data["site"]["site_name"] == "Personnel File Test Site"
    assert g_data["shift"]["name"] == "Standard Day Shift"

    # 6. Fetch Attendance for this Guard
    att_res = client.get(f"/api/v1/attendance?guard_id={guard.id}", headers=headers)
    assert att_res.status_code == 200
    att_list = att_res.json()
    assert len(att_list) >= 1
    assert any(a["guard_id"] == guard.id for a in att_list)

    # 7. Fetch Payroll Records for this Guard
    pay_res = client.get(f"/api/v1/payroll/guard/{guard.id}/records", headers=headers)
    assert pay_res.status_code == 200
    pay_list = pay_res.json()
    assert len(pay_list) >= 1
    assert pay_list[0]["guard_id"] == guard.id
    assert pay_list[0]["net_pay"] == 17540.25

    # 8. Test Updating Guard File details persists to database
    update_res = client.put(
        f"/api/v1/guards/{guard.id}",
        json={
            "education_level": "Bachelor of Criminology",
            "emergency_contact_name": "Mercy Kiprono (Wife)",
            "blood_group": "AB+"
        },
        headers=headers
    )
    assert update_res.status_code == 200
    updated_guard = update_res.json()
    assert updated_guard["education_level"] == "Bachelor of Criminology"
    assert updated_guard["blood_group"] == "AB+"


def test_guard_file_frontend_code_integrity():
    with open("application/frontend/static/js/app.js", "r", encoding="utf-8") as f:
        app_js = f.read()

    # Ensure functions for rendering database data are defined
    assert "renderGuardAttendanceHistoryRows" in app_js
    assert "renderGuardPayrollHistoryRows" in app_js
    assert "renderGuardLeaveHistoryRows" in app_js
    assert "generateGuardFileHTML" in app_js
    assert "viewGuardFile" in app_js

    # Verify viewGuardFile correctly references currentUser and fetches database endpoints
    assert "currentUser = getLoggedInUser()" in app_js
    assert "apiFetch(`/guards/${guardId}`)" in app_js
    assert "apiFetch(`/attendance?guard_id=${guardId}`)" in app_js
    assert "apiFetch(`/payroll/guard/${guardId}/records`)" in app_js

    # Verify amend guard inputs exist in index.html
    with open("application/frontend/index.html", "r", encoding="utf-8") as f:
        index_html = f.read()

    assert 'id="amend-guard-education"' in index_html
    assert 'id="amend-guard-blood-group"' in index_html
    assert 'id="amend-guard-em-name"' in index_html
    assert 'id="amend-guard-em-phone"' in index_html
    assert 'id="amend-guard-next-of-kin"' in index_html

    # Ensure guard files open full-page and modal overlay is permanently disabled
    assert 'id="modal-guard-file" class="modal-overlay" style="display:none !important;"' in index_html
    assert "guardsPanel.style.display = 'block'" in app_js
    assert "listViewContainer.style.display = 'none'" in app_js
    assert "fileViewContainer.style.display = 'block'" in app_js
    assert "modal.style.display = 'none'" in app_js

    # Verify scrollable guard file styles in styles.css and modal structure
    with open("application/frontend/static/css/styles.css", "r", encoding="utf-8") as f:
        styles_css = f.read()

    assert ".guard-file-wrapper" in styles_css
    assert "overflow-y: auto" in styles_css
    assert "#guard-file-body" in styles_css
    assert "max-height: calc(92vh - 130px)" in styles_css
    assert "-webkit-overflow-scrolling: touch" in styles_css
