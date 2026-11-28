import os
import sys

# Ensure workspace root is in sys.path even when run directly from subdirectories
_current_dir = os.path.dirname(os.path.abspath(__file__))
_workspace_root = os.path.abspath(os.path.join(_current_dir, "../../../"))
if _workspace_root not in sys.path:
    sys.path.insert(0, _workspace_root)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from application.backend.app.core.config import settings
from application.backend.app.core.database import engine, Base, sync_db_schema
from application.backend.app.core.limiter import limiter, _rate_limit_exceeded_handler
from application.backend.app.core.login_security import LoginSecurityMiddleware, login_security_store
from slowapi.errors import RateLimitExceeded
from application.backend.app.models import *
from application.backend.app.api.v1 import (
    auth, guards, sites, shifts, attendance, overtime, payroll, payslips, payments, guard_portal, reports, audit, settings as sys_settings, archive, incidents, leave, statutory, roster, regions, off_days, supervisor as supervisor_module, staff as staff_module, documents as documents_module, invoices as invoices_module, assets as assets_module, clients as clients_module, company_history as company_history_module, salary_advances as salary_advances_module, desktop_app as desktop_module, expenses as expenses_module, anonymous_reporting as anonymous_reporting_module, chart_analytics as chart_analytics_module, team_chat as team_chat_module, call_center as call_center_module, ai_insights as ai_insights_module, supervisor_reports as supervisor_reports_module
)

# Ensure database tables exist and schema columns are synchronized
Base.metadata.create_all(bind=engine)
sync_db_schema()

from application.backend.app.services.otp_service import get_email_transport_status
_mail_status = get_email_transport_status()
if _mail_status["ready"]:
    print(f"[MAILER] Production email transport ready (SMTP={_mail_status['smtp_host']}:{_mail_status['smtp_port']}, From={_mail_status['from_address']})")
else:
    print("[MAILER WARNING] No SMTP or HTTPS email provider configured! OTP & password-reset emails will fail until SMTP_HOST/SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY are set.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Enable GZip compression for HTML, CSS, JS, SVG, and JSON payloads (critical for mobile data)
app.add_middleware(GZipMiddleware, minimum_size=500)

# Set up CORS
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    """
    Controls HTTP caching across the application:
    - All /api/* responses receive strict no-cache / no-store headers.
    - Explicitly versioned static assets (/static/...?v=<ASSET_VERSION>) receive long-lived immutable caching.
    - HTML entrypoints, manifests, service workers, and unversioned static assets always revalidate.
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            return response

        has_version_tag = bool(request.query_params.get("v"))
        if path.startswith("/static/") and has_version_tag:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return response

        if (
            path in ["/", "/portal", "/portal.html", "/version.json", "/manifest.json", "/portal-manifest.json", "/portal-sw.js", "/guard-sw.js"]
            or path.startswith("/static/js/")
            or path.startswith("/static/css/")
            or path.endswith(".js")
            or path.endswith(".css")
            or path.endswith(".json")
        ):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app.add_middleware(NoCacheStaticMiddleware)
app.add_middleware(
    LoginSecurityMiddleware,
    store=login_security_store,
    protected_paths=(
        f"{settings.API_V1_STR}/auth/login",
        f"{settings.API_V1_STR}/auth/login/guard",
    ),
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
app.include_router(call_center_module.router, prefix=settings.API_V1_STR)
app.include_router(ai_insights_module.router, prefix=settings.API_V1_STR)
app.include_router(ai_insights_module.router, prefix="/api")
app.include_router(supervisor_reports_module.router, prefix=settings.API_V1_STR)

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


def _render_versioned_frontend_file(file_path: str, media_type: str, extra_headers: dict | None = None) -> Response:
    with open(file_path, "r", encoding="utf-8") as fh:
        content = fh.read().replace("__ASSET_VERSION__", settings.ASSET_VERSION)
    headers = {
        "Content-Disposition": "inline",
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
    }
    if extra_headers:
        headers.update(extra_headers)
    return Response(content=content, media_type=media_type, headers=headers)


@app.get("/portal")
@app.get("/portal.html")
def read_guard_portal():
    portal_file = os.path.join(frontend_dir, "portal.html")
    if os.path.exists(portal_file):
        return _render_versioned_frontend_file(portal_file, media_type="text/html; charset=utf-8")
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
            headers={"Content-Disposition": "inline", "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0"},
        )
    return {"error": "manifest not found"}


@app.get("/portal-manifest.json")
def read_portal_manifest():
    manifest_file = os.path.join(frontend_dir, "portal-manifest.json")
    if os.path.exists(manifest_file):
        return _render_versioned_frontend_file(manifest_file, media_type="application/manifest+json")
    return JSONResponse(status_code=404, content={"error": "portal manifest not found"})


@app.get("/guard-sw.js")
def read_guard_service_worker():
    sw_file = os.path.join(frontend_dir, "guard-sw.js")
    if os.path.exists(sw_file):
        return _render_versioned_frontend_file(
            sw_file,
            media_type="application/javascript",
            extra_headers={"Service-Worker-Allowed": "/portal"},
        )
    return JSONResponse(status_code=404, content={"error": "guard service worker not found"})


@app.get("/portal-manifest.json")
def read_portal_manifest():
    manifest_file = os.path.join(frontend_dir, "portal-manifest.json")
    if os.path.exists(manifest_file):
        return FileResponse(
            manifest_file,
            media_type="application/manifest+json",
            headers={"Content-Disposition": "inline", "Cache-Control": "no-cache"},
        )
    return {"error": "portal manifest not found"}


@app.get("/guard-sw.js")
def read_guard_service_worker():
    sw_file = os.path.join(frontend_dir, "guard-sw.js")
    if os.path.exists(sw_file):
        return FileResponse(
            sw_file,
            media_type="application/javascript",
            headers={
                "Content-Disposition": "inline",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
                "Service-Worker-Allowed": "/portal",
            },
        )
    return {"error": "guard service worker not found"}


@app.get("/version.json")
@app.get("/api/v1/version")
@app.get("/api/v1/system/version")
def read_system_version_manifest():
    from application.backend.app.api.v1.desktop_app import get_release_fingerprint
    data = get_release_fingerprint()
    return JSONResponse(
        content=data,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


@app.get("/portal-sw.js")
def read_portal_service_worker():
    sw_file = os.path.join(frontend_dir, "portal-sw.js")
    if os.path.exists(sw_file):
        return FileResponse(
            sw_file,
            media_type="application/javascript",
            headers={
                "Content-Disposition": "inline",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
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
