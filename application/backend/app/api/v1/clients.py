import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin_or_hr
from application.backend.app.models.user import User
from application.backend.app.models.site import Site
from application.backend.app.models.guard import Guard
from application.backend.app.models.invoice import SiteInvoice
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.client_contract import Client, ClientContract, ContractDeployment
from application.backend.app.schemas.client_contract import (
    ClientCreate, ClientUpdate, ClientResponse,
    ClientContractCreate, ClientContractUpdate, ClientContractResponse,
    ContractRenewalRequest, ContractDeploymentCreate, ContractDeploymentResponse
)

router = APIRouter(prefix="/clients", tags=["Clients & Contract Management"])


def generate_next_client_code(db: Session) -> str:
    prefix = "CLT-"
    last_clt = db.query(Client).order_by(Client.id.desc()).first()
    if last_clt and last_clt.client_code:
        try:
            num = int(last_clt.client_code.replace(prefix, "")) + 1
        except Exception:
            num = 1
    else:
        num = 1
    return f"{prefix}{num:04d}"


def generate_next_contract_ref(db: Session) -> str:
    year = datetime.date.today().year
    prefix = f"CTR-{year}-"
    last_ctr = db.query(ClientContract).filter(ClientContract.contract_ref.like(f"{prefix}%")).order_by(ClientContract.id.desc()).first()
    if last_ctr and last_ctr.contract_ref:
        try:
            num = int(last_ctr.contract_ref.split("-")[-1]) + 1
        except Exception:
            num = 1
    else:
        num = 1
    return f"{prefix}{num:04d}"


