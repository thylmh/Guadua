import os
import yaml
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings

# Define root directory (parent of backend/)
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent

# Load from env.yaml into os.environ BEFORE class definition
_env_file = ROOT_DIR / "env.yaml"
if _env_file.exists():
    with open(_env_file) as f:
        try:
            y = yaml.safe_load(f)
            if y:
                for k, v in y.items():
                    if v is not None: os.environ[k] = str(v)
        except Exception:
            pass

class Settings(BaseSettings):
    PROJECT_NAME: str = "bosque-api"
    API_V1_STR: str = "/api/v1"
    
    ALLOWED_DOMAIN: str = "humboldt.org.co"
    CORS_ORIGINS_RAW: str = ""
    AUDIENCE: str = ""
    DB_USER: str = "bosquebd"
    DB_NAME: str = "bosquebd"
    DB_PASS: str = ""
    CLOUDSQL_CONNECTION_NAME: str = ""

    @property
    def cors_origins(self) -> List[str]:
        raw = self.CORS_ORIGINS_RAW.strip()
        if not raw or raw == "*":
            return ["*"]
        origins = [o.strip() for o in raw.split(",") if o.strip()]
        if "https://storage.googleapis.com" not in origins:
            origins.append("https://storage.googleapis.com")
        return origins

    @property
    def allow_credentials(self) -> bool:
        raw = self.CORS_ORIGINS_RAW.strip()
        return raw != "*" and raw != ""

    class Config:
        case_sensitive = True
        # Pydantic will automatically pick up env vars that match field names

settings = Settings()
# Normalize after loading
settings.ALLOWED_DOMAIN = settings.ALLOWED_DOMAIN.lower().strip()
