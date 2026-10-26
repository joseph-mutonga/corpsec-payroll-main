# CorpSec Payroll System — Architecture Consistency Check & Blueprint Reconciliations

## Executive Summary
This document records the formal Architecture Consistency Check performed on the CorpSec Security Guard Workforce & Statutory Payroll System prior to final production sign-off. It reconciles the database schema, verifies module-to-screen mappings, confirms the isolation of the payroll engine, and establishes the strict separation of development phases.

---

## 1. Development Phase Isolation Matrix

Each phase retains its independent implementation boundary and strictly executes the mandatory lifecycle:
`ANALYZE → PLAN → BUILD → TEST → REVIEW → FIX → VERIFY`

| Phase | Core Objective | Primary Components / Files | Isolated Test Suite |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Technical Foundation & Schema | SQLAlchemy ORM Models, Config, Core DB, Seed Service | `test_foundation.py` |
| **Phase 2** | Auth & Security Foundation | JWT Bearer, Bcrypt Hashing, User RBAC (`ADMIN`, `GUARD`) | `test_auth.py` |
| **Phase 3** | Guards, Sites & Rates | Workforce Profiles, Site Billing, Bulk Salary Changes | `test_workforce.py` |
| **Phase 4** | Attendance, Shifts & Overtime | 12h Day/Night Shifts, Clock-in/out, Anomaly Scanner | `test_attendance.py` |
| **Phase 5** | Statutory Calculation Engine | NSSF 6%, SHIF 2.75%, Housing Levy 1.5%, KRA PAYE | `test_payroll_engine.py` |
| **Phase 6** | Payroll Review & Payment Schedules | Confirmation Lock, ReportLab PDF Payslips, OpenPyXL Excel | `test_payroll_workflow.py` |
| **Phase 7** | Guard Mobile Portal | Mobile Dashboard, Incident Reporting (`INC-XXXX`), Leave | `test_guard_portal.py` |
| **Phase 8** | Statutory Returns & Audit Log | NSSF, SHIF, Housing Levy Returns, KRA P9 PDF, Audit Log | `test_statutory_reports.py` |
| **Phase 9** | Settings & Compliance Archiving | Statutory Parameters Form, Period Archive & Closure Lock | `test_settings_and_archive.py` |
| **Phase 10**| Admin Web UI Dashboard SPA | Responsive HTML5/CSS3 Single Page Application (`index.html`)| `test_frontend.py` |
| **Phase 11**| End-to-End System Integration | Comprehensive E2E System Integration Test Suite | `test_e2e_workflow.py` |

*Note: Phase 5 (Payroll Engine) and Phase 6 (Review & Payslips) are kept strictly separate. Phase 8 (Reports & Audit) and Phase 9 (Settings & Archiving) are kept strictly separate.*

---

## 2. Reconciled Authoritative Database Entity Schema (23 Entities)

The initial Phase 0 summary noted 18 primary tables, but the comprehensive domain requires 23 database models. All 23 models are fully implemented with foreign key constraints, indexes, timestamps, and status fields:

