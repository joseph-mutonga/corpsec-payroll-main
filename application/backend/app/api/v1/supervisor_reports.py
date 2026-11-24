import os
import secrets
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from application.backend.app.api.deps import get_db, require_admin, require_admin_or_supervisor, get_current_user
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.site import Site
from application.backend.app.models.supervisor_report import SupervisorReport
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.supervisor_report import (
    SupervisorReportResponse,
    SupervisorReportReviewRequest
)
from application.backend.app.services.pdf_service import generate_supervisor_report_pdf

router = APIRouter(prefix="/supervisor-reports", tags=["Supervisor Operational Reports"])

REPORTS_UPLOAD_DIR = os.path.join(os.getcwd(), "uploads", "supervisor_reports")
os.makedirs(REPORTS_UPLOAD_DIR, exist_ok=True)


def _build_report_response(db: Session, rep: SupervisorReport) -> SupervisorReportResponse:
    sup = db.query(User).filter(User.id == rep.supervisor_id).first()
    sup_name = sup.full_name or sup.email.split("@")[0].title() if sup else "Supervisor"
    sup_email = sup.email if sup else None
    sup_phone = sup.phone if sup else None

    site_name = None
    if rep.site_id:
        site = db.query(Site).filter(Site.id == rep.site_id).first()
        site_name = site.site_name if site else f"Site #{rep.site_id}"

    reviewer_name = None
    if rep.reviewed_by_id:
        rev = db.query(User).filter(User.id == rep.reviewed_by_id).first()
        reviewer_name = rev.full_name or rev.email.split("@")[0].title() if rev else "Admin"

    return SupervisorReportResponse(
        id=rep.id,
        reference_number=rep.reference_number,
        supervisor_id=rep.supervisor_id,
        supervisor_name=sup_name,
        supervisor_email=sup_email,
        supervisor_phone=sup_phone,
        site_id=rep.site_id,
        site_name=site_name,
        title=rep.title,
        report_type=rep.report_type,
        report_date=rep.report_date,
        summary=rep.summary,
        recommendations=rep.recommendations,
        file_name=rep.file_name,
        file_size_bytes=rep.file_size_bytes,
        mime_type=rep.mime_type,
        status=rep.status,
        admin_notes=rep.admin_notes,
        reviewed_by_id=rep.reviewed_by_id,
        reviewed_by_name=reviewer_name,
        reviewed_at=rep.reviewed_at,
        created_at=rep.created_at,
        updated_at=rep.updated_at
    )


