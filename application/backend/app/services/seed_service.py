import datetime
from sqlalchemy import or_
from sqlalchemy.orm import Session
from application.backend.app.core.security import get_password_hash
from application.backend.app.models import (
    User, UserRole, UserStatus,
    Site, Shift, Guard, Setting
)
from application.backend.app.models.statutory import (
    StatutoryNssfTier, StatutoryShif, StatutoryHousingLevy, StatutoryPayeBand, StatutoryPayeRelief
)

def seed_statutory_rates(db: Session):
    """Seed initial statutory rate records with effective date 2026-01-01 if not already present."""
    base_date = datetime.date(2026, 1, 1)

    # 1. NSSF Tiers
    if db.query(StatutoryNssfTier).count() == 0:
        nssf_tiers = [
            StatutoryNssfTier(
                tier_number=1,
                tier_name="Tier I",
                rate=6.0,
                lower_limit=0.0,
                upper_limit=9000.0,
                effective_from=base_date,
                is_active=True,
                change_reason="Initial Statutory Setup",
                created_by="system"
            ),
            StatutoryNssfTier(
                tier_number=2,
                tier_name="Tier II",
                rate=6.0,
                lower_limit=9000.0,
                upper_limit=108000.0,
                effective_from=base_date,
                is_active=True,
                change_reason="Initial Statutory Setup",
                created_by="system"
            ),
        ]
        db.add_all(nssf_tiers)
    else:
        # Sync existing active seed tiers if they match old 2023 limits (8,000 / 36,000)
        t1 = db.query(StatutoryNssfTier).filter(StatutoryNssfTier.tier_number == 1, StatutoryNssfTier.is_active.is_(True)).first()
        if t1 and t1.upper_limit == 8000.0:
            t1.upper_limit = 9000.0
        t2 = db.query(StatutoryNssfTier).filter(StatutoryNssfTier.tier_number == 2, StatutoryNssfTier.is_active.is_(True)).first()
        if t2 and (t2.lower_limit == 8000.0 or t2.upper_limit == 36000.0):
            t2.lower_limit = 9000.0
            t2.upper_limit = 108000.0

    # 2. SHIF
    if db.query(StatutoryShif).count() == 0:
        shif = StatutoryShif(
            employee_rate=2.75,
            minimum_floor=300.0,
            effective_from=base_date,
            is_active=True,
            change_reason="Initial Statutory Setup",
            created_by="system"
        )
        db.add(shif)
    else:
        # Sync existing active SHIF record if it has outdated rates
        active_shif = db.query(StatutoryShif).filter(StatutoryShif.is_active.is_(True)).first()
        if active_shif and (active_shif.employee_rate == 3.0 or active_shif.minimum_floor == 350.0):
            active_shif.employee_rate = 2.75
            active_shif.minimum_floor = 300.0

    # 3. Housing Levy
    if db.query(StatutoryHousingLevy).count() == 0:
        housing = StatutoryHousingLevy(
            employee_rate=1.5,
            employer_rate=1.5,
            effective_from=base_date,
            is_active=True,
            change_reason="Initial Statutory Setup",
            created_by="system"
        )
        db.add(housing)

    # 4. PAYE Bands
    if db.query(StatutoryPayeBand).count() == 0:
        paye_bands = [
            StatutoryPayeBand(band_order=1, lower_limit=0.0, upper_limit=24000.0, rate=10.0, effective_from=base_date, is_active=True, change_reason="Initial Statutory Setup", created_by="system"),
            StatutoryPayeBand(band_order=2, lower_limit=24000.0, upper_limit=32333.0, rate=25.0, effective_from=base_date, is_active=True, change_reason="Initial Statutory Setup", created_by="system"),
            StatutoryPayeBand(band_order=3, lower_limit=32333.0, upper_limit=500000.0, rate=30.0, effective_from=base_date, is_active=True, change_reason="Initial Statutory Setup", created_by="system"),
            StatutoryPayeBand(band_order=4, lower_limit=500000.0, upper_limit=800000.0, rate=32.5, effective_from=base_date, is_active=True, change_reason="Initial Statutory Setup", created_by="system"),
            StatutoryPayeBand(band_order=5, lower_limit=800000.0, upper_limit=None, rate=35.0, effective_from=base_date, is_active=True, change_reason="Initial Statutory Setup", created_by="system"),
        ]
        db.add_all(paye_bands)

    # 5. PAYE Relief
    if db.query(StatutoryPayeRelief).count() == 0:
        relief = StatutoryPayeRelief(
            monthly_relief=2400.0,
            effective_from=base_date,
            is_active=True,
            change_reason="Initial Statutory Setup",
            created_by="system"
        )
        db.add(relief)

    db.commit()


