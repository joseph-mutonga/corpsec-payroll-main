import os
import shutil
import uuid
import re
from datetime import datetime, timedelta, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin, get_current_user, require_admin_or_hr, require_admin_or_supervisor
from application.backend.app.core.security import get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.user_session import UserSession
from application.backend.app.models.staff_document import StaffDocument

router = APIRouter(prefix="/staff", tags=["Staff & HR Management"])

STAFF_DOCS_DIR = os.path.join(os.getcwd(), "uploads", "staff_documents")
os.makedirs(STAFF_DOCS_DIR, exist_ok=True)


class StaffCreateRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    role: str  # HR, SUPERVISOR, ADMIN
    password: Optional[str] = None


class StaffStatusUpdateRequest(BaseModel):
    status: str  # ACTIVE, SUSPENDED


class StaffResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: str
    phone: str
    role: str
    status: str
    last_login: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StaffDocumentResponse(BaseModel):
    id: int
    user_id: int
    document_type: str
    title: str
    filename: str
    file_path: str
    file_size_bytes: Optional[int] = None
    mime_type: str
    uploaded_by_id: Optional[int] = None
    uploaded_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[StaffResponse])
def list_staff_members(
    role_filter: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """List all corporate staff members (HR, Supervisors, Administrators) with optional status filtering."""
    staff_roles = [UserRole.ADMIN.value, UserRole.HR.value, UserRole.SUPERVISOR.value]
    query = db.query(User).filter(User.role.in_(staff_roles))

    if role_filter:
        rf = role_filter.upper().strip()
        if rf in staff_roles:
            query = query.filter(User.role == rf)

    if status_filter:
        sf = status_filter.upper().strip()
        if sf == "ACTIVE":
            query = query.filter(User.status == UserStatus.ACTIVE.value)
        elif sf in ["SUSPENDED", "INACTIVE"]:
            query = query.filter(User.status.in_([UserStatus.SUSPENDED.value, UserStatus.INACTIVE.value]))

    return query.order_by(User.id.desc()).all()


@router.get("/{user_id}", response_model=StaffResponse)
def get_staff_member(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Retrieve details for a specific corporate staff member (Admin, HR, or Supervisor)."""
    staff_roles = [UserRole.ADMIN.value, UserRole.HR.value, UserRole.SUPERVISOR.value]
    u = db.query(User).filter(User.id == user_id, User.role.in_(staff_roles)).first()
    if not u:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Corporate staff member with ID {user_id} not found."
        )
    return u


@router.post("", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
def create_staff_member(
    payload: StaffCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """System Admin creates a new corporate staff member, including HR Officers and Supervisors."""
    allowed_roles = [UserRole.ADMIN.value, UserRole.HR.value, UserRole.SUPERVISOR.value]
    target_role = payload.role.upper().strip()
    if target_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid staff role '{payload.role}'. Must be one of: {', '.join(allowed_roles)}."
        )

    clean_email = payload.email.strip().lower()
    clean_phone = payload.phone.strip()

    if db.query(User).filter(User.email == clean_email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A user account with email '{clean_email}' already exists."
        )

    if db.query(User).filter(User.phone == clean_phone).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A user account with phone number '{clean_phone}' already exists."
        )

    raw_password = payload.password.strip() if payload.password and payload.password.strip() else "password123"

    new_staff = User(
        full_name=payload.full_name.strip(),
        email=clean_email,
        phone=clean_phone,
        password_hash=get_password_hash(raw_password),
        role=target_role,
        status=UserStatus.ACTIVE.value,
        guard_id=None,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_staff)

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CREATE_STAFF_MEMBER",
        target_entity="User",
        target_id=clean_email,
        reason=f"Created {target_role} staff account for {payload.full_name} ({clean_email})"
    )
    db.add(audit)
    db.commit()
    db.refresh(new_staff)

    return new_staff


@router.patch("/{user_id}/status", response_model=StaffResponse)
def update_staff_status(
    user_id: int,
    payload: StaffStatusUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Suspend or reactivate a staff member account."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own account status."
        )

    staff_user = db.query(User).filter(User.id == user_id).first()
    if not staff_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")

    new_st = payload.status.upper().strip()
    if new_st not in [UserStatus.ACTIVE.value, UserStatus.SUSPENDED.value, UserStatus.INACTIVE.value]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status value.")

    staff_user.status = new_st
    staff_user.updated_at = datetime.now()

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPDATE_STAFF_STATUS",
        target_entity="User",
        target_id=staff_user.email,
        reason=f"Changed status of staff {staff_user.email} to {new_st}"
    )
    db.add(audit)
    db.commit()
    db.refresh(staff_user)
    return staff_user


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
def delete_staff_member(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Permanently delete a corporate staff account."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account."
        )

    staff_user = db.query(User).filter(User.id == user_id).first()
    if not staff_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")

    target_email = staff_user.email
    target_role = staff_user.role

    # Clean up any stored staff documents from disk and database
    staff_docs = db.query(StaffDocument).filter(StaffDocument.user_id == user_id).all()
    for doc in staff_docs:
        if os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except Exception:
                pass
        db.delete(doc)

    user_doc_dir = os.path.join(STAFF_DOCS_DIR, str(user_id))
    if os.path.exists(user_doc_dir):
        try:
            shutil.rmtree(user_doc_dir)
        except Exception:
            pass

    db.delete(staff_user)

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="DELETE_STAFF_MEMBER",
        target_entity="User",
        target_id=target_email,
        reason=f"Deleted {target_role} staff account {target_email}"
    )
    db.add(audit)
    db.commit()

    return {"message": f"Staff account {target_email} ({target_role}) successfully removed."}


# ==================== SYSTEM ADMIN: LOCATION, DAILY HOURS & ACTIVITY TRACKING ====================

@router.get("/monitoring/overview")
def get_staff_monitoring_overview(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Live real-time monitoring overview for System Admin only.
    Returns today's active hours, online status, last known GPS location, and recent activity
    for all Staff, HR Managers, and Supervisors.
    """
    now = datetime.now()
    today_start = datetime.combine(now.date(), datetime.min.time())
    staff_roles = [UserRole.ADMIN.value, UserRole.HR.value, UserRole.SUPERVISOR.value]
    users = db.query(User).filter(User.role.in_(staff_roles)).order_by(User.role, User.full_name).all()

    overview = []
    for u in users:
        # Get today's sessions
        today_sessions = db.query(UserSession).filter(
            UserSession.user_id == u.id,
            UserSession.login_time >= today_start
        ).all()

        today_seconds = sum(s.duration_seconds or 0 for s in today_sessions)
        today_hrs = today_seconds // 3600
        today_mins = (today_seconds % 3600) // 60
        today_fmt = f"{today_hrs}h {today_mins}m" if today_hrs > 0 else f"{today_mins}m"

        # Check if currently active (active flag or active in last 10 minutes)
        active_sess = db.query(UserSession).filter(
            UserSession.user_id == u.id,
            UserSession.is_active == True,
            UserSession.last_activity >= now - timedelta(minutes=10)
        ).first()

        # Last session recorded
        last_sess = db.query(UserSession).filter(
            UserSession.user_id == u.id
        ).order_by(UserSession.id.desc()).first()

        # Last audit log action
        last_audit = db.query(AuditLog).filter(
            (AuditLog.user_id == u.id) | (AuditLog.user_name == u.email)
        ).order_by(AuditLog.id.desc()).first()

        loc_str = "No location recorded"
        if last_sess:
            if last_sess.location_name:
                loc_str = last_sess.location_name
            elif last_sess.latitude is not None and last_sess.longitude is not None:
                loc_str = f"GPS: {last_sess.latitude:.5f}, {last_sess.longitude:.5f}"

        overview.append({
            "user_id": u.id,
            "full_name": u.full_name or u.email.split('@')[0].title(),
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "is_online_now": bool(active_sess),
            "today_seconds": today_seconds,
            "today_hours": round(today_seconds / 3600.0, 2),
            "today_duration_formatted": today_fmt,
            "last_login": u.last_login.strftime("%Y-%m-%d %H:%M:%S") if u.last_login else (last_sess.login_time.strftime("%Y-%m-%d %H:%M:%S") if last_sess and last_sess.login_time else None),
            "last_location": loc_str,
            "latitude": last_sess.latitude if last_sess else None,
            "longitude": last_sess.longitude if last_sess else None,
            "last_action": f"{last_audit.action}: {last_audit.reason or ''}" if last_audit else "No recorded actions",
            "last_action_time": last_audit.timestamp.strftime("%Y-%m-%d %H:%M:%S") if last_audit and last_audit.timestamp else None
        })

    return overview


@router.get("/{user_id}/sessions")
def get_staff_sessions(
    user_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    List login sessions and GPS locations for a staff/supervisor/HR member.
    Strictly confidential: Visible only by System Admin.
    """
    staff_user = db.query(User).filter(User.id == user_id).first()
    if not staff_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")

    sessions = db.query(UserSession).filter(
        UserSession.user_id == user_id
    ).order_by(UserSession.id.desc()).limit(limit).all()

    out = []
    for s in sessions:
        hrs = (s.duration_seconds or 0) // 3600
        mins = ((s.duration_seconds or 0) % 3600) // 60
        duration_fmt = f"{hrs}h {mins}m" if hrs > 0 else f"{mins}m ({s.duration_seconds or 0}s)"

        loc_label = s.location_name
        if not loc_label and s.latitude is not None and s.longitude is not None:
            loc_label = f"GPS: {s.latitude:.5f}, {s.longitude:.5f}"

        out.append({
            "id": s.id,
            "login_time": s.login_time.strftime("%Y-%m-%d %H:%M:%S") if s.login_time else None,
            "logout_time": s.logout_time.strftime("%Y-%m-%d %H:%M:%S") if s.logout_time else None,
            "last_activity": s.last_activity.strftime("%Y-%m-%d %H:%M:%S") if s.last_activity else None,
            "duration_seconds": s.duration_seconds or 0,
            "duration_formatted": duration_fmt,
            "duration_hours": round((s.duration_seconds or 0) / 3600.0, 2),
            "latitude": s.latitude,
            "longitude": s.longitude,
            "accuracy": s.accuracy,
            "location_name": loc_label or "Location not shared",
            "ip_address": s.ip_address,
            "is_active": s.is_active
        })
    return out


@router.get("/{user_id}/daily-hours")
def get_staff_daily_hours(
    user_id: int,
    days: int = 30,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Calculates hours per day stayed in the system by this staff or supervisor.
    Strictly confidential: Visible only by System Admin.
    """
    staff_user = db.query(User).filter(User.id == user_id).first()
    if not staff_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")

    sessions = db.query(UserSession).filter(
        UserSession.user_id == user_id
    ).order_by(UserSession.login_time.desc()).all()

    from collections import defaultdict
    days_map = defaultdict(lambda: {
        "date": None,
        "total_seconds": 0,
        "session_count": 0,
        "first_login": None,
        "last_active": None,
        "locations": set(),
        "is_active_today": False
    })

    today_str = datetime.now().strftime("%Y-%m-%d")

    for s in sessions:
        if not s.login_time:
            continue
        d_str = s.login_time.strftime("%Y-%m-%d")
        day = days_map[d_str]
        day["date"] = d_str
        day["total_seconds"] += (s.duration_seconds or 0)
        day["session_count"] += 1
        
        l_time = s.login_time.strftime("%H:%M:%S")
        if not day["first_login"] or l_time < day["first_login"]:
            day["first_login"] = l_time
            
        a_time = s.last_activity.strftime("%H:%M:%S") if s.last_activity else l_time
        if not day["last_active"] or a_time > day["last_active"]:
            day["last_active"] = a_time
            
        if s.is_active:
            day["is_active_today"] = True
            
        loc_label = s.location_name or (f"{s.latitude:.4f}, {s.longitude:.4f}" if s.latitude is not None else None)
        if loc_label:
            day["locations"].add(loc_label)

    result = []
    for d_str in sorted(days_map.keys(), reverse=True)[:days]:
        data = days_map[d_str]
        sec = data["total_seconds"]
        hrs = sec // 3600
        mins = (sec % 3600) // 60
        result.append({
            "date": d_str,
            "total_seconds": sec,
            "total_hours": round(sec / 3600.0, 2),
            "duration_formatted": f"{hrs} hrs {mins} mins" if hrs > 0 else f"{mins} mins",
            "first_login": data["first_login"],
            "last_active": data["last_active"],
            "session_count": data["session_count"],
            "locations": sorted(list(data["locations"])),
            "status": "ONLINE NOW" if data["is_active_today"] and d_str == today_str else "COMPLETED"
        })
    return result


@router.get("/{user_id}/activity")
def get_staff_activity(
    user_id: int,
    limit: int = 150,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Returns full audit trail of everything the person did in the system.
    Strictly confidential: Visible only by System Admin.
    """
    staff_user = db.query(User).filter(User.id == user_id).first()
    if not staff_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")

    audit_logs = db.query(AuditLog).filter(
        (AuditLog.user_id == user_id) | (AuditLog.user_name == staff_user.email)
    ).order_by(AuditLog.id.desc()).limit(limit).all()

    out = []
    for l in audit_logs:
        out.append({
            "id": l.id,
            "timestamp": l.timestamp.strftime("%Y-%m-%d %H:%M:%S") if l.timestamp else "",
            "action": l.action,
            "target_entity": l.target_entity or "System",
            "target_id": l.target_id or "—",
            "details": l.reason or l.new_values or l.old_values or "Standard operation executed",
            "ip_address": l.ip_address or "Internal",
            "role": l.role
        })
    return out


# ==================== STAFF DOSSIER: CV & ACADEMIC DOCUMENTS (PDF ONLY) ====================

@router.post("/{user_id}/documents", response_model=StaffDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_staff_document(
    user_id: int,
    file: UploadFile = File(...),
    document_type: str = Form(...),
    title: str = Form(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """
    Upload and store official staff documents (CV/Resume, Academic Certificates, Credentials).
    Strictly accepts PDF (.pdf) documents only.
    """
    staff_user = db.query(User).filter(User.id == user_id).first()
    if not staff_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")

    raw_filename = file.filename or "staff_document.pdf"
    if not raw_filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Only PDF documents (.pdf) are permitted for staff CV and academic credentials."
        )

    clean_title = title.strip()
    if not clean_title:
        clean_title = os.path.splitext(raw_filename)[0]

    clean_type = document_type.strip() if document_type and document_type.strip() else "Academic Certificate"

    # User-specific directory
    user_doc_dir = os.path.join(STAFF_DOCS_DIR, str(user_id))
    os.makedirs(user_doc_dir, exist_ok=True)

    safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.basename(raw_filename))
    unique_filename = f"{uuid.uuid4().hex[:10]}_{safe_name}"
    dest_path = os.path.join(user_doc_dir, unique_filename)

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    # Validate PDF magic header (%PDF-)
    if not file_bytes.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file content. The file does not have a valid PDF header signature."
        )

    with open(dest_path, "wb") as f:
        f.write(file_bytes)

    doc_record = StaffDocument(
        user_id=user_id,
        document_type=clean_type,
        title=clean_title,
        filename=raw_filename,
        file_path=dest_path,
        file_size_bytes=len(file_bytes),
        mime_type="application/pdf",
        uploaded_by_id=admin.id,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(doc_record)

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPLOAD_STAFF_DOCUMENT",
        target_entity="StaffDocument",
        target_id=str(user_id),
        reason=f"Uploaded {clean_type} '{clean_title}' ({raw_filename}) for staff {staff_user.email}"
    )
    db.add(audit)
    db.commit()
    db.refresh(doc_record)

    return StaffDocumentResponse(
        id=doc_record.id,
        user_id=doc_record.user_id,
        document_type=doc_record.document_type,
        title=doc_record.title,
        filename=doc_record.filename,
        file_path=doc_record.file_path,
        file_size_bytes=doc_record.file_size_bytes,
        mime_type=doc_record.mime_type,
        uploaded_by_id=doc_record.uploaded_by_id,
        uploaded_by_name=admin.full_name or admin.email,
        created_at=doc_record.created_at,
        updated_at=doc_record.updated_at
    )


@router.get("/{user_id}/documents", response_model=List[StaffDocumentResponse])
def list_staff_documents(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all verified PDF documents (CV, academic certificates) for a staff member."""
    role_val = (current_user.role or "").upper()
    is_admin_or_hr = role_val in [UserRole.ADMIN.value, UserRole.HR.value, "SYSTEM ADMIN", "SUPER ADMIN"]
    is_supervisor = role_val == UserRole.SUPERVISOR.value
    is_owner = current_user.id == user_id

    if not (is_admin_or_hr or is_supervisor or is_owner):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative, HR or Supervisor privileges required to view personnel documents."
        )

    staff_user = db.query(User).filter(User.id == user_id).first()
    if not staff_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")

    docs = db.query(StaffDocument).filter(StaffDocument.user_id == user_id).order_by(StaffDocument.id.desc()).all()
    results = []
    for d in docs:
        uploader_name = None
        if d.uploaded_by:
            uploader_name = d.uploaded_by.full_name or d.uploaded_by.email
        results.append(StaffDocumentResponse(
            id=d.id,
            user_id=d.user_id,
            document_type=d.document_type,
            title=d.title,
            filename=d.filename,
            file_path=d.file_path,
            file_size_bytes=d.file_size_bytes,
            mime_type=d.mime_type,
            uploaded_by_id=d.uploaded_by_id,
            uploaded_by_name=uploader_name,
            created_at=d.created_at,
            updated_at=d.updated_at
        ))
    return results


@router.get("/{user_id}/documents/{doc_id}/download")
@router.get("/{user_id}/documents/{doc_id}/pdf")
def download_staff_document(
    user_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Preview or download a verified staff PDF document."""
    role_val = (current_user.role or "").upper()
    is_admin_or_hr = role_val in [UserRole.ADMIN.value, UserRole.HR.value, "SYSTEM ADMIN", "SUPER ADMIN"]
    is_supervisor = role_val == UserRole.SUPERVISOR.value
    is_owner = current_user.id == user_id

    if not (is_admin_or_hr or is_supervisor or is_owner):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative, HR or Supervisor privileges required to access personnel documents."
        )

    doc = db.query(StaffDocument).filter(StaffDocument.id == doc_id, StaffDocument.user_id == user_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff document not found.")

    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document file does not exist on disk.")

    return FileResponse(
        doc.file_path,
        media_type="application/pdf",
        filename=doc.filename,
        content_disposition_type="inline",
        headers={
            "Content-Disposition": f'inline; filename="{doc.filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate"
        }
    )


@router.delete("/{user_id}/documents/{doc_id}", status_code=status.HTTP_200_OK)
def delete_staff_document(
    user_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Delete a staff PDF document record and remove the stored file."""
    doc = db.query(StaffDocument).filter(StaffDocument.id == doc_id, StaffDocument.user_id == user_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff document not found.")

    staff_user = db.query(User).filter(User.id == user_id).first()
    doc_title = doc.title
    doc_filename = doc.filename
    file_path = doc.file_path

    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass

    db.delete(doc)

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="DELETE_STAFF_DOCUMENT",
        target_entity="StaffDocument",
        target_id=str(doc_id),
        reason=f"Deleted document '{doc_title}' ({doc_filename}) for staff {staff_user.email if staff_user else user_id}"
    )
    db.add(audit)
    db.commit()

    return {"message": f"Document '{doc_title}' successfully deleted."}

