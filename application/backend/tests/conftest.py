import os
import sys
from typing import Generator
import pytest

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
application_dir = os.path.dirname(backend_dir)
workspace_root = os.path.dirname(application_dir)

for path in [workspace_root, application_dir, backend_dir]:
    if path not in sys.path:
        sys.path.insert(0, path)

TEST_DB_FILE = os.path.join(backend_dir, "test_corpsec_payroll.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"
os.environ["SKIP_SEED"] = "1"
os.environ["ADMIN_INITIAL_PASSWORD"] = os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")
ADMIN_TEST_PASSWORD = os.environ["ADMIN_INITIAL_PASSWORD"]

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from application.backend.app.core.database import Base, get_db, engine
from application.backend.app.services.seed_service import seed_initial_data
from application.backend.app.main import app

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db() -> Generator:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    seed_initial_data(session)
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def client(db) -> Generator:
    from application.backend.app.core.limiter import limiter
    limiter.enabled = False
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
