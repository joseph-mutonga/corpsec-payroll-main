import os
import sys

# Ensure workspace root is in sys.path even when run directly from subdirectories
_current_dir = os.path.dirname(os.path.abspath(__file__))
_workspace_root = os.path.abspath(os.path.join(_current_dir, "../../../"))
if _workspace_root not in sys.path:
    sys.path.insert(0, _workspace_root)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from application.backend.app.core.config import settings
from application.backend.app.core.database import engine, Base, sync_db_schema
from application.backend.app.core.limiter import limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from application.backend.app.models import *
from application.backend.app.api.v1 import (
    auth, guards, sites, shifts, attendance, overtime, payroll, payslips, payments, guard_portal, reports, audit, settings as sys_settings, archive, incidents, leave, statutory, roster, regions, off_days, supervisor as supervisor_module, staff as staff_module, documents as documents_module, invoices as invoices_module, assets as assets_module, clients as clients_module, company_history as company_history_module, salary_advances as salary_advances_module, desktop_app as desktop_module, expenses as expenses_module, anonymous_reporting as anonymous_reporting_module, chart_analytics as chart_analytics_module, team_chat as team_chat_module
)

# Ensure database tables exist and schema columns are synchronized
Base.metadata.create_all(bind=engine)
sync_db_schema()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Set up CORS
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include API Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(regions.router, prefix=settings.API_V1_STR)
app.include_router(guards.router, prefix=settings.API_V1_STR)
app.include_router(sites.router, prefix=settings.API_V1_STR)
app.include_router(shifts.router, prefix=settings.API_V1_STR)
app.include_router(roster.router, prefix=settings.API_V1_STR)
app.include_router(off_days.router, prefix=settings.API_V1_STR)
app.include_router(attendance.router, prefix=settings.API_V1_STR)
app.include_router(overtime.router, prefix=settings.API_V1_STR)
app.include_router(payroll.router, prefix=settings.API_V1_STR)
app.include_router(payslips.router, prefix=settings.API_V1_STR)
app.include_router(payments.router, prefix=settings.API_V1_STR)
app.include_router(guard_portal.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(sys_settings.router, prefix=settings.API_V1_STR)
app.include_router(archive.router, prefix=settings.API_V1_STR)
app.include_router(incidents.router, prefix=settings.API_V1_STR)
app.include_router(leave.router, prefix=settings.API_V1_STR)
app.include_router(statutory.router, prefix=settings.API_V1_STR)
app.include_router(supervisor_module.router, prefix=settings.API_V1_STR)
app.include_router(staff_module.router, prefix=settings.API_V1_STR)
app.include_router(documents_module.router, prefix=settings.API_V1_STR)
app.include_router(invoices_module.router, prefix=settings.API_V1_STR)
app.include_router(assets_module.router, prefix=settings.API_V1_STR)
app.include_router(clients_module.router, prefix=settings.API_V1_STR)
app.include_router(company_history_module.router, prefix=settings.API_V1_STR)
app.include_router(salary_advances_module.router, prefix=settings.API_V1_STR)
app.include_router(desktop_module.router, prefix=settings.API_V1_STR)
app.include_router(expenses_module.router, prefix=settings.API_V1_STR)
app.include_router(anonymous_reporting_module.router, prefix=settings.API_V1_STR)
app.include_router(chart_analytics_module.router, prefix=settings.API_V1_STR)
app.include_router(team_chat_module.router, prefix=settings.API_V1_STR)

# Serve Static Assets & SPA index.html
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend"))
static_dir = os.path.join(frontend_dir, "static")

if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
def read_root():
    index_file = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(
            index_file,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return {
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "docs_url": "/docs",
    }


@app.get("/portal")
def read_guard_portal():
    portal_file = os.path.join(frontend_dir, "portal.html")
    if os.path.exists(portal_file):
        return FileResponse(
            portal_file,
            media_type="text/html; charset=utf-8",
            headers={"Content-Disposition": "inline", "Cache-Control": "no-cache"},
        )
    return {
        "system": "CorpSec Guard Portal",
        "version": settings.VERSION,
        "status": "online",
        "portal_url": "/portal",
    }


@app.get("/manifest.json")
def read_manifest():
    manifest_file = os.path.join(frontend_dir, "manifest.json")
    if os.path.exists(manifest_file):
        return FileResponse(
            manifest_file,
            media_type="application/manifest+json",
            headers={"Content-Disposition": "inline", "Cache-Control": "no-cache"},
        )
    return {"error": "manifest not found"}


@app.get("/portal-sw.js")
def read_portal_service_worker():
    sw_file = os.path.join(frontend_dir, "portal-sw.js")
    if os.path.exists(sw_file):
        return FileResponse(
            sw_file,
            media_type="application/javascript",
            headers={
                "Content-Disposition": "inline",
                "Cache-Control": "no-cache",
                "Service-Worker-Allowed": "/",
            },
        )
    return {"error": "service worker not found"}


@app.get("/health")
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "database": "connected",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("application.backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
