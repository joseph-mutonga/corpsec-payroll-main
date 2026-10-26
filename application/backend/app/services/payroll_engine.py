from typing import Dict, Any, List, Optional
import datetime
from sqlalchemy import or_
from sqlalchemy.orm import Session

from application.backend.app.models.statutory import (
    StatutoryNssfTier, StatutoryShif, StatutoryHousingLevy, StatutoryPayeBand, StatutoryPayeRelief
)


def get_active_statutory_rates(db: Session, target_date: datetime.date) -> Dict[str, Any]:
    """
    Fetches the active statutory rate records for a given date from the versioned database tables.
    """
    nssf_tiers = db.query(StatutoryNssfTier).filter(
        StatutoryNssfTier.effective_from <= target_date,
        or_(StatutoryNssfTier.effective_to.is_(None), StatutoryNssfTier.effective_to >= target_date),
        StatutoryNssfTier.is_active.is_(True)
    ).order_by(StatutoryNssfTier.tier_number.asc()).all()

    shif = db.query(StatutoryShif).filter(
        StatutoryShif.effective_from <= target_date,
        or_(StatutoryShif.effective_to.is_(None), StatutoryShif.effective_to >= target_date),
        StatutoryShif.is_active.is_(True)
    ).order_by(StatutoryShif.id.desc()).first()

    housing = db.query(StatutoryHousingLevy).filter(
        StatutoryHousingLevy.effective_from <= target_date,
        or_(StatutoryHousingLevy.effective_to.is_(None), StatutoryHousingLevy.effective_to >= target_date),
        StatutoryHousingLevy.is_active.is_(True)
    ).order_by(StatutoryHousingLevy.id.desc()).first()

    paye_bands = db.query(StatutoryPayeBand).filter(
        StatutoryPayeBand.effective_from <= target_date,
        or_(StatutoryPayeBand.effective_to.is_(None), StatutoryPayeBand.effective_to >= target_date),
        StatutoryPayeBand.is_active.is_(True)
    ).order_by(StatutoryPayeBand.band_order.asc()).all()

    paye_relief = db.query(StatutoryPayeRelief).filter(
        StatutoryPayeRelief.effective_from <= target_date,
        or_(StatutoryPayeRelief.effective_to.is_(None), StatutoryPayeRelief.effective_to >= target_date),
        StatutoryPayeRelief.is_active.is_(True)
    ).order_by(StatutoryPayeRelief.id.desc()).first()

    return {
        "nssf_tiers": nssf_tiers,
        "shif": shif,
        "housing": housing,
        "paye_bands": paye_bands,
        "paye_relief": paye_relief
    }


def calculate_nssf(gross_pay: float, nssf_tiers: Optional[List[Any]] = None, nssf_rate: float = 0.06) -> float:
    """
    Calculates NSSF employee deduction across configured tiers.
    If no tier objects are provided, falls back to standard Tier I & Tier II evaluation capped at KES 6,480.
    """
    if gross_pay <= 0:
        return 0.0

    if not nssf_tiers:
        # Standard Fallback Tier I (first KES 9,000) & Tier II (KES 9,001 - KES 108,000)
        t1 = min(gross_pay, 9000.0) * 0.06
        t2 = max(0.0, min(gross_pay, 108000.0) - 9000.0) * 0.06 if gross_pay > 9000 else 0.0
        return round(t1 + t2, 2)

    total_nssf = 0.0
    for tier in nssf_tiers:
        raw_rate = getattr(tier, 'rate', 6.0)
        rate = raw_rate / 100.0 if raw_rate > 1.0 else raw_rate
        lower = getattr(tier, 'lower_limit', 0.0) or 0.0
        upper = getattr(tier, 'upper_limit', None)

        if gross_pay <= lower:
            continue

        if upper is not None and upper > 0:
            taxable_in_tier = min(gross_pay, upper) - lower
        else:
            taxable_in_tier = gross_pay - lower

        if taxable_in_tier > 0:
            total_nssf += taxable_in_tier * rate

    return round(total_nssf, 2)


