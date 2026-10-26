# Frontend ↔ Backend 500 Internal Server Error Fix Report

**Project**: CorpSec Payroll & Workforce Management System  
**Date**: September 3, 2026  
**Status**: **RESOLVED & VERIFIED (200 OK JSON)**  

---

## 1. Executive Summary

An urgent issue was reported where loading the CorpSec web application resulted in backend `500 Internal Server Error` responses on four key endpoints:
- `GET /api/v1/guards`
- `GET /api/v1/attendance`
- `GET /api/v1/shifts`
- `GET /api/v1/sites`

This led to the browser console throwing `SyntaxError: Unexpected token 'I', "Internal S"... is not valid JSON` when attempting to parse HTML exception pages returned by the backend.

The issue was diagnosed, traced to database schema drift in SQLite, fixed at the database and application startup layer, and verified through both direct API testing and the full 58-test automated suite.

---

## 2. Root Cause Analysis

Tracing the exact Python tracebacks using `fastapi.testclient` revealed that SQLite table schemas in `corpsec_payroll.db` had drifted from the SQLAlchemy ORM model definitions due to table creation timing:

1. **`GET /api/v1/guards` (500 Error)**:
   - **Traceback**: `sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) no such column: guards.primary_site_id`
   - **Root Cause**: The SQLite table `guards` on disk contained an older column `site_id` instead of `primary_site_id` declared in `app/models/guard.py`.

2. **`GET /api/v1/shifts` (500 Error)**:
   - **Traceback**: `sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) no such column: shifts.is_night_shift`
   - **Root Cause**: The column `is_night_shift` declared in `app/models/shift.py` was missing from the existing SQLite `shifts` table.

3. **`GET /api/v1/attendance` (500 Error)**:
   - **Traceback**: `sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) no such column: attendance.notes`
   - **Root Cause**: The column `notes` declared in `app/models/attendance.py` was missing from the existing SQLite `attendance` table.

4. **`GET /api/v1/sites` (500 Error)**:
   - **Traceback**: `sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) no such column: guards.primary_site_id`
   - **Root Cause**: `GET /api/v1/sites` returns `SiteResponse` objects, which serialize the `@property guard_count` on `Site`. `guard_count` queries `self.guards`, which executed a query against `guards.primary_site_id`, triggering the missing column exception.

---

## 3. Fixes Implemented

### A. Automatic Database Schema Synchronization (`app/core/database.py`)
Added `sync_db_schema()` to automatically detect missing columns in existing SQLite tables on startup and execute non-destructive DDL migrations (`ALTER TABLE ... ADD COLUMN ...`).

```python
def sync_db_schema():
    """Ensure all required columns exist in SQLite database."""
    # Checks table PRAGMAs and performs ALTER TABLE ADD COLUMN
    # for primary_site_id, is_night_shift, notes, status, error_code, etc.
```

### B. Application Startup Integration (`app/main.py`)
Invoked `sync_db_schema()` immediately after `Base.metadata.create_all(bind=engine)` in `app/main.py` to guarantee that existing database files are automatically updated whenever Uvicorn or test sessions launch.

### C. Frontend Helper Refactoring (`application/frontend/static/js/app.js`)
Refactored report download helper functions (`exportBankScheduleExcel`, `exportMpesaScheduleExcel`, `downloadNssfCsv`, `downloadShifCsv`, `downloadHousingLevyCsv`, `downloadP9Pdf`) to dynamically query active period and guard IDs rather than relying on static defaults.

---

## 4. Verification & Endpoint Testing Results

### Direct API Response Testing
Tested endpoints directly using `TestClient` with administrative authentication:

| Endpoint | Prior Status | New Status | Response Format |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/guards` | `500 Internal Server Error` | **`200 OK`** | `Valid JSON Array [...]` |
| `GET /api/v1/attendance` | `500 Internal Server Error` | **`200 OK`** | `Valid JSON Array [...]` |
| `GET /api/v1/shifts` | `500 Internal Server Error` | **`200 OK`** | `Valid JSON Array [...]` |
| `GET /api/v1/sites` | `500 Internal Server Error` | **`200 OK`** | `Valid JSON Array [...]` |

Unauthenticated requests to all four endpoints cleanly return `401 Unauthorized` with JSON payload `{"detail":"Could not validate credentials"}` without throwing 500 errors.

---

## 5. Automated Test Suite Results

Command:
```powershell
application\venv\Scripts\python.exe -m pytest application/backend/tests -v
```

Output:
```text
======================= 58 passed in 109.90s (0:01:49) ========================
```

- **Total Tests**: `58`
- **Passed**: `58 (100%)`
- **Failed**: `0`
- **Warnings**: `0`

---

## 6. Conclusion

All four failing endpoints (`/guards`, `/attendance`, `/shifts`, `/sites`) now return valid JSON responses with `200 OK` status codes. The backend 500 errors and frontend JSON parse exceptions are fully resolved.
