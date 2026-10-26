from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin
from application.backend.app.models.setting import Setting
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.setting import SettingItem, SettingUpdateRequest

router = APIRouter(prefix="/settings", tags=["System Settings"])


@router.get("", response_model=List[SettingItem])
def get_all_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Admin endpoint to retrieve system settings and statutory parameters (Screen 17)."""
    settings = db.query(Setting).all()

    # Pre-populate defaults if empty
    if not settings:
        defaults = [
            Setting(key="nssf_rate", value="0.06", description="NSSF Employee Deduction Rate (6%)"),
            Setting(key="shif_rate", value="0.0275", description="SHIF Employee Deduction Rate (2.75%)"),
            Setting(key="shif_floor", value="300.0", description="SHIF Statutory Minimum Floor (KES 300)"),
            Setting(key="housing_levy_rate", value="0.015", description="Housing Levy Deduction Rate (1.5%)"),
            Setting(key="personal_relief", value="2400.0", description="Monthly Personal Relief (KES 2,400)"),
            Setting(key="overtime_multiplier_normal", value="1.5", description="Standard Overtime Multiplier"),
            Setting(key="overtime_multiplier_holiday", value="2.0", description="Public Holiday Overtime Multiplier"),
            Setting(key="company_name", value="CorpSec Kenya Ltd", description="Company Official Name"),
            Setting(key="company_kra_pin", value="P051234567Z", description="Company KRA Tax PIN"),
            Setting(key="company_nssf_code", value="NSSF-09876", description="Company NSSF Employer Code"),
            Setting(key="company_shif_code", value="SHIF-54321", description="Company SHIF Employer Code"),
        ]
        db.add_all(defaults)
        db.commit()
        settings = defaults

    return settings


@router.put("", response_model=List[SettingItem])
def update_settings(
    payload: SettingUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Admin endpoint to update statutory rates and company settings with Audit Logging."""
    updated = []
    changes = []

    for key, new_val in payload.settings.items():
        st = db.query(Setting).filter(Setting.key == key).first()
        if st:
            old_val = st.value
            st.value = str(new_val)
            st.updated_by = admin.email
            changes.append(f"{key}: '{old_val}' -> '{new_val}'")
            updated.append(st)
        else:
            st = Setting(key=key, value=str(new_val), updated_by=admin.email)
            db.add(st)
            changes.append(f"{key}: added '{new_val}'")
            updated.append(st)

    if changes:
        audit_entry = AuditLog(
            user_id=admin.id,
            user_name=admin.email,
            role=admin.role,
            action="UPDATE_SYSTEM_SETTINGS",
            target_entity="Setting",
            target_id="GLOBAL",
            new_values="; ".join(changes),
            reason="Admin updated statutory parameters / system settings"
        )
        db.add(audit_entry)

    db.commit()
    return updated
