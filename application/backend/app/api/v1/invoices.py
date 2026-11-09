import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin_or_hr, get_current_user
from application.backend.app.models.user import User
from application.backend.app.models.site import Site
from application.backend.app.models.guard import Guard
from application.backend.app.models.invoice import SiteInvoice, InvoiceItem
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.setting import Setting
from application.backend.app.models.client_contract import Client
from application.backend.app.schemas.invoice import (
    SiteInvoiceCreate,
    SiteInvoiceUpdate,
    SiteInvoiceResponse,
    GenerateInvoiceRequest
)
from application.backend.app.services.invoice_pdf_service import generate_invoice_pdf

router = APIRouter(prefix="/invoices", tags=["Site Invoices & Billing"])


def enrich_invoice_from_database(inv: SiteInvoice, db: Session) -> SiteInvoice:
    """
    Enrich an invoice instance with official company settings and client details
    retrieved dynamically from the database.
    """
    settings_map = {s.key: s.value for s in db.query(Setting).all()}
    client = db.query(Client).filter(Client.name.ilike(inv.client_name)).first()

    # Client details from DB
    inv.client_kra_pin = client.kra_pin if client and client.kra_pin else "P051288491A"
    if client and not inv.billing_address and client.physical_address:
        inv.billing_address = client.physical_address
    if client and not inv.client_email and client.email:
        inv.client_email = client.email
    if client and not inv.client_phone and client.phone:
        inv.client_phone = client.phone

    # Company settings from DB
    inv.company_name = settings_map.get("company_name", "CORPSEC INVESTIGATIONS LIMITED")
    inv.company_division = settings_map.get("company_division", "Guarding Services Division | Nairobi, Kenya")
    inv.company_kra_pin = settings_map.get("company_kra_pin", "P051234567Z")
    inv.company_phone = settings_map.get("company_phone", "0726 058 358 / 0739 058 358")
    inv.company_email = settings_map.get("company_email", "info@corpsecinvestigations.com")
    inv.company_alt_email = settings_map.get("company_alt_email", "corpsec.investigations@gmail.com")
    inv.company_website = settings_map.get("company_website", "www.corpsecinvestigations.com")
    inv.company_location = settings_map.get("company_location", "Nairobi, Kenya")
    inv.company_director = settings_map.get("company_director", "Moses Alango")
    inv.company_director_title = settings_map.get("company_director_title", "Director — CorpSec Investigations Limited")
    inv.bank_name = settings_map.get("bank_name", "KCB Bank Kenya Ltd")
    inv.bank_account_name = settings_map.get("bank_account_name", "CorpSec Investigations Limited")
    inv.bank_account_number = settings_map.get("bank_account_number", "1234567890")
    inv.bank_branch = settings_map.get("bank_branch", "Upper Hill, Nairobi")
    inv.bank_swift = settings_map.get("bank_swift", "KCBLKENX")
    inv.mpesa_paybill = settings_map.get("mpesa_paybill", "522522")
    inv.psra_license_number = settings_map.get("psra_license_number", "PSRA/2026/0892")

    return inv


def generate_next_invoice_number(db: Session) -> str:
    """Generate a clean sequential invoice number: INV-YYYY-XXXX."""
    current_year = datetime.date.today().year
    prefix = f"INV-{current_year}-"
    last_inv = db.query(SiteInvoice).filter(SiteInvoice.invoice_number.like(f"{prefix}%")).order_by(SiteInvoice.id.desc()).first()
    if last_inv and last_inv.invoice_number:
        try:
            last_num_str = last_inv.invoice_number.split("-")[-1]
            next_num = int(last_num_str) + 1
        except Exception:
            next_num = 1
    else:
        next_num = 1
    return f"{prefix}{next_num:04d}"


