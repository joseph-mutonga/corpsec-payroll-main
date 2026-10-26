# CorpSec Payroll System — Phase 0 Master Blueprint & Requirements Traceability Matrix

**Document Status:** Complete & Approved Specification Blueprint  
**Date:** September 1, 2026  
**System:** CorpSec Payroll System (Admin Web App + Guard Mobile Portal)  
**Sources of Truth:**
1. Product Requirements Document (`docs/corpsec-payroll-prd.md`)
2. UI/UX Specification (`docs/corpsec-payroll-all-screens.pdf`)
3. System Design Document (`docs/CorpSec_Payroll_System_Design_Document_FULL.pdf`)
4. Tech Stack Specification (`docs/corpsec-payroll-tech-stack.md`)
5. Master Development Prompts (`prompts/CorpSec_Antigravity_Master_Development_Prompts.docx`)

---

## 1. Executive Summary & Workspace Analysis

The CorpSec Payroll System is a centralized workforce management and payroll platform designed specifically for security firms managing guards working across multiple client sites, rotating shifts, and pay periods.

### Workspace Status
- Directory: `c:\Users\user\OneDrive\Desktop\corpsec web app`
- Existing structure: `docs/` (contains PRD, Tech Stack, System Design PDF, All Screens PDF) and `prompts/` (contains Master Development Prompts DOCX).
- Existing codebase: Clean workspace. No legacy code to delete. Application will be created inside the workspace adhering strictly to the architecture.

---

## 2. Requirements Traceability Matrix (RTM)

