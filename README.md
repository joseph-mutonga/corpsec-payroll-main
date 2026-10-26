# CorpSec Security Workforce & Payroll System

![CorpSec Banner](application/frontend/static/css/styles.css)

> **Official Enterprise Security Guard Workforce, Attendance & Statutory Payroll Management System for Kenya.**
> Built in strict compliance with Kenyan labor laws, NSSF Act 2013, SHIF Regulations 2024, Affordable Housing Levy Act 2024, and KRA PAYE Progressive Tax Bands.

---

## 🚀 Key Features & Modules

- **🛡️ Workforce & Site Management**: Full guard profiling, national ID, KRA PIN, NSSF/SHIF numbers, bank/M-Pesa details, per-site daily rate billing, and audit-logged deactivation.
- **📅 Shift Roster & CSV Import**: 12-hour day/night shifts, midnight-crossing shift handling, and bulk CSV schedule uploader.
- **⏰ Attendance & Pre-Payroll Anomaly Scanner**: Clock-in/out tracking, overtime calculation (1.5x regular, 2.0x public holidays), and automatic anomaly detection before payroll calculation.
- **⚙️ Kenyan Statutory Payroll Engine**:
  - **NSSF Tier I & Tier II**: 6% employee + 6% employer (capped at KES 2,160.00).
  - **SHIF (Social Health Insurance Fund)**: 2.75% of gross earnings with statutory KES 300.00 minimum floor.
  - **Affordable Housing Levy**: 1.5% employee + 1.5% employer on gross salary.
  - **KRA PAYE Tax Bands**: Banded tax calculation minus KES 2,400.00 monthly personal relief.
  - **Net Pay & Disbursal Schedules**: Bank transfer `.xlsx` (grouped by bank) and M-Pesa B2C `.xlsx` schedules matching Screen 14 & Screen 15.
- **📑 Statutory Returns & KRA P9 Forms**:
  - Downloadable NSSF, SHIF, and Housing Levy returns (CSV & JSON format).
  - KRA P9 12-Month Tax Deduction Card PDF generator matching Screen 24.
- **📱 Guard Mobile Portal**: Mobile-responsive portal for guards to view shift schedules, clock in/out, submit leave requests, report site incidents (`INC-XXXX`), and download payslips.
- **📜 Immutable Audit Log & Archive**: Non-mutable operational audit trail tracking all administrative actions with IP and reason logging, plus permanent compliance archiving for closed payroll periods.

---

## 🛠️ Technology Stack

- **Backend**: FastAPI (Python 3.12+), SQLAlchemy 2.0 ORM, Pydantic v2, SQLite / PostgreSQL.
- **Authentication**: JWT Bearer Tokens, Bcrypt password hashing, RBAC (`ADMIN`, `GUARD`).
- **Reports & Exporting**: ReportLab (PDF Payslips & P9 Cards), OpenPyXL (Excel Disbursement Schedules).
- **Frontend**: Responsive HTML5/CSS3 Single Page Application (SPA), CorpSec Dark Slate & Blue Design System.
- **Test Suite**: Pytest with 49 unit, integration, and E2E workflow tests (100% pass rate).

---

## 📦 Installation & Setup

### 1. Environment Setup
```bash
# Clone repository
cd "corpsec web app"

# Activate Python Virtual Environment
application/venv/Scripts/activate  # On Windows

# Install Dependencies
pip install -r application/backend/requirements.txt
```

### 2. Run Database Migrations & Initial Seed Data
```bash
python -m application.backend.app.main
```

### 3. Launch Development Server
```bash
python -m uvicorn application.backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
- **Admin Web App**: Open `http://localhost:8000/` in browser.
- **API Documentation**: Open `http://localhost:8000/docs` (Swagger UI).

---

## 🔐 Default Credentials (Initial Seed)

| Role | Login Identifier (Email / Employee ID / Phone) | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@corpsec.co.ke` | `[Configured via ADMIN_INITIAL_PASSWORD env var]` | Full System Admin (`/`) |
| **Guard User (Peter Otieno)** | `peter.otieno@corpsec.co.ke` (or `CS-00431`) | `Guard@123456` | Guard Mobile Portal (`/portal`) |
| **Guard User (Mary Akinyi)** | `mary.akinyi@corpsec.co.ke` (or `CS-00418`) | `Guard@123456` | Guard Mobile Portal (`/portal`) |
| **Guard User (John Mwangi)** | `cs00452@corpsec.co.ke` (or `john.mwangi@corpsec.co.ke`) | `Guard@123456` | Guard Mobile Portal (`/portal`) |
| **Guard User (James Omosa)** | `james.omosa@corpsec.co.ke` (or `CS-00405`) | `Guard@123456` | Guard Mobile Portal (`/portal`) |

---

## 🧪 Running the Test Suite

```bash
application/venv/Scripts/python.exe -m pytest application/backend/tests
```

**Test Coverage**:
- `test_foundation.py`: Database models & health checks.
- `test_auth.py`: JWT login, password hashing & RBAC.
- `test_workforce.py`: Guards, sites, rates, bulk salary changes.
- `test_attendance.py`: Clock-in/out, shift hours, overtime.
- `test_payroll_engine.py`: Statutory NSSF, SHIF, Housing Levy, PAYE formulas.
- `test_payroll_workflow.py`: Period calculation, pre-payroll error scanner, confirmation lock.
- `test_guard_portal.py`: Mobile portal, today's shift, incident reporting.
- `test_statutory_reports.py`: NSSF, SHIF, Housing Levy returns & P9 PDF generator.
- `test_settings_and_archive.py`: Parameter settings, audit logging, period closure lock.
- `test_frontend.py`: SPA web page and static CSS/JS delivery.
- `test_e2e_workflow.py`: End-to-end full system lifecycle integration test.

---

## 📄 License & Compliance

© 2026 CorpSec Kenya Ltd. All Rights Reserved. Compliant with Laws of Kenya.
