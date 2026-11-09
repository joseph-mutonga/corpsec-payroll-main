import io
import openpyxl
import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.salary_advance import SalaryAdvance
from application.backend.app.models.user import User, UserRole

import os

def get_admin_headers(client: TestClient) -> dict:
    pwd = os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": pwd}
    )
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_download_salary_advance_template(client: TestClient, db: Session):
    headers = get_admin_headers(client)
    res = client.get("/api/v1/salary-advances/template", headers=headers)
    assert res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers.get("Content-Type", "")
    assert "CorpSec_Salary_Advances_Template_" in res.headers.get("Content-Disposition", "")

    # Validate that openpyxl can read the downloaded bytes
    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    assert "Salary Advances" in wb.sheetnames
    ws = wb["Salary Advances"]
    first_row = [cell.value for cell in ws[1]]
    assert "Employee_Number" in first_row
    assert "National_ID" in first_row
    assert "Full_Name" in first_row
    assert "Advance_Amount" in first_row


def test_upload_salary_advances_excel(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    # 1. Ensure test site & guard exist
    site = db.query(Site).first()
    if not site:
        site = Site(site_name="Excel Test Site", location="Nairobi", basic_salary=15000.0)
        db.add(site)
        db.commit()

    guard1 = db.query(Guard).filter(Guard.employee_number == "CS-00452").first()
    if not guard1:
        guard1 = Guard(
            employee_number="CS-00452",
            full_name="John Mwangi",
            national_id="12345678",
            phone="0711002233",
            hire_date=date(2023, 1, 1),
            primary_site_id=site.id,
            basic_salary=15000.0
        )
        db.add(guard1)
        db.commit()

    guard2 = db.query(Guard).filter(Guard.employee_number == "CS-00431").first()
    if not guard2:
        guard2 = Guard(
            employee_number="CS-00431",
            full_name="Peter Otieno",
            national_id="23456789",
            phone="0722003344",
            hire_date=date(2023, 1, 1),
            primary_site_id=site.id,
            basic_salary=15000.0
        )
        db.add(guard2)
        db.commit()

    # Ensure payroll period exists
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == 1).first()
    if not period:
        period = PayrollPeriod(
            year=2026, month=10, period_name="October 2026",
            start_date=date(2026, 10, 1), end_date=date(2026, 10, 31),
            status="DRAFT"
        )
        db.add(period)
        db.commit()

    # 2. Build test Excel workbook in memory
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Advances"
    ws.append([
        "Employee Number", "National ID", "Full Name", "Advance Amount",
        "Disbursement Date", "Payment Method", "Reference Number", "Reason"
    ])
    ws.append([guard1.employee_number, guard1.national_id, guard1.full_name, 3500.0, "2026-10-18", "M-PESA", "QK778899", "Medical emergency"])
    ws.append([guard2.employee_number, guard2.national_id, guard2.full_name, 2200.0, "2026-10-19", "BANK", "BTRF-1122", "School fees"])
    ws.append(["CS-99999", "99999999", "Non Existent Guard", 5000.0, "2026-10-20", "M-PESA", "QK999999", "Should fail"])

    excel_buffer = io.BytesIO()
    wb.save(excel_buffer)
    excel_buffer.seek(0)

    # 3. Post to upload endpoint
    files = {"file": ("advances_test.xlsx", excel_buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"payroll_period_id": period.id, "default_payment_method": "M-PESA"}

    upload_res = client.post("/api/v1/salary-advances/upload-excel", headers=headers, files=files, data=data)
    assert upload_res.status_code == 200, upload_res.text
    res_data = upload_res.json()

    assert res_data["success"] is True
    assert res_data["successful_records"] == 2
    assert res_data["failed_records"] == 1
    assert res_data["total_amount_processed"] == 5700.0
    assert len(res_data["errors"]) == 1
    assert "Row 4" in res_data["errors"][0]

    # Verify advances in DB
    adv1 = db.query(SalaryAdvance).filter(
        SalaryAdvance.guard_id == guard1.id,
        SalaryAdvance.amount == 3500.0
    ).first()
    assert adv1 is not None
    assert adv1.status == "APPROVED"
    assert adv1.payroll_period_id == period.id
    assert adv1.payment_method == "M-PESA"

    adv2 = db.query(SalaryAdvance).filter(
        SalaryAdvance.guard_id == guard2.id,
        SalaryAdvance.amount == 2200.0
    ).first()
    assert adv2 is not None
    assert adv2.status == "APPROVED"
    assert adv2.payment_method == "BANK"


def test_upload_salary_advances_csv(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    guard = db.query(Guard).filter(Guard.employee_number == "CS-00418").first()
    if not guard:
        site = db.query(Site).first()
        guard = Guard(
            employee_number="CS-00418",
            full_name="Mary Akinyi",
            national_id="34567890",
            phone="0702111222",
            hire_date=date(2023, 1, 1),
            primary_site_id=site.id if site else 1,
            basic_salary=15000.0
        )
        db.add(guard)
        db.commit()

    csv_content = f"""Employee_Number,National_ID,Full_Name,Advance_Amount,Disbursement_Date,Payment_Method,Reason
{guard.employee_number},{guard.national_id},{guard.full_name},1800.0,2026-10-22,CASH,Mid-month transport
"""

    files = {"file": ("advances.csv", csv_content.encode("utf-8"), "text/csv")}
    upload_res = client.post("/api/v1/salary-advances/upload-excel", headers=headers, files=files)
    assert upload_res.status_code == 200, upload_res.text
    res_data = upload_res.json()

    assert res_data["successful_records"] == 1
    assert res_data["failed_records"] == 0
    assert res_data["total_amount_processed"] == 1800.0

    adv = db.query(SalaryAdvance).filter(
        SalaryAdvance.guard_id == guard.id,
        SalaryAdvance.amount == 1800.0
    ).first()
    assert adv is not None
    assert adv.payment_method == "CASH"


def test_supervisor_cannot_access_advances_upload_or_template(client: TestClient, db: Session):
    # Ensure supervisor user exists
    supervisor = db.query(User).filter(User.role == UserRole.SUPERVISOR.value).first()
    if not supervisor:
        from application.backend.app.core.security import get_password_hash
        supervisor = User(
            email="sup_test@corpsec.co.ke",
            phone="0711999888",
            password_hash=get_password_hash("SupPassword123!"),
            role=UserRole.SUPERVISOR.value,
            status="ACTIVE"
        )
        db.add(supervisor)
        db.commit()

    from application.backend.app.core.security import create_access_token
    sup_token = create_access_token(data={"sub": str(supervisor.id), "role": "SUPERVISOR"})
    sup_headers = {"Authorization": f"Bearer {sup_token}"}

    # Template download should be 403 Forbidden
    t_res = client.get("/api/v1/salary-advances/template", headers=sup_headers)
    assert t_res.status_code == 403

    # Upload should be 403 Forbidden
    files = {"file": ("adv.csv", b"dummy,data", "text/csv")}
    u_res = client.post("/api/v1/salary-advances/upload-excel", headers=sup_headers, files=files)
    assert u_res.status_code == 403

