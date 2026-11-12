import io
import os
import re
import math
from typing import List, Optional
from datetime import datetime, date
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from application.backend.app.api.deps import get_db, require_admin_or_hr, get_current_user
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.guard import Guard
from application.backend.app.models.payroll import PayrollPeriod
from application.backend.app.models.salary_advance import SalaryAdvance
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.salary_advance import (
    SalaryAdvanceCreate,
    SalaryAdvanceResponse,
    SalaryAdvanceSummary,
    BulkUploadAdvanceResult
)

router = APIRouter(prefix="/salary-advances", tags=["Salary Advances"])


def generate_advance_reference(db: Session, d_date: date) -> str:
    prefix = f"ADV-{d_date.strftime('%Y%m')}-"
    last = db.query(SalaryAdvance).filter(
        SalaryAdvance.advance_reference.like(f"{prefix}%")
    ).order_by(SalaryAdvance.id.desc()).first()
    if last and last.advance_reference:
        try:
            num = int(last.advance_reference.split("-")[-1]) + 1
        except Exception:
            num = 1
    else:
        num = 1
    return f"{prefix}{num:04d}"


def serialize_advance(db: Session, adv: SalaryAdvance) -> dict:
    recipient_name = "Unknown"
    recipient_number = ""
    if adv.advance_type == "GUARD" and adv.guard_id:
        g = db.query(Guard).filter(Guard.id == adv.guard_id).first()
        if g:
            recipient_name = g.full_name
            recipient_number = g.employee_number
    elif adv.staff_id:
        st = db.query(User).filter(User.id == adv.staff_id).first()
        if st:
            recipient_name = st.full_name or st.email
            recipient_number = st.phone or f"STAFF-{st.id}"

    approved_by_name = None
    if adv.approved_by_user_id:
        ap = db.query(User).filter(User.id == adv.approved_by_user_id).first()
        if ap:
            approved_by_name = ap.full_name or ap.email

    return {
        "id": adv.id,
        "advance_reference": adv.advance_reference,
        "advance_type": adv.advance_type,
        "guard_id": adv.guard_id,
        "staff_id": adv.staff_id,
        "payroll_period_id": adv.payroll_period_id,
        "recipient_name": recipient_name,
        "recipient_number": recipient_number,
        "amount": round(float(adv.amount), 2),
        "disbursement_date": adv.disbursement_date,
        "payment_method": adv.payment_method,
        "reference_number": adv.reference_number,
        "reason": adv.reason,
        "notes": adv.notes,
        "status": adv.status,
        "approved_by_name": approved_by_name,
        "created_at": adv.created_at,
        "deducted_at": adv.deducted_at
    }


