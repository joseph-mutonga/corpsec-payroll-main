# Product Requirements Document: CorpSec Payroll

**Status:** Draft — v2 (supersedes v1)
**Owner:** [Your name]
**Last updated:** September 1, 2026
**Source of truth:** CorpSec Payroll System — UI/UX Design & Product
Specification (production design spec)

---

## 1. Overview

CorpSec Payroll is a payroll and workforce management platform built
specifically for security companies managing guards across multiple
client sites, shifts, and pay periods. It replaces manual Excel-based
payroll with an auditable system that tracks attendance, calculates
gross-to-net pay (including Kenyan statutory deductions), and gives
guards self-service access to their own pay and attendance information.

The platform has two faces:

- **Admin web application** — a full desktop workforce and payroll
  control center for payroll administrators.
- **Guard mobile portal** — a deliberately minimal phone-first
  experience for guards, completely separate from admin functionality.

This version significantly expands the original PRD's scope: earlier
milestones covered guard management and pay calculation only. This
revision incorporates the full production design specification,
including benefits/training tracking, payment scheduling, reporting,
archiving, and audit logging.

## 2. Problem Statement

Security company payroll has operational challenges that generic small
business tools don't handle well:

- **Shift-based pay**: guards work rotating day/night shifts, often
  crossing midnight, with variable overtime — not a standard 9-to-5.
- **High turnover**: guards frequently join and leave; historical pay
  records must remain intact and auditable even after someone leaves.
- **Multi-site salary variation**: different client sites may pay
  different guard rates, and rate changes need controlled rollout.
- **Compliance risk**: security firms are heavily audited. Incorrect
  statutory deductions (NSSF, SHIF, Housing Levy, PAYE) can result in
  fines or loss of operating license.
- **Payroll is error-sensitive and high-stakes**: mistakes discovered
  after payment are costly and hard to reverse. Errors must surface
  *before* money moves, not after.
- Manual Excel processing is error-prone and doesn't scale cleanly past
  a small number of employees.

## 3. Product Vision & Design Principles

The interface must feel **professional, calm, simple, and
trustworthy**. Payroll is processed under time pressure once a month —
the system should reduce cognitive load, not add to it.

Four principles govern every screen:

1. **Calm over busy** — clean cards, generous spacing, consistent
   layouts, strong visual hierarchy. No excessive color, animation, or
   crowded dashboards.
2. **Status visible immediately** — active/inactive, present/absent,
   approved/pending/declined, clean/flagged, and similar states must be
   readable at a glance via status pills, never by coloring whole rows.
3. **One primary action per screen** — e.g. Dashboard → *Run Payroll*,
   Guards → *Add Guard*, Payslip → *Download PDF*. Secondary actions
   stay visually subordinate.
4. **Numbers come first** — gross salary, overtime, NSSF, SHIF, Housing
   Levy, PAYE, net salary, and total payroll cost get strong visual
   priority; financial figures must be easy to read and compare.

