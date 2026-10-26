# CorpSec Payroll — Tech Stack

**Status:** Draft — v2 (supersedes v1)
**Scope:** 150+ guards, single-company deployment, admin web app +
guard mobile portal, full workforce/payroll/compliance feature set per
the CorpSec Payroll PRD v2

Guiding principle, unchanged from v1: boring, well-documented,
free/open-source technology a small team can maintain — not the stack
a 1000-employee SaaS company would build. The PRD's scope grew
significantly (audit logging, archiving, reports, benefits/training
tracking, payment scheduling), so this version adds a few libraries to
cover that — but the core philosophy (no queues, no microservices, no
premature infrastructure) stays the same.

---

## What Changed From v1

The PRD now includes features v1's stack didn't account for. This
version adds:

| New requirement (from PRD) | Addition |
|---|---|
| Admin/guard authentication with sessions, password strength, login history | `passlib` (hashing) + `python-jose` (JWT) or server-side sessions |
| Bank/M-Pesa payment schedule export as Excel | `openpyxl` |
| CSV/Excel shift import | `pandas` (already implied, now explicit) |
| Reports & Analytics charts | A lightweight charting library on the frontend (Chart.js or Recharts) |
| Audit Log (append-only, every payroll-affecting action) | No new tool — a dedicated `audit_log` table, insert-only at the application layer |
| Archive (read-only historical snapshots) | No new tool — separate `archive_*` tables populated at month-close, never updated afterward |
| Benefits & Compensation change history | No new tool — a versioned table pattern (old value, new value, effective date, reason, admin, timestamp) |

Everything else — the core philosophy, the database choice, the
explicitly-excluded list — carries over unchanged from v1.

---

## Backend

| Layer | Choice | Why |
|---|---|---|
| Language | **Python** | Readable, huge ecosystem, ideal for pay-calculation logic where correctness matters more than raw speed |
| Web framework | **FastAPI** | Validates incoming data automatically, auto-generates interactive API docs at `/docs`, easy to learn |
| ORM | **SQLAlchemy** | Maps Python objects to database tables; keeps calculation code database-agnostic |
| Migrations | **Alembic** | Tracks every schema change over time — important given the audit/archive requirements now in scope |

## Authentication & Security

| Layer | Choice | Why |
|---|---|---|
| Password hashing | **passlib** (bcrypt) | Industry-standard, simple API — needed for both Admin Login and Guard Login |
| Session/token handling | **python-jose** (JWT) or FastAPI's built-in session support | Covers "Remember me," session management, and login history from the Security & Password Management screen |
| Rate limiting on login | `slowapi` (thin wrapper around FastAPI) | Basic brute-force protection — proportionate given this handles payroll data, without adding a separate service |

## Database

| Layer | Choice | Why |
|---|---|---|
| Development | **SQLite** | Zero setup, a single file — good for local development and early testing |
| Production | **PostgreSQL** | ACID-compliant — a payroll transaction either fully completes or fully rolls back; free and open-source. Also the natural fit for the Archive tables (read-only historical rows) and Audit Log (append-only rows) the PRD now requires |

## File Import / Export

| Layer | Choice | Why |
|---|---|---|
| CSV/Excel shift import | **pandas** | Parses admin shift-export uploads; flags malformed rows (missing clock-out, invalid time) before they reach the database |
| Excel export | **openpyxl** | Needed for Bank Payment Schedule and M-Pesa Payment Schedule "Export Excel" — pandas can read files but openpyxl gives more control over formatted output sheets |
| PDF generation | **WeasyPrint** | Free, scriptable directly from Python — used for Payslip Preview, Bulk Payslips, and payment schedule PDF exports |

## Testing

| Layer | Choice | Why |
|---|---|---|
| Test framework | **pytest** | Non-negotiable given this handles real money. Every pay-calculation function (overtime, midnight-crossing shifts, SHIF floor, PAYE bands) needs explicit coverage. With the expanded scope, tests must also cover: audit log entries are created for every logged action type, archived records are never mutated after month-close, and bulk salary changes correctly identify all affected guards before applying |