# ==================== CLIENTS ====================
@router.get("", response_model=List[ClientResponse])
@router.get("/", response_model=List[ClientResponse])
def list_clients(
    status_filter: Optional[str] = Query(None, alias="status"),
    client_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    query = db.query(Client)
    if status_filter and status_filter.strip() and status_filter.upper() != "ALL":
        query = query.filter(Client.status == status_filter.strip().upper())
    if client_type and client_type.strip() and client_type != "ALL":
        query = query.filter(Client.client_type == client_type.strip().upper())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (Client.name.ilike(term)) |
            (Client.client_code.ilike(term)) |
            (Client.contact_person.ilike(term)) |
            (Client.phone.ilike(term)) |
            (Client.email.ilike(term)) |
            (Client.physical_address.ilike(term))
        )

    clients = query.order_by(Client.name.asc()).all()
    out = []
    for c in clients:
        res = ClientResponse.model_validate(c)
        res.active_contracts_count = sum(1 for ctr in c.contracts if ctr.status == "ACTIVE")
        # Estimate total guards deployed via matching sites
        sites = db.query(Site).filter(Site.client_name == c.name).all()
        guards_cnt = 0
        for s in sites:
            guards_cnt += db.query(Guard).filter(Guard.primary_site_id == s.id, Guard.status == "ACTIVE").count()
        res.total_guards_deployed = guards_cnt
        out.append(res)
    return out


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(payload: ClientCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    code = payload.client_code or generate_next_client_code(db)
    existing = db.query(Client).filter(
        (Client.client_code == code) | (Client.name == payload.name.strip())
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Client code or client name already registered")

    client = Client(
        client_code=code,
        name=payload.name.strip(),
        business_registration_no=payload.business_registration_no,
        kra_pin=payload.kra_pin,
        client_type=payload.client_type.upper(),
        industry=payload.industry,
        physical_address=payload.physical_address.strip(),
        postal_address=payload.postal_address,
        county=payload.county,
        contact_person=payload.contact_person.strip(),
        designation=payload.designation,
        phone=payload.phone.strip(),
        email=payload.email.strip() if payload.email else None,
        alternative_phone=payload.alternative_phone,
        date_registered=payload.date_registered or datetime.date.today(),
        status=payload.status.upper(),
        notes=payload.notes
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    try:
        db.add(AuditLog(
            user_id=current_user.id,
            action="CREATE_CLIENT",
            details=f"Registered client {client.client_code} - {client.name}"
        ))
        db.commit()
    except Exception:
        pass

    return ClientResponse.model_validate(client)


@router.get("/summary/kpis")
def get_clients_kpi_summary(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    clients = db.query(Client).all()
    total_clients = len(clients)
    active_clients = sum(1 for c in clients if c.status == "ACTIVE")
    
    contracts = db.query(ClientContract).all()
    active_contracts = sum(1 for ctr in contracts if ctr.status == "ACTIVE")
    
    today = datetime.date.today()
    expiring_soon_threshold = today + datetime.timedelta(days=30)
    expiring_soon = sum(1 for ctr in contracts if ctr.status == "ACTIVE" and ctr.end_date <= expiring_soon_threshold)
    expired = sum(1 for ctr in contracts if ctr.end_date < today or ctr.status == "EXPIRED")
    
    total_contract_value = sum(ctr.contract_value for ctr in contracts if ctr.status == "ACTIVE")
    monthly_recurring_revenue = sum(ctr.monthly_charge for ctr in contracts if ctr.status == "ACTIVE")

    # Invoices financial tracking
    invoices = db.query(SiteInvoice).all()
    total_billed = sum(inv.total_amount for inv in invoices)
    total_paid = sum(inv.total_amount for inv in invoices if inv.status == "PAID")
    total_outstanding = sum(inv.total_amount for inv in invoices if inv.status not in ["PAID", "CANCELLED"])

    return {
        "total_clients": total_clients,
        "active_clients": active_clients,
        "active_contracts": active_contracts,
        "expiring_soon_contracts": expiring_soon,
        "expired_contracts": expired,
        "total_active_contract_value": round(total_contract_value, 2),
        "monthly_recurring_revenue": round(monthly_recurring_revenue, 2),
        "total_invoiced": round(total_billed, 2),
        "total_collected": round(total_paid, 2),
        "outstanding_balance": round(total_outstanding, 2)
    }


@router.get("/{client_id}/profile")
def get_client_full_profile(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    contracts = db.query(ClientContract).filter(ClientContract.client_id == client_id).order_by(ClientContract.id.desc()).all()
    contracts_data = []
    for ctr in contracts:
        c_res = ClientContractResponse.model_validate(ctr)
        c_res.client_name = client.name
        contracts_data.append(c_res)

    # Associated Sites
    sites = db.query(Site).filter(Site.client_name == client.name).all()
    sites_data = []
    deployed_guards_total = 0
    for s in sites:
        g_count = db.query(Guard).filter(Guard.primary_site_id == s.id, Guard.status == "ACTIVE").count()
        deployed_guards_total += g_count
        sites_data.append({
            "id": s.id,
            "site_name": s.site_name,
            "location": s.location,
            "basic_salary": s.basic_salary,
            "daily_rate": s.daily_rate,
            "supervisor_name": s.supervisor.full_name if s.supervisor else None,
            "active_guards": g_count
        })

    # Invoices history
    invoices = db.query(SiteInvoice).filter(SiteInvoice.client_name == client.name).order_by(SiteInvoice.id.desc()).all()
    invoices_data = [{
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "site_name": inv.site_name,
        "billing_period": inv.billing_period,
        "issue_date": str(inv.issue_date),
        "due_date": str(inv.due_date),
        "total_amount": inv.total_amount,
        "status": inv.status
    } for inv in invoices]

    total_billed = sum(inv.total_amount for inv in invoices)
    total_paid = sum(inv.total_amount for inv in invoices if inv.status == "PAID")
    outstanding = sum(inv.total_amount for inv in invoices if inv.status not in ["PAID", "CANCELLED"])

    return {
        "client": ClientResponse.model_validate(client),
        "contracts": contracts_data,
        "sites": sites_data,
        "deployed_guards_count": deployed_guards_total,
        "invoices": invoices_data,
        "financial_summary": {
            "total_billed": round(total_billed, 2),
            "total_paid": round(total_paid, 2),
            "outstanding": round(outstanding, 2)
        }
    }


@router.put("/{client_id}", response_model=ClientResponse)
def update_client(client_id: int, payload: ClientUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)

    c.updated_at = datetime.datetime.now()
    db.commit()
    db.refresh(c)
    return ClientResponse.model_validate(c)


@router.delete("/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    name = c.name
    db.delete(c)
    db.commit()
    return {"message": f"Client {name} deleted successfully"}


# ==================== CONTRACTS ====================
@router.get("/contracts", response_model=List[ClientContractResponse])
@router.get("/contracts/list", response_model=List[ClientContractResponse])
def list_contracts(
    client_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    query = db.query(ClientContract)
    if client_id:
        query = query.filter(ClientContract.client_id == client_id)
    if status_filter and status_filter.strip() and status_filter.upper() != "ALL":
        query = query.filter(ClientContract.status == status_filter.strip().upper())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (ClientContract.contract_ref.ilike(term)) |
            (ClientContract.title.ilike(term)) |
            (ClientContract.description.ilike(term))
        )

    ctrs = query.order_by(ClientContract.id.desc()).all()
    out = []
    for c in ctrs:
        res = ClientContractResponse.model_validate(c)
        res.client_name = c.client.name if c.client else None
        res.contract_manager_name = c.contract_manager.full_name if c.contract_manager else None
        
        # Enrich deployments with active guards count
        enriched_deps = []
        for d in c.deployments:
            d_res = ContractDeploymentResponse.model_validate(d)
            d_res.site_name = d.site.site_name if d.site else None
            d_res.location = d.site.location if d.site else None
            d_res.supervisor_name = d.supervisor.full_name if d.supervisor else None
            d_res.active_guards_assigned = db.query(Guard).filter(Guard.primary_site_id == d.site_id, Guard.status == "ACTIVE").count()
            enriched_deps.append(d_res)
        res.deployments = enriched_deps
        out.append(res)
    return out


@router.post("/contracts", response_model=ClientContractResponse, status_code=status.HTTP_201_CREATED)
@router.post("/contracts/", response_model=ClientContractResponse, status_code=status.HTTP_201_CREATED)
def create_client_contract(payload: ClientContractCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    client = db.query(Client).filter(Client.id == payload.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    ref = payload.contract_ref or generate_next_contract_ref(db)
    existing = db.query(ClientContract).filter(ClientContract.contract_ref == ref).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Contract reference '{ref}' already exists")

    ctr = ClientContract(
        contract_ref=ref,
        client_id=payload.client_id,
        title=payload.title.strip(),
        description=payload.description,
        contract_type=payload.contract_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        contract_value=float(payload.contract_value),
        monthly_charge=float(payload.monthly_charge),
        billing_frequency=payload.billing_frequency,
        payment_terms=payload.payment_terms,
        guards_required=payload.guards_required,
        supervisors_required=payload.supervisors_required,
        status=payload.status.upper(),
        special_terms=payload.special_terms,
        document_url=payload.document_url,
        contract_manager_user_id=current_user.id
    )
    db.add(ctr)
    db.commit()
    db.refresh(ctr)

    try:
        db.add(AuditLog(
            user_id=current_user.id,
            action="CREATE_CONTRACT",
            details=f"Created contract {ctr.contract_ref} for {client.name} (Value: KES {ctr.contract_value:,.2f})"
        ))
        db.commit()
    except Exception:
        pass

    res = ClientContractResponse.model_validate(ctr)
    res.client_name = client.name
    return res


@router.post("/contracts/{contract_id}/renew", response_model=ClientContractResponse)
def renew_client_contract(contract_id: int, payload: ContractRenewalRequest, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    """
    Renew a contract while preserving previous version history.
    Marks old contract as RENEWED and creates version + 1.
    """
    old_ctr = db.query(ClientContract).filter(ClientContract.id == contract_id).first()
    if not old_ctr:
        raise HTTPException(status_code=404, detail="Contract not found")

    # Mark old contract as RENEWED
    old_ctr.status = "RENEWED"
    old_ctr.updated_at = datetime.datetime.now()

    new_ref = generate_next_contract_ref(db)
    new_ctr = ClientContract(
        contract_ref=new_ref,
        client_id=old_ctr.client_id,
        title=f"{old_ctr.title} (Renewed v{old_ctr.version + 1})",
        description=f"Renewal of previous contract {old_ctr.contract_ref}",
        contract_type=old_ctr.contract_type,
        start_date=payload.new_start_date,
        end_date=payload.new_end_date,
        contract_value=float(payload.new_contract_value),
        monthly_charge=float(payload.new_monthly_charge),
        billing_frequency=old_ctr.billing_frequency,
        payment_terms=payload.payment_terms,
        guards_required=payload.guards_required,
        supervisors_required=payload.supervisors_required,
        status="ACTIVE",
        version=old_ctr.version + 1,
        previous_contract_id=old_ctr.id,
        contract_manager_user_id=current_user.id,
        special_terms=payload.special_terms or old_ctr.special_terms
    )
    db.add(new_ctr)
    db.commit()
    db.refresh(new_ctr)

    # Carry forward deployments from old contract
    for dep in old_ctr.deployments:
        db.add(ContractDeployment(
            contract_id=new_ctr.id,
            site_id=dep.site_id,
            primary_supervisor_id=dep.primary_supervisor_id,
            guards_target=dep.guards_target,
            commencement_date=payload.new_start_date,
            status="ACTIVE",
            notes=f"Renewed deployment from {old_ctr.contract_ref}"
        ))
    db.commit()
    db.refresh(new_ctr)

    try:
        db.add(AuditLog(
            user_id=current_user.id,
            action="RENEW_CONTRACT",
            details=f"Renewed contract {old_ctr.contract_ref} -> {new_ctr.contract_ref} (New Value: KES {new_ctr.contract_value:,.2f})"
        ))
        db.commit()
    except Exception:
        pass

    res = ClientContractResponse.model_validate(new_ctr)
    res.client_name = new_ctr.client.name if new_ctr.client else None
    return res


@router.post("/contracts/{contract_id}/deployments", response_model=ContractDeploymentResponse)
def add_contract_deployment(contract_id: int, payload: ContractDeploymentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    ctr = db.query(ClientContract).filter(ClientContract.id == contract_id).first()
    if not ctr:
        raise HTTPException(status_code=404, detail="Contract not found")
    st = db.query(Site).filter(Site.id == payload.site_id).first()
    if not st:
        raise HTTPException(status_code=404, detail="Site not found")

    dep = ContractDeployment(
        contract_id=contract_id,
        site_id=payload.site_id,
        primary_supervisor_id=payload.primary_supervisor_id or st.supervisor_id,
        guards_target=payload.guards_target,
        commencement_date=payload.commencement_date,
        status="ACTIVE",
        notes=payload.notes
    )
    db.add(dep)
    db.commit()
    db.refresh(dep)

    res = ContractDeploymentResponse.model_validate(dep)
    res.site_name = st.site_name
    res.location = st.location
    res.supervisor_name = dep.supervisor.full_name if dep.supervisor else None
    res.active_guards_assigned = db.query(Guard).filter(Guard.primary_site_id == st.id, Guard.status == "ACTIVE").count()
    return res


@router.put("/contracts/{contract_id}", response_model=ClientContractResponse)
def update_contract(contract_id: int, payload: ClientContractUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    ctr = db.query(ClientContract).filter(ClientContract.id == contract_id).first()
    if not ctr:
        raise HTTPException(status_code=404, detail="Contract not found")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(ctr, k, v)

    ctr.updated_at = datetime.datetime.now()
    db.commit()
    db.refresh(ctr)

    res = ClientContractResponse.model_validate(ctr)
    res.client_name = ctr.client.name if ctr.client else None
    return res


@router.delete("/contracts/{contract_id}")
def delete_contract(contract_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    ctr = db.query(ClientContract).filter(ClientContract.id == contract_id).first()
    if not ctr:
        raise HTTPException(status_code=404, detail="Contract not found")
    ref = ctr.contract_ref
    db.delete(ctr)
    db.commit()
    return {"message": f"Contract {ref} deleted successfully"}