| # | Model Class | Table Name | Foreign Keys / Relationships | Key Indexed Fields |
| :-: | :--- | :--- | :--- | :--- |
| 1 | `User` | `users` | Optional `guard_id` -> `guards.id` | `email` (unique), `role` |
| 2 | `Guard` | `guards` | `primary_site_id` -> `sites.id`, `shift_id` -> `shifts.id` | `employee_number` (unique), `national_id` |
| 3 | `Site` | `sites` | None | `site_name` (unique) |
| 4 | `Shift` | `shifts` | None | `shift_type` |
| 5 | `Attendance` | `attendance` | `guard_id` -> `guards.id`, `shift_id` -> `shifts.id` | `shift_date`, `status` |
| 6 | `OvertimeClaim` | `overtime_claims` | `guard_id` -> `guards.id`, `attendance_id` -> `attendance.id` | `claim_date`, `status` |
| 7 | `PayrollPeriod` | `payroll_periods` | None | `year`, `month`, `status` |
| 8 | `PayrollRecord` | `payroll_records` | `payroll_period_id` -> `payroll_periods.id`, `guard_id` -> `guards.id` | `guard_id`, `payroll_period_id` |
| 9 | `PayrollError` | `payroll_errors` | `payroll_period_id` -> `payroll_periods.id`, `guard_id` -> `guards.id` | `severity`, `status` |
| 10 | `Payslip` | `payslips` | `payroll_record_id` -> `payroll_records.id` | `payslip_number` (unique) |
| 11 | `BankPaymentSchedule` | `bank_payment_schedules` | `payroll_period_id` -> `payroll_periods.id` | `bank_name` |
| 12 | `BankPaymentItem` | `bank_payment_items` | `schedule_id` -> `bank_payment_schedules.id`, `guard_id` | `account_number` |
| 13 | `MpesaPaymentSchedule`| `mpesa_payment_schedules`| `payroll_period_id` -> `payroll_periods.id` | `batch_reference` |
| 14 | `MpesaPaymentItem` | `mpesa_payment_items` | `schedule_id` -> `mpesa_payment_schedules.id`, `guard_id` | `phone_number` |
| 15 | `AuditLog` | `audit_log` | `user_id` -> `users.id` | `timestamp`, `action` |
| 16 | `Setting` | `settings` | None | `key` (primary key) |
| 17 | `ArchivePayroll` | `archive_payroll` | `payroll_period_id` -> `payroll_periods.id` | `payroll_period_id` (unique) |
| 18 | `ArchivePayrollItem` | `archive_payroll_items` | `archive_payroll_id` -> `archive_payroll.id` | `guard_id` |
| 19 | `LeaveRequest` | `leave_requests` | `guard_id` -> `guards.id` | `guard_id`, `status` |
| 20 | `Incident` | `incidents` | `guard_id` -> `guards.id`, `site_id` -> `sites.id` | `reference_number` (unique) |
| 21 | `TrainingRecord` | `training_records` | `guard_id` -> `guards.id` | `guard_id`, `status` |
| 22 | `Benefit` | `benefits` | `guard_id` -> `guards.id` | `guard_id` |
| 23 | `Document` | `documents` | `guard_id` -> `guards.id` | `guard_id`, `document_type` |

---

## 3. Screen-to-Backend Functionality Mapping Verification

All 18 Admin Screens and Guard Portal Screens are fully mapped to backend REST API endpoints:

- **Screen 1 (Sidebar Navigation)**: Authenticated session state & navigation endpoints.
- **Screen 2 (Dashboard)**: `/api/v1/guards`, `/api/v1/sites`, `/api/v1/payroll/periods`, `/api/v1/attendance/anomalies`.
- **Screens 3 & 4 (Guard Directory & Profiling)**: `/api/v1/guards` (GET, POST, PUT, DEACTIVATE).
- **Screens 5 & 6 (Client Sites & Rates)**: `/api/v1/sites` (GET, POST, PUT, BULK-SALARY-CHANGE).
- **Screens 7 & 8 (Shift Roster & CSV Upload)**: `/api/v1/shifts` (GET, POST, IMPORT-CSV).
- **Screens 9 & 10 (Attendance & Overtime)**: `/api/v1/attendance` & `/api/v1/overtime` (LOG, CORRECT, APPROVE, REJECT).
- **Screens 11 & 12 (Guided Payroll Engine & Review)**: `/api/v1/payroll` (CALCULATE, ERRORS, RESOLVE, CONFIRM).
- **Screen 13 (Bulk Payslips)**: `/api/v1/payslips/bulk-zip/{period_id}`.
- **Screens 14 & 15 (Disbursement Schedules)**: `/api/v1/payments/bank` & `/api/v1/payments/mpesa` (JSON & Excel exports).
- **Screen 16 (Audit Log)**: `/api/v1/audit-logs`.
- **Screen 17 (System Settings & Rates)**: `/api/v1/settings`.
- **Screen 18 (Compliance Archive)**: `/api/v1/archive`.
- **Screens 19 & 20 (Guard Portal)**: `/api/v1/portal/dashboard`, `/api/v1/portal/report-incident`.
- **Screens 21--24 (Statutory Returns & P9 Forms)**: `/api/v1/reports/nssf`, `/shif`, `/housing-levy`, `/p9`.

---

## 4. Statutory Rate Configuration & Preservation of Historical Calculations

1. **Configurability**: Key rates (`nssf_rate`, `shif_rate`, `shif_floor`, `housing_levy_rate`, `personal_relief`) are dynamically managed in the `settings` table without changing backend source code.
2. **Historical Calculation Preservation**: When a payroll calculation is executed, the calculated gross pay, NSSF, SHIF, Housing Levy, PAYE, and Net Pay are explicitly stored in the immutable `PayrollRecord` table and archived in `ArchivePayrollItem`. Future rate changes in `settings` do NOT alter past calculated payroll records.