@router.post("", response_model=SupervisorReportResponse, status_code=status.HTTP_201_CREATED)
async def submit_supervisor_report(
    title: str = Form(...),
    report_type: str = Form("FIELD_INSPECTION"),
    site_id: Optional[int] = Form(None),
    report_date: Optional[date] = Form(None),
    summary: Optional[str] = Form(None),
    recommendations: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """
    Field Supervisor (or Admin) submits an operational report to the System Admin in PDF format.
    - If a PDF file is uploaded, it stores and registers the PDF.
    - If no file is uploaded, it compiles a formal CorpSec Enterprise PDF report from the form fields.
    """
    clean_title = (title or "").strip()
    if len(clean_title) < 3:
        raise HTTPException(status_code=400, detail="Report title must be at least 3 characters long.")

    eff_date = report_date or date.today()

    # Generate sequential/unique reference number
    now = datetime.now()
    count_today = db.query(SupervisorReport).filter(
        SupervisorReport.created_at >= datetime(now.year, now.month, now.day)
    ).count() + 1
    rand_suffix = secrets.token_hex(2).upper()
    ref_number = f"REP-{eff_date.strftime('%Y%m')}-{count_today:03d}-{rand_suffix}"

    site_obj = db.query(Site).filter(Site.id == site_id).first() if site_id else None
    site_name = site_obj.site_name if site_obj else "All Supervised Sites"

    # Handle PDF Storage
    stored_filename = ""
    file_dest_path = ""
    file_size = 0
    display_filename = ""

    if file and file.filename:
        # Validate that uploaded file is a PDF
        fn_lower = file.filename.lower()
        content_type = (file.content_type or "").lower()
        if not (fn_lower.endswith(".pdf") or "pdf" in content_type):
            raise HTTPException(
                status_code=400,
                detail="Invalid file format. Supervisor reports must be submitted in PDF format (.pdf)."
            )

        now_ts = int(now.timestamp())
        safe_fname = "".join(c for c in file.filename if c.isalnum() or c in "._- ")
        stored_filename = f"SUP_REP_{ref_number}_{now_ts}_{safe_fname}"
        file_dest_path = os.path.join(REPORTS_UPLOAD_DIR, stored_filename)

        content = await file.read()
        file_size = len(content)
        with open(file_dest_path, "wb") as f_out:
            f_out.write(content)
        display_filename = file.filename
    else:
        # Generate formal CorpSec PDF report from provided details
        pdf_payload = {
            "title": clean_title,
            "reference_number": ref_number,
            "report_date": eff_date.strftime("%Y-%m-%d"),
            "report_type": report_type,
            "supervisor_name": current_user.full_name or current_user.email.split("@")[0].title(),
            "supervisor_email": current_user.email,
            "supervisor_phone": current_user.phone or "N/A",
            "site_name": site_name,
            "submitted_at": now.strftime("%Y-%m-%d %H:%M:%S"),
            "summary": summary or "Routine operational review and security inspection conducted successfully.",
            "recommendations": recommendations or "Maintain standard deployment protocols and continuous monitoring."
        }
        pdf_bytes = generate_supervisor_report_pdf(pdf_payload)
        file_size = len(pdf_bytes)
        safe_title = "".join(c for c in clean_title if c.isalnum() or c in "_- ").replace(" ", "_")
        display_filename = f"{ref_number}_{safe_title[:30]}.pdf"
        stored_filename = f"GEN_{ref_number}_{int(now.timestamp())}.pdf"
        file_dest_path = os.path.join(REPORTS_UPLOAD_DIR, stored_filename)

        with open(file_dest_path, "wb") as f_out:
            f_out.write(pdf_bytes)

    report = SupervisorReport(
        reference_number=ref_number,
        supervisor_id=current_user.id,
        site_id=site_id,
        title=clean_title,
        report_type=report_type.strip().upper(),
        report_date=eff_date,
        summary=(summary or "").strip() or None,
        recommendations=(recommendations or "").strip() or None,
        file_name=display_filename,
        file_path=file_dest_path,
        file_size_bytes=file_size,
        mime_type="application/pdf",
        status="SUBMITTED",
        created_at=now,
        updated_at=now
    )
    db.add(report)

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="SUPERVISOR_SUBMIT_REPORT",
        target_entity="SupervisorReport",
        target_id=ref_number,
        new_values=f"Submitted PDF report '{clean_title}' ({report_type}) for site '{site_name}'",
        reason="Field supervisor operational reporting"
    )
    db.add(audit)
    db.commit()
    db.refresh(report)

    return _build_report_response(db, report)


@router.get("", response_model=List[SupervisorReportResponse])
def list_supervisor_reports(
    status_filter: Optional[str] = Query(None, alias="status"),
    supervisor_id: Optional[int] = Query(None),
    site_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """
    List supervisor reports:
    - System Admin: Can view all supervisor reports across all sites and supervisors.
    - Field Supervisor: Can view reports submitted by their account.
    Supports filtering by review status, site, and keyword search.
    """
    query = db.query(SupervisorReport)

    if current_user.role == UserRole.SUPERVISOR.value:
        query = query.filter(SupervisorReport.supervisor_id == current_user.id)
    elif supervisor_id:
        query = query.filter(SupervisorReport.supervisor_id == supervisor_id)

    if status_filter and status_filter.strip() and status_filter.upper() != "ALL":
        query = query.filter(SupervisorReport.status == status_filter.strip().upper())

    if site_id:
        query = query.filter(SupervisorReport.site_id == site_id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                SupervisorReport.title.ilike(term),
                SupervisorReport.reference_number.ilike(term),
                SupervisorReport.summary.ilike(term),
                SupervisorReport.report_type.ilike(term),
                SupervisorReport.admin_notes.ilike(term)
            )
        )

    reports = query.order_by(SupervisorReport.id.desc()).all()
    return [_build_report_response(db, r) for r in reports]


