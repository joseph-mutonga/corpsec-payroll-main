import re
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.guard import Guard


def validate_kenyan_phone(phone_str: Optional[str]) -> Tuple[bool, str, Optional[str]]:
    """
    Validates and normalizes Kenyan phone numbers (07xx xxx xxx, 01xx xxx xxx, +254xx...).
    Returns (is_valid, normalized_phone, error_message).
    """
    if not phone_str:
        return False, "", "Phone number is missing"

    # Remove whitespace, dashes, plus signs
    cleaned = re.sub(r"[\s\-\+\(\)]", "", str(phone_str).strip())

    # Handle +254 or 254 prefix
    if cleaned.startswith("254") and len(cleaned) == 12:
        cleaned = "0" + cleaned[3:]

    # Check 10-digit Kenyan format starting with 07 or 01
    if len(cleaned) == 10 and (cleaned.startswith("07") or cleaned.startswith("01")):
        return True, cleaned, None

    return False, phone_str, f"Invalid Kenyan phone format: '{phone_str}'"


def validate_bank_details(bank_name: Optional[str], bank_account: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Validates bank name and account number.
    Returns (is_valid, error_message).
    """
    if not bank_name or not bank_name.strip() or bank_name.strip().upper() in ("N/A", "NONE"):
        return False, "Missing or invalid bank name"

    if not bank_account or not bank_account.strip() or bank_account.strip() in ("000000000", "00000000", "N/A", "NONE"):
        return False, "Missing or invalid bank account number"

    cleaned_acc = re.sub(r"[\s\-]", "", bank_account.strip())
    if len(cleaned_acc) < 5 or not cleaned_acc.isalnum():
        return False, f"Bank account number '{bank_account}' fails format criteria"

    return True, None


def mask_sensitive_account(account_str: str) -> str:
    """
    Masks bank account or phone number for safe audit logging.
    e.g., '1234567890' -> '****7890'
    """
    if not account_str or len(account_str) < 4:
        return "****"
    return "*" * (len(account_str) - 4) + account_str[-4:]


def build_payment_schedules_and_reconciliation(db: Session, period_id: int) -> Dict[str, Any]:
    """
    Core Payment Routing & Financial Reconciliation Engine.
    Filters strictly by period_id, validates payment details, routes Bank vs M-Pesa,
    detects duplicates, and calculates complete net pay reconciliation.
    """
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise ValueError(f"Payroll period #{period_id} not found")

    records = db.query(PayrollRecord).filter(
        PayrollRecord.payroll_period_id == period_id
    ).all()

    bank_items: List[Dict[str, Any]] = []
    mpesa_items: List[Dict[str, Any]] = []
    unrouted_items: List[Dict[str, Any]] = []
    duplicate_warnings: List[Dict[str, Any]] = []

    seen_bank_accounts: Dict[str, str] = {}  # bank_account -> guard_id/name
    seen_mpesa_phones: Dict[str, str] = {}   # phone -> guard_id/name

    total_payroll_net_pay = sum(round(rec.net_pay, 2) for rec in records)

    for rec in records:
        net_pay = round(rec.net_pay, 2)
        guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()

        if not guard:
            unrouted_items.append({
                "payroll_record_id": rec.id,
                "guard_id": rec.guard_id,
                "employee_number": f"CS-{rec.guard_id:05d}",
                "guard_name": "Unknown Guard Record",
                "net_pay": net_pay,
                "reason": "GUARD_RECORD_MISSING",
                "payment_method": "UNKNOWN"
            })
            continue

        payment_method = (guard.payment_method or "").strip()

        if payment_method == "Bank Transfer":
            is_valid, err_msg = validate_bank_details(guard.bank_name, guard.bank_account)
            if is_valid:
                bank_acc_clean = guard.bank_account.strip()
                # Check duplicate account
                if bank_acc_clean in seen_bank_accounts:
                    duplicate_warnings.append({
                        "type": "DUPLICATE_BANK_ACCOUNT",
                        "account": mask_sensitive_account(bank_acc_clean),
                        "guard_1": seen_bank_accounts[bank_acc_clean],
                        "guard_2": f"{guard.full_name} ({guard.employee_number})"
                    })
                else:
                    seen_bank_accounts[bank_acc_clean] = f"{guard.full_name} ({guard.employee_number})"

                bank_items.append({
                    "payroll_record_id": rec.id,
                    "guard_id": guard.id,
                    "employee_number": guard.employee_number,
                    "guard_name": guard.full_name,
                    "bank_name": guard.bank_name.strip(),
                    "bank_account": bank_acc_clean,
                    "amount": net_pay,
                    "reference_number": f"SAL-{period.year}{period.month:02d}-{guard.employee_number}",
                    "status": "READY"
                })
            else:
                unrouted_items.append({
                    "payroll_record_id": rec.id,
                    "guard_id": guard.id,
                    "employee_number": guard.employee_number,
                    "guard_name": guard.full_name,
                    "net_pay": net_pay,
                    "reason": err_msg,
                    "payment_method": "Bank Transfer"
                })

        elif payment_method == "M-Pesa":
            phone_to_check = guard.mpesa_number or guard.phone
            is_valid, clean_phone, err_msg = validate_kenyan_phone(phone_to_check)
            if is_valid:
                # Check duplicate phone
                if clean_phone in seen_mpesa_phones:
                    duplicate_warnings.append({
                        "type": "DUPLICATE_MPESA_PHONE",
                        "phone": clean_phone,
                        "guard_1": seen_mpesa_phones[clean_phone],
                        "guard_2": f"{guard.full_name} ({guard.employee_number})"
                    })
                else:
                    seen_mpesa_phones[clean_phone] = f"{guard.full_name} ({guard.employee_number})"

                mpesa_items.append({
                    "payroll_record_id": rec.id,
                    "guard_id": guard.id,
                    "employee_number": guard.employee_number,
                    "guard_name": guard.full_name,
                    "mpesa_number": clean_phone,
                    "amount": net_pay,
                    "reference_number": f"MPS-{period.year}{period.month:02d}-{guard.employee_number}",
                    "status": "READY"
                })
            else:
                unrouted_items.append({
                    "payroll_record_id": rec.id,
                    "guard_id": guard.id,
                    "employee_number": guard.employee_number,
                    "guard_name": guard.full_name,
                    "net_pay": net_pay,
                    "reason": err_msg,
                    "payment_method": "M-Pesa"
                })

        else:
            unrouted_items.append({
                "payroll_record_id": rec.id,
                "guard_id": guard.id,
                "employee_number": guard.employee_number,
                "guard_name": guard.full_name,
                "net_pay": net_pay,
                "reason": f"Unsupported or unspecified payment method: '{payment_method}'",
                "payment_method": payment_method or "UNSPECIFIED"
            })

    total_bank_amount = round(sum(item["amount"] for item in bank_items), 2)
    total_mpesa_amount = round(sum(item["amount"] for item in mpesa_items), 2)
    total_unrouted_amount = round(sum(item["net_pay"] for item in unrouted_items), 2)

    total_routed_and_unrouted = round(total_bank_amount + total_mpesa_amount + total_unrouted_amount, 2)
    discrepancy = round(total_payroll_net_pay - total_routed_and_unrouted, 2)
    is_reconciled = (discrepancy == 0.0)

    return {
        "period_id": period.id,
        "period_name": period.period_name,
        "payroll_status": period.status,
        "total_records_count": len(records),
        "bank_records_count": len(bank_items),
        "mpesa_records_count": len(mpesa_items),
        "unrouted_records_count": len(unrouted_items),
        "total_payroll_net_pay": round(total_payroll_net_pay, 2),
        "total_bank_amount": total_bank_amount,
        "total_mpesa_amount": total_mpesa_amount,
        "total_unrouted_amount": total_unrouted_amount,
        "discrepancy": discrepancy,
        "is_reconciled": is_reconciled,
        "bank_items": bank_items,
        "mpesa_items": mpesa_items,
        "unrouted_items": unrouted_items,
        "duplicate_warnings": duplicate_warnings
    }
