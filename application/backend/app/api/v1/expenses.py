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
        "status": exp.status,
        "description": exp.description,
        "recorded_by_user_id": exp.recorded_by_user_id,
        "recorded_by_name": rec_name,
        "created_at": exp.created_at
    }


def _get_current_float_balance(db: Session) -> float:
    last_tx = db.query(PettyCashTransaction).order_by(PettyCashTransaction.id.desc()).first()
    return float(last_tx.balance_after) if last_tx else 0.0


@router.get("", response_model=List[ExpenseResponse])
def list_expenses(
    category: Optional[str] = Query(None),
    expense_type: Optional[str] = Query(None),
    month: Optional[str] = Query(None),  # YYYY-MM
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """List firm and shop operational expenses with optional filtering."""
    query = db.query(Expense)
    
    if category:
        query = query.filter(Expense.category == category)
    if expense_type:
        query = query.filter(Expense.expense_type == expense_type)
    if month:
        try:
            yr, mo = [int(x) for x in month.split("-")]
            query = query.filter(extract('year', Expense.expense_date) == yr, extract('month', Expense.expense_date) == mo)
        except Exception:
            pass
    if search:
        s = f"%{search}%"
        query = query.filter(
            or_(
                Expense.title.ilike(s),
                Expense.payee.ilike(s),
                Expense.receipt_number.ilike(s),
                Expense.description.ilike(s)
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
    
    # If petty cash payment, verify sufficient float
    current_float = _get_current_float_balance(db)
    if payload.payment_method == "PETTY_CASH_FLOAT" or payload.expense_type == "PETTY_CASH":
        if payload.amount > current_float:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient petty cash float: Requested KES {payload.amount:,.2f}, but current balance is KES {current_float:,.2f}. Please replenish the float first."
            )

    exp = Expense(
        expense_date=exp_date,
        title=payload.title.strip(),
        category=payload.category.upper(),
        expense_type=payload.expense_type.upper(),
        amount=float(payload.amount),
        payment_method=payload.payment_method.upper(),
        payee=payload.payee.strip(),
        receipt_number=payload.receipt_number.strip() if payload.receipt_number else None,
        is_recurring=payload.is_recurring,
        recurrence_interval=payload.recurrence_interval.upper() if payload.recurrence_interval else None,
        next_due_date=payload.next_due_date,
        status=payload.status.upper(),
        description=payload.description.strip() if payload.description else None,
        recorded_by_user_id=current_user.id
    )
    db.add(exp)
    db.flush()

    # Automatically log disbursement in petty cash book if paid from float
    if payload.payment_method == "PETTY_CASH_FLOAT" or payload.expense_type == "PETTY_CASH":
        new_balance = current_float - float(payload.amount)
        pc_tx = PettyCashTransaction(
            transaction_date=exp_date,
            transaction_type="DISBURSEMENT",
            amount=float(payload.amount),
            balance_after=new_balance,
            voucher_ref=payload.receipt_number,
            reason=payload.title.strip(),
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
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Summary KPI metrics for firm expenses, petty cash, and recurring commitments."""
    today = datetime.date.today()
    all_expenses = db.query(Expense).all()

    # Current month expenses
    curr_month_exp = [
        e for e in all_expenses
        if e.expense_date.year == today.year and e.expense_date.month == today.month
    ]
    total_this_month = sum(e.amount for e in curr_month_exp)
    petty_spent_month = sum(e.amount for e in curr_month_exp if e.expense_type == "PETTY_CASH" or e.payment_method == "PETTY_CASH_FLOAT")

    # Recurring monthly commitment
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

    # Current petty cash float balance
    float_bal = _get_current_float_balance(db)

    # Category breakdown (for current month or all)
    by_cat = {}
    for e in curr_month_exp:
        by_cat[e.category] = round(by_cat.get(e.category, 0.0) + e.amount, 2)

    # Type breakdown
    by_typ = {}
    for e in curr_month_exp:
        by_typ[e.expense_type] = round(by_typ.get(e.expense_type, 0.0) + e.amount, 2)

    return ExpenseSummaryResponse(
        total_expenses_this_month=round(total_this_month, 2),
        petty_cash_float_balance=round(float_bal, 2),
        petty_cash_disbursed_this_month=round(petty_spent_month, 2),
        monthly_recurring_commitments=round(monthly_recurring, 2),
        total_recorded_count=len(all_expenses),
        by_category=by_cat,
        by_type=by_typ
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

    tx = PettyCashTransaction(
        transaction_date=tx_date,
        transaction_type="TOP_UP",
        amount=float(payload.amount),
        balance_after=new_balance,
        voucher_ref=payload.voucher_ref or f"FLOAT-TOP-{tx_date.strftime('%Y%m%d')}",
        reason=payload.reason.strip(),
        source_or_recipient=payload.source.strip(),
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
        reason=payload.reason
    )
    db.add(audit)
    db.commit()
    db.refresh(tx)

    return tx


@router.get("/recurring")
def list_recurring_expenditures(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """List recurring expenditures with monthly normalized costs and upcoming due dates."""
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
        elif interval == "ANNUALLY":
            monthly_norm = r.amount / 12.0

        results.append({
            "id": r.id,
            "title": r.title,
            "category": r.category,
            "payee": r.payee,
            "amount": r.amount,
            "recurrence_interval": interval,
            "monthly_normalized_amount": round(monthly_norm, 2),
            "next_due_date": r.next_due_date,
            "days_until_due": days_until_due,
            "status": r.status,
            "description": r.description
        })
    return results


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

    # If it had an associated petty cash disbursement, remove or revert
    pc_tx = db.query(PettyCashTransaction).filter(PettyCashTransaction.expense_id == exp.id).first()
    if pc_tx:
        db.delete(pc_tx)

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

