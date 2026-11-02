import os
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin_or_hr, get_current_user
from application.backend.app.models.user import User
from application.backend.app.models.document import CompanyDocument
from application.backend.app.models.audit import AuditLog

router = APIRouter(prefix="/documents", tags=["Company Secure Documents"])

DOCUMENTS_UPLOAD_DIR = os.path.join(os.getcwd(), "uploads", "company_documents")
os.makedirs(DOCUMENTS_UPLOAD_DIR, exist_ok=True)


class CompanyDocumentResponse(BaseModel):
    id: int
    title: str
    category: str
    file_name: str
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    confidentiality_level: str
    description: Optional[str] = None
    uploaded_by_id: int
    uploaded_by_name: Optional[str] = None
    uploaded_by_email: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[CompanyDocumentResponse])
def list_company_documents(
    category_filter: Optional[str] = Query(None, alias="category"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    List all secure company documents for System Admin and HR.
    Supports filtering by category and search terms.
    """
    query = db.query(CompanyDocument)

    if category_filter and category_filter.strip() and category_filter != "ALL":
        query = query.filter(CompanyDocument.category == category_filter.strip())

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (CompanyDocument.title.ilike(term)) |
            (CompanyDocument.description.ilike(term)) |
            (CompanyDocument.file_name.ilike(term)) |
            (CompanyDocument.category.ilike(term))
        )

    docs = query.order_by(CompanyDocument.id.desc()).all()
    results = []

    for d in docs:
        uploader = db.query(User).filter(User.id == d.uploaded_by_id).first()
        uploader_name = uploader.full_name if uploader else "System"
        uploader_email = uploader.email if uploader else "admin@corpsec.co.ke"

        results.append(CompanyDocumentResponse(
            id=d.id,
            title=d.title,
            category=d.category,
            file_name=d.file_name,
            file_size_bytes=d.file_size_bytes,
            mime_type=d.mime_type,
            confidentiality_level=d.confidentiality_level,
            description=d.description,
            uploaded_by_id=d.uploaded_by_id,
            uploaded_by_name=uploader_name,
            uploaded_by_email=uploader_email,
            created_at=d.created_at,
            updated_at=d.updated_at
        ))

    return results


@router.post("/upload", response_model=CompanyDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_company_document(
    title: str = Form(...),
    category: str = Form(...),
    confidentiality_level: Optional[str] = Form("CONFIDENTIAL"),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    Upload a secure company document (e.g. contracts, insurance, regulatory licenses, policies).
    Accessible to System Admin and HR Officers.
    """
    if not title or len(title.strip()) < 3:
        raise HTTPException(status_code=400, detail="Document title must be at least 3 characters long.")

    if not file.filename:
        raise HTTPException(status_code=400, detail="A valid file must be uploaded.")

    # Generate a unique storage filename on disk
    now_ts = int(datetime.now().timestamp())
    safe_filename = "".join(c for c in file.filename if c.isalnum() or c in "._- ")
    stored_filename = f"DOC_{now_ts}_{safe_filename}"
    file_dest_path = os.path.join(DOCUMENTS_UPLOAD_DIR, stored_filename)

    # Save file contents to disk
    file_size = 0
    with open(file_dest_path, "wb") as buffer:
        content = await file.read()
        file_size = len(content)
        buffer.write(content)

    valid_confidentiality = ["RESTRICTED", "CONFIDENTIAL", "INTERNAL", "PUBLIC"]
    clevel = confidentiality_level.upper().strip() if confidentiality_level else "CONFIDENTIAL"
    if clevel not in valid_confidentiality:
        clevel = "CONFIDENTIAL"

    doc = CompanyDocument(
        title=title.strip(),
        category=category.strip(),
        file_name=file.filename,
        file_path=file_dest_path,
        file_size_bytes=file_size,
        mime_type=file.content_type or "application/octet-stream",
        confidentiality_level=clevel,
        description=description.strip() if description else None,
        uploaded_by_id=current_user.id,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(doc)

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="UPLOAD_COMPANY_DOCUMENT",
        target_entity="CompanyDocument",
        target_id=str(file.filename),
        reason=f"Uploaded '{title.strip()}' under {category.strip()} by {current_user.email}"
    )
    db.add(audit)
    db.commit()
    db.refresh(doc)

    return CompanyDocumentResponse(
        id=doc.id,
        title=doc.title,
        category=doc.category,
        file_name=doc.file_name,
        file_size_bytes=doc.file_size_bytes,
        mime_type=doc.mime_type,
        confidentiality_level=doc.confidentiality_level,
        description=doc.description,
        uploaded_by_id=doc.uploaded_by_id,
        uploaded_by_name=current_user.full_name or current_user.email,
        uploaded_by_email=current_user.email,
        created_at=doc.created_at,
        updated_at=doc.updated_at
    )


@router.get("/{document_id}/download")
def download_company_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    Download a secure company document file.
    Supports both Authorization header and ?token=... query parameter.
    """
    doc = db.query(CompanyDocument).filter(CompanyDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document file does not exist on storage.")

    with open(doc.file_path, "rb") as f:
        file_bytes = f.read()

    return Response(
        content=file_bytes,
        media_type=doc.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{doc.file_name}"',
            "Content-Length": str(len(file_bytes))
        }
    )


@router.delete("/{document_id}", status_code=status.HTTP_200_OK)
def delete_company_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    Delete a company document and remove its file from storage.
    """
    doc = db.query(CompanyDocument).filter(CompanyDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc_title = doc.title
    file_path = doc.file_path

    # Delete record from database
    db.delete(doc)

    # Delete file from disk if present
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="DELETE_COMPANY_DOCUMENT",
        target_entity="CompanyDocument",
        target_id=str(document_id),
        reason=f"Deleted document '{doc_title}' by {current_user.email}"
    )
    db.add(audit)
    db.commit()

    return {"message": f"Document '{doc_title}' deleted successfully."}
