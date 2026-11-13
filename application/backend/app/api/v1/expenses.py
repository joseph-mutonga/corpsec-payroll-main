import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, extract

from application.backend.app.api.deps import get_db, require_admin_or_hr
from application.backend.app.models.user import User
from application.backend.app.models.expense import Expense, PettyCashTransaction
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.expense import (
    ExpenseCreate, ExpenseResponse,
    RecurringExpenseCreate, RecurringExpenseUpdate, RecordRecurringPaymentRequest,
    RecurringExpenseDetailResponse, RecurringPaymentHistoryItem,
    PettyCashTopUpRequest, PettyCashTransactionResponse,
    ExpenseSummaryResponse
)

router = APIRouter(prefix="/expenses", tags=["Firm Expenses & Petty Cash Management"])


def _format_expense(exp: Expense) -> dict:
    rec_name = exp.recorded_by.full_name if exp.recorded_by else None
    return {
        "id": exp.id,
        "expense_date": exp.expense_date,
        "title": exp.title,
        "category": exp.category,
        "expense_type": exp.expense_type,
        "amount": exp.amount,
        "payment_method": exp.payment_method,
        "payee": exp.payee,
        "receipt_number": exp.receipt_number,
        "is_recurring": exp.is_recurring,
        "recurrence_interval": exp.recurrence_interval,
        "next_due_date": exp.next_due_date,
        "last_paid_date": exp.last_paid_date,
        "recurring_parent_id": exp.recurring_parent_id,
        "status": exp.status,
        "description": exp.description,
        "recorded_by_user_id": exp.recorded_by_user_id,
        "recorded_by_name": rec_name,
        "created_at": exp.created_at
    }


def _recalculate_petty_cash_balances(db: Session):
    txs = db.query(PettyCashTransaction).order_by(PettyCashTransaction.id.asc()).all()
    running_balance = 0.0
    for t in txs:
        if t.transaction_type == "TOP_UP":
            running_balance += t.amount
        elif t.transaction_type == "DISBURSEMENT":
            running_balance -= t.amount
        t.balance_after = round(running_balance, 2)
    db.flush()


def _get_current_float_balance(db: Session) -> float:
    last_tx = db.query(PettyCashTransaction).order_by(PettyCashTransaction.id.desc()).first()
    return float(last_tx.balance_after) if last_tx else 0.0