def calculate_shif(
    gross_pay: float,
    shif_rate: float = 0.0275,
    shif_floor: float = 300.0,
    shif_obj: Optional[Any] = None
) -> float:
    """
    Calculates SHIF employee deduction (percentage of gross pay with statutory floor).
    """
    if gross_pay <= 0:
        return 0.0

    if shif_obj:
        raw_rate = getattr(shif_obj, 'employee_rate', 2.75)
        rate_decimal = raw_rate / 100.0 if raw_rate > 1.0 else raw_rate
        floor = getattr(shif_obj, 'minimum_floor', 300.0)
    else:
        rate_decimal = shif_rate / 100.0 if shif_rate > 1.0 else shif_rate
        floor = shif_floor

    calculated = gross_pay * rate_decimal
    return round(max(calculated, floor), 2)


def calculate_housing_levy(
    gross_pay: float,
    levy_rate: float = 0.015,
    housing_obj: Optional[Any] = None
) -> float:
    """
    Calculates Housing Levy employee deduction.
    """
    if gross_pay <= 0:
        return 0.0

    if housing_obj:
        raw_rate = getattr(housing_obj, 'employee_rate', 1.5)
        rate_decimal = raw_rate / 100.0 if raw_rate > 1.0 else raw_rate
    else:
        rate_decimal = levy_rate / 100.0 if levy_rate > 1.0 else levy_rate

    return round(gross_pay * rate_decimal, 2)


