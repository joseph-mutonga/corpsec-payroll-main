import io
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
import pandas as pd

from application.backend.app.api.deps import get_db, require_admin, require_admin_or_hr, get_current_user
from application.backend.app.models.shift import Shift
from application.backend.app.models.guard import Guard
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.shift import ShiftCreate, ShiftUpdate, ShiftResponse

router = APIRouter(prefix="/shifts", tags=["Shifts & Scheduling"])


@router.get("", response_model=List[ShiftResponse])
def list_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all shifts."""
    return db.query(Shift).order_by(Shift.id.asc()).all()


@router.post("", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Create a new shift definition."""
    clean_name = payload.name.strip()
    existing = db.query(Shift).filter(Shift.name == clean_name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shift '{clean_name}' already exists."
        )
    shift_data = payload.model_dump()
    shift_data["name"] = clean_name
    shift_data["shift_type"] = payload.shift_type.strip().upper()
    shift = Shift(**shift_data)
    db.add(shift)
    db.commit()
    db.refresh(shift)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CREATE_SHIFT",
        target_entity="Shift",
        target_id=str(shift.id),
        new_values=f"Shift '{shift.name}' created",
        reason="Shift added"
    )
    db.add(audit_entry)
    db.commit()

    return shift


@router.put("/{shift_id}", response_model=ShiftResponse)
def update_shift(
    shift_id: int,
    payload: ShiftUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Update an existing shift definition."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"]:
        clean_name = update_data["name"].strip()
        dup = db.query(Shift).filter(Shift.name == clean_name, Shift.id != shift_id).first()
        if dup:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Another shift named '{clean_name}' already exists."
            )
        update_data["name"] = clean_name
    if "shift_type" in update_data and update_data["shift_type"]:
        update_data["shift_type"] = update_data["shift_type"].strip().upper()

    for key, val in update_data.items():
        if val is not None:
            setattr(shift, key, val)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPDATE_SHIFT",
        target_entity="Shift",
        target_id=str(shift.id),
        new_values=str(update_data),
        reason=f"Updated shift '{shift.name}'"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(shift)
    return shift


@router.delete("/{shift_id}", status_code=status.HTTP_200_OK)
def delete_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Delete an unused shift definition."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")

    if db.query(Guard).filter(Guard.shift_id == shift_id).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete shift while guards are assigned to it. Reassign guards first."
        )
    if db.query(Attendance).filter(Attendance.shift_id == shift_id).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete shift because historical attendance records reference it."
        )

    shift_name = shift.name
    db.delete(shift)
    db.add(AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="DELETE_SHIFT",
        target_entity="Shift",
        target_id=str(shift_id),
        reason=f"Deleted unused shift '{shift_name}'"
    ))
    db.commit()
    return {"status": "success", "message": f"Shift '{shift_name}' deleted"}


@router.post("/import-csv")
def import_shifts_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Import shift schedule export CSV/Excel file."""
    if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Please upload a CSV or Excel file."
        )

    content = file.file.read()
    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse file: {str(e)}"
        )

    rows_processed = len(df)
    
    # Audit event
    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="IMPORT_SHIFTS_CSV",
        target_entity="Shift",
        target_id=file.filename,
        new_values=f"Imported {rows_processed} shift rows",
        reason="Shift schedule import"
    )
    db.add(audit_entry)
    db.commit()

    return {
        "filename": file.filename,
        "rows_processed": rows_processed,
        "status": "success",
        "message": f"Successfully parsed {rows_processed} shift entries."
    }