@router.get("", response_model=List[ExpenseResponse])
def list_expenses(
    category: Optional[str] = Query(None),
    expense_type: Optional[str] = Query(None),
    month: Optional[str] = Query(None),  # YYYY-MM, 'this_month', 'last_month'
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """List firm and shop operational expenses with optional filtering."""
    query = db.query(Expense)
    
    if category and category.strip():
        c_val = category.strip()
        query = query.filter(
            or_(
                Expense.category == c_val,
                Expense.category == c_val.upper(),
                Expense.category.ilike(f"%{c_val}%")
            )
        )
    if expense_type and expense_type.strip():
        t_val = expense_type.strip()
        query = query.filter(
            or_(
                Expense.expense_type == t_val,
                Expense.expense_type == t_val.upper()
            )
        )
    if month and month.strip():
        m_str = month.strip().lower()
        today = datetime.date.today()
        target_yr, target_mo = None, None
        if m_str in ("this_month", "current", "current_month", "now"):
            target_yr, target_mo = today.year, today.month
        elif m_str in ("last_month", "previous", "previous_month", "prev"):
            first_of_this = today.replace(day=1)
            last_mo_date = first_of_this - datetime.timedelta(days=1)
            target_yr, target_mo = last_mo_date.year, last_mo_date.month
        else:
            try:
                parts = m_str.split("-")
                if len(parts) == 2:
                    target_yr, target_mo = int(parts[0]), int(parts[1])
            except Exception:
                pass

        if target_yr and target_mo:
            import calendar
            first_day = datetime.date(target_yr, target_mo, 1)
            last_day = datetime.date(target_yr, target_mo, calendar.monthrange(target_yr, target_mo)[1])
            query = query.filter(Expense.expense_date >= first_day, Expense.expense_date <= last_day)

    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Expense.title.ilike(s),
                Expense.payee.ilike(s),
                Expense.receipt_number.ilike(s),
                Expense.description.ilike(s),
                Expense.category.ilike(s)
            )
        )
        
    records = query.order_by(Expense.expense_date.desc(), Expense.id.desc()).all()
    return [_format_expense(e) for e in records]


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def record_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Record a firm expense or petty cash payout."""
    exp_date = payload.expense_date or datetime.date.today()
    
    # Duplicate submission prevention (within 30 seconds)
    recent_window = datetime.datetime.now() - datetime.timedelta(seconds=30)
    existing_dup = db.query(Expense).filter(
        Expense.payee == payload.payee.strip(),
        Expense.amount == float(payload.amount),
        Expense.category == payload.category.upper(),
        Expense.expense_date == exp_date,
        Expense.created_at >= recent_window
    ).first()
    if existing_dup:
        return _format_expense(existing_dup)

    # If petty cash payment, verify sufficient float
    current_float = _get_current_float_balance(db)
    is_petty_cash = (payload.payment_method in ("PETTY_CASH_FLOAT", "PETTY_CASH") or payload.expense_type == "PETTY_CASH")
    if is_petty_cash:
        if payload.amount > current_float:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient petty cash float: Requested KES {payload.amount:,.2f}, but current balance is KES {current_float:,.2f}. Please replenish the float first."
            )

    exp_title = payload.title.strip() if payload.title else None
    if not exp_title or len(exp_title) < 2:
        exp_title = f"{payload.category} - {payload.payee}".strip()
        if len(exp_title) < 2:
            exp_title = f"{payload.category} Expense"

    is_rec = payload.is_recurring or (payload.expense_type and payload.expense_type.upper() == "RECURRING")
    exp = Expense(
        expense_date=exp_date,
        title=exp_title,
        category=payload.category.upper(),
        expense_type=payload.expense_type.upper(),
        amount=float(payload.amount),
        payment_method=payload.payment_method.upper(),
        payee=payload.payee.strip(),
        receipt_number=payload.receipt_number.strip() if payload.receipt_number else None,
        is_recurring=is_rec,
        recurrence_interval=payload.recurrence_interval.upper() if payload.recurrence_interval else None,
        next_due_date=payload.next_due_date,
        last_paid_date=payload.last_paid_date or (exp_date if is_rec else None),
        recurring_parent_id=payload.recurring_parent_id,
        status=payload.status.upper(),
        description=payload.description.strip() if payload.description else None,
        recorded_by_user_id=current_user.id
    )
    db.add(exp)
    db.flush()

    # Automatically log disbursement in petty cash book if paid from float
    if is_petty_cash:
        new_balance = current_float - float(payload.amount)
        pc_tx = PettyCashTransaction(
            transaction_date=exp_date,
            transaction_type="DISBURSEMENT",
            amount=float(payload.amount),
            balance_after=new_balance,
            voucher_ref=payload.receipt_number,
            reason=exp_title,
            source_or_recipient=payload.payee.strip(),
            expense_id=exp.id,
            recorded_by_user_id=current_user.id
        )
        db.add(pc_tx)

    # Audit log
    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="RECORD_EXPENSE",
        target_entity="Expense",
        target_id=str(exp.id),
        new_values=f"Recorded {exp.expense_type} expense '{exp.title}' of KES {exp.amount:,.2f} to {exp.payee}",
        reason="Operating expense entry"
    )
    db.add(audit)
    db.commit()
    db.refresh(exp)

    return _format_expense(exp)


@router.get("/summary", response_model=ExpenseSummaryResponse)
def get_expenses_summary(
    month: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Summary KPI metrics for firm expenses, petty cash, and recurring commitments with month inspection."""
    today = datetime.date.today()
    all_expenses = db.query(Expense).all()

    this_yr, this_mo = today.year, today.month
    first_of_this = today.replace(day=1)
    last_mo_date = first_of_this - datetime.timedelta(days=1)
    last_yr, last_mo = last_mo_date.year, last_mo_date.month

    # Current month expenses
    curr_month_exp = [
        e for e in all_expenses
        if e.expense_date and e.expense_date.year == this_yr and e.expense_date.month == this_mo
    ]
    total_this_month = sum(e.amount for e in curr_month_exp)

    # Last month expenses
    last_month_exp = [
        e for e in all_expenses
        if e.expense_date and e.expense_date.year == last_yr and e.expense_date.month == last_mo
    ]
    total_last_month = sum(e.amount for e in last_month_exp)

    # Determine targeted month for breakdown & totals
    resolved_selected_month = "this_month"
    sel_yr, sel_mo = this_yr, this_mo
    if month and month.strip():
        m_str = month.strip().lower()
        if m_str in ("last_month", "previous", "previous_month", "prev"):
            sel_yr, sel_mo = last_yr, last_mo
            resolved_selected_month = "last_month"
        elif m_str in ("this_month", "current", "current_month", "now"):
            sel_yr, sel_mo = this_yr, this_mo
            resolved_selected_month = "this_month"
        else:
            try:
                parts = m_str.split("-")
                if len(parts) == 2:
                    sel_yr, sel_mo = int(parts[0]), int(parts[1])
                    resolved_selected_month = f"{sel_yr:04d}-{sel_mo:02d}"
            except Exception:
                resolved_selected_month = f"{sel_yr:04d}-{sel_mo:02d}"

    sel_month_str = f"{sel_yr:04d}-{sel_mo:02d}"
    sel_month_label = datetime.date(sel_yr, sel_mo, 1).strftime("%B %Y")

    # Selected month subset
    selected_month_exp = [
        e for e in all_expenses
        if e.expense_date and e.expense_date.year == sel_yr and e.expense_date.month == sel_mo
    ]
    total_selected_month = sum(e.amount for e in selected_month_exp)
    petty_spent_selected = sum(
        e.amount for e in selected_month_exp
        if e.expense_type == "PETTY_CASH" or e.payment_method in ("PETTY_CASH_FLOAT", "PETTY_CASH")
    )

    # Recurring monthly commitments
    recurring_items = db.query(Expense).filter(Expense.is_recurring == True).all()
    monthly_recurring = 0.0
    for r in recurring_items:
        interval = (r.recurrence_interval or "MONTHLY").upper()
        if interval == "MONTHLY":
            monthly_recurring += r.amount
        elif interval == "WEEKLY":
            monthly_recurring += r.amount * 4.33
        elif interval == "QUARTERLY":
            monthly_recurring += r.amount / 3.0
        elif interval == "ANNUALLY":
            monthly_recurring += r.amount / 12.0

    float_bal = _get_current_float_balance(db)

    # Category breakdown for selected month
    by_cat = {}
    for e in selected_month_exp:
        by_cat[e.category] = round(by_cat.get(e.category, 0.0) + e.amount, 2)

    # Type breakdown for selected month
    by_typ = {}
    for e in selected_month_exp:
        by_typ[e.expense_type] = round(by_typ.get(e.expense_type, 0.0) + e.amount, 2)

    # Available months list compiled from database
    months_map = {}
    for e in all_expenses:
        if e.expense_date:
            k = f"{e.expense_date.year:04d}-{e.expense_date.month:02d}"
            lbl = e.expense_date.strftime("%B %Y")
            if k not in months_map:
                months_map[k] = {
                    "value": k,
                    "label": lbl,
                    "is_current": (e.expense_date.year == this_yr and e.expense_date.month == this_mo),
                    "is_last": (e.expense_date.year == last_yr and e.expense_date.month == last_mo),
                    "expense_count": 0,
                    "total_amount": 0.0
                }
            months_map[k]["expense_count"] += 1
            months_map[k]["total_amount"] = round(months_map[k]["total_amount"] + e.amount, 2)

    # Ensure this month and last month always exist in map
    this_key = f"{this_yr:04d}-{this_mo:02d}"
    if this_key not in months_map:
        months_map[this_key] = {
            "value": this_key,
            "label": today.strftime("%B %Y"),
            "is_current": True,
            "is_last": False,
            "expense_count": 0,
            "total_amount": 0.0
        }
    last_key = f"{last_yr:04d}-{last_mo:02d}"
    if last_key not in months_map:
        months_map[last_key] = {
            "value": last_key,
            "label": last_mo_date.strftime("%B %Y"),
            "is_current": False,
            "is_last": True,
            "expense_count": 0,
            "total_amount": 0.0
        }

    available_months_list = sorted(months_map.values(), key=lambda x: x["value"], reverse=True)

    return ExpenseSummaryResponse(
        total_expenses_this_month=round(total_this_month, 2),
        total_expenses_last_month=round(total_last_month, 2),
        selected_month=resolved_selected_month,
        selected_month_label=sel_month_label,
        selected_month_total=round(total_selected_month, 2),
        petty_cash_float_balance=round(float_bal, 2),
        petty_cash_disbursed_this_month=round(petty_spent_selected, 2),
        monthly_recurring_commitments=round(monthly_recurring, 2),
        total_recorded_count=len(all_expenses),
        by_category=by_cat,
        by_type=by_typ,
        available_months=available_months_list
    )