@router.post("", response_model=SalaryAdvanceResponse, status_code=status.HTTP_201_CREATED)
def issue_salary_advance(
    payload: SalaryAdvanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    Issue / record a mid-month salary advance for a Guard or Corporate Staff member.
    The amount will be automatically deducted during monthly payroll calculation.
    """
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Advance amount must be greater than zero")

    adv_type = payload.advance_type.strip().upper()
    if adv_type not in ["GUARD", "STAFF"]:
        raise HTTPException(status_code=400, detail="advance_type must be either 'GUARD' or 'STAFF'")

    if adv_type == "STAFF" and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=403,
            detail="Issuing salary advances to corporate staff is confidential and restricted to System Administrator only."
        )

    if adv_type == "GUARD":
        if not payload.guard_id:
            raise HTTPException(status_code=400, detail="guard_id is required for guard advance")
        guard = db.query(Guard).filter(Guard.id == payload.guard_id).first()
        if not guard:
            raise HTTPException(status_code=404, detail="Guard not found")
        recipient_label = f"Guard {guard.full_name} ({guard.employee_number})"
    else:
        if not payload.staff_id:
            raise HTTPException(status_code=400, detail="staff_id is required for staff advance")
        staff = db.query(User).filter(User.id == payload.staff_id).first()
        if not staff:
            raise HTTPException(status_code=404, detail="Staff member not found")
        recipient_label = f"Staff {staff.full_name or staff.email}"

    disb_date = payload.disbursement_date or date.today()

    # Link to payroll period if not specified
    period_id = payload.payroll_period_id
    if not period_id:
        matching_period = db.query(PayrollPeriod).filter(
            PayrollPeriod.year == disb_date.year,
            PayrollPeriod.month == disb_date.month
        ).first()
        if matching_period:
            period_id = matching_period.id

    # Check if target period is already closed/confirmed
    if period_id:
        target_period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
        if target_period and target_period.status in ["CONFIRMED", "CLOSED"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot issue advance for locked payroll period ({target_period.period_name} - {target_period.status})"
            )

    adv_ref = generate_advance_reference(db, disb_date)

    adv = SalaryAdvance(
        advance_reference=adv_ref,
        advance_type=adv_type,
        guard_id=payload.guard_id if adv_type == "GUARD" else None,
        staff_id=payload.staff_id if adv_type == "STAFF" else None,
        payroll_period_id=period_id,
        amount=round(float(payload.amount), 2),
        disbursement_date=disb_date,
        payment_method=payload.payment_method.strip().upper(),
        reference_number=payload.reference_number.strip() if payload.reference_number else None,
        reason=payload.reason,
        notes=payload.notes,
        status="APPROVED",
        approved_by_user_id=current_user.id,
        created_at=datetime.now()
    )
    db.add(adv)

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="ISSUE_SALARY_ADVANCE",
        target_entity="SalaryAdvance",
        target_id=adv_ref,
        new_values=f"Issued KES {payload.amount:,.2f} to {recipient_label} via {payload.payment_method} (Ref: {payload.reference_number or 'N/A'})",
        reason=payload.reason or "Mid-month salary advance"
    )
    db.add(audit)
    db.commit()
    db.refresh(adv)

    return serialize_advance(db, adv)


@router.get("", response_model=List[SalaryAdvanceResponse])
def list_salary_advances(
    advance_type: Optional[str] = Query(None),
    guard_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    payroll_period_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """List salary advances with filtering."""
    if current_user.role != UserRole.ADMIN.value:
        if staff_id:
            raise HTTPException(
                status_code=403,
                detail="Staff member personnel files and salary advances are confidential and restricted to System Administrator only."
            )
        if advance_type and advance_type.strip().upper() == "STAFF":
            raise HTTPException(
                status_code=403,
                detail="Staff member personnel files and salary advances are confidential and restricted to System Administrator only."
            )

    query = db.query(SalaryAdvance)

    if current_user.role != UserRole.ADMIN.value:
        query = query.filter(SalaryAdvance.advance_type == "GUARD")

    if advance_type:
        query = query.filter(SalaryAdvance.advance_type == advance_type.strip().upper())
    if guard_id:
        query = query.filter(SalaryAdvance.guard_id == guard_id)
    if staff_id:
        query = query.filter(SalaryAdvance.staff_id == staff_id)
    if payroll_period_id:
        query = query.filter(SalaryAdvance.payroll_period_id == payroll_period_id)
    if status and status != "ALL":
        query = query.filter(SalaryAdvance.status == status.strip().upper())
    if year:
        query = query.filter(SalaryAdvance.disbursement_date >= date(year, 1, 1),
                             SalaryAdvance.disbursement_date <= date(year, 12, 31))
    if month and year:
        import calendar
        _, last_day = calendar.monthrange(year, month)
        query = query.filter(SalaryAdvance.disbursement_date >= date(year, month, 1),
                             SalaryAdvance.disbursement_date <= date(year, month, last_day))

    advances = query.order_by(SalaryAdvance.disbursement_date.desc(), SalaryAdvance.id.desc()).all()
    return [serialize_advance(db, a) for a in advances]


@router.get("/summary", response_model=SalaryAdvanceSummary)
def get_salary_advances_summary(
    payroll_period_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Retrieve summary metrics for salary advances."""
    query = db.query(SalaryAdvance)
    if payroll_period_id:
        query = query.filter(SalaryAdvance.payroll_period_id == payroll_period_id)

    advances = query.all()
    total_count = len(advances)
    total_disbursed = sum(a.amount for a in advances)
    total_deducted = sum(a.amount for a in advances if a.status == "DEDUCTED")
    total_pending = sum(a.amount for a in advances if a.status in ["APPROVED", "PENDING"])

    return {
        "total_advances_count": total_count,
        "total_amount_disbursed": round(total_disbursed, 2),
        "total_amount_deducted": round(total_deducted, 2),
        "total_amount_pending": round(total_pending, 2)
    }


def parse_flexible_date(val: Any) -> date:
    if val is None or pd.isna(val):
        return date.today()
    if isinstance(val, (datetime, date)):
        return val.date() if isinstance(val, datetime) else val
    s = str(val).strip()
    if not s or s.lower() in ["nan", "none", "null"]:
        return date.today()
    for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%Y/%m/%d"]:
        try:
            return datetime.strptime(s.split()[0], fmt).date()
        except ValueError:
            pass
    return date.today()


def find_column_name(columns: List[str], candidates: List[str]) -> Optional[str]:
    for col in columns:
        cleaned = re.sub(r'[^a-z0-9]', '', str(col).lower())
        for cand in candidates:
            if cand == cleaned or cand in cleaned:
                return col
    return None


@router.get("/template")
def download_salary_advance_template(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    Generate and download an official Excel template (.xlsx) for bulk mid-month salary advances.
    Pre-populates 3 sample active guards with authentic sample advances for HR reference.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Salary Advances"

    header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    sample_font = Font(name="Segoe UI", size=10, color="1E293B")
    border_thin = Side(border_style="thin", color="CBD5E1")
    cell_border = Border(left=border_thin, right=border_thin, top=border_thin, bottom=border_thin)

    headers = [
        "Employee_Number", "National_ID", "Full_Name", "Advance_Amount",
        "Disbursement_Date", "Payment_Method", "Reference_Number", "Reason", "Recipient_Type"
    ]
    ws.append(headers)

    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = cell_border
    ws.row_dimensions[1].height = 28

    sample_guards = db.query(Guard).filter(Guard.status == "ACTIVE").limit(3).all()
    sample_data = []
    sample_reasons = [
        "Mid-month medical emergency advance",
        "School fees assistance advance",
        "Mid-month living & transport expenses"
    ]
    sample_amounts = [3000.0, 2500.0, 4000.0]
    sample_methods = ["M-PESA", "M-PESA", "BANK"]
    sample_refs = ["QK8912345", "QK9023456", "BTRF-889900"]
    today_str = date.today().strftime("%Y-%m-%d")

    for i, g in enumerate(sample_guards):
        sample_data.append([
            g.employee_number,
            g.national_id or "",
            g.full_name,
            sample_amounts[i % len(sample_amounts)],
            today_str,
            sample_methods[i % len(sample_methods)],
            sample_refs[i % len(sample_refs)],
            sample_reasons[i % len(sample_reasons)],
            "GUARD"
        ])

    if not sample_data:
        sample_data = [
            ["CS-00452", "12345678", "John Mwangi", 3000.0, today_str, "M-PESA", "QK8912345", "Mid-month medical advance", "GUARD"],
            ["CS-00431", "23456789", "Peter Otieno", 2500.0, today_str, "M-PESA", "QK9023456", "School fees assistance", "GUARD"]
        ]

    for row in sample_data:
        ws.append(row)

    for row in ws.iter_rows(min_row=2, max_row=len(sample_data)+1):
        for cell in row:
            cell.font = sample_font
            cell.border = cell_border
            if isinstance(cell.value, float):
                cell.number_format = "#,##0.00"

    # Add instructions block below table
    note_start_row = len(sample_data) + 3
    c_title = ws.cell(row=note_start_row, column=1, value="INSTRUCTIONS & FIELD REQUIREMENTS:")
    c_title.font = Font(name="Segoe UI", size=10, bold=True, color="0F172A")
    instructions = [
        "1. Employee Matching: Provide Employee_Number (e.g. CS-00452), National_ID, or Full_Name. System auto-identifies employees.",
        "2. Advance_Amount: Required positive numeric value in KES (e.g. 3000).",
        "3. Disbursement_Date: Format as YYYY-MM-DD or DD/MM/YYYY. If empty, today's date is used.",
        "4. Payment_Method: Allowed values: M-PESA, BANK, or CASH. Defaults to M-PESA if empty.",
        "5. Reference_Number: Optional transaction/cheque ID (e.g. MPESA code QK8912345). Auto-generated if omitted.",
        "6. Recipient_Type: 'GUARD' for security personnel, 'STAFF' for corporate employees. Defaults to GUARD.",
        "7. Note: Uploading approved advances records them immediately and schedules deduction on the next monthly payroll run."
    ]
    for idx, inst in enumerate(instructions):
        c = ws.cell(row=note_start_row + 1 + idx, column=1, value=inst)
        c.font = Font(name="Segoe UI", size=9, italic=True, color="475569")

    # Auto-adjust column widths
    column_widths = {
        "A": 18, "B": 16, "C": 24, "D": 18, "E": 20, "F": 18, "G": 20, "H": 36, "I": 16
    }
    for col_letter, width in column_widths.items():
        ws.column_dimensions[col_letter].width = width

    out = io.BytesIO()
    wb.save(out)
    out.seek(0)

    filename = f"CorpSec_Salary_Advances_Template_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        }
    )


@router.get("/{advance_id}", response_model=SalaryAdvanceResponse)
def get_salary_advance(
    advance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Get details of a single salary advance."""
    adv = db.query(SalaryAdvance).filter(SalaryAdvance.id == advance_id).first()
    if not adv:
        raise HTTPException(status_code=404, detail="Salary advance not found")
    return serialize_advance(db, adv)


@router.post("/{advance_id}/approve", response_model=SalaryAdvanceResponse)
def approve_salary_advance(
    advance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Approve a pending salary advance."""
    adv = db.query(SalaryAdvance).filter(SalaryAdvance.id == advance_id).first()
    if not adv:
        raise HTTPException(status_code=404, detail="Salary advance not found")
    if adv.status == "DEDUCTED":
        raise HTTPException(status_code=400, detail="Cannot alter an advance that has already been deducted via payroll")

    adv.status = "APPROVED"
    adv.approved_by_user_id = current_user.id
    db.commit()
    db.refresh(adv)
    return serialize_advance(db, adv)


@router.delete("/{advance_id}")
def delete_salary_advance(
    advance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Delete a salary advance record (only if not yet deducted via payroll)."""
    adv = db.query(SalaryAdvance).filter(SalaryAdvance.id == advance_id).first()
    if not adv:
        raise HTTPException(status_code=404, detail="Salary advance not found")
    if adv.status == "DEDUCTED":
        raise HTTPException(status_code=400, detail="Cannot delete an advance that has already been deducted via payroll")

    db.delete(adv)
    db.commit()
    return {"message": "Salary advance deleted successfully", "id": advance_id}


def parse_date_val(val) -> date:
    return parse_flexible_date(val)


@router.post("/upload-excel", response_model=BulkUploadAdvanceResult)
async def upload_salary_advances_excel(
    file: UploadFile = File(...),
    payroll_period_id: Optional[int] = Form(None),
    default_payment_method: Optional[str] = Form("M-PESA"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    Upload an Excel (.xlsx, .xls) or CSV (.csv) file containing mid-month salary advances.
    Automatically matches employees by Employee Number, National ID, or Full Name.
    Saves advances with APPROVED status so they are automatically deducted during monthly payroll calculation.
    """
    filename = file.filename or "advances.xlsx"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".xlsx", ".xls", ".csv"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file."
        )

    content = await file.read()
    if not content or len(content) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        if ext in [".xlsx", ".xls"]:
            df = pd.read_excel(io.BytesIO(content))
        else:
            try:
                df = pd.read_csv(io.BytesIO(content), encoding="utf-8")
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), encoding="latin1")
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Failed to parse spreadsheet file: {str(err)}")

    df = df.dropna(how='all')
    if df.empty:
        raise HTTPException(status_code=400, detail="The uploaded file contains no data rows.")

    columns = [str(c).strip() for c in df.columns]

    # Map columns flexibly
    emp_num_col = find_column_name(columns, ['employeenumber', 'employeeno', 'empno', 'empid', 'guardno', 'staffno', 'guardid', 'guardnumber'])
    nat_id_col = find_column_name(columns, ['nationalid', 'nationalidnumber', 'idnumber', 'natid', 'idno', 'nationalno', 'id'])
    name_col = find_column_name(columns, ['fullname', 'name', 'employeename', 'guardname', 'staffname', 'workername', 'guard'])
    amount_col = find_column_name(columns, ['advanceamount', 'amount', 'advance', 'amountkes', 'kes', 'value', 'salaryadvance'])
    date_col = find_column_name(columns, ['disbursementdate', 'disburseddate', 'date', 'advancedate', 'issuedate', 'transdate'])
    method_col = find_column_name(columns, ['paymentmethod', 'method', 'channel', 'mode', 'disbursementmethod'])
    ref_col = find_column_name(columns, ['referencenumber', 'refnumber', 'reference', 'refno', 'mpesacode', 'trxid', 'transactioncode', 'receipt'])
    reason_col = find_column_name(columns, ['reason', 'purpose', 'description', 'remarks', 'notes', 'comment'])
    type_col = find_column_name(columns, ['recipienttype', 'advancetype', 'type', 'category', 'role'])

    if not amount_col:
        raise HTTPException(
            status_code=400,
            detail="Missing required Advance Amount column (e.g. 'Advance_Amount' or 'Amount')."
        )

    if not (emp_num_col or nat_id_col or name_col):
        raise HTTPException(
            status_code=400,
            detail="Missing employee identifier column. The file must include 'Employee_Number', 'National_ID', or 'Full_Name'."
        )

    # Validate target payroll period if provided
    selected_period = None
    if payroll_period_id:
        selected_period = db.query(PayrollPeriod).filter(PayrollPeriod.id == payroll_period_id).first()
        if selected_period and selected_period.status in ["CONFIRMED", "CLOSED"]:
            raise HTTPException(
                status_code=400,
                detail=f"Target payroll period '{selected_period.period_name}' is locked ({selected_period.status}) and cannot accept advances."
            )

    successful_records = 0
    failed_records = 0
    total_amount_processed = 0.0
    errors = []
    created_references = []

    for idx, (_, row) in enumerate(df.iterrows(), start=2):
        # Extract and sanitize identifiers
        raw_emp_num = str(row[emp_num_col]).strip() if emp_num_col and pd.notna(row[emp_num_col]) else None
        raw_nat_id = str(row[nat_id_col]).strip() if nat_id_col and pd.notna(row[nat_id_col]) else None
        raw_name = str(row[name_col]).strip() if name_col and pd.notna(row[name_col]) else None

        if raw_emp_num and raw_emp_num.endswith('.0'): raw_emp_num = raw_emp_num[:-2]
        if raw_nat_id and raw_nat_id.endswith('.0'): raw_nat_id = raw_nat_id[:-2]
        if raw_emp_num and raw_emp_num.lower() in ["nan", "none", "null"]: raw_emp_num = None
        if raw_nat_id and raw_nat_id.lower() in ["nan", "none", "null"]: raw_nat_id = None
        if raw_name and raw_name.lower() in ["nan", "none", "null"]: raw_name = None

        if not (raw_emp_num or raw_nat_id or raw_name):
            continue  # Blank row

        # Parse Amount
        try:
            raw_amt_val = row[amount_col]
            if isinstance(raw_amt_val, str):
                raw_amt_val = re.sub(r'[^0-9.]', '', raw_amt_val)
            amount = float(raw_amt_val)
            if amount <= 0 or math.isnan(amount):
                errors.append(f"Row {idx}: Advance amount must be greater than zero (got '{row[amount_col]}').")
                failed_records += 1
                continue
        except Exception:
            errors.append(f"Row {idx}: Could not parse numeric amount from '{row[amount_col]}'.")
            failed_records += 1
            continue

        # Employee Matching Strategy:
        # 1. Match Guard by Employee Number (e.g. CS-00452)
        # 2. Match Guard by National ID
        # 3. Match Guard by Full Name
        # 4. Match Corporate Staff (User) by Email, Phone, or Full Name
        guard = None
        staff = None
        adv_type = "GUARD"

        # Check explicit recipient type column if present
        if type_col and pd.notna(row[type_col]):
            hint_type = str(row[type_col]).strip().upper()
            if "STAFF" in hint_type:
                adv_type = "STAFF"

        if adv_type == "GUARD":
            if raw_emp_num:
                guard = db.query(Guard).filter(func.lower(Guard.employee_number) == raw_emp_num.lower()).first()
            if not guard and raw_nat_id:
                guard = db.query(Guard).filter(Guard.national_id == raw_nat_id).first()
            if not guard and raw_name:
                guard = db.query(Guard).filter(func.lower(Guard.full_name) == raw_name.lower()).first()

        # If not found in guards, check corporate staff
        if not guard:
            staff_query = db.query(User)
            if raw_emp_num:
                staff = staff_query.filter(or_(User.email == raw_emp_num, User.phone == raw_emp_num)).first()
            if not staff and raw_nat_id:
                staff = staff_query.filter(User.phone == raw_nat_id).first()
            if not staff and raw_name:
                staff = staff_query.filter(func.lower(User.full_name) == raw_name.lower()).first()

            if staff:
                adv_type = "STAFF"

        if not guard and not staff:
            ident_str = f"Emp No: {raw_emp_num or 'N/A'}, National ID: {raw_nat_id or 'N/A'}, Name: {raw_name or 'N/A'}"
            errors.append(f"Row {idx}: Employee not found in database ({ident_str}).")
            failed_records += 1
            continue

        # Parse Disbursement Date
        disb_date = parse_date_val(row[date_col]) if date_col and pd.notna(row[date_col]) else date.today()

        # Determine target payroll period
        target_period_id = payroll_period_id
        if not target_period_id:
            matching_p = db.query(PayrollPeriod).filter(
                PayrollPeriod.year == disb_date.year,
                PayrollPeriod.month == disb_date.month
            ).first()
            if matching_p:
                target_period_id = matching_p.id

        # Payment Method & Reference
        method = str(row[method_col]).strip().upper() if method_col and pd.notna(row[method_col]) else (default_payment_method or "M-PESA").upper()
        if method not in ["M-PESA", "BANK", "CASH"]:
            method = "M-PESA"

        ref_number = str(row[ref_col]).strip() if ref_col and pd.notna(row[ref_col]) else None
        if ref_number and ref_number.lower() in ["nan", "none", "null"]:
            ref_number = None

        reason = str(row[reason_col]).strip() if reason_col and pd.notna(row[reason_col]) else "Bulk Excel mid-month advance"
        if reason.lower() in ["nan", "none", "null"]:
            reason = "Bulk Excel mid-month advance"

        adv_ref = generate_advance_reference(db, disb_date)

        adv = SalaryAdvance(
            advance_reference=adv_ref,
            advance_type=adv_type,
            guard_id=guard.id if guard else None,
            staff_id=staff.id if staff else None,
            payroll_period_id=target_period_id,
            amount=round(amount, 2),
            disbursement_date=disb_date,
            payment_method=method,
            reference_number=ref_number,
            reason=reason,
            notes=f"Bulk imported from {filename}",
            status="APPROVED",
            approved_by_user_id=current_user.id,
            created_at=datetime.now()
        )
        db.add(adv)
        db.flush()

        successful_records += 1
        total_amount_processed += amount
        created_references.append(adv_ref)

    if successful_records > 0:
        audit = AuditLog(
            user_id=current_user.id,
            user_name=current_user.email,
            role=current_user.role,
            action="BULK_UPLOAD_SALARY_ADVANCES",
            target_entity="SalaryAdvance",
            target_id=f"{successful_records} advances",
            new_values=f"Bulk uploaded {successful_records} salary advances totaling KES {total_amount_processed:,.2f} from file '{filename}'",
            reason=f"Excel bulk upload ({filename})"
        )
        db.add(audit)
        db.commit()

    return {
        "success": successful_records > 0,
        "total_rows": len(df),
        "successful_records": successful_records,
        "failed_records": failed_records,
        "total_amount_processed": round(total_amount_processed, 2),
        "errors": errors,
        "created_references": created_references
    }