## Frontend

| Layer | Choice | Why |
|---|---|---|
| Admin approach | **Simple server-rendered pages, or lightweight React** | Deliberately basic — the design doc defines the visual language, not a component framework. Desktop-first (1366–1920px) |
| Guard portal approach | Same stack, mobile-optimized views (390–430px) | Kept as a lightweight web view, not a native app, per the PRD's non-goals |
| Charts | **Chart.js** (or Recharts if using React) | Needed now for Reports & Analytics (payroll, statutory, workforce charts) — the only genuinely new frontend dependency in this revision |
| Styling | Plain CSS or a minimal utility framework | Avoid a full design system for v1 |

## Infrastructure

| Layer | Choice | Why |
|---|---|---|
| Containerization | **Docker** (optional at first, recommended once stable) | Packages the app so it runs identically anywhere |
| Hosting | Small VPS (e.g. DigitalOcean, Hetzner) or self-hosted | 150 guards is still light computational load even with the added reporting/audit features — no elastic scaling needed |
| Scheduled jobs | **cron** | Recurring reminders, scheduled backups — still no need for a full job scheduler |
| Backups | `pg_dump` on a schedule → cloud object storage (e.g. Backblaze B2) | More important than ever now that Archive is a first-class feature — archived payroll history loss is both a legal and product-integrity problem |

## Explicitly Not Included (and why)

| Rejected | Reason |
|---|---|
| Redis + Celery / BullMQ (job queues) | Even with bulk payslip generation and reports now in scope, 150 guards' worth of processing runs in well under a second — still no real bottleneck to justify a queue |
| Kubernetes / microservices | No team or scale that justifies the operational overhead |
| NoSQL database | Payroll, audit, and archive data are inherently relational — a relational DB with foreign keys and transactions remains the right fit, arguably more so now that audit/archive integrity matters |
| Third-party tax API subscriptions (e.g. Symmetry) | Kenyan statutory rates are still simple enough to encode directly and update manually |
| A dedicated business-intelligence/reporting tool (e.g. Metabase, Superset) | Reports & Analytics scope (payroll totals, statutory totals, workforce stats) is coverable with a handful of SQL queries + Chart.js — a full BI tool is unjustified complexity at this stage |
| A separate document-management system for Documents/Training certificates | File storage can live on the same server (or a simple object storage bucket) with metadata in Postgres — no need for a dedicated DMS at this scale |

## Version Control & Workflow

| Tool | Purpose |
|---|---|
| **Git** | Track all code changes |
| **GitHub** | Remote backup + collaboration if a second developer joins later |

## Summary Diagram

```
Admin/Guard browser
        │
        ▼
   FastAPI backend ──────────────────────────┐
        │                                     │
        ├──▶ SQLAlchemy models / Alembic      ├──▶ passlib + JWT (auth)
        │         migrations                  │
        │                                     ├──▶ pandas (CSV/Excel import)
        ▼                                     │
   PostgreSQL                                 ├──▶ openpyxl (Excel export)
    ├─ live tables (guards, shifts, payroll)  │
    ├─ audit_log (append-only)                └──▶ WeasyPrint (PDF: payslips,
    └─ archive_* (read-only after close)           payment schedules)
        │
        ▼
   Frontend (admin: desktop, guard: mobile) + Chart.js for Reports
```

## Upgrade Path (only when actually needed)

- **SQLite → PostgreSQL**: when moving from local dev to real
  production use.
- **Add Redis/Celery**: only if guard count grows into the thousands,
  or bulk payslip/report generation starts timing out.
- **Add a proper design system**: only once the app has enough screens
  that inconsistency becomes a real problem.
- **Add a dedicated file-storage service** (e.g. S3-compatible bucket):
  only if Documents/Training certificate storage outgrows what a single
  server's disk can reasonably hold.