@router.get("/petty-cash")
def list_petty_cash_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Get petty cash transactions ledger and current float balance."""
    txs = db.query(PettyCashTransaction).order_by(PettyCashTransaction.id.desc()).all()
    current_balance = _get_current_float_balance(db)
    
    return {
        "current_balance": current_balance,
        "transactions": [
            {
                "id": t.id,
                "transaction_date": t.transaction_date,
                "transaction_type": t.transaction_type,
                "amount": t.amount,
                "balance_after": t.balance_after,
                "voucher_ref": t.voucher_ref,
                "reason": t.reason,
                "source_or_recipient": t.source_or_recipient,
                "expense_id": t.expense_id,
                "created_at": t.created_at
            }
            for t in txs
        ]
    }


@router.post("/petty-cash/top-up", response_model=PettyCashTransactionResponse, status_code=status.HTTP_201_CREATED)
def top_up_petty_cash(
    payload: PettyCashTopUpRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Top up / replenish the petty cash float."""
    tx_date = payload.transaction_date or datetime.date.today()
    current_balance = _get_current_float_balance(db)
    new_balance = current_balance + float(payload.amount)

    v_ref = payload.voucher_ref or payload.reference_number
    if not v_ref or not v_ref.strip():
        v_ref = f"FLOAT-TOP-{tx_date.strftime('%Y%m%d')}"
    else:
        v_ref = v_ref.strip()

    r_reason = payload.notes or payload.reason or "Petty cash float replenishment"
    r_reason = r_reason.strip()

    tx = PettyCashTransaction(
        transaction_date=tx_date,
        transaction_type="TOP_UP",
        amount=float(payload.amount),
        balance_after=new_balance,
        voucher_ref=v_ref,
        reason=r_reason,
        source_or_recipient=payload.source.strip() if payload.source else "Corporate Operating Bank Account",
        recorded_by_user_id=current_user.id
    )
    db.add(tx)

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="TOP_UP_PETTY_CASH",
        target_entity="PettyCashTransaction",
        target_id=str(tx.id),
        new_values=f"Replenished petty cash float by KES {payload.amount:,.2f}. New Balance: KES {new_balance:,.2f}",
        reason=r_reason
    )
    db.add(audit)
    db.commit()
    db.refresh(tx)

    return tx