def calculate_paye_details(
    taxable_pay: float,
    personal_relief: float = 2400.0,
    paye_bands: Optional[List[Any]] = None,
    relief_obj: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Calculates PAYE progressive monthly tax and returns a detailed audit breakdown.
    """
    relief_val = getattr(relief_obj, 'monthly_relief', personal_relief) if relief_obj else personal_relief

    if taxable_pay <= 0:
        return {
            "taxable_pay": 0.0,
            "taxable_income": 0.0,
            "gross_tax_before_relief": 0.0,
            "tax_before_relief": 0.0,
            "bands_applied": [],
            "which_band": "None (Income <= 0)",
            "personal_relief": round(relief_val, 2),
            "personal_relief_applied": 0.0,
            "net_paye": 0.0,
            "final_paye": 0.0
        }

    bands_applied = []
    band_summary_items = []
    total_tax = 0.0
    rem_pay = taxable_pay

    if not paye_bands:
        bands_data = [
            (1, "Band 1 (10%)", 0.0, 24000.0, 0.10, "0–24,000"),
            (2, "Band 2 (25%)", 24000.0, 32333.0, 0.25, "24,001–32,333"),
            (3, "Band 3 (30%)", 32333.0, 500000.0, 0.30, "32,334–500,000"),
            (4, "Band 4 (32.5%)", 500000.0, 800000.0, 0.325, "500,001–800,000"),
            (5, "Band 5 (35%)", 800000.0, None, 0.35, "800,001+")
        ]
        for order, name, lower, upper, rate, range_str in bands_data:
            if rem_pay <= 0:
                break
            band_width = (upper - lower) if upper else rem_pay
            taxable_in_band = min(rem_pay, band_width)
            tax_in_band = taxable_in_band * rate
            total_tax += tax_in_band
            rem_pay -= taxable_in_band

            rate_pct = rate * 100
            rate_pct_str = f"{rate_pct:g}%"
            bands_applied.append({
                "band_order": order,
                "band_name": name,
                "taxable_amount": round(taxable_in_band, 2),
                "rate_percent": rate_pct,
                "tax_amount": round(tax_in_band, 2)
            })
            if len(bands_data) == 1 or (order == 1 and taxable_pay <= 24000.0):
                band_summary_items.append(f"{rate_pct_str} (first KES 24,000)")
            else:
                band_summary_items.append(f"{rate_pct_str} ({range_str})")
    else:
        for idx, band in enumerate(paye_bands, start=1):
            if rem_pay <= 0:
                break
            lower = getattr(band, 'lower_limit', 0.0) or 0.0
            upper = getattr(band, 'upper_limit', None)
            raw_rate = getattr(band, 'rate', 10.0)
            rate = raw_rate / 100.0 if raw_rate > 1.0 else raw_rate

            band_width = (upper - lower) if (upper and upper > lower) else rem_pay
            taxable_in_band = min(rem_pay, band_width)
            tax_in_band = taxable_in_band * rate
            total_tax += tax_in_band
            rem_pay -= taxable_in_band

            rate_pct = raw_rate if raw_rate > 1.0 else raw_rate * 100
            rate_pct_str = f"{rate_pct:g}%"
            bands_applied.append({
                "band_order": getattr(band, 'band_order', idx),
                "band_name": f"Band {getattr(band, 'band_order', idx)} ({rate_pct_str})",
                "taxable_amount": round(taxable_in_band, 2),
                "rate_percent": rate_pct,
                "tax_amount": round(tax_in_band, 2)
            })

            if upper:
                range_str = f"{lower:g}–{upper:g}"
            else:
                range_str = f"{lower:g}+"
            band_summary_items.append(f"{rate_pct_str} ({range_str})")

    which_band_str = " + ".join(band_summary_items) if band_summary_items else "N/A"
    total_tax = round(total_tax, 2)
    personal_relief_applied = round(min(total_tax, relief_val), 2)
    final_paye = round(max(0.0, total_tax - relief_val), 2)

    return {
        "taxable_pay": round(taxable_pay, 2),
        "taxable_income": round(taxable_pay, 2),
        "gross_tax_before_relief": total_tax,
        "tax_before_relief": total_tax,
        "bands_applied": bands_applied,
        "which_band": which_band_str,
        "personal_relief": round(relief_val, 2),
        "personal_relief_applied": personal_relief_applied,
        "net_paye": final_paye,
        "final_paye": final_paye
    }


def calculate_paye(
    taxable_pay: float,
    personal_relief: float = 2400.0,
    paye_bands: Optional[List[Any]] = None,
    relief_obj: Optional[Any] = None
) -> float:
    """
    Calculates PAYE progressive monthly tax.
    """
    details = calculate_paye_details(taxable_pay, personal_relief, paye_bands, relief_obj)
    return details["net_paye"]


def calculate_guard_payroll(
    daily_rate: float = 1200.0,
    regular_hours: float = 0.0,
    overtime_hours: float = 0.0,
    basic_salary: float = 0.0,
    days_worked: float = 0.0,
    allowances: float = 0.0,
    night_shifts_count: int = 0,
    night_allowance_rate: float = 200.0,
    transport_allowance: float = 0.0,
    housing_allowance: float = 0.0,
    other_allowances: float = 0.0,
    other_deductions: float = 0.0,
    reliever_earnings: float = 0.0,
    proration_factor: float = 1.0,
    nssf_rate: float = 0.06,
    shif_rate: float = 0.0275,
    shif_floor: float = 300.0,
    housing_levy_rate: float = 0.015,
    personal_relief: float = 2400.0,
    db: Optional[Session] = None,
    target_date: Optional[datetime.date] = None
) -> Dict[str, Any]:
    """
    Computes complete gross-to-net pay breakdown for a guard in a pay period,
    supporting mid-month hire/exit calendar proration factor.
    """
    if days_worked > 0 and regular_hours == 0.0:
        regular_hours = days_worked * 12.0

    if basic_salary > 0:
        hourly_rate = basic_salary / 26.0 / 12.0
    else:
        hourly_rate = daily_rate / 8.0 if daily_rate > 0 else 0.0
    
    if basic_salary > 0:
        basic_pay = round(basic_salary * proration_factor, 2)
    else:
        basic_pay = round(regular_hours * hourly_rate * proration_factor, 2)
        
    overtime_pay = round(overtime_hours * hourly_rate * 1.5, 2)
    
    total_allowances = round(
        (allowances * proration_factor) +
        (night_shifts_count * night_allowance_rate) +
        transport_allowance +
        housing_allowance +
        other_allowances,
        2
    )

    gross_pay = round(basic_pay + overtime_pay + total_allowances + reliever_earnings, 2)

    if gross_pay <= 0:
        return {
            "basic_pay": 0.0,
            "overtime_pay": 0.0,
            "allowances": 0.0,
            "gross_pay": 0.0,
            "nssf_deduction": 0.0,
            "nssf": 0.0,
            "shif_deduction": 0.0,
            "shif": 0.0,
            "housing_levy_deduction": 0.0,
            "housing_levy": 0.0,
            "paye_deduction": 0.0,
            "paye": 0.0,
            "other_deductions": 0.0,
            "total_deductions": 0.0,
            "net_pay": 0.0,
            "employer_nssf": 0.0,
            "employer_housing_levy": 0.0,
            "total_employer_statutory": 0.0,
            "paye_breakdown": {
                "taxable_pay": 0.0,
                "gross_tax_before_relief": 0.0,
                "bands_applied": [],
                "personal_relief": 2400.0,
                "net_paye": 0.0
            }
        }

    stat_rates = None
    if db and target_date:
        stat_rates = get_active_statutory_rates(db, target_date)

    if stat_rates:
        nssf_ded = calculate_nssf(gross_pay, nssf_tiers=stat_rates["nssf_tiers"])
        shif_ded = calculate_shif(gross_pay, shif_obj=stat_rates["shif"])
        housing_levy_ded = calculate_housing_levy(gross_pay, housing_obj=stat_rates["housing"])
        taxable_pay = max(0.0, gross_pay - nssf_ded)
        paye_details = calculate_paye_details(taxable_pay, paye_bands=stat_rates["paye_bands"], relief_obj=stat_rates["paye_relief"])
    else:
        nssf_ded = calculate_nssf(gross_pay, nssf_rate=nssf_rate)
        shif_ded = calculate_shif(gross_pay, shif_rate=shif_rate, shif_floor=shif_floor)
        housing_levy_ded = calculate_housing_levy(gross_pay, levy_rate=housing_levy_rate)
        taxable_pay = max(0.0, gross_pay - nssf_ded)
        paye_details = calculate_paye_details(taxable_pay, personal_relief=personal_relief)

    paye_ded = paye_details["net_paye"]
    total_deductions = round(nssf_ded + shif_ded + housing_levy_ded + paye_ded + other_deductions, 2)
    net_pay = round(max(0.0, gross_pay - total_deductions), 2)

    # Employer-side matching statutory liabilities
    employer_nssf = nssf_ded  # 1:1 match with employee NSSF
    employer_housing_levy = housing_levy_ded  # 1.5% employer match with employee Housing Levy
    total_employer_statutory = round(employer_nssf + employer_housing_levy, 2)

    return {
        "basic_pay": basic_pay,
        "overtime_pay": overtime_pay,
        "allowances": total_allowances,
        "gross_pay": gross_pay,
        "nssf_deduction": nssf_ded,
        "nssf": nssf_ded,
        "shif_deduction": shif_ded,
        "shif": shif_ded,
        "housing_levy_deduction": housing_levy_ded,
        "housing_levy": housing_levy_ded,
        "paye_deduction": paye_ded,
        "paye": paye_ded,
        "other_deductions": round(other_deductions, 2),
        "total_deductions": total_deductions,
        "net_pay": net_pay,
        "employer_nssf": employer_nssf,
        "employer_housing_levy": employer_housing_levy,
        "total_employer_statutory": total_employer_statutory,
        "paye_breakdown": paye_details
    }
