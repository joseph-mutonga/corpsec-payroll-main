import html
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_guard_role, require_system_admin
from application.backend.app.models.user import User
from application.backend.app.models.anonymous_message import AnonymousMessage
from application.backend.app.schemas.anonymous_message import (
    AnonymousMessageCreate,
    AnonymousMessageResponse,
)

router = APIRouter(prefix="/anonymous-reporting", tags=["Anonymous Reporting Pipeline"])


@router.post("/submit", status_code=status.HTTP_201_CREATED)
def submitAnonymousTip(
    payload: AnonymousMessageCreate,
    current_guard: User = Depends(require_guard_role),
    db: Session = Depends(get_db)
):
    """
    Submits an anonymous tip or report directly from a Guard to System Administration.

    Compliance & Identity Decoupling:
    - Verifies that the caller holds the authenticated 'Guard' role.
    - SENSITIVE IDENTITY DECOUPLING: Does NOT record user_id, guard_id, username,
      IP address, user agent, or session identifier.
    - Sanitizes the input string to protect against script/HTML injection.
    - Inserts strictly: autoincremented ID, message text, and timestamp.
    """
    raw_message = (payload.message or "").strip()
    if not raw_message or len(raw_message) < 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Anonymous report message must contain at least 5 characters."
        )

    # Sanitize message text to prevent XSS / script injection
    sanitized_message = html.escape(raw_message)

    try:
        new_entry = AnonymousMessage(
            message=sanitized_message
        )
        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)

        return {
            "status": "success",
            "message": "Anonymous report submitted successfully. Your identity has not been recorded.",
            "report_id": new_entry.id
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit anonymous report. Database error."
        )


@router.get("/messages", response_model=List[AnonymousMessageResponse])
def getAnonymousMessages(
    current_admin: User = Depends(require_system_admin),
    db: Session = Depends(get_db)
):
    """
    Retrieves all inbound anonymous guard reports.
    Access restricted strictly to 'System Admin'.
    """
    messages = db.query(AnonymousMessage).order_by(AnonymousMessage.created_at.desc()).all()
    return messages


@router.delete("/messages", status_code=status.HTTP_200_OK)
def clearAllAnonymousMessages(
    current_admin: User = Depends(require_system_admin),
    db: Session = Depends(get_db)
):
    """
    Clears all anonymous guard reports from the system.
    Access restricted strictly to 'System Admin'.
    """
    try:
        count = db.query(AnonymousMessage).delete()
        db.commit()
        return {
            "status": "success",
            "message": f"Successfully cleared all {count} anonymous reports.",
            "cleared_count": count
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear anonymous reports."
        )


@router.delete("/messages/{message_id}", status_code=status.HTTP_200_OK)
def deleteAnonymousMessage(
    message_id: int,
    current_admin: User = Depends(require_system_admin),
    db: Session = Depends(get_db)
):
    """
    Deletes a specific anonymous guard report by ID.
    Access restricted strictly to 'System Admin'.
    """
    record = db.query(AnonymousMessage).filter(AnonymousMessage.id == message_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Anonymous report #{message_id} not found."
        )

    try:
        db.delete(record)
        db.commit()
        return {
            "status": "success",
            "message": f"Anonymous report #{message_id} successfully deleted."
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete anonymous report."
        )