Visual system: light neutral background (#F5F6FA), white cards
(16–20px radius, soft shadows), CorpSec blue (#3B5EDB) as the primary
accent, with green/amber/red reserved strictly for status — never
decoration. Typography: Inter or equivalent clean sans-serif, bold
figures for money, regular weight for body text.

## 4. Goals

- Automate gross pay, overtime, and statutory deduction calculations
  accurately, consistently, and auditably.
- Surface payroll errors and anomalies *before* payment is confirmed.
- Give admins full workforce visibility: attendance, shifts, sites,
  leave, incidents, training — not just pay calculation.
- Give guards self-service access to their shift, attendance, pay, and
  documents from a phone.
- Maintain a permanent, read-only audit trail and archive — closed
  payroll periods are never silently altered.
- Keep the system easy to understand and maintain — not over-engineered
  for the current scale (150+ guards).

## 5. Non-Goals (for v1)

- Executing actual bank transfers or M-Pesa disbursements — the system
  generates payment schedules/export files (PDF/Excel) for the admin to
  submit through the bank/M-Pesa's own channels, but does not move
  money itself.
- Automatic tax-rate updates — statutory rates (NSSF, SHIF, Housing
  Levy, PAYE bands) are updated manually by an admin when law changes.
- Multi-company / multi-tenant support.
- Native mobile app — the guard portal is a mobile-optimized web
  experience, not an installable app.
- High-throughput background job processing (queues, etc.) — not
  justified at this scale.

## 6. Users

| Role | Needs |
|---|---|
| **Payroll Admin** | Manage guards/sites, review attendance and shifts, run and review payroll, fix errors before payment, generate payslips and payment schedules, manage leave/incidents/training, view reports, close and archive payroll periods, maintain security and audit settings |
| **Guard** | See today's shift, clock in/out, view their own attendance history, view/download payslips, access their documents, request leave, report incidents, manage their own profile |

## 7. Information Architecture

### 7.1 Admin Navigation (persistent sidebar)

1. Dashboard
2. Guards
3. Sites
4. Shifts
5. Attendance
6. Requests
7. Run Payroll
8. Payslips
9. Payment Schedules
10. Reports
11. Documents
12. Leave
13. Benefits & Compensation
14. Training
15. Incidents
16. Archive
17. Settings
18. Audit Log

Sidebar header includes the CorpSec logo, admin identity (avatar, name,
"Payroll Admin" role, account dropdown), and a global search (by guard
name, guard ID, phone, or site). Bottom of sidebar: Help & Support.

### 7.2 Guard Navigation

Bottom tab bar: Home, Attendance, Pay, Documents, More. Optimized for
390–430px mobile viewports. The guard never sees admin controls.

## 8. Core Features — Admin Web Application

### 8.1 Authentication & Security
- Admin login (email/username, password, show/hide, remember me,
  forgot password, security notice).
- Password change with strength indicator.
- Session management and login history.

### 8.2 Guards
- Searchable/filterable guard table: checkbox, guard, ID, phone, site,
  shift, salary/rate, status, actions.
- **Add/Edit Guard** form: personal info, contact, employment, site,
  shift, salary, payment method (bank/M-Pesa details), statutory
  information, documents — with validation before saving.
- **Guard Profile** view: personal info, employment, payroll summary,
  attendance summary, documents — all in one place.
- Deactivation only — guards are **never hard-deleted**. Inactive
  guards remain queryable via "Show Inactive."

### 8.3 Sites & Site Salary Management
- Site directory: name, location, guard count, salary configuration,
  day/night shift info, active status. New sites automatically appear
  in site dropdowns system-wide.
- Per-site salary configuration (e.g., a Nairobi site's guard salary).
- Bulk salary changes show which guards are affected, old vs. new
  value, and an effective date — **require explicit confirmation**
  before applying.

### 8.4 Shifts & Attendance
- Shift schedule table: guard, site, shift, date, clock-in/out,
  scheduled vs. actual hours, overtime, status.
- CSV/file import ("drag shift export here" / browse).
- Every incomplete or invalid shift record (missing clock-out, invalid
  time, duplicate shift, excessive hours) shows a warning icon —
  **visible before payroll is calculated, not after.**
- Attendance dashboard: present/absent/late/clocked-in/missing/overtime
  counts, filterable by date, site, guard, shift, status.

### 8.5 Payroll Processing
- **Run Payroll**: a guided flow, not a form. Shows period, active
  guard count, processing status. Primary action: *Calculate Payroll*.
- Post-calculation review table: guard, gross pay, NSSF, SHIF, Housing
  Levy, PAYE, other deductions, total deductions, net pay.
- Anomalies (salary far outside normal range, missing statutory data,
  unusually high overtime, unexpected net pay) are **highlighted in
  amber** for manual review before confirming.
- **Payroll Errors** screen: error type, guard, period, description,
  severity, status, recommended action; admin can *Fix* or *Ignore* —
  ignored errors are recorded in the audit log, never silently dropped.

### 8.6 Pay Calculation Logic
- Regular hours up to 8/shift at the guard's rate; overtime hours
  beyond that at 1.5×.
- Gross pay = (regular hours × rate) + (overtime hours × rate × 1.5) +
  allowances.
- Statutory deductions from gross pay: NSSF, SHIF (2.75%, KES 300
  floor), Housing Levy (1.5%), PAYE (progressive bands with personal
  relief).
- Net pay = gross pay − all statutory and other deductions.
- All calculation functions unit-tested: zero hours, midnight-crossing
  shifts, partial-month guards, SHIF floor boundary, anomalous inputs.

### 8.7 Payslips & Payments
- **Payslip Preview**: logo, guard info, period, earnings breakdown,
  statutory deductions, other deductions, net pay prominently
  displayed. Primary action: *Download PDF*.
- **Bulk Payslips**: generate for many guards at once; shows selected
  count, successful/failed counts. Destination folder chosen **once**
  — never repeatedly prompts per file.
- **Bank Payment Schedule**: guard, bank, account name/number, amount,
  reference, status — exportable as PDF/Excel.
- **M-Pesa Payment Schedule**: guard, phone, amount, reference, status
  — bulk generation supported.

### 8.8 Leave, Benefits, Training, Incidents
- **Leave Management**: guard, type, start/end date, duration, reason,
  status; detail view with Approve / Decline / Request Information;
  status updates without full page reload.
- **Benefits & Compensation**: allowances, benefits, salary
  adjustments, overtime, bonuses. Every change records effective date,
  previous value, new value, reason, admin, and timestamp.
- **Training Management**: guard, course, date, expiry, certificate,
  status (Valid / Expiring / Expired).
- **Incidents**: guards can report incidents from mobile; admin reviews
  them here (linked from Reports).

### 8.9 Reports & Analytics
- Payroll reports: total gross/deductions/net, guard count, average
  salary, overtime cost.
- Statutory reports: NSSF, SHIF, Housing Levy, PAYE totals.
- Workforce reports: headcount, turnover, attendance, overtime, leave.
- Charts kept simple and clearly labeled.

### 8.10 Archive & Audit
- **Archive**: once a payroll month is closed, its final numbers
  (guard, site, gross, each deduction, net pay, payment date/reference)
  are preserved as **read-only historical fact**, organized by year and
  month. Archived data never reflects live formula changes.
- **Audit Log**: records payroll calculated/confirmed/closed, guard
  added/deactivated, salary changed, error ignored, payslip generated,
  payment schedule generated, settings changed — each with user,
  action, date/time, affected record, and old/new values where
  applicable.
- **Month Close & Rollover**: a protected workflow. Before closing,
  shows a safety prompt ("Is there anything wrong with this payroll?"),
  period summary, remaining errors, and pending requests. Requires
  explicit admin confirmation. After closing: payroll locks, archives,
  reports update, the next period opens, and the closed month becomes
  read-only and protected from accidental modification.

### 8.11 Settings
- Company info, payroll settings, statutory settings, sites, salary
  rules, shift rules, payment methods, bank list, M-Pesa configuration,
  notifications, user preferences.

## 9. Core Features — Guard Mobile Portal

1. **Guard Login** — guard ID/phone, password/PIN, show/hide, login,
   forgot/help. Minimal by design.
2. **Guard Home** — greeting; today's shift (site, date, shift,
   scheduled start/end); primary **Clock In** button (becomes **Clock
   Out** once active); shift status, recent requests, latest payslip,
   notifications.
3. **My Attendance** — date, site, clock-in/out, hours worked, status;
   monthly summary (days worked, hours, overtime, absences). Guards
   cannot edit attendance directly — they submit a dispute/request
   instead.
4. **My Pay** — net pay prominent; gross pay, basic salary, overtime,
   NSSF, SHIF, Housing Levy, PAYE, other deductions; payslip history;
   *View Payslip* / *Download PDF*.
5. **My Documents** — payslips, employment documents, certificates;
   read-only unless explicitly allowed to upload.
6. **My Leave** — leave balance, past requests, submit new request
   (type, start/end date, reason); shows Pending after submission, and
   the guard is notified on approval/decline.
7. **Report Incident** — type, date, time, site, description, optional
   photo/document; *Submit Report*; confirmation with a reference
   number.
8. **Profile / More** — guard identity and employment info; links to
   My Documents, My Payslips, My Attendance, My Leave, Report Incident,
   Change Password, Help, Logout.

## 10. Common Components

- **Status pills**: colored background badges (Active, Inactive,
  Approved, Pending, Declined, Paid, Flagged, Clean) — never full-row
  coloring.
- **Date range control**: consistent `‹ Current Period ›` + calendar
  icon pattern reused everywhere a period is selected.
- **Tables**: clear headers, consistent spacing, sortable/filterable
  where useful, warning icons placed consistently at the start of a row
  (missing clock-out, payroll anomaly, missing statutory info, invalid
  bank info, SHIF floor issue, missing employee info).

## 11. Payroll Safety Requirements

The following actions are financially or operationally irreversible
and **require explicit confirmation** — never a single accidental
click:

- Confirm payroll
- Close payroll
- Apply bulk salary change
- Deactivate a guard
- Ignore a payroll error
- Generate a final payment schedule

## 12. What the System Must Not Do

- Overload users with unnecessary information.
- Mix admin controls into the guard portal.
- Delete historical guards or closed payroll.
- Hide payroll errors or anomalous salary calculations.
- Repeatedly prompt for a save location during bulk file generation.
- Require unnecessary navigation for common tasks.
- Use decorative colors that could be confused with payroll status.
- Allow accidental modification of archived payroll.

## 13. Technical Approach (Summary)

- **Backend**: Python + FastAPI
- **Database**: PostgreSQL (SQLite acceptable for early development)
- **ORM / migrations**: SQLAlchemy + Alembic
- **Testing**: pytest, with mandatory coverage of pay-calculation edge
  cases and archive/audit-log integrity
- **PDF generation**: WeasyPrint
- **Frontend**: simple server-rendered pages or lightweight React for
  admin (desktop-first, 1366–1920px); a mobile-optimized web view for
  guards (390–430px) — kept intentionally basic on both sides
- **Backups**: scheduled database dumps to offsite/cloud storage

Deliberately excluded at this stage: message queues (Redis/Celery),
container orchestration, microservices — the guard count doesn't
justify this complexity yet, and it would slow maintenance more than
it would help. (Full detail in the separate tech stack doc.)

## 14. Success Metrics

- Payroll for all active guards can be calculated and reviewed by an
  admin in under 15 minutes per cycle.
- Zero discrepancies between calculated deductions and statutory
  requirements during audits.
- No loss of historical pay data when a guard is deactivated or a
  payroll period is archived.
- Zero accidental modifications to a closed/archived payroll period.
- Every payroll-affecting action (fix, ignore, close, bulk change) is
  traceable in the audit log.

## 15. Open Questions

- Exact pay period cadence (monthly assumed throughout the spec —
  confirm this is correct for all sites).
- Who is responsible for updating statutory rates (NSSF/SHIF/Housing
  Levy/PAYE bands) when law changes, and how is that change tracked?
- Are allowances/benefits standardized company-wide or configured per
  site (Benefits & Compensation implies per-guard/per-change tracking —
  confirm the rules that govern *how* they're set).
- What document types/certificates does Training Management need to
  track, and are there compliance deadlines tied to them?
- What's the retention policy for archived payroll years — indefinite,
  or a defined retention period?

## 16. Implementation Roadmap

Phased per the production design specification:

**Phase 1 — Authentication**
Admin Login, Guard Login, password management, user roles.

**Phase 2 — Workforce**
Dashboard, Guards, Guard Profiles, Sites, Salary Management, Shifts,
Attendance.

**Phase 3 — Payroll**
Run Payroll, payroll calculations, Payroll Errors, Payslips, Bank
schedules, M-Pesa schedules.

**Phase 4 — Employee Self-Service**
Guard Home, Attendance, Pay, Payslips, Documents, Leave, Incident
reporting.

**Phase 5 — Management**
Reports, Benefits, Training, Requests, Documents.

**Phase 6 — Controls**
Archive, Month Close, Audit Log, Security, Settings.

Each phase should be built and fully tested before the next begins,
matching the sequencing in the CorpSec Payroll design specification.