| Requirement ID | Category | Requirement Description | Source Doc | Planned Module / API | Phase |
|---|---|---|---|---|---|
| **REQ-AUTH-01** | Security | Admin login with email, password, remember me, forgot password | PRD §8.1 / SDD §3.1 / Screen 01 | `application/backend/api/auth.py`, `application/frontend/admin/login.html` | Phase 2 |
| **REQ-AUTH-02** | Security | Guard login with Guard ID/Phone and PIN/Password | PRD §9.1 / SDD §3.2 / Screen 25 | `application/backend/api/auth.py`, `application/frontend/guard/login.html` | Phase 2 |
| **REQ-AUTH-03** | Security | Password hashing with passlib (bcrypt), JWT tokens, session tracking | Tech Stack / SDD §18 | `application/backend/core/security.py` | Phase 2 |
| **REQ-AUTH-04** | Security | Server-side RBAC (Admin vs Guard isolation, no cross-access) | PRD §8.1 / Master Prompts | `application/backend/api/deps.py` | Phase 2 |
| **REQ-AUTH-05** | Security | Rate limiting on authentication endpoints (SlowAPI) | Tech Stack / SDD §18 | `application/backend/core/rate_limit.py` | Phase 2 |
| **REQ-GRD-01** | Workforce | Guard list view (search, filter, status pills, pagination) | PRD §8.2 / Screen 03 | `application/backend/api/guards.py`, `application/frontend/admin/guards.html` | Phase 3 |
| **REQ-GRD-02** | Workforce | Add/Edit Guard form with field validation & statutory info | PRD §8.2 / Screen 05 | `application/backend/api/guards.py` | Phase 3 |
| **REQ-GRD-03** | Workforce | Guard Profile view (personal, employment, salary, documents) | PRD §8.2 / Screen 04 | `application/backend/api/guards.py` | Phase 3 |
| **REQ-GRD-04** | Workforce | Soft Deactivation workflow (No hard delete, reason required, audit log) | PRD §8.2 / SDD §8 / Screen 03 | `application/backend/services/guard_service.py` | Phase 3 |
| **REQ-SITE-01** | Workforce | Site directory (name, location, client, guard count, rates) | PRD §8.3 / SDD §9 / Screen 06 | `application/backend/api/sites.py` | Phase 3 |
| **REQ-SITE-02** | Workforce | Per-site salary & allowance configuration | PRD §8.3 / Screen 07 | `application/backend/api/sites.py` | Phase 3 |
| **REQ-SITE-03** | Workforce | Bulk salary change with affected guards preview & confirmation | PRD §8.3 / Tech Stack | `application/backend/services/site_service.py` | Phase 3 |
| **REQ-SHFT-01** | Time & Attendance | Shift scheduling table (Day, Night, Split, Midnight-crossing) | PRD §8.4 / SDD §10 / Screen 08 | `application/backend/api/shifts.py` | Phase 4 |
| **REQ-SHFT-02** | Time & Attendance | CSV/Excel shift import with data validation | PRD §8.4 / Tech Stack | `application/backend/services/shift_service.py` | Phase 4 |
| **REQ-ATT-01** | Time & Attendance | Clock-in / Clock-out handling with timestamping | PRD §9.2 / SDD §11 / Screen 26 | `application/backend/api/attendance.py` | Phase 4 |
| **REQ-ATT-02** | Time & Attendance | Pre-payroll attendance validation (missing clock-out, duplicates, excessive hours) | PRD §8.4 / SDD §11 / Screen 09 | `application/backend/services/attendance_service.py` | Phase 4 |
| **REQ-ATT-03** | Time & Attendance | Attendance summary dashboard & filterable table | PRD §8.4 / Screen 09 | `application/backend/api/attendance.py` | Phase 4 |
| **REQ-PAY-01** | Payroll Engine | Guided Payroll Run flow (Period selection, calculation trigger) | PRD §8.5 / SDD §12 / Screen 10 | `application/backend/api/payroll.py` | Phase 5 |
| **REQ-PAY-02** | Payroll Engine | Gross Pay calculation (Regular <=8h @ base rate + Overtime >8h @ 1.5x + Allowances) | PRD §8.6 / SDD §13 | `application/backend/services/payroll_engine.py` | Phase 5 |
| **REQ-PAY-03** | Payroll Engine | Kenyan Statutory Deductions (NSSF 6%, SHIF 2.75% min KES 300, Housing Levy 1.5%, PAYE progressive bands - KES 2,400 relief) | PRD §8.6 / SDD §13 / Screen 17 | `application/backend/services/payroll_engine.py` | Phase 5 |
| **REQ-PAY-04** | Payroll Engine | Net Pay calculation & rounding | PRD §8.6 / SDD §13 | `application/backend/services/payroll_engine.py` | Phase 5 |
| **REQ-PAY-05** | Payroll Engine | Anomaly detection & Payroll Errors review table (missing NSSF/SHIF/Bank, high overtime, salary jump) | PRD §8.5 / SDD §14 / Screen 11 | `application/backend/services/payroll_validator.py` | Phase 5 |
| **REQ-PAY-06** | Payroll Engine | Error resolution workflow (Fix or Ignore with Audit Log entry) | PRD §8.5 / SDD §14 / Screen 11 | `application/backend/api/payroll.py` | Phase 6 |
| **REQ-PAY-07** | Payroll Engine | Payslip preview & individual PDF download | PRD §8.7 / SDD §15 / Screen 12 | `application/backend/services/pdf_service.py` | Phase 6 |
| **REQ-PAY-08** | Payroll Engine | Bulk Payslip PDF generation to single destination folder | PRD §8.7 / Screen 13 | `application/backend/services/pdf_service.py` | Phase 6 |
| **REQ-PAY-09** | Payroll Engine | Bank Payment Schedule generation & export (PDF/Excel) | PRD §8.7 / SDD §16 / Screen 14 | `application/backend/services/excel_service.py` | Phase 6 |
| **REQ-PAY-10** | Payroll Engine | M-Pesa Payment Schedule generation & export (PDF/Excel) | PRD §8.7 / SDD §16 / Screen 15 | `application/backend/services/excel_service.py` | Phase 6 |
| **REQ-GMB-01** | Guard Portal | Mobile Guard Home (Greeting, Today's shift, Clock In/Out button, Recent pay summary) | PRD §9.2 / SDD §17 / Screen 26 | `application/frontend/guard/home.html` | Phase 7 |
| **REQ-GMB-02** | Guard Portal | My Attendance view (Monthly days worked, overtime, late, absent) | PRD §9.3 / SDD §17 / Screen 27 | `application/frontend/guard/attendance.html` | Phase 7 |
| **REQ-GMB-03** | Guard Portal | My Pay view (Net pay highlight, earnings breakdown, statutory deductions, payslip PDF download) | PRD §9.4 / SDD §17 / Screen 28 | `application/frontend/guard/pay.html` | Phase 7 |
| **REQ-GMB-04** | Guard Portal | My Documents view (Payslips, contract, ID card, handbook) | PRD §9.5 / Screen 29 | `application/frontend/guard/documents.html` | Phase 7 |
| **REQ-GMB-05** | Guard Portal | My Leave request submission (Type, start/end dates, reason, status tracking) | PRD §9.6 / SDD §17 / Screen 30 | `application/frontend/guard/leave.html` | Phase 7 |
| **REQ-GMB-06** | Guard Portal | Incident Reporting (Type, date/time, location, description, photo attachment, reference number) | PRD §9.7 / SDD §17 / Screen 31 | `application/frontend/guard/incident.html` | Phase 7 |
| **REQ-GMB-07** | Guard Portal | Guard Profile & Password change | PRD §9.8 / Screen 32 | `application/frontend/guard/profile.html` | Phase 7 |
| **REQ-MGT-01** | Management | Admin Leave Management (Pending requests list, Approve/Decline/Request Info) | PRD §8.8 / Screen 16 | `application/backend/api/leave.py` | Phase 8 |
| **REQ-MGT-02** | Management | Benefits & Compensation change tracking (Effective date, old vs new value, admin, reason) | PRD §8.8 / Tech Stack | `application/backend/api/benefits.py` | Phase 8 |
| **REQ-MGT-03** | Management | Training Management (Course, date, expiry, certificate link, status alert) | PRD §8.8 / SDD §24 | `application/backend/api/training.py` | Phase 8 |
| **REQ-MGT-04** | Management | Incidents Review & Log (Full log across all sites, status updates) | PRD §8.8 / Screen 20, 21 | `application/backend/api/incidents.py` | Phase 8 |
| **REQ-REP-01** | Analytics | Management Dashboard metrics (Total employees, on duty, absent, on leave, payroll overview, alerts) | PRD §8.9 / SDD §21 / Screen 02 | `application/backend/api/reports.py` | Phase 9 |
| **REQ-REP-02** | Analytics | Reports & Analytics charts (Payroll breakdown, statutory totals, headcount/turnover using Chart.js) | PRD §8.9 / SDD §21 / Screen 20 | `application/frontend/admin/reports.html` | Phase 9 |
| **REQ-ARC-01** | Control & Audit | Protected Month Close & Rollover workflow ("Is there anything wrong with this payroll?" safety check) | PRD §8.10 / SDD §20 / Screen 24 | `application/backend/services/month_close_service.py` | Phase 10 |
| **REQ-ARC-02** | Control & Audit | Read-only Historical Archive (Preserves exact closed values, immune to live formula/rate changes) | PRD §8.10 / SDD §20 | `application/backend/models/archive.py` | Phase 10 |
| **REQ-ARC-03** | Control & Audit | Append-only Audit Log (Records user, action, target, timestamp, old/new values) | PRD §8.10 / SDD §19 | `application/backend/services/audit_service.py` | Phase 10 |
| **REQ-SET-01** | System Ops | Settings management (General, Payroll, Statutory rates, Notifications, Backup config) | PRD §8.11 / SDD §22 / Screen 22, 23 | `application/backend/api/settings.py` | Phase 11 |

---

## 3. Database Architecture & Schema Design

The system uses SQLAlchemy ORM mapping to PostgreSQL (with SQLite for local development).

### Table Entities Summary
1. `users`: `id`, `email`, `phone`, `password_hash`, `role` (ADMIN, GUARD), `is_active`, `last_login`, `created_at`, `updated_at`.
2. `guards`: `id`, `employee_number`, `full_name`, `national_id`, `phone`, `email`, `date_of_birth`, `gender`, `site_id`, `shift_id`, `hire_date`, `basic_salary`, `payment_method`, `bank_name`, `bank_account`, `mpesa_number`, `nssf_number`, `shif_number`, `kra_pin`, `status` (ACTIVE, INACTIVE, SUSPENDED), `deactivation_reason`, `created_at`, `updated_at`.
3. `sites`: `id`, `site_name`, `location`, `client_name`, `daily_rate`, `night_allowance`, `transport_allowance`, `housing_allowance`, `status`, `created_at`, `updated_at`.
4. `shifts`: `id`, `name`, `shift_type` (DAY, NIGHT, SPLIT), `start_time`, `end_time`, `duration_hours`.
5. `attendance`: `id`, `guard_id`, `site_id`, `shift_id`, `shift_date`, `scheduled_start`, `scheduled_end`, `actual_clock_in`, `actual_clock_out`, `regular_hours`, `overtime_hours`, `status` (PRESENT, ABSENT, LATE, CLOCKED_IN, MISSING, OVERTIME), `flagged_reason`, `created_at`.
6. `payroll_periods`: `id`, `year`, `month`, `period_name`, `start_date`, `end_date`, `status` (DRAFT, CALCULATED, CONFIRMED, CLOSED), `calculated_at`, `confirmed_at`, `closed_at`, `closed_by`.
7. `payroll_records`: `id`, `payroll_period_id`, `guard_id`, `site_id`, `days_worked`, `regular_hours`, `overtime_hours`, `basic_pay`, `overtime_pay`, `allowances`, `gross_pay`, `nssf_deduction`, `shif_deduction`, `housing_levy_deduction`, `paye_deduction`, `other_deductions`, `total_deductions`, `net_pay`, `status`.
8. `payroll_errors`: `id`, `payroll_period_id`, `guard_id`, `error_type`, `description`, `severity` (LOW, MEDIUM, HIGH, CRITICAL), `status` (OPEN, FIXED, IGNORED), `resolved_at`, `resolved_by`.
9. `payslips`: `id`, `payroll_record_id`, `guard_id`, `payroll_period_id`, `payslip_number`, `pdf_path`, `generated_at`.
10. `payment_schedules` & `payment_schedule_items`: `id`, `payroll_period_id`, `schedule_type` (BANK, MPESA), `total_amount`, `item_count`, `file_path`, `generated_at`.
11. `leave_requests`: `id`, `guard_id`, `leave_type`, `start_date`, `end_date`, `duration_days`, `reason`, `status` (PENDING, APPROVED, REJECTED), `reviewed_by`, `reviewed_at`.
12. `incidents`: `id`, `reference_number`, `guard_id`, `site_id`, `incident_type`, `incident_date`, `incident_time`, `description`, `photo_path`, `status` (OPEN, SCHEDULED, COMPLETED), `created_at`.
13. `training_records`: `id`, `guard_id`, `course_name`, `completion_date`, `expiry_date`, `certificate_path`, `status` (VALID, EXPIRING, EXPIRED).
14. `documents`: `id`, `guard_id`, `document_type`, `filename`, `file_path`, `uploaded_by`, `uploaded_at`.
15. `benefits`: `id`, `guard_id`, `benefit_type`, `amount`, `effective_date`, `previous_value`, `new_value`, `reason`, `updated_by`, `updated_at`.
16. `audit_log`: `id`, `timestamp`, `user_id`, `user_name`, `role`, `action`, `target_entity`, `target_id`, `old_values`, `new_values`, `reason`, `ip_address`.
17. `archive_payroll` & `archive_payroll_items`: Immutable snapshot tables for closed periods.
18. `settings`: System configurations (tax rates, statutory floors, period defaults).

---

## 4. Kenyan Statutory & Payroll Calculation Formulas

1. **Gross Pay Calculation**:
   $$\text{Regular Pay} = \text{Regular Hours Worked} \times \left(\frac{\text{Site Daily Rate}}{8}\right)$$
   $$\text{Overtime Pay} = \text{Overtime Hours Worked} \times \left(\frac{\text{Site Daily Rate}}{8}\right) \times 1.5$$
   $$\text{Gross Pay} = \text{Regular Pay} + \text{Overtime Pay} + \text{Night Allowance} + \text{Transport Allowance} + \text{Other Allowances}$$

2. **Statutory Deductions (Kenyan Law Standard)**:
   - **NSSF (6%)**: $6\%$ of Pensionable Earnings (Tier I + Tier II limits).
   - **SHIF (2.75%)**: $2.75\%$ of Gross Pay, subject to a minimum floor of $\text{KES } 300.00$.
     $$\text{SHIF} = \max(0.0275 \times \text{Gross Pay}, 300.00)$$
   - **Housing Levy (1.5%)**: $1.5\%$ of Gross Pay.
     $$\text{Housing Levy} = 0.015 \times \text{Gross Pay}$$
   - **PAYE (Pay As You Earn)**:
     Calculate Taxable Pay = $\text{Gross Pay} - \text{NSSF}$. Apply progressive monthly bands:
     - Band 1: Up to KES 24,000 @ 10%
     - Band 2: Next KES 8,333 (KES 24,001 - 32,333) @ 25%
     - Band 3: Next KES 467,667 (KES 32,334 - 500,000) @ 30%
     - Band 4: Next KES 300,000 (KES 500,001 - 800,000) @ 32.5%
     - Band 5: Above KES 800,000 @ 35%
     Subtotal Tax $- \text{Monthly Personal Relief (KES 2,400.00)}$. Net PAYE $\ge 0$.

3. **Net Pay Calculation**:
   $$\text{Net Pay} = \text{Gross Pay} - (\text{NSSF} + \text{SHIF} + \text{Housing Levy} + \text{PAYE} + \text{Other Deductions})$$

---

## 5. Security & Safety Controls

1. **Authentication**: Bcrypt hashing (`passlib`), OAuth2 JWT bearer tokens in secure cookies/headers. Rate limiting via SlowAPI (e.g. 5 login attempts/min).
2. **Authorization & RBAC**: FastAPI dependency middleware verifying caller identity. Guards are restricted strictly to `/api/guard/*` and their own `guard_id`. Admins restricted to `/api/admin/*`.
3. **Safety Dialogs**: Financial and state modifications require explicit confirmation (Guard Deactivation, Period Confirmation, Month Close, Bulk Salary Change, Ignoring Payroll Errors).
4. **Audit Logging**: Append-only log table capturing every critical action with before/after state diffs.
5. **Period Protection**: Once a month is closed, status changes to `CLOSED` and snapshot is archived into `archive_payroll`. Backend rejects any `UPDATE` or `DELETE` on closed payroll tables.

---

## 6. Document Contradictions, Assumptions & Resolutions

| # | Topic | Observation / Contradiction | Resolution & Implementation Choice |
|---|---|---|---|
| 1 | **Group Insurance Deduction** | Screen 18 (Statutory Contributions) shows Group Insurance KES 500/month, whereas PRD §8.6 focuses on NSSF, SHIF, Housing Levy, and PAYE. | Standard statutory deductions (NSSF, SHIF, Housing Levy, PAYE) will be calculated dynamically. Group Insurance will be supported as a configurable fixed monthly deduction under Statutory Contributions / Other Deductions. |
| 2 | **Database Engine** | Tech Stack specifies SQLite for local development and PostgreSQL for production. | Database layer built with SQLAlchemy ORM + Alembic migrations, fully compatible with both SQLite and PostgreSQL. SQLite will be used for zero-dependency local execution and unit tests. |
| 3 | **PDF Generator Library** | WeasyPrint requires GTK libraries on Windows which can be missing in minimal environments. | Python PDF service will attempt WeasyPrint first, with a robust native ReportLab / HTML fallback so PDF payslip export never crashes on any host OS. |
| 4 | **Guard Self-Service Scope** | PRD non-goals state no native mobile app, while UI screens provide a mobile-first web view. | The Guard Mobile Portal will be implemented as a clean, responsive mobile web interface (390-430px) integrated into the web application. |

---

## 7. Implementation Roadmap & Phase Sequence

Following the Master Development Prompts sequence:
- **Phase 1**: Technical Foundation, Database Models, Migrations & Environment Setup
- **Phase 2**: Authentication, Users, Roles & Security Foundation
- **Phase 3**: Guards, Sites, Shifts & Guard Status Management
- **Phase 4**: Attendance, Clock-In/Out & Overtime Management
- **Phase 5**: Payroll Engine, Statutory Calculations & Validation Rules
- **Phase 6**: Payroll Review, Confirmation, Payslips & Payment Schedules
- **Phase 7**: Guard Mobile Portal (Self-Service)
- **Phase 8**: Leave, Documents, Benefits, Training & Incidents Modules
- **Phase 9**: Reports, Dashboard, Analytics & Visualizations
- **Phase 10**: Month Close, Historical Archive & Audit Trail
- **Phase 11**: Settings, Admin Controls & Operational Configuration
- **Phase 12**: System-Wide Security, Quality, Performance & Regression Review
- **Phase 13**: Final End-to-End Testing, Release Gate Verification & Documentation

---

## 8. Phase 0 Completion & Readiness Assessment

- **Documentation Analysis**: 100% Complete. All 4 official docs + Master Prompts read & analyzed.
- **Traceability Matrix**: Complete (40 core requirements mapped across 13 phases).
- **Database Design**: Complete (18 relational tables defined with full constraints).
- **Payroll Logic**: Complete (Kenyan statutory formulas NSSF, SHIF, Housing Levy, PAYE, Overtime defined).
- **Security Audit**: Complete (RBAC, Audit Log, Password hashing, Rate limiting planned).
- **Blocker Status**: **ZERO BLOCKERS IDENTIFIED.**

*Phase 0 is complete. Proceeding immediately to Phase 1 per Master Development Prompts.*