def _advance_due_date(base_date: datetime.date, interval: str) -> datetime.date:
    import calendar
    interval_upper = (interval or "MONTHLY").upper()
    if interval_upper == "WEEKLY":
        return base_date + datetime.timedelta(days=7)
    elif interval_upper in ("ANNUALLY", "ANNUAL"):
        try:
            return base_date.replace(year=base_date.year + 1)
        except ValueError:
            return base_date.replace(year=base_date.year + 1, day=28)
    elif interval_upper == "QUARTERLY":
        new_month = base_date.month + 3
        new_year = base_date.year
        if new_month > 12:
            new_month -= 12
            new_year += 1
        max_days = calendar.monthrange(new_year, new_month)[1]
        new_day = min(base_date.day, max_days)
        return datetime.date(new_year, new_month, new_day)
    else:  # MONTHLY
        new_month = base_date.month + 1
        new_year = base_date.year
        if new_month > 12:
            new_month = 1
            new_year += 1
        max_days = calendar.monthrange(new_year, new_month)[1]
        new_day = min(base_date.day, max_days)
        return datetime.date(new_year, new_month, new_day)


@router.get("/recurring")
def list_recurring_expenditures(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """List recurring expenditures with payment tracking, payee details, and due dates."""
    items = db.query(Expense).filter(Expense.is_recurring == True).order_by(Expense.next_due_date.asc()).all()
    today = datetime.date.today()
    results = []
    
    for r in items:
        days_until_due = None
        if r.next_due_date:
            days_until_due = (r.next_due_date - today).days

        monthly_norm = r.amount
        interval = (r.recurrence_interval or "MONTHLY").upper()
        if interval == "WEEKLY":
            monthly_norm = r.amount * 4.33
        elif interval == "QUARTERLY":
            monthly_norm = r.amount / 3.0
        elif interval in ("ANNUALLY", "ANNUAL"):
            monthly_norm = r.amount / 12.0

        # Query past payment executions for this recurring obligation
        payments = db.query(Expense).filter(
            or_(
                Expense.recurring_parent_id == r.id,
                (Expense.payee == r.payee) & (Expense.category == r.category) & (Expense.is_recurring == False)
            )
        ).order_by(Expense.expense_date.desc(), Expense.id.desc()).all()

        last_paid_rec = payments[0] if payments else None
        last_paid_date = r.last_paid_date or (last_paid_rec.expense_date if last_paid_rec else None)
        last_paid_amount = last_paid_rec.amount if last_paid_rec else None
        last_payment_method = last_paid_rec.payment_method if last_paid_rec else None
        total_paid = sum(p.amount for p in payments)

        results.append({
            "id": r.id,
            "title": r.title,
            "category": r.category,
            "payee": r.payee,
            "amount": r.amount,
            "payment_method": r.payment_method or "BANK_TRANSFER",
            "recurrence_interval": interval,
            "monthly_normalized_amount": round(monthly_norm, 2),
            "next_due_date": r.next_due_date,
            "last_paid_date": last_paid_date,
            "last_paid_amount": last_paid_amount,
            "last_payment_method": last_payment_method,
            "total_paid_to_date": round(total_paid, 2),
            "payment_count": len(payments),
            "days_until_due": days_until_due,
            "status": r.status or "ACTIVE",
            "description": r.description
        })
    return results


@router.post("/recurring", status_code=status.HTTP_201_CREATED)
def create_recurring_expenditure(
    payload: RecurringExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Add a new recurrent expenditure obligation."""
    interval = (payload.recurrence_interval or "MONTHLY").upper()
    today = datetime.date.today()
    due_date = payload.next_due_date or _advance_due_date(today, interval)

    exp = Expense(
        expense_date=today,
        title=payload.title.strip(),
        category=payload.category.strip(),
        expense_type="RECURRING",
        amount=float(payload.amount),
        payment_method=payload.payment_method.strip() if payload.payment_method else "BANK_TRANSFER",
        payee=payload.payee.strip(),
        receipt_number=None,
        is_recurring=True,
        recurrence_interval=interval,
        next_due_date=due_date,
        last_paid_date=payload.last_paid_date,
        status=payload.status.strip() if payload.status else "ACTIVE",
        description=payload.description.strip() if payload.description else None,
        recorded_by_user_id=current_user.id
    )
    db.add(exp)
    db.flush()

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="CREATE_RECURRING_EXPENSE",
        target_entity="Expense",
        target_id=str(exp.id),
        new_values=f"Created recurring obligation '{exp.title}' to {exp.payee} of KES {exp.amount:,.2f} ({interval})",
        reason="Standing expenditure setup"
    )
    db.add(audit)
    db.commit()
    db.refresh(exp)

    return _format_expense(exp)


@router.get("/recurring/{recurring_id}")
def get_recurring_expenditure_detail(
    recurring_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Get full details and payment audit history for a recurrent expenditure."""
    r = db.query(Expense).filter(Expense.id == recurring_id, Expense.is_recurring == True).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring obligation not found")

    today = datetime.date.today()
    days_until_due = (r.next_due_date - today).days if r.next_due_date else None

    # Fetch all payments made for this recurring obligation
    payments = db.query(Expense).filter(
        or_(
            Expense.recurring_parent_id == r.id,
            (Expense.payee == r.payee) & (Expense.category == r.category) & (Expense.is_recurring == False)
        )
    ).order_by(Expense.expense_date.desc(), Expense.id.desc()).all()

    payment_history = []
    for p in payments:
        rec_name = p.recorded_by.full_name if p.recorded_by else "System Administrator"
        payment_history.append({
            "id": p.id,
            "expense_date": p.expense_date,
            "amount": p.amount,
            "payment_method": p.payment_method,
            "payee": p.payee,
            "receipt_number": p.receipt_number,
            "description": p.description,
            "recorded_by_name": rec_name,
            "created_at": p.created_at
        })

    last_p = payments[0] if payments else None

    return {
        "id": r.id,
        "title": r.title,
        "category": r.category,
        "payee": r.payee,
        "amount": r.amount,
        "payment_method": r.payment_method or "BANK_TRANSFER",
        "recurrence_interval": r.recurrence_interval or "MONTHLY",
        "next_due_date": r.next_due_date,
        "last_paid_date": r.last_paid_date or (last_p.expense_date if last_p else None),
        "last_paid_amount": last_p.amount if last_p else None,
        "last_payment_method": last_p.payment_method if last_p else None,
        "total_paid_to_date": sum(p.amount for p in payments),
        "payment_count": len(payments),
        "days_until_due": days_until_due,
        "status": r.status or "ACTIVE",
        "description": r.description,
        "created_at": r.created_at,
        "payments_history": payment_history
    }


@router.put("/recurring/{recurring_id}")
def update_recurring_expenditure(
    recurring_id: int,
    payload: RecurringExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Edit recurrent expenditure obligation (Admin/HR only)."""
    r = db.query(Expense).filter(Expense.id == recurring_id, Expense.is_recurring == True).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring obligation not found")

    old_vals = f"Title: {r.title}, Amount: {r.amount}, Due: {r.next_due_date}, Status: {r.status}"

    if payload.title is not None and payload.title.strip():
        r.title = payload.title.strip()
    if payload.category is not None and payload.category.strip():
        r.category = payload.category.strip()
    if payload.amount is not None and payload.amount > 0:
        r.amount = float(payload.amount)
    if payload.payee is not None and payload.payee.strip():
        r.payee = payload.payee.strip()
    if payload.recurrence_interval is not None and payload.recurrence_interval.strip():
        r.recurrence_interval = payload.recurrence_interval.strip().upper()
    if payload.next_due_date is not None:
        r.next_due_date = payload.next_due_date
    if payload.last_paid_date is not None:
        r.last_paid_date = payload.last_paid_date
    if payload.payment_method is not None and payload.payment_method.strip():
        r.payment_method = payload.payment_method.strip().upper()
    if payload.status is not None and payload.status.strip():
        r.status = payload.status.strip().upper()
    if payload.description is not None:
        r.description = payload.description.strip() if payload.description.strip() else None

    r.updated_at = datetime.datetime.now()

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="UPDATE_RECURRING_EXPENSE",
        target_entity="Expense",
        target_id=str(r.id),
        old_values=old_vals,
        new_values=f"Title: {r.title}, Amount: {r.amount}, Due: {r.next_due_date}, Status: {r.status}",
        reason="Updated recurring obligation commitment"
    )
    db.add(audit)
    db.commit()
    db.refresh(r)

    return _format_expense(r)


@router.post("/recurring/{recurring_id}/pay", status_code=status.HTTP_201_CREATED)
def record_recurring_payment(
    recurring_id: int,
    payload: RecordRecurringPaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Record that a recurring expenditure was paid, identify when paid and to whom, and advance due date."""
    r = db.query(Expense).filter(Expense.id == recurring_id, Expense.is_recurring == True).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring obligation not found")

    pay_date = payload.payment_date or datetime.date.today()
    pay_amount = float(payload.amount) if payload.amount and payload.amount > 0 else float(r.amount)
    pay_method = (payload.payment_method or r.payment_method or "BANK_TRANSFER").upper()
    is_petty_cash = pay_method in ("PETTY_CASH", "PETTY_CASH_FLOAT")

    if is_petty_cash:
        current_float = _get_current_float_balance(db)
        if pay_amount > current_float:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient petty cash float: Payment requires KES {pay_amount:,.2f}, but current balance is KES {current_float:,.2f}."
            )

    desc = payload.description.strip() if payload.description else f"Recurring settlement: {r.title} to {r.payee}"
    p_title = f"{r.title} - Payment ({pay_date.strftime('%b %Y')})"

    p_exp = Expense(
        expense_date=pay_date,
        title=p_title,
        category=r.category,
        expense_type="RECURRING",
        amount=pay_amount,
        payment_method=pay_method,
        payee=r.payee,
        receipt_number=payload.receipt_number.strip() if payload.receipt_number else None,
        is_recurring=False,
        recurring_parent_id=r.id,
        status="PAID",
        description=desc,
        recorded_by_user_id=current_user.id
    )
    db.add(p_exp)
    db.flush()

    if is_petty_cash:
        new_balance = current_float - pay_amount
        pc_tx = PettyCashTransaction(
            transaction_date=pay_date,
            transaction_type="DISBURSEMENT",
            amount=pay_amount,
            balance_after=new_balance,
            voucher_ref=payload.receipt_number,
            reason=p_title,
            source_or_recipient=r.payee,
            expense_id=p_exp.id,
            recorded_by_user_id=current_user.id
        )
        db.add(pc_tx)

    # Update recurring obligation last paid date
    r.last_paid_date = pay_date
    if payload.advance_next_due_date:
        base_date = r.next_due_date or pay_date
        r.next_due_date = _advance_due_date(base_date, r.recurrence_interval or "MONTHLY")

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="PAY_RECURRING_EXPENSE",
        target_entity="Expense",
        target_id=str(p_exp.id),
        new_values=f"Paid recurring obligation '{r.title}' (KES {pay_amount:,.2f}) to {r.payee} on {pay_date}. Next due: {r.next_due_date}",
        reason="Recurring expenditure disbursement"
    )
    db.add(audit)
    db.commit()
    db.refresh(p_exp)
    db.refresh(r)

    return {
        "message": f"Payment of KES {pay_amount:,.2f} to {r.payee} recorded successfully!",
        "payment": _format_expense(p_exp),
        "recurring_obligation": {
            "id": r.id,
            "title": r.title,
            "payee": r.payee,
            "last_paid_date": r.last_paid_date,
            "next_due_date": r.next_due_date,
            "status": r.status
        }
    }


@router.delete("/recurring/{recurring_id}", status_code=status.HTTP_200_OK)
def delete_recurring_expenditure(
    recurring_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Remove a recurrent expenditure obligation (Admin/HR only)."""
    r = db.query(Expense).filter(Expense.id == recurring_id, Expense.is_recurring == True).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurring obligation not found")

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="REMOVE_RECURRING_EXPENSE",
        target_entity="Expense",
        target_id=str(r.id),
        reason=f"Removed recurring obligation '{r.title}' (Payee: {r.payee}, KES {r.amount})"
    )
    db.add(audit)
    db.delete(r)
    db.commit()

    return {"message": "Recurring obligation removed successfully", "id": recurring_id}


@router.delete("/{expense_id}", status_code=status.HTTP_200_OK)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Delete an expense record."""
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    # If it had an associated petty cash disbursement, remove and recalculate running float
    pc_tx = db.query(PettyCashTransaction).filter(PettyCashTransaction.expense_id == exp.id).first()
    if pc_tx:
        db.delete(pc_tx)
        db.flush()
        _recalculate_petty_cash_balances(db)

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="DELETE_EXPENSE",
        target_entity="Expense",
        target_id=str(exp.id),
        reason=f"Deleted expense '{exp.title}' (KES {exp.amount})"
    )
    db.add(audit)
    db.delete(exp)
    db.commit()

    return {"message": "Expense deleted successfully", "id": expense_id}

