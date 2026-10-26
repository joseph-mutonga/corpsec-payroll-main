import io
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
import pandas as pd

from application.backend.app.api.deps import get_db, require_admin, get_current_user
from application.backend.app.models.shift import Shift
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.shift import ShiftCreate, ShiftResponse

router = APIRouter(prefix="/shifts", tags=["Shifts & Scheduling"])


@router.get("", response_model=List[ShiftResponse])
def list_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all shifts."""
    return db.query(Shift).all()


@router.post("", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new shift definition."""
    shift = Shift(**payload.model_dump())
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