def seed_initial_data(db: Session):
    """Seed initial company, site, shift, guard, and user data matching official documents."""
    
    from application.backend.app.core.config import settings
    admin = db.query(User).filter(User.email == "admin@corpsec.co.ke").first()
    if not admin:
        admin = User(
            email="admin@corpsec.co.ke",
            phone="0700000000",
            password_hash=get_password_hash(settings.ADMIN_INITIAL_PASSWORD),
            role=UserRole.ADMIN.value,
            status=UserStatus.ACTIVE.value,
        )
        db.add(admin)
        db.commit()
    else:
        # Guarantee admin password matches active config setting
        admin.password_hash = get_password_hash(settings.ADMIN_INITIAL_PASSWORD)
        db.commit()

    # 2. Sites (matching Screen 06/07)
    site_data = [
        {"site_name": "Westlands Mall", "location": "Nairobi", "client_name": "Westlands Mall", "daily_rate": 1300.0, "night_allowance": 200.0, "transport_allowance": 100.0, "housing_allowance": 200.0},
        {"site_name": "Nairobi Hospital", "location": "Nairobi", "client_name": "Nairobi Hospital", "daily_rate": 1350.0, "night_allowance": 200.0, "transport_allowance": 100.0, "housing_allowance": 200.0},
        {"site_name": "Mombasa Port", "location": "Mombasa", "client_name": "Kenya Ports", "daily_rate": 1300.0, "night_allowance": 200.0, "transport_allowance": 100.0, "housing_allowance": 200.0},
        {"site_name": "Industrial Area", "location": "Nairobi", "client_name": "Various Industries", "daily_rate": 1250.0, "night_allowance": 200.0, "transport_allowance": 100.0, "housing_allowance": 200.0},
        {"site_name": "KICC", "location": "Nairobi", "client_name": "KICC", "daily_rate": 1400.0, "night_allowance": 200.0, "transport_allowance": 100.0, "housing_allowance": 200.0},
    ]

    sites_dict = {}
    for data in site_data:
        site = db.query(Site).filter(Site.site_name == data["site_name"]).first()
        if not site:
            site = Site(**data)
            db.add(site)
            db.commit()
            db.refresh(site)
        sites_dict[site.site_name] = site

    # 3. Shifts
    shift_data = [
        {"name": "Day Shift", "shift_type": "DAY", "start_time": "06:00", "end_time": "18:00", "is_night_shift": False},
        {"name": "Night Shift", "shift_type": "NIGHT", "start_time": "18:00", "end_time": "06:00", "is_night_shift": True},
        {"name": "Split Shift", "shift_type": "SPLIT", "start_time": "08:00", "end_time": "20:00", "is_night_shift": False},
    ]

    shifts_dict = {}
    for data in shift_data:
        shift = db.query(Shift).filter(Shift.name == data["name"]).first()
        if not shift:
            shift = Shift(**data)
            db.add(shift)
            db.commit()
            db.refresh(shift)
        shifts_dict[shift.name] = shift

    # 4. Guards & Guard User Accounts (matching Screen 03/04/05/25)
    guard_data = [
        {
            "employee_number": "CS-00452",
            "full_name": "John Mwangi",
            "national_id": "12345678",
            "phone": "0713345678",
            "email": "john.mwangi@corpsec.co.ke",
            "hire_date": datetime.date(2023, 3, 15),
            "basic_salary": 15000.0,
            "site_name": "Nairobi Hospital",
            "shift_name": "Night Shift",
            "payment_method": "Bank Transfer",
            "bank_name": "KCB Bank",
            "bank_account": "123456780012",
            "mpesa_number": "0713345678",
            "nssf_number": "NSSF-998877",
            "shif_number": "SHIF-112233",
            "kra_pin": "A009876543Z",
            "status": "ACTIVE"
        },
        {
            "employee_number": "CS-00431",
            "full_name": "Peter Otieno",
            "national_id": "23456789",
            "phone": "0721654321",
            "email": "peter.otieno@corpsec.co.ke",
            "hire_date": datetime.date(2022, 6, 10),
            "basic_salary": 15000.0,
            "site_name": "Westlands Mall",
            "shift_name": "Day Shift",
            "payment_method": "Bank Transfer",
            "bank_name": "Equity Bank",
            "bank_account": "01122334455",
            "mpesa_number": "0721654321",
            "nssf_number": "NSSF-887766",
            "shif_number": "SHIF-223344",
            "kra_pin": "A008765432Y",
            "status": "ACTIVE"
        },
        {
            "employee_number": "CS-00418",
            "full_name": "Mary Akinyi",
            "national_id": "34567890",
            "phone": "0702111222",
            "email": "mary.akinyi@corpsec.co.ke",
            "hire_date": datetime.date(2023, 1, 20),
            "basic_salary": 15000.0,
            "site_name": "Mombasa Port",
            "shift_name": "Night Shift",
            "payment_method": "M-Pesa",
            "bank_name": None,
            "bank_account": None,
            "mpesa_number": "0702111222",
            "nssf_number": "NSSF-776655",
            "shif_number": "SHIF-334455",
            "kra_pin": "A007654321X",
            "status": "ACTIVE"
        },
        {
            "employee_number": "CS-00405",
            "full_name": "James Omosa",
            "national_id": "45678901",
            "phone": "0734987000",
            "email": "james.omosa@corpsec.co.ke",
            "hire_date": datetime.date(2024, 2, 1),
            "basic_salary": 15000.0,
            "site_name": "Industrial Area",
            "shift_name": "Day Shift",
            "payment_method": "Bank Transfer",
            "bank_name": "Co-operative Bank",
            "bank_account": "01199887766",
            "mpesa_number": "0734987000",
            "nssf_number": "NSSF-665544",
            "shif_number": "SHIF-445566",
            "kra_pin": "A006543210W",
            "status": "ACTIVE"
        },
        {
            "employee_number": "CS-00390",
            "full_name": "Joseph Lino",
            "national_id": "56789012",
            "phone": "0709222333",
            "email": "joseph.lino@corpsec.co.ke",
            "hire_date": datetime.date(2021, 11, 12),
            "basic_salary": 15000.0,
            "site_name": "KICC",
            "shift_name": "Night Shift",
            "payment_method": "Bank Transfer",
            "bank_name": "Equity Bank",
            "bank_account": "01155443322",
            "mpesa_number": "0709222333",
            "nssf_number": "NSSF-554433",
            "shif_number": "SHIF-556677",
            "kra_pin": "A005432109V",
            "status": "INACTIVE"
        },
        {
            "employee_number": "CS-00999",
            "full_name": "Samuel Kiptoo",
            "national_id": "99887766",
            "phone": "0799887766",
            "email": "samuel.kiptoo@corpsec.co.ke",
            "hire_date": datetime.date(2024, 5, 10),
            "basic_salary": 16000.0,
            "site_name": None,
            "shift_name": None,
            "payment_method": "Bank Transfer",
            "bank_name": "KCB Bank",
            "bank_account": "998877665544",
            "mpesa_number": "0799887766",
            "nssf_number": "NSSF-99999",
            "shif_number": "SHIF-99999",
            "kra_pin": "A00999888X",
            "status": "ACTIVE"
        },
        {
            "employee_number": "CS-00512",
            "full_name": "Erick Odhiambo",
            "national_id": "44556677",
            "phone": "0711223344",
            "email": "erick.odhiambo@corpsec.co.ke",
            "hire_date": datetime.date(2026, 9, 19),
            "basic_salary": 16000.0,
            "site_name": None,
            "shift_name": None,
            "payment_method": "Bank Transfer",
            "bank_name": "KCB Bank",
            "bank_account": "01177665544",
            "mpesa_number": "0711223344",
            "nssf_number": "NSSF-551122",
            "shif_number": "SHIF-551122",
            "kra_pin": "A005511223Y",
            "status": "ACTIVE"
        },
        {
            "employee_number": "CS-00460",
            "full_name": "angela okech",
            "national_id": "214235435",
            "phone": "0782631254",
            "email": "angela.okech@corpsec.co.ke",
            "hire_date": datetime.date(2026, 9, 19),
            "basic_salary": 15000.0,
            "site_name": None,
            "shift_name": None,
            "payment_method": "Bank Transfer",
            "bank_name": "Equity Bank",
            "bank_account": "01188776655",
            "mpesa_number": "0782631254",
            "nssf_number": "NSSF-446600",
            "shif_number": "SHIF-446600",
            "kra_pin": "A004466001Z",
            "status": "ACTIVE"
        },
    ]

    for gdata in guard_data:
        guard = db.query(Guard).filter(Guard.employee_number == gdata["employee_number"]).first()
        site_name = gdata["site_name"]
        shift_name = gdata["shift_name"]
        site_obj = sites_dict.get(site_name)
        shift_obj = shifts_dict.get(shift_name)
        
        if not guard:
            clean_data = {k: v for k, v in gdata.items() if k not in ("site_name", "shift_name")}
            guard = Guard(
                primary_site_id=site_obj.id if site_obj else None,
                shift_id=shift_obj.id if shift_obj else None,
                **clean_data
            )
            db.add(guard)
            db.commit()
            db.refresh(guard)
        else:
            # Sync guard status with seed specification
            guard.status = gdata["status"]
            if site_obj: guard.primary_site_id = site_obj.id
            if shift_obj: guard.shift_id = shift_obj.id
            db.commit()

        # Create associated user account for Guard login
        user_email = guard.email or f"{guard.employee_number.lower()}@corpsec.co.ke"
        user = db.query(User).filter(
            or_(
                User.guard_id == guard.id,
                User.email == user_email,
                User.phone == gdata["phone"]
            )
        ).first()

        if not user:
            user = User(
                email=user_email,
                phone=gdata["phone"],
                password_hash=get_password_hash("Guard@123456"),
                role=UserRole.GUARD.value,
                status=UserStatus.ACTIVE.value if guard.status == "ACTIVE" else UserStatus.INACTIVE.value,
                guard_id=guard.id
            )
            db.add(user)
            db.commit()
        else:
            user.guard_id = guard.id
            user.status = UserStatus.ACTIVE.value if guard.status == "ACTIVE" else UserStatus.INACTIVE.value
            db.commit()

    # 5. Default Settings
    settings_data = [
        {"key": "currency", "value": "KES", "description": "System Currency"},
        {"key": "date_format", "value": "DD/MM/YYYY", "description": "Display Date Format"},
        {"key": "nssf_rate", "value": "0.06", "description": "NSSF Rate (6%)"},
        {"key": "shif_rate", "value": "0.0275", "description": "SHIF Rate (2.75%)"},
        {"key": "shif_floor", "value": "300.0", "description": "SHIF Minimum Floor KES"},
        {"key": "housing_levy_rate", "value": "0.015", "description": "Housing Levy Rate (1.5%)"},
        {"key": "paye_personal_relief", "value": "2400.0", "description": "Monthly Personal Relief KES"},
    ]

    for sdata in settings_data:
        setting = db.query(Setting).filter(Setting.key == sdata["key"]).first()
        if not setting:
            setting = Setting(**sdata)
            db.add(setting)
            db.commit()

    # 6. Seed Statutory Rate Tables
    seed_statutory_rates(db)
