from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from application.backend.app.api.deps import get_db, require_admin
from application.backend.app.models.statutory import (
    StatutoryNssfTier, StatutoryShif, StatutoryHousingLevy, StatutoryPayeBand, StatutoryPayeRelief
)
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.statutory import (
    CurrentStatutoryRatesResponse, NssfTierSchema, ShifRateSchema, HousingLevySchema,
    PayeBandSchema, PayeReliefSchema, NssfTiersUpdateRequest, ShifUpdateRequest,
    HousingLevyUpdateRequest, PayeUpdateRequest, RateHistoryItem
)
from application.backend.app.services.seed_service import seed_statutory_rates

router = APIRouter(prefix="/statutory-rates", tags=["Statutory Tax Configuration"])


@router.get("", response_model=CurrentStatutoryRatesResponse)
def get_current_statutory_rates(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Fetch current active statutory tax rates and tiers for admin display."""
    ref_date = target_date or date.today()
    seed_statutory_rates(db)

    # 1. NSSF Tiers
    nssf_tiers = db.query(StatutoryNssfTier).filter(
        StatutoryNssfTier.effective_from <= ref_date,
        or_(StatutoryNssfTier.effective_to.is_(None), StatutoryNssfTier.effective_to >= ref_date),
        StatutoryNssfTier.is_active.is_(True)
    ).order_by(StatutoryNssfTier.tier_number.asc()).all()

    # 2. SHIF
    shif = db.query(StatutoryShif).filter(
        StatutoryShif.effective_from <= ref_date,
        or_(StatutoryShif.effective_to.is_(None), StatutoryShif.effective_to >= ref_date),
        StatutoryShif.is_active.is_(True)
    ).order_by(StatutoryShif.id.desc()).first()

    # 3. Housing Levy
    housing = db.query(StatutoryHousingLevy).filter(
        StatutoryHousingLevy.effective_from <= ref_date,
        or_(StatutoryHousingLevy.effective_to.is_(None), StatutoryHousingLevy.effective_to >= ref_date),
        StatutoryHousingLevy.is_active.is_(True)
    ).order_by(StatutoryHousingLevy.id.desc()).first()

    # 4. PAYE Bands
    paye_bands = db.query(StatutoryPayeBand).filter(
        StatutoryPayeBand.effective_from <= ref_date,
        or_(StatutoryPayeBand.effective_to.is_(None), StatutoryPayeBand.effective_to >= ref_date),
        StatutoryPayeBand.is_active.is_(True)
    ).order_by(StatutoryPayeBand.band_order.asc()).all()

    # 5. PAYE Relief
    paye_relief = db.query(StatutoryPayeRelief).filter(
        StatutoryPayeRelief.effective_from <= ref_date,
        or_(StatutoryPayeRelief.effective_to.is_(None), StatutoryPayeRelief.effective_to >= ref_date),
        StatutoryPayeRelief.is_active.is_(True)
    ).order_by(StatutoryPayeRelief.id.desc()).first()

    return CurrentStatutoryRatesResponse(
        nssf_tiers=nssf_tiers,
        shif=shif,
        housing_levy=housing,
        paye_bands=paye_bands,
        paye_relief=paye_relief
    )


@router.get("/history", response_model=List[RateHistoryItem])
def get_statutory_rates_history(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Fetch complete rate history across all statutory categories for audit and compliance inspection."""
    history = []

    # NSSF
    for rec in db.query(StatutoryNssfTier).order_by(StatutoryNssfTier.id.desc()).all():
        cap_str = f"up to KES {rec.upper_limit:,.2f}" if rec.upper_limit else "Uncapped"
        history.append(RateHistoryItem(
            id=rec.id,
            statutory_type="NSSF",
            title=f"NSSF {rec.tier_name}",
            details=f"Rate: {rec.rate}% | Limits: KES {rec.lower_limit:,.2f} to {cap_str}",
            effective_from=rec.effective_from,
            effective_to=rec.effective_to,
            is_active=rec.is_active and (rec.effective_to is None or rec.effective_to >= date.today()),
            change_reason=rec.change_reason,
            created_by=rec.created_by,
            created_at=rec.created_at
        ))

    # SHIF
    for rec in db.query(StatutoryShif).order_by(StatutoryShif.id.desc()).all():
        history.append(RateHistoryItem(
            id=rec.id,
            statutory_type="SHIF",
            title="SHIF Healthcare Contribution",
            details=f"Employee Rate: {rec.employee_rate}% | Statutory Floor: KES {rec.minimum_floor:,.2f}",
            effective_from=rec.effective_from,
            effective_to=rec.effective_to,
            is_active=rec.is_active and (rec.effective_to is None or rec.effective_to >= date.today()),
            change_reason=rec.change_reason,
            created_by=rec.created_by,
            created_at=rec.created_at
        ))

    # Housing Levy
    for rec in db.query(StatutoryHousingLevy).order_by(StatutoryHousingLevy.id.desc()).all():
        history.append(RateHistoryItem(
            id=rec.id,
            statutory_type="HOUSING_LEVY",
            title="Affordable Housing Levy",
            details=f"Employee Rate: {rec.employee_rate}% | Employer Rate: {rec.employer_rate}%",
            effective_from=rec.effective_from,
            effective_to=rec.effective_to,
            is_active=rec.is_active and (rec.effective_to is None or rec.effective_to >= date.today()),
            change_reason=rec.change_reason,
            created_by=rec.created_by,
            created_at=rec.created_at
        ))

    # PAYE Bands
    for rec in db.query(StatutoryPayeBand).order_by(StatutoryPayeBand.id.desc()).all():
        upper_str = f"to KES {rec.upper_limit:,.2f}" if rec.upper_limit else "and above"
        history.append(RateHistoryItem(
            id=rec.id,
            statutory_type="PAYE_BAND",
            title=f"PAYE Tax Band {rec.band_order}",
            details=f"Rate: {rec.rate}% | Income: KES {rec.lower_limit:,.2f} {upper_str}",
            effective_from=rec.effective_from,
            effective_to=rec.effective_to,
            is_active=rec.is_active and (rec.effective_to is None or rec.effective_to >= date.today()),
            change_reason=rec.change_reason,
            created_by=rec.created_by,
            created_at=rec.created_at
        ))

    # PAYE Relief
    for rec in db.query(StatutoryPayeRelief).order_by(StatutoryPayeRelief.id.desc()).all():
        history.append(RateHistoryItem(
            id=rec.id,
            statutory_type="PAYE_RELIEF",
            title="Monthly Personal Tax Relief",
            details=f"Relief Amount: KES {rec.monthly_relief:,.2f} / month",
            effective_from=rec.effective_from,
            effective_to=rec.effective_to,
            is_active=rec.is_active and (rec.effective_to is None or rec.effective_to >= date.today()),
            change_reason=rec.change_reason,
            created_by=rec.created_by,
            created_at=rec.created_at
        ))

    history.sort(key=lambda x: x.created_at, reverse=True)
    return history


@router.post("/nssf-tiers")
def update_nssf_tiers(
    payload: NssfTiersUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Add/Edit NSSF tiers with mandatory effective date versioning & audit trail."""
    close_date = payload.effective_from - timedelta(days=1)

    # Close active NSSF tiers
    active_tiers = db.query(StatutoryNssfTier).filter(
        or_(StatutoryNssfTier.effective_to.is_(None), StatutoryNssfTier.effective_to >= payload.effective_from)
    ).all()

    old_summary = ", ".join([f"{t.tier_name}: {t.rate}% (Cap: {t.upper_limit})" for t in active_tiers])
    for t in active_tiers:
        t.effective_to = close_date
        t.is_active = False

    new_tiers = []
    new_summary_list = []
    for idx, item in enumerate(payload.tiers, start=1):
        tier_obj = StatutoryNssfTier(
            tier_number=idx,
            tier_name=item.tier_name or f"Tier {idx}",
            rate=item.rate,
            lower_limit=item.lower_limit,
            upper_limit=item.upper_limit,
            effective_from=payload.effective_from,
            effective_to=None,
            is_active=True,
            change_reason=payload.change_reason,
            created_by=admin.email
        )
        new_tiers.append(tier_obj)
        cap_txt = f"{item.upper_limit}" if item.upper_limit else "Uncapped"
        new_summary_list.append(f"{tier_obj.tier_name}: {item.rate}% (Cap: {cap_txt})")

    db.add_all(new_tiers)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPDATE_STATUTORY_RATE",
        target_entity="StatutoryRate",
        target_id="NSSF",
        old_values=f"NSSF Tiers: [{old_summary}]",
        new_values=f"NSSF Tiers: [{', '.join(new_summary_list)}] (Effective {payload.effective_from})",
        reason=payload.change_reason
    )
    db.add(audit_entry)
    db.commit()

    return {"status": "SUCCESS", "message": f"Updated NSSF tiers effective from {payload.effective_from}"}


@router.post("/shif")
def update_shif_rate(
    payload: ShifUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update SHIF contribution rate and minimum floor with mandatory versioning & audit trail."""
    close_date = payload.effective_from - timedelta(days=1)

    active_shif = db.query(StatutoryShif).filter(
        or_(StatutoryShif.effective_to.is_(None), StatutoryShif.effective_to >= payload.effective_from)
    ).all()

    old_summary = ", ".join([f"{s.employee_rate}% (Floor KES {s.minimum_floor})" for s in active_shif])
    for s in active_shif:
        s.effective_to = close_date
        s.is_active = False

    new_shif = StatutoryShif(
        employee_rate=payload.employee_rate,
        minimum_floor=payload.minimum_floor,
        effective_from=payload.effective_from,
        effective_to=None,
        is_active=True,
        change_reason=payload.change_reason,
        created_by=admin.email
    )
    db.add(new_shif)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPDATE_STATUTORY_RATE",
        target_entity="StatutoryRate",
        target_id="SHIF",
        old_values=f"SHIF Rate: [{old_summary}]",
        new_values=f"SHIF Rate: {payload.employee_rate}% (Floor KES {payload.minimum_floor}) (Effective {payload.effective_from})",
        reason=payload.change_reason
    )
    db.add(audit_entry)
    db.commit()

    return {"status": "SUCCESS", "message": f"Updated SHIF rate to {payload.employee_rate}% effective from {payload.effective_from}"}


@router.post("/housing-levy")
def update_housing_levy(
    payload: HousingLevyUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update Housing Levy employee & employer rates with mandatory versioning & audit trail."""
    close_date = payload.effective_from - timedelta(days=1)

    active_housing = db.query(StatutoryHousingLevy).filter(
        or_(StatutoryHousingLevy.effective_to.is_(None), StatutoryHousingLevy.effective_to >= payload.effective_from)
    ).all()

    old_summary = ", ".join([f"Emp: {h.employee_rate}%, Empr: {h.employer_rate}%" for h in active_housing])
    for h in active_housing:
        h.effective_to = close_date
        h.is_active = False

    new_housing = StatutoryHousingLevy(
        employee_rate=payload.employee_rate,
        employer_rate=payload.employer_rate,
        effective_from=payload.effective_from,
        effective_to=None,
        is_active=True,
        change_reason=payload.change_reason,
        created_by=admin.email
    )
    db.add(new_housing)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPDATE_STATUTORY_RATE",
        target_entity="StatutoryRate",
        target_id="HOUSING_LEVY",
        old_values=f"Housing Levy: [{old_summary}]",
        new_values=f"Housing Levy: Employee {payload.employee_rate}%, Employer {payload.employer_rate}% (Effective {payload.effective_from})",
        reason=payload.change_reason
    )
    db.add(audit_entry)
    db.commit()

    return {"status": "SUCCESS", "message": f"Updated Housing Levy effective from {payload.effective_from}"}


@router.post("/paye")
def update_paye_bands_and_relief(
    payload: PayeUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update PAYE tax bands and personal relief with mandatory versioning & audit trail."""
    close_date = payload.effective_from - timedelta(days=1)

    # 1. Close PAYE Bands
    active_bands = db.query(StatutoryPayeBand).filter(
        or_(StatutoryPayeBand.effective_to.is_(None), StatutoryPayeBand.effective_to >= payload.effective_from)
    ).all()
    for b in active_bands:
        b.effective_to = close_date
        b.is_active = False

    # 2. Close PAYE Relief
    active_reliefs = db.query(StatutoryPayeRelief).filter(
        or_(StatutoryPayeRelief.effective_to.is_(None), StatutoryPayeRelief.effective_to >= payload.effective_from)
    ).all()
    for r in active_reliefs:
        r.effective_to = close_date
        r.is_active = False

    # Insert new bands
    new_bands = []
    band_summary = []
    for idx, item in enumerate(payload.bands, start=1):
        band_obj = StatutoryPayeBand(
            band_order=idx,
            lower_limit=item.lower_limit,
            upper_limit=item.upper_limit,
            rate=item.rate,
            effective_from=payload.effective_from,
            effective_to=None,
            is_active=True,
            change_reason=payload.change_reason,
            created_by=admin.email
        )
        new_bands.append(band_obj)
        upper_txt = f"{item.upper_limit}" if item.upper_limit else "Above"
        band_summary.append(f"Band {idx} ({item.lower_limit}-{upper_txt}): {item.rate}%")

    db.add_all(new_bands)

    # Insert new relief
    new_relief = StatutoryPayeRelief(
        monthly_relief=payload.monthly_relief,
        effective_from=payload.effective_from,
        effective_to=None,
        is_active=True,
        change_reason=payload.change_reason,
        created_by=admin.email
    )
    db.add(new_relief)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPDATE_STATUTORY_RATE",
        target_entity="StatutoryRate",
        target_id="PAYE",
        new_values=f"PAYE Bands: [{'; '.join(band_summary)}]; Relief: KES {payload.monthly_relief} (Effective {payload.effective_from})",
        reason=payload.change_reason
    )
    db.add(audit_entry)
    db.commit()

    return {"status": "SUCCESS", "message": f"Updated PAYE tax bands & relief effective from {payload.effective_from}"}