@router.get("", response_model=List[SiteInvoiceResponse])
def list_site_invoices(
    site_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    billing_period: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    List all generated site invoices with filtering and dynamic database enrichment.
    Accessible to System Admin and HR.
    """
    query = db.query(SiteInvoice)
    if site_id:
        query = query.filter(SiteInvoice.site_id == site_id)
    if status_filter and status_filter.strip() and status_filter.upper() != "ALL":
        query = query.filter(SiteInvoice.status == status_filter.strip().upper())
    if billing_period and billing_period.strip():
        query = query.filter(SiteInvoice.billing_period == billing_period.strip())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (SiteInvoice.invoice_number.ilike(term)) |
            (SiteInvoice.client_name.ilike(term)) |
            (SiteInvoice.site_name.ilike(term)) |
            (SiteInvoice.billing_period.ilike(term))
        )
    invoices = query.order_by(SiteInvoice.id.desc()).all()
    for inv in invoices:
        enrich_invoice_from_database(inv, db)
    return invoices


@router.post("/generate", response_model=SiteInvoiceResponse, status_code=status.HTTP_201_CREATED)
def generate_site_invoice(
    payload: GenerateInvoiceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    Auto-generate a commercial invoice for a client site.
    Calculates charges based on active guards and client details retrieved from the database.
    """
    site = db.query(Site).filter(Site.id == payload.site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Client site not found")

    client = db.query(Client).filter(Client.name.ilike(site.client_name)).first()
    settings_map = {s.key: s.value for s in db.query(Setting).all()}

    invoice_number = generate_next_invoice_number(db)
    issue_date = payload.issue_date or datetime.date.today()
    due_date = payload.due_date or (issue_date + datetime.timedelta(days=14))

    # Active guards currently deployed at site retrieved from database
    site_guards = db.query(Guard).filter(
        Guard.primary_site_id == site.id,
        Guard.status == "ACTIVE"
    ).all()
    guard_count = len(site_guards)

    # Database-sourced billing address, client contact, and payment terms
    billing_address = (client.physical_address if client and client.physical_address else site.location) or "Nairobi, Kenya"
    client_email = client.email if client else None
    client_phone = client.phone if client else None

    bank_name = settings_map.get("bank_name", "KCB Bank Kenya Ltd")
    bank_acc = settings_map.get("bank_account_number", "1234567890")
    paybill = settings_map.get("mpesa_paybill", "522522")

    default_payment_terms = f"Bank: {bank_name} | Acc: {bank_acc} | M-PESA Paybill: {paybill}"

    invoice = SiteInvoice(
        invoice_number=invoice_number,
        site_id=site.id,
        client_name=site.client_name,
        site_name=site.site_name,
        billing_period=payload.billing_period,
        issue_date=issue_date,
        due_date=due_date,
        billing_address=billing_address,
        client_email=client_email,
        client_phone=client_phone,
        status="ISSUED",
        tax_rate=payload.tax_rate,
        currency="KES",
        notes=payload.custom_notes or "Payment is due within 14 days of invoice date. Thank you for choosing CorpSec Investigations Limited.",
        payment_terms=payload.custom_payment_terms or default_payment_terms,
        created_by_user_id=current_user.id
    )

    items_to_create = []

    if payload.custom_items and len(payload.custom_items) > 0:
        for c_item in payload.custom_items:
            unit_price = float(c_item.unit_price)
            qty = float(c_item.quantity)
            amt = unit_price * qty
            items_to_create.append(
                InvoiceItem(
                    item_name=c_item.item_name,
                    description=c_item.description,
                    quantity=qty,
                    unit_price=unit_price,
                    tax_rate=c_item.tax_rate if c_item.tax_rate is not None else payload.tax_rate,
                    amount=amt
                )
            )
    else:
        # Standard automated site guarding item derived from database
        qty = float(guard_count if guard_count > 0 else 1)
        unit_price = float(site.basic_salary if site.basic_salary > 0 else 18000.0)
        line_amt = qty * unit_price
        
        desc = (
            f"Deployment of {int(qty)} professional uniformed security guard{'s' if qty != 1 else ''} "
            f"at {site.site_name} for the period of {payload.billing_period}"
        )
        items_to_create.append(
            InvoiceItem(
                item_name="Security Guarding Services (Static)",
                description=desc,
                quantity=qty,
                unit_price=unit_price,
                tax_rate=payload.tax_rate,
                amount=line_amt
            )
        )

        # Optional supervision charge if site has assigned supervisor in DB
        if payload.include_supervision and site.supervisor_id:
            sup_price = 5000.0
            items_to_create.append(
                InvoiceItem(
                    item_name="Field Patrol Supervision & Safety Oversight",
                    description=f"24/7 dedicated patrol supervisor inspections, clock-in monitoring & safety audits for {site.site_name}",
                    quantity=1.0,
                    unit_price=sup_price,
                    tax_rate=payload.tax_rate,
                    amount=sup_price
                )
            )

    subtotal = sum(it.amount for it in items_to_create)
    tax_amount = round(subtotal * (payload.tax_rate / 100.0), 2) if payload.tax_rate > 0 else 0.0
    total_amount = round(subtotal + tax_amount, 2)

    invoice.subtotal = subtotal
    invoice.tax_amount = tax_amount
    invoice.total_amount = total_amount
    invoice.items = items_to_create

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    # Log audit entry
    try:
        db.add(AuditLog(
            user_id=current_user.id,
            action="GENERATE_INVOICE",
            details=f"Generated invoice {invoice.invoice_number} for site {site.site_name} (Total: KES {total_amount:,.2f})"
        ))
        db.commit()
    except Exception:
        pass

    return enrich_invoice_from_database(invoice, db)


@router.post("", response_model=SiteInvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_site_invoice(
    payload: SiteInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Create a manual site invoice."""
    site = db.query(Site).filter(Site.id == payload.site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    invoice_number = payload.invoice_number or generate_next_invoice_number(db)
    existing = db.query(SiteInvoice).filter(SiteInvoice.invoice_number == invoice_number).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Invoice number '{invoice_number}' already exists")

    items_to_create = []
    for it in payload.items:
        qty = float(it.quantity)
        price = float(it.unit_price)
        amt = it.amount if it.amount is not None else round(qty * price, 2)
        items_to_create.append(InvoiceItem(
            item_name=it.item_name,
            description=it.description,
            quantity=qty,
            unit_price=price,
            tax_rate=it.tax_rate,
            amount=amt
        ))

    subtotal = sum(i.amount for i in items_to_create)
    tax_rate = payload.tax_rate
    tax_amount = round(subtotal * (tax_rate / 100.0), 2) if tax_rate > 0 else 0.0
    discount = float(payload.discount_amount or 0.0)
    total_amount = round(subtotal + tax_amount - discount, 2)

    invoice = SiteInvoice(
        invoice_number=invoice_number,
        site_id=payload.site_id,
        client_name=payload.client_name,
        site_name=payload.site_name,
        billing_period=payload.billing_period,
        issue_date=payload.issue_date,
        due_date=payload.due_date,
        billing_address=payload.billing_address,
        client_email=payload.client_email,
        client_phone=payload.client_phone,
        status=payload.status,
        tax_rate=tax_rate,
        discount_amount=discount,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total_amount=total_amount,
        currency=payload.currency,
        notes=payload.notes,
        payment_terms=payload.payment_terms,
        created_by_user_id=current_user.id,
        items=items_to_create
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return enrich_invoice_from_database(invoice, db)


@router.get("/{invoice_id}", response_model=SiteInvoiceResponse)
def get_site_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Retrieve full details of a specific site invoice, enriched with database settings and client profile."""
    inv = db.query(SiteInvoice).filter(SiteInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return enrich_invoice_from_database(inv, db)


@router.put("/{invoice_id}", response_model=SiteInvoiceResponse)
def amend_site_invoice(
    invoice_id: int,
    payload: SiteInvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    Amend / update a site invoice and its line items.
    Accessible to System Admin and HR.
    """
    inv = db.query(SiteInvoice).filter(SiteInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if payload.invoice_number and payload.invoice_number != inv.invoice_number:
        existing = db.query(SiteInvoice).filter(
            SiteInvoice.invoice_number == payload.invoice_number,
            SiteInvoice.id != invoice_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Invoice number '{payload.invoice_number}' already in use")
        inv.invoice_number = payload.invoice_number

    if payload.client_name is not None:
        inv.client_name = payload.client_name
    if payload.site_name is not None:
        inv.site_name = payload.site_name
    if payload.billing_period is not None:
        inv.billing_period = payload.billing_period
    if payload.issue_date is not None:
        inv.issue_date = payload.issue_date
    if payload.due_date is not None:
        inv.due_date = payload.due_date
    if payload.billing_address is not None:
        inv.billing_address = payload.billing_address
    if payload.client_email is not None:
        inv.client_email = payload.client_email
    if payload.client_phone is not None:
        inv.client_phone = payload.client_phone
    if payload.status is not None:
        inv.status = payload.status.upper()
    if payload.tax_rate is not None:
        inv.tax_rate = float(payload.tax_rate)
    if payload.discount_amount is not None:
        inv.discount_amount = float(payload.discount_amount)
    if payload.currency is not None:
        inv.currency = payload.currency
    if payload.notes is not None:
        inv.notes = payload.notes
    if payload.payment_terms is not None:
        inv.payment_terms = payload.payment_terms

    # If items are updated
    if payload.items is not None:
        # Delete old items
        db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice_id).delete()
        new_items = []
        for it in payload.items:
            qty = float(it.quantity)
            price = float(it.unit_price)
            amt = it.amount if it.amount is not None else round(qty * price, 2)
            new_items.append(
                InvoiceItem(
                    invoice_id=invoice_id,
                    item_name=it.item_name,
                    description=it.description,
                    quantity=qty,
                    unit_price=price,
                    tax_rate=it.tax_rate if it.tax_rate is not None else inv.tax_rate,
                    amount=amt
                )
            )
        db.add_all(new_items)
        db.flush()

        # Recalculate totals
        subtotal = sum(i.amount for i in new_items)
        tax_amount = round(subtotal * (inv.tax_rate / 100.0), 2) if inv.tax_rate > 0 else 0.0
        total_amount = round(subtotal + tax_amount - inv.discount_amount, 2)
        inv.subtotal = subtotal
        inv.tax_amount = tax_amount
        inv.total_amount = total_amount

    inv.updated_at = datetime.datetime.now()
    db.commit()
    db.refresh(inv)

    # Log audit entry
    try:
        db.add(AuditLog(
            user_id=current_user.id,
            action="AMEND_INVOICE",
            details=f"Amended invoice {inv.invoice_number} (New Total: KES {inv.total_amount:,.2f}, Status: {inv.status})"
        ))
        db.commit()
    except Exception:
        pass

    return enrich_invoice_from_database(inv, db)


@router.delete("/{invoice_id}")
def delete_site_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Delete a site invoice."""
    inv = db.query(SiteInvoice).filter(SiteInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    num = inv.invoice_number
    db.delete(inv)
    db.commit()

    try:
        db.add(AuditLog(
            user_id=current_user.id,
            action="DELETE_INVOICE",
            details=f"Deleted invoice {num}"
        ))
        db.commit()
    except Exception:
        pass

    return {"message": f"Invoice {num} deleted successfully"}


@router.post("/{invoice_id}/status")
def update_invoice_status(
    invoice_id: int,
    new_status: str = Query(..., pattern="^(DRAFT|ISSUED|PAID|CANCELLED|OVERDUE)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Quickly update the payment/operational status of an invoice."""
    inv = db.query(SiteInvoice).filter(SiteInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    old = inv.status
    inv.status = new_status.upper()
    inv.updated_at = datetime.datetime.now()
    db.commit()
    return {"message": f"Invoice {inv.invoice_number} status updated from {old} to {inv.status}"}


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Download official PDF of the site invoice, with all data retrieved from the database.
    Accessible to Admin and HR.
    """
    if current_user.role not in ["ADMIN", "HR"]:
        raise HTTPException(status_code=403, detail="Only Admin and HR can download site invoices")

    inv = db.query(SiteInvoice).filter(SiteInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    pdf_bytes = generate_invoice_pdf(inv, db=db)
    filename = f"Invoice-{inv.invoice_number}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )
