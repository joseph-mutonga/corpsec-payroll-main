from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from application.backend.app.core.config import settings

# Configure SQLite vs PostgreSQL connect args
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def sync_db_schema():
    """Ensure all required columns exist in SQLite database."""
    import sqlite3
    import os

    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    if not os.path.exists(db_path) or db_path.startswith(":memory:"):
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 1. Guards table columns check
        cursor.execute("PRAGMA table_info(guards);")
        guard_cols = [c[1] for c in cursor.fetchall()]
        if guard_cols and "primary_site_id" not in guard_cols:
            cursor.execute("ALTER TABLE guards ADD COLUMN primary_site_id INTEGER;")
            if "site_id" in guard_cols:
                cursor.execute("UPDATE guards SET primary_site_id = site_id WHERE primary_site_id IS NULL;")

        # 2. Shifts table columns check
        cursor.execute("PRAGMA table_info(shifts);")
        shift_cols = [c[1] for c in cursor.fetchall()]
        if shift_cols and "is_night_shift" not in shift_cols:
            cursor.execute("ALTER TABLE shifts ADD COLUMN is_night_shift BOOLEAN DEFAULT 0;")

        # 3. Attendance table columns check
        cursor.execute("PRAGMA table_info(attendance);")
        att_cols = [c[1] for c in cursor.fetchall()]
        if att_cols and "notes" not in att_cols:
            cursor.execute("ALTER TABLE attendance ADD COLUMN notes TEXT;")

        # 4. Sites table columns check
        cursor.execute("PRAGMA table_info(sites);")
        site_cols = [c[1] for c in cursor.fetchall()]
        if site_cols:
            if "status" not in site_cols:
                cursor.execute("ALTER TABLE sites ADD COLUMN status VARCHAR DEFAULT 'ACTIVE';")
            if "region_id" not in site_cols:
                cursor.execute("ALTER TABLE sites ADD COLUMN region_id INTEGER;")
            if "basic_salary" not in site_cols:
                cursor.execute("ALTER TABLE sites ADD COLUMN basic_salary FLOAT DEFAULT 15000.0;")

        # Guards additional columns check
        if guard_cols:
            if "basic_salary" not in guard_cols:
                cursor.execute("ALTER TABLE guards ADD COLUMN basic_salary FLOAT;")
            if "is_reliever" not in guard_cols:
                cursor.execute("ALTER TABLE guards ADD COLUMN is_reliever BOOLEAN DEFAULT 0;")

            # If existing SQLite database has NOT NULL on basic_salary, migrate table schema
            cursor.execute("PRAGMA table_info(guards);")
            info = cursor.fetchall()
            basic_sal_col = next((c for c in info if c[1] == "basic_salary"), None)
            if basic_sal_col and basic_sal_col[3] == 1:
                cursor.execute("PRAGMA foreign_keys=OFF;")
                cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='guards';")
                sql_row = cursor.fetchone()
                if sql_row and "basic_salary FLOAT NOT NULL" in sql_row[0]:
                    new_sql = sql_row[0].replace("basic_salary FLOAT NOT NULL", "basic_salary FLOAT")
                    cursor.execute("CREATE TABLE guards_migration_backup AS SELECT * FROM guards;")
                    cursor.execute("DROP TABLE guards;")
                    cursor.execute(new_sql)
                    cursor.execute("INSERT INTO guards SELECT * FROM guards_migration_backup;")
                    cursor.execute("DROP TABLE guards_migration_backup;")
                cursor.execute("PRAGMA foreign_keys=ON;")

        # 5. Payroll Errors table columns check
        cursor.execute("PRAGMA table_info(payroll_errors);")
        err_cols = [c[1] for c in cursor.fetchall()]
        if err_cols:
            if "error_code" not in err_cols:
                cursor.execute("ALTER TABLE payroll_errors ADD COLUMN error_code VARCHAR;")
            if "error_message" not in err_cols:
                cursor.execute("ALTER TABLE payroll_errors ADD COLUMN error_message TEXT;")
            if "resolution_notes" not in err_cols:
                cursor.execute("ALTER TABLE payroll_errors ADD COLUMN resolution_notes TEXT;")

        # 6. Payroll Records table columns check
        cursor.execute("PRAGMA table_info(payroll_records);")
        rec_cols = [c[1] for c in cursor.fetchall()]
        if rec_cols:
            if "employer_nssf_deduction" not in rec_cols:
                cursor.execute("ALTER TABLE payroll_records ADD COLUMN employer_nssf_deduction FLOAT DEFAULT 0.0;")
            if "employer_housing_levy_deduction" not in rec_cols:
                cursor.execute("ALTER TABLE payroll_records ADD COLUMN employer_housing_levy_deduction FLOAT DEFAULT 0.0;")
            if "paye_breakdown_json" not in rec_cols:
                cursor.execute("ALTER TABLE payroll_records ADD COLUMN paye_breakdown_json TEXT;")
            if "off_day_deduction" not in rec_cols:
                cursor.execute("ALTER TABLE payroll_records ADD COLUMN off_day_deduction FLOAT DEFAULT 0.0;")
            if "reliever_earnings" not in rec_cols:
                cursor.execute("ALTER TABLE payroll_records ADD COLUMN reliever_earnings FLOAT DEFAULT 0.0;")

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Database schema sync notice: {e}")

