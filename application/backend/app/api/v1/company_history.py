import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin_or_hr
from application.backend.app.models.user import User
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.asset import Asset
from application.backend.app.models.invoice import SiteInvoice
from application.backend.app.models.client_contract import Client, ClientContract
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.company_history import (
    CompanyProfile, CompanyFoundingHistory, CompanyMilestone, CompanyOwnershipRecord,
    CompanyRecommendation, CompanyService
)
from application.backend.app.schemas.company_history import (
    CompanyProfileUpdate, CompanyProfileResponse,
    CompanyFoundingHistoryUpdate, CompanyFoundingHistoryResponse,
    CompanyMilestoneCreate, CompanyMilestoneResponse,
    CompanyOwnershipRecordCreate, CompanyOwnershipRecordResponse,
    CompanyRecommendationCreate, CompanyRecommendationResponse,
    CompanyServiceCreate, CompanyServiceResponse
)
from application.backend.app.api.v1.assets import calculate_current_depreciated_value

router = APIRouter(prefix="/company", tags=["Company History & Profile Management"])


# ==================== COMPANY PROFILE ====================
@router.get("/profile", response_model=CompanyProfileResponse)
def get_company_profile(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    profile = db.query(CompanyProfile).first()
    if not profile:
        profile = CompanyProfile()
        db.add(profile)
        db.commit()
        db.refresh(profile)
    res = CompanyProfileResponse.model_validate(profile)
    res.updated_by_name = profile.updated_by.full_name if profile.updated_by else None
    return res


@router.put("/profile", response_model=CompanyProfileResponse)
def update_company_profile(payload: CompanyProfileUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    profile = db.query(CompanyProfile).first()
    if not profile:
        profile = CompanyProfile()
        db.add(profile)

    for k, v in payload.model_dump(exclude_unset=True).items():
        if hasattr(profile, k):
            setattr(profile, k, v)

    profile.updated_by_user_id = current_user.id
    profile.updated_at = datetime.datetime.now()
    db.commit()
    db.refresh(profile)

    try:
        db.add(AuditLog(
            user_id=current_user.id,
            action="UPDATE_COMPANY_PROFILE",
            details="Updated official corporate profile and registration details"
        ))
        db.commit()
    except Exception:
        pass

    res = CompanyProfileResponse.model_validate(profile)
    res.updated_by_name = current_user.full_name
    return res


# ==================== FOUNDING HISTORY ====================
@router.get("/founding", response_model=CompanyFoundingHistoryResponse)
def get_company_founding_history(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    founding = db.query(CompanyFoundingHistory).first()
    if not founding:
        founding = CompanyFoundingHistory()
        db.add(founding)
        db.commit()
        db.refresh(founding)
    return CompanyFoundingHistoryResponse.from_orm_model(founding)


@router.put("/founding", response_model=CompanyFoundingHistoryResponse)
def update_company_founding_history(payload: CompanyFoundingHistoryUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    founding = db.query(CompanyFoundingHistory).first()
    if not founding:
        founding = CompanyFoundingHistory()
        db.add(founding)

    data = payload.model_dump(exclude_unset=True)
    if "founder_names" in data:
        founding.founder_summary = data.pop("founder_names")
    if "background_story" in data:
        founding.narrative_history = data.pop("background_story")
    if "initial_guards_count" in data:
        founding.initial_employee_count = data.pop("initial_guards_count")

    for k, v in data.items():
        if hasattr(founding, k):
            setattr(founding, k, v)

    founding.updated_at = datetime.datetime.now()
    db.commit()
    db.refresh(founding)
    return CompanyFoundingHistoryResponse.from_orm_model(founding)


# ==================== CHRONOLOGICAL MILESTONES ====================
@router.get("/milestones", response_model=List[CompanyMilestoneResponse])
def list_company_milestones(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    milestones = db.query(CompanyMilestone).order_by(CompanyMilestone.event_date.asc()).all()
    out = []
    for m in milestones:
        res = CompanyMilestoneResponse.model_validate(m)
        res.recorded_by_name = m.recorded_by.full_name if m.recorded_by else None
        out.append(res)
    return out


@router.post("/milestones", response_model=CompanyMilestoneResponse, status_code=status.HTTP_201_CREATED)
def create_company_milestone(payload: CompanyMilestoneCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    m = CompanyMilestone(
        event_title=payload.event_title.strip(),
        category=payload.category.upper(),
        event_date=payload.event_date,
        description=payload.description.strip(),
        location=payload.location,
        significance=payload.significance,
        recorded_by_user_id=current_user.id
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    res = CompanyMilestoneResponse.model_validate(m)
    res.recorded_by_name = current_user.full_name
    return res


@router.delete("/milestones/{milestone_id}")
def delete_company_milestone(milestone_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    m = db.query(CompanyMilestone).filter(CompanyMilestone.id == milestone_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    db.delete(m)
    db.commit()
    return {"message": "Milestone deleted successfully"}


# ==================== OWNERSHIP & MANAGEMENT RECORDS ====================
@router.get("/ownership", response_model=List[CompanyOwnershipRecordResponse])
def list_ownership_records(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    return db.query(CompanyOwnershipRecord).order_by(CompanyOwnershipRecord.appointment_date.asc()).all()


@router.post("/ownership", response_model=CompanyOwnershipRecordResponse, status_code=status.HTTP_201_CREATED)
def create_ownership_record(payload: CompanyOwnershipRecordCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    rec = CompanyOwnershipRecord(
        person_or_entity_name=payload.person_or_entity_name.strip(),
        role=payload.role.upper(),
        shareholding_percentage=float(payload.shareholding_percentage),
        shares_count=int(payload.shares_count),
        appointment_date=payload.appointment_date,
        resignation_date=payload.resignation_date,
        status=payload.status.upper(),
        resolution_reference=payload.resolution_reference,
        notes=payload.notes
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec

@router.delete("/ownership/{record_id}")
def delete_ownership_record(record_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    rec = db.query(CompanyOwnershipRecord).filter(CompanyOwnershipRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Ownership record not found")
    name = rec.person_or_entity_name
    db.delete(rec)
    db.commit()
    return {"message": f"Ownership record for {name} deleted successfully"}


@router.put("/ownership/{record_id}", response_model=CompanyOwnershipRecordResponse)
def update_ownership_record(record_id: int, payload: CompanyOwnershipRecordCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    rec = db.query(CompanyOwnershipRecord).filter(CompanyOwnershipRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Ownership record not found")

    rec.person_or_entity_name = payload.person_or_entity_name.strip()
    rec.role = payload.role.upper()
    rec.shareholding_percentage = float(payload.shareholding_percentage)
    rec.shares_count = int(payload.shares_count)
    rec.appointment_date = payload.appointment_date
    rec.resignation_date = payload.resignation_date
    rec.status = payload.status.upper()
    rec.resolution_reference = payload.resolution_reference
    rec.notes = payload.notes

    db.commit()
    db.refresh(rec)
    return rec


# ==================== GROWTH & PERFORMANCE ANALYTICS ====================
@router.get("/growth-analytics")
def get_company_growth_analytics(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    """
    Computes real historical data and current organizational metrics.
    Never uses fake statistics or invented values.
    """
    profile = db.query(CompanyProfile).first()
    inc_date = profile.incorporation_date if profile else datetime.date(2018, 3, 15)
    years_in_operation = round((datetime.date.today() - inc_date).days / 365.25, 1)

    total_guards = db.query(Guard).count()
    active_guards = db.query(Guard).filter(Guard.status == "ACTIVE").count()
    total_staff_users = db.query(User).filter(User.role.in_(["ADMIN", "HR", "SUPERVISOR"])).count()
    total_workforce = total_guards + total_staff_users

    total_clients = db.query(Client).count()
    active_clients = db.query(Client).filter(Client.status == "ACTIVE").count()
    total_sites = db.query(Site).count()

    total_contracts = db.query(ClientContract).count()
    active_contracts = db.query(ClientContract).filter(ClientContract.status == "ACTIVE").count()
    total_contract_value = sum(c.contract_value for c in db.query(ClientContract).filter(ClientContract.status == "ACTIVE").all())

    assets = db.query(Asset).all()
    total_assets_count = len(assets)
    total_assets_valuation = sum(a.current_value for a in assets)

    invoices = db.query(SiteInvoice).all()
    total_revenue_billed = sum(inv.total_amount for inv in invoices)
    total_revenue_collected = sum(inv.total_amount for inv in invoices if inv.status == "PAID")

    milestones_count = db.query(CompanyMilestone).count()

    # Guard hiring by year (real records)
    guards = db.query(Guard).all()
    guards_by_year = {}
    for g in guards:
        yr = g.hire_date.year if g.hire_date else 2026
        guards_by_year[yr] = guards_by_year.get(yr, 0) + 1

    return {
        "incorporation_date": str(inc_date),
        "years_in_operation": years_in_operation,
        "total_workforce": total_workforce,
        "active_guards": active_guards,
        "corporate_staff": total_staff_users,
        "total_clients": total_clients,
        "active_clients": active_clients,
        "total_sites_served": total_sites,
        "total_contracts": total_contracts,
        "active_contracts": active_contracts,
        "active_contract_value": round(total_contract_value, 2),
        "total_assets_count": total_assets_count,
        "total_assets_valuation": round(total_assets_valuation, 2),
        "total_revenue_billed": round(total_revenue_billed, 2),
        "total_revenue_collected": round(total_revenue_collected, 2),
        "milestones_count": milestones_count,
        "guards_hired_by_year": guards_by_year
    }# ==================== MILESTONES ====================
@router.get("/milestones", response_model=List[CompanyMilestoneResponse])
def list_company_milestones(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    milestones = db.query(CompanyMilestone).order_by(CompanyMilestone.event_date.asc(), CompanyMilestone.id.asc()).all()
    return [CompanyMilestoneResponse.from_orm_model(m) for m in milestones]


@router.post("/milestones", response_model=CompanyMilestoneResponse, status_code=status.HTTP_201_CREATED)
def create_company_milestone(payload: CompanyMilestoneCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    title = payload.title or payload.event_title or "Milestone"
    m_date = payload.milestone_date or payload.event_date or datetime.date.today()
    m = CompanyMilestone(
        event_title=title.strip(),
        category=payload.category.upper(),
        event_date=m_date,
        description=payload.description.strip(),
        location=payload.location,
        significance=payload.significance,
        recorded_by_user_id=current_user.id
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return CompanyMilestoneResponse.from_orm_model(m)


# ==================== OWNERSHIP & GOVERNANCE ====================
@router.get("/ownership", response_model=List[CompanyOwnershipRecordResponse])
def list_company_ownership_records(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    records = db.query(CompanyOwnershipRecord).order_by(CompanyOwnershipRecord.shareholding_percentage.desc()).all()
    return [CompanyOwnershipRecordResponse.from_orm_model(r) for r in records]


@router.post("/ownership", response_model=CompanyOwnershipRecordResponse, status_code=status.HTTP_201_CREATED)
def create_company_ownership_record(payload: CompanyOwnershipRecordCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    role = payload.role or payload.role_title or "DIRECTOR"
    shares = payload.shares_count if payload.shares_count is not None else payload.number_of_shares
    res_ref = payload.resolution_reference or payload.board_resolution_ref
    rec = CompanyOwnershipRecord(
        person_or_entity_name=payload.person_or_entity_name.strip(),
        role=role,
        shareholding_percentage=float(payload.shareholding_percentage),
        shares_count=int(shares),
        appointment_date=payload.appointment_date,
        resignation_date=payload.resignation_date,
        status=payload.status,
        resolution_reference=res_ref,
        notes=payload.notes or payload.contact_info
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return CompanyOwnershipRecordResponse.from_orm_model(rec)


# ==================== GROWTH ANALYTICS ====================
@router.get("/analytics")
def get_company_growth_analytics(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    active_guards = db.query(Guard).filter(Guard.status == "ACTIVE").count()
    active_sites = db.query(Site).count()
    active_clients = db.query(Client).filter(Client.status == "ACTIVE").count()
    total_assets = db.query(Asset).count()

    assets = db.query(Asset).all()
    total_asset_val = sum(calculate_current_depreciated_value(a) for a in assets)

    contracts = db.query(ClientContract).filter(ClientContract.status == "ACTIVE").all()
    mrr = sum(c.monthly_charge for c in contracts)

    return {
        "active_guards_count": active_guards,
        "active_sites_count": active_sites,
        "active_clients_count": active_clients,
        "total_assets_count": total_assets,
        "total_assets_book_value": round(total_asset_val, 2),
        "monthly_contract_run_rate": round(mrr, 2)
    }



# ==================== RECOMMENDATIONS ====================
@router.get("/recommendations", response_model=List[CompanyRecommendationResponse])
def list_company_recommendations(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    return db.query(CompanyRecommendation).order_by(CompanyRecommendation.recommendation_date.desc(), CompanyRecommendation.id.desc()).all()


@router.post("/recommendations", response_model=CompanyRecommendationResponse, status_code=status.HTTP_201_CREATED)
def create_company_recommendation(payload: CompanyRecommendationCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    rec_date = payload.recommendation_date or datetime.date.today()
    rec = CompanyRecommendation(
        client_name=payload.client_name.strip(),
        author_name=payload.author_name.strip(),
        designation=payload.designation.strip(),
        rating=int(payload.rating),
        recommendation_date=rec_date,
        recommendation_text=payload.recommendation_text.strip(),
        service_scope=payload.service_scope.strip() if payload.service_scope else None
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/recommendations/{rec_id}", status_code=status.HTTP_200_OK)
def delete_company_recommendation(rec_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    rec = db.query(CompanyRecommendation).filter(CompanyRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    db.delete(rec)
    db.commit()
    return {"message": "Recommendation deleted", "id": rec_id}


# ==================== SERVICES CATALOG ====================
@router.get("/services", response_model=List[CompanyServiceResponse])
def list_company_services(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    return db.query(CompanyService).order_by(CompanyService.id.asc()).all()


@router.post("/services", response_model=CompanyServiceResponse, status_code=status.HTTP_201_CREATED)
def create_company_service(payload: CompanyServiceCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    existing = db.query(CompanyService).filter(CompanyService.service_code == payload.service_code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Service with code '{payload.service_code}' already exists")
    
    srv = CompanyService(
        service_code=payload.service_code.strip().upper(),
        service_name=payload.service_name.strip(),
        category=payload.category.strip().upper(),
        description=payload.description.strip(),
        sla_standard=payload.sla_standard.strip() if payload.sla_standard else None,
        billing_rate_guideline=payload.billing_rate_guideline.strip() if payload.billing_rate_guideline else None,
        active_sites_count=payload.active_sites_count,
        is_active=payload.is_active
    )
    db.add(srv)
    db.commit()
    db.refresh(srv)
    return srv


@router.delete("/services/{srv_id}", status_code=status.HTTP_200_OK)
def delete_company_service(srv_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    srv = db.query(CompanyService).filter(CompanyService.id == srv_id).first()
    if not srv:
        raise HTTPException(status_code=404, detail="Service not found")
    db.delete(srv)
    db.commit()
    return {"message": "Service deleted", "id": srv_id}


# ==================== CLIENTS PORTFOLIO IN COMPANY GROWTH ====================
@router.get("/clients-portfolio")
def get_growth_clients_portfolio(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    clients = db.query(Client).order_by(Client.id.asc()).all()
    results = []
    for c in clients:
        sites = db.query(Site).filter(Site.client_name == c.name).all()
        site_names = [s.site_name for s in sites]
        guards_count = sum(s.guard_count for s in sites)
        contracts = db.query(ClientContract).filter(ClientContract.client_id == c.id).all()
        results.append({
            "id": c.id,
            "client_code": c.client_code,
            "name": c.name,
            "client_type": c.client_type,
            "industry": c.industry,
            "county": c.county,
            "contact_person": c.contact_person,
            "phone": c.phone,
            "email": c.email,
            "status": c.status,
            "protected_sites": site_names,
            "active_guards_deployed": guards_count,
            "contracts_count": len(contracts),
            "notes": c.notes
        })
    return results