@router.get("/{report_id}", response_model=SupervisorReportResponse)
def get_supervisor_report_details(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """Retrieve metadata of a single supervisor report."""
    rep = db.query(SupervisorReport).filter(SupervisorReport.id == report_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Supervisor report not found.")

    if current_user.role == UserRole.SUPERVISOR.value and rep.supervisor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: You can only view your own reports.")

    return _build_report_response(db, rep)


@router.get("/{report_id}/pdf")
def view_supervisor_report_pdf(
    report_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Streams the supervisor report PDF directly for in-browser / iframe reading.
    Supports token in query parameter for iframe rendering.
    """
    rep = db.query(SupervisorReport).filter(SupervisorReport.id == report_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Supervisor report not found.")

    if not os.path.exists(rep.file_path):
        raise HTTPException(status_code=404, detail="Report PDF file not found on disk.")

    with open(rep.file_path, "rb") as f:
        content = f.read()

    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{rep.file_name}"',
            "Cache-Control": "no-cache"
        }
    )


@router.get("/{report_id}/download")
def download_supervisor_report_pdf(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """Download the supervisor report PDF as a file attachment."""
    rep = db.query(SupervisorReport).filter(SupervisorReport.id == report_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Supervisor report not found.")

    if current_user.role == UserRole.SUPERVISOR.value and rep.supervisor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: You can only download your own reports.")

    if not os.path.exists(rep.file_path):
        raise HTTPException(status_code=404, detail="Report PDF file not found on disk.")

    with open(rep.file_path, "rb") as f:
        content = f.read()

    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{rep.file_name}"',
            "Cache-Control": "no-cache"
        }
    )


@router.put("/{report_id}/review", response_model=SupervisorReportResponse)
def review_supervisor_report(
    report_id: int,
    payload: SupervisorReportReviewRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    System Admin reviews and inspects a supervisor report.
    Allows changing status (REVIEWED, UNDER_REVIEW, ACTION_REQUIRED) and adding administrative feedback/notes.
    """
    rep = db.query(SupervisorReport).filter(SupervisorReport.id == report_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Supervisor report not found.")

    valid_statuses = ["SUBMITTED", "UNDER_REVIEW", "REVIEWED", "ACTION_REQUIRED"]
    st_upper = payload.status.strip().upper()
    if st_upper not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{payload.status}'. Must be one of: {', '.join(valid_statuses)}"
        )

    now = datetime.now()
    rep.status = st_upper
    if payload.admin_notes is not None:
        rep.admin_notes = payload.admin_notes.strip() or None
    rep.reviewed_by_id = admin.id
    rep.reviewed_at = now
    rep.updated_at = now

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="ADMIN_REVIEW_SUPERVISOR_REPORT",
        target_entity="SupervisorReport",
        target_id=rep.reference_number,
        new_values=f"Set status to '{st_upper}' with admin notes: '{rep.admin_notes or 'None'}'",
        reason="System Admin review and inspection of supervisor report"
    )
    db.add(audit)
    db.commit()
    db.refresh(rep)

    return _build_report_response(db, rep)


@router.delete("/{report_id}", status_code=status.HTTP_200_OK)
def delete_supervisor_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """Delete a supervisor report (Admin can delete any; Supervisor can delete only if SUBMITTED)."""
    rep = db.query(SupervisorReport).filter(SupervisorReport.id == report_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Supervisor report not found.")

    if current_user.role == UserRole.SUPERVISOR.value:
        if rep.supervisor_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied: You cannot delete another supervisor's report.")
        if rep.status != "SUBMITTED":
            raise HTTPException(status_code=400, detail=f"Cannot delete report that has already been {rep.status.lower()}.")

    # Remove physical file if on disk
    if rep.file_path and os.path.exists(rep.file_path):
        try:
            os.remove(rep.file_path)
        except Exception:
            pass

    ref = rep.reference_number
    db.delete(rep)

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="DELETE_SUPERVISOR_REPORT",
        target_entity="SupervisorReport",
        target_id=ref,
        reason=f"Deleted by {current_user.email}"
    )
    db.add(audit)
    db.commit()

    return {"status": "success", "message": f"Report #{ref} deleted successfully."}
