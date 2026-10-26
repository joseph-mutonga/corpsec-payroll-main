import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


_current_dir = os.path.dirname(os.path.abspath(__file__))
_root_env = os.path.abspath(os.path.join(_current_dir, "../../../../.env"))
_backend_env = os.path.abspath(os.path.join(_current_dir, "../../.env"))


class Settings(BaseSettings):
    PROJECT_NAME: str = "CorpSec Payroll System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "CORPSEC_DEV_SECRET_KEY_SUPER_SECURE_REPLACE_IN_PROD_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ADMIN_INITIAL_PASSWORD: str = ""
    
    # Database
    DATABASE_URL: str = "mysql+pymysql://root:38556016ab@localhost:3306/corpsec_payroll?charset=utf8mb4"
    
    # CORS
    BACKEND_CORS_ORIGINS: list[str] = ["*"]
    
    # Statutory Defaults (Kenya)
    DEFAULT_NSSF_RATE: float = 0.06
    DEFAULT_SHIF_RATE: float = 0.0275
    DEFAULT_SHIF_FLOOR: float = 300.0
    DEFAULT_HOUSING_LEVY_RATE: float = 0.015
    DEFAULT_PERSONAL_RELIEF: float = 2400.0
    
    model_config = SettingsConfigDict(
        env_file=(_root_env, _backend_env, ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()

if not settings.ADMIN_INITIAL_PASSWORD:
    raise RuntimeError(
        "CRITICAL SECURITY CONFIGURATION ERROR: ADMIN_INITIAL_PASSWORD environment variable is not set. "
        "Application startup halted to prevent default credential risks."
    )
